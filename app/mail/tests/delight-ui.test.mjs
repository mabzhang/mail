import test from 'node:test';
import assert from 'node:assert/strict';
import {createDelight} from '../ui/delight-ui.js';
import {cityDay,clockText} from '../ui/delight-model.mjs';

// Exercise the production controller through its public boot() and native
// EventTarget dispatch. DOM adapters expose observable visibility and focus;
// the mutation callback can be held to reproduce the pre-observer race.
function fixture(t, {startup=false, saved={city:'shanghai',cityMode:'manual',mode:'auto',weather:true}, apiHandler, accounts=[], brand=false, reduced=true, page='today'}={}) {
  const observers = [];
  const focusCalls = [];
  const requests = [];
  const intervals = new Map(), mediaListeners = new Set(), storage = new Map(), animations = [], errors = [];
  let now=Date.parse('2026-10-14T04:00:00Z'), reduce=reduced;
  if(saved)storage.set('mail.delight.v2',JSON.stringify(saved));
  const document = new EventTarget();
  document.documentElement={dataset:{hostAppearance:'light'}};
  document.hidden = false;
  document.modal = null;
  document.activeElement = null;
  const classes=new Set();
  document.body = {dataset: {}, classList:{contains:key=>classes.has(key),add:key=>classes.add(key),remove:key=>classes.delete(key)},insertAdjacentHTML() {}};

  function element(name, dataset = {}) {
    const attributes = new Map();
    return {
      name, dataset, attributes,
      setAttribute(key, value) { attributes.set(key, String(value)); },
      getAttribute(key) { return attributes.get(key) ?? null; },
      focus() { document.activeElement = this; focusCalls.push(name); },
      closest(selector) { return selector === 'button' ? this : null; },
      remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},
      animate(frames,options){let finish,abort;const finished=new Promise((resolve,reject)=>{finish=resolve;abort=reject;});const motion={element:this,frames,options,finished,cancelled:false,finish,cancel(){this.cancelled=true;abort(Error('cancelled'));}};animations.push(motion);return motion;},
    };
  }
  const trigger = element('weather-trigger', {skyPanel: '1'});
  const city = element('weather-city');
  city.value = 'shanghai';
  const weather = element('weather-enabled');
  weather.checked = true;
  const form = {elements: {city, weather}};
  city.closest=weather.closest=selector=>selector==='#skyPreferences'?form:null;
  const heading = {textContent: ''};
  const refresh = element('weather-refresh', {skyRefresh: '1'});
  const locate=element('weather-location',{skyLocation:'1'}), locationStatus={textContent:''}, providerStatus={textContent:''}, clock={textContent:''};
  const modeButtons = ['auto', 'day', 'night'].map(skyMode => element(skyMode, {skyMode}));
  const panel = {
    hidden: true,
    querySelector(selector) {
      return selector === 'h2' ? heading : selector === 'form' ? form : selector === '[data-sky-refresh]' ? refresh : selector==='[data-sky-location]'?locate:selector==='.sky-location-status'?locationStatus:selector==='.sky-provider-status'?providerStatus:null;
    },
    querySelectorAll(selector) { return selector === '[data-sky-mode]' ? modeButtons : []; },
  };
  const ribbon = {
    html:'',
    set outerHTML(html) {
      this.html=html;
      const expanded = html.match(/data-sky-panel="1"[^>]*aria-expanded="(true|false)"/);
      if (expanded) trigger.setAttribute('aria-expanded', expanded[1]);
      const time=html.match(/class="day-clock">([^<]*)/);if(time)clock.textContent=time[1];
    },
  };
  const nodes = new Map([
    ['#dayRibbon', ribbon],
    ['#dayRibbon [data-sky-panel]', trigger],
    ['#skyPanel', panel],
    ['#skyPanel select', city],
    ['#skyPreferences', form],
    ['#skyPanel h2',heading],['.day-clock',clock],
  ]);
  if(startup)nodes.set('#workspace .workspace-heading',{insertAdjacentHTML(){}});
  const home={hover:false,matches(){return this.hover;}},brandBox={children:[],visible:true,title:'',setAttribute:element('brand-window').setAttribute,
    querySelector(selector){return selector==='.brand-email-row'?this.children[0]||null:null;},
    getClientRects(){return this.visible?[{}]:[];},append(child){child.parent=this;this.children.push(child);},
    get innerHTML(){return this.children.map(x=>x.textContent).join('|');},
    set innerHTML(html){this.children=[];const row=element('brand-email');row.className='brand-email-row';row.textContent=html.match(/<small[^>]*>(.*?)<\/small>/)?.[1]||'';this.append(row);}
  };
  if(brand){brandBox.innerHTML='<small class="brand-email-row"></small>';nodes.set('.brand-account-window',brandBox);nodes.set('.brand-home',home);}
  document.createElement=tag=>element(tag);
  const $ = selector => nodes.get(selector) ?? null;
  document.querySelector = selector => selector === '[aria-modal="true"]' ? document.modal : $(selector);
  document.querySelectorAll = () => [];

  const globals = {
    document,
    localStorage: {getItem(key) { return storage.get(key)??null; }, setItem(key,value) {storage.set(key,value);}},
    matchMedia() { return {get matches(){return reduce;},addEventListener(type,listener){if(type==='change')mediaListeners.add(listener);}}; },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target,options) { this.target = target; this.options=options; }
    },
    setInterval(callback,ms) {if(!intervals.has(ms))intervals.set(ms,[]);intervals.get(ms).push(callback);return 0;},
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  t.mock.method(Date,'now',()=>now);
  const state={page,account:accounts[0]?.id||'',state:{today:cityDay(now),service:'ready',accounts},status:{}};
  const controller = createDelight({
    S: state,
    $, e: value => String(value ?? ''),
    api: async url => { requests.push(url);if(apiHandler)return apiHandler(url,now);throw new Error('This focus fixture must not request data'); },
    toast() {}, openSchedule() {},
  });
  controller.boot();

  function dispatch(type, target, fields = {}) {
    const event = new Event(type, {cancelable: true});
    Object.defineProperty(event, 'target', {value: target});
    Object.assign(event, fields);
    document.dispatchEvent(event);
    return event;
  }
  function openWeather() {
    dispatch('click', trigger);
    assert.equal(panel.hidden, false);
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(document.activeElement, city);
  }
  function openModal() {
    const input = element('modal-input');
    document.modal = {input};
    input.focus();
    return input;
  }
  function flushMutations() {
    assert.equal(observers.length, 1);
    assert.equal(observers[0].target, document.body);
    observers[0].callback([{type: 'childList', target: document.body}]);
  }
  const escape = target => dispatch('keydown', target, {key: 'Escape', metaKey: false, ctrlKey: false});
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();assert.deepEqual(errors,[]);};
  return {document,panel,trigger,city,weather,form,refresh,locate,heading,clock,ribbon,brandBox,home,state,controller,focusCalls,requests,animations,storage,
    openWeather,openModal,flushMutations,escape,dispatch,flush,now:()=>now,
    async fire(ms,elapsed=0){now+=elapsed;for(const callback of intervals.get(ms)||[]){const result=callback();result?.catch?.(error=>errors.push(error));}await flush();},
    async changeCity(value){city.value=value;dispatch('change',city);await flush();},
    async changeWeather(value){weather.checked=value;dispatch('change',weather);await flush();},
    async visibility(hidden){document.hidden=hidden;dispatch('visibilitychange',document);await flush();},
    async motionPreference(value){reduce=value;for(const listener of mediaListeners)listener({matches:value});await flush();},
    async collapse(value){if(value)classes.add('sidebar-collapsed');else classes.delete('sidebar-collapsed');dispatch('click',element('sidebar-toggle',{toggleSidebar:'1'}));await flush();},
  };
}

