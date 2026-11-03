// Public city weather only. No device location or mailbox data is sent.
const MINUTE = 60_000;
export const WEATHER_CACHE_MS = 2 * 60 * MINUTE;
const CACHE_MS = WEATHER_CACHE_MS;
const RETRY_MS = 2 * MINUTE;
const OBSERVATION_MAX_AGE_MS = 3 * 60 * MINUTE;
const UTC8_MS = 8 * 60 * MINUTE;
const CITY_ROWS = [
  ['shanghai', '上海', 'Asia/Shanghai', 31.2304, 121.4737, 'ASH', 'shanghai'],
  ['beijing', '北京', 'Asia/Shanghai', 39.9042, 116.4074, 'ABJ', 'beijing'],
  ['guangzhou', '广州', 'Asia/Shanghai', 23.1291, 113.2644, 'AGD', 'guangzhou'],
  ['shenzhen', '深圳', 'Asia/Shanghai', 22.5431, 114.0579, 'AGD', 'shenzuo'],
  ['hangzhou', '杭州', 'Asia/Shanghai', 30.2741, 120.1551, 'AZJ', 'hangzhou'],
  ['chengdu', '成都', 'Asia/Shanghai', 30.5728, 104.0668, 'ASC', 'chengdu'],
  ['hongkong', '香港', 'Asia/Hong_Kong', 22.3193, 114.1694, 'AXG', 'xianggang'],
  ['nanjing', '南京', 'Asia/Shanghai', 32.0603, 118.7969, 'AJS', 'nanjing'],
  ['hefei', '合肥', 'Asia/Shanghai', 31.8206, 117.2272, 'AAH', 'hefei'],
];
const cities = CITY_ROWS.map(([city, cityLabel, timeZone, latitude, longitude, province, slug]) => Object.freeze({city, cityLabel, timeZone, latitude, longitude, province, slug}));
const cityMap = new Map(cities.flatMap(c => [[c.city, c], [c.cityLabel, c]]));
export const WEATHER_CITIES = Object.freeze(cities.map(({city, cityLabel, timeZone}) => Object.freeze({city, cityLabel, timeZone})));

function cityConfig(value) {
  const key = value == null || value === '' ? 'shanghai' : String(value).trim().toLowerCase();
  const city = cityMap.get(key);
  if (!city) throw new Error('请选择支持的城市：上海、北京、广州、深圳、杭州、成都、香港、南京、合肥');
  return city;
}
function instant(value) {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error('时间无效');
  return ms;
}
function localDate(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(ms).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function clockLabel(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {timeZone, hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).format(ms);
}

/* Sunrise/sunset subset adapted from SunCalc v1.9.0 (BSD-2-Clause).
 * (c) 2011-2015, Vladimir Agafonkin. https://github.com/mourner/suncalc
 * Full license retained in THIRD-PARTY-NOTICES.md. City-center estimates,
 * level horizon / sea-level observer; terrain and weather are not modeled.
 */
function solarTimes(noonMs, latitude, longitude) {
  const rad = Math.PI / 180, dayMs = 86_400_000, j2000 = 2451545, j1970 = 2440588;
  const lw = -longitude * rad, phi = latitude * rad;
  const d = noonMs / dayMs - 0.5 + j1970 - j2000;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const m = rad * (357.5291 + 0.98560028 * ds);
  const center = rad * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2*m) + 0.0003 * Math.sin(3*m));
  const l = m + center + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(l) * Math.sin(rad * 23.4397));
  const transit = step => j2000 + step + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2*l);
  const jNoon = transit(ds);
  const hour = Math.acos((Math.sin(-0.833*rad) - Math.sin(phi)*Math.sin(dec)) / (Math.cos(phi)*Math.cos(dec)));
  const jSet = transit(0.0009 + (hour + lw) / (2*Math.PI) + n);
  const fromJulian = j => (j + 0.5 - j1970) * dayMs;
  return {sunrise:fromJulian(2*jNoon-jSet), sunset:fromJulian(jSet)};
}

