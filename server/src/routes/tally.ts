// ----------------------------------------------------------------------------
// Tally (cloud) — snapshots of the P&L whenever Tally is open (connectors/tally/snapshots.ts).
//   POST /api/tally/poll    open path (GitHub Actions every 30 min, .github/workflows/tally-poll.yml);
//                           at most every 20 min; answers a status only, never figures
//   GET  /api/tally/status  last check / last success / stored months (signed in)
//   POST /api/tally/pull    check now, skipping the 20-min gap (signed in)
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { getEffectiveCredentials } from '../connectors/credentialStore.js';
import { pollTally, readTallyState } from '../connectors/tally/snapshots.js';

const router = Router();
const creds = () => getEffectiveCredentials('tally', ['host', 'port', 'company']);
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Error.' });
  });
};

router.post('/poll', h(async (_req, res) => {
  const r = await pollTally(await creds());
  res.json({ status: r.status, months: r.months ?? [] });
}));

router.get('/status', h(async (_req, res) => {
  const s = await readTallyState();
  res.json({ ...s, connected: Boolean(((await creds()).host || '').trim()) });
}));

router.post('/pull', h(async (_req, res) => {
  res.json(await pollTally(await creds(), { force: true }));
}));

export default router;
