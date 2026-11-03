import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, dayInfo, monthDays, nextHoliday, dailyCopy, DAILY_COPY_CATALOG, COPY_APPROVED } from '../ui/calendar-data.mjs';

test('instants and midnight countdowns use Asia/Shanghai civil dates', () => {
  assert.equal(dateKey('2026-10-12T16:00:00Z'), '2026-10-13');
  assert.equal(dateKey(new Date('2026-10-12T15:59:59Z')), '2026-10-12');
  assert.equal(dayInfo('2026-10-12T16:00:00Z').weekday, 2);
  assert.equal(nextHoliday('2026-12-31T15:59:59Z').days, 1);
  assert.equal(nextHoliday('2026-12-31T16:00:00Z').days, 0);
});

test('date-only input is validated and datetimes without offsets are rejected', () => {
  for (const bad of ['2026-02-29', '2026-13-01', '2026-01-32', '2026-01-01T10:00:00', 'not-a-date', null]) {
    assert.throws(() => dateKey(bad));
  }
  assert.equal(dateKey('2024-02-29'), '2024-02-29');
});

test('month navigation supports leap years and civil year boundaries', () => {
  assert.equal(monthDays(2024, 2).length, 29);
  assert.equal(monthDays(2026, 2).length, 28);
  assert.equal(monthDays(2026, 12).at(-1).date, '2026-12-31');
  assert.equal(monthDays(2027, 1)[0].date, '2027-01-01');
  for (const [y, m] of [[2026, 0], [2026, 13], [2026.5, 1], [10000, 1]]) assert.throws(() => monthDays(y, m));
});

test('all 2026 government rest dates and makeup days match the published calendar', () => {
  const ranges = [
    ['2026-01-01', '2026-01-03', '元旦'], ['2026-02-15', '2026-02-23', '春节'],
    ['2026-04-04', '2026-04-06', '清明节'], ['2026-05-01', '2026-05-05', '劳动节'],
    ['2026-06-19', '2026-06-21', '端午节'], ['2026-09-25', '2026-09-27', '中秋节'],
    ['2026-10-01', '2026-10-07', '国庆节'],
  ];
  const makeups = ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'];
  const days = Array.from({ length: 12 }, (_, i) => monthDays(2026, i + 1)).flat();
  assert.equal(days.filter(d => d.dayType === 'holiday').length, 33);
  assert.deepEqual(days.filter(d => d.dayType === 'makeup').map(d => d.date), makeups);
  for (const day of days) {
    const expected = ranges.find(([start, end]) => day.date >= start && day.date <= end);
    if (expected) {
      assert.equal(day.badge, '休', day.date);
      assert.equal(day.holiday.name, expected[2], day.date);
      assert.equal(day.isRestDay, true, day.date);
    } else if (makeups.includes(day.date)) {
      assert.equal(day.badge, '补班', day.date);
      assert.equal(day.isWeekend, true, day.date);
      assert.equal(day.isWorkday, true, day.date);
      assert.equal(day.isRestDay, false, day.date);
    } else assert.equal(day.holiday, null, day.date);
  }
});

test('2025 merged National Day and Mid-Autumn schedule stays merged', () => {
  const holiday = dayInfo('2025-10-06');
  assert.equal(holiday.holidayName, '国庆节、中秋节');
  assert.equal(holiday.festivalName, '中秋节');
  assert.equal(dayInfo('2025-10-11').badge, '补班');
  assert.equal(dayInfo('2025-01-26').isWorkday, true);
  assert.equal(dayInfo('2025-04-27').badge, '补班');
  assert.equal(dayInfo('2025-01-02').holiday, null);
});

test('authoritative lunar month starts handle leap months and the 2027 ICU discrepancy', () => {
  assert.equal(dayInfo('2025-07-24').lunar.fullLabel, '六月三十');
  assert.equal(dayInfo('2025-07-25').lunar.fullLabel, '闰六月初一');
  assert.equal(dayInfo('2025-07-25').lunar.isLeap, true);
  assert.equal(dayInfo('2026-02-16').lunar.fullLabel, '十二月廿九');
  assert.equal(dayInfo('2026-02-17').lunar.fullLabel, '正月初一');
  assert.equal(dayInfo('2027-02-05').lunar.fullLabel, '十二月廿九');
  assert.equal(dayInfo('2027-02-06').lunar.fullLabel, '正月初一');
  assert.equal(dayInfo('2027-02-06').lunar.year, 2027);
  assert.equal(dayInfo('2026-09-25').lunar.fullLabel, '八月十五');
});

test('solar terms preserve year-specific UTC+8 dates instead of month approximations', () => {
  assert.equal(dayInfo('2025-02-03').solarTerm, '立春');
  assert.equal(dayInfo('2026-02-03').solarTerm, '');
  assert.equal(dayInfo('2026-02-04').solarTerm, '立春');
  assert.equal(dayInfo('2026-04-04').solarTerm, '');
  assert.equal(dayInfo('2026-04-05').solarTerm, '清明');
  assert.equal(dayInfo('2027-02-19').solarTerm, '雨水');
  assert.equal(dayInfo('2024-12-06').solarTerm, '大雪');
  assert.equal(dayInfo('2025-12-21').solarTerm, '冬至');
  assert.equal(dayInfo('2026-12-22').solarTerm, '冬至');
  for (let year = 2020; year <= 2030; year += 1) {
    const days = Array.from({ length: 12 }, (_, i) => monthDays(year, i + 1)).flat();
    assert.equal(days.filter(d => d.solarTerm).length, 24, String(year));
    assert.ok(days.every(d => d.lunar?.dayNumber >= 1 && d.lunar?.dayNumber <= 30), String(year));
  }
  assert.equal(dayInfo('2031-01-01').lunar, null);
  assert.equal(dayInfo('2031-01-01').almanacAvailable, false);
});

