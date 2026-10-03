import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as diveLog from '../dist/dive-log.js';
import * as feedback from '../dist/feedback-data.js';
import * as bankData from '../dist/bank.js';
import {fullScoreAnswers} from '../dist/scoring.js';
import {createSessionStore,validateSession,SESSION_STORAGE} from '../dist/session-state.js';
const memory=()=>{const rows=new Map();return{getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)}};
const fixture=(id='first')=>({id,completedAt:1791000000000,mode:'bank',theme:'geography',scores:[100,85,63,30,10,0,100]});

test('every theme offers seven distinct playable questions and stays in its field on replacement',()=>{
 for(const theme of diveLog.THEMES){
  const pool=diveLog.themeQuestions(bankData.bank,theme.id),round=bankData.pickRound(pool);
  assert.ok(pool.length>=7,theme.name);assert.equal(round.length,7);assert.equal(new Set(round.map(q=>q.id)).size,7);
  const replacement=bankData.chooseReplacement(pool,round,[]);
  if(replacement){assert.ok(theme.pattern.test(replacement.category));assert.ok(!round.includes(replacement))}
 }
 assert.equal(diveLog.themeQuestions(bankData.bank,'geography').some(q=>q.category==='体育运动'),false);
});
test('completed log deduplicates reloads, bounds history and preserves data on read failure',()=>{
 const storage=memory();assert.equal(diveLog.recordDive(storage,fixture()),true);assert.equal(diveLog.recordDive(storage,fixture()),false);
 assert.deepEqual(diveLog.diveStats(diveLog.readDiveLog(storage)),{count:1,best:388,average:388,gems:2});
 for(let i=0;i<101;i++)diveLog.recordDive(storage,fixture('round-'+i));
 const rows=diveLog.readDiveLog(storage);assert.equal(rows.length,100);assert.equal(rows[0].id,'round-1');
 let writes=0;assert.throws(()=>diveLog.recordDive({getItem(){throw Error('Unreadable')},setItem(){writes++}},fixture()),/Unreadable/);assert.equal(writes,0);
 for(const invalid of[{...fixture(),scores:[100]},{...fixture(),scores:[100,85,63,30,10,0,101]},{...fixture(),theme:'fake'},{...fixture(),completedAt:Infinity}])assert.throws(()=>diveLog.recordDive(storage,invalid));
 assert.equal(diveLog.readDiveLog(storage).length,100);
});
test('malformed log items are isolated and sharing contains scores without answers or question text',()=>{
 const storage=memory();storage.setItem(diveLog.DIVE_LOG_STORAGE,JSON.stringify([null,fixture(),{...fixture('bad'),scores:['100']},fixture()]));
 assert.equal(diveLog.readDiveLog(storage).length,1);
 const text=diveLog.shareDive(fixture());assert.match(text,/388 \/ 700/);assert.match(text,/6\/7/);assert.match(text,/💎 2/);assert.match(text,/环游世界/);assert.equal(text.includes('宁夏'),false);
 assert.throws(()=>diveLog.shareDive({scores:[100]}));
});

