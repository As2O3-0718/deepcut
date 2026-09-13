import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir}from 'node:fs/promises';
import{AIError,validateQuestions,validateVerdict,completeJSON}from '../lib/ai.js';
import{GameAI}from '../lib/game-ai.js';import{bank,pickRound}from '../dist/bank.js';
const fixture={title:'说出一个例子。',category:'测试',hint:'测试限定',answers:Array.from({length:8},(_,i)=>({name:'例'+i,aliases:[],score:10+i}))};
async function engine(complete,options={}){await mkdir('.local',{recursive:true});const dir=await mkdtemp('.local/test-');return new GameAI({key:'test-only',complete,...options,store:dir+'/cache.json'})}
const valid={verdict:'valid',eligibility:{isReal:true,isSingle:true,meetsAllConditions:true},name:'新名称',score:80,reason:'符合条件。'};
function errorStatus(status){return{ok:false,status}}

test('model response validation rejects malformed output, markup, duplicate aliases and invalid scores',()=>{
 assert.equal(validateQuestions([fixture]).length,1);
 assert.throws(()=>validateQuestions([{...fixture,title:'<script>'}]));
 assert.throws(()=>validateQuestions([{...fixture,answers:fixture.answers.map(a=>({...a,aliases:['duplicate']}))}]));
 assert.throws(()=>validateVerdict({...valid,score:101}));assert.throws(()=>validateVerdict({...valid,name:'<img src=x>'}));
 assert.equal(validateVerdict({verdict:'uncertain',reason:'证据不足。'}).verdict,'uncertain');
});
test('unseen questions are exhausted before repeats and old items are repeated first',()=>{
 const source=Array.from({length:21},(_,i)=>({id:String(i)}));let seen=[];
 for(let i=0;i<3;i++){const round=pickRound(source,seen);assert.ok(round.every(q=>!seen.includes(q.id)));seen.push(...round.map(q=>q.id))}
 assert.deepEqual(pickRound(source,seen).map(q=>q.id),seen.slice(0,7));
});
test('known answers bypass AI; missing IDs and oversized input never call AI',async()=>{
 let calls=0;const ai=await engine(async()=>{calls++;return valid});
 assert.equal((await ai.judge('base-0','Brazil')).name,'巴西');assert.equal(calls,0);
 await assert.rejects(ai.judge('missing','test'));await assert.rejects(ai.judge('base-0','x'.repeat(121)));assert.equal(calls,0);
});
test('frequency limit survives restart, permits boundary and cached answers, with no daily cap',async()=>{
 let now=10000,calls=0;const ai=await engine(async()=>{calls++;return valid},{now:()=>now});
 ai.calls=800;ai.day=new Date().toISOString().slice(0,10);
 await ai.judge('base-0','some alias');assert.equal(ai.calls,801);
 await ai.judge('base-0','some alias');assert.equal(calls,1);
 const other=new GameAI({key:'test',complete:async()=>{calls++;return valid},store:ai.store,now:()=>now});await other.load();
 assert.equal((await other.judge('base-0','some alias')).score,80);
 await assert.rejects(other.judge('base-0','another answer'),e=>e.status===429&&e.message.includes('2 秒'));
 now+=1999;await assert.rejects(other.judge('base-0','another answer'),e=>e.status===429);
 now++;await other.judge('base-0','another answer');assert.equal(calls,2);
});
test('failed upstream requests consume interval and release in-flight lock',async()=>{
 let now=10000;const ai=await engine(async()=>{throw Error('upstream failure')},{now:()=>now});
 await assert.rejects(ai.call('',{},1));assert.equal(ai.busy,false);
 await assert.rejects(ai.call('',{},1),e=>e.status===429);
 now+=2000;await assert.rejects(ai.call('',{},1),/upstream failure/);
});

