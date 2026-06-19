// Derived analytics for the MIS Reporting deck.
// Everything here is computed from the bundled MONTHLY_MIS / FY_SUMMARY data.

import {
  MONTHLY_MIS,
  FY_SUMMARY,
  SALES_CHANNELS,
  type MonthlyMIS,
  type SalesChannel,
} from './misDeckData';

export type Granularity = 'month' | 'quarter' | 'year';

export interface PeriodMIS {
  key: string;          // e.g. "2025-12", "FY26 Q3", "FY 2025-26"
  label: string;        // short display label
  longLabel: string;    // full display label
  sortKey: number;      // for chronological ordering
  netByChannel: Record<SalesChannel, number>;
  netRevenue: number;
  grossMargin: number;
  cm1: number;
  cm2: number;
  cm3: number;
  ebitda: number;
  netIncome: number;
  cogm: number;
  channelFulfillment: number;
  salesMarketing: number;
  platformCosts: number;
  opex: number;
  nonOperating: number;
  monthsCount: number;  // how many months rolled into this period
}

// ----------------------------------------------------------------------------
// Fiscal helpers (Indian FY: Apr–Mar)
// ----------------------------------------------------------------------------

export function fiscalYear(month: number, year: number): { key: string; start: number } {
  // start year of the FY
  const startYear = month >= 4 ? year : year - 1;
  return { key: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`, start: startYear };
}

export function fiscalQuarter(month: number): { q: number; label: string } {
  // Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
  if (month >= 4 && month <= 6) return { q: 1, label: 'Q1' };
  if (month >= 7 && month <= 9) return { q: 2, label: 'Q2' };
  if (month >= 10 && month <= 12) return { q: 3, label: 'Q3' };
  return { q: 4, label: 'Q4' };
}

function emptyChannels(): Record<SalesChannel, number> {
  return SALES_CHANNELS.reduce((acc, c) => { acc[c] = 0; return acc; }, {} as Record<SalesChannel, number>);
}

function aggregate(records: MonthlyMIS[], key: string, label: string, longLabel: string, sortKey: number): PeriodMIS {
  const p: PeriodMIS = {
    key, label, longLabel, sortKey,
    netByChannel: emptyChannels(),
    netRevenue: 0, grossMargin: 0, cm1: 0, cm2: 0, cm3: 0, ebitda: 0, netIncome: 0,
    cogm: 0, channelFulfillment: 0, salesMarketing: 0, platformCosts: 0, opex: 0, nonOperating: 0,
    monthsCount: records.length,
  };
  for (const r of records) {
    for (const c of SALES_CHANNELS) p.netByChannel[c] += r.netByChannel[c] ?? 0;
    p.netRevenue += r.netRevenue;
    p.grossMargin += r.grossMargin;
    p.cm1 += r.cm1; p.cm2 += r.cm2; p.cm3 += r.cm3;
    p.ebitda += r.ebitda; p.netIncome += r.netIncome;
    p.cogm += r.cogm; p.channelFulfillment += r.channelFulfillment;
    p.salesMarketing += r.salesMarketing; p.platformCosts += r.platformCosts;
    p.opex += r.opex; p.nonOperating += r.nonOperating;
  }
  return p;
}

// ----------------------------------------------------------------------------
// Period series builders
// ----------------------------------------------------------------------------

const monthsAsc = [...MONTHLY_MIS].sort((a, b) => a.year - b.year || a.month - b.month);

export function monthlySeries(): PeriodMIS[] {
  return monthsAsc.map((r) =>
    aggregate([r], r.key, r.label.replace(/ 20/, " '"), r.label, r.year * 100 + r.month),
  );
}

export function quarterlySeries(): PeriodMIS[] {
  const groups = new Map<string, MonthlyMIS[]>();
  const meta = new Map<string, { sortKey: number; label: string; longLabel: string }>();
  for (const r of monthsAsc) {
    const fy = fiscalYear(r.month, r.year);
    const q = fiscalQuarter(r.month);
    const key = `${fy.key} ${q.label}`;
    const shortFy = `FY${String((fy.start + 1) % 100).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
    meta.set(key, { sortKey: fy.start * 10 + q.q, label: `${shortFy} ${q.label}`, longLabel: key });
  }
  return [...groups.entries()]
    .map(([key, recs]) => {
      const m = meta.get(key)!;
      return aggregate(recs, key, m.label, m.longLabel, m.sortKey);
    })
    .sort((a, b) => a.sortKey - b.sortKey);
}

export function yearlySeries(): PeriodMIS[] {
  const groups = new Map<string, MonthlyMIS[]>();
  for (const r of monthsAsc) {
    const fy = fiscalYear(r.month, r.year);
    if (!groups.has(fy.key)) groups.set(fy.key, []);
    groups.get(fy.key)!.push(r);
  }
  return [...groups.entries()]
    .map(([key, recs]) => {
      const startYear = parseInt(key.slice(3, 7), 10);
      return aggregate(recs, key, key.replace('FY ', 'FY '), key, startYear);
    })
    .sort((a, b) => a.sortKey - b.sortKey);
}

export function seriesFor(g: Granularity): PeriodMIS[] {
  return g === 'month' ? monthlySeries() : g === 'quarter' ? quarterlySeries() : yearlySeries();
}

// ----------------------------------------------------------------------------
// Growth
// ----------------------------------------------------------------------------

/** Period-over-period growth (%) for a metric. Returns fractions (0.1 = +10%). */
export function periodGrowth(series: PeriodMIS[], metric: (p: PeriodMIS) => number): (number | null)[] {
  return series.map((p, i) => {
    if (i === 0) return null;
    const prev = metric(series[i - 1]);
    const cur = metric(p);
    if (prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
  });
}

/** Year-over-year growth for a series, offset = periods in one year (12 / 4 / 1). */
export function yoyGrowth(series: PeriodMIS[], metric: (p: PeriodMIS) => number, offset: number): (number | null)[] {
  return series.map((p, i) => {
    if (i < offset) return null;
    const prev = metric(series[i - offset]);
    const cur = metric(p);
    if (prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
  });
}

/** CAGR between two values over `years` years. Returns a fraction or null. */
export function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

// ----------------------------------------------------------------------------
// Margin helpers
// ----------------------------------------------------------------------------

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return part / whole;
}

export interface MarginSet {
  grossMarginPct: number;
  cm1Pct: number;
  cm2Pct: number;
  cm3Pct: number;
  ebitdaPct: number;
  netIncomePct: number;
}

export function marginsOf(p: PeriodMIS): MarginSet {
  return {
    grossMarginPct: pct(p.grossMargin, p.netRevenue),
    cm1Pct: pct(p.cm1, p.netRevenue),
    cm2Pct: pct(p.cm2, p.netRevenue),
    cm3Pct: pct(p.cm3, p.netRevenue),
    ebitdaPct: pct(p.ebitda, p.netRevenue),
    netIncomePct: pct(p.netIncome, p.netRevenue),
  };
}

export function channelMix(p: PeriodMIS): Record<SalesChannel, number> {
  const total = SALES_CHANNELS.reduce((s, c) => s + Math.max(0, p.netByChannel[c]), 0);
  return SALES_CHANNELS.reduce((acc, c) => {
    acc[c] = total > 0 ? Math.max(0, p.netByChannel[c]) / total : 0;
    return acc;
  }, {} as Record<SalesChannel, number>);
}

// ----------------------------------------------------------------------------
// Deck-level facts (for the "VC snapshot" cards)
// ----------------------------------------------------------------------------

export interface DeckFacts {
  latest: PeriodMIS;
  prev: PeriodMIS;
  yoyMonth: PeriodMIS | null;
  momRevGrowth: number | null;
  yoyRevGrowth: number | null;
  ttmRevenue: number;             // trailing 12 months net revenue
  ttmRevenuePrior: number;        // the 12 months before that
  ttmGrowth: number | null;
  revenueCagrFY: number | null;   // CAGR across full fiscal years
  cagrYears: number;
  fyFirst: PeriodMIS;
  fyLast: PeriodMIS;              // last FULL fiscal year (>=12 months)
  bestChannelLatest: { channel: SalesChannel; share: number };
  fastestChannel: { channel: SalesChannel; growth: number } | null;
  latestMargins: MarginSet;
  monthsOfData: number;
}

export function deckFacts(): DeckFacts {
  const months = monthlySeries();
  const latest = months[months.length - 1];
  const prev = months[months.length - 2];
  const yoyMonth = months.length > 12 ? months[months.length - 13] : null;

  const momRevGrowth = prev.netRevenue ? (latest.netRevenue - prev.netRevenue) / Math.abs(prev.netRevenue) : null;
  const yoyRevGrowth = yoyMonth && yoyMonth.netRevenue ? (latest.netRevenue - yoyMonth.netRevenue) / Math.abs(yoyMonth.netRevenue) : null;

  const ttm = months.slice(-12);
  const ttmPrior = months.slice(-24, -12);
  const ttmRevenue = ttm.reduce((s, p) => s + p.netRevenue, 0);
  const ttmRevenuePrior = ttmPrior.reduce((s, p) => s + p.netRevenue, 0);
  const ttmGrowth = ttmRevenuePrior ? (ttmRevenue - ttmRevenuePrior) / Math.abs(ttmRevenuePrior) : null;

  const years = yearlySeries();
  const fullYears = years.filter((y) => y.monthsCount >= 12);
  const fyFirst = fullYears[0] ?? years[0];
  const fyLast = fullYears[fullYears.length - 1] ?? years[years.length - 1];
  const cagrYears = Math.max(1, (fyLast.sortKey - fyFirst.sortKey));
  const revenueCagrFY = cagr(fyFirst.netRevenue, fyLast.netRevenue, cagrYears);

  const mix = channelMix(latest);
  const bestChannel = SALES_CHANNELS.reduce(
    (best, c) => (mix[c] > best.share ? { channel: c, share: mix[c] } : best),
    { channel: SALES_CHANNELS[0] as SalesChannel, share: -1 },
  );

  // Fastest-growing channel over the last 6 months (by net revenue), among channels with material base
  let fastestChannel: { channel: SalesChannel; growth: number } | null = null;
  if (months.length >= 7) {
    const recent = aggregate(monthsAsc.slice(-3), 'r', 'r', 'r', 0);
    const earlier = aggregate(monthsAsc.slice(-6, -3), 'e', 'e', 'e', 0);
    for (const c of SALES_CHANNELS) {
      const base = earlier.netByChannel[c];
      const now = recent.netByChannel[c];
      if (base > 50000) {
        const g = (now - base) / Math.abs(base);
        if (!fastestChannel || g > fastestChannel.growth) fastestChannel = { channel: c, growth: g };
      }
    }
  }

  return {
    latest, prev, yoyMonth, momRevGrowth, yoyRevGrowth,
    ttmRevenue, ttmRevenuePrior, ttmGrowth,
    revenueCagrFY, cagrYears, fyFirst, fyLast,
    bestChannelLatest: bestChannel,
    fastestChannel,
    latestMargins: marginsOf(latest),
    monthsOfData: months.length,
  };
}

// ----------------------------------------------------------------------------
// ARR / forward revenue projection
// ----------------------------------------------------------------------------

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function futureLabel(sortKey: number, k: number): string {
  const y = Math.floor(sortKey / 100);
  const m0 = (sortKey % 100) - 1 + k;
  const ny = y + Math.floor(m0 / 12);
  const nm = ((m0 % 12) + 12) % 12;
  return `${MON[nm]} '${String(ny % 100).padStart(2, '0')}`;
}

export interface ArrProjectionPoint { label: string; value: number; projected: boolean }

export interface ArrProjection {
  /** Geometric-mean MoM growth over the last 3 months (monthly fraction). */
  momGrowth3m: number | null;
  /** The 3-month MoM growth annualised: (1+mom)^12 - 1. */
  momAnnualised: number | null;
  /** YoY growth of trailing-12-month revenue vs the prior 12 months. */
  yoyGrowth: number | null;
  /** Blended annual growth = average of annualised MoM(3m) and YoY. */
  blendedAnnual: number | null;
  lastMonthLabel: string;
  lastMonthRevenue: number;
  /** Trailing-12-month revenue (actual). */
  ttmRevenue: number;
  /** The 12 months before the trailing 12 (actual). */
  priorTtmRevenue: number;
  /** Simple run-rate ARR: latest month annualised. */
  runRateArr: number;
  /** Forward ARR = trailing 12 months grown by the blended annual rate. */
  forwardArr: number;
  /** Projected revenue for the latest month one year out. */
  projectedExitRevenue: number;
  /** Projected exit month annualised (exit run-rate ARR). */
  projectedExitArr: number;
  /** 12 months of actual + 12 months of projected revenue, for charting. */
  points: ArrProjectionPoint[];
}

/**
 * Project ARR from a blend of momentum signals:
 *  - MoM: geometric-mean month-over-month growth over the last 3 months (annualised), and
 *  - YoY: trailing-12-month revenue vs the prior 12 months.
 * The two are averaged into a single blended annual growth rate, which is then applied
 * on top of each of the last 12 actual months to project the next 12 (preserving seasonality).
 * Forward ARR is the sum of that projected next-12-month revenue.
 */
export function arrProjection(): ArrProjection {
  const months = monthlySeries();
  const last = months[months.length - 1];

  // --- MoM: geometric mean over the last 3 months (needs 4 points → 3 ratios) ---
  const slice = months.slice(-4);
  let prod = 1, count = 0;
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1].netRevenue, cur = slice[i].netRevenue;
    if (prev > 0 && cur > 0) { prod *= cur / prev; count++; }
  }
  const momGrowth3m = count > 0 ? Math.pow(prod, 1 / count) - 1 : null;
  const momAnnualised = momGrowth3m !== null ? Math.pow(1 + momGrowth3m, 12) - 1 : null;

  // --- YoY: trailing 12 months vs the prior 12 months ---
  const actualTail = months.slice(-12);
  const prior = months.slice(-24, -12);
  const ttmRevenue = actualTail.reduce((s, p) => s + p.netRevenue, 0);
  const priorTtmRevenue = prior.reduce((s, p) => s + p.netRevenue, 0);
  const yoyGrowth = priorTtmRevenue > 0 ? (ttmRevenue - priorTtmRevenue) / priorTtmRevenue : null;

  // --- Blend the two annual rates ---
  const parts = [momAnnualised, yoyGrowth].filter((v): v is number => v !== null && isFinite(v));
  const blendedAnnual = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  const g = blendedAnnual ?? 0;

  // --- Project: grow each of the last 12 months by the blended annual rate ---
  const projectedVals = actualTail.map((p) => p.netRevenue * (1 + g));
  const forwardArr = projectedVals.reduce((a, b) => a + b, 0);
  const projectedExitRevenue = projectedVals[projectedVals.length - 1]; // latest month, one year out

  const points: ArrProjectionPoint[] = [
    ...actualTail.map((p) => ({ label: p.label, value: p.netRevenue, projected: false })),
    ...projectedVals.map((v, k) => ({ label: futureLabel(last.sortKey, k + 1), value: v, projected: true })),
  ];

  return {
    momGrowth3m,
    momAnnualised,
    yoyGrowth,
    blendedAnnual,
    lastMonthLabel: last.longLabel,
    lastMonthRevenue: last.netRevenue,
    ttmRevenue,
    priorTtmRevenue,
    runRateArr: last.netRevenue * 12,
    forwardArr,
    projectedExitRevenue,
    projectedExitArr: projectedExitRevenue * 12,
    points,
  };
}

export { SALES_CHANNELS, FY_SUMMARY };
export type { SalesChannel };