export function solarForCity(value = 'shanghai', at = Date.now()) {
  const city = cityConfig(value), ms = instant(at), date = localDate(ms, city.timeZone);
  // All supported cities use UTC+08:00 without modern DST. Anchor at local
  // noon, not the host's midnight, so early-morning requests keep today's sun.
  const noonMs = Date.parse(`${date}T12:00:00+08:00`);
  const times = solarTimes(noonMs, city.latitude, city.longitude);
  const progress = Math.max(0, Math.min(1, (ms-times.sunrise)/(times.sunset-times.sunrise)));
  return {
    date, sunrise:clockLabel(times.sunrise, city.timeZone), sunset:clockLabel(times.sunset, city.timeZone),
    sunriseAt:new Date(times.sunrise).toISOString(), sunsetAt:new Date(times.sunset).toISOString(),
    phase:ms<times.sunrise?'before-sunrise':ms<times.sunset?'day':'after-sunset', progress,
    estimated:true, source:'SunCalc 1.9.0',
  };
}

// Canonical conditions retain the prior numeric icon contract and add kind.
const CONDITIONS = {
  clear:['113','晴'], cloudy:['116','多云'], overcast:['122','阴'],
  rain:['296','雨'], thunder:['386','雷雨'], snow:['326','雪'],
  fog:['248','雾'], sleet:['317','雨夹雪'], dust:['143','沙尘'], unknown:['','天气状态未提供'],
};
const NMC_CONDITIONS = {
  0:'clear',1:'cloudy',2:'overcast',3:'rain',4:'thunder',5:'thunder',6:'sleet',
  7:'rain',8:'rain',9:'rain',10:'rain',11:'rain',12:'rain',13:'snow',14:'snow',15:'snow',16:'snow',17:'snow',
  18:'fog',19:'rain',20:'dust',21:'rain',22:'rain',23:'rain',24:'rain',25:'rain',26:'snow',27:'snow',28:'snow',
  29:'dust',30:'dust',31:'dust',32:'fog',49:'fog',53:'fog',54:'fog',55:'fog',56:'fog',57:'fog',58:'fog',
};
const NMC_BASE = 'https://www.nmc.cn';
const MET_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const NMC_NOTICE = 'https://www.nmc.cn/publish/cms/view/722665831f0a4e98800c41e691444963.html';
const MET_LICENSE = 'https://docs.api.met.no/doc/License.html';
const CACHE_FILE = 'weather-cache.json';
const USER_AGENT = 'Mail-Weather/1.0';
function number(value, min, max) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function validDate(value) {
  const ms=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}
