// ----------------------------------------------------------------------------
// Live MIS views — the legacy deck's report math, run over the LIVE deck.
//
// The legacy deck (analytics.ts) computes its reports from the static
// MONTHLY_MIS / SKU_CELLS. The Live MIS rebuilds those same atoms from uploads
// (liveDeck.ts) and aggregates them with completeness levels (liveAnalytics.ts).
// This module bridges the two so the Live MIS reaches report parity WITHOUT
// re-implementing the legacy math:
//
//   • toPeriodMIS()          PeriodAgg → the legacy PeriodMIS shape, so the
//                            legacy helpers (marginsOf, channelMix, channelHHI,
//                            topChannel, ordersByChannel, arrProjection,
//                            channelObservations, channelPnl …) run unchanged.
//   • blendLiveMonths()      legacy blendedMonths() over the cogm-real months.
//   • unifyChannels()        one continuous channel series across the seam.
//   • anchoredChannelPnl()   legacy channelPnlAnchored() on live periods.
//   • liveSkuChannelMatrix() legacy skuChannelMatrix() on live cells.
//   • liveLikeForLike(), rangeKeys(), liveMisPoint() …
// ----------------------------------------------------------------------------

import type { MonthlyMIS, SalesChannel } from './misDeckData';
import { SALES_CHANNELS, VERTICALS, VERTICAL_BY_CHANNEL, DISCOUNT_DATA, D2C_AD_SPEND, AMAZON_AD_SPEND } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';
import type { CompletenessLevel, LiveDeckData, PeriodCompleteness } from './liveDeck';
import {
  aggregatePeriods, monthLabel, FACTORY_PCT, CHANNEL_FOLD,
  type PeriodAgg, type PnlColumn,
} from './liveAnalytics';
import {
  channelAdWeight, fyBlendedGMRates, blendedMonths, channelPnl,
  type PeriodMIS, type SkuAgg,
} from './analytics';
import type { MisEntity, MisPoint } from './misSheet';
import type { TallyBucketLine } from '../monthClose/schema';

const r2 = (n: number) => Math.round(n * 100) / 100;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- Completeness gating ---------------------------------------------------

/** Which cascade rows are real at each completeness level (shared by every Live view). */
export const REAL_ROWS: Record<CompletenessLevel, Set<string>> = {
  full: new Set(['net_revenue', 'cogm', 'gross_margin', 'channel_fulfilment', 'cm1', 'sales_marketing', 'cm2', 'platform_payment', 'cm3', 'opex', 'ebitda', 'non_operating', 'cost_of_fundraising', 'net_income']),
  contribution: new Set(['net_revenue', 'cogm', 'gross_margin', 'channel_fulfilment', 'cm1', 'sales_marketing', 'cm2']),
  topline: new Set(['net_revenue', 'channel_fulfilment', 'sales_marketing']),
};
export const isReal = (level: CompletenessLevel, row: string) => REAL_ROWS[level].has(row);

// ---- Labels ----------------------------------------------------------------

/** "2026-07" → "Jul '26" (the legacy deck's short month). */
export function shortKey(k: string): string {
  const [y, m] = k.split('-').map(Number);
  return `${MON[(m || 1) - 1]} '${String((y || 0) % 100).padStart(2, '0')}`;
}
/** "2026-07" → "Jul 2026". */
export function longKey(k: string): string {
  const [y, m] = k.split('-').map(Number);
  return `${MON[(m || 1) - 1]} ${y}`;
}

/**
 * Display name for a channel. With the continuous taxonomy on (G6), the legacy
 * OEM / Offline revenue is folded into B2B / GT, so those two read as
 * "B2B (OEM)" and "GT (Offline)" — one business line, one series.
 */
export function channelName(ch: string, merged: boolean): string {
  if (merged) {
    if (ch === 'B2B') return 'B2B (OEM)';
    if (ch === 'GT') return 'GT (Offline)';
  }
  return ch;
}

// ---- PeriodAgg → legacy PeriodMIS -----------------------------------------

/**
 * Adapter to the legacy PeriodMIS shape. Legacy nonOperating INCLUDES Cost of
 * Fundraising (and nonOpOther excludes it); the live PeriodAgg keeps them apart,
 * so map accordingly. Every channel key is present (0 when absent).
 */
