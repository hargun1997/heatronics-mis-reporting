// ----------------------------------------------------------------------------
// Ingestion client — talk to /api/ingest (durable store) and run the pre-save
// "AI checks" in the browser: xlsx reports go through the existing upload
// parsers, Tally screenshots through the vision model. A run returns a
// StagedUpload (checks + extracted preview + the raw bytes) held until the user
// saves, at which point commit() persists and ingests it (overwriting any prior
// report for the same connector+slot+period).
// ----------------------------------------------------------------------------

import { parseUpload, UPLOAD_PARSERS } from '../liveMis/uploadParsers';
import type {
  CheckItem,
  CheckReport,
  Extracted,
  IngestReportMeta,
  IngestStoreStatus,
  ReportSlot,
  StagedUpload,
} from './types';

async function asJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

export async function getIngestStatus(): Promise<{ store: IngestStoreStatus }> {
  return asJson(await fetch('/api/ingest/status'));
}
export async function refreshIngestStore(): Promise<{ store: IngestStoreStatus }> {
  return asJson(await fetch('/api/ingest/refresh-store', { method: 'POST' }));
}
export async function listIngestReports(): Promise<IngestReportMeta[]> {
  const r = await asJson<{ reports: IngestReportMeta[] }>(await fetch('/api/ingest/reports'));
  return r.reports;
}
export async function deleteIngestReport(connectorId: string, slotId: string, periodKey: string): Promise<void> {
  await asJson(await fetch(`/api/ingest/reports/${connectorId}/${slotId}/${periodKey}`, { method: 'DELETE' }));
}

/** Save + ingest a validated upload (overwrites the same slot/period). */
export async function commitReport(slot: ReportSlot, staged: StagedUpload): Promise<IngestReportMeta> {
  const summary = summarise(staged.checks);
  const r = await asJson<{ report: IngestReportMeta }>(
    await fetch('/api/ingest/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId: slot.connectorId,
        slotId: slot.slotId,
        slotLabel: slot.label,
        periodKey: staged.periodKey,
        fileName: staged.fileName,
        mimeType: staged.mimeType,
        rowCount: staged.extracted.rowCount,
        through: staged.extracted.through,
        warnings: staged.extracted.trace ? [] : [],
        checks: summary,
        rawBase64: staged.rawBase64,
        extracted: {
          facts: staged.extracted.facts,
          ledgerRows: staged.extracted.ledgerRows,
          nettProfit: staged.extracted.nettProfit,
          period: staged.extracted.period,
        },
      }),
    }),
  );
  return r.report;
}

export function summarise(checks: CheckReport): { passed: number; warned: number; failed: number } {
  return {
    passed: checks.items.filter((i) => i.status === 'pass').length,
    warned: checks.items.filter((i) => i.status === 'warn').length,
    failed: checks.items.filter((i) => i.status === 'fail').length,
  };
}

function overallOf(items: CheckItem[]): CheckReport['overall'] {
  if (items.some((i) => i.status === 'fail')) return 'fail';
  if (items.some((i) => i.status === 'warn')) return 'warn';
  return 'pass';
}

// ---- base64 of the raw file (no data: prefix) ------------------------------

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---- period derivation -----------------------------------------------------

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Best-guess YYYY-MM from the facts' latest date, else a Tally period string. */
export function derivePeriod(ex: Extracted): string {
  if (ex.through && /^\d{4}-\d{2}/.test(ex.through)) return ex.through.slice(0, 7);
  if (ex.period) {
    const matches = [...ex.period.matchAll(/([A-Za-z]{3})[-\s]?(\d{4})/g)];
    const last = matches[matches.length - 1];
    if (last && MONTHS[last[1].toLowerCase()]) return `${last[2]}-${MONTHS[last[1].toLowerCase()]}`;
  }
  return currentMonth();
}

// ---- xlsx / csv checks (reuse the upload parsers) --------------------------

