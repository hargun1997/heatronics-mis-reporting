// POST /api/mis/bridge  — the Live MIS page saves its computed "Why it moved" bridge (numbers only).
// GET  /api/mis/bridge?month=YYYY-MM — reads the saved copy (newest when no month). Behind htxGate; read-only for the
// outside world: stores only in the MIS's own objectStore. Nothing here calls Tally, a marketplace or email.
import { Router } from 'express';
import { readJson, writeJson } from '../ingest/objectStore.js';
import { cleanBridgeBody, planWrites, readAnswer, isMonth, type StoredBridge } from '../services/bridgeSnapshot.js';

const router = Router();
const LATEST = 'mis/bridge-latest';
const monthKey = (m: string) => `mis/bridge-${m}`;

router.get('/', async (req, res) => {
  try {
    const m = req.query.month;
    if (m !== undefined && !isMonth(m)) return res.status(400).json({ error: 'month must look like 2026-10.' });
    const stored = await readJson<StoredBridge | null>(m ? monthKey(m) : LATEST, null);
    res.set('Cache-Control', 'no-store').json(readAnswer(stored));
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : 'Error.' }); }
});

router.post('/', async (req, res) => {
  let doc: ReturnType<typeof cleanBridgeBody>;
  try { doc = cleanBridgeBody(req.body); } catch (e) { return res.status(400).json({ error: e instanceof Error ? e.message : 'Bad body.' }); }
  try {
    const [monthCopy, latest] = await Promise.all([readJson<StoredBridge | null>(monthKey(doc.month), null), readJson<StoredBridge | null>(LATEST, null)]);
    const plan = planWrites(doc, monthCopy, latest);
    const asOf = new Date().toISOString();
    const stored: StoredBridge = { ...doc, asOf, hash: plan.hash };
    if (plan.month) await writeJson(monthKey(doc.month), stored);
    if (plan.latest) await writeJson(LATEST, stored);
    res.set('Cache-Control', 'no-store').json({ ok: true, wrote: plan.month || plan.latest });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : 'Error.' }); }
});

export default router;