export function toPeriodMIS(a: PeriodAgg): PeriodMIS {
  const first = a.members[0] ?? '2000-01';
  const last = a.members[a.members.length - 1] ?? first;
  const [y, m] = first.split('-').map(Number);
  const netByChannel = SALES_CHANNELS.reduce((acc, c) => { acc[c] = a.netByChannel[c] ?? 0; return acc; }, {} as Record<SalesChannel, number>);
  const single = a.members.length === 1 && /^\d{4}-\d{2}$/.test(a.key);
  return {
    key: a.key,
    label: single ? shortKey(first) : a.label,
    longLabel: single ? longKey(first) : a.label,
    sortKey: y * 100 + m,
    netByChannel,
    netRevenue: a.netRevenue, grossMargin: a.grossMargin, cm1: a.cm1, cm2: a.cm2, cm3: a.cm3,
    ebitda: a.ebitda, netIncome: a.netIncome, cogm: a.cogm,
    channelFulfillment: a.channelFulfillment, salesMarketing: a.salesMarketing,
    platformCosts: a.platformCosts, opex: a.opex,
    nonOperating: r2(a.nonOperating + a.costOfFundraising),
    costOfFundraising: a.costOfFundraising,
    nonOpOther: a.nonOperating,
    opexLines: a.opexLines, cogmLines: a.cogmLines,
    monthsCount: a.members.length,
    firstMonthShort: shortKey(first),
    lastMonthShort: shortKey(last),
  };
}

// ---- Actual | Blended COGM (G11) ------------------------------------------

/**
 * The legacy deck's FY-blended COGM, over the live months. Rates are each FY's
 * revenue-weighted GM% — computed ONLY over months whose COGM is real (level
 * contribution or full), and only those months are restated. A full FY is
 * unchanged by construction.
 */
export function blendLiveMonths(
  months: MonthlyMIS[],
  completeness: Record<string, PeriodCompleteness>,
): { months: MonthlyMIS[]; rates: Map<string, number> } {
  const real = months.filter((m) => (completeness[m.key]?.level ?? 'topline') !== 'topline');
  const rates = fyBlendedGMRates(real);
  const blended = new Map(blendedMonths(real, rates).map((m) => [m.key, m]));
  return { months: months.map((m) => blended.get(m.key) ?? m), rates };
}

/** "FY25-26 59.7% · FY26-27 51.9%" from the legacy-keyed rate map. */
export function blendRatesNote(rates: Map<string, number>): string {
  return [...rates.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fy, r]) => `${fy.replace(/^FY (\d\d)(\d\d)-(\d\d)$/, 'FY$2-$3')} ${(r * 100).toFixed(1)}%`)
    .join(' · ');
}

// ---- Continuous channel taxonomy (G6) -------------------------------------

const UNIFY = CHANNEL_FOLD;
const uni = (ch: SalesChannel): SalesChannel => UNIFY[ch] ?? ch;
function uniRec(r: Partial<Record<SalesChannel, number>> | undefined): Partial<Record<SalesChannel, number>> {
  const out: Partial<Record<SalesChannel, number>> = {};
  for (const [k, v] of Object.entries(r ?? {}) as [SalesChannel, number][]) {
    const kk = uni(k);
    out[kk] = r2((out[kk] ?? 0) + v);
  }
  return out;
}

/**
 * Fold the legacy channel names into the forward taxonomy — OEM → B2B and
 * Offline → GT — across every month, SKU cell, recon and Tally bucket, so a
 * channel trend, mix or export reads as ONE continuous series across the
 * locked/live seam. Totals are untouched (it only renames keys).
 */
export function unifyChannels(deck: LiveDeckData): LiveDeckData {
  const mapLines = (lines?: TallyBucketLine[]) => lines?.map((l) => ({ ...l, byChannel: uniRec(l.byChannel) }));
  const months = deck.months.map((m) => ({
    ...m,
    rawNetByChannel: m.rawNetByChannel ?? m.netByChannel,
    netByChannel: uniRec(m.netByChannel),
    grossByChannel: uniRec(m.grossByChannel),
    returnsByChannel: uniRec(m.returnsByChannel),
    ordersByChannel: m.ordersByChannel ? uniRec(m.ordersByChannel) : undefined,
    tallyLines: mapLines(m.tallyLines),
    channelRecon: m.channelRecon ? { ...m.channelRecon, revenueResidue: uniRec(m.channelRecon.revenueResidue) } : undefined,
  }));
  const skuCells = deck.skuCells.map((c) => (UNIFY[c.ch] ? { ...c, ch: uni(c.ch) } : c));
  return { ...deck, months, skuCells };
}

