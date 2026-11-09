// Recurring task schedule (Tasks page, sidebar badge, reminder emails): due dates, period keys and the
// client / server twins (client/src/data/work/schedule.ts must stay identical to server/src/services/workSchedule.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../../client/src/data/work/schedule.ts';
import * as server from '../src/services/workSchedule.js';
import type { ScheduleSpec } from '../src/services/workSchedule.js';

const { occurrences, isoWeek, todayIST, describe, lookbackDays, ordinal, parseYmd, diffDays } = server;

test('daily: Mon–Sat only, period = the day', () => {
  // 2 Nov 2026 is a Monday, 8 Nov a Sunday
  const occ = occurrences({ cadence: 'daily' }, '2026-11-02', '2026-11-08');
  assert.deepEqual(occ.map((o) => o.due), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
  assert.ok(occ.every((o) => o.period === o.due));
});

test('weekly: due weekday, ISO week key across the year end', () => {
  const occ = occurrences({ cadence: 'weekly', dueWeekday: 5 }, '2026-12-21', '2027-01-10');
  assert.deepEqual(occ, [
    { period: '2026-W52', due: '2026-12-25' },
    { period: '2026-W53', due: '2027-01-01' },
    { period: '2027-W01', due: '2027-01-08' },
  ]);
  assert.equal(isoWeek(parseYmd('2027-01-03')), '2026-W53'); // Sunday belongs to the week before
  // out-of-range weekday falls back to Monday
  assert.deepEqual(occurrences({ cadence: 'weekly', dueWeekday: 9 }, '2026-11-02', '2026-11-08').map((o) => o.due), ['2026-11-02']);
});

test('monthly: day clamped to the month, arrears key = the previous month (Jan → last Dec)', () => {
  const spec: ScheduleSpec = { cadence: 'monthly', dueDay: 31 };
  assert.deepEqual(occurrences(spec, '2027-01-01', '2027-03-31').map((o) => o.due), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.deepEqual(occurrences(spec, '2028-02-01', '2028-02-29').map((o) => o.due), ['2028-02-29']); // leap year
  const arrears = occurrences({ cadence: 'monthly', dueDay: 7, arrears: true }, '2026-12-01', '2027-01-31');
  assert.deepEqual(arrears, [{ period: '2026-11', due: '2026-12-07' }, { period: '2026-12', due: '2027-01-07' }]);
  // a due date outside [from, to] is not listed even if its month is
  assert.deepEqual(occurrences({ cadence: 'monthly', dueDay: 20 }, '2026-11-21', '2026-11-30'), []);
});

test('quarterly / half-yearly: default months, custom months', () => {
  assert.deepEqual(occurrences({ cadence: 'quarterly', dueDay: 15 }, '2026-01-01', '2026-12-31').map((o) => o.period), ['2026-01', '2026-04', '2026-07', '2026-10']);
  assert.deepEqual(occurrences({ cadence: 'half-yearly', dueDay: 30 }, '2026-01-01', '2026-12-31').map((o) => o.due), ['2026-04-30', '2026-10-30']);
  assert.deepEqual(occurrences({ cadence: 'quarterly', dueDay: 1, months: [3, 6] }, '2026-01-01', '2026-12-31').map((o) => o.due), ['2026-03-01', '2026-06-01']);
});

test('yearly and one-time', () => {
  assert.deepEqual(occurrences({ cadence: 'yearly' }, '2026-01-01', '2027-12-31'), [{ period: '2026', due: '2026-03-31' }, { period: '2027', due: '2027-03-31' }]);
  assert.deepEqual(occurrences({ cadence: 'yearly', dueMonth: 9, dueDay: 30 }, '2026-10-01', '2026-12-31'), []);
  assert.deepEqual(occurrences({ cadence: 'one-time', dueDate: '2026-11-20' }, '2026-11-01', '2026-11-30'), [{ period: 'once', due: '2026-11-20' }]);
  assert.deepEqual(occurrences({ cadence: 'one-time', dueDate: '2026-12-20' }, '2026-11-01', '2026-11-30'), []);
  assert.deepEqual(occurrences({ cadence: 'one-time', dueMonth: 11, dueDay: 31 }, '2026-11-01', '2026-11-30'), [{ period: 'once', due: '2026-11-30' }]);
  assert.deepEqual(occurrences({ cadence: 'one-time' }, '2026-01-01', '2026-12-31'), []);
});

test('India date, day maths, lookback, words', () => {
  assert.equal(todayIST(new Date('2026-11-09T18:29:00Z')), '2026-11-09');
  assert.equal(todayIST(new Date('2026-11-09T18:30:00Z')), '2026-11-10'); // midnight IST = 18:30 UTC
  assert.equal(diffDays('2027-03-01', '2027-02-27'), 2);
  assert.deepEqual((['daily', 'weekly', 'monthly', 'yearly'] as const).map(lookbackDays), [1, 14, 45, 120]);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
  assert.equal(describe({ cadence: 'monthly', dueDay: 7, arrears: true }), 'Every month on the 7th (for last month)');
  assert.equal(describe({ cadence: 'monthly', startDay: 8, dueDay: 9 }), 'Every month, 8th–9th');
  assert.equal(describe({ cadence: 'monthly', dueDay: 31 }), 'Every month on the last day');
  assert.equal(describe({ cadence: 'quarterly', dueDay: 15 }), 'Quarterly on the 15th of Jan, Apr, Jul, Oct');
  assert.equal(describe({ cadence: 'one-time', dueDate: '2026-11-20' }), 'Once on 20 Nov 2026');
});

test('client and server schedules agree (they are copies; change both together)', () => {
  const specs: ScheduleSpec[] = [
    { cadence: 'daily' },
    { cadence: 'weekly', dueWeekday: 3 },
    { cadence: 'weekly', dueWeekday: 7 },
    { cadence: 'monthly', dueDay: 7, arrears: true },
    { cadence: 'monthly', dueDay: 31, startDay: 25 },
    { cadence: 'quarterly', dueDay: 30 },
    { cadence: 'half-yearly', dueDay: 31, months: [5, 11] },
    { cadence: 'yearly', dueMonth: 2, dueDay: 29 },
    { cadence: 'one-time', dueDate: '2027-02-14' },
    { cadence: 'one-time', dueMonth: 4, dueDay: 31 },
  ];
  for (const s of specs) {
    assert.deepEqual(client.occurrences(s, '2026-10-01', '2028-03-31'), server.occurrences(s, '2026-10-01', '2028-03-31'), JSON.stringify(s));
    assert.equal(client.describe(s), server.describe(s));
  }
  for (const c of ['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time'] as const) assert.equal(client.lookbackDays(c), server.lookbackDays(c));
  for (let i = 0; i < 400; i += 7) {
    const d = client.addDays(parseYmd('2026-12-01'), i);
    assert.equal(client.isoWeek(d), server.isoWeek(d));
  }
});
