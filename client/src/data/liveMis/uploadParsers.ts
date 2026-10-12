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
  const m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
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

function parseShiprocketPassbook(wb: XLSX.WorkBook): { facts: DailyFact[]; warning?: string } {
  const rows = sheetRows(wb, wb.SheetNames[0]);
  const hi = findHeader(rows, ['amount', 'description']);
  if (hi < 0) {
    return { facts: [], warning: 'No "Amount / Description" header row found — is this the Shiprocket passbook export?' };
  }
  const header = (rows[hi] ?? []).map(lower);
  const ix = { date: col(header, 'created at'), amount: col(header, 'amount'), desc: col(header, 'description') };

  const byDay = new Map<string, number>();
  let unparsedDates = 0;
  for (const row of rows.slice(hi + 1)) {
    const desc = cell(row[ix.desc]);
    if (!desc) continue;
    if (SHIPROCKET_WALLET.test(desc)) continue; // wallet transfer in, not a cost
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
  return { facts, warning };
}

// ---- Registry --------------------------------------------------------------

export interface UploadParser {
  sourceId: string;
  label: string;
  accept: string;
  hint: string;
  parse: (wb: XLSX.WorkBook) => { facts: DailyFact[]; warning?: string };
}

export const UPLOAD_PARSERS: UploadParser[] = [
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
  const { facts, warning } = parser.parse(wb);
  if (facts.length === 0) {
    throw new Error(warning || 'No rows could be read from this file.');
  }
  return {
    sourceId: parser.sourceId,
    label: `${parser.label} · ${file.name}`,
    uploadedAt: new Date().toISOString(),
    facts,
  };
}
