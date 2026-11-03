import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createWeather,createCityLocation,solarForCity,parseObservedAt,WEATHER_CITIES,WEATHER_CACHE_MS} from '../lib/weather.mjs';
import {createStore} from '../lib/store.mjs';
import {registerUi} from '../http/ui.js';

const reference=Date.parse('2026-10-14T01:30:00Z');
const response=value=>({ok:true,status:200,async text(){return typeof value==='string'?value:JSON.stringify(value);}});
const directories=WEATHER_CITIES.map((x,i)=>({code:'sta'+i,city:x.cityLabel}));
const nmc=(city='上海',extra={})=>({code:0,data:{real:{station:{city},publish_time:'2026-10-14 09:20',weather:{temperature:22.5,feelst:23.4,info:'晴',img:'0'},...extra}}});
function nmcFetch({calls=[],weatherOverrides={},met}={}){
 return async (url,options)=>{
  calls.push({url,options});
  if(url.includes('/rest/province/'))return response(directories);
  if(url.includes('/rest/weather?stationid=')){
   const code=new URL(url).searchParams.get('stationid'),city=directories.find(x=>x.code===code)?.city;
   return response(nmc(city,weatherOverrides));
  }
  if(url.includes('api.met.no')&&met)return response(met);
  throw Error('unexpected URL');
 };
}
const metPayload=(extra={})=>({geometry:{coordinates:[121.4737,31.2304]},properties:{meta:{updated_at:'2026-10-14T00:40:00Z'},timeseries:[0,1,2,3,4,5].map(hour=>({time:'2026-10-14T0'+hour+':00:00Z',data:{instant:{details:{air_temperature:20+hour}},next_1_hours:{summary:{symbol_code:hour===2?'rainshowers_day':'clearsky_day'}}}})),...extra}});
const failure=()=>({ok:false,status:503,async text(){return '';}});
const mockStore=()=>{let saved={};return {read:()=>structuredClone(saved),write:(file,data)=>{saved=structuredClone(data);},snapshot:()=>structuredClone(saved)};};

test('默认上海NMC完整观测、中文说明、原数字code兼容、9城与两小时协议',async()=>{
 const calls=[],r=await createWeather({now:()=>reference,fetchImpl:nmcFetch({calls})}).get();
 assert.equal(r.city,'shanghai');assert.equal(r.cityLabel,'上海');assert.equal(r.timeZone,'Asia/Shanghai');
 assert.deepEqual(r.current,{temperature:22.5,feelsLike:23.4,description:'晴',code:'113',kind:'clear'});
 assert.equal(r.observedAt,'2026-10-14T01:20:00.000Z');assert.equal(r.fetchedAt,'2026-10-14T01:30:00.000Z');
 assert.equal(r.issuedAt,null);assert.equal(r.validAt,null);assert.equal(r.status,'fresh');assert.equal(r.stale,false);
 assert.equal(r.source.provider,'nmc');assert.equal(r.source.type,'observation');assert.equal(r.refreshAfter,7200000);
 assert.equal(r.nextRefreshAt,'2026-10-14T03:30:00.000Z');assert.equal(WEATHER_CACHE_MS,7200000);
 assert.equal(calls.length,2);assert.match(calls[0].url,/www\.nmc\.cn\/rest\/province\/ASH$/);assert.match(calls[1].url,/stationid=sta0$/);
 assert.ok(calls.every(c=>c.options.signal));assert.equal(WEATHER_CITIES.length,9);assert.deepEqual(r.cities,WEATHER_CITIES);
 for(const name of ['北京','上海','南京','成都','广州','合肥'])assert.ok(r.cities.some(x=>x.cityLabel===name));
});

test('城市白名单拒绝URL和路径，不发请求；新增南京合肥拥有离线日照',async()=>{
 let calls=0;const weather=createWeather({fetchImpl:async()=>{calls++;throw Error('unexpected');}});
 for(const name of ['https://example.invalid','../private','london','shanghai?x=1'])await assert.rejects(()=>weather.get(name),/支持的城市/);
 assert.equal(calls,0);assert.equal(solarForCity('南京',reference).date,'2026-10-14');assert.equal(solarForCity('合肥',reference).date,'2026-10-14');
});

test('完整年月日严格解析；不能给单独观测小时或无效日期补今天',()=>{
 assert.equal(parseObservedAt('2026-10-14 12:08 AM'),'2026-10-13T16:08:00.000Z');
 assert.equal(parseObservedAt('2026/10/14 12:08 PM'),'2026-10-14T04:08:00.000Z');
 assert.equal(parseObservedAt('2026-10-14 23:58:20'),'2026-10-14T15:58:20.000Z');
 for(const value of ['04:08 PM','2026-02-30 10:00 AM','2026-10-14 13:00 PM','2026-10-14 24:00','2026-10-14 11:61 AM',''])assert.equal(parseObservedAt(value),null,value);
});

