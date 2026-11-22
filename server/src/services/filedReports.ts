// Filed TDS reports (founder, 22 Nov 2026): the accounts team's report for a month they have filed is the truth for that
// month; Tally only cross-checks it. The browser reads their .xlsx (client/src/data/tds/filed.ts parseFiledWorkbook) and
// sends one parsed doc per month; this file checks and trims it. Stored as tds/filed-<YYYY-MM> (object store, never the
// repo: party names, PANs, bill numbers). Pure. Tests: server/test/filedReports.test.ts.

const BLOCKS = new Set(['jobwork', 'others', 'commission', 'rent', 'professional', 'other']);
const MONTH = /^\d{4}-\d{2}$/;
const MAX_ROWS = 3000;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const n2 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

export interface StoredFiledDoc {
  month: string; fileName: string; sheetName: string;
  rows: { block: string; party: string; pan: string; date: string; dateText: string; billNo: string; amount: number; tds: number; rate: number | null }[];
  summary: { label: string; value: number }[];
  totalPayable: number; netPayable: number; warnings: string[];
  uploadedAt: string; uploadedBy: string | null;
}

/** A parsed filed doc from the browser → the stored shape, or an error sentence. */
export function sanitizeFiled(body: unknown, month: string, by: string | null, at: string): StoredFiledDoc | { error: string } {
  if (!MONTH.test(month)) return { error: 'Month must be YYYY-MM.' };
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.month !== month) return { error: 'The file month does not match the address.' };
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return { error: 'The report has no bills.' };
  if (rows.length > MAX_ROWS) return { error: `More than ${MAX_ROWS} bills in one month.` };
  const clean = rows.map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    return {
      block: BLOCKS.has(String(r.block)) ? String(r.block) : 'other',
      party: str(r.party), pan: str(r.pan, 12).toUpperCase(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) ? String(r.date) : '',
      dateText: str(r.dateText, 40), billNo: str(r.billNo, 60),
      amount: n2(r.amount), tds: n2(r.tds),
      rate: typeof r.rate === 'number' && r.rate > 0 && r.rate <= 1 ? r.rate : null,
    };
  }).filter((r) => r.party && (r.amount || r.tds));
  if (!clean.length) return { error: 'The report has no bills.' };
  const summary = (Array.isArray(b.summary) ? b.summary : []).slice(0, 30).map((x) => {
    const l = (x ?? {}) as Record<string, unknown>;
    return { label: str(l.label, 40), value: n2(l.value) };
  }).filter((l) => l.label);
  return {
    month, fileName: str(b.fileName, 120), sheetName: str(b.sheetName, 60), rows: clean, summary,
    totalPayable: n2(b.totalPayable), netPayable: n2(b.netPayable),
    warnings: (Array.isArray(b.warnings) ? b.warnings : []).slice(0, 10).map((w) => str(w, 200)),
    uploadedAt: at, uploadedBy: by,
  };
}
