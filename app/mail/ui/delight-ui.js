import {visibleInterval} from './lifecycle.js';
import {skyIcon} from './sky-icons.mjs';
import {CITIES,cityLabel,validPreferences,clockText,sunContext,weatherCaption,nextMeeting,accountEmails} from './delight-model.mjs';
export function createDelight({S,$,e,api,toast,openSchedule}){
 const KEY='mail.delight.v2';
 let pref;try{const saved=JSON.parse(localStorage.getItem(KEY)||'null'),legacy=JSON.parse(localStorage.getItem('mail.delight.v1')||'null');pref=validPreferences(saved||{mode:legacy?.mode,weather:legacy?.weather});}catch{pref=validPreferences();}
 let weather=null,weatherAt=0,weatherRequest=0,weatherPending=false,meetings=[],meetingAt=0,meetingPending=false,anchor=null,panelOpen=false,observer=null,locationReady=pref.cityMode==='manual',locationRequest=0,locationPending=false,locationMessage='',brandKey=null,brandRows=[],brandIndex=0,brandRevision=0,brandAnimations=[];
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(pref));}catch{}};
 const phase=()=>sunContext(weather,Date.now());
 function iconName(){const kind=weather?.current?.kind;if(kind==='unknown')return '';if(kind==='rain'||kind==='thunder'||kind==='sleet')return 'cloud-rain';if(kind==='snow')return 'cloud-snow';if(['cloudy','overcast','fog','dust'].includes(kind))return 'cloud';const code=Number(weather?.current?.code);if([176,263,266,281,284,293,296,299,302,305,308,311,314,353,356,359,386,389].includes(code))return 'cloud-rain';if([179,182,185,227,230,317,320,323,326,329,332,335,338,350,362,365,368,371,374,377,392,395].includes(code))return 'cloud-snow';return [116,119,122,143,248,260].includes(code)?'cloud':phase().mode==='night'?'moon':'sun';}
 function renderRibbon(){
  if(!['today','schedule'].includes(S.page))return '';
  const p=phase(),current=weather?.current,label=cityLabel(pref.city),next=nextMeeting(meetings),minute=next?Math.max(1,Math.ceil((Date.parse(next.start)-Date.now())/60000)):0;
  const date=new Intl.DateTimeFormat('zh-CN',{timeZone:weather?.timeZone||'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  const temp=pref.weather&&current&&Number.isFinite(current.temperature)?Math.round(current.temperature)+'°':'';
  const description=pref.weather&&current?current.description:pref.weather?'天气连接中':'日出日落';
  return '<section id="dayRibbon" class="day-ribbon" aria-label="城市时间天气与日照"><div class="day-ribbon-time">'+skyIcon(p.mode==='night'?'moon':'sun')+'<div><time class="day-clock">'+e(p.clock)+'</time><span class="day-date">'+e(date)+'</span></div></div><button class="day-ribbon-weather" data-sky-panel="1" aria-label="查看和设置城市天气与日照" aria-expanded="'+panelOpen+'"><span class="sky-weather-emblem">'+(iconName()?skyIcon(iconName()):'<span class="sky-neutral-weather" aria-hidden="true">°</span>')+'</span><span><span class="sky-city-label">'+e(label)+'</span> <b class="sky-temp">'+e(temp)+'</b><span class="sky-condition">'+e(description)+'</span><small class="sky-caption">'+e(weatherCaption(weather,pref.weather))+'</small></span></button><div class="day-ribbon-sun" aria-label="'+e(p.valid?'日出 '+p.sunrise+'，日落 '+p.sunset:'日出日落正在读取')+'"><div class="sun-track"><span class="sun-orbit" style="--sun-progress:'+(p.progress??.5)+'">'+skyIcon(p.mode==='night'?'moon':'sun')+'</span></div><span class="sun-hours"><span>日出 '+e(p.sunrise)+'</span><span>日落 '+e(p.sunset)+'</span></span></div><div class="day-ribbon-next">'+(next?'<button data-sky-meeting="'+e(next.id)+'"><small>'+e(minute<=15?'会前准备 · '+minute+' 分钟后':'下一场 · '+clockText(Date.parse(next.start),'Asia/Shanghai'))+'</small><b>'+e(next.title)+'</b><span>'+e(minute<=15?'原邮件与会议链接，一处查看':'还有 '+minute+' 分钟')+'</span></button>':'<span class="sky-next-caption">'+(meetingPending?'正在核对安排':'下一场安排')+'</span><b>'+e(meetingAt?'今日暂无后续定时会议':'从日历查看当天会议')+'</b><button data-sky-calendar="1">打开工作日历</button>')+'</div></section>';
 }
 function panelHTML(){
  const name=cityLabel(pref.city);
  return '<section id="skyPanel" class="sky-popover" role="dialog" aria-label="天气与外观设置" '+(panelOpen?'':'hidden')+'><div class="sky-panel-heading"><div><small>一天的光线</small><h2>'+e(name)+' · '+e(phase().clock)+'</h2></div><button type="button" data-sky-close="1" aria-label="关闭天气与外观设置">×</button></div><form id="skyPreferences" class="sky-preferences"><label>城市<select name="city" aria-label="天气与日照城市">'+CITIES.map(x=>'<option value="'+x[0]+'" '+(pref.city===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select></label><button type="button" data-sky-location="1" aria-pressed="'+(pref.cityMode==='auto')+'">按 IP 选择城市</button><p class="sky-location-status">'+e(locationMessage|| (pref.cityMode==='manual'?'已使用手选城市':'按 IP 识别城市'))+'</p><label class="sky-weather-check"><input type="checkbox" name="weather" aria-label="显示天气" '+(pref.weather?'checked':'')+'>显示天气</label><div class="sky-mode-options" role="group" aria-label="外观模式">'+[['auto','跟随宿主'],['day','日间'],['night','夜间']].map(x=>'<button type="button" data-sky-mode="'+x[0]+'" aria-pressed="'+(pref.mode===x[0])+'">'+x[1]+'</button>').join('')+'</div><button type="button" data-sky-refresh="1" '+(weatherPending?'disabled':'')+'>'+e(weatherPending?'正在更新':'更新天气与日照')+'</button></form><p class="sky-source">天气每 2 小时自动更新；时间独立运行。<br>开启天气后会访问天气服务；按 IP 选择城市会访问 IP 服务。可手动选城市，不读取设备定位。</p><p class="sky-provider-status"></p></section>';
 }
 function draw(){
  const p=phase(),mode=pref.mode==='auto'?(document.documentElement.dataset.hostAppearance==='dark'?'night':'day'):pref.mode;
  document.body.dataset.mailTheme=mode;document.body.dataset.dayPhase=p.period;document.body.dataset.documentHidden=String(document.hidden);
  const toggle=$('#skyThemeToggle');if(toggle){toggle.innerHTML='<span class="sky-toggle-track"><i>'+skyIcon(mode==='night'?'moon':'sun')+'</i></span><span class="sky-theme-label">'+(pref.mode==='auto'?'跟随宿主':mode==='night'?'夜间':'日间')+'</span>';toggle.setAttribute('aria-label','外观：'+(pref.mode==='auto'?'跟随宿主':mode==='night'?'夜间':'日间')+'，点击切换');toggle.setAttribute('aria-pressed',String(mode==='night'));}
  const old=$('#dayRibbon');if(old)old.outerHTML=renderRibbon();
  else{const header=$('#workspace .wc-heading')||$('#workspace .workspace-heading');if(header&&['today','schedule'].includes(S.page))header.insertAdjacentHTML('afterend',renderRibbon());}
  const panel=$('#skyPanel');if(panel){
   panel.hidden=!panelOpen;
   panel.querySelector('h2').textContent=cityLabel(pref.city)+' · '+p.clock;
   const form=panel.querySelector('form');form.elements.city.value=pref.city;form.elements.weather.checked=pref.weather;
   panel.querySelectorAll('[data-sky-mode]').forEach(b=>b.setAttribute('aria-pressed',String(pref.mode===b.dataset.skyMode)));
   const locate=panel.querySelector('[data-sky-location]');if(locate){locate.disabled=locationPending;locate.setAttribute('aria-pressed',String(pref.cityMode==='auto'));locate.textContent=locationPending?'正在识别城市':'按 IP 选择城市';}const location=panel.querySelector('.sky-location-status');if(location)location.textContent=locationMessage||(pref.cityMode==='manual'?'已使用手选城市':'按 IP 识别城市');const provider=panel.querySelector('.sky-provider-status');if(provider)provider.textContent=(weather?.source?.weather?'数据来源：'+weather.source.weather+'。':'')+(weather?.source?.type==='forecast'?'预报有效时间 '+new Date(weather.validAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'。':'')+'日出日落按城市坐标及当地日期计算。';
   const refresh=panel.querySelector('[data-sky-refresh]');refresh.disabled=weatherPending;refresh.textContent=weatherPending?'正在更新':'更新天气与日照';
  }
  updateBrand();
 }
 async function loadWeather(force=false){
  if(weatherPending||pref.cityMode==='auto'&&!locationReady)return;
  const changedDay=weather&&weather.localDate!==phase().date;
  if(!force&&!changedDay&&weatherAt&&Date.now()-weatherAt<(!pref.weather||weather?.current&&!weather.stale?2*60*60000:2*60000)){draw();return;}
  const rev=++weatherRequest,city=pref.city,enabled=pref.weather;
  weatherPending=true;draw();
  try{
   if(enabled&&!weather){const solar=await api('/weather?'+new URLSearchParams({city,weather:'0'}));if(rev!==weatherRequest||city!==pref.city)return;weather={...solar,status:'loading'};draw();}
   const data=await api('/weather?'+new URLSearchParams({city,weather:enabled?'1':'0',force:force?'1':'0'}));if(rev!==weatherRequest||city!==pref.city||enabled!==pref.weather)return;weather=data;weatherAt=Date.now();
  }
  catch(err){if(rev===weatherRequest){weather=weather?{...weather,stale:true,status:weather.current?'stale':'unavailable'}:null;weatherAt=Date.now();}}
  finally{if(rev===weatherRequest){weatherPending=false;draw();}}
 }
 async function loadMeetings(force=false){
  if(meetingPending||!force&&meetingAt&&Date.now()-meetingAt<60000)return;
  const day=S.state.today;meetingPending=true;
  try{const value=await api('/calendar/reminders?'+new URLSearchParams({day}));if(day===S.state.today){meetings=value.meetings||[];meetingAt=Date.now();}}
  catch{}finally{meetingPending=false;draw();}
 }
 function decorate(){
  updateBrand();
  if(document.querySelector('[aria-modal="true"]'))settleBrand();
  if(panelOpen&&document.querySelector('[aria-modal="true"]')){
   panelOpen=false;$('#skyPanel').hidden=true;$('#dayRibbon [data-sky-panel]')?.setAttribute('aria-expanded','false');
  }
  $('#searchForm')?.classList.toggle('has-query',!!$('#searchInput')?.value.trim());
  for(const send of document.querySelectorAll('[data-confirm-send],[data-quick-send]'))if(!send.dataset.intentReady&&!send.classList.contains('is-submitting')){
   send.dataset.intentReady='1';send.classList.add('send-intent');send.setAttribute('aria-label','确认发送');
   send.innerHTML='<span class="send-intent-window"><span class="send-label">确认发送</span><span class="send-hover-label" aria-hidden="true">准备好了</span></span><i class="send-charge" aria-hidden="true"></i>';
  }
  const dialog=$('.wc-dialog');
  if(dialog&&!dialog.dataset.paperReady){
   dialog.dataset.paperReady='1';dialog.classList.add('paper-detail');
   if(anchor&&Date.now()-anchor.at<1500&&!reduced()){
    const r=dialog.getBoundingClientRect(),dx=Math.max(-180,Math.min(180,anchor.x-r.left-r.width/2)),dy=Math.max(-120,Math.min(120,anchor.y-r.top-r.height/2));
    dialog.style.animation='none';
    dialog.animate([{opacity:.3,transform:'translate('+dx+'px,'+dy+'px) scale(.94)',clipPath:'inset(28% 25% round 16px)'},{opacity:1,transform:'none',clipPath:'inset(0% 0% round 24px)'}],{duration:400,easing:'cubic-bezier(.16,1,.3,1)'});
   }
  }
  const header=$('#workspace .wc-heading')||$('#workspace .workspace-heading');
  if(header&&!$('#dayRibbon')&&['today','schedule'].includes(S.page)){header.insertAdjacentHTML('afterend',renderRibbon());if(pref.cityMode==='auto'&&!locationReady)void loadLocation();else void loadWeather();void loadMeetings();}
 }
 async function loadLocation(){
  if(!pref.weather||locationPending||pref.cityMode!=='auto')return;
  const rev=++locationRequest;locationPending=true;locationMessage='正在按 IP 识别城市';draw();
  try{const data=await api('/weather/location');if(rev!==locationRequest||pref.cityMode!=='auto')return;pref.city=CITIES.some(x=>x[0]===data.city)?data.city:'shanghai';locationMessage=data.status==='fallback'?(data.message||'城市未匹配，当前使用上海，可手动选择'):('IP 城市：'+cityLabel(pref.city));save();}
  catch{if(rev===locationRequest){locationMessage='城市连接未完成，当前使用 '+cityLabel(pref.city)+'，可手动选择';}}
  finally{if(rev===locationRequest){locationPending=false;locationReady=true;weatherRequest++;weatherPending=false;weather=null;weatherAt=0;draw();if(pref.weather&&pref.cityMode==='auto'&&!locationReady)void loadLocation();else void loadWeather(true);}}
 }
 function tickClock(){if(document.hidden)return;const p=phase();const time=$('.day-clock');if(time&&time.textContent!==p.clock)time.textContent=p.clock;const heading=$('#skyPanel h2');if(heading){const text=cityLabel(pref.city)+' · '+p.clock;if(heading.textContent!==text)heading.textContent=text;}}
 function updateBrand(){
  const box=$('.brand-account-window');if(!box)return;
  const rows=accountEmails(S.state.accounts||[],S.page==='compose'?S.compose?.accountId:S.account),key=rows.join('|');if(key===brandKey&&box.querySelector('.brand-email-row'))return;
  brandRevision++;brandAnimations.forEach(a=>a.cancel());brandAnimations=[];brandKey=key;brandRows=rows;brandIndex=0;
  box.innerHTML='<small class="brand-email-row">'+e(rows[0]||'添加邮箱账号')+'</small>';box.title=rows.join(' / ');box.setAttribute('aria-label',rows.length?'邮箱账号：'+rows.join('，'):'添加邮箱账号');
 }
 function settleBrand(){
  if(!brandAnimations.length)return;brandRevision++;brandAnimations.forEach(a=>a.cancel());brandAnimations=[];
  const box=$('.brand-account-window');if(box)box.innerHTML='<small class="brand-email-row">'+e(brandRows[brandIndex]||'添加邮箱账号')+'</small>';
 }
 async function rollBrand(){
  const box=$('.brand-account-window'),home=$('.brand-home');if(!box||!home||brandRows.length<2||document.hidden||reduced()||document.body.classList.contains('sidebar-collapsed')||document.querySelector('[aria-modal="true"]')||home.matches(':hover,:focus-within')||!box.getClientRects().length)return;
  const revision=++brandRevision,old=box.querySelector('.brand-email-row');brandIndex=(brandIndex+1)%brandRows.length;
  const next=document.createElement('small');next.className='brand-email-row';next.textContent=brandRows[brandIndex];box.append(next);
  const frames=[{opacity:0,transform:'translateY(28px)'},{opacity:1,transform:'translateY(0)'}],options={duration:450,easing:'cubic-bezier(.16,1,.3,1)'};
  brandAnimations=[old?.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-28px)'}],options),next.animate(frames,options)].filter(Boolean);
  await Promise.all(brandAnimations.map(a=>a.finished.catch(()=>{})));if(revision!==brandRevision)return;old?.remove();brandAnimations=[];
 }
 function chooseMode(value){pref.mode=value;save();draw();}
 function boot(){
  const brand=$('.sidebar-brand');if(brand)brand.innerHTML='<button type="button" class="brand-home" data-sky-home="1" aria-label="Mail工作台，返回今日"><span class="brand-mark mail-brand-mark" aria-hidden="true"><img src="./assets/brand.svg" alt="" width="38" height="38"></span><div><b>Mail</b><span class="brand-account-window" aria-label="邮箱账号"><small class="brand-email-row"></small></span></div></button>';
  const opening=$('#searchForm>.muted');if(opening){const b=document.createElement('button');b.type='button';b.className='muted search-opening';b.dataset.skySearch='1';b.setAttribute('aria-label','展开搜索邮件');b.title='搜索邮件（'+(/Mac/i.test(navigator.platform)?'⌘ K':'Ctrl K')+'）';b.innerHTML=opening.innerHTML;opening.replaceWith(b);}
  const end=$('.top-end');if(end){end.insertAdjacentHTML('beforeend','<button type="button" id="skyThemeToggle" class="sky-theme-toggle" data-sky-theme="1"></button>');}
  document.body.insertAdjacentHTML('beforeend',panelHTML());
  document.addEventListener('click',async ev=>{
   const b=ev.target.closest('button');
   if(ev.target.closest('[data-wc-event]')){const r=ev.target.closest('[data-wc-event]').getBoundingClientRect();anchor={x:r.left+r.width/2,y:r.top+r.height/2,at:Date.now()};}
   if(!b)return;
   if(b.dataset.toggleSidebar)settleBrand();
   if(b.dataset.skySearch){$('#searchForm')?.classList.add('is-open');$('#searchInput')?.focus();return;}
   if(b.dataset.skyTheme){chooseMode(pref.mode==='auto'?'day':pref.mode==='day'?'night':'auto');return;}
   if(b.dataset.skyMode){chooseMode(b.dataset.skyMode);return;}
   if(b.dataset.skyPanel){panelOpen=!panelOpen;draw();if(panelOpen)$('#skyPanel select')?.focus();return;}
   if(b.dataset.skyClose){panelOpen=false;draw();$('#dayRibbon [data-sky-panel]')?.focus();return;}
   if(b.dataset.skyLocation){pref.cityMode='auto';save();locationReady=false;void loadLocation();return;}
   if(b.dataset.skyRefresh){await loadWeather(true);return;}
   if(b.dataset.skyMeeting){const x=meetings.find(x=>x.id===b.dataset.skyMeeting);if(x)await openSchedule(x);return;}
   if(b.dataset.skyCalendar){$('.sidebar [data-nav=schedule]')?.click();return;}
   if(b.dataset.skyHome){$('.sidebar [data-nav=today]')?.click();return;}
  });
  document.addEventListener('pointerdown',ev=>{if(panelOpen&&!ev.target.closest('#skyPanel,[data-sky-panel]')){panelOpen=false;$('#skyPanel').hidden=true;$('#dayRibbon [data-sky-panel]')?.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',ev=>{
   if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='k'){ev.preventDefault();ev.stopImmediatePropagation();if(document.querySelector('[aria-modal="true"]'))return;$('#searchForm')?.classList.add('is-open');$('#searchInput')?.focus();}
   if(ev.key==='Escape'&&panelOpen&&!document.querySelector('[aria-modal="true"]')){ev.preventDefault();ev.stopImmediatePropagation();panelOpen=false;draw();$('#dayRibbon [data-sky-panel]')?.focus();}
  },true);
  document.addEventListener('input',ev=>{if(ev.target.id==='searchInput')$('#searchForm')?.classList.toggle('has-query',!!ev.target.value.trim());});
  document.addEventListener('focusout',ev=>{if(ev.target.closest('#searchForm'))queueMicrotask(()=>{const f=$('#searchForm');if(f&&!f.contains(document.activeElement)&&!$('#searchInput').value.trim())f.classList.remove('is-open');});});
  document.addEventListener('change',ev=>{
   if(!ev.target.closest('#skyPreferences'))return;
   const form=$('#skyPreferences');const cityChanged=ev.target===form.elements.city;pref=validPreferences({city:form.elements.city.value,cityMode:cityChanged?'manual':pref.cityMode,weather:form.elements.weather.checked,mode:pref.mode});if(cityChanged){locationRequest++;locationPending=false;locationReady=true;locationMessage='已使用手选城市';}save();
   weatherRequest++;weatherPending=false;weather=null;weatherAt=0;draw();if(pref.weather&&pref.cityMode==='auto'&&!locationReady)void loadLocation();else void loadWeather(true);
  });
  document.addEventListener('submit',ev=>{if(ev.target.getAttribute('id')==='skyPreferences')ev.preventDefault();});
  document.addEventListener('mail:theme',()=>draw());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)settleBrand();draw();if(!document.hidden&&['today','schedule'].includes(S.page)){if(pref.cityMode==='auto'&&!locationReady)void loadLocation();else void loadWeather();void loadMeetings();}});
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');motionQuery.addEventListener?.('change',()=>{if(motionQuery.matches)settleBrand();});
  observer=new MutationObserver(decorate);observer.observe(document.body,{childList:true,subtree:true});
  draw();decorate();
  if($('#workspace .wc-heading')||$('#workspace .workspace-heading')){if(pref.cityMode==='auto')void loadLocation();else void loadWeather();void loadMeetings();}
  visibleInterval(tickClock,1000);visibleInterval(rollBrand,4000);
  visibleInterval(()=>{if(!document.hidden){draw();if(['today','schedule'].includes(S.page)){void loadWeather();void loadMeetings();}}},60000);
 }
 return {boot,draw};
}
