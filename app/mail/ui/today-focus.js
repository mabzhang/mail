import {senderName,compactText,focusItems} from './focus-model.mjs';
import {animate} from './design-system.js';
export function createTodayFocus({S,$,e,api,toast,openSource,openSchedule,icon}){
 const HOLD_MS=1000,TRANSITION_MS=450,PAUSE_CHECK_MS=100;
 let rows=[],meetings=[],index=0,day='',version='',request=0,timer=null,paused=false,suspended=false,motionRevision=0,motions=[];
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function clearTimer(){clearTimeout(timer);timer=null;}
 function schedule(delay=HOLD_MS){clearTimer();if(rows.length>1&&!paused&&!document.hidden&&!reduced()&&S.page==='today'&&S.day===day)timer=setTimeout(autoStep,delay);}
 const localTime=x=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(x));
 function timeLabel(x){if(x.allDay)return '全天';const start=Date.parse(x.start),end=Date.parse(x.end),now=Date.now();if(!Number.isFinite(start))return '时间待核对';if(x.day===S.state.today&&start>now&&start-now<=3600000)return Math.ceil((start-now)/60000)+' 分钟后开始';if(start<=now&&end>now)return '会议进行中';if(Number.isFinite(end)&&end<=now)return localTime(x.start)+' · 时间已过';return localTime(x.start)+(x.end&&Number.isFinite(end)?'–'+localTime(x.end):'');}
 function itemHTML(x){if(!x)return `<span class="focus-empty">${icon('check')}暂时没有需要处理的今日提醒</span>`;const label=x.type==='meeting'?'今日会议':x.overdue?'已逾期':x.type==='confirm'?'待确认':x.type==='reply'?'待回复':'待办';return `<button class="focus-item" data-focus-open="${e(x.id)}" title="${e(x.title)}"><span class="focus-item-top">${['重要','重要且急','急'].includes(x.priority)?'<b class="focus-important">重要</b>':''}<span class="focus-type ${x.type==='meeting'?'is-meeting':''}">${label}</span><span class="focus-sender">${e(senderName(x.source?.from||x.organizer||'本地日程',S.contacts||[]))}</span><span class="focus-project">${e(compactText(x.project,12))}</span>${x.type==='meeting'?'<time>'+e(timeLabel(x))+'</time>':''}</span><span class="focus-description"><span>${e(x.description||compactText(x.title,30))}</span>${icon('arrow')}</span></button>`;}
 const slideHTML=x=>`<div class="focus-slide" data-focus-slide="current">${itemHTML(x)}</div>`;
 function cancelMotion(){motionRevision++;const active=motions.length;for(const motion of motions)motion.cancel?.();motions=[];const item=active&&$('#focusItem');if(item)item.innerHTML=slideHTML(rows[index]);}
 function header(){return `<section id="todayFocus" class="today-focus" aria-label="今日重点提醒"><div class="focus-eyebrow"><span>${icon('flag')}今日重点</span><div class="focus-controls"><span id="focusCount">${rows.length?Math.min(index+1,rows.length)+' / '+rows.length:'0 项'}</span><button data-focus-step="-1" aria-label="上一条今日提醒" ${rows.length<2?'disabled':''}>${icon('left')}</button><button data-focus-pause="1" aria-label="${paused?'继续自动轮播':'暂停自动轮播'}" aria-pressed="${paused}" ${rows.length<2?'disabled':''}>${paused?'▶':'Ⅱ'}</button><button data-focus-step="1" aria-label="下一条今日提醒" ${rows.length<2?'disabled':''}>${icon('right')}</button></div></div><div id="focusItem" class="focus-loop">${slideHTML(rows[index])}</div></section>`;}
 function meetingHTML(){return `<section class="meeting-strip ${meetings.length?'has-meetings':''}" id="todayMeetings" aria-label="今日会议"><div class="meeting-strip-heading"><div class="meeting-emblem">${icon('calendar')}</div><div><span class="eyebrow">先安排好时间</span><h2>今日会议 <b>${meetings.length}</b></h2></div><button class="meeting-calendar-link" data-focus-calendar="1">工作日历 ${icon('arrow')}</button></div>${meetings.length?`<div class="meeting-strip-list">${meetings.slice(0,3).map(x=>`<button class="meeting-strip-event" data-focus-event="${e(x.id)}"><time>${e(timeLabel(x))}</time><b>${e(compactText(x.title,35))}</b><span>${e(senderName(x.organizer||x.source?.from||'本地日程',S.contacts||[]))}${x.location?' · '+e(compactText(x.location,24)):''}</span>${icon('arrow')}</button>`).join('')}${meetings.length>3?`<button class="meeting-strip-more" data-focus-calendar="1">还有 ${meetings.length-3} 场，查看全部</button>`:''}</div>`:'<p class="meeting-clear">今日暂无已明确时间的会议，可以专注眼前的工作。<button data-focus-calendar="1">安排新日程</button></p>'}</section>`;}
 function draw(){if(S.page!=='today')return;cancelMotion();if($('#todayFocus'))$('#todayFocus').outerHTML=header();if($('#todayMeetings'))$('#todayMeetings').outerHTML=meetingHTML();suspended=false;schedule();}
 function step(delta=1){
  if(rows.length<2||S.page!=='today'||S.day!==day)return;
  clearTimer();suspended=false;
  const previous=rows[index];index=(index+delta+rows.length)%rows.length;
  const item=$('#focusItem');cancelMotion();
  if(!item)return;
  if($('#focusCount'))$('#focusCount').textContent=(index+1)+' / '+rows.length;
  const current=rows[index],revision=motionRevision,currentDay=day;
  if(reduced()){item.innerHTML=slideHTML(current);schedule();return;}
  // Both complete reminders share the same clipped grid cell. Keep the outgoing
  // copy visible until it leaves; only the incoming item can receive interaction.
  item.innerHTML=`<div class="focus-slide is-leaving" data-focus-slide="out" aria-hidden="true" inert>${itemHTML(previous)}</div><div class="focus-slide" data-focus-slide="in">${itemHTML(current)}</div>`;
  motions=[animate(item.querySelector('[data-focus-slide="out"]'),[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-100%)'}],{duration:TRANSITION_MS,easing:'cubic-bezier(.4,0,.2,1)',fill:'both'}),animate(item.querySelector('[data-focus-slide="in"]'),[{opacity:0,transform:'translateY(100%)'},{opacity:1,transform:'translateY(0)'}],{duration:TRANSITION_MS,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'})].filter(Boolean);
  if(!motions.length){item.innerHTML=slideHTML(current);schedule();return;}
  Promise.all(motions.map(motion=>motion.finished)).then(()=>{
   if(revision!==motionRevision||S.page!=='today'||S.day!==currentDay||$('#focusItem')!==item)return;
   // Start a complete one-second still hold only after both slides settle.
   motions=[];item.innerHTML=slideHTML(current);schedule();
  },()=>{});
 }
 function autoStep(){
  timer=null;
  const box=$('#todayFocus');
  // Read actual pointer/focus state so moving between controls cannot resume it,
  // and a redraw cannot leave a stale hover flag blocking rotation forever.
  if(paused||document.hidden||S.page!=='today'||S.day!==day||!box||!box.getClientRects().length||box.matches(':hover')||box.contains(document.activeElement)||document.querySelector('[aria-modal="true"]')||reduced()){suspended=true;schedule(PAUSE_CHECK_MS);return;}
  // Leaving a hover/focus/modal pause gets a fresh readable hold, not an
  // immediate replacement at the first polling tick after interaction ends.
  if(suspended){suspended=false;schedule();return;}
  step();
 }
 async function mount(force=false){
  if(S.page!=='today')return;
  const requestedDay=S.day,next=requestedDay+'|'+(S.report?.updatedAt||0),messages=S.report?.messages||[];
  if(!force&&day===requestedDay&&version===next){draw();return;}
  const n=++request;
  clearTimer();cancelMotion();
  try{
   const [board,reminders]=await Promise.all([api('/actions?'+new URLSearchParams({day:requestedDay,scope:'day'})),api('/calendar/reminders?'+new URLSearchParams({day:requestedDay}))]);
   if(n!==request||S.page!=='today'||S.day!==requestedDay)return;
   const previousId=day===requestedDay?rows[index]?.id:null;
   day=requestedDay;version=next;
   rows=focusItems(board,reminders,messages,day);
   meetings=(reminders.meetings||[]).filter(x=>!x.done&&!x.cancelled&&!['cancelled','done'].includes(String(x.status||'').toLowerCase()));
   index=Math.max(0,rows.findIndex(x=>x.id===previousId));
   draw();
  }catch(error){if(n===request&&S.page==='today'&&S.day===requestedDay&&$('#focusItem'))$('#focusItem').innerHTML='<span class="focus-empty">提醒暂未读取 <button data-focus-retry="1">重试</button></span>';}
 }
 async function click(b){if(b.dataset.focusStep){step(Number(b.dataset.focusStep));return true;}if(b.dataset.focusPause){paused=!paused;clearTimer();if(paused)cancelMotion();else{suspended=false;schedule();}b.textContent=paused?'▶':'Ⅱ';b.setAttribute('aria-label',paused?'继续自动轮播':'暂停自动轮播');b.setAttribute('aria-pressed',String(paused));return true;}if(b.dataset.focusRetry){await mount(true);return true;}if(b.dataset.focusCalendar){await openSchedule();return true;}if(b.dataset.focusEvent){const x=meetings.find(x=>x.id===b.dataset.focusEvent);if(x)await openSchedule(x);return true;}if(b.dataset.focusOpen){const x=rows.find(x=>x.id===b.dataset.focusOpen);if(x?.type==='meeting')await openSchedule(meetings.find(m=>m.id===x.eventId)||x);else if(x?.source?.uid)await openSource(x.source);else if(x)await openSchedule(x);return true;}return false;}
 function environmentChanged(){clearTimer();cancelMotion();suspended=false;if(!document.hidden&&!reduced())schedule();}
 document.addEventListener?.('visibilitychange',environmentChanged);
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',environmentChanged);
 return {header,meetingHTML,mount,click,reset(){request++;clearTimer();cancelMotion();rows=[];meetings=[];index=0;day='';version='';suspended=false;},sourceFor(id){return rows.find(x=>x.source?.id===id)?.source;}};
}