// Both current_condition.localObsDateTime and NMC real.publish_time contain
// calendar dates. An observation_time or HH:mm alone never gains today's date.
export function parseObservedAt(value) {
  const m = String(value || '').trim().replaceAll('/','-').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m || !validDate(m[1])) return null;
  let hour = Number(m[2]);
  const minute = Number(m[3]), second = Number(m[4] || 0), meridiem = m[5]?.toUpperCase();
  if (minute > 59 || second > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (meridiem) hour = hour % 12 + (meridiem === 'PM' ? 12 : 0);
  return new Date(Date.parse(`${m[1]}T${String(hour).padStart(2,'0')}:${m[3]}:${String(second).padStart(2,'0')}+08:00`)).toISOString();
}
function parseIso(value) {
  const text=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)||!validDate(text.slice(0,10)))return null;
  const ms=Date.parse(text);return Number.isFinite(ms)?new Date(ms).toISOString():null;
}
function metKind(symbol) {
  const name=String(symbol||'').replace(/_(?:day|night|polartwilight)$/,'');
  if(name.includes('thunder'))return 'thunder';
  if(name.includes('sleet'))return 'sleet';
  if(name.includes('snow'))return 'snow';
  if(name.includes('rain'))return 'rain';
  if(name==='fog')return 'fog';
  if(name==='clearsky')return 'clear';
  if(name==='fair'||name==='partlycloudy')return 'cloudy';
  if(name==='cloudy')return 'overcast';
  return 'unknown';
}
function normalizeNmc(payload,city,ms) {
  const real=payload?.data?.real,weather=real?.weather,temperature=number(weather?.temperature,-100,70);
  if(Number(payload?.code)!==0||!real||temperature===null)throw new Error('天气服务返回了不完整数据');
  if(real.station?.city!==city.cityLabel)throw new Error('天气服务返回的城市不匹配');
  const observedAt=parseObservedAt(real.publish_time);
  if(!observedAt)throw new Error('天气服务未提供完整观测日期');
  if(Date.parse(observedAt)-ms>15*MINUTE)throw new Error('天气服务观测时间异常');
  const kind=NMC_CONDITIONS[String(weather.img)]||'unknown',raw=String(weather.info||'').trim();
  return {provider:'nmc',observedAt,issuedAt:null,validAt:null,
    current:{temperature,feelsLike:number(weather.feelst,-100,80),description:raw&&!['-','9999'].includes(raw)?raw.slice(0,80):CONDITIONS[kind][1],code:CONDITIONS[kind][0],kind}};
}
function forecastAt(entry,ms) {
  const rows=entry?.forecastHours||[];
  const row=[...rows].reverse().find(x=>Date.parse(x.validAt)<=ms);
  return row&&ms-Date.parse(row.validAt)<90*MINUTE?row:null;
}
function normalizeMet(payload,city,ms) {
  const geometry=payload?.geometry?.coordinates;
  if(Array.isArray(geometry)&&(Math.abs(Number(geometry[0])-city.longitude)>1||Math.abs(Number(geometry[1])-city.latitude)>1))throw new Error('天气服务返回的城市位置不匹配');
  const properties=payload?.properties,issuedAt=parseIso(properties?.meta?.updated_at);
  if(!issuedAt)throw new Error('天气服务未提供完整预报发布时间');
  const forecastHours=(Array.isArray(properties.timeseries)?properties.timeseries:[]).slice(0,96).map(row=>{
    const validAt=parseIso(row?.time),temperature=number(row?.data?.instant?.details?.air_temperature,-100,70);
    if(!validAt||temperature===null)return null;
    const symbol=row?.data?.next_1_hours?.summary?.symbol_code||row?.data?.next_6_hours?.summary?.symbol_code||row?.data?.next_12_hours?.summary?.symbol_code;
    const kind=metKind(symbol);
    return {validAt,current:{temperature,feelsLike:null,description:CONDITIONS[kind][1],code:CONDITIONS[kind][0],kind}};
  }).filter(Boolean).sort((a,b)=>Date.parse(a.validAt)-Date.parse(b.validAt));
  const entry={provider:'met-no',issuedAt,observedAt:null,forecastHours},selected=forecastAt(entry,ms);
  if(!selected)throw new Error('天气服务没有当前时段的有效预报');
  return {...entry,validAt:selected.validAt,current:selected.current};
}
function sourceFor(city,provider='nmc') {
  const forecast=provider==='met-no';
  return {provider,weather:forecast?'MET Norway':'中央气象台（NMC）',type:forecast?'forecast':'observation',
    weatherUrl:forecast?`${MET_BASE}?lat=${city.latitude}&lon=${city.longitude}`:`${NMC_BASE}/publish/forecast/${city.province}/${city.slug}.html`,
    licenseUrl:forecast?MET_LICENSE:NMC_NOTICE,solar:'SunCalc 1.9.0'};
}
async function boundedTask(work,timeoutMs,message) {
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error(message));},Math.max(1,timeoutMs));});
  try{return await Promise.race([work(controller.signal),timeout]);}finally{clearTimeout(timer);}
}
async function fetchText(fetchImpl,url,signal,maxLength=400_000) {
  const response=await fetchImpl(url,{signal,headers:{accept:'application/json, text/plain;q=0.8','user-agent':USER_AGENT},redirect:'error'});
  if(!response.ok)throw new Error(`天气服务暂时不可用（${Number(response.status)||'HTTP'}）`);
  const text=await response.text();if(text.length>maxLength)throw new Error('天气服务响应过大');return text;
}
async function fetchJson(fetchImpl,url,signal) {
  const raw=await fetchText(fetchImpl,url,signal);
  try{return JSON.parse(raw);}catch{throw new Error('天气服务返回了无效数据');}
}
function restoreEntry(raw,ms) {
  if(!raw||!['nmc','met-no'].includes(raw.provider)||!Number.isFinite(raw.fetchedMs)||raw.fetchedMs>ms+15*MINUTE)return null;
  const temperature=number(raw.current?.temperature,-100,70);
  if(temperature===null||!Object.hasOwn(CONDITIONS,raw.current?.kind))return null;
  const current={temperature,feelsLike:number(raw.current.feelsLike,-100,80),description:String(raw.current.description||'').slice(0,80),code:CONDITIONS[raw.current.kind][0],kind:raw.current.kind};
  if(raw.provider==='nmc'){
    const observedAt=parseIso(raw.observedAt);return observedAt?{provider:'nmc',fetchedMs:raw.fetchedMs,observedAt,issuedAt:null,validAt:null,current}:null;
  }
  const issuedAt=parseIso(raw.issuedAt);if(!issuedAt)return null;
  const forecastHours=(Array.isArray(raw.forecastHours)?raw.forecastHours:[]).slice(0,96).map(row=>{
    const validAt=parseIso(row?.validAt),temperature=number(row?.current?.temperature,-100,70),kind=row?.current?.kind;
    return validAt&&temperature!==null&&Object.hasOwn(CONDITIONS,kind)?{validAt,current:{temperature,feelsLike:null,kind,code:CONDITIONS[kind][0],description:CONDITIONS[kind][1]}}:null;
  }).filter(Boolean).sort((a,b)=>Date.parse(a.validAt)-Date.parse(b.validAt));
  return forecastHours.length?{provider:'met-no',fetchedMs:raw.fetchedMs,issuedAt,observedAt:null,current,validAt:parseIso(raw.validAt),forecastHours}:null;
}

