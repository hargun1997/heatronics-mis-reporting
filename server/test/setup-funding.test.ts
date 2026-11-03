// Setup → Funding (client/src/data/planning/setup/funding.ts + fundingDefaults.ts): the benchmark rounds land after the
// seed with a sane pre-money, the summary line reads, and the converted defaults are ordered min ≤ typical ≤ max.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from '../../client/src/data/planning/engine.ts';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { defaultFunding, emptyGrowth, fundTheGap } from '../../client/src/data/planning/growth.ts';
import { mergeBenchRounds, roundsFromDefaults, seedMonth, summary } from '../../client/src/data/planning/setup/funding.ts';
import { FUNDING_DEFAULTS } from '../../client/src/data/planning/setup/fundingDefaults.ts';

const CR = 1e7;

test('funding defaults: three rounds, min ≤ typical ≤ max, timing cumulative from the seed', () => {
  const d = FUNDING_DEFAULTS;
  assert.equal(d.rounds.length, 3);
  assert.deepEqual(d.rounds.map((r) => r.name), ['Series A', 'Series B', 'Series C']);
  for (const r of d.rounds) {
    for (const k of ['sizeCr', 'preMoneyArrMultiple', 'dilutionPct'] as const) {
      const x = r[k];
      assert.ok(x.min <= x.typical && x.typical <= x.max, `${r.name} ${k}: ${x.min} ≤ ${x.typical} ≤ ${x.max}`);
    }
    assert.ok(r.timing.rule.length > 20 && r.milestones.length > 20);
    assert.ok(r.timing.arrAtLeastCr! > 0);
  }
  // afterSeedMonths = Σ monthsAfterPrevious (20, 20, 22)
  assert.deepEqual(d.rounds.map((r) => r.timing.afterSeedMonths), [20, 40, 62]);
  assert.deepEqual(d.rounds.map((r) => r.timing.afterPrevRoundMonths), [undefined, 20, 22]);
  assert.deepEqual(d.rounds.map((r) => r.sizeCr.typical), [40, 150, 300]);
  assert.deepEqual(d.rounds.map((r) => r.preMoneyArrMultiple.typical), [3.5, 4, 4.5]);
  // ARR expected at each round grows with the round
  const arr = d.rounds.map((r) => r.timing.arrAtLeastCr!);
  assert.ok(arr[0] < arr[1] && arr[1] < arr[2]);
  assert.equal(d.feePct, 0.03);
  assert.ok(d.ventureDebt.ratePct > 0 && d.ventureDebt.ratePct < 1, 'rate is a fraction');
  assert.ok(d.ventureDebt.feePct > 0 && d.ventureDebt.feePct < 0.1, 'fee is a fraction');
  assert.ok(d.notes.length > 100 && d.asOf === '2026-11');
});

test('roundsFromDefaults: one bench- round per default, after the seed, pre-money ≥ ₹50 Cr, unconfirmed', () => {
  const plan = basePlan();
  const r = runPlan(plan);
  const seed = seedMonth(plan);
  assert.ok(seed >= 1);
  const { rounds, preMoneyMultiple } = roundsFromDefaults(plan, r, FUNDING_DEFAULTS);
  assert.equal(rounds.length, FUNDING_DEFAULTS.rounds.length);
  assert.deepEqual(rounds.map((x) => x.id), ['bench-1', 'bench-2', 'bench-3']);
  assert.deepEqual(rounds.map((x) => x.name), ['Series A', 'Series B', 'Series C']);
  for (const x of rounds) {
    assert.ok(x.month > seed, `${x.name} in M${x.month} is after the seed (M${seed})`);
    assert.ok(x.month <= r.months.length, `${x.name} within the horizon`);
    assert.ok(x.preMoney >= 50 * CR, `${x.name} pre-money ≥ ₹50 Cr (${x.preMoney / CR})`);
    assert.equal(x.preMoney % CR, 0, 'whole crore');
    assert.equal(x.confirmed, false);
    assert.equal(x.on, true);
    assert.equal(x.feePct, FUNDING_DEFAULTS.feePct);
  }
  assert.deepEqual(rounds.map((x) => x.amount), [40 * CR, 150 * CR, 300 * CR]);
  // Series A and B land 20 / 40 months after the seed; C is beyond the 54-month horizon and sits in its last month
  assert.equal(rounds[0].month, seed + 20);
  assert.equal(rounds[1].month, seed + 40);
  assert.equal(rounds[2].month, Math.min(r.months.length, seed + 62));
  assert.ok(rounds[0].month <= rounds[1].month && rounds[1].month <= rounds[2].month);
  // the plan still has the default multiple → the Series A multiple is offered
  assert.equal(preMoneyMultiple, 3.5);
});

