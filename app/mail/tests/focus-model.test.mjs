import test from 'node:test';
import assert from 'node:assert/strict';
import {senderName,compactText,focusDescription,focusItems} from '../ui/focus-model.mjs';
import {createTodayFocus} from '../ui/today-focus.js';

const day='2026-10-13';
const source={id:'same-mail',accountId:'account',folder:'INBOX',uid:'12',uidValidity:'1',from:'项目经理 <pm@example.invalid>'};
const action=(id,extra={})=>({id,day,kind:'todo',priority:'重要',title:'核对'+id,source,...extra});
const event=(id,extra={})=>({id,day,type:'deadline',priority:'重要',title:'处理'+id,source,...extra});

test('日历仅替代关联 actionId，同一邮件其他待办/待确认/回复完整保留',()=>{
 const rows=focusItems({items:[action('deadline'),action('confirm',{kind:'confirm'}),action('reply',{kind:'reply'})]},{events:[event('dated',{actionId:'deadline',actionKind:'todo'})]},[],day);
 assert.equal(rows.length,3);
 assert.deepEqual(new Set(rows.map(x=>x.actionId)),new Set(['deadline','confirm','reply']));
 assert.equal(rows.filter(x=>x.actionId==='deadline').length,1);
 assert.equal(rows.find(x=>x.actionId==='confirm').type,'confirm');
 assert.equal(rows.find(x=>x.actionId==='reply').type,'reply');
 assert.ok(rows.every(x=>x.source.uid==='12'));
});

test('同封邮件会议不吞掉其他行动，已完成/仅知晓/取消提醒退出今日重点',()=>{
 const meeting=event('meeting',{type:'meeting',start:day+'T09:00:00+08:00'});
 const rows=focusItems({items:[action('todo'),action('done',{done:true}),action('notice',{kind:'notice'})]},{events:[meeting,event('cancelled',{status:'CANCELLED'}),event('done',{done:true})]},[],day);
 assert.deepEqual(rows.map(x=>x.id),['event:meeting','action:todo']);
});

test('会议按时间置前，逾期及重要急事项排序，项目优先采用明确项目名',()=>{
 const rows=focusItems({items:[action('light',{priority:'轻'}),action('important'),action('urgent',{priority:'急'}),action('both',{priority:'重要且急'})]},
  {events:[event('late-meeting',{type:'meeting',start:day+'T15:00:00+08:00'}),event('early-meeting',{type:'meeting',start:day+'T10:00:00+08:00'})],overdue:[event('overdue',{day:'2026-10-12'})]},
  [{id:source.id,analysis:{project:'清风新品',category:'客户项目'}}],day);
 assert.deepEqual(rows.map(x=>x.id),['event:early-meeting','event:late-meeting','event:overdue','action:both','action:urgent','action:important','action:light']);
 assert.ok(rows.every(x=>x.project==='清风新品'));
});

test('同一事件跨 events/overdue 只显示一次，取消会议的未完成人工待办仍可核对',()=>{
 const pending=action('manual',{title:'核对已取消会议的后续安排'}),dated=event('dated',{day:'2026-10-12',actionId:'manual'});
 assert.equal(focusItems({items:[]},{events:[dated],overdue:[dated]},[],day).length,1);
 const rows=focusItems({items:[pending]},{events:[event('cancelled',{type:'meeting',cancelled:true,actionId:'manual'})]},[],day);
 assert.equal(rows.length,1);
 assert.equal(rows[0].type,'todo');
 assert.equal(rows[0].actionId,'manual');
});

test('描述优先合并20–30字的标题与摘要，保留行动区分且不填造短内容',()=>{
 const summary='请在客户评审前核对方案版本、执行排期和预算明细。';
 for(const title of ['核对素材','确认预算']){
  const text=focusDescription(title,summary);
  assert.ok(Array.from(text).length>=20&&Array.from(text).length<=30);
  assert.ok(text.startsWith(title));
 }
 assert.equal(focusDescription('收到',''),'收到');
 assert.equal(focusDescription('核对素材','核对素材并确认最新版本'),'核对素材并确认最新版本');
 assert.equal(Array.from(compactText('😀'.repeat(40),30)).length,30);
 assert.ok(!focusDescription('核对素材','参考 https://example.invalid/ pm@example.invalid').includes('@'));
});

