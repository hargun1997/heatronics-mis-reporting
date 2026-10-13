// ----------------------------------------------------------------------------
// Issues routes — run the cross-month anomaly scan over the committed store.
//
// GET  /api/issues       → scan now, return the issue list (the dashboard).
// POST /api/issues/scan  → same scan, for a scheduler to hit daily. Returns the
//                          same payload; emailing the digest is layered on once
//                          the mailer exists (see the ownership/reminders work).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readAllExtracted } from '../ingest/objectStore.js';
import { scanIssues } from '../services/anomalyScan.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('issues route error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
    }
  });
};

const run = async (res: Response) => {
  const reports = await readAllExtracted();
  res.json(scanIssues(reports));
};

router.get('/', h(async (_req, res) => run(res)));
router.post('/scan', h(async (_req, res) => run(res)));

export default router;
