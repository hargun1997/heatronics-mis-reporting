// ----------------------------------------------------------------------------
// GET /api/cash/runway — 13-week cash runway, three cases (schema 1), from stored Tally numbers. MCP: mis_get_cash_runway.
// PUT /api/cash/settings {odLimit} — the overdraft limit (₹, ≥ 0 or null). Its own tiny store key (cash/settings); login only.
// Never calls Tally or a bank. Behind htxGate.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readJson, writeJson } from '../ingest/objectStore.js';
import { summaryInput, istToday } from '../connectors/tally/ceoSummaryLoad.js';
import { ceoSummaryV2 } from '../connectors/tally/ceoSummaryV2.js';
import { buildRunway } from '../services/cashRunway.js';

const router = Router();
const KEY = 'cash/settings';
interface Settings { odLimit: number | null; by?: string; at?: string }

const fail = (res: Response, err: unknown) => {
  console.error('cash route error:', err);
  if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
};

router.get('/runway', (req: Request, res: Response) => {
  (async () => {
    const [x, s] = await Promise.all([summaryInput(req.query.fresh === '1'), readJson<Settings>(KEY, { odLimit: null })]);
    const v2 = ceoSummaryV2(x);
    const out = buildRunway({
      today: istToday(), netCash: v2.balance?.netCash ?? null, balancePeriod: v2.balance?.period ?? null,
      flows: (v2.cashflow ?? []).map((f) => ({ period: f.period, netChange: f.netChange })),
      gstPayable: v2.balance?.gstNet ?? null, odLimit: s.odLimit ?? null,
    });
    res.set('Cache-Control', 'no-store').json(out);
  })().catch((e) => fail(res, e));
});

router.put('/settings', (req: Request, res: Response) => {
  (async () => {
    const v = (req.body as { odLimit?: unknown } | undefined)?.odLimit;
    const od = v === null || v === '' ? null : Number(v);
    if (od !== null && (!Number.isFinite(od) || od < 0 || od > 1e10)) { res.status(400).json({ error: 'odLimit must be a number ≥ 0, or null.' }); return; }
    const s: Settings = { odLimit: od === null ? null : Math.round(od), by: (req as { htxUser?: string }).htxUser, at: new Date().toISOString() };
    await writeJson(KEY, s);
    res.json(s);
  })().catch((e) => fail(res, e));
});

export default router;
