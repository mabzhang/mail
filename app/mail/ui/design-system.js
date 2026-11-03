/* Shared icons and motion for the mail workspace. No external runtime or fonts. */
const paths={
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
 today:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 16h7m-7 4h5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1"/>',
 unread:'<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m3 10 9 6 9-6"/><path d="M9 8h6"/>',
 drafts:'<path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="m16 3 5 5-9 9-5 1 1-5z"/>',
 outbox:'<path d="m22 2-7 20-4-9L2 9z"/><path d="m22 2-11 11"/>',
 followups:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
 settings:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 menu:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',
 chevronsLeft:'<path d="m17 6-6 6 6 6m-7-12-6 6 6 6"/>',chevronsRight:'<path d="m7 6 6 6-6 6m7-12 6 6-6 6"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 spark:'<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6z"/>',
 check:'<path d="m5 12 4 4L19 6"/>',undo:'<path d="M3 9h10a7 7 0 0 1 0 14M3 9l5-5M3 9l5 5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 flag:'<path d="M5 21V3h12l-2 4 2 4H5"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
 refresh:'<path d="M20 7a9 9 0 0 0-15-2L3 7m0-5v5h5m-4 10a9 9 0 0 0 15 2l2-2m0 5v-5h-5"/>',
 attachment:'<path d="m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3m-6 14 10-10"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3z"/>'
};
export function icon(name,cls=''){return `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.mail}</svg>`;}
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export function animate(el,frames,options={}){if(!el||reduced())return null;return el.animate(frames,{duration:320,easing:'cubic-bezier(.2,.8,.2,1)',...options});}
export function animateRows(root){if(reduced())return;root?.querySelectorAll('.action-row,.period-projects>article').forEach((el,i)=>animate(el,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:280,delay:Math.min(i,5)*25}));}
export function mountDesign(S){
 const $=s=>document.querySelector(s);
 if($('.search-key'))$('.search-key').textContent=/Mac/i.test(navigator.platform)?'⌘ K':'Ctrl K';
 const names={today:'today',schedule:'calendar',calendar:'calendar',mail:'mail',unread:'unread',drafts:'drafts',outbox:'outbox',followups:'followups'};
 document.querySelectorAll('.sidebar [data-nav]').forEach(el=>{el.querySelector('.glyph').innerHTML=icon(names[el.dataset.nav]);});
 $('.sidebar #settingsSide .glyph').innerHTML=icon('settings');
 $('[data-toggle-sidebar]').innerHTML=icon('menu');$('#settingsTop').innerHTML=icon('settings');$('#writeTop').innerHTML=icon('plus')+'<span>写邮件</span>';
 $('#searchForm>.muted').innerHTML=icon('search');
 let lastPage='',lastSelected='';
 const decorate=root=>{
  if(!root)return;
  root.querySelectorAll('[data-visual-icon]:not([data-icon-ready])').forEach(el=>{el.insertAdjacentHTML('afterbegin',icon(el.dataset.visualIcon));el.dataset.iconReady='1';});
  root.querySelectorAll('[data-generate]:not([data-icon-ready]),[data-export]:not([data-icon-ready]),[data-refresh-mail]:not([data-icon-ready])').forEach(el=>{el.insertAdjacentHTML('afterbegin',icon(el.dataset.export?'download':'refresh'));el.dataset.iconReady='1';});
  root.querySelectorAll('[data-ai-write]:not([data-icon-ready]),[data-pick-contact]:not([data-icon-ready]),.file-button:not([data-icon-ready])').forEach(el=>{if(el.dataset.pickContact)el.innerHTML='选择联系人';el.insertAdjacentHTML('afterbegin',icon(el.dataset.aiWrite?'spark':el.dataset.pickContact?'plus':'attachment'));el.dataset.iconReady='1';});
  root.querySelectorAll('.folder:not([data-icon-ready])').forEach(el=>{el.insertAdjacentHTML('afterbegin',icon(el.dataset.folder==='INBOX'?'mail':el.dataset.folder==='Sent'?'outbox':'folder'));el.dataset.iconReady='1';});
  root.querySelectorAll('.empty:not([data-icon-ready])').forEach(el=>{const first=el.firstElementChild;if(first?.tagName==='DIV')first.innerHTML=icon('mail');el.dataset.iconReady='1';});
 };
 const observer=new MutationObserver(records=>{
  const workspace=$('#workspace'),page=workspace.firstElementChild;
  decorate(workspace);decorate($('#drawerRoot'));
  const key=S.page+(S.page==='calendar'?':'+(workspace.querySelector('#periodRoot')?'period':'daily'):'');
  if(lastPage!==key){lastPage=key;animate(page,[{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:420});}
  const selected=S.selected?.id||'';
  if(selected!==lastSelected){lastSelected=selected;animate($('#mailDetail'),[{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:300});}
  const indicator=$('.connection-dot');if(indicator){indicator.classList.toggle('offline',S.state.service!=='ready');indicator.title=S.state.service==='ready'?'邮件后台已连接':'邮件后台未连接';}
  const title=$('#viewLabel');if(title)title.textContent=({today:'工作台',schedule:'工作日历',calendar:'邮件回顾',mail:'我的邮箱',unread:'未读邮件',compose:'撰写邮件',drafts:'草稿',outbox:'发送记录',followups:'跟进事项','send-result':'发送记录'})[S.page]||'邮件';
 });
 observer.observe($('#workspace'),{childList:true,subtree:true});observer.observe($('#drawerRoot'),{childList:true,subtree:true});
 // Native details receive an actual height transition, including closing.
 document.addEventListener('click',ev=>{
  const summary=ev.target.closest('summary'),details=summary?.parentElement;
  if(!details||details.tagName!=='DETAILS'||reduced())return;
  if(details.dataset.animating){ev.preventDefault();return;}ev.preventDefault();
  const start=details.getBoundingClientRect().height,wasOpen=details.open;
  details.dataset.animating='1';details.style.overflow='hidden';
  if(!wasOpen)details.open=true;
  const end=wasOpen?summary.getBoundingClientRect().height:details.scrollHeight;
  const a=animate(details,[{height:start+'px'},{height:end+'px'}],{duration:280});
  a.finished.then(()=>{if(wasOpen)details.open=false;details.style.overflow='';details.style.height='';delete details.dataset.animating;}).catch(()=>{delete details.dataset.animating;});
 });
 document.addEventListener('keydown',ev=>{if((ev.metaKey||ev.ctrlKey)&&ev.key.toLowerCase()==='k'){ev.preventDefault();$('#searchInput').focus();}});
 decorate($('#workspace'));
}

export async function dismissSettings(){
  const root=document.querySelector('#drawerRoot'),drawer=root.querySelector('.settings-drawer');
  if(!drawer){root.replaceChildren();return;}if(drawer.dataset.closing)return;
  drawer.dataset.closing='1';
  const motion=animate(drawer,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(60px)'}],{duration:220});
  if(motion)try{await motion.finished;}catch{}
  if(root.contains(drawer))root.replaceChildren();document.querySelector('#settingsTop')?.focus();
}
