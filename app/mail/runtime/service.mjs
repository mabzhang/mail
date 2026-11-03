import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {imapFailure} from '../lib/imap-errors.mjs';
import {createSendPayloads} from '../lib/send-payloads.mjs';
import {createStore} from '../lib/store.mjs';
import {createImapAdapter} from '../backend/imap.mjs';
import {createAttachments} from '../lib/attachments.mjs';
import {createSmtpAdapter,createOutbox} from '../backend/smtp.mjs';
export function createService({dir,token,adapter=createImapAdapter(),smtp=null}){
 const store=createStore(dir),attachments=createAttachments(store),smtpAdapter=smtp||createSmtpAdapter(undefined,{attachments}),outbox=createOutbox(store,smtpAdapter),jobs=new Map(),watchers=new Map(),payloads=createSendPayloads(store);outbox.recover();payloads.prune();let closing=false,eventSerial=0;
 function refreshWatchers(){if(!adapter.watch)return;try{const accounts=store.accounts();const ids=new Set(accounts.map(a=>a.id));for(const [id,w] of watchers)if(!ids.has(id)){w.stop();watchers.delete(id);}for(const pub of accounts){if(!pub.hasCredential){const stale=watchers.get(pub.id);stale?.stop();watchers.delete(pub.id);continue;}const a=store.account(pub.id),fingerprint=crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex'),old=watchers.get(a.id);if(old?.fingerprint===fingerprint)continue;old?.stop();watchers.set(a.id,{fingerprint,stop:adapter.watch(a,()=>eventSerial++)});}}catch{}}
const reply=(r,code,v)=>{r.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});r.end(JSON.stringify(v));};
 const server=http.createServer(async(req,res)=>{const h=String(req.headers['x-mail-service-key']||'');if(Buffer.byteLength(h)!==Buffer.byteLength(token)||!crypto.timingSafeEqual(Buffer.from(h),Buffer.from(token)))return reply(res,401,{ok:false,error:'服务身份验证失败'});if(req.method!=='POST')return reply(res,405,{ok:false,error:'请求方法无效'});
 try{let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>900*1024)return reply(res,413,{ok:false,error:'请求过大'});chunks.push(chunk);}const p=JSON.parse(Buffer.concat(chunks).toString()||'{}');store.setSessionCredentials(p.__mailCredentials);delete p.__mailCredentials;if(req.url==='/health')return reply(res,200,{ok:true,mailboxReadOnly:true,manualSend:true});if(req.url==='/events'){refreshWatchers();return reply(res,200,{ok:true,serial:eventSerial});}
 if(req.url==='/outbox-start'){if(p.payloadHash){const old=outbox.get(p.requestId);if(old){if(old.submittedHash!==p.payloadHash)throw new Error('发送内容已更改');return reply(res,200,{ok:true,data:old});}const message=payloads.load(p.requestId,p.payloadHash),data=outbox.start(p.requestId,message,{payloadHash:p.payloadHash});try{payloads.remove(p.requestId);}catch{}return reply(res,200,{ok:true,data});}throw new Error('发送必须先经预览确认');}
 if(req.url==='/outbox-status')return reply(res,200,{ok:true,data:outbox.get(p.requestId)});
 if(req.url==='/outbox-list')return reply(res,200,{ok:true,data:outbox.list()});
 if(req.url==='/job'||req.url==='/smtp-test-start'){if(req.url==='/job'&&!['test','folders','list','day','read','context'].includes(p.command))return reply(res,403,{ok:false,error:'只读邮箱禁止此操作'});if(closing)return reply(res,503,{ok:false,error:'服务正在退出'});if([...jobs.values()].filter(j=>j.state==='running').length>=4)return reply(res,429,{ok:false,error:'正在处理其他请求，请稍后重试'});const smtpTest=req.url==='/smtp-test-start',a=req.url==='/job'||smtpTest?store.account(String(p.accountId||'')):null;const id=crypto.randomUUID(),j={state:'running',created:Date.now()};jobs.set(id,j);Promise.resolve().then(()=>smtpTest?smtpAdapter.verify(a):adapter.run(p.command,a,p)).then(data=>Object.assign(j,{state:'done',data})).catch(error=>Object.assign(j,{state:'failed',...(a&&!smtpTest?imapFailure(error):{error:smtpTest?'SMTP 连接失败，请检查授权码、SMTP 权限、服务器与网络':'模型连接失败，请检查模型配置'})}));return reply(res,200,{ok:true,jobId:id});}
 if(req.url==='/job-status'){const j=jobs.get(p.jobId);if(!j)return reply(res,404,{ok:false,error:'请求过期，请重试'});return reply(res,200,{ok:true,...j});}return reply(res,404,{ok:false,error:'接口不可用'});
 }catch{return reply(res,400,{ok:false,error:'请求无效或账号不可用'});}});
 const reap=setInterval(()=>{payloads.prune();for(const [id,j]of jobs)if(j.state!=='running'&&Date.now()-j.created>600000)jobs.delete(id);},60000);reap.unref();return {server,close(){closing=true;store.lockCredentials();clearInterval(reap);for(const w of watchers.values())w.stop();adapter.close();server.close();server.closeAllConnections?.();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const dir=process.argv[2],port=Number(process.argv[3]),token=fs.readFileSync(path.join(dir,'.service-key'),'utf8'),svc=createService({dir,token});svc.server.on('error',()=>process.exit(1));svc.server.listen(port,'127.0.0.1',()=>process.stdout.write('MAIL_READY\n'));for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{svc.close();setTimeout(()=>process.exit(0),300).unref();});}
