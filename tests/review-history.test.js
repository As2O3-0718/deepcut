import test from 'node:test';
import assert from 'node:assert/strict';
import {FEEDBACK_STORAGE,REVIEW_STORAGE,validateReviewRecord,readReviewHistory,saveReview,latestReview,feedbackExportData} from '../dist/feedback-data.js';
const sample={kind:'reference',questionId:'water-sports',question:'说出一种水上运动。',answer:'公开水域游泳',score:100,reason:'冷门度不合理',conclusion:'建议修订',explanation:'相对满分不等于绝对冷门。',reviewedAt:1000,cacheCleared:1};
function memoryStorage(){const rows=new Map();return {getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)}}
test('review records validate successful result schema and discard unrelated fields',()=>{
 assert.deepEqual(validateReviewRecord({...sample,unknown:'private'}),sample);
 for(const change of [{conclusion:'错误结论'},{explanation:''},{explanation:'  '},{explanation:'a'.repeat(601)},{reviewedAt:NaN},{reviewedAt:Infinity},{reviewedAt:-1},{reviewedAt:9e15},{score:101},{answer:''},{kind:'other'}])assert.throws(()=>validateReviewRecord({...sample,...change}));
 assert.equal(validateReviewRecord({...sample,kind:'question',answer:'ignored',score:30}).score,null);
 assert.equal(validateReviewRecord({...sample,kind:'judgment',score:null}).score,null);
});
test('successful reviews survive restoration, retain history and select the latest timestamp',()=>{
 const storage=memoryStorage();saveReview(storage,sample);saveReview(storage,{...sample,reviewedAt:3000,conclusion:'暂维持'});saveReview(storage,{...sample,reviewedAt:2000});
 const restored=readReviewHistory(storage);assert.equal(restored.length,3);assert.equal(latestReview(restored,sample).conclusion,'暂维持');assert.equal(latestReview(restored,sample).reviewedAt,3000);
});
test('review history isolates question, answer, score and feedback kind',()=>{
 const storage=memoryStorage();saveReview(storage,sample);
 for(const change of [{questionId:'other'},{question:'另一道题'},{answer:'帆船'},{score:90},{kind:'judgment'},{score:null}])assert.equal(latestReview(readReviewHistory(storage),{...sample,...change}),null);
 assert.equal(latestReview(readReviewHistory(storage),{...sample,reason:'事实错误'}).conclusion,sample.conclusion);
});
test('invalid or failed storage writes never replace the previous successful result',()=>{
 const storage=memoryStorage();saveReview(storage,sample);const previous=storage.getItem(REVIEW_STORAGE);
 assert.throws(()=>saveReview(storage,{...sample,conclusion:'error'}));assert.equal(storage.getItem(REVIEW_STORAGE),previous);
 const blocked={getItem:storage.getItem,setItem(){throw Error('QuotaExceededError')}};
 assert.throws(()=>saveReview(blocked,{...sample,reviewedAt:2000}));assert.equal(storage.getItem(REVIEW_STORAGE),previous);
 assert.throws(()=>readReviewHistory({getItem(){throw Error('SecurityError')}}));
});
test('review history keeps the latest 100 successful submissions',()=>{
 const storage=memoryStorage();for(let i=0;i<105;i++)saveReview(storage,{...sample,reviewedAt:i});
 const records=readReviewHistory(storage);assert.equal(records.length,100);assert.equal(records[0].reviewedAt,5);assert.equal(records.at(-1).reviewedAt,104);
});
test('malformed persisted entries do not hide other valid review history',()=>{
 const storage=memoryStorage();storage.setItem(REVIEW_STORAGE,JSON.stringify([sample,{...sample,conclusion:'bad'}]));assert.deepEqual(readReviewHistory(storage),[sample]);
 for(const raw of ['{broken','null','{}']){storage.setItem(REVIEW_STORAGE,raw);assert.deepEqual(readReviewHistory(storage),[])}
});
test('export keeps legacy feedback and includes review history without unrelated fields',()=>{
 const storage=memoryStorage();storage.setItem(FEEDBACK_STORAGE,JSON.stringify([{...sample,vote:-1,updatedAt:1000}]));saveReview(storage,sample);
 const payload=feedbackExportData(storage,new Date('2026-09-27T00:00:00Z'));
 assert.equal(payload.version,2);assert.equal(payload.feedback.length,1);assert.equal(payload.feedback[0].vote,-1);assert.deepEqual(payload.reviews,[sample]);assert.equal(payload.exportedAt,'2026-09-27T00:00:00.000Z');
 assert.throws(()=>feedbackExportData({getItem(){throw Error('SecurityError')}}));
});
