// TDS export layout — the ONE place the Excel columns live (page download: pages/accounts/TdsPage.tsx).
// Match to Heatronics' existing TDS file when provided: the founder's sample files had not arrived on 9 Nov 2026, so these
// are a clean default (sheet 3 follows the deductee-detail order of the 26Q annexure in the Protean RPU). Change the
// column lists here only; tests (server/test/tds.test.ts) pin the headers.
import { SECTIONS, dateLabel, type TdsReport } from './tds';

type Cell = string | number | null;
export interface Column<T> { header: string; get: (row: T) => Cell }

const d = (s: string) => (s ? dateLabel(s) : '');
const rate = (n: number | null) => (n == null ? '' : n);

export const PAY_COLUMNS: Column<TdsReport['pay'][number] & { due: string }>[] = [
  { header: 'Section', get: (r) => r.section },
  { header: 'Nature of payment', get: (r) => r.label },
  { header: 'Challan major head', get: (r) => `${r.head} (${r.headLabel})` },
  { header: 'Minor head', get: () => '200 (TDS payable by taxpayer)' },
  { header: 'TDS deducted ₹', get: (r) => r.deducted },
  { header: 'Already paid ₹', get: (r) => r.paid },
  { header: 'To pay ₹', get: (r) => r.balance },
  { header: 'Interest if late ₹ (estimate)', get: (r) => r.interest },
  { header: 'Due date', get: (r) => d(r.due) },
];

export const DEDUCTEE_COLUMNS: Column<TdsReport['entries'][number]>[] = [
  { header: 'Date', get: (r) => d(r.date) },
  { header: 'Voucher', get: (r) => r.voucher },
  { header: 'Bill no.', get: (r) => r.reference },
  { header: 'Deductee', get: (r) => r.party },
  { header: 'PAN', get: (r) => r.pan },
  { header: 'Section', get: (r) => r.section },
  { header: 'TDS ledger', get: (r) => r.tdsLedger },
  { header: 'Amount paid / credited ₹', get: (r) => r.gross },
  { header: 'TDS ₹', get: (r) => r.tds },
  { header: 'Rate %', get: (r) => rate(r.ratePct) },
  { header: 'Standard rate %', get: (r) => SECTIONS[r.section].rates.map((x) => x.pct).join(' / ') },
  { header: 'Note', get: (r) => (r.grossEstimated ? 'Amount estimated from the TDS' : '') },
];

export const QUARTER_COLUMNS: Column<TdsReport['quarter']['q26'][number]>[] = [
  { header: 'Deductee code (01 company / 02 other)', get: (r) => r.code },
  { header: 'PAN of deductee', get: (r) => r.pan },
  { header: 'Name of deductee', get: (r) => r.name },
  { header: 'Section code', get: (r) => r.section },
  { header: 'Date of payment / credit', get: (r) => d(r.paidOn) },
  { header: 'Amount paid / credited ₹', get: (r) => r.amount },
  { header: 'TDS ₹', get: (r) => r.tds },
  { header: 'Surcharge ₹', get: () => 0 },
  { header: 'Education cess ₹', get: () => 0 },
  { header: 'Total tax deducted ₹', get: (r) => r.tds },
  { header: 'Date of deduction', get: (r) => d(r.deductedOn) },
  { header: 'Rate %', get: (r) => rate(r.ratePct) },
  { header: 'Reason for lower / higher deduction', get: (r) => r.reason },
  { header: 'Challan BSR code', get: (r) => r.bsr },
  { header: 'Challan date', get: (r) => d(r.challanDate) },
  { header: 'Challan serial no.', get: (r) => r.challanNo },
];

export const SHEET_NAMES = { pay: 'Pay this month', detail: 'Deductee detail', quarter: '26Q prep' } as const;

const table = <T,>(cols: Column<T>[], rows: T[]): Cell[][] => [cols.map((c) => c.header), ...rows.map((r) => cols.map((c) => c.get(r)))];

/** Array-of-arrays per sheet, ready for XLSX.utils.aoa_to_sheet (pure, tested). */
export function tdsSheets(r: TdsReport): { name: string; rows: Cell[][] }[] {
  const pay = table(PAY_COLUMNS, r.pay.map((p) => ({ ...p, due: r.dueDate })));
  pay.push([], ['', 'Total', '', '', r.totals.deducted, r.totals.paid, r.totals.balance, r.totals.interest, d(r.dueDate)]);
  pay.push([], [`TDS deducted in ${r.monthLabel} (${r.fy}), from the Tally Day Book. Estimates: interest. Check before paying.`]);
  const q = r.quarter;
  const qRows = table(QUARTER_COLUMNS, [...q.q26, ...q.q27]);
  qRows.push([], [`${q.label} · 26Q due ${d(q.dueDate)} · 26Q TDS ₹${q.tds26}${q.q27.length ? ` · 27Q (non-residents) TDS ₹${q.tds27}` : ''}`]);
  if (q.q24.length) qRows.push(['Salary (24Q) rows:'], ...table(QUARTER_COLUMNS, q.q24));
  if (q.missingMonths.length) qRows.push([`Day Book not copied for: ${q.missingMonths.join(', ')} — this list is incomplete.`]);
  return [
    { name: SHEET_NAMES.pay, rows: pay },
    { name: SHEET_NAMES.detail, rows: table(DEDUCTEE_COLUMNS, r.entries) },
    { name: SHEET_NAMES.quarter, rows: qRows },
  ];
}
