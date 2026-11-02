// ----------------------------------------------------------------------------
// Close-slot source catalog — one entry per report slot of the month-end close
// (ids match client/src/data/ingest/catalog.ts), saying how it is filled and,
// for api / sheet slots, how to pull it. See types.ts for the model.
//
// Every pull is READ ONLY and runs on the MIS's own connectors (shared Secret
// Manager credentials, sharedSecrets.ts) — never on another portal's database.
// ----------------------------------------------------------------------------

import { spapiGet } from '../sources/amazon.js';
import { pullAdvertisedProduct } from '../sources/amazonAds.js';
import { payoutsForMonth } from '../sources/easebuzz.js';
import { searchStream } from '../sources/googleAds.js';
import { metaInsights } from '../sources/meta.js';
import { readSheet, TRANZACT_SHEETS } from '../sources/sheets.js';
import { statementLines } from '../sources/shiprocket.js';
import { computedFreight } from '../sources/delhivery.js';
import { amazonAdsProductFacts, googleCampaignFacts, googleProductFacts, metaProductFacts, type GadsRow, type MetaProductRow } from './map/ads.js';
import { financesToFacts, type FinWindow } from './map/amazonFinances.js';
import { addDays, monthDays, rangeEnd } from './map/common.js';
import { easebuzzPayoutFacts, shiprocketStatementFacts, tranzactSheetForMonth } from './map/feeds.js';
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
      if (now + wait > deadline) throw new Error('Amazon Finances paging ran out of time — Pull again in a minute (the pages read so far are not saved).');
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
  if (monthEnd > cap) out.warnings.push(`${ctx.periodKey} is still running — pulled through ${new Date(cap).toISOString().slice(0, 16).replace('T', ' ')} UTC.`);
  return out;
}

// ---- Amazon Ads: advertised product ------------------------------------------

async function amazonAdsProduct(ctx: PullContext): Promise<SlotPull> {
  const r = await pullAdvertisedProduct(ctx.creds, ctx.periodKey, ctx.deadline);
  const out = amazonAdsProductFacts(r.spRows, r.channel, ctx.periodKey);
  out.trace.unshift(`Amazon Ads reporting v3 (read only): ${r.reports} report(s) across ${r.profiles.join(', ')}`);
  return out;
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
  const { first } = monthDays(ctx.periodKey);
  const end = rangeEnd(ctx.periodKey);
  const { rows, pages } = await statementLines(ctx.creds, first, end, ctx.deadline);
  const out = shiprocketStatementFacts(rows, ctx.periodKey);
  out.trace.unshift(`Shiprocket wallet statement API (read only), ${first} → ${end}, ${pages} page(s)`);
  return out;
}