test('unknown alias resolving to a known answer retains its preset score',async()=>{
 const ai=await engine(async()=>({...valid,name:'巴西',score:99}));assert.equal((await ai.judge('base-0','巴西联邦共和国')).score,10);
});
test('concurrent calls are rejected while a request is in flight',async()=>{
 let done;const ai=await engine(()=>new Promise(r=>done=r));const pending=ai.judge('base-0','new');
 await new Promise(r=>setTimeout(r,30));await assert.rejects(ai.judge('base-0','other'),e=>e.status===429);done(valid);await pending;
});
test('uncertain results do not become authoritative cached answers',async()=>{
 const ai=await engine(async()=>({verdict:'uncertain',reason:'无法核实。'}));await ai.judge('base-0','unknown');assert.equal(ai.cache.size,0);
});
test('network and API errors do not expose upstream bodies or keys',async()=>{
 for(const status of[401,402,429,500])await assert.rejects(completeJSON({key:'private-key',system:'json',user:{},fetcher:async()=>errorStatus(status)}),e=>e instanceof AIError&&!e.message.includes('private-key'));
 await assert.rejects(completeJSON({key:'private-key',fetcher:async()=>{throw Error('private-key')}}),e=>!e.message.includes('private-key'));
});
test('question IDs are unique',()=>assert.equal(new Set(bank.map(q=>q.id)).size,bank.length));
test('review independently checks preset answers and validates requests and output',async()=>{
 let calls=0;const ai=await engine(async()=>{calls++;return {conclusion:'建议修订',explanation:'相对满分不代表绝对冷门。'}},{minIntervalMs:0});
 const request={questionId:'base-0',answer:'巴西',score:100,concern:'冷门度不合理'};
 assert.equal((await ai.review(request)).conclusion,'建议修订');assert.equal(calls,1);assert.equal(ai.cache.size,0);
 await assert.rejects(ai.review({...request,concern:'bad'}),e=>e.status===400);assert.equal(calls,1);
 await assert.rejects(ai.review({...request,questionId:'missing'}),e=>e.status===404);
 ai.complete=async()=>({conclusion:'肯定正确',explanation:'bad'});await assert.rejects(ai.review(request));
});
test('upstream redirects are rejected without forwarding the API key',async()=>{
 let calls=0;await assert.rejects(completeJSON({key:'test',system:'json',user:{},fetcher:async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return {ok:false,status:302}}}));assert.equal(calls,1);
});
test('AI round retains novel candidates and generates missing slots in a bounded second call',async()=>{
 let calls=0;const ai=await engine(async()=>{calls++;return {questions:calls===1?[bank[0],fixture]:Array.from({length:6},(_,i)=>({...fixture,title:'新的集合'+i,category:'类别'+i}))}},{minIntervalMs:0});
 const round=await ai.round([bank[1].title]);assert.equal(round.length,7);assert.equal(calls,2);assert.equal(new Set(round.map(q=>q.title)).size,7);assert.ok(round.every(q=>!q.roundFallback));assert.equal(ai.dynamic.size,7);
});
test('repeated AI output never silently substitutes a bank round',async()=>{
 let calls=0;const ai=await engine(async()=>{calls++;return {questions:[bank[0]]}},{minIntervalMs:0});await assert.rejects(ai.round(),/没有替换成题库题/);assert.equal(calls,2);assert.equal(ai.dynamic.size,0);
});
test('question title history prevents repeats even when IDs or popularity wording changed',()=>{
 const source=[{id:'new',title:'说出一种交通标志。'},{id:'fresh',title:'说出一种乐器。'}];
 assert.equal(pickRound(source,[],['说出一种常见的交通标志。'])[0].id,'fresh');
});
import {mergeHistory,avoidRecentSwaps} from '../dist/bank.js';
test('merged tab histories preserve questions seen in both tabs',()=>{assert.deepEqual(mergeHistory(['a','b'],['a','c']),['a','b','c'])});
test('swapped questions are excluded next round even after title wording changes',()=>{
 const source=[{id:'swap',title:'说出一种交通标志。'},...Array.from({length:8},(_,i)=>({id:'q'+i,title:'题'+i}))];const pool=avoidRecentSwaps(source,['说出一种常见的交通标志。']);assert.equal(pickRound(pool).length,7);assert.ok(!pool.some(q=>q.id==='swap'));
});
test('title-only recent history is not treated as the oldest repeat',()=>{
 const source=[{id:'new-id',title:'最近题'},{id:'old-id',title:'旧题'}];assert.equal(pickRound(source,[],['旧题','最近题'])[0].title,'旧题');
});
test('other players dynamic questions do not exhaust a player new round pool',async()=>{
 const candidates=Array.from({length:7},(_,i)=>({...fixture,title:'独立主题'+i,category:'类别'+i}));
 const ai=await engine(async()=>({questions:candidates}),{minIntervalMs:0});
 for(const [i,q]of candidates.entries())ai.dynamic.set('other-'+i,{...q,id:'other-'+i});
 const round=await ai.round([]);assert.equal(round.length,7);
});
test('player history remains excluded even when shared questions are eligible',async()=>{
 const candidates=Array.from({length:8},(_,i)=>({...fixture,title:'玩家主题'+i,category:'类别'+i}));const ai=await engine(async()=>({questions:candidates}),{minIntervalMs:0});
 const round=await ai.round(['玩家主题0']);assert.equal(round.length,7);assert.ok(round.every(q=>q.title!=='玩家主题0'));
});

test('single-category generations are rejected rather than published as a round',async()=>{
 const ai=await engine(async()=>({questions:Array.from({length:10},(_,i)=>({...fixture,title:'影片技法'+i,category:'电影制作与动画技法'}))}),{minIntervalMs:0});await assert.rejects(ai.round(),/至少五类/);assert.equal(ai.dynamic.size,0);
});