test('confirmed countdowns start at the published break, including ongoing holidays', () => {
  const upcoming = nextHoliday('2026-02-14');
  assert.equal(upcoming.date, '2026-02-15');
  assert.equal(upcoming.days, 1);
  assert.equal(upcoming.duration, 9);
  assert.equal(upcoming.confirmed, true);
  assert.equal(upcoming.kind, 'break');
  assert.equal(nextHoliday('2026-02-20').days, 0);
  assert.equal(nextHoliday('2026-02-20').label, '春节假期中');
  assert.equal(nextHoliday('2026-02-24').name, '清明节');
});

test('2027 and later schedules do not invent rest or makeup dates', () => {
  const january = dayInfo('2027-01-01');
  assert.equal(january.festivalName, '元旦');
  assert.equal(january.badge, '');
  assert.equal(january.holiday, null);
  assert.equal(january.restConfirmed, false);
  assert.equal(january.scheduleStatus, 'pending');
  assert.equal(dayInfo('2027-02-06').festivalName, '春节');
  assert.equal(dayInfo('2027-02-06').badge, '休'); // Regular Saturday, not an invented government break.
  const upcoming = nextHoliday('2026-10-13');
  assert.equal(upcoming.date, '2027-01-01');
  assert.equal(upcoming.days, 80);
  assert.equal(upcoming.confirmed, false);
  assert.equal(upcoming.kind, 'festival');
  assert.match(upcoming.label, /法定节日/);
  assert.match(upcoming.detail, /待公布/);
  assert.equal(nextHoliday('2027-02-04').date, '2027-02-05'); // Statutory lunar New Year's Eve.
  assert.equal(nextHoliday('2024-12-31'), null);
  assert.equal(nextHoliday('2030-12-31').date, '2031-01-01');
  assert.equal(nextHoliday('2031-01-02'), null); // Do not skip an unloaded lunar New Year to May Day.
  assert.equal(nextHoliday('9999-12-31'), null);
});

test('常规周末标休，已公布补班优先，未载入调休不冒充法定假期',()=>{
  for(const day of ['2026-10-17','2026-10-18']){
    const info=dayInfo(day);
    assert.equal(info.dayType,'weekend');assert.equal(info.badge,'休');
    assert.equal(info.isRestDay,true);assert.equal(info.isWorkday,false);assert.equal(info.holiday,null);
  }
  for(const day of ['2026-10-10','2026-01-04','2025-10-11']){
    const info=dayInfo(day);
    assert.equal(info.dayType,'makeup');assert.equal(info.badge,'补班');
    assert.equal(info.isWeekend,true);assert.equal(info.isRestDay,false);assert.equal(info.isWorkday,true);
  }
  const pending=dayInfo('2027-02-06');
  assert.equal(pending.dayType,'weekend');assert.equal(pending.badge,'休');
  assert.equal(pending.holiday,null);assert.equal(pending.restConfirmed,false);assert.equal(pending.scheduleStatus,'pending');
  assert.equal(dayInfo('2026-10-19').badge,'');
});

test('all sixty approved copies stay stable by day and have no unresolved countdowns', () => {
  assert.equal(COPY_APPROVED, true);
  assert.equal(DAILY_COPY_CATALOG.length, 60);
  assert.equal(new Set(DAILY_COPY_CATALOG.map(c => c.id)).size, 60);
  assert.equal(DAILY_COPY_CATALOG.filter(c => c.style === 'playful').length, 30);
  assert.equal(DAILY_COPY_CATALOG.filter(c => c.style === 'comfort').length, 30);
  assert.ok(DAILY_COPY_CATALOG.every(c => c.approved === true));
  for (let m = 1; m <= 12; m += 1) {
    for (const day of monthDays(2026, m)) {
      for (const style of ['playful', 'comfort']) {
        const copy = dailyCopy(day.date, style);
        assert.deepEqual(copy, dailyCopy(day.date, style));
        assert.equal(copy.approved, true);
        assert.equal(copy.date, day.date);
        assert.doesNotMatch(copy.text, /\{holiday\}|\{days\}|undefined|NaN/);
        if (copy.id.match(/(?:P|C)(?:2[1-9]|30)/) && copy.holiday?.confirmed === false) {
          assert.match(copy.text, /法定节日/);
          assert.match(copy.text, /调休安排待公布/);
        }
      }
    }
  }
  for (const style of ['playful', 'comfort']) {
    assert.ok(Number(dailyCopy('2026-02-20', style).id.slice(1)) <= 20);
    assert.ok(Number(dailyCopy('2024-12-31', style).id.slice(1)) <= 20);
    assert.ok(Number(dailyCopy('9999-12-31', style).id.slice(1)) <= 20);
  }
});