test('roundsFromDefaults: a user-set pre-money multiple is left alone; fundTheGap keeps bench- rounds', () => {
  const plan = basePlan();
  plan.growth = { ...emptyGrowth(), on: true, funding: { ...defaultFunding(), preMoneyMultiple: 6 } };
  const r = runPlan(plan);
  const b = roundsFromDefaults(plan, r);
  assert.equal(b.preMoneyMultiple, null);
  plan.growth.rounds = mergeBenchRounds(plan.growth.rounds, b.rounds);
  assert.equal(plan.growth.rounds.length, 3);
  const funded = fundTheGap(plan);
  const kept = funded.growth!.rounds.filter((x) => x.id.startsWith('bench-'));
  assert.equal(kept.length, 3, 'fundTheGap only replaces auto- rounds');
});

test('mergeBenchRounds: replaces unconfirmed bench- rounds, keeps agreed ones and the rest', () => {
  const plan = basePlan();
  const r = runPlan(plan);
  const { rounds } = roundsFromDefaults(plan, r);
  const own = { id: 'r1', name: 'Bridge', on: true, month: 10, amount: 5 * CR, preMoney: 60 * CR, feePct: 0.03, confirmed: false };
  const agreed = { ...rounds[0], confirmed: true, amount: 55 * CR };
  const merged = mergeBenchRounds([own, agreed, { ...rounds[1], amount: 1 * CR }], rounds);
  assert.deepEqual(merged.map((x) => x.id).sort(), ['bench-1', 'bench-2', 'bench-3', 'r1']);
  assert.equal(merged.find((x) => x.id === 'bench-1')!.amount, 55 * CR, 'the agreed round is kept as it is');
  assert.equal(merged.find((x) => x.id === 'bench-2')!.amount, 150 * CR, 'the unconfirmed one is replaced');
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i - 1].month <= merged[i].month, 'sorted by month');
});

test('summary: non-empty for the base plan and the ₹500 Cr plan, and reads the rounds', () => {
  const s0 = summary(basePlan());
  assert.ok(s0.length > 0 && s0.length <= 90, s0);
  assert.match(s0, /^Seed ₹8 Cr Jan-27 · venture debt ₹2\.5 Cr · 0 rounds · OD on$/);
  // a plan with rounds (as build500Cr / Fit leave them): on rounds are counted and summed, agreed ones counted
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true };
  const { rounds } = roundsFromDefaults(p, runPlan(p));
  p.growth.rounds = [...rounds, { id: 'r-off', name: 'Off', on: false, month: 30, amount: 999 * CR, preMoney: 1, feePct: 0, confirmed: true }];
  p.growth.rounds[0].confirmed = true;
  const s1 = summary(p);
  assert.ok(s1.length > 0 && s1.length <= 90, s1);
  assert.match(s1, /3 rounds \(₹490 Cr, 1 agreed\)/);
  // a plan saved before the founder decisions
  const legacy = basePlan(); delete legacy.fx;
  assert.match(summary(legacy), /^No seed · venture debt off · 0 rounds · OD off$/);
});
