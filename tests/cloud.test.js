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
