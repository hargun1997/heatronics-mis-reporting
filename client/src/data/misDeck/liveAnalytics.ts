// ----------------------------------------------------------------------------
// Live analytics — the view math over the live deck bridge output.
//
// Operates purely on the MonthlyMIS[] + SkuCell[] that liveDeck.ts produces, so
// it never touches the legacy deck's static analytics. Covers what the Live MIS
// tabs need: period aggregation (month/quarter/year), the margin ladder, the
// per-channel cascade split, and the SKU / SKU×Channel contribution matrix.
// ----------------------------------------------------------------------------

import type { MonthlyMIS, SalesChannel } from './misDeckData';
import { SALES_CHANNELS, VERTICALS, VERTICAL_BY_CHANNEL } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';
import type { CompletenessLevel, PeriodCompleteness } from './liveDeck';
import type { ChannelRecon, TallyBucketLine } from '../monthClose/schema';

const r2 = (n: number) => Math.round(n * 100) / 100;
// Factory overhead added to product COGS at view time (matches the deck).
export const FACTORY_PCT = 0.10;

export type Granularity = 'month' | 'quarter' | 'year';
/** A bucket function for custom aggregation (e.g. one "range" bucket). */
export type BucketFn = (periodKey: string) => string;

const LEVEL_RANK: Record<CompletenessLevel, number> = { topline: 0, contribution: 1, full: 2 };

// ---- Period keys & labels (Indian FY, Apr–Mar) -----------------------------

/** FY label for a YYYY-MM month, e.g. 2026-05 → "FY26-27", 2026-01 → "FY25-26". */
export function fyOf(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return `FY${String(startYear % 100).padStart(2, '0')}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Fiscal quarter label, e.g. 2026-07 → "Q2 FY26-27". */
export function fqOf(periodKey: string): string {
  const [, m] = periodKey.split('-').map(Number);
  const q = m >= 4 ? Math.floor((m - 4) / 3) + 1 : 4;
  return `Q${q} ${fyOf(periodKey)}`;
}

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTH_LABELS[m] ?? m} ${String(y).slice(2)}`;
}

function bucketKey(periodKey: string, gran: Granularity): string {
  if (gran === 'month') return periodKey;
  if (gran === 'quarter') return fqOf(periodKey);
  return fyOf(periodKey);
}

// ---- Period aggregation ----------------------------------------------------

export interface PeriodAgg {
  key: string;
  label: string;
  members: string[]; // the month keys folded in
  netByChannel: Partial<Record<SalesChannel, number>>;
  netRevenue: number;
  cogm: number;
  grossMargin: number;
  channelFulfillment: number;
  cm1: number;
  salesMarketing: number;
  /** S&M split by ad platform (Google / Meta / Amazon / Flipkart / Other), summed across member months. */
  marketingByPlatform: Record<string, number>;
  cm2: number;
  platformCosts: number;
  cm3: number;
  opex: number;
  ebitda: number;
  nonOperating: number;
  costOfFundraising: number;
  netIncome: number;
  /** Tally expense buckets, summed across member months and merged by line key. */
  tallyLines: TallyBucketLine[];
  /** Channel reconciliation, summed across member months. */
  channelRecon: ChannelRecon;
  /** Lowest completeness across member months — how far down the cascade is real. */
  level: CompletenessLevel;
  hasTally: boolean;
  /** COGM / OPEX ledger lines summed across member months (signed, costs negative; TOTAL rows dropped). */
  cogmLines: Record<string, number>;
  opexLines: Record<string, number>;
  /** Non-Operating ledgers (finance, D&A, tax) — live Tally months only. */
  nonOpLines: Record<string, number>;
  /** Revenue build-up (gross → returns → GST → net). Real only when `hasBuildUp`. */
  grossByChannel: Partial<Record<SalesChannel, number>>;
  returnsByChannel: Partial<Record<SalesChannel, number>>;
  totalGrossRevenue: number;
  totalReturns: number;
  totalTaxes: number;
  /** True when EVERY member month carries its gross/returns/GST build-up. */
  hasBuildUp: boolean;
  /** Actual orders per channel (connector facts), summed over the members that report them. */
  ordersByChannel: Partial<Record<SalesChannel, number>>;
  /** Member months that carry actual order counts. */
  ordersMonths: number;
  /** Any member month shown from the published static MIS (≥ boundary). */
  published: boolean;
  /** Every member month is locked history. */
  locked: boolean;
}

