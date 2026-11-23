// GST refund page data: the month from GET /api/gst-refund, the GSTR-2B reader (portal Excel → rows, in the browser), and the
// Statement 1A sheet in the exact column order of the GST portal's offline utility (RFD_STMT01A, version 2.0).
// Pure parts (gstr2bRows, statementSheets) are tested in server/test/gstRefundClient.test.ts with synthetic data.
import { useCallback, useEffect, useState } from 'react';

export type InwardClass = 'input' | 'service' | 'capital' | 'blocked' | 'rcm' | 'unregistered' | 'stock-transfer' | 'no-gst';
export type Severity = 'error' | 'warn' | 'info';
export interface Issue { key: string; severity: Severity; code: string; text: string; fix: string }
export interface InwardDoc {
  key: string; guid: string; date: string; vType: string; number: string; party: string; gstin: string;
  invoice: string; invoiceDate: string; docType: string; supplyType: string;
  taxable: number; igst: number; cgst: number; sgst: number; rate: number | null;
  cls: InwardClass; why: string; sure: boolean; ruled: boolean; eligible: boolean; leftOut: string;
  ledgers: string; narration: string; items: number; in2b: boolean | null;
}
export interface OutwardDoc {
  key: string; date: string; vType: string; number: string; party: string; gstin: string;
  supplyType: 'B2B' | 'B2C-Large' | 'B2C-Small'; docType: string;
  taxable: number; igst: number; cgst: number; sgst: number; rate: number | null; value: number;
}
export interface Calc {
  netItc: number; itcInputs: number; itcServices: number; servicesLeftOut: number;
  invertedTurnover: number; adjustedTurnover: number; taxPayable: number; maxRefund: number;
  invertedRates: number[]; outputRates: { rate: number; taxable: number; tax: number; inverted: boolean }[];
  topInputRate: number | null; ecl: number | null; claim: number;
}
export interface Tie { label: string; tally: number; refund: number; diff: number; ok: boolean; note: string }
export interface TwoBRow { gstin: string; invoice: string; date: string; taxable: number; igst: number; cgst: number; sgst: number; type?: string }
export interface FiledClaim { arn: string; filedOn: string; amount: number; by: string | null; at: string }
export interface RefundApi {
  month: string; homeState: string; gstin: string; from: string; to: string;
  inward: InwardDoc[]; outward: OutwardDoc[]; issues: Issue[]; calc: Calc; ties: Tie[];
  counts: { vouchers: number; otherGstins: number; inward: number; eligible: number; outward: number; errors: number; warns: number; checks: number };
  twoB: { uploaded: boolean; rows: number; matched: number; notInTally: TwoBRow[] };
  ready: boolean; notReady: string[];
  stored: boolean; booksAsOf: string | null; reachedAt: string | null;
  settings: { homeState: string; gstin: string };
  record: { ecl: number | null; filed: FiledClaim | null };
  drift: { added: string[]; removed: string[]; changed: string[]; netItcNow: number; netItcFiled: number; diff: number } | null;
  twoBFile: { file: string; uploadedAt: string; by: string | null } | null;
}
export interface AiSuggestion { key: string; cls: InwardClass; why: string; confidence: 'high' | 'medium' | 'low' }
export interface RefundRules { bills: Record<string, InwardClass>; parties: Record<string, InwardClass>; ledgers: Record<string, InwardClass> }

