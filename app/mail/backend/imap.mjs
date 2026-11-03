import {ImapFlow} from 'imapflow';
import libmime from 'libmime';
import crypto from 'node:crypto';
import {imageKey,imageReferences,rasterType} from '../lib/mail-images.mjs';
import {cleanHtml} from '../lib/mail-html.mjs';
import {dayRange} from '../lib/store.mjs';
const META={uid:true,flags:true,envelope:true,internalDate:true,size:true,bodyStructure:true,headers:['Message-ID','In-Reply-To','References']};
const plain=h=>String(h).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<(br|\/p|\/div|\/tr)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/[ \t]+/g,' ').trim();
const names=v=>(v||[]).map(x=>x.name?`${x.name} <${x.address||''}>`:x.address||'').join('; ');
export function partsOf(node,out={text:[],attachments:[],inline:[],calendar:[]}){
 if(!node)return out;const type=String(node.type||'').toLowerCase(),filename=node.dispositionParameters?.filename||node.parameters?.name;
 let name=filename||'未命名附件';try{name=libmime.decodeWords(name);}catch{}
 out.calendar ||= [];
 if(type==='text/calendar'||type==='application/ics'||type==='application/icalendar'||(/\.ics$/i.test(name)&&['application/octet-stream','text/plain'].includes(type)))out.calendar.push({part:node.part||'1',method:String(node.parameters?.method||''),size:Number(node.size)||0});
 const cid=imageKey(node.id||node.contentId||''),location=String(node.location||'');
 const candidate=(cid||location)&&(type.startsWith('image/')||type==='application/octet-stream');
 if(candidate)out.inline.push({part:node.part||'1',cid,location,type,size:Number(node.size)||0,name});
 if(filename||node.disposition==='attachment'){
  if(!candidate||node.disposition==='attachment'||(type==='application/octet-stream'&&node.disposition!=='inline'))out.attachments.push({part:node.part||'1',name,type:type||'application/octet-stream',size:Number(node.size)||0,estimated:true});
  if(!candidate)return out;
 }else if(type==='text/plain'||type==='text/html')out.text.push({part:node.part||'1',type});
 for(const child of node.childNodes||[])partsOf(child,out);return out;
}
export function messageFrom(m,accountId,folder,validity){const e=m.envelope||{},header=Buffer.isBuffer(m.headers)?m.headers.toString():String(m.headers||'');const h=n=>(header.match(new RegExp('^'+n+':\\s*(.+(?:\\r?\\n[ \\t]+.*)*)','im'))?.[1]||'').replace(/\r?\n[ \t]+/g,' ');const date=new Date(m.internalDate||e.date).toISOString();const parts=partsOf(m.bodyStructure);return {id:`${accountId}:${encodeURIComponent(folder)}:${validity}:${m.uid}`,accountId,folder,uid:String(m.uid),uidValidity:String(validity),subject:e.subject||'(无主题)',from:names(e.from),to:names(e.to),cc:names(e.cc),replyTo:names(e.replyTo),date,sentDate:e.date?new Date(e.date).toISOString():date,read:!!m.flags?.has('\\Seen'),messageId:e.messageId||h('Message-ID'),inReplyTo:e.inReplyTo||h('In-Reply-To'),references:h('References'),attachments:parts.attachments,_parts:parts.text,_inline:parts.inline,_calendar:parts.calendar};}
export function createImapAdapter(factory=config=>new ImapFlow(config)){
 const live=new Set(),pool=new Map();let closed=false;
 const config=a=>({host:a.host,port:a.port,secure:true,auth:{user:a.email,pass:a.password},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:120000,disableAutoIdle:true});
 async function withMailbox(a,folder,fn){if(closed)throw new Error('邮箱连接已退出');const key=crypto.createHash('sha256').update(JSON.stringify([a.id,a.host,a.port,a.email,a.password])).digest('hex');let entry=pool.get(key);if(!entry){entry={client:null,tail:Promise.resolve(),used:Date.now(),busy:0};pool.set(key,entry);}entry.busy++;let release;const previous=entry.tail;entry.tail=new Promise(r=>release=r);await previous;let c=entry.client,stage='connect';try{if(!c){c=factory(config(a));entry.client=c;live.add(c);c.on?.('error',()=>{if(entry.client===c)entry.client=null;try{c.close();}catch{}});c.on?.('close',()=>{live.delete(c);if(entry.client===c)entry.client=null;});await c.connect();}stage='open-mailbox';const box=await c.mailboxOpen(folder,{readOnly:true});stage='read';return await fn(c,box);}catch(e){e.mailStage=stage;if(entry.client===c)entry.client=null;live.delete(c);try{c?.close();}catch{}throw e;}finally{entry.used=Date.now();entry.busy--;release();}}
 const reap=setInterval(()=>{for(const [key,e]of pool)if(!e.busy&&Date.now()-e.used>300000){pool.delete(key);live.delete(e.client);try{e.client?.close();}catch{}}},60000);reap.unref?.();
 async function bytes(c,m,part,maxBytes){const {content}=await c.download(m.uid,part,{uid:true,maxBytes:maxBytes+1});const chunks=[];let size=0;for await(const b of content){size+=b.length;chunks.push(b);}return {buffer:Buffer.concat(chunks).subarray(0,maxBytes),truncated:size>maxBytes};}
 async function body(c,m,maxBytes=16000,rich=false){const calendarParts=[];for(const entry of (m._calendar||[]).slice(0,4)){try{const data=await bytes(c,m,entry.part,256000);calendarParts.push({text:data.buffer.toString('utf8'),method:entry.method,part:entry.part,truncated:data.truncated});}catch{calendarParts.push({text:'',method:entry.method,part:entry.part,truncated:true});}}
 const part=m._parts.find(p=>p.type==='text/plain')||m._parts[0];if(!part)return {text:calendarParts.length?'（此邮件包含会议邀请）':'（无可读取文本正文）',bodyTruncated:false,calendarParts};const raw=await bytes(c,m,part.part,maxBytes);let text=raw.buffer.toString('utf8'),html='',truncated=raw.truncated;
 if(part.type==='text/html'){html=text;text=plain(text);}if(rich){const hp=m._parts.find(p=>p.type==='text/html');if(hp&&hp.part!==part.part){const h=await bytes(c,m,hp.part,200000);html=h.buffer.toString('utf8');truncated||=h.truncated;}if(html){
  let budget=8000000;const refs=imageReferences(html),sources=new Map(),used=new Set();
  for(const img of m._inline||[]){
   const keys=[img.cid,imageKey(img.location)].filter(Boolean);if(!keys.some(k=>refs.has(k))||img.size>2000000||budget<=0)continue;
   try{const b=await bytes(c,m,img.part,Math.min(2000000,budget));budget-=b.buffer.length;if(b.truncated)continue;const type=rasterType(b.buffer);if(!type)continue;
    const src='data:'+type+';base64,'+b.buffer.toString('base64');for(const key of keys)sources.set(key,src);used.add(img.part);
   }catch{}
  }
  m.attachments=m.attachments.filter(x=>!used.has(x.part));html=cleanHtml(html,{remote:true,imageSources:sources});
 }}

 return {text,html:rich?html:undefined,bodyTruncated:truncated,calendarParts};}
 return {watch(account,onChange){let stopped=false,client=null,retry=null;
 const connect=async()=>{if(stopped)return;const c=factory({host:account.host,port:account.port,secure:true,auth:{user:account.email,pass:account.password},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:300000});client=c;live.add(c);let closed=false;const recover=()=>{if(closed)return;closed=true;live.delete(c);if(!stopped){retry=setTimeout(connect,60000);retry.unref?.();}};c.on?.('error',()=>{try{c.close();}catch{}recover();});c.on?.('close',recover);c.on?.('exists',()=>onChange());try{await c.connect();await c.mailboxOpen('INBOX',{readOnly:true});if(stopped)c.close();}catch{try{c.close();}catch{}recover();}};void connect();return ()=>{stopped=true;clearTimeout(retry);if(client){live.delete(client);try{client.close();}catch{}}};},async run(command,a,p={}){const folder=String(p.folder||'INBOX');if(!folder||folder.length>300||/[\x00-\x1f]/.test(folder))throw new Error('邮箱文件夹无效');if(!['test','folders','list','day','read','context'].includes(command))throw new Error('只读邮箱禁止此操作');return withMailbox(a,folder,async(c,box)=>{
 if(command==='context'){const id=String(p.messageId||'');if(!/^<[^<>\s]+>$/.test(id)||id.length>500)throw new Error('邮件关联标识无效');const uids=await c.search({header:{'Message-ID':id}},{uid:true});if(!Array.isArray(uids)||!uids.length)return null;const raw=await c.fetchOne(uids.at(-1),META,{uid:true});if(!raw)return null;const m=messageFrom(raw,a.id,folder,box.uidValidity);Object.assign(m,await body(c,m,12000));delete m._parts;delete m._inline;delete m._calendar;return m;}if(command==='test')return {connected:true,total:box.exists||0};if(command==='folders')return (await c.list()).map(f=>({path:f.path,name:f.name||f.path,specialUse:f.specialUse||''}));if(command==='read'){if(!/^\d+$/.test(String(p.uid)))throw new Error('UID 无效');if(p.uidValidity&&String(box.uidValidity)!==String(p.uidValidity))throw new Error('邮箱已重建，请重新同步');const raw=await c.fetchOne(p.uid,META,{uid:true});if(!raw)throw new Error('邮件不存在，请刷新');const m=messageFrom(raw,a.id,folder,box.uidValidity);Object.assign(m,await body(c,m,p.preview?16000:120000,!p.preview));delete m._parts;delete m._inline;delete m._calendar;return m;}
 let criteria=p.unread?{seen:false}:{all:true},range=null;if(command==='day'){range=dayRange(p.day);criteria={since:new Date(range.start-86400000),before:new Date(range.end+86400000)};}else if(p.query){const q=String(p.query).slice(0,200);criteria={...criteria,or:[{subject:q},{body:q},{from:q}]};}
 if(command==='list'){
 if(p.from)criteria.from=String(p.from).slice(0,200);if(p.to)criteria.to=String(p.to).slice(0,200);
 if(p.startDay||p.endDay){const start=p.startDay?dayRange(p.startDay).start:null,end=p.endDay?dayRange(p.endDay).end:null;if(start&&end&&start>=end)throw new Error('开始日期不能晚于结束日期');if(start)criteria.since=new Date(start-86400000);if(end)criteria.before=new Date(end+86400000);range={start:start??-Infinity,end:end??Infinity};}
 }
 let uids=await c.search(criteria,{uid:true});if(!Array.isArray(uids))uids=[];uids.sort((a,b)=>b-a);const cursor=Number(p.cursor||0);if(cursor)uids=uids.filter(n=>n<cursor);const limit=Math.max(1,Math.min(100,Number(p.limit)||30));const selected=[];let scannedCursor=null,hasMore=false,failed=[];
 const batch=range||p.hasAttachment?100:limit;for(let i=0;i<uids.length;i+=batch){const chunk=uids.slice(i,i+batch),rows=[];for await(const raw of c.fetch(chunk,META,{uid:true}))rows.push(raw);rows.sort((a,b)=>b.uid-a.uid);const seen=new Set(rows.map(r=>r.uid));failed.push(...chunk.filter(u=>!seen.has(u)).map(String));for(const raw of rows){scannedCursor=raw.uid;const time=new Date(raw.internalDate||raw.envelope?.date).getTime();if(range&&(time<range.start||time>=range.end))continue;const message=messageFrom(raw,a.id,folder,box.uidValidity);if(p.hasAttachment&&!message.attachments.length)continue;selected.push(message);if(selected.length>=limit){hasMore=uids.some(u=>u<raw.uid);break;}}if(selected.length>=limit)break;}
 for(const m of selected){if(p.includeBodies){try{Object.assign(m,await body(c,m));}catch{m.bodyError='正文读取失败';m.text='';}}delete m._parts;delete m._inline;delete m._calendar;}return {messages:selected,uidValidity:String(box.uidValidity),nextCursor:hasMore?String(scannedCursor):null,totalMailbox:box.exists||0,failed,complete:!hasMore&&failed.length===0};});},close(){closed=true;clearInterval(reap);pool.clear();for(const c of live){try{c.close();}catch{}}live.clear();}};
}