test('真实 modal 出现后收起天气卡，保持 modal 焦点并同步展开状态', t => {
  const h = fixture(t);
  h.openWeather();
  const input = h.openModal();
  const focusBeforeMutation = [...h.focusCalls];
  h.flushMutations();

  assert.equal(h.panel.hidden, true);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, input);
  assert.deepEqual(h.focusCalls, focusBeforeMutation, '静默收起不得调用天气 trigger.focus()');

  let modalEscapes = 0;
  h.document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    modalEscapes++;
    assert.equal(event.defaultPrevented, false, '天气处理器不能消费 modal 的 Escape');
    assert.equal(h.document.activeElement, input);
    event.preventDefault();
  });
  h.escape(input);
  assert.equal(modalEscapes, 1);
  assert.equal(h.document.activeElement, input);
  assert.deepEqual(h.requests, []);
});

test('modal 已打开但 mutation 尚未回调，Escape 仍交给 modal 且不夺走焦点', t => {
  const h = fixture(t);
  h.openWeather();
  const input = h.openModal();
  assert.equal(h.panel.hidden, false, '明确保留 observer 尚未执行的竞争窗口');
  const focusBeforeEscape = [...h.focusCalls];

  let modalEscapes = 0;
  h.document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    modalEscapes++;
    assert.equal(event.defaultPrevented, false);
    assert.equal(h.document.activeElement, input);
    event.preventDefault();
  });
  h.escape(input);

  assert.equal(modalEscapes, 1, 'stopImmediatePropagation 会让本断言失败');
  assert.equal(h.document.activeElement, input);
  assert.deepEqual(h.focusCalls, focusBeforeEscape);
  h.flushMutations();
  assert.equal(h.panel.hidden, true);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, input);
  assert.deepEqual(h.requests, []);
});

