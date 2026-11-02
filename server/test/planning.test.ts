// The MIS 5-year planner must give the Projection & Deployment Plan sheet's own numbers
// for its 18 months when the levers are neutral (client/src/data/planning/base-plan-check.json
// holds the sheet's computed values, written by scripts/import-projection-plan.py).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlan, peakDeficitWithin, fyOf, monthLabel } from '../../client/src/data/planning/engine.ts';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const check = JSON.parse(fs.readFileSync(path.join(here, '../../client/src/data/planning/base-plan-check.json'), 'utf8'));

const close = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) <= Math.max(2, Math.abs(b) * 1e-6), `${what}: got ${a.toFixed(0)}, sheet ${b.toFixed(0)}`);

test('calendar: M1 = Oct-26 in FY27, M19 = Apr-28 in FY29, M54 = Mar-31 in FY31', () => {
  assert.equal(monthLabel('2026-10', 1), 'Oct-26');
  assert.equal(fyOf('2026-10', 1), 'FY27');
  assert.equal(fyOf('2026-10', 19), 'FY29');
  assert.equal(monthLabel('2026-10', 54), 'Mar-31');
  assert.equal(fyOf('2026-10', 54), 'FY31');
});

// At an 18-month horizon (the sheet's): later months' inventory cover looks past M18 otherwise.
const sheetHorizon = () => { const p = basePlan(); p.levers.horizon = 18; return p; };

test('base scenario reproduces the sheet month by month (M1–M18)', () => {
  const r = runPlan(sheetHorizon());
  const keys: [string, (i: number) => number][] = [
    ['netRevenue', (i) => r.months[i].netRevenue],
    ['grossProfit', (i) => r.months[i].grossProfit],
    ['cm1', (i) => r.months[i].cm1],
    ['cm2', (i) => r.months[i].cm2],
    ['cm3', (i) => r.months[i].cm3],
    ['ebitda', (i) => r.months[i].ebitda],
    ['pbt', (i) => r.months[i].pbt],
    ['pat', (i) => r.months[i].pat],
    ['gstAsset', (i) => r.months[i].gstAsset],
    ['inventory', (i) => r.months[i].inventory],
    ['nwc', (i) => r.months[i].nwc],
    ['netCashFlow', (i) => r.months[i].netCashFlow],
    ['cumulativeCash', (i) => r.months[i].cumulativeCash],
    ['closingCash', (i) => r.months[i].closingCash],
  ];
  for (const [k, get] of keys) for (let i = 0; i < 18; i++) close(get(i), check[k][i], `${k} M${i + 1}`);
});

test('base scenario headline matches the sheet: peak deficit 12M / 18M', () => {
  const r = runPlan(sheetHorizon());
  close(peakDeficitWithin(r, 12) / 1e7 * 1e6, check.peakDeficit12Cr * 1e6, 'peak deficit 12M (₹ Cr × 1e6)');
  close(peakDeficitWithin(r, 18) / 1e7 * 1e6, check.peakDeficit18Cr * 1e6, 'peak deficit 18M (₹ Cr × 1e6)');
});

test('extension: zero growth repeats the last plan year; growth scales revenue (units mode)', () => {
  const p = basePlan();
  p.d2c.mode = 'units';
  for (const fy of Object.keys(p.levers.growth)) for (const ch of ['A', 'D', 'F', 'G', 'P'] as const) p.levers.growth[fy][ch] = 0;
  const flat = runPlan(p);
  // Apr-28 (M19) = Apr-27 (M7) units at zero growth
  assert.equal(Math.round(flat.months[18].units), Math.round(flat.months[6].units));
  p.levers.growth.FY29 = { A: 1, D: 1, F: 1, G: 1, P: 1 };
  const grown = runPlan(p);
  close(grown.months[18].grossRevenue, flat.months[18].grossRevenue * 2, 'Apr-28 revenue at +100%');
  assert.equal(grown.months.length, 54);
});

test('one-time launch costs do not repeat after the base; peak COGS rate does', () => {
  const p = basePlan();
  const r = runPlan(p);
  const shoot = p.lines.find((l) => l.name === 'hPulse - Launch Shoot')!;
  assert.equal(r.months.slice(18).reduce((a, m) => a + m.lines[shoot.id], 0), 0);
  const peak = p.lines.find((l) => l.name === 'COGS - Peak Y2')!;
  const dec28 = r.months[26]; // M27
  assert.equal(dec28.label, 'Dec-28');
  close(dec28.lines[peak.id], peak.amount * dec28.grossRevenue, 'Dec-28 peak COGS');
});

