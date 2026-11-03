import crypto from 'node:crypto';
import {cleanHtml,escapeHtml,htmlText} from './mail-html.mjs';
const own=s=>[...String(s||'').matchAll(/[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map(m=>m[0].toLowerCase());
const unquoted=s=>String(s||'').split(/\n(?:[-_]{3,}[^\n]*(?:原邮件|Original Message)|On .+wrote:|发件人[:：]|From:\s)/i)[0].replace(/^>.*$/gm,'').trim();
export function extractSignature(message,email){
 const body=unquoted(message.text||htmlText(message.html)),tail=body.split('\n').slice(-35);let start=-1;
 for(let i=0;i<tail.length;i++)if(own(tail[i]).includes(email.toLowerCase()))start=i;
 if(start<0||/(?:请|麻烦|联系我|reply to|contact me)/i.test(tail[start]))return null;
 let begin=start;while(begin>0&&start-begin<6){const previous=tail[begin-1].trim();if(!previous||previous.length>140||/[。！？!?]/.test(previous)||/(?:请|麻烦|核对|确认|附件|收到|项目需求|原邮件)/i.test(previous))break;if(/^(?:--\s*|此致|敬礼|谢谢[！!。.]?|Regards[,!]?|Best(?: regards)?[,!]?|Thanks[,!]?)$/i.test(previous))break;begin--;}
 let selected=tail.slice(begin),disclaimer=selected.findIndex(x=>/^\s*(?:此邮件|本电子邮件|本电子郵件|This (?:email|communication)|You are hereby notified)/i.test(x));if(disclaimer>=0)selected=selected.slice(0,disclaimer);
 if(selected.length>20)selected=selected.slice(0,20);const text=selected.join('\n').trim().slice(0,6000);if(!text||selected.filter(x=>x.trim()).length<2)return null;
 const html=cleanHtml(String(message.html||'').replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi,''),{remote:false});
 // Only embed already downloaded local signature images occurring after this sender's address.
 const emailAt=html.toLowerCase().lastIndexOf(email.toLowerCase());const images=emailAt>=0?[...html.slice(emailAt).matchAll(/<img\b[^>]*src="(data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)"[^>]*>/gi)].filter(x=>x[1].length<280000).slice(0,1).map(m=>'<img width="320" alt="签名图片" src="'+m[1]+'">').join(''):'';
 return {text,html:'<div>'+escapeHtml(text).replace(/\n/g,'<br>')+'</div>'+images};
}
export function consolidateSignatures(items){
 const groups=new Map();for(const x of items){const normalized=x.text.toLowerCase().replace(/\s+/g,' ').replace(/[，,;；|]/g,'').trim(),key=crypto.createHash('sha256').update(normalized).digest('hex');const old=groups.get(key);if(old)old.count++;else groups.set(key,{...x,count:1,key});}
 const ranked=[...groups.values()].sort((a,b)=>b.count-a.count||b.text.length-a.text.length),chosen=[],languages=new Set();const language=x=>{const content=x.text.split('\n').filter(v=>!/@|(?:Tel|Email|E-mail|电话|地址|邮箱)[:：]/i.test(v)).join(' '),cn=(content.match(/[\u4e00-\u9fff]/g)||[]).length,en=(content.match(/[a-z]{2,}/gi)||[]).length;return cn>=4?(en>=5?'bilingual':'chinese'):'english';};for(const x of ranked){const l=language(x);if(!languages.has(l)&&chosen.length<3){chosen.push(x);languages.add(l);}}for(const x of ranked)if(chosen.length<3&&!chosen.includes(x))chosen.push(x);
 const tokens=s=>new Set(s.toLowerCase().match(/[a-z@.0-9]+|[\u4e00-\u9fff]{2,}/g)||[]);
 for(const x of ranked.filter(x=>!chosen.includes(x))){const tx=tokens(x.text);let best=0,score=-1;for(let i=0;i<chosen.length;i++){const t=tokens(chosen[i].text),n=[...tx].filter(v=>t.has(v)).length/(Math.max(1,tx.size+t.size));if(n>score){score=n;best=i;}}chosen[best].count+=x.count;}
 return {variants:chosen.map((x,i)=>({id:crypto.randomUUID(),name:'签名 '+(i+1),text:x.text,html:x.html,sampleCount:x.count,source:'history'})),originalTypes:ranked.length,merged:ranked.length>3};
}
export function createSignatures({store,mail}){
 const jobs=new Map();const status=id=>jobs.get(id)||{state:'interrupted',message:'提取任务已中断，请手动重试。'};
 function start(accountId,count=50){const a=store.account(accountId);count=Number(count);if(!Number.isInteger(count)||count<50||count>500)throw new Error('签名扫描数量须为 50 到 500 封');const active=[...jobs.values()].find(j=>j.accountId===accountId&&j.state==='running');if(active)return active;for(const [id,j]of jobs)if(j.state!=='running')jobs.delete(id);const j={id:crypto.randomUUID(),accountId,state:'running',scanned:0,message:'正在后台提取本人历史签名，请保持 App 运行。'};jobs.set(j.id,j);
 void (async()=>{const folders=await mail('folders',accountId),sent=folders.find(f=>f.specialUse==='\\Sent')||folders.find(f=>/^(Sent|Sent Messages|Sent Items|已发送)$/i.test(f.path));if(!sent)throw new Error('未找到已发送目录');let cursor=null,seen=new Set(),items=[],pages=0;while(j.scanned<count&&pages++<100){if(store.account(accountId).email!==a.email)throw new Error('账号已变化，请重新提取');const page=await mail('list',accountId,{folder:sent.path,limit:100,cursor});for(const m of page.messages||[]){if(j.scanned>=count)break;if(!own(m.from).includes(a.email.toLowerCase())||seen.has(m.messageId||m.id))continue;seen.add(m.messageId||m.id);const detail=await mail('read',accountId,{folder:sent.path,uid:m.uid,uidValidity:m.uidValidity});j.scanned++;const sig=extractSignature(detail,a.email);if(sig)items.push(sig);j.message='正在提取历史签名 '+j.scanned+' / '+count;}if(!page.nextCursor)break;if(page.nextCursor===cursor)throw new Error('邮箱分页未向前');cursor=page.nextCursor;}
 const result=consolidateSignatures(items);Object.assign(j,{state:'done',...result,matched:items.length,message:items.length?'已提取并整理，请核对后保存。':'未找到可确认属于本人的签名；请手动填写，未添加任何预设。'});})().catch(err=>Object.assign(j,{state:'failed',message:err.message}));return j;
 }
 return {start,status};
}
