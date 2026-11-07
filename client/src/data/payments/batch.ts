// Payment batches for the Bulk payments tool (pure): default mode, checks, totals, the payment file rows and
// matching a pasted name / amount list to saved payees. Files only — nothing here reaches a bank.

import { PAYMENT_FORMAT, type PayMode, type PaymentContext, type PaymentFormat, type PaymentLine } from './iciciFormats';
import { ACCOUNT_RE, IFSC_RE, isActive, isIciciPayee, type Payee } from './payees';

export const RTGS_MIN_PAISE = 2_00_000_00;
export const IMPS_MAX_PAISE = 5_00_000_00;

export interface BatchRow {
  payeeId: string;
  amountPaise: number;
  mode: PayMode;
  remark: string;
}

/** Same bank → FT; ₹2,00,000 or more → RTGS; else NEFT. */
export function defaultMode(p: Pick<Payee, 'ifsc' | 'bankType'>, amountPaise: number): PayMode {
  if (isIciciPayee(p)) return 'FT';
  return amountPaise >= RTGS_MIN_PAISE ? 'RTGS' : 'NEFT';
}

/** "1,23,456.5" / "₹ 500" / "500/-" → paise; NaN when it is not an amount. */
export function parseAmount(s: string): number {
  const t = String(s ?? '').replace(/₹|rs\.?|inr|\/-|,|\s/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const [r, p = ''] = t.split('.');
  return Number(r) * 100 + Number((p + '00').slice(0, 2));
}

export const inr = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Problems with one row (blocking). */
export function rowProblems(r: BatchRow, p: Payee | undefined): string[] {
  const e: string[] = [];
  if (!p) return ['Payee not in the saved list'];
  if (!isActive(p)) e.push('Payee is not Active in CIB');
  if (!Number.isFinite(r.amountPaise) || r.amountPaise <= 0) e.push('Amount missing');
  if (r.mode === 'FT' && !isIciciPayee(p)) e.push('FT is only for ICICI accounts');
  if (r.mode !== 'FT' && !p.ifsc) e.push('No IFSC: use FT for ICICI, or fix the payee');
  if (r.mode === 'RTGS' && r.amountPaise < RTGS_MIN_PAISE) e.push('RTGS needs ₹2,00,000 or more');
  if (r.mode === 'IMPS' && r.amountPaise > IMPS_MAX_PAISE) e.push('IMPS is up to ₹5,00,000');
  return e;
}

export function batchProblems(ctx: PaymentContext, rows: BatchRow[], payees: Payee[]): string[] {
  const e: string[] = [];
  if (!ACCOUNT_RE.test(ctx.debitAccount)) e.push('Type the debit account number (6–20 digits)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.date)) e.push('Pick the payment date');
  if (!rows.length) e.push('Pick at least one payee');
  const byId = new Map(payees.map((p) => [p.id, p]));
  const bad = rows.filter((r) => rowProblems(r, byId.get(r.payeeId)).length).length;
  if (bad) e.push(`${bad} row(s) need a fix (see the red notes)`);
  return e;
}

export interface Totals { count: number; paise: number; byMode: Record<PayMode, { count: number; paise: number }> }
export function totals(rows: BatchRow[]): Totals {
  const byMode = { FT: { count: 0, paise: 0 }, NEFT: { count: 0, paise: 0 }, RTGS: { count: 0, paise: 0 }, IMPS: { count: 0, paise: 0 } };
  let paise = 0;
  for (const r of rows) {
    const a = Number.isFinite(r.amountPaise) ? r.amountPaise : 0;
    paise += a;
    byMode[r.mode].count++;
    byMode[r.mode].paise += a;
  }
  return { count: rows.length, paise, byMode };
}

/** Header + one row per payment, in the configured format (all text). */
export function buildPaymentRows(ctx: PaymentContext, rows: BatchRow[], payees: Payee[], batchId: string, format: PaymentFormat = PAYMENT_FORMAT): string[][] {
  const byId = new Map(payees.map((p) => [p.id, p]));
  const lines: PaymentLine[] = rows.map((r, i) => {
    const p = byId.get(r.payeeId);
    if (!p) throw new Error(`Payee ${r.payeeId} is not in the saved list`);
    return {
      name: p.name, account: p.account, ifsc: p.ifsc && IFSC_RE.test(p.ifsc) ? p.ifsc : '',
      amountPaise: r.amountPaise, mode: r.mode, remark: r.remark, ref: `${batchId}-${String(i + 1).padStart(3, '0')}`,
    };
  });
  return [format.columns.map((c) => c.header), ...lines.map((l) => format.columns.map((c) => c.value(l, ctx)))];
}

/** CSV text (quoted when needed). */
export function toCsv(rows: string[][]): string {
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map((v) => q(String(v ?? ''))).join(',')).join('\r\n') + '\r\n';
}

// ---- Paste a name / amount list ----------------------------------------------------------------------------

const STOP = new Set(['m', 's', 'ms', 'mr', 'mrs', 'pvt', 'private', 'ltd', 'limited', 'llp', 'and', 'the', 'co', 'company', 'india', 'enterprises', 'enterprise']);
export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string) => normName(s).split(' ').filter((t) => t && !STOP.has(t));

