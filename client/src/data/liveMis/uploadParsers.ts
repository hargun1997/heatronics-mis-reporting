// ----------------------------------------------------------------------------
// Report uploads → daily facts, for sources whose financial data has no API.
//
// Shiprocket's API carries shipments and tracking but not the money — the
// wallet passbook, COD remittance and freight charges are download-only. So
// those arrive as an uploaded report, parsed here into the same DailyFact
// stream the live pulls produce, keyed by day, and merged into Live MIS.
//
// Parsed facts are kept per source in localStorage (per browser), the same
// convenience store the month-close session uses.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import type { DailyFact } from './facts';

const UPLOADS_KEY = 'heatronics.liveMis.uploads';

export interface UploadRecord {
  sourceId: string;
  label: string;
  uploadedAt: string;
  facts: DailyFact[];
  /** First rows of the file, for the readiness preview. */
  rawPreview?: string[][];
  rawRows?: number;
  /** Human-readable extraction steps. */
  trace?: string[];
}

export type UploadStore = Record<string, UploadRecord>;

export function loadUploads(): UploadStore {
  try {
    return JSON.parse(localStorage.getItem(UPLOADS_KEY) || '{}') as UploadStore;
  } catch {
    return {};
  }
}

export function saveUpload(rec: UploadRecord): UploadStore {
  const all = loadUploads();
  all[rec.sourceId] = rec;
  try {
    localStorage.setItem(UPLOADS_KEY, JSON.stringify(all));
  } catch {
    // Quota / private mode — the upload just won't survive a reload.
  }
  return all;
}