/** "Dec 23" style label of the first / last member month, and the span note ("Dec 23–Mar 24 · 4m"). */
export function scopeOf(p: { members: string[] }): string {
  const n = p.members.length;
  if (!n) return '';
  const a = monthLabel(p.members[0]);
  return n === 1 ? a : `${a}–${monthLabel(p.members[n - 1])} · ${n}m`;
}

/** Aggregate months into month/quarter/year buckets, recomputing margins. */
export function aggregatePeriods(
  months: MonthlyMIS[],
  completeness: Record<string, PeriodCompleteness>,
  gran: Granularity,
  bucketFn?: BucketFn,
): PeriodAgg[] {
  const buckets = new Map<string, PeriodAgg>();
  // Tally buckets and recon are accumulated alongside, then written onto each
  // PeriodAgg in the recompute pass. Keyed by bucket key → line key so a line is
  // merged across member months rather than repeated.
  const tallyByBucket = new Map<string, Map<string, TallyBucketLine>>();
  const reconByBucket = new Map<string, ChannelRecon>();
  const asc = [...months].sort((a, b) => a.key.localeCompare(b.key));

  for (const m of asc) {
    const key = bucketFn ? bucketFn(m.key) : bucketKey(m.key, gran);
    const comp = completeness[m.key];
    const lvl = comp?.level ?? 'topline';
    let b = buckets.get(key);
    if (!b) {
      b = {
        key, label: gran === 'month' ? monthLabel(m.key) : key, members: [],
        netByChannel: {}, netRevenue: 0, cogm: 0, grossMargin: 0, channelFulfillment: 0, cm1: 0,
        salesMarketing: 0, marketingByPlatform: {}, cm2: 0, platformCosts: 0, cm3: 0, opex: 0, ebitda: 0,
        nonOperating: 0, costOfFundraising: 0, netIncome: 0,
        tallyLines: [], channelRecon: { revenueResidue: {}, cogmVariance: 0 },
        level: 'full', hasTally: true,
        cogmLines: {}, opexLines: {}, nonOpLines: {},
        grossByChannel: {}, returnsByChannel: {}, totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0, hasBuildUp: true,
        ordersByChannel: {}, ordersMonths: 0, published: false, locked: true,
      };
      buckets.set(key, b);
    }
    b.members.push(m.key);
    for (const ch of SALES_CHANNELS) {
      if (m.netByChannel[ch]) b.netByChannel[ch] = r2((b.netByChannel[ch] ?? 0) + (m.netByChannel[ch] ?? 0));
    }
    b.netRevenue = r2(b.netRevenue + m.netRevenue);
    b.cogm = r2(b.cogm + m.cogm);
    b.channelFulfillment = r2(b.channelFulfillment + m.channelFulfillment);
    b.salesMarketing = r2(b.salesMarketing + m.salesMarketing);
    for (const [label, v] of Object.entries(m.marketingByPlatform ?? {})) {
      b.marketingByPlatform[label] = r2((b.marketingByPlatform[label] ?? 0) + v);
    }
    b.platformCosts = r2(b.platformCosts + m.platformCosts);
    b.opex = r2(b.opex + m.opex);
    b.nonOperating = r2(b.nonOperating + m.nonOperating);
    b.costOfFundraising = r2(b.costOfFundraising + (m.costOfFundraising ?? 0));
    if (LEVEL_RANK[lvl] < LEVEL_RANK[b.level]) b.level = lvl;
    if (!comp?.hasTally) b.hasTally = false;
    if (comp?.published) b.published = true;
    if (!comp?.locked) b.locked = false;

    // Ledger detail (skip the embedded TOTAL rows — the cascade line is the total).
    const addLines = (into: Record<string, number>, src?: Record<string, number>) => {
      for (const [k, v] of Object.entries(src ?? {})) {
        if (/^total/i.test(k)) continue;
        into[k] = r2((into[k] ?? 0) + v);
      }
    };
    addLines(b.cogmLines, m.cogmLines);
    addLines(b.opexLines, m.opexLines);
    addLines(b.nonOpLines, m.nonOpLines);

    // Revenue build-up: only months whose source carries gross / returns / GST.
    if (m.totalGrossRevenue) {
      for (const ch of SALES_CHANNELS) {
        if (m.grossByChannel?.[ch]) b.grossByChannel[ch] = r2((b.grossByChannel[ch] ?? 0) + (m.grossByChannel[ch] ?? 0));
        if (m.returnsByChannel?.[ch]) b.returnsByChannel[ch] = r2((b.returnsByChannel[ch] ?? 0) + (m.returnsByChannel[ch] ?? 0));
      }
      b.totalGrossRevenue = r2(b.totalGrossRevenue + m.totalGrossRevenue);
      b.totalReturns = r2(b.totalReturns + m.totalReturns);
      b.totalTaxes = r2(b.totalTaxes + m.totalTaxes);
    } else {
      b.hasBuildUp = false;
    }
    if (m.ordersByChannel) {
      b.ordersMonths += 1;
      for (const ch of SALES_CHANNELS) {
        const v = m.ordersByChannel[ch];
        if (v) b.ordersByChannel[ch] = (b.ordersByChannel[ch] ?? 0) + v;
      }
    }

    // Merge this month's Tally buckets into the running set for its period.
    if (m.tallyLines?.length) {
      const lines = tallyByBucket.get(key) ?? new Map<string, TallyBucketLine>();
      for (const line of m.tallyLines) mergeTallyLine(lines, line);
      tallyByBucket.set(key, lines);
    }
    if (m.channelRecon) {
      const recon = reconByBucket.get(key) ?? { revenueResidue: {}, cogmVariance: 0 };
      for (const ch of SALES_CHANNELS) {
        const v = m.channelRecon.revenueResidue[ch];
        if (v !== undefined) recon.revenueResidue[ch] = r2((recon.revenueResidue[ch] ?? 0) + v);
      }
      recon.cogmVariance = r2(recon.cogmVariance + m.channelRecon.cogmVariance);
      reconByBucket.set(key, recon);
    }
  }

  // Recompute the margin ladder from the summed inputs; attach Tally buckets/recon.
  for (const b of buckets.values()) {
    b.grossMargin = r2(b.netRevenue - b.cogm);
    b.cm1 = r2(b.grossMargin - b.channelFulfillment);
    b.cm2 = r2(b.cm1 - b.salesMarketing);
    b.cm3 = r2(b.cm2 - b.platformCosts);
    b.ebitda = r2(b.cm3 - b.opex);
    b.netIncome = r2(b.ebitda - b.nonOperating - b.costOfFundraising);
    b.tallyLines = [...(tallyByBucket.get(b.key)?.values() ?? [])];
    b.channelRecon = reconByBucket.get(b.key) ?? { revenueResidue: {}, cogmVariance: 0 };
  }

  return [...buckets.values()].sort((a, b) => a.members[0].localeCompare(b.members[0]));
}

