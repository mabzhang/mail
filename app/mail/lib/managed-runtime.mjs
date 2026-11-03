import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {STARTUP_CODES,startupCode,startupMessage} from './startup-diagnostics.mjs';
import {runtimePolicy} from './runtime-policy.mjs';
const appVersion=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url),'utf8')).version;
const entry=fileURLToPath(new URL('../runtime/launch.mjs',import.meta.url));
const terminal=r=>!r||['failed','exited','stopped'].includes(r.state);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createRuntimeHost({now=Date.now,sleep=pause,timeoutMs=60000,monitorIntervalMs=5000,platform=process.platform}={}){
 const execution=runtimePolicy(platform);
 let ctx=null,dir='',runtimeId=null,pendingId=null,starting=null,token='',credentialProvider=()=>[],lastError='',failedAt=null,disposed=false,watcher=null;
 let diagnostic={version:2,appVersion,execution,state:'unavailable',attempts:[]};
 const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Runtime RPC timed out'),{code:'RUNTIME_RPC_TIMEOUT'})),ms);})]);}finally{clearTimeout(timer);}};
 const persist=()=>{try{fs.writeFileSync(path.join(dir,'.service-diagnostics.json'),JSON.stringify(diagnostic,null,2),{mode:0o600});}catch{}};
 const safeRecord=r=>r?Object.fromEntries(['runtimeId','state','exitCode','signal','backend','enforcement','profile','network','logBytes','logTruncated'].filter(k=>['string','number','boolean'].includes(typeof r[k])).map(k=>[k,r[k]])):{};
 function fail(code,record={}){lastError=startupMessage(code,record);failedAt=now();diagnostic.state='unavailable';diagnostic.code=code;diagnostic.message=lastError;persist();}
 function readStartup(id){try{const file=path.join(dir,'.service-startup.json');if(fs.statSync(file).size>4096)return null;const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.startupId!==id)return null;return {stage:['load-dependencies','open-local-data','listen','ready'].includes(data.stage)?data.stage:'unknown',code:STARTUP_CODES.has(data.code)?data.code:''};}catch{return null;}}
 // AppHost drains outbound RPCs before accepting installation. A runtime.watch
 // stream holds http.body.read open indefinitely, so never open it from apply().
 // Bounded status queries keep crash diagnostics without blocking bootstrap.
 function observe(id,attempt){
  let cancelled=false,busy=false;
  const timer=setInterval(async()=>{
   if(cancelled||busy||disposed||runtimeId!==id)return;busy=true;
   try{
    const record=await bounded(ctx.runtime.get(id),5000);
    if(!cancelled&&!disposed&&runtimeId===id&&terminal(record)){
     attempt.runtime=safeRecord(record);runtimeId=null;cancel();watcher=null;fail('CHILD_EXIT',record);
    }
   }catch{}finally{busy=false;}
  },monitorIntervalMs);timer.unref?.();
  function cancel(){cancelled=true;clearInterval(timer);}
  return cancel;
 }
 async function stopId(id){if(!id)return;try{await bounded(ctx?.runtime.stop(id),5000);}catch{}}
 async function ensure(){
  if(disposed||!ctx)return false;if(starting)return starting;
  if(runtimeId){try{const record=await bounded(ctx.runtime.get(runtimeId),5000);if(record?.state==='ready')return true;if(!terminal(record))return false;}catch{}
   const old=runtimeId;runtimeId=null;watcher?.();watcher=null;await stopId(old);
  }
  if(failedAt!==null&&now()-failedAt<30000)return false;
  starting=(async()=>{
   diagnostic={version:2,appVersion,execution,state:'starting',startedAt:new Date(now()).toISOString(),attempts:[]};lastError='';persist();
   try{
    token=crypto.randomBytes(32).toString('hex');fs.writeFileSync(path.join(dir,'.service-key'),token,{mode:0o600});const usedPorts=new Set();
    for(let n=0;n<3;n++){
     if(disposed)return false;
     let port=n===0?42000+(crypto.createHash('sha256').update(dir).digest().readUInt32BE(0)%20000):crypto.randomInt(10000,62000);
     while(usedPorts.has(port))port=crypto.randomInt(10000,62000);usedPorts.add(port);
     const startupId=crypto.randomBytes(16).toString('hex'),attempt={port,stage:'start-runtime',startedAt:new Date(now()).toISOString()};diagnostic.attempts.push(attempt);persist();
     let expired=false;const startContext=ctx;const launch=ctx.runtime.start({runtime:'node',entry,args:[dir,String(port),startupId],cwd:dir,profile:execution.profile,network:execution.network,service:{port,readyMarker:'MAIL_READY'}});launch.then(r=>{if(expired&&r?.runtimeId)void startContext.runtime.stop(r.runtimeId).catch(()=>{});},()=>{});let rec;try{rec=await bounded(launch,Math.min(timeoutMs,20000));}catch(error){expired=true;throw error;}
     pendingId=rec.runtimeId;if(disposed){await stopId(pendingId);pendingId=null;return false;}
     const cancel=observe(pendingId,attempt);
     let latest=rec,ready=false;const deadline=now()+timeoutMs;
     try{while(now()<deadline&&!disposed){latest=await bounded(ctx.runtime.get(pendingId),5000);attempt.runtime=safeRecord(latest);const startup=readStartup(startupId);if(startup){attempt.stage=startup.stage;if(startup.code)attempt.code=startup.code;}
      if(latest?.state==='ready'){ready=true;break;}if(terminal(latest))break;await sleep(250);
     }}catch(error){attempt.code=startupCode(error);}
     const startup=readStartup(startupId);if(startup){attempt.stage=startup.stage;if(startup.code)attempt.code=startup.code;}attempt.endedAt=new Date(now()).toISOString();
     if(ready&&!disposed){try{fs.unlinkSync(path.join(dir,'.service-key'));}catch{}runtimeId=pendingId;pendingId=null;watcher=cancel;failedAt=null;lastError='';diagnostic.state='ready';diagnostic.code='';diagnostic.message='邮件后台已连接';persist();return true;}
     cancel();const old=pendingId;pendingId=null;await stopId(old);attempt.code=attempt.code||(disposed?'CANCELLED':terminal(latest)?'CHILD_EXIT':'TIMEOUT');persist();
     if(!disposed&&attempt.stage==='listen'&&['EADDRINUSE','EACCES'].includes(attempt.code)&&n<2)continue;
     fail(attempt.code,latest);return false;
    }
   }catch(error){const code=startupCode(error);if(diagnostic.attempts.length)diagnostic.attempts.at(-1).code=code;fail(code);}
   return false;
  })().finally(()=>{starting=null;try{fs.unlinkSync(path.join(dir,'.service-key'));}catch{}});return starting;
 }
 async function rawCall(route,payload){
  if(!(await ensure()))return {ok:false,error:lastError||'邮件后台正在启动，请稍后重试'};
  const body=JSON.stringify({...payload,__mailCredentials:credentialProvider()});if(Buffer.byteLength(body)>900*1024)return {ok:false,error:'请求过大'};
  try{const res=await ctx.runtime.fetch(runtimeId,route,{method:'POST',headers:{'content-type':'application/json','x-mail-service-key':token},body,timeoutMs:30000});return typeof res==='string'?JSON.parse(res):await res.json();}
  catch(error){if(/no ready service|does not have a ready service|ECONNREFUSED|not found/i.test(String(error.message))){const old=runtimeId;runtimeId=null;watcher?.();watcher=null;await stopId(old);fail('SERVICE_LOST');failedAt=null;}return {ok:false,error:lastError||'邮箱服务暂时不可用，请稍后重试'};}
 }
 return {
  bind(context,{dataDir,credentials=()=>[]}){credentialProvider=credentials;ctx=context;dir=dataDir;disposed=false;diagnostic={version:2,appVersion,execution,state:'unavailable',attempts:[]};},
  async start(context,{dataDir}){ctx=context;dir=dataDir;disposed=false;return ensure();},
  connect:ensure,
  state:()=>disposed?'unavailable':starting?'starting':runtimeId?'ready':'unavailable',error:()=>lastError,
  diagnostics:()=>structuredClone(diagnostic),rawCall,
  async retry(){if(!starting)failedAt=null;await ensure();return structuredClone(diagnostic);},
  async stop(){disposed=true;watcher?.();watcher=null;const ids=new Set([runtimeId,pendingId].filter(Boolean));runtimeId=null;for(const id of ids)await stopId(id);await starting;pendingId=null;diagnostic.state='unavailable';persist();try{fs.unlinkSync(path.join(dir,'.service-key'));}catch{}ctx=null;}
 };
}
