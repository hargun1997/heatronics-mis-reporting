// ----------------------------------------------------------------------------
// AI usage — how much the Claude API has cost, per day. Priced from the exact
// token usage each response reports, tallied in the durable store.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { usageByDay } from '../ingest/objectStore.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('usage route error:', err);
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
  });
};

router.get('/', h(async (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
  const list = await usageByDay(days);
  const today = list[0] ?? null;
  const totalUsd = Math.round(list.reduce((s, d) => s + d.costUsd, 0) * 1e6) / 1e6;
  res.json({ days: list, today, windowDays: days, totalUsd });
}));

export default router;
