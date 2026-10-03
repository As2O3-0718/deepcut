import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps} from '../dist/bank.js';
import {fullScoreAnswers} from '../dist/scoring.js';
import {createSessionStore} from '../dist/session-state.js';
import * as feedbackData from '../dist/feedback-data.js';
import * as diveLog from '../dist/dive-log.js';

function memoryStorage(){const entries=new Map();return{getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)}}
function testDOM(){
 const nodes=[],elements=new Map(),listeners=new Map();
 class Element{
  constructor(tagName='div'){this.tagName=tagName.toUpperCase();this.hidden=false;this.value='';this.children=[];this.textContent='';this.className='';this.disabled=false;this.dataset={};this.attributes={};this.events=new Map();nodes.push(this)}
  append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}before(){}after(){}focus(){}showModal(){}close(){}
  setAttribute(key,value){this.attributes[key]=value}getAttribute(key){return this.attributes[key]??null}
  addEventListener(key,fn){this.events.set(key,fn)}
  get options(){return this.children}
  querySelectorAll(selector){return this.children.filter(x=>x instanceof Element).flatMap(x=>[...(selector.startsWith('.')?x.className.split(' ').includes(selector.slice(1)):x.tagName===selector.toUpperCase())?[x]:[],...x.querySelectorAll(selector)])}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null}
 }
 const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const document={getElementById:element,createElement:tagName=>new Element(tagName),querySelectorAll:selector=>nodes.filter(x=>x.className.split(' ').includes(selector.slice(1)))};
 const window={addEventListener(key,fn){if(!listeners.has(key))listeners.set(key,[]);listeners.get(key).push(fn)},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event)}};
 return{Element,document,window,element};
}
async function source(file){return(await readFile(new URL('../dist/'+file,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')}

test('retry judges the edited answer and rejects an empty edit without another API call',async()=>{
 const dom=testDOM(),storage=memoryStorage(),registered=new Map(),requests=[];
 dom.document.modelContext={registerTool:tool=>registered.set(tool.name,tool)};
 const context={...dom,navigator:{},localStorage:storage,hasGameAPI:true,isLocalAPI:false,AbortSignal,createSessionStore,bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps,fullScoreAnswers,...feedbackData,...diveLog,createVoteControls:()=>new dom.Element(),restoreBlockedQuestions:()=>0,exportFeedback:()=>0,knownInvalidAnswer:()=>null,gameFetch:async(path,options)=>{
  if(path==='/api/health')return{ok:true,json:async()=>({enabled:true,minIntervalSeconds:2})};
  requests.push(JSON.parse(options.body));return{ok:true,json:async()=>({verdict:'uncertain',reason:'无法确认这个答案。'})};
 }};
 vm.runInNewContext(await source('app.js'),context);await new Promise(resolve=>setImmediate(resolve));
 await registered.get('submit_answer').execute({answer:'旧答案甲'});
 dom.element('answer').value='改过的新答案乙';
 const retry=()=>dom.element('feedback').children.find(x=>x.textContent==='重新判定（1 次 AI 调用）');
 await retry().onclick();
 assert.equal(requests.length,2);assert.equal(requests[0].answer,'旧答案甲');assert.equal(requests[1].answer,'改过的新答案乙');assert.equal(requests[1].recheck,true);
 dom.element('answer').value='   ';await retry().onclick();
 assert.equal(requests.length,2);assert.match(dom.element('feedback').children[0].textContent,/请输入/);
 const state=await registered.get('get_game_state').execute();assert.equal(state.records.length,0);assert.equal(state.answered,false);
});

test('voting and cross-tab withdrawal only update the affected feedback controls',async()=>{
 const dom=testDOM(),storage=memoryStorage(),context={...dom,localStorage:storage,hasGameAPI:false,location:{hostname:'example.test'},...feedbackData,Event};
 vm.runInNewContext(await source('feedback-ui.js'),context);
 const q={id:'regions',title:'说出一个中国的自治区。'};
 const question=context.createVoteControls(q),first=context.createVoteControls(q,{kind:'reference',answer:'宁夏',score:100}),second=context.createVoteControls(q,{kind:'reference',answer:'广西',score:78});
 const controls=[question,first,second],statuses=()=>controls.map(x=>x.querySelector('.vote-status').textContent),vote=(root,n)=>root.querySelectorAll('.vote-button').find(x=>x.dataset.vote===String(n));
 assert.deepEqual(statuses(),['','','']);await vote(first,1).onclick();assert.deepEqual(statuses(),['','已赞','']);
 await vote(question,-1).onclick();assert.match(statuses()[0],/已屏蔽/);assert.equal(statuses()[2],'');assert.equal(vote(question,-1).getAttribute('aria-pressed'),'true');
 await vote(first,1).onclick();assert.match(statuses()[0],/已屏蔽/);assert.equal(statuses()[1],'已撤销反馈');assert.equal(statuses()[2],'');
 const records=feedbackData.readFeedback(storage);storage.setItem(feedbackData.FEEDBACK_STORAGE,JSON.stringify(feedbackData.applyFeedback(records,{...records[0],vote:0})));
 dom.window.dispatchEvent({type:'storage',key:feedbackData.FEEDBACK_STORAGE});
 assert.deepEqual(statuses(),['已撤销','已撤销反馈','']);assert.equal(vote(question,-1).getAttribute('aria-pressed'),'false');assert.equal(second.querySelector('.feedback-actions').hidden,true);
});

test('saved feedback reasons sync matching controls and cross-tab reviews use the latest reason',async()=>{
 const dom=testDOM(),storage=memoryStorage(),requests=[],context={...dom,localStorage:storage,hasGameAPI:true,location:{hostname:'example.test'},...feedbackData,Event,AbortSignal,gameFetch:async(path,options)=>{
  requests.push(JSON.parse(options.body));return{ok:true,json:async()=>({conclusion:'暂维持',explanation:'已检查这条反馈。',cacheCleared:0})};
 }};
 vm.runInNewContext(await source('feedback-ui.js'),context);
 const q={id:'regions',title:'说出一个中国的自治区。'},identity={kind:'reference',answer:'宁夏',score:100};
 const first=context.createVoteControls(q,identity),second=context.createVoteControls(q,identity),unrelated=context.createVoteControls(q,{...identity,answer:'广西',score:78});
 const select=root=>root.querySelector('select'),review=root=>root.querySelector('.feedback-actions').children[1];
 for(const root of[first,second,unrelated])select(root).value='冷门度不合理';
 select(unrelated).value='其他问题';
 await first.querySelectorAll('.vote-button').find(x=>x.dataset.vote==='-1').onclick();
 select(first).value='事实错误';select(first).onchange();
 assert.equal(select(second).value,'事实错误');assert.equal(select(unrelated).value,'其他问题');
 await review(second).onclick();assert.equal(requests[0].concern,'事实错误');
 await second.querySelectorAll('.vote-button').find(x=>x.dataset.vote==='1').onclick();
 assert.equal(feedbackData.readFeedback(storage)[0].reason,'事实错误');
 await second.querySelectorAll('.vote-button').find(x=>x.dataset.vote==='-1').onclick();
 assert.equal(feedbackData.readFeedback(storage)[0].reason,'事实错误');
 const rows=feedbackData.readFeedback(storage);storage.setItem(feedbackData.FEEDBACK_STORAGE,JSON.stringify(feedbackData.applyFeedback(rows,{...rows[0],reason:'题意不清'})));
 dom.window.dispatchEvent({type:'storage',key:feedbackData.FEEDBACK_STORAGE});
 assert.equal(select(first).value,'题意不清');assert.equal(select(second).value,'题意不清');assert.equal(select(unrelated).value,'其他问题');
 await review(first).onclick();assert.equal(requests[1].concern,'题意不清');
});

test('feedback read failures preserve existing votes and prevent writes, restoration and export',async()=>{
 const dom=testDOM(),storage=memoryStorage(),old={kind:'question',questionId:'old',question:'已屏蔽题',answer:'',score:null,reason:'事实错误',vote:-1,updatedAt:1};
 storage.setItem(feedbackData.FEEDBACK_STORAGE,JSON.stringify([old]));const previous=storage.getItem(feedbackData.FEEDBACK_STORAGE);
 let fail=false,writes=0;
 const unreliable={getItem(key){if(fail&&key===feedbackData.FEEDBACK_STORAGE)throw Error('SecurityError');return storage.getItem(key)},setItem(key,value){writes++;storage.setItem(key,value)}};
 const context={...dom,localStorage:unreliable,hasGameAPI:false,location:{hostname:'example.test'},...feedbackData,Event};
 vm.runInNewContext(await source('feedback-ui.js'),context);
 const oldControls=context.createVoteControls({id:old.questionId,title:old.question}),newControls=context.createVoteControls({id:'new',title:'新题'});
 fail=true;dom.window.dispatchEvent({type:'storage',key:feedbackData.FEEDBACK_STORAGE});
 assert.equal(oldControls.querySelectorAll('.vote-button').find(x=>x.dataset.vote==='-1').getAttribute('aria-pressed'),'true');
 assert.match(oldControls.querySelector('.vote-status').textContent,/已屏蔽/);
 await newControls.querySelectorAll('.vote-button').find(x=>x.dataset.vote==='1').onclick();
 assert.match(newControls.querySelector('.vote-status').textContent,/保存失败/);
 assert.throws(()=>context.restoreBlockedQuestions(),/SecurityError/);
 assert.throws(()=>context.exportFeedback(),/SecurityError/);
 assert.equal(writes,0);assert.equal(storage.getItem(feedbackData.FEEDBACK_STORAGE),previous);
 fail=false;await newControls.querySelectorAll('.vote-button').find(x=>x.dataset.vote==='1').onclick();
 assert.equal(writes,1);assert.equal(feedbackData.readFeedback(storage).length,2);assert.match(newControls.querySelector('.vote-status').textContent,/已赞/);
});