test('topicals switched on add revenue and carry their own COGS %', () => {
  const p = basePlan();
  const off = runPlan(p);
  p.products[0].on = true; p.products[0].launchUnits = 1000;
  const on = runPlan(p);
  const feb27 = 4; // M5
  close(on.months[feb27].grossRevenue - off.months[feb27].grossRevenue, 1000 * 450, 'cream launch-month revenue');
  close(on.months[feb27].cogs - off.months[feb27].cogs, 1000 * 450 * 0.3 + 1000 * 450 * 0.006 + 1000 * 450 * (0.005 + 0.0012 + 0.006), 'cream COGS (own 30% + %-of-revenue factory lines)');
});

test('D2C cohorts: base months keep the sheet D2C revenue; repeats lift later years', () => {
  const p = basePlan();
  const coh = runPlan(p);
  p.d2c.mode = 'units';
  const uni = runPlan(p);
  for (let i = 0; i < 18; i++) close(coh.months[i].revenueByChannel.D, uni.months[i].revenueByChannel.D, `D2C M${i + 1}`);
  const fy31 = (r: typeof coh) => r.years.find((y) => y.fy === 'FY31')!;
  assert.ok(fy31(coh).revenueByChannel.D > fy31(uni).revenueByChannel.D, 'repeats add D2C revenue after the base');
  assert.ok(fy31(coh).d2cRepeatOrders > 0 && fy31(coh).d2cNewCustomers > 0);
});

test('D2C cohorts: a bigger repeat boost raises revenue, and new-buyer ads do not scale with repeats', () => {
  const p = basePlan();
  const a = runPlan(p);
  p.d2c.repeatBoost = 2;
  const b = runPlan(p);
  const fy = (r: typeof a) => r.years.find((y) => y.fy === 'FY30')!;
  assert.ok(fy(b).d2cRepeatRevenue > fy(a).d2cRepeatRevenue * 1.5);
  // in the base, new buyers are back-solved, so more repeats mean fewer new buyers needed
  assert.ok(b.years[1].d2cNewCustomers < a.years[1].d2cNewCustomers);
});

test('history fit recovers known repeat rates from synthetic cohorts', async () => {
  const { fitD2C } = await import('../../client/src/data/planning/history.ts');
  const months = Array.from({ length: 24 }, (_, i) => `${2024 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`);
  const newC = months.map(() => 1000);
  const truth = { same: 0.06, next: 0.02, monthly: 0.005 };
  const cohorts = months.map((m, j) => ({
    month: m, size: newC[j],
    repeats: months.slice(j).map((_, k) => newC[j] * (k === 0 ? truth.same : k === 1 ? truth.next : k <= 11 ? truth.monthly : 0.003)),
  }));
  const history = months.map((m, i) => ({ month: m, newCustomers: newC[i], repeatOrders: 0, newSales: newC[i] * 1500, repeatSales: 0 }));
  const f = fitD2C(history, cohorts); // flat seasonality (new buyers have no season here) → rates come back exactly
  assert.ok(Math.abs(f.sameMonth - truth.same) < 1e-9 && Math.abs(f.nextMonth - truth.next) < 1e-9 && Math.abs(f.monthly - truth.monthly) < 1e-9);
  assert.ok(Math.abs(f.yearly - 0.003) < 1e-9);
});

test('Shopify history: first order = new buyer, later orders = repeats in the right cohort; junk skipped', async () => {
  const { aggregateOrders } = await import('../src/planning/shopifyHistory.ts');
  const o = (id: number, cust: number | null, at: string, v: number, extra: object = {}) => ({ id, customer: cust == null ? null : { id: cust }, created_at: at + 'T10:00:00+05:30', total_price: String(v), ...extra });
  const h = aggregateOrders([
    o(1, 7, '2025-11-03', 1500), o(2, 7, '2025-11-20', 1700), o(3, 7, '2026-01-05', 1600),
    o(4, 8, '2025-12-01', 2000), o(5, null, '2025-12-02', 1200), o(6, 9, '2025-12-03', 999, { cancelled_at: '2025-12-04' }),
    o(7, 10, '2026-01-09', 18_00_00_000), o(8, 8, '2026-02-01', 2100),
  ], '2026-02-15');
  assert.deepEqual(h.history.map((x) => [x.month, x.newCustomers, x.repeatOrders]), [['2025-11', 1, 1], ['2025-12', 2, 0], ['2026-01', 0, 1]]);
  assert.equal(h.history[0].newSales, 1500);
  const nov = h.cohorts.find((c) => c.month === '2025-11')!;
  assert.deepEqual([nov.size, ...nov.repeats], [1, 1, 0, 1]);
  assert.deepEqual(h.skipped, { cancelled: 1, test: 0, outlier: 1 });
  assert.equal(JSON.stringify(h).includes('"7"') || JSON.stringify(h).includes('c7'), false, 'no customer ids leave the aggregate');
});