// ---- Channel P&L, MIS-anchored (G4) ----------------------------------------

export interface AnchoredRow {
  channel: SalesChannel;
  revenue: number; cogm: number; grossMargin: number;
  channelFulfillment: number; cm1: number;
  salesMarketing: number; cm2: number;
  platformCosts: number; cm3: number;
  opex: number; ebitda: number;
  nonOperating: number; costOfFundraising: number; netIncome: number;
  revShare: number; cogsShare: number; smShare: number;
}

/**
 * The legacy deck's Channel P&L method on a live period: the company P&L is the
 * book of record and every line totals to it. Revenue by each channel's real
 * SKU-revenue share, COGM by real product-COGS share, S&M by real ad-spend
 * share, everything else by revenue share. Ad weight: the legacy ad feeds for
 * published/locked months (exactly as the legacy deck), the SKU cells' `ad` for
 * live-built months.
 */
export function anchoredChannelPnl(
  period: PeriodAgg,
  cells: SkuCell[],
  completeness: Record<string, PeriodCompleteness>,
): AnchoredRow[] {
  const keys = new Set(period.members);
  const sel = cells.filter((c) => keys.has(c.m));
  const chans = SALES_CHANNELS.filter((ch) => sel.some((c) => c.ch === ch));
  if (chans.length === 0) return [];
  const sum = (ch: SalesChannel, f: (c: SkuCell) => number) => sel.reduce((s, c) => (c.ch === ch ? s + f(c) : s), 0);
  const realRev = chans.map((ch) => Math.max(0, sum(ch, (c) => c.rev)));
  const realCogs = chans.map((ch) => Math.max(0, sum(ch, (c) => c.cogs)));
  const adWeight = chans.map((ch) => period.members.reduce((w, m) => {
    const comp = completeness[m];
    if (comp?.locked || comp?.published) return w + channelAdWeight(ch, [m]);
    return w + sel.reduce((s, c) => (c.m === m && c.ch === ch ? s + (c.ad ?? 0) : s), 0);
  }, 0));
  const totRev = realRev.reduce((s, v) => s + v, 0) || 1;
  const totCogs = realCogs.reduce((s, v) => s + v, 0) || 1;
  const totAd = adWeight.reduce((s, v) => s + v, 0);

  return chans.map((ch, i) => {
    const revShare = realRev[i] / totRev;
    const cogsShare = totCogs > 1 ? realCogs[i] / totCogs : revShare;
    const smShare = totAd > 0 ? adWeight[i] / totAd : revShare;
    const revenue = period.netRevenue * revShare;
    const cogm = period.cogm * cogsShare;
    const grossMargin = revenue - cogm;
    const channelFulfillment = period.channelFulfillment * revShare;
    const cm1 = grossMargin - channelFulfillment;
    const salesMarketing = period.salesMarketing * smShare;
    const cm2 = cm1 - salesMarketing;
    const platformCosts = period.platformCosts * revShare;
    const cm3 = cm2 - platformCosts;
    const opex = period.opex * revShare;
    const ebitda = cm3 - opex;
    const nonOperating = period.nonOperating * revShare;
    const costOfFundraising = period.costOfFundraising * revShare;
    const netIncome = ebitda - nonOperating - costOfFundraising;
    return {
      channel: ch, revenue, cogm, grossMargin, channelFulfillment, cm1, salesMarketing, cm2,
      platformCosts, cm3, opex, ebitda, nonOperating, costOfFundraising, netIncome, revShare, cogsShare, smShare,
    };
  });
}

