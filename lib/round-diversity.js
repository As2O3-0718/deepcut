const groups=[
 ['影视',/电影|动画|影视|镜头|摄影/],['游戏',/游戏|桌游/],['文学',/文学|戏剧|诗歌/],['音乐',/音乐|乐器|演奏/],['地理',/地理|地貌/],['自然',/动物|植物|生物|自然/],['建筑',/建筑/],['工艺',/工艺|纺织/],['交通',/铁路|航海|交通/],['科学',/天文|航天|数学|计算机|物理|化学|科学/],['语言',/语言|文字|书写/]
];
export function categoryGroup(q){return groups.find(([,pattern])=>pattern.test(q.category))?.[0]||q.category.trim().toLowerCase()}
export function selectDiverseRound(pool){
 const buckets=new Map();for(const q of pool){const key=categoryGroup(q);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(q)}
 const selected=[];for(let layer=0;layer<2;layer++)for(const bucket of buckets.values()){if(bucket[layer])selected.push(bucket[layer]);if(selected.length===7)return selected}return selected;
}
export function hasRoundDiversity(questions){const counts=new Map();for(const q of questions){const key=categoryGroup(q);counts.set(key,(counts.get(key)||0)+1)}return questions.length===7&&counts.size>=5&&[...counts.values()].every(n=>n<=2)}
