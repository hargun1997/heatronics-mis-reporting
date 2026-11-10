// ----------------------------------------------------------------------------
// "Why it moved" — a contribution bridge between two months of the Live MIS.
//
// Pure maths, no I/O. It walks from the earlier month's EBITDA to the later month's EBITDA in steps:
//   revenue:  more / fewer units · price & product mix · channel mix · returns · other
//   cost:     BOM cost of what was sold · stock timing (buying vs using) · factory overhead ·
//             manufacturing cost and inward freight (the other Direct Expenses)
//             channel fees · ads & marketing · payment & platform fees · opex
// Every step is the effect on EBITDA in rupees (+ helps, − hurts) and in ₹ lakh. The steps add up to the
// EBITDA change; anything the cascade cannot explain is shown as "Other / rounding", never hidden.
//
// Inputs are the SAME objects the Live MIS already holds:
//   cur / base         PeriodAgg of ONE month each, on the ACTUAL basis (as booked in Tally)
//   curNorm / baseNorm the same months after normaliseLiveMonths() (BOM cost + factory); used to split COGM
//   cells              the deck's SkuCell rows (units + revenue per product × channel × month)
// Missing data is `null` ("not enough data"), never 0.
// ----------------------------------------------------------------------------

import type { PeriodAgg } from './liveAnalytics';
import type { SkuCell } from './skuChannelPnl';
import type { CompletenessLevel } from './liveDeck';

const r2 = (n: number) => Math.round(n * 100) / 100;
export const LAKH = 100000;
const toLakh = (n: number) => Math.round((n / LAKH) * 100) / 100;

export type StepKind =
  | 'volume' | 'price_mix' | 'channel_mix' | 'returns' | 'revenue_other' | 'revenue'
  | 'bom_cost' | 'stock_timing' | 'cogm' | 'factory' | 'direct_other'
  | 'channel_fees' | 'marketing' | 'platform' | 'opex' | 'other';

export interface BridgeStep {
  id: StepKind;
  label: string;
  /** Effect on EBITDA (or CM2 when the month is not fully closed), rupees. + helps, − hurts. */
  value: number;
  /** Same, in ₹ lakh, 2 decimals. */
  lakh: number;
  /** 'revenue' steps add to Net revenue; 'cost' steps are a cost that moved (value = −Δcost). */
  group: 'revenue' | 'cost';
  /** Smaller pieces of the step (ads by platform, revenue by channel). Same sign rule as `value`. */
  parts?: { label: string; value: number; lakh: number }[];
}

export interface WaterfallBar {
  label: string;
  /** Rupees: the total for 'total' bars, the signed step for others. */
  value: number;
  lakh: number;
  from: number;
  to: number;
  kind: 'total' | 'up' | 'down';
}

export interface BridgeReason { text: string; stepId: StepKind; lakh: number }

export interface Bridge {
  status: 'ok';
  baseKey: string;
  curKey: string;
  baseLabel: string;
  curLabel: string;
  /** What the bridge ends on. */
  endRow: 'ebitda' | 'cm2';
  endLabel: string;
  start: number;
  end: number;
  delta: number;
  startLakh: number;
  endLakh: number;
  deltaLakh: number;
  netRevenue: { base: number; cur: number; delta: number; deltaLakh: number; deltaPct: number | null };
  steps: BridgeStep[];
  bars: WaterfallBar[];
  reasons: BridgeReason[];
  notes: string[];
}

export interface NoBridge { status: 'not_enough_data'; reason: string }
export type BridgeResult = Bridge | NoBridge;

const RANK: Record<CompletenessLevel, number> = { topline: 0, contribution: 1, full: 2 };

// ---- Revenue split from the SKU × channel cells -----------------------------------------------------------

interface Split { volume: number; priceMix: number; channelMix: number; cellDelta: number; byChannel: Record<string, number> }