// This is a low-volume local viewer, not a licensed NMC commercial feed.
// Public NMC access and its reuse restrictions are documented in the research.
export function createWeather({fetchImpl=()=>Promise.reject(new Error('宿主网络接口未就绪')),now=Date.now,timeoutMs=7500,store}={}) {
  const cache=new Map(),pending=new Map(),failures=new Map(),provinceCache=new Map(),provincePending=new Map();
  const limit=Math.min(8000,Math.max(1,Number(timeoutMs)||7500));
  try{const saved=store?.read(CACHE_FILE,{});for(const c of cities){const row=restoreEntry(saved?.[c.city],instant(now()));if(row)cache.set(c.city,row);}}catch{}
  const save=()=>{try{store?.write(CACHE_FILE,Object.fromEntries(cache));}catch{}};
  function isStale(entry,ms) {
    if(!entry||ms-entry.fetchedMs>=CACHE_MS)return true;
    if(entry.provider==='met-no')return !forecastAt(entry,ms)||ms-Date.parse(entry.issuedAt)>18*60*MINUTE||Date.parse(entry.issuedAt)-ms>15*MINUTE;
    const observed=Date.parse(entry.observedAt);return !Number.isFinite(observed)||ms-observed>OBSERVATION_MAX_AGE_MS||observed-ms>15*MINUTE;
  }
  function result(city,entry,status,error=null) {
    const ms=instant(now()),disabled=status==='disabled',sun=solarForCity(city.city,ms);
    const stale=!disabled&&(isStale(entry,ms)||status==='stale');
    const selected=entry?.provider==='met-no'?forecastAt(entry,ms):null;
    return {city:city.city,cityLabel:city.cityLabel,timeZone:city.timeZone,localDate:sun.date,generatedAt:new Date(ms).toISOString(),
      fetchedAt:entry?new Date(entry.fetchedMs).toISOString():null,observedAt:entry?.observedAt||null,issuedAt:entry?.issuedAt||null,
      validAt:selected?.validAt||entry?.validAt||null,current:entry?{...(selected?.current||entry.current)}:null,sun,stale,
      status:disabled?'disabled':entry?(stale?'stale':status):'unavailable',error,refreshAfter:CACHE_MS,
      nextRefreshAt:entry?new Date(Math.max(ms,entry.fetchedMs+CACHE_MS)).toISOString():null,
      cities:WEATHER_CITIES.map(c=>({...c})),source:sourceFor(city,entry?.provider)};
  }
  async function stationCode(city,signal) {
    let directory=provinceCache.get(city.province);
    if(!directory||instant(now())-directory.at>=CACHE_MS){
      let job=provincePending.get(city.province);
      if(!job){job=fetchJson(fetchImpl,`${NMC_BASE}/rest/province/${city.province}`,signal).then(rows=>{
        if(!Array.isArray(rows))throw new Error('天气服务城市目录暂不可用');
        const codes=new Map(rows.filter(x=>typeof x.city==='string'&&/^[A-Za-z0-9]{3,12}$/.test(String(x.code))).map(x=>[x.city,String(x.code)]));
        const value={codes,at:instant(now())};provinceCache.set(city.province,value);return value;
      }).finally(()=>provincePending.delete(city.province));provincePending.set(city.province,job);}
      directory=await job;
    }
    const code=directory.codes.get(city.cityLabel);if(!code)throw new Error('天气服务暂不支持所选城市');return code;
  }
  async function refresh(city) {
    const started=performance.now();let lastError='天气服务暂时不可用',candidate=null;
    for(const provider of ['nmc','met-no']){
      const remaining=limit-(performance.now()-started);if(remaining<=0)break;
      const budget=provider==='nmc'?Math.min(remaining,Math.max(1,limit*.53)):remaining;
      try{
        const data=await boundedTask(async signal=>{
          if(provider==='nmc'){
            const code=await stationCode(city,signal);
            const value=await fetchJson(fetchImpl,`${NMC_BASE}/rest/weather?stationid=${encodeURIComponent(code)}`,signal);
            if(!value?.data?.real)provinceCache.delete(city.province);
            return normalizeNmc(value,city,instant(now()));
          }
          return normalizeMet(await fetchJson(fetchImpl,`${MET_BASE}?lat=${city.latitude}&lon=${city.longitude}`,signal),city,instant(now()));
        },budget,'天气服务暂时超时');
        const entry={...data,fetchedMs:instant(now())};
        if(!isStale(entry,instant(now()))){cache.set(city.city,entry);save();failures.delete(city.city);return result(city,entry,'fresh');}
        if(!candidate||Date.parse(entry.observedAt||entry.issuedAt)>Date.parse(candidate.observedAt||candidate.issuedAt))candidate=entry;
      }catch(err){lastError=/^天气服务/.test(String(err?.message))?String(err.message).slice(0,80):'天气服务暂时不可用';}
    }
    if(candidate){cache.set(city.city,candidate);save();}
    failures.set(city.city,{at:instant(now()),error:lastError});
    return result(city,cache.get(city.city),'stale',lastError);
  }
  return {async get(value='shanghai',{weather=true,force=false}={}){
    const city=cityConfig(value),ms=instant(now()),entry=cache.get(city.city),failed=failures.get(city.city);
    if(weather===false)return result(city,null,'disabled');
    if(pending.has(city.city))return pending.get(city.city);
    if(!force&&entry&&!isStale(entry,ms))return result(city,entry,'cached');
    if(!force&&failed&&ms-failed.at<RETRY_MS)return result(city,entry,'stale',failed.error);
    const request=refresh(city).finally(()=>pending.delete(city.city));pending.set(city.city,request);return request;
  }};
}

