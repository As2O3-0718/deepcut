const groups=[
 ['影视',/电影|动画|影视|镜头|摄影/],['游戏',/游戏|桌游/],['文学',/文学|戏剧|诗歌/],['音乐',/音乐|乐器|演奏/],['地理',/地理|地貌/],['自然',/动物|植物|生物|自然/],['建筑',/建筑/],['工艺',/工艺|纺织/],['交通',/铁路|航海|交通/],['科学',/天文|航天|数学|计算机|物理|化学|科学/],['语言',/语言|文字|书写/]
];
export function categoryGroup(q){return groups.find(([,pattern])=>pattern.test(q.category))?.[0]||q.category.trim().toLowerCase()}
export function selectDiverseRound(pool){
 const buckets=new Map();for(const q of pool){const key=categoryGroup(q);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(q)}
 const selected=[];for(let layer=0;layer<2;layer++)for(const bucket of buckets.values()){if(bucket[layer])selected.push(bucket[layer]);if(selected.length===7)return selected}return selected;
}
export function hasRoundDiversity(questions){const counts=new Map();for(const q of questions){const key=categoryGroup(q);counts.set(key,(counts.get(key)||0)+1)}return questions.length===7&&counts.size>=5&&[...counts.values()].every(n=>n<=2)}

export const GENERATION_TOPICS=['天文学与航天器','建筑构件与建筑师','桌游机制与独立游戏','文学体裁与戏剧','乐器演奏技法','自然地理地貌','动物行为与植物形态','电影制作与动画技法','传统工艺与纺织','铁路车辆与航海设备','数学概念与计算机历史','语言文字与书写系统'];
export function chooseRoundFocus(questions=[],random=Math.random){
 const topics=[...GENERATION_TOPICS];for(let i=topics.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[topics[i],topics[j]]=[topics[j],topics[i]]}
 const represented=new Set(questions.map(categoryGroup));topics.sort((a,b)=>Number(represented.has(categoryGroup({category:a})))-Number(represented.has(categoryGroup({category:b}))));
 const seen=new Set(),focus=[];for(const topic of topics){const group=categoryGroup({category:topic});if(seen.has(group))continue;seen.add(group);focus.push(topic);if(focus.length===5)break}return focus;
}
