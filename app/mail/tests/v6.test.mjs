import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createRuntimeHost} from '../lib/managed-runtime.mjs';
import {startupCode} from '../lib/startup-diagnostics.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'Mail-start-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const basePort=dir=>42000+crypto.createHash('sha256').update(dir).digest().readUInt32BE(0)%20000;
function localHost(t,entryOverride){
 const records=new Map(),starts=[],children=[];
 t.after(async()=>{for(const child of children)if(child.exitCode===null&&!child.signalCode){child.kill();await once(child,'exit');}});
 const runtime={
  async start(spec){starts.push(spec);const id=crypto.randomUUID(),child=spawn(process.execPath,[entryOverride||spec.entry,...spec.args],{cwd:spec.cwd,stdio:['ignore','pipe','pipe']});children.push(child);
   const record={runtimeId:id,state:'starting',profile:spec.profile,network:spec.network,backend:'fixture-process',subscribers:new Set(),port:spec.service.port,child};records.set(id,record);
   const push=event=>{for(const controller of record.subscribers)controller.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n'));};
   for(const stream of ['stdout','stderr'])child[stream].on('data',chunk=>{const text=chunk.toString();if(stream==='stdout'&&text.includes(spec.service.readyMarker))record.state='ready';push({type:'log',stream,text});});
   child.on('exit',(code,signal)=>{record.exitCode=code;record.signal=signal;record.state=code===0?'exited':'failed';push({type:'status',runtime:{runtimeId:id,state:record.state,exitCode:code,signal}});for(const controller of record.subscribers)controller.close();record.subscribers.clear();});return {runtimeId:id,state:record.state};
  },
  async get(id){const r=records.get(id);return {runtimeId:id,state:r.state,exitCode:r.exitCode,signal:r.signal,profile:r.profile,network:r.network,backend:r.backend};},
  async stop(id){const r=records.get(id);if(r?.child.exitCode===null&&!r.child.signalCode){r.child.kill();await once(r.child,'exit');}},
  async watch(id){const r=records.get(id);let controller;return new Response(new ReadableStream({start(c){controller=c;r.subscribers.add(c);},cancel(){r.subscribers.delete(controller);}}));},
  async fetch(id,route,options){return fetch('http://127.0.0.1:'+records.get(id).port+route,options);}
 };return {runtime,starts,records};
}
test('冷启动超过15秒仍可就绪，并发请求共享单次启动，仍使用native与external',async t=>{
 const dir=fixture(t);let clock=0,starts=0;const host=createRuntimeHost({platform:'darwin',now:()=>clock,sleep:async ms=>{clock+=ms;}}),ctx={runtime:{async start(spec){starts++;assert.equal(spec.profile,'native');assert.equal(spec.network,'external');return {runtimeId:'slow',state:'starting'};},async get(){return {state:clock>=20000?'ready':'starting'};},async stop(){}}};
 t.after(()=>host.stop());const initial=host.start(ctx,{dataDir:dir}),retry=host.retry();assert.equal(await initial,true);assert.equal((await retry).state,'ready');assert.equal(starts,1);assert.equal(clock,20000);
});
test('60秒超时明确显示TIMEOUT且回收进程，不将其误报为授权未开',async t=>{
 const dir=fixture(t);let clock=0,stops=0;const host=createRuntimeHost({platform:'darwin',now:()=>clock,sleep:async ms=>{clock+=ms;}}),ctx={runtime:{async start(){return {runtimeId:'timeout',state:'starting'};},async get(){return {state:'starting'};},async stop(){stops++;}}};t.after(()=>host.stop());
 assert.equal(await host.start(ctx,{dataDir:dir}),false);assert.equal(clock,60000);assert.equal(stops,1);assert.equal(host.diagnostics().code,'TIMEOUT');assert.doesNotMatch(host.error(),/检查.*权限/);
});
test('真实本地端口冲突被记录并更换端口，后台健康接口保留身份校验',async t=>{
 const dir=fixture(t),blocked=net.createServer();await new Promise(r=>blocked.listen(basePort(dir),'127.0.0.1',r));t.after(()=>new Promise(r=>blocked.close(r)));
 const ctx=localHost(t),host=createRuntimeHost();t.after(()=>host.stop());
 assert.equal(await host.start(ctx,{dataDir:dir}),true);assert.equal(ctx.starts.length,2);assert.notEqual(ctx.starts[0].service.port,ctx.starts[1].service.port);assert.equal(host.diagnostics().attempts[0].code,'EADDRINUSE');assert.equal(host.diagnostics().attempts[0].stage,'listen');assert.equal((await host.rawCall('/health',{})).manualSend,true);
 const res=await fetch('http://127.0.0.1:'+ctx.starts[1].service.port+'/health',{method:'POST',body:'{}'});assert.equal(res.status,401);
});
test('损坏密钥在本地数据阶段失败，不更换端口或删除原有数据',async t=>{
 const dir=fixture(t);fs.writeFileSync(path.join(dir,'.payload-key'),'broken');fs.writeFileSync(path.join(dir,'accounts.json'),'[]');const ctx=localHost(t),host=createRuntimeHost();t.after(()=>host.stop());
 assert.equal(await host.start(ctx,{dataDir:dir}),false);assert.equal(ctx.starts.length,1);assert.equal(host.diagnostics().code,'VAULT_KEY');assert.equal(host.diagnostics().attempts[0].stage,'open-local-data');assert.equal(fs.readFileSync(path.join(dir,'.payload-key'),'utf8'),'broken');assert.equal(fs.readFileSync(path.join(dir,'accounts.json'),'utf8'),'[]');
});
test('缺少后台模块时启动入口也能记录依赖阶段，不泄露绝对路径',async t=>{
 const dir=fixture(t),isolated=path.join(dir,'package');fs.mkdirSync(path.join(isolated,'runtime'),{recursive:true});fs.mkdirSync(path.join(isolated,'lib'));for(const name of ['runtime/launch.mjs','lib/startup-diagnostics.mjs'])fs.copyFileSync(path.join(root,name),path.join(isolated,name));
 const ctx=localHost(t,path.join(isolated,'runtime/launch.mjs')),host=createRuntimeHost();t.after(()=>host.stop());assert.equal(await host.start(ctx,{dataDir:dir}),false);const d=host.diagnostics();assert.equal(d.code,'ERR_MODULE_NOT_FOUND');assert.equal(d.attempts[0].stage,'load-dependencies');assert.equal(JSON.stringify(d).includes(dir),false);
});
test('原生身份和宿主授权分别提示，未知异常中的密码和邮件内容不保留',async t=>{
 const dir=fixture(t);let message="Windows native sandbox initialization is required. Run --initialize-native-identity";let starts=0;const host=createRuntimeHost(),ctx={runtime:{async start(){starts++;throw new Error(message);}}};t.after(()=>host.stop());
 assert.equal(await host.start(ctx,{dataDir:dir}),false);assert.equal(host.diagnostics().code,'NATIVE_IDENTITY');message='forbidden';await host.retry();assert.equal(host.diagnostics().code,'PERMISSION');message='password=VERY_PRIVATE email=private@example.invalid mail body SECRET CONTENT';await host.retry();const d=JSON.stringify(host.diagnostics());assert.equal(host.diagnostics().code,'START_FAILED');assert.doesNotMatch(d,/VERY_PRIVATE|private@|SECRET CONTENT/);assert.doesNotMatch(fs.readFileSync(path.join(dir,'.service-diagnostics.json'),'utf8'),/VERY_PRIVATE|SECRET CONTENT/);assert.equal(starts,3);
});
test('未初始化不反复启动；显式重新连接可立即重试并清除旧错误',async t=>{
 const dir=fixture(t);let starts=0,allow=false;const host=createRuntimeHost(),ctx={runtime:{async start(){starts++;if(!allow)throw new Error('forbidden');return {runtimeId:'r',state:'ready'};},async get(){return {state:'ready'};},async stop(){}}};t.after(()=>host.stop());
 await host.start(ctx,{dataDir:dir});assert.equal((await host.rawCall('/health',{})).ok,false);assert.equal(starts,1);allow=true;assert.equal((await host.retry()).state,'ready');assert.equal(host.error(),'');assert.equal(starts,2);
});
test('运行中后台退出可被发现，重新连接后使用新进程',async t=>{
 const dir=fixture(t),ctx=localHost(t),host=createRuntimeHost({monitorIntervalMs:5});t.after(()=>host.stop());await host.start(ctx,{dataDir:dir});const first=ctx.starts[0];const child=[...ctx.records.values()][0].child;child.kill();await once(child,'exit');await new Promise(r=>setTimeout(r,10));assert.equal(host.state(),'unavailable');assert.equal(host.diagnostics().code,'CHILD_EXIT');assert.equal((await host.retry()).state,'ready');assert.equal(ctx.starts.length,2);assert.deepEqual(ctx.starts[1].args.slice(0,1),first.args.slice(0,1));
});
test('停止发生在runtime.start返回之前，迟到进程被回收且不成为ready',async t=>{
 const dir=fixture(t);let release,stops=0;const host=createRuntimeHost(),ctx={runtime:{async start(){await new Promise(r=>release=r);return {runtimeId:'late',state:'ready'};},async stop(){stops++;}}};const starting=host.start(ctx,{dataDir:dir});await new Promise(r=>setImmediate(r));const stopping=host.stop();release();assert.equal(await starting,false);await stopping;assert.equal(stops,1);assert.equal(host.state(),'unavailable');
});
test('EACCES文件错误与端口错误不混淆；未知消息不伪造具体原因',()=>{
 assert.equal(startupCode({code:'EACCES',message:'private path'}),'EACCES');assert.equal(startupCode('unknown'),'START_FAILED');assert.equal(startupCode('The native identity is missing'),'NATIVE_IDENTITY');
});
