import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps} from '../dist/bank.js';
import {fullScoreAnswers} from '../dist/scoring.js';
import {createSessionStore} from '../dist/session-state.js';
import * as feedbackData from '../dist/feedback-data.js';

function memoryStorage(){const entries=new Map();return{getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)}}
function testDOM(){
 const nodes=[],elements=new Map(),listeners=new Map();
 class Element{
  constructor(){this.hidden=false;this.value='';this.children=[];this.textContent='';this.className='';this.disabled=false;this.dataset={};this.attributes={};this.events=new Map();nodes.push(this)}
  append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}before(){}after(){}focus(){}showModal(){}close(){}
  setAttribute(key,value){this.attributes[key]=value}getAttribute(key){return this.attributes[key]??null}
  addEventListener(key,fn){this.events.set(key,fn)}
  get options(){return this.children}
  querySelectorAll(selector){return this.children.filter(x=>x instanceof Element).flatMap(x=>[...(x.className.split(' ').includes(selector.slice(1))?[x]:[]),...x.querySelectorAll(selector)])}
  querySelector(selector){return this.querySelectorAll(selector)[0]??null}
 }
 const element=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const document={getElementById:element,createElement:()=>new Element(),querySelectorAll:selector=>nodes.filter(x=>x.className.split(' ').includes(selector.slice(1)))};
 const window={addEventListener(key,fn){if(!listeners.has(key))listeners.set(key,[]);listeners.get(key).push(fn)},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event)}};
 return{Element,document,window,element};
}
async function source(file){return(await readFile(new URL('../dist/'+file,import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/export /g,'')}

test('retry judges the edited answer and rejects an empty edit without another API call',async()=>{
 const dom=testDOM(),storage=memoryStorage(),registered=new Map(),requests=[];
 dom.document.modelContext={registerTool:tool=>registered.set(tool.name,tool)};
 const context={...dom,navigator:{},localStorage:storage,hasGameAPI:true,isLocalAPI:false,AbortSignal,createSessionStore,bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps,fullScoreAnswers,...feedbackData,createVoteControls:()=>new dom.Element(),restoreBlockedQuestions:()=>0,exportFeedback:()=>0,knownInvalidAnswer:()=>null,gameFetch:async(path,options)=>{
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
