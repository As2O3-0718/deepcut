export const DIVE_LOG_STORAGE='deepcut-dive-log-v1';
export const THEMES=[
 {id:'all',name:'综合探索',subtitle:'七题，跨越不同领域',pattern:/.*/},
 {id:'geography',name:'环游世界',subtitle:'国家、城市与地理',pattern:/地理/},
 {id:'nature',name:'科学与自然',subtitle:'从原子到星空',pattern:/科学|天文|航天|天体|动物|植物|编程|计算机|软件|操作系统/},
 {id:'culture',name:'文字与文明',subtitle:'文学、语言与历史',pattern:/文学|语言|文化|历史|神话|博物馆/},
 {id:'arts',name:'艺术放映室',subtitle:'电影、音乐与创作',pattern:/艺术|绘画|音乐|电影|摄影|建筑/},
 {id:'games',name:'游戏之间',subtitle:'电子游戏与桌上世界',pattern:/游戏|角色|桌游|棋类|牌类|麻将/},
 {id:'life',name:'生活漫游',subtitle:'美食、运动与交通',pattern:/美食|食材|水果|蔬菜|饮品|体育|交通/}
];
export function themeFor(id){return THEMES.find(t=>t.id===id)||THEMES[0]}
export function themeQuestions(pool,id){const theme=themeFor(id);return pool.filter(q=>theme.pattern.test(q.category))}
export function scoreBand(score){return score===100?{label:'深海宝藏',mark:'💎',className:'gem'}:score>=75?{label:'深海发现',mark:'🟩',className:'rare'}:score>=40?{label:'另辟蹊径',mark:'🟦',className:'uncommon'}:score>0?{label:'正确，继续探索',mark:'⬜',className:'familiar'}:{label:'这一题，留待下次',mark:'⬛',className:'skipped'}}
export function newDiveId(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}
function validDive(value){
 if(!value||typeof value.id!=='string'||!value.id||value.id.length>100||!Number.isSafeInteger(value.completedAt)||value.completedAt<0||value.completedAt>8640000000000000||!['bank','ai'].includes(value.mode)||!THEMES.some(t=>t.id===value.theme)||!Array.isArray(value.scores)||value.scores.length!==7||value.scores.some(s=>!Number.isInteger(s)||s<0||s>100))throw Error('Invalid dive');
 return{id:value.id,completedAt:value.completedAt,mode:value.mode,theme:value.theme,scores:[...value.scores]};
}
export function readDiveLog(storage){
 const raw=storage.getItem(DIVE_LOG_STORAGE);let rows;try{rows=JSON.parse(raw||'[]')}catch{return[]}
 if(!Array.isArray(rows))return[];
 const ids=new Set();return rows.slice(-100).flatMap(row=>{try{const dive=validDive(row);if(ids.has(dive.id))return[];ids.add(dive.id);return[dive]}catch{return[]}});
}
export function recordDive(storage,value){
 const dive=validDive(value),rows=readDiveLog(storage);
 if(rows.some(r=>r.id===dive.id))return false;
 storage.setItem(DIVE_LOG_STORAGE,JSON.stringify([...rows,dive].slice(-100)));return true;
}
export function diveStats(rows){
 const totals=rows.map(r=>r.scores.reduce((s,n)=>s+n,0));
 return{count:rows.length,best:Math.max(0,...totals),average:totals.length?Math.round(totals.reduce((s,n)=>s+n,0)/totals.length):0,gems:rows.reduce((sum,r)=>sum+r.scores.filter(s=>s===100).length,0)};
}
export function shareDive({scores,theme='all',mode='bank'}){
 if(!Array.isArray(scores)||scores.length!==7||scores.some(s=>!Number.isInteger(s)||s<0||s>100))throw Error('Incomplete dive');
 return`潜 · Deepcut ${mode==='ai'?'AI 探索':themeFor(theme).name}\n${scores.reduce((s,n)=>s+n,0)} / 700 分 · ${scores.filter(s=>s>0).length}/7 题答对\n${scores.map(s=>scoreBand(s).mark).join('')}\n💎 ${scores.filter(s=>s===100).length} 个满分答案\nhttps://as2o3-0718.github.io/deepcut/`;
}
