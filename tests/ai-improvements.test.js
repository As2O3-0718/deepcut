import test from 'node:test';import assert from 'node:assert/strict';import {GameAI} from '../lib/game-ai.js';import {chooseRoundFocus,categoryGroup} from '../lib/round-diversity.js';
const valid={verdict:'valid',eligibility:{isReal:true,isSingle:true,meetsAllConditions:true},name:'测试名称',score:80,reason:'符合题目范围。'};
function engine(complete,now=()=>10000){let data;return new GameAI({key:'test',complete,now,minIntervalMs:0,persistence:{read:async()=>data,write:async value=>{data=structuredClone(value)}}})}
test('planned generation focus always has five distinct broad categories',()=>{for(let i=0;i<50;i++){const focus=chooseRoundFocus([{category:'电影'}]);assert.equal(focus.length,5);assert.equal(new Set(focus.map(category=>categoryGroup({category}))).size,5);assert.ok(!focus.some(category=>categoryGroup({category})==='影视'))}});
test('negative cache expires and recheck bypasses it immediately',async()=>{
 let calls=0,now=10000;const ai=engine(async()=>{calls++;return {verdict:'invalid',reason:'不属于题目范围。'}},()=>now);
 await ai.judge('base-0','unknown');assert.equal((await ai.judge('base-0','unknown')).cached,true);assert.equal(calls,1);
 now+=600001;await ai.judge('base-0','unknown');assert.equal(calls,2);
 ai.complete=async()=>{calls++;return valid};assert.equal((await ai.judge('base-0','unknown',{recheck:true})).verdict,'valid');assert.equal(calls,3);
 await assert.rejects(ai.judge('base-0','unknown',{recheck:'yes'}),e=>e.status===400);
});
test('an uncertain recheck removes old canonical aliases and persists invalidation',async()=>{
 const ai=engine(async()=>valid);await ai.judge('base-0','alias');assert.equal(ai.cache.size,2);ai.complete=async()=>({verdict:'uncertain',reason:'无法核实。'});
 assert.equal((await ai.judge('base-0','alias',{recheck:true})).verdict,'uncertain');assert.equal(ai.cache.size,0);await ai.load();assert.equal(ai.cache.size,0);
});
test('a review suggesting revision clears relevant aliases without erasing unrelated judgments',async()=>{
 const ai=engine(async()=>valid);await ai.judge('base-0','alias');ai.cache.set('base-1:other',{...valid,name:'other'});
 ai.complete=async()=>({conclusion:'建议修订',explanation:'该判定需重新核实。'});
 const result=await ai.review({questionId:'base-0',answer:'alias',score:80,concern:'事实错误'});assert.equal(result.cacheCleared,2);assert.equal(ai.cache.size,1);assert.ok(ai.cache.has('base-1:other'));
});
test('malformed generation batch can be replaced by a valid second attempt',async()=>{
 let calls=0;const ai=engine(async()=>++calls===1?{questions:null}:{questions:Array.from({length:7},(_,i)=>({title:'测试集合'+i,category:'分类'+i,hint:'填写一个名称。',answers:Array.from({length:4},(_,j)=>({name:'答案'+j,aliases:[],score:10+j*30}))}))});
 assert.equal((await ai.round()).length,7);assert.equal(calls,2);assert.equal(ai.roundPending,false);
});
test('six questions in four categories are retained and a missing category gets a third repair attempt',async()=>{
 const fixture={hint:'填写一种。',answers:Array.from({length:4},(_,i)=>({name:'例'+i,score:10+i*30,aliases:[]}))};
 const first=['科学','科学','影视','影视','游戏','文学'].map((category,i)=>({...fixture,category,title:'知识集合'+i}));
 const requests=[];const ai=engine(async({user})=>{requests.push(user);if(requests.length<3)return {questions:first};return {questions:[{...fixture,title:'补充的新集合',category:user.focus[0]}]}});
 const round=await ai.round();assert.equal(requests.length,3);assert.equal(requests[1].count,2);assert.equal(requests[1].focus.length,1);assert.ok(!['科学','影视','游戏','文学'].includes(categoryGroup({category:requests[1].focus[0]})));assert.equal(round.length,7);assert.equal(new Set(round.map(categoryGroup)).size,5);assert.equal(round.filter(q=>q.title.startsWith('知识集合')).length,6);
});
