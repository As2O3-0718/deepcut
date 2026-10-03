import test from 'node:test';import assert from 'node:assert/strict';
import worker,{GameService} from '../cloud/worker.js';
function context(){const data=new Map();let ready;return {data,storage:{get:async k=>data.get(k),put:async values=>{for(const [k,v]of Object.entries(values))data.set(k,structuredClone(v))}},blockConcurrencyWhile:fn=>{ready=fn()},get ready(){return ready}}}
const request=(path,data)=>new Request('https://example.test/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
test('worker CORS permits configured Pages origin only',async()=>{
 const env={ALLOWED_ORIGIN:'https://as2o3-0718.github.io',GAME:{idFromName:x=>x,get:()=>({fetch:async()=>new Response('{}')})}};
 assert.equal((await worker.fetch(new Request('https://api.test'),env)).status,403);
 const r=await worker.fetch(new Request('https://api.test',{method:'OPTIONS',headers:{Origin:env.ALLOWED_ORIGIN}}),env);assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);
});
test('cloud endpoints validate requests and preserve AI state across service restarts',async()=>{
 const ctx=context(),service=new GameService(ctx,{DEEPSEEK_API_KEY:'test'});await ctx.ready;
 assert.equal((await service.fetch(request('round',{exclude:'bad'}))).status,400);
 assert.equal((await service.fetch(request('judge',{questionId:'base-0',answer:'Brazil'}))).status,200);
 service.ai.complete=async()=>({verdict:'invalid',reason:'不属于题目类别。'});
 const first=await service.fetch(request('judge',{questionId:'base-0',answer:'test wrong'}));assert.equal(first.status,200);
 const restarted=new GameService(ctx,{DEEPSEEK_API_KEY:'test'});await ctx.ready;restarted.ai.complete=async()=>{throw Error('must use cache')};
 assert.equal((await restarted.fetch(request('judge',{questionId:'base-0',answer:'test wrong'}))).status,200);
 assert.equal((await restarted.fetch(request('judge',{questionId:'base-0',answer:'different'}))).status,429);
 const large='汉'.repeat(100000);service.ai.dynamic.set('big',{id:'big',title:large,answers:[{name:'a',score:100}]});await service.ai.save();for(const value of ctx.data.values())if(typeof value==='string')assert.ok(Buffer.byteLength(value)<128000);
});
test('cloud incomplete-round responses expose resumable progress and keep it through a durable-service restart',async()=>{
 const ctx=context(),service=new GameService(ctx,{DEEPSEEK_API_KEY:'test'});await ctx.ready;service.ai.minIntervalMs=0;
 const make=(title,category)=>({title,category,hint:'填写一种。',answers:Array.from({length:4},(_,i)=>({name:'例'+i,score:10+i*30,aliases:[]}))});
 const first=['科学','科学','音乐','地理','文学','工艺'].map((category,i)=>make('线上六题'+i,category));service.ai.complete=async()=>({questions:first});
 const response=await service.fetch(request('round',{exclude:['已经玩过的题']})),data=await response.json();assert.equal(response.status,503);assert.equal(data.code,'ROUND_INCOMPLETE');assert.equal(data.generation.accepted,6);assert.equal(data.generation.categories,5);assert.equal(service.ai.dynamic.size,0);
 const restarted=new GameService(ctx,{DEEPSEEK_API_KEY:'test'});await ctx.ready;restarted.ai.minIntervalMs=0;restarted.ai.complete=async()=>({questions:[make('线上第七题','交通')]});
 const next=await restarted.fetch(request('round',{exclude:['已经玩过的题']})),round=await next.json();assert.equal(next.status,200);assert.equal(round.questions.length,7);assert.equal(round.generation.resumed,6);assert.equal(round.generation.attempts,1);
 const health=await(await restarted.fetch(new Request('https://example.test/api/health'))).json();assert.equal(health.generationVersion,2);
});
