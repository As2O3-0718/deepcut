import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {normalizeQuestionWording} from '../dist/scoring.js';import {bank} from '../dist/bank.js';import {validateQuestions} from '../lib/ai.js';import {GameAI} from '../lib/game-ai.js';
test('wording removes popularity gates but preserves objective categories and answers',()=>{
 const q={title:'说出一款知名的音乐节奏游戏。',hint:'包括热门作品，必须是音乐节奏游戏。',answers:[{name:'知名作品',score:100}]};
 const clean=normalizeQuestionWording(q);assert.equal(clean.title,'说出一款音乐节奏游戏。');assert.equal(clean.hint,'包括作品，必须是音乐节奏游戏。');assert.equal(clean.answers,q.answers);
 assert.equal(normalizeQuestionWording({title:'说出一种流行音乐类型。'}).title,'说出一种流行音乐类型。');
 for(const item of bank)assert.doesNotMatch(item.title+item.hint,/知名|常见|著名|热门|广为人知/);
});
test('AI output is normalized before reaching players',()=>{
 const [q]=validateQuestions([{title:'说出一种常见的交通标志。',hint:'给出真实标志。',category:'交通',answers:Array.from({length:8},(_,i)=>({name:'标志'+i,aliases:[],score:20+i}))}]);
 assert.equal(q.title,'说出一种交通标志。');
});
test('saved AI questions migrate and version 2 verdicts are discarded without losing rate interval',async()=>{
 await mkdir('.local',{recursive:true});const dir=await mkdtemp('.local/wording-test-');const store=dir+'/cache.json';
 await writeFile(store,JSON.stringify({scoreVersion:2,judgmentVersion:2,calls:10,lastCall:12345,questions:[{id:'old',title:'说出一种常见的交通标志。',hint:'给出常见的标志。',answers:[{name:'停车',score:100}]}],cache:[['old:answer',{verdict:'invalid',reason:'不够知名'}]]}));
 const ai=new GameAI({store});await ai.load();assert.equal(ai.dynamic.get('old').title,'说出一种交通标志。');assert.equal(ai.cache.size,0);assert.equal(ai.lastCall,12345);assert.equal(ai.calls,10);
});
import {validateVerdict} from '../lib/ai.js';
test('a popularity-based rejection becomes uncertain rather than authoritative invalid',()=>{
 const result=validateVerdict({verdict:'invalid',reason:'该游戏不满足知名的条件。'});assert.equal(result.verdict,'uncertain');assert.equal(result.score,undefined);
 assert.equal(validateVerdict({verdict:'invalid',reason:'该作品不是音乐节奏游戏。'}).verdict,'invalid');
});