test('发件人采用显示名或联系人，只有邮箱时显示本地名称且永不暴露完整地址',()=>{
 const contacts=[{email:'PM@example.invalid',name:'项目负责人'}];
 assert.equal(senderName(source.from,contacts),'项目负责人');
 assert.equal(senderName({name:'原显示名',email:'pm@example.invalid'},contacts),'项目负责人');
 assert.equal(senderName(source.from),'项目经理');
 assert.equal(senderName('jane.doe@example.invalid'),'Jane Doe');
 assert.equal(senderName('no-reply@example.invalid'),'系统通知');
 assert.equal(senderName('service@example.invalid'),'系统通知');
 for(const value of ['user@localhost','mailto:user@localhost',{name:'user@localhost'},'姓名 <用户@企业.中国>'])assert.ok(!senderName(value).includes('@'));
});

function uiFixture(t,{board={items:[action('a'),action('b')]},reminders={events:[],meetings:[]},apiHandler,controlledMotion=false}={}){
 const timers=new Map(),listeners=new Map(),mediaListeners=new Set(),calls={sources:[],schedule:[],api:[],animations:[]};let timerId=0,now=0;
 const documentState={hidden:false,activeElement:null,modal:false};
 const box={html:'',hover:false,visible:true,inside:new Set(),getClientRects(){return this.visible?[{}]:[];},matches(){return this.hover;},contains(node){return this.inside.has(node);}};
 const item={innerHTML:'',querySelector(selector){const slide=selector.match(/data-focus-slide="([^"]+)"/)?.[1];if(!slide||!this.innerHTML.includes(`data-focus-slide="${slide}"`))return null;return {animate(frames,options){let finish,abort;const finished=controlledMotion?new Promise((resolve,reject)=>{finish=resolve;abort=reject;}):Promise.resolve();const motion={slide,frames,options,finished,cancelled:false,finish(){finish?.();},cancel(){this.cancelled=true;abort?.(Error('cancelled'));}};calls.animations.push(motion);return motion;}};}},count={textContent:''},meetingBox={outerHTML:''};
 Object.defineProperty(box,'outerHTML',{set(html){this.html=html;item.innerHTML=html.match(/<div id="focusItem"[^>]*>([\s\S]*)<\/div><\/section>$/)?.[1]||'';count.textContent=html.match(/id="focusCount">([^<]*)/)?.[1]||'';}});
 const elements=new Map([['#todayFocus',box],['#focusItem',item],['#focusCount',count],['#todayMeetings',meetingBox]]);
 const state={page:'today',day,state:{today:day},contacts:[{name:'项目负责人',email:'pm@example.invalid'}],report:{updatedAt:1,messages:[]}};
 const media={get matches(){return fixture.reduced;},addEventListener(type,listener){if(type==='change')mediaListeners.add(listener);}};
 for(const [key,value] of Object.entries({document:{...documentState,querySelector(){return this.modal?{}:null;},addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);}},matchMedia:()=>media})){
  const original=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key]);
 }
 t.mock.method(globalThis,'setTimeout',(callback,ms)=>{assert.ok(ms>0);timers.set(++timerId,{callback,at:now+ms,ms});return timerId;});
 t.mock.method(globalThis,'clearTimeout',id=>timers.delete(id));
 const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const focus=createTodayFocus({S:state,$:s=>elements.get(s),e,api:async url=>{calls.api.push(url);return apiHandler?apiHandler(url):url.startsWith('/actions?')?board:reminders;},toast(){},openSource:async x=>calls.sources.push(x),openSchedule:async x=>calls.schedule.push(x),icon:()=>'<i></i>'});
 const flush=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};
 const fixture={focus,state,box,item,count,meetingBox,elements,calls,timers,reduced:false,now:()=>now,flush,
  async tick(ms=1000){const end=now+ms;while(true){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);now=next[1].at;next[1].callback();await flush();}now=end;await flush();},
  visibility(hidden){document.hidden=hidden;for(const listener of listeners.get('visibilitychange')||[])listener();},
  motionPreference(value){this.reduced=value;for(const listener of mediaListeners)listener({matches:value});}
 };
 t.after(()=>focus.reset());
 return fixture;
}

