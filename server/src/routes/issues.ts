// ----------------------------------------------------------------------------
// Issues routes — the one inbox of things that need a person (books, feeds, MIS numbers), with a live count.
//
// GET  /api/issues          → the cross-month anomaly scan (kept for older callers).
// POST /api/issues/scan     → same scan, for a scheduler.
// GET  /api/issues/inbox    → server items (Tally health, hanging ledgers, TB tie, Tally reached, manual uploads, scan)
//                             + the shared open / done / snoozed state. The browser adds the Live MIS items.
// GET  /api/issues/count    → { open } server items still open (sidebar badge; cached 60 s).
// POST /api/issues/state    → { op: done|snooze|reopen, id, sig, days?, note? } (who = the portal email).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readAllExtracted, readJson, writeJson } from '../ingest/objectStore.js';
import { scanIssues } from '../services/anomalyScan.js';
import { applyIssueOp, openItems, serverItems, type InboxItem, type IssueState } from '../services/issuesInbox.js';
import { chartReport, health } from './tally.js';
import { readTallyState, readTallyTb } from '../connectors/tally/snapshots.js';
import { getEffectiveCredentials } from '../connectors/credentialStore.js';

const router = Router();
const STATE = 'issues/state';

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

const istDay = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

async function loadItems(): Promise<InboxItem[]> {
  const [reports, hr, chart, ts, creds] = await Promise.all([
    safe(readAllExtracted(), []), safe(health(3), null), safe(chartReport(), null), safe(readTallyState(), null),
    safe(getEffectiveCredentials('tally', ['host', 'port', 'company']), null),
  ]);
  const tbPeriod = Object.keys(ts?.tbMonths ?? {}).sort().pop() ?? null;
  const tb = tbPeriod ? await safe(readTallyTb(tbPeriod), null) : null;
  const committed = new Set(reports.map((r) => `${r.connectorId}|${r.slotId}|${r.periodKey}`));
  const everUsed = new Set(reports.map((r) => r.connectorId));
  const scan = scanIssues(reports);
  return serverItems({
    today: istDay(), health: hr, chart, committed, everUsed,
    tb: tb && tbPeriod ? { period: tbPeriod, difference: tb.difference } : null,
    tally: ts ? { connected: !!(creds as { host?: string } | null)?.host, lastOkAt: ts.lastOkAt, lastError: ts.lastError } : null,
    anomalies: scan.issues,
  });
}

let cache: { at: number; items: InboxItem[] } | null = null;
async function items(force = false) {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.items;
  cache = { at: Date.now(), items: await loadItems() };
  return cache.items;
}

router.get('/inbox', h(async (req, res) => {
  const [all, state] = await Promise.all([items(req.query.fresh === '1'), readJson<IssueState>(STATE, {})]);
  res.json({ items: all, state, at: new Date().toISOString() });
}));

router.get('/count', h(async (_req, res) => {
  const [all, state] = await Promise.all([items(), readJson<IssueState>(STATE, {})]);
  const open = openItems(all, state, new Date().toISOString());
  res.json({ open: open.length, high: open.filter((i) => i.severity === 'high').length, state });
}));

router.post('/state', h(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const op = b.op === 'done' || b.op === 'snooze' || b.op === 'reopen' ? b.op : null;
  const id = typeof b.id === 'string' ? b.id.slice(0, 200) : '';
  const sig = typeof b.sig === 'string' ? b.sig.slice(0, 64) : '';
  if (!op || !id) return res.status(400).json({ error: 'op (done|snooze|reopen) and id are required.' });
  const email = (req as unknown as { htxUser?: string }).htxUser;
  const by = email || (typeof b.by === 'string' ? `${b.by.slice(0, 60)} (unverified)` : 'unknown');
  const state = await readJson<IssueState>(STATE, {});
  const next = applyIssueOp(state, { op, id, sig, days: Number(b.days) || undefined, note: typeof b.note === 'string' ? b.note : undefined }, by, new Date().toISOString());
  await writeJson(STATE, next);
  res.json({ ok: true, state: next });
}));

export default router;
