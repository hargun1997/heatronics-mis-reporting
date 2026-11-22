// ----------------------------------------------------------------------------
// Filed TDS reports (founder, 22 Nov 2026): for a month the accounts team has FILED, their report is the truth and Tally
// only cross-checks it; an unfiled month (the running one) comes from Tally. Pure: no fetch, no React.
//   parseFiledWorkbook  the team's .xlsx (one sheet per month, their layout, their quirks) → FiledDoc per month
//   matchFiled          every filed bill ↔ a Tally bill (PAN or party + bill no., else PAN + amount), the deviations
//   monthReport         the month's report rows (filed or Tally) + the "Deviations from Tally" sheet
// Stored per month by the server (tds/filed-<YYYY-MM>, never in the repo: party names, PANs, bill numbers).
// Tests: server/test/filedReports.test.ts (synthetic parties only).
// ----------------------------------------------------------------------------
import type { InvoiceRow } from './invoices';
import {
  REPORT_BLOCKS, blockOf, buildReportSheet, itemOfBill, reportTds,
  type ReportBlockId, type ReportCell, type ReportItem,
} from './tdsFormats';
import { monthLabel } from './tds';

export interface FiledRow { block: ReportBlockId; party: string; pan: string; date: string; dateText: string; billNo: string; amount: number; tds: number; rate: number | null }
export interface FiledDoc {
  month: string;
  fileName: string;
  sheetName: string;
  rows: FiledRow[];
  summary: { label: string; value: number }[];
  totalPayable: number;
  netPayable: number;
  warnings: string[];
  uploadedAt?: string;
  uploadedBy?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const r2 = (n: number) => Math.round(n * 100) / 100;
const txt = (c: unknown) => (c == null ? '' : String(c)).replace(/\s+/g, ' ').trim();
const num = (c: unknown): number | null => {
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  const s = txt(c).replace(/[,₹\s]/g, '');
  return /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s) ? Number(s) : null;
};