test('没有其它 modal 时 Escape 正常关闭天气卡并将焦点还给原触发按钮', t => {
  const h = fixture(t);
  h.openWeather();
  const event = h.escape(h.city);

  assert.equal(event.defaultPrevented, true);
  assert.equal(h.panel.hidden, true);
  assert.equal(h.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.focusCalls.at(-1), 'weather-trigger');
  assert.deepEqual(h.requests, []);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  return {promise,resolve,reject};
}
function weatherData(city, at, {enabled=true,temperature=({shanghai:21,beijing:12,hefei:18,nanjing:20})[city]??25}={}) {
  const day=cityDay(at);
  return {city,timeZone:'Asia/Shanghai',localDate:day,status:enabled?'fresh':'disabled',stale:false,
    sun:{date:day,sunrise:'06:00',sunset:'18:00',sunriseAt:day+'T06:00:00+08:00',sunsetAt:day+'T18:00:00+08:00'},
    current:enabled?{temperature,description:'晴',kind:'sunny'}:null,
    observedAt:new Date(at).toISOString(),fetchedAt:new Date(at).toISOString(),source:{type:'observation',weather:'测试天气服务'}};
}
function weatherRequests(h, enabled=true) {
  return h.requests.filter(url=>url.startsWith('/weather?')&&new URLSearchParams(url.split('?')[1]).get('weather')===(enabled?'1':'0'));
}
function mockWeather(url, at) {
  if(url.startsWith('/calendar/reminders?'))return {meetings:[]};
  if(url.startsWith('/weather?')){const query=new URLSearchParams(url.split('?')[1]);return weatherData(query.get('city'),at,{enabled:query.get('weather')==='1'});}
  throw Error('Unexpected test API: '+url);
}
const preferences=h=>JSON.parse(h.storage.get('mail.delight.v2'));

test('默认 IP 请求迟到时，不能覆盖期间手选的城市或再请求旧城市天气', async t => {
  const ip=deferred();
  const h=fixture(t,{startup:true,saved:{weather:true},apiHandler:(url,at)=>url==='/weather/location'?ip.promise:mockWeather(url,at)});
  await h.flush();
  assert.equal(h.requests.filter(url=>url==='/weather/location').length,1);
  assert.equal(weatherRequests(h).length,0,'自动城市尚未确定前不获取天气');

  await h.changeCity('hefei');
  assert.equal(preferences(h).city,'hefei');
  assert.equal(preferences(h).cityMode,'manual');
  assert.match(h.ribbon.html,/合肥/);
  assert.match(h.ribbon.html,/18°/);
  const requestsBeforeLateIP=[...h.requests];
  ip.resolve({city:'beijing',status:'detected'});
  await h.flush();

  assert.equal(h.city.value,'hefei');
  assert.equal(preferences(h).city,'hefei');
  assert.equal(preferences(h).cityMode,'manual');
  assert.match(h.ribbon.html,/合肥/);
  assert.match(h.ribbon.html,/18°/);
  assert.deepEqual(h.requests,requestsBeforeLateIP,'失效 IP 响应不得触发第二个城市的天气请求');
});

test('默认自动识别成功后才获取所识别城市的日照和天气，并保存自动模式', async t => {
  const ip=deferred();
  const h=fixture(t,{startup:true,saved:{weather:true},apiHandler:(url,at)=>url==='/weather/location'?ip.promise:mockWeather(url,at)});
  await h.flush();
  assert.equal(weatherRequests(h).length,0);
  assert.equal(weatherRequests(h,false).length,0);
  ip.resolve({city:'nanjing',status:'detected'});
  await h.flush();
  assert.equal(preferences(h).city,'nanjing');
  assert.equal(preferences(h).cityMode,'auto');
  assert.equal(h.city.value,'nanjing');
  assert.match(h.ribbon.html,/南京/);
  assert.match(h.ribbon.html,/20°/);
  assert.equal(weatherRequests(h).length,1);
  assert.equal(weatherRequests(h,false).length,1);
  for(const url of [...weatherRequests(h),...weatherRequests(h,false)])assert.equal(new URLSearchParams(url.split('?')[1]).get('city'),'nanjing');
});

test('IP 识别期间关闭天气不会发实况请求，识别完成仍保持关闭状态', async t => {
  const ip=deferred();
  const h=fixture(t,{startup:true,saved:{weather:true},apiHandler:(url,at)=>url==='/weather/location'?ip.promise:mockWeather(url,at)});
  await h.flush();
  await h.changeWeather(false);
  assert.equal(preferences(h).weather,false);
  assert.equal(preferences(h).cityMode,'auto');
  assert.equal(weatherRequests(h).length,0);
  ip.resolve({city:'hefei',status:'detected'});
  await h.flush();
  assert.equal(preferences(h).city,'hefei');
  assert.equal(preferences(h).weather,false);
  assert.equal(h.weather.checked,false);
  assert.match(h.ribbon.html,/合肥/);
  assert.match(h.ribbon.html,/天气已关闭/);
  assert.match(h.ribbon.html,/日出 06:00/);
  assert.equal(weatherRequests(h).length,0);
  assert.equal(weatherRequests(h,false).length,1);
});

test('快速手选城市后，上一城市迟到的天气不会覆盖最后选择的城市', async t => {
  const first=deferred();
  const h=fixture(t,{startup:true,apiHandler:(url,at)=>{
    if(url.startsWith('/weather?')){
      const query=new URLSearchParams(url.split('?')[1]);
      if(query.get('city')==='shanghai'&&query.get('weather')==='1')return first.promise;
    }
    return mockWeather(url,at);
  }});
  await h.flush();
  assert.equal(weatherRequests(h).length,1);
  await h.changeCity('beijing');
  assert.match(h.ribbon.html,/北京/);
  assert.match(h.ribbon.html,/12°/);
  first.resolve(weatherData('shanghai',h.now(),{temperature:39}));
  await h.flush();
  assert.equal(preferences(h).city,'beijing');
  assert.equal(h.city.value,'beijing');
  assert.match(h.ribbon.html,/北京/);
  assert.match(h.ribbon.html,/12°/);
  assert.doesNotMatch(h.ribbon.html,/39°/);
  assert.equal(h.refresh.disabled,false,'旧请求完成不能把最新请求状态重新置为忙碌');
});

test('当前天气缓存两小时，时钟每秒独立更新且不触发天气请求', async t => {
  const h=fixture(t,{startup:true,apiHandler:mockWeather});
  await h.flush();
  assert.equal(weatherRequests(h).length,1);
  assert.equal(h.clock.textContent,'12:00');
  const requestsBeforeClock=[...h.requests];
  await h.fire(1000,60000);
  assert.equal(h.clock.textContent,'12:01');
  assert.equal(h.heading.textContent,'上海 · 12:01');
  assert.deepEqual(h.requests,requestsBeforeClock,'时钟更新不得调用 API');

  await h.fire(60000,118*60000);
  assert.equal(weatherRequests(h).length,1,'119 分钟时应继续使用当前天气');
  await h.fire(60000,60000);
  assert.equal(weatherRequests(h).length,2,'整两小时后获取新天气');
  assert.match(h.ribbon.html,/观测 14:00/);
});

test('页面隐藏时停止时钟写入，回到可见时立即校正当前时间', async t => {
  const h=fixture(t,{startup:true,apiHandler:mockWeather});
  await h.flush();
  await h.visibility(true);
  await h.fire(1000,60000);
  assert.equal(h.clock.textContent,'12:00');
  assert.equal(h.heading.textContent,'上海 · 12:00');
  await h.visibility(false);
  assert.equal(h.clock.textContent,'12:01');
  assert.equal(h.heading.textContent,'上海 · 12:01');
  assert.equal(weatherRequests(h).length,1,'短暂隐藏后无需额外请求实况');
});

test('两小时更新失败时保留上次温度，并在两分钟后重试', async t => {
  let calls=0;
  const h=fixture(t,{startup:true,apiHandler:(url,at)=>{
    if(url.startsWith('/weather?')&&new URLSearchParams(url.split('?')[1]).get('weather')==='1'){
      calls++;
      if(calls===2)throw Error('temporary outage');
      return weatherData('shanghai',at,{temperature:calls===3?24:21});
    }
    return mockWeather(url,at);
  }});
  await h.flush();
  await h.fire(60000,2*60*60000);
  assert.equal(calls,2);
  assert.match(h.ribbon.html,/21°/,'失败不能清掉有效的上次观测温度');
  assert.match(h.ribbon.html,/上次观测 12:00/);
  await h.fire(60000,60000);
  assert.equal(calls,2,'一分钟内不能重复失败请求');
  await h.fire(60000,60000);
  assert.equal(calls,3,'有上次温度的 stale 状态也必须两分钟重试');
  assert.match(h.ribbon.html,/24°/);
  assert.match(h.ribbon.html,/观测 14:02/);
  assert.doesNotMatch(h.ribbon.html,/上次观测/);
});

test('初次天气失败时仍显示真实日照，并在两分钟后恢复天气', async t => {
  let calls=0;
  const h=fixture(t,{startup:true,apiHandler:(url,at)=>{
    if(url.startsWith('/weather?')&&new URLSearchParams(url.split('?')[1]).get('weather')==='1'){
      if(++calls===1)throw Error('temporary outage');
    }
    return mockWeather(url,at);
  }});
  await h.flush();
  assert.equal(calls,1);
  assert.match(h.ribbon.html,/日出 06:00/);
  assert.match(h.ribbon.html,/等待天气连接/);
  assert.doesNotMatch(h.ribbon.html,/21°/);
  await h.fire(60000,60000);
  assert.equal(calls,1);
  await h.fire(60000,60000);
  assert.equal(calls,2);
  assert.match(h.ribbon.html,/21°/);
});

test('关闭天气后保留城市与日照，且停止实况 API 并使用两小时日照缓存', async t => {
  const late=deferred();
  const h=fixture(t,{startup:true,apiHandler:(url,at)=>{
    if(url.startsWith('/weather?')&&new URLSearchParams(url.split('?')[1]).get('weather')==='1')return late.promise;
    return mockWeather(url,at);
  }});
  await h.flush();
  assert.equal(weatherRequests(h).length,1);
  await h.changeWeather(false);
  assert.equal(preferences(h).weather,false);
  assert.equal(preferences(h).cityMode,'manual');
  assert.equal(h.city.value,'shanghai');
  assert.match(h.ribbon.html,/天气已关闭/);
  assert.match(h.ribbon.html,/日出 06:00/);
  assert.doesNotMatch(h.ribbon.html,/21°/);
  late.resolve(weatherData('shanghai',h.now()));
  await h.flush();
  assert.match(h.ribbon.html,/天气已关闭/,'迟到的实况不得恢复已关闭的天气');
  const solarBefore=weatherRequests(h,false).length;
  await h.fire(60000,2*60000);
  assert.equal(weatherRequests(h,false).length,solarBefore,'天气关闭时不走失败两分钟重试');
  await h.fire(60000,118*60000);
  assert.equal(weatherRequests(h,false).length,solarBefore+1);
  assert.equal(weatherRequests(h).length,1,'关闭后不新增实况请求');
});

const twoAccounts=[{id:'one',email:'one@example.com'},{id:'two',email:'two@example.com'}];
test('品牌账号变化会取消过渡，旧动画完成不能移除最新账号文字', async t => {
  const h=fixture(t,{brand:true,reduced:false,page:'mail',accounts:twoAccounts});
  assert.equal(h.brandBox.innerHTML,'one@example.com');
  await h.fire(4000);
  assert.equal(h.animations.length,2);
  assert.equal(h.brandBox.children.length,2);
  h.state.state.accounts=[{id:'three',email:'three@example.com'}];
  h.state.account='three';
  h.controller.draw();
  await h.flush();
  assert.ok(h.animations.every(animation=>animation.cancelled));
  assert.equal(h.brandBox.children.length,1);
  assert.equal(h.brandBox.innerHTML,'three@example.com');
  h.animations.forEach(animation=>animation.finish());
  await h.flush();
  assert.equal(h.brandBox.innerHTML,'three@example.com');
  await h.fire(4000);
  assert.equal(h.animations.length,2,'单邮箱账号不能再次启动滚动');
  assert.deepEqual(h.requests,[]);
});

test('品牌过渡中 hidden、modal、减少动态和收起侧栏均取消动画并落定当前邮箱', async t => {
  for(const [name,pause,resume] of [
    ['hidden',h=>h.visibility(true),h=>h.visibility(false)],
    ['modal',async h=>{h.openModal();h.flushMutations();await h.flush();},async h=>{h.document.modal=null;h.flushMutations();await h.flush();}],
    ['reduced',h=>h.motionPreference(true),h=>h.motionPreference(false)],
    ['collapsed',h=>h.collapse(true),h=>h.collapse(false)],
  ])await t.test(name,async t=>{
    const h=fixture(t,{brand:true,reduced:false,page:'mail',accounts:twoAccounts});
    await h.fire(4000);
    assert.equal(h.animations.length,2);
    await pause(h);
    assert.ok(h.animations.every(animation=>animation.cancelled));
    assert.equal(h.brandBox.children.length,1);
    assert.equal(h.brandBox.innerHTML,'two@example.com');
    h.animations.forEach(animation=>animation.finish());
    await h.flush();
    assert.equal(h.brandBox.innerHTML,'two@example.com','失效过渡不能再修改已经落定的文字');
    await h.fire(4000);
    assert.equal(h.animations.length,2,'暂停条件存在期间不能新增动画');
    await resume(h);
    await h.fire(4000);
    assert.equal(h.animations.length,4,'解除暂停后可正常滚动');
    h.animations.slice(2).forEach(animation=>animation.finish());
    await h.flush();
    assert.equal(h.brandBox.children.length,1);
    assert.equal(h.brandBox.innerHTML,'one@example.com');
  });
});

test('品牌悬停或布局隐藏时不滚动；初次无邮箱时提供添加账号入口文案', async t => {
  await t.test('hover and invisible',async t=>{
    const h=fixture(t,{brand:true,reduced:false,page:'mail',accounts:twoAccounts});
    h.home.hover=true;
    await h.fire(4000);
    assert.equal(h.animations.length,0);
    h.home.hover=false;h.brandBox.visible=false;
    await h.fire(4000);
    assert.equal(h.animations.length,0);
    h.brandBox.visible=true;
    await h.fire(4000);
    assert.equal(h.animations.length,2);
    h.animations.forEach(animation=>animation.finish());
    await h.flush();
    assert.equal(h.brandBox.innerHTML,'two@example.com');
  });
  await t.test('no account',async t=>{
    const h=fixture(t,{brand:true,reduced:false,page:'mail'});
    assert.equal(h.brandBox.innerHTML,'添加邮箱账号');
    await h.fire(4000);
    assert.equal(h.animations.length,0);
  });
});
