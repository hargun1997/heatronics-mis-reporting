// Setup → Assumptions (client/src/data/planning/setup/assumptions.ts): the collapsed summary line and the pure
// lever / cash helpers the section's inputs call. No React, no network.

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan, setSheetParity } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr } from '../../client/src/data/planning/growth.ts';
import {
  CASH_FIELDS, EXT_FYS, addInterestStep, avgGrowth, effectiveSwitches, planMode, setAllGrowth, setChannelGrowth, signedPct, summary,
} from '../../client/src/data/planning/setup/assumptions.ts';

test('assumptions: summary of Base reads the levers and the effective switches', () => {
  const p = basePlan();
  assert.equal(summary(p), 'FY29 +60% · FY30 +45% · FY31 +35% · price +0%/yr · inflation 6% · ex-GST P&L · tax by FY');
  assert.ok(summary(p).length <= 90);
});

test('assumptions: summary is non-empty and short for Base and the ₹500 Cr plan', () => {
  for (const p of [basePlan(), build500Cr(basePlan())]) {
    const s = summary(p);
    assert.ok(s.length > 0 && s.length <= 90, s);
    for (const fy of EXT_FYS) assert.ok(s.includes(fy));
  }
});

test('assumptions: sheet parity shows the sheet’s treatment (GMV P&L, tax monthly) whatever the stored switches say', () => {
  const p = basePlan();
  assert.equal(planMode(p), 'plan');
  assert.deepEqual(effectiveSwitches(p), { revenueExGst: true, taxByFy: true });
  setSheetParity(p, true);
  assert.equal(planMode(p), 'sheet');
  assert.deepEqual(effectiveSwitches(p), { revenueExGst: false, taxByFy: false });
  assert.ok(summary(p).endsWith('GMV P&L · tax as sheet'));
  // a plan saved before the founder decisions (no fx) is the sheet too
  const old = basePlan(); delete (old as Partial<Plan>).fx;
  assert.equal(planMode(old), 'sheet');
  assert.deepEqual(effectiveSwitches(old), { revenueExGst: false, taxByFy: false });
});

test('assumptions: the headline lever sets every channel; a channel edit moves the average', () => {
  const p = basePlan();
  setAllGrowth(p, 'FY30', 0.8);
  for (const c of CHANNELS) assert.equal(p.levers.growth.FY30[c], 0.8);
  assert.equal(avgGrowth(p, 'FY30'), 0.8);
  setChannelGrowth(p, 'FY30', 'A', 0.3);
  assert.ok(Math.abs(avgGrowth(p, 'FY30') - (0.8 * 4 + 0.3) / 5) < 1e-12);
  // a FY the plan has no row for yet
  setChannelGrowth(p, 'FY32', 'D', 0.2);
  assert.deepEqual(p.levers.growth.FY32, { A: 0, D: 0.2, F: 0, G: 0, P: 0 });
  setAllGrowth(p, 'FY33', -0.1);
  assert.equal(avgGrowth(p, 'FY33'), -0.1);
  assert.equal(avgGrowth(p, 'FY99'), 0);
});

test('assumptions: signed percent', () => {
  assert.equal(signedPct(0.6), '+60%');
  assert.equal(signedPct(0), '+0%');
  assert.equal(signedPct(-0.05), '−5%');
  assert.equal(signedPct(0.0349), '+3%');
});

test('assumptions: the cash fields are every sheet input except the opening values and GST rates, each present on Base', () => {
  const p = basePlan();
  const keys = CASH_FIELDS.map((f) => f.k);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) {
    assert.ok(!k.startsWith('opening'), k);
    assert.equal(typeof p.cash[k], 'number', k);
  }
  for (const k of ['inventoryDays', 'gmStandard', 'receivableDays', 'payableDays', 'refundLagMonths', 'gstWriteOffPct', 'interestRate', 'taxRate', 'contingencyPct']) assert.ok(keys.includes(k as (typeof keys)[number]), k);
  for (const f of CASH_FIELDS) assert.ok(f.label.length > 0 && (f.unit === 'pct' || f.unit === 'num'));
});

test('assumptions: a new interest step follows the last one at its rate, else M13 at the start rate', () => {
  const p = basePlan();
  assert.deepEqual(p.cash.interestSteps, [{ month: 9, rate: 0.1235 }]);
  addInterestStep(p);
  assert.deepEqual(p.cash.interestSteps, [{ month: 9, rate: 0.1235 }, { month: 10, rate: 0.1235 }]);
  const q = basePlan(); q.cash.interestSteps = [];
  addInterestStep(q);
  assert.deepEqual(q.cash.interestSteps, [{ month: 13, rate: q.cash.interestRate }]);
  const r = basePlan(); delete (r.cash as Partial<Plan['cash']>).interestSteps;
  addInterestStep(r);
  assert.equal(r.cash.interestSteps.length, 1);
});
