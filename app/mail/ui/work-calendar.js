import * as calendarData from './calendar-data.mjs';
import {icon as sharedIcon} from './design-system.js';

const THEMES=[['mist','雾青'],['sand','暖砂'],['iris','鸢尾'],['ink','夜墨']];
const VIEWS=[['month','月'],['week','周'],['day','日'],['agenda','日程']];
const WEEKDAYS=['周一','周二','周三','周四','周五','周六','周日'];
const TYPE_LABEL={meeting:'会议',deadline:'截止',task:'待办'};
const STORAGE='mail.workCalendar.';
const pad=n=>String(n).padStart(2,'0');
const dateOf=day=>new Date(day+'T12:00:00Z');
const dayOf=date=>date.toISOString().slice(0,10);
const shiftDay=(day,n)=>{const d=dateOf(day);d.setUTCDate(d.getUTCDate()+n);return dayOf(d);};
const weekday=day=>(dateOf(day).getUTCDay()+6)%7;
const weekStart=day=>shiftDay(day,-weekday(day));
const todayLocal=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const stored=(key,fallback)=>{try{return localStorage.getItem(STORAGE+key)||fallback;}catch{return fallback;}};
const store=(key,value)=>{try{localStorage.setItem(STORAGE+key,value);}catch{}};

export function createWorkCalendar({S,$,e,api,toast,openSource,icon=sharedIcon}){
 const esc=value=>e(String(value??''));
 function personText(value){if(Array.isArray(value))return value.map(personText).filter(Boolean).join('、');if(value&&typeof value==='object')return personText(value.name||value.displayName||value.email||value.address||'');const text=String(value||'').trim(),header=text.match(/^(.+?)\s*<[^>]+>$/);return header?header[1].trim().replace(/^['\"]|['\"]$/g,''):text;}
 const projectText=value=>value&&typeof value==='object'?String(value.name||value.title||value.label||''):String(value||'');
 const today=()=>S.state?.today||todayLocal();
 let selected=today(),anchor=selected,view=stored('view','month'),theme=stored('theme','mist');
 if(!VIEWS.some(([v])=>v===view))view='month';
 if(!THEMES.some(([v])=>v===theme))theme='mist';
 const knownEvents=new Map();
 let data={events:[],undated:[],timeZone:'Asia/Shanghai'},loaded='',loading=false,error='',request=0,modal=null,returnFocus=null,saving=false,showDone=false;
 let review={day:'',phase:'idle',report:null,error:'',expanded:false},reviewRequest=0,reviewPromise=null;
 let cardHidden=stored('cardHidden','0')==='1';
 const root=()=>$('#workCalendarRoot');
 const eventFor=id=>[...data.events,...data.undated].find(x=>String(x.id)===String(id));
 const knownEventFor=id=>eventFor(id)||knownEvents.get(String(id));
 function sourceFor(id){const direct=knownEventFor(id);if(direct?.source)return direct.source;return [...data.events,...data.undated,...knownEvents.values()].find(x=>String(x.source?.id)===String(id))?.source||reviewMessages().find(x=>String(x.id)===String(id));}
 const eventState=x=>[x.done?'is-done':'',x.cancelled||x.status==='cancelled'?'is-cancelled':''].filter(Boolean).join(' ');
 function instantDay(value){try{return new Intl.DateTimeFormat('sv-SE',{timeZone:data.timeZone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}catch{return '';}}
 function occursOnDay(x,day){if(!x.day||x.day>day)return false;if(x.day===day)return true;if(!x.end)return false;const endDay=x.allDay?shiftDay(x.end,-1):instantDay(new Date(Date.parse(x.end)-1));return endDay>=day;}
 const info=day=>{try{return calendarData.dayInfo?.(day)||{};}catch{return {};}};
 function dateInfo(day){
  const i=info(day),holiday=i.holiday||{},holidayName=i.holidayName||holiday.name||i.festivalName||i.festival||'';
  const marker=i.badge==='补班'||i.dayType==='makeup'||holiday.type==='makeup'?'班':i.isRestDay||i.badge==='休'||i.dayType==='holiday'?'休':'';
  return {...i,holidayName:marker==='班'?'补班':holidayName,marker,lunar:i.lunarLabel||i.lunarDay||i.lunar?.dayName||i.lunar?.day||typeof i.lunar==='string'&&i.lunar||'',term:i.solarTerm||i.term||''};
 }
 const dateState=i=>i.dayType==='holiday'?'is-holiday':i.dayType==='makeup'?'is-makeup':i.isRestDay?'is-rest-day':'';
 const dateMarker=i=>i.marker?`<b class="wc-day-marker ${i.marker==='班'?'is-work':i.dayType==='weekend'?'is-weekend':''}" aria-label="${i.marker==='班'?'调休补班':'休息日'}">${i.marker}</b>`:'';
 function range(){
  if(view==='week'){const start=weekStart(anchor);return {start,end:shiftDay(start,6)};}
  if(view==='day')return {start:anchor,end:anchor};
  const [y,m]=anchor.split('-').map(Number),first=`${y}-${pad(m)}-01`,last=dayOf(new Date(Date.UTC(y,m,0,12)));
  return view==='month'?{start:weekStart(first),end:shiftDay(weekStart(last),6)}:{start:first,end:last};
 }
 function eventMinutes(value,x){
  if(!value)return null;
  const short=String(value).match(/^(\d{1,2}):(\d{2})/);if(short)return Number(short[1])*60+Number(short[2]);
  const d=new Date(value);if(Number.isNaN(d.getTime()))return null;
  try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:data.timeZone||'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);return Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);}catch{return d.getHours()*60+d.getMinutes();}
 }
 const displayZone=()=>data.timeZone||'Asia/Shanghai';
 const zoneLabel=()=>displayZone()==='Asia/Shanghai'?'北京时间':displayZone();
 const clock=minutes=>minutes===null?'':`${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
 function eventTime(x){if(x.allDay)return '全天';const a=eventMinutes(x.start,x),b=eventMinutes(x.end,x);return a===null?(x.type==='meeting'?'时间待确认':'当日事项'):clock(a)+(b!==null?' – '+clock(b):'');}
 function sortEvents(rows){return [...rows].sort((a,b)=>(Number(!!a.done)-Number(!!b.done))||((a.type==='meeting'?0:1)-(b.type==='meeting'?0:1))||((eventMinutes(a.start,a)??1440)-(eventMinutes(b.start,b)??1440))||String(a.title).localeCompare(String(b.title),'zh-CN'));}
 function rowsFor(day){return sortEvents(data.events.filter(x=>occursOnDay(x,day)&&(showDone||!x.done)));}
 function titleFor(){const [y,m]=anchor.split('-').map(Number);if(view==='day')return `${m} 月 ${Number(anchor.slice(8))} 日`;if(view==='week'){const start=weekStart(anchor),end=shiftDay(start,6);return start.slice(0,7)===end.slice(0,7)?`${Number(start.slice(5,7))} 月 ${Number(start.slice(8))} – ${Number(end.slice(8))} 日`:`${Number(start.slice(5,7))}.${Number(start.slice(8))} – ${Number(end.slice(5,7))}.${Number(end.slice(8))}`;}return `${m} 月`;}
 function countdownHTML(){
  if(cardHidden)return '';
  let h;try{h=calendarData.nextHoliday?.(today());}catch{}
  const day=h?.day||h?.date||h?.startDay||h?.start,name=h?.name||h?.holidayName;
  if(!day||!name)return '';
  const days=h.daysUntil??h.days??Math.ceil((dateOf(day)-dateOf(today()))/86400000);
  return `<div class="wc-holiday-card"><span class="wc-holiday-mark">${icon('calendar')}</span><div><b>${days===0?'今天是 '+esc(name):esc(name)+'，还有 '+Number(days)+' 天'}</b><span>${esc(day)}${h.confirmed===false?' · 调休安排待公布':h.duration?' · '+Number(h.duration)+' 天假期':''}</span></div><button data-wc-dismiss-card="1" aria-label="关闭节假日提醒">${icon('close')}</button></div>`;
 }
 function dailyCopyHTML(){
  if(!calendarData.COPY_APPROVED)return '';
  const day=today(),entries=['playful','comfort'].map(style=>({copy:calendarData.dailyCopy(day,style)})).filter(({copy})=>copy.approved);
  if(!entries.length)return '';
  return `<section class="wc-daily-notes" aria-label="今日随笺" data-wc-copy-day="${esc(day)}"><div class="wc-daily-notes-heading"><span>今日随笺</span>${countdownHTML()}<time datetime="${esc(day)}">${Number(day.slice(5,7))} 月 ${Number(day.slice(8))} 日 · 每天两句</time></div><div class="wc-daily-notes-grid">${entries.map(({copy})=>`<article class="wc-daily-note wc-daily-note-${copy.style}" data-wc-copy="${copy.style}" data-wc-copy-id="${copy.id}"><span class="wc-note-mark" aria-hidden="true">${icon(copy.style==='playful'?'spark':'clock')}</span><p>${esc(copy.text)}</p><span class="wc-note-rule" aria-hidden="true"></span></article>`).join('')}</div></section>`;
 }
 function chips(x,compact=false){return `<span class="wc-type wc-type-${esc(x.type)}">${TYPE_LABEL[x.type]||'事项'}</span>${x.priority==='high'||x.priority==='urgent'||/重要|高|急/.test(x.priority||'')?'<span class="wc-priority">重要</span>':''}${x.done?'<span class="wc-completed">已完成</span>':''}${x.cancelled||x.status==='cancelled'?'<span class="wc-cancelled-label">已取消</span>':x.needsReview?'<span class="wc-review-label">待核对</span>':''}${!compact&&x.project?`<span class="wc-project">${esc(projectText(x.project))}</span>`:''}`;}
 function monthEvent(x){return `<button class="wc-month-event wc-event-${esc(x.type)} ${eventState(x)}" data-wc-event="${esc(x.id)}" title="${esc(x.title)} · ${esc(eventTime(x))}"><span>${x.type==='meeting'?esc(x.allDay?'全天':clock(eventMinutes(x.start,x))||'待核对'):TYPE_LABEL[x.type]||'事项'}</span><b>${esc(x.title)}</b></button>`;}
 function dayHead(day,outside=false){const i=dateInfo(day);return `<button data-wc-select="${day}" class="wc-day-picker ${dateState(i)}" aria-label="${day}${i.holidayName?'，'+esc(i.holidayName):''}${i.marker?'，'+(i.marker==='班'?'调休补班':'休息日'):''}${i.lunar?'，农历'+esc(i.lunar):''}" aria-pressed="${day===selected}"><span class="wc-day-number">${Number(day.slice(8))}${day===today()?'<i aria-label="今天"></i>':''}</span>${dateMarker(i)}<span class="wc-day-note">${i.holidayName?`<span class="wc-holiday-name ${i.marker==='班'?'is-makeup':''}">${esc(i.holidayName)}</span>`:`<span>${esc(i.term||i.lunar)}</span>`}</span></button>`;}
 function monthHTML(){
  const r=range(),days=Math.round((dateOf(r.end)-dateOf(r.start))/86400000)+1;
  return `<div class="wc-month" role="grid" aria-label="${anchor.slice(0,7)} 工作日历"><div class="wc-weekdays" role="row">${WEEKDAYS.map((d,i)=>`<span role="columnheader" class="${i>4?'is-weekend':''}">${d}</span>`).join('')}</div><div class="wc-month-grid" style="--wc-weeks:${days/7}">${Array.from({length:days},(_,n)=>{const day=shiftDay(r.start,n),rows=rowsFor(day),outside=day.slice(0,7)!==anchor.slice(0,7),i=dateInfo(day);return `<div role="gridcell" class="wc-month-cell ${day===selected?'is-selected':''} ${day===today()?'is-today':''} ${outside?'is-outside':''} ${dateState(i)}">${dayHead(day,outside)}<div class="wc-day-events">${rows.slice(0,3).map(monthEvent).join('')}${rows.length>3?`<button class="wc-more" data-wc-select="${day}">还有 ${rows.length-3} 项${icon('right')}</button>`:''}</div><button class="wc-cell-add" data-wc-new="${day}" aria-label="${day} 新增事项">${icon('plus')}</button></div>`;}).join('')}</div></div>`;
 }
 function eventSegment(x,day){const start=x.day<day?0:eventMinutes(x.start,x),end=x.end&&instantDay(new Date(Date.parse(x.end)-1))>day?1440:eventMinutes(x.end,x);return {start,end:Math.max(start+30,end??start+60)};}
 function timelineItems(rows,day){
  const list=rows.map(x=>{const {start,end}=eventSegment(x,day);return {x,start:Math.max(0,start),end,lane:0,lanes:1};}).sort((a,b)=>a.start-b.start||b.end-a.end);
  let cluster=[],ends=[];
  const flush=()=>{const lanes=ends.length;cluster.forEach(item=>item.lanes=lanes);cluster=[];ends=[];};
  for(const item of list){if(cluster.length&&item.start>=Math.max(...ends))flush();let lane=ends.findIndex(end=>end<=item.start);if(lane<0)lane=ends.length;ends[lane]=item.end;item.lane=lane;cluster.push(item);}flush();return list;
 }
 function timelineHTML(){
  const start=view==='day'?anchor:weekStart(anchor),days=Array.from({length:view==='day'?1:7},(_,i)=>shiftDay(start,i));
  const timed=days.flatMap(day=>rowsFor(day).filter(x=>!x.allDay&&eventMinutes(x.start,x)!==null).map(x=>eventSegment(x,day)));
  const firstHour=Math.min(8,...timed.map(x=>Math.floor(x.start/60))),lastHour=Math.min(24,Math.max(20,...timed.map(x=>Math.ceil(x.end/60))));
  const height=(lastHour-firstHour)*58;
  return `<div class="wc-timeline ${view==='day'?'wc-timeline-day':''}" style="--wc-columns:${days.length};--wc-timeline-height:${height}px"><div class="wc-time-heading"><span class="wc-zone">${esc(displayZone()==='Asia/Shanghai'?'GMT+8':displayZone())}</span>${days.map(day=>{const i=dateInfo(day);return `<button class="wc-time-day ${day===selected?'is-selected':''} ${day===today()?'is-today':''} ${dateState(i)}" data-wc-select="${day}"><span>${WEEKDAYS[weekday(day)]}${dateMarker(i)}</span><strong>${Number(day.slice(8))}</strong><small>${esc(i.holidayName||i.term||i.lunar)}</small></button>`;}).join('')}</div><div class="wc-all-day"><span>全天 / 待确认</span>${days.map(day=>`<div>${rowsFor(day).filter(x=>x.allDay||eventMinutes(x.start,x)===null).map(monthEvent).join('')}</div>`).join('')}</div><div class="wc-time-scroll"><div class="wc-time-canvas"><div class="wc-hours">${Array.from({length:lastHour-firstHour},(_,i)=>`<span style="top:${i*58}px">${pad(firstHour+i)}:00</span>`).join('')}</div>${days.map(day=>`<div class="wc-time-column" aria-label="${day} 时间安排">${Array.from({length:lastHour-firstHour},(_,i)=>`<div class="wc-hour-line" style="top:${i*58}px"></div>`).join('')}${timelineItems(rowsFor(day).filter(x=>!x.allDay&&eventMinutes(x.start,x)!==null),day).map(({x,start,end,lane,lanes})=>`<button class="wc-time-event wc-event-${esc(x.type)} ${eventState(x)}" data-wc-event="${esc(x.id)}" style="top:${Math.max(0,(start-firstHour*60)/60*58)}px;height:${Math.max(31,(Math.min(end,lastHour*60)-start)/60*58)}px;left:calc(${lane/lanes*100}% + 4px);width:calc(${100/lanes}% - 8px)"><span>${esc(eventTime(x))}</span><b>${esc(x.title)}</b>${view==='day'&&x.project?`<small>${esc(projectText(x.project))}</small>`:''}</button>`).join('')}${day===today()?nowLine(firstHour,lastHour):''}</div>`).join('')}</div></div></div>`;
 }
 function nowLine(first,last){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:displayZone(),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':'),n=Number(parts[0])*60+Number(parts[1]);return n>=first*60&&n<last*60?`<div class="wc-now-line" style="top:${(n-first*60)/60*58}px"><i></i></div>`:'';}
 function agendaEvent(x){return `<button class="wc-agenda-event wc-event-${esc(x.type)} ${eventState(x)}" data-wc-event="${esc(x.id)}"><span class="wc-agenda-time">${esc(eventTime(x))}</span><span><b>${esc(x.title)}</b><small>${esc([projectText(x.project),x.location].filter(Boolean).join(' · ')||personText(x.source?.from)||'本地事项')}</small></span><span class="wc-agenda-tags">${chips(x,true)}</span>${icon('right')}</button>`;}
 function agendaHTML(){const r=range(),days=Array.from({length:Math.round((dateOf(r.end)-dateOf(r.start))/86400000)+1},(_,i)=>shiftDay(r.start,i)).filter(day=>rowsFor(day).length);return `<div class="wc-agenda-list">${days.length?days.map(day=>`<section><button class="wc-agenda-date ${dateState(dateInfo(day))}" data-wc-select="${day}"><b>${Number(day.slice(5,7))} 月 ${Number(day.slice(8))} 日</b><span>${WEEKDAYS[weekday(day)]}${dateInfo(day).holidayName?' · '+esc(dateInfo(day).holidayName):''}</span>${dateMarker(dateInfo(day))}</button>${rowsFor(day).map(agendaEvent).join('')}</section>`).join(''):emptyHTML('这个月，尚未安排事项','添加重要待办，或从原邮件中整理会议与截止日期。')}</div>`;}
 function emptyHTML(title,note){return `<div class="wc-empty"><span>${icon('calendar')}</span><h3>${esc(title)}</h3><p>${esc(note)}</p><button data-wc-new="${selected}">${icon('plus')}新增事项</button></div>`;}
 function reviewMessages(){return review.day===selected&&Array.isArray(review.report?.messages)?review.report.messages:[];}
 const canOpenReviewSource=m=>!!(m?.id&&m.accountId&&m.folder&&m.uid&&m.uidValidity);
 function reviewActions(m){const a=m.analysis||{},rows=Array.isArray(a.actions)?a.actions:[...['todos','confirmations','meetings'].flatMap((key,index)=>(Array.isArray(a[key])?a[key]:[]).map(title=>({kind:['todo','confirm','meeting'][index],title})))];return rows.filter(x=>x&&x.title).map(x=>({kind:x.kind,title:String(x.title)}));}
 function reviewMailHTML(m){
  const analysis=m.analysis||{},actions=reviewActions(m),canOpen=canOpenReviewSource(m),labels={todo:'待办',confirm:'待确认',reply:'待回复',notice:'知晓',meeting:'会议'};
  return `<button type="button" class="wc-review-mail" data-wc-review-source="${esc(m.id||'')}" data-wc-review-day="${selected}" ${canOpen?'':'disabled'}><strong>${esc(m.subject||'未填写主题')}</strong><span class="wc-review-mail-meta">${esc([personText(m.from),projectText(analysis.project)].filter(Boolean).join(' · '))}</span>${analysis.summary?`<span class="wc-review-mail-summary">${esc(analysis.summary)}</span>`:''}${actions.length?`<span class="wc-review-mail-actions">${actions.slice(0,review.expanded?actions.length:1).map(x=>`<span><i>${labels[x.kind]||'事项'}</i>${esc(x.title)}</span>`).join('')}</span>`:''}<small>${canOpen?'查看原邮件'+icon('arrow'):'原邮件定位未保存'}</small></button>`;
 }
 function reviewHTML(){
  const heading=`<div class="wc-review-heading"><h3>${icon('mail')}当日邮件回顾</h3>${review.report?`<span>${reviewMessages().length} 封</span>`:''}</div>`;
  if(review.day!==selected||['idle','loading'].includes(review.phase))return `<section class="wc-review-card" aria-label="已保存的当日邮件回顾" aria-busy="true">${heading}<div class="wc-review-state" role="status">正在读取已保存的回顾…</div></section>`;
  if(review.phase==='error')return `<section class="wc-review-card" aria-label="已保存的当日邮件回顾">${heading}<div class="wc-review-state is-error" role="status"><b>回顾暂时未能读取</b><p>${esc(review.error||'请稍后重新读取已保存的回顾。')}</p><button type="button" data-wc-review-retry="1">重新读取</button></div></section>`;
  if(!review.report)return `<section class="wc-review-card" aria-label="已保存的当日邮件回顾">${heading}<div class="wc-review-state"><b>这一天没有已保存的邮件回顾</b><p>保存后的邮件摘要会显示在这里。</p></div></section>`;
  const r=review.report,messages=reviewMessages(),feedback=String(r.feedback||''),lead=Array.from(feedback).slice(0,112).join(''),displayed=review.expanded?messages:messages.slice(0,2),recommendations=Array.isArray(r.recommendations)?r.recommendations:[],risks=Array.isArray(r.risks)?r.risks:[];
  let updated='';try{if(r.updatedAt&&Number.isFinite(new Date(r.updatedAt).getTime()))updated=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(r.updatedAt));}catch{}
  const list=(label,items)=>items.length?`<div class="wc-review-guidance"><h4>${label}</h4><ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';
  return `<section class="wc-review-card" aria-label="已保存的当日邮件回顾">${heading}<span class="wc-review-saved">已保存${updated?' · '+esc(updated):''}</span><div id="wcReviewContent"><p class="wc-review-feedback ${review.expanded?'is-expanded':''}">${esc(review.expanded?feedback:lead)}${!review.expanded&&lead.length<feedback.length?'…':''}</p>${review.expanded?list('下一步建议',recommendations)+list('风险与提醒',risks):''}<div class="wc-review-mails">${displayed.map(reviewMailHTML).join('')}</div></div><button type="button" class="wc-review-expand" data-wc-review-expand="1" aria-expanded="${review.expanded}" aria-controls="wcReviewContent">${review.expanded?'收起详细回顾':messages.length>2?`展开完整回顾与 ${messages.length} 封邮件`:'展开详细回顾'}${icon(review.expanded?'left':'right')}</button></section>`;
 }
 function railHTML(){
  const i=dateInfo(selected),rows=rowsFor(selected),meetings=rows.filter(x=>x.type==='meeting'),tasks=rows.filter(x=>x.type!=='meeting'),undated=sortEvents(data.undated.filter(x=>showDone||!x.done));
  const section=(label,items)=>items.length?`<section class="wc-rail-section"><div class="wc-section-label"><span>${label}</span><b>${items.length}</b></div>${items.map(x=>`<button class="wc-rail-event wc-event-${esc(x.type)} ${eventState(x)}" data-wc-event="${esc(x.id)}"><span class="wc-rail-time">${esc(eventTime(x))}${x.type==='meeting'&&(x.localResponse||x.response)?`<i>${{accepted:'本地已接受',tentative:'本地暂定',declined:'本地已拒绝'}[x.localResponse||x.response]||''}</i>`:''}</span><b>${esc(x.title)}</b><small>${esc([projectText(x.project),x.type==='meeting'?x.location:personText(x.source?.from)].filter(Boolean).join(' · ')||TYPE_LABEL[x.type])}</small>${x.cancelled||x.status==='cancelled'?'<span class="wc-rail-status">已取消</span>':x.needsReview?'<span class="wc-rail-status">待核对</span>':x.priority==='high'||/重要|急/.test(x.priority||'')?'<span class="wc-important-dot" title="重要事项"></span>':''}</button>`).join('')}</section>`:'';
  return `<aside class="wc-rail" aria-label="所选日期明细"><div class="wc-rail-heading"><div><span>${WEEKDAYS[weekday(selected)]} · ${selected.slice(0,4)}</span><h2>${Number(selected.slice(5,7))} 月 ${Number(selected.slice(8))} 日${selected===today()?'<small>今天</small>':''}</h2></div><button data-wc-new="${selected}" aria-label="为所选日期新增事项">${icon('plus')}</button></div><div class="wc-rail-date-note">${dateMarker(i)}${i.holidayName?`<strong class="${i.marker==='班'?'wc-makeup-name':''}">${esc(i.holidayName)}</strong>`:''}<span>${esc([i.lunar,i.term].filter(Boolean).join(' · '))}</span></div><div class="wc-rail-scroll">${section('会议安排',meetings)}${section('截止与待办',tasks)}${reviewHTML()}${undated.length?`<details class="wc-undated"><summary>尚未定日期的事项 <b>${undated.length}</b></summary>${undated.slice(0,8).map(x=>`<button data-wc-event="${esc(x.id)}"><span class="wc-dot wc-event-${esc(x.type)}"></span><span>${esc(x.title)}</span>${icon('right')}</button>`).join('')}${undated.length>8?'<p>更多未定日期事项，请从工作台查看。</p>':''}</details>`:''}</div><div class="wc-rail-footer"><div class="wc-theme-heading"><span>日历背景</span><span>${THEMES.find(([k])=>k===theme)?.[1]}</span></div><div class="wc-themes" aria-label="选择日历背景">${THEMES.map(([key,label])=>`<button class="wc-theme-${key} ${theme===key?'active':''}" data-wc-theme="${key}" aria-label="${label}背景" aria-pressed="${theme===key}" title="${label}"><span></span>${theme===key?icon('check'):''}<small>${label}</small></button>`).join('')}</div></div></aside>`;
 }
 function render(){
  const r=range(),monthRows=data.events.filter(x=>x.day&&x.day<=r.end&&(x.day>=r.start||occursOnDay(x,r.start))&&!x.done&&!x.cancelled),meetings=monthRows.filter(x=>x.type==='meeting').length;
  return `<div class="page work-calendar-page" id="workCalendarRoot" data-wc-theme="${theme}"><header class="wc-heading"><div><span class="wc-eyebrow">WORK CALENDAR</span><h1>工作日历</h1><p>会议、截止与重要待办，一眼掌握。</p></div><div class="wc-heading-actions"><button data-wc-refresh="1" aria-label="刷新日历" ${loading?'disabled':''}>${icon('refresh')}</button><button data-wc-new="${selected}" class="primary">${icon('plus')}新增事项</button></div></header>${dailyCopyHTML()}${!calendarData.COPY_APPROVED?countdownHTML():''}<div class="wc-layout"><main class="wc-calendar"><div class="wc-toolbar"><div class="wc-period"><span>${anchor.slice(0,4)}</span><h2>${titleFor()}</h2><div><button data-wc-step="-1" aria-label="上一${view==='day'?'天':view==='week'?'周':'月'}">${icon('left')}</button><button data-wc-step="1" aria-label="下一${view==='day'?'天':view==='week'?'周':'月'}">${icon('right')}</button></div><button class="wc-today" data-wc-today="1">今天</button></div><div class="wc-view-tabs" role="group" aria-label="日历视图">${VIEWS.map(([key,label])=>`<button data-wc-view="${key}" class="${view===key?'active':''}" aria-pressed="${view===key}">${label}</button>`).join('')}</div></div><div class="wc-sub-toolbar"><span>${loading?'正在读取安排…':loaded?`${meetings} 场会议 · ${monthRows.length-meetings} 项截止与待办`:'从邮件整理的安排，保留原文入口'}</span><div><label><input data-wc-show-done="1" type="checkbox" ${showDone?'checked':''}>显示已完成</label><label class="wc-jump">跳转<input type="date" data-wc-jump="1" value="${selected}" aria-label="跳转到日期"></label></div></div>${error?`<div class="wc-error" role="status">${esc(error)}<button data-wc-refresh="1">重新读取</button></div>`:''}<div id="wcCanvas" class="wc-canvas">${view==='month'?monthHTML():view==='agenda'?agendaHTML():timelineHTML()}</div><footer class="wc-legend"><span><i class="wc-dot wc-event-meeting"></i>会议</span><span><i class="wc-dot wc-event-deadline"></i>截止</span><span><i class="wc-dot wc-event-task"></i>待办</span><small>邮件识别与本地安排 · ${view==='month'?'点击日期查看详情':'点击事项查看详情'}</small></footer></main>${railHTML()}</div><div id="wcModalRoot">${modalHTML()}</div></div>`;
 }
 const completionButton=x=>`<button class="primary" data-wc-done="${esc(x.id)}" ${saving?'disabled':''}>${icon(x.done?'undo':'check')}${x.done?'恢复未完成':'标记完成'}</button>`;
 function detailsHTML(x){
  const attendees=personText(x.attendees);
  const row=(label,value)=>value?`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`:'';
  let meetingURL='';try{const u=new URL(x.url);if(['https:','http:'].includes(u.protocol))meetingURL=u.href;}catch{}
  return `<div class="wc-detail-kind">${chips(x)}</div><h2 id="wcDialogTitle">${esc(x.title)}</h2><dl class="wc-detail-meta">${row('日期',x.day||'尚未确定')}${row('时间',eventTime(x)+' · '+zoneLabel())}${row('地点',x.location)}${row('组织者',personText(x.organizer))}${row('参与者',attendees)}${row('项目',projectText(x.project))}${x.timeZone&&x.timeZone!==displayZone()?row('邀请时区',x.timeZone):''}</dl>${x.needsReview?`<div class="wc-review-note"><b>时间信息待核对</b><p>${esc(x.reviewReason||'请打开原邮件确认日期与时间，再编辑本地安排。')}</p></div>`:''}${x.cancelled||x.status==='cancelled'?'<div class="wc-review-note"><b>这场会议已取消</b><p>取消状态来自最新邀请，请在原邮件中核对变更。</p></div>':''}${meetingURL&&!x.cancelled&&x.status!=='cancelled'?`<a class="wc-meeting-link" href="${esc(meetingURL)}" target="_blank" rel="noopener noreferrer">${icon('arrow')}进入线上会议</a>`:''}${x.summary?`<div class="wc-detail-summary"><h3>事项说明</h3><p>${esc(x.summary)}</p></div>`:''}${x.source?`<div class="wc-source-card"><span>${icon('mail')}</span><div><b>${esc(x.source.subject||'查看来源邮件')}</b><small>${esc(personText(x.source.from)||'保留原邮件供核对')}</small></div><button data-wc-source="${esc(x.id)}">查看原邮件${icon('arrow')}</button></div>`:''}${x.type==='meeting'?`<div class="wc-local-response"><span>我的安排</span><div>${[['accepted','接受'],['tentative','暂定'],['declined','拒绝']].map(([value,label])=>`<button data-wc-response="${value}" data-wc-id="${esc(x.id)}" class="${(x.localResponse||x.response)===value?'active':''}" ${saving||x.cancelled||x.status==='cancelled'?'disabled':''}>${(x.localResponse||x.response)===value?icon('check'):''}${label}</button>`).join('')}</div><p>仅记在本地日历，不发送 RSVP，不同步外部日历。</p></div>`:''}<div class="wc-detail-actions"><button data-wc-edit="${esc(x.id)}">${icon('drafts')}编辑本地安排</button>${x.type==='meeting'?`<button data-wc-add-task="${esc(x.id)}" ${saving||x.linkedTaskId||x.actionId?'disabled':''}>${icon(x.linkedTaskId||x.actionId?'check':'plus')}${x.linkedTaskId||x.actionId?'已加入待办事项':'加入待办事项'}</button>${x.linkedTaskId||x.actionId?completionButton(x):''}`:completionButton(x)}</div>`;
 }
 function editorTiming(x){const day=x.day||selected;return {day,allDay:!!x.allDay,start:x.allDay?'':clock(eventMinutes(x.start,x)),end:x.allDay?'':clock(eventMinutes(x.end,x)),endDay:x.end?(x.allDay?shiftDay(x.end,-1):instantDay(x.end)):day};}
 function editorHTML(){
  const x=modal.draft||{},timing=editorTiming(x),localDate=timing.day,timeValue=value=>clock(eventMinutes(value,x));
  return `<span class="wc-dialog-eyebrow">${x.id?'EDIT LOCAL EVENT':'NEW LOCAL EVENT'}</span><h2 id="wcDialogTitle">${x.id?'编辑安排':'留出时间，推进重要的事'}</h2><p class="wc-editor-note">本地保存，邮件来源与处理记录保持关联。</p><form id="workCalendarForm"><input type="hidden" name="id" value="${esc(x.id||'')}"><label class="wc-field">标题<input name="title" required maxlength="240" placeholder="事项、会议或截止名称" value="${esc(x.title||'')}" autofocus></label><div class="wc-form-grid"><label class="wc-field">类型<select name="type">${[['task','重要待办'],['meeting','会议'],['deadline','截止事项']].map(([k,label])=>`<option value="${k}" ${x.type===k?'selected':''}>${label}</option>`).join('')}</select></label><label class="wc-field">开始日期<input name="day" type="date" required data-wc-start-day="1" data-previous-day="${localDate}" value="${localDate}"></label></div><label class="wc-field"><span data-wc-end-day-label="1">${x.allDay?'结束日期（含当天）':'结束日期（可跨天）'}</span><input name="endDay" type="date" required value="${timing.endDay}"></label><div class="wc-form-grid"><label class="wc-field">开始时间<input name="start" type="time" value="${timeValue(x.start)||''}" ${x.allDay?'disabled':''}></label><label class="wc-field">结束时间<input name="end" type="time" value="${timeValue(x.end)||''}" ${x.allDay?'disabled':''}></label></div><div class="wc-editor-options"><label><input name="allDay" type="checkbox" data-wc-all-day="1" ${x.allDay?'checked':''}>全天</label><label><input name="important" type="checkbox" ${x.priority==='high'||x.priority==='urgent'||/重要|急/.test(x.priority||'')?'checked':''}>重要事项</label></div><div class="wc-form-grid"><label class="wc-field">项目<input name="project" maxlength="120" value="${esc(projectText(x.project))}" placeholder="可选"></label><label class="wc-field">地点<input name="location" maxlength="300" value="${esc(x.location||'')}" placeholder="可选"></label></div><label class="wc-field">线上会议链接<input name="url" type="url" value="${esc(x.url||'')}" placeholder="https://"></label><label class="wc-field">说明<textarea name="summary" rows="3" maxlength="2000" placeholder="补充必要的安排与备注">${esc(x.summary||'')}</textarea></label><div class="wc-form-actions"><button type="button" data-wc-close="1">取消</button><button class="primary" type="submit" ${saving?'disabled':''}>${saving?'正在保存…':'保存安排'}</button></div></form>`;
 }
 function modalHTML(){if(!modal)return '';const x=modal.kind==='detail'?eventFor(modal.id):null;if(modal.kind==='detail'&&!x)return '';return `<div class="wc-modal-backdrop" data-wc-overlay="1"><section class="wc-dialog" role="dialog" aria-modal="true" aria-labelledby="wcDialogTitle" tabindex="-1"><button class="wc-dialog-close" data-wc-close="1" aria-label="关闭日历详情">${icon('close')}</button><div class="wc-dialog-scroll">${modal.kind==='detail'?detailsHTML(x):editorHTML()}</div></section></div>`;}
 function draw({focusDay=false,resetRail=false}={}){if(S.page!=='schedule'||!root())return;const scroll=$('#workspace')?.scrollTop||0,timeScroll=$('#wcCanvas .wc-time-scroll')?.scrollTop,railScroll=$('.wc-rail-scroll')?.scrollTop;root().outerHTML=render();if($('#workspace'))$('#workspace').scrollTop=scroll;if(timeScroll!=null&&$('#wcCanvas .wc-time-scroll'))$('#wcCanvas .wc-time-scroll').scrollTop=timeScroll;if($('.wc-rail-scroll')&&(resetRail||railScroll!=null))$('.wc-rail-scroll').scrollTop=resetRail?0:railScroll;if(focusDay)root().querySelector(`[data-wc-select="${selected}"]`)?.focus({preventScroll:true});}
 function drawModal(){const target=$('#wcModalRoot');if(target){target.innerHTML=modalHTML();requestAnimationFrame(()=>{if(modal)target.querySelector('[autofocus],.wc-dialog-close')?.focus({preventScroll:true});});}}
 function closeModal(){modal=null;drawModal();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});else root()?.querySelector(`[data-wc-select="${selected}"]`)?.focus({preventScroll:true});returnFocus=null;}
 function openModal(next,trigger){returnFocus=trigger||document.activeElement;modal=next;drawModal();}
 async function load(force=false){const r=range(),key=r.start+':'+r.end;if(!force&&loaded===key){draw();return;}const rev=++request;loading=true;error='';draw();try{const value=await api('/calendar?'+new URLSearchParams(r));if(rev!==request)return;data={events:Array.isArray(value?.events)?value.events:[],undated:Array.isArray(value?.undated)?value.undated:[],timeZone:value?.timeZone||'Asia/Shanghai'};for(const event of [...data.events,...data.undated])knownEvents.set(String(event.id),event);loaded=key;}catch(err){if(rev!==request)return;error=err.message||'日历暂时无法读取';}finally{if(rev===request){loading=false;draw();}}}
 async function loadReview(force=false){
  const day=selected;
  if(!force&&review.day===day&&review.phase==='ready')return;
  if(!force&&review.day===day&&review.phase==='loading')return reviewPromise;
  const rev=++reviewRequest,expanded=review.day===day&&review.expanded,resetRail=review.day!==day;
  review={day,phase:'loading',report:null,error:'',expanded};draw({resetRail});
  reviewPromise=(async()=>{
   try{const value=await api('/report?day='+encodeURIComponent(day));if(rev!==reviewRequest||selected!==day||S.page!=='schedule')return;const report=value?.report||null;if(report?.day&&report.day!==day)throw Error('回顾日期与所选日期不一致，请重新读取。');review={day,phase:'ready',report,error:'',expanded};}
   catch(err){if(rev!==reviewRequest||selected!==day||S.page!=='schedule')return;review={day,phase:'error',report:null,error:err.message||'回顾暂时无法读取',expanded};}
   finally{if(rev===reviewRequest&&selected===day&&S.page==='schedule')draw();}
  })();
  return reviewPromise;
 }
 const loadAll=force=>Promise.all([load(force),loadReview(force)]);
 async function mount(){if(S.page!=='schedule')return;await loadAll(true);}
 async function selectDay(day,keepView=true){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;selected=day;if(view==='month'&&day.slice(0,7)!==anchor.slice(0,7)||view==='week'&&weekStart(day)!==weekStart(anchor)||view==='day'||view==='agenda'&&day.slice(0,7)!==anchor.slice(0,7))anchor=day;if(!keepView)view='month';draw();await loadAll();}
 async function mutate(payload,message){if(saving)return;saving=true;const buttons=root()?.querySelectorAll('.wc-dialog button');buttons?.forEach(b=>b.disabled=true);try{const result=await api('/calendar',payload);if(result?.event){const x=result.event,index=data.events.findIndex(x=>x.id===result.event.id);if(index>=0)data.events[index]=x;}await loadAll(true);if(message)toast(message);return result;}finally{saving=false;drawModal();}}
 async function click(b){
  const d=b?.dataset;if(!d)return false;
  if(d.wcClose){closeModal();return true;}
  if(d.wcTheme){theme=d.wcTheme;store('theme',theme);draw();return true;}
  if(d.wcDismissCard){cardHidden=true;store('cardHidden','1');draw();return true;}
  if(d.wcRefresh){await loadAll(true);return true;}
  if(d.wcView){view=d.wcView;store('view',view);anchor=selected;draw();await loadAll();return true;}
  if(d.wcSelect){await selectDay(d.wcSelect);return true;}
  if(d.wcToday){selected=anchor=today();draw();await loadAll();return true;}
  if(d.wcStep){const n=Number(d.wcStep);if(view==='day'||view==='week')selected=anchor=shiftDay(anchor,n*(view==='week'?7:1));else{const a=dateOf(anchor),wanted=a.getUTCDate();a.setUTCDate(1);a.setUTCMonth(a.getUTCMonth()+n);a.setUTCDate(Math.min(wanted,new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+1,0)).getUTCDate()));selected=anchor=dayOf(a);}draw();await loadAll();return true;}
  if(d.wcEvent){openModal({kind:'detail',id:d.wcEvent},b);return true;}
  if(d.wcNew){openModal({kind:'edit',draft:{type:'task',day:d.wcNew,priority:'重要',allDay:true}},b);return true;}
  if(d.wcEdit){const x=eventFor(d.wcEdit);if(x)openModal({kind:'edit',draft:{...x},original:{...x}},b);return true;}
  if(d.wcSource){const x=eventFor(d.wcSource);if(x?.source){closeModal();await openSource(x.source);}return true;}
  if(d.wcReviewRetry){await loadReview(true);return true;}
  if(d.wcReviewExpand){review.expanded=!review.expanded;draw();root()?.querySelector('[data-wc-review-expand]')?.focus({preventScroll:true});return true;}
  if(d.wcReviewSource){if(d.wcReviewDay!==selected||review.day!==selected)return true;const m=reviewMessages().find(x=>String(x.id)===String(d.wcReviewSource));if(canOpenReviewSource(m))await openSource(m);return true;}
  if(d.wcDone){const x=eventFor(d.wcDone);await mutate({op:'done',id:x.id,done:!x.done},x.done?'已恢复未完成':'已标记完成，处理记录保持同步');return true;}
  if(d.wcResponse){await mutate({op:'respond',id:d.wcId,response:d.wcResponse},'本地安排已更新，未发送 RSVP');return true;}
  if(d.wcAddTask){await mutate({op:'add-task',id:d.wcAddTask},'已加入本地待办');return true;}
  return false;
 }
 function input(t){if(t.dataset?.wcJump){if(t.value)void selectDay(t.value);return true;}if(t.dataset?.wcShowDone){showDone=t.checked;draw();return true;}if(t.dataset?.wcStartDay){const end=t.closest('form')?.querySelector('[name="endDay"]');if(end?.value===t.dataset.previousDay)end.value=t.value;t.dataset.previousDay=t.value;return true;}if(t.dataset?.wcAllDay){const form=t.closest('form');form?.querySelectorAll('[name="start"],[name="end"]').forEach(x=>x.disabled=t.checked);const label=form?.querySelector('[data-wc-end-day-label]');if(label)label.textContent=t.checked?'结束日期（含当天）':'结束日期（可跨天）';return true;}return false;}
 async function submit(form){
  if(form.getAttribute('id')!=='workCalendarForm')return false;
  const f=new FormData(form),allDay=f.has('allDay'),day=String(f.get('day')||''),endDay=String(f.get('endDay')||day),start=allDay?'':String(f.get('start')||''),end=allDay?'':String(f.get('end')||''),original=modal?.original;
  const timing={day,endDay,start,end,allDay},baseline=original?editorTiming(original):null,unchangedTiming=baseline&&Object.keys(timing).every(key=>timing[key]===baseline[key]);
  if(endDay<day){toast('结束日期不能早于开始日期');return true;}
  if(!allDay&&end&&(endDay+'T'+end<=day+'T'+start)){toast('结束时刻需要晚于开始时刻');return true;}
  const payload={op:'save',id:String(f.get('id')||''),type:String(f.get('type')),title:String(f.get('title')||'').trim(),priority:f.has('important')?'重要':'轻',project:String(f.get('project')||'').trim(),location:String(f.get('location')||'').trim(),url:String(f.get('url')||'').trim(),summary:String(f.get('summary')||'').trim()};
  if(!unchangedTiming){if(!allDay&&!start){toast('请填写开始时刻，或选择全天');return true;}if(!allDay&&endDay!==day&&!end){toast('跨天安排需要填写结束时刻');return true;}Object.assign(payload,{day,start:allDay?day:day+'T'+start,end:allDay?shiftDay(endDay,1):end?endDay+'T'+end:'',allDay,timeZone:displayZone()});}
  if(!payload.title){toast('请填写事项标题');return true;}
  if(modal?.kind==='edit')modal.draft={...modal.draft,...payload};await mutate(payload,'安排已保存在本地日历');closeModal();return true;
 }

 async function openEvent(id,day){const known=knownEventFor(id),target=day||known?.day||known?.proposedDay;if(target)await selectDay(target);await load(true);const event=eventFor(id);if(!event){toast('这项安排暂时无法打开，请刷新日历或查看原邮件。');return false;}if(event.day&&selected!==event.day)await selectDay(event.day);openModal({kind:'detail',id:event.id},root()?.querySelector(`[data-wc-event="${event.id}"]`));return true;}
 function keydown(ev){
  if(modal&&!root()){modal=null;return false;}
  if(modal){if(ev.key==='Escape'){ev.preventDefault();closeModal();return true;}if(ev.key==='Tab'){const items=[...root().querySelectorAll('.wc-dialog button,.wc-dialog input,.wc-dialog select,.wc-dialog textarea,.wc-dialog a')].filter(el=>!el.disabled&&el.getClientRects().length),first=items[0],last=items.at(-1);if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}return true;}return false;}
  if(S.page!=='schedule'||ev.target.closest('input,textarea,select'))return false;
  const dayButton=ev.target.closest('[data-wc-select]');if(dayButton&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)){ev.preventDefault();void selectDay(shiftDay(dayButton.dataset.wcSelect,{ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[ev.key])).then(()=>root()?.querySelector(`[data-wc-select="${selected}"]`)?.focus({preventScroll:true}));return true;}
  if(ev.key.toLowerCase()==='t'&&!ev.ctrlKey&&!ev.metaKey){ev.preventDefault();selected=anchor=today();draw();void loadAll();return true;}return false;
 }
 document.addEventListener('pointerdown',ev=>{if(modal&&ev.target.matches('.wc-modal-backdrop'))closeModal();});
 return {render,mount,click,input,submit,keydown,selectDay,openEvent,refresh:()=>loadAll(true),reset(){request++;reviewRequest++;reviewPromise=null;review={day:'',phase:'idle',report:null,error:'',expanded:false};modal=null;loading=false;loaded='';},sourceFor,selectedDay:()=>selected};
}
