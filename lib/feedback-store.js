import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {applyFeedback,validateFeedback} from '../dist/feedback-data.js';
export class FeedbackStore{
 constructor(path='.local/feedback.json'){this.path=path;this.queue=Promise.resolve()}
 async write(value){
  let record;try{record=validateFeedback(value)}catch{throw Object.assign(new Error('反馈格式不正确。'),{status:400})}
  const task=this.queue.then(async()=>{
   let records=[];try{records=JSON.parse(await readFile(this.path,'utf8'));if(!Array.isArray(records))throw Error()}catch(e){if(e.code!=='ENOENT')throw Error('Feedback store unavailable')}
   records=applyFeedback(records,record);await mkdir(dirname(this.path),{recursive:true});await writeFile(this.path+'.tmp',JSON.stringify(records,null,2));await rename(this.path+'.tmp',this.path);return{saved:true};
  });this.queue=task.catch(()=>{});return task;
 }
}