/** Sum one month's Tally bucket line into the period's running set, by line key. */
function mergeTallyLine(into: Map<string, TallyBucketLine>, line: TallyBucketLine): void {
  const existing = into.get(line.lineKey);
  if (!existing) {
    into.set(line.lineKey, {
      ...line,
      byChannel: { ...line.byChannel },
    });
    return;
  }
  existing.total = r2(existing.total + line.total);
  existing.blended = r2(existing.blended + line.blended);
  for (const ch of SALES_CHANNELS) {
    const v = line.byChannel[ch];
    if (v !== undefined) existing.byChannel[ch] = r2((existing.byChannel[ch] ?? 0) + v);
  }
}

export function marginPct(value: number, net: number): number | null {
  return net ? r2((value / net) * 100) / 100 : null;
}

// ---- Channel / SKU rollups (from SkuCell, to CM2) --------------------------

export interface ChannelRoll {
  channel: SalesChannel;
  revenue: number;
  cogs: number;     // product COGS (no factory)
  factory: number;  // 10% of revenue
  fees: number;     // channel fees (oth)
  ad: number;       // per-SKU ad spend, when an ad report is in
  cm2: number;      // rev − cogs − factory − fees − ad
  units: number;
}

function foldCells(cells: SkuCell[], periodKeys: Set<string>): SkuCell[] {
  return cells.filter((c) => periodKeys.has(c.m));
}

