import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps} from '../dist/bank.js';
import {fullScoreAnswers} from '../dist/scoring.js';
import {createSessionStore,validateSession,SESSION_STORAGE,SESSION_MAX_AGE} from '../dist/session-state.js';
import * as diveLog from '../dist/dive-log.js';

const sessionNow=1790000000000;
const sessionMemory=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
const sessionFixture=()=>({questions:structuredClone(bank.slice(0,7)),index:0,records:[],swapped:[],locked:false,complete:false,draft:''});
function storedFixture(state=sessionFixture()){
 const storage=sessionMemory();assert.equal(createSessionStore(storage,{bank,now:()=>sessionNow}).save(state),true);return{storage,snapshot:JSON.parse(storage.getItem(SESSION_STORAGE))};
}
const resultFor=q=>({question:q.title,answer:q.answers[0].name,score:q.answers[0].score,source:'reference',reason:''});

test('current round, draft and used swaps survive a store restart without a saved total or busy flag',()=>{
 const state=sessionFixture();state.index=1;state.records=[resultFor(state.questions[0])];state.swapped=[structuredClone(bank[8])];state.draft='尚未提交 <draft>';
 const{storage}=storedFixture({...state,total:999,busy:undefined});
 const restored=createSessionStore(storage,{bank,now:()=>sessionNow+1000}).load();
 assert.equal(restored.status,'restored');assert.deepEqual(restored.snapshot.questions,state.questions);assert.deepEqual(restored.snapshot.records,state.records);assert.equal(restored.snapshot.swapped.length,1);assert.equal(restored.snapshot.draft,state.draft);assert.equal('total' in restored.snapshot,false);assert.equal('busy' in restored.snapshot,false);
});

test('locked results and completed rounds restore at the same point with at most 700 points',()=>{
 const state=sessionFixture();state.index=6;state.locked=true;state.complete=true;state.records=state.questions.map(q=>{const a=q.answers.find(a=>a.score===100);return{question:q.title,answer:a.name,score:100,source:'reference',reason:''}});
 const{snapshot}=storedFixture(state);const restored=validateSession(snapshot,{bank,now:sessionNow});assert.equal(restored.records.reduce((sum,r)=>sum+r.score,0),700);assert.equal(restored.records.length,7);assert.equal(restored.complete,true);
 for(const score of[-1,101,1.5,Infinity,'100']){const bad=structuredClone(snapshot);bad.records[0].score=score;assert.throws(()=>validateSession(bad,{bank,now:sessionNow}));}
});

test('incompatible, expired, future, busy and inconsistent progress snapshots are rejected',()=>{
 const{snapshot}=storedFixture();
 const mutations=[v=>v.version=0,v=>v.scoringVersion=0,v=>v.savedAt=sessionNow-SESSION_MAX_AGE-1,v=>v.savedAt=sessionNow+60001,v=>v.busy=true,v=>v.questions.pop(),v=>v.questions[1]=v.questions[0],v=>v.index=7,v=>v.locked=true,v=>v.complete=true,v=>v.records.push(resultFor(v.questions[0])),v=>v.swapped=[...v.questions.slice(0,3)],v=>v.questions[0].title='<img src=x onerror=alert(1)>',v=>v.questions[0].answers[0].score='100'];
 for(const mutate of mutations){const bad=structuredClone(snapshot);mutate(bad);assert.throws(()=>validateSession(bad,{bank,now:sessionNow}));}
 assert.doesNotThrow(()=>validateSession(snapshot,{bank,now:sessionNow+SESSION_MAX_AGE}));
});

test('changed bank scores, fake reference points and malformed AI result evidence do not restore',()=>{
 const state=sessionFixture();state.locked=true;state.records=[resultFor(state.questions[0])];const{snapshot}=storedFixture(state);
 const changedBank=structuredClone(bank);changedBank[0].answers[0].score++;
 assert.throws(()=>validateSession(snapshot,{bank:changedBank,now:sessionNow}));
 const fake=structuredClone(snapshot);fake.records[0].score=100;assert.throws(()=>validateSession(fake,{bank,now:sessionNow}));
 fake.records[0]={...fake.records[0],source:'live-ai',reason:''};assert.throws(()=>validateSession(fake,{bank,now:sessionNow}));
 fake.records[0].reason='已核对题目条件。';assert.equal(validateSession(fake,{bank,now:sessionNow}).records[0].score,100);
 fake.records[0]={...fake.records[0],source:'skip',answer:'跳过',score:0,reason:''};assert.equal(validateSession(fake,{bank,now:sessionNow}).records[0].score,0);
});