test('NMC城市目录code按城市解析，普通旧数字站号不被硬编码复用',async()=>{
 const calls=[];await createWeather({now:()=>reference,fetchImpl:nmcFetch({calls})}).get('nanjing');
 assert.match(calls[0].url,/province\/AJS$/);assert.match(calls[1].url,/stationid=sta7$/);
 assert.ok(calls.every(x=>!x.url.includes('58362')));
});

test('NMC sentinel温度/无完整日期/未来时刻/错城市全部拒绝，不冒充实时',async()=>{
 for(const extra of [{publish_time:'09:20'},{publish_time:'2026-10-14 14:20'},{station:{city:'北京'}},{weather:{temperature:9999,feelst:9999,img:'0',info:'晴'}}]){
  const r=await createWeather({now:()=>reference,fetchImpl:nmcFetch({weatherOverrides:extra})}).get();
  assert.equal(r.current,null);assert.equal(r.status,'unavailable');assert.ok(r.error);assert.equal(r.sun.estimated,true);
 }
});

test('有效气温但缺天气描述不会凭气温猜晴天，9999体感留空',async()=>{
 const r=await createWeather({now:()=>reference,fetchImpl:nmcFetch({weatherOverrides:{weather:{temperature:20.9,feelst:9999,info:'-',img:'9999'}}})}).get('成都');
 assert.equal(r.current.temperature,20.9);assert.equal(r.current.feelsLike,null);assert.equal(r.current.kind,'unknown');assert.equal(r.current.code,'');assert.equal(r.current.description,'天气状态未提供');
});

test('NMC雨雪雷雾编码规范化，保持旧图标code与新kind一致',async()=>{
 for(const [img,kind,code] of [['1','cloudy','116'],['2','overcast','122'],['7','rain','296'],['4','thunder','386'],['14','snow','326'],['6','sleet','317'],['18','fog','248']]){
  const r=await createWeather({now:()=>reference,fetchImpl:nmcFetch({weatherOverrides:{weather:{temperature:22,feelst:23,info:'原始天气说明',img}}})}).get();
  assert.equal(r.current.kind,kind);assert.equal(r.current.code,code);assert.equal(r.current.description,'原始天气说明');
 }
});

test('主源故障切到MET预报，发布时间/有效时刻与观测严格区分',async()=>{
 const calls=[];const weather=createWeather({now:()=>reference,fetchImpl:async url=>{calls.push(url);return url.includes('nmc.cn')?failure():response(metPayload());}});
 const r=await weather.get();assert.equal(r.source.provider,'met-no');assert.equal(r.source.type,'forecast');assert.equal(r.source.weather,'MET Norway');
 assert.equal(r.observedAt,null);assert.equal(r.issuedAt,'2026-10-14T00:40:00.000Z');assert.equal(r.validAt,'2026-10-14T01:00:00.000Z');
 assert.equal(r.current.temperature,21);assert.equal(r.status,'fresh');assert.equal(r.stale,false);assert.equal(calls.length,2);assert.ok(r.source.licenseUrl.includes('met.no'));
});

test('MET缓存随当前小时选择有效预报，过期发布时间不得称为新预报',async()=>{
 let ms=reference,calls=0;
 const weather=createWeather({now:()=>ms,fetchImpl:async url=>{calls++;return url.includes('nmc.cn')?failure():response(metPayload());}});
 await weather.get();ms=Date.parse('2026-10-14T02:10:00Z');const r=await weather.get();
 assert.equal(calls,2);assert.equal(r.validAt,'2026-10-14T02:00:00.000Z');assert.equal(r.current.temperature,22);assert.equal(r.current.kind,'rain');
 const old=await createWeather({now:()=>reference,fetchImpl:async url=>url.includes('nmc.cn')?failure():response(metPayload({meta:{updated_at:'2026-10-12T00:40:00Z'}}))}).get();
 assert.equal(old.status,'stale');assert.equal(old.stale,true);assert.equal(old.observedAt,null);
});

test('旧观测主源不会盖过有完整有效时刻的新预报；预报缺时刻不被补造',async()=>{
 const r=await createWeather({now:()=>reference,fetchImpl:nmcFetch({weatherOverrides:{publish_time:'2026-10-13 09:20'},met:metPayload()})}).get();
 assert.equal(r.source.type,'forecast');assert.equal(r.observedAt,null);
 const missing=metPayload({meta:{updated_at:'00:40'}});
 const fail=await createWeather({now:()=>reference,fetchImpl:async url=>url.includes('nmc.cn')?failure():response(missing)}).get();
 assert.equal(fail.current,null);assert.equal(fail.status,'unavailable');
});

