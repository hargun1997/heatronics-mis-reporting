// ----------------------------------------------------------------------------
// Close-slot source catalog — one entry per report slot of the month-end close
// (ids match client/src/data/ingest/catalog.ts), saying how it is filled and,
// for api / sheet slots, how to pull it. See types.ts for the model.
//
// Every pull is READ ONLY and runs on the MIS's own connectors (shared Secret
// Manager credentials, sharedSecrets.ts) — never on another portal's database.
// ----------------------------------------------------------------------------

import { downloadReportDocument, spapiCreateReport, spapiGet } from '../sources/amazon.js';
import { productionCosts } from '../sources/production.js';
import { pollTally, readTallySnapshot, readTallyState, readTallyTb } from '../tally/snapshots.js';
import shopifyConnector from '../sources/shopify.js';
import { pullAdvertisedProduct } from '../sources/amazonAds.js';
import { opsAdsMonth, type OpsAdsMonth } from '../sources/opsAdsStore.js';
import { payoutsForMonth } from '../sources/easebuzz.js';
import { searchStream } from '../sources/googleAds.js';
import { metaInsights } from '../sources/meta.js';
import { readSheet, TRANZACT_SHEETS } from '../sources/sheets.js';
import { computedCharges } from '../sources/shiprocket.js';
import { computedFreight } from '../sources/delhivery.js';
import { amazonAdsProductFacts, googleCampaignFacts, googleProductFacts, metaProductFacts, type GadsRow, type MetaProductRow } from './map/ads.js';
import { financesToFacts, type FinWindow } from './map/amazonFinances.js';
import { addDays, monthDays, rangeEnd } from './map/common.js';
import { easebuzzPayoutFacts, tranzactSheetForMonth } from './map/feeds.js';
import { productionBomCosts, salesTrafficRows } from './map/costs.js';
import type { FeedTask, PullContext, SlotPull, SlotSourceDef } from './types.js';

// ---- Amazon SP-API Finances (0.5 rps, burst 30 — Amazon's published usage plan) --------

function pacer(rate: number, burst: number) {
  let tokens = burst;
  let at = Date.now();
  return async (deadline: number): Promise<void> => {
    for (;;) {
      const now = Date.now();
      tokens = Math.min(burst, tokens + ((now - at) / 1000) * rate);
      at = now;
      if (tokens >= 1) { tokens -= 1; return; }
      const wait = Math.ceil(((1 - tokens) / rate) * 1000);
      if (now + wait > deadline) throw new Error('Amazon Finances took too long. The pages read are not saved. Pull again in 1 minute.');
      await new Promise((r) => setTimeout(r, wait));
    }
  };
}
const finPace = pacer(0.5, 30);