async function easebuzzSettlements(ctx: PullContext): Promise<SlotPull> {
  const { payouts, days } = await payoutsForMonth(ctx.creds, ctx.periodKey, ctx.deadline);
  const out = easebuzzPayoutFacts(payouts, ctx.periodKey);
  out.trace.unshift(`Easebuzz payout enquiry (read only), one call per day × ${days} day(s), ${payouts.length} payout(s)`);
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

// ---- The catalog ----------------------------------------------------------------

export const SLOT_SOURCES: SlotSourceDef[] = [
  // Book of record
  { connectorId: 'tally', slotId: 'pnl', source: 'upload', via: 'Manual upload',
    line: "Tally on cloud doesn't expose its XML port yet — ask Thakur Hardsoft to open port 9000 to us." },
  { connectorId: 'tally', slotId: 'trial-balance', source: 'upload', via: 'Manual upload', line: 'Optional screenshot, read by Claude.' },
  { connectorId: 'tranzact', slotId: 'bom', source: 'claude_task', via: 'Claude task',
    claudeTask: 'Tranzact monthly BOM + template import',
    line: 'Tranzact monthly import task, 18th (Production portal). Tranzact only emails the All BOMs export, so upload it here until the MIS reads it from Production.' },
  { connectorId: 'tranzact', slotId: 'sales', source: 'sheet', via: 'Tranzact daily sheet', parserId: 'tranzact', needs: [],
    line: 'From the Tranzact daily Google Sheet "Sales Invoice Register (Item-wise)" (Recurring Report), filtered to the month.',
    pull: tranzactSales },

  // Marketplaces
  { connectorId: 'amazon', slotId: 'unified-transaction', source: 'api', via: 'Amazon SP-API Finances',
    needs: ['lwaClientId', 'lwaClientSecret', 'refreshToken'], connectHint: 'Shared secrets spapi-* (app needs the Finance and Accounting role).',
    line: 'Pulled from Amazon SP-API Finances (listFinancialEvents) — the events the Unified Transaction report is built from.',
    pull: amazonFinances },
  { connectorId: 'amazon', slotId: 'business-report', source: 'upload', via: 'Manual upload',
    line: 'Optional. Traffic by child item is only an SP-API createReport (Sales & Traffic), which the MIS does not run.' },
  { connectorId: 'flipkart', slotId: 'settlement', source: 'upload', via: 'Manual upload',
    line: "Flipkart API approval pending; its API has no fees / settlement data." },
  { connectorId: 'flipkartads', slotId: 'ad-spend', source: 'upload', via: 'Manual upload',
    line: 'Flipkart API approval pending; its API has no ads data.' },
  { connectorId: 'blinkit', slotId: 'order-charges', source: 'upload', via: 'Manual upload', line: 'Blinkit has no API.' },

  // D2C
  { connectorId: 'shopify', slotId: 'variant-sales', source: 'upload', via: 'Fallback upload',
    line: 'Shopify is pulled live by API (Live MIS); this upload is only the fallback.' },

  // Marketing
  { connectorId: 'meta', slotId: 'ad-spend', source: 'api', via: 'Meta Marketing API',
    needs: ['accessToken', 'adAccountId'], connectHint: 'Shared secrets meta-access-token + meta-ad-account-id.',
    line: 'Pulled from Meta Insights: ad level × product_id for the month + the account total (residual spread by revenue, as the upload).',
    pull: metaProducts },
  { connectorId: 'googleads', slotId: 'ad-spend', source: 'api', via: 'Google Ads API',
    needs: ['clientId', 'clientSecret', 'refreshToken', 'customerId'], connectHint: 'Shared secrets google-ads-*.',
    line: 'Pulled from Google Ads (GAQL campaign cost, searchStream) for the month.',
    pull: googleCampaigns },
  { connectorId: 'googleads', slotId: 'shopping-products', source: 'api', via: 'Google Ads API',
    needs: ['clientId', 'clientSecret', 'refreshToken', 'customerId'], connectHint: 'Shared secrets google-ads-*.',
    line: 'Pulled from Google Ads shopping_performance_view (cost per item id) for the month.',
    pull: googleProducts },
  { connectorId: 'amazonads', slotId: 'ad-spend', source: 'api', via: 'Amazon Ads API',
    needs: ['clientId', 'clientSecret', 'refreshToken'], connectHint: 'Shared secrets adsapi-*.',
    line: 'Pulled from Amazon Ads reporting v3 (spAdvertisedProduct + SB/SD totals). Amazon keeps ~94 days (SB/SD 59); older months stay an upload.',
    pull: amazonAdsProduct },

  // Logistics
  { connectorId: 'shiprocket', slotId: 'passbook', source: 'api', via: 'Shiprocket API',
    needs: ['email', 'password'], connectHint: 'Shared secrets shiprocket-email + shiprocket-password.',
    line: 'Pulled from the Shiprocket wallet statement (passbook) API for the month.',
    pull: shiprocketPassbook },
  { connectorId: 'delhivery', slotId: 'wallet', source: 'api', via: 'Delhivery API (computed)',
    needs: ['apiToken', 'feedToken'],
    connectHint: 'Not connected — create secret delhivery-api-token (and warranty-feed-token = FEED_TOKEN in warranty-manager-env).',
    line: 'Computed freight (Delhivery tracking + charge calculator), not the wallet ledger — compare with the wallet once',
    pull: delhiveryFreight },

  // Payments & checkout
  { connectorId: 'easebuzz', slotId: 'settlement', source: 'api', via: 'Easebuzz payout API',
    needs: ['merchantKey', 'salt'], connectHint: 'Not connected — add key + salt (shared secrets easebuzz-merchant-key, easebuzz-salt, easebuzz-merchant-email).',
    line: 'Pulled from the Easebuzz payout (settlement) API, one enquiry per day of the month.',
    pull: easebuzzSettlements },
  { connectorId: 'shopflo', slotId: 'invoice', source: 'upload', via: 'Manual upload', line: 'One PDF a month (or a billing-history screenshot), read by Claude.' },
  { connectorId: 'snapmint', slotId: 'settlement', source: 'upload', via: 'Manual upload', line: 'No API or scheduled export; the report arrives by email.' },
];

export function slotSource(connectorId: string, slotId: string): SlotSourceDef | undefined {
  return SLOT_SOURCES.find((s) => s.connectorId === connectorId && s.slotId === slotId);
}

/** Scheduled jobs that feed data into the Heatronics portals (shown on the Connectors page). */
export const FEED_TASKS: FeedTask[] = [
  { name: 'Shopflo daily feed', kind: 'claude_task', when: 'Daily, ~11:00 IST',
    what: 'Reads Shopflo checkout analytics with the Shopflo connector (read only) and writes the feed files.', feeds: 'Ops (ops.heatronics.in → D2C → Checkout)' },
  { name: 'Tranzact monthly BOM + template import', kind: 'claude_task', when: 'Monthly, 18th, 10:19 IST',
    what: "Requests the All BOMs + Product Edit template exports in Tranzact and posts the emailed download links.", feeds: 'Production (production.heatronics.in → Monthly cleanup). MIS BOM pricing: upload until it reads from there.' },
  { name: 'Tranzact daily Google Sheets', kind: 'tranzact_recurring', when: 'Daily (Tranzact Recurring Reports)',
    what: 'Sales Invoice Register, Product Price & Inventory and Purchase Invoice Register written to the "Tranzact feed" Drive folder.', feeds: 'MIS (Tranzact Sales Invoice Register slot), Production, Ops' },
];
