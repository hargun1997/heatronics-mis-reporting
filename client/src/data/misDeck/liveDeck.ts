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
import { SALES_CHANNELS, MONTHLY_MIS } from './misDeckData';
import type { SkuCell } from './skuChannelPnl';
import { SKU_CELLS } from './skuChannelPnl';
import { reclassifyEarlyAmazon, decomposeLegacyCell } from './analytics';
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
import { accumulateTags, buildChannelRecon, tagTallyLines, toSalesChannel } from './expenseTagging';

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
  /** True for frozen legacy months (≤ the live boundary) taken from the static deck. */
  locked?: boolean;
  /**
   * True for a month at/after the live boundary that is shown from the
   * PUBLISHED static MIS (the legacy deck's own month) because no full live
   * close exists for it yet. A full Tally-backed live build always replaces it.
   */
  published?: boolean;
  /**
   * Set on a published month when a live, not-yet-full build also exists for
   * it (facts only / to CM2). The published full month is shown by default;
   * the live partial is kept in `LiveDeckData.alternates` and can be swapped in
   * with `preferLivePartials()` — never silently.
   */
  livePartial?: { level: CompletenessLevel; netRevenue: number };
  /** Set on a live partial month that has a published full month it replaced (prefer: 'live'). */
  publishedAvailable?: boolean;
}

// The seam: months before this are frozen legacy (the published static deck);
// this month and after are rebuilt live from uploads. FY26-27 starts Apr 2026,
// so everything through Mar 2026 is locked history and the rebuild owns Apr 2026+.
export const LIVE_BOUNDARY = '2026-04';

/** One product's Amazon traffic for a month (from the Business Report). */
export interface TrafficRow {
  sku: string;
  name: string;
  sessions: number;
  pageViews: number;
  units: number;
}

