import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const ID=/^[a-f0-9-]{36}$/i;export const MAX_FILE=20*1024*1024,MAX_TOTAL=25*1024*1024;
export function createAttachments(store){
 const dir=path.join(store.dir,'attachments');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=id=>{if(!ID.test(String(id)))throw new Error('附件标识无效');return path.join(dir,id+'.bin');};
 const meta=id=>{file(id);const m=store.read('attachment-'+id+'.json',null);if(!m)throw new Error('附件不存在');return m;};
 function start(p){const size=Number(p.size),name=String(p.name||'').replace(/[\x00-\x1f\/\\]/g,'_').slice(0,180);if(!name||!Number.isSafeInteger(size)||size<1||size>MAX_FILE)throw new Error('每个附件须在 1 字节到 20 MB 之间');const m={id:crypto.randomUUID(),name,size,type:String(p.type||'application/octet-stream').slice(0,100),received:0,ready:false,createdAt:Date.now()};fs.writeFileSync(file(m.id),Buffer.alloc(0),{mode:0o600,flag:'wx'});store.write('attachment-'+m.id+'.json',m);return m;}
 function chunk(p){const m=meta(p.id);if(m.ready||Number(p.offset)!==m.received)throw new Error('附件上传位置不一致，请重新添加');if(!/^[A-Za-z0-9+/]*={0,2}$/.test(String(p.data||'')))throw new Error('附件分片无效');const b=Buffer.from(p.data,'base64');if(!b.length||b.length>256*1024||m.received+b.length>m.size)throw new Error('附件分片超出范围');fs.appendFileSync(file(m.id),b);m.received+=b.length;if(m.received===m.size){m.hash=crypto.createHash('sha256').update(fs.readFileSync(file(m.id))).digest('hex');m.ready=true;}store.write('attachment-'+m.id+'.json',m);return m;}
 function resolve(ids){if(!Array.isArray(ids)||ids.length>30)throw new Error('最多添加 30 个附件');const rows=[...new Set(ids)].map(id=>meta(id));if(rows.some(m=>!m.ready))throw new Error('请等待附件上传完成');if(rows.reduce((n,m)=>n+m.size,0)>MAX_TOTAL)throw new Error('附件合计不能超过 25 MB');for(const m of rows){const b=fs.readFileSync(file(m.id));if(b.length!==m.size||crypto.createHash('sha256').update(b).digest('hex')!==m.hash)throw new Error('附件已更改，请重新添加');}return rows.map(({id,name,size,type,hash})=>({id,name,size,type,hash}));}
 const content=m=>{const valid=resolve([m.id])[0];if(valid.hash!==m.hash)throw new Error('附件与发送预览不一致');return fs.readFileSync(file(m.id));};
 return {start,chunk,resolve,meta,content};
}