const usable = (c: SkuCell) => c.p !== 'Accessory (excl)' && Number.isFinite(c.u) && Number.isFinite(c.rev);

/**
 * Volume = Δunits × last month's average price. Channel mix = what the move of units between channels is worth at
 * each channel's last-month price. Price & product mix = the rest of the cells' revenue change (like-for-like price
 * changes, a different product mix, new or dropped lines). Null when either month has no units.
 */
export function splitRevenue(baseCells: SkuCell[], curCells: SkuCell[]): Split | null {
  const b = baseCells.filter(usable);
  const c = curCells.filter(usable);
  const U0 = b.reduce((s, x) => s + x.u, 0);
  const U1 = c.reduce((s, x) => s + x.u, 0);
  if (U0 <= 0 || U1 <= 0) return null;
  const R0 = b.reduce((s, x) => s + x.rev, 0);
  const R1 = c.reduce((s, x) => s + x.rev, 0);
  const P0 = R0 / U0;
  const volume = (U1 - U0) * P0;

  const agg = (cells: SkuCell[]) => {
    const m = new Map<string, { u: number; rev: number }>();
    for (const x of cells) {
      const e = m.get(x.ch) ?? { u: 0, rev: 0 };
      e.u += x.u; e.rev += x.rev; m.set(x.ch, e);
    }
    return m;
  };
  const b1 = agg(b), c1 = agg(c);
  let channelMix = 0;
  for (const [ch, e0] of b1) {
    if (e0.u <= 0) continue;
    const u1 = c1.get(ch)?.u ?? 0;
    channelMix += (u1 - U1 * (e0.u / U0)) * (e0.rev / e0.u);
  }
  const cellDelta = R1 - R0;
  const priceMix = cellDelta - volume - channelMix;
  const byChannel: Record<string, number> = {};
  for (const ch of new Set([...b1.keys(), ...c1.keys()])) byChannel[ch] = (c1.get(ch)?.rev ?? 0) - (b1.get(ch)?.rev ?? 0);
  return { volume, priceMix, channelMix, cellDelta, byChannel };
}

// ---- The bridge --------------------------------------------------------------------------------------

