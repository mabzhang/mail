import crypto from 'node:crypto';
import fs from 'node:fs';
import {dayKey,dayRange} from './store.mjs';
import {createActionCenter} from './action-center.mjs';
import {createFollowups} from './followups.mjs';

const FILE='calendar-events.json';
const INVITES_FILE='calendar-mail-invites.json';
const TYPES=['meeting','deadline','task'];
const IMPORTANT=['重要且急','重要','急'];
const PRIORITIES=['重要且急','重要','急','轻','缓'];
const ZONES={'China Standard Time':'Asia/Shanghai','Tokyo Standard Time':'Asia/Tokyo','Singapore Standard Time':'Asia/Singapore','Eastern Standard Time':'America/New_York','Pacific Standard Time':'America/Los_Angeles','GMT Standard Time':'Europe/London','W. Europe Standard Time':'Europe/Berlin'};
const str=(v,max=400)=>String(v??'').trim().slice(0,max);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex').slice(0,32);
const currentBody=v=>String(v||'').split(/\n\s*(?:发件人[:：]|From:|On .+ wrote:|[-_]{5,}|原始邮件)/i)[0].trim();
const addDay=(day,n=1)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function validDay(day){try{dayRange(day);return true;}catch{return false;}}
function zone(value){const z=ZONES[String(value)]||String(value||'');try{new Intl.DateTimeFormat('en',{timeZone:z}).format(0);return z;}catch{return null;}}
function zonedParts(ms,timeZone){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(ms).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));return [p.year,p.month,p.day,p.hour,p.minute,p.second];}
function wallTime(day,time,timeZone){
 if(!validDay(day)||!/^\d{2}:\d{2}(?::\d{2})?$/.test(time)||!zone(timeZone))return null;
 const [y,m,d]=day.split('-').map(Number),[h,min,s=0]=time.split(':').map(Number);if(h>23||min>59||s>59)return null;
 const desired=Date.UTC(y,m-1,d,h,min,s),offsets=new Set();
 for(const delta of [-129600000,0,129600000]){const ms=desired+delta,p=zonedParts(ms,timeZone);offsets.add(Date.UTC(p[0],p[1]-1,p[2],p[3],p[4],p[5])-ms);}
 const candidates=[...offsets].map(offset=>desired-offset).filter(ms=>{const p=zonedParts(ms,timeZone);return p[0]===y&&p[1]===m&&p[2]===d&&p[3]===h&&p[4]===min&&p[5]===s;});
 // A DST gap or overlap cannot be resolved from a floating wall-clock value alone.
 return candidates.length===1?new Date(candidates[0]).toISOString():null;
}
function inZone(value,timeZone){return new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function strictInstant(value,timeZone,day){
 const text=String(value||'');
 if(/^\d{2}:\d{2}(?::\d{2})?$/.test(text))return wallTime(day,text,timeZone);
 const m=text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2})?$/);
 if(!m||!validDay(m[1]))return null;
 const t=m[2].split(/[:.]/).map(Number);if(t[0]>23||t[1]>59||(t[2]||0)>59)return null;
 if(!m[3])return wallTime(m[1],m[2].split('.')[0],timeZone);
 if(m[3]!=='Z'&&(Number(m[3].slice(1,3))>23||Number(m[3].slice(4))>59))return null;
 const ms=Date.parse(text);return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
