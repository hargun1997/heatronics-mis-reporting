// The sheet's Business Plan + Overview, computed from a plan run: headline, Exit ARR, The Ask
// (peak deficit → funding → equity), and capital deployment by theme and milestone.

import { debtDrawnBy, openingCashOf, peakDeficitWithin, resolveFx, type Plan, type PlanResult } from './engine';

export interface Headline {
  months: number; revenue: number; units: number; grossMargin: number; cm3Pct: number;
  ebitda: number; ebitdaPct: number; exitArr: number; exitRunRate: number; exitGrowth: number;
}

const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

/**
 * Exit ARR at month e (Revenue Planning K/L57): trailing-12-month revenue × the last 3 months' growth
 * over the same 3 months a year earlier, capped (2×). Before the plan starts, the year-earlier 3 months
 * come from the actual entered (Jul–Sep '26 for the 12-month exit).
 */
export function exitArr(plan: Plan, r: PlanResult, e: number) {
  const rev = (m: number) => r.months[m - 1]?.grossRevenue ?? 0;
  const ttm = sum(Array.from({ length: Math.min(12, e) }, (_, i) => rev(e - i)));
  const l3m = rev(e) + rev(e - 1) + rev(e - 2);
  const prior = e - 14 >= 1 ? rev(e - 12) + rev(e - 13) + rev(e - 14) : plan.business?.exitPriorL3M ?? 0;
  const growth = prior > 0 ? Math.min(l3m / prior, plan.business?.exitGrowthCap ?? 2) : 1;
  return { ttm, growth, arr: ttm * growth };
}

export function headline(plan: Plan, r: PlanResult, n: number): Headline {
  const ms = r.months.slice(0, n);
  const revenue = sum(ms.map((m) => m.netRevenue));
  const x = exitArr(plan, r, Math.min(n, r.months.length));
  return {
    months: ms.length, revenue, units: sum(ms.map((m) => m.units)),
    grossMargin: sum(ms.map((m) => m.grossProfit)) / (revenue || 1),
    cm3Pct: sum(ms.map((m) => m.cm3)) / (revenue || 1),
    ebitda: sum(ms.map((m) => m.ebitda)), ebitdaPct: sum(ms.map((m) => m.ebitda)) / (revenue || 1),
    exitArr: x.arr, exitRunRate: x.ttm, exitGrowth: x.growth,
  };
}

export interface Ask {
  months: number; peakDeficit: number; peakMonth: number; contingency: number; fundingNeed: number;
  ventureDebt: number; equityRequired: number;
  /** seed equity received within the window, and the equity still to raise after it (the Series A ask) */
  seed: number; equityAfterSeed: number; openingCash: number; inventoryPeak: number; gstAssetPeak: number;
}

/** The Ask over the first n months (Cash Flow & Fundraise rows 72–80). */
export function theAsk(plan: Plan, r: PlanResult, n: number, contingency: number): Ask {
  const ms = r.months.slice(0, n);
  const peakDeficit = peakDeficitWithin(r, n);
  const peakMonth = ms.reduce((a, m) => (m.cumulativeCash < (ms[a - 1]?.cumulativeCash ?? Infinity) ? m.m : a), 1);
  const ventureDebt = debtDrawnBy(plan, n);
  // the peak need is measured on operating cash flow, so the cash we start with comes off it
  const fx = resolveFx(plan);
  const openingCash = fx.opening.on ? Math.max(0, openingCashOf(plan)) : 0;
  const fundingNeed = Math.max(0, peakDeficit * (1 + contingency) - openingCash);
  const seed = fx.seed.on && fx.seed.month <= n ? fx.seed.amount : 0;
  return {
    months: ms.length, peakDeficit, peakMonth, contingency, fundingNeed, ventureDebt, equityRequired: fundingNeed - ventureDebt, seed, equityAfterSeed: Math.max(0, fundingNeed - ventureDebt - seed), openingCash,
    inventoryPeak: Math.max(0, ...ms.map((m) => m.inventory)), gstAssetPeak: Math.max(0, ...ms.map((m) => m.gstAsset)),
  };
}

export interface DeploymentRow { key: string; theme: string; milestone: string | null; byMonth: number[]; total: number }

/**
 * Capital deployment (Overview rows 42–87): every cost line tagged with a milestone, summed per month,
 * by milestone and by theme, plus total spend and the untagged business-as-usual remainder.
 * Working capital is excluded — this is spend against milestones, not the cash need.
 */
export function deployment(plan: Plan, r: PlanResult, n: number) {
  const ms = r.months.slice(0, n);
  const themeOf = new Map<string, string>(); // milestone → theme
  for (const t of plan.business?.themes ?? []) themeOf.set(t.milestone, t.theme);
  const byMilestone = new Map<string, DeploymentRow>();
  const byTheme = new Map<string, DeploymentRow>();
  const row = (map: Map<string, DeploymentRow>, key: string, theme: string, milestone: string | null) => {
    let x = map.get(key);
    if (!x) { x = { key, theme, milestone, byMonth: Array(ms.length).fill(0), total: 0 }; map.set(key, x); }
    return x;
  };
  // milestones in the order the Overview lists them, even with no spend yet
  for (const t of plan.business?.themes ?? []) { row(byMilestone, t.milestone, t.theme, t.milestone); row(byTheme, t.theme, t.theme, null); }
  for (const l of plan.lines) {
    if (!l.milestone && !l.theme) continue;
    const theme = l.theme ?? (l.milestone ? themeOf.get(l.milestone) : undefined) ?? 'Untagged theme';
    ms.forEach((m, i) => {
      const v = m.lines[l.id] ?? 0;
      if (!v) return;
      if (l.milestone) { const x = row(byMilestone, l.milestone, theme, l.milestone); x.byMonth[i] += v; x.total += v; }
      const y = row(byTheme, theme, theme, null); y.byMonth[i] += v; y.total += v;
    });
  }
  const sections = new Set(['revex', 'opex', 'capex', 'finex']);
  const groupsOf = plan.groups.filter((g) => sections.has(g.section)).map((g) => g.name);
  const totalSpend = ms.map((m) => sum(groupsOf.map((g) => m.groups[g] ?? 0)));
  const tagged = ms.map((_, i) => sum([...byTheme.values()].map((t) => t.byMonth[i])));
  return {
    months: ms.map((m) => m.label),
    milestones: [...byMilestone.values()],
    themes: [...byTheme.values()],
    tagged, totalSpend, untagged: totalSpend.map((t, i) => t - tagged[i]),
  };
}
