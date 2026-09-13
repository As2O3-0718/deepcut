import http from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {GameAI} from './lib/game-ai.js';
const host='127.0.0.1',port=4173,origin=`http://${host}:${port}`;
const ai=new GameAI({key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL});await ai.load();
const files=new Set((await readdir(new URL('./dist/',import.meta.url))).filter(x=>/\.(html|css|js|svg)$/.test(x)));
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
function json(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(data))}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16000)throw Object.assign(new Error('请求过长。'),{status:413})}try{return JSON.parse(text)}catch{throw Object.assign(new Error('请求格式不正确。'),{status:400})}}
http.createServer(async(req,res)=>{
  if(![`${host}:${port}`,`localhost:${port}`].includes(req.headers.host)){json(res,403,{error:'仅允许本机访问。'});return}
  const path=new URL(req.url,origin).pathname;
  try{
    if(path.startsWith('/api/')){
      if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){json(res,403,{error:'不允许跨站调用。'});return}
      if(path==='/api/health'&&req.method==='GET'){json(res,200,{enabled:!!ai.key,dailyLimit:ai.dailyLimit});return}
      if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){json(res,405,{error:'需要JSON POST请求。'});return}
      if(!ai.key){json(res,503,{error:'尚未配置 DeepSeek 密钥。'});return}
      const data=await body(req);
      if(!data||typeof data!=='object'||Array.isArray(data)){json(res,400,{error:'请求必须是JSON对象。'});return}
      if(path==='/api/round'){
        if(data.exclude!==undefined&&(!Array.isArray(data.exclude)||data.exclude.length>100||data.exclude.some(s=>typeof s!=='string'||s.length>200))){json(res,400,{error:'题目记录格式不正确。'});return}
        json(res,200,{questions:await ai.round(data.exclude)});return;
      }
      if(path==='/api/judge'){
        if(typeof data.questionId!=='string'||data.questionId.length>100){json(res,400,{error:'缺少有效题目编号。'});return}
        json(res,200,await ai.judge(data.questionId,data.answer));return;
      }
      json(res,404,{error:'接口不存在。'});return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
    const file=path==='/'?'index.html':path.slice(1);if(!files.has(file)){res.writeHead(404).end();return}
    const data=await readFile(new URL('./dist/'+file,import.meta.url));res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:data);
  }catch(e){json(res,e.status||503,{error:e.status?e.message:'服务暂时不可用，请使用题库模式。'})}
}).listen(port,host,()=>console.log(`Local: ${origin} | AI ${ai.key?'configured':'not configured'}`));
