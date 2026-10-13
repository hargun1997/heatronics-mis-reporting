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
import { lookupSku, type Platform } from '../monthClose/skuMap';
import { fetchFacts } from '../liveMis/client';

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

// Sources whose fees are payment-gateway / checkout / BNPL costs — they land on
// Platform & Payment (below CM2), not Channel & Fulfilment.
const PLATFORM_FEE_SOURCES = new Set<string>(['easebuzz', 'shopflo', 'snapmint']);

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

function buildMonth(periodKey: string, reports: ExtractedReport[], monthFacts: DailyFact[] = []): BuiltMonth {
  const session: MonthCloseSession = emptySession(periodKey, periodLabel(periodKey));
  const sources: UploadedSource[] = [];
  const allFacts: DailyFact[] = [...monthFacts];
  let hasTally = false;
  let through: string | null = null;
  const contributors = new Set<string>();

  for (const f of monthFacts) {
    if (f.date && (!through || f.date > through)) through = f.date;
    contributors.add(f.source);
  }

  // Per-period report data: Tally ledgers and the BOM. (Dated facts are routed
  // by their own month in buildLiveDeck and arrive via monthFacts.)
  for (const rep of reports) {
    const p = rep.payload || {};
    const ledgerRows = Array.isArray(p.ledgerRows) ? p.ledgerRows : [];
    const bomCosts = Array.isArray(p.bomCosts) ? p.bomCosts : [];
    if (!ledgerRows.length && !bomCosts.length) continue;
    contributors.add(rep.connectorId);
    sources.push({
      id: `${rep.connectorId}:${rep.slotId}`, label: rep.connectorId, kind: 'skuPnl', method: 'xlsx', addedAt: '',
      nodes: ledgerRows.length ? ledgerRowsToNodes(ledgerRows, rep.connectorId) : [],
      skuRows: [], bomCosts: bomCosts.length ? bomCostsToBomCost(bomCosts, rep.connectorId) : [],
      crossChecks: [], warnings: [],
    });
    if (ledgerRows.length) {
      hasTally = true;
      if (p.nettProfit != null) {
        session.anchor = { nettProfit: { value: p.nettProfit, provenance: prov(rep.connectorId, 'Tally P&L', 'vision', 'read') } };
      }
    }
  }

  // SKU rows from this month's facts — one synthetic source per connector.
  const factsByConn = new Map<string, DailyFact[]>();
  for (const f of monthFacts) {
    const arr = factsByConn.get(f.source) ?? [];
    arr.push(f);
    factsByConn.set(f.source, arr);
  }
  for (const [conn, fs] of factsByConn) {
    const skuRows = factsToSkuRows(fs, conn);
    if (skuRows.length === 0) continue;
    sources.push({
      id: `facts:${conn}`, label: conn, kind: 'skuPnl', method: 'connector',
      addedAt: '', nodes: [], skuRows, bomCosts: [], crossChecks: [], warnings: [],
    });
  }

  session.sources = sources;

  // SKU layer always runs (needs skuRows + bomCosts).
  const sku = computeSku(session);
  const cogmReal = sku.hasSkuSources && sku.costBook.count > 0 && sku.totalCogs !== null;

  // Per-SKU ad spend from an Amazon Advertised Product upload (source
  // 'amazonads'), resolved to FG×channel so SKU contribution can reach a true
  // CM2. When such a report is in, the settlement's lumped "cost of advertising"
  // is dropped from the channel total to avoid double-counting (see below).
  const hasAmazonAds = allFacts.some((f) => f.source === 'amazonads');
  const adByFg = new Map<string, number>(); // `${fgId}|${channel}`
  for (const f of allFacts) {
    if (f.source !== 'amazonads' || !f.sku || !f.spend) continue;
    const hit = lookupSku('amazon' as Platform, f.sku);
    const ch = toSalesChannel(f.channel);
    if (!hit || !ch) continue;
    const key = `${hit.fgId}|${ch}`;
    adByFg.set(key, r2((adByFg.get(key) ?? 0) + (f.spend ?? 0)));
  }

  // D2C ad spend (Meta + Google, channel D2C): product-id rows give measured
  // per-product spend (metaAdByFg); rows with no product id (Google's campaign
  // total, Meta's unattributed residual, or an unmapped id) are the residual
  // pool, spread across D2C products below so per-SKU ad spend still foots to the
  // true monthly total.
  const metaAdByFg = new Map<string, number>(); // `${fgId}|${channel}`
  const metaMeasuredByChan = new Map<SalesChannel, number>();
  const metaResidualByChan = new Map<SalesChannel, number>();
  for (const f of allFacts) {
    if ((f.source !== 'meta' && f.source !== 'googleads') || !f.spend) continue;
    const ch = toSalesChannel(f.channel);
    if (!ch) continue;
    const hit = f.sku ? lookupSku('meta' as Platform, f.sku) : null;
    if (hit) {
      metaAdByFg.set(`${hit.fgId}|${ch}`, r2((metaAdByFg.get(`${hit.fgId}|${ch}`) ?? 0) + f.spend));
      metaMeasuredByChan.set(ch, r2((metaMeasuredByChan.get(ch) ?? 0) + f.spend));
    } else {
      metaResidualByChan.set(ch, r2((metaResidualByChan.get(ch) ?? 0) + f.spend));
    }
  }

  // SKU cells from the aggregates (costed ones only carry real contribution).
  // Measured ad = Amazon per-SKU + Meta per-product; track how much Meta
  // measured actually lands on a cell, so the rest joins the residual pool.
  const metaAppliedByChan = new Map<SalesChannel, number>();
  const skuCells: SkuCell[] = sku.aggregates.map((a) => {
    const metaAd = metaAdByFg.get(`${a.fgId}|${a.channel}`) ?? 0;
    if (metaAd) metaAppliedByChan.set(a.channel, r2((metaAppliedByChan.get(a.channel) ?? 0) + metaAd));
    const ad = r2((adByFg.get(`${a.fgId}|${a.channel}`) ?? 0) + metaAd);
    const cogs = a.cogs ?? 0;
    return {
      m: periodKey, ch: a.channel, p: a.deckName,
      rev: a.revenue, cogs, oth: a.fees,
      con: r2(a.revenue - cogs - a.fees - ad), u: a.units, ad,
    };
  });

  // Spread the Meta residual — spend with no product id, plus any measured
  // whose FG has no cell this month — across that channel's SkuCells by revenue,
  // into `ad`. Keeps per-SKU ad footing to the true monthly Meta total.
  const metaChannels = new Set<SalesChannel>([...metaMeasuredByChan.keys(), ...metaResidualByChan.keys()]);
  for (const ch of metaChannels) {
    const orphan = r2((metaMeasuredByChan.get(ch) ?? 0) - (metaAppliedByChan.get(ch) ?? 0));
    const pool = r2((metaResidualByChan.get(ch) ?? 0) + Math.max(0, orphan));
    if (pool <= 0) continue;
    const cells = skuCells.filter((c) => c.ch === ch);
    const totalRev = cells.reduce((s, c) => s + c.rev, 0);
    if (totalRev <= 0) continue;
    for (const c of cells) {
      const part = r2(pool * (c.rev / totalRev));
      c.ad = r2((c.ad ?? 0) + part);
      c.con = r2(c.con - part);
    }
  }

  // Shiprocket freight is a per-day×channel fact with no SKU, so it never lands
  // on a SkuCell on its own. Allocate each channel's freight across that
  // channel's SkuCells pro-rata by units into `oth` (channel fees), sharpening
  // the SKU/SKU×Channel contribution view. The month-level P&L already counts
  // this freight via channelFulfillment (which sums all fact fees), so this is
  // view-side attribution only — no double count there.
  const freightByChan = new Map<SalesChannel, number>();
  for (const f of allFacts) {
    if (f.source !== 'shiprocket' || !f.fees) continue;
    const ch = toSalesChannel(f.channel);
    if (ch) freightByChan.set(ch, r2((freightByChan.get(ch) ?? 0) + f.fees));
  }
  for (const [ch, freight] of freightByChan) {
    const cells = skuCells.filter((c) => c.ch === ch);
    const totalU = cells.reduce((s, c) => s + c.u, 0);
    if (totalU <= 0 || freight === 0) continue;
    for (const c of cells) {
      const part = r2(freight * (c.u / totalU));
      c.oth = r2(c.oth + part);
      c.con = r2(c.con - part);
    }
  }

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
  let platformCosts = 0;
  for (const f of allFacts) {
    const ch = toSalesChannel(f.channel);
    if (ch && f.revenue) netByChannel[ch] = r2((netByChannel[ch] ?? 0) + f.revenue);
    // Payment-gateway / checkout / BNPL fees are a Platform & Payment cost (below
    // CM2), not channel fulfilment — a gateway charges the basket, not the SKU.
    if (PLATFORM_FEE_SOURCES.has(f.source)) platformCosts = r2(platformCosts + (f.fees ?? 0));
    else channelFulfillment = r2(channelFulfillment + (f.fees ?? 0));
    // When an Amazon ad report is in, its per-SKU + channel spend is the Amazon
    // ad total; drop the settlement's lumped spend so it isn't counted twice.
    const spend = hasAmazonAds && f.source === 'amazon' ? 0 : (f.spend ?? 0);
    salesMarketing = r2(salesMarketing + spend);
  }
  const netRevenue = r2(SALES_CHANNELS.reduce((s, ch) => s + (netByChannel[ch] ?? 0), 0));

  const cogm = cogmReal ? r2((sku.totalCogs ?? 0) + FACTORY_PCT * netRevenue) : 0;
  const grossMargin = cogmReal ? r2(netRevenue - cogm) : 0;
  const cm1 = cogmReal ? r2(grossMargin - channelFulfillment) : 0;
  const cm2 = cogmReal ? r2(cm1 - salesMarketing) : 0;
  // CM3 carries the payment-gateway part of Platform & Payment; its brand-
  // investment part still needs Tally, so the completeness floor stays at CM2.
  const cm3 = cogmReal ? r2(cm2 - platformCosts) : 0;

  const month: MonthlyMIS = {
    key: periodKey, label: periodLabel(periodKey),
    month: Number(periodKey.split('-')[1]), year: Number(periodKey.split('-')[0]),
    netByChannel, grossByChannel: {}, returnsByChannel: {},
    totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0,
    netRevenue, interBranch: 0, turnover: 0,
    grossMargin, cm1, cm2, cm3,
    ebitda: 0, netIncome: 0, cogm,
    channelFulfillment, salesMarketing, platformCosts, opex: 0, nonOperating: 0,
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

const isBomReport = (rep: ExtractedReport) => (rep.payload?.bomCosts?.length ?? 0) > 0;
const factMonth = (f: DailyFact): string | null =>
  f.date && /^\d{4}-\d{2}/.test(f.date) ? f.date.slice(0, 7) : null;

export function buildLiveDeck(reports: ExtractedReport[], liveFacts: DailyFact[] = []): LiveDeckData {
  // The BOM is a period-independent cost book (standard cost per finished good),
  // so it must be available to EVERY month, not only its upload period. Split it
  // out and share it across all periods; keep one per connector:slot (latest).
  const bomByKey = new Map<string, ExtractedReport>();
  for (const rep of reports) {
    if (!isBomReport(rep)) continue;
    const key = `${rep.connectorId}:${rep.slotId}`;
    const prev = bomByKey.get(key);
    if (!prev || rep.periodKey > prev.periodKey) bomByKey.set(key, rep);
  }
  const bomReports = [...bomByKey.values()];

  // Ledger (Tally) reports stay period-specific — they describe one month only.
  // Facts-only reports (Amazon/Shiprocket/…) are grouped here too, but their
  // dated facts are re-routed by month below, so the reps loop ignores them.
  const ledgerByPeriod = new Map<string, ExtractedReport[]>();
  for (const rep of reports) {
    if (isBomReport(rep)) continue;
    if (!/^\d{4}-\d{2}$/.test(rep.periodKey)) continue;
    const arr = ledgerByPeriod.get(rep.periodKey) ?? [];
    arr.push(rep);
    ledgerByPeriod.set(rep.periodKey, arr);
  }

  // Durable upload facts, routed to the month each row actually falls in — a
  // settlement/passbook can straddle two months, so each day lands in its own.
  // uploadKeys records which source+month a durable upload already covers, so a
  // live API pull for the same source+month is suppressed (upload wins).
  const factsByMonth = new Map<string, DailyFact[]>();
  const uploadKeys = new Set<string>();
  const pushFact = (pk: string, f: DailyFact) => {
    const arr = factsByMonth.get(pk) ?? [];
    arr.push(f);
    factsByMonth.set(pk, arr);
  };
  for (const rep of reports) {
    for (const f of rep.payload?.facts ?? []) {
      const pk = factMonth(f);
      if (!pk) continue;
      pushFact(pk, f);
      uploadKeys.add(`${f.source}|${pk}`);
    }
  }
  for (const f of liveFacts) {
    const pk = factMonth(f);
    if (!pk || uploadKeys.has(`${f.source}|${pk}`)) continue;
    pushFact(pk, f);
  }

  const periods = [...new Set([...ledgerByPeriod.keys(), ...factsByMonth.keys()])].sort();
  const months: MonthlyMIS[] = [];
  const skuCells: SkuCell[] = [];
  const completeness: Record<string, PeriodCompleteness> = {};
  // "Complete through" is the end of the CONTIGUOUS run of fully-closed months
  // from the start — a gap (an earlier month not yet closed) stops the floor, so
  // we never claim a later month is closed while an earlier one is still open.
  let completeThrough: string | null = null;
  let floorBroken = false;

  for (const periodKey of periods) {
    // Ledgers for this month + the shared BOM cost book.
    const reps = [...(ledgerByPeriod.get(periodKey) ?? []), ...bomReports];
    const built = buildMonth(periodKey, reps, factsByMonth.get(periodKey) ?? []);
    months.push(built.month);
    skuCells.push(...built.skuCells);
    completeness[periodKey] = built.completeness;
    if (built.completeness.level !== 'full') floorBroken = true;
    else if (!floorBroken) completeThrough = periodKey;
  }

  return { months, skuCells, completeness, completeThrough, periods };
}

/** Live connector facts over a window covering the uploaded months (Shopify D2C today). */
async function fetchLiveFacts(reports: ExtractedReport[]): Promise<DailyFact[]> {
  const today = new Date().toISOString().slice(0, 10);
  let from = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const months = reports.map((r) => r.periodKey).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
  if (months.length) {
    const earliest = `${months[0]}-01`;
    if (earliest < from) from = earliest;
  }
  const res = await fetchFacts(from, today);
  return Array.isArray(res.facts) ? res.facts : [];
}

export async function loadLiveDeck(): Promise<LiveDeckData> {
  const reports = await fetchExtractedReports();
  // Pull live-API channels (Shopify) so D2C revenue and SKUs reach the deck;
  // never fail the whole load if the live pull is unavailable.
  const liveFacts = await fetchLiveFacts(reports).catch(() => [] as DailyFact[]);
  return buildLiveDeck(reports, liveFacts);
}
