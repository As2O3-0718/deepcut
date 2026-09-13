import {FEEDBACK_STORAGE,feedbackKey,applyFeedback,readFeedback} from './feedback-data.js';
const feedbackEvent='deepcut-feedback-changed';
let feedbackSync=Promise.resolve();
export function createVoteControls(q,{kind='question',answer='',score=null,reason=''}={}){
 const record={kind,questionId:q.id,question:q.title,answer,score,reason};const key=feedbackKey(record);
 const root=document.createElement('div');root.className='vote-controls';root.dataset.feedbackKey=key;
 const label=document.createElement('span');label.className='vote-label';label.textContent=kind==='question'?'这道题':kind==='judgment'?'这次判分':'答案与分值';root.append(label);
 const status=document.createElement('span');status.className='vote-status';status.setAttribute('role','status');
 const buttons=[];
 for(const [vote,text]of[[1,'赞'],[-1,'踩']]){
  const button=document.createElement('button');button.type='button';button.className='vote-button';button.textContent=text;button.dataset.vote=String(vote);
  button.setAttribute('aria-label',`${kind==='question'?'题目 '+q.title:(kind==='judgment'?'判分 ':'参考答案 ')+answer+' '+(score===null?'未计分':score+'分')}：${text}`);
  button.onclick=async()=>{
   let selected;
   try{const records=readFeedback(localStorage);selected=records.find(r=>feedbackKey(r)===key)?.vote===vote?0:vote;const updated={...record,vote:selected,updatedAt:Date.now()};localStorage.setItem(FEEDBACK_STORAGE,JSON.stringify(applyFeedback(records,updated)));window.dispatchEvent(new Event(feedbackEvent));status.textContent=selected===0?'已撤销':selected===1?'已赞':'已踩';
    if(['127.0.0.1','localhost'].includes(location.hostname)){
     const sync=feedbackSync.then(async()=>{const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(updated),signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error()});feedbackSync=sync.catch(()=>{});try{await sync}catch{status.textContent+='（已存浏览器，服务端未同步）'}
    }
   }catch{status.textContent='保存失败，请允许浏览器本地存储后重试。'}
  };
  buttons.push(button);root.append(button);
 }
 root.append(status);
 let current=[];try{current=readFeedback(localStorage)}catch{}
 const vote=current.find(r=>feedbackKey(r)===key)?.vote||0;for(const button of buttons)button.setAttribute('aria-pressed',String(Number(button.dataset.vote)===vote));
 return root;
}
function updateVoteButtons(){
 let records=[];try{records=readFeedback(localStorage)}catch{}
 for(const root of document.querySelectorAll('.vote-controls')){
  const vote=records.find(r=>feedbackKey(r)===root.dataset.feedbackKey)?.vote||0;
  for(const button of root.querySelectorAll('button'))button.setAttribute('aria-pressed',String(Number(button.dataset.vote)===vote));
 }
}
window.addEventListener(feedbackEvent,updateVoteButtons);window.addEventListener('storage',e=>{if(e.key===FEEDBACK_STORAGE)updateVoteButtons()});
export function exportFeedback(){
 let records=[];try{records=readFeedback(localStorage)}catch{}
 const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),feedback:records},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='deepcut-feedback.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return records.length;
}
