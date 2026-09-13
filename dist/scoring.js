// A question-relative scale: every question has an attainable 100-point reference.
export const SCORING_VERSION=2;
export function normalizeQuestionWording(q){
 const clean=text=>typeof text!=='string'?text:text
  .replace(/并因此知名/g,'')
  .replace(/、在全球具有较高知名度|且具有较高知名度|、建筑本身具有较高知名度/g,'')
  .replace(/实验名称需在科学史中广为人知/g,'实验需真实存在于科学史中')
  .replace(/仪器需在化学实验室中常见/g,'仪器需用于化学实验室')
  .replace(/不限于龙凤等常见/g,'不限于龙凤等例子')
  .replace(/(?:世界著名|广为人知|知名|著名|常见|热门)(?:的)?/g,'');
 return {...q,...(q.title===undefined?{}:{title:clean(q.title)}),...(q.hint===undefined?{}:{hint:clean(q.hint)})};
}
export function calibrateQuestion(q){
 q=normalizeQuestionWording(q);
 const maximum=Math.max(...q.answers.map(a=>a.score));
 if(!Number.isFinite(maximum)||maximum<10||maximum>100)throw new Error('Invalid reference scores');
 return {...q,scoreVersion:SCORING_VERSION,answers:q.answers.map(a=>({...a,score:maximum===100?a.score:maximum===10?100:Math.round(10+(a.score-10)*90/(maximum-10))}))};
}
export function fullScoreAnswers(q){return q.answers.filter(a=>a.score===100)}
