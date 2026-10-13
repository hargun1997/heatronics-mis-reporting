// ----------------------------------------------------------------------------
// Tally Profit & Loss A/c — Excel reader
//
// Tally Prime exports the P&L A/c as a spreadsheet: a "Particulars" column, then
// two sub-columns per period (the ledger figure, and the group/subtotal figure).
// A multi-period export (Auto Column = Monthly) carries one such pair per month.
//
// This reader turns each month into the SAME ledgerRows the Tally screenshot
// (vision) path produces — {name, depth, amount, confidence} + Nett Profit — so
// the existing month-close engine (ledgerRowsToNodes → computeClose) consumes it
// unchanged. Because it is read from the file (not OCR'd), every figure is exact
// (confidence 1); the authoritative cascade then reconciles to the Nett Profit.
//
// Two shapes of the Trading Account are normalised here so the ledgers map:
//   • "Add: Purchase Accounts" / "Less: Closing Stock" prefixes are stripped.
//   • When Purchase Accounts is collapsed to one line (as a monthly auto-column
//     export does), the internal Stock-Transfer INWARD leg is hidden inside it.
//     It is split back out (inward = the Stock-Transfer outward under Sales) so
//     both contra legs cancel; a warning flags the assumption.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';

export interface TallyLedgerRow {
  name: string;
  depth: number;
  amount: number;
  confidence: number;
}

export interface TallyMonth {
  /** "YYYY-MM" */
  period: string;
  periodLabel: string;
  ledgerRows: TallyLedgerRow[];
  nettProfit: number | null;
  warning?: string;
}

export interface TallyPnlParse {
  months: TallyMonth[];
  warning?: string;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const cell = (v: unknown) => String(v ?? '').trim();
const lower = (v: unknown) => cell(v).toLowerCase();
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(cell(v).replace(/[(),₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** "1-Sep-26 to 30-Sep-26" → { period: "2026-09", label: "Sep 2026" }. Uses the start. */
function parsePeriodHeader(s: string): { period: string; label: string } | null {
  const m = cell(s).match(/\d{1,2}-([A-Za-z]{3})-(\d{2,4})/);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  if (!mm) return null;
  const yr = m[2].length === 2 ? `20${m[2]}` : m[2];
  const monName = m[1][0].toUpperCase() + m[1].slice(1, 3).toLowerCase();
  return { period: `${yr}-${mm}`, label: `${monName} ${yr}` };
}

/** Normalise the Trading-Account labels Tally prefixes so the ledgers map. */
function renameLedger(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  if (/^less:\s*closing stock/i.test(n)) return 'Closing Stock';
  if (/^add:\s*opening stock/i.test(n)) return 'Opening Stock';
  if (/^shipping-amazon-/i.test(n)) return 'Other Income'; // per-state shipping recovered
  if (/^shipping refund/i.test(n)) return 'Other Income';
  return n;
}

function extractMonth(rows: unknown[][], headerIdx: number, ledCol: number, period: string, periodLabel: string): TallyMonth {
  const grpCol = ledCol + 1;
  const ledgerRows: TallyLedgerRow[] = [];
  let nettProfit: number | null = null;
  let collapsedPurchases = false;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rawName = cell(r[0]);
    const led = r[ledCol];
    const grp = r[grpCol];
    const low = rawName.toLowerCase();

    if (low.startsWith('nett profit') || low.startsWith('nett loss')) {
      nettProfit = num(grp) * (low.startsWith('nett loss') ? -1 : 1);
      continue;
    }
    if (led === null || led === undefined || led === '') continue; // ledger rows only
    if (!rawName) continue; // skip blank subtotal rows

    // Purchase Accounts collapsed to one line → split the hidden Stock-Transfer
    // inward leg back out so the internal-transfer contra cancels.
    if (/^add:\s*purchase accounts/i.test(rawName)) {
      const strOut = ledgerRows.find((x) => x.name.toLowerCase() === 'stock transfers')?.amount ?? 0;
      if (strOut !== 0) {
        collapsedPurchases = true;
        ledgerRows.push({ name: 'Stock Transfer', depth: 1, amount: strOut, confidence: 1 });
        ledgerRows.push({ name: 'Raw Material Purchases', depth: 1, amount: num(led) - strOut, confidence: 1 });
      } else {
        ledgerRows.push({ name: 'Raw Material Purchases', depth: 1, amount: num(led), confidence: 1 });
      }
      continue;
    }

    ledgerRows.push({ name: renameLedger(rawName), depth: 1, amount: num(led), confidence: 1 });
  }

  const warning = collapsedPurchases
    ? 'Purchase Accounts was collapsed to one line — the Stock-Transfer inward leg was split from the outward value. Export with Purchase Accounts expanded for an exact split if the close does not reconcile.'
    : undefined;
  return { period, periodLabel, ledgerRows, nettProfit, warning };
}

/** Parse a Tally P&L A/c Excel into one entry per period that carries data. */
export function parseTallyPnl(wb: XLSX.WorkBook): TallyPnlParse {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { months: [], warning: 'Empty workbook.' };
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null }) as unknown[][];

  const headerIdx = rows.findIndex((r) => lower(r?.[0]) === 'particulars');
  if (headerIdx < 0) return { months: [], warning: 'No "Particulars" header — is this a Tally Profit & Loss A/c export?' };
  const hdr = rows[headerIdx] ?? [];

  const cols: { ledCol: number; period: string; label: string }[] = [];
  for (let c = 1; c < hdr.length; c++) {
    const p = parsePeriodHeader(cell(hdr[c]));
    if (p) cols.push({ ledCol: c, period: p.period, label: p.label });
  }
  if (cols.length === 0) return { months: [], warning: 'No period columns found in the P&L header.' };

  const months = cols
    .map((c) => extractMonth(rows, headerIdx, c.ledCol, c.period, c.label))
    // keep only months with real activity (ledgers + a Nett Profit)
    .filter((m) => m.ledgerRows.length > 0 && m.nettProfit !== null);

  return { months, warning: months.length === 0 ? 'No month in this export has ledger activity.' : undefined };
}