export interface LiveDeckData {
  months: MonthlyMIS[];               // ascending by period
  skuCells: SkuCell[];
  completeness: Record<string, PeriodCompleteness>;
  /** The latest month that is fully closed (level 'full') — the "complete through" floor. */
  completeThrough: string | null;
  /** Raw period keys present, ascending. */
  periods: string[];
  /** Amazon traffic & conversion per month (from the Business Report), for display only. */
  traffic: Record<string, TrafficRow[]>;
  /**
   * The month build NOT shown for a period that has both a published full month
   * and a live partial: under prefer 'published' this holds the live partial,
   * under prefer 'live' the published month. Swap with preferLivePartials().
   */
  alternates: Record<string, BuiltMonth>;
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
  flipkart: 'flipkart',
  // Tranzact Sales Invoice Register — split by invoice prefix into GT / B2B.
  tranzactgt: 'gt',
  tranzactb2b: 'b2b',
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

// Channel normalisation (toSalesChannel) is shared with the tagging layer and
// imported from expenseTagging.ts — one source of truth for the alias table.

// Sources whose fees land on Platform & Payment (below CM2), not Channel &
// Fulfilment: payment-gateway / checkout / BNPL costs (easebuzz, shopflo,
// snapmint) plus Delhivery warranty/returns freight — an after-sales cost, not a
// cost of fulfilling the original sale, so it sits below CM2 too.
const PLATFORM_FEE_SOURCES = new Set<string>(['easebuzz', 'shopflo', 'snapmint', 'delhivery']);

// ---- Build one month -------------------------------------------------------

/** Actual order counts per channel from the facts (sources that report orders). */
function ordersByChannelOf(facts: DailyFact[]): Partial<Record<SalesChannel, number>> | undefined {
  const out: Partial<Record<SalesChannel, number>> = {};
  for (const f of facts) {
    if (!f.orders) continue;
    const ch = toSalesChannel(f.channel);
    if (ch) out[ch] = (out[ch] ?? 0) + f.orders;
  }
  return Object.keys(out).length ? out : undefined;
}

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTH_LABELS[m] ?? m} ${y}`;
}

export interface BuiltMonth {
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

  // Per-SKU ad spend from a marketplace per-product ad report, resolved to
  // FG×channel so SKU contribution can reach a true CM2: Amazon Advertised
  // Product ('amazonads', platform 'amazon') and Flipkart Consolidated FSN
  // ('flipkartads', platform 'flipkart'). When the Amazon report is in, the
  // settlement's lumped "cost of advertising" is dropped from the channel total
  // to avoid double-counting (see below); the Flipkart settlement carries no
  // lumped ad, so Flipkart ad spend is simply added.
  const hasAmazonAds = allFacts.some((f) => f.source === 'amazonads');
  const adByFg = new Map<string, number>(); // `${fgId}|${channel}`
  for (const f of allFacts) {
    const platform: Platform | null =
      f.source === 'amazonads' ? 'amazon' : f.source === 'flipkartads' ? 'flipkart' : null;
    if (!platform || !f.sku || !f.spend) continue;
    const hit = lookupSku(platform, f.sku);
    const ch = toSalesChannel(f.channel);
    if (!hit || !ch) continue;
    const key = `${hit.fgId}|${ch}`;
    adByFg.set(key, r2((adByFg.get(key) ?? 0) + (f.spend ?? 0)));
  }

  // D2C ad spend (Meta + Google, channel D2C). Product-id rows give measured
  // per-product spend (metaAdByFg); everything else is spread across D2C products
  // by revenue below, so per-SKU ad still foots to the true monthly total.
  //   • Meta ('meta'): product rows = measured; no-sku rows = Meta's precomputed
  //     residual (grand − attributed).
  //   • Google File 1 ('googleads', no sku) = the grand total; Google File 2
  //     ('googleadsproducts', per item id) = measured. Google residual (Search +
  //     unmapped) = googleTotal − googleMeasured, added to the pool.
  const metaAdByFg = new Map<string, number>(); // `${fgId}|${channel}`
  const metaMeasuredByChan = new Map<SalesChannel, number>();
  const metaResidualByChan = new Map<SalesChannel, number>();
  const googleTotalByChan = new Map<SalesChannel, number>();
  const googleMeasuredByChan = new Map<SalesChannel, number>();
  for (const f of allFacts) {
    const isMeta = f.source === 'meta';
    const isGoogleTotal = f.source === 'googleads';
    const isGoogleProd = f.source === 'googleadsproducts';
    if ((!isMeta && !isGoogleTotal && !isGoogleProd) || !f.spend) continue;
    const ch = toSalesChannel(f.channel);
    if (!ch) continue;
    if (isGoogleTotal && !f.sku) { googleTotalByChan.set(ch, r2((googleTotalByChan.get(ch) ?? 0) + f.spend)); continue; }
    const hit = f.sku ? lookupSku('meta' as Platform, f.sku) : null;
    if (hit) {
      metaAdByFg.set(`${hit.fgId}|${ch}`, r2((metaAdByFg.get(`${hit.fgId}|${ch}`) ?? 0) + f.spend));
      metaMeasuredByChan.set(ch, r2((metaMeasuredByChan.get(ch) ?? 0) + f.spend));
      if (isGoogleProd) googleMeasuredByChan.set(ch, r2((googleMeasuredByChan.get(ch) ?? 0) + f.spend));
    } else if (!isGoogleProd) {
      // Meta no-sku residual or unmapped Meta product. Unmapped Google products
      // are not added here — they fall out of googleTotal − googleMeasured.
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
  const metaChannels = new Set<SalesChannel>([
    ...metaMeasuredByChan.keys(), ...metaResidualByChan.keys(), ...googleTotalByChan.keys(),
  ]);
  for (const ch of metaChannels) {
    const orphan = r2((metaMeasuredByChan.get(ch) ?? 0) - (metaAppliedByChan.get(ch) ?? 0));
    const googleResidual = r2((googleTotalByChan.get(ch) ?? 0) - (googleMeasuredByChan.get(ch) ?? 0));
    const pool = r2((metaResidualByChan.get(ch) ?? 0) + Math.max(0, orphan) + Math.max(0, googleResidual));
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

  // Shiprocket forward freight is a per-day×channel fact with no SKU, so it never
  // lands on a SkuCell on its own. Allocate each channel's freight across that
  // channel's SkuCells pro-rata by units into `oth` (channel fees), sharpening
  // the SKU/SKU×Channel contribution view. The month-level P&L already counts
  // this freight via channelFulfillment (which sums all fact fees), so this is
  // view-side attribution only — no double count there. Delhivery is excluded:
  // its warranty/returns freight is a Platform & Payment (below-CM2) cost, not
  // channel fulfilment, so it is not smeared onto forward-sale SKU cells.
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

  // ---- Marketing bifurcation by ad platform -------------------------------
  // Tally books S&M as a single bucket, so the P&L lost the Google / Meta /
  // Amazon / Flipkart split it used to carry. Rebuild it from the connector ad
  // facts using the SAME double-count guards as the S&M scalar below, then plug
  // the gap to the authoritative S&M total as a blended "Other" bucket so the
  // breakdown always foots exactly to the P&L line.
  const adPlatformLabel = (source: string): string | null => {
    switch (source) {
      case 'googleads': return 'Google Ads';
      case 'meta': return 'Meta (FB / Instagram)';
      case 'amazonads': return 'Amazon Ads';
      case 'amazon': return hasAmazonAds ? null : 'Amazon Ads'; // settlement's lumped ad, only when no dedicated report
      case 'flipkartads': return 'Flipkart Ads';
      default: return null; // googleadsproducts (a breakdown of googleads) + non-ad sources
    }
  };
  const MARKETING_PLATFORM_ORDER = ['Google Ads', 'Meta (FB / Instagram)', 'Amazon Ads', 'Flipkart Ads'];
  const adAttributed = new Map<string, number>();
  for (const f of allFacts) {
    if (f.source === 'googleadsproducts') continue; // breakdown of the googleads grand total
    const label = adPlatformLabel(f.source);
    if (!label || !f.spend) continue;
    adAttributed.set(label, r2((adAttributed.get(label) ?? 0) + f.spend));
  }
  const buildMarketingByPlatform = (smTotal: number): Record<string, number> => {
    const out: Record<string, number> = {};
    let attributed = 0;
    for (const label of MARKETING_PLATFORM_ORDER) {
      const v = r2(adAttributed.get(label) ?? 0);
      if (v !== 0) { out[label] = v; attributed = r2(attributed + v); }
    }
    const other = r2(smTotal - attributed);
    // Keep a blended remainder (agency fees, offline, unattributed) so the split
    // foots to the real S&M line; ignore sub-rupee rounding dust.
    if (Math.abs(other) >= 1) out['Other / Blended'] = other;
    return out;
  };

  if (hasTally) {
    // Full cascade from the Tally ledgers — the authoritative monthly close.
    const c = computeClose(session);

    // Retain Tally's own expense buckets and attribute what the connector facts
    // can to channels; whatever they cannot stays as the company-wide blended
    // remainder. Pure view-side: the headline cascade above is unchanged.
    const tags = accumulateTags(allFacts);
    const tallyLines = tagTallyLines(c.tallyLines, tags, c.netByChannel);
    const channelRecon = buildChannelRecon(c.netByChannel, skuCells, c.cogm, c.netRevenue, FACTORY_PCT);

    // Non-Operating broken into its Tally ledgers (finance cost, depreciation,
    // income tax …) — the contributors the close folded onto that line. View-side
    // detail for the P&L drill; the headline nonOperating is unchanged.
    const nonOpLines: Record<string, number> = {};
    for (const pk of c.lines['nl_nonoperating']?.contributors ?? []) {
      const label = pk.node.name;
      nonOpLines[label] = r2((nonOpLines[label] ?? 0) - Math.abs(pk.node.amount));
    }

    const month: MonthlyMIS = {
      key: periodKey, label: periodLabel(periodKey),
      month: Number(periodKey.split('-')[1]), year: Number(periodKey.split('-')[0]),
      ordersByChannel: ordersByChannelOf(allFacts),
      nonOpLines: Object.keys(nonOpLines).length ? nonOpLines : undefined,
      netByChannel: c.netByChannel, grossByChannel: {}, returnsByChannel: {},
      totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0,
      netRevenue: c.netRevenue, interBranch: 0, turnover: 0,
      grossMargin: c.grossMargin, cm1: c.cm1, cm2: c.cm2, cm3: c.cm3,
      ebitda: c.ebitda, netIncome: c.netIncome, cogm: c.cogm,
      channelFulfillment: c.channelFulfillment, salesMarketing: c.salesMarketing,
      marketingByPlatform: buildMarketingByPlatform(c.salesMarketing),
      platformCosts: c.platformCosts, opex: c.opex, nonOperating: c.nonOperating,
      costOfFundraising: c.costOfFundraising, cogmLines: c.cogmLines, opexLines: c.opexLines,
      tallyLines, channelRecon,
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
    // Avoid double-counting ad spend: when the Amazon ads report is in, drop the
    // settlement's lumped ad; the Google products report (File 2) is a breakdown
    // of the campaign report's total (File 1), so it never adds to S&M itself.
    const spend = (hasAmazonAds && f.source === 'amazon') || f.source === 'googleadsproducts' ? 0 : (f.spend ?? 0);
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
    ordersByChannel: ordersByChannelOf(allFacts),
    netByChannel, grossByChannel: {}, returnsByChannel: {},
    totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0,
    netRevenue, interBranch: 0, turnover: 0,
    grossMargin, cm1, cm2, cm3,
    ebitda: 0, netIncome: 0, cogm,
    channelFulfillment, salesMarketing, platformCosts, opex: 0, nonOperating: 0,
    marketingByPlatform: buildMarketingByPlatform(salesMarketing),
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

export interface BuildLiveDeckOptions {
  /**
   * For a month at/after the live boundary that has BOTH a published full month
   * (static MIS) and a live build that is not yet a full close: 'published'
   * (default) shows the published full month and keeps the live partial as an
   * alternate; 'live' shows the live partial and keeps the published month as
   * the alternate. A full live close always wins either way.
   */
  prefer?: 'published' | 'live';
}

// ---- The published static history, normalised to the live conventions ------
//
//  • G1: pre-Oct-2024 "Amazon" revenue is OEM (Amazon launched Oct 2024) —
//    the same reclassification the legacy deck applies at its base.
//  • G7: static months carry Cost of Fundraising INSIDE nonOperating; the
//    month-close engine (and aggregatePeriods) treat them as separate lines.
//    Carve CoF out of nonOperating so both conventions mean the same thing.
function normaliseStaticMonth(m: MonthlyMIS): MonthlyMIS {
  const r = reclassifyEarlyAmazon(m);
  const cof = r.costOfFundraising ?? 0;
  return cof ? { ...r, nonOperating: r2(r.nonOperating - cof), costOfFundraising: cof } : r;
}

//  • G2/G3: a published SKU cell's `oth` still holds the revenue-allocated ad
//    spend. Split it the way the legacy deck does: cf stays in `oth`, the
//    measured ad (product-mix split) moves to `ad`, contribution re-derived.
function normaliseStaticCell(c: SkuCell): SkuCell {
  const { cf, ad } = decomposeLegacyCell(c);
  return { ...c, oth: r2(cf), ad: r2(ad), con: r2(c.rev - c.cogs - cf - ad) };
}

let STATIC_MONTHS: MonthlyMIS[] | null = null;
let STATIC_CELLS: Map<string, SkuCell[]> | null = null;
function staticHistory(): { months: MonthlyMIS[]; cellsByMonth: Map<string, SkuCell[]> } {
  if (!STATIC_MONTHS || !STATIC_CELLS) {
    STATIC_MONTHS = MONTHLY_MIS.map(normaliseStaticMonth).sort((a, b) => a.key.localeCompare(b.key));
    STATIC_CELLS = new Map();
    for (const c of SKU_CELLS) {
      const arr = STATIC_CELLS.get(c.m) ?? [];
      arr.push(normaliseStaticCell(c));
      STATIC_CELLS.set(c.m, arr);
    }
  }
  return { months: STATIC_MONTHS, cellsByMonth: STATIC_CELLS };
}

export function buildLiveDeck(reports: ExtractedReport[], liveFacts: DailyFact[] = [], opts: BuildLiveDeckOptions = {}): LiveDeckData {
  const prefer = opts.prefer ?? 'published';
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

  // Live months are rebuilt only from the boundary onward; everything before it
  // is frozen legacy and must not be recomputed (nor duplicated) from uploads.
  const livePeriods = [...new Set([...ledgerByPeriod.keys(), ...factsByMonth.keys()])]
    .sort()
    .filter((p) => p >= LIVE_BOUNDARY);
  const built = new Map<string, BuiltMonth>();
  for (const periodKey of livePeriods) {
    // Ledgers for this month + the shared BOM cost book.
    const reps = [...(ledgerByPeriod.get(periodKey) ?? []), ...bomReports];
    built.set(periodKey, buildMonth(periodKey, reps, factsByMonth.get(periodKey) ?? []));
  }

  // Splice the published static MIS in:
  //  • before the boundary → frozen, locked history;
  //  • at/after the boundary → the published month is the FALLBACK for any month
  //    with no full live close (G5). A full live close replaces it; a live partial
  //    never silently does — see BuildLiveDeckOptions.prefer.
  const { months: staticMonths, cellsByMonth } = staticHistory();
  const months: MonthlyMIS[] = [];
  const skuCells: SkuCell[] = [];
  const completeness: Record<string, PeriodCompleteness> = {};
  const alternates: Record<string, BuiltMonth> = {};
  const take = (b: BuiltMonth) => {
    months.push(b.month);
    skuCells.push(...b.skuCells);
    completeness[b.month.key] = b.completeness;
  };

  for (const sm of staticMonths) {
    const locked = sm.key < LIVE_BOUNDARY;
    const pub: BuiltMonth = {
      month: sm,
      skuCells: cellsByMonth.get(sm.key) ?? [],
      completeness: {
        periodKey: sm.key, hasTally: true, cogmReal: true, level: 'full',
        sources: [locked ? 'legacy' : 'published'], through: null,
        reconcileResidual: locked ? 0 : null,
        ...(locked ? { locked: true } : { published: true }),
      },
    };
    if (locked) { take(pub); continue; }
    const live = built.get(sm.key);
    if (!live) { take(pub); continue; }
    built.delete(sm.key);
    if (live.completeness.level === 'full') { take(live); continue; }
    if (prefer === 'live') {
      take({ ...live, completeness: { ...live.completeness, publishedAvailable: true } });
      alternates[sm.key] = pub;
    } else {
      take({ ...pub, completeness: { ...pub.completeness, livePartial: { level: live.completeness.level, netRevenue: live.month.netRevenue } } });
      alternates[sm.key] = { ...live, completeness: { ...live.completeness, publishedAvailable: true } };
    }
  }
  // Live months the published MIS never had (after its last month).
  for (const b of built.values()) take(b);

  return finishDeck(months, skuCells, completeness, alternates, factsByMonth);
}

/** Sort, compute the contiguous "complete through" floor, and attach traffic. */
function finishDeck(
  monthsIn: MonthlyMIS[],
  skuCells: SkuCell[],
  completeness: Record<string, PeriodCompleteness>,
  alternates: Record<string, BuiltMonth>,
  factsByMonth: Map<string, DailyFact[]> | null,
  trafficIn?: Record<string, TrafficRow[]>,
): LiveDeckData {
  const allMonths = [...monthsIn].sort((a, b) => a.key.localeCompare(b.key));
  const periods = [...new Set(allMonths.map((m) => m.key))].sort();

  // "Complete through" is the end of the CONTIGUOUS run of fully-closed months
  // from the start. It walks the CALENDAR, not just the months present, so a hole
  // (e.g. Apr–Aug 2026 not uploaded yet, between locked Mar and a live Sep) stops
  // the floor — we never claim a later month is closed while an earlier one is
  // missing or still open.
  let completeThrough: string | null = null;
  if (periods.length) {
    let cur: string | null = periods[0];
    while (cur && completeness[cur]?.level === 'full') {
      completeThrough = cur;
      cur = nextMonthKey(cur);
    }
  }

  // Amazon traffic & conversion per month, aggregated per SKU from the Business
  // Report facts (inert to the P&L — revenue/fees are 0). Display only.
  const traffic: Record<string, TrafficRow[]> = trafficIn ?? {};
  for (const [pk, facts] of factsByMonth ?? []) {
    const byKey = new Map<string, TrafficRow>();
    for (const f of facts) {
      if (f.source !== 'amazonbiz') continue;
      const key = f.sku || f.skuName || '(sku)';
      const e = byKey.get(key) ?? { sku: key, name: f.skuName || key, sessions: 0, pageViews: 0, units: 0 };
      e.sessions += f.sessions ?? 0;
      e.pageViews += f.pageViews ?? 0;
      e.units += f.units ?? 0;
      byKey.set(key, e);
    }
    if (byKey.size) traffic[pk] = [...byKey.values()].sort((a, b) => b.sessions - a.sessions);
  }

  return { months: allMonths, skuCells, completeness, completeThrough, periods, traffic, alternates };
}

/**
 * Swap every alternate in: published ⇄ live partial for the months that have
 * both. Used by the Live MIS "Show live partials" switch; completeThrough is
 * recomputed so the floor stays honest.
 */
export function swapAlternates(deck: LiveDeckData): LiveDeckData {
  const keys = new Set(Object.keys(deck.alternates));
  if (keys.size === 0) return deck;
  const months = deck.months.filter((m) => !keys.has(m.key));
  const cells = deck.skuCells.filter((c) => !keys.has(c.m));
  const completeness = { ...deck.completeness };
  const alternates: Record<string, BuiltMonth> = {};
  for (const k of keys) {
    const alt = deck.alternates[k];
    alternates[k] = {
      month: deck.months.find((m) => m.key === k)!,
      skuCells: deck.skuCells.filter((c) => c.m === k),
      completeness: deck.completeness[k],
    };
    months.push(alt.month);
    cells.push(...alt.skuCells);
    completeness[k] = alt.completeness;
  }
  return finishDeck(months, cells, completeness, alternates, null, deck.traffic);
}

/** "2026-03" → "2026-04", rolling the year at December. */
function nextMonthKey(pk: string): string {
  let [y, m] = pk.split('-').map(Number);
  m += 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
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

/** Current month in IST, 'YYYY-MM'. */
function currentIstMonth(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
}

export async function loadLiveDeck(opts: BuildLiveDeckOptions = {}): Promise<LiveDeckData> {
  // A full-year Tally P&L upload also carries the months still to come (only the
  // opening/closing stock carry-forward, or a post-dated voucher). Those are not
  // months the business has had, so they never enter the deck — otherwise Live
  // MIS, Send report and AI insights open on a future month showing ₹0.
  const thisMonth = currentIstMonth();
  const reports = (await fetchExtractedReports()).filter((r) => !/^\d{4}-\d{2}$/.test(r.periodKey) || r.periodKey <= thisMonth);
  // Pull live-API channels (Shopify) so D2C revenue and SKUs reach the deck;
  // never fail the whole load if the live pull is unavailable.
  const liveFacts = await fetchLiveFacts(reports).catch(() => [] as DailyFact[]);
  return buildLiveDeck(reports, liveFacts, opts);
}