test('两小时缓存、同城并发去重，手动force立即请求主源',async()=>{
 let ms=reference;const calls=[],metadata={},weather=createWeather({now:()=>ms,fetchImpl:nmcFetch({calls,weatherOverrides:metadata})});
 const [first,second]=await Promise.all([weather.get(),weather.get('上海')]);assert.equal(calls.length,2);assert.deepEqual(first,second);
 ms+=119*60000;const cached=await weather.get();assert.equal(calls.length,2);assert.equal(cached.status,'cached');assert.equal(cached.fetchedAt,first.fetchedAt);
 const forced=await weather.get('shanghai',{force:true});assert.equal(calls.length,3);assert.notEqual(forced.fetchedAt,first.fetchedAt);
 ms+=120*60000;metadata.publish_time=new Date(ms+8*3600000).toISOString().slice(0,19).replace('T',' ');await weather.get();assert.equal(calls.length,5);
});

test('持久缓存重启仍有效；失联保留原抓取/观测时间并短重试',async()=>{
 let ms=reference;const store=mockStore(),first=await createWeather({now:()=>ms,store,fetchImpl:nmcFetch()}).get();
 let calls=0;const offline=()=>{calls++;throw Error('offline');};
 const restarted=createWeather({now:()=>ms,store,fetchImpl:offline});const cached=await restarted.get();assert.equal(calls,0);assert.equal(cached.status,'cached');
 ms+=121*60000;const stale=await restarted.get();assert.equal(calls,2);assert.equal(stale.status,'stale');assert.equal(stale.fetchedAt,first.fetchedAt);assert.equal(stale.observedAt,first.observedAt);
 await restarted.get();assert.equal(calls,2);ms+=2*60000;await restarted.get();assert.equal(calls,4);
 await restarted.get('shanghai',{force:true});assert.equal(calls,6);
 assert.ok(store.snapshot().shanghai);assert.equal(JSON.stringify(store.snapshot()).includes('"ip":'),false);
});

test('天气关闭与force同时传入仍零网络，不展示旧缓存温度；太阳按当地今天计算',async()=>{
 const calls=[],weather=createWeather({now:()=>reference,fetchImpl:nmcFetch({calls})});
 let r=await weather.get('shanghai',{weather:false,force:true});assert.equal(calls.length,0);assert.equal(r.status,'disabled');assert.equal(r.current,null);assert.equal(r.error,null);
 assert.equal(r.stale,false);assert.equal(r.fetchedAt,null);assert.equal(r.observedAt,null);assert.deepEqual(r.sun,solarForCity('shanghai',reference));
 await weather.get();r=await weather.get('上海',{weather:false});assert.equal(calls.length,2);assert.equal(r.current,null);assert.equal(r.fetchedAt,null);
});

test('太阳使用城市当前当地日，夏冬无宿主DST影响且缓存跨午夜换新日照',async()=>{
 for(const date of ['2026-01-14','2026-07-14','2026-10-14'])for(const city of WEATHER_CITIES){const sun=solarForCity(city.city,date+'T00:00:00+08:00');assert.equal(sun.date,date);assert.equal(new Date(Date.parse(sun.sunriseAt)+8*3600000).toISOString().slice(0,10),date);assert.ok(Date.parse(sun.sunsetAt)>Date.parse(sun.sunriseAt));}
 const sun=solarForCity('shanghai',reference),rise=Date.parse(sun.sunriseAt),set=Date.parse(sun.sunsetAt);
 assert.equal(solarForCity('shanghai',rise-1).phase,'before-sunrise');assert.equal(solarForCity('shanghai',(rise+set)/2).phase,'day');assert.equal(solarForCity('shanghai',set+1).phase,'after-sunset');
 assert.equal(solarForCity('shanghai',rise-1).progress,0);assert.equal(solarForCity('shanghai',set+1).progress,1);
 let ms=Date.parse('2026-10-14T15:50:00Z');const calls=[],w=createWeather({now:()=>ms,fetchImpl:nmcFetch({calls,weatherOverrides:{publish_time:'2026-10-14 23:45'}})});
 const before=await w.get();ms+=15*60000;const after=await w.get();assert.equal(calls.length,2);assert.equal(after.status,'cached');assert.equal(before.sun.date,'2026-10-14');assert.equal(after.sun.date,'2026-10-15');
});