export function clearUpload(sourceId: string): UploadStore {
  const all = loadUploads();
  delete all[sourceId];
  try {
    localStorage.setItem(UPLOADS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return all;
}

export function uploadedFacts(store: UploadStore): DailyFact[] {
  return Object.values(store).flatMap((r) => r.facts);
}

// ---- Shared helpers --------------------------------------------------------

const cell = (v: unknown) => String(v ?? '').trim();
const lower = (v: unknown) => cell(v).toLowerCase();

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = cell(v).replace(/[(),₹\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Date cell → "YYYY-MM-DD". Handles the three shapes spreadsheet exports use:
 * an Excel serial number (what xlsx gives for "31-Jul-2026 18:13:11"), a
 * "12-Oct-2026" style string, and an ISO/parseable string. '' if unreadable.
 */
function toISODate(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial: days since 1899-12-30. Use the integer part (the day).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(raw ?? '').trim();
  // "12-Oct-2026" (Shiprocket) and "1 Jul 2026 8:56:34 am UTC" (Amazon) both
  // land here — day, three-letter month, year, separated by a dash or a space.
  const m = s.match(/(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

// ---- Shiprocket wallet passbook → daily freight ----------------------------

// COD / wallet money moving IN — not a cost. Matches the month-close adapter.
const SHIPROCKET_WALLET = /^(freight charges deducted against cod|bank referenceno)/i;

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
}

function findHeader(rows: unknown[][], needles: string[], limit = 30): number {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = (rows[i] ?? []).map(lower);
    if (needles.every((n) => cells.some((c) => c === n))) return i;
  }
  return -1;
}
function col(header: string[], name: string): number {
  return header.indexOf(name);
}

/** Channel a Shiprocket shipment belongs to, from its Channel Order Id suffix. */
function shiprocketChannel(orderId: string): string {
  const s = orderId.toUpperCase();
  if (/D2C|SHOPIFY/.test(s)) return 'D2C';
  if (/AMAZON|AMZ|FB[AM]/.test(s)) return 'Amazon';
  if (/BLINK/.test(s)) return 'Blinkit';
  if (/FLIP/.test(s)) return 'Flipkart';
  return 'D2C'; // Heatronics ships only D2C via Shiprocket, so untagged → D2C
}

function parseShiprocketPassbook(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['amount', 'description']);
  if (hi < 0) {
    return { facts: [], warning: 'No "Amount / Description" header row found — is this the Shiprocket passbook export?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    date: col(header, 'created at'),
    oid: col(header, 'channel order id'),
    amount: col(header, 'amount'),
    desc: col(header, 'description'),
  };

  const byKey = new Map<string, number>(); // `${date}|${channel}`
  let unparsedDates = 0;
  let dataRows = 0;
  let walletExcluded = 0;
  let moneyIn = 0;
  for (const row of rows.slice(hi + 1)) {
    const desc = cell(row[ix.desc]);
    if (!desc) continue;
    dataRows += 1;
    if (SHIPROCKET_WALLET.test(desc)) { walletExcluded += 1; continue; } // COD remittance / bank ref — money movement, not a cost
    const amount = num(row[ix.amount]);
    // Freight charges are negative; anything >= 0 is money in (wallet recharge,
    // COD remittance, credit) and is not a cost.
    if (amount >= 0) { moneyIn += 1; continue; }
    const date = toISODate(row[ix.date]);
    if (!date) { unparsedDates += 1; continue; }
    const channel = ix.oid >= 0 ? shiprocketChannel(cell(row[ix.oid])) : 'Shiprocket';
    const key = `${date}|${channel}`;
    byKey.set(key, (byKey.get(key) ?? 0) - amount);
  }

  const facts: DailyFact[] = [...byKey.entries()].map(([key, fees]) => {
    const [date, channel] = key.split('|');
    return { source: 'shiprocket', channel, date, revenue: 0, units: 0, orders: 0, fees: Math.round(fees * 100) / 100 };
  });
  const total = facts.reduce((s, f) => s + f.fees, 0);
  const warning = unparsedDates > 0 ? `${unparsedDates} row(s) had no readable date and were skipped.` : undefined;
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — found header at row ${hi + 1} (Created At / Channel Order Id / Amount)`,
    `Scanned ${dataRows} rows; excluded ${walletExcluded} wallet/COD transfer(s) + ${moneyIn} money-in row(s) (recharges / remittances / credits)`,
    `Freight by day × channel → ${facts.length} facts, total ₹${Math.round(total).toLocaleString('en-IN')}`,
  ];
  return { facts, warning, trace };
}

// ---- Amazon unified transaction (settlement file) → daily facts ------------

// Rows that are not product sales. A Transfer is the settlement moving to the
// bank — money out, not a cost — and must be excluded or it reads as a huge
// expense. "Cost of advertising" is a real marketing cost, so it lands on
// spend (= MER denominator), not fees.
const AMAZON_AD = /cost of advertising/i;

/**
 * The base Amazon MSKU: the auto-generated XX-XXXX-XXXX id, with any
 * product-name or "-FBM" suffix the seller appended stripped off. This is the
 * key the SKU→FG map uses, and stripping it also merges a product's FBA and FBM
 * rows into one line (both carry the same base MSKU).
 */
function amazonBaseSku(sku: string): { base: string; name: string } {
  const m = sku.match(/^([A-Za-z0-9]{2}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4})(.*)$/);
  if (!m) return { base: sku.trim(), name: '' };
  const name = m[2].replace(/^[-\s]+/, '').replace(/[-\s]*FBM$/i, '').trim();
  return { base: m[1].toUpperCase(), name };
}

interface SkuAgg {
  revenue: number;
  units: number;
  orders: number;
  fees: number;
  name: string;
}

function parseAmazonSettlement(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  // Amazon prints ~14 lines of column definitions above the real header.
  const hi = findHeader(rows, ['date/time', 'type', 'total']);
  if (hi < 0) {
    return {
      facts: [],
      warning: 'No "date/time / type / total" header row found — is this the Amazon unified transaction export?',
    };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    date: col(header, 'date/time'),
    type: col(header, 'type'),
    sku: col(header, 'sku'),
    desc: col(header, 'description'),
    qty: col(header, 'quantity'),
    sales: col(header, 'product sales'),
    shipping: col(header, 'shipping credits'),
    giftWrap: col(header, 'gift wrap credits'),
    rebates: col(header, 'promotional rebates'),
    selling: col(header, 'selling fees'),
    fba: col(header, 'fba fees'),
    otherTxn: col(header, 'other transaction fees'),
    total: col(header, 'total'),
  };
  const missing = (['product sales', 'selling fees', 'total'] as const).filter((h) => col(header, h) < 0);
  if (missing.length > 0) {
    return { facts: [], warning: `Amazon: header is missing column(s): ${missing.join(', ')}.` };
  }

  // Product rows aggregate per day × base-SKU; ad spend and the fees Amazon
  // doesn't attribute to a SKU (storage, removals, reimbursements) stay at the
  // channel level, keyed by day with no SKU.
  const skuDay = new Map<string, SkuAgg>(); // key: `${date}|${base}`
  const chanDay = new Map<string, { fees: number; spend: number }>(); // key: date
  const chan = (date: string) => {
    let d = chanDay.get(date);
    if (!d) { d = { fees: 0, spend: 0 }; chanDay.set(date, d); }
    return d;
  };

  let undated = 0;
  let transfers = 0;
  let dataRows = 0;
  const months = new Set<string>();

  for (const row of rows.slice(hi + 1)) {
    const type = cell(row[ix.type]);
    if (!type) continue;
    dataRows += 1;

    const date = toISODate(row[ix.date]);
    if (!date) { undated += 1; continue; }
    months.add(date.slice(0, 7));

    const sku = ix.sku >= 0 ? cell(row[ix.sku]) : '';

    if (!sku) {
      // A bank payout — money out, not a cost. Count it and skip.
      if (/^transfer$/i.test(type)) { transfers += num(row[ix.total]); continue; }
      // Advertising → spend (the MER denominator), reported as a negative total.
      if (AMAZON_AD.test(cell(row[ix.desc]))) { chan(date).spend += -num(row[ix.total]); continue; }
      // Storage / removals / easy-ship / reimbursements: a real channel cost
      // Amazon does not attribute to a SKU — fold into the day's fees.
      chan(date).fees += -num(row[ix.total]);
      continue;
    }

    const rowRevenue =
      num(row[ix.sales]) + num(row[ix.shipping]) + num(row[ix.giftWrap]) + num(row[ix.rebates]);
    // Fees print negative on a sale, positive on a refund; negating nets both.
    const rowFees = -(num(row[ix.selling]) + num(row[ix.fba]) + num(row[ix.otherTxn]));
    const qty = num(row[ix.qty]);
    if (rowRevenue === 0 && rowFees === 0 && qty === 0) continue;

    // Amazon prints quantity positive even on a refund (negative sale), so key
    // the sign off revenue, not the quantity. A zero-revenue adjustment (an FBA
    // reimbursement) carries a quantity but is inventory written off, not a unit.
    const units = rowRevenue === 0 ? 0 : rowRevenue < 0 ? -Math.abs(qty) : qty;
    const { base, name } = amazonBaseSku(sku);
    const key = `${date}|${base}`;
    let a = skuDay.get(key);
    if (!a) { a = { revenue: 0, units: 0, orders: 0, fees: 0, name }; skuDay.set(key, a); }
    a.revenue += rowRevenue;
    a.fees += rowFees;
    a.units += units;
    if (!a.name && name) a.name = name;
    if (/^order$/i.test(type) && rowRevenue > 0) a.orders += 1;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const facts: DailyFact[] = [];
  for (const [key, a] of skuDay) {
    const [date, base] = key.split('|');
    facts.push({
      source: 'amazon', channel: 'Amazon', date,
      sku: base, skuName: a.name || base, skuKind: 'sku',
      revenue: r2(a.revenue), units: a.units, orders: a.orders, fees: r2(a.fees),
    });
  }
  for (const [date, c] of chanDay) {
    if (c.fees === 0 && c.spend === 0) continue;
    facts.push({ source: 'amazon', channel: 'Amazon', date, revenue: 0, units: 0, orders: 0, fees: r2(c.fees), spend: r2(c.spend) });
  }
  facts.sort((x, y) => x.date.localeCompare(y.date));

  const warnings: string[] = [];
  if (undated > 0) warnings.push(`${undated} row(s) had no readable date and were skipped.`);
  if (months.size > 1) {
    warnings.push(
      `Rows span ${[...months].sort().join(', ')} — settlement windows straddle month ends; check this is the window you meant.`,
    );
  }

  const totalRev = facts.reduce((s, f) => s + f.revenue, 0);
  const totalFees = facts.reduce((s, f) => s + f.fees, 0);
  const totalSpend = facts.reduce((s, f) => s + (f.spend ?? 0), 0);
  const skuCount = new Set([...skuDay.keys()].map((k) => k.split('|')[1])).size;
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — found header at row ${hi + 1} (date/time · type · total)`,
    `Scanned ${dataRows} transaction rows; excluded bank transfers out of ₹${Math.round(-transfers).toLocaleString('en-IN')} (settlement to bank, not a cost)`,
    `Per-SKU by day across ${skuCount} products (FBA + FBM merged on base MSKU) → ${facts.length} facts: revenue ₹${Math.round(totalRev).toLocaleString('en-IN')}, fees ₹${Math.round(totalFees).toLocaleString('en-IN')}, ad spend ₹${Math.round(totalSpend).toLocaleString('en-IN')}`,
  ];
  return { facts, warning: warnings.join(' ') || undefined, trace };
}

// ---- Amazon Business Report → per-SKU traffic & conversion (no P&L) ---------

/** Normalise a header cell: lowercase, en/em dashes → "-", collapse spaces. */
const norm = (v: unknown) => cell(v).toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

/**
 * Amazon "Detail Page Sales and Traffic By Child Item" (Business Report). A
 * monthly snapshot per child ASIN: Sessions, Page Views, Units Ordered, Buy Box.
 * It has no per-row date and its Ordered Product Sales is GROSS of refunds and
 * fees, so it is NOT money — the settlement owns revenue. We take only the
 * traffic (sessions / page views) and units, as a conversion aid; revenue/fees
 * stay 0 so these facts are inert to the cascade. Dated to the chosen month on
 * commit (the report carries no date).
 */
function parseAmazonBusinessReport(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map(norm);
    if (cells.some((c) => c.includes('session')) && cells.some((c) => c.includes('units ordered') || c.includes('unit session'))) { hi = i; break; }
  }
  if (hi < 0) {
    return { facts: [], warning: 'No Business Report header (needs Sessions + Units Ordered) — is this "Detail Page Sales and Traffic by Child Item"?' };
  }
  const header = (rows[hi] ?? []).map(norm);
  const find = (pred: (h: string) => boolean) => header.findIndex(pred);
  const ix = {
    sku: find((h) => h === 'sku' || h === 'seller sku' || h === 'msku'),
    asin: find((h) => h.includes('child') && h.includes('asin')),
    title: find((h) => h === 'title'),
    sessions: find((h) => h.includes('session') && h.includes('total') && !h.includes('percent')),
    sessionsAlt: find((h) => h === 'sessions'),
    pv: find((h) => h.includes('page view') && h.includes('total') && !h.includes('percent')),
    pvAlt: find((h) => h === 'page views'),
    units: find((h) => h.includes('units ordered') && !h.includes('b2b')),
  };
  const sCol = ix.sessions >= 0 ? ix.sessions : ix.sessionsAlt;
  const pCol = ix.pv >= 0 ? ix.pv : ix.pvAlt;

  const facts: DailyFact[] = [];
  let totS = 0, totU = 0;
  for (const row of rows.slice(hi + 1)) {
    const sku = cell(row[ix.sku >= 0 ? ix.sku : ix.asin]);
    if (!sku) continue;
    const sessions = Math.round(num(sCol >= 0 ? row[sCol] : 0));
    const pageViews = Math.round(num(pCol >= 0 ? row[pCol] : 0));
    const units = Math.round(num(ix.units >= 0 ? row[ix.units] : 0));
    if (sessions === 0 && pageViews === 0 && units === 0) continue;
    totS += sessions; totU += units;
    facts.push({
      source: 'amazonbiz', channel: 'Amazon', date: '',
      sku, skuName: ix.title >= 0 ? (cell(row[ix.title]) || sku) : sku, skuKind: 'sku',
      revenue: 0, units, orders: 0, fees: 0, sessions, pageViews,
    });
  }
  const conv = totS > 0 ? (100 * totU / totS).toFixed(1) : '0';
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${facts.length} products with traffic → ${totS.toLocaleString('en-IN')} sessions, ${totU.toLocaleString('en-IN')} units ordered (conversion ${conv}%)`,
    'Traffic only — revenue/fees are 0, so this never touches the P&L (the settlement owns the money).',
  ];
  return { facts, warning: facts.length === 0 ? 'No rows with sessions/units found.' : undefined, trace };
}

// ---- Registry --------------------------------------------------------------

interface ParseOutput {
  facts: DailyFact[];
  warning?: string;
  trace?: string[];
}

export interface UploadParser {
  sourceId: string;
  label: string;
  accept: string;
  hint: string;
  parse: (wb: XLSX.WorkBook) => ParseOutput;
}

// ---- Amazon Advertised Product report → per-SKU ad spend -------------------

const AD_MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Parse "Oct 12, 2026" → "2026-10-12". Returns '' if unreadable. */
function adDate(s: string): string {
  const m = String(s).match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return '';
  const mm = AD_MONTHS[m[1].toLowerCase()];
  if (!mm) return '';
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
}

/**
 * The Advertised Product report is a per-campaign summary over a window (its
 * "Date range" column varies row to row), so we aggregate ad cost per base SKU
 * and stamp it on the window's end date — enough to land it in the right month.
 * Sponsored Brands / Display rows carry no SKU and become channel-level spend.
 */
function parseAmazonAdvertisedProduct(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['advertised product sku', 'total cost']);
  if (hi < 0) {
    return { facts: [], warning: 'No "Advertised product SKU / Total cost" header — is this the Amazon Advertised Product report?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    range: col(header, 'date range'),
    sku: col(header, 'advertised product sku'),
    cost: col(header, 'total cost'),
  };
  if (ix.cost < 0) return { facts: [], warning: 'Amazon Ads: "Total cost" column not found.' };

  const bySku = new Map<string, number>();
  let channelSpend = 0;
  let dataRows = 0;
  let lastDate = '';
  for (const row of rows.slice(hi + 1)) {
    const cost = num(row[ix.cost]);
    const skuRaw = ix.sku >= 0 ? cell(row[ix.sku]) : '';
    if (cost === 0 && !skuRaw) continue;
    dataRows += 1;
    // End of the row's window — the latest date seen stamps every fact.
    const rg = ix.range >= 0 ? cell(row[ix.range]) : '';
    const end = adDate(rg.split(' - ').pop() ?? rg);
    if (end && end > lastDate) lastDate = end;
    if (!skuRaw) { channelSpend += cost; continue; } // Sponsored Brands / Display
    const { base } = amazonBaseSku(skuRaw);
    bySku.set(base, (bySku.get(base) ?? 0) + cost);
  }

  const date = lastDate || new Date().toISOString().slice(0, 10);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const facts: DailyFact[] = [];
  for (const [base, spend] of bySku) {
    if (spend === 0) continue;
    facts.push({ source: 'amazonads', channel: 'Amazon', date, sku: base, skuName: base, skuKind: 'sku', revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(spend) });
  }
  if (channelSpend !== 0) {
    facts.push({ source: 'amazonads', channel: 'Amazon', date, revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(channelSpend) });
  }

  const total = facts.reduce((s, f) => s + (f.spend ?? 0), 0);
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${dataRows} ad rows → per-SKU spend across ${bySku.size} products (Sponsored Brands/Display ₹${Math.round(channelSpend).toLocaleString('en-IN')} stays channel-level)`,
    `Total Amazon ad spend ₹${Math.round(total).toLocaleString('en-IN')}, dated ${date}`,
  ];
  return { facts, warning: facts.length === 0 ? 'No ad spend rows found.' : undefined, trace };
}

// ---- Meta Ads → per-product ad spend ---------------------------------------

/** Meta "Product ID" cell "48268188418262, Neck Heating Pad" → { id, name }. */
function metaProduct(raw: string): { id: string; name: string } {
  const m = raw.match(/^(\d+)\s*,\s*(.+)$/);
  return m ? { id: m[1], name: m[2].trim() } : { id: raw, name: raw };
}

/**
 * A date cell → "YYYY-MM-DD". XLSX converts ISO date strings in a CSV into Excel
 * serial numbers (46295 = 2026-09-30), so accept a serial, a real Date, or an
 * already-ISO string. Returns '' when the cell is not a date.
 */
function isoDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 0) {
    const d = XLSX.SSF?.parse_date_code(v);
    return d && d.y ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : '';
  }
  const s = cell(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
}

/**
 * Meta Ads export grouped Campaign → Ad set → Product ID over one month. Each
 * leaf row is spend for one catalog product; the all-blank row is the true
 * grand total. Meta's "By Product" breakdown drops spend it can't tie to a
 * product, so the product rows sum to LESS than the total — we emit per-product
 * facts plus one residual fact (grand − attributed) so the month's S&M foots to
 * the real total while the per-product detail survives. The live deck maps each
 * product id → FG and spreads the residual across D2C products.
 */
function parseMetaAds(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['campaign name', 'product id']);
  if (hi < 0) {
    return { facts: [], warning: 'No "Campaign name / Product ID" header — is this the Meta ad report grouped by campaign → ad set → product?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    campaign: col(header, 'campaign name'),
    product: col(header, 'product id'),
    amount: header.findIndex((h) => h.includes('amount spent')),
    end: header.findIndex((h) => h.includes('reporting end')),
    start: header.findIndex((h) => h.includes('reporting start')),
  };
  if (ix.amount < 0) return { facts: [], warning: 'Meta Ads: "Amount spent" column not found.' };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const bySku = new Map<string, { name: string; spend: number }>();
  let grandTotal: number | null = null;
  let leafSum = 0;
  let leafRows = 0;
  let lastDate = '';
  for (const row of rows.slice(hi + 1)) {
    const amt = num(row[ix.amount]);
    const campaign = ix.campaign >= 0 ? cell(row[ix.campaign]) : '';
    const prodRaw = ix.product >= 0 ? cell(row[ix.product]) : '';
    const iso = isoDate(row[ix.end >= 0 ? ix.end : ix.start]);
    if (iso && iso > lastDate) lastDate = iso;
    if (!prodRaw) {
      // All-blank row = grand total; campaign-only row = a subtotal (skip to
      // avoid double-counting).
      if (!campaign && amt) grandTotal = amt;
      continue;
    }
    const { id, name } = metaProduct(prodRaw);
    const e = bySku.get(id) ?? { name, spend: 0 };
    e.spend += amt;
    e.name = name;
    bySku.set(id, e);
    leafSum += amt;
    leafRows += 1;
  }

  const date = lastDate || new Date().toISOString().slice(0, 10);
  const facts: DailyFact[] = [];
  for (const [id, { name, spend }] of bySku) {
    if (spend === 0) continue;
    facts.push({ source: 'meta', channel: 'D2C', date, sku: id, skuName: name, skuKind: 'sku', revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(spend) });
  }
  // Residual: spend Meta booked but did not attribute to any product in this
  // breakdown. Carried as an un-SKU'd D2C fact so the month total is exact; the
  // deck spreads it across D2C products by revenue.
  const residual = grandTotal != null ? r2(grandTotal - leafSum) : 0;
  if (residual > 0) {
    facts.push({ source: 'meta', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: 0, spend: residual });
  }

  const total = r2(facts.reduce((s, f) => s + (f.spend ?? 0), 0));
  const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${leafRows} product rows → ₹${inr(leafSum)} across ${bySku.size} products`,
    grandTotal != null
      ? `Grand total ₹${inr(grandTotal)} → residual ₹${inr(residual)} unattributed, carried D2C-level`
      : 'No grand-total row — total is the sum of product rows',
    `Total Meta ad spend ₹${inr(total)}, dated ${date}`,
  ];
  return { facts, warning: facts.length === 0 ? 'No Meta ad spend rows found.' : undefined, trace };
}

// ---- Blinkit payout → per-SKU Blinkit revenue & fees ------------------------

/**
 * Blinkit monthly SoA — the "A&B. Order_level_charges.xlsx" from the payout ZIP.
 * The "Forward & Return Orders" sheet is one row per order line: gross bill and
 * the full fee stack (commission + GST, shipping + GST), plus TCS/TDS which are
 * tax WITHHELD on the seller's behalf (recoverable), not a cost — so fees =
 * Net Deductions − TCS − TDS. Returns/reversals carry the opposite sign.
 */
function parseBlinkit(wb: XLSX.WorkBook): ParseOutput {
  const sheet = wb.SheetNames.find((n) => /forward|order/i.test(n)) ?? wb.SheetNames[0];
  const rows = sheetRows(wb, sheet);
  const hi = findHeader(rows, ['item id', 'order id']);
  if (hi < 0) {
    return { facts: [], warning: 'No "Order ID / Item ID" header — is this Blinkit\'s "A&B. Order_level_charges.xlsx"?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    type: col(header, 'order type'),
    date: col(header, 'order date'),
    item: col(header, 'item id'),
    name: col(header, 'product name'),
    status: col(header, 'order status'),
    qty: col(header, 'quantity'),
    gross: col(header, 'total gross bill amount'),
    netDed: col(header, 'net deductions'),
    tcs: col(header, 'tcs amount'),
    tds1: col(header, 'tds 194o amount'),
    tds2: col(header, 'tds 194q amount'),
  };
  if (ix.item < 0 || ix.gross < 0) return { facts: [], warning: 'Blinkit: "Item ID" / "Total Gross Bill Amount" column not found.' };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byKey = new Map<string, DailyFact>();
  let lines = 0;
  let returns = 0;
  for (const row of rows.slice(hi + 1)) {
    const item = cell(row[ix.item]);
    if (!item) continue;
    const date = isoDate(row[ix.date]);
    if (!date) continue;
    const sign = /return|reversal/i.test(ix.type >= 0 ? cell(row[ix.type]) : '') ? -1 : 1;
    if (sign < 0) returns += 1;
    const gross = num(row[ix.gross]);
    const netDed = ix.netDed >= 0 ? num(row[ix.netDed]) : 0;
    const taxWithheld = (ix.tcs >= 0 ? num(row[ix.tcs]) : 0) + (ix.tds1 >= 0 ? num(row[ix.tds1]) : 0) + (ix.tds2 >= 0 ? num(row[ix.tds2]) : 0);
    const fees = r2(netDed - taxWithheld); // marketplace cut; TCS/TDS are recoverable, not a cost
    const qty = ix.qty >= 0 ? num(row[ix.qty]) || 1 : 1;
    const key = `${date}|${item}`;
    const e = byKey.get(key);
    if (e) {
      e.revenue = r2(e.revenue + sign * gross);
      e.units = r2(e.units + sign * qty);
      e.orders += sign;
      e.fees = r2(e.fees + sign * fees);
    } else {
      byKey.set(key, {
        source: 'blinkit', channel: 'Blinkit', date,
        sku: item, skuName: cell(row[ix.name]) || item, skuKind: 'sku',
        revenue: r2(sign * gross), units: r2(sign * qty), orders: sign, fees: r2(sign * fees),
      });
    }
    lines += 1;
  }

  const facts = [...byKey.values()];
  const rev = r2(facts.reduce((s, f) => s + f.revenue, 0));
  const fee = r2(facts.reduce((s, f) => s + f.fees, 0));
  const dates = facts.map((f) => f.date).sort();
  const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
  const trace = [
    `Read sheet "${sheet}" — header at row ${hi + 1}`,
    `${lines} order lines${returns ? ` (${returns} returns)` : ''} → ${facts.length} day×SKU facts`,
    `Blinkit revenue ₹${inr(rev)}, fees ₹${inr(fee)} (commission + shipping + GST; TCS/TDS excluded)${dates.length ? `, ${dates[0]} → ${dates[dates.length - 1]}` : ''}`,
  ];
  return { facts, warning: facts.length === 0 ? 'No Blinkit order rows found.' : undefined, trace };
}

// ---- Easebuzz settlements → D2C payment-gateway (MDR) cost ------------------

/**
 * Easebuzz Settlement History export. Each row is one settlement of D2C
 * collections; the gateway's cut is Service Charge + GST + Express Service
 * Charge + Express Service Tax. We emit the fee only (revenue is already counted
 * via Shopify — Easebuzz is just the D2C payment rail, so counting Total Amount
 * would double-count). Lands on Platform & Payment, by settlement date. The
 * trailing "Total Settlements" summary row is skipped.
 */
function parseEasebuzz(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['settlement id', 'settlement date']);
  if (hi < 0) {
    return { facts: [], warning: 'No "Settlement Id / Settlement Date" header — is this the Easebuzz Settlement History export?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    id: col(header, 'settlement id'),
    date: col(header, 'settlement date'),
    svc: col(header, 'service charge'),
    gst: col(header, 'gst'),
    exSvc: col(header, 'express service charge'),
    exTax: col(header, 'express service tax'),
  };
  if (ix.svc < 0) return { facts: [], warning: 'Easebuzz: "Service Charge" column not found.' };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byDate = new Map<string, DailyFact>();
  let settlements = 0;
  for (const row of rows.slice(hi + 1)) {
    const id = ix.id >= 0 ? cell(row[ix.id]) : '';
    const date = isoDate(row[ix.date]);
    if (!id || !date) continue; // skips the blank + "Total Settlements" summary rows
    const fee = r2(num(row[ix.svc]) + num(row[ix.gst]) + (ix.exSvc >= 0 ? num(row[ix.exSvc]) : 0) + (ix.exTax >= 0 ? num(row[ix.exTax]) : 0));
    settlements += 1;
    const e = byDate.get(date);
    if (e) e.fees = r2(e.fees + fee);
    else byDate.set(date, { source: 'easebuzz', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: fee });
  }

  const facts = [...byDate.values()];
  const total = r2(facts.reduce((s, f) => s + f.fees, 0));
  const dates = facts.map((f) => f.date).sort();
  const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${settlements} settlements → ${facts.length} daily facts`,
    `Easebuzz gateway cost ₹${inr(total)} (service charge + GST + express)${dates.length ? `, ${dates[0]} → ${dates[dates.length - 1]}` : ''}`,
  ];
  return { facts, warning: facts.length === 0 ? 'No Easebuzz settlement rows found.' : undefined, trace };
}