// The raw response contains the network exit IP. Only the location suffix is
// parsed; the IP is never returned, logged or persisted by this module.
export function createCityLocation({fetchImpl=()=>Promise.reject(new Error('宿主网络接口未就绪')),now=Date.now,timeoutMs=3500}={}) {
  let cache=null,pending=null;
  const limit=Math.min(5000,Math.max(1,Number(timeoutMs)||3500));
  const fallback=()=>({city:'shanghai',cityLabel:'上海',source:'default',status:'fallback',detectedAt:null,message:'未识别到支持的IP城市，暂用上海，可手动选择'});
  return {async get(){
    const ms=instant(now());
    if(cache&&ms-cache.at<24*60*MINUTE)return {...cache.value,status:cache.value.status==='detected'?'cached':cache.value.status};
    if(pending)return pending;
    pending=(async()=>{
      let value=fallback();
      try{
        const text=await boundedTask(signal=>fetchText(fetchImpl,'https://myip.ipip.net',signal,10_000),limit,'IP城市识别暂时超时');
        const suffix=text.match(/来自[于於]\s*[:：]\s*([^\r\n<]{1,160})/)?.[1];
        const tokens=suffix?.trim().split(/\s+/)||[];
        if(tokens[0]==='中国'){
          const name=String(tokens[2]||(['北京','上海','香港'].includes(tokens[1])?tokens[1]:'')).replace(/(?:特别行政区|市)$/,'');
          const city=cityMap.get(name);
          if(city)value={city:city.city,cityLabel:city.cityLabel,source:'IPIP.NET',status:'detected',detectedAt:new Date(ms).toISOString(),message:'根据网络出口IP识别的粗城市，可手动修改'};
        }
      }catch{}
      // Failed/unsupported lookups retry after two minutes, not every view.
      cache={at:ms,value};if(value.status==='fallback')cache.at=ms-(24*60*MINUTE-RETRY_MS);
      return {...value};
    })().finally(()=>{pending=null;});
    return pending;
  }};
}
const weather=createWeather(),location=createCityLocation();
export const getWeather=(city,options)=>weather.get(city,options);
export const getWeatherLocation=()=>location.get();
