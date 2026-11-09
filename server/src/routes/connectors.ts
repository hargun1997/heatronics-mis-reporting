// ----------------------------------------------------------------------------
// Connector routes — list, configure tokens, test, and pull a month.
//
// Credentials go in but never come back out: the list and status endpoints
// report only whether a connector is configured, never the stored values.
// ----------------------------------------------------------------------------

import { cachedFacts } from '../connectors/factsCache.js';
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
  usesSharedSecrets,
} from '../connectors/credentialStore.js';
import { NotImplementedError, type ConnectorDef, type Credentials } from '../connectors/types.js';
import { FEED_TASKS, SLOT_SOURCES, slotSource } from '../connectors/slots/catalog.js';
import { lastPulls, pullState, runPull } from '../connectors/slots/jobs.js';
import type { SlotSourceDef } from '../connectors/slots/types.js';
import { endpoint as tallyEndpoint } from '../connectors/sources/tally.js';
import { feedOrigin } from '../connectors/sources/delhivery.js';

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

/** Connected when every required field is satisfied by shared, stored or env creds. */
async function connectionStatus(c: ConnectorDef): Promise<{ connected: boolean; viaEnv: boolean; viaShared: boolean }> {
  const creds = await getEffectiveCredentials(c.id, fieldKeys(c));
  const required = c.credentialFields.filter((f) => !f.optional);
  const connected = required.every((f) => (creds[f.key] || '').trim());
  const env = envCredentials(c.id, fieldKeys(c));
  return { connected, viaEnv: Object.keys(env).length > 0, viaShared: await usesSharedSecrets(c.id) };
}

/** Public shape of a connector — safe to send to the browser (no secrets). */
function describe(id: string) {
  const c = getConnector(id)!;
  return {
    id: c.id,
    label: c.label,
    group: c.group,
    fetchMode: c.fetchMode,
    mode: c.mode,
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

// ---- Close slots: how each report slot is fed, and "Pull now" -------------

/** Effective credentials for a slot's pull + which required fields are missing. */
async function slotCreds(def: SlotSourceDef): Promise<{ creds: Credentials; missing: string[] }> {
  const cid = def.credsFrom ?? def.connectorId;
  const c = getConnector(cid);
  const creds = await getEffectiveCredentials(cid, c ? fieldKeys(c) : def.needs ?? []);
  const missing = (def.needs ?? []).filter((k) => !(creds[k] || '').trim());
  return { creds, missing };
}

// Every slot's source (api / sheet / claude_task / upload) + the feeding tasks.
router.get('/slots', h(async (_req, res) => {
  const last = lastPulls();
  const slots = await Promise.all(SLOT_SOURCES.map(async (d) => {
    const pullable = Boolean(d.pull);
    const connected = pullable ? (await slotCreds(d)).missing.length === 0 : false;
    return {
      connectorId: d.connectorId, slotId: d.slotId, source: d.source, via: d.via, line: d.line,
      claudeTask: d.claudeTask ?? null, parserId: d.parserId ?? null, pullable, connected,
      connectHint: d.connectHint ?? null, lastPull: last[`${d.connectorId}|${d.slotId}`] ?? null,
    };
  }));
  res.json({ slots, tasks: FEED_TASKS });
}));

// Pull one slot for one month. Body: { periodKey: "YYYY-MM", force?: boolean, waitMs?: number }.
// Answers { status: done | running | failed | not_connected, … }; poll while running.
router.post('/slots/:connectorId/:slotId/pull', h(async (req, res) => {
  const def = slotSource(req.params.connectorId, req.params.slotId);
  if (!def) return res.status(404).json({ error: 'No such slot.' });
  if (!def.pull) return res.status(400).json({ error: `${def.via}: ${def.line}` });
  const periodKey = String(req.body?.periodKey ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(periodKey)) return res.status(400).json({ error: 'periodKey must be "YYYY-MM".' });
  const { creds, missing } = await slotCreds(def);
  if (missing.length) {
    return res.json({ status: 'not_connected', detail: def.connectHint ?? `Not connected — missing ${missing.join(', ')}.` });
  }
  const waitMs = Math.max(0, Math.min(Number(req.body?.waitMs ?? 25_000) || 0, 25_000));
  const state = await runPull(def, creds, periodKey, { force: Boolean(req.body?.force), waitMs });
  res.json({ ...state, via: def.via, parserId: def.parserId ?? null });
}));

// Poll a running pull without starting a new one.
router.get('/slots/:connectorId/:slotId/pull/:periodKey', h(async (req, res) => {
  const def = slotSource(req.params.connectorId, req.params.slotId);
  if (!def) return res.status(404).json({ error: 'No such slot.' });
  const state = pullState(def, req.params.periodKey);
  res.json(state ? { ...state, via: def.via, parserId: def.parserId ?? null } : { status: 'none' });
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

  // SSRF: refuse a Tally host / feed URL the server must never call (same checks the requests run).
  try {
    if (c.id === 'tally') tallyEndpoint(merged);
    if (c.id === 'delhivery' && (merged.feedUrl || '').trim()) feedOrigin(merged);
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : 'Bad address.' });
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
/** Per-source wait on /facts (env FACTS_SOURCE_WAIT_MS, default 25 s): Amazon Ads (12 s) and Flipkart (20 s) cap themselves inside it. */
export const FACTS_SOURCE_WAIT_MS = Number(process.env.FACTS_SOURCE_WAIT_MS) || 25_000;
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(message)), ms); })]).finally(() => clearTimeout(t));
}

