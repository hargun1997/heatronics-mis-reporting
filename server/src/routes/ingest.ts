// ----------------------------------------------------------------------------
// Ingestion routes — commit a validated report to durable storage, list what
// has been ingested, and overwrite/clear a slot.
//
// Parsing and the AI checks run on the client (and, for Tally screenshots, via
// /api/month-close/vision); this surface is the durable store behind them. The
// client sends the raw file (base64) plus the already-extracted facts, and the
// store keys it by connector+slot+period so a re-upload is a clean overwrite.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import {
  deleteReport,
  ingestStoreStatus,
  listReports,
  readAllExtracted,
  refreshIngestStore,
  saveReport,
  type CommitInput,
  type RawFile,
} from '../ingest/objectStore.js';
import { ledgerVision } from '../services/ledgerVision.js';
import { invoiceVision } from '../services/invoiceVision.js';

const router = Router();

// Same Node-20 crash guard the connector routes use: a rejected promise becomes
// a clean 500 instead of taking the process down.
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('ingest route error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
    }
  });
};

const isPeriod = (s: string) => /^\d{4}-\d{2}$/.test(s);

router.get('/status', h(async (_req, res) => {
  res.json({ store: await ingestStoreStatus() });
}));

router.post('/refresh-store', h(async (_req, res) => {
  refreshIngestStore();
  res.json({ store: await ingestStoreStatus() });
}));

router.get('/reports', h(async (_req, res) => {
  res.json({ reports: await listReports() });
}));

// Full extracted payloads (facts + bomCosts + Tally ledgerRows) per report —
// the raw material the live-MIS cascade rebuilds each month from.
router.get('/extracted', h(async (_req, res) => {
  res.json({ reports: await readAllExtracted() });
}));

// Read one statement from one or more screenshots (Tally P&L that scrolled).
router.post('/vision', h(async (req, res) => {
  const raw = (req.body?.images ?? []) as unknown;
  const images = Array.isArray(raw)
    ? raw
        .map((i) => i as { imageBase64?: unknown; mimeType?: unknown })
        .filter((i) => typeof i.imageBase64 === 'string' && (i.imageBase64 as string).length > 0)
        .map((i) => ({ data: i.imageBase64 as string, mimeType: typeof i.mimeType === 'string' ? i.mimeType : 'image/png' }))
    : [];
  if (images.length === 0) return res.status(400).json({ error: 'No images provided.' });
  try {
    res.json(await ledgerVision.extractMany(images));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Vision failed.' });
  }
}));

// Read one platform/checkout invoice PDF (Shopflo and future billers) into its
// money summary + billing period. The client turns that into a daily cost fact.
router.post('/invoice', h(async (req, res) => {
  const pdfBase64 = (req.body?.pdfBase64 ?? '') as unknown;
  if (typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    return res.status(400).json({ error: 'No PDF provided.' });
  }
  try {
    res.json(await invoiceVision.extract(pdfBase64));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Invoice read failed.' });
  }
}));

router.post('/commit', h(async (req, res) => {
  const b = (req.body ?? {}) as Partial<CommitInput>;
  const required = ['connectorId', 'slotId', 'slotLabel', 'periodKey', 'fileName'] as const;
  const missing = required.filter((k) => !(typeof b[k] === 'string' && (b[k] as string).trim()));
  const rawFiles: RawFile[] = Array.isArray(b.rawFiles)
    ? b.rawFiles
        .map((f) => f as Partial<RawFile>)
        .filter((f) => typeof f.base64 === 'string' && (f.base64 as string).length > 0)
        .map((f) => ({ base64: f.base64 as string, mimeType: typeof f.mimeType === 'string' ? f.mimeType : 'application/octet-stream', name: typeof f.name === 'string' ? f.name : 'upload.bin' }))
    : [];
  if (missing.length) {
    return res.status(400).json({ error: `Missing: ${missing.join(', ')}.` });
  }
  if (rawFiles.length === 0) {
    return res.status(400).json({ error: 'No raw file(s) provided.' });
  }
  if (!isPeriod(b.periodKey as string)) {
    return res.status(400).json({ error: 'periodKey must be "YYYY-MM".' });
  }

  const input: CommitInput = {
    connectorId: b.connectorId as string,
    slotId: b.slotId as string,
    slotLabel: b.slotLabel as string,
    periodKey: b.periodKey as string,
    fileName: b.fileName as string,
    mimeType: typeof b.mimeType === 'string' ? b.mimeType : 'application/octet-stream',
    rowCount: typeof b.rowCount === 'number' ? b.rowCount : 0,
    through: typeof b.through === 'string' ? b.through : null,
    warnings: Array.isArray(b.warnings) ? b.warnings.filter((w): w is string => typeof w === 'string') : [],
    checks:
      b.checks && typeof b.checks === 'object'
        ? {
            passed: Number((b.checks as { passed?: number }).passed) || 0,
            warned: Number((b.checks as { warned?: number }).warned) || 0,
            failed: Number((b.checks as { failed?: number }).failed) || 0,
          }
        : { passed: 0, warned: 0, failed: 0 },
    rawFiles,
    extracted: b.extracted && typeof b.extracted === 'object' ? b.extracted : {},
  };

  const meta = await saveReport(input);
  res.json({ report: meta });
}));

router.delete('/reports/:connectorId/:slotId/:periodKey', h(async (req, res) => {
  const { connectorId, slotId, periodKey } = req.params;
  if (!isPeriod(periodKey)) return res.status(400).json({ error: 'periodKey must be "YYYY-MM".' });
  await deleteReport(connectorId, slotId, periodKey);
  res.json({ ok: true });
}));

export default router;
