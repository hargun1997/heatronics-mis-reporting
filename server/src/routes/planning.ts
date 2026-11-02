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

export default router;
