import {icon,animate,animateRows} from './design-system.js';
import {createPeriodUI} from './period-ui.js';
const KINDS = [['confirm','待确认','需要你核对或决定'],['reply','待回复','需要你给出答复'],['todo','待办','需要你执行的工作'],['notice','待知晓','了解信息即可']];
const PAGE_SIZE = 8;
export function createWorkspaceUI({S,$,e,api,request:hostRequest,toast,openMessage,openSource,phrasesHTML,summaryPage}) {
  const P=createPeriodUI({S,$,e,api,request:hostRequest,toast,summaryPage,openMessage:openSource});
  let board = null, tab = 'all', page = 0, scope = 'day', stateFilter = 'open', query = '', calendarMode = 'days', pickerYear = null, request = 0, loaded = '', activeSettings = 'accounts', undoItem = null;
  const boardKey = () => S.day + ':' + S.page + ':' + (S.page === 'calendar' ? 'day' : scope);
  const label = kind => KINDS.find(x => x[0] === kind)?.[1] || '事项';
  const section = (title, hint, body, open=false) => `<details class="settings-section" ${open?'open':''}><summary><span>${e(title)}<small>${e(hint)}</small></span></summary><div class="settings-section-body">${body}</div></details>`;
  function calendar() {
    const [year,month] = S.month.split('-').map(Number), saved = S.state.archive || [];
    const monthCount = saved.filter(d => d.startsWith(S.month)).length;
    const controls = `<div class="calendar-year"><button data-calendar-year="-1" aria-label="上一年">${icon('chevronsLeft')}</button><button class="year-title" data-calendar-mode="years" aria-expanded="${calendarMode==='years'}">${year} 年</button><button data-calendar-year="1" aria-label="下一年">${icon('chevronsRight')}</button></div><div class="calendar-month"><button data-month="-1" aria-label="上个月">${icon('left')}</button><button class="month-title" data-calendar-mode="months" aria-expanded="${calendarMode==='months'}">${month}<small>月</small></button><button data-month="1" aria-label="下个月">${icon('right')}</button></div>`;
    let grid = '';
    if (calendarMode === 'years') {
      const base = Math.floor((pickerYear || year) / 12) * 12;
      grid = `<div class="picker-heading"><button data-year-range="-12" aria-label="前十二年">前 12 年</button><span>${base} — ${base+11}</span><button data-year-range="12" aria-label="后十二年">后 12 年</button></div><div class="calendar-picker">${Array.from({length:12},(_,i)=>base+i).map(y=>`<button data-pick-year="${y}" class="${y===year?'selected':''}">${y}</button>`).join('')}</div>`;
    } else if (calendarMode === 'months') {
      grid = `<div class="calendar-picker">${Array.from({length:12},(_,i)=>i+1).map(m=>`<button data-pick-month="${m}" class="${m===month?'selected':''}">${m} 月${saved.some(d=>d.startsWith(year+'-'+String(m).padStart(2,'0')))?'<small>有归档</small>':''}</button>`).join('')}</div>`;
    } else {
      const first = (new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7, last = new Date(Date.UTC(year,month,0)).getUTCDate();
      grid = `<div class="cal-grid" role="group" aria-label="${year}年${month}月邮件日历">${['一','二','三','四','五','六','日'].map(x=>`<span class="weekday">${x}</span>`).join('')}${'<span></span>'.repeat(first)}`;
      for (let d=1;d<=last;d++) {
        const day = S.month + '-' + String(d).padStart(2,'0');
        grid += `<button class="date-btn ${day===S.day?'selected ':''}${day===S.state.today?'today ':''}${saved.includes(day)?'has-report':''}" data-date="${day}" ${day>S.state.today?'disabled':''} aria-pressed="${day===S.day}" aria-label="${day}${saved.includes(day)?'，已有总结':'，邮件回顾'}">${d}</button>`;
      }
      grid += '</div>';
    }
    return `<section class="panel calendar calendar-large"><div class="calendar-caption"><span class="eyebrow">邮件时光轴</span><span class="archive-count">${monthCount} 天已归档</span></div>${controls}<div id="calendarGrid">${grid}</div><div class="calendar-foot"><span>本月已归档 <b>${monthCount}</b> 天</span><button class="ghost small" data-date="${S.state.today}">回到今天</button></div><p class="calendar-legend small muted">圆点表示已有总结 · 点击年月快速跳转</p></section>`;
  }
  function shortOverview() {
    const r = S.report;
    if (!r) return '';
    const text = String(r.feedback || ''), lead = text.split(/\n\s*\n/)[0].slice(0,220);
    const categories = [...new Set((r.messages || []).map(m=>m.analysis?.category).filter(Boolean))];
    return `<section class="brief-card"><div class="brief-label"><div><span class="brief-spark">${icon('spark')}</span>${S.page==='today'?'今日速览':'当日回顾'}</div><span class="small muted">${r.messages.length} 封邮件 · ${categories.length} 类业务</span></div><p>${e(lead)}${lead.length<text.split(/\n\s*\n/)[0].length?'…':''}</p><div class="brief-footer"><button class="brief-share" data-quick-forward="summary">${icon('outbox')}快捷转发</button><div class="brief-tags">${categories.slice(0,6).map(c=>`<span class="tag">${e(c)}</span>`).join('')}${categories.length>6?`<span class="tag">另 ${categories.length-6} 类</span>`:''}</div><details class="full-review"><summary>展开完整总结与建议</summary><div class="review-scroll"><p>${e(text)}</p>${(r.recommendations || []).length?'<h3>下一步建议</h3><ul>'+r.recommendations.map(t=>'<li>'+e(t)+'</li>').join('')+'</ul>':''}</div></details></div></section>`;
  }
  function risks() {
    const list = S.report?.risks || [];
    if (!list.length) return '';
    return `<details class="risk-summary"><summary>需要注意 <span>${list.length} 项提醒</span></summary><ul>${list.map(t=>`<li>${e(t)}</li>`).join('')}</ul></details>`;
  }
  function metrics() {
    const rows=S.report?.messages||[];
    const items=[['今日收到',rows.length,'mail','封'],['其中未读',rows.filter(x=>!x.read).length,'unread','封'],['重要邮件',rows.filter(x=>['重要','重要且急'].includes(x.analysis?.priority)).length,'flag','封'],['已保存回顾',S.state.archive.length,'calendar','天']];
    return `<div class="today-metrics">${items.map(([title,n,symbol,unit])=>`<div><span class="metric-caption">${title}</span><div class="metric-value"><b>${n}</b><span class="metric-unit">${unit}</span></div><span class="metric-symbol">${icon(symbol)}</span></div>`).join('')}</div>`;
  }
  function pulseHTML(){
    const counts=board?.counts||{},pending=Object.values(counts).reduce((n,v)=>n+v,0),done=board?.done||0,total=pending+done,ratio=total?done/total:0;
    return `<section class="panel pulse-panel"><div class="rail-heading"><h2>今日事项节奏</h2><span class="small muted">${scope==='open'?'含此前':'所选日期'}</span></div><div class="pulse-overview"><div class="pulse-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="32" fill="none" stroke="#eee8f5" stroke-width="5"/><circle cx="40" cy="40" r="32" fill="none" stroke="#ae97cd" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(ratio*201).toFixed(1)} 201"/></svg><div><b>${pending}</b><small>待处理</small></div></div><div><strong>${board?.handled||0} 已处理 · ${board?.reviewed||0} 已审阅</strong><p>每一步，都在推进工作</p></div></div>${KINDS.map(([kind,title])=>`<div class="pulse-row"><span>${title}</span><div class="pulse-track"><i style="width:${pending?((counts[kind]||0)/pending*100):0}%"></i></div><b>${counts[kind]||0}</b></div>`).join('')}</section>`;
  }
  function visibleRows() {
    return (board?.items || []).filter(x=> (stateFilter==='all'||x.done===(stateFilter==='done')) && (tab==='all'||x.kind===tab) && (!query || (x.title+' '+x.source?.subject+' '+x.category+' '+x.source?.from).toLowerCase().includes(query.toLowerCase())));
  }
  function boardHTML() {
    const rows=visibleRows(); page=Math.min(page, Math.max(0,Math.ceil(rows.length/PAGE_SIZE)-1));
    const counts=Object.fromEntries(KINDS.map(([k])=>[k,(board?.items||[]).filter(x=>(stateFilter==='all'||x.done===(stateFilter==='done'))&&x.kind===k).length])),pending=Object.values(board?.counts||{}).reduce((n,v)=>n+v,0);
    return `<section class="action-center" aria-label="邮件事项整理"><div class="board-heading"><div><h2>${S.page==='today'?'邮件事项':'当日事项'}</h2><p class="small muted">${S.page==='calendar'?'回顾所选日期 · 处理标记保持同步':'自动归纳已总结邮件，保留你的处理标记'}</p></div><button data-visual-icon="spark" data-organize="1" ${!S.report?'disabled':''}>一键整理</button></div><div class="action-state-tabs" role="group" aria-label="处理状态"><span class="state-indicator" style="--active:${['open','done','all'].indexOf(stateFilter)}" aria-hidden="true"></span>${[['open','待处理',pending],['done','已处理 / 已审阅',board?.done||0],['all','全部记录',board?.items?.length||0]].map(([k,l,n])=>`<button data-action-state="${k}" class="${stateFilter===k?'active':''}" aria-pressed="${stateFilter===k}">${l}<b>${n}</b></button>`).join('')}</div><div class="action-tabs" role="group" aria-label="事项分类"><button class="action-tab ${tab==='all'?'active':''}" data-action-tab="all" aria-pressed="${tab==='all'}">全部 <b>${Object.values(counts).reduce((n,v)=>n+v,0)}</b></button>${KINDS.map(([k,l])=>`<button class="action-tab ${tab===k?'active':''}" data-action-tab="${k}" aria-pressed="${tab===k}">${l}<b>${counts[k] || 0}</b></button>`).join('')}</div><div class="board-tools"><input id="actionSearch" type="search" placeholder="搜索事项、项目或发件人" aria-label="搜索邮件事项" value="${e(query)}">${S.page==='today'?`<div class="segmented"><button data-action-scope="day" class="${scope==='day'?'active':''}">今日</button><button data-action-scope="open" class="${scope==='open'?'active':''}">包含此前事项</button></div>`:''}<span class="action-state-hint">${stateFilter==='done'?'已处理 '+(board?.handled||0)+' · 已审阅 '+(board?.reviewed||0):stateFilter==='all'?'包含本地处理记录':'本地标记 · 原邮件保留'}</span></div><div id="actionRows">${rows.length?rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(rowHTML).join(''):`<div class="board-empty"><h3>${loaded===boardKey()?(stateFilter==='done'?'还没有已处理或已审阅的事项':'这一类暂时没有事项'):'正在归纳事项…'}</h3><p>${loaded===boardKey()?(stateFilter==='done'?'勾选完成后在这里保留，可打开原邮件或恢复未处理。':'新总结生成后自动收纳，你也可以从原邮件添加本地跟进。'):'首次打开正在读取本地总结。'}</p></div>`}</div><div class="board-footer"><span class="small muted">${rows.length?'第 '+(page*PAGE_SIZE+1)+'–'+Math.min((page+1)*PAGE_SIZE,rows.length)+' 项，共 '+rows.length+' 项':'暂无事项'}${S.page==='calendar'?' · 处理状态为当前本地标记':''}</span><div><button data-action-page="-1" ${page===0?'disabled':''} aria-label="上一页事项">上一页</button><button data-action-page="1" ${(page+1)*PAGE_SIZE>=rows.length?'disabled':''} aria-label="下一页事项">下一页</button></div></div></section>`;
  }
  function rowHTML(x) {
    const manual=x.origin==='manual', deadline=x.deadline;
    return `<article data-row-id="${e(x.id)}" class="action-row ${x.done?'is-done':''}"><button class="complete-action" data-action-done="${e(x.id)}" aria-label="${x.done?'恢复未处理':x.kind==='notice'?'标为已知晓':'标为已处理'}：${e(x.title)}">${icon(x.done?'undo':'check')}</button><div class="action-content"><div class="action-row-top"><span class="kind-label kind-${x.kind}">${label(x.kind)}</span>${['重要且急','急','重要'].includes(x.priority)?`<span class="priority-label">${e(x.priority)}</span>`:''}<span class="small muted">${e(x.category)}${x.day!==S.day?' · '+e(x.day):''}</span></div><h3 title="${e(x.title)}">${e(x.title)}</h3>${x.done?`<div class="action-completed-label">${icon('check')}${x.kind==='notice'?'已审阅':'已处理'}${x.markedAt?' · '+new Date(x.markedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):''}${x.origin==='history'?' · 原总结记录':''}</div>`:''}<div class="action-row-meta">${x.source?.uid?`<button class="source-link" data-action-source="${e(x.id)}" title="${e(x.source.subject)}">${icon('mail')}<span>查看原邮件</span>${icon('arrow')}</button><button class="row-forward" data-quick-forward="${e(x.source.id)}" title="快捷转发">${icon('outbox')}转发</button><span class="source-subject" title="${e(x.source.subject)}">${e(x.source.subject||'')}</span>`:`<span>${manual?'手动跟进':''}</span>`}${deadline?`<span class="deadline">${e(deadline)}</span>`:''}</div><details class="action-detail"><summary>依据与分类</summary><p class="action-full-title">${e(x.title)}</p><p>${e(x.evidence || x.summary || '来自已有邮件总结，请打开原文核对。')}</p><div class="actions small">${!manual?KINDS.map(([k,l])=>`<button data-action-kind="${k}" data-action-id="${e(x.id)}" ${k===x.kind?'disabled':''}>${l}</button>`).join(''):''}</div></details></div></article>`;
  }
  function agenda() {
    const rows=(S.report?.messages||[]).flatMap(m=>(m.analysis?.meetings||[]).map(title=>({title,m})));
    return `<section class="panel agenda"><div class="rail-heading"><h2>会议与时间</h2><span class="small muted">来自今日邮件</span></div>${rows.length?rows.slice(0,4).map(({title,m})=>`<button class="agenda-row" data-report-mail="${e(m.id)}"><b>${e(title)}</b><span>${e(m.analysis.deadline==='未提及'?'时间待核对':m.analysis.deadline)}</span></button>`).join(''):'<p class="small muted">今日邮件暂未提及会议。事项中的截止时间会单独保留。</p>'}${rows.length>4?`<span class="small muted">另 ${rows.length-4} 项，请查看当日邮件</span>`:''}</section>`;
  }
  function recent() {
    const dates=[...S.state.archive].sort().reverse().slice(0,4);
    return `<section class="panel recent-days"><div class="rail-heading"><h2>最近回顾</h2><button class="ghost small" data-open-archive="1">查看归档</button></div>${dates.length?dates.map(d=>`<button class="recent-day" data-date="${d}"><span>${d}</span><small>查看总结</small></button>`).join(''):'<p class="small muted">每日总结将自动保存在日历归档中。</p>'}</section>`;
  }
  function reportMails() {
    const rows=S.report?.messages || [];
    return `<details class="report-mails"><summary>当日邮件目录 <span class="muted small">${rows.length} 封 · 查看原文</span></summary><div class="report-mail-scroll">${rows.map(m=>`<button data-report-mail="${e(m.id)}"><b>${e(m.subject)}</b><span>${e(m.analysis?.summary || '')}</span><small>${e(m.from)}</small></button>`).join('')}</div></details>`;
  }
  function archiveToolbar() {
    const date=new Date(S.day+'T12:00:00Z');
    const dayAt=offset=>{const d=new Date(date);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
    return `<nav class="archive-mobile-nav" aria-label="归档日期导航"><button data-show-calendar="1" class="archive-date-select">${icon('calendar')}<span><small>${P.active()?'每日归档':'当前回顾'}</small><b>${e(S.day)}</b></span>${icon('left','date-return-icon')}</button>${!P.active()?`<div><button data-date="${dayAt(-1)}" aria-label="前一天">${icon('left')}</button><button data-date="${dayAt(1)}" aria-label="后一天" ${dayAt(1)>S.state.today?'disabled':''}>${icon('right')}</button></div>`:'<span class="small muted">选择日期</span>'}</nav>`;
  }
  function content(emptyHTML,meetingStrip="") {
    if(S.page==='calendar'&&P.active())P.resume();
    if (S.page==='calendar') return `${archiveToolbar()}<div class="archive-workspace"><aside class="archive-rail">${calendar()}${P.nav()}<div class="archive-selected"><span class="eyebrow">当前回顾</span><h2>${S.day}</h2><p>按上海时区的收件日期归档<br>每个日期保留最新一份总结</p></div></aside><main class="archive-content">${P.active()?'<div id="periodRoot">'+P.html()+'</div>':S.report?shortOverview()+risks()+'<div id="actionBoard">'+boardHTML()+'</div>'+reportMails():emptyHTML}</main></div>`;
    return `${metrics()}<div class="today-workspace"><main>${meetingStrip}${S.report?shortOverview()+risks()+'<div id="actionBoard">'+boardHTML()+'</div>'+reportMails():emptyHTML}</main><aside class="today-rail">${'<div id="pulseRoot">'+pulseHTML()+'</div>'+recent()}<section class="panel update-note"><h2>总结更新</h2><p>${S.state.settings.autoSummary?'自动总结已开启；10 分钟内的新邮件合并处理。失败后需手动重试。':'自动总结已关闭；点击更新总结手动生成，成功后间隔 10 分钟。'}</p><span class="small muted">阅读与本地处理标记不改变原邮箱</span></section></aside></div>`;
  }
  async function load(force=false) {
    const key=boardKey(), current=++request;
    if (!force && loaded===key && board?.reportUpdatedAt===S.report?.updatedAt) return true;
    try {
      const result=await api('/actions?'+new URLSearchParams({day:S.day,scope:S.page==='calendar'?'day':scope}));
      if (current!==request || key!==boardKey() || !['today','calendar'].includes(S.page)) return;
      board={...result,reportUpdatedAt:S.report?.updatedAt}; loaded=key; draw();return true;
    } catch(err) {if(current===request){loaded=key;toast('事项整理未完成：'+err.message);if($('#actionRows'))$('#actionRows').innerHTML='<div class="board-empty">事项读取失败，请点击一键整理重试。</div>';}return false;}
  }
  function draw(effect='none') {
    const box=$('#actionBoard'); if (!box) return;
    const focus=$('#actionSearch')===document.activeElement, start=focus?$('#actionSearch').selectionStart:null;
    box.innerHTML=boardHTML();
    if($('#pulseRoot'))$('#pulseRoot').innerHTML=pulseHTML();
    if(effect!=='none')animateRows(box);
    if(focus){$('#actionSearch').focus();if(start!==null)try{$('#actionSearch').setSelectionRange(start,start);}catch{}}
  }
  function redrawCalendar(direction=0){
    const current=$('.calendar-large');if(!current)return;
    const focused=document.activeElement?.dataset||{};current.outerHTML=calendar();
    if($('.archive-ranges'))$('.archive-ranges').outerHTML=P.nav();
    const next=$('#calendarGrid');animate(next,[{opacity:0,transform:`translateX(${direction>=0?18:-18}px)`},{opacity:1,transform:'translateX(0)'}],{duration:340});
    let selector=focused.calendarMode?'[data-calendar-mode="'+focused.calendarMode+'"]':focused.calendarYear?'[data-calendar-year="'+focused.calendarYear+'"]':focused.month?'[data-month="'+focused.month+'"]':focused.pickYear?'[data-calendar-mode="months"]':focused.pickMonth?'[data-calendar-mode="months"]':null;
    if(selector)$(selector)?.focus({preventScroll:true});
  }
  async function click(b) {
    if(b.dataset.showCalendar){if(P.active()){P.reset();summaryPage();}$('#workspace').scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return true;}
    if(await P.click(b))return true;
    if(b.dataset.month){const [y,m]=S.month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+Number(b.dataset.month),1));S.month=d.toISOString().slice(0,7);calendarMode='days';redrawCalendar(Number(b.dataset.month));return true;}
    if(b.dataset.calendarMode){calendarMode=calendarMode===b.dataset.calendarMode?'days':b.dataset.calendarMode;pickerYear=Number(S.month.slice(0,4));redrawCalendar();return true;}
    if(b.dataset.calendarYear){const y=Math.max(1900,Math.min(2200,Number(S.month.slice(0,4))+Number(b.dataset.calendarYear)));S.month=y+S.month.slice(4);pickerYear=y;redrawCalendar(Number(b.dataset.calendarYear));return true;}
    if(b.dataset.yearRange){pickerYear=Math.max(1900,Math.min(2184,(pickerYear||Number(S.month.slice(0,4)))+Number(b.dataset.yearRange)));redrawCalendar(Number(b.dataset.yearRange));return true;}
    if(b.dataset.pickYear){S.month=b.dataset.pickYear+S.month.slice(4);calendarMode='months';redrawCalendar();return true;}
    if(b.dataset.pickMonth){S.month=S.month.slice(0,4)+'-'+String(b.dataset.pickMonth).padStart(2,'0');calendarMode='days';redrawCalendar();return true;}
    if(b.dataset.actionState){const prior=$('.state-indicator')?.getBoundingClientRect();stateFilter=b.dataset.actionState;page=0;tab='all';draw('filter');const next=$('.state-indicator');if(prior&&next){const now=next.getBoundingClientRect();animate(next,[{transform:`translateX(${prior.left-now.left}px)`},{transform:'translateX(0)'}],{duration:420});}return true;}
    if(b.dataset.viewDone){stateFilter='done';tab='all';page=0;draw('filter');$('.action-state-tabs')?.scrollIntoView({block:'nearest'});return true;}
    if (b.dataset.actionTab) {const old=$('.action-tab.active')?.getBoundingClientRect();tab=b.dataset.actionTab;page=0;draw('filter');const next=$('.action-tab.active');if(old&&next){const now=next.getBoundingClientRect();animate(next,[{transform:`translateX(${old.left-now.left}px)`},{transform:'translateX(0)'}],{duration:260});}return true;}
    if (b.dataset.actionPage) {page=Math.max(0,page+Number(b.dataset.actionPage));draw('filter');return true;}
    if (b.dataset.actionScope) {scope=b.dataset.actionScope;page=0;loaded='';await load(true);return true;}
    if (b.dataset.organize) {b.disabled=true;try{if(await load(true))toast('已按四类整理；你的处理标记已保留');}finally{b.disabled=false;}return true;}
    if(b.dataset.undoAction&&undoItem){
      const prior=undoItem;undoItem=null;b.disabled=true;
      const result=await api('/actions',{day:prior.day,scope:prior.scope,id:prior.id,done:prior.done});
      if(boardKey()===prior.key){board={...result,reportUpdatedAt:S.report?.updatedAt};draw('filter');}
      toast('已撤销，恢复原处理状态');return true;
    }
    if (b.dataset.actionDone || b.dataset.actionKind) {
      const item=board.items.find(x=>x.id===(b.dataset.actionDone||b.dataset.actionId));if(!item)return true;
      const prior={id:item.id,done:item.done,day:S.day,scope:S.page==='calendar'?'day':scope,key:boardKey()};
      b.disabled=true;try{
        const result=await api('/actions',{day:prior.day,scope:prior.scope,id:item.id,...(b.dataset.actionDone?{done:!item.done}:{kind:b.dataset.actionKind})});
        if(b.dataset.actionDone&&stateFilter==='open'&&!item.done){const row=b.closest('.action-row');row?.classList.add('is-done');const motion=animate(row,[{opacity:1},{opacity:.6}],{duration:240});if(motion)await motion.finished.catch(()=>{});}
        if(boardKey()===prior.key){board={...result,reportUpdatedAt:S.report?.updatedAt};draw('filter');}
        toast(b.dataset.actionDone?(item.done?'已恢复未处理':item.kind==='notice'?'已审阅，记录保留在「已处理 / 已审阅」':'已处理，记录保留在「已处理 / 已审阅」'):'事项分类已调整');
        if(b.dataset.actionDone){undoItem=prior;const undo=document.createElement('button');undo.dataset.undoAction='1';undo.textContent='撤销';$('#toast').append(undo);if(!item.done){const view=document.createElement('button');view.dataset.viewDone='1';view.textContent='查看记录';$('#toast').append(view);}clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.add('hidden'),15000);}
      }finally{b.disabled=false;}return true;
    }
    if (b.dataset.actionSource) {const item=board?.items.find(x=>x.id===b.dataset.actionSource);if(item?.source)await (openSource||openMessage)(item.source);return true;}
    if (b.dataset.settingsTab) {activeSettings=b.dataset.settingsTab;document.querySelectorAll('[data-settings-panel]').forEach(el=>el.hidden=el.dataset.settingsPanel!==activeSettings);document.querySelectorAll('[data-settings-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.settingsTab===activeSettings);el.setAttribute('aria-selected',String(el.dataset.settingsTab===activeSettings));el.tabIndex=el.dataset.settingsTab===activeSettings?0:-1;});animate($('[data-settings-panel="'+activeSettings+'"]'),[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300});return true;}
    return false;
  }
  function input(t) {if(P.input(t))return true;if(t.id==='actionSearch'){query=t.value;page=0;draw();return true;}return false;}
  function resetDate() {P.reset();calendarMode='days';page=0;loaded='';board=null;query='';stateFilter='open';}
  function settings(raw) {
    const doc=new DOMParser().parseFromString(raw,'text/html'), drawer=doc.querySelector('.drawer');
    const take=selector=>doc.querySelector(selector)?.outerHTML || '';
    doc.querySelector('#accountForm #newAccount')?.remove();
    const account=take('#accountForm'), model=take('#modelForm'), style=take('#styleForm'), signature=take('#signatureForm'), domain=take('#domainForm');
    const service=drawer.querySelector('section.panel')?.outerHTML || '';
    const help=drawer.querySelector('details.panel')?.outerHTML || '';
    const contactsStart=[...drawer.querySelectorAll('h3')].find(x=>x.textContent==='联系人与部门通讯录');
    let contacts=''; for(let node=contactsStart?.nextElementSibling;node && node.tagName!=='HR';node=node.nextElementSibling) contacts+=node.outerHTML;
    const accounts=[...drawer.querySelectorAll('.account-item')].map(x=>x.outerHTML).join('');
    const openAccount=!!S.editAccount||S.showAccountForm||!S.state.accounts.length;
    const acc=`<div class="settings-intro"><h3>你的邮箱</h3><span>${S.state.accounts.length} 个账号</span><button id="newAccount">添加邮箱</button></div>${accounts || '<p class="small muted">添加邮箱后，可阅读邮件、整理事项与撰写回复。</p>'}<details id="accountEditor" class="settings-section" ${openAccount?'open':''}><summary>${S.editAccount?'编辑邮箱':'添加邮箱'}</summary><div class="settings-section-body">${account}</div></details>${help}`;
    const ai=section('总结模型','邮件概览与事项归纳',model,true)+section('AI 回复 · 个人风格',S.state.settings.aiReplyEnabled?'已开启 · 使用已保存风格':'默认关闭 · 开启后首次学习一次',style);
    const writing=section('快捷短语','用于简短转发，可在发送前直接编辑',phrasesHTML())+section('固定签名','自动提取历史签名，最多 3 种',signature)+section('联系人与部门通讯录','最近联系人、私有分组与 CSV 导入',contacts+domain);
    const connection=section('后台连接与诊断',S.state.service==='ready'?'后台已连接':'需要检查后台连接',service,true)+`<section class="about-app"><h3>Mail</h3><p>版本 <b>${e(S.state.version || '正在读取')}</b></p><p class="small muted">Mail · 运行于 Hana</p><p class="small muted">AI 只生成建议稿，邮件经你预览确认后发送。草稿保存你写的正文，折叠引用单独关联。</p></section>`;
    const panels=[['accounts','邮箱',acc],['ai','AI 与总结',ai],['writing','签名与联系人',writing],['connection','连接与版本',connection]];
    return `<div class="drawer-wrap settings-wrap"><section class="drawer settings-drawer" role="dialog" aria-modal="true" aria-label="邮件设置"><header class="settings-header"><div><h2>邮件设置</h2><span class="small muted">Mail · ${e(S.state.version || '正在读取')}</span></div><button id="closeSettings" aria-label="关闭设置">${icon('close')}</button></header><nav class="settings-nav" role="tablist" aria-label="设置分类">${panels.map(([id,l])=>`<button data-settings-tab="${id}" role="tab" aria-selected="${activeSettings===id}" tabindex="${activeSettings===id?0:-1}" class="${activeSettings===id?'active':''}">${l}</button>`).join('')}</nav><div class="settings-scroll">${panels.map(([id,l,body])=>`<section data-settings-panel="${id}" role="tabpanel" aria-label="${l}" ${activeSettings===id?'':'hidden'}>${body}</section>`).join('')}<p class="settings-privacy small muted">授权码仅保存在本次运行的内存中，不写入文件；App 后台重载后请重新填写。</p></div></section></div>`;
  }
  function keydown(ev){if(P.keydown(ev))return true;const t=ev.target.closest('[data-settings-tab]');if(!t||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return false;ev.preventDefault();const tabs=[...document.querySelectorAll('[data-settings-tab]')],i=tabs.indexOf(t),next=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(i+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;void click(tabs[next]);tabs[next].focus();return true;}
  return {sourceFor(id){const x=board?.items.find(x=>x.source?.id===id);return x?{...x.source,analysis:{summary:x.summary,actions:[{title:x.title}]}}:null;},calendar,content,load,click,input,keydown,resetDate,settings,submit:P.submit,periodActive:P.active,resetSettings(){activeSettings='accounts';}};
}
