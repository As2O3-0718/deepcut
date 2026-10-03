import {SCORING_VERSION} from './scoring.js';
import {THEMES,themeQuestions} from './dive-log.js';

export const SESSION_STORAGE='deepcut-session-v1';
export const SESSION_MAX_AGE=24*60*60*1000;
const SESSION_VERSION=1;
const sessionText=(value,max,empty=false)=>typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0)&&!/[<>\u0000-\u001f]/.test(value);
function sessionQuestion(value){
 if(!value||!sessionText(value.id,100)||!sessionText(value.title,200)||!sessionText(value.category,80)||!sessionText(value.hint,500,true)||!['ai','curated'].includes(value.source)||value.scoreVersion!==SCORING_VERSION||!Array.isArray(value.answers)||value.answers.length<2||value.answers.length>100)throw Error('Invalid saved question');
 const answers=value.answers.map(a=>{
  if(!a||!sessionText(a.name,120)||!Number.isInteger(a.score)||a.score<10||a.score>100||!Array.isArray(a.aliases)||a.aliases.length>20||a.aliases.some(x=>!sessionText(x,120)))throw Error('Invalid saved answer');
  return{name:a.name,score:a.score,aliases:[...a.aliases]};
 });
 if(!answers.some(a=>a.score===100)||new Set(answers.map(a=>a.name)).size!==answers.length)throw Error('Invalid saved references');
 return{id:value.id,title:value.title,category:value.category,hint:value.hint,source:value.source,scoreVersion:value.scoreVersion,answers};
}

// Only this bounded, versioned shape is restored. Scores are derived from records,
// never from a saved total, and reference points must still match the question.
export function validateSession(value,{now=Date.now(),bank=[]}={}){
 if(!value||value.version!==SESSION_VERSION||value.scoringVersion!==SCORING_VERSION||!Number.isSafeInteger(value.savedAt)||value.savedAt<0||value.savedAt>now+60000||now-value.savedAt>SESSION_MAX_AGE||value.busy!==undefined||!Array.isArray(value.questions)||value.questions.length!==7||!Number.isInteger(value.index)||value.index<0||value.index>6||typeof value.locked!=='boolean'||typeof value.complete!=='boolean'||!Array.isArray(value.records)||!Array.isArray(value.swapped)||value.swapped.length>2||typeof value.draft!=='string'||value.draft.length>120)throw Error('Invalid saved session');
 const questions=value.questions.map(sessionQuestion),swapped=value.swapped.map(sessionQuestion);
 const theme=value.theme??'all',mode=value.mode??(questions.some(q=>q.source==='ai'&&!bank.some(item=>item.id===q.id))?'ai':'bank'),diveId=value.diveId??('legacy-'+value.savedAt);
 if(!THEMES.some(t=>t.id===theme)||!['bank','ai'].includes(mode)||!sessionText(diveId,100))throw Error('Invalid saved mode');
 if(mode==='ai'&&theme!=='all'||mode==='bank'&&themeQuestions([...questions,...swapped],theme).length!==questions.length+swapped.length)throw Error('Saved theme changed');
 const all=[...questions,...swapped];
 if(new Set(all.map(q=>q.id)).size!==all.length||new Set(all.map(q=>q.title)).size!==all.length)throw Error('Duplicate saved questions');
 for(const q of all){const original=bank.find(item=>item.id===q.id);if(original&&JSON.stringify(sessionQuestion(original))!==JSON.stringify(q)||!original&&q.source!=='ai')throw Error('Saved question changed');}
 if(value.records.length!==value.index+(value.locked?1:0)||value.complete&&(!value.locked||value.index!==6)||value.locked&&value.draft!=='')throw Error('Invalid saved progress');
 const records=value.records.map((r,i)=>{
  if(!r||r.question!==questions[i].title||!sessionText(r.answer,120)||!Number.isInteger(r.score)||r.score<0||r.score>100||!['reference','live-ai','skip'].includes(r.source)||!sessionText(r.reason,600,true))throw Error('Invalid saved result');
  if(r.source==='skip'?(r.score!==0||r.answer!=='跳过'):r.score<10)throw Error('Invalid saved points');
  if(r.source==='reference'&&!questions[i].answers.some(a=>a.name===r.answer&&a.score===r.score))throw Error('Changed reference points');
  if(r.source==='live-ai'&&!r.reason.trim())throw Error('Missing AI explanation');
  return{question:r.question,answer:r.answer,score:r.score,source:r.source,reason:r.reason};
 });
 return{version:SESSION_VERSION,scoringVersion:SCORING_VERSION,savedAt:value.savedAt,questions,index:value.index,records,swapped,locked:value.locked,complete:value.complete,draft:value.draft,theme,mode,diveId};
}

export function createSessionStore(storage,{bank=[],now=()=>Date.now()}={}){
 let disabled=false;
 return{
  load(){
   let raw;try{raw=storage.getItem(SESSION_STORAGE)}catch{disabled=true;return{status:'unavailable',snapshot:null}}
   if(raw===null)return{status:'empty',snapshot:null};
   try{if(raw.length>250000)throw Error('Oversized session');return{status:'restored',snapshot:validateSession(JSON.parse(raw),{now:now(),bank})}}catch{return{status:'invalid',snapshot:null}}
  },
  save(state){
   if(disabled)return false;
   let raw;try{const snapshot=validateSession({...state,version:SESSION_VERSION,scoringVersion:SCORING_VERSION,savedAt:now()},{now:now(),bank});raw=JSON.stringify(snapshot);if(raw.length>250000)throw Error('Oversized session')}catch{return false}
   try{storage.setItem(SESSION_STORAGE,raw);return true}catch{disabled=true;return false}
  }
 };
}