// ---- Snapmint group settlement → D2C BNPL finance cost ---------------------

/**
 * Snapmint "Merchant Settlement Date" is DD-MM-YYYY. When the day is > 12 XLSX
 * keeps it as text (parsed directly). When the day is ≤ 12 XLSX wrongly reads it
 * as US MM-DD and makes a serial with day and month swapped, so we swap back.
 */
function snapmintDate(v: unknown): string {
  const m = cell(v).match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (typeof v === 'number' && v > 0) {
    const d = XLSX.SSF?.parse_date_code(v);
    if (d && d.y) return `${d.y}-${String(d.d).padStart(2, '0')}-${String(d.m).padStart(2, '0')}`;
  }
  return isoDate(v);
}

/**
 * Snapmint Group Settlement Daily Report. Snapmint is the D2C BNPL (EMI) option,
 * so the cost to Heatronics is the subvention + merchant closing fee + P&S
 * charges + cashback take-rate + GST (a FINANCE cost → Platform & Payment, not a
 * discount off revenue). TCS/TDS are tax withheld (recoverable), excluded.
 * Revenue is already counted via Shopify (these are Shopify D2C orders), so only
 * the cost is taken. Cancellation rows carry no fee → drop out naturally.
 */
function parseSnapmint(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['loanapp id', 'settlement value']);
  if (hi < 0) {
    return { facts: [], warning: 'No "LoanApp Id / Settlement Value" header — is this the Snapmint Group Settlement report?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    date: col(header, 'merchant settlement date'),
    sub: col(header, 'subvention'),
    close: col(header, 'merchant closing fee'),
    ps: col(header, 'p&s charges'),
    cashback: col(header, 'cashback redemption take rate amount'),
    gst: col(header, 'gst'),
    loan: col(header, 'loanapp id'),
  };
  if (ix.sub < 0 && ix.ps < 0) return { facts: [], warning: 'Snapmint: subvention / P&S charge columns not found.' };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byDate = new Map<string, DailyFact>();
  let orders = 0;
  for (const row of rows.slice(hi + 1)) {
    if (ix.loan >= 0 && !cell(row[ix.loan])) continue;
    const date = snapmintDate(row[ix.date]);
    if (!date) continue;
    const fee = r2(
      (ix.sub >= 0 ? num(row[ix.sub]) : 0) +
      (ix.close >= 0 ? num(row[ix.close]) : 0) +
      (ix.ps >= 0 ? num(row[ix.ps]) : 0) +
      (ix.cashback >= 0 ? num(row[ix.cashback]) : 0) +
      (ix.gst >= 0 ? num(row[ix.gst]) : 0),
    );
    if (fee === 0) continue; // cancellations / reversals carry no fee
    orders += 1;
    const e = byDate.get(date);
    if (e) { e.fees = r2(e.fees + fee); e.orders += 1; }
    else byDate.set(date, { source: 'snapmint', channel: 'D2C', date, revenue: 0, units: 0, orders: 1, fees: fee });
  }

  const facts = [...byDate.values()];
  const total = r2(facts.reduce((s, f) => s + f.fees, 0));
  const dates = facts.map((f) => f.date).sort();
  const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${orders} settled EMI orders → ${facts.length} daily facts`,
    `Snapmint BNPL cost ₹${inr(total)} (subvention + fees + GST)${dates.length ? `, ${dates[0]} → ${dates[dates.length - 1]}` : ''}`,
  ];
  return { facts, warning: facts.length === 0 ? 'No Snapmint settlement rows found.' : undefined, trace };
}

// ---- Google Ads campaign report → D2C ad spend -----------------------------

/** "September 1, 2026 - September 30, 2026" → the range's end date ISO. */
function googleRangeEnd(s: string): string {
  const ms = [...s.matchAll(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})/g)];
  const last = ms[ms.length - 1];
  if (!last) return '';
  const mm = AD_MONTHS[last[1].toLowerCase()];
  return mm ? `${last[3]}-${mm}-${last[2].padStart(2, '0')}` : '';
}

/**
 * Google Ads campaign report (Campaigns table export). One total for the month;
 * we take the "Total: Account" row as the true Google spend → D2C Sales &
 * Marketing. There is no product dimension here (Search has none; Shopping/PMax
 * per-item comes from the optional Shopping-products report), so the whole
 * amount is carried channel-level and spread across D2C products by revenue.
 */
function parseGoogleAdsCampaigns(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['campaign', 'cost']);
  if (hi < 0) return { facts: [], warning: 'No "Campaign / Cost" header — is this the Google Ads campaign report?' };
  const header = (rows[hi] ?? []).map(lower);
  const costCol = header.lastIndexOf('cost');
  if (costCol < 0) return { facts: [], warning: 'Google Ads: "Cost" column not found.' };

  // Date from the range line above the header.
  let date = '';
  for (const r of rows.slice(0, hi)) {
    const d = googleRangeEnd(cell(r[0]));
    if (d) { date = d; break; }
  }

  // Prefer the "Total: Account" row; else sum the campaign rows.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let total = 0;
  for (const r of rows.slice(hi + 1)) {
    if (/^total:\s*account/i.test(cell(r[0]))) { total = num(r[costCol]); break; }
  }
  if (total <= 0) {
    for (const r of rows.slice(hi + 1)) {
      if (/^total/i.test(cell(r[0]))) continue;
      total = r2(total + num(r[costCol]));
    }
  }
  if (total <= 0) return { facts: [], warning: 'No Google ad cost found in the report.' };

  const dt = date || new Date().toISOString().slice(0, 10);
  const facts: DailyFact[] = [{ source: 'googleads', channel: 'D2C', date: dt, revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(total) }];
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `Total Google ad spend ₹${Math.round(total).toLocaleString('en-IN')}, dated ${dt} → D2C Sales & Marketing (spread across D2C products by revenue)`,
  ];
  return { facts, trace };
}

/** Google Merchant item id "shopify_in_9355519066326_48268187533526" → the Shopify variant id (last segment). */
function googleItemVariant(itemId: string): string {
  const parts = itemId.split('_');
  return parts[parts.length - 1] || itemId;
}

/**
 * Google Ads Shopping-products report (optional File 2). Per Item ID: cost, for
 * Shopping / Performance Max campaigns. The item id ends in the Shopify variant
 * id, which maps to an FG, giving measured per-product Google spend. This is a
 * breakdown of the campaign report's total (File 1), so it feeds attribution
 * only (the live deck does not double-count it in S&M).
 */
function parseGoogleAdsProducts(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['item id', 'cost']);
  if (hi < 0) return { facts: [], warning: 'No "Item ID / Cost" header — is this the Google Ads Shopping-products report?' };
  const header = (rows[hi] ?? []).map(lower);
  const itemCol = col(header, 'item id');
  const costCol = header.lastIndexOf('cost');
  if (itemCol < 0 || costCol < 0) return { facts: [], warning: 'Google Shopping products: "Item ID" / "Cost" column not found.' };

  let date = '';
  for (const r of rows.slice(0, hi)) {
    const d = googleRangeEnd(cell(r[0]));
    if (d) { date = d; break; }
  }
  const dt = date || new Date().toISOString().slice(0, 10);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const bySku = new Map<string, { name: string; spend: number }>();
  for (const row of rows.slice(hi + 1)) {
    const item = cell(row[itemCol]);
    if (!item || item === '--') continue;
    const cost = num(row[costCol]);
    if (cost <= 0) continue;
    const variant = googleItemVariant(item);
    const e = bySku.get(variant) ?? { name: item, spend: 0 };
    e.spend += cost;
    bySku.set(variant, e);
  }

  const facts: DailyFact[] = [...bySku.entries()].map(([variant, { name, spend }]) => ({
    source: 'googleadsproducts', channel: 'D2C', date: dt, sku: variant, skuName: name, skuKind: 'sku',
    revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(spend),
  }));
  const total = r2(facts.reduce((s, f) => s + (f.spend ?? 0), 0));
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${facts.length} products with spend → ₹${Math.round(total).toLocaleString('en-IN')} measured per-product (Shopping/PMax), dated ${dt}`,
  ];
  return { facts, warning: facts.length === 0 ? 'No Google Shopping product rows with spend.' : undefined, trace };
}