function datesIn(text,referenceDate){
 const values=[];let m;const re=/(?<!\d)(\d{4})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})(?:日)?(?!\d)/g;
 while((m=re.exec(text))){const day=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(validDay(day))values.push({day,index:m.index,text:m[0],yearFromMail:false});}
 const year=String(referenceDate||'').slice(0,4);if(/^\d{4}$/.test(year)){const short=/(?<![\d年/.-])(\d{1,2})\s*(?:月|[-/])\s*(\d{1,2})(?:日)?(?!\d|\s*[-/]\s*\d)/g;while((m=short.exec(text))){if(values.some(x=>m.index>=x.index&&m.index<x.index+x.text.length))continue;const day=`${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;if(validDay(day))values.push({day,index:m.index,text:m[0],yearFromMail:true});}}
 return values;
}
function timesIn(text){
 const values=[];let m;const re=/(?<!\d)(?:上午|下午|晚上|中午)?\s*(\d{1,2})[:：](\d{2})(?::(\d{2}))?(?!\d)/g;
 while((m=re.exec(text))){let h=Number(m[1]),min=Number(m[2]),s=Number(m[3]||0);if(/下午|晚上|中午/.test(m[0])&&h<12)h+=12;if(h<24&&min<60&&s<60)values.push({time:`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`,index:m.index});}
 const chinese=/(上午|下午|晚上|中午)?\s*(\d{1,2})(?:点|时)(?:(\d{1,2})分|(半))?/g;
 while((m=chinese.exec(text))){let h=Number(m[2]),min=m[4]?30:Number(m[3]||0);if(/下午|晚上|中午/.test(m[1])&&h<12)h+=12;if(h<24&&min<60)values.push({time:`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`,index:m.index});}
 return values.sort((a,b)=>a.index-b.index);
}
function clockOf(value,timeZone){if(/^\d{2}:\d{2}/.test(String(value)))return String(value).slice(0,5);const ms=Date.parse(value);if(!Number.isFinite(ms))return '';const p=zonedParts(ms,timeZone);return String(p[3]).padStart(2,'0')+':'+String(p[4]).padStart(2,'0');}
function sourceOf(m){return {id:str(m.id,500),accountId:str(m.accountId,100),folder:str(m.folder||'INBOX',300),uid:str(m.uid,80),uidValidity:str(m.uidValidity,80),subject:str(m.subject,400),from:str(m.from,500)};}
function people(values){return (Array.isArray(values)?values:[]).slice(0,100).map(v=>typeof v==='string'?{name:str(v,200),email:''}:{name:str(v?.name,200),email:str(v?.email,254),status:str(v?.status,40)}).filter(x=>x.name||x.email);}
function person(value){if(value&&typeof value==='object')return {name:str(value.name,200),email:str(value.email,254)};return str(value,400);}
function safeUrl(value){const v=str(value,2000);if(!v)return '';try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?v:'';}catch{return '';}}
function textZone(evidence,fallback,day){
 const found=[];let unknown=false;
 for(const [pattern,timeZone]of [[/北京时间|上海时间|中国标准时间/,'Asia/Shanghai'],[/东京时间|日本(?:标准)?时间|\bJST\b/i,'Asia/Tokyo'],[/新加坡时间/,'Asia/Singapore'],[/香港时间/,'Asia/Hong_Kong'],[/台北时间/,'Asia/Taipei'],[/纽约时间|美国东部时间/,'America/New_York'],[/洛杉矶时间|美国太平洋时间/,'America/Los_Angeles'],[/伦敦时间|英国时间/,'Europe/London'],[/柏林时间|德国时间/,'Europe/Berlin'],[/悉尼时间/,'Australia/Sydney']])if(pattern.test(evidence))found.push(timeZone);
 const offsets=[...evidence.matchAll(/\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?\b/gi)];
 for(const m of offsets){const offset=m[1]+m[2].padStart(2,'0')+':'+(m[3]||'00');if(Number(m[2])>23||Number(m[3]||0)>59||!zone(offset))unknown=true;else found.push(offset);}
 if(/\b(?:UTC|GMT)\b(?!\s*[+-])/i.test(evidence))found.push('UTC');
 for(const m of evidence.matchAll(/\b(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?\b/g)){const timeZone=zone(m[0]);if(timeZone)found.push(timeZone);else unknown=true;}
 // Broad regional names and CST cannot identify a unique civil timezone.
 if(/澳大利亚时间|美国时间|\bCST\b/i.test(evidence)||/\b(?:UTC|GMT)\s*[+-]/i.test(evidence)&&!offsets.length)unknown=true;
 const unique=[...new Set(found)],instants=day?unique.map(timeZone=>wallTime(day,'12:00',timeZone)):[];
 if(unknown||unique.length>1&&(!instants.length||instants.some(x=>!x)||new Set(instants).size>1))return null;
 return unique[0]||fallback;
}

// AI can describe a meeting, but only a verbatim current-body quote can supply its slot.
export function normalizeMeetingDetails(raw,message,{timeZone='Asia/Shanghai'}={}){
 const top=currentBody(message.text),tz=zone(timeZone)||'Asia/Shanghai';
 return (Array.isArray(raw)?raw:[]).slice(0,24).filter(x=>x&&typeof x==='object').flatMap(x=>{
  const evidence=str(x.evidence,4000);if(evidence.length<4||!top.includes(evidence))return [];
  const dates=datesIn(evidence,message.date),requested=str(x.day||x.date,10),unique=[...new Set(dates.map(d=>d.day))],date=dates.find(d=>d.day===requested)||(!requested&&unique.length===1?dates[0]:null);
  const evidenceZone=textZone(evidence,tz,date?.day),timeZone=evidenceZone||tz,nextDate=date?dates.filter(d=>d.index>date.index).sort((a,b)=>a.index-b.index)[0]:null,times=timesIn(evidence).filter(t=>!date||(t.index>=date.index+date.text.length&&(!nextDate||t.index<nextDate.index))),startClock=clockOf(x.start||x.time||'',timeZone),endClock=clockOf(x.end||'',timeZone);
  const st=startClock?times.find(t=>t.time===startClock):times[0],et=endClock?times.find(t=>t.time===endClock&&(!st||t.index>st.index)):null;
  const allDay=x.allDay===true&&/全天|all[ -]?day/i.test(evidence),start=date&&st&&evidenceZone?wallTime(date.day,st.time,timeZone):null;
  let end=date&&et&&evidenceZone?wallTime(date.day,et.time,timeZone):null;if(end&&start&&end<=start)end=null;
  const reason=!date?'会议日期待核对':!allDay&&!st?'会议时刻待核对':!allDay&&!start?'会议时区或夏令时待核对':'';
  const organizer=person(x.organizer),knownPerson=v=>typeof v==='string'?!!v&&evidence.includes(v):!!((v.name&&evidence.includes(v.name))||(v.email&&evidence.includes(v.email))),location=str(x.location,500),url=safeUrl(x.url);
  return [{title:str(x.title||message.subject||'会议',300),day:reason?null:date.day,proposedDay:date?.day||null,start:allDay&&date?date.day:start,end:allDay&&date?addDay(date.day):end,allDay,timeZone,organizer:knownPerson(organizer)?organizer:'',attendees:people(x.attendees||x.participants).filter(knownPerson),location:location&&evidence.includes(location)?location:'',url:url&&evidence.includes(url)?url:'',summary:str(x.summary,1000),evidence,evidenceVerified:true,dateVerified:!!date,timeVerified:allDay||!!start,yearFromMail:date?.yearFromMail===true,needsReview:!!reason,reviewReason:reason}];
 });
}

const unescapeIcs=v=>String(v||'').replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1');
function property(line){let quote=false,index=-1;for(let i=0;i<line.length;i++){if(line[i]==='"')quote=!quote;if(line[i]===':'&&!quote){index=i;break;}}if(index<0)return null;const fields=line.slice(0,index).split(/;(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/),name=fields.shift().toUpperCase(),params={};for(const f of fields){const i=f.indexOf('=');if(i>0)params[f.slice(0,i).toUpperCase()]=f.slice(i+1).replace(/^"|"$/g,'');}return {name,params,value:line.slice(index+1)};}
function icsDate(p,fallback){
 if(!p)return {day:null,start:null,allDay:false,timeZone:fallback,reason:'邀请未提供开始时间'};
 const value=p.value;if(/^\d{8}$/.test(value)){const day=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);return validDay(day)?{day,start:day,allDay:true,timeZone:zone(p.params.TZID)||fallback}:{day:null,start:null,allDay:true,timeZone:fallback,reason:'邀请日期无效'};}
 const m=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);if(!m)return {day:null,start:null,allDay:false,timeZone:fallback,reason:'邀请时间格式待核对'};
 const day=`${m[1]}-${m[2]}-${m[3]}`,time=`${m[4]}:${m[5]}:${m[6]||'00'}`,timeZone=m[7]?'UTC':p.params.TZID?zone(p.params.TZID):fallback;
 const start=timeZone?(m[7]?strictInstant(day+'T'+time+'Z',timeZone,day):wallTime(day,time,timeZone)):null;
 return {day:start?day:null,start,allDay:false,timeZone:timeZone||str(p.params.TZID,200),floating:!m[7]&&!p.params.TZID,reason:start?'':!timeZone?'邀请时区无法识别':'邀请时刻无效或夏令时待核对'};
}
function icsPerson(p){return p?{name:str(unescapeIcs(p.params.CN),200),email:str(p.value.replace(/^mailto:/i,''),254),status:str(p.params.PARTSTAT,40)}:'';}
export function parseCalendarInvites(text,{timeZone='Asia/Shanghai'}={}){
 const input=String(text||'');if(input.length>262144)return [];
 const lines=input.replace(/\r?\n[ \t]/g,'').split(/\r?\n/),events=[];let event=null,method='',nested=0;
 for(const line of lines){const p=property(line);if(!p)continue;if(p.name==='METHOD'&&!event)method=p.value.toUpperCase();if(p.name==='BEGIN'&&p.value.toUpperCase()==='VEVENT'){event=[];nested=0;continue;}if(!event)continue;if(p.name==='BEGIN'){nested++;continue;}if(p.name==='END'&&p.value.toUpperCase()==='VEVENT'){
  const entries=event,eventGet=name=>entries.find(x=>x.name===name),value=name=>unescapeIcs(eventGet(name)?.value),d=icsDate(eventGet('DTSTART'),zone(timeZone)||'Asia/Shanghai'),e=eventGet('DTEND')?icsDate(eventGet('DTEND'),d.timeZone):null;
  let end=e?.start||null;if(end&&d.start&&end<=d.start)end=null;
  if(d.allDay&&!end&&d.day)end=addDay(d.day);
  const duration=eventGet('DURATION')?.value?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);if(!end&&duration&&d.start&&!d.allDay){const seconds=Number(duration[1]||0)*86400+Number(duration[2]||0)*3600+Number(duration[3]||0)*60+Number(duration[4]||0);if(seconds>0&&seconds<=366*86400)end=new Date(Date.parse(d.start)+seconds*1000).toISOString();}
  const recurrenceId=value('RECURRENCE-ID'),uid=str(value('UID'),1000),seq=Number(value('SEQUENCE'));events.push({title:str(value('SUMMARY')||'会议邀请',300),...d,end,organizer:icsPerson(eventGet('ORGANIZER')),attendees:entries.filter(x=>x.name==='ATTENDEE').slice(0,100).map(icsPerson),location:str(value('LOCATION'),500),url:safeUrl(value('URL')||value('X-MICROSOFT-SKYPETEAMSMEETINGURL')||value('DESCRIPTION').match(/https?:\/\/[^\s<>]+/)?.[0]),summary:str(value('DESCRIPTION'),2000),inviteUid:uid,sequence:Number.isInteger(seq)&&seq>=0?seq:0,recurrenceId,recurrence:str(value('RRULE'),1000),stamp:icsDate(eventGet('LAST-MODIFIED')||eventGet('DTSTAMP'),'UTC').start,cancelled:method==='CANCEL'||value('STATUS').toUpperCase()==='CANCELLED',status:method==='CANCEL'||value('STATUS').toUpperCase()==='CANCELLED'?'cancelled':value('STATUS').toLowerCase()||'confirmed',method,evidence:'ICS DTSTART: '+(eventGet('DTSTART')?.value||'未提及'),needsReview:!!d.reason,reviewReason:d.reason||''});event=null;continue;
 }if(p.name==='END'){nested=Math.max(0,nested-1);continue;}if(!nested)event.push(p);}
 return events;
}
function baseEvent(m,type,title){const a=m.analysis||{};return {id:'',type,title:str(title,300),day:null,start:null,end:null,allDay:false,timeZone:'Asia/Shanghai',project:str(a.project||a.category||'其他',120),organizer:'',attendees:[],location:'',url:'',summary:str(a.summary,1000),priority:PRIORITIES.includes(a.priority)?a.priority:'重要',done:false,source:sourceOf(m),origin:'mail',status:'pending',needsReview:false};}
function inviteTexts(m){const parts=Array.isArray(m.calendarParts)?m.calendarParts:[],result=parts.filter(p=>typeof p==='string'||(!p.truncated&&p.text)).map(p=>typeof p==='string'?p:p.text);for(const v of [m.ics,m.calendar])if(typeof v==='string')result.push(v);if(String(m.text||'').includes('BEGIN:VCALENDAR'))result.push(m.text);return [...new Set(result)];}
function inviteKey(event,sourceId){return 'invite-'+hash((event.inviteUid||sourceId)+'|'+event.recurrenceId);}
function mergeInvites(group){group.sort((a,b)=>a.sequence-b.sequence||(Date.parse(a.stamp)||0)-(Date.parse(b.stamp)||0)||(Date.parse(a.sourceDate)||a._received||0)-(Date.parse(b.sourceDate)||b._received||0));let merged=group[0];for(const next of group.slice(1)){const previous=merged;merged={...merged,...next};if(next.cancelled){for(const key of ['organizer','location','url','summary'])if(!next[key])merged[key]=previous[key];if(!next.attendees.length)merged.attendees=previous.attendees;if(next.title==='会议邀请')merged.title=previous.title;}if(next.cancelled&&!next.start){const dated=group.filter(x=>x.start&&x.sequence<=next.sequence).at(-1);if(dated)for(const key of ['day','start','end','allDay','timeZone'])merged[key]=dated[key];merged.needsReview=!merged.start;merged.reviewReason=merged.start?'':'取消邀请没有可核对的原定时间';}}delete merged._received;return merged;}
function savedMessages(store){
 const rows=[],seen=new Map();let updatedAt=0;for(const day of store.archive()){const report=store.report(day);updatedAt=Math.max(updatedAt,Number(report?.updatedAt)||0);for(const m of report?.messages||[])rows.push({...m,_updatedAt:Number(report.updatedAt)||0});}
 if(store.dir)for(const name of fs.readdirSync(store.dir).filter(x=>/^period-report-[a-f0-9]{32}\.json$/.test(x))){const report=store.read(name,null);updatedAt=Math.max(updatedAt,Number(report?.updatedAt)||0);for(const m of report?.messages||[])rows.push({...m,_updatedAt:Number(report.updatedAt)||0});}
 for(const file of store.cacheFiles?.()||[]){const cached=store.read(file.name,null);updatedAt=Math.max(updatedAt,Number(cached?.updatedAt)||0);const data=cached?.data;if(data?.id)rows.push({...data,_updatedAt:Number(cached.updatedAt)||0});else if(Array.isArray(data?.messages))for(const m of data.messages)rows.push({...m,_updatedAt:Number(cached.updatedAt)||0});}
 const observed=store.read(INVITES_FILE,{items:[],updatedAt:0});updatedAt=Math.max(updatedAt,Number(observed.updatedAt)||0);for(const item of observed.items||[])rows.push({...item.source,date:item.event.sourceDate,calendarInviteEvents:[item.event],_updatedAt:Number(item.updatedAt)||0});
 for(const m of rows.sort((a,b)=>a._updatedAt-b._updatedAt)){if(!m.id)continue;const old=seen.get(m.id)||{},merged={...old,...m};if(!m.analysis&&old.analysis)merged.analysis=old.analysis;if(!m.text&&old.text)merged.text=old.text;if(!m.calendarParts?.length&&old.calendarParts?.length)merged.calendarParts=old.calendarParts;merged.calendarInviteEvents=[...(old.calendarInviteEvents||[]),...(m.calendarInviteEvents||[])];seen.set(m.id,merged);}
 return {messages:[...seen.values()],updatedAt};
}
function deadlineFor(item,m,timeZone){
 const text=currentBody(m?.text),evidence=str(item.evidence,400),evidenceDates=datesIn(evidence,m?.date);
 // A mail-level deadline must not be copied onto every unrelated action in that mail.
 if(evidence&&(!text.includes(evidence)||!evidenceDates.length))return null;
 if(!evidence){const a=m?.analysis||{},count=Array.isArray(a.actions)&&a.actions.length?a.actions.filter(x=>['todo','confirm'].includes(x.kind)).length:(a.todos?.length||0)+(a.confirmations?.length||0);if(count>1)return null;}
 const proposed=evidenceDates.length?evidenceDates:datesIn(item.deadline,m?.date),proof=datesIn(text,m?.date);let match=null;
 for(const date of proposed){const d=proof.find(x=>x.day===date.day&&/(?:截止|最迟|不晚于|之前|前|请于|需于|务必|deadline|\bdue\b|\bby\b)/i.test(text.slice(Math.max(0,x.index-35),x.index+x.text.length+35)));if(d){match=d;break;}}
 if(!match&&evidence&&text.includes(evidence)&&/(?:截止|最迟|不晚于|之前|前|请于|需于|务必|deadline|\bdue\b|\bby\b)/i.test(evidence)){const ds=datesIn(evidence,m?.date);if(new Set(ds.map(x=>x.day)).size===1)match=ds[0];}
 if(!match)return null;
 const near=text.slice(Math.max(0,match.index-15),match.index+match.text.length+35),times=timesIn(near),start=times.length===1?wallTime(match.day,times[0].time,timeZone):null;
 return {day:match.day,start:start||match.day,end:start?null:addDay(match.day),allDay:!start,evidence:near.trim(),yearFromMail:match.yearFromMail};
}
export function calendarRange({start,end}){dayRange(start);dayRange(end);if(start>end)throw new Error('开始日期不能晚于结束日期');if((dayRange(end).end-dayRange(start).start)/86400000>366)throw new Error('一次最多查看 366 天');return {start,end};}

export function createCalendar(store,{now=Date.now}={}){
 const actions=createActionCenter(store),followups=createFollowups(store);
 const state=()=>store.read(FILE,{version:1,events:[],overrides:{},updatedAt:0});
 function observeMessage(message){
  if(!message?.id)return {observed:0};const timeZone=zone(store.settings().timezone)||'Asia/Shanghai',invites=inviteTexts(message).flatMap(text=>parseCalendarInvites(text,{timeZone})).slice(0,20);if(!invites.length)return {observed:0};
  const saved=store.read(INVITES_FILE,{version:1,items:[],updatedAt:0}),items=new Map((saved.items||[]).map(x=>[x.id,x]));
  for(const invite of invites){const id=inviteKey(invite,message.id),source=sourceOf(message),event={...invite,attendees:invite.attendees.slice(0,30),summary:str(invite.summary,1000),sourceDate:str(message.date,80),source},old=items.get(id),merged=old?mergeInvites([old.event,event]):event;items.set(id,{id,source:merged.source,event:merged,updatedAt:now()});}
  const retained=[...items.values()].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,1000);let bytes=0;const bounded=retained.filter(x=>{const n=Buffer.byteLength(JSON.stringify(x));if(bytes+n>3*1024*1024)return false;bytes+=n;return true;});
  store.write(INVITES_FILE,{version:1,items:bounded,updatedAt:now()});syncLinkedTasks();return {observed:invites.length};
 }
 function all(){
  const timeZone=zone(store.settings().timezone)||'Asia/Shanghai',saved=savedMessages(store),byId=new Map(saved.messages.map(m=>[m.id,m])),rows=[],invites=new Map(),data=state(),localFollowups=new Set((data.events||[]).map(x=>x.followupId).filter(Boolean));
  for(const m of saved.messages){const a=m.analysis||{},rawInvites=[...(m.calendarInviteEvents||[]),...inviteTexts(m).flatMap(text=>parseCalendarInvites(text,{timeZone}))];
   for(const invite of rawInvites){const event={...baseEvent(m,'meeting',invite.title),...invite,id:inviteKey(invite,m.id),origin:'invite',source:invite.source||sourceOf(m),_received:Date.parse(m.date)||0};const key=event.id;if(!invites.has(key))invites.set(key,[]);invites.get(key).push(event);}
   if(rawInvites.length)continue;
   const details=Array.isArray(a.meetingDetails)?a.meetingDetails:[],verified=details.filter(x=>x?.evidenceVerified===true&&!m.text);const normalized=m.text?normalizeMeetingDetails(details,m,{timeZone}):verified;
   for(const d of normalized){rows.push({...baseEvent(m,'meeting',d.title),...d,id:'meeting-'+hash(m.id+'|'+d.title+'|'+d.evidence),timeZone:d.timeZone||timeZone,status:d.needsReview?'pending':'confirmed'});}
   if(!normalized.length)for(const title of (Array.isArray(a.meetings)?a.meetings:[]).filter(x=>str(x)&&x!=='未提及').slice(0,24)){const evidence=currentBody(m.text).includes(title)?title:'';const d=evidence?normalizeMeetingDetails([{title,evidence}],m,{timeZone})[0]:null;rows.push({...baseEvent(m,'meeting',title),...(d||{}),id:'meeting-'+hash(m.id+'|'+title),timeZone:d?.timeZone||timeZone,needsReview:d?d.needsReview:true,reviewReason:d?.reviewReason||'旧总结没有逐字会议时间证据',status:d&&!d.needsReview?'confirmed':'pending'});}
  }
  for(const group of invites.values())rows.push(mergeInvites(group));
  const latest=[dayKey(now()),...store.archive()].sort().at(-1),actionList=actions.list({day:latest,scope:'open'});
  for(const item of actionList.items){if(!['todo','confirm'].includes(item.kind)||!IMPORTANT.includes(item.priority)||(item.origin==='manual'&&localFollowups.has(item.id.slice(7))))continue;const m=byId.get(item.source?.id)||{},due=item.origin==='manual'?manualDue(item.deadline,timeZone):deadlineFor(item,m,timeZone);rows.push({...baseEvent({...m,analysis:{priority:item.priority,category:item.category,summary:item.summary}},due?'deadline':'task',item.title),...(due||{}),id:'action-'+item.id,timeZone,done:item.done,source:item.source||null,origin:item.origin==='manual'?'followup':'action',actionId:item.id,actionDay:item.day,actionScope:'open',actionKind:item.kind,status:item.done?'done':'pending',needsReview:!due,reviewReason:due?'':'未提供可核对的截止日期',rawDeadline:item.deadline||''});}
  for(const local of data.events||[]){let done=local.done;if(local.followupId){const tracked=followups.list().find(x=>x.id===local.followupId);if(tracked)done=tracked.done;}rows.push({...local,done,status:done?'done':'pending'});}
  for(let i=0;i<rows.length;i++){const original=rows[i],override=data.overrides?.[original.id];if(override)rows[i]={...original,...override.patch,locallyEdited:true,originalDay:original.day,originalStart:original.start,done:original.actionId?original.done:override.patch.done??original.done};const event=rows[i];if(event.start&&!event.allDay)event.day=inZone(event.start,timeZone);if(event.day&&!validDay(event.day)){event.day=null;event.needsReview=true;event.reviewReason='日期待核对';}if(event.type==='meeting'&&!event.allDay&&!event.start){event.proposedDay=event.day||event.proposedDay||null;event.day=null;}}
  const folded=new Set();for(const tracked of rows.filter(x=>x.linkedEventId)){const event=rows.find(x=>x.id===tracked.linkedEventId);if(!event)continue;Object.assign(event,{linkedTaskId:tracked.id,followupId:tracked.followupId,actionId:tracked.actionId,actionDay:tracked.actionDay,actionScope:'open',done:tracked.done});if(!event.cancelled)event.status=event.done?'done':event.type==='meeting'&&!event.needsReview?'confirmed':'pending';folded.add(tracked.id);}
  const overrides=store.read('action-overrides.json',{}),lastAction=Math.max(0,...Object.values(overrides).map(x=>Number(x.updatedAt)||0)),lastFollowup=Math.max(0,...followups.list().map(x=>Number(x.updatedAt)||0));
  return {rows:[...new Map(rows.filter(x=>!folded.has(x.id)).map(x=>[x.id,x])).values()],timeZone,updatedAt:Math.max(saved.updatedAt,Number(data.updatedAt)||0,lastAction,lastFollowup),scope:'本地已保存的邮件总结、邮件邀请和跟进事项',warnings:[...new Set(rows.filter(x=>x.recurrence).map(()=> '重复会议仅显示邀请中的本次日期，后续周期待核对'))]};
 }
 function list(p){const range=calendarRange(p),result=all(),rank={meeting:0,deadline:1,task:2},sort=(a,b)=>rank[a.type]-rank[b.type]||String(a.day||'').localeCompare(String(b.day||''))||String(a.start||'').localeCompare(String(b.start||''))||a.title.localeCompare(b.title);return {...range,timeZone:result.timeZone,events:result.rows.filter(x=>x.day&&x.day<=range.end&&(x.day>=range.start||(x.end&&((x.allDay?addDay(x.end,-1):inZone(new Date(Date.parse(x.end)-1),result.timeZone))>=range.start)))).sort(sort),undated:result.rows.filter(x=>!x.day).sort(sort),updatedAt:result.updatedAt,scope:result.scope,warnings:result.warnings};}
 function reminders({day}){dayRange(day);const result=list({start:day,end:day}),events=result.events.filter(x=>!x.done&&!x.cancelled),overdue=all().rows.filter(x=>x.day&&x.day<day&&x.type!=='meeting'&&!x.done&&!x.cancelled);return {...result,day,events,overdue,undated:result.undated.filter(x=>!x.done&&!x.cancelled),meetings:events.filter(x=>x.type==='meeting'),deadlines:events.filter(x=>x.type!=='meeting')};}
 function syncLinkedTasks(){
  const data=state();if(!(data.events||[]).some(x=>x.linkedEventId))return;
  const parents=new Map(all().rows.map(x=>[x.id,x])),trackedById=new Map(followups.list().map(x=>[x.id,x]));let changed=false;
  data.events=data.events.map(local=>{
   const parent=parents.get(local.linkedEventId),tracked=trackedById.get(local.followupId);if(!parent||!tracked)return local;
   const next={...local,title:local.linkedTitleCustom?local.title:parent.title,day:parent.day,start:parent.start,end:parent.end,allDay:parent.allDay,timeZone:parent.timeZone,project:parent.project,summary:parent.summary,priority:parent.priority,source:parent.source||null,needsReview:parent.needsReview,reviewReason:parent.reviewReason,done:tracked.done};
   const keys=['title','day','start','end','allDay','timeZone','project','summary','priority','source','needsReview','reviewReason'];if(keys.every(key=>JSON.stringify(local[key])===JSON.stringify(next[key])))return local;
   const due=next.day?(next.allDay?next.day:next.start):'';followups.save({id:tracked.id,title:next.title,due,notes:next.summary,source:next.source||undefined});changed=true;return {...next,updatedAt:now()};
  });
  if(changed){data.updatedAt=now();store.write(FILE,data);}
 }
 function save(p){
  if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('日程格式无效');if(p.op&&!['save','done','respond','add-task'].includes(p.op))throw new Error('日程操作无效');if('done'in p&&typeof p.done!=='boolean')throw new Error('完成状态必须为布尔值');const data=state(),existing=p.id?all().rows.find(x=>x.id===p.id):null;if(p.id&&!existing)throw new Error('日程已变化，请刷新后重试');
  if(p.op==='respond'){if(!existing||existing.type!=='meeting'||!['accepted','tentative','declined'].includes(p.response))throw new Error('会议本地响应无效');data.overrides={...data.overrides,[existing.id]:{patch:{...data.overrides?.[existing.id]?.patch,localResponse:p.response,responseScope:'local'},updatedAt:now()}};data.updatedAt=now();store.write(FILE,data);return all().rows.find(x=>x.id===existing.id);}
  if(p.op==='add-task'){if(!existing)throw new Error('请先选择日程');const prior=(data.events||[]).find(x=>x.linkedEventId===existing.id);if(prior||existing.actionId)return all().rows.find(x=>x.id===existing.id);const created=save({type:'task',title:p.title||existing.title,day:existing.day,start:existing.start,end:existing.end,allDay:existing.allDay,timeZone:existing.start&&!existing.allDay?all().timeZone:existing.timeZone,project:existing.project,summary:existing.summary,priority:existing.priority,source:existing.source});const next=state();next.events=next.events.map(x=>x.id===created.id?{...x,linkedEventId:existing.id,linkedTitleCustom:!!p.title}:x);next.updatedAt=now();store.write(FILE,next);syncLinkedTasks();return all().rows.find(x=>x.id===existing.id);}
  if(p.op==='done'&&(!existing||typeof p.done!=='boolean'))throw new Error('请选择日程并填写完成状态');
  const timingEdited=['day','start','end','allDay','timeZone'].some(k=>k in p),validationDay=!timingEdited&&existing?.start&&!existing.allDay&&zone(existing.timeZone)?inZone(existing.start,existing.timeZone):existing?.day;
  const clean=existing&&!timingEdited?{...existing,...validateNonTiming(p)}:validateLocal({...existing,day:validationDay,...p},zone(store.settings().timezone)||'Asia/Shanghai');
  if(existing?.actionId&&'done'in p)actions.update({day:existing.actionDay,scope:'open',id:existing.actionId,done:p.done});
  if(existing&&existing.origin!=='local'){const patch={};for(const key of ['type','title','day','start','end','allDay','timeZone','project','organizer','attendees','location','url','summary','priority','done'])if(key in p)patch[key]=clean[key];if('day'in p||'start'in p||'allDay'in p){for(const key of ['day','start','end','allDay','timeZone','needsReview','reviewReason'])patch[key]=clean[key];}data.overrides={...data.overrides,[existing.id]:{patch:{...data.overrides?.[existing.id]?.patch,...patch},updatedAt:now()}};}
  else {if(!existing&&(data.events||[]).length>=3000)throw new Error('本地日程最多 3000 条');const stored=(data.events||[]).find(x=>x.id===existing?.id),event={...clean,id:existing?.id||'local-'+crypto.randomUUID(),origin:'local',createdAt:existing?.createdAt||now(),updatedAt:now(),source:existing?.source||clean.source||null};if(['deadline','task'].includes(event.type)){const tracked=followups.save({id:stored?.followupId,title:event.title,done:event.done,due:event.day?event.allDay?event.day:event.start:'',notes:event.summary,source:event.source||undefined});event.followupId=tracked.id;event.actionId='manual-'+tracked.id;event.actionDay=dayKey(tracked.createdAt);event.actionScope='open';}else{if(stored?.followupId)followups.remove(stored.followupId);for(const key of ['followupId','actionId','actionDay','actionScope','linkedTaskId'])delete event[key];}data.events=[...(data.events||[]).filter(x=>x.id!==event.id),event];p={...p,id:event.id};}
  data.updatedAt=now();store.write(FILE,data);syncLinkedTasks();return all().rows.find(x=>x.id===(existing?.id||p.id));
 }
 return {list,save,reminders,observeMessage};
}
function manualDue(value,timeZone){const v=String(value||'').trim();if(validDay(v))return {day:v,start:v,end:addDay(v),allDay:true};const instant=strictInstant(v,timeZone,v.slice(0,10));return instant?{day:inZone(instant,timeZone),start:instant,end:null,allDay:false}:null;}
function validateNonTiming(p){const patch={};if('type'in p){if(!TYPES.includes(p.type))throw new Error('日程类型无效');patch.type=p.type;}for(const [key,max]of [['title',300],['summary',2000],['project',120],['location',500]])if(key in p){if(String(p[key]||'').length>max||(key==='title'&&!String(p[key]||'').trim()))throw new Error('日程 '+key+' 无效或过长');patch[key]=str(p[key],max);}if('priority'in p){if(!PRIORITIES.includes(p.priority))throw new Error('日程优先级无效');patch.priority=p.priority;}if('url'in p){if(p.url&&!safeUrl(p.url))throw new Error('会议入口须为 HTTP 或 HTTPS 地址');patch.url=safeUrl(p.url);}if('attendees'in p){if(!Array.isArray(p.attendees)||p.attendees.length>100)throw new Error('参会人最多 100 人');patch.attendees=people(p.attendees);}if('organizer'in p){if(typeof p.organizer==='string'&&p.organizer.length>400)throw new Error('组织者过长');patch.organizer=person(p.organizer);}if('done'in p)patch.done=p.done;return patch;}
function validateLocal(p,defaultZone){
 const type=p.type||'task';if(!TYPES.includes(type))throw new Error('日程类型无效');const title=String(p.title||'').trim();if(!title||title.length>300)throw new Error('日程标题须为 1–300 字');for(const [key,max]of [['summary',2000],['project',120],['location',500],['url',2000]])if(String(p[key]||'').length>max)throw new Error('日程 '+key+' 过长');if(p.attendees!==undefined&&(!Array.isArray(p.attendees)||p.attendees.length>100))throw new Error('参会人最多 100 人');if(typeof p.organizer==='string'&&p.organizer.length>400)throw new Error('组织者过长');const timeZone=zone(p.timeZone||defaultZone);if(!timeZone)throw new Error('日程时区无效');if('allDay'in p&&typeof p.allDay!=='boolean')throw new Error('全天状态必须为布尔值');let day=p.day||null,allDay=p.allDay===undefined?type!=='meeting':p.allDay,start=null,end=null;if(day&&!validDay(day))throw new Error('日程日期无效');
 if(day){if(allDay){start=day;end=p.end||addDay(day);if(!validDay(end)||end<=day)throw new Error('全天结束日期须晚于开始日期（结束日期不包含在日程内）');}else{start=strictInstant(p.start,timeZone,day);if(!start)throw new Error('请填写有效开始时刻；夏令时切换时请使用带时区偏移的时间');if(inZone(start,timeZone)!==day)throw new Error('开始时刻与日程日期不一致');if(p.end){end=strictInstant(p.end,timeZone,day);if(!end||end<=start)throw new Error('结束时刻必须晚于开始时刻');}}if(end&&(Date.parse(end)-Date.parse(start))/86400000>366)throw new Error('日程时长不能超过 366 天');}else if(p.start||p.end)throw new Error('请先填写日程日期');if(p.url&&!safeUrl(p.url))throw new Error('会议入口须为 HTTP 或 HTTPS 地址');if(p.priority&&!PRIORITIES.includes(p.priority))throw new Error('日程优先级无效');
 return {type,title,day,start,end,allDay,timeZone,project:str(p.project,120),organizer:person(p.organizer),attendees:people(p.attendees),location:str(p.location,500),url:safeUrl(p.url),summary:str(p.summary,2000),priority:p.priority||'重要',done:p.done===true,source:p.source?sourceOf(p.source):null,needsReview:!day,reviewReason:day?'':'时间待核对'};
}
