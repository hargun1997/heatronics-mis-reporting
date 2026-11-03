// Growth builder (client/src/data/planning/growth.ts + the engine hooks): off = the plan as before,
// each block books where it should, the solver reaches the target and the ₹500 Cr scenario holds together.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan, setSheetParity } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr, dilution, emptyGrowth, ensureGrowthGroups, fundTheGap, runRateArr, solveForTarget, growthCategories } from '../../client/src/data/planning/growth.ts';

const CR = 1e7;
const withGrowth = (fn: (p: Plan) => void = () => {}) => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  fn(p);
  return p;
};
const pick = (p: Plan) => runPlan(p).months.map((m) => [m.netRevenue, m.ebitda, m.closingCash]);

test('growth: absent, switched off or empty-and-on leaves every month unchanged', () => {
  const base = pick(basePlan());
  const off = basePlan(); off.growth = { ...emptyGrowth(), on: false };
  assert.deepEqual(pick(off), base);
  const empty = withGrowth((p) => { p.growth!.baseCapacity = 0; });
  assert.deepEqual(pick(empty), base);
});

test('growth: never applied in sheet-parity mode', () => {
  const a = basePlan(); setSheetParity(a, true);
  const b = withGrowth((p) => { p.growth!.hires.push({ id: 'h', role: 'x', dept: 'corporate', count: 5, month: 3, end: null, monthlyCtc: 1e5 }); });
  setSheetParity(b, true);
  assert.deepEqual(pick(b), pick(a));
});

test('growth: a hire books salary, benefits and a one-off recruitment cost from its month', () => {
  const p = withGrowth((x) => { x.growth!.hires.push({ id: 'h', role: 'Marketers', dept: 'marketing', count: 10, month: 5, end: null, monthlyCtc: 1e5 }); });
  const b = runPlan(basePlan()).months, g = runPlan(p).months;
  const d = (m: number, grp: string) => (g[m - 1].groups[grp] ?? 0) - (b[m - 1].groups[grp] ?? 0);
  assert.equal(d(4, 'Corporate Salaries'), 0);
  assert.equal(d(5, 'Corporate Salaries'), 10e5);
  assert.ok(Math.abs(d(5, 'Employee Benefits & Statutory') - 10e5 * 0.12) < 1e-6);
  assert.ok(Math.abs(d(5, 'Recruitment & Training') - 10e5 * 12 * 0.08) < 1e-6);
  assert.equal(d(6, 'Recruitment & Training'), 0);
  assert.ok(Math.abs(d(17, 'Corporate Salaries') - 10e5 * 1.1) < 1e-6, 'increment after 12 months');
  assert.equal(g[5].growthHeadcount, 10);
  const f = withGrowth((x) => { x.growth!.hires.push({ id: 'f', role: 'Operators', dept: 'factory', count: 4, month: 2, end: 3, monthlyCtc: 25_000 }); });
  const gf = runPlan(f).months;
  assert.equal((gf[2].groups['Factory Payroll'] ?? 0) - (b[2].groups['Factory Payroll'] ?? 0), 1e5);
  assert.equal((gf[3].groups['Factory Payroll'] ?? 0) - (b[3].groups['Factory Payroll'] ?? 0), 0, 'ends after its end month');
});

test('growth: a round adds equity to cash in its month and its fee to fundraise costs', () => {
  const p = withGrowth((x) => { x.growth!.rounds.push({ id: 'r', name: 'Series A', on: true, month: 8, amount: 30 * CR, preMoney: 90 * CR, feePct: 0.03, confirmed: false }); });
  const b = runPlan(basePlan()), g = runPlan(p);
  assert.equal(g.months[7].roundEquity, 30 * CR);
  assert.ok(Math.abs(g.months[7].fundraiseCosts - b.months[7].fundraiseCosts - 0.9 * CR) < 1);
  assert.equal(g.roundsEquity, 30 * CR);
  const d = dilution(p);
  const a = d.find((x) => x.name === 'Series A')!;
  assert.ok(Math.abs(a.sold - 0.25) < 1e-9);
});

