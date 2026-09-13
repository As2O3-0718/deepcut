export const FEEDBACK_STORAGE='deepcut-feedback-v1';
export function feedbackKey(r){return JSON.stringify([r.kind,r.questionId,r.question,r.answer||'',r.score??null])}
export function validateFeedback(r){
 const text=(x,max)=>typeof x==='string'&&x.length>0&&x.length<=max;
 if(!r||!['question','reference','judgment'].includes(r.kind)||!text(r.questionId,100)||!text(r.question,200)||![-1,0,1].includes(r.vote)||!Number.isFinite(r.updatedAt))throw Error('Invalid feedback');
 if(r.kind!=='question'&&(!text(r.answer,120)||r.score!==null&&(!Number.isInteger(r.score)||r.score<0||r.score>100)))throw Error('Invalid answer feedback');
 if(r.reason!==undefined&&(typeof r.reason!=='string'||r.reason.length>600))throw Error('Invalid reason');
 return{kind:r.kind,questionId:r.questionId,question:r.question,answer:r.kind==='question'?'':r.answer,score:r.kind==='question'?null:r.score,reason:r.reason||'',vote:r.vote,updatedAt:r.updatedAt};
}
export function applyFeedback(records,value){
 const r=validateFeedback(value),key=feedbackKey(r),next=records.filter(x=>feedbackKey(x)!==key);
 if(r.vote!==0)next.push(r);return next.slice(-2000);
}
export function readFeedback(storage){try{const data=JSON.parse(storage.getItem(FEEDBACK_STORAGE)||'[]');if(!Array.isArray(data))return[];return data.slice(-2000).map(validateFeedback).filter(r=>r.vote!==0)}catch{return[]}}

export function eligibleQuestions(pool,feedback){const blocked=new Set(feedback.filter(r=>r.kind==='question'&&r.vote===-1).map(r=>r.question));return pool.filter(q=>!blocked.has(q.title))}
