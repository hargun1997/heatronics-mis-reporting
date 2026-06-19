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

export { SALES_CHANNELS, FY_SUMMARY };
export type { SalesChannel };
