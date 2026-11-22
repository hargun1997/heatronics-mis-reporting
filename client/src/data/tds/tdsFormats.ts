// TDS export layout — the ONE place the Excel columns live (page download: pages/accounts/TdsPage.tsx).
// Match to Heatronics' existing TDS file when provided: the founder's sample files had not arrived on 9 Nov 2026, so these
// are a clean default (sheet 3 follows the deductee-detail order of the 26Q annexure in the Protean RPU). Change the
// column lists here only; tests (server/test/tds.test.ts) pin the headers.
import { SECTIONS, dateLabel, monthLabel, type TdsReport } from './tds';
import { rowRate, rowSection, type InvoiceRow } from './invoices';

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

// Supplier invoices (founder 22 Nov 2026): every supplier bill of the month from Tally, with the memory status.
// PLACEHOLDER order until the accounts team's TDS report format arrives: then change this list only.
export const INVOICE_COLUMNS: Column<InvoiceRow>[] = [
  { header: 'Date', get: (r) => d(r.date) },
  { header: 'Voucher type', get: (r) => r.voucherType },
  { header: 'Voucher no.', get: (r) => r.voucherNo },
  { header: 'Supplier', get: (r) => r.supplier },
  { header: 'PAN', get: (r) => r.pan },
  { header: 'GSTIN', get: (r) => r.gstin },
  { header: 'Supplier invoice no.', get: (r) => r.invoiceNo },
  { header: 'Invoice date', get: (r) => d(r.invoiceDate) },
  { header: 'Expense / purchase ledger', get: (r) => r.ledgers },
  { header: 'Taxable value ₹', get: (r) => r.taxable },
  { header: 'IGST ₹', get: (r) => r.igst },
  { header: 'CGST ₹', get: (r) => r.cgst },
  { header: 'SGST ₹', get: (r) => r.sgst },
  { header: 'Bill total ₹', get: (r) => r.total },
  { header: 'TDS section', get: (r) => rowSection(r) },
  { header: 'TDS ledger', get: (r) => r.tdsLedger },
  { header: 'TDS rate %', get: (r) => rate(rowRate(r)) },
  { header: 'TDS ₹', get: (r) => r.tds },
  { header: 'Net payable ₹', get: (r) => r.payable },
  { header: 'Party TDS nature', get: (r) => r.partyTds },
  { header: 'Status', get: (r) => (r.status === 'removed' ? 'Removed in Tally' : r.changes.some((c) => c.field !== 'status') ? 'Edited in Tally' : 'OK') },
];

export const SHEET_NAMES = { pay: 'Pay this month', detail: 'Deductee detail', quarter: '26Q prep', invoices: 'Supplier invoices' } as const;

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

