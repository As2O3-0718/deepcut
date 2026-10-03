import {hasGameAPI,isLocalAPI,gameFetch} from './api-client.js';
import {eligibleQuestions,readFeedback} from './feedback-data.js';
import {createVoteControls,exportFeedback,restoreBlockedQuestions} from './feedback-ui.js';
import {knownInvalidAnswer} from './eligibility.js';
import {fullScoreAnswers} from './scoring.js';
import {bank,findAnswer,pickRound,chooseReplacement,mergeHistory,avoidRecentSwaps} from './bank.js';
import {createSessionStore} from './session-state.js';
import {THEMES,themeFor,themeQuestions,scoreBand,newDiveId,readDiveLog,recordDive,diveStats,shareDive} from './dive-log.js';
const $=id=>document.getElementById(id);
let questions=[],index=0,records=[],locked=false,busy=false,aiAvailable=false;
let swapped=[];
let activeTheme='all',diveMode='bank',diveId='';
for(const theme of THEMES){const option=document.createElement('option');option.value=theme.id;option.textContent=`${theme.name} · ${themeQuestions(bank,theme.id).length} 题`;$('theme-select').append(option)}
$('theme-select').value='all';
let sessionStore;
try{sessionStore=createSessionStore(localStorage,{bank})}catch{sessionStore=createSessionStore({getItem(){throw Error('Storage unavailable')}},{bank})}
const sessionNote=document.createElement('p');sessionNote.className='hint';sessionNote.hidden=true;
const sessionMessage=document.createElement('span'),sessionRestart=document.createElement('button');sessionRestart.type='button';sessionRestart.className='quiet';sessionRestart.textContent='重新开局';sessionRestart.hidden=true;sessionNote.append(sessionMessage,' ',sessionRestart);$('play').before(sessionNote);
sessionRestart.onclick=()=>start();
function saveSession(){
 if(!questions.length)return;
 if(!sessionStore.save({questions,index,records,swapped,locked,complete:!$('results').hidden,draft:locked?'':$('answer').value.slice(0,120),theme:activeTheme,mode:diveMode,diveId})){sessionMessage.textContent='浏览器未能保存当前对局，刷新后可能丢失进度。';sessionNote.hidden=false}
}
let seen=[];let seenTitles=[];
try{const saved=JSON.parse(localStorage.getItem("deepcut-titles-v2")||"[]");if(Array.isArray(saved))seenTitles=saved.filter(x=>typeof x==="string").slice(-2000)}catch{}
try{const saved=JSON.parse(localStorage.getItem('deepcut-seen-v2')||'[]');if(Array.isArray(saved))seen=saved.filter(x=>typeof x==='string').slice(-2000)}catch{}
function savedList(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}catch{return[]}}
function syncHistory(){seen=mergeHistory(seen,savedList('deepcut-seen-v2'));seenTitles=mergeHistory(seenTitles,savedList('deepcut-titles-v2'));}
function remember(q){syncHistory();seenTitles=seenTitles.filter(x=>x!==q.title);seenTitles.push(q.title);seenTitles=seenTitles.slice(-2000);seen=seen.filter(x=>x!==q.id);seen.push(q.id);seen=seen.slice(-2000);try{localStorage.setItem('deepcut-titles-v2',JSON.stringify(seenTitles));localStorage.setItem('deepcut-seen-v2',JSON.stringify(seen))}catch{$('feedback-storage-note').textContent='浏览器未能保存已玩记录，刷新后可能重复出题。请允许本地存储。'}}
window.addEventListener('storage',syncHistory);
function setBusy(value){busy=value;sessionRestart.disabled=value;$('theme-start').disabled=value;$('theme-select').disabled=value;$('answer').disabled=value||locked;$('submit').disabled=value||locked;$('skip').disabled=value;$('swap').disabled=value||locked||swapped.length>=2;$('swap').textContent=`换题（剩 ${2-swapped.length}/2）`; $('ai-round').disabled=value||!aiAvailable||(records.length>0||swapped.length>0)&&!$('play').hidden;$('submit').textContent=value?'AI 正在判断…':'下潜验证 ↓'}
function notice(text,error=false){$('feedback').className='';const p=document.createElement('p');p.className=error?'error':'hint';p.textContent=text;$('feedback').replaceChildren(p)}
async function api(path,body){
 const response=await gameFetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(path==='round'?185000:60000)});
 let data;try{data=await response.json()}catch{throw new Error('AI 服务暂时不可用，请重试或跳过。')}
 if(!response.ok)throw new Error(data.error||'AI 暂时不可用，请重试或跳过。');return data;
}
function availableBank(){try{return eligibleQuestions(bank,readFeedback(localStorage))}catch{return bank}}
function start(next,{theme=activeTheme,mode='bank'}={}){
 if(busy)return;syncHistory();if(!next){const eligible=themeQuestions(availableBank(),theme);const filtered=avoidRecentSwaps(eligible,savedList('deepcut-swapped-v1'));const pool=filtered.length>=7?filtered:eligible;if(pool.length<7){$('theme-note').textContent='此主题可用题目不足七题，请换一个主题或恢复已屏蔽题目。原对局已保留。';return}next=pickRound(pool,seen,seenTitles)}
 activeTheme=themeFor(theme).id;diveMode=mode;diveId=newDiveId();questions=next;index=0;records=[];swapped=[];locked=false;sessionNote.hidden=true;sessionRestart.hidden=true;$('results').hidden=true;$('play').hidden=false;$('theme-select').value=activeTheme;$('theme-note').textContent=diveMode==='ai'?'已开启 AI 综合探索。':`已开启「${themeFor(activeTheme).name}」· ${themeFor(activeTheme).subtitle}`;render();
}
function renderProgress(){
 $('progress').innerHTML=questions.map((_,i)=>{const score=records[i]?.score,band=score===undefined?null:scoreBand(score);return `<span class="${band?band.className:i===index?'current':''}" aria-label="第 ${i+1} 题${band?'，'+score+' 分':i===index?'，当前题':'，未作答'}" title="第 ${i+1} 题${band?' · '+score+' 分':''}"></span>`}).join('');
}
function render({persist=true}={}){
 locked=false;const q=questions[index];remember(q);
 $('round').textContent=`第 ${String(index+1).padStart(2,'0')} / 07 题`;$('total').textContent=records.reduce((s,r)=>s+r.score,0);
 $('dive-mode').textContent=diveMode==='ai'?'✦ AI 综合探索':themeFor(activeTheme).name;renderProgress();
 $('category').textContent=q.category+(q.source==='ai'?' · AI 题目':'');$('question').textContent=q.title;$('hint').textContent=q.hint;$('question-votes').replaceChildren(createVoteControls(q));
 $('answer').value='';$('skip').hidden=false;$('swap').hidden=false;$('feedback').replaceChildren();$('feedback').className='';setBusy(false);if(index>0)$('answer').focus();
 if(persist)saveSession();
}
async function submit(value,{recheck=false}={}){
 if(busy||locked)return{error:'请先完成当前操作。'};
 if(typeof value!=='string'||!value.trim()||value.length>120){notice('请输入120字以内的答案。',true);return{recognized:false}}
 const q=questions[index];const correction=knownInvalidAnswer(q,value);if(correction){notice(correction.reason+' 请更换答案，本次不计分。',true);return{recognized:false}}
 const match=findAnswer(q,value);
 if(match){finish(match,{source:q.source});return{recognized:true,answer:match.name,score:match.score}}
 if(!aiAvailable||!$('ai-judge').checked){notice('题库未收录这个答案。可以换个名称或其他答案；本次不扣分。',true);return{recognized:false}}
 setBusy(true);notice('正在请 AI 检查答案和题目条件…');
 try{
  const result=await api('judge',{questionId:q.id,answer:value,recheck});
  if(result.verdict==='valid'){
    finish({name:result.name,score:result.score},{source:'live-ai',reason:result.reason});return{recognized:true,answer:result.name,score:result.score};
  }
  notice((result.verdict==='uncertain'?'AI 暂时无法确认：':'AI 认为不符合题意：')+result.reason+' 你可以换一个答案，或跳过本题。',true);$('feedback').append(createVoteControls(q,{kind:'judgment',answer:value,score:null,reason:result.reason}));const retry=document.createElement('button');retry.type='button';retry.className='quiet';retry.textContent='重新判定（1 次 AI 调用）';retry.onclick=()=>submit($('answer').value,{recheck:true});$('feedback').append(retry);return{recognized:false};
 }catch(e){notice(e.name==='TimeoutError'?'AI 等待超时，请重试或跳过。':e.message,true);return{recognized:false}}
 finally{setBusy(false)}
}
function finish(match,{source,reason}={}){
 if(locked)return;locked=true;const q=questions[index];const record={question:q.title,answer:match?.name??'跳过',score:match?.score??0,source:match?(source==='live-ai'?'live-ai':'reference'):'skip',reason:reason||''};records.push(record);renderAnswered(record);saveSession();
}
function renderAnswered(record){
 locked=true;const q=questions[index],match=record.source==='skip'?null:{name:record.answer,score:record.score},source=record.source,reason=record.reason;
 $('answer').value=match?.name??'';$('total').textContent=records.reduce((s,r)=>s+r.score,0);renderProgress();$('skip').hidden=true;$('swap').hidden=true;setBusy(busy);
 const score=match?.score??0,feedback=$('feedback');feedback.className='feedback';
 feedback.innerHTML=`<div class="scoreline"><div><div class="category">${scoreBand(score).mark} ${scoreBand(score).label}</div><h2 id="answer-name"></h2></div><div class="score">+${score}<small>分</small></div></div><div class="meter"><div style="width:${score}%"></div></div><p id="explanation"></p><p id="score-note"></p><div class="examples"></div><button class="primary" id="next">${index===6?'查看本轮成绩':'继续下潜 →'}</button>`;
 $('answer-name').textContent=match?.name??'已跳过';$('explanation').textContent=reason||'本题的其他参考答案：';
 $('score-note').textContent='100分为本题参考答案中最冷门的档位，不代表真实玩家统计。 '+(source==='live-ai'?'AI 判定及冷门估计可能有误；可点踩并请求复核。':q.source==='ai'?'本题由 AI 生成并经 AI 复核，尚非人工逐条核验；分数为冷门估计。':'冷门度为题库预设分值。');
 if(match)$('explanation').after(createVoteControls(q,{kind:'judgment',answer:match.name,score:match.score,reason:reason||'题库参考分值'}));
 renderReferences(feedback.querySelector('.examples'),q);
 $('next').onclick=next;$('next').focus();
}
function next(){if(!locked||busy)return;if(index<6){index++;render()}else showResults()}
function showResults(){
 $('play').hidden=true;$('results').hidden=false;$('round').textContent='本轮下潜完成';renderProgress();
 const total=records.reduce((s,r)=>s+r.score,0);
 $('results').innerHTML=`<div class="category">DIVE COMPLETE · ${records.filter(r=>r.score>0).length} / 7 题已答对</div><h2>${total>=500?'你找到了深海宝藏。':total>=300?'你有自己的思考航线。':'海很大，继续探索。'}</h2><div class="resultscore">${total}<small> / 700 分</small></div><div class="score-cells" id="score-cells" aria-label="七题成绩"></div><p class="hint" id="log-save-note" role="status"></p><div class="result-actions"><button class="quiet" id="share-score" type="button">复制成绩 · 不含答案</button><button class="quiet" id="result-log" type="button">查看潜水日志 ↗</button></div><p class="hint" id="share-status" role="status"></p><textarea id="share-text" aria-label="可复制的成绩" readonly hidden></textarea><div id="recap"></div><button class="primary" id="again">再潜一轮 ↻</button><p class="hint" style="text-align:center;margin:14px 0 0">优先抽取本机没玩过的题目 · ${themeFor(activeTheme).name}</p>`;
 records.forEach((r,i)=>{const cell=document.createElement('span'),band=scoreBand(r.score);cell.className='score-cell '+band.className;cell.textContent=String(r.score);cell.title=`第 ${i+1} 题 · ${band.label}`;$('score-cells').append(cell)});
 try{recordDive(localStorage,{id:diveId,theme:activeTheme,mode:diveMode,completedAt:Date.now(),scores:records.map(r=>r.score)});$('log-save-note').textContent='本轮已记入潜水日志 · '+records.filter(r=>r.score===100).length+' 个满分答案'}catch{$('log-save-note').textContent='本轮成绩未能存入日志，请允许浏览器本地存储。'}
 $('share-score').onclick=async()=>{const text=shareDive({scores:records.map(r=>r.score),theme:activeTheme,mode:diveMode});try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(text);$('share-status').textContent='成绩已复制，可以粘贴分享。'}catch{$('share-text').hidden=false;$('share-text').value=text;$('share-text').focus();$('share-text').select();$('share-status').textContent='无法自动复制，请选中下方文字后复制。'}};
 $('result-log').onclick=openLog;
 records.forEach((r,i)=>{const row=document.createElement('div');row.className='resultrow';const label=document.createElement('span');label.textContent=`${i+1}. ${r.question} ${r.answer}`;const points=document.createElement('b');points.textContent=`${r.score} 分`;row.append(label,points);$('recap').append(row)});renderSwapReview();$('again').onclick=()=>start();setBusy(false);$('again').focus();saveSession();
}
function renderReferences(container,q,all=false){
 container.replaceChildren();
 const perfect=document.createElement('p');perfect.className='perfect-answer';perfect.textContent='100 分参考答案：'+fullScoreAnswers(q).map(a=>a.name).join('、');container.append(perfect);
 const list=document.createElement('div');list.className='reference-list';
 const sorted=[...q.answers].sort((a,b)=>b.score-a.score);for(const a of(all?sorted:sorted.slice(0,4))){const el=document.createElement('div');el.className='reference-item';const text=document.createElement('span');text.textContent=a.name+' · '+a.score+' 分';el.append(text,createVoteControls(q,{kind:'reference',answer:a.name,score:a.score}));list.append(el)}container.append(list);
 if(!all&&sorted.length>4){const details=document.createElement('details'),summary=document.createElement('summary'),more=document.createElement('div');details.className='more-answers';summary.textContent=`展开其余 ${sorted.length-4} 个参考答案`;more.className='reference-list';details.append(summary,more);details.addEventListener('toggle',()=>{if(!details.open||more.children.length)return;for(const a of sorted.slice(4)){const item=document.createElement('div'),label=document.createElement('span');item.className='reference-item';label.textContent=a.name+' · '+a.score+' 分';item.append(label,createVoteControls(q,{kind:'reference',answer:a.name,score:a.score}));more.append(item)}});container.append(details)}
}
function replaceCurrent(){
 if(busy||locked||swapped.length>=2||$('play').hidden)return;
 syncHistory();const old=questions[index];remember(old);const replacement=chooseReplacement(themeQuestions(availableBank(),activeTheme),questions,swapped,seen,seenTitles);
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
$('theme-start').onclick=()=>{const previous=diveId;start(undefined,{theme:$('theme-select').value});if(diveId!==previous){$('theme-menu').open=false;$('answer').focus()}};
$('theme-select').onchange=()=>{$('theme-note').textContent=`${themeFor($('theme-select').value).subtitle} · 点击开始会开启新局，当前进度将替换。`};
$('continue-replacement').onclick=()=>$('replacement-dialog').close();
$('replacement-dialog').addEventListener('close',()=>$('answer').focus());
$('form').onsubmit=e=>{e.preventDefault();void submit($('answer').value)};
$('answer').addEventListener('input',saveSession);
$('skip').onclick=()=>{if(!busy)finish(null)};
$('help').onclick=()=>$('rules').showModal();$('close').onclick=$('gotit').onclick=()=>$('rules').close();
$('ai-round').onclick=async()=>{
 if(busy)return;syncHistory();setBusy(true);$('ai-status').textContent='正在生成 7 道新题；自动补齐缺少类别，最多 3 次调用、约三分钟…';
 if($('again'))$('again').disabled=true;
 try{const blocked=readFeedback(localStorage).filter(r=>r.kind==='question'&&r.vote===-1).map(r=>r.question);const exclude=[...new Set([...seenTitles,...savedList('deepcut-swapped-v1'),...bank.filter(q=>seen.includes(q.id)).map(q=>q.title),...questions.map(q=>q.title),...blocked])].slice(-2000);const data=await api('round',{exclude});setBusy(false);const accepted=eligibleQuestions(data.questions,readFeedback(localStorage));if(accepted.length!==7)throw Error('AI 生成了已屏蔽的题目，请重试。');start(accepted,{theme:'all',mode:'ai'});const fallback=accepted.filter(q=>q.roundFallback).length;$('ai-status').textContent=fallback?`本轮已就绪 · AI 新题 ${7-fallback} 道，题库补充 ${fallback} 道（已过滤重复题）`:'AI 新题已就绪 · 评分为估计值'}
 catch(e){$('ai-status').textContent=e.name==='TimeoutError'?'生成超时，原有游戏已保留。':e.message}
 finally{setBusy(false);if($('again'))$('again').disabled=false}
};
const restore=document.createElement('button');restore.className='quiet';restore.textContent='恢复屏蔽题目';$('export-feedback').before(restore);restore.onclick=()=>{try{const count=restoreBlockedQuestions();$('feedback-storage-note').textContent=`已恢复 ${count} 道题的后续抽题资格。`}catch{$('feedback-storage-note').textContent='恢复失败，请允许本地存储后重试。'}};
$('export-feedback').onclick=()=>{try{const count=exportFeedback();$('feedback-storage-note').textContent=`已导出 ${count} 条赞／踩反馈及本机复核历史。`}catch{$('feedback-storage-note').textContent='导出失败，请允许本地存储后重试。'}};
$('bank-count').textContent=`${bank.length} 道题 · 优先未玩过`;
function openLog(){
 const container=$('log-content');container.replaceChildren();
 try{const rows=readDiveLog(localStorage),stats=diveStats(rows),grid=document.createElement('div');grid.className='log-stats';for(const [label,value]of[['完成对局',stats.count],['最高分',stats.best],['平均分',stats.average],['满分答案',stats.gems]]){const cell=document.createElement('div'),number=document.createElement('b'),text=document.createElement('span');number.textContent=String(value);text.textContent=label;cell.append(number,text);grid.append(cell)}container.append(grid);if(!rows.length){const empty=document.createElement('p');empty.textContent='完成第一轮七题，你的足迹就会出现在这里。';container.append(empty)}for(const row of[...rows].reverse()){const item=document.createElement('div'),label=document.createElement('span'),score=document.createElement('b');item.className='log-row';label.textContent=new Date(row.completedAt).toLocaleString('zh-CN')+' · '+(row.mode==='ai'?'AI 综合探索':themeFor(row.theme).name);score.textContent=row.scores.reduce((s,n)=>s+n,0)+' / 700';item.append(label,score);container.append(item)}}catch{const error=document.createElement('p');error.textContent='无法读取潜水日志，请允许浏览器本地存储后重试。';container.append(error)}$('dive-log-dialog').showModal();$('close-log').focus();
}
$('open-log').onclick=openLog;$('close-log').onclick=$('log-done').onclick=()=>$('dive-log-dialog').close();
const savedSession=sessionStore.load();
if(savedSession.snapshot){
 const snapshot=savedSession.snapshot;questions=snapshot.questions;index=snapshot.index;records=snapshot.records;swapped=snapshot.swapped;activeTheme=snapshot.theme;diveMode=snapshot.mode;diveId=snapshot.diveId;$('theme-select').value=activeTheme;$('results').hidden=true;$('play').hidden=false;render({persist:false});
 if(snapshot.locked)renderAnswered(records[index]);else $('answer').value=snapshot.draft;
 if(snapshot.complete)showResults();
 sessionMessage.textContent=snapshot.complete?'已恢复上次完成的对局成绩。':'已恢复 24 小时内的对局，题目、分数和换题次数已保留。';sessionRestart.hidden=false;sessionNote.hidden=false;
}else{
 start();
 if(savedSession.status==='invalid'){sessionMessage.textContent='旧对局已过期或数据不完整，已为你重新开局。';sessionNote.hidden=false}
}
if(hasGameAPI){
 gameFetch('/api/health',{signal:AbortSignal.timeout(3000)}).then(r=>r.ok?r.json():null).then(data=>{
  aiAvailable=!!data?.enabled;$('ai-judge').disabled=!aiAvailable;$('ai-judge').checked=aiAvailable;
  $('ai-status').textContent=aiAvailable?`${isLocalAPI?'本机':'在线'} AI 已连接 · 调用间隔至少 ${data.minIntervalSeconds} 秒 · 无每日上限`:'AI 未配置，题库模式仍可使用';setBusy(false);
 }).catch(()=>{$('ai-status').textContent='题库模式 · AI 服务未启动'});
}else{$('ai-status').textContent='题库模式 · 在线 AI 尚未部署'}
const context=document.modelContext??navigator.modelContext;
if(context?.registerTool){const tools=[
 {name:'get_game_state',description:'Read the current question, score and AI availability.',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{}},execute:async()=>({question:$('play').hidden?null:questions[index].title,round:index+1,answered:locked,busy,aiAvailable,swapsRemaining:2-swapped.length,theme:activeTheme,mode:diveMode,records})},
 {name:'submit_answer',description:'Submit one answer. If AI judging is enabled, an unknown answer is sent to DeepSeek for assessment.',annotations:{readOnlyHint:false},inputSchema:{type:'object',properties:{answer:{type:'string',maxLength:120}},required:['answer']},execute:async({answer})=>submit(answer)}
 ];for(const tool of tools)try{Promise.resolve(context.registerTool(tool)).catch(()=>{})}catch{}}
