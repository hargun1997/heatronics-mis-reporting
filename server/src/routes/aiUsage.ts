// ----------------------------------------------------------------------------
// GET /api/ai/usage?months=<n> — the AI usage feed (schema 1) read by the master
// portal's Spend view. Stored usage records only (ingest/objectStore usage/<day>/);
// never calls Claude or Gemini. Behind htxGate like every API; the MIS has no roles,
// so any signed-in Heatronics user may read it (spend is counts and money only).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { usageRecordsSince } from '../ingest/objectStore.js';
import { buildAiUsageFeed, clampMonths, feedFromDay } from '../services/aiUsageFeed.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const months = clampMonths(req.query.months ?? undefined);
  const now = new Date();
  usageRecordsSince(feedFromDay(now, months))
    .then((records) => {
      res.set('Cache-Control', 'no-store').json(buildAiUsageFeed(records, { months, now }));
    })
    .catch((err: unknown) => {
      console.error('ai usage feed error:', err);
      if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
    });
});

export default router;
