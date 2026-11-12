// ----------------------------------------------------------------------------
// Monthly expenses from the Tally P&L uploads, for other Heatronics tools
// (production.heatronics.in pulls them into its monthly overheads → conversion
// cost per product).
//
//   GET /api/expenses              every month with a Tally P&L upload
//   GET /api/expenses?month=2026-09 one month
//
// Each month: the P&L's expense lines as uploaded (Factory Overheads, Manufacturing
// Costs, Employee Cost - Indirect, Admin & General Expenses…), amounts in ₹ as
// printed in Tally. Sales, income, stock and purchase lines are left out.
// Callers send `Authorization: Bearer <token>` (on Cloud Run the token is required; see expensesAllowed). The token is env
// EXPENSES_API_TOKEN, else the shared Secret Manager entry `mis-expenses-token` (the same one Ops and Production send).
// ----------------------------------------------------------------------------

import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { readAllExtracted } from '../ingest/objectStore.js';
/** Not running costs: revenue, other income, stock movement, purchases, group rows and totals (shared with the CEO summary). */
import { NOT_EXPENSE } from '../connectors/tally/tbRows.js';
import { sharedSecret } from '../connectors/sharedSecrets.js';

/** Shared secret name: Ops (`lib/pnl/mis.ts`) and Production (`/api/tranzact/overheads/mis`) send this value. */
export const EXPENSES_SECRET = 'mis-expenses-token';


const router = Router();

interface Row { name: string; amount: number }
interface PnlPayload { ledgerRows?: { name?: string; amount?: number }[]; nettProfit?: number | null }


export function expenseRows(p: PnlPayload): Row[] {
  const out = new Map<string, number>();
  for (const r of p.ledgerRows || []) {
    const name = String(r.name || '').replace(/\s+/g, ' ').trim();
    const amount = Number(r.amount) || 0;
    if (!name || !amount || NOT_EXPENSE.test(name)) continue;
    out.set(name, Math.round(((out.get(name) || 0) + amount) * 100) / 100);
  }
  return [...out].map(([name, amount]) => ({ name, amount }));
}

/**
 * Open path (no login): production.heatronics.in calls it with `Authorization: Bearer <EXPENSES_API_TOKEN>`.
 * A signed-in person (req.htxAuthed, set by htxGate) may read it too. With no token configured the endpoint
 * stays open ONLY off Cloud Run (local dev) — on Cloud Run it fails closed, since the repo (and so this URL) is public.
 */
export function expensesAllowed(req: Pick<Request, 'headers'> & { htxAuthed?: boolean }, env = process.env, shared: string | null = null): boolean {
  if (req.htxAuthed === true) return true;
  const token = env.EXPENSES_API_TOKEN || shared;
  if (!token) return !env.K_SERVICE;
  const got = Buffer.from(String(req.headers.authorization ?? ''));
  const want = Buffer.from(`Bearer ${token}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

router.get('/', (req: Request, res: Response) => {
  (async () => {
    const shared = process.env.EXPENSES_API_TOKEN ? null : await sharedSecret(EXPENSES_SECRET);
    if (!expensesAllowed(req, process.env, shared)) return res.status(401).json({ error: 'Not allowed' });
    const want = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : null;
    const all = await readAllExtracted();
    const months = all
      .filter((r) => r.connectorId === 'tally' && r.slotId === 'pnl' && (!want || r.periodKey === want))
      .map((r) => {
        const rows = expenseRows(r.payload as PnlPayload);
        return { month: r.periodKey, rows, total: Math.round(rows.reduce((a, x) => a + x.amount, 0)) };
      })
      // months with only a stray line or two are empty uploads, not a real P&L
      .filter((m) => m.rows.length >= 3)
      .sort((a, b) => a.month.localeCompare(b.month));
    if (want && !months.length) return res.status(404).json({ error: `No Tally P&L for ${want} in the MIS yet.` });
    res.json({ source: 'Tally P&L uploads (MIS → Upload data)', months });
  })().catch((err: unknown) => {
    console.error('expenses route error:', err);
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
  });
});

export default router;
