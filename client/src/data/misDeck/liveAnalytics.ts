// ----------------------------------------------------------------------------
// Live analytics — the view math over the live deck bridge output.
//
// Operates purely on the MonthlyMIS[] + SkuCell[] that liveDeck.ts produces, so
// it never touches the legacy deck's static analytics. Covers what the Live MIS
// tabs need: period aggregation (month/quarter/year), the margin ladder, the
// per-channel cascade split, and the SKU / SKU×Channel contribution matrix.
// ----------------------------------------------------------------------------

import type { MonthlyMIS, SalesChannel } from './misDeckData';
import { SALES_CHANNELS } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';
import type { CompletenessLevel, PeriodCompleteness } from './liveDeck';

const r2 = (n: number) => Math.round(n * 100) / 100;
// Factory overhead added to product COGS at view time (matches the deck).
export const FACTORY_PCT = 0.10;

export type Granularity = 'month' | 'quarter' | 'year';

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
  cm2: number;
  platformCosts: number;
  cm3: number;
  opex: number;
  ebitda: number;
  nonOperating: number;
  costOfFundraising: number;
  netIncome: number;
  /** Lowest completeness across member months — how far down the cascade is real. */
  level: CompletenessLevel;
  hasTally: boolean;
}

/** Aggregate months into month/quarter/year buckets, recomputing margins. */
export function aggregatePeriods(
  months: MonthlyMIS[],
  completeness: Record<string, PeriodCompleteness>,
  gran: Granularity,
): PeriodAgg[] {
  const buckets = new Map<string, PeriodAgg>();
  const asc = [...months].sort((a, b) => a.key.localeCompare(b.key));

  for (const m of asc) {
    const key = bucketKey(m.key, gran);
    const comp = completeness[m.key];
    const lvl = comp?.level ?? 'topline';
    let b = buckets.get(key);
    if (!b) {
      b = {
        key, label: gran === 'month' ? monthLabel(m.key) : key, members: [],
        netByChannel: {}, netRevenue: 0, cogm: 0, grossMargin: 0, channelFulfillment: 0, cm1: 0,
        salesMarketing: 0, cm2: 0, platformCosts: 0, cm3: 0, opex: 0, ebitda: 0,
        nonOperating: 0, costOfFundraising: 0, netIncome: 0, level: 'full', hasTally: true,
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
    b.platformCosts = r2(b.platformCosts + m.platformCosts);
    b.opex = r2(b.opex + m.opex);
    b.nonOperating = r2(b.nonOperating + m.nonOperating);
    b.costOfFundraising = r2(b.costOfFundraising + (m.costOfFundraising ?? 0));
    if (LEVEL_RANK[lvl] < LEVEL_RANK[b.level]) b.level = lvl;
    if (!comp?.hasTally) b.hasTally = false;
  }

  // Recompute the margin ladder from the summed inputs.
  for (const b of buckets.values()) {
    b.grossMargin = r2(b.netRevenue - b.cogm);
    b.cm1 = r2(b.grossMargin - b.channelFulfillment);
    b.cm2 = r2(b.cm1 - b.salesMarketing);
    b.cm3 = r2(b.cm2 - b.platformCosts);
    b.ebitda = r2(b.cm3 - b.opex);
    b.netIncome = r2(b.ebitda - b.nonOperating - b.costOfFundraising);
  }

  return [...buckets.values()].sort((a, b) => a.members[0].localeCompare(b.members[0]));
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
  cm2: number;      // rev − cogs − factory − fees
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
    if (!e) { e = { channel: c.ch, revenue: 0, cogs: 0, factory: 0, fees: 0, cm2: 0, units: 0 }; by.set(c.ch, e); }
    e.revenue = r2(e.revenue + c.rev);
    e.cogs = r2(e.cogs + c.cogs);
    e.factory = r2(e.factory + factory);
    e.fees = r2(e.fees + c.oth);
    e.units = r2(e.units + c.u);
  }
  for (const e of by.values()) e.cm2 = r2(e.revenue - e.cogs - e.factory - e.fees);
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface SkuRoll {
  product: string;
  revenue: number;
  cogs: number;
  factory: number;
  fees: number;
  cm2: number;
  units: number;
  channels: Partial<Record<SalesChannel, number>>; // revenue by channel
}

export function skuRollup(cells: SkuCell[], periodKeys: Set<string>): SkuRoll[] {
  const by = new Map<string, SkuRoll>();
  for (const c of foldCells(cells, periodKeys)) {
    const factory = FACTORY_PCT * c.rev;
    let e = by.get(c.p);
    if (!e) { e = { product: c.p, revenue: 0, cogs: 0, factory: 0, fees: 0, cm2: 0, units: 0, channels: {} }; by.set(c.p, e); }
    e.revenue = r2(e.revenue + c.rev);
    e.cogs = r2(e.cogs + c.cogs);
    e.factory = r2(e.factory + factory);
    e.fees = r2(e.fees + c.oth);
    e.units = r2(e.units + c.u);
    e.channels[c.ch] = r2((e.channels[c.ch] ?? 0) + c.rev);
  }
  for (const e of by.values()) e.cm2 = r2(e.revenue - e.cogs - e.factory - e.fees);
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
  const agg = new Map<string, { rev: number; cogs: number; factory: number; fees: number; units: number }>();
  const products = new Set<string>();
  const channels = new Set<SalesChannel>();
  for (const c of foldCells(cells, periodKeys)) {
    products.add(c.p); channels.add(c.ch);
    const id = `${c.p}|${c.ch}`;
    const e = agg.get(id) ?? { rev: 0, cogs: 0, factory: 0, fees: 0, units: 0 };
    e.rev = r2(e.rev + c.rev); e.cogs = r2(e.cogs + c.cogs);
    e.factory = r2(e.factory + FACTORY_PCT * c.rev); e.fees = r2(e.fees + c.oth); e.units = r2(e.units + c.u);
    agg.set(id, e);
  }
  const cell: Record<string, Partial<Record<SalesChannel, number>>> = {};
  for (const [id, e] of agg) {
    const [p, ch] = id.split('|') as [string, SalesChannel];
    const cm2 = r2(e.rev - e.cogs - e.factory - e.fees);
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
