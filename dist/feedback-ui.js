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
   try{const records=readFeedback(localStorage);selected=records.find(r=>feedbackKey(r)===key)?.vote===vote?0:vote;const updated={...record,vote:selected,updatedAt:Date.now()};localStorage.setItem(FEEDBACK_STORAGE,JSON.stringify(applyFeedback(records,updated)));window.dispatchEvent(new Event(feedbackEvent));status.textContent=selected===0?(kind==='question'?'已撤销，恢复后续抽题':'已撤销反馈'):selected===1?'已赞':kind==='question'?'已屏蔽：后续开局及换题避开此题，本轮保留。':'已标记争议，可选择原因并请求复核。';details.hidden=selected!==-1;
    if(['127.0.0.1','localhost'].includes(location.hostname)){
     const sync=feedbackSync.then(async()=>{const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(updated),signal:AbortSignal.timeout(4000)});if(!r.ok)throw Error()});feedbackSync=sync.catch(()=>{});try{await sync}catch{status.textContent+='（已存浏览器，服务端未同步）'}
    }
   }catch{status.textContent='保存失败，请允许浏览器本地存储后重试。'}
  };
  buttons.push(button);root.append(button);
 }
 root.append(status);
 const details=document.createElement('div');details.className='feedback-actions';details.hidden=true;
 const select=document.createElement('select');select.setAttribute('aria-label','反馈原因');
 for(const text of ['冷门度不合理','事实错误','题意不清','其他问题']){const option=document.createElement('option');option.value=text;option.textContent=text;select.append(option)}
 const review=document.createElement('button');review.type='button';review.textContent='AI 复核（1 次调用）';
 const outcome=document.createElement('p');outcome.setAttribute('role','status');
 details.append(select,review,outcome);root.append(details);
 const local=['127.0.0.1','localhost'].includes(location.hostname);review.disabled=!local;
 if(!local)outcome.textContent='本机 AI 版可复核；此处可导出反馈。';
 select.onchange=()=>{try{const rows=readFeedback(localStorage);const existing=rows.find(r=>feedbackKey(r)===key);if(existing){const updated={...existing,reason:select.value,updatedAt:Date.now()};localStorage.setItem(FEEDBACK_STORAGE,JSON.stringify(applyFeedback(rows,updated)));outcome.textContent='原因已保存。';if(local){feedbackSync=feedbackSync.then(async()=>{const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(updated),signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error()}).catch(()=>{outcome.textContent='原因已存浏览器，服务端未同步。'})}}}catch{outcome.textContent='原因保存失败，请重试。'}};
 review.onclick=async()=>{
  review.disabled=true;outcome.textContent='正在独立复核题意和冷门度…';
  try{const response=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({questionId:q.id,answer,score,concern:select.value}),signal:AbortSignal.timeout(60000)});const data=await response.json();if(!response.ok)throw Error(data.error||'复核失败');outcome.textContent=data.conclusion+'：'+data.explanation+' 本轮分数未改动。';}
  catch(e){outcome.textContent=(e.name==='TimeoutError'?'复核超时，请重试。':e.message)}finally{review.disabled=false}
 };

 let current=[];try{current=readFeedback(localStorage)}catch{}
 const saved=current.find(r=>feedbackKey(r)===key);if(saved&&[...select.options].some(o=>o.value===saved.reason))select.value=saved.reason;const vote=saved?.vote||0;for(const button of buttons)button.setAttribute('aria-pressed',String(Number(button.dataset.vote)===vote));
 details.hidden=vote!==-1;if(vote===-1)status.textContent=kind==='question'?'已屏蔽，后续开局及换题避开此题。':'已标记争议，可请求复核。';return root;
}
function updateVoteButtons(){
 let records=[];try{records=readFeedback(localStorage)}catch{}
 for(const root of document.querySelectorAll('.vote-controls')){
  const vote=records.find(r=>feedbackKey(r)===root.dataset.feedbackKey)?.vote||0;
  const details=root.querySelector('.feedback-actions');if(details)details.hidden=vote!==-1;const status=root.querySelector('.vote-status');if(status)status.textContent=vote===0?'已撤销':vote===1?'已赞':JSON.parse(root.dataset.feedbackKey)[0]==='question'?'已屏蔽，后续开局及换题避开此题。':'已标记争议，可请求复核。';
  for(const button of root.querySelectorAll('.vote-button'))button.setAttribute('aria-pressed',String(Number(button.dataset.vote)===vote));
 }
}
window.addEventListener(feedbackEvent,updateVoteButtons);window.addEventListener('storage',e=>{if(e.key===FEEDBACK_STORAGE)updateVoteButtons()});
export function exportFeedback(){
 let records=[];try{records=readFeedback(localStorage)}catch{}
 const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),feedback:records},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='deepcut-feedback.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return records.length;
}

export function restoreBlockedQuestions(){const rows=readFeedback(localStorage);const blocked=rows.filter(r=>r.kind==='question'&&r.vote===-1);localStorage.setItem(FEEDBACK_STORAGE,JSON.stringify(rows.filter(r=>!(r.kind==='question'&&r.vote===-1))));window.dispatchEvent(new Event(feedbackEvent));if(['127.0.0.1','localhost'].includes(location.hostname)){for(const r of blocked){feedbackSync=feedbackSync.then(()=>fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...r,vote:0,updatedAt:Date.now()}),signal:AbortSignal.timeout(4000)})).catch(()=>{})}}return blocked.length}
