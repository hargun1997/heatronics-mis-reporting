// The 5-year business plan sent to investors (Nov 2026): yearly revenue by line, OEM stop, rounds; plus the year views used by the Excel download.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { runPlan } from '../../client/src/data/planning/engine.ts';
import { BUSINESS_PLAN_TARGETS, buildBusinessPlan, lineTable, SERIES_A_MONTH, SERIES_B_MONTH } from '../../client/src/data/planning/businessPlan.ts';
import { capitalByYear, linesByYear } from '../../client/src/data/planning/byYear.ts';

const CR = 1e7;
const P = buildBusinessPlan(basePlan());
const R = runPlan(P);
const T = lineTable(R);

test('business plan: new lines land on their yearly revenue (±1 %)', () => {
  for (const [k, t] of Object.entries(BUSINESS_PLAN_TARGETS)) for (const [fy, want] of Object.entries(t)) {
    const got = (T.find((y) => y.fy === fy)!.revenue as Record<string, number>)[k] / CR;
    assert.ok(Math.abs(got - want) / want < 0.01, `${k} ${fy}: ${got.toFixed(2)} vs ${want}`);
  }
});

test('business plan: OEM stops after Sep-27, devices grow every year, FY31 near ₹400 Cr', () => {
  for (const m of R.months.slice(12)) assert.equal(m.unitsBySku['bp-oem'] ?? 0, 0, `OEM in ${m.label}`);
  const dev = T.map((y) => y.revenue.devices);
  for (let i = 2; i < dev.length; i++) assert.ok(dev[i] > dev[i - 1], `devices ${T[i].fy}`);
  const fy31 = R.years.find((y) => y.fy === 'FY31')!.revenue / CR;
  assert.ok(fy31 > 370 && fy31 < 430, `FY31 ${fy31}`);
});

test('business plan: Series A ₹30 Cr Jan-28, Series B ₹100 Cr in FY30', () => {
  const rounds = P.growth!.rounds;
  assert.deepEqual(rounds.map((r) => [r.amount / CR, r.month]), [[30, SERIES_A_MONTH], [100, SERIES_B_MONTH]]);
  assert.equal(R.months[SERIES_A_MONTH - 1].label, 'Jan-28');
  assert.equal(R.months[SERIES_B_MONTH - 1].fy, 'FY30');
});

test('year views: line revenue adds up to P&L revenue; capital ties to closing cash', () => {
  const { fys, lines } = linesByYear(P, R);
  for (const fy of fys) {
    const sum = lines.reduce((a, l) => a + l.revenue[fy], 0);
    const pl = R.years.find((y) => y.fy === fy)!.revenue;
    assert.ok(Math.abs(sum - pl) < 1e3, `${fy} ${sum} vs ${pl}`);
  }
  const cap = capitalByYear(R);
  for (let i = 1; i < cap.length; i++) {
    const c = cap[i];
    const roll = cap[i - 1].closingCash + c.operatingCash + c.equity + c.debtNet;
    assert.ok(Math.abs(roll - c.closingCash) < 1e3, `${c.fy} cash roll`);
  }
});

test('a shorter download horizon re-runs the same plan to that month', () => {
  const r30 = runPlan({ ...P, levers: { ...P.levers, horizon: 30 } });
  assert.equal(r30.months.length, 30);
  assert.equal(r30.months.at(-1)!.label, 'Mar-29');
  for (let i = 0; i < 30; i++) assert.ok(Math.abs(r30.months[i].netRevenue - R.months[i].netRevenue) < 1, `month ${i + 1}`);
});

test('business plan: production capacity covers every month', () => {
  const over = R.months.filter((m) => m.utilisation > 1).map((m) => m.label);
  assert.deepEqual(over, []);
});
