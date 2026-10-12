// ----------------------------------------------------------------------------
// Live deck bridge — turn the durable uploads into the deck's own shapes.
//
// It reads every committed report from the ingest store (GET /api/ingest/
// extracted), groups by month, and rebuilds each month with the SAME proven
// month-close engine the manual close uses:
//
//   • When a Tally P&L is uploaded for the month, we feed its ledger rows into
//     computeClose() and get the FULL cascade (Net Revenue → Net Income),
//     reconciled to Tally — exactly what the legacy deck shows, but live.
//   • When Tally is NOT in yet, we build a partial month from the platform
//     facts alone: real Net Revenue, channel fees, ad spend, and (when BOM +
//     SKU map allow) COGM through Contribution Margin. Everything below is
//     absent and flagged — that is the completeness floor.
//
// The output is MonthlyMIS[] + SkuCell[] (the deck's atoms) plus a per-period
// completeness map, consumed by the Live MIS page. The legacy deck's static
// data is untouched.
// ----------------------------------------------------------------------------

import type { MonthlyMIS, SalesChannel } from './misDeckData';
import { SALES_CHANNELS } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';
import type { DailyFact } from '../liveMis/facts';
import {
  emptySession,
  type BomCost, type LedgerNode, type MonthCloseSession, type Provenance,
  type SkuPlatform, type SkuRow, type UploadedSource,
} from '../monthClose/schema';
import { computeClose } from '../monthClose/compute';
import { computeSku } from '../monthClose/skuRollup';

// Factory overhead convention — 10% of revenue added to product COGS to form
// COGM, matching the deck (analytics.ts FACTORY_PCT) and the committed closes.
const FACTORY_PCT = 0.10;
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---- Returned shape --------------------------------------------------------

/** How complete a month is, and therefore how far down its cascade is real. */
export type CompletenessLevel = 'full' | 'contribution' | 'topline';

export interface PeriodCompleteness {
  periodKey: string;
  /** A Tally P&L is in → everything below CM is real and reconciled. */
  hasTally: boolean;
  /** A BOM is in and products could be costed → COGM / Gross Margin are real. */
  cogmReal: boolean;
  /** How deep the real numbers go. */
  level: CompletenessLevel;
  /** Which connectors contributed data this month. */
  sources: string[];
  /** Latest fact date seen this month (YYYY-MM-DD), or null. */
  through: string | null;
  /** Reconciliation residual vs Tally's Nett Profit, when a Tally P&L is in. */
  reconcileResidual: number | null;
}

export interface LiveDeckData {
  months: MonthlyMIS[];               // ascending by period
  skuCells: SkuCell[];
  completeness: Record<string, PeriodCompleteness>;
  /** The latest month that is fully closed (level 'full') — the "complete through" floor. */
  completeThrough: string | null;
  /** Raw period keys present, ascending. */
  periods: string[];
}

// ---- Store payloads (mirror of server ExtractedReport) ---------------------

interface ExtractedReport {
  connectorId: string;
  slotId: string;
  periodKey: string;
  payload: {
    facts?: DailyFact[];
    bomCosts?: { fgId: string; bomNumber: string; bomName: string; costPerUnit: number }[];
    ledgerRows?: { name: string; depth: number; amount: number; confidence?: number }[];
    nettProfit?: number | null;
    period?: string | null;
  };
}

export async function fetchExtractedReports(): Promise<ExtractedReport[]> {
  const res = await fetch('/api/ingest/extracted');
  const body = (await res.json().catch(() => ({}))) as { reports?: ExtractedReport[]; error?: string };
  if (!res.ok) throw new Error(body.error || `Extracted request failed (${res.status}).`);
  return Array.isArray(body.reports) ? body.reports : [];
}

// ---- Shims: store payloads → month-close inputs ----------------------------

function prov(sourceId: string, sourceLabel: string, method: Provenance['method'], confidence: Provenance['confidence']): Provenance {
  // Committed reports have been through the review step, so treat them as
  // verified — we are displaying a live view, not gating a formal close.
  return { sourceId, sourceLabel, method, confidence, verified: true };
}

/** Tally vision ledger rows → LedgerNode[] the cascade folds. */
function ledgerRowsToNodes(rows: NonNullable<ExtractedReport['payload']['ledgerRows']>, sourceId: string): LedgerNode[] {
  return rows.map((row) => ({
    name: row.name,
    depth: Math.max(0, Math.floor(row.depth ?? 0)),
    path: [],
    amount: row.amount,
    isLeaf: true,
    provenance: prov(sourceId, 'Tally P&L', 'vision', (row.confidence ?? 0) >= 0.9 ? 'exact' : 'read'),
  }));
}

/** Which SKU platform a connector's facts belong to (only these produce SKU rows). */
const PLATFORM_BY_CONNECTOR: Record<string, SkuPlatform> = {
  amazon: 'amazon',
  shopify: 'shopify',
  blinkit: 'blinkit',
  shiprocket: 'shiprocket',
};

