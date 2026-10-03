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
export function readFeedback(storage){const raw=storage.getItem(FEEDBACK_STORAGE);try{const data=JSON.parse(raw||'[]');if(!Array.isArray(data))return[];return data.slice(-2000).map(validateFeedback).filter(r=>r.vote!==0)}catch{return[]}}

export function eligibleQuestions(pool,feedback){const blocked=new Set(feedback.filter(r=>r.kind==='question'&&r.vote===-1).map(r=>r.question));return pool.filter(q=>!blocked.has(q.title))}
export const REVIEW_STORAGE='deepcut-review-history-v1';
export function validateReviewRecord(value){
 if(!value||!['建议修订','暂维持','无法确认'].includes(value.conclusion)||typeof value.explanation!=='string'||!value.explanation.trim()||value.explanation.length>600||!Number.isFinite(value.reviewedAt)||value.reviewedAt<0||value.reviewedAt>8640000000000000)throw Error('复核内容不完整，请重试。');
 const identity=validateFeedback({...value,vote:0,updatedAt:value.reviewedAt});
 return {kind:identity.kind,questionId:identity.questionId,question:identity.question,answer:identity.answer,score:identity.score,reason:identity.reason,conclusion:value.conclusion,explanation:value.explanation.trim(),reviewedAt:value.reviewedAt,cacheCleared:Number.isInteger(value.cacheCleared)&&value.cacheCleared>0?value.cacheCleared:0};
}
export function readReviewHistory(storage){
 const raw=storage.getItem(REVIEW_STORAGE);let rows;
 try{rows=JSON.parse(raw||'[]')}catch{return []}
 if(!Array.isArray(rows))return [];
 return rows.slice(-100).flatMap(row=>{try{return [validateReviewRecord(row)]}catch{return []}});
}
export function saveReview(storage,value){
 const record=validateReviewRecord(value),rows=[...readReviewHistory(storage),record].slice(-100);
 storage.setItem(REVIEW_STORAGE,JSON.stringify(rows));return record;
}
export function latestReview(records,identity){
 const key=feedbackKey(identity);return records.filter(row=>feedbackKey(row)===key).reduce((latest,row)=>!latest||row.reviewedAt>=latest.reviewedAt?row:latest,null);
}
export function feedbackExportData(storage,now=new Date()){
 return {version:2,exportedAt:now.toISOString(),feedback:readFeedback(storage),reviews:readReviewHistory(storage)};
}