test('双源挂起请求也有总时间界限，abort信号实际终止',async()=>{
 const signals=[],w=createWeather({now:()=>reference,timeoutMs:25,fetchImpl:async(url,o)=>{signals.push(o.signal);return new Promise(()=>{});}});
 const start=performance.now(),r=await w.get();assert.equal(r.status,'unavailable');assert.match(r.error,/超时/);assert.ok(performance.now()-start<250);assert.ok(signals.every(s=>s.aborted));
});

test('IP城市只解析地理后缀，返回粗城且不返回或保存公网IP',async()=>{
 let calls=0,ms=reference;
 const detector=createCityLocation({now:()=>ms,fetchImpl:async()=>{calls++;return response('当前 IP：203.0.113.41 来自于：中国 江苏 南京 电信\n');}});
 const [a,b]=await Promise.all([detector.get(),detector.get()]);assert.equal(calls,1);assert.equal(a.city,'nanjing');assert.equal(a.status,'detected');assert.equal(a.source,'IPIP.NET');assert.deepEqual(a,b);
 assert.equal(JSON.stringify(a).includes('203.0.113.41'),false);assert.equal(Object.hasOwn(a,'ip'),false);
 assert.equal((await detector.get()).status,'cached');assert.equal(calls,1);ms+=24*3600000;await detector.get();assert.equal(calls,2);
});

test('IP失败、不支持城市/国外/无合法城市后缀都上海回退，不猜省会',async()=>{
 for(const value of ['当前 IP：203.0.113.41 来自于：中国 江苏 扬州 联通','当前 IP：203.0.113.41 来自于：美国 加州 上海代理','上海 中国 江苏','<html>denied</html>']){
  const r=await createCityLocation({now:()=>reference,fetchImpl:async()=>response(value)}).get();assert.equal(r.city,'shanghai');assert.equal(r.status,'fallback');assert.equal(r.detectedAt,null);assert.equal(r.source,'default');assert.match(r.message,/手动/);assert.equal(JSON.stringify(r).includes('203.0.113.41'),false);
 }
 const failed=await createCityLocation({now:()=>reference,fetchImpl:async()=>{throw Error('offline');}}).get();assert.equal(failed.status,'fallback');
});

test('IP识别硬超时，失败短退避但不覆盖任何手选城市或写用户设置',async()=>{
 let ms=reference,calls=0;const detector=createCityLocation({now:()=>ms,timeoutMs:10,fetchImpl:async()=>{calls++;return new Promise(()=>{});}});
 const r=await detector.get();assert.equal(r.status,'fallback');await detector.get();assert.equal(calls,1);ms+=2*60000;await detector.get();assert.equal(calls,2);
 assert.equal(Object.hasOwn(r,'cityMode'),false);
});

test('实际HTTP路由：weather=0零网络、force刷新、粗城市定位、坏城市400；不访问邮箱',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'Mail-weather-v15-')),store=createStore(dir),routes=new Map();t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});let calls=0,mailCalls=0;
 const currentDate=new Date(Date.now()+8*3600000).toISOString().slice(0,19).replace('T',' ');
 const provider=nmcFetch({weatherOverrides:{publish_time:currentDate}});
 globalThis.fetch=async()=>{throw Error('Global network must not be used');};
 const fetchImpl=async(url,o)=>{calls++;return url.includes('myip.ipip.net')?response('当前 IP：203.0.113.41 来自于：中国 北京 北京 联通'):provider(url,o);};
 registerUi({get(p,h){routes.set(p,h);},post(){}},{store,fetchImpl,engine:{state(){return {};},markDirty(){}},mail:async()=>{mailCalls++;throw Error('no mail');},call:async()=>{throw Error('no service');},infer:async()=>{throw Error('no inference');}});
 const invoke=(route,q={})=>routes.get(route)({req:{query:k=>q[k]},json:(body,status)=>({body,status})});
 const off=await invoke('/weather',{city:'hefei',weather:'0',force:'1'});assert.equal(off.body.data.status,'disabled');assert.equal(calls,0);
 const first=await invoke('/weather',{city:'hefei'});assert.equal(first.body.data.source.provider,'nmc');assert.equal(first.body.data.cityLabel,'合肥');assert.equal(calls,2);
 await invoke('/weather',{city:'hefei',force:'1'});assert.equal(calls,3);
 const location=await invoke('/weather/location');assert.equal(location.body.data.city,'beijing');assert.equal(calls,4);assert.equal(JSON.stringify(location).includes('203.0.113.41'),false);
 const invalid=await invoke('/weather',{city:'https://example.invalid'});assert.equal(invalid.body.ok,false);assert.equal(invalid.status,400);assert.equal(calls,4);assert.equal(mailCalls,0);
 assert.ok(fs.existsSync(path.join(dir,'weather-cache.json')));
});
