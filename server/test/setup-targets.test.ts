// Setup → Targets (client/src/data/planning/setup/targets.ts): the target type is derived from the plan, switching it seeds
// or drops the path, "Fit the plan to these targets" meets the revenue path / exit ARR and sizes the rounds, sheet parity
// fits nothing, and the collapsed summary reads right.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan, setSheetParity } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr, emptyGrowth, ensureGrowthGroups, growthCategories, runRateArr } from '../../client/src/data/planning/growth.ts';
import { fitToTargets, setTargetMode, summary, targetMode } from '../../client/src/data/planning/setup/targets.ts';

const CR = 1e7;
/** build500Cr solves the path (≈ 15 s): built once, cloned per test. */
const built500 = (() => { let c: Plan | null = null; return () => { c ??= build500Cr(basePlan()); return structuredClone(c); }; })();
const withGrowth = (fn: (p: Plan) => void = () => {}) => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  fn(p);
  return p;
};
/** The growth-test plan: the built-in lines on, no path → exit-ARR mode. */
const arrPlan = (target: number) => withGrowth((x) => {
  x.products = [...x.products.filter((y) => !['p-cream', 'p-rollon'].includes(y.id)), ...growthCategories()];
  x.growth!.targetArr = target;
});

test('targets: the mode is derived — a path with FYs = path, else exit ARR', () => {
  assert.equal(targetMode(basePlan()), 'arr', 'no growth layer');
  assert.equal(targetMode(withGrowth()), 'arr', 'growth without a path');
  assert.equal(targetMode(withGrowth((p) => { p.growth!.path = {}; })), 'arr', 'an empty path is no path');
  assert.equal(targetMode(built500()), 'path');
});

test('targets: switching to Revenue by year seeds every full FY from the plan; Exit ARR drops path and push', () => {
  const p = arrPlan(300 * CR);
  const r = runPlan(p);
  setTargetMode(p, 'path', r);
  assert.equal(targetMode(p), 'path');
  const full = r.years.filter((y) => y.months === 12 && Math.round(y.revenue / CR) > 0);
  assert.deepEqual(Object.keys(p.growth!.path!).sort(), full.map((y) => y.fy).sort());
  for (const y of full) assert.equal(p.growth!.path![y.fy], Math.round(y.revenue / CR) * CR, `${y.fy} seeded in whole ₹ Cr`);
  assert.ok(!r.years.some((y) => y.months < 12 && y.fy in p.growth!.path!), 'a partial FY is not seeded');
  p.growth!.push = { FY29: 1.5 };
  setTargetMode(p, 'arr', r);
  assert.equal(targetMode(p), 'arr');
  assert.equal(p.growth!.path, undefined);
  assert.equal(p.growth!.push, undefined);
  // a plan with no growth layer gets one (on) when a mode is chosen
  const bare = basePlan();
  setTargetMode(bare, 'path', runPlan(bare));
  assert.ok(bare.growth?.on);
});

test('targets: fit in path mode meets the ₹30 → 100 → 250 → 500 Cr path within 0.5 % and sizes rounds after the seed', () => {
  const built = built500();
  const before = structuredClone(built);
  const { plan: p, notes } = fitToTargets(built);
  assert.deepEqual(built, before, 'the input plan is never mutated');
  assert.equal(targetMode(p), 'path');
  assert.deepEqual(notes, [], `no FY missed: ${notes.join(' | ')}`);
  const r = runPlan(p);
  for (const [fy, t] of [['FY28', 30], ['FY29', 100], ['FY30', 250], ['FY31', 500]] as const) {
    const y = r.years.find((x) => x.fy === fy)!;
    assert.ok(Math.abs(y.revenue - t * CR) / (t * CR) < 0.005, `${fy}: ${(y.revenue / CR).toFixed(1)} Cr vs ${t}`);
  }
  assert.ok(p.growth!.rounds.length >= 1);
  assert.ok(p.growth!.rounds.every((x) => x.month >= p.fx!.seed.month + 3), 'every round ≥ seed month + 3');
  assert.ok(p.growth!.rounds.every((x) => !x.confirmed && x.id.startsWith('auto-')), 'sized rounds are unconfirmed placeholders');
  assert.ok(Object.keys(p.growth!.push ?? {}).length >= 4, 'push set per FY');
  assert.ok(r.minClosingCash > -5 * CR, 'only the pre-round overdraft dip is negative');
});