/** listFinancialEvents for the month in 7-day windows (PostedBefore kept > 2 min in the past). */
async function amazonFinances(ctx: PullContext): Promise<SlotPull> {
  const { first, last } = monthDays(ctx.periodKey);
  const monthStart = Date.parse(`${first}T00:00:00Z`);
  const monthEnd = Date.parse(`${addDays(last, 1)}T00:00:00Z`);
  const cap = Date.now() - 3 * 60_000;
  if (monthStart >= cap) throw new Error(`${ctx.periodKey} has not started yet.`);
  const windows: FinWindow[] = [];
  let pages = 0;
  for (let s = monthStart; s < Math.min(monthEnd, cap); s += 7 * 86_400_000) {
    const e = Math.min(s + 7 * 86_400_000, monthEnd, cap);
    const merged: Record<string, unknown[]> = {};
    let next: string | null = null;
    do {
      await finPace(ctx.deadline);
      const q = new URLSearchParams({ PostedAfter: new Date(s).toISOString(), PostedBefore: new Date(e).toISOString(), MaxResultsPerPage: '100' });
      if (next) q.set('NextToken', next);
      const j = (await spapiGet(ctx.creds, `/finances/v0/financialEvents?${q.toString()}`, 4)) as { payload?: { FinancialEvents?: Record<string, unknown>; NextToken?: string } };
      for (const [k, v] of Object.entries(j.payload?.FinancialEvents ?? {})) if (Array.isArray(v)) (merged[k] ??= []).push(...v);
      next = j.payload?.NextToken ?? null;
      pages += 1;
    } while (next);
    windows.push({ events: merged, fallbackDate: new Date(e - 1).toISOString().slice(0, 10) });
  }
  const out = financesToFacts(windows, ctx.periodKey);
  out.trace.unshift(`Called SP-API Finances listFinancialEvents (read only) — ${pages} page(s), paced at 0.5 req/s`);
  if (monthEnd > cap) out.warnings.push(`${ctx.periodKey} is not finished. Pulled to ${new Date(cap).toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
  return out;
}

// ---- Amazon Ads: advertised product ------------------------------------------

/**
 * Ops' stored copy first (it pulls the same reports daily; a fresh month-long report from Amazon can stay "pending" for
 * hours). Complete = every table holds the month's last finished day. Otherwise Amazon directly; if Amazon is still
 * preparing, Ops' partial copy with a warning (so "Pull & save all" doesn't save it).
 */
async function amazonAdsProduct(ctx: PullContext): Promise<SlotPull> {
  const { first, last } = monthDays(ctx.periodKey);
  const e0 = rangeEnd(ctx.periodKey);
  const end = e0 === last ? e0 : addDays(e0, -1); // running month: Ops holds through yesterday
  let ops: OpsAdsMonth | null = null;
  let opsWhy = '';
  try { ops = await opsAdsMonth(first, end); } catch (e) { opsWhy = e instanceof Error ? e.message : String(e); }
  const covered = (d: string | null) => d == null || d >= end;
  const opsDone = ops && ops.spRows.length > 0 && ops.through.SP != null && ops.through.SP >= end && covered(ops.through.SB) && covered(ops.through.SD);
  if (ops && opsDone) {
    const out = amazonAdsProductFacts(ops.spRows, ops.channel, ctx.periodKey);
    out.trace.unshift(`Amazon Ads from Ops' stored daily reports (BigQuery, read only): ${first} → ${end}, ${ops.profiles} profile(s), ${ops.spRows.length} SP product-day row(s)`);
    return out;
  }
  try {
    const r = await pullAdvertisedProduct(ctx.creds, ctx.periodKey, ctx.deadline);
    const out = amazonAdsProductFacts(r.spRows, r.channel, ctx.periodKey);
    out.trace.unshift(`Amazon Ads reporting v3 (read only): ${r.reports} report(s) across ${r.profiles.join(', ')}`);
    if (!ops) out.trace.push(`Ops' stored copy not used: ${opsWhy || 'not available'}`);
    return out;
  } catch (e) {
    if (!ops || !ops.spRows.length) throw e;
    const out = amazonAdsProductFacts(ops.spRows, ops.channel, ctx.periodKey);
    out.trace.unshift(`Amazon Ads from Ops' stored daily reports (BigQuery): ${first} → ${end}`);
    out.warnings.push(`Partial: Ops has SP through ${ops.through.SP}, SB through ${ops.through.SB ?? '—'}, SD through ${ops.through.SD ?? '—'}; Amazon direct: ${e instanceof Error ? e.message : String(e)}`);
    return out;
  }
}

// ---- Meta: ad level × product ------------------------------------------------

async function metaProducts(ctx: PullContext): Promise<SlotPull> {
  const { first } = monthDays(ctx.periodKey);
  const until = rangeEnd(ctx.periodKey);
  const time_range = JSON.stringify({ since: first, until });
  const [acct, rows] = await Promise.all([
    metaInsights(ctx.creds, { level: 'account', fields: 'spend', time_range }),
    metaInsights(ctx.creds, { level: 'ad', fields: 'spend', breakdowns: 'product_id', time_range }),
  ]);
  const total = acct.reduce((s, r) => s + (parseFloat(String(r.spend ?? '')) || 0), 0);
  const out = metaProductFacts(rows as MetaProductRow[], acct.length ? total : null, ctx.periodKey);
  out.trace.unshift(`Graph Insights (read only): account total + ad-level rows with the product_id breakdown, ${first} → ${until}`);
  return out;
}

// ---- Google Ads ---------------------------------------------------------------

async function googleCampaigns(ctx: PullContext): Promise<SlotPull> {
  const { first } = monthDays(ctx.periodKey);
  const end = rangeEnd(ctx.periodKey);
  const rows = (await searchStream(ctx.creds, `SELECT campaign.name, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${first}' AND '${end}'`)) as GadsRow[];
  return googleCampaignFacts(rows, end);
}