/** "MONTH  APR-26", "Month August-26", sheet "October-2026" → "2026-10". */
export function monthOf(text: string): string | null {
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s\-_']*(\d{4}|\d{2})\b/i.exec(text);
  if (!m) return null;
  const mm = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  const yy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

/** Excel serial (46128) or "25/04/2026" → ISO date; '' when unreadable. */
export function filedDate(c: unknown): string {
  if (typeof c === 'number' && c > 30000 && c < 80000) return new Date(Math.round((c - 25569) * 86400000)).toISOString().slice(0, 10);
  if (c instanceof Date && !Number.isNaN(c.getTime())) return c.toISOString().slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(txt(c));
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

/** Block of a title row ("194 C | CONTACTORS- JOB WORK @1%", "194J | PROFESSIONAL @ 10%"). */
export function blockOfTitle(line: string): ReportBlockId | null {
  const t = line.toUpperCase();
  if (/194\s*C/.test(t)) return /JOB\s*WORK|CONT?R?ACTORS/.test(t) && !/OTHERS/.test(t) ? 'jobwork' : 'others';
  if (/194\s*H/.test(t)) return 'commission';
  if (/194\s*I\b|194\s*I\s*\|/.test(t) || /BUILDING RENT/.test(t)) return 'rent';
  if (/194\s*J/.test(t)) return 'professional';
  if (/\b19[2-6][A-Z]{0,2}\b/.test(t) && !/PAYABLE/.test(t)) return 'other';
  return null;
}

const SUMMARY_LABEL = /^(PROFESSIONAL|RENT|COMMISSION|ADVERTISEMENT|JOB ?WORK|OTHER|TOTAL PAYABLE|NET PAYABLE|AL+READY PAID|PAYABLE AMT\.?)$/i;

/**
 * One sheet of the team's report → its month's FiledDoc. Reads their layout as it really is: S.NO blank or "#REF!",
 * dates as Excel serials or "25/04/2026", extra columns (GST, total) after the rate, placeholder rows with no amount
 * (skipped, counted), notes in the rate column ("ALLREADY PAID"), subtotal and Total / Grand Total rows (skipped),
 * the "TDS PAYABLE <month>" lines (kept as they filed them, including hand adjustments).
 */
export function parseFiledSheet(aoa: unknown[][], sheetName: string, fileName: string): FiledDoc | null {
  const head = aoa.slice(0, 6).map((r) => r.map(txt).join(' ')).join(' ');
  const month = monthOf(sheetName) ?? monthOf(head);
  if (!month) return null;
  const rows: FiledRow[] = [];
  const summary: { label: string; value: number }[] = [];
  const warnings: string[] = [];
  let block: ReportBlockId | null = null;
  let col: Record<string, number> | null = null;
  let inSummary = false, placeholders = 0;
  for (const raw of aoa) {
    const cells = raw ?? [];
    const line = cells.map(txt).filter(Boolean).join(' | ');
    if (!line) continue;
    if (/TDS\s+PAYABLE/i.test(line)) { inSummary = true; continue; }
    if (inSummary) {
      const i = cells.findIndex((c) => SUMMARY_LABEL.test(txt(c)));
      if (i < 0) continue;
      const v = cells.slice(i + 1).map(num).find((x) => x != null);
      if (v != null) summary.push({ label: txt(cells[i]).toUpperCase().replace(/\s+/g, ' '), value: r2(v) });
      continue;
    }
    if (/PARTY\s*NAME/i.test(line)) {
      const find = (re: RegExp) => cells.findIndex((c) => re.test(txt(c)));
      col = { sno: find(/^S\.?\s*NO/i), party: find(/PARTY/i), pan: find(/PAN/i), date: find(/^DATE/i), bill: find(/BILL/i), amount: find(/AMOUNT/i), tds: find(/TDS/i), rate: find(/INTREST|INTEREST|RATE/i) };
      continue;
    }
    const tb = blockOfTitle(line);
    if (tb && !/PARTY/i.test(line) && (num(cells[col?.amount ?? -1]) == null)) { block = tb; col = null; continue; }
    if (!block || !col || col.party < 0) continue;
    const party = txt(cells[col.party]);
    if (!party || /^(grand\s+)?total$/i.test(party) || num(party) != null || /^#?REF!?$/i.test(party)) continue;
    const amount = num(cells[col.amount]) ?? 0;
    const tds = num(cells[col.tds]) ?? 0;
    if (!amount && !tds) { placeholders++; continue; }
    const rateRaw = col.rate >= 0 ? num(cells[col.rate]) : null;
    rows.push({
      block, party, pan: txt(cells[col.pan]).toUpperCase(), date: filedDate(cells[col.date]), dateText: txt(cells[col.date]),
      billNo: txt(cells[col.bill]), amount: r2(amount), tds: r2(tds), rate: rateRaw != null && rateRaw > 0 && rateRaw <= 1 ? rateRaw : null,
    });
  }
  if (!rows.length) return null;
  if (placeholders) warnings.push(`${placeholders} row(s) with a party but no amount were skipped.`);
  const sum = r2(rows.reduce((s, r) => s + r.tds, 0));
  const total = summary.find((l) => l.label === 'TOTAL PAYABLE')?.value ?? sum;
  const net = summary.find((l) => l.label === 'NET PAYABLE')?.value ?? summary.find((l) => /PAYABLE AMT/.test(l.label))?.value ?? total;
  if (Math.abs(total - sum) > 1) warnings.push(`Bills add up to ${sum.toFixed(2)}; the file says TOTAL PAYABLE ${total.toFixed(2)}.`);
  return { month, fileName, sheetName, rows, summary, totalPayable: total, netPayable: net, warnings };
}

/** Every sheet of a workbook (as arrays of rows) → one FiledDoc per month found; a later sheet for the same month wins. */
export function parseFiledWorkbook(sheets: { name: string; rows: unknown[][] }[], fileName: string): FiledDoc[] {
  const byMonth = new Map<string, FiledDoc>();
  for (const s of sheets) {
    const d = parseFiledSheet(s.rows, s.name, fileName);
    if (d) byMonth.set(d.month, d);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------- matching with Tally

export type DeviationKind = 'moved' | 'not-in-tally' | 'not-filed' | 'tds-differs' | 'filed-elsewhere';
export interface Deviation {
  kind: DeviationKind;
  month: string;          // the month this line belongs to (filed month, or the Tally month for not-filed)
  party: string;
  pan: string;
  billNo: string;
  tallyDate: string;
  tallyMonth: string;
  filedMonth: string;
  filedTds: number | null;
  tallyTds: number | null;
  note: string;
}
export interface MonthCheck { month: string; filed: boolean; deviations: Deviation[]; sections: { id: ReportBlockId; filed: number; tally: number; diff: number }[] }

const normBill = (s: string) => s.toLowerCase().replace(/[\s#]/g, '').replace(/^0+(?=\w)/, '');
const normParty = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(private|pvt|limited|ltd|llp|india|online|services|the|co)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
const same = (a: FiledRow, t: InvoiceRow) => (a.pan && t.pan ? a.pan === t.pan : false) || normParty(a.party) === normParty(t.supplier);
export const KIND_WORDS: Record<DeviationKind, string> = {
  moved: 'Booked in another month', 'not-in-tally': 'Filed, not in Tally', 'not-filed': 'In Tally, not filed', 'tds-differs': 'TDS differs', 'filed-elsewhere': 'Filed in another month',
};

/**
 * Filed months ↔ Tally. Each filed bill takes ONE Tally bill (same party by PAN or name; bill no. equal to the Tally
 * reference or voucher no.; else amount within ₹1), same month first, then any month. Deviations per month:
 *  moved          filed in M, booked in Tally in T ≠ M (shown in M and in T)
 *  not-in-tally   filed, no Tally bill found
 *  tds-differs    matched, TDS differs by more than ₹1 from Tally (amount × rate)
 *  not-filed      a Tally bill of a FILED month that no filing holds
 *  filed-elsewhere  a Tally bill of an UNFILED month that a filed month already holds (left out of that month's report)
 */
export function matchFiled(filed: FiledDoc[], tally: Map<string, InvoiceRow[]>): { checks: Map<string, MonthCheck>; usedKeys: Map<string, string> } {
  const pool = [...tally.entries()].flatMap(([m, rows]) => rows.filter((r) => r.status === 'active' && r.tds !== 0).map((r) => ({ m, r })));
  const used = new Map<string, string>(); // Tally key → filed month
  const filedMonths = new Set(filed.map((f) => f.month));
  const checks = new Map<string, MonthCheck>();
  const check = (m: string) => {
    if (!checks.has(m)) checks.set(m, { month: m, filed: filedMonths.has(m), deviations: [], sections: [] });
    return checks.get(m)!;
  };
  for (const f of [...filed].sort((a, b) => a.month.localeCompare(b.month))) {
    const c = check(f.month);
    for (const a of f.rows) {
      const cand = pool.filter((p) => !used.has(p.r.key) && same(a, p.r));
      const billHit = (p: (typeof pool)[number]) => !!a.billNo && [p.r.invoiceNo, p.r.voucherNo].some((b) => b && normBill(b) === normBill(a.billNo));
      const amtHit = (p: (typeof pool)[number]) => Math.abs(p.r.taxable - a.amount) <= 1;
      const pick = cand.find((p) => p.m === f.month && billHit(p)) ?? cand.find(billHit) ?? cand.find((p) => p.m === f.month && amtHit(p)) ?? cand.find(amtHit);
      if (!pick) {
        c.deviations.push({ kind: 'not-in-tally', month: f.month, party: a.party, pan: a.pan, billNo: a.billNo, tallyDate: '', tallyMonth: '', filedMonth: f.month, filedTds: a.tds, tallyTds: null, note: 'No Tally bill with this party and bill no. or amount.' });
        continue;
      }
      used.set(pick.r.key, f.month);
      const tTds = reportTds(pick.r);
      const base = { party: a.party, pan: a.pan, billNo: a.billNo, tallyDate: pick.r.date, tallyMonth: pick.m, filedMonth: f.month, filedTds: a.tds, tallyTds: tTds };
      if (pick.m !== f.month) {
        const note = `Tally ${pick.r.date}, filed ${monthLabel(f.month)}.`;
        c.deviations.push({ kind: 'moved', month: f.month, ...base, note });
        if (filedMonths.has(pick.m)) check(pick.m).deviations.push({ kind: 'moved', month: pick.m, ...base, note });
      }
      if (Math.abs(tTds - a.tds) > 1) c.deviations.push({ kind: 'tds-differs', month: f.month, ...base, note: `Filed ${a.tds.toFixed(2)}, Tally ${tTds.toFixed(2)}.` });
    }
  }
  for (const p of pool) {
    if (used.has(p.r.key)) {
      if (!filedMonths.has(p.m)) check(p.m).deviations.push({ kind: 'filed-elsewhere', month: p.m, party: p.r.supplier, pan: p.r.pan, billNo: p.r.invoiceNo || p.r.voucherNo, tallyDate: p.r.date, tallyMonth: p.m, filedMonth: used.get(p.r.key)!, filedTds: null, tallyTds: reportTds(p.r), note: `Already filed in ${monthLabel(used.get(p.r.key)!)}. Left out of this month.` });
      continue;
    }
    if (filedMonths.has(p.m)) check(p.m).deviations.push({ kind: 'not-filed', month: p.m, party: p.r.supplier, pan: p.r.pan, billNo: p.r.invoiceNo || p.r.voucherNo, tallyDate: p.r.date, tallyMonth: p.m, filedMonth: '', filedTds: null, tallyTds: reportTds(p.r), note: 'No filing holds this bill. Check if its TDS is paid.' });
  }
  // Section totals: filed vs Tally booked in the same month.
  for (const f of filed) {
    const t = (tally.get(f.month) ?? []).filter((r) => r.status === 'active' && r.tds !== 0);
    check(f.month).sections = REPORT_BLOCKS.map((b) => {
      const fv = r2(f.rows.filter((r) => r.block === b.id).reduce((s, r) => s + r.tds, 0));
      const tv = r2(t.filter((r) => blockOf(r) === b.id).reduce((s, r) => s + reportTds(r), 0));
      return { id: b.id, filed: fv, tally: tv, diff: r2(tv - fv) };
    }).filter((x) => x.filed || x.tally);
  }
  return { checks, usedKeys: used };
}

// ---------------------------------------------------------------- the month's sheets

/** Report rows of a filed month: the team's rows as filed, in file order within each block. */
export const itemsOfFiled = (d: FiledDoc): ReportItem[] => d.rows.map((r) => ({ block: r.block, party: r.party, pan: r.pan, date: r.date, dateText: r.dateText, billNo: r.billNo, amount: r.amount, tds: r.tds, rate: r.rate }));

export const DEVIATION_HEADERS = ['#', 'Type', 'Party', 'PAN', 'Bill no.', 'Tally date', 'Tally month', 'Filed month', 'Filed TDS', 'Tally TDS', 'Note'] as const;

/** "Deviations from Tally" sheet: section totals (filed months), then one line per deviation. */
export function deviationsSheet(c: MonthCheck | undefined, month: string): { name: string; rows: ReportCell[][]; kind: 'table'; headerRows: number[] } {
  const rows: ReportCell[][] = [[`Deviations from Tally · ${monthLabel(month)}`], [c?.filed ? 'Source: the filed report. Tally checks it.' : 'Source: Tally (month not filed).'], []];
  const headerRows: number[] = [];
  if (c?.filed && c.sections.length) {
    headerRows.push(rows.length);
    rows.push(['Section', 'Filed TDS', 'Tally TDS (same month)', 'Difference']);
    for (const s of c.sections) rows.push([REPORT_BLOCKS.find((b) => b.id === s.id)!.summary, s.filed, s.tally, s.diff]);
    rows.push([]);
  }
  headerRows.push(rows.length);
  rows.push([...DEVIATION_HEADERS]);
  const list = c?.deviations ?? [];
  list.forEach((d, i) => rows.push([i + 1, KIND_WORDS[d.kind], d.party, d.pan, d.billNo, d.tallyDate ? new Date(Number(d.tallyDate.slice(0, 4)), Number(d.tallyDate.slice(5, 7)) - 1, Number(d.tallyDate.slice(8, 10))) : '', d.tallyMonth ? monthLabel(d.tallyMonth) : '', d.filedMonth ? monthLabel(d.filedMonth) : '', d.filedTds ?? '', d.tallyTds ?? '', d.note]));
  if (!list.length) rows.push(['', 'No deviations.']);
  return { name: 'Deviations from Tally', rows, kind: 'table', headerRows };
}

/** The month's report: filed → the team's rows + their summary; unfiled → Tally rows not already filed elsewhere. */
export function monthReport(month: string, filed: FiledDoc | null, tallyRows: InvoiceRow[], usedKeys: Map<string, string>) {
  if (filed) return buildReportSheet(month, itemsOfFiled(filed), filed.summary);
  const rows = tallyRows.filter((r) => r.status === 'active' && r.tds !== 0 && !usedKeys.has(r.key));
  const items = REPORT_BLOCKS.flatMap((b) => rows.map(itemOfBill).filter((it) => it.block === b.id)
    .sort((a, c) => Number(!a.headline) - Number(!c.headline) || a.party.localeCompare(c.party) || a.date.localeCompare(c.date)));
  return buildReportSheet(month, items);
}

/** Σ TDS of a filed doc's rows per block (History tiles, compare). */
export const filedBlockTotals = (d: FiledDoc) => Object.fromEntries(REPORT_BLOCKS.map((b) => [b.id, r2(d.rows.filter((r) => r.block === b.id).reduce((s, r) => s + r.tds, 0))])) as Record<ReportBlockId, number>;

