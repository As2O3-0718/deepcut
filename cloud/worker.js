import {GameAI} from '../lib/game-ai.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  if(origin!==env.ALLOWED_ORIGIN)return json({error:'不允许此来源调用。'},403);
  const headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{const stub=env.GAME.get(env.GAME.idFromName('shared-game'));const response=await stub.fetch(request);const out=new Response(response.body,response);for(const [key,value]of Object.entries(headers))out.headers.set(key,value);return out}
  catch{return new Response(JSON.stringify({error:'AI 服务暂时不可用，请稍后重试。'}),{status:503,headers:{...headers,'Content-Type':'application/json'}})}
 }
};
export class GameService {
 constructor(ctx,env){
  this.ai=new GameAI({key:env.DEEPSEEK_API_KEY,model:env.DEEPSEEK_MODEL,persistence:{read:async()=>{const count=await ctx.storage.get('parts');if(!count)return null;const chunks=await Promise.all(Array.from({length:count},(_,i)=>ctx.storage.get('game-'+i)));return JSON.parse(chunks.join(''))},write:async data=>{const raw=JSON.stringify(data),entries={parts:Math.ceil(raw.length/24000)};for(let i=0;i<entries.parts;i++)entries['game-'+i]=raw.slice(i*24000,(i+1)*24000);await ctx.storage.put(entries)}}});
  ctx.blockConcurrencyWhile(()=>this.ai.load());
 }
 async fetch(request){
  const path=new URL(request.url).pathname;
  try{
   if(path==='/api/health'&&request.method==='GET')return json({enabled:!!this.ai.key,minIntervalSeconds:this.ai.minIntervalMs/1000});
   if(!['/api/round','/api/judge','/api/review'].includes(path))return json({error:'接口不存在。'},404);
   if(request.method!=='POST'||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'需要 JSON POST 请求。'},405);
   let raw='',size=0;const decoder=new TextDecoder();for await(const chunk of request.body||[]){size+=chunk.byteLength;if(size>64000)return json({error:'请求过长。'},413);raw+=decoder.decode(chunk,{stream:true})}
   raw+=decoder.decode();let data;try{data=JSON.parse(raw)}catch{return json({error:'JSON 格式不正确。'},400)}
   if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'请求格式不正确。'},400);
   if(!this.ai.key)return json({error:'AI 密钥尚未配置。'},503);
   if(path==='/api/round'){
    if(data.exclude!==undefined&&(!Array.isArray(data.exclude)||data.exclude.length>2000||data.exclude.some(x=>typeof x!=='string'||x.length>200)))return json({error:'题目记录格式不正确。'},400);
    return json({questions:await this.ai.round(data.exclude)});
   }
   if(typeof data.questionId!=='string'||data.questionId.length>100)return json({error:'缺少题目编号。'},400);
   return json(path==='/api/judge'?await this.ai.judge(data.questionId,data.answer):await this.ai.review(data));
  }catch(e){return json({error:e.status?e.message:'服务暂时不可用，请重试。'},e.status||503)}
 }
}