export const CLASS_WORDS: Record<InwardClass, string> = {
  input: 'Goods (input)', service: 'Service', capital: 'Capital goods', blocked: 'Blocked credit', rcm: 'Reverse charge',
  unregistered: 'Unregistered', 'stock-transfer': 'Own stock transfer', 'no-gst': 'No GST',
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'include', ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Could not load (${r.status})`);
  return j as T;
}
const send = <T,>(url: string, method: string, body: unknown) => getJson<T>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function useGstRefund(month: string) {
  const [got, setGot] = useState<{ month: string; api: RefundApi | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    getJson<RefundApi>(`/api/gst-refund?month=${month}`)
      .then((j) => { if (live) setGot({ month, api: j, error: null }); })
      .catch((e: Error) => { if (live) setGot({ month, api: null, error: e.message }); });
    return () => { live = false; };
  }, [month, tick]);
  const cur = got && got.month === month ? got : null;
  return { api: cur?.api ?? null, error: cur?.error ?? null, loading: !cur, reload };
}

export const loadRules = async (): Promise<RefundRules> => (await getJson<{ rules?: RefundRules }>('/api/gst-refund/rules').catch(() => ({ rules: undefined }))).rules ?? { bills: {}, parties: {}, ledgers: {} };
export const saveRules = (rules: RefundRules) => send<{ ok: boolean }>('/api/gst-refund/rules', 'PUT', rules);
export const saveTwoB = (month: string, rows: TwoBRow[], file: string) => send<{ ok: boolean; rows: number }>(`/api/gst-refund/2b/${month}`, 'PUT', { rows, file });
export const deleteTwoB = (month: string) => getJson<{ ok: boolean }>(`/api/gst-refund/2b/${month}`, { method: 'DELETE' });
export const saveMonth = (month: string, body: { ecl?: number | null; filed?: { arn: string; filedOn: string; amount: number }; unfile?: boolean }) => send<{ ok: boolean }>(`/api/gst-refund/month/${month}`, 'PUT', body);
export const saveSettings = (s: { gstin: string; homeState: string }) => send<{ ok: boolean }>('/api/gst-refund/settings', 'PUT', s);
export const askAi = (month: string, keys?: string[]) => send<{ suggestions: AiSuggestion[]; error: string | null }>(`/api/gst-refund/ai/${month}`, 'POST', keys ? { keys } : {});

// ------------------------------------------------------------------ GSTR-2B Excel (portal download) → rows
const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,₹\s]/g, '')) || 0);
/** dd-mm-yyyy / dd/mm/yyyy / Excel serial / ISO → YYYY-MM-DD ('' when unreadable). */
export function dayOf(v: unknown): string {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})$/);
  if (m) { const mo = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) / 3 + 1; const y = m[3].length === 2 ? `20${m[3]}` : m[3]; if (mo > 0) return `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return '';
}

/** Rows of the portal's GSTR-2B Excel: sheet "B2B" (and "B2B-DNR" / "B2B-CDNR" debit notes). The header spans 2 rows. */
export function gstr2bRows(sheets: { name: string; rows: unknown[][] }[]): { rows: TwoBRow[]; skipped: number; sheets: string[] } {
  const out: TwoBRow[] = [];
  let skipped = 0;
  const used: string[] = [];
  for (const sh of sheets) {
    if (!/^b2b(-?(c?dnr))?$/i.test(sh.name.trim()) || /b2ba/i.test(sh.name)) continue;
    const hr = sh.rows.findIndex((r) => r.some((c) => /gstin of supplier/i.test(norm(c))));
    if (hr < 0) continue;
    const width = Math.max(sh.rows[hr]?.length ?? 0, sh.rows[hr + 1]?.length ?? 0);
    const label = (c: number) => `${norm(sh.rows[hr]?.[c])} ${norm(sh.rows[hr + 1]?.[c])}`.trim();
    const col = (re: RegExp) => { for (let c = 0; c < width; c++) if (re.test(label(c))) return c; return -1; };
    const cG = col(/gstin of supplier/), cInv = col(/(invoice|note) number/), cDate = col(/(invoice|note) date/);
    const cTax = col(/taxable value/), cI = col(/integrated tax/), cC = col(/central tax/), cS = col(/state\/ut tax|state tax/);
    const cType = col(/note type/);
    if (cG < 0 || cInv < 0) continue;
    used.push(sh.name);
    const note = /dnr/i.test(sh.name);
    for (const r of sh.rows.slice(hr + 1)) {
      const g = String(r[cG] ?? '').trim().toUpperCase();
      if (!/^\d{2}[A-Z0-9]{13}$/.test(g)) { if (g) skipped++; continue; }
      const credit = note && /credit/i.test(String(cType >= 0 ? r[cType] : ''));
      const sign = credit ? -1 : 1;
      out.push({
        gstin: g, invoice: String(r[cInv] ?? '').trim(), date: cDate >= 0 ? dayOf(r[cDate]) : '',
        taxable: sign * num(cTax >= 0 ? r[cTax] : 0), igst: sign * num(cI >= 0 ? r[cI] : 0), cgst: sign * num(cC >= 0 ? r[cC] : 0), sgst: sign * num(cS >= 0 ? r[cS] : 0),
        type: note ? (credit ? 'Credit Note' : 'Debit Note') : 'Invoice',
      });
    }
  }
  return { rows: out.filter((r) => r.invoice), skipped, sheets: used };
}

