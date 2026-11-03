// Pure helpers for the Funding setup section (docs/planning/ONE-SETUP.md §2.8): the collapsed summary line and
// "Add these rounds as a starting point" (benchmark rounds from FUNDING_DEFAULTS). No React, no runPlan: the
// component passes in the result it already has. Tests: server/test/setup-funding.test.ts.

import { monthLabel, type FundRound, type Plan, type PlanResult } from '../engine';
import { defaultFunding, runRateArr } from '../growth';
import { FUNDING_DEFAULTS, type FundingDefaults } from './fundingDefaults';

const CR = 1e7;
/** Rounds added from the benchmarks carry this id prefix; `fundTheGap` keeps them (it only replaces `auto-` ids). */
export const BENCH_PREFIX = 'bench-';
/** Pre-money is never sized below this (the same floor `fundTheGap` uses). */
export const MIN_PRE_MONEY = 50 * CR;

const crs = (v: number, d = 0) => (v / CR).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/** The month the seed closes (1 when the seed is off / not decided) — the anchor for every benchmark round. */
export function seedMonth(plan: Plan): number {
  return plan.fx?.seed.on ? plan.fx.seed.month : 1;
}

/** Collapsed line: `Seed ₹8 Cr Jan-27 · venture debt ₹2.5 Cr · 3 rounds (₹490 Cr, 1 agreed) · OD on`. */
export function summary(plan: Plan): string {
  const fx = plan.fx;
  const seed = fx?.seed.on ? `Seed ₹${crs(fx.seed.amount, fx.seed.amount % CR ? 1 : 0)} Cr ${monthLabel(plan.startMonth, fx.seed.month)}` : 'No seed';
  const vd = fx?.ventureDebt.on ? `₹${crs(fx.ventureDebt.amount, fx.ventureDebt.amount % CR ? 1 : 0)} Cr` : 'off';
  const rounds = (plan.growth?.rounds ?? []).filter((r) => r.on);
  const total = rounds.reduce((a, r) => a + r.amount, 0);
  const agreed = rounds.filter((r) => r.confirmed).length;
  const rs = `${rounds.length} round${rounds.length === 1 ? '' : 's'}${rounds.length ? ` (₹${crs(total)} Cr, ${agreed} agreed)` : ''}`;
  const od = fx?.overdraft.on ? 'on' : 'off';
  return `${seed} · venture debt ${vd} · ${rs} · OD ${od}`;
}

export interface BenchRounds {
  /** one round per benchmark default, in time order */
  rounds: FundRound[];
  /** the Series A typical multiple when the user has not changed `funding.preMoneyMultiple` from the default, else null */
  preMoneyMultiple: number | null;
}

/**
 * The benchmark rounds for this plan: month = seed month + `timing.afterSeedMonths` (clamped to the horizon), amount =
 * `sizeCr.typical`, pre-money = `preMoneyArrMultiple.typical` × the run-rate ARR at that month (at least ₹50 Cr, whole crore),
 * fee = `defaults.feePct`, `confirmed: false`, id `bench-<n>`. Also says whether `growth.funding.preMoneyMultiple` should move
 * to the Series A multiple (only when it still equals `defaultFunding()`'s).
 */
export function roundsFromDefaults(plan: Plan, result: PlanResult, defaults: FundingDefaults = FUNDING_DEFAULTS): BenchRounds {
  const seed = seedMonth(plan);
  const horizon = Math.max(1, result.months.length);
  const rounds: FundRound[] = defaults.rounds.map((d, i) => {
    const month = Math.min(horizon, Math.max(1, seed + d.timing.afterSeedMonths));
    const pre = Math.max(MIN_PRE_MONEY, d.preMoneyArrMultiple.typical * runRateArr(result, month));
    return {
      id: `${BENCH_PREFIX}${i + 1}`,
      name: d.name,
      on: true,
      month,
      amount: d.sizeCr.typical * CR,
      preMoney: Math.round(pre / CR) * CR,
      feePct: defaults.feePct,
      confirmed: false,
    };
  });
  rounds.sort((a, b) => a.month - b.month);
  const current = plan.growth?.funding?.preMoneyMultiple ?? defaultFunding().preMoneyMultiple;
  const seriesA = defaults.rounds[0]?.preMoneyArrMultiple.typical ?? null;
  const preMoneyMultiple = current === defaultFunding().preMoneyMultiple && seriesA != null ? seriesA : null;
  return { rounds, preMoneyMultiple };
}

/**
 * Put the benchmark rounds into a rounds list: unconfirmed `bench-` rounds from an earlier click are replaced, everything else
 * (the user's own rounds, `auto-` rounds, agreed benchmark rounds) is kept; a new round whose id an agreed one still holds is
 * skipped. Sorted by month.
 */
export function mergeBenchRounds(existing: FundRound[], bench: FundRound[]): FundRound[] {
  const kept = existing.filter((r) => !r.id.startsWith(BENCH_PREFIX) || r.confirmed);
  const taken = new Set(kept.map((r) => r.id));
  return [...kept, ...bench.filter((r) => !taken.has(r.id))].sort((a, b) => a.month - b.month);
}