// ---- Delhivery wallet report → warranty/returns freight (D2C) --------------

/**
 * Delhivery One wallet export ("Unified transactions"). Delhivery is the
 * returns/replacement (warranty) courier for D2C — the shipments are RET-/REP-
 * orders — so its net freight is an after-sales cost booked to Platform &
 * Payment (below CM2), not the Channel & Fulfilment of the original sale.
 *
 * The workbook carries a "Deductions" sheet (freight debits) and a "Refunds"
 * sheet (cancellation + weight-reconciliation credits); the "AWB Deductions" /
 * "AWB Refunds" sheets are per-AWB duplicates of the same totals, and
 * "Recharges" are wallet top-ups (money in, not a cost). Net cost = deductions −
 * refunds, by day. The money column is "Miles" (Delhivery's name for the wallet
 * ₹ value).
 */
function parseDelhivery(wb: XLSX.WorkBook): ParseOutput {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const findSheet = (exact: string) => wb.SheetNames.find((n) => n.trim().toLowerCase() === exact);
  const dedSheet = findSheet('deductions');
  const refSheet = findSheet('refunds');
  if (!dedSheet) {
    return { facts: [], warning: 'No "Deductions" sheet — is this the Delhivery wallet (Unified transactions) export?' };
  }

  const byDate = new Map<string, number>();
  let debits = 0, credits = 0, debitSum = 0, creditSum = 0, unparsed = 0;
  const scan = (sheetName: string, sign: 1 | -1) => {
    const rows = sheetRows(wb, sheetName);
    const hi = findHeader(rows, ['miles', 'date & time']);
    if (hi < 0) return;
    const header = (rows[hi] ?? []).map(lower);
    const amtCol = col(header, 'miles');
    const dateCol = col(header, 'date & time');
    if (amtCol < 0 || dateCol < 0) return;
    for (const row of rows.slice(hi + 1)) {
      const amt = num(row[amtCol]);
      if (amt <= 0) continue;
      const raw = cell(row[dateCol]);
      const date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : toISODate(row[dateCol]);
      if (!date) { unparsed += 1; continue; }
      if (sign > 0) { debits += 1; debitSum += amt; } else { credits += 1; creditSum += amt; }
      byDate.set(date, r2((byDate.get(date) ?? 0) + sign * amt));
    }
  };
  scan(dedSheet, 1);
  if (refSheet) scan(refSheet, -1);

  // D2C returns/replacement freight (warranty-related). Net per day — a day whose
  // refunds exceed its debits nets negative, which is correct; the monthly sum is
  // the true cost.
  const facts: DailyFact[] = [...byDate.entries()].map(([date, fees]) => ({
    source: 'delhivery', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: r2(fees),
  }));
  const net = r2(debitSum - creditSum);
  const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
  const trace = [
    `Read "${dedSheet}"${refSheet ? ` + "${refSheet}"` : ''} (AWB-duplicate + Recharges sheets ignored)`,
    `${debits} deduction(s) ₹${inr(debitSum)} − ${credits} refund(s) ₹${inr(creditSum)} = net ₹${inr(net)}`,
    `Net warranty/returns freight by day → ${facts.length} D2C facts → Platform & Payment (below CM2)`,
  ];
  return { facts, warning: unparsed > 0 ? `${unparsed} row(s) had no readable date and were skipped.` : undefined, trace };
}