test('轮播支持显式暂停/继续及手动切换，刷新保留当前条和暂停状态',async t=>{
 const f=uiFixture(t);await f.focus.mount();assert.equal(f.count.textContent,'1 / 2');
 await f.tick();assert.equal(f.count.textContent,'2 / 2');
 const button={dataset:{focusPause:'1'},setAttribute(key,value){this[key]=value;}};
 await f.focus.click(button);assert.equal(button['aria-pressed'],'true');await f.tick();assert.equal(f.count.textContent,'2 / 2');
 await f.focus.click({dataset:{focusStep:'-1'}});assert.equal(f.count.textContent,'1 / 2');
 await f.focus.mount(true);assert.match(f.focus.header(),/aria-pressed="true"/);await f.tick();assert.equal(f.count.textContent,'1 / 2');
 await f.focus.click(button);await f.tick();assert.equal(f.count.textContent,'2 / 2');
 await f.focus.click({dataset:{focusOpen:'action:a'}});assert.equal(f.calls.sources[0].uid,'12');
});

test('鼠标停留、内部键盘焦点、隐藏/移除、模态窗口、页面离开及减少动态效果均暂停自动轮播',async t=>{
 const f=uiFixture(t);await f.focus.mount();const initial=f.count.textContent;
 f.box.hover=true;await f.tick();assert.equal(f.count.textContent,initial);
 const first={},second={};f.box.inside.add(first);f.box.inside.add(second);document.activeElement=first;f.box.hover=false;await f.tick();assert.equal(f.count.textContent,initial);
 document.activeElement=second;await f.tick();assert.equal(f.count.textContent,initial);document.activeElement=null;
 document.hidden=true;await f.tick();assert.equal(f.count.textContent,initial);document.hidden=false;
 f.box.visible=false;await f.tick();assert.equal(f.count.textContent,initial);f.box.visible=true;
 f.elements.delete('#todayFocus');await f.tick();assert.equal(f.count.textContent,initial);f.elements.set('#todayFocus',f.box);
 document.modal=true;await f.tick();assert.equal(f.count.textContent,initial);document.modal=false;
 f.reduced=true;await f.tick();assert.equal(f.count.textContent,initial);f.reduced=false;
 f.state.page='schedule';await f.tick();assert.equal(f.count.textContent,initial);f.state.page='today';
 f.state.day='2026-10-14';await f.tick();assert.equal(f.count.textContent,initial);f.state.day=day;
 await f.focus.mount();await f.tick();assert.equal(f.count.textContent,'2 / 2');
 f.focus.reset();assert.equal(f.timers.size,0);assert.equal(f.focus.sourceFor(source.id),undefined);assert.match(f.focus.header(),/0 项/);
});

test('已取消/已完成会议隐藏，异常时间有待核对提示，点击会议打开具体日程',async t=>{
 const meeting=event('meeting',{type:'meeting',start:'invalid',organizer:{email:'pm@example.invalid'}});
 const reminders={events:[meeting],meetings:[meeting,event('cancelled',{cancelled:true}),event('done',{done:true}),event('status-cancelled',{status:'cancelled'})]};
 const f=uiFixture(t,{board:{items:[]},reminders});await f.focus.mount();
 assert.equal(f.timers.size,0);assert.match(f.meetingBox.outerHTML,/时间待核对/);assert.match(f.meetingBox.outerHTML,/项目负责人/);assert.doesNotMatch(f.meetingBox.outerHTML,/处理cancelled|处理done|处理status-cancelled|pm@example/);
 await f.focus.click({dataset:{focusOpen:'event:meeting'}});assert.equal(f.calls.schedule[0].id,'meeting');
});