async function googleProducts(ctx: PullContext): Promise<SlotPull> {
  const { first } = monthDays(ctx.periodKey);
  const end = rangeEnd(ctx.periodKey);
  const rows = (await searchStream(
    ctx.creds,
    `SELECT segments.product_item_id, segments.product_title, metrics.cost_micros FROM shopping_performance_view WHERE segments.date BETWEEN '${first}' AND '${end}'`,
  )) as GadsRow[];
  return googleProductFacts(rows, end);
}

// ---- Shiprocket, Easebuzz, Tranzact -----------------------------------------

async function shiprocketPassbook(ctx: PullContext): Promise<SlotPull> {
  return computedCharges(ctx.creds, ctx.periodKey, ctx.deadline);
}

async function easebuzzSettlements(ctx: PullContext): Promise<SlotPull> {
  const { payouts, days, calls, warnings } = await payoutsForMonth(ctx.creds, ctx.periodKey, ctx.deadline);
  const out = easebuzzPayoutFacts(payouts, ctx.periodKey);
  out.trace.unshift(`Easebuzz settlements enquiry (read only), ${calls} call(s) for ${days} day(s) (a full answer of 20 is split and asked again), ${payouts.length} settlement(s)`);
  out.warnings.push(...warnings);
  return out;
}

async function tranzactSales(ctx: PullContext): Promise<SlotPull> {
  const rows = await readSheet(TRANZACT_SHEETS.salesInvoiceRegister);
  const out = tranzactSheetForMonth(rows, ctx.periodKey);
  out.trace.unshift(`Read the Tranzact "Sales Invoice Register (Item-wise)" Google Sheet — ${rows.length} row(s) (Sheets API, read only)`);
  return out;
}

async function delhiveryFreight(ctx: PullContext): Promise<SlotPull> {
  return computedFreight(ctx.creds, ctx.periodKey, ctx.deadline);
}

// ---- Production portal: finished-good unit costs (BOM pricing slot) ----------------

async function productionBom(ctx: PullContext): Promise<SlotPull> {
  const got = await productionCosts(ctx.creds, ctx.periodKey);
  const out = productionBomCosts(got.products, got.month, ctx.periodKey);
  out.trace.unshift('Read production.heatronics.in /api/costs (read only)');
  return out;
}

// ---- Amazon Sales & Traffic report (Business Report slot) ---------------------------
// ONE createReport per month asked (GET_SALES_AND_TRAFFIC_REPORT, child ASIN, whole month). The report id
// is kept per month for 2 h, so a pull that runs out of time picks the same report up next time instead
// of requesting another. Amazon's createReport limit is shared with Ops; one call a month is negligible.

const bizReports = new Map<string, { id: string; at: number }>();

async function amazonBusinessReport(ctx: PullContext): Promise<SlotPull> {
  const { first } = monthDays(ctx.periodKey);
  const end = rangeEnd(ctx.periodKey);
  const key = `${ctx.periodKey}|${end}`;
  let held = bizReports.get(key);
  if (!held || Date.now() - held.at > 2 * 3_600_000) {
    const id = await spapiCreateReport(ctx.creds, {
      reportType: 'GET_SALES_AND_TRAFFIC_REPORT',
      dataStartTime: `${first}T00:00:00+05:30`,
      dataEndTime: `${end}T23:59:59+05:30`,
      reportOptions: { dateGranularity: 'MONTH', asinGranularity: 'CHILD' },
    });
    held = { id, at: Date.now() };
    bizReports.set(key, held);
  }
  for (;;) {
    const r = (await spapiGet(ctx.creds, `/reports/2021-06-30/reports/${encodeURIComponent(held.id)}`, 3)) as { processingStatus?: string; reportDocumentId?: string };
    if (r.processingStatus === 'DONE' && r.reportDocumentId) {
      const doc = (await spapiGet(ctx.creds, `/reports/2021-06-30/documents/${encodeURIComponent(r.reportDocumentId)}`, 3)) as { url?: string; compressionAlgorithm?: string };
      const out = salesTrafficRows(JSON.parse(await downloadReportDocument(doc)), ctx.periodKey);
      out.trace.unshift(`Amazon SP-API Sales & Traffic report ${held.id} (${first} → ${end}, by child ASIN)`);
      return out;
    }
    if (r.processingStatus === 'CANCELLED' || r.processingStatus === 'FATAL') {
      bizReports.delete(key);
      throw new Error(`Amazon ${r.processingStatus === 'CANCELLED' ? 'cancelled' : 'could not build'} the Sales & Traffic report. Pull again later.`);
    }
    if (Date.now() + 20_000 > ctx.deadline) throw new Error('Amazon still makes the Sales & Traffic report. Pull again in 5 minutes. The MIS uses the same report.');
    await new Promise((res) => setTimeout(res, 15_000));
  }
}

