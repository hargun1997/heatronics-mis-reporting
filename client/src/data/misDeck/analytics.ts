// Derived analytics for the MIS Reporting deck.
// Everything here is computed from the bundled MONTHLY_MIS / FY_SUMMARY data.

import {
  MONTHLY_MIS,
  FY_SUMMARY,
  SALES_CHANNELS,
  D2C_AD_SPEND,
  AMAZON_AD_SPEND,
  type MonthlyMIS,
  type SalesChannel,
} from './misDeckData';

export type Granularity = 'month' | 'quarter' | 'year';

// Local string formatters (kept here so this data module has no UI dependency).
function pctStr(v: number, digits = 1): string { return `${(v * 100).toFixed(digits)}%`; }
function pctSigned(v: number, digits = 1): string { return `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`; }

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
  firstMonthShort: string; // e.g. "Dec '23" — first month covered
  lastMonthShort: string;  // e.g. "Mar '24" — last month covered
}

/** "Dec 2023" → "Dec '23" */
export function shortMonth(label: string): string {
  return label.replace(/ 20(\d\d)$/, " '$1");
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
    firstMonthShort: records.length ? shortMonth(records[0].label) : '',
    lastMonthShort: records.length ? shortMonth(records[records.length - 1].label) : '',
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

// The series builders take an explicit source array so the same aggregation can
// be reused for the actual months (default) and for the blended-GM months.
export function monthlySeries(src: MonthlyMIS[] = monthsAsc): PeriodMIS[] {
  return src.map((r) =>
    aggregate([r], r.key, r.label.replace(/ 20/, " '"), r.label, r.year * 100 + r.month),
  );
}

export function quarterlySeries(src: MonthlyMIS[] = monthsAsc): PeriodMIS[] {
  const groups = new Map<string, MonthlyMIS[]>();
  const meta = new Map<string, { sortKey: number; label: string; longLabel: string }>();
  for (const r of src) {
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

export function yearlySeries(src: MonthlyMIS[] = monthsAsc): PeriodMIS[] {
  const groups = new Map<string, MonthlyMIS[]>();
  for (const r of src) {
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

export function seriesFor(g: Granularity, src: MonthlyMIS[] = monthsAsc): PeriodMIS[] {
  return g === 'month' ? monthlySeries(src) : g === 'quarter' ? quarterlySeries(src) : yearlySeries(src);
}

// ----------------------------------------------------------------------------
// Blended gross margin
// ----------------------------------------------------------------------------
//
// The company books COGM on purchase/consumption timing rather than matched to
// each month's sales, so the *actual* monthly GM% swings wildly (~14%–84%).
// The "blended" view replaces each month's noisy COGM with one implied by a
// revenue-weighted GM% for that month's fiscal year, applied in proportion to
// the month's net revenue. Everything below GM (CM1/2/3, EBITDA, Net Income)
// shifts by the same delta; channel/marketing/opex/non-operating stay actual.
// By construction, a full fiscal year is unchanged — only sub-annual noise is
// smoothed.

/** Revenue-weighted gross-margin fraction per fiscal year. */
export function fyBlendedGMRates(): Map<string, number> {
  const acc = new Map<string, { gm: number; nr: number }>();
  for (const r of monthsAsc) {
    const key = fiscalYear(r.month, r.year).key;
    const cur = acc.get(key) ?? { gm: 0, nr: 0 };
    cur.gm += r.grossMargin;
    cur.nr += r.netRevenue;
    acc.set(key, cur);
  }
  const rates = new Map<string, number>();
  for (const [key, v] of acc) rates.set(key, v.nr ? v.gm / v.nr : 0);
  return rates;
}

/** Months restated so each carries its fiscal year's blended GM% (in proportion to revenue). */
export function blendedMonths(): MonthlyMIS[] {
  const rates = fyBlendedGMRates();
  return monthsAsc.map((r) => {
    const rate = rates.get(fiscalYear(r.month, r.year).key) ?? (r.netRevenue ? r.grossMargin / r.netRevenue : 0);
    const blendedGM = r.netRevenue * rate;
    const delta = blendedGM - r.grossMargin; // >0 if the blend lifts this month's GM
    return {
      ...r,
      cogm: r.cogm - delta,
      grossMargin: blendedGM,
      cm1: r.cm1 + delta,
      cm2: r.cm2 + delta,
      cm3: r.cm3 + delta,
      ebitda: r.ebitda + delta,
      netIncome: r.netIncome + delta,
    };
  });
}

/** Period series with the blended-GM restatement applied. Yearly ≈ actual by construction. */
export function seriesForBlended(g: Granularity): PeriodMIS[] {
  return seriesFor(g, blendedMonths());
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
// Channel-level analytics
// ----------------------------------------------------------------------------

/** Herfindahl–Hirschman Index of channel concentration, 0–10,000 (higher = more concentrated). */
export function channelHHI(p: PeriodMIS): number {
  const mix = channelMix(p);
  return Math.round(SALES_CHANNELS.reduce((s, c) => s + Math.pow(mix[c] * 100, 2), 0));
}

export function topChannel(p: PeriodMIS): { channel: SalesChannel; share: number } {
  const mix = channelMix(p);
  return SALES_CHANNELS.reduce(
    (best, c) => (mix[c] > best.share ? { channel: c, share: mix[c] } : best),
    { channel: SALES_CHANNELS[0] as SalesChannel, share: -1 },
  );
}

/** Number of channels contributing more than `threshold` (fraction) of net revenue. */
export function channelsAbove(p: PeriodMIS, threshold = 0.05): number {
  const mix = channelMix(p);
  return SALES_CHANNELS.filter((c) => mix[c] > threshold).length;
}

export interface ChannelShift {
  channel: SalesChannel;
  earlyShare: number;
  lateShare: number;
  deltaPts: number;       // late − early, in share points (fraction)
  earlyRev: number;
  lateRev: number;
  growth: number | null;  // late vs early revenue growth
}

/** Compares the first vs the last quarter that carry channel data. */
export function channelShifts(): { early: PeriodMIS; late: PeriodMIS; shifts: ChannelShift[] } | null {
  const q = quarterlySeries().filter((p) => SALES_CHANNELS.some((c) => p.netByChannel[c] > 0));
  if (q.length < 2) return null;
  const early = q[0], late = q[q.length - 1];
  const em = channelMix(early), lm = channelMix(late);
  const shifts: ChannelShift[] = SALES_CHANNELS.map((c) => ({
    channel: c,
    earlyShare: em[c],
    lateShare: lm[c],
    deltaPts: lm[c] - em[c],
    earlyRev: early.netByChannel[c],
    lateRev: late.netByChannel[c],
    growth: early.netByChannel[c] > 0 ? (late.netByChannel[c] - early.netByChannel[c]) / early.netByChannel[c] : null,
  }));
  return { early, late, shifts };
}

/** Auto-generated, data-driven channel observations. */
export function channelObservations(): string[] {
  const out: string[] = [];
  const data = channelShifts();
  if (!data) return out;
  const { early, late, shifts } = data;

  const sorted = [...shifts].sort((a, b) => b.deltaPts - a.deltaPts);
  const gainer = sorted[0];
  const loser = sorted[sorted.length - 1];
  const top = topChannel(late);

  // Mix rotation headline
  if (gainer.deltaPts > 0.03 && loser.deltaPts < -0.03) {
    out.push(
      `Channel mix has rotated from ${loser.channel} (${pctStr(loser.earlyShare, 0)} → ${pctStr(loser.lateShare, 0)}) toward ` +
      `${gainer.channel} (${pctStr(gainer.earlyShare, 0)} → ${pctStr(gainer.lateShare, 0)}) between ${early.label} and ${late.label}.`,
    );
  }

  // Biggest gainer detail
  if (gainer.deltaPts > 0.02) {
    out.push(
      `${gainer.channel} is the fastest-growing channel by share, +${Math.round(gainer.deltaPts * 100)} pts` +
      (gainer.growth !== null ? ` (revenue ${pctSigned(gainer.growth)} vs ${early.label})` : '') + `.`,
    );
  }

  // Emerging channel (≈0 → material)
  const emerging = shifts.find((s) => s.earlyShare < 0.01 && s.lateShare >= 0.05);
  if (emerging && emerging.channel !== gainer.channel) {
    out.push(`${emerging.channel} emerged from ~0% to ${pctStr(emerging.lateShare, 0)} of net revenue.`);
  }

  // Declining channel
  if (loser.deltaPts < -0.03) {
    out.push(
      `${loser.channel} has de-concentrated, −${Math.round(Math.abs(loser.deltaPts) * 100)} pts of share` +
      ` (now ${pctStr(loser.lateShare, 0)}).`,
    );
  }

  // Concentration / diversification
  const hhiLate = channelHHI(late), hhiEarly = channelHHI(early);
  const conc = hhiLate > 3000 ? 'highly concentrated' : hhiLate > 1800 ? 'moderately concentrated' : 'well diversified';
  out.push(
    `Revenue is ${conc} in ${late.label} (HHI ${hhiLate}, ${hhiEarly > hhiLate ? 'down' : 'up'} from ${hhiEarly}); ` +
    `top channel ${top.channel} is ${pctStr(top.share, 0)}, and ${channelsAbove(late)} channels each exceed 5% of revenue.`,
  );

  return out;
}

// ----------------------------------------------------------------------------
// Like-for-like (YoY same-frame) channel comparison
// ----------------------------------------------------------------------------

const monthByKey = new Map(monthsAsc.map((m) => [m.key, m]));

/** The underlying monthly records that compose a given period in granularity `g`. */
function membersOf(g: Granularity, period: PeriodMIS): MonthlyMIS[] {
  if (g === 'month') return monthsAsc.filter((m) => m.key === period.key);
  if (g === 'year') return monthsAsc.filter((m) => fiscalYear(m.month, m.year).key === period.key);
  return monthsAsc.filter((m) => `${fiscalYear(m.month, m.year).key} ${fiscalQuarter(m.month).label}` === period.key);
}

function scopeOf(records: MonthlyMIS[]): string {
  if (!records.length) return '—';
  return records.length > 1
    ? `${shortMonth(records[0].label)}–${shortMonth(records[records.length - 1].label)}`
    : shortMonth(records[0].label);
}

export interface ChannelLfLRow { channel: SalesChannel; prior: number; cur: number; growth: number | null }

export interface ChannelLfL {
  current: PeriodMIS;
  curScope: string;       // e.g. "Apr '26–May '26"
  priorScope: string;     // e.g. "Apr '25–May '25"
  priorComplete: boolean; // whether every current month has a prior-year match
  curRevenue: number;
  priorRevenue: number;
  revenueGrowth: number | null;
  rows: ChannelLfLRow[];
  frameNote: string;
}

/**
 * Compares the latest period against the SAME calendar frame one year earlier
 * (e.g. a 2-month FY-to-date vs the same 2 months of the prior FY) — a fair,
 * like-for-like YoY comparison rather than current-vs-immediately-prior period.
 */
export function likeForLikeChannel(g: Granularity): ChannelLfL {
  const series = seriesFor(g);
  const current = series[series.length - 1];
  const curMembers = membersOf(g, current);
  const priorMembers = curMembers
    .map((m) => monthByKey.get(`${m.year - 1}-${String(m.month).padStart(2, '0')}`))
    .filter((m): m is MonthlyMIS => !!m);

  const cur = aggregate(curMembers, 'cur', 'cur', 'cur', 0);
  const prior = aggregate(priorMembers, 'prior', 'prior', 'prior', 0);

  const rows: ChannelLfLRow[] = SALES_CHANNELS.map((c) => {
    const p = prior.netByChannel[c] || 0, n = cur.netByChannel[c] || 0;
    return { channel: c, prior: p, cur: n, growth: p > 0 ? (n - p) / p : null };
  });

  const frameNote = g === 'month'
    ? 'vs the same month last year'
    : g === 'quarter'
      ? 'vs the same quarter last FY'
      : 'FY-to-date vs the same months last FY';

  return {
    current,
    curScope: scopeOf(curMembers),
    priorScope: scopeOf(priorMembers),
    priorComplete: priorMembers.length === curMembers.length,
    curRevenue: cur.netRevenue,
    priorRevenue: prior.netRevenue,
    revenueGrowth: prior.netRevenue > 0 ? (cur.netRevenue - prior.netRevenue) / prior.netRevenue : null,
    rows,
    frameNote,
  };
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

// ----------------------------------------------------------------------------
// Orders (derived from channel net revenue ÷ AOV)
// ----------------------------------------------------------------------------
//
// The MIS books revenue, not order counts, so order volume is estimated by
// dividing each channel's net revenue by its assumed average order value (AOV).
// AOV is treated as constant, so a channel's order-count trend mirrors its
// revenue trend — the value here is the absolute order *volume* per channel.

/** Assumed average order value (₹) per channel. D2C is the Shopify storefront. */
export const CHANNEL_AOV: Record<SalesChannel, number> = {
  D2C: 1700,
  Amazon: 1400,
  Blinkit: 900,
  OEM: 325,
  Offline: 500,
  Export: 500,
};

/** Display name for a channel — the D2C channel surfaces as "Shopify". */
export function channelLabel(c: SalesChannel): string {
  return c === 'D2C' ? 'Shopify' : c;
}

/** Estimated order count per channel for a period = net revenue ÷ AOV. */
export function ordersByChannel(p: PeriodMIS): Record<SalesChannel, number> {
  return SALES_CHANNELS.reduce((acc, c) => {
    const aov = CHANNEL_AOV[c];
    acc[c] = aov > 0 ? Math.max(0, p.netByChannel[c] || 0) / aov : 0;
    return acc;
  }, {} as Record<SalesChannel, number>);
}

/** Total estimated orders across all channels for a period. */
export function totalOrders(p: PeriodMIS): number {
  const o = ordersByChannel(p);
  return SALES_CHANNELS.reduce((s, c) => s + o[c], 0);
}

// ----------------------------------------------------------------------------
// Channel-level P&L (shared costs allocated by net-revenue share)
// ----------------------------------------------------------------------------
//
// Only revenue is booked by channel; every cost below is a company total. Here
// each shared line is allocated to a channel in proportion to that channel's
// net revenue. A consequence of pure revenue-share allocation is that every
// channel carries the SAME margin % — only the ₹ amounts differ — so this view
// shows each channel's contribution to each P&L line, not channel-specific
// profitability.

export interface ChannelPnlRow {
  channel: SalesChannel;
  share: number; // net-revenue share (0–1)
  netRevenue: number;
  cogm: number;
  grossMargin: number;
  channelFulfillment: number;
  cm1: number;
  salesMarketing: number;
  cm2: number;
  platformCosts: number;
  cm3: number;
  opex: number;
  ebitda: number;
  nonOperating: number;
  netIncome: number;
}

/** Channel-attributed marketing for a period (from ad-spend feeds). */
export interface ChannelMarketing {
  /** D2C (Shopify) = Meta + Google spend. */
  d2c: number;
  /** Amazon Ads total cost. */
  amazon: number;
}

/**
 * Sum the ad-spend feeds over the months that compose a given period, so
 * marketing can be attributed to channels in the Channel P&L.
 */
export function adSpendForPeriod(g: Granularity, period: PeriodMIS): ChannelMarketing {
  const months = membersOf(g, period);
  const d2c = months.reduce((s, m) => s + (D2C_AD_SPEND[m.key] || 0), 0);
  const amazon = months.reduce((s, m) => s + (AMAZON_AD_SPEND[m.key] || 0), 0);
  return { d2c, amazon };
}

/**
 * Channel-level P&L. Every shared cost is allocated by net-revenue share,
 * EXCEPT Sales & Marketing when `marketing` is supplied: D2C carries its
 * Meta+Google spend, Amazon its Amazon Ads spend, and Blinkit the leftover
 * (booked S&M − D2C − Amazon). The below-S&M cascade (CM2 → Net Income) is
 * recomputed per channel so the marketing attribution flows through, and every
 * line still reconciles to the company total. Without `marketing`, S&M falls
 * back to revenue-share like the other lines.
 *
 * The booked S&M in the system is authoritative: the ad-spend feeds can never
 * attribute more marketing than was actually booked. When the reported ad spend
 * (D2C + Amazon) exceeds booked S&M for a period, the ad channels are scaled
 * down proportionally to fit the system total and Blinkit's leftover is held at
 * 0 — a channel's attributed marketing is therefore never negative.
 */
export function channelPnl(p: PeriodMIS, marketing?: ChannelMarketing): ChannelPnlRow[] {
  const totalPositive = SALES_CHANNELS.reduce((s, c) => s + Math.max(0, p.netByChannel[c] || 0), 0);
  const shareOf = (c: SalesChannel) => (totalPositive > 0 ? Math.max(0, p.netByChannel[c] || 0) / totalPositive : 0);

  // Sales & Marketing per channel.
  const smByChannel = emptyChannels();
  if (marketing) {
    const booked = p.salesMarketing;
    const adTotal = marketing.d2c + marketing.amazon;
    if (adTotal > booked && adTotal > 0) {
      // Reported ad spend exceeds booked S&M — trust the system total, scale the
      // ad channels to fit, and hold Blinkit's leftover at 0 (never negative).
      const scale = booked / adTotal;
      smByChannel.D2C = marketing.d2c * scale;
      smByChannel.Amazon = marketing.amazon * scale;
      smByChannel.Blinkit = 0;
    } else {
      smByChannel.D2C = marketing.d2c;
      smByChannel.Amazon = marketing.amazon;
      smByChannel.Blinkit = booked - adTotal; // leftover, ≥ 0 here
    }
    // OEM / Offline / Export carry no attributed marketing.
  } else {
    for (const c of SALES_CHANNELS) smByChannel[c] = p.salesMarketing * shareOf(c);
  }

  return SALES_CHANNELS.map((c) => {
    const share = shareOf(c);
    const netRevenue = Math.max(0, p.netByChannel[c] || 0);
    const cogm = p.cogm * share;
    const grossMargin = netRevenue - cogm;
    const channelFulfillment = p.channelFulfillment * share;
    const cm1 = grossMargin - channelFulfillment;
    const salesMarketing = smByChannel[c];
    const cm2 = cm1 - salesMarketing;
    const platformCosts = p.platformCosts * share;
    const cm3 = cm2 - platformCosts;
    const opex = p.opex * share;
    const ebitda = cm3 - opex;
    const nonOperating = p.nonOperating * share;
    const netIncome = ebitda - nonOperating;
    return {
      channel: c, share, netRevenue,
      cogm, grossMargin, channelFulfillment, cm1,
      salesMarketing, cm2, platformCosts, cm3,
      opex, ebitda, nonOperating, netIncome,
    };
  });
}

export { SALES_CHANNELS, FY_SUMMARY };
export type { SalesChannel };