test('跨日迟到响应不能把旧日期的行动装入新一天',async t=>{
 const pending=[];
 const f=uiFixture(t,{apiHandler:url=>new Promise(resolve=>pending.push({url,resolve}))});
 const old=f.focus.mount();f.state.day='2026-10-14';
 pending[0].resolve({items:[action('old')]});pending[1].resolve({events:[],meetings:[]});await old;
 assert.match(f.focus.header(),/0 项/);assert.equal(f.timers.size,0);
 const current=f.focus.mount();assert.ok(pending.slice(2).every(x=>x.url.includes('day=2026-10-14')));
 pending[2].resolve({items:[action('new',{day:'2026-10-14'})]});pending[3].resolve({events:[],meetings:[]});await current;
 assert.match(f.focus.header(),/action:new/);assert.doesNotMatch(f.focus.header(),/action:old/);
});

test('整条提醒上滑退出，下条从底部进入，快速切换取消旧动画并阻止过期回调',async t=>{
 const f=uiFixture(t,{controlledMotion:true});await f.focus.mount();
 await f.focus.click({dataset:{focusStep:'1'}});
 const first=f.calls.animations.slice();assert.equal(first.length,2);
 assert.equal(first[0].slide,'out');assert.equal(first[1].slide,'in');
 assert.deepEqual(first[0].frames,[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-100%)'}]);
 assert.deepEqual(first[1].frames,[{opacity:0,transform:'translateY(100%)'},{opacity:1,transform:'translateY(0)'}]);
 assert.match(f.item.innerHTML,/data-focus-slide="out" aria-hidden="true" inert/);
 assert.match(f.item.innerHTML,/data-focus-slide="in"/);assert.equal(f.count.textContent,'2 / 2');
 await f.focus.click({dataset:{focusStep:'-1'}});
 assert.ok(first.every(motion=>motion.cancelled));assert.equal(f.count.textContent,'1 / 2');
 const currentMarkup=f.item.innerHTML;first.forEach(motion=>motion.finish());await Promise.resolve();await Promise.resolve();
 assert.equal(f.item.innerHTML,currentMarkup);
 f.calls.animations.slice(2).forEach(motion=>motion.finish());await Promise.resolve();await Promise.resolve();
 assert.match(f.item.innerHTML,/data-focus-slide="current"/);assert.match(f.item.innerHTML,/action:a/);assert.doesNotMatch(f.item.innerHTML,/action:b|data-focus-slide="out"/);
});

test('重绘和reset回收正在进行的轮播动画，减少动态时手动切换直接显示',async t=>{
 const f=uiFixture(t,{controlledMotion:true});await f.focus.mount();
 await f.focus.click({dataset:{focusStep:'1'}});const pending=f.calls.animations.slice();
 await f.focus.mount();assert.ok(pending.every(motion=>motion.cancelled));assert.match(f.item.innerHTML,/data-focus-slide="current"/);
 f.reduced=true;await f.focus.click({dataset:{focusStep:'-1'}});assert.equal(f.count.textContent,'1 / 2');
 assert.equal(f.calls.animations.length,2);assert.match(f.item.innerHTML,/action:a/);assert.doesNotMatch(f.item.innerHTML,/action:b|data-focus-slide="out"/);
 f.reduced=false;await f.focus.click({dataset:{focusStep:'1'}});const final=f.calls.animations.slice(2);
 f.focus.reset();const markup=f.item.innerHTML;assert.match(markup,/data-focus-slide="current"/);assert.ok(final.every(motion=>motion.cancelled));final.forEach(motion=>motion.finish());await Promise.resolve();await Promise.resolve();
 assert.equal(f.item.innerHTML,markup);assert.equal(f.timers.size,0);
});

test('首次静止1000ms再上滚450ms，动画完成后下一条仍完整静止1000ms',async t=>{
 const f=uiFixture(t,{controlledMotion:true});await f.focus.mount();
 await f.tick(999);assert.equal(f.count.textContent,'1 / 2');assert.equal(f.calls.animations.length,0);
 await f.tick(1);assert.equal(f.now(),1000);assert.equal(f.count.textContent,'2 / 2');
 const first=f.calls.animations.slice();assert.equal(first.length,2);assert.ok(first.every(x=>x.options.duration===450&&x.options.fill==='both'));
 assert.equal(f.timers.size,0,'过渡结束前不开始下一条的停留倒计时');
 await f.tick(449);assert.match(f.item.innerHTML,/data-focus-slide="in"/);assert.equal(f.calls.animations.length,2);
 await f.tick(1);first.forEach(x=>x.finish());await f.flush();
 assert.equal(f.now(),1450);assert.match(f.item.innerHTML,/data-focus-slide="current"/);assert.equal(f.count.textContent,'2 / 2');
 await f.tick(999);assert.equal(f.now(),2449);assert.equal(f.calls.animations.length,2);assert.equal(f.count.textContent,'2 / 2');
 await f.tick(1);assert.equal(f.now(),2450);assert.equal(f.count.textContent,'1 / 2');assert.equal(f.calls.animations.length,4);
});

test('悬停阅读后恢复先完整停留1秒，不在解除暂停的检查帧立即跳下一条',async t=>{
 const f=uiFixture(t);await f.focus.mount();f.box.hover=true;
 await f.tick(3000);assert.equal(f.count.textContent,'1 / 2');assert.equal(f.calls.animations.length,0);
 f.box.hover=false;await f.tick(100);assert.equal(f.count.textContent,'1 / 2');
 await f.tick(999);assert.equal(f.count.textContent,'1 / 2');
 await f.tick(1);assert.equal(f.count.textContent,'2 / 2');
});

test('页面隐藏或开启减少动态会回收进行中的过渡，恢复后从完整1秒停留开始',async t=>{
 const f=uiFixture(t,{controlledMotion:true});await f.focus.mount();await f.tick(1000);
 const first=f.calls.animations.slice();f.visibility(true);
 assert.ok(first.every(x=>x.cancelled));assert.equal(f.timers.size,0);assert.match(f.item.innerHTML,/data-focus-slide="current"/);
 await f.tick(10000);assert.equal(f.count.textContent,'2 / 2');assert.equal(f.calls.animations.length,2);
 f.visibility(false);await f.tick(999);assert.equal(f.count.textContent,'2 / 2');await f.tick(1);assert.equal(f.count.textContent,'1 / 2');
 const second=f.calls.animations.slice(2);f.motionPreference(true);
 assert.ok(second.every(x=>x.cancelled));assert.equal(f.timers.size,0);assert.match(f.item.innerHTML,/data-focus-slide="current"/);
 await f.tick(10000);assert.equal(f.count.textContent,'1 / 2');assert.equal(f.calls.animations.length,4);
 f.motionPreference(false);await f.tick(999);assert.equal(f.count.textContent,'1 / 2');await f.tick(1);assert.equal(f.count.textContent,'2 / 2');
});

test('没有提醒时显示真实空状态，不启动计时也不生成轮播条目',async t=>{
 const f=uiFixture(t,{board:{items:[]},reminders:{events:[],meetings:[]}});await f.focus.mount();
 await f.tick(10000);assert.equal(f.count.textContent,'0 项');assert.equal(f.timers.size,0);assert.equal(f.calls.animations.length,0);
 assert.match(f.item.innerHTML,/暂时没有需要处理的今日提醒/);assert.doesNotMatch(f.item.innerHTML,/data-focus-open/);
});