test('growth: stores ramp to mature revenue and carry rent, staff and fit-out capex', () => {
  const p = withGrowth((x) => {
    x.growth!.stores = { ...x.growth!.stores, on: true, openings: [{ month: 3, count: 2 }], matureRevenue: 6e5, rampMonths: 3, capexPerStore: 15e5, rentPerStore: 1e5, otherOpexPerStore: 0, staffPerStore: 2, staffCtc: 30_000 };
  });
  const g = runPlan(p).months;
  assert.equal(g[1].storeRevenue, 0);
  assert.ok(Math.abs(g[2].storeRevenue - 2 * 6e5 / 3) < 1e-6);
  assert.ok(Math.abs(g[4].storeRevenue - 2 * 6e5) < 1e-6);
  assert.equal(g[2].groups['Store Fit-out'], 30e5);
  assert.ok(g[2].capex >= 30e5);
  assert.ok(Math.abs(g[2].groups['Retail Stores'] - (2e5 + 2 * 2 * 30_000 * 1.12)) < 1e-6);
  assert.equal(g[2].stores, 2);
});

test('growth: capacity blocks add capex, come online after their lead time and set utilisation', () => {
  const p = withGrowth((x) => { x.growth!.baseCapacity = 10_000; x.growth!.capacity.push({ id: 'c', name: 'Line 2', on: true, month: 4, leadMonths: 2, unitsPerMonth: 5000, capex: 2 * CR, monthlyOpex: 1e5 }); });
  const g = runPlan(p).months, b = runPlan(basePlan()).months;
  assert.equal(g[3].groups['Plant & Machinery'] - (b[3].groups['Plant & Machinery'] ?? 0), 2 * CR);
  assert.equal(g[4].capacity, 10_000);
  assert.equal(g[5].capacity, 15_000);
  assert.ok(Math.abs(g[0].utilisation - g[0].inHouseUnits / 10_000) < 1e-12);
});

test('growth: new lines launch with their launch cost, tooling and extra marketing; contract-made ones skip capacity', () => {
  const cream = growthCategories().find((c) => c.id === 'p-cream')!;
  const massager = growthCategories().find((c) => c.id === 'g-massager')!;
  const p = withGrowth((x) => { x.products = x.products.filter((y) => y.id !== 'p-cream'); x.products.push(cream, massager); });
  const g = runPlan(p).months, b = runPlan(basePlan()).months;
  const m = cream.launchMonth;
  assert.ok(g[m - 1].revenueBySku['p-cream'] > 0);
  assert.ok(Math.abs((g[m - 1].groups['Product Development & Launch'] ?? 0) - (b[m - 1].groups['Product Development & Launch'] ?? 0) - cream.launchCost!) < 1);
  const mm = massager.launchMonth;
  assert.ok(Math.abs((g[mm - 1].groups['New Product Tooling & Moulds'] ?? 0) - (b[mm - 1].groups['New Product Tooling & Moulds'] ?? 0) - massager.launchCapex!) < 1);
  // in-house units = core SKUs + the massager, not the cream
  const core = Object.entries(g[mm + 2].unitsBySku).filter(([k]) => !k.startsWith('p-') && !k.startsWith('g-')).reduce((a, [, v]) => a + v, 0);
  const lotionOil = (g[mm + 2].unitsBySku['p-lotion'] ?? 0) + (g[mm + 2].unitsBySku['p-oil'] ?? 0); // base placeholders: no category → in-house
  assert.ok(Math.abs(g[mm + 2].inHouseUnits - core - lotionOil - g[mm + 2].unitsBySku['g-massager']) < 1e-6);
});

test('growth: solver scales the new lines to the exit ARR target; fund-the-gap keeps cash above the buffer', () => {
  const p = withGrowth((x) => { x.products = [...x.products.filter((y) => !['p-cream', 'p-rollon'].includes(y.id)), ...growthCategories()]; });
  const s = solveForTarget(p, 300 * CR)!;
  assert.ok(s);
  assert.ok(Math.abs(runRateArr(runPlan(s.plan)) - 300 * CR) / (300 * CR) < 0.001, 'within 0.1% of the target');
  const f = fundTheGap(s.plan, 5 * CR);
  const r = runPlan(f);
  const earliest = f.fx!.seed.month + 3;
  assert.ok(r.months.filter((m) => m.m >= earliest).every((m) => m.closingCash >= 5 * CR - 1), 'cash ≥ buffer after the first possible round');
  assert.ok(f.growth!.rounds.every((x) => x.month >= earliest));
});

test('growth: the ₹500 Cr scenario reaches ₹500 Cr exit ARR with its rounds after the seed', () => {
  const p = build500Cr(basePlan());
  const r = runPlan(p);
  assert.ok(Math.abs(runRateArr(r) - 500 * CR) / (500 * CR) < 0.001);
  assert.ok(p.growth!.rounds.length >= 1);
  assert.ok(p.products.filter((x) => x.growthLine).every((x) => x.placeholder), 'every new line is flagged a placeholder');
  assert.ok(r.minClosingCash > -5 * CR, 'only the pre-round overdraft dip is negative');
});