// ---- Flipkart Settled Transactions → Flipkart channel revenue + fees -------

/**
 * Flipkart "Settled Transactions" export (an .xlsx of several sheets). The
 * "Orders" sheet is the per-order-item money view. Flipkart is its own channel
 * (like Amazon). Net revenue = Sale Amount + Refund (a return reverses the sale
 * in the same window); the Marketplace Fee column (commission + fixed +
 * collection + shipping + …) is shown as a negative deduction, so the channel
 * cost is its negative. GST on fees and TCS/TDS are recoverable and excluded.
 * Fully-returned / zero-net rows drop out, so a month with no net sales yields
 * no facts (correct — the Summary's Net Bank Settlement is then 0 too).
 */
function parseFlipkartSettlement(wb: XLSX.WorkBook): ParseOutput {
  const sheet = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'orders');
  if (!sheet) return { facts: [], warning: 'No "Orders" sheet — is this the Flipkart Settled Transactions report?' };
  const rows = sheetRows(wb, sheet);
  const hi = findHeader(rows, ['order id', 'sale amount (rs.)', 'seller sku']);
  if (hi < 0) return { facts: [], warning: 'Flipkart settlement: Orders header (Order ID / Sale Amount / Seller SKU) not found.' };
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    sale: header.indexOf('sale amount (rs.)'),
    mpFee: header.findIndex((h) => h.startsWith('marketplace fee')),
    refund: header.indexOf('refund (rs.)'),
    date: header.indexOf('order date'),
    sku: header.indexOf('seller sku'),
    qty: header.indexOf('quantity'),
  };
  if (ix.sale < 0 || ix.sku < 0) return { facts: [], warning: 'Flipkart settlement: "Sale Amount" / "Seller SKU" column not found.' };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byKey = new Map<string, DailyFact>(); // `${date}|${sku}`
  let grossSale = 0, grossReturn = 0, feeTotal = 0, dataRows = 0;
  for (const row of rows.slice(hi + 1)) {
    const sku = cell(row[ix.sku]);
    if (!sku || sku.toUpperCase() === 'NA') continue;
    const rawDate = ix.date >= 0 ? cell(row[ix.date]) : '';
    const date = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : toISODate(row[ix.date]);
    if (!date) continue;
    const sale = num(row[ix.sale]);
    const refund = ix.refund >= 0 ? num(row[ix.refund]) : 0; // negative on returns
    const mpFee = ix.mpFee >= 0 ? num(row[ix.mpFee]) : 0;    // negative (deduction)
    const qty = ix.qty >= 0 ? num(row[ix.qty]) : 0;
    const netRev = r2(sale + refund);
    const fee = r2(-mpFee); // marketplace cost, positive
    dataRows += 1;
    grossSale += sale; grossReturn += refund; feeTotal += fee;
    // Net units: a retained sale adds, a standalone return subtracts, a
    // same-window sale-and-return nets by its revenue sign.
    let units = 0;
    if (sale > 0 && refund === 0) units = qty;
    else if (sale === 0 && refund < 0) units = -qty;
    else if (sale > 0 && refund < 0) units = netRev > 0 ? qty : 0;
    const key = `${date}|${sku}`;
    const e = byKey.get(key);
    if (e) { e.revenue = r2(e.revenue + netRev); e.fees = r2((e.fees ?? 0) + fee); e.units += units; }
    else byKey.set(key, { source: 'flipkart', channel: 'Flipkart', date, sku, skuKind: 'sku', revenue: netRev, units, orders: 0, fees: fee });
  }

  // Drop rows that net to nothing (fully-returned / zero activity).
  const facts = [...byKey.values()].filter((f) => f.revenue !== 0 || (f.fees ?? 0) !== 0 || f.units !== 0);
  const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
  const netRevTotal = r2(grossSale + grossReturn);
  const trace = [
    `Read sheet "${sheet}" — header at row ${hi + 1}, ${dataRows} order line(s)`,
    `Sales ₹${inr(grossSale)} − returns ₹${inr(-grossReturn)} = net revenue ₹${inr(netRevTotal)}; marketplace fees ₹${inr(feeTotal)} (commission/shipping/collection; GST + TCS/TDS excluded, recoverable)`,
    facts.length > 0
      ? `${facts.length} Flipkart fact(s) → Flipkart channel (Net Revenue + Channel & Fulfilment)`
      : 'No net Flipkart activity this month (all orders returned / zero net) — nothing to post.',
  ];
  return { facts, trace };
}

