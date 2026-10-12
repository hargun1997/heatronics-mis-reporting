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
  refreshIngestStore,
  saveReport,
  type CommitInput,
} from '../ingest/objectStore.js';

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

router.post('/commit', h(async (req, res) => {
  const b = (req.body ?? {}) as Partial<CommitInput>;
  const required = ['connectorId', 'slotId', 'slotLabel', 'periodKey', 'fileName', 'rawBase64'] as const;
  const missing = required.filter((k) => !(typeof b[k] === 'string' && (b[k] as string).trim()));
  if (missing.length) {
    return res.status(400).json({ error: `Missing: ${missing.join(', ')}.` });
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
    rawBase64: b.rawBase64 as string,
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
