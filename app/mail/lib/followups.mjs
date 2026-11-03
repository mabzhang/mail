import crypto from 'node:crypto';
export function createFollowups(store){
 const list=()=>store.read('followups.json',[]).sort((a,b)=>Number(a.done)-Number(b.done)||b.updatedAt-a.updatedAt);
 function save(p){const rows=list(),old=p.id?rows.find(x=>x.id===p.id):null;if(p.id&&!old)throw new Error('事项不存在');const title=String(p.title??old?.title??'').trim().slice(0,300);if(!title)throw new Error('请填写跟进事项');const source=p.source||old?.source;const item={id:old?.id||crypto.randomUUID(),title,done:p.done===undefined?old?.done||false:p.done===true,due:String(p.due??old?.due??'').slice(0,100),notes:String(p.notes??old?.notes??'').slice(0,2000),source:source?{id:String(source.id||''),accountId:String(source.accountId||''),folder:String(source.folder||''),uid:String(source.uid||''),uidValidity:String(source.uidValidity||''),subject:String(source.subject||'').slice(0,300)}:null,createdAt:old?.createdAt||Date.now(),updatedAt:Date.now()};if(rows.length>=3000&&!old)throw new Error('本地跟进事项已达 3000 条');store.write('followups.json',[...rows.filter(x=>x.id!==item.id),item]);return item;}
 function remove(id){const rows=list();if(!rows.some(x=>x.id===id))throw new Error('事项不存在');store.write('followups.json',rows.filter(x=>x.id!==id));return {removed:true};}
 return {list,save,remove};
}
