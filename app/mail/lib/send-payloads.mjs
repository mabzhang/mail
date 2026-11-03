import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
// Large original-mail images stay in private encrypted staging. Runtime requests
// carry only the explicitly confirmed ticket and its immutable content hash.
export function createSendPayloads(store,{now=Date.now}={}){
 const file=id=>{if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(id)))throw new Error('发送确认标识无效');return 'send-payload-'+id+'.json';};
 const hashOf=value=>crypto.createHash('sha256').update(value).digest('hex');
 function stage(id,message,expiresAt){const text=JSON.stringify(message),hash=hashOf(text);if(Buffer.byteLength(text)>40*1024*1024)throw new Error('发送预览过大，请减少引用内容');store.write(file(id),{hash,expiresAt,released:false,sealed:store.encrypt(text)});return hash;}
 function load(id,hash,requireRelease=true){const p=store.read(file(id),null);if(!p||p.expiresAt<now())throw new Error('发送确认已过期，请重新预览');if(p.hash!==hash||requireRelease&&!p.released)throw new Error('发送内容未经确认或已更改');const text=store.decrypt(p.sealed);if(hashOf(text)!==hash)throw new Error('发送内容已更改，请重新预览');return {record:p,message:JSON.parse(text)};}
 function release(id,hash){const {record}=load(id,hash,false);store.write(file(id),{...record,released:true});}
 function remove(id){try{fs.unlinkSync(path.join(store.dir,file(id)));}catch(e){if(e.code!=='ENOENT')throw e;}}
 function prune(){for(const name of fs.readdirSync(store.dir)){if(!/^send-payload-[0-9a-f-]+\.json$/i.test(name))continue;const p=store.read(name,null);if(!p||p.expiresAt<now())try{fs.unlinkSync(path.join(store.dir,name));}catch{}}}
 return {stage,release,load:(id,hash)=>load(id,hash).message,remove,prune};
}