export interface BridgeInput {
  base: PeriodAgg;
  cur: PeriodAgg;
  /** The same two months on the normalised COGM basis; omit when not available (COGM then stays one step). */
  baseNorm?: PeriodAgg | null;
  curNorm?: PeriodAgg | null;
  /** The deck's SKU cells (any months; the two months are picked out). */
  cells?: SkuCell[];
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function buildBridge(inp: BridgeInput): BridgeResult {
  const { base, cur } = inp;
  if (!base || !cur) return { status: 'not_enough_data', reason: 'Two months are needed.' };
  if (base.members.length !== 1 || cur.members.length !== 1) return { status: 'not_enough_data', reason: 'Pick one month, not a range.' };
  const lvl = Math.min(RANK[base.level], RANK[cur.level]);
  if (lvl < 1) return { status: 'not_enough_data', reason: 'One of the two months has only sales numbers so far. Costs come later.' };
  const full = lvl >= 2;
  const endRow = full ? 'ebitda' : 'cm2';
  const startV = full ? base.ebitda : base.cm2;
  const endV = full ? cur.ebitda : cur.cm2;
  if (![startV, endV, base.netRevenue, cur.netRevenue].every(finite)) return { status: 'not_enough_data', reason: 'Numbers are missing for one of the months.' };

  const notes: string[] = [];
  const steps: BridgeStep[] = [];
  const add = (s: Omit<BridgeStep, 'lakh'>) => { steps.push({ ...s, value: r2(s.value), lakh: toLakh(s.value), parts: s.parts }); };

  // -- Revenue --
  const dRev = cur.netRevenue - base.netRevenue;
  const bc = (inp.cells ?? []).filter((c) => c.m === base.members[0]);
  const cc = (inp.cells ?? []).filter((c) => c.m === cur.members[0]);
  const split = splitRevenue(bc, cc);
  const buildUp = base.hasBuildUp && cur.hasBuildUp && (base.totalGrossRevenue !== 0 || cur.totalGrossRevenue !== 0);
  const chParts = (rec: Record<string, number>) => Object.entries(rec).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([label, v]) => ({ label, value: r2(v), lakh: toLakh(v) }));
  if (split) {
    const returns = buildUp ? cur.totalReturns - base.totalReturns : null;
    const other = dRev - split.cellDelta - (returns ?? 0);
    add({ id: 'volume', label: split.volume >= 0 ? 'More units sold' : 'Fewer units sold', value: split.volume, group: 'revenue' });
    add({ id: 'price_mix', label: 'Price and product mix', value: split.priceMix, group: 'revenue' });
    add({ id: 'channel_mix', label: 'Channel mix', value: split.channelMix, group: 'revenue', parts: chParts(split.byChannel) });
    if (returns !== null) add({ id: 'returns', label: returns >= 0 ? 'Fewer returns' : 'More returns', value: returns, group: 'revenue' });
    // What the product cells don't hold (cells ≠ booked revenue: different source, unmapped sales). Shown, never a reason (R10 B2).
    if (Math.abs(other) >= 1) add({ id: 'revenue_other', label: returns !== null ? 'Sales not in product detail' : 'Returns, tax and sales not in product detail', value: other, group: 'revenue' });
  } else {
    const byCh: Record<string, number> = {};
    for (const ch of new Set([...Object.keys(base.netByChannel), ...Object.keys(cur.netByChannel)])) {
      byCh[ch] = ((cur.netByChannel as Record<string, number>)[ch] ?? 0) - ((base.netByChannel as Record<string, number>)[ch] ?? 0);
    }
    add({ id: 'revenue', label: 'Net revenue', value: dRev, group: 'revenue', parts: chParts(byCh) });
    notes.push('No unit numbers for one of the months, so revenue is not split into volume and price.');
  }

  // -- COGM --
  const bN = inp.baseNorm, cN = inp.curNorm;
  const canSplitCogm = !!bN && !!cN && bN.normalisedMonths > 0 && cN.normalisedMonths > 0;
  if (canSplitCogm) {
    const bomB = bN!.cogm - bN!.conversion, bomC = cN!.cogm - cN!.conversion;
    const mfg = (cN!.conversion - cN!.factory) - (bN!.conversion - bN!.factory);
    add({ id: 'bom_cost', label: 'Product cost (BOM) of what was sold', value: -(bomC - bomB), group: 'cost' });
    add({ id: 'stock_timing', label: 'Stock timing (bought vs used)', value: -(cN!.stockVariance - bN!.stockVariance), group: 'cost' });
    add({ id: 'factory', label: 'Factory overhead', value: -(cN!.factory - bN!.factory), group: 'cost' });
    if (Math.abs(mfg) >= 1) add({ id: 'direct_other', label: 'Manufacturing cost and inward freight', value: -mfg, group: 'cost' });
  } else {
    add({ id: 'cogm', label: 'Cost of goods', value: -(cur.cogm - base.cogm), group: 'cost' });
    notes.push('Product cost and stock timing cannot be split: one month has no BOM costing.');
  }

  // -- Below gross margin --
  add({ id: 'channel_fees', label: 'Channel fees and delivery', value: -(cur.channelFulfillment - base.channelFulfillment), group: 'cost' });
  const platforms = new Set([...Object.keys(base.marketingByPlatform ?? {}), ...Object.keys(cur.marketingByPlatform ?? {})]);
  const adParts = [...platforms].map((p) => {
    const d = (cur.marketingByPlatform?.[p] ?? 0) - (base.marketingByPlatform?.[p] ?? 0);
    return { label: p, value: r2(-d), lakh: toLakh(-d) };
  }).filter((x) => Math.abs(x.value) >= 1).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  add({ id: 'marketing', label: 'Ads and marketing', value: -(cur.salesMarketing - base.salesMarketing), group: 'cost', parts: adParts });
  if (full) {
    add({ id: 'platform', label: 'Payment and platform fees', value: -(cur.platformCosts - base.platformCosts), group: 'cost' });
    add({ id: 'opex', label: 'Running costs (opex)', value: -(cur.opex - base.opex), group: 'cost' });
  } else {
    notes.push('This month is not fully closed in Tally, so the bridge stops at profit before payment fees and opex.');
  }