/** Platform facts → SkuRow[] (one per platform+sku), for the SKU/cost layer. */
function factsToSkuRows(facts: DailyFact[], connectorId: string): SkuRow[] {
  const platform = PLATFORM_BY_CONNECTOR[connectorId];
  if (!platform) return [];
  const byKey = new Map<string, SkuRow>();
  for (const f of facts) {
    const key = f.sku || f.skuName;
    if (!key) continue; // channel-level fact with no SKU — can't price a product
    const existing = byKey.get(key);
    if (existing) {
      existing.revenue = r2(existing.revenue + f.revenue);
      existing.units = r2(existing.units + f.units);
      existing.fees = r2(existing.fees + (f.fees ?? 0));
    } else {
      byKey.set(key, {
        platform,
        key,
        keyKind: f.sku ? 'sku' : 'title',
        name: f.skuName,
        revenue: r2(f.revenue),
        units: r2(f.units),
        fees: r2(f.fees ?? 0),
        provenance: prov(connectorId, connectorId, 'xlsx', 'exact'),
      });
    }
  }
  return [...byKey.values()];
}

function bomCostsToBomCost(rows: NonNullable<ExtractedReport['payload']['bomCosts']>, sourceId: string): BomCost[] {
  return rows.map((b) => ({
    fgId: b.fgId, bomNumber: b.bomNumber, bomName: b.bomName, costPerUnit: b.costPerUnit,
    provenance: prov(sourceId, 'Tranzact BOM', 'xlsx', 'exact'),
  }));
}

// ---- Channel normalisation for the facts-only path -------------------------

const CHANNEL_ALIASES: Record<string, SalesChannel> = {
  d2c: 'D2C', shopify: 'D2C',
  amazon: 'Amazon',
  blinkit: 'Blinkit',
  oem: 'OEM', offline: 'Offline', export: 'Export',
};
// Channels outside the deck's fixed set (e.g. Flipkart) return null and are not
// yet carried in the facts-only path — none of the wired revenue connectors
// (Shopify/Amazon/Blinkit) hit that case today. Wiring Flipkart will mean
// extending the deck's SalesChannel model, which is a deliberate change.
function toSalesChannel(channel: string): SalesChannel | null {
  return CHANNEL_ALIASES[channel.trim().toLowerCase()] ?? null;
}