// ---- Tally P&L (stored snapshot; Tally answers only while open on the cloud machine) -------------

async function tallyPnl(ctx: PullContext): Promise<SlotPull> {
  let snap = await readTallySnapshot(ctx.periodKey);
  if (!snap) {
    await pollTally(ctx.creds, { force: true, skipBooks: true });
    snap = await readTallySnapshot(ctx.periodKey);
  }
  if (!snap) {
    const st = await readTallyState();
    const seen = st.lastOkAt ? new Date(st.lastOkAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'never';
    throw new Error(`No Tally P&L for ${ctx.periodKey}. Tally is not open on the cloud machine (last reached: ${seen}). Open Tally, or upload the P&L Excel.`);
  }
  const age = new Date(snap.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const warnings = [...snap.warnings];
  const end = Date.parse(`${ctx.periodKey}-01T00:00:00+05:30`);
  const monthEnd = new Date(end); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  if (Date.parse(snap.asOf) < monthEnd.getTime() + 5 * 86_400_000) warnings.push(`Tally copy from ${age}. Later entries are not in it. Pull again when the books are final.`);
  return {
    tallyMonth: { period: snap.period, periodLabel: snap.periodLabel, ledgerRows: snap.ledgerRows, nettProfit: snap.nettProfit, asOf: snap.asOf },
    rowCount: snap.ledgerRows.length,
    trace: [`Tally P&L ${snap.periodLabel} as of ${age} (read only, stored copy)`, `${snap.ledgerRows.length} ledgers, Nett Profit ${snap.nettProfit == null ? 'not found' : `₹${Math.round(snap.nettProfit).toLocaleString('en-IN')}`}`],
    warnings,
  };
}

// ---- Tally Trial Balance (stored with the P&L by the same poll) ----------------------------------

async function tallyTb(ctx: PullContext): Promise<SlotPull> {
  let tb = await readTallyTb(ctx.periodKey);
  if (!tb) {
    await pollTally(ctx.creds, { force: true });
    tb = await readTallyTb(ctx.periodKey);
  }
  if (!tb) {
    const st = await readTallyState();
    const seen = st.lastOkAt ? new Date(st.lastOkAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'never';
    throw new Error(`No Tally Trial Balance for ${ctx.periodKey}. Tally is not open on the cloud machine (last reached: ${seen}). Open Tally, or upload the screenshot.`);
  }
  const age = new Date(tb.asOf).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  return {
    trialBalance: { period: tb.period, rows: tb.rows, totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, difference: tb.difference, asOf: tb.asOf },
    rowCount: tb.rows.length,
    trace: [`Tally Trial Balance ${ctx.periodKey} as of ${age} (read only, stored copy)`, `${tb.rows.filter((r) => r.level === 'group').length} groups, ${tb.rows.filter((r) => r.level === 'ledger').length} ledgers · Dr ${inr(tb.totalDebit)} · Cr ${inr(tb.totalCredit)}`],
    warnings: [...tb.warnings],
  };
}

// ---- Shopify variant sales (the same live pull the Live MIS uses, saved for the month) -------------

async function shopifyVariants(ctx: PullContext): Promise<SlotPull> {
  const { first } = monthDays(ctx.periodKey);
  const end = rangeEnd(ctx.periodKey);
  if (!shopifyConnector.fetchFacts) throw new Error('Shopify pull is not available.');
  const r = await shopifyConnector.fetchFacts(ctx.creds, first, end);
  const facts = (r.facts ?? []).filter((f) => (f.date ?? '').slice(0, 7) === ctx.periodKey);
  const rev = facts.reduce((s, f) => s + (f.revenue || 0), 0);
  return {
    facts,
    rowCount: facts.length,
    trace: [`Shopify Admin API orders (read only), ${first} → ${end}: ${facts.length} day × variant row(s), gross ₹${Math.round(rev).toLocaleString('en-IN')}`],
    warnings: [...(r.warnings ?? [])],
    emptyOk: true,
  };
}

// ---- The catalog ----------------------------------------------------------------

export const SLOT_SOURCES: SlotSourceDef[] = [
  // Book of record
  { connectorId: 'tally', slotId: 'pnl', source: 'api', via: 'Tally (cloud, read only)',
    needs: ['host'], connectHint: 'Not connected. Enter the Tally host and port on Setup → Tally.',
    line: 'Read from Tally on the cloud machine when it is open. Checked every 30 minutes in working hours from the 15th, then stored. Upload the Excel if the pull fails.',
    pull: tallyPnl },
  { connectorId: 'tally', slotId: 'trial-balance', source: 'api', via: 'Tally (cloud, read only)',
    needs: ['host'], connectHint: 'Not connected. Enter the Tally host and port on Setup → Tally.',
    line: 'Stored with the P&L by the same Tally check. Closing Dr / Cr per group at month end, checked to tie. Record only: the P&L drives the numbers. Upload a screenshot if the pull fails.',
    pull: tallyTb },
  { connectorId: 'tranzact', slotId: 'bom', source: 'api', via: 'Production portal', claudeTask: 'Portal feeds: Mac Chrome',
    needs: [], credsFrom: 'production',
    line: 'Unit cost per finished good from production.heatronics.in. Each BOM uses the latest purchase price of its parts, without GST.',
    pull: productionBom },
  { connectorId: 'tranzact', slotId: 'sales', source: 'sheet', via: 'Tranzact daily sheet', parserId: 'tranzact', needs: [],
    line: 'Read from the Tranzact daily Google Sheet "Sales Invoice Register (Item-wise)", for the month only.',
    pull: tranzactSales },

  // Marketplaces
  { connectorId: 'amazon', slotId: 'unified-transaction', source: 'api', via: 'Amazon SP-API Finances',
    needs: ['lwaClientId', 'lwaClientSecret', 'refreshToken'], connectHint: 'Not connected. Add the shared secrets spapi-*. The app needs the Finance and Accounting role.',
    line: 'Pulled from Amazon SP-API Finances. These are the events behind the Unified Transaction report.',
    pull: amazonFinances },
  { connectorId: 'amazon', slotId: 'business-report', source: 'api', via: 'Amazon SP-API Reports',
    parserId: 'amazonbiz', needs: ['lwaClientId', 'lwaClientSecret', 'refreshToken'], connectHint: 'Not connected. Add the shared secrets spapi-*. The app needs the Brand Analytics or Selling Partner Insights role.',
    line: 'Pulled from the Amazon Sales & Traffic report (child ASIN, whole month). This is the data behind the Business Report.',
    pull: amazonBusinessReport },
  { connectorId: 'flipkart', slotId: 'settlement', source: 'upload', via: 'Manual upload',
    line: 'Flipkart API waits for approval. Its API has no fee or settlement data.' },
  { connectorId: 'flipkartads', slotId: 'ad-spend', source: 'upload', via: 'Manual upload',
    line: 'Flipkart API waits for approval. Its API has no ads data.' },
  { connectorId: 'blinkit', slotId: 'order-charges', source: 'upload', via: 'Manual upload', line: 'Blinkit has no API.' },

  // D2C
  { connectorId: 'shopify', slotId: 'variant-sales', source: 'api', via: 'Shopify Admin API',
    needs: ['shopDomain'], connectHint: 'Not connected. Enter the Shopify store on Setup → Shopify.',
    line: 'Same Shopify pull as Live MIS (orders by day × variant). Saved for the month, so the numbers do not change. Upload the CSV if the pull fails.',
    pull: shopifyVariants },

  // Marketing
  { connectorId: 'meta', slotId: 'ad-spend', source: 'api', via: 'Meta Marketing API',
    needs: ['accessToken', 'adAccountId'], connectHint: 'Not connected. Add the shared secrets meta-access-token and meta-ad-account-id.',
    line: 'Pulled from Meta Insights: spend per ad and product for the month, plus the account total. The rest is split by sales, as in the upload.',
    pull: metaProducts },
  { connectorId: 'googleads', slotId: 'ad-spend', source: 'api', via: 'Google Ads API',
    needs: ['clientId', 'clientSecret', 'refreshToken', 'customerId'], connectHint: 'Not connected. Add the shared secrets google-ads-*.',
    line: 'Pulled from Google Ads: campaign cost for the month.',
    pull: googleCampaigns },
  { connectorId: 'googleads', slotId: 'shopping-products', source: 'api', via: 'Google Ads API',
    needs: ['clientId', 'clientSecret', 'refreshToken', 'customerId'], connectHint: 'Not connected. Add the shared secrets google-ads-*.',
    line: 'Pulled from Google Ads: cost per shopping item for the month.',
    pull: googleProducts },
  { connectorId: 'amazonads', slotId: 'ad-spend', source: 'api', via: 'Amazon Ads API',
    needs: ['clientId', 'clientSecret', 'refreshToken'], connectHint: 'Not connected. Add the shared secrets adsapi-*.',
    line: 'Read from the Amazon Ads copy in Ops, else from Amazon. Amazon keeps 94 days (SB / SD 59). Upload older months.',
    pull: amazonAdsProduct },

  // Logistics
  { connectorId: 'shiprocket', slotId: 'passbook', source: 'api', via: 'Shiprocket API (computed)',
    needs: ['email', 'password'], connectHint: 'Not connected. Add the shared secrets shiprocket-email and shiprocket-password.',
    line: 'Calculated from shipment charges (freight + COD + RTO), not from the wallet. Compare with the passbook once. Date = AWB day (RTO: RTO day).',
    pull: shiprocketPassbook },
  { connectorId: 'delhivery', slotId: 'wallet', source: 'api', via: 'Delhivery API (computed)',
    needs: ['apiToken', 'feedToken'],
    connectHint: 'Not connected. Add the secret delhivery-api-token and warranty-feed-token (= FEED_TOKEN in warranty-manager-env).',
    line: 'Freight calculated from Delhivery tracking and its charge calculator, not from the wallet. Compare with the wallet once.',
    pull: delhiveryFreight },

  // Payments & checkout
  { connectorId: 'easebuzz', slotId: 'settlement', source: 'api', via: 'Easebuzz payout API',
    needs: ['merchantKey', 'salt'], connectHint: 'Not connected. Add the shared secrets easebuzz-merchant-key and easebuzz-salt (Easebuzz → Settings → API keys), or enter them on Setup → Easebuzz.',
    line: 'Pulled from the Easebuzz settlements API for the month: service charge, GST and express fees.',
    pull: easebuzzSettlements },
  { connectorId: 'shopflo', slotId: 'invoice', source: 'upload', via: 'Manual upload', line: 'Upload 1 PDF a month, or a screenshot of the billing history. Claude reads it.' },
  { connectorId: 'snapmint', slotId: 'settlement', source: 'upload', via: 'Manual upload', line: 'No API. The report comes by email. Upload it.' },
];

export function slotSource(connectorId: string, slotId: string): SlotSourceDef | undefined {
  return SLOT_SOURCES.find((s) => s.connectorId === connectorId && s.slotId === slotId);
}

/** Scheduled jobs that feed data into the Heatronics portals (shown on Setup). */
export const FEED_TASKS: FeedTask[] = [
  { name: 'Portal feeds: cloud', kind: 'claude_task', when: 'Daily, ~11:00 IST',
    what: 'Reads Shopflo checkout numbers (read only) and writes the daily files.', feeds: 'Ops (ops.heatronics.in → D2C → Checkout)' },
  { name: 'Portal feeds: Mac Chrome', kind: 'claude_task', when: 'Daily, ~10:15 IST (Tranzact part on the 18th)',
    what: "Runs in Hargun's Mac Chrome. Daily: sends the Amazon LIS lists to Ops. On the 18th: gets the Tranzact BOM exports for Production.", feeds: 'Production (production.heatronics.in → Monthly cleanup) → MIS BOM pricing (read from Production).' },
  { name: 'Tranzact daily Google Sheets', kind: 'tranzact_recurring', when: 'Daily (Tranzact Recurring Reports)',
    what: 'Writes the Sales Invoice Register, Product Price & Inventory and Purchase Invoice Register to the "Tranzact feed" Drive folder.', feeds: 'MIS (Tranzact Sales Invoice Register report), Production, Ops' },
];