  // -- Anything the cascade did not explain --
  const sum = steps.reduce((s, x) => s + x.value, 0);
  const gap = endV - startV - sum;
  if (Math.abs(gap) >= 1) {
    add({ id: 'other', label: 'Other / rounding', value: gap, group: 'cost' });
    if (Math.abs(gap) > 0.05 * Math.max(Math.abs(endV - startV), 1)) notes.push('A part of the change is not explained by the lines above.');
  }
  if (base.level !== cur.level) notes.push('The two months are not closed to the same level; only the common rows are compared.');

  const endLabel = full ? 'EBITDA' : 'Profit after ads (CM2)';
  const bars: WaterfallBar[] = [{ label: `${endLabel} ${base.label}`, value: startV, lakh: toLakh(startV), from: 0, to: startV, kind: 'total' }];
  let run = startV;
  for (const s of steps) {
    bars.push({ label: s.label, value: s.value, lakh: s.lakh, from: run, to: run + s.value, kind: s.value >= 0 ? 'up' : 'down' });
    run += s.value;
  }
  bars.push({ label: `${endLabel} ${cur.label}`, value: endV, lakh: toLakh(endV), from: 0, to: endV, kind: 'total' });

  const bridge: Bridge = {
    status: 'ok',
    baseKey: base.key, curKey: cur.key, baseLabel: base.label, curLabel: cur.label,
    endRow, endLabel,
    start: r2(startV), end: r2(endV), delta: r2(endV - startV),
    startLakh: toLakh(startV), endLakh: toLakh(endV), deltaLakh: toLakh(endV - startV),
    netRevenue: {
      base: r2(base.netRevenue), cur: r2(cur.netRevenue), delta: r2(dRev), deltaLakh: toLakh(dRev),
      deltaPct: base.netRevenue > 0 ? Math.round((dRev / base.netRevenue) * 1000) / 10 : null,
    },
    steps, bars, reasons: [], notes,
  };
  bridge.reasons = topReasons(bridge);
  return bridge;
}

// ---- The story: top 3 reasons, one line each, at most 10 words -----------------------------------------

const fmtL = (lakh: number) => {
  const a = Math.abs(lakh);
  if (a >= 100) return `₹${(a / 100).toFixed(1)} Cr`;
  return `₹${a.toFixed(a >= 10 ? 1 : 1)} L`;
};

interface Cand { stepId: StepKind; value: number; text: string }

