// ----------------------------------------------------------------------------
// Connector routes — list, configure tokens, test, and pull a month.
//
// Credentials go in but never come back out: the list and status endpoints
// report only whether a connector is configured, never the stored values.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { CONNECTORS, getConnector } from '../connectors/registry.js';
import {
  envCredentials,
  getCredentials,
  getEffectiveCredentials,
  refreshStore,
  removeCredentials,
  saveCredentials,
  storeStatus,
} from '../connectors/credentialStore.js';
import { NotImplementedError, type ConnectorDef, type Credentials } from '../connectors/types.js';

const router = Router();

const fieldKeys = (c: ConnectorDef) => c.credentialFields.map((f) => f.key);

/**
 * Wrap an async handler so a rejected promise becomes a clean 500 instead of
 * an unhandled rejection — which on Node 20 crashes the whole process and takes
 * the service down with it. Every route below goes through this.
 */
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('connector route error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
    }
  });
};

/** Connected when every required field is satisfied by stored or env creds. */
async function connectionStatus(c: ConnectorDef): Promise<{ connected: boolean; viaEnv: boolean }> {
  const creds = await getEffectiveCredentials(c.id, fieldKeys(c));
  const required = c.credentialFields.filter((f) => !f.optional);
  const connected = required.every((f) => (creds[f.key] || '').trim());
  const env = envCredentials(c.id, fieldKeys(c));
  return { connected, viaEnv: Object.keys(env).length > 0 };
}

/** Public shape of a connector — safe to send to the browser (no secrets). */
function describe(id: string) {
  const c = getConnector(id)!;
  return {
    id: c.id,
    label: c.label,
    group: c.group,
    fetchMode: c.fetchMode,
    bookOfRecord: Boolean(c.bookOfRecord),
    implemented: c.implemented,
    note: c.note ?? null,
    credentialFields: c.credentialFields,
  };
}

// List every connector with its configured/connected status.
router.get('/', h(async (_req, res) => {
  const items = await Promise.all(
    CONNECTORS.map(async (c) => ({
      ...describe(c.id),
      ...(await connectionStatus(c)),
    })),
  );
  res.json({ store: await storeStatus(), connectors: items });
}));

// Re-probe the store (e.g. after granting the service account Secret Manager
// access) so it upgrades to durable storage without a redeploy.
router.post('/refresh-store', h(async (_req, res) => {
  refreshStore();
  res.json({ store: await storeStatus() });
}));

router.get('/:id', h(async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  res.json({ ...describe(c.id), ...(await connectionStatus(c)) });
}));

// Save (merge) credentials. Only known field keys are stored.
router.put('/:id/credentials', h(async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });

  const incoming = (req.body?.credentials ?? {}) as Record<string, unknown>;
  const known = new Set(c.credentialFields.map((f) => f.key));
  const existing = (await getCredentials(c.id)) ?? {};
  const merged: Credentials = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (known.has(k) && typeof v === 'string') merged[k] = v;
  }

  // Required (non-optional) fields must end up non-empty.
  const missing = c.credentialFields
    .filter((f) => !f.optional && !(merged[f.key] || '').trim())
    .map((f) => f.key);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
  }

  await saveCredentials(c.id, merged);
  res.json({ connected: true });
}));

router.delete('/:id/credentials', h(async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  await removeCredentials(c.id);
  res.json({ connected: false });
}));

// Prove the stored credentials reach the source.
router.post('/:id/test', h(async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  const creds = await getEffectiveCredentials(c.id, fieldKeys(c));
  if (Object.keys(creds).length === 0) {
    return res.status(400).json({ ok: false, detail: 'No credentials saved or set yet.' });
  }

  try {
    res.json(await c.test(creds));
  } catch (err) {
    res.status(502).json({ ok: false, detail: err instanceof Error ? err.message : 'Test failed.' });
  }
}));

// Live run-rate: pull a dated fact stream from every connected source that can
// date its data. Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }.
router.post('/facts', h(async (req, res) => {
  const from = String(req.body?.from ?? '').trim();
  const to = String(req.body?.to ?? '').trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD with from <= to.' });
  }

  const facts = [];
  const sources = [];
  const warnings: string[] = [];

  for (const c of CONNECTORS) {
    if (!c.fetchFacts) continue; // source cannot date its data — not a run-rate feed
    const creds = await getEffectiveCredentials(c.id, fieldKeys(c));
    if (Object.keys(creds).length === 0) {
      sources.push({ id: c.id, label: c.label, ok: false, count: 0, error: 'not connected' });
      continue;
    }
    try {
      const result = await c.fetchFacts(creds, from, to);
      facts.push(...result.facts);
      warnings.push(...result.warnings);
      // Coverage: the span of dates this source actually returned, so the UI
      // can show how current each connector is ("data through …").
      const dates = result.facts.map((f) => f.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      sources.push({
        id: c.id,
        label: c.label,
        ok: true,
        count: result.facts.length,
        from: dates[0] ?? null,
        through: dates[dates.length - 1] ?? null,
        trace: result.trace ?? [],
      });
    } catch (err) {
      sources.push({
        id: c.id,
        label: c.label,
        ok: false,
        count: 0,
        error: err instanceof Error ? err.message : 'fetch failed',
      });
    }
  }

  res.json({ from, to, sources, facts, warnings });
}));

// Pull one month. Body: { periodKey: "YYYY-MM" }.
router.post('/:id/sync', h(async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  const periodKey = String(req.body?.periodKey ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    return res.status(400).json({ error: 'periodKey must be "YYYY-MM".' });
  }
  const creds = await getEffectiveCredentials(c.id, fieldKeys(c));
  if (Object.keys(creds).length === 0) {
    return res.status(400).json({ error: 'No credentials saved or set for this connector.' });
  }

  try {
    const result = await c.fetchPeriod(creds, periodKey);
    res.json(result);
  } catch (err) {
    const status = err instanceof NotImplementedError ? 501 : 502;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Sync failed.' });
  }
}));

export default router;
