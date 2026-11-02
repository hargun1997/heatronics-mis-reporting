// ----------------------------------------------------------------------------
// Round planner — saved defaults (client/public/embed/round-planner.html).
// One shared set: whatever was last saved loads for everyone who opens the planner.
//
//   config/round-planner-defaults.json  { defaults: { v, mode, inputs, inv }, updatedAt }
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readJson, writeJson } from '../ingest/objectStore.js';

const router = Router();
const KEY = 'round-planner-defaults';

interface Defaults { v: 1; mode: 'join' | 'post'; inputs: Record<string, number>; inv: { n: string; a?: number }[] }
interface Stored { defaults: Defaults | null; updatedAt: string | null }

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('round-planner route error:', err);
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
  });
};

// Keep only what the planner uses: numeric inputs with short ids, up to 6 investors.
function clean(raw: unknown): Defaults | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const inputs: Record<string, number> = {};
  if (r.inputs && typeof r.inputs === 'object') {
    for (const [k, v] of Object.entries(r.inputs as Record<string, unknown>).slice(0, 40)) {
      const n = Number(v);
      if (/^[A-Za-z0-9]{1,20}$/.test(k) && Number.isFinite(n)) inputs[k] = n;
    }
  }
  if (!Object.keys(inputs).length) return null;
  const inv = (Array.isArray(r.inv) ? r.inv : []).slice(0, 6).map((x, i) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const n = String(o.n ?? '').trim().slice(0, 60) || `Investor ${i + 1}`;
    return i === 0 ? { n } : { n, a: Math.max(0, Number(o.a) || 0) };
  });
  return { v: 1, mode: r.mode === 'post' ? 'post' : 'join', inputs, inv };
}

router.get('/defaults', h(async (_req, res) => {
  res.json(await readJson<Stored>(KEY, { defaults: null, updatedAt: null }));
}));

router.put('/defaults', h(async (req, res) => {
  const defaults = clean(req.body?.defaults);
  if (!defaults) {
    res.status(400).json({ error: 'Send { defaults: { mode, inputs, inv } }.' });
    return;
  }
  const stored: Stored = { defaults, updatedAt: new Date().toISOString() };
  await writeJson(KEY, stored);
  res.json(stored);
}));

export default router;