export async function runXlsxChecks(slot: ReportSlot, file: File): Promise<StagedUpload> {
  const parser = slot.parserId ? UPLOAD_PARSERS.find((p) => p.sourceId === slot.parserId) : undefined;
  const rawBase64 = await fileToBase64(file);
  const base = { fileName: file.name, mimeType: file.type || 'application/octet-stream', rawBase64 };

  if (!parser) {
    const extracted: Extracted = { facts: [], rowCount: 0, through: null };
    return {
      ...base,
      periodKey: currentMonth(),
      extracted,
      checks: { items: [{ id: 'parser', label: 'Reader for this report', status: 'fail', detail: 'Not wired yet — steps are ready; the parser is being built.' }], overall: 'fail' },
    };
  }

  const items: CheckItem[] = [];
  try {
    const rec = await parseUpload(parser, file);
    const dates = rec.facts.map((f) => f.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const through = dates[dates.length - 1] ?? null;
    const months = new Set(dates.map((d) => d.slice(0, 7)));

    items.push({ id: 'read', label: 'File read', status: 'pass', detail: `${rec.rawRows ?? '?'} source rows` });
    items.push({ id: 'recognised', label: 'Report recognised', status: 'pass', detail: parser.label });
    items.push({
      id: 'rows',
      label: 'Rows extracted',
      status: rec.facts.length > 0 ? 'pass' : 'fail',
      detail: `${rec.facts.length} daily facts`,
    });
    items.push({
      id: 'dates',
      label: 'Dates parsed',
      status: through ? 'pass' : 'warn',
      detail: through ? `through ${through}` : 'no dated rows',
    });
    if (months.size > 1) {
      items.push({ id: 'span', label: 'Single-month window', status: 'warn', detail: `rows span ${[...months].sort().join(', ')}` });
    }

    const extracted: Extracted = {
      facts: rec.facts,
      rowCount: rec.facts.length,
      through,
      rawPreview: rec.rawPreview,
      trace: rec.trace,
    };
    return { ...base, periodKey: derivePeriod(extracted), extracted, checks: { items, overall: overallOf(items) } };
  } catch (e) {
    items.push({ id: 'read', label: 'Read the report', status: 'fail', detail: e instanceof Error ? e.message : 'Could not read the file.' });
    const extracted: Extracted = { facts: [], rowCount: 0, through: null };
    return { ...base, periodKey: currentMonth(), extracted, checks: { items, overall: 'fail' } };
  }
}

// ---- Tally screenshot checks (vision model) --------------------------------

interface VisionResponse {
  rows?: { name: string; depth: number; amount: number; confidence: number }[];
  nettProfit?: number | null;
  period?: string | null;
  warnings?: string[];
  error?: string;
}

export async function runVisionChecks(slot: ReportSlot, file: File): Promise<StagedUpload> {
  const rawBase64 = await fileToBase64(file);
  const base = { fileName: file.name, mimeType: file.type || 'image/png', rawBase64 };
  const res = await fetch('/api/month-close/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: rawBase64, mimeType: base.mimeType }),
  });
  const body = (await res.json().catch(() => ({}))) as VisionResponse;
  if (!res.ok) {
    const extracted: Extracted = { facts: [], rowCount: 0, through: null };
    return {
      ...base, periodKey: currentMonth(), extracted,
      checks: { items: [{ id: 'vision', label: 'Read the screenshot', status: 'fail', detail: body.error || `Vision failed (${res.status}).` }], overall: 'fail' },
    };
  }
  const rows = body.rows ?? [];
  const shaky = rows.filter((r) => r.confidence < 0.9).length;
  const items: CheckItem[] = [
    { id: 'read', label: 'Screenshot read', status: rows.length > 0 ? 'pass' : 'fail', detail: `${rows.length} ledger rows` },
    { id: 'confidence', label: 'Legible figures', status: shaky > 0 ? 'warn' : 'pass', detail: shaky > 0 ? `${shaky} row(s) read with low confidence — review` : 'all rows crisp' },
    { id: 'nett', label: 'Nett Profit read', status: body.nettProfit != null ? 'pass' : 'warn', detail: body.nettProfit != null ? `₹${Math.round(body.nettProfit).toLocaleString('en-IN')}` : 'no Nett Profit on screen' },
    { id: 'period', label: 'Period read', status: body.period ? 'pass' : 'warn', detail: body.period || 'not detected' },
  ];
  for (const w of body.warnings ?? []) items.push({ id: `w-${items.length}`, label: 'Model note', status: 'warn', detail: w });

  const extracted: Extracted = {
    facts: [],
    rowCount: rows.length,
    through: null,
    ledgerRows: rows,
    nettProfit: body.nettProfit ?? null,
    period: body.period ?? null,
  };
  return { ...base, periodKey: derivePeriod(extracted), extracted, checks: { items, overall: overallOf(items) } };
}

export async function runChecks(slot: ReportSlot, file: File): Promise<StagedUpload> {
  return slot.kind === 'vision' ? runVisionChecks(slot, file) : runXlsxChecks(slot, file);
}
