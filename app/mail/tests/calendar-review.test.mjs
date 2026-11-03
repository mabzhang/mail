import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkCalendar} from '../ui/work-calendar.js';

const day='2026-10-14';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mail=(id,extra={})=>({id,accountId:'fixture-account',folder:'INBOX',uid:id,uidValidity:'7',subject:'项目邮件 '+id,from:'项目经理 <pm@example.invalid>',analysis:{summary:'核对预算与执行安排。',project:'测试项目',actions:[{kind:'confirm',title:'确认预算版本'}]},...extra});
const report=(date=day,extra={})=>({day:date,updatedAt:Date.parse(date+'T08:00:00+08:00'),feedback:'已保存的项目进度回顾。',messages:[mail('1'),mail('2'),mail('3')],recommendations:['保存的下一步建议'],risks:['保存的风险提醒'],...extra});
function fixture(t,{reports=new Map([[day,report()]]),events=[],getReport,onCalendarSave}={}){
 const originals=new Map(['document','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const storage=new Map();
 globalThis.document={addEventListener(){},activeElement:null};
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
 t.after(()=>{for(const [key,original] of originals)if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
 const originReport={day:'2026-10-13',messages:[]},S={page:'schedule',day:'2026-10-13',state:{today:day},report:originReport},calls=[],sources=[];
 const calendar=createWorkCalendar({S,$:()=>null,e,api:async(route,body)=>{
  calls.push({route,body});const url=new URL(route,'http://isolated.invalid');
  if(url.pathname==='/report')return {report:getReport?await getReport(url.searchParams.get('day')):reports.get(url.searchParams.get('day'))||null,status:{}};
  if(url.pathname==='/calendar'&&body!==undefined){if(onCalendarSave)return onCalendarSave(body);const item=events.find(x=>x.id===body.id);if(item&&body.op==='done')item.done=body.done;return item;}
  if(url.pathname==='/calendar')return {events:events.filter(x=>x.day>=url.searchParams.get('start')&&x.day<=url.searchParams.get('end')),undated:[],timeZone:'Asia/Shanghai'};
  throw Error('Unexpected API '+route);
 },toast(){},openSource:async value=>sources.push(value)});
 t.after(()=>calendar.reset());return {calendar,S,calls,sources,reports,events,originReport};
}
const railHTML=calendar=>calendar.render().split('<aside class="wc-rail"')[1]?.split('</aside>')[0]||'';
const dateHead=(calendar,date)=>calendar.render().match(new RegExp(`<button[^>]*data-wc-select="${date}"[^>]*>[\\s\\S]*?</button>`))?.[0]||'';

test('选日直接呈现已保存回顾，展开邮件事项并查看原文，不生成总结或改变全局回顾',async t=>{
 const f=fixture(t,{reports:new Map([[day,report(day,{feedback:'客户 <script> 不执行，已保存总结。'})]])});
 await f.calendar.mount();let html=railHTML(f.calendar);
 assert.match(html,/当日邮件回顾/);assert.match(html,/客户 &lt;script&gt;/);assert.doesNotMatch(html,/这一天，还没有安排|查看当日邮件回顾|data-wc-archive|<script>/);
 assert.match(html,/项目邮件 1/);assert.match(html,/确认预算版本/);assert.doesNotMatch(html,/项目邮件 3|保存的下一步建议/);
 assert.ok(f.calls.every(x=>x.body===undefined));assert.ok(f.calls.every(x=>/^\/(?:calendar\?|report\?)/.test(x.route)));
 assert.equal(f.S.page,'schedule');assert.equal(f.S.day,'2026-10-13');assert.equal(f.S.report,f.originReport);
 await f.calendar.click({dataset:{wcReviewExpand:'1'}});html=railHTML(f.calendar);
 assert.match(html,/项目邮件 3/);assert.match(html,/保存的下一步建议/);assert.match(html,/保存的风险提醒/);assert.match(html,/aria-expanded="true"/);
 await f.calendar.click({dataset:{wcReviewSource:'2',wcReviewDay:day}});
 assert.deepEqual(f.sources,[f.reports.get(day).messages[1]]);
 assert.equal(f.calendar.sourceFor('2').analysis.project,'测试项目');
});

test('当日日程优先于回顾，本地操作后安排与已保存回顾同步刷新',async t=>{
 const events=[{id:'meeting',type:'meeting',title:'安排优先的会议',day,start:day+'T09:00:00+08:00',end:day+'T10:00:00+08:00',source:{id:'source'}}];
 const reports=new Map([[day,report(day,{feedback:'旧保存回顾'})]]);
 const f=fixture(t,{events,reports,onCalendarSave:body=>{events[0].done=body.done;reports.set(day,report(day,{feedback:'最新保存回顾'}));return events[0];}});
 await f.calendar.mount();const html=railHTML(f.calendar);
 assert.ok(html.indexOf('安排优先的会议')<html.indexOf('当日邮件回顾'));
 await f.calendar.click({dataset:{wcDone:'meeting'}});const refreshed=railHTML(f.calendar);
 assert.doesNotMatch(refreshed,/安排优先的会议|旧保存回顾/);assert.match(refreshed,/最新保存回顾/);
 assert.equal(f.calls.filter(x=>x.route.startsWith('/report?')).length,2);
 assert.deepEqual(f.calls.filter(x=>x.body!==undefined).map(x=>x.body),[{op:'done',id:'meeting',done:true}]);
});

test('快选日期时迟到的旧回顾不能覆盖新日期，旧按钮不打开错日原文',async t=>{
 const pending=new Map();const f=fixture(t,{getReport:date=>date===day?report():new Promise(resolve=>pending.set(date,resolve))});
 await f.calendar.mount();const old=f.calendar.selectDay('2026-10-15'),current=f.calendar.selectDay('2026-10-16');
 assert.doesNotMatch(railHTML(f.calendar),/已保存的项目进度回顾/);assert.match(railHTML(f.calendar),/正在读取已保存/);
 pending.get('2026-10-16')(report('2026-10-16',{feedback:'最新所选十六日回顾',messages:[mail('16')]}));await current;
 pending.get('2026-10-15')(report('2026-10-15',{feedback:'迟到十五日回顾',messages:[mail('15')]}));await old;
 assert.match(railHTML(f.calendar),/最新所选十六日回顾/);assert.doesNotMatch(railHTML(f.calendar),/迟到十五日回顾|项目邮件 15/);
 await f.calendar.click({dataset:{wcReviewSource:'15',wcReviewDay:'2026-10-15'}});assert.deepEqual(f.sources,[]);
 const resetPending=f.calendar.selectDay('2026-10-17');f.calendar.reset();pending.get('2026-10-17')(report('2026-10-17',{feedback:'重置后迟到回顾'}));await resetPending;
 assert.doesNotMatch(railHTML(f.calendar),/重置后迟到回顾/);
});

test('读取失败与没有保存的回顾分开，支持重试并拒绝错日报告',async t=>{
 let fail=true;const f=fixture(t,{getReport:date=>{if(date==='2026-10-16')return report('2026-10-15');if(date==='2026-10-17')return null;if(fail)throw Error('隔离存储读取失败');return report(date);}});
 await f.calendar.mount();let html=railHTML(f.calendar);assert.match(html,/回顾暂时未能读取|隔离存储读取失败/);assert.doesNotMatch(html,/这一天没有已保存/);
 fail=false;await f.calendar.click({dataset:{wcReviewRetry:'1'}});assert.match(railHTML(f.calendar),/已保存的项目进度回顾/);
 await f.calendar.selectDay('2026-10-16');assert.match(railHTML(f.calendar),/回顾日期与所选日期不一致/);assert.doesNotMatch(railHTML(f.calendar),/已保存的项目进度回顾/);
 await f.calendar.selectDay('2026-10-17');html=railHTML(f.calendar);assert.match(html,/这一天没有已保存的邮件回顾/);assert.doesNotMatch(html,/回顾暂时未能读取|重新读取/);
});

test('离开工作日历后的回顾响应不再写入，缺少原邮件定位保持可读但不打开',async t=>{
 let resolve;const f=fixture(t,{getReport:date=>date===day?report(day,{messages:[mail('missing',{uidValidity:null})]}):new Promise(done=>resolve=done)});
 await f.calendar.mount();assert.match(railHTML(f.calendar),/原邮件定位未保存/);
 await f.calendar.click({dataset:{wcReviewSource:'missing',wcReviewDay:day}});assert.deepEqual(f.sources,[]);
 const pending=f.calendar.selectDay('2026-10-15');f.S.page='mail';resolve(report('2026-10-15',{feedback:'离页后迟到回顾'}));await pending;
 f.S.page='schedule';assert.doesNotMatch(railHTML(f.calendar),/离页后迟到回顾/);
});

test('周末休标与调休补班在月周日程一致，日期完整节日名称仍保留',async t=>{
 const events=['2026-10-01','2026-10-10','2026-10-17','2026-10-18'].map((date,index)=>({id:'event-'+index,type:'task',title:'本地安排',day:date,allDay:true}));
 const f=fixture(t,{events});await f.calendar.mount();
 const holiday=dateHead(f.calendar,'2026-10-01'),makeup=dateHead(f.calendar,'2026-10-10');
 assert.match(holiday,/国庆节/);assert.match(holiday,/wc-day-note/);assert.match(makeup,/补班/);assert.match(makeup,/aria-label="调休补班">班/);assert.doesNotMatch(makeup,/aria-label="休息日"/);
 for(const date of ['2026-10-17','2026-10-18']){
  const rest=dateHead(f.calendar,date);assert.match(rest,/is-rest-day/);assert.match(rest,/aria-label="休息日">休/);
 }
 for(const view of ['week','day','agenda']){
  await f.calendar.selectDay('2026-10-17');await f.calendar.click({dataset:{wcView:view}});
  const rest=dateHead(f.calendar,'2026-10-17');assert.match(rest,/is-rest-day/);assert.match(rest,/aria-label="休息日">休/);
  await f.calendar.selectDay('2026-10-10');const work=dateHead(f.calendar,'2026-10-10');assert.match(work,/is-makeup/);assert.match(work,/aria-label="调休补班">班/);assert.doesNotMatch(work,/aria-label="休息日"/);
 }
});
