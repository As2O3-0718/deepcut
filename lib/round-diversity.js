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
export function chooseRoundFocus(questions=[],random=Math.random,previousFocus=[]){
 const topics=[...GENERATION_TOPICS];for(let i=topics.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[topics[i],topics[j]]=[topics[j],topics[i]]}
 const represented=new Set(questions.map(categoryGroup)),attempted=new Set(previousFocus.map(category=>categoryGroup({category})));const rank=topic=>Number(represented.has(categoryGroup({category:topic})))*2+Number(attempted.has(categoryGroup({category:topic})));topics.sort((a,b)=>rank(a)-rank(b));
 const seen=new Set(),focus=[];for(const topic of topics){const group=categoryGroup({category:topic});if(seen.has(group))continue;seen.add(group);focus.push(topic);if(focus.length===5)break}return focus;
}

const directionIdeas={
 '科学':['数论中的概念与对象','几何曲线与曲面','天文观测仪器','计算机网络协议','数据结构与压缩方法','光学器件与实验方法'],
 '建筑':['建筑结构与屋顶形式','园林构景手法','桥梁结构形式','建筑装饰构件','建筑测绘术语'],
 '游戏':['桌游中的行动机制','电子游戏中的关卡机制','电子游戏的交互设计术语','传统棋类的规则与棋子','游戏音效与关卡制作方法'],
 '文学':['文学修辞手法','叙事视角与结构','古典诗歌格律术语','戏剧的舞台技法','文学批评流派'],
 '音乐':['打击乐器的演奏方式','乐谱中的速度与表情术语','声乐演唱技法','音乐结构与曲式','合奏编制与乐器部件'],
 '地理':['河流形成的地貌','海岸地貌与海洋地形','冰川地貌','地图投影方法','地下水与岩溶地貌'],
 '自然':['动物的防御行为','植物的种子传播方式','植物叶片与花的形态','动物的共生关系','动物的迁徙和繁殖行为'],
 '影视':['动画的制作流程与技法','电影声音制作术语','灯光布置与摄影器材','纪录片的叙事形式','剪辑与镜头衔接方法'],
 '工艺':['陶瓷装饰技法','金属表面加工技法','木工榫卯与连接方式','纸张制作与装帧工艺','织物染色与纹样制作方法'],
 '交通':['铁路信号与轨道部件','船舶结构与操纵设备','帆船的帆具与索具','航空飞行仪表','车辆动力传动部件'],
 '语言':['语言学的构词方式','语音学中的发音部位与方法','词义变化与借词方式','书写材料与书法工具','语言文字的标注与转写方法']
};
export function roundDirections(focus,attempt=0){return focus.map(category=>{const ideas=directionIdeas[categoryGroup({category})]||[];return{category,ideas:[...ideas.slice(attempt),...ideas.slice(0,attempt)].slice(0,3)}})}