/** One line, ≤ 10 words, plain English. `value` = effect on EBITDA in rupees. */
function phrase(id: StepKind, label: string, value: number): string {
  const l = fmtL(value / LAKH);
  const costUp = value < 0; // a cost step with a negative effect = the cost went up
  switch (id) {
    case 'volume': return value >= 0 ? `More units sold added ${l}` : `Fewer units sold cut ${l}`;
    case 'price_mix': return value >= 0 ? `Better prices and mix added ${l}` : `Lower prices or mix cut ${l}`;
    case 'channel_mix': return value >= 0 ? `Channel mix shift added ${l}` : `Channel mix shift cut ${l}`;
    case 'returns': return value >= 0 ? `Fewer returns added ${l}` : `More returns cut ${l}`;
    case 'revenue': return value >= 0 ? `Sales up ${l}` : `Sales down ${l}`;
    case 'revenue_other': return value >= 0 ? `Other revenue added ${l}` : `Other revenue cut ${l}`;
    case 'bom_cost': return costUp ? `Product cost up ${l}` : `Product cost down ${l}`;
    case 'stock_timing': return value >= 0 ? `Stock timing helped by ${l}` : `Stock timing hurt by ${l}`;
    case 'cogm': return costUp ? `Cost of goods up ${l}` : `Cost of goods down ${l}`;
    case 'factory': return costUp ? `Factory cost up ${l}` : `Factory cost down ${l}`;
    case 'direct_other': return costUp ? `Manufacturing cost and freight up ${l}` : `Manufacturing cost and freight down ${l}`;
    case 'channel_fees': return costUp ? `Channel fees up ${l}` : `Channel fees down ${l}`;
    case 'marketing': return costUp ? `Ads up ${l}` : `Ads down ${l}`;
    case 'platform': return costUp ? `Payment fees up ${l}` : `Payment fees down ${l}`;
    case 'opex': return costUp ? `Running costs up ${l}` : `Running costs down ${l}`;
    default: return value >= 0 ? `${label} added ${l}` : `${label} cut ${l}`;
  }
}

/** Ad platform name → "Amazon ads up ₹4.2 L". Ad platforms keep their own name. */
function adPhrase(platform: string, value: number): string {
  const name = platform.replace(/\s*ads?$/i, '').trim() || platform;
  return `${name} ads ${value < 0 ? 'up' : 'down'} ${fmtL(value / LAKH)}`;
}

export function wordCount(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length; }

/**
 * The 3 biggest effects on EBITDA, by size. Ads are named by platform when one platform explains most of the
 * ads move. A step is only used once (a platform line replaces its parent). Steps under ₹10,000 are not reasons.
 */
export function topReasons(b: Bridge, n = 3): BridgeReason[] {
  const cands: Cand[] = [];
  for (const s of b.steps) {
    if (Math.abs(s.value) < 10000) continue;
    // a gap between two sources (product cells vs books, or what the cascade did not explain) is not a reason
    if (s.id === 'revenue_other' || s.id === 'other') continue;
    if (s.id === 'marketing' && s.parts?.length) {
      const top = s.parts[0];
      if (Math.abs(top.value) >= 0.6 * Math.abs(s.value) && Math.abs(top.value) >= 10000) {
        cands.push({ stepId: s.id, value: top.value, text: adPhrase(top.label, top.value) });
        continue;
      }
    }
    cands.push({ stepId: s.id, value: s.value, text: phrase(s.id, s.label, s.value) });
  }
  return cands
    .sort((a, c) => Math.abs(c.value) - Math.abs(a.value))
    .slice(0, n)
    .map((c) => ({ text: c.text, stepId: c.stepId, lakh: toLakh(c.value) }));
}

/** Headline arrow + words for the EBITDA move, e.g. "▲ up ₹2.1 L" / "▼ down ₹1.0 L" / "no change". */
export function moveWords(deltaLakh: number): { arrow: '▲' | '▼' | '■'; words: string } {
  if (Math.abs(deltaLakh) < 0.005) return { arrow: '■', words: 'no change' };
  return deltaLakh > 0 ? { arrow: '▲', words: `up ${fmtL(deltaLakh)}` } : { arrow: '▼', words: `down ${fmtL(deltaLakh)}` };
}

// ---- Which month to compare with ----------------------------------------------------------------------

const keyIdx = (k: string) => { const [y, m] = k.split('-').map(Number); return y * 12 + (m - 1); };

/** The month key one month / twelve months before `key`, if it is in `keys`. */
export function comparisonKeys(keys: string[], key: string): { previous: string | null; lastYear: string | null } {
  const set = new Set(keys);
  const find = (back: number) => {
    const i = keyIdx(key) - back;
    const k = `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
    return set.has(k) ? k : null;
  };
  return { previous: find(1), lastYear: find(12) };
}
