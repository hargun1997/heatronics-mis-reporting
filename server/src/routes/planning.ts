// ----------------------------------------------------------------------------
// 5-year planner — saved scenarios (client/src/pages/planning/PlanningPage.tsx).
// The Base scenario lives in the client bundle (imported from the Projection &
// Deployment Plan sheet); what is saved here are the scenarios built from it.
//
//   config/planning-index.json         { scenarios: [{ id, name, note, updatedAt, updatedBy }] }
//   config/planning-scenario-<id>.json { plan, note, updatedAt, updatedBy }
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from '../ingest/objectStore.js';
import { getConnector } from '../connectors/registry.js';
import { getEffectiveCredentials } from '../connectors/credentialStore.js';
import { pullShopifyHistory, type D2CHistory } from '../planning/shopifyHistory.js';

const router = Router();
const INDEX = 'planning-index';
const MAX_SCENARIOS = 30;
const MAX_BYTES = 2_000_000;

interface IndexRow { id: string; name: string; note: string; updatedAt: string; updatedBy: string | null }
interface Index { scenarios: IndexRow[] }
interface Stored { plan: unknown; note: string; updatedAt: string; updatedBy: string | null }

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('planning route error:', err);
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
  });
};

const who = (req: Request): string | null => {
  const v = String(req.body?.by ?? '').trim();
  return v ? v.slice(0, 80) : null;
};

const validId = (id: string) => /^[a-f0-9-]{8,40}$/.test(id);

/** Light shape check — the engine itself tolerates missing optional fields. */
function checkPlan(p: unknown): string | null {
  if (!p || typeof p !== 'object') return 'Send { name, plan }.';
  const o = p as Record<string, unknown>;
  if (o.version !== 1) return 'Unknown plan version.';
  for (const k of ['skus', 'units', 'lines', 'groups', 'events', 'products']) if (!Array.isArray(o[k])) return `plan.${k} is missing.`;
  if (!o.cash || typeof o.cash !== 'object' || !o.levers || typeof o.levers !== 'object') return 'plan.cash / plan.levers missing.';
  if (JSON.stringify(p).length > MAX_BYTES) return 'Plan is too large to save.';
  return null;
}

router.get('/scenarios', h(async (_req, res) => {
  res.json(await readJson<Index>(INDEX, { scenarios: [] }));
}));

router.get('/scenarios/:id', h(async (req, res) => {
  const id = String(req.params.id);
  if (!validId(id)) { res.status(400).json({ error: 'Bad id.' }); return; }
  const s = await readJson<Stored | null>(`planning-scenario-${id}`, null);
  if (!s) { res.status(404).json({ error: 'Scenario not found.' }); return; }
  res.json(s);
}));

// Create (no id) or overwrite (id) a scenario.
router.put('/scenarios', h(async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  const note = String(req.body?.note ?? '').trim().slice(0, 500);
  const err = !name ? 'Give the scenario a name.' : checkPlan(req.body?.plan);
  if (err) { res.status(400).json({ error: err }); return; }
  const idx = await readJson<Index>(INDEX, { scenarios: [] });
  let id = String(req.body?.id ?? '');
  if (id && !validId(id)) { res.status(400).json({ error: 'Bad id.' }); return; }
  if (!id) {
    if (idx.scenarios.length >= MAX_SCENARIOS) { res.status(400).json({ error: `Up to ${MAX_SCENARIOS} saved scenarios — delete one first.` }); return; }
    id = randomUUID();
  }
  const updatedAt = new Date().toISOString();
  const updatedBy = who(req);
  await writeJson(`planning-scenario-${id}`, { plan: req.body.plan, note, updatedAt, updatedBy } satisfies Stored);
  const row: IndexRow = { id, name, note, updatedAt, updatedBy };
  idx.scenarios = [row, ...idx.scenarios.filter((s) => s.id !== id)];
  await writeJson(INDEX, idx);
  res.json(row);
}));

router.delete('/scenarios/:id', h(async (req, res) => {
  const id = String(req.params.id);
  if (!validId(id)) { res.status(400).json({ error: 'Bad id.' }); return; }
  const idx = await readJson<Index>(INDEX, { scenarios: [] });
  idx.scenarios = idx.scenarios.filter((s) => s.id !== id);
  await writeJson(INDEX, idx);
  await writeJson(`planning-scenario-${id}`, null);
  res.json({ ok: true });
}));

// ---- D2C history (Shopify orders → cohorts) --------------------------------------
// One refresh at a time per instance. The route waits ≤ 25 s, then the page polls.
const HISTORY_KEY = 'planning-d2c-history';
const WAIT_MS = 25_000;
const BUDGET_MS = 8 * 60_000;
type HistJob = { status: 'running'; startedAt: string } | { status: 'done'; startedAt: string; finishedAt: string } | { status: 'failed'; startedAt: string; error: string };
let histJob: { state: HistJob; promise: Promise<void> } | null = null;

router.get('/history', h(async (_req, res) => {
  const stored = await readJson<D2CHistory | null>(HISTORY_KEY, null);
  res.json({ history: stored, job: histJob?.state ?? null });
}));

router.post('/history/refresh', h(async (_req, res) => {
  const c = getConnector('shopify');
  if (!c) { res.status(500).json({ error: 'Shopify connector missing.' }); return; }
  const creds = await getEffectiveCredentials('shopify', c.credentialFields.map((f) => f.key));
  if (!creds.shopDomain || !(creds.accessToken || (creds.clientId && creds.clientSecret))) {
    res.status(400).json({ error: 'Shopify is not connected — add it under Setup → Data sources.' });
    return;
  }
  const stale = histJob?.state.status === 'running' && Date.now() - Date.parse(histJob.state.startedAt) > BUDGET_MS + 60_000;
  if (!histJob || histJob.state.status !== 'running' || stale) {
    const startedAt = new Date().toISOString();
    const job: { state: HistJob; promise: Promise<void> } = { state: { status: 'running', startedAt }, promise: Promise.resolve() };
    job.promise = pullShopifyHistory(creds, Date.now() + BUDGET_MS)
      .then(async (hist) => { await writeJson(HISTORY_KEY, hist); job.state = { status: 'done', startedAt, finishedAt: new Date().toISOString() }; })
      .catch((err: unknown) => { job.state = { status: 'failed', startedAt, error: err instanceof Error ? err.message : String(err) }; });
    histJob = job;
  }
  await Promise.race([histJob.promise, new Promise((r) => setTimeout(r, WAIT_MS))]);
  const stored = histJob.state.status === 'done' ? await readJson<D2CHistory | null>(HISTORY_KEY, null) : null;
  res.json({ job: histJob.state, history: stored });
}));

export default router;