/** The company cascade as a "total" PnlColumn (the book of record). */
export function companyColumn(period: PeriodAgg, label = 'Total (MIS)'): PnlColumn {
  const factory = r2(FACTORY_PCT * period.netRevenue);
  return {
    key: '__company', label, kind: 'total',
    rev: period.netRevenue, cogs: r2(period.cogm - factory), factory, cogm: period.cogm, gm: period.grossMargin,
    fulfilment: period.channelFulfillment, cm1: period.cm1, marketing: period.salesMarketing, cm2: period.cm2,
    platform: period.platformCosts, cm3: period.cm3, opex: period.opex, ebitda: period.ebitda,
    nonOperating: r2(period.nonOperating + period.costOfFundraising), netIncome: period.netIncome,
  };
}

/** Anchored rows as PnlColumns — by channel, or summed into verticals. */
export function anchoredColumns(rows: AnchoredRow[], by: 'channel' | 'vertical', merged: boolean): PnlColumn[] {
  const groups = new Map<string, AnchoredRow[]>();
  for (const r of rows) {
    const k = by === 'vertical' ? VERTICAL_BY_CHANNEL[r.channel] : r.channel;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const order = by === 'vertical' ? (VERTICALS as readonly string[]) : (SALES_CHANNELS as readonly string[]);
  return [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([k, rs]) => {
      const s = (f: (r: AnchoredRow) => number) => rs.reduce((t, r) => t + f(r), 0);
      return {
        key: k, label: by === 'channel' ? channelName(k, merged) : k, kind: 'slice' as const,
        rev: s((r) => r.revenue), cogs: s((r) => r.cogm), factory: 0, cogm: s((r) => r.cogm), gm: s((r) => r.grossMargin),
        fulfilment: s((r) => r.channelFulfillment), cm1: s((r) => r.cm1), marketing: s((r) => r.salesMarketing), cm2: s((r) => r.cm2),
        platform: s((r) => r.platformCosts), cm3: s((r) => r.cm3), opex: s((r) => r.opex), ebitda: s((r) => r.ebitda),
        nonOperating: s((r) => r.nonOperating + r.costOfFundraising), netIncome: s((r) => r.netIncome),
      };
    });
}

// ---- SKU × Channel matrix (G32) --------------------------------------------

export interface LiveMatrix {
  products: string[];
  channels: SalesChannel[];
  cell: (p: string, c: SalesChannel) => (SkuAgg & { ad: number }) | undefined;
  productTotal: (p: string) => SkuAgg;
  channelTotal: (c: SalesChannel) => SkuAgg;
  grand: SkuAgg;
}

interface RawM { rev: number; cogs: number; cf: number; sm: number; u: number }
const ZERO_M: RawM = { rev: 0, cogs: 0, cf: 0, sm: 0, u: 0 };
const addM = (a: RawM, c: SkuCell): RawM => ({ rev: a.rev + c.rev, cogs: a.cogs + c.cogs, cf: a.cf + c.oth, sm: a.sm + (c.ad ?? 0), u: a.u + c.u });
function finM(a: RawM): SkuAgg & { ad: number } {
  const fac = a.rev * FACTORY_PCT;
  const con = a.rev - a.cogs - fac - a.cf - a.sm;
  return { rev: a.rev, cogs: a.cogs, fac, oth: a.cf + a.sm, cf: a.cf, sm: a.sm, ad: a.sm, con, u: a.u };
}

/**
 * Product × channel contribution for a set of months — the legacy matrix on the
 * live cells (whose `oth` is already channel & fulfilment and `ad` the measured
 * ad spend). CM2 = rev − cogs − 10% factory − cf − ads.
 */
export function liveSkuChannelMatrix(cells: SkuCell[], keys: Set<string>): LiveMatrix {
  const byCell = new Map<string, RawM>();
  const byP = new Map<string, RawM>();
  const byC = new Map<SalesChannel, RawM>();
  let grand = { ...ZERO_M };
  for (const c of cells) {
    if (!keys.has(c.m)) continue;
    const k = `${c.p}||${c.ch}`;
    byCell.set(k, addM(byCell.get(k) ?? ZERO_M, c));
    byP.set(c.p, addM(byP.get(c.p) ?? ZERO_M, c));
    byC.set(c.ch, addM(byC.get(c.ch) ?? ZERO_M, c));
    grand = addM(grand, c);
  }
  const products = [...byP.keys()].sort((a, b) => {
    const ax = a.startsWith('Accessory') ? 1 : 0, bx = b.startsWith('Accessory') ? 1 : 0;
    if (ax !== bx) return ax - bx;
    return (byP.get(b)?.rev ?? 0) - (byP.get(a)?.rev ?? 0);
  });
  return {
    products,
    channels: SALES_CHANNELS.filter((c) => byC.has(c)),
    cell: (p, c) => { const r = byCell.get(`${p}||${c}`); return r ? finM(r) : undefined; },
    productTotal: (p) => finM(byP.get(p) ?? ZERO_M),
    channelTotal: (c) => finM(byC.get(c) ?? ZERO_M),
    grand: finM(grand),
  };
}

// ---- Like-for-like channel YoY (G19) ---------------------------------------

export interface LiveLfL {
  curScope: string; priorScope: string; priorComplete: boolean;
  curRevenue: number; priorRevenue: number; revenueGrowth: number | null;
  rows: { channel: SalesChannel; prior: number; cur: number; growth: number | null; mix: number }[];
}

/** The selected period vs the same calendar months one year earlier. */
export function liveLikeForLike(period: PeriodAgg, months: MonthlyMIS[]): LiveLfL {
  const byKey = new Map(months.map((m) => [m.key, m]));
  const cur = period.members.map((k) => byKey.get(k)).filter((m): m is MonthlyMIS => !!m);
  const prior = cur
    .map((m) => byKey.get(`${m.year - 1}-${String(m.month).padStart(2, '0')}`))
    .filter((m): m is MonthlyMIS => !!m);
  const scope = (ms: MonthlyMIS[]) => (!ms.length ? '—' : ms.length > 1 ? `${shortKey(ms[0].key)}–${shortKey(ms[ms.length - 1].key)}` : shortKey(ms[0].key));
  const sumCh = (ms: MonthlyMIS[], ch: SalesChannel) => ms.reduce((s, m) => s + (m.netByChannel[ch] ?? 0), 0);
  const curRevenue = cur.reduce((s, m) => s + m.netRevenue, 0);
  const priorRevenue = prior.reduce((s, m) => s + m.netRevenue, 0);
  const curPos = SALES_CHANNELS.reduce((s, ch) => s + Math.max(0, sumCh(cur, ch)), 0);
  const rows = SALES_CHANNELS
    .map((ch) => {
      const p = sumCh(prior, ch), n = sumCh(cur, ch);
      return { channel: ch, prior: p, cur: n, growth: p > 0 ? (n - p) / p : null, mix: curPos > 0 ? Math.max(0, n) / curPos : 0 };
    })
    .filter((r) => r.prior !== 0 || r.cur !== 0);
  return {
    curScope: scope(cur), priorScope: scope(prior), priorComplete: prior.length === cur.length,
    curRevenue, priorRevenue,
    revenueGrowth: priorRevenue > 0 ? (curRevenue - priorRevenue) / priorRevenue : null,
    rows,
  };
}

// ---- Custom range (G38) ----------------------------------------------------

export type RangePreset = 'last3' | 'last6' | 'last12' | 'ytd' | 'fy_current' | 'fy_previous' | 'custom';

const fyStart = (k: string) => { const [y, m] = k.split('-').map(Number); return m >= 4 ? y : y - 1; };

/**
 * Month keys for a range preset, anchored to the LATEST month with data (not
 * today's date — so "Last 12 months" is a true trailing twelve even when the
 * newest upload is a few months old).
 */
export function rangeKeys(preset: RangePreset, all: string[], custom: string[]): string[] {
  const keys = [...all].sort();
  const latest = keys[keys.length - 1];
  if (!latest) return [];
  if (preset === 'custom') return keys.filter((k) => custom.includes(k));
  if (preset === 'last3' || preset === 'last6' || preset === 'last12') {
    const n = preset === 'last3' ? 3 : preset === 'last6' ? 6 : 12;
    const [ly, lm] = latest.split('-').map(Number);
    const want = new Set<string>();
    for (let i = 0; i < n; i++) {
      let m = lm - i, y = ly;
      while (m <= 0) { m += 12; y -= 1; }
      want.add(`${y}-${String(m).padStart(2, '0')}`);
    }
    return keys.filter((k) => want.has(k));
  }
  if (preset === 'ytd') return keys.filter((k) => k.slice(0, 4) === latest.slice(0, 4) && k <= latest);
  const start = fyStart(latest) - (preset === 'fy_previous' ? 1 : 0);
  return keys.filter((k) => fyStart(k) === start);
}

export function rangePresetLabel(preset: RangePreset, all: string[]): string {
  const latest = [...all].sort().pop() ?? '';
  const fy = (s: number) => `FY${String(s % 100).padStart(2, '0')}-${String((s + 1) % 100).padStart(2, '0')}`;
  switch (preset) {
    case 'last3': return 'Last 3 months';
    case 'last6': return 'Last 6 months';
    case 'last12': return 'Last 12 months';
    case 'ytd': return `Year to date (${latest.slice(0, 4)})`;
    case 'fy_current': return latest ? fy(fyStart(latest)) : 'Current FY';
    case 'fy_previous': return latest ? fy(fyStart(latest) - 1) : 'Previous FY';
    default: return 'Custom';
  }
}

/** Aggregate an arbitrary set of months into ONE period (level = lowest member). */
export function aggregateRange(
  months: MonthlyMIS[],
  completeness: Record<string, PeriodCompleteness>,
  keys: string[],
  label: string,
): PeriodAgg | null {
  const set = new Set(keys);
  const sel = months.filter((m) => set.has(m.key));
  if (!sel.length) return null;
  const [agg] = aggregatePeriods(sel, completeness, 'month', () => 'range');
  return { ...agg, key: `range:${keys.join(',')}`, label: `${label} (${sel.length} month${sel.length === 1 ? '' : 's'})` };
}

// ---- MIS Sheet (G34/G35) ---------------------------------------------------

const DISC_BY_KEY = new Map(DISCOUNT_DATA.map((d) => [d.key, d.discount]));
const MIS_KEYS: (keyof MisPoint)[] = [
  'qty', 'grossRevenue', 'channelMargin', 'returns', 'gst', 'ssClaim', 'discounts', 'netRevenue', 'cogs', 'grossMargin',
  'logistics', 'cm1', 'marketing', 'cm2', 'branding', 'cm3', 'payroll', 'profFee', 'otherExpense', 'otherIncome', 'ebitda',
  'openingCash', 'funding', 'closingCash', 'cashBurn', 'ebitdaBurn', 'runway',
];
// Cascade fields gated by completeness: a period total is blank when any month is.
const GATED: (keyof MisPoint)[] = ['cogs', 'grossMargin', 'logistics', 'cm1', 'marketing', 'cm2', 'branding', 'cm3', 'otherExpense', 'ebitda'];

/**
 * Sum MIS points across months — the legacy sumPoints (nulls stay null when
 * nothing is present), except a completeness-gated cascade row is blank for the
 * total when ANY month is blank (a partial sum would read as a real figure).
 */
export function sumMisPoints(points: MisPoint[]): MisPoint {
  const out = {} as MisPoint;
  for (const k of MIS_KEYS) {
    const vals = points.map((p) => p[k]);
    if (GATED.includes(k) && vals.some((v) => v === null)) { out[k] = null; continue; }
    const nums = vals.filter((v): v is number => v !== null);
    out[k] = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

/**
 * One MIS-format point (₹, costs as positive magnitudes) for a live period —
 * company or one channel — reproducing the legacy MIS Sheet (misSheet.ts):
 *   • per MONTH: company lines from the month; a channel uses the legacy
 *     channelPnl() with ad-spend S&M (the legacy D2C / Amazon ad feeds on
 *     locked/published months, the SKU cells' measured ad on live months);
 *     qty = estimated orders (net ÷ AOV, by source channel) or actual connector
 *     orders where the month reports them;
 *   • a multi-month period (FY total, range) = the SUM of its monthly points.
 * Rows below a month's completeness level are null (blank), never 0.
 */
export function liveMisPoint(
  p: PeriodAgg,
  entity: MisEntity,
  cells: SkuCell[],
  completeness: Record<string, PeriodCompleteness>,
): MisPoint {
  if (p.members.length > 1) {
    const months = p.memberAggs ?? aggregatePeriods([], completeness, 'month');
    return sumMisPoints(months.map((m) => liveMisPoint(m, entity, cells, completeness)));
  }
  const key = p.members[0];
  const v = (row: string, x: number) => (isReal(p.level, row) ? x : null);
  const legacyP = toPeriodMIS(p);
  const actualOrders = p.ordersMonths === 1;
  const ordersOf = (ch: SalesChannel) => (actualOrders ? (p.ordersByChannel[ch] ?? 0) : (p.estOrdersByChannel[ch] ?? 0));
  const disc = DISC_BY_KEY.get(key) ?? null;
  const blank = {
    channelMargin: null, ssClaim: null, payroll: null, profFee: null, otherIncome: null,
    openingCash: null, funding: null, closingCash: null, cashBurn: null, ebitdaBurn: null, runway: null,
  };
  if (entity === 'company') {
    return {
      ...blank,
      qty: Math.round(SALES_CHANNELS.reduce((s, c) => s + ordersOf(c), 0)),
      grossRevenue: p.totalGrossRevenue || null,
      returns: p.hasBuildUp ? p.totalReturns : null,
      gst: p.totalTaxes ? Math.abs(p.totalTaxes) : null,
      discounts: disc,
      netRevenue: p.netRevenue,
      cogs: v('cogm', p.cogm), grossMargin: v('gross_margin', p.grossMargin),
      logistics: v('channel_fulfilment', p.channelFulfillment), cm1: v('cm1', p.cm1),
      marketing: v('sales_marketing', p.salesMarketing), cm2: v('cm2', p.cm2),
      branding: v('platform_payment', p.platformCosts), cm3: v('cm3', p.cm3),
      otherExpense: v('opex', p.opex), ebitda: v('ebitda', p.ebitda),
    };
  }
  const ch = entity;
  const comp = completeness[key];
  const fromFeeds = comp?.locked || comp?.published;
  const adOf = (c: SalesChannel) => cells.reduce((s, x) => (x.m === key && x.ch === c ? s + (x.ad ?? 0) : s), 0);
  const marketing = fromFeeds
    ? { d2c: D2C_AD_SPEND[key] || 0, amazon: AMAZON_AD_SPEND[key] || 0 }
    : { d2c: adOf('D2C'), amazon: adOf('Amazon') };
  const r = channelPnl(legacyP, marketing).find((x) => x.channel === ch)!;
  const share = p.netRevenue ? Math.max(0, p.netByChannel[ch] ?? 0) / p.netRevenue : 0;
  return {
    ...blank,
    qty: Math.round(ordersOf(ch)),
    grossRevenue: p.grossByChannel[ch] ?? null,
    returns: p.returnsByChannel[ch] ?? null,
    gst: p.totalTaxes ? Math.abs(p.totalTaxes) * share : null,
    discounts: ch === 'D2C' ? disc : null,
    netRevenue: p.netByChannel[ch] ?? 0,
    cogs: v('cogm', r.cogm), grossMargin: v('gross_margin', r.grossMargin),
    logistics: v('channel_fulfilment', r.channelFulfillment), cm1: v('cm1', r.cm1),
    marketing: v('sales_marketing', r.salesMarketing), cm2: v('cm2', r.cm2),
    branding: v('platform_payment', r.platformCosts), cm3: v('cm3', r.cm3),
    otherExpense: v('opex', r.opex), ebitda: v('ebitda', r.ebitda),
  };
}

/** Fiscal years present in a deck, each with its months (ascending). */
export function liveFiscalYears(months: MonthlyMIS[]): { key: string; name: string; months: { key: string; label: string }[] }[] {
  const groups = new Map<number, MonthlyMIS[]>();
  for (const m of [...months].sort((a, b) => a.key.localeCompare(b.key))) {
    const s = fyStart(m.key);
    groups.set(s, [...(groups.get(s) ?? []), m]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([s, ms]) => ({
    key: `FY ${s}-${String((s + 1) % 100).padStart(2, '0')}`,
    name: `FY ${s}-${String((s + 1) % 100).padStart(2, '0')}`,
    months: ms.map((m) => ({ key: m.key, label: monthLabel(m.key) })),
  }));
}
