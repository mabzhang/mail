/** China mainland calendar. See ../../节假日资料/依据.md for sources and coverage.
 * Dates and countdowns are civil dates in Asia/Shanghai, independent of host timezone.
 * Government break schedules are separate from statutory festival dates.
 */
export const CALENDAR_TIME_ZONE = 'Asia/Shanghai';
export const CALENDAR_DATA_VERSION = '2026-10-13';
// All 60 entries were approved by the user on 2026-10-13.
export const COPY_APPROVED = true;
export const ALMANAC_RANGE = Object.freeze({ start: '2020-01-01', end: '2030-12-31' });
const DAY_MS = 86400000;
const pad = n => String(n).padStart(2, '0');
const shanghaiFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALENDAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const dateFromParts = (year, month, day) => `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
const civilMillis = date => Date.parse(`${date}T00:00:00Z`);
const addDays = (date, days) => new Date(civilMillis(date) + days * DAY_MS).toISOString().slice(0, 10);

/** Bare date strings are already Shanghai civil dates. Instants require an offset. */
export function dateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(civilMillis(value));
    if (year < 1 || year > 9999 || Number.isNaN(+parsed)
      || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
      throw new RangeError('Invalid calendar date');
    }
    return value;
  }
  if (typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    throw new RangeError('Datetime strings must include a timezone offset');
  }
  if (!(value instanceof Date) && typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError('Expected a civil date, Date, or timestamp');
  }
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(+instant)) throw new RangeError('Invalid calendar date');
  const parts = Object.fromEntries(shanghaiFormatter.formatToParts(instant).map(p => [p.type, p.value]));
  return dateKey(`${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`);
}

const GOVERNMENT_SOURCES = Object.freeze({
  2025: 'https://www.gov.cn/zhengce/zhengceku/202411/content_6986383.htm',
  2026: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm',
});
const STATUTORY_SOURCE = 'https://www.gov.cn/zhengce/content/202411/content_6986380.htm';
const ALMANAC_SOURCE = 'https://www.hko.gov.hk/tc/gts/time/conversion1_text.htm';
// Only these two annual break schedules have been loaded and confirmed.
const SCHEDULES = {
  2025: [
    ['元旦', '2025-01-01', '2025-01-01', []],
    ['春节', '2025-01-28', '2025-02-04', ['2025-01-26', '2025-02-08']],
    ['清明节', '2025-04-04', '2025-04-06', []],
    ['劳动节', '2025-05-01', '2025-05-05', ['2025-04-27']],
    ['端午节', '2025-05-31', '2025-06-02', []],
    ['国庆节、中秋节', '2025-10-01', '2025-10-08', ['2025-09-28', '2025-10-11']],
  ],
  2026: [
    ['元旦', '2026-01-01', '2026-01-03', ['2026-01-04']],
    ['春节', '2026-02-15', '2026-02-23', ['2026-02-14', '2026-02-28']],
    ['清明节', '2026-04-04', '2026-04-06', []],
    ['劳动节', '2026-05-01', '2026-05-05', ['2026-05-09']],
    ['端午节', '2026-06-19', '2026-06-21', []],
    ['中秋节', '2026-09-25', '2026-09-27', []],
    ['国庆节', '2026-10-01', '2026-10-07', ['2026-09-20', '2026-10-10']],
  ],
};
const holidayDays = new Map();
const breaks = [];
for (const [year, rows] of Object.entries(SCHEDULES)) {
  for (const [name, start, end, makeupDates] of rows) {
    const shared = { name, start, end, confirmed: true, source: GOVERNMENT_SOURCES[year] };
    breaks.push(Object.freeze({ ...shared }));
    for (let date = start; date <= end; date = addDays(date, 1)) {
      holidayDays.set(date, Object.freeze({ ...shared, type: 'holiday', label: '休' }));
    }
    for (const date of makeupDates) {
      holidayDays.set(date, Object.freeze({ ...shared, type: 'makeup', label: '补班' }));
    }
  }
}

const TERM_NAMES = '小寒 大寒 立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至 小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至'.split(' ');
// Actual UTC+8 dates from HKO annual tables, not a two-dates-per-month approximation.
const TERM_DATES = {
  2020: '01-06 01-20 02-04 02-19 03-05 03-20 04-04 04-19 05-05 05-20 06-05 06-21 07-06 07-22 08-07 08-22 09-07 09-22 10-08 10-23 11-07 11-22 12-07 12-21',
  2021: '01-05 01-20 02-03 02-18 03-05 03-20 04-04 04-20 05-05 05-21 06-05 06-21 07-07 07-22 08-07 08-23 09-07 09-23 10-08 10-23 11-07 11-22 12-07 12-21',
  2022: '01-05 01-20 02-04 02-19 03-05 03-20 04-05 04-20 05-05 05-21 06-06 06-21 07-07 07-23 08-07 08-23 09-07 09-23 10-08 10-23 11-07 11-22 12-07 12-22',
  2023: '01-05 01-20 02-04 02-19 03-06 03-21 04-05 04-20 05-06 05-21 06-06 06-21 07-07 07-23 08-08 08-23 09-08 09-23 10-08 10-24 11-08 11-22 12-07 12-22',
  2024: '01-06 01-20 02-04 02-19 03-05 03-20 04-04 04-19 05-05 05-20 06-05 06-21 07-06 07-22 08-07 08-22 09-07 09-22 10-08 10-23 11-07 11-22 12-06 12-21',
  2025: '01-05 01-20 02-03 02-18 03-05 03-20 04-04 04-20 05-05 05-21 06-05 06-21 07-07 07-22 08-07 08-23 09-07 09-23 10-08 10-23 11-07 11-22 12-07 12-21',
  2026: '01-05 01-20 02-04 02-18 03-05 03-20 04-05 04-20 05-05 05-21 06-05 06-21 07-07 07-23 08-07 08-23 09-07 09-23 10-08 10-23 11-07 11-22 12-07 12-22',
  2027: '01-05 01-20 02-04 02-19 03-06 03-21 04-05 04-20 05-06 05-21 06-06 06-21 07-07 07-23 08-08 08-23 09-08 09-23 10-08 10-23 11-07 11-22 12-07 12-22',
  2028: '01-06 01-20 02-04 02-19 03-05 03-20 04-04 04-19 05-05 05-20 06-05 06-21 07-06 07-22 08-07 08-22 09-07 09-22 10-08 10-23 11-07 11-22 12-06 12-21',
  2029: '01-05 01-20 02-03 02-18 03-05 03-20 04-04 04-20 05-05 05-21 06-05 06-21 07-07 07-22 08-07 08-23 09-07 09-23 10-08 10-23 11-07 11-22 12-07 12-21',
  2030: '01-05 01-20 02-04 02-18 03-05 03-20 04-05 04-20 05-05 05-21 06-05 06-21 07-07 07-23 08-07 08-23 09-07 09-23 10-08 10-23 11-07 11-22 12-07 12-22',
};
const solarTerms = new Map();
for (const [year, dates] of Object.entries(TERM_DATES)) {
  dates.split(' ').forEach((date, i) => solarTerms.set(`${year}-${date}`, TERM_NAMES[i]));
}
// Month starts preserve leap months and the lunar-year boundary. Initial row anchors January 2020.
const LUNAR_START_ROWS = `
2019-12-26 十二月
2020-01-25 正月
2020-02-23 二月
2020-03-24 三月
2020-04-23 四月
2020-05-23 闰四月
2020-06-21 五月
2020-07-21 六月
2020-08-19 七月
2020-09-17 八月
2020-10-17 九月
2020-11-15 十月
2020-12-15 十一月
2021-01-13 十二月
2021-02-12 正月
2021-03-13 二月
2021-04-12 三月
2021-05-12 四月
2021-06-10 五月
2021-07-10 六月
2021-08-08 七月
2021-09-07 八月
2021-10-06 九月
2021-11-05 十月
2021-12-04 十一月
2022-01-03 十二月
2022-02-01 正月
2022-03-03 二月
2022-04-01 三月
2022-05-01 四月
2022-05-30 五月
2022-06-29 六月
2022-07-29 七月
2022-08-27 八月
2022-09-26 九月
2022-10-25 十月
2022-11-24 十一月
2022-12-23 十二月
2023-01-22 正月
2023-02-20 二月
2023-03-22 闰二月
2023-04-20 三月
2023-05-19 四月
2023-06-18 五月
2023-07-18 六月
2023-08-16 七月
2023-09-15 八月
2023-10-15 九月
2023-11-13 十月
2023-12-13 十一月
2024-01-11 十二月
2024-02-10 正月
2024-03-10 二月
2024-04-09 三月
2024-05-08 四月
2024-06-06 五月
2024-07-06 六月
2024-08-04 七月
2024-09-03 八月
2024-10-03 九月
2024-11-01 十月
2024-12-01 十一月
2024-12-31 十二月
2025-01-29 正月
2025-02-28 二月
2025-03-29 三月
2025-04-28 四月
2025-05-27 五月
2025-06-25 六月
2025-07-25 闰六月
2025-08-23 七月
2025-09-22 八月
2025-10-21 九月
2025-11-20 十月
2025-12-20 十一月
2026-01-19 十二月
2026-02-17 正月
2026-03-19 二月
2026-04-17 三月
2026-05-17 四月
2026-06-15 五月
2026-07-14 六月
2026-08-13 七月
2026-09-11 八月
2026-10-10 九月
2026-11-09 十月
2026-12-09 十一月
2027-01-08 十二月
2027-02-06 正月
2027-03-08 二月
2027-04-07 三月
2027-05-06 四月
2027-06-05 五月
2027-07-04 六月
2027-08-02 七月
2027-09-01 八月
2027-09-30 九月
2027-10-29 十月
2027-11-28 十一月
2027-12-28 十二月
2028-01-26 正月
2028-02-25 二月
2028-03-26 三月
2028-04-25 四月
2028-05-24 五月
2028-06-23 闰五月
2028-07-22 六月
2028-08-20 七月
2028-09-19 八月
2028-10-18 九月
2028-11-16 十月
2028-12-16 十一月
2029-01-15 十二月
2029-02-13 正月
2029-03-15 二月
2029-04-14 三月
2029-05-13 四月
2029-06-12 五月
2029-07-11 六月
2029-08-10 七月
2029-09-08 八月
2029-10-08 九月
2029-11-06 十月
2029-12-05 十一月
2030-01-04 十二月
2030-02-03 正月
2030-03-04 二月
2030-04-03 三月
2030-05-02 四月
2030-06-01 五月
2030-07-01 六月
2030-07-30 七月
2030-08-29 八月
2030-09-27 九月
2030-10-27 十月
2030-11-25 十一月
2030-12-25 十二月
`.trim().split('\n').map(row => row.split(' '));
let lunarYear = 2019;
const lunarStarts = LUNAR_START_ROWS.map(([date, month]) => {
  if (month === '正月') lunarYear = Number(date.slice(0, 4));
  return Object.freeze({ date, month, year: lunarYear, millis: civilMillis(date) });
});
const LUNAR_MONTHS = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const NUMERALS = '一二三四五六七八九十';
function lunarDayName(day) {
  if (day <= 10) return `初${NUMERALS[day - 1]}`;
  if (day < 20) return `十${NUMERALS[day - 11]}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${NUMERALS[day - 21]}`;
  return '三十';
}
function lunarInfo(date) {
  if (date < ALMANAC_RANGE.start || date > ALMANAC_RANGE.end) return null;
  let start;
  for (const row of lunarStarts) {
    if (row.date > date) break;
    start = row;
  }
  if (!start) return null;
  const dayNumber = Math.round((civilMillis(date) - start.millis) / DAY_MS) + 1;
  const day = lunarDayName(dayNumber);
  return Object.freeze({
    month: start.month, day, dayNumber, year: start.year,
    monthNumber: LUNAR_MONTHS.indexOf(start.month.replace('闰', '')) + 1,
    isLeap: start.month.startsWith('闰'), label: dayNumber === 1 ? start.month : day,
    fullLabel: `${start.month}${day}`, source: ALMANAC_SOURCE,
  });
}
function statutoryFestival(date, lunar = lunarInfo(date), solarTerm = solarTerms.get(date)) {
  const md = date.slice(5);
  const updatedLaw = Number(date.slice(0, 4)) >= 2025;
  if (md === '01-01') return '元旦';
  if (md === '05-01' || (updatedLaw && md === '05-02')) return '劳动节';
  if (['10-01', '10-02', '10-03'].includes(md)) return '国庆节';
  if (solarTerm === '清明') return '清明节';
  if (lunar && !lunar.isLeap) {
    if (lunar.monthNumber === 1 && lunar.dayNumber <= 3) return '春节';
    if (lunar.monthNumber === 5 && lunar.dayNumber === 5) return '端午节';
    if (lunar.monthNumber === 8 && lunar.dayNumber === 15) return '中秋节';
    if (updatedLaw && lunar.monthNumber === 12 && lunar.dayNumber >= 29) {
      const tomorrow = lunarInfo(addDays(date, 1));
      if (tomorrow?.monthNumber === 1 && tomorrow.dayNumber === 1) return '春节（除夕）';
    }
  }
  return '';
}

export function dayInfo(value = new Date()) {
  const date = dateKey(value);
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(civilMillis(date)).getUTCDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const holiday = holidayDays.get(date) || null;
  const confirmedSchedule = Boolean(SCHEDULES[year]);
  const lunar = lunarInfo(date);
  const solarTerm = solarTerms.get(date) || '';
  const festivalName = statutoryFestival(date, lunar, solarTerm);
  const dayType = holiday?.type || (isWeekend ? 'weekend' : 'workday');
  const isRestDay = dayType === 'holiday' || dayType === 'weekend';
  return {
    date, year, month, day, weekday, weekdayLabel: `星期${'日一二三四五六'[weekday]}`,
    isToday: date === dateKey(new Date()), isWeekend, isRestDay, isWorkday: !isRestDay,
    holiday, holidayName: holiday?.name || festivalName, festivalName,
    dayType, badge: holiday?.label || (isRestDay ? '休' : ''), restConfirmed: confirmedSchedule,
    lunar, lunarLabel: lunar?.label || '', lunarAvailable: Boolean(lunar),
    solarTerm, almanacAvailable: Boolean(TERM_DATES[year]),
    scheduleStatus: confirmedSchedule ? 'confirmed' : 'pending',
    scheduleNote: confirmedSchedule ? '国务院公布的中国内地放假调休安排'
      : year < 2025 ? `${year} 年历史放假调休资料未载入；休息日仅按常规周末显示`
        : `${year} 年放假调休安排未载入；休息日仅按常规周末显示，具体安排待公布`,
    almanacNote: TERM_DATES[year] ? '香港天文台 UTC+8 日期对照表'
      : '农历与节气资料未载入（当前覆盖 2020–2030 年）',
  };
}

/** Month is 1–12; returns only this month's days, without leading/trailing padding. */
export function monthDays(year, month) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Expected a year from 1 to 9999 and a month from 1 to 12');
  }
  const first = dateFromParts(year, month, 1);
  const count = new Date(civilMillis(first));
  count.setUTCMonth(month, 0);
  return Array.from({ length: count.getUTCDate() }, (_, i) => dayInfo(dateFromParts(year, month, i + 1)));
}

/** Confirmed schedules count to the start of the break. Unknown years count to a statutory festival. */
export function nextHoliday(value = new Date()) {
  const date = dateKey(value);
  const year = Number(date.slice(0, 4));
  // This release does not infer historic break schedules or apply the 2025 law retroactively.
  if (year < 2025) return null;
  for (let y = year; y <= Math.min(year + 1, 9999); y += 1) {
    if (SCHEDULES[y]) {
      const upcoming = breaks.find(b => Number(b.start.slice(0, 4)) === y && b.end >= date);
      if (upcoming) {
        const days = Math.max(0, Math.round((civilMillis(upcoming.start) - civilMillis(date)) / DAY_MS));
        const duration = Math.round((civilMillis(upcoming.end) - civilMillis(upcoming.start)) / DAY_MS) + 1;
        return {
          ...upcoming, date: upcoming.start, days, duration, kind: 'break',
          label: days === 0 ? `${upcoming.name}假期中` : `距${upcoming.name}假期还有 ${days} 天`,
          detail: `${upcoming.start} 至 ${upcoming.end}，共 ${duration} 天；国务院已公布`,
        };
      }
    } else {
      // Scanning an unknown schedule can identify statutory dates without inventing makeup dates.
      const start = y === year ? date : dateFromParts(y, 1, 1);
      const end = dateFromParts(y, 12, 31);
      // Without a year's lunar/solar table we cannot safely skip past unknown earlier festivals.
      // New Year's Day remains identifiable as the first civil day of that year.
      if (!TERM_DATES[y] && start !== dateFromParts(y, 1, 1)) return null;
      for (let time = civilMillis(start); time <= civilMillis(end); time += DAY_MS) {
        const candidate = new Date(time).toISOString().slice(0, 10);
        const name = statutoryFestival(candidate);
        if (!name) continue;
        const days = Math.round((civilMillis(candidate) - civilMillis(date)) / DAY_MS);
        return {
          name, date: candidate, start: candidate, end: candidate, days, duration: null,
          confirmed: false, kind: 'festival', source: STATUTORY_SOURCE,
          label: days === 0 ? `今天是${name}（法定节日）` : `距${name}（法定节日）还有 ${days} 天`,
          detail: '按法定节日日期提醒；全年放假调休安排未载入，具体安排待公布',
        };
      }
    }
  }
  return null;
}

const playful = [
  '今日份待办已上线，先挑一个好下手的。',
  '先回一封邮件，给收件箱一点小小的震撼。',
  '咖啡可以续杯，待办先别续杯。',
  '今天也争取少开一个会，多解决一件事。',
  '收件箱有点热闹，我们按顺序招呼。',
  '别急，先把最重要的那一件请上桌。',
  '待办很多，手只有两只。先来一件。',
  '给今天定个小目标：关掉一个悬着的事。',
  '先搞定眼前这封，其他邮件排好队。',
  '今天的效率，从少切一次页面开始。',
  '先喝口水，再决定哪封邮件值得皱眉。',
  '把大任务切小一点，今天比较好咬。',
  '今天也试试，让待办少一个。',
  '邮件会来，午饭也会来。先别忘了后者。',
  '这封回完，允许自己站起来晃两步。',
  '先把截止日期近的请到前排。',
  '脑内开了太多标签页？先关一个。',
  '今天的任务：让明天少叹一口气。',
  '不用一次清空收件箱，清掉一个也算。',
  '进度条动一点，今天就没白忙。',
  '{holiday}还有{days}天，日历已经替你数着了。',
  '离{holiday}还有{days}天，先把今天过明白。',
  '{holiday}倒计时{days}天，收件箱暂时还没放假。',
  '再过{days}天就是{holiday}，先解决一件小事。',
  '日历提醒：{holiday}还有{days}天。咖啡提醒：别喝太晚。',
  '{holiday}还有{days}天，今天先别把待办养大。',
  '离{holiday}还有{days}天，待办能少一件是一件。',
  '{holiday}再等{days}天，午饭不必等那么久。',
  '还有{days}天到{holiday}，先让今天的进度条动一动。',
  '{holiday}还有{days}天。今天的小胜利，就从回完这一封开始。',
];
const comfort = [
  '事情多的时候，先做最重要的一件。',
  '今天不用把所有问题都解决。',
  '你已经在处理了，慢一点也可以。',
  '先把眼前这一小步走完。',
  '没有立刻回完的邮件，可以排个顺序。',
  '需要想清楚的事，给自己一点时间。',
  '先照顾好节奏，再照顾进度。',
  '忙归忙，喝水和吃饭也要排进今天。',
  '不必每一封都马上回复，先看轻重缓急。',
  '今天能推进一点，就已经有进展。',
  '有些事需要等回复，先放下也可以。',
  '把下一步写下来，心里会轻一点。',
  '遇到难处理的邮件，先停一下再回。',
  '做完一件事，就给自己留个小空隙。',
  '不确定的时候，先确认事实。',
  '暂时没想好怎么回，也不等于做得不好。',
  '把能做的做好，把要等的记下来。',
  '今天的精力有限，值得留给重要的事。',
  '忙了一阵，记得让眼睛离开屏幕。',
  '一件一件来，今天也会慢慢理顺。',
  '离{holiday}还有{days}天，先把今天安排得松一点。',
  '{holiday}还有{days}天，眼前的事可以一步一步做。',
  '再过{days}天就是{holiday}，今天也记得按时吃饭。',
  '距{holiday}还有{days}天，先给自己留一点喘息的时间。',
  '{holiday}还有{days}天，不必提前把每一天都塞满。',
  '还有{days}天到{holiday}，先照顾好今天的精力。',
  '离{holiday}还有{days}天，今天能推进一点就好。',
  '{holiday}再等{days}天，休息一下可以从现在开始。',
  '距{holiday}还有{days}天，暂时没解决的事先记下来。',
  '{holiday}还有{days}天。今天做完该做的，也给自己留点时间。',
];
export const DAILY_COPY_CATALOG = Object.freeze([
  ...playful.map((template, i) => Object.freeze({ id: `P${pad(i + 1)}`, style: 'playful', template, approved: COPY_APPROVED })),
  ...comfort.map((template, i) => Object.freeze({ id: `C${pad(i + 1)}`, style: 'comfort', template, approved: COPY_APPROVED })),
]);
function stableIndex(seed, count) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % count;
}
/** Approved daily selections stay stable for the same Shanghai date and style. */
export function dailyCopy(value = new Date(), style = 'playful') {
  const date = dateKey(value);
  const selectedStyle = ['comfort', '工作安慰', '安慰'].includes(style) ? 'comfort' : 'playful';
  const holiday = nextHoliday(date);
  const candidates = DAILY_COPY_CATALOG.filter(item => item.style === selectedStyle
    && (!item.template.includes('{holiday}') || (holiday && holiday.days > 0)));
  const item = candidates[stableIndex(`${date}:${selectedStyle}`, candidates.length)];
  const holidayLabel = holiday ? `${holiday.name}${holiday.confirmed ? '假期' : '（法定节日）'}` : '';
  let text = item.template.replaceAll('{holiday}', holidayLabel).replaceAll('{days}', String(holiday?.days ?? ''));
  if (item.template.includes('{holiday}') && !holiday.confirmed) text += '调休安排待公布。';
  return { id: item.id, style: item.style, text, approved: COPY_APPROVED && item.approved, holiday, date };
}
