import test from 'node:test';import assert from 'node:assert/strict';import{mkdir,mkdtemp,writeFile}from 'node:fs/promises';
import{GameAI}from '../lib/game-ai.js';import{validateVerdict}from '../lib/ai.js';import{knownInvalidAnswer}from '../dist/eligibility.js';import{bank}from '../dist/bank.js';
const q=bank.find(q=>q.title==='说出一种印欧语系的语言。');
const eligibility={isReal:true,isSingle:true,meetsAllConditions:true};
const candidate={verdict:'valid',eligibility,name:'萨米语',score:88,reason:'符合条件。'};
test('a real but out-of-scope answer cannot earn points even when model returns valid',()=>{const result=validateVerdict({...candidate,eligibility:{...eligibility,meetsAllConditions:false},reason:'萨米语属于乌拉尔语系，不属于题目要求的印欧语系。'});assert.equal(result.verdict,'invalid');assert.equal(result.score,undefined)});
test('contradictory explanations and missing eligibility checks never receive points',()=>{for(const value of[{...candidate,reason:'萨米语不属于印欧语系，但考虑到用户可能误解，判为valid。'},{...candidate,eligibility:undefined}]){const result=validateVerdict(value);assert.equal(result.verdict,'uncertain');assert.equal(result.score,undefined)}});
test('known Sami correction works in both languages without blocking an eligible answer',()=>{for(const answer of['萨米','萨米语','Sámi','Saami','Sami language'])assert.equal(knownInvalidAnswer(q,answer).verdict,'invalid');assert.equal(knownInvalidAnswer(q,'德语'),null)});
test('Sami correction overrides even a current poisoned cache without calling AI',async()=>{const ai=new GameAI({complete:async()=>{throw Error('must not call')}});ai.cache.set(q.id+':萨米',{verdict:'valid',score:88});const result=await ai.judge(q.id,'萨米');assert.equal(result.verdict,'invalid');assert.equal(result.score,undefined);assert.equal(ai.calls,0)});
test('prior judgment cache is invalidated while preserving daily usage',async()=>{await mkdir('.local',{recursive:true});const dir=await mkdtemp('.local/judgment-test-');const store=dir+'/cache.json';await writeFile(store,JSON.stringify({scoreVersion:2,calls:12,day:'2026-09-13',cache:[['some-answer',{verdict:'valid',score:88}]]}));const ai=new GameAI({store});await ai.load();assert.equal(ai.cache.size,0);assert.equal(ai.calls,12)});


test('lack of evidence remains uncertain regardless of model verdict or false checks',()=>{
  for(const verdict of ['valid','invalid'])for(const reason of ['无法核实这款新游戏的发行和类型。','该答案的真实性证据不足。','Cannot verify the release date.']){
    const result=validateVerdict({...candidate,verdict,eligibility:{...eligibility,isReal:false},reason});
    assert.equal(result.verdict,'uncertain');assert.equal(result.reason,reason);assert.equal(result.score,undefined);
  }
});

test('specific scope failures are preserved instead of replaced with a generic error',()=>{
  const reason='萨米语属于乌拉尔语系，不属于题目要求的印欧语系。';
  const result=validateVerdict({...candidate,eligibility:{...eligibility,meetsAllConditions:false},reason});
  assert.equal(result.verdict,'invalid');assert.equal(result.reason,reason);assert.equal(result.score,undefined);
});

test('contradictory invalid labels and positive reasons cannot become cached rejections',()=>{
  assert.equal(validateVerdict({...candidate,verdict:'invalid'}).verdict,'uncertain');
  assert.equal(validateVerdict({...candidate,eligibility:{...eligibility,isReal:false}}).verdict,'uncertain');
});

test('a factual comparison with another group does not invalidate eligible answers',()=>{
  const result=validateVerdict({...candidate,name:'德语',reason:'德语属于印欧语系，不属于乌拉尔语系，符合本题要求。'});
  assert.equal(result.verdict,'valid');assert.equal(result.score,88);
});

test('malformed and missing eligibility never turn into an authoritative answer',()=>{
  assert.throws(()=>validateVerdict(null),/判定格式不合格/);
  assert.equal(validateVerdict({...candidate,eligibility:{...eligibility,isReal:null}}).verdict,'uncertain');
});

test('a missing-evidence rejection is not cached and can be corrected on retry',async()=>{
  let calls=0;const ai=new GameAI({minIntervalMs:0,persistence:{write:async()=>{}},complete:async()=>{
    calls++;return calls===1?{verdict:'invalid',reason:'无法核实该答案。'}:{...candidate,name:'苏里南',reason:'苏里南是南美洲的主权国家。'};
  }});
  assert.equal((await ai.judge('base-0','待核实的别名')).verdict,'uncertain');assert.equal(ai.cache.size,0);
  assert.equal((await ai.judge('base-0','待核实的别名')).verdict,'valid');assert.equal(calls,2);
});


test('negated uncertainty wording does not override an otherwise supported verdict',()=>{
  const valid=validateVerdict({...candidate,name:'德语',reason:'并非无法确认：德语属于印欧语系。'});
  assert.equal(valid.verdict,'valid');
  const invalid=validateVerdict({verdict:'invalid',reason:'不是无法核实：该语言属于乌拉尔语系，不符合本题条件。'});
  assert.equal(invalid.verdict,'invalid');
  const uncertain=validateVerdict({...candidate,reason:'并非无法确认名称，但尚未确认具体类型。'});
  assert.equal(uncertain.verdict,'uncertain');
});