// ---- Flipkart Consolidated FSN ad report → Flipkart per-product ad spend ----

/** "End Time, 2026-09-30 23:59:59" preamble → the range end ISO date. */
function flipkartAdDate(rows: unknown[][], headerIdx: number): string {
  for (const r of rows.slice(0, headerIdx)) {
    if (lower(r[0]).startsWith('end time')) {
      const v = cell(r[1]);
      return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : toISODate(r[1]);
    }
  }
  return '';
}

/**
 * Flipkart Ads "Consolidated FSN Report" (PLA / PCA). Per Sku Id: Ad Spend. The
 * Sku Ids are the same text keys as the settlement's Seller SKU, so they map to
 * finished goods via the Flipkart SKU map → Flipkart Sales & Marketing (CM2).
 */
function parseFlipkartAds(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['sku id', 'ad spend']);
  if (hi < 0) return { facts: [], warning: 'No "Sku Id / Ad Spend" header — is this the Flipkart Consolidated FSN ad report?' };
  const header = (rows[hi] ?? []).map(lower);
  const skuCol = col(header, 'sku id');
  const spendCol = col(header, 'ad spend');
  const nameCol = col(header, 'product name');
  if (skuCol < 0 || spendCol < 0) return { facts: [], warning: 'Flipkart ads: "Sku Id" / "Ad Spend" column not found.' };

  const date = flipkartAdDate(rows, hi) || new Date().toISOString().slice(0, 10);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const bySku = new Map<string, { name: string; spend: number }>();
  for (const row of rows.slice(hi + 1)) {
    const sku = cell(row[skuCol]);
    if (!sku) continue;
    const spend = num(row[spendCol]);
    if (spend <= 0) continue;
    const e = bySku.get(sku) ?? { name: nameCol >= 0 ? cell(row[nameCol]) : sku, spend: 0 };
    e.spend += spend;
    bySku.set(sku, e);
  }

  const facts: DailyFact[] = [...bySku.entries()].map(([sku, { name, spend }]) => ({
    source: 'flipkartads', channel: 'Flipkart', date, sku, skuName: name, skuKind: 'sku',
    revenue: 0, units: 0, orders: 0, fees: 0, spend: r2(spend),
  }));
  const total = r2(facts.reduce((s, f) => s + (f.spend ?? 0), 0));
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${facts.length} products with spend → ₹${Math.round(total).toLocaleString('en-IN')} Flipkart ad spend (per Sku Id), dated ${date} → Flipkart Sales & Marketing`,
  ];
  return { facts, warning: facts.length === 0 ? 'No Flipkart ad rows with spend.' : undefined, trace };
}

// ---- Tranzact Sales Invoice Register (item-wise) → GT / B2B channel×SKU ----

/** Invoice prefix → channel + fact source. OEM = B2B; GTD/GTR/PHY roll up to GT. */
function tranzactChannel(invoice: string): { channel: string; source: string } | null {
  const p = (invoice.split('/')[0] || '').trim().toUpperCase();
  if (p === 'OEM') return { channel: 'B2B', source: 'tranzactb2b' };
  if (p === 'GTD' || p === 'GTR' || p === 'PHY' || p === 'GT') return { channel: 'GT', source: 'tranzactgt' };
  return null;
}

/**
 * Tranzact "Sales Invoice Register (Item-wise)". GT (General Trade — Dealer,
 * Retailer, Physio) and B2B (OEM) have no platform connector, so this register
 * is their SKU-level source. The invoice-number prefix carries the channel
 * (OEM/ → B2B; GTD/GTR/PHY → GT); the Item ID is the FG code directly; the
 * value is taken before tax. The channel totals reconcile to Tally's Offline
 * (GT) and OEM (B2B) Sales ledgers.
 */
function parseTranzactSales(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['invoice number', 'item id', 'invoice quantity']);
  if (hi < 0) return { facts: [], warning: 'No "Invoice Number / Item ID / Invoice Quantity" header — is this the Tranzact Sales Invoice Register (Item-wise)?' };
  const header = (rows[hi] ?? []).map(lower);
  const ix = {
    inv: col(header, 'invoice number'),
    date: col(header, 'document date'),
    item: col(header, 'item id'),
    desc: col(header, 'item description'),
    qty: col(header, 'invoice quantity'),
    val: header.findIndex((h) => h.startsWith('item value - before tax')),
  };
  if (ix.inv < 0 || ix.item < 0 || ix.val < 0) return { facts: [], warning: 'Tranzact: Invoice Number / Item ID / Item Value column not found.' };

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const byKey = new Map<string, DailyFact>(); // `${source}|${date}|${fg}`
  const byCh = new Map<string, number>();
  let skippedNoFg = 0, skippedCh = 0;
  for (const row of rows.slice(hi + 1)) {
    const inv = cell(row[ix.inv]);
    if (!inv || /report ends/i.test(inv)) continue;
    const ch = tranzactChannel(inv);
    if (!ch) { skippedCh += 1; continue; }
    const item = cell(row[ix.item]).toUpperCase();
    if (!item || !/^FG-\d+/.test(item)) { skippedNoFg += 1; continue; } // freight / non-FG lines
    const val = num(row[ix.val]);
    const qty = num(row[ix.qty]);
    const rawDate = ix.date >= 0 ? cell(row[ix.date]) : '';
    const date = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : toISODate(row[ix.date]);
    if (!date) continue;
    const key = `${ch.source}|${date}|${item}`;
    const e = byKey.get(key);
    if (e) { e.revenue = r2(e.revenue + val); e.units += qty; }
    else byKey.set(key, { source: ch.source, channel: ch.channel, date, sku: item, skuName: cell(row[ix.desc]), skuKind: 'sku', revenue: r2(val), units: qty, orders: 0, fees: 0 });
    byCh.set(ch.channel, r2((byCh.get(ch.channel) ?? 0) + val));
  }

  const facts = [...byKey.values()];
  const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — header at row ${hi + 1}`,
    `${facts.length} channel×SKU facts: ${[...byCh.entries()].map(([c, v]) => `${c} ₹${inr(v)}`).join(', ')}`,
    `GT → Tally Offline Sales; B2B → Tally OEM Sales${skippedNoFg ? `; skipped ${skippedNoFg} non-FG line(s) (freight)` : ''}${skippedCh ? `; ${skippedCh} row(s) with unrecognised invoice prefix` : ''}`,
  ];
  return { facts, warning: facts.length === 0 ? 'No GT/B2B invoice rows found.' : undefined, trace };
}