router.post('/facts', h(async (req, res) => {
  const from = String(req.body?.from ?? '').trim();
  const to = String(req.body?.to ?? '').trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD with from <= to.' });
  }

  const force = req.body?.force === true;
  // Every source pulls in parallel: the slow ones (Amazon Ads reports, Flipkart
  // paging) cap their own wait, so the whole call stays well inside Cloud Run's
  // request timeout instead of adding up source by source.
  const results = await Promise.all(
    CONNECTORS.filter((c) => c.fetchFacts).map(async (c) => {
      const creds = await getEffectiveCredentials(c.id, fieldKeys(c));
      if (Object.keys(creds).length === 0) {
        return { source: { id: c.id, label: c.label, ok: false, count: 0, error: 'not connected' }, facts: [], warnings: [] };
      }
      try {
        // Through the per-month cache (connectors/factsCache.ts): stale months come back at once and refresh behind.
        // One hung source must not hold the whole page (backlog bug 2): cap the wait; the pull keeps going and fills the cache.
        const pull = cachedFacts(c.id, from, to, (f, t) => c.fetchFacts!(creds, f, t), { force });
        pull.catch(() => undefined);
        const result = await withTimeout(pull, FACTS_SOURCE_WAIT_MS, `${c.label} took over ${Math.round(FACTS_SOURCE_WAIT_MS / 1000)} s — still loading in the background; refresh in a minute.`);
        // Coverage: the span of dates this source actually returned, so the UI
        // can show how current each connector is ("data through …").
        const dates = result.facts.map((f) => f.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
        return {
          source: {
            id: c.id,
            label: c.label,
            ok: true,
            count: result.facts.length,
            from: dates[0] ?? null,
            through: dates[dates.length - 1] ?? null,
            trace: result.trace ?? [],
            cachedAt: result.cachedAt,
            refreshing: result.refreshing,
            partial: result.partial ?? false,
          },
          facts: result.facts,
          warnings: result.warnings,
        };
      } catch (err) {
        return {
          source: { id: c.id, label: c.label, ok: false, count: 0, error: err instanceof Error ? err.message : 'fetch failed', ...(err instanceof Error && /still loading in the background/.test(err.message) ? { partial: true } : {}) },
          facts: [],
          warnings: [],
        };
      }
    }),
  );
  const facts = results.flatMap((r) => r.facts);
  const sources = results.map((r) => r.source);
  const warnings = results.flatMap((r) => r.warnings);

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