/** 0..1 — shared words (Dice), with a bonus when one name contains the other. */
export function nameScore(a: string, b: string): number {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const dice = (2 * common) / (ta.size + tb.size);
  const joinedA = [...ta].join(''), joinedB = [...tb].join('');
  if (joinedA === joinedB) return 0.97;
  const contains = joinedA.length >= 4 && joinedB.length >= 4 && (joinedA.includes(joinedB) || joinedB.includes(joinedA));
  return Math.max(dice, contains ? 0.8 : 0);
}

export interface PasteLine { line: number; text: string; name: string; amountPaise: number }
export interface MatchResult {
  line: PasteLine;
  kind: 'exact' | 'fuzzy' | 'none' | 'bad_amount';
  payee?: Payee;
  score?: number;
  /** Other close payees (fuzzy only). */
  others?: Payee[];
}

/** "Name<TAB>Amount" or "Name, Amount" lines (Excel copy). The last cell that is an amount is the amount. */
export function parsePasteList(text: string): PasteLine[] {
  const out: PasteLine[] = [];
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    let cells: string[];
    if (raw.includes('\t')) cells = raw.split('\t').filter((c, j, a) => c.trim() || j < a.length - 1);
    else {
      // "Name, 1,23,000.00" — the trailing amount may itself hold commas
      const m = /^(.*?)[,;\s]+((?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?(?:\/-)?)\s*$/i.exec(raw);
      cells = m ? [m[1], m[2]] : raw.split(/[,;](?=[^,;]*$)/);
    }
    const amt = cells.length > 1 ? parseAmount(cells[cells.length - 1]) : NaN;
    const name = (cells.length > 1 ? cells.slice(0, -1).join(' ') : raw).trim();
    if (!name || /^(name|payee|bnf_name)$/i.test(name)) return;
    out.push({ line: i + 1, text: raw, name, amountPaise: amt });
  });
  return out;
}

/** Match each pasted line to an ACTIVE payee by name or short name. Exact = same normalised name; fuzzy needs a person's OK. */
export function matchPaste(lines: PasteLine[], payees: Payee[], min = 0.6): MatchResult[] {
  const active = payees.filter(isActive);
  return lines.map((line) => {
    if (!Number.isFinite(line.amountPaise) || line.amountPaise <= 0) return { line, kind: 'bad_amount' };
    const n = normName(line.name);
    const exact = active.filter((p) => normName(p.name) === n || (p.shortName && normName(p.shortName) === n));
    if (exact.length === 1) return { line, kind: 'exact', payee: exact[0], score: 1 };
    const scored = (exact.length ? exact : active)
      .map((p) => ({ p, s: Math.max(nameScore(line.name, p.name), p.shortName ? nameScore(line.name, p.shortName) : 0) }))
      .filter((x) => x.s >= min)
      .sort((a, b) => b.s - a.s);
    if (!scored.length) return { line, kind: 'none' };
    return { line, kind: 'fuzzy', payee: scored[0].p, score: scored[0].s, others: scored.slice(1, 4).map((x) => x.p) };
  });
}

export const newBatchId = (d = new Date()) =>
  `PB${d.toISOString().slice(2, 10).replace(/-/g, '')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