test('AI question snapshots retain references while unknown curated questions are rejected',()=>{
 const state=sessionFixture();state.questions[0]={...state.questions[0],id:'ai-session-1',source:'ai'};const{storage}=storedFixture(state);
 assert.equal(createSessionStore(storage,{bank,now:()=>sessionNow}).load().snapshot.questions[0].source,'ai');
 state.questions[0].source='curated';assert.equal(createSessionStore(storage,{bank,now:()=>sessionNow}).save(state),false);
});

test('storage errors never overwrite an unreadable previous session or claim successful saving',()=>{
 let writes=0;const unreadable={getItem(){throw Error('SecurityError')},setItem(){writes++}};
 const store=createSessionStore(unreadable,{bank,now:()=>sessionNow});assert.equal(store.load().status,'unavailable');assert.equal(store.save(sessionFixture()),false);assert.equal(writes,0);
 const full=createSessionStore({getItem:()=>null,setItem(){writes++;throw Error('QuotaExceededError')}},{bank,now:()=>sessionNow});assert.equal(full.save(sessionFixture()),false);assert.equal(full.save(sessionFixture()),false);assert.equal(writes,1);
});

test('malformed or oversized JSON is ignored without mutating storage; invalid save preserves the old snapshot',()=>{
 for(const raw of['{','null','[]','x'.repeat(250001)]){const storage=sessionMemory();storage.setItem(SESSION_STORAGE,raw);assert.equal(createSessionStore(storage,{bank,now:()=>sessionNow}).load().status,'invalid');assert.equal(storage.getItem(SESSION_STORAGE),raw)}
 const{storage}=storedFixture();const old=storage.getItem(SESSION_STORAGE),store=createSessionStore(storage,{bank,now:()=>sessionNow});assert.equal(store.save({...sessionFixture(),index:2}),false);assert.equal(storage.getItem(SESSION_STORAGE),old);assert.equal(store.save({...sessionFixture(),draft:'可以继续保存'}),true);
});

test('app restoration renders locked feedback without adding points again and next advances once',async()=>{
 const state=sessionFixture();state.locked=true;state.records=[resultFor(state.questions[0])];
 const storage=sessionMemory();assert.equal(createSessionStore(storage,{bank}).save(state),true);
 class Element{
  constructor(){this.hidden=false;this.value='';this.children=[];this.textContent='';this.className='';this.disabled=false;}
  append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}before(){}after(){}focus(){}addEventListener(){}querySelector(){return new Element()}querySelectorAll(){return[]}showModal(){}close(){}
 }
 const elements=new Map(),registered=new Map();const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const context={document:{getElementById:element,createElement:()=>new Element(),modelContext:{registerTool:tool=>registered.set(tool.name,tool)}},navigator:{},window:{addEventListener(){}},localStorage:storage,hasGameAPI:false,isLocalAPI:false,createSessionStore,bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps,fullScoreAnswers,...diveLog,eligibleQuestions:x=>x,readFeedback:()=>[],createVoteControls:()=>new Element(),restoreBlockedQuestions:()=>0,exportFeedback:()=>0,knownInvalidAnswer:()=>null};
 const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');vm.runInNewContext(source,context);
 const read=()=>registered.get('get_game_state').execute();let current=await read();assert.equal(current.answered,true);assert.equal(current.records.length,1);assert.equal(current.records[0].score,state.records[0].score);assert.equal(element('total').textContent,state.records[0].score);
 element('skip').onclick();assert.equal((await read()).records.length,1);
 element('next').onclick();current=await read();assert.equal(current.round,2);assert.equal(current.answered,false);assert.equal(current.records.length,1);
 const saved=createSessionStore(storage,{bank}).load().snapshot;assert.equal(saved.index,1);assert.equal(saved.records.length,1);
});
