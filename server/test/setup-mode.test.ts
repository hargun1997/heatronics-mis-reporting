// Setup → Starting point (docs/planning/ONE-SETUP.md §2.1): the plan basis as ONE choice over fx.sheetParity + growth.on.
// Sheet mode must still give the sheet's own numbers (base-plan-check.json, as planning.test.ts); plan mode applies the
// founder decisions and switches the growth layer on; the summary line is short and says where the plan starts from.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlan, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan, setSheetParity } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr, emptyGrowth } from '../../client/src/data/planning/growth.ts';
import { growthSwitchedOff, openingSourceText, planMode, setPlanMode, summary } from '../../client/src/data/planning/setup/mode.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const check = JSON.parse(fs.readFileSync(path.join(here, '../../client/src/data/planning/base-plan-check.json'), 'utf8'));

const close = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) <= Math.max(2, Math.abs(b) * 1e-6), `${what}: got ${a.toFixed(0)}, sheet ${b.toFixed(0)}`);

/** A plan saved before the founder decisions existed: no fx, no growth. */
const legacyPlan = (): Plan => { const p = basePlan(); delete p.fx; delete p.growth; return p; };
/** The example growth plan, built once (its solvers take a while). */
const BIG = build500Cr(basePlan());

test('planMode: Base is "plan"; parity on or no fx is "sheet"', () => {
  assert.equal(planMode(basePlan()), 'plan');
  const parity = basePlan(); setSheetParity(parity, true);
  assert.equal(planMode(parity), 'sheet');
  assert.equal(planMode(legacyPlan()), 'sheet');
});

test('setPlanMode(sheet): M1–M18 closing cash equals the sheet (base-plan-check.json) at the 18-month horizon', () => {
  const p = structuredClone(BIG); // products, hires, rounds and a path all present — parity must ignore every one of them
  setPlanMode(p, 'sheet');
  p.levers.horizon = 18;
  assert.equal(planMode(p), 'sheet');
  const r = runPlan(p);
  for (let i = 0; i < 18; i++) {
    close(r.months[i].closingCash, check.closingCash[i], `closingCash M${i + 1}`);
    close(r.months[i].netRevenue, check.netRevenue[i], `netRevenue M${i + 1}`);
  }
  // nothing was thrown away: the growth layer and its products are still there for "My plan"
  assert.ok(p.growth && p.growth.rounds.length > 0);
  assert.ok(p.products.some((x) => x.growthLine));
});

test('setPlanMode(plan) on a plan with fx undefined applies the founder decisions and sets growth.on', () => {
  const p = legacyPlan();
  setPlanMode(p, 'plan');
  assert.ok(p.fx, 'founder decisions applied');
  assert.equal(p.fx!.sheetParity, false);
  assert.equal(p.levers.taxMode, 'fy');
  assert.ok(p.growth, 'growth layer created');
  assert.equal(p.growth!.on, true);
  assert.ok(p.groups.some((g) => g.name === 'Retail Stores'), 'growth cost groups ensured');
  assert.equal(planMode(p), 'plan');
});

test('setPlanMode(plan) switches an existing, switched-off growth layer on and keeps its contents', () => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: false, targetArr: 123e7 };
  setSheetParity(p, true);
  assert.equal(growthSwitchedOff(p), false, 'not the legacy case while parity is on');
  setPlanMode(p, 'plan');
  assert.equal(p.growth.on, true);
  assert.equal(p.growth.targetArr, 123e7);
});

test('setPlanMode(sheet) keeps fx (parity flag only) and does not create a growth layer', () => {
  const p = legacyPlan();
  setPlanMode(p, 'sheet');
  assert.ok(p.fx);
  assert.equal(p.fx!.sheetParity, true);
  assert.equal(p.growth, undefined);
  // round trip: sheet → plan → sheet leaves M1–M18 at the sheet again
  setPlanMode(p, 'plan');
  setPlanMode(p, 'sheet');
  p.levers.horizon = 18;
  const r = runPlan(p);
  for (let i = 0; i < 18; i++) close(r.months[i].closingCash, check.closingCash[i], `closingCash M${i + 1} after round trip`);
});

test('growthSwitchedOff: only the legacy "plan mode but growth ticked off" case', () => {
  assert.equal(growthSwitchedOff(basePlan()), false, 'no growth layer at all');
  const off = basePlan(); off.growth = { ...emptyGrowth(), on: false };
  assert.equal(growthSwitchedOff(off), true);
  const on = basePlan(); on.growth = { ...emptyGrowth(), on: true };
  assert.equal(growthSwitchedOff(on), false);
});

test('summary: sheet parity, then my plan with where the opening came from and the H1 actuals', () => {
  const sheet = basePlan(); setSheetParity(sheet, true);
  assert.equal(summary(sheet), 'Sheet parity · opening = sheet values');
  assert.equal(summary(legacyPlan()), 'Sheet parity · opening = sheet values');

  const p = basePlan();
  p.levers.fy27H1Revenue = 4.2e7;
  assert.equal(p.fx!.opening.source, 'sheet');
  assert.equal(summary(p), 'My plan · opening = sheet values · Apr–Sep ’26 ₹4.2 Cr');

  p.fx!.opening.source = 'tally'; p.fx!.opening.asOf = '2026-09-30';
  assert.equal(summary(p), 'My plan · opening from Tally (2026-09-30) · Apr–Sep ’26 ₹4.2 Cr');

  p.fx!.opening.source = 'manual';
  assert.equal(summary(p), 'My plan · opening typed in · Apr–Sep ’26 ₹4.2 Cr');

  for (const plan of [sheet, p, BIG]) {
    const s = summary(plan);
    assert.ok(s.length > 0 && s.length <= 90, `summary ≤ 90 chars: "${s}" (${s.length})`);
  }
});

test('openingSourceText', () => {
  assert.equal(openingSourceText(undefined), 'sheet values');
  const o = basePlan().fx!.opening;
  assert.equal(openingSourceText(o), 'sheet values');
  assert.equal(openingSourceText({ ...o, source: 'manual' }), 'typed in');
  assert.equal(openingSourceText({ ...o, source: 'tally', asOf: '2026-09-30' }), 'from Tally (2026-09-30)');
  assert.equal(openingSourceText({ ...o, source: 'tally', asOf: null }), 'from Tally');
});
