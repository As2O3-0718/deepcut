// A question-relative scale: every question has an attainable 100-point reference.
export const SCORING_VERSION=2;
export function calibrateQuestion(q){
 const maximum=Math.max(...q.answers.map(a=>a.score));
 if(!Number.isFinite(maximum)||maximum<10||maximum>100)throw new Error('Invalid reference scores');
 return {...q,scoreVersion:SCORING_VERSION,answers:q.answers.map(a=>({...a,score:maximum===100?a.score:maximum===10?100:Math.round(10+(a.score-10)*90/(maximum-10))}))};
}
export function fullScoreAnswers(q){return q.answers.filter(a=>a.score===100)}