async function appHarness(storage,{gameFetch=null}={}){
 class Element{
  constructor(){this.hidden=false;this.value='';this.children=[];this.textContent='';this.className='';this.disabled=false;this.events={};this.open=false}
  append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}before(){}after(){}focus(){}select(){}showModal(){this.open=true}close(){this.open=false}
  addEventListener(name,fn){this.events[name]=fn}querySelector(){return new Element()}querySelectorAll(){return[]}
 }
 const elements=new Map(),registered=new Map();const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const context={document:{getElementById:element,createElement:()=>new Element(),modelContext:{registerTool:tool=>registered.set(tool.name,tool)}},navigator:{},window:{addEventListener(){}},localStorage:storage,hasGameAPI:!!gameFetch,isLocalAPI:false,gameFetch,AbortSignal,createSessionStore,...bankData,...feedback,...diveLog,fullScoreAnswers,createVoteControls:()=>new Element(),restoreBlockedQuestions:()=>0,exportFeedback:()=>0,knownInvalidAnswer:()=>null};
 const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');vm.runInNewContext(source,context);
 await new Promise(resolve=>setImmediate(resolve));return{element,state:()=>createSessionStore(storage,{bank:bankData.bank}).load().snapshot,read:()=>registered.get('get_game_state').execute()};
}
test('theme gameplay restores mode, logs only completed rounds once and offers a clipboard fallback',async()=>{
 const storage=memory();let app=await appHarness(storage);
 app.element('theme-select').value='geography';app.element('theme-start').onclick();
 let state=app.state();assert.equal(state.theme,'geography');assert.ok(state.questions.every(q=>/地理/.test(q.category)));const id=state.diveId;
 app.element('swap').onclick();state=app.state();assert.equal(state.theme,'geography');assert.equal(state.swapped.length,1);assert.ok(/地理/.test(state.questions[0].category));
 app=await appHarness(storage);assert.equal(app.state().diveId,id);assert.equal(app.state().swapped.length,1);assert.equal(app.element('theme-select').value,'geography');
 assert.equal(diveLog.readDiveLog(storage).length,0);
 for(let i=0;i<7;i++){app.element('skip').onclick();app.element('next').onclick()}
 assert.equal(app.element('results').hidden,false);assert.equal(diveLog.readDiveLog(storage).length,1);assert.equal(app.state().complete,true);
 await app.element('share-score').onclick();assert.equal(app.element('share-text').hidden,false);assert.match(app.element('share-text').value,/0 \/ 700/);
 app=await appHarness(storage);assert.equal(diveLog.readDiveLog(storage).length,1);assert.equal(app.state().diveId,id);
 app.element('again').onclick();assert.equal(app.state().theme,'geography');assert.notEqual(app.state().diveId,id);assert.equal(app.state().records.length,0);
});
test('a blocked theme does not replace the active game or consume progress',async()=>{
 const storage=memory();const app=await appHarness(storage),before=storage.getItem(SESSION_STORAGE);
 const rows=diveLog.themeQuestions(bankData.bank,'geography').map(q=>({kind:'question',questionId:q.id,question:q.title,answer:'',score:null,reason:'',vote:-1,updatedAt:1}));
 storage.setItem(feedback.FEEDBACK_STORAGE,JSON.stringify(rows));app.element('theme-select').value='geography';app.element('theme-start').onclick();
 assert.equal(storage.getItem(SESSION_STORAGE),before);assert.match(app.element('theme-note').textContent,/不足七题/);
});
test('offline stylesheet keeps its base colors without leftover external font import fragments',async()=>{
 const html=await readFile(new URL('../offline/Deepcut.html',import.meta.url),'utf8');
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 assert.match(css.trimStart(),/^:root\{/);assert.match(css,/:root\{[^}]*background:#071e2b/);assert.equal(css.includes('fonts.googleapis.com'),false);
 assert.match(html,/id="theme-select"/);assert.match(html,/id="dive-log-dialog"/);
});
test('AI round keeps a selected theme on failure and changes to AI comprehensive mode on success',async()=>{
 const storage=memory();let succeed=false;
 const generated=bankData.bank.slice(0,7).map((q,i)=>({...q,id:'ai-theme-test-'+i,source:'ai'}));
 const app=await appHarness(storage,{gameFetch:async path=>path==='/api/health'?{ok:true,json:async()=>({enabled:true,minIntervalSeconds:2})}:{ok:succeed,json:async()=>succeed?{questions:generated,generation:{categories:5}}:{error:'模拟生成失败',code:'ROUND_INCOMPLETE'}}});
 app.element('theme-select').value='arts';app.element('theme-start').onclick();const before=app.state();
 await app.element('ai-round').onclick();assert.equal(app.state().diveId,before.diveId);assert.equal(app.state().theme,'arts');assert.equal(app.element('theme-start').disabled,false);
 assert.match(app.element('ai-round').textContent,/继续补齐/);
 succeed=true;await app.element('ai-round').onclick();assert.equal(app.state().theme,'all');assert.equal(app.state().mode,'ai');assert.notEqual(app.state().diveId,before.diveId);
 assert.equal(app.state().questions[0].id,'ai-theme-test-0');assert.equal((await app.read()).mode,'ai');
 assert.equal(app.element('ai-round').textContent,'AI 新一轮 ✦');assert.match(app.element('ai-status').textContent,/7 道、5 类/);
});
test('legacy sessions migrate with a stable ID and themed metadata cannot mislabel unrelated questions',async()=>{
 const storage=memory(),app=await appHarness(storage);const saved=app.state();
 saved.questions=structuredClone(bankData.bank.slice(0,7));delete saved.theme;delete saved.mode;delete saved.diveId;
 const legacy=validateSession(saved,{bank:bankData.bank});assert.equal(legacy.theme,'all');assert.equal(legacy.mode,'bank');assert.equal(legacy.diveId,'legacy-'+saved.savedAt);
 assert.throws(()=>validateSession({...saved,theme:'geography',mode:'bank'},{bank:bankData.bank}));
 assert.throws(()=>validateSession({...saved,theme:'arts',mode:'ai'},{bank:bankData.bank}));
});