export const UPLOAD_PARSERS: UploadParser[] = [
  {
    sourceId: 'tranzact',
    label: 'Tranzact Sales Invoice Register (Item-wise)',
    accept: '.xlsx,.xls',
    hint: 'Tranzact → Reports → Sales → Sales Invoice Register (Item-wise) → last month. GT (Offline) + B2B (OEM) channel×SKU revenue + units; channel from the invoice prefix.',
    parse: parseTranzactSales,
  },
  {
    sourceId: 'flipkart',
    label: 'Flipkart Settled Transactions',
    accept: '.xlsx,.xls',
    hint: 'Flipkart Seller Hub → Reports → Payment Reports → Settled Transactions → set the month → download. The "Orders" sheet gives net revenue + marketplace fees per SKU → Flipkart channel.',
    parse: parseFlipkartSettlement,
  },
  {
    sourceId: 'flipkartads',
    label: 'Flipkart Consolidated FSN ad report',
    accept: '.csv,.xlsx,.xls',
    hint: 'Flipkart Seller Hub → Ads → Other Reports → Consolidated FSN Report (PLA, and PCA if run) → set the month → download. Per-product ad spend → Flipkart Sales & Marketing.',
    parse: parseFlipkartAds,
  },
  {
    sourceId: 'amazon',
    label: 'Amazon unified transaction',
    accept: '.xlsx,.xls,.csv',
    hint: 'Seller Central → Reports → Payments → Transaction View → Download (unified transaction / flat file). Daily revenue, units, fees & ad spend — straight from settlement.',
    parse: parseAmazonSettlement,
  },
  {
    sourceId: 'shiprocket',
    label: 'Shiprocket passbook',
    accept: '.xlsx,.xls,.csv',
    hint: 'Shiprocket → Billing → Wallet/Passbook → export. Daily freight & charges (wallet transfers excluded).',
    parse: parseShiprocketPassbook,
  },
  {
    sourceId: 'delhivery',
    label: 'Delhivery wallet report',
    accept: '.xlsx,.xls',
    hint: 'Delhivery One → Finances → Unified transactions → Download wallet report. Net warranty/returns freight (deductions − refunds; AWB-duplicate + recharge sheets ignored) → D2C Platform & Payment (below CM2).',
    parse: parseDelhivery,
  },
  {
    sourceId: 'blinkit',
    label: 'Blinkit payout (order-level charges)',
    accept: '.xlsx,.xls',
    hint: 'Blinkit Seller → Billing → Payout Details → Download monthly SoA → open "A&B. Order_level_charges.xlsx" from the ZIP. Per-SKU revenue + commission/shipping fees.',
    parse: parseBlinkit,
  },
  {
    sourceId: 'easebuzz',
    label: 'Easebuzz settlements',
    accept: '.csv,.xlsx,.xls',
    hint: 'Easebuzz dashboard → Settlements → Settlement History → set the month → Download. D2C payment-gateway (MDR) cost → Platform & Payment.',
    parse: parseEasebuzz,
  },
  {
    sourceId: 'snapmint',
    label: 'Snapmint group settlement',
    accept: '.csv,.xlsx,.xls',
    hint: 'Snapmint → Reports → Download Group Settlement Daily Report → set the month → Submit (emailed). D2C BNPL subvention + fees → Platform & Payment.',
    parse: parseSnapmint,
  },
  {
    sourceId: 'googleads',
    label: 'Google Ads campaign report',
    accept: '.csv,.xlsx,.xls',
    hint: 'Google Ads → Campaigns → set the month → Download. Total Google spend → D2C Sales & Marketing, spread across D2C products by revenue.',
    parse: parseGoogleAdsCampaigns,
  },
  {
    sourceId: 'googleadsproducts',
    label: 'Google Ads Shopping products (per-item cost)',
    accept: '.csv,.xlsx,.xls',
    hint: 'Google Ads → Reports → Shopping → "Shopping - Products" → same month, keep Item ID + Cost. Measured per-product Google spend — a breakdown of the campaign total, not added to it.',
    parse: parseGoogleAdsProducts,
  },
  {
    sourceId: 'amazonads',
    label: 'Amazon Advertised Product report',
    accept: '.csv,.xlsx',
    hint: 'Amazon Ads → Measurement & Reporting → Sponsored Ads Reports → Advertised Product → same month as the settlement. Per-SKU ad spend.',
    parse: parseAmazonAdvertisedProduct,
  },
  {
    sourceId: 'amazonbiz',
    label: 'Amazon Business Report (traffic by child item)',
    accept: '.csv,.xlsx,.xls',
    hint: 'Seller Central → Business Reports → Detail Page Sales & Traffic By Child Item → set the month → download. Per-SKU sessions, page views & units ordered → conversion (not the P&L).',
    parse: parseAmazonBusinessReport,
  },
  {
    sourceId: 'meta',
    label: 'Meta ad spend (campaign × ad set × product)',
    accept: '.csv,.xlsx',
    hint: 'Meta Ads Manager → grouped Campaign → Ad set → Product ID, one whole month, keep the "All" subtotal rows. Per-product spend + the unattributed residual.',
    parse: parseMetaAds,
  },
];

