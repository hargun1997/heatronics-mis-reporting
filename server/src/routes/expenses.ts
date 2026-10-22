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
// When EXPENSES_API_TOKEN is set, callers must send `Authorization: Bearer <token>`.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readAllExtracted } from '../ingest/objectStore.js';

const router = Router();

interface Row { name: string; amount: number }
interface PnlPayload { ledgerRows?: { name?: string; amount?: number }[]; nettProfit?: number | null }

/** Not running costs: revenue, other income, stock movement, purchases, and totals. */
const NOT_EXPENSE = /\bsales$|\bsales returns?\b|income|stock|purchase|^direct expenses$|^indirect expenses$|total|nett? profit|gross profit/i;

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

router.get('/', (req: Request, res: Response) => {
  (async () => {
    const token = process.env.EXPENSES_API_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: 'Not allowed' });
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
