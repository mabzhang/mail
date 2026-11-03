import crypto from 'node:crypto';
export function createMailCache(store,mail,{now=Date.now,ttl=30000}={}){
 const pending=new Map();const stamp=(id,folder)=>'mailbox-stamp-'+crypto.createHash('sha256').update(id+'|'+folder).digest('hex')+'.json';
 const key=(cmd,id,p)=>'cache-'+crypto.createHash('sha256').update(JSON.stringify(['mail-render-v6-calendar',cmd,id,p,store.account(id)])).digest('hex')+'.json';
 function cached(cmd,id,p={}){if(cmd==='read'){const current=store.read(stamp(id,p.folder||'INBOX'),null);if(current&&String(current.uidValidity)!==String(p.uidValidity))return null;}const k=key(cmd,id,p);return store.read(k,null);}
 async function load(cmd,id,p={}){const k=key(cmd,id,p);if(pending.has(k))return pending.get(k);const job=Promise.resolve().then(()=>mail(cmd,id,p)).then(data=>{if(cmd==='list'&&data.uidValidity)store.write(stamp(id,p.folder||'INBOX'),{uidValidity:data.uidValidity});store.write(k,{data,updatedAt:now()});trim();return data;}).finally(()=>pending.delete(k));pending.set(k,job);return job;}
 function trim(){const all=store.cacheFiles?.()||[];if(all.length>120)for(const f of all.sort((a,b)=>b.time-a.time).slice(120))store.removeCache(f.name);}
 async function get(cmd,id,p={},force=false){if(cmd==='read'){const current=store.read(stamp(id,p.folder||'INBOX'),null);if(current&&String(current.uidValidity)!==String(p.uidValidity))throw new Error('邮箱已重建，请重新同步');}const old=cached(cmd,id,p);if(!force&&old&&now()-old.updatedAt<(cmd==='read'?86400000:cmd==='folders'?300000:ttl))return {...(Array.isArray(old.data)?{items:old.data}:old.data),cached:true,updatedAt:old.updatedAt};const data=await load(cmd,id,p);return {...(Array.isArray(data)?{items:data}:data),cached:false,updatedAt:now()};}
 return {cached,load,get};
}
