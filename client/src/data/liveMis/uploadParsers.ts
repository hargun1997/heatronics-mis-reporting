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

function parseShiprocketPassbook(wb: XLSX.WorkBook): ParseOutput {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['amount', 'description']);
  if (hi < 0) {
    return { facts: [], warning: 'No "Amount / Description" header row found — is this the Shiprocket passbook export?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = { date: col(header, 'created at'), amount: col(header, 'amount'), desc: col(header, 'description') };

  const byDay = new Map<string, number>();
  let unparsedDates = 0;
  let dataRows = 0;
  let walletExcluded = 0;
  for (const row of rows.slice(hi + 1)) {
    const desc = cell(row[ix.desc]);
    if (!desc) continue;
    dataRows += 1;
    if (SHIPROCKET_WALLET.test(desc)) { walletExcluded += 1; continue; } // wallet transfer in, not a cost
    const amount = num(row[ix.amount]);
    const date = toISODate(row[ix.date]);
    if (!date) {
      unparsedDates += 1;
      continue;
    }
    // Charges are negative in the passbook; -amount is the positive cost.
    byDay.set(date, (byDay.get(date) ?? 0) - amount);
  }

  const facts: DailyFact[] = [...byDay.entries()].map(([date, fees]) => ({
    source: 'shiprocket',
    channel: 'Shiprocket',
    date,
    revenue: 0,
    units: 0,
    orders: 0,
    fees: Math.round(fees * 100) / 100,
  }));
  const warning = unparsedDates > 0 ? `${unparsedDates} row(s) had no readable date and were skipped.` : undefined;
  const trace = [
    `Read sheet "${wb.SheetNames[0]}" — found header at row ${hi + 1} (Created At / Amount / Description)`,
    `Scanned ${dataRows} charge rows; excluded ${walletExcluded} wallet/COD transfer(s) (money in, not a cost)`,
    `Summed charges by day → ${facts.length} daily freight facts${unparsedDates ? `; ${unparsedDates} undated row(s) skipped` : ''}`,
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

export const UPLOAD_PARSERS: UploadParser[] = [
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
];

export async function parseUpload(parser: UploadParser, file: File): Promise<UploadRecord> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
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
