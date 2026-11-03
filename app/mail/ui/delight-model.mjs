export const CITIES=[['beijing','北京'],['shanghai','上海'],['nanjing','南京'],['chengdu','成都'],['guangzhou','广州'],['hefei','合肥'],['shenzhen','深圳'],['hangzhou','杭州'],['hongkong','香港']];
export const cityLabel=id=>CITIES.find(x=>x[0]===id)?.[1]||'上海';
export function accountEmails(accounts=[],activeId=''){
 const rows=[...accounts].sort((a,b)=>Number(b.id===activeId)-Number(a.id===activeId));
 return [...new Set(rows.map(a=>String(a.email||'').trim()).filter(Boolean))];
}
export function validPreferences(value={}){return {city:CITIES.some(x=>x[0]===value.city)?value.city:'shanghai',cityMode:value.cityMode==='manual'?'manual':'auto',mode:['day','night','auto'].includes(value.mode)?value.mode:'auto',weather:value.weather===true};}
export function cityDay(now=Date.now(),zone='Asia/Shanghai'){try{return new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}catch{return '';}}
export function clockText(now=Date.now(),zone='Asia/Shanghai'){try{return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now));}catch{return '—';}}
export function sunContext(data,now=Date.now()){
 const zone=data?.timeZone||'Asia/Shanghai',clock=clockText(now,zone),hour=Number(clock.slice(0,2)),period=hour<6?'night':hour<12?'morning':hour<17?'afternoon':hour<20?'evening':'night';
 const sun=data?.sun,start=Date.parse(sun?.sunriseAt),end=Date.parse(sun?.sunsetAt),currentDay=cityDay(now,zone);
 const valid=sun?.date===currentDay&&Number.isFinite(start)&&Number.isFinite(end)&&end>start;
 const phase=valid?(now<start?'before-sunrise':now>=end?'after-sunset':'day'):(hour>=7&&hour<19?'day':'after-sunset');
 return {clock,period,phase,valid,progress:valid?Math.max(0,Math.min(1,(now-start)/(end-start))):null,mode:phase==='day'?'day':'night',sunrise:valid?sun.sunrise:'—',sunset:valid?sun.sunset:'—',date:currentDay};
}
export function weatherCaption(data,enabled=true,now=Date.now()){
 if(!enabled||data?.status==='disabled')return '天气已关闭';
 if(!data)return '天气更新中';
 if(data.status==='loading')return '正在更新天气';
 if(!data.current)return '等待天气连接 · 可点击重试';
 const observed=Date.parse(data.observedAt);
 const zone=data.timeZone||'Asia/Shanghai',stamp=at=>((cityDay(at,zone)!==cityDay(now,zone))?cityDay(at,zone)+' ':'')+clockText(at,zone);
 if(data.source?.type==='forecast')return (data.stale?'上次预报 ':'预报 ')+stamp(data.validAt||data.fetchedAt)+' · 每2小时更新';
 if(data.stale&&Number.isFinite(observed))return '上次观测 '+stamp(observed)+' · 每2小时更新';
 if(!Number.isFinite(observed))return (data.fetchedAt?'获取 '+stamp(data.fetchedAt)+' · ':'')+'每2小时更新';
 return '观测 '+stamp(observed)+' · 每2小时更新';
}
export function nextMeeting(rows=[],now=Date.now()){return [...rows].filter(x=>!x.done&&!x.cancelled&&!x.allDay&&!['cancelled','done'].includes(x.status)&&Number.isFinite(Date.parse(x.start))&&Date.parse(x.start)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0]||null;}
