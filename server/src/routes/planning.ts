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
import { historyJobState, readHistory, startHistoryRefresh } from '../planning/historyJob.js';
import { cleanActuals, cleanPlanRows, composeVsActual, type ActualsSnapshot } from '../planning/vsActual.js';
import { BASE_PLAN_MONTHS } from '../planning/basePlanMonths.js';
import type { PlanMonthRow } from '../planning/planVsActual.js';

const router = Router();
const INDEX = 'planning-index';
const MAX_SCENARIOS = 30;
const MAX_BYTES = 2_000_000;

interface IndexRow { id: string; name: string; note: string; updatedAt: string; updatedBy: string | null }
interface Index { scenarios: IndexRow[] }
interface Stored { plan: unknown; note: string; updatedAt: string; updatedBy: string | null; /** the plan's months (Plan vs actual), written by the Planning page on save */ summary?: PlanMonthRow[] }

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
  const summary = cleanPlanRows(req.body?.summary) ?? undefined;
  await writeJson(`planning-scenario-${id}`, { plan: req.body.plan, note, updatedAt, updatedBy, summary } satisfies Stored);
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

// ---- Plan vs actual (the plan is the budget; the Live MIS months are what happened) ----------------
// The deck is built in the browser, so the browser stores the monthly figures it shows (POST /actuals) and the
// server reads them back here (GET /vs-actual, MCP tool mis_get_plan_vs_actual). Our own store only; nothing leaves.
const ACTUALS_KEY = 'planning-actuals';

router.get('/actuals', h(async (_req, res) => {
  res.json(await readJson<ActualsSnapshot | null>(ACTUALS_KEY, null));
}));

router.post('/actuals', h(async (req, res) => {
  const months = cleanActuals(req.body?.months);
  if (!months || !months.length) { res.status(400).json({ error: 'Send { months: [...] }.' }); return; }
  const email = (req as unknown as { htxUser?: string }).htxUser;
  const snap: ActualsSnapshot = { savedAt: new Date().toISOString(), savedBy: email ?? who(req), months };
  await writeJson(ACTUALS_KEY, snap);
  res.json({ ok: true, savedAt: snap.savedAt, months: months.length });
}));

router.get('/vs-actual', h(async (req, res) => {
  const sc = String(req.query.scenario ?? 'base').trim() || 'base';
  let scenario = { id: 'base', name: 'Base — Projection & Deployment Plan' };
  let plan: PlanMonthRow[] = BASE_PLAN_MONTHS;
  if (sc !== 'base') {
    const idx = await readJson<Index>(INDEX, { scenarios: [] });
    const row = idx.scenarios.find((s) => s.id === sc || s.name.toLowerCase() === sc.toLowerCase());
    if (!row) { res.status(404).json({ error: 'No saved scenario with that id or name. Use "base" or a name from /api/planning/scenarios.' }); return; }
    const s = await readJson<Stored | null>(`planning-scenario-${row.id}`, null);
    const rows = s?.summary ? cleanPlanRows(s.summary) : null;
    if (!rows) { res.status(409).json({ error: `“${row.name}” was saved before Plan vs actual existed. Open it on the Planning page and press Save once.` }); return; }
    scenario = { id: row.id, name: row.name }; plan = rows;
  }
  const snap = await readJson<ActualsSnapshot | null>(ACTUALS_KEY, null);
  res.set('Cache-Control', 'no-store').json(composeVsActual(scenario, plan, snap, new Date()));
}));

// ---- D2C history (Shopify orders → cohorts) --------------------------------------
// The job lives in planning/historyJob.ts (also run once a day by the auto-pull run). The route waits ≤ 25 s, then the page polls.
const WAIT_MS = 25_000;

router.get('/history', h(async (_req, res) => {
  res.json({ history: await readHistory(), job: historyJobState() });
}));

router.post('/history/refresh', h(async (_req, res) => {
  const job = await startHistoryRefresh();
  if (!job) { res.status(400).json({ error: 'Shopify is not connected. Add it on Setup → Shopify.' }); return; }
  await Promise.race([job.promise, new Promise((r) => setTimeout(r, WAIT_MS))]);
  const stored = job.state.status === 'done' ? await readHistory() : null;
  res.json({ job: job.state, history: stored });
}));

export default router;
