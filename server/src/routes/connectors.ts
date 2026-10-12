// ----------------------------------------------------------------------------
// Connector routes — list, configure tokens, test, and pull a month.
//
// Credentials go in but never come back out: the list and status endpoints
// report only whether a connector is configured, never the stored values.
// ----------------------------------------------------------------------------

import { Router } from 'express';
import { CONNECTORS, getConnector } from '../connectors/registry.js';
import {
  getCredentials,
  hasCredentials,
  removeCredentials,
  saveCredentials,
  storeBackendName,
} from '../connectors/credentialStore.js';
import { NotImplementedError, type Credentials } from '../connectors/types.js';

const router = Router();

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
router.get('/', async (_req, res) => {
  const items = await Promise.all(
    CONNECTORS.map(async (c) => ({
      ...describe(c.id),
      connected: await hasCredentials(c.id),
    })),
  );
  res.json({ store: storeBackendName(), connectors: items });
});

router.get('/:id', async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  res.json({ ...describe(c.id), connected: await hasCredentials(c.id) });
});

// Save (merge) credentials. Only known field keys are stored.
router.put('/:id/credentials', async (req, res) => {
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
});

router.delete('/:id/credentials', async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  await removeCredentials(c.id);
  res.json({ connected: false });
});

// Prove the stored credentials reach the source.
router.post('/:id/test', async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  const creds = await getCredentials(c.id);
  if (!creds) return res.status(400).json({ ok: false, detail: 'No credentials saved yet.' });

  try {
    res.json(await c.test(creds));
  } catch (err) {
    res.status(502).json({ ok: false, detail: err instanceof Error ? err.message : 'Test failed.' });
  }
});

// Pull one month. Body: { periodKey: "YYYY-MM" }.
router.post('/:id/sync', async (req, res) => {
  const c = getConnector(req.params.id);
  if (!c) return res.status(404).json({ error: 'No such connector.' });
  const periodKey = String(req.body?.periodKey ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) {
    return res.status(400).json({ error: 'periodKey must be "YYYY-MM".' });
  }
  const creds = await getCredentials(c.id);
  if (!creds) return res.status(400).json({ error: 'No credentials saved for this connector.' });

  try {
    const result = await c.fetchPeriod(creds, periodKey);
    res.json(result);
  } catch (err) {
    const status = err instanceof NotImplementedError ? 501 : 502;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Sync failed.' });
  }
});

export default router;