/** Supplier invoices sheet for a month: live bills, a total row, then removed bills under their own heading. */
export function invoiceSheet(month: string, rows: InvoiceRow[], syncedAt: string | null): { name: string; rows: Cell[][] } {
  const live = rows.filter((r) => r.status === 'active');
  const gone = rows.filter((r) => r.status === 'removed');
  const out = table(INVOICE_COLUMNS, live);
  const sum = (k: 'taxable' | 'igst' | 'cgst' | 'sgst' | 'total' | 'tds' | 'payable') => Math.round(live.reduce((s, r) => s + r[k], 0) * 100) / 100;
  const idx = (h: string) => INVOICE_COLUMNS.findIndex((c) => c.header === h);
  const total: Cell[] = INVOICE_COLUMNS.map(() => '');
  total[0] = 'Total';
  for (const [h, k] of [['Taxable value ₹', 'taxable'], ['IGST ₹', 'igst'], ['CGST ₹', 'cgst'], ['SGST ₹', 'sgst'], ['Bill total ₹', 'total'], ['TDS ₹', 'tds'], ['Net payable ₹', 'payable']] as const) {
    if (idx(h) >= 0) total[idx(h)] = sum(k);
  }
  out.push(total);
  if (gone.length) out.push([], ['Removed in Tally (kept for the record)'], ...table(INVOICE_COLUMNS, gone).slice(1));
  out.push([], [`Supplier bills of ${monthLabel(month)} from the Tally Day Book${syncedAt ? `, synced ${syncedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}.`]);
  return { name: SHEET_NAMES.invoices, rows: out };
}

/** The month's workbook. Default = the accounts team's TDS report (1 sheet). working = Supplier invoices + the TDS planning sheets. */
export function monthSheets(month: string, report: TdsReport | null, invoices: { rows: InvoiceRow[]; syncedAt: string | null } | null, opts: { working?: boolean } = {}): { name: string; rows: ReportCell[][] }[] {
  if (!opts.working) return invoices ? [tdsReportSheet(month, invoices.rows)] : [];
  return [
    ...(invoices ? [invoiceSheet(month, invoices.rows, invoices.syncedAt)] : []),
    ...(report?.haveMonth ? tdsSheets(report) : []),
  ];
}

// ---------------------------------------------------------------- the accounts team's monthly TDS report
// Layout of "Tds Report Oct 2026-27.xlsx", sheet "October-2026" (founder, 22 Nov 2026): two title rows, then ONE block
// per section in this order, each with the same 8 headers, one row per party bill (PAN on every row), a Total row,
// then a Grand Total and the "TDS PAYABLE <Month-YY>" summary. "INTREST 1.5%" is spelled as in their file and holds
// the TDS rate of the row (0.01 / 0.02 / 0.1), as their file does. Change the blocks or headers here only.
export const REPORT_COMPANY = 'HEATRONICS MEDICAL DEVICES (P) LTD';
export const REPORT_HEADERS = ['S.NO', 'PARTY NAME', 'PAN NO', 'DATE', 'BILL NO', 'AMOUNT', 'TDS DEDUCT', 'INTREST 1.5%'] as const;
export type ReportBlockId = 'jobwork' | 'others' | 'commission' | 'rent' | 'professional' | 'other';
export const REPORT_BLOCKS: { id: ReportBlockId; title: string; summary: string }[] = [
  { id: 'jobwork', title: '194 C  CONTACTORS- JOB WORK  @1%', summary: 'JOB WORK' },
  { id: 'others', title: '194 C  OTHERS @ 2% (ADVERTISEMENT & PUBLICITY AMAZON.IN)', summary: 'ADVERTISEMENT' },
  { id: 'commission', title: '194 H  (Commission/Brokerage): @ 2%', summary: 'COMMISSION' },
  { id: 'rent', title: '194 I  BUILDING RENT @ 10%', summary: 'RENT' },
  { id: 'professional', title: '194J  PROFESSIONAL  @ 10%', summary: 'PROFESSIONAL' },
  // Not in the team's file: shown only when a month has TDS under another section (194Q, 194A, salary …), so no TDS is dropped.
  { id: 'other', title: 'OTHER SECTIONS (194Q / 194A / 192 / 195 …)', summary: 'OTHER' },
];
/** Order of the summary lines, as in the team's file. */
const SUMMARY_ORDER: ReportBlockId[] = ['professional', 'rent', 'commission', 'others', 'jobwork', 'other'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-10" → "October-26" (title row and summary) and "October-2026" (sheet name). */
export const reportMonth = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}-${m.slice(2, 4)}`;
export const reportSheetName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}-${m.slice(0, 4)}`;

const r2x = (n: number) => Math.round(n * 100) / 100;
/** Standard TDS rates the report uses; the booked rate (Tally rounds TDS to whole ₹) snaps to the nearest. */
const STD_RATES = [0.001, 0.01, 0.02, 0.05, 0.1, 0.2];
export function reportRate(r: Pick<InvoiceRow, 'tds' | 'taxable'>): number | null {
  if (!r.taxable || !r.tds) return null;
  const x = Math.abs(r.tds) / r.taxable;
  return STD_RATES.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b));
}
/** TDS DEDUCT as the accounts team works it: amount × rate, to 2 decimals (Tally books it rounded to whole ₹). */
export const reportTds = (r: Pick<InvoiceRow, 'tds' | 'taxable'>) => {
  const rate = reportRate(r);
  return rate == null ? r2x(r.tds) : Math.sign(r.tds) * r2x(r.taxable * rate);
};

/** 194C bills that go to the "OTHERS @ 2%" block: ads, freight, couriers and platforms (by expense ledger or party). */
export const OTHERS_194C = /\bads?\b|advert|marketing|meta|facebook|google|amazon|freight|courier|shipping|shiprocket|delhivery|porter|logistic|transport|blinkit|boost|listing|promotion/i;

/**
 * Block of a bill. Tally has ONE 194C ledger for 1 % and 2 %, so 194C goes by the expense: a 1 % bill, or a 2 % bill
 * for job work / repairs / printing (not ads or freight), is JOB WORK (the team lists e.g. a 2 % maintenance bill there);
 * ads, freight, couriers and platforms are OTHERS. 194J keeps 2 % (technical) bills in the professional block, as the team does.
 */
export function blockOf(r: Pick<InvoiceRow, 'tdsLedger' | 'tds' | 'taxable' | 'pan' | 'ledgers' | 'supplier'>): ReportBlockId {
  const sec = rowSection(r);
  if (sec === '194C') {
    const rate = reportRate(r);
    if (rate != null && rate <= 0.01) return 'jobwork';
    return OTHERS_194C.test(`${r.ledgers} ${r.supplier}`) ? 'others' : 'jobwork';
  }
  if (sec === '194H') return 'commission';
  if (sec.startsWith('194I')) return 'rent';
  if (sec.startsWith('194J')) return 'professional';
  return 'other';
}

/** Tally party ledger → the party name in the team's report (platform collection ledgers carry another name). Edit here. */
export const PARTY_NAMES: [RegExp, string][] = [
  [/^shiprocket collection/i, 'SHIPROCKET PRIVATE LIMITED'],
  [/^snapmint collection/i, 'SNAPMINT CREDIT ADVISORY PRIVATE LIMITED'],
  [/^easebuzz collection/i, 'EASEBUZZ PRIVATE LIMITED'],
  [/^amazon expenses \(creditors\)|^amazon ads/i, 'Amazon Seller Services Private Limited'],
];
export const reportParty = (name: string) => PARTY_NAMES.find(([re]) => re.test(name))?.[1] ?? name;

/** Headline rate of each block: its rows come first, then the other rates (the team lists 1 % then 2 % job work, 10 % then 2 % professional). */
const HEADLINE: Record<ReportBlockId, number> = { jobwork: 0.01, others: 0.02, commission: 0.02, rent: 0.1, professional: 0.1, other: 0 };

/** Excel date (a real date cell; formatted dd-mm-yyyy on download). Local midnight: SheetJS writes dates in local time. */
const xlDate = (iso: string): Date | string => (iso ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) : '');

export type ReportCell = string | number | Date | null;
/** The team's monthly TDS report for one month, from the bills with TDS (live rows of the memory). Pure. */
export function tdsReportSheet(month: string, rows: InvoiceRow[]): { name: string; rows: ReportCell[][]; totals: Record<ReportBlockId, number>; grand: number } {
  const live = rows.filter((r) => r.status === 'active' && r.tds !== 0);
  const out: ReportCell[][] = [[REPORT_COMPANY], [`Month ${reportMonth(month)}`], []];
  const totals = Object.fromEntries(REPORT_BLOCKS.map((b) => [b.id, 0])) as Record<ReportBlockId, number>;
  let gAmt = 0, gTds = 0;
  for (const b of REPORT_BLOCKS) {
    const head = (r: InvoiceRow) => (reportRate(r) === HEADLINE[b.id] ? 0 : 1);
    const mine = live.filter((r) => blockOf(r) === b.id)
      .sort((a, c) => head(a) - head(c) || reportParty(a.supplier).localeCompare(reportParty(c.supplier)) || a.date.localeCompare(c.date));
    if (b.id === 'other' && !mine.length) continue;
    out.push([b.title], [...REPORT_HEADERS]);
    mine.forEach((r, i) => {
      out.push([i + 1, reportParty(r.supplier), r.pan, xlDate(r.invoiceDate || r.date), r.invoiceNo || r.voucherNo, r2x(r.taxable), reportTds(r), reportRate(r)]);
    });
    const amt = r2x(mine.reduce((s, r) => s + r.taxable, 0)), tds = r2x(mine.reduce((s, r) => s + reportTds(r), 0));
    totals[b.id] = tds; gAmt += amt; gTds += tds;
    out.push(['', 'Total', '', '', '', amt, tds, ''], []);
  }
  const grand = r2x(gTds);
  out.push(['', 'Grand Total', '', '', '', r2x(gAmt), grand, ''], [], ['', `TDS PAYABLE ${reportMonth(month)}`]);
  for (const id of SUMMARY_ORDER) {
    if (id === 'other' && !totals.other) continue;
    out.push(['', REPORT_BLOCKS.find((b) => b.id === id)!.summary, totals[id]]);
  }
  out.push(['', 'TOTAL PAYABLE', grand], ['', 'NET PAYABLE', grand]);
  return { name: reportSheetName(month), rows: out, totals, grand };
}

/** State words for the history (sheet notes and the page). */
export const STATE_WORDS: Record<string, string> = { ok: 'OK', stale: 'Stale', partial: 'Part read', missing: 'No data', running: 'Month running' };

/**
 * One workbook, one sheet per month in the team's layout (history download). A month whose data is not OK gets a
 * flag row under the title rows, so the sheet never looks final when it is not. Months with no data still get a sheet.
 */
export function historySheets(months: { month: string; state: string; note: string; rows: InvoiceRow[] }[]): { name: string; rows: ReportCell[][] }[] {
  return months.map((m) => {
    const sh = tdsReportSheet(m.month, m.rows);
    if (m.state === 'ok') return { name: sh.name, rows: sh.rows };
    const flag: ReportCell[] = [`DATA ${STATE_WORDS[m.state]?.toUpperCase() ?? m.state}: ${m.note}`];
    return { name: sh.name, rows: [sh.rows[0], sh.rows[1], flag, ...sh.rows.slice(2)] };
  });
}

/** What each row of a TDS report sheet is, for the Excel styling (utils/tdsReportExport.ts). Pure, tested. */
export type ReportRowKind = 'company' | 'month' | 'flag' | 'block' | 'header' | 'data' | 'total' | 'grand' | 'summaryTitle' | 'summary' | 'summaryTotal' | 'blank';
export function reportRowKinds(rows: ReportCell[][]): ReportRowKind[] {
  const titles = new Set(REPORT_BLOCKS.map((b) => b.title));
  let inSummary = false;
  return rows.map((r, i) => {
    const a = r[0], b = r[1];
    if (!r.length || r.every((c) => c === '' || c == null)) return 'blank';
    if (i === 0) return 'company';
    if (i === 1) return 'month';
    if (typeof a === 'string' && a.startsWith('DATA ')) return 'flag';
    if (typeof a === 'string' && titles.has(a)) return 'block';
    if (a === REPORT_HEADERS[0]) return 'header';
    if (b === 'Grand Total') return 'grand';
    if (b === 'Total') return 'total';
    if (typeof b === 'string' && b.startsWith('TDS PAYABLE')) { inSummary = true; return 'summaryTitle'; }
    if (inSummary) return b === 'TOTAL PAYABLE' || b === 'NET PAYABLE' ? 'summaryTotal' : 'summary';
    return 'data';
  });
}