/**
 * Read a workbook from a raw file buffer. CSV/TSV exports can be UTF-16 (Google
 * Ads does this), which XLSX's ESM build can't decode on its own (no codepage
 * table), so detect the UTF-16 BOM and decode to a string first.
 */
function readWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    const enc = bytes[0] === 0xff ? 'utf-16le' : 'utf-16be';
    return XLSX.read(new TextDecoder(enc).decode(bytes), { type: 'string' });
  }
  return XLSX.read(buf, { type: 'array' });
}

export async function parseUpload(parser: UploadParser, file: File): Promise<UploadRecord> {
  const buf = await file.arrayBuffer();
  const wb = readWorkbook(buf);
  const { facts, warning, trace } = parser.parse(wb);
  if (facts.length === 0) {
    throw new Error(warning || 'No rows could be read from this file.');
  }
  // Keep a small preview of the raw file for the readiness page.
  const allRows = sheetRows(wb, wb.SheetNames[0]);
  const rawPreview = allRows.slice(0, 8).map((r) => (r ?? []).map((c) => cell(c)));
  return {
    sourceId: parser.sourceId,
    label: `${parser.label} · ${file.name}`,
    uploadedAt: new Date().toISOString(),
    facts,
    rawPreview,
    rawRows: Math.max(0, allRows.length - 1),
    trace: [`Opened ${file.name} (${allRows.length} rows)`, ...(trace ?? [])],
  };
}