// ------------------------------------------------------------------ Statement 1A (offline utility column order)
export type Cell = string | number | null;
export const UTILITY_HEADERS = [
  'Sr. No.*', 'Type of Inward Supply*', 'GSTIN of Supplier/Self GSTIN*', 'Type of Document*', 'No./B/E*', 'Date* (dd-mm-yyyy)', 'Port Code',
  'Taxable Value*', 'Integrated Tax', 'Central Tax', 'State/Union Territory Tax',
  'Type of Outward Supply*', 'Type of Document*', 'No*', 'Date* (dd-mm-yyyy)', 'Taxable Value*', 'Integrated Tax', 'Central Tax', 'State/Union Territory Tax',
];
export const UTILITY_MAX_ROWS = 10_000;
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const a2 = (n: number) => Math.round(Math.abs(n) * 100) / 100;
const inr = (n: number) => Math.round(n * 100) / 100;

/** Statement 1A sheet(s): inward row i beside outward row i, as the utility lays them out; values positive, the document type
 *  says Debit / Credit Note. More than 10,000 rows = one sheet per 10,000 (the utility takes 10,000 at a time). */
export function statementSheets(api: Pick<RefundApi, 'gstin' | 'from' | 'to' | 'inward' | 'outward'>): { name: string; rows: Cell[][]; headerRows: number[] }[] {
  const inward = api.inward.filter((d) => d.eligible);
  const outward = api.outward.filter((d) => Math.abs(d.igst + d.cgst + d.sgst) > 0.004);
  const total = Math.max(inward.length, outward.length);
  const parts = Math.max(1, Math.ceil(total / UTILITY_MAX_ROWS));
  const out: { name: string; rows: Cell[][]; headerRows: number[] }[] = [];
  for (let p = 0; p < parts; p++) {
    const rows: Cell[][] = [
      ['Goods and Services Tax'],
      ['Statement-1A [rule 89(2)(h)]: ITC accumulated due to Inverted Tax Structure [clause (ii) of first proviso to section 54(3)]'],
      ['GSTIN*', api.gstin || 'Enter GSTIN in Settings'],
      ['From Return Period* (mmyyyy)', api.from, 'To Return Period* (mmyyyy)', api.to],
      [],
      ['', 'Details of documents of inward supplies received', '', '', '', '', '', '', 'Tax paid on inward supplies', '', '', 'Details of documents of outward supplies issued', '', '', '', 'Tax paid on outward supplies'],
      UTILITY_HEADERS,
    ];
    const head = rows.length - 1;
    for (let i = p * UTILITY_MAX_ROWS; i < Math.min(total, (p + 1) * UTILITY_MAX_ROWS); i++) {
      const d = inward[i], o = outward[i];
      rows.push([
        i + 1,
        d ? d.supplyType : null, d ? d.gstin : null, d ? d.docType : null, d ? d.invoice : null, d ? dmy(d.invoiceDate || d.date) : null, null,
        d ? a2(d.taxable) : null, d ? a2(d.igst) : null, d ? a2(d.cgst) : null, d ? a2(d.sgst) : null,
        o ? o.supplyType : null, o ? o.docType : null, o ? o.number : null, o ? dmy(o.date) : null,
        o ? a2(o.taxable) : null, o ? a2(o.igst) : null, o ? a2(o.cgst) : null, o ? a2(o.sgst) : null,
      ]);
    }
    out.push({ name: parts > 1 ? `RFD_STMT01A (${p + 1})` : 'RFD_STMT01A', rows, headerRows: [head] });
  }
  return out;
}

