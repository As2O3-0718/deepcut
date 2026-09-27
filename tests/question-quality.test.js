import test from 'node:test';
import assert from 'node:assert/strict';
import {AIError,validateQuestions} from '../lib/ai.js';

const question=()=>({title:'说出一种乐器。',category:'音乐',hint:'需为真实乐器。',answers:[
  {name:'钢琴',aliases:['Piano'],score:10},
  {name:'小提琴',aliases:['Violin'],score:30},
  {name:'二胡',aliases:['Erhu'],score:60},
  {name:'特雷门琴',aliases:['Theremin'],score:100},
]});
const validate=q=>validateQuestions([q])[0];

test('question aliases may be omitted and harmless formatting is normalized without mutating input',()=>{
  const q=question();q.answers[0]={name:' 钢琴 ',aliases:[' Piano ','piano','ＰＩＡＮＯ','钢琴'],score:10};
  delete q.answers[1].aliases;
  const copy=structuredClone(q),result=validate(q);
  assert.deepEqual(result.answers[0],{name:'钢琴',aliases:['Piano'],score:10});
  assert.deepEqual(result.answers[1].aliases,[]);
  assert.deepEqual(q,copy);
});

test('duplicate canonical answers merge only compatible scores and retain unique aliases',()=>{
  const q=question();q.answers.push({name:' 钢琴 ',aliases:['piano','钢琴乐器'],score:10});
  const result=validate(q);assert.equal(result.answers.length,4);
  assert.deepEqual(result.answers[0],{name:'钢琴',aliases:['Piano','钢琴乐器'],score:10});
  const english=question();english.answers[0]={name:'Piano',aliases:[],score:10};
  english.answers.push({name:' ＰＩＡＮＯ ',aliases:['钢琴'],score:10});
  assert.deepEqual(validate(english).answers[0],{name:'Piano',aliases:['钢琴'],score:10});
  q.answers.at(-1).score=11;
  assert.throws(()=>validate(q),/同一答案分数冲突/);
});

test('repeated canonicals and their aliases cannot satisfy the four-reference minimum',()=>{
  const q=question();q.answers=q.answers.slice(0,3);
  q.answers.push({name:'钢琴',aliases:['Piano','钢琴乐器'],score:10});
  assert.throws(()=>validate(q),/不同参考答案不足/);
});

test('alias collisions across distinct references remain errors regardless of ordering',()=>{
  const q=question();q.answers[0].aliases=[' violin '];
  for(const answers of[q.answers,[...q.answers].reverse()])assert.throws(()=>validate({...q,answers}),/别名冲突/);
  q.answers[0].aliases=['小提琴'];
  assert.throws(()=>validate(q),/别名冲突/);
});

test('malformed aliases and non-numeric scores are never repaired into valid answers',()=>{
  for(const aliases of[null,'Piano',{},[' '],['---'],[10]]){
    const q=question();q.answers[0].aliases=aliases;
    assert.throws(()=>validate(q),AIError);
  }
  for(const score of['10',true,NaN,Infinity,9,101,10.5]){
    const q=question();q.answers[0].score=score;
    assert.throws(()=>validate(q),AIError);
  }
  for(const answer of[null,[],{name:'---',aliases:[],score:10}]){
    const q=question();q.answers[0]=answer;assert.throws(()=>validate(q),AIError);
  }
  assert.throws(()=>validateQuestions([null]),AIError);
});

test('wording cleanup and surrounding whitespace cannot hide duplicate question titles',()=>{
  const q=question();assert.throws(()=>validateQuestions([q,{...question(),title:' 说出一种知名的乐器。 '}]),AIError);
});