export function channelRollup(cells: SkuCell[], periodKeys: Set<string>): ChannelRoll[] {
  const by = new Map<SalesChannel, ChannelRoll>();
  for (const c of foldCells(cells, periodKeys)) {
    const factory = FACTORY_PCT * c.rev;
    let e = by.get(c.ch);
    if (!e) { e = { channel: c.ch, revenue: 0, cogs: 0, factory: 0, fees: 0, ad: 0, cm2: 0, units: 0 }; by.set(c.ch, e); }
    e.revenue = r2(e.revenue + c.rev);
    e.cogs = r2(e.cogs + c.cogs);
    e.factory = r2(e.factory + factory);
    e.fees = r2(e.fees + c.oth);
    e.ad = r2(e.ad + (c.ad ?? 0));
    e.units = r2(e.units + c.u);
  }
  for (const e of by.values()) e.cm2 = r2(e.revenue - e.cogs - e.factory - e.fees - e.ad);
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface SkuRoll {
  product: string;
  revenue: number;
  cogs: number;
  factory: number;
  fees: number;
  ad: number;
  cm2: number;
  units: number;
  channels: Partial<Record<SalesChannel, number>>; // revenue by channel
}

export function skuRollup(cells: SkuCell[], periodKeys: Set<string>): SkuRoll[] {
  const by = new Map<string, SkuRoll>();
  for (const c of foldCells(cells, periodKeys)) {
    const factory = FACTORY_PCT * c.rev;
    let e = by.get(c.p);
    if (!e) { e = { product: c.p, revenue: 0, cogs: 0, factory: 0, fees: 0, ad: 0, cm2: 0, units: 0, channels: {} }; by.set(c.p, e); }
    e.revenue = r2(e.revenue + c.rev);
    e.cogs = r2(e.cogs + c.cogs);
    e.factory = r2(e.factory + factory);
    e.fees = r2(e.fees + c.oth);
    e.ad = r2(e.ad + (c.ad ?? 0));
    e.units = r2(e.units + c.u);
    e.channels[c.ch] = r2((e.channels[c.ch] ?? 0) + c.rev);
  }
  for (const e of by.values()) e.cm2 = r2(e.revenue - e.cogs - e.factory - e.fees - e.ad);
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}

export type MatrixMetric = 'cm2' | 'revenue' | 'units' | 'cm2pct';

export interface SkuChannelMatrix {
  products: string[];
  channels: SalesChannel[];
  /** cell[product][channel] = the chosen metric. */
  cell: Record<string, Partial<Record<SalesChannel, number>>>;
}

export function skuChannelMatrix(cells: SkuCell[], periodKeys: Set<string>, metric: MatrixMetric): SkuChannelMatrix {
  const agg = new Map<string, { rev: number; cogs: number; factory: number; fees: number; ad: number; units: number }>();
  const products = new Set<string>();
  const channels = new Set<SalesChannel>();
  for (const c of foldCells(cells, periodKeys)) {
    products.add(c.p); channels.add(c.ch);
    const id = `${c.p}|${c.ch}`;
    const e = agg.get(id) ?? { rev: 0, cogs: 0, factory: 0, fees: 0, ad: 0, units: 0 };
    e.rev = r2(e.rev + c.rev); e.cogs = r2(e.cogs + c.cogs);
    e.factory = r2(e.factory + FACTORY_PCT * c.rev); e.fees = r2(e.fees + c.oth);
    e.ad = r2(e.ad + (c.ad ?? 0)); e.units = r2(e.units + c.u);
    agg.set(id, e);
  }
  const cell: Record<string, Partial<Record<SalesChannel, number>>> = {};
  for (const [id, e] of agg) {
    const [p, ch] = id.split('|') as [string, SalesChannel];
    const cm2 = r2(e.rev - e.cogs - e.factory - e.fees - e.ad);
    const v = metric === 'revenue' ? e.rev : metric === 'units' ? e.units
      : metric === 'cm2pct' ? (e.rev ? r2((cm2 / e.rev) * 100) / 100 : 0) : cm2;
    (cell[p] ??= {})[ch] = v;
  }
  const orderedProducts = [...products].sort((a, b) => {
    const sa = [...channels].reduce((s, ch) => s + (cell[a]?.[ch] ?? 0), 0);
    const sb = [...channels].reduce((s, ch) => s + (cell[b]?.[ch] ?? 0), 0);
    return sb - sa;
  });
  const orderedChannels = SALES_CHANNELS.filter((c) => channels.has(c));
  return { products: orderedProducts, channels: orderedChannels, cell };
}

// ---- Bifurcated full P&L: slice by channel / vertical / SKU ------------------
//
// One builder powers every bifurcated P&L. It takes a slice of SkuCells (all of
// them, or filtered to one channel or one product) and splits it into columns —
// channels, verticals, or products. Each column is a FULL cascade down to Net
// Income:
//
//   • Net Revenue → CM2 is bottoms-up, "connectors as true": revenue, COGS
//     (BOM) + 10% factory, channel fees and ad spend all come straight off the
//     SkuCells for that column.
//   • Below CM2 — platform, OPEX, finance — is company-level, so it is spread
//     across columns PRO-RATA by each column's share of the month's net revenue
//     (the user's rule: "CM3 proportionate to each SKU/channel sales; OPEX
//     company-level"). Each column therefore foots to its own Net Income.
//
// For a whole-company slice (no filter, columns cover every channel/SKU) the
// bottoms-up columns do not quite equal Tally — the connectors never see 100% of
// revenue — so a single "Reconciliation → Tally" column carries the per-line gap
// and the Total column is Tally's own authoritative cascade. Filtered slices (one
// SKU across its channels, or one channel across its SKUs) show their own Total.

export type SliceColumnBy = 'channel' | 'vertical' | 'sku';
export interface SliceFilter {
  channel?: SalesChannel;
  product?: string;
}

export interface PnlColumn {
  key: string;
  label: string;
  kind: 'slice' | 'recon' | 'total';
  rev: number;
  cogs: number;
  factory: number;
  cogm: number;
  gm: number;
  fulfilment: number;
  cm1: number;
  marketing: number;
  cm2: number;
  platform: number;
  cm3: number;
  opex: number;
  ebitda: number;
  nonOperating: number;
  netIncome: number;
}

export interface SlicePnl {
  columnBy: SliceColumnBy;
  /** The SKU or channel columns, each a full cascade. */
  columns: PnlColumn[];
  /** Plug to Tally, present only for a whole-company slice. */
  recon: PnlColumn | null;
  /** Σ columns (+recon). Equals Tally for a whole-company slice. */
  total: PnlColumn;
  /** True when `total` is Tally's authoritative cascade (whole-company slice). */
  tied: boolean;
}

interface SliceAgg { rev: number; cogs: number; fees: number; ad: number; units: number }

/** The distinct column keys available for a slice, most revenue first. */
export function sliceOptions(
  cells: SkuCell[],
  periodKeys: Set<string>,
  by: SliceColumnBy,
  filter?: SliceFilter,
): { key: string; label: string; revenue: number }[] {
  const rev = new Map<string, number>();
  for (const c of foldCells(cells, periodKeys)) {
    if (filter?.channel && c.ch !== filter.channel) continue;
    if (filter?.product && c.p !== filter.product) continue;
    const key = by === 'sku' ? c.p : by === 'vertical' ? VERTICAL_BY_CHANNEL[c.ch] : c.ch;
    rev.set(key, r2((rev.get(key) ?? 0) + c.rev));
  }
  const order = by === 'vertical' ? (VERTICALS as readonly string[]) : by === 'channel' ? (SALES_CHANNELS as readonly string[]) : null;
  return [...rev.entries()]
    .map(([key, revenue]) => ({ key, label: key, revenue }))
    .sort((a, b) => (order ? order.indexOf(a.key) - order.indexOf(b.key) : b.revenue - a.revenue));
}

export function slicePnl(
  period: PeriodAgg,
  cells: SkuCell[],
  periodKeys: Set<string>,
  columnBy: SliceColumnBy,
  filter?: SliceFilter,
): SlicePnl {
  const sel = foldCells(cells, periodKeys).filter(
    (c) => (!filter?.channel || c.ch === filter.channel) && (!filter?.product || c.p === filter.product),
  );

  const colKey = (c: SkuCell) => (columnBy === 'sku' ? c.p : columnBy === 'vertical' ? VERTICAL_BY_CHANNEL[c.ch] : c.ch);
  const agg = new Map<string, SliceAgg>();
  for (const c of sel) {
    const k = colKey(c);
    const e = agg.get(k) ?? { rev: 0, cogs: 0, fees: 0, ad: 0, units: 0 };
    e.rev = r2(e.rev + c.rev);
    e.cogs = r2(e.cogs + c.cogs);
    e.fees = r2(e.fees + c.oth);
    e.ad = r2(e.ad + (c.ad ?? 0));
    e.units = r2(e.units + c.u);
    agg.set(k, e);
  }

  // Pro-rata base for the company-level cost below CM2: the month's net revenue,
  // so each column carries its fair share and the pieces foot to the Tally totals.
  const base = period.netRevenue || 0;
  const belowCm2 = (share: number) => ({
    platform: r2(period.platformCosts * share),
    opex: r2(period.opex * share),
    nonOperating: r2((period.nonOperating + period.costOfFundraising) * share),
  });

  const mkCol = (key: string, a: SliceAgg, kind: PnlColumn['kind'] = 'slice'): PnlColumn => {
    const factory = r2(FACTORY_PCT * a.rev);
    const cogm = r2(a.cogs + factory);
    const gm = r2(a.rev - cogm);
    const cm1 = r2(gm - a.fees);
    const cm2 = r2(cm1 - a.ad);
    const b = belowCm2(base ? a.rev / base : 0);
    const cm3 = r2(cm2 - b.platform);
    const ebitda = r2(cm3 - b.opex);
    const netIncome = r2(ebitda - b.nonOperating);
    return {
      key, label: key, kind,
      rev: a.rev, cogs: a.cogs, factory, cogm, gm,
      fulfilment: a.fees, cm1, marketing: a.ad, cm2,
      platform: b.platform, cm3, opex: b.opex, ebitda, nonOperating: b.nonOperating, netIncome,
    };
  };

  const order = columnBy === 'vertical' ? (VERTICALS as readonly string[]) : columnBy === 'channel' ? (SALES_CHANNELS as readonly string[]) : null;
  const columns = [...agg.entries()]
    .map(([k, a]) => mkCol(k, a))
    .sort((x, y) => (order ? order.indexOf(x.key) - order.indexOf(y.key) : y.rev - x.rev));

  const SUM: (keyof PnlColumn)[] = ['rev', 'cogs', 'factory', 'cogm', 'gm', 'fulfilment', 'cm1', 'marketing', 'cm2', 'platform', 'cm3', 'opex', 'ebitda', 'nonOperating', 'netIncome'];
  const foldCols = (label: string, kind: PnlColumn['kind'], src: PnlColumn[]): PnlColumn => {
    const out = { key: `__${kind}`, label, kind } as PnlColumn;
    for (const f of SUM) (out[f] as number) = r2(src.reduce((s, c) => s + (c[f] as number), 0));
    return out;
  };
  const sumCols = foldCols('Total', 'total', columns);

  // Tie to Tally only for a whole-company slice of a month that actually has a
  // Tally close. Without one (a top-line / contribution month) there is no
  // authoritative cascade to reconcile against, so the slice just foots to its
  // own bottoms-up total and the view mutes the rows that are not yet real.
  const whole = !filter?.channel && !filter?.product && period.hasTally;
  if (!whole) {
    return { columnBy, columns, recon: null, total: sumCols, tied: false };
  }

  // Whole-company slice: tie to Tally. Total is Tally's own cascade; recon plugs.
  const tallyFactory = r2(FACTORY_PCT * period.netRevenue);
  const tally: PnlColumn = {
    key: '__tally', label: 'Total', kind: 'total',
    rev: period.netRevenue, cogs: r2(period.cogm - tallyFactory), factory: tallyFactory, cogm: period.cogm, gm: period.grossMargin,
    fulfilment: period.channelFulfillment, cm1: period.cm1, marketing: period.salesMarketing, cm2: period.cm2,
    platform: period.platformCosts, cm3: period.cm3, opex: period.opex, ebitda: period.ebitda,
    nonOperating: r2(period.nonOperating + period.costOfFundraising), netIncome: period.netIncome,
  };
  const recon = { key: '__recon', label: 'Recon → Tally', kind: 'recon' } as PnlColumn;
  for (const f of SUM) (recon[f] as number) = r2((tally[f] as number) - (sumCols[f] as number));
  return { columnBy, columns, recon, total: tally, tied: true };
}
