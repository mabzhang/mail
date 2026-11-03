import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createStore} from '../lib/store.mjs';
import {createDrafts} from '../lib/drafts.mjs';
import {createMailCache} from '../lib/mail-cache.mjs';
import {draftPayload,quoteFromMail,draftSaveError} from '../lib/draft-content.mjs';
import {createDraftSources} from '../lib/draft-sources.mjs';
import {createSendPayloads} from '../lib/send-payloads.mjs';
import {normalizeOutgoing} from '../lib/outgoing.mjs';
import {createService} from '../runtime/service.mjs';
import {createSmtpAdapter} from '../backend/smtp.mjs';
import {createImapAdapter} from '../backend/imap.mjs';
import {registerUi} from '../http/ui.js';
const sample={host:'imap.example.invalid',smtpHost:'smtp.example.invalid',email:'self@example.invalid',password:'ISOLATED-FAKE-CREDENTIAL',name:'隔离测试',host:'imap.example.invalid',port:993};
const original=(accountId,bytes=1000000)=>({accountId,folder:'INBOX',uid:'7',uidValidity:'10',subject:'原邮件主题',from:'客户 <client@example.invalid>',date:'2026-10-10T01:00:00Z',text:'请确认项目数据。',html:'<table><tr><td>原文图片</td></tr></table><img src="data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(bytes)]).toString('base64')+'">',messageId:'<original@example.invalid>'});
const own=id=>({accountId:id,to:'client@example.invalid',cc:'',bcc:'',subject:'Re: 原邮件主题',text:'收到，已发起申诉，请知悉。',html:'<p><b>收到</b>，已发起申诉，请知悉。</p>',inReplyTo:'<original@example.invalid>',references:'<original@example.invalid>'});
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'Mail-draft-v7-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=createStore(dir),account=store.saveAccount(sample);return {dir,store,account};}
function routes(options){const all=new Map(),app={get:(p,fn)=>all.set('GET '+p,fn),post:(p,fn)=>all.set('POST '+p,fn)};registerUi(app,{engine:{markDirty(){},state(){return {}; }},...options});return async(route,body)=>{const u=new URL(route,'http://fixture.invalid');const c={req:{query:k=>u.searchParams.get(k),json:async()=>body},json:(v,status=200)=>({status,...v})};return all.get((body===undefined?'GET ':'POST ')+u.pathname)(c);};}
async function serviceFixture(t,dir,{smtp,adapter={close(){}}}){const svc=createService({dir,token:'LOCAL-FIXTURE-KEY',adapter,smtp});t.after(()=>svc.close());await new Promise(r=>svc.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+svc.server.address().port;return async(route,p={})=>(await fetch(origin+route,{method:'POST',headers:{'content-type':'application/json','x-mail-service-key':'LOCAL-FIXTURE-KEY'},body:JSON.stringify({...p,__mailCredentials:JSON.parse(fs.readFileSync(path.join(dir,'accounts.json'),'utf8')).map(a=>({id:a.id,password:sample.password}))})})).json();}

test('大图片引用不进入草稿或前端保存请求，格式、附件标识和签名选择保留',t=>{
 const {store,account,dir}=fixture(t),quote=quoteFromMail(original(account.id)),input={...own(account.id),...quote,useSignature:true,signatureId:'sig1',attachments:['attachment-id']};
 assert(quote.quoteHtml.length>600000);const payload=draftPayload(input);assert(Buffer.byteLength(JSON.stringify(payload))<1500);assert(!('replyContext' in payload));assert(!('quoteHtml' in payload));
 const d=createDrafts(store).save(input),raw=fs.readFileSync(path.join(dir,'draft-'+d.id+'.json'),'utf8');assert.equal(d.text,input.text);assert.equal(d.html,input.html);assert.equal(d.signatureId,'sig1');assert.deepEqual(d.sourceRef,quote.sourceRef);assert.doesNotMatch(raw,/quoteHtml|quoteText|replyContext|data:image|请确认项目数据/);assert.equal(d.attachments[0],'attachment-id');
});
test('自动与手动同一草稿接口只写正文，原邮件暂不可达也能继续保存',async t=>{
 const {store,account}=fixture(t),route=routes({store,mail:async()=>{throw Error('离线');},call:async()=>({ok:true})}),input={...own(account.id),...quoteFromMail(original(account.id))};
 let saved=await route('/draft',draftPayload(input));assert.equal(saved.ok,true);const id=saved.data.id;
 const source=await route('/draft/source?id='+id);assert.equal(source.ok,false);assert.match(source.error,/离线/);
 saved=await route('/draft',{...saved.data,text:'继续写入的正文',html:'<p>继续写入的正文</p>'});assert.equal(saved.ok,true);assert.equal((await route('/draft?id='+id)).data.text,'继续写入的正文');assert.equal(saved.data.revision,2);
 const preview=await route('/send/prepare',saved.data);assert.equal(preview.ok,false);assert.match(preview.error,/离线/);assert.equal(store.read('send-records.json',[]).length,0);
});
test('重新打开时从独立邮件缓存恢复引用与 AI 上下文，UIDVALIDITY 不符拒绝误引用',async t=>{
 const {store,account}=fixture(t),mail=original(account.id),quote=quoteFromMail(mail);let reads=0;const cache=createMailCache(store,async()=>{reads++;return mail;}),sources=createDraftSources({cache,mail:async()=>{throw Error('不应搜索');}}),drafts=createDrafts(store),saved=drafts.save({...own(account.id),...quote});
 await cache.get('read',account.id,{folder:'INBOX',uid:'7',uidValidity:'10'});assert.equal(reads,1);const reopened=await sources.resolve(drafts.get(saved.id));assert.equal(reads,1);assert.equal(reopened.replyContext.text,mail.text);assert.equal(reopened.quoteHtml,quote.quoteHtml);assert.equal(reopened.sourceRef.uid,'7');
 await cache.load('list',account.id,{folder:'INBOX'}); // change its stamp via a separate mailbox generation
 const mismatch=createMailCache(store,async()=>({uidValidity:'11'}));await mismatch.load('list',account.id,{folder:'INBOX'});await assert.rejects(sources.resolve(saved),/重建/);
});
test('旧回复草稿只在保存时迁移，原文件不批量重写；新正文分隔文字不会被误删',t=>{
 const {store,account}=fixture(t),drafts=createDrafts(store),id=crypto.randomUUID(),legacy={...own(account.id),id,revision:1,text:'我写的回复\n----- 原邮件 -----\n历史内容',html:'',createdAt:1,updatedAt:1};store.write('draft-'+id+'.json',legacy);
 const before=fs.readFileSync(path.join(store.dir,'draft-'+id+'.json'),'utf8'),read=drafts.get(id);assert.equal(read.text,'我写的回复');assert.match(read.replyContext.text,/历史内容/);assert.equal(fs.readFileSync(path.join(store.dir,'draft-'+id+'.json'),'utf8'),before);
 drafts.save(read);assert.doesNotMatch(fs.readFileSync(path.join(store.dir,'draft-'+id+'.json'),'utf8'),/历史内容|quoteText|replyContext/);
 const text='这是我写的说明\n----- 原邮件 -----\n这是我本人编辑的文字',fresh=drafts.save({...own(account.id),text});assert.equal(drafts.get(fresh.id).text,text);
});
test('旧回复草稿预览时按 Message-ID 找回原邮件，并保存位置而非历史引用',async t=>{
 const {store,account}=fixture(t),mail=original(account.id,800000);let searches=0;const route=routes({store,mail:async cmd=>{if(cmd==='context')searches++;return mail;},call:async()=>({ok:true,data:null})});
 const saved=(await route('/draft',own(account.id))).data,prepared=await route('/send/prepare',saved);assert.equal(prepared.ok,true);assert.equal(searches,1);assert.equal(prepared.data.draft.sourceRef.uid,'7');assert(!('quoteHtml' in prepared.data.draft));assert.match(prepared.data.message.html,/原文图片/);
});
test('正文真实限额和多窗口版本冲突仍生效，错误提示不会一律要求重新打开',t=>{
 const {store,account}=fixture(t),drafts=createDrafts(store),saved=drafts.save(own(account.id));assert.throws(()=>drafts.save({...saved,text:'字'.repeat(100001)}),/长度范围/);assert.throws(()=>drafts.save({...saved,html:'<p>'+'x'.repeat(600001)+'</p>'}),/你写的正文/);drafts.save({...saved,text:'另一窗口'});assert.throws(()=>drafts.save(saved),/其他窗口/);
 assert.match(draftSaveError('草稿已在其他窗口更新，请重新打开'),/先复制/);assert.doesNotMatch(draftSaveError('磁盘空间不足'),/冲突|重新打开/);
});
test('大图发送预览完整，暂存加密且预览不发信；确认后小请求进入 SMTP，重复确认只投递一次',async t=>{
 const {store,account,dir}=fixture(t),mail=original(account.id,1500000);store.saveSettings({signatures:{[account.id]:{enabled:true,selectedId:'s',variants:[{id:'s',text:'我的签名',html:'<p>我的签名</p>'}]}}});let sends=0,sent,requestBytes=[];
 const smtp=createSmtpAdapter(()=>({async sendMail(m){sends++;sent=m;return {accepted:m.to,rejected:[],messageId:'<fixture-only>'};},close(){}}));
 const runtime=await serviceFixture(t,dir,{smtp}),route=routes({store,mail:async()=>mail,call:async(p,data)=>{requestBytes.push(Buffer.byteLength(JSON.stringify(data)));return runtime(p,data);}});
 const saved=(await route('/draft',draftPayload({...own(account.id),to:'client@outside.invalid',...quoteFromMail(mail)}))).data;
 const prepared=(await route('/send/prepare',saved)).data;assert(prepared.message.html.length>900*1024);assert.match(prepared.message.html,/原文图片/);assert.match(prepared.message.html,/我的签名/);assert.equal(sends,0);
 const staged=fs.readFileSync(path.join(dir,'send-payload-'+prepared.token+'.json'),'utf8');assert.doesNotMatch(staged,/data:image|收到|我的签名/);assert.equal(JSON.parse(staged).released,false);
 assert.equal((await runtime('/outbox-start',{requestId:prepared.token,payloadHash:JSON.parse(staged).hash})).ok,false);assert.equal(sends,0);
 assert.equal((await route('/send/confirm',{token:prepared.token})).ok,false);assert.equal(sends,0);
 const result=await route('/send/confirm',{token:prepared.token,acknowledgments:{external:true}});assert.equal(result.ok,true);await new Promise(r=>setImmediate(r));assert.equal(sends,1);assert.match(sent.html,/cid:/);assert.equal(sent.attachments[0].content.length,1500008);
 await route('/send/confirm',{token:prepared.token,acknowledgments:{external:true}});assert.equal(sends,1);assert(requestBytes.every(n=>n<300));assert.equal(fs.existsSync(path.join(dir,'send-payload-'+prepared.token+'.json')),false);assert.doesNotMatch(JSON.stringify((await route('/outbox')).data),/data:image/);
});
test('暂存校验值、过期与内容篡改均阻断提交，清理只处理自身临时预览',t=>{
 const {store}=fixture(t);let now=1000;const payloads=createSendPayloads(store,{now:()=>now}),id=crypto.randomUUID(),message=normalizeOutgoing(own('a')),hash=payloads.stage(id,message,2000);
 assert.throws(()=>payloads.load(id,hash),/未经确认/);assert.throws(()=>payloads.release(id,'f'.repeat(64)),/已更改/);payloads.release(id,hash);assert.deepEqual(payloads.load(id,hash),message);
 const p=store.read('send-payload-'+id+'.json');p.sealed=store.encrypt(JSON.stringify({...message,text:'伪造正文'}));store.write('send-payload-'+id+'.json',p);assert.throws(()=>payloads.load(id,hash),/已更改/);
 store.write('draft-preserve.json',{text:'保留'});now=2001;assert.throws(()=>payloads.load(id,hash),/过期/);payloads.prune();assert.equal(store.read('send-payload-'+id+'.json',null),null);assert.equal(store.read('draft-preserve.json').text,'保留');assert.throws(()=>payloads.load('../escape',hash),/标识/);
});
test('确认前正文变更使旧预览失效，禁止不经重新预览发送',async t=>{
 const {store,account}=fixture(t);let calls=0;const route=routes({store,mail:async()=>null,call:async()=>{calls++;return {ok:true,data:null};}}),input={...own(account.id),inReplyTo:'',references:''};
 const prepared=(await route('/send/prepare',input)).data;await route('/draft',{...prepared.draft,text:'已经改写',html:'<p>已经改写</p>'});const result=await route('/send/confirm',{token:prepared.token,acknowledgments:{external:true}});assert.equal(result.ok,false);assert.match(result.error,/已更改/);assert.equal(calls,0);
});
for(const [error,expected] of [[{authenticationFailed:true,serverResponseCode:'AUTHENTICATIONFAILED'},'IMAP_AUTH'],[{code:'ENOTFOUND'},'IMAP_DNS'],[{code:'ETIMEDOUT'},'IMAP_TIMEOUT'],[{code:'CERT_HAS_EXPIRED'},'IMAP_TLS'],[{code:'ECONNREFUSED'},'IMAP_NETWORK'],[{mailStage:'open-mailbox',serverResponseCode:'NOPERM'},'IMAP_FOLDER']])test('实际异步收件任务区分 '+expected+'，原始密码与响应不出现在提示',async t=>{
 const {dir,account}=fixture(t),runtime=await serviceFixture(t,dir,{smtp:{},adapter:{async run(){throw Object.assign(new Error('password=SECRET 原始响应与正文'),error);},close(){}}});const started=await runtime('/job',{command:'test',accountId:account.id});await new Promise(r=>setImmediate(r));const status=await runtime('/job-status',{jobId:started.jobId});assert.equal(status.errorCode,expected);assert.match(status.error,new RegExp(expected));assert.doesNotMatch(JSON.stringify(status),/SECRET|原始响应|password=/);
});
test('IMAP 连接、打开文件夹与读取阶段分别标注，全部仍只读且保留 SSL',async t=>{
 let stage='connect',config;const adapter=createImapAdapter(c=>{config=c;return {on(){},async connect(){if(stage==='connect')throw Error('连接');},async mailboxOpen(p,options){assert.equal(options.readOnly,true);if(stage==='open-mailbox')throw Error('目录');return {exists:0,uidValidity:'1'};},async fetchOne(){throw Error('读取');},close(){}};});t.after(()=>adapter.close());
 for(const [value,command]of [['connect','test'],['open-mailbox','test'],['read','read']]){stage=value;await assert.rejects(adapter.run(command,{...sample,id:'fixture'},{uid:'1',uidValidity:'1'}),e=>e.mailStage===value);}assert.equal(config.secure,true);assert.equal(config.logger,false);
});
