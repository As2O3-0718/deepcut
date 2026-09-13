import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {completeJSON,GENERATE_SYSTEM,validateQuestions} from '../lib/ai.js';
const topics=['中国电影导演及作品','世界动画电影与动画工作室','经典电子游戏与游戏角色','游戏类型与知名系列作品','华语流行音乐与乐队','世界音乐作曲家与乐器','中国古典文学作家与作品','外国文学作家与作品','世界地理与自然景观','中国城市历史与地理','世界建筑与博物馆','动物分类与代表物种','植物与常见食材','航天探测与天体名称','物理化学科学史','数学概念与几何图形','计算机历史与编程语言','体育运动及器材','绘画流派与艺术作品','神话传说与人物','美食烹饪与饮品','交通工具与交通设施','摄影电影技术与术语','桌游棋牌与传统游戏','历史发明与古代文明','语言文字与文字系统'];
await mkdir('.local/batches',{recursive:true});
let index=0;
async function task(){while(index<topics.length){const i=index++;const file=`.local/batches/${i}.json`;
  try{const old=JSON.parse(await readFile(file,'utf8'));validateQuestions(old);console.log(`Batch ${i+1}: reused`);continue}catch{}
  for(let attempt=0;attempt<2;attempt++)try{
    const result=await completeJSON({key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL,system:GENERATE_SYSTEM,user:{topic:topics[i],count:8,requirements:'8个不同主题集合，给每题8个准确参考答案。面向普通中文玩家，兼顾熟悉与小众。中文答案有常见英文则附英文，中文人名无需拼音。'},maxTokens:6500});
    const candidate=validateQuestions(result.questions,{min:6,max:8});
    const review=await completeJSON({key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL,system:GENERATE_SYSTEM+'\n现在执行独立审核：逐题核对题干与答案关系，删除不确定答案，修正错误、歧义和别名。删除不足8个确信正确答案或题目重复的题。不要发明新的事实填补空缺。保留原格式，只返回questions。',user:{questions:candidate},maxTokens:6500});
    const validated=validateQuestions(review.questions,{min:1,max:8});await writeFile(file,JSON.stringify(validated));console.log(`Batch ${i+1}: ${validated.length} reviewed questions`);break;
  }catch(e){console.log(`Batch ${i+1}: attempt ${attempt+1} failed: ${e.name === "Error" ? "Validation error" : e.message}`)}
}}
await Promise.all([task(),task()]);
const out=[];const seen=new Set();for(let i=0;i<topics.length;i++){try{const qs=JSON.parse(await readFile(`.local/batches/${i}.json`,'utf8'));for(const q of qs){const k=q.title.replace(/[\s，。？！、：]/g,'');if(seen.has(k))continue;seen.add(k);out.push({...q,id:`extra-${i}-${qs.indexOf(q)}`,hint:q.hint+' 参考答案非穷举，其他答案可用 AI 判定。'})}}catch{}}
await writeFile('.local/candidate-bank.json',JSON.stringify(out,null,2));console.log(`Finished: ${out.length} extra questions.`);
