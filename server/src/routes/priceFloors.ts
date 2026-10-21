// ----------------------------------------------------------------------------
// Amazon price floors — stores the SKU economics (from uploaded Seller Central
// fee reports) and pulls the latest product costs from the production portal
// (production.heatronics.in → GET /api/costs). The floors themselves are worked
// out in the browser (client/src/utils/priceFloors.ts).
//
//   config/price-floors-settings.json  SKU economics + product mapping + fee rates
//   config/price-floors-reports.json   uploaded fee reports (newest first, last 24)
//   config/price-floors-costs.json     last product-cost snapshot from production
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { readJson, writeJson } from '../ingest/objectStore.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('price-floors route error:', err);
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
  });
};

const PRODUCTION_URL = (process.env.PRODUCTION_URL || 'https://production.heatronics.in').replace(/\/+$/, '');
const STALE_MS = 6 * 60 * 60 * 1000; // refresh product costs at most every 6 hours on page load
const MAX_REPORTS = 24;

interface ReportMeta { id: string; fileName: string; uploadedAt: string; uploadedBy: string | null }
interface Report extends ReportMeta { rows: unknown[]; totals: unknown; observed: unknown }
interface CostsSnapshot { fetchedAt: string; source: string; error?: string | null; products?: unknown[]; month?: string }

const clean = (v: unknown, n = 60) => String(v ?? '').trim().slice(0, n);

async function fetchCosts(): Promise<CostsSnapshot> {
  const prev = await readJson<CostsSnapshot | null>('price-floors-costs', null);
  const url = `${PRODUCTION_URL}/api/costs`;
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.PRODUCTION_API_TOKEN) headers.Authorization = `Bearer ${process.env.PRODUCTION_API_TOKEN}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(body.error || `Production portal answered ${res.status}`));
    const snap: CostsSnapshot = { ...body, fetchedAt: new Date().toISOString(), source: url, error: null };
    await writeJson('price-floors-costs', snap);
    return snap;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // keep the last good costs, just mark the failed refresh
    const snap: CostsSnapshot = prev ? { ...prev, error: msg } : { fetchedAt: new Date().toISOString(), source: url, error: msg, products: [] };
    if (prev) await writeJson('price-floors-costs', snap);
    return snap;
  }
}

router.get('/', h(async (_req, res) => {
  const [settings, reports] = await Promise.all([
    readJson<unknown | null>('price-floors-settings', null),
    readJson<Report[]>('price-floors-reports', []),
  ]);
  let costs = await readJson<CostsSnapshot | null>('price-floors-costs', null);
  if (!costs || costs.error || Date.now() - Date.parse(costs.fetchedAt) > STALE_MS) costs = await fetchCosts();
  res.json({
    settings,
    costs,
    reports: reports.map(({ rows, ...meta }) => ({ ...meta, skus: Array.isArray(rows) ? rows.length : 0 })),
    latestReport: reports[0] || null,
  });
}));

router.post('/costs/refresh', h(async (_req, res) => {
  res.json({ costs: await fetchCosts() });
}));

router.post('/settings', h(async (req, res) => {
  const settings = req.body?.settings;
  if (!settings || !Array.isArray(settings.skus) || typeof settings.global !== 'object') {
    res.status(400).json({ error: 'Send { settings: { global, skus } }.' });
    return;
  }
  const saved = { ...settings, skus: settings.skus.slice(0, 200), updatedAt: new Date().toISOString(), updatedBy: clean(req.body?.by) || null };
  await writeJson('price-floors-settings', saved);
  res.json({ settings: saved });
}));

// A parsed fee report (parsed in the browser) plus the settings it was merged into.
router.post('/report', h(async (req, res) => {
  const report = req.body?.report as Report | undefined;
  const settings = req.body?.settings;
  if (!report || !Array.isArray(report.rows) || !report.rows.length || !settings) {
    res.status(400).json({ error: 'Send { report, settings }.' });
    return;
  }
  const reports = await readJson<Report[]>('price-floors-reports', []);
  const stored: Report = {
    id: clean(report.id, 20) || Date.now().toString(),
    fileName: clean(report.fileName, 120),
    uploadedAt: new Date().toISOString(),
    uploadedBy: clean(req.body?.by) || null,
    rows: report.rows.slice(0, 500),
    totals: report.totals,
    observed: report.observed,
  };
  await writeJson('price-floors-reports', [stored, ...reports.filter((r) => r.id !== stored.id)].slice(0, MAX_REPORTS));
  const saved = { ...settings, updatedAt: stored.uploadedAt, updatedBy: stored.uploadedBy };
  await writeJson('price-floors-settings', saved);
  res.json({ settings: saved, report: { ...stored, rows: undefined, skus: stored.rows.length } });
}));

router.get('/report/:id', h(async (req, res) => {
  const reports = await readJson<Report[]>('price-floors-reports', []);
  const r = reports.find((x) => x.id === req.params.id);
  if (!r) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  res.json({ report: r });
}));

router.delete('/report/:id', h(async (req, res) => {
  const reports = await readJson<Report[]>('price-floors-reports', []);
  await writeJson('price-floors-reports', reports.filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
}));

export default router;
