import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyFeedback,validateFeedback} from '../dist/feedback-data.js';
import {FeedbackStore} from '../lib/feedback-store.js';
const base={kind:'question',questionId:'test',question:'测试题',vote:1,updatedAt:1};
test('feedback changes and withdraws votes independently of references',()=>{
 let rows=applyFeedback([],base);rows=applyFeedback(rows,{...base,vote:-1});assert.equal(rows.length,1);assert.equal(rows[0].vote,-1);
 rows=applyFeedback(rows,{...base,kind:'reference',answer:'示例',score:100});assert.equal(rows.length,2);
 rows=applyFeedback(rows,{...base,vote:0});assert.equal(rows.length,1);assert.equal(rows[0].score,100);
 assert.throws(()=>validateFeedback({...base,vote:2}));
 assert.equal(validateFeedback({...base,kind:'judgment',answer:'答案',score:null}).score,null);
});
test('feedback persists ordered concurrent writes and withdrawal across restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'deepcut-feedback-'));const path=join(dir,'feedback.json');
 try{const store=new FeedbackStore(path);await Promise.all([store.write(base),store.write({...base,vote:-1})]);
 assert.equal(JSON.parse(await readFile(path,'utf8'))[0].vote,-1);
 await new FeedbackStore(path).write({...base,vote:0});assert.deepEqual(JSON.parse(await readFile(path,'utf8')),[]);
 await assert.rejects(store.write({...base,vote:5}),{status:400});
 }finally{await rm(dir,{recursive:true,force:true})}
});