test('targets: fit in exit-ARR mode hits targetArr within 0.1 % and keeps cash above the buffer after the first round', () => {
  const p = arrPlan(300 * CR);
  const before = structuredClone(p);
  const { plan: f, notes } = fitToTargets(p);
  assert.deepEqual(p, before, 'input untouched');
  assert.deepEqual(notes, []);
  const r = runPlan(f);
  assert.ok(Math.abs(runRateArr(r) - 300 * CR) / (300 * CR) < 0.001, `within 0.1 %: ${(runRateArr(r) / CR).toFixed(2)} Cr`);
  const earliest = f.fx!.seed.month + 3;
  const buffer = f.growth!.funding?.buffer ?? 10 * CR;
  assert.ok(r.months.filter((m) => m.m >= earliest).every((m) => m.closingCash >= buffer - 1), 'cash ≥ buffer after the first possible round');
  assert.ok(f.growth!.rounds.every((x) => x.month >= earliest));
});

test('targets: exit-ARR mode with no growth line on fits nothing and says so (rounds still sized)', () => {
  const p = withGrowth((x) => { for (const y of x.products) if (y.growthLine) y.on = false; });
  const { plan: f, notes } = fitToTargets(p);
  assert.deepEqual(notes, ['No growth line is on, or the lines cannot reach the exit ARR.']);
  assert.deepEqual(f.products, p.products);
});

test('targets: sheet parity (or a plan without fx / growth) returns the plan unchanged with the note', () => {
  const a = built500(); setSheetParity(a, true);
  const ra = fitToTargets(a);
  assert.deepEqual(ra.plan, a);
  assert.deepEqual(ra.notes, ['Sheet parity is on: nothing fitted.']);
  const b = built500(); delete b.fx; // saved before the founder decisions = sheet mode
  const rb = fitToTargets(b);
  assert.deepEqual(rb.plan, b);
  assert.deepEqual(rb.notes, ['Sheet parity is on: nothing fitted.']);
  const c = basePlan(); // My plan, no growth layer at all
  assert.deepEqual(fitToTargets(c).plan, c);
  const d = built500(); d.growth!.on = false; // legacy scenario with the layer switched off
  const rd = fitToTargets(d);
  assert.deepEqual(rd.plan, d);
  assert.equal(rd.notes.length, 1);
  assert.match(rd.notes[0], /switched off/);
});

test('targets: summary strings', () => {
  assert.equal(summary(basePlan()), 'No targets');
  assert.equal(summary(withGrowth()), 'Exit ARR ₹500 Cr target');
  assert.equal(summary(withGrowth((p) => { p.growth!.targetArr = 1250 * CR; })), 'Exit ARR ₹1,250 Cr target');
  const built = built500();
  assert.equal(summary(built), 'Revenue by year: FY28 ₹30 Cr → FY31 ₹500 Cr · fitted');
  const unfitted = withGrowth((p) => { p.growth!.path = { FY30: 250 * CR, FY28: 30 * CR }; });
  assert.equal(summary(unfitted), 'Revenue by year: FY28 ₹30 Cr → FY30 ₹250 Cr · not fitted yet');
  const one = withGrowth((p) => { p.growth!.path = { FY29: 100 * CR }; });
  assert.equal(summary(one), 'Revenue by year: FY29 ₹100 Cr · not fitted yet');
  for (const s of [summary(basePlan()), summary(built), summary(unfitted)]) assert.ok(s.length > 0 && s.length <= 90, s);
});
