import {hasGameAPI,isLocalAPI,gameFetch} from './api-client.js';
import {eligibleQuestions,readFeedback} from './feedback-data.js';
import {createVoteControls,exportFeedback,restoreBlockedQuestions} from './feedback-ui.js';
import {knownInvalidAnswer} from './eligibility.js';
import {fullScoreAnswers} from './scoring.js';
import {bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps} from './bank.js';
const $=id=>document.getElementById(id);
let questions=[],index=0,records=[],locked=false,busy=false,aiAvailable=false;
let swapped=[];
let seen=[];let seenTitles=[];
try{const saved=JSON.parse(localStorage.getItem("deepcut-titles-v2")||"[]");if(Array.isArray(saved))seenTitles=saved.filter(x=>typeof x==="string").slice(-2000)}catch{}
try{const saved=JSON.parse(localStorage.getItem('deepcut-seen-v2')||'[]');if(Array.isArray(saved))seen=saved.filter(x=>typeof x==='string').slice(-2000)}catch{}
function savedList(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}catch{return[]}}
function syncHistory(){seen=mergeHistory(seen,savedList('deepcut-seen-v2'));seenTitles=mergeHistory(seenTitles,savedList('deepcut-titles-v2'));}
function remember(q){syncHistory();seenTitles=seenTitles.filter(x=>x!==q.title);seenTitles.push(q.title);seenTitles=seenTitles.slice(-2000);seen=seen.filter(x=>x!==q.id);seen.push(q.id);seen=seen.slice(-2000);try{localStorage.setItem('deepcut-titles-v2',JSON.stringify(seenTitles));localStorage.setItem('deepcut-seen-v2',JSON.stringify(seen))}catch{$('feedback-storage-note').textContent='浏览器未能保存已玩记录，刷新后可能重复出题。请允许本地存储。'}}
window.addEventListener('storage',syncHistory);
function setBusy(value){busy=value;$('answer').disabled=value||locked;$('submit').disabled=value||locked;$('skip').disabled=value;$('swap').disabled=value||locked||swapped.length>=2;$('swap').textContent=`换题（剩 ${2-swapped.length}/2）`; $('ai-round').disabled=value||!aiAvailable||(records.length>0||swapped.length>0)&&!$('play').hidden;$('submit').textContent=value?'AI 正在判断…':'下潜验证 ↓'}
function notice(text,error=false){$('feedback').className='';const p=document.createElement('p');p.className=error?'error':'hint';p.textContent=text;$('feedback').replaceChildren(p)}
async function api(path,body){
 const response=await gameFetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(path==='round'?125000:60000)});
 let data;try{data=await response.json()}catch{throw new Error('AI 服务暂时不可用，请重试或跳过。')}
 if(!response.ok)throw new Error(data.error||'AI 暂时不可用，请重试或跳过。');return data;
}
function availableBank(){try{return eligibleQuestions(bank,readFeedback(localStorage))}catch{return bank}}
function start(next){
 syncHistory();if(!next){const eligible=availableBank();const filtered=avoidRecentSwaps(eligible,savedList('deepcut-swapped-v1'));const pool=filtered.length>=7?filtered:eligible;if(pool.length<7){notice('可用题目不足七题，请撤销部分题目点踩后再开局。',true);return}next=pickRound(pool,seen,seenTitles)}
 if(busy)return;questions=next;index=0;records=[];swapped=[];locked=false;$('results').hidden=true;$('play').hidden=false;render();
}
function render(){
 locked=false;const q=questions[index];remember(q);
 $('round').textContent=`第 ${String(index+1).padStart(2,'0')} / 07 题`;$('total').textContent=records.reduce((s,r)=>s+r.score,0);
 $('progress').innerHTML=questions.map((_,i)=>`<span class="${i<index?'done':i===index?'current':''}" aria-label="第 ${i+1} 题"></span>`).join('');
 $('category').textContent=q.category+(q.source==='ai'?' · AI 题目':'');$('question').textContent=q.title;$('hint').textContent=q.hint;$('question-votes').replaceChildren(createVoteControls(q));
 $('answer').value='';$('skip').hidden=false;$('swap').hidden=false;$('feedback').replaceChildren();$('feedback').className='';setBusy(false);if(index>0)$('answer').focus();
}
async function submit(value){
 if(busy||locked)return{error:'请先完成当前操作。'};
 if(typeof value!=='string'||!value.trim()||value.length>120){notice('请输入120字以内的答案。',true);return{recognized:false}}
 const q=questions[index];const correction=knownInvalidAnswer(q,value);if(correction){notice(correction.reason+' 请更换答案，本次不计分。',true);return{recognized:false}}
 const match=findAnswer(q,value);
 if(match){finish(match,{source:q.source});return{recognized:true,answer:match.name,score:match.score}}
 if(!aiAvailable||!$('ai-judge').checked){notice('题库未收录这个答案。可以换个名称或其他答案；本次不扣分。',true);return{recognized:false}}
 setBusy(true);notice('正在请 AI 检查答案和题目条件…');
 try{
  const result=await api('judge',{questionId:q.id,answer:value});
  if(result.verdict==='valid'){
    finish({name:result.name,score:result.score},{source:'live-ai',reason:result.reason});return{recognized:true,answer:result.name,score:result.score};
  }
  notice((result.verdict==='uncertain'?'AI 暂时无法确认：':'AI 认为不符合题意：')+result.reason+' 你可以换一个答案，或跳过本题。',true);$('feedback').append(createVoteControls(q,{kind:'judgment',answer:value,score:null,reason:result.reason}));return{recognized:false};
 }catch(e){notice(e.name==='TimeoutError'?'AI 等待超时，请重试或跳过。':e.message,true);return{recognized:false}}
 finally{setBusy(false)}
}
function finish(match,{source,reason}={}){
 if(locked)return;locked=true;const q=questions[index];records.push({question:q.title,answer:match?.name??'跳过',score:match?.score??0});$('total').textContent=records.reduce((s,r)=>s+r.score,0);$('skip').hidden=true;$('swap').hidden=true;setBusy(busy);
 const score=match?.score??0,feedback=$('feedback');feedback.className='feedback';
 feedback.innerHTML=`<div class="scoreline"><div><div class="category">${match?(score>=75?'深海发现':score>=40?'另辟蹊径':'正确，继续探索'):'这一题，留待下次'}</div><h2 id="answer-name"></h2></div><div class="score">+${score}<small>分</small></div></div><div class="meter"><div style="width:${score}%"></div></div><p id="explanation"></p><p id="score-note"></p><div class="examples"></div><button class="primary" id="next">${index===6?'查看本轮成绩':'继续下潜 →'}</button>`;
 $('answer-name').textContent=match?.name??'已跳过';$('explanation').textContent=reason||'本题的其他参考答案：';
 $('score-note').textContent='100分为本题参考答案中最冷门的档位，不代表真实玩家统计。 '+(source==='live-ai'?'AI 判定及冷门估计可能有误，同一答案判定已在本机缓存。':q.source==='ai'?'本题由 AI 生成并经 AI 复核，尚非人工逐条核验；分数为冷门估计。':'冷门度为题库预设分值。');
 if(match)$('explanation').after(createVoteControls(q,{kind:'judgment',answer:match.name,score:match.score,reason:reason||'题库参考分值'}));
 renderReferences(feedback.querySelector('.examples'),q);
 $('next').onclick=next;$('next').focus();
}
function next(){if(!locked||busy)return;if(index<6){index++;render()}else showResults()}
function showResults(){
 $('play').hidden=true;$('results').hidden=false;$('round').textContent='本轮下潜完成';$('progress').querySelectorAll('span').forEach(s=>s.className='done');
 const total=records.reduce((s,r)=>s+r.score,0);
 $('results').innerHTML=`<div class="category">DIVE COMPLETE · ${records.filter(r=>r.score>0).length} / 7 题已答对</div><h2>${total>=500?'你找到了深海宝藏。':total>=300?'你有自己的思考航线。':'海很大，继续探索。'}</h2><div class="resultscore">${total}<small> / 700 分</small></div><div id="recap"></div><button class="primary" id="again">题库再潜一轮 ↻</button><p class="hint" style="text-align:center;margin:14px 0 0">优先抽取本机没玩过的题目</p>`;
 records.forEach((r,i)=>{const row=document.createElement('div');row.className='resultrow';const label=document.createElement('span');label.textContent=`${i+1}. ${r.question} ${r.answer}`;const points=document.createElement('b');points.textContent=`${r.score} 分`;row.append(label,points);$('recap').append(row)});renderSwapReview();$('again').onclick=()=>start();setBusy(false);$('again').focus();
}
function renderReferences(container,q,all=false){
 container.replaceChildren();
 const perfect=document.createElement('p');perfect.className='perfect-answer';perfect.textContent='100 分参考答案：'+fullScoreAnswers(q).map(a=>a.name).join('、');container.append(perfect);
 const list=document.createElement('div');list.className='reference-list';
 const sorted=[...q.answers].sort((a,b)=>b.score-a.score);for(const a of(all?sorted:sorted.slice(0,4))){const el=document.createElement('div');el.className='reference-item';const text=document.createElement('span');text.textContent=a.name+' · '+a.score+' 分';el.append(text,createVoteControls(q,{kind:'reference',answer:a.name,score:a.score}));list.append(el)}container.append(list);
}
function replaceCurrent(){
 if(busy||locked||swapped.length>=2||$('play').hidden)return;
 syncHistory();const old=questions[index];remember(old);const replacement=chooseReplacement(availableBank(),questions,swapped,seen,seenTitles);
 if(!replacement){notice('暂时没有可换的新题，换题次数未扣除。',true);return}
 try{const titles=savedList('deepcut-swapped-v1').filter(t=>t!==old.title);titles.push(old.title);localStorage.setItem('deepcut-swapped-v1',JSON.stringify(titles.slice(-28)))}catch{}swapped.push(old);questions[index]=replacement;render();
 $('replaced-title').textContent=old.title;
 $('swap-description').textContent='原题不计分，当前题号不变。本轮还可换题 '+(2-swapped.length)+' 次。以下为原题参考答案（非穷举）。';
 renderReferences($('replaced-answers'),old,true);$('replacement-dialog').showModal();$('continue-replacement').focus();
}
function renderSwapReview(){
 if(!swapped.length)return;
 const details=document.createElement('details');details.className='swap-review';const summary=document.createElement('summary');summary.textContent='回看已更换的 '+swapped.length+' 道题及答案（不计分）';details.append(summary);
 for(const q of swapped){const title=document.createElement('h3');title.textContent=q.title;const answers=document.createElement('div');answers.className='examples';renderReferences(answers,q,true);details.append(title,answers)}
 $('recap').after(details);
}
$('swap').onclick=replaceCurrent;
$('continue-replacement').onclick=()=>$('replacement-dialog').close();
$('replacement-dialog').addEventListener('close',()=>$('answer').focus());
$('form').onsubmit=e=>{e.preventDefault();void submit($('answer').value)};
$('skip').onclick=()=>{if(!busy)finish(null)};
$('help').onclick=()=>$('rules').showModal();$('close').onclick=$('gotit').onclick=()=>$('rules').close();
$('ai-round').onclick=async()=>{
 if(busy)return;syncHistory();setBusy(true);$('ai-status').textContent='正在生成 7 道新题；若有重复会自动补生成，最多约两分钟…';
 if($('again'))$('again').disabled=true;
 try{const blocked=readFeedback(localStorage).filter(r=>r.kind==='question'&&r.vote===-1).map(r=>r.question);const exclude=[...new Set([...seenTitles,...savedList('deepcut-swapped-v1'),...bank.filter(q=>seen.includes(q.id)).map(q=>q.title),...questions.map(q=>q.title),...blocked])].slice(-2000);const data=await api('round',{exclude});setBusy(false);const accepted=eligibleQuestions(data.questions,readFeedback(localStorage));if(accepted.length!==7)throw Error('AI 生成了已屏蔽的题目，请重试。');start(accepted);const fallback=accepted.filter(q=>q.roundFallback).length;$('ai-status').textContent=fallback?`本轮已就绪 · AI 新题 ${7-fallback} 道，题库补充 ${fallback} 道（已过滤重复题）`:'AI 新题已就绪 · 评分为估计值'}
 catch(e){$('ai-status').textContent=e.name==='TimeoutError'?'生成超时，原有游戏已保留。':e.message}
 finally{setBusy(false);if($('again'))$('again').disabled=false}
};
const restore=document.createElement('button');restore.className='quiet';restore.textContent='恢复屏蔽题目';$('export-feedback').before(restore);restore.onclick=()=>{try{const count=restoreBlockedQuestions();$('feedback-storage-note').textContent=`已恢复 ${count} 道题的后续抽题资格。`}catch{$('feedback-storage-note').textContent='恢复失败，请允许本地存储后重试。'}};
$('export-feedback').onclick=()=>{const count=exportFeedback();$('feedback-storage-note').textContent=`已导出 ${count} 条反馈；反馈不会自动修改分数。`};
$('bank-count').textContent=`${bank.length} 道题 · 优先未玩过`;
start();
if(hasGameAPI){
 gameFetch('/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.ok?r.json():null).then(data=>{
  aiAvailable=!!data?.enabled;$('ai-judge').disabled=!aiAvailable;$('ai-judge').checked=aiAvailable;
  $('ai-status').textContent=aiAvailable?`${isLocalAPI?'本机':'在线'} AI 已连接 · 调用间隔至少 ${data.minIntervalSeconds} 秒 · 无每日上限`:'AI 未配置，题库模式仍可使用';setBusy(false);
 }).catch(()=>{$('ai-status').textContent='题库模式 · AI 服务未启动'});
}else{$('ai-status').textContent='题库模式 · 在线 AI 尚未部署'}
const context=document.modelContext??navigator.modelContext;
if(context?.registerTool){const tools=[
 {name:'get_game_state',description:'Read the current question, score and AI availability.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{}},execute:async()=>({question:$('play').hidden?null:questions[index].title,round:index+1,answered:locked,busy,aiAvailable,swapsRemaining:2-swapped.length,records})},
 {name:'submit_answer',description:'Submit one answer. If AI judging is enabled, an unknown answer is sent to DeepSeek for assessment.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{answer:{type:'string',maxLength:120}},required:['answer']},execute:async({answer})=>submit(answer)}
 ];for(const tool of tools)try{Promise.resolve(context.registerTool(tool)).catch(()=>{})}catch{}}