// ---- Build one month -------------------------------------------------------

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTH_LABELS[m] ?? m} ${y}`;
}

interface BuiltMonth {
  month: MonthlyMIS;
  skuCells: SkuCell[];
  completeness: PeriodCompleteness;
}

function buildMonth(periodKey: string, reports: ExtractedReport[]): BuiltMonth {
  const session: MonthCloseSession = emptySession(periodKey, periodLabel(periodKey));
  const sources: UploadedSource[] = [];
  const allFacts: DailyFact[] = [];
  let hasTally = false;
  let through: string | null = null;
  const contributors = new Set<string>();

  for (const rep of reports) {
    const p = rep.payload || {};
    const facts = Array.isArray(p.facts) ? p.facts : [];
    const ledgerRows = Array.isArray(p.ledgerRows) ? p.ledgerRows : [];
    const bomCosts = Array.isArray(p.bomCosts) ? p.bomCosts : [];
    if (facts.length || ledgerRows.length || bomCosts.length) contributors.add(rep.connectorId);

    for (const f of facts) { allFacts.push(f); if (f.date && (!through || f.date > through)) through = f.date; }

    const src: UploadedSource = {
      id: `${rep.connectorId}:${rep.slotId}`,
      label: rep.connectorId,
      kind: 'skuPnl',
      method: 'xlsx',
      addedAt: '',
      nodes: ledgerRows.length ? ledgerRowsToNodes(ledgerRows, rep.connectorId) : [],
      skuRows: facts.length ? factsToSkuRows(facts, rep.connectorId) : [],
      bomCosts: bomCosts.length ? bomCostsToBomCost(bomCosts, rep.connectorId) : [],
      crossChecks: [],
      warnings: [],
    };
    sources.push(src);

    if (ledgerRows.length) {
      hasTally = true;
      if (p.nettProfit != null) {
        session.anchor = { nettProfit: { value: p.nettProfit, provenance: prov(rep.connectorId, 'Tally P&L', 'vision', 'read') } };
      }
    }
  }

  session.sources = sources;

  // SKU layer always runs (needs skuRows + bomCosts).
  const sku = computeSku(session);
  const cogmReal = sku.hasSkuSources && sku.costBook.count > 0 && sku.totalCogs !== null;

  // SKU cells from the aggregates (costed ones only carry real contribution).
  const skuCells: SkuCell[] = sku.aggregates.map((a) => ({
    m: periodKey,
    ch: a.channel,
    p: a.deckName,
    rev: a.revenue,
    cogs: a.cogs ?? 0,
    oth: a.fees,
    con: a.contribution ?? r2(a.revenue - (a.cogs ?? 0) - a.fees),
    u: a.units,
  }));

  if (hasTally) {
    // Full cascade from the Tally ledgers — the authoritative monthly close.
    const c = computeClose(session);
    const month: MonthlyMIS = {
      key: periodKey, label: periodLabel(periodKey),
      month: Number(periodKey.split('-')[1]), year: Number(periodKey.split('-')[0]),
      netByChannel: c.netByChannel, grossByChannel: {}, returnsByChannel: {},
      totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0,
      netRevenue: c.netRevenue, interBranch: 0, turnover: 0,
      grossMargin: c.grossMargin, cm1: c.cm1, cm2: c.cm2, cm3: c.cm3,
      ebitda: c.ebitda, netIncome: c.netIncome, cogm: c.cogm,
      channelFulfillment: c.channelFulfillment, salesMarketing: c.salesMarketing,
      platformCosts: c.platformCosts, opex: c.opex, nonOperating: c.nonOperating,
      costOfFundraising: c.costOfFundraising, cogmLines: c.cogmLines, opexLines: c.opexLines,
    };
    return {
      month, skuCells,
      completeness: {
        periodKey, hasTally: true, cogmReal: true, level: 'full',
        sources: [...contributors], through,
        reconcileResidual: c.reconciliation.residual,
      },
    };
  }

  // Facts-only partial month: real top-line + contribution where costable.
  const netByChannel: Partial<Record<SalesChannel, number>> = {};
  let channelFulfillment = 0;
  let salesMarketing = 0;
  for (const f of allFacts) {
    const ch = toSalesChannel(f.channel);
    if (ch && f.revenue) netByChannel[ch] = r2((netByChannel[ch] ?? 0) + f.revenue);
    channelFulfillment = r2(channelFulfillment + (f.fees ?? 0));
    salesMarketing = r2(salesMarketing + (f.spend ?? 0));
  }
  const netRevenue = r2(SALES_CHANNELS.reduce((s, ch) => s + (netByChannel[ch] ?? 0), 0));

  const cogm = cogmReal ? r2((sku.totalCogs ?? 0) + FACTORY_PCT * netRevenue) : 0;
  const grossMargin = cogmReal ? r2(netRevenue - cogm) : 0;
  const cm1 = cogmReal ? r2(grossMargin - channelFulfillment) : 0;
  const cm2 = cogmReal ? r2(cm1 - salesMarketing) : 0;

  const month: MonthlyMIS = {
    key: periodKey, label: periodLabel(periodKey),
    month: Number(periodKey.split('-')[1]), year: Number(periodKey.split('-')[0]),
    netByChannel, grossByChannel: {}, returnsByChannel: {},
    totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0,
    netRevenue, interBranch: 0, turnover: 0,
    grossMargin, cm1, cm2, cm3: cm2,
    ebitda: 0, netIncome: 0, cogm,
    channelFulfillment, salesMarketing, platformCosts: 0, opex: 0, nonOperating: 0,
    costOfFundraising: 0, cogmLines: {}, opexLines: {},
  };
  return {
    month, skuCells,
    completeness: {
      periodKey, hasTally: false, cogmReal,
      level: cogmReal ? 'contribution' : 'topline',
      sources: [...contributors], through, reconcileResidual: null,
    },
  };
}

// ---- Assemble --------------------------------------------------------------

export function buildLiveDeck(reports: ExtractedReport[]): LiveDeckData {
  const byPeriod = new Map<string, ExtractedReport[]>();
  for (const rep of reports) {
    if (!/^\d{4}-\d{2}$/.test(rep.periodKey)) continue;
    const arr = byPeriod.get(rep.periodKey) ?? [];
    arr.push(rep);
    byPeriod.set(rep.periodKey, arr);
  }

  const periods = [...byPeriod.keys()].sort();
  const months: MonthlyMIS[] = [];
  const skuCells: SkuCell[] = [];
  const completeness: Record<string, PeriodCompleteness> = {};
  // "Complete through" is the end of the CONTIGUOUS run of fully-closed months
  // from the start — a gap (an earlier month not yet closed) stops the floor, so
  // we never claim a later month is closed while an earlier one is still open.
  let completeThrough: string | null = null;
  let floorBroken = false;

  for (const periodKey of periods) {
    const built = buildMonth(periodKey, byPeriod.get(periodKey)!);
    months.push(built.month);
    skuCells.push(...built.skuCells);
    completeness[periodKey] = built.completeness;
    if (built.completeness.level !== 'full') floorBroken = true;
    else if (!floorBroken) completeThrough = periodKey;
  }

  return { months, skuCells, completeness, completeThrough, periods };
}

export async function loadLiveDeck(): Promise<LiveDeckData> {
  return buildLiveDeck(await fetchExtractedReports());
}
