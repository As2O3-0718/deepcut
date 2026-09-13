// Curated factual corrections run before reference matching, AI and cached results.
export function knownInvalidAnswer(question,answer){
 const key=answer.normalize('NFKC').toLowerCase().replace(/[\s·.\-']/g,'');
 if(question.title==='说出一种印欧语系的语言。'&&new Set(['萨米','萨米语','萨阿米语','sami','sámi','saami','samilanguage','samilanguages','北萨米语','northernsami']).has(key)){
  return{verdict:'invalid',reason:'萨米语属于乌拉尔语系，不属于印欧语系，因此不符合本题条件。'};
 }
 return null;
}
