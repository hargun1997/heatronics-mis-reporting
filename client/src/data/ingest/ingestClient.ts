// ----------------------------------------------------------------------------
// Ingestion client — talk to /api/ingest (durable store) and run the pre-save
// "AI checks" in the browser: xlsx reports go through the existing upload
// parsers, Tally screenshots through the vision model. A run returns a
// StagedUpload (checks + extracted preview + the raw bytes) held until the user
// saves, at which point commit() persists and ingests it (overwriting any prior
// report for the same connector+slot+period).
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { parseUpload, UPLOAD_PARSERS } from '../liveMis/uploadParsers';
import type {
  BomCostRow,
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
        warnings: [],
        checks: summary,
        rawFiles: staged.rawFiles,
        extracted: {
          facts: staged.extracted.facts,
          ledgerRows: staged.extracted.ledgerRows,
          nettProfit: staged.extracted.nettProfit,
          period: staged.extracted.period,
          bomCosts: staged.extracted.bomCosts,
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
  const base = {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    rawFiles: [{ base64: rawBase64, name: file.name, mimeType: file.type || 'application/octet-stream' }],
  };

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

export async function runVisionChecks(slot: ReportSlot, files: File[]): Promise<StagedUpload> {
  const rawFiles = await Promise.all(
    files.map(async (f) => ({ base64: await fileToBase64(f), name: f.name, mimeType: f.type || 'image/png' })),
  );
  const base = {
    fileName: files.length > 1 ? `${files[0].name} +${files.length - 1} more` : files[0].name,
    mimeType: files[0].type || 'image/png',
    rawFiles,
  };
  const res = await fetch('/api/ingest/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: rawFiles.map((f) => ({ imageBase64: f.base64, mimeType: f.mimeType })) }),
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

// ---- Tranzact BOM pricing (cost master, not daily facts) -------------------

const bcell = (v: unknown) => String(v ?? '').trim();
const blower = (v: unknown) => bcell(v).toLowerCase();
const bnum = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(bcell(v).replace(/[(),₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
function bomSheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
}
function bomHeader(rows: unknown[][], needles: string[], limit = 30): number {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = (rows[i] ?? []).map(blower);
    if (needles.every((n) => cells.some((c) => c === n))) return i;
  }
  return -1;
}

export async function runBomChecks(slot: ReportSlot, file: File): Promise<StagedUpload> {
  const rawBase64 = await fileToBase64(file);
  const base = {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    rawFiles: [{ base64: rawBase64, name: file.name, mimeType: file.type || 'application/octet-stream' }],
  };
  const items: CheckItem[] = [];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.SheetNames.find((n) => /summary/i.test(n)) ?? wb.SheetNames[0];
    const rows = bomSheetRows(wb, sheet);
    const hi = bomHeader(rows, ['fg item id', 'total fg cost']);
    if (hi < 0) {
      items.push({ id: 'header', label: 'Recognise the BOM pricing export', status: 'fail', detail: 'No "FG Item ID / Total FG Cost" header — export from Bill of Materials WITH pricing.' });
      const extracted: Extracted = { facts: [], rowCount: 0, through: null };
      return { ...base, periodKey: currentMonth(), extracted, checks: { items, overall: 'fail' } };
    }
    const header = (rows[hi] ?? []).map(blower);
    const ix = {
      fg: header.indexOf('fg item id'),
      bom: header.indexOf('bom number'),
      name: header.indexOf('bom name'),
      cost: header.indexOf('total fg cost'),
    };
    const byBom = new Map<string, BomCostRow>();
    for (const row of rows.slice(hi + 1)) {
      const fgId = bcell(row[ix.fg]).toUpperCase();
      const bomNumber = bcell(row[ix.bom]);
      if (!fgId || !bomNumber) continue;
      if (!/^FG-\d+/.test(fgId)) continue; // only finished goods carry a sold-unit cost
      const rawCost = row[ix.cost];
      if (rawCost === null || rawCost === undefined || bcell(rawCost) === '') continue; // total is on the first RM line only
      const costPerUnit = bnum(rawCost);
      if (costPerUnit <= 0 || byBom.has(bomNumber)) continue;
      byBom.set(bomNumber, { fgId, bomNumber, bomName: bcell(row[ix.name]), costPerUnit: Math.round(costPerUnit * 100) / 100 });
    }
    const bomCosts = [...byBom.values()].sort((a, b) => a.fgId.localeCompare(b.fgId));

    // multi-BOM finished goods (OEM variants) — flag as a warning
    const perFg = new Map<string, number>();
    for (const b of bomCosts) perFg.set(b.fgId, (perFg.get(b.fgId) ?? 0) + 1);
    const multi = [...perFg.entries()].filter(([, n]) => n > 1).map(([fg]) => fg);

    items.push({ id: 'read', label: 'File read', status: 'pass', detail: `sheet "${sheet}", ${Math.max(0, rows.length - 1)} rows` });
    items.push({ id: 'header', label: 'BOM pricing recognised', status: 'pass', detail: 'FG Item ID + Total FG Cost found' });
    items.push({ id: 'costs', label: 'Finished-good costs extracted', status: bomCosts.length > 0 ? 'pass' : 'fail', detail: `${bomCosts.length} finished goods costed` });
    if (multi.length) items.push({ id: 'multi', label: 'Single BOM per finished good', status: 'warn', detail: `${multi.join(', ')} have more than one BOM/cost — the lowest BOM number is used` });

    const rawPreview = rows.slice(0, 8).map((r) => (r ?? []).map((c) => bcell(c)));
    const extracted: Extracted = { facts: [], rowCount: bomCosts.length, through: null, bomCosts, rawPreview };
    return { ...base, periodKey: currentMonth(), extracted, checks: { items, overall: overallOf(items) } };
  } catch (e) {
    items.push({ id: 'read', label: 'Read the BOM export', status: 'fail', detail: e instanceof Error ? e.message : 'Could not read the file.' });
    const extracted: Extracted = { facts: [], rowCount: 0, through: null };
    return { ...base, periodKey: currentMonth(), extracted, checks: { items, overall: 'fail' } };
  }
}

export async function runChecks(slot: ReportSlot, files: File[]): Promise<StagedUpload> {
  if (slot.kind === 'vision') return runVisionChecks(slot, files);
  if (slot.kind === 'bom') return runBomChecks(slot, files[0]);
  return runXlsxChecks(slot, files[0]);
}