/** Working sheet for the CA: the Rule 89(5) calculation, step by step. */
export function workingSheet(api: Pick<RefundApi, 'month' | 'calc' | 'ties' | 'counts' | 'notReady'>): Cell[][] {
  const c = api.calc;
  return [
    [`GST refund working: inverted duty structure, ${api.month}`],
    ['Rule 89(5) as substituted by Notification 05/2026-Central Tax (in force 1 Nov 2026)'],
    [],
    ['Line', 'Amount (₹)', 'How it is made'],
    ['ITC on inputs (goods)', inr(c.itcInputs), 'Eligible goods bills of the month, in GSTR-2B'],
    ['ITC on eligible input services', inr(c.itcServices), 'Services with ITC availed on or after 1 Nov 2026'],
    ['Net ITC', inr(c.netItc), 'Inputs + eligible input services (capital goods from 1 Apr 2027)'],
    ['Turnover of inverted rated supply', inr(c.invertedTurnover), `Outward supplies at ${c.invertedRates.join(' / ') || 'no'} % (inputs up to ${c.topInputRate ?? '-'} %)`],
    ['Adjusted total turnover', inr(c.adjustedTurnover), 'All taxable outward supplies of the GSTIN, net of credit notes'],
    ['Tax payable on inverted rated supply', inr(c.taxPayable), 'Output tax on those supplies'],
    ['Maximum refund', inr(c.maxRefund), '(Inverted turnover × Net ITC ÷ Adjusted total turnover) − Tax payable'],
    ['Electronic credit ledger balance', c.ecl == null ? 'Not entered' : inr(c.ecl), 'Lowest balance from the end of the period to filing'],
    ['Refund to claim', inr(c.claim), 'Lower of the maximum refund and the ledger balance'],
    [],
    ['Output rate %', 'Taxable (₹)', 'Tax (₹)', 'Inverted'],
    ...c.outputRates.map((r) => [r.rate, r.taxable, r.tax, r.inverted ? 'Yes' : 'No'] as Cell[]),
    [],
    ['Check', 'Tally (₹)', 'Rows (₹)', 'Difference (₹)', 'Note'],
    ...api.ties.map((t) => [t.label, t.tally, t.refund, t.diff, t.note] as Cell[]),
    [],
    ['Not ready because', ...(api.notReady.length ? [] : ['Ready'])],
    ...api.notReady.map((x) => [x] as Cell[]),
  ];
}

export function leftOutSheet(api: Pick<RefundApi, 'inward'>): Cell[][] {
  return [
    ['Date', 'Voucher', 'Supplier', 'GSTIN', 'Bill no.', 'Taxable (₹)', 'GST (₹)', 'Class', 'Left out because'],
    ...api.inward.filter((d) => !d.eligible).map((d) => [dmy(d.date), `${d.vType} ${d.number}`, d.party, d.gstin, d.invoice, inr(d.taxable), inr(d.igst + d.cgst + d.sgst), CLASS_WORDS[d.cls], d.leftOut] as Cell[]),
  ];
}

export function checksSheet(api: Pick<RefundApi, 'issues'>): Cell[][] {
  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return [
    ['Level', 'Problem', 'Fix'],
    ...[...api.issues].sort((a, b) => order[a.severity] - order[b.severity]).map((i) => [i.severity === 'error' ? 'Error' : i.severity === 'warn' ? 'Check' : 'Note', i.text, i.fix] as Cell[]),
  ];
}
