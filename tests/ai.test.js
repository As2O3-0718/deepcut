import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir}from 'node:fs/promises';
import{AIError,validateQuestions,validateVerdict,completeJSON}from '../lib/ai.js';
import{GameAI}from '../lib/game-ai.js';import{bank,pickRound}from '../dist/bank.js';
const fixture={title:'说出一个例子。',category:'测试',hint:'测试限定',answers:Array.from({length:8},(_,i)=>({name:'例'+i,aliases:[],score:10+i}))};
async function engine(complete,dailyLimit=80){await mkdir('.local',{recursive:true});const dir=await mkdtemp('.local/test-');return new GameAI({key:'test-only',complete,dailyLimit,store:dir+'/cache.json'})}
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
test('a valid answer is cached across restarts and daily budgets remain enforced',async()=>{
 let calls=0;const ai=await engine(async()=>{calls++;return valid},1);
 await ai.judge('base-0','some alias');await ai.judge('base-0','some alias');assert.equal(calls,1);
 const other=new GameAI({key:'test',complete:async()=>{throw Error('must not call')},store:ai.store,dailyLimit:1});await other.load();
 assert.equal((await other.judge('base-0','some alias')).score,80);await assert.rejects(other.judge('base-0','another answer'),e=>e.status===429);
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
