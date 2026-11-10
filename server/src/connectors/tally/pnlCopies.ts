// ----------------------------------------------------------------------------
// Two stored P&L copies of a month (audit round 7 #10): the poll's snapshot (tally/pnl-<m>, read by the statements, the
// CEO summary and MCP) and the committed close report (ingest tally|pnl|<m>, read by Live MIS, the tie and /api/expenses).
// When they disagree the readers disagree, so: (1) a Fix item names the month when their Nett Profit differs by more than
// ₹1,000, (2) the statements / summary readers use the NEWER of the two. PURE; tests server/test/pnlCopies.test.ts.
// ----------------------------------------------------------------------------

export interface PnlCopy { nettProfit: number | null; ledgerRows: { name: string; amount: number }[]; at: string | null }
export const PNL_GAP_LIMIT_INR = 1000;

const rowsOf = (raw: unknown): { name: string; amount: number }[] =>
  Array.isArray(raw) ? raw.filter((r) => r && typeof r.name === 'string' && typeof r.amount === 'number').map((r) => ({ name: r.name as string, amount: r.amount as number })) : [];

/** A committed report payload as a copy (null when it carries no ledger rows). */
export function committedCopy(payload: { ledgerRows?: unknown; nettProfit?: number | null } | null | undefined, savedAt: string | null): PnlCopy | null {
  const rows = rowsOf(payload?.ledgerRows);
  if (!rows.length) return null;
  return { nettProfit: typeof payload?.nettProfit === 'number' ? payload.nettProfit : null, ledgerRows: rows, at: savedAt };
}

/** The newer of the two copies (a copy with no date loses to a dated one; both undated → the snapshot). */
export function pickPnlCopy(snapshot: PnlCopy | null, committed: PnlCopy | null): { copy: PnlCopy | null; source: 'snapshot' | 'committed' | null } {
  if (!snapshot?.ledgerRows.length) return committed ? { copy: committed, source: 'committed' } : { copy: null, source: null };
  if (!committed) return { copy: snapshot, source: 'snapshot' };
  const t = (c: PnlCopy) => (c.at ? Date.parse(c.at) : NaN);
  const ts = t(snapshot), tc = t(committed);
  if (Number.isFinite(tc) && (!Number.isFinite(ts) || tc > ts)) return { copy: committed, source: 'committed' };
  return { copy: snapshot, source: 'snapshot' };
}

export interface PnlGap { period: string; snapshot: number; committed: number; gap: number; newer: 'snapshot' | 'committed' }
/** Months whose two copies' Nett Profit differ by more than ₹1,000. */
export function pnlCopyGaps(months: { period: string; snapshot: PnlCopy | null; committed: PnlCopy | null }[], limit = PNL_GAP_LIMIT_INR): PnlGap[] {
  const out: PnlGap[] = [];
  for (const m of months) {
    const a = m.snapshot?.nettProfit, b = m.committed?.nettProfit;
    if (a == null || b == null || Math.abs(a - b) <= limit) continue;
    out.push({ period: m.period, snapshot: Math.round(a), committed: Math.round(b), gap: Math.round(a - b), newer: pickPnlCopy(m.snapshot, m.committed).source ?? 'snapshot' });
  }
  return out.sort((x, y) => y.period.localeCompare(x.period));
}
