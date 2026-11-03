import test from 'node:test';
import assert from 'node:assert/strict';
import {validPreferences,sunContext,weatherCaption,nextMeeting,accountEmails,CITIES} from '../ui/delight-model.mjs';
const sun={date:'2026-10-13',sunrise:'06:03',sunset:'17:25',sunriseAt:'2026-10-12T22:03:00Z',sunsetAt:'2026-10-13T09:25:00Z'};
test('日照按城市当地日和真实时间点变换，旧日期不沿用昨日太阳',()=>{
 const data={timeZone:'Asia/Shanghai',sun};
 assert.equal(sunContext(data,Date.parse('2026-10-12T21:00:00Z')).phase,'before-sunrise');
 const noon=sunContext(data,Date.parse('2026-10-13T04:00:00Z'));assert.equal(noon.mode,'day');assert(noon.progress>0&&noon.progress<1);
 assert.equal(sunContext(data,Date.parse('2026-10-13T12:00:00Z')).progress,1);
 const next=sunContext(data,Date.parse('2026-10-13T16:01:00Z'));assert.equal(next.valid,false);assert.equal(next.progress,null);assert.equal(next.sunrise,'—');
});
test('天气只标实际观测或预报时刻，界面不展示估算文案',()=>{
 assert.doesNotMatch(weatherCaption({current:{temperature:22},observedAt:null}),/观测/);
 assert.match(weatherCaption({current:null}),/等待天气连接/);
 assert.match(weatherCaption({current:{temperature:22},status:'disabled'},false),/已关闭/);
 assert.match(weatherCaption({current:{temperature:22},timeZone:'Asia/Shanghai',observedAt:'2026-10-13T04:00:00Z',stale:false}),/12:00/);
});
test('下一场只来自未来明确时间的未完成会议，偏好非法值回默认',()=>{
 const now=Date.parse('2026-10-13T04:00:00Z'),rows=[{id:'past',start:'2026-10-13T01:00:00Z'},{id:'cancelled',start:'2026-10-13T04:30:00Z',cancelled:true},{id:'done',start:'2026-10-13T04:30:00Z',done:true},{id:'all',start:'2026-10-13T04:30:00Z',allDay:true},{id:'next',start:'2026-10-13T06:30:00Z'}];
 assert.equal(nextMeeting(rows,now).id,'next');assert.deepEqual(validPreferences({city:'bad',mode:'bad'}),{city:'shanghai',cityMode:'auto',mode:'auto',weather:false});
});
test('跨午夜的天气时刻显示日期，获取时间不冒称观测',()=>{
 const now=Date.parse('2026-10-13T16:05:00Z'),data={current:{temperature:21},timeZone:'Asia/Shanghai',observedAt:null,fetchedAt:'2026-10-13T15:39:00Z',stale:true};
 assert.match(weatherCaption(data,true,now),/获取 2026-10-13 23:39 · 每2小时更新/);
 assert.match(weatherCaption({...data,stale:false,observedAt:'2026-10-13T15:50:00Z'},true,now),/观测 2026-10-13 23:50/);
});
test('预报有效时间与观测分开显示，过期结果标上次',()=>{
 const now=Date.parse('2026-10-14T02:00:00Z'),data={current:{temperature:22},source:{type:'forecast'},validAt:'2026-10-14T01:00:00Z',timeZone:'Asia/Shanghai'};
 assert.equal(weatherCaption(data,true,now),'预报 09:00 · 每2小时更新');
 assert.match(weatherCaption({...data,stale:true},true,now),/^上次预报/);
 assert.match(weatherCaption({...data,source:{type:'observation'},observedAt:'2026-10-14T01:00:00Z',stale:true},true,now),/^上次观测/);
 assert.doesNotMatch(weatherCaption(data,true,now),/估算|预估|未核实/);
});
test('城市包含新增南京合肥，手选偏好持久保持手选模式',()=>{
 for(const id of ['beijing','shanghai','nanjing','chengdu','guangzhou','hefei'])assert(CITIES.some(x=>x[0]===id));
 assert.equal(validPreferences({city:'hefei',cityMode:'manual'}).cityMode,'manual');
});
test('品牌邮箱按当前账号优先并去重，不生成虚构邮箱',()=>{
 const rows=[{id:'a',email:' alpha@example.invalid '},{id:'b',email:'beta@example.invalid'},{id:'c',email:'beta@example.invalid'},{id:'d'}];
 assert.deepEqual(accountEmails(rows,'b'),['beta@example.invalid','alpha@example.invalid']);
 assert.deepEqual(accountEmails([]),[]);
});
