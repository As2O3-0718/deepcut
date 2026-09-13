import {calibrateQuestion,normalizeQuestionWording} from './scoring.js';
import generated from './generated.js';
// Each row: Chinese canonical answer | English / accepted aliases. Order is curated from familiar to uncommon.
const make=(category,title,hint,rows)=>({category,title,hint,answers:rows.split(';').map((row,i,all)=>{const [name,...aliases]=row.split('|');return{name,aliases,score:Math.round(10+90*i/(all.length-1))}})});
const original=[
make('地理 · GEOGRAPHY','说出一个南美洲的主权国家。','按通常地理划分；不包括海外属地。','巴西|Brazil;阿根廷|Argentina;智利|Chile;秘鲁|Peru;哥伦比亚|Colombia;委内瑞拉|Venezuela;厄瓜多尔|Ecuador;乌拉圭|Uruguay;玻利维亚|Bolivia;巴拉圭|Paraguay;圭亚那|Guyana;苏里南|Suriname'),
make('天文 · SPACE','说出一颗太阳系的行星。','使用八大行星定义；中文或英文名称均可。','地球|Earth;火星|Mars;木星|Jupiter;土星|Saturn;金星|Venus;水星|Mercury;海王星|Neptune;天王星|Uranus'),
make('文学 · LITERATURE','说出一位「唐宋八大家」。','填写姓名即可。','苏轼|苏东坡|Su Shi;韩愈|Han Yu;柳宗元|Liu Zongyuan;欧阳修|Ouyang Xiu;王安石|Wang Anshi;苏洵|Su Xun;苏辙|Su Zhe;曾巩|Zeng Gong'),
make('文化 · CULTURE','说出一个中国传统节气。','二十四节气中的任意一个。','清明|Qingming;冬至|Dongzhi;立春|Lichun;夏至|Xiazhi;立秋|Liqiu;立夏|Lixia;立冬|Lidong;大寒|Dahan;小寒|Xiaohan;大暑|Dashu;小暑|Xiaoshu;春分|Chunfen;秋分|Qiufen;惊蛰|Jingzhe;雨水|Yushui;谷雨|Guyu;霜降|Shuangjiang;白露|Bailu;大雪|Daxue;小雪|Xiaoxue;处暑|Chushu;寒露|Hanlu;芒种|Mangzhong;小满|Xiaoman'),
make('科学 · SCIENCE','说出一种原子序数不超过 20 的元素。','可输入元素名称、英文名或化学符号。','氧|O|Oxygen;氢|H|Hydrogen;碳|C|Carbon;氮|Nitrogen|N;氦|He|Helium;钙|Ca|Calcium;钠|Na|Sodium;氯|Cl|Chlorine;铝|Al|Aluminium|Aluminum;硅|Si|Silicon;镁|Mg|Magnesium;硫|S|Sulfur;磷|P|Phosphorus;钾|K|Potassium;氖|Ne|Neon;锂|Li|Lithium;氟|F|Fluorine;氩|Ar|Argon;硼|B|Boron;铍|Be|Beryllium'),
make('美食 · FOOD','说出一个中国传统八大菜系。','输入菜系名称，或对应省份。','川菜|四川|Sichuan;粤菜|广东|Cantonese;湘菜|湖南|Hunan;鲁菜|山东|Shandong;苏菜|江苏|Jiangsu;浙菜|浙江|Zhejiang;闽菜|福建|Fujian;徽菜|安徽|Anhui'),
make('地理 · GEOGRAPHY','说出一个与中国陆地接壤的国家。','仅计算陆地邻国，不含隔海相望的国家。','俄罗斯|Russia;印度|India;朝鲜|North Korea;蒙古|Mongolia;越南|Vietnam;巴基斯坦|Pakistan;缅甸|Myanmar|Burma;尼泊尔|Nepal;哈萨克斯坦|Kazakhstan;老挝|Laos;阿富汗|Afghanistan;不丹|Bhutan;吉尔吉斯斯坦|Kyrgyzstan;塔吉克斯坦|Tajikistan'),
make('文化 · CULTURE','说出一个十二生肖中的动物。','请输入生肖的单字名称或英文。','龙|Dragon;虎|Tiger;兔|Rabbit;鼠|Rat|Mouse;牛|Ox;马|Horse;蛇|Snake;猴|Monkey;狗|Dog;猪|Pig;羊|Goat|Sheep;鸡|Rooster|Chicken'),
make('地理 · GEOGRAPHY','说出一个非洲国土面积前十的国家。','按国家总面积排序；不计海外属地。','埃塞俄比亚|Ethiopia;南非|South Africa;阿尔及利亚|Algeria;苏丹|Sudan;刚果民主共和国|刚果金|DR Congo|Democratic Republic of the Congo;利比亚|Libya;乍得|Chad;尼日尔|Niger;安哥拉|Angola;马里|Mali'),
make('文学 · LITERATURE','说出一位「建安七子」。','填写姓名。','孔融|Kong Rong;王粲|Wang Can;陈琳|Chen Lin;刘桢|Liu Zhen;徐干|Xu Gan;阮瑀|Ruan Yu;应玚|Ying Yang'),
make('音乐 · MUSIC','说出一位巴洛克时期作曲家。','本题收录 12 位作曲家；使用姓氏或常用中文译名。','巴赫|Bach|Johann Sebastian Bach;维瓦尔第|Vivaldi;亨德尔|Handel;帕赫贝尔|Pachelbel;蒙特威尔第|Monteverdi;泰勒曼|Telemann;斯卡拉蒂|Scarlatti;普赛尔|Purcell;科雷利|Corelli;拉莫|Rameau;吕利|Lully;库普兰|Couperin'),
make('地理 · GEOGRAPHY','说出一个中美洲国家。','这里指墨西哥以南、哥伦比亚以北的七国。','巴拿马|Panama;哥斯达黎加|Costa Rica;危地马拉|Guatemala;洪都拉斯|Honduras;尼加拉瓜|Nicaragua;萨尔瓦多|El Salvador;伯利兹|Belize'),
make('历史 · HISTORY','说出一个「战国七雄」。','填写国名即可。','秦|秦国|Qin;楚|楚国|Chu;齐|齐国|Qi;赵|赵国|Zhao;魏|魏国|Wei;燕|燕国|Yan;韩|韩国|Han'),
make('地理 · GEOGRAPHY','说出一个加拿大的省或地区。','包括十个省及三个地区。','安大略|安大略省|Ontario;魁北克|魁北克省|Quebec;不列颠哥伦比亚|卑诗省|British Columbia|BC;艾伯塔|阿尔伯塔|Alberta;新斯科舍|Nova Scotia;曼尼托巴|Manitoba;萨斯喀彻温|Saskatchewan;纽芬兰与拉布拉多|Newfoundland and Labrador;新不伦瑞克|New Brunswick;爱德华王子岛|Prince Edward Island;育空|Yukon;西北地区|Northwest Territories;努纳武特|Nunavut'),
make('艺术 · ART','说出一位「文艺复兴三杰」。','本题指美术三杰，填写常用译名即可。','达芬奇|达·芬奇|Leonardo da Vinci|Da Vinci;米开朗基罗|Michelangelo;拉斐尔|Raphael'),
make('科学 · SCIENCE','说出一个 SI 基本单位。','指七个国际单位制基本单位，可输入中文或英文全称。','米|meter|metre;秒|second;千克|公斤|kilogram;安培|ampere;开尔文|kelvin;摩尔|mole;坎德拉|candela'),
make('地理 · GEOGRAPHY','说出一个澳大利亚的州。','只包括六个州，不包括领地。','新南威尔士|新南威尔士州|New South Wales;维多利亚|维多利亚州|Victoria;昆士兰|昆士兰州|Queensland;西澳大利亚|西澳|Western Australia;南澳大利亚|南澳|South Australia;塔斯马尼亚|Tasmania'),
make('文化 · CULTURE','说出一个中国传统「十天干」。','填写一个汉字即可。','甲|Jia;乙|Yi;丙|Bing;丁|Ding;戊|Wu;己|Ji;庚|Geng;辛|Xin;壬|Ren;癸|Gui'),
make('文学 · LITERATURE','说出一位「初唐四杰」。','填写姓名即可。','王勃|Wang Bo;骆宾王|Luo Binwang;卢照邻|Lu Zhaolin;杨炯|Yang Jiong'),
make('地理 · GEOGRAPHY','说出一个中国的自治区。','输入简称或全称均可。','西藏|西藏自治区|Tibet;新疆|新疆维吾尔自治区|Xinjiang;内蒙古|内蒙古自治区|Inner Mongolia;广西|广西壮族自治区|Guangxi;宁夏|宁夏回族自治区|Ningxia'),
make('科学 · SCIENCE','说出一种稀有气体元素。','周期表第 18 族；接受中文、英文或化学符号。','氦|Helium|He;氖|Neon|Ne;氩|Argon|Ar;氪|Krypton|Kr;氙|Xenon|Xe;氡|Radon|Rn;鿫|Oganesson|Og')
];
export const bank=[...original.map((q,i)=>({...q,id:'base-'+i,source:'curated'})),...generated].map(calibrateQuestion);
export const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[\s·・.\-']/g,'');
export function findAnswer(question,value){const key=normalize(value);return key?question.answers.find(a=>[a.name,...a.aliases].some(s=>normalize(s)===key)):undefined;}
export const questionHistoryKey=title=>typeof title!=='string'?'':normalize(normalizeQuestionWording({title}).title).replace(/[，。！？、：；“”「」（）(),!?;:"\s]/g,'');
export function pickRound(source=bank,seen=[],seenTitles=[]){
 const shuffle=items=>{items=[...items];for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]]}return items};
 const known=new Set(seen),titles=new Set(seenTitles.map(questionHistoryKey));const played=q=>known.has(q.id)||titles.has(questionHistoryKey(q.title));const fresh=shuffle(source.filter(q=>!played(q)));const repeats=source.filter(played).sort((a,b)=>seen.indexOf(a.id)-seen.indexOf(b.id));
 return [...fresh,...repeats].slice(0,7);
}

export function chooseReplacement(source,active,replaced,seen=[],seenTitles=[]){
 const excluded=[...active,...replaced];const ids=new Set(excluded.map(q=>q.id));const titles=new Set(excluded.map(q=>q.title));
 return pickRound(source.filter(q=>!ids.has(q.id)&&!titles.has(q.title)),seen,seenTitles)[0];
}
