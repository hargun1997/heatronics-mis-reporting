// ----------------------------------------------------------------------------
// Ingestion client — talk to /api/ingest (durable store) and run the pre-save
// "AI checks" in the browser: xlsx reports go through the existing upload
// parsers, Tally screenshots through the vision model. A run returns a
// StagedUpload (checks + extracted preview + the raw bytes) held until the user
// saves, at which point commit() persists and ingests it (overwriting any prior
// report for the same connector+slot+period).
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { unzipSync } from 'fflate';
import { parseUpload, UPLOAD_PARSERS } from '../liveMis/uploadParsers';
import { parseTallyPnl } from '../liveMis/tallyPnl';
import { computeClose } from '../monthClose/compute';
import { emptySession, type LedgerNode } from '../monthClose/schema';
import type {
  BomCostRow,
  CheckItem,
  CheckReport,
  Extracted,
  IngestReportMeta,
  IngestStoreStatus,
  InvoiceSummary,
  ReportSlot,
  StagedUpload,
  TallyMonthExtract,
} from './types';
import type { DailyFact } from '../liveMis/facts';

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

/** One month's slice of a staged upload — the unit the store overwrites. */
export interface MonthCommit {
  periodKey: string;
  facts: DailyFact[];
  ledgerRows?: Extracted['ledgerRows'];
  nettProfit?: number | null;
  rowCount: number;
  through: string | null;
  /** How this slice was decided — drives the UI wording. */
  basis: 'tally' | 'facts' | 'single';
}

const isISODate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/**
 * Split a staged upload into one commit per month it actually covers, so each
 * month overwrites only its own slot/period (never clobbering a neighbour):
 *   • Tally P&L → one slice per ledger-month in the export.
 *   • Dated facts (settlements, ads, …) → bucketed by each row's own date.
 *   • Dateless (BOM, a Tally screenshot, an undated invoice) → a single slice
 *     filed under the operator's chosen month.
 */
export function monthBreakdown(staged: StagedUpload, overridePeriod: string): MonthCommit[] {
  const ex = staged.extracted;

  if (ex.tallyMonths && ex.tallyMonths.length > 0) {
    return [...ex.tallyMonths]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((m) => ({
        periodKey: m.period, facts: [],
        ledgerRows: m.ledgerRows, nettProfit: m.nettProfit,
        rowCount: m.ledgerRows.length, through: null, basis: 'tally' as const,
      }));
  }

  const slices: MonthCommit[] = [];
  const dated = ex.facts.filter((f) => isISODate(f.date));
  if (dated.length > 0) {
    const byMonth = new Map<string, DailyFact[]>();
    for (const f of dated) {
      const pk = f.date.slice(0, 7);
      (byMonth.get(pk) ?? byMonth.set(pk, []).get(pk)!).push(f);
    }
    // Any undated rows ride with the override month if it is one we saw, else the
    // latest detected month, so nothing is silently dropped.
    const months = [...byMonth.keys()].sort();
    const undated = ex.facts.filter((f) => !isISODate(f.date));
    if (undated.length > 0) {
      const host = byMonth.has(overridePeriod) ? overridePeriod : months[months.length - 1];
      byMonth.get(host)!.push(...undated);
    }
    for (const pk of months) {
      const facts = byMonth.get(pk)!;
      const ds = facts.map((f) => f.date).filter(isISODate).sort();
      slices.push({ periodKey: pk, facts, rowCount: facts.length, through: ds[ds.length - 1] ?? null, basis: 'facts' });
    }
  }

  // Zero-activity months the report confirmed (e.g. a Flipkart settlement with no
  // orders) — ingest an empty slice so the month is marked covered.
  const covered = new Set(slices.map((s) => s.periodKey));
  for (const m of ex.emptyMonths ?? []) {
    if (/^\d{4}-\d{2}$/.test(m) && !covered.has(m)) {
      slices.push({ periodKey: m, facts: [], rowCount: 0, through: null, basis: 'facts' });
    }
  }
  if (slices.length > 0) return slices;

  // Dateless facts (e.g. the Amazon Business Report, which carries no per-row
  // date) are stamped to the chosen month so the deck routes them there.
  const stamped = ex.facts.map((f) => (f.date ? f : { ...f, date: `${overridePeriod}-01` }));
  return [{
    periodKey: overridePeriod, facts: stamped,
    ledgerRows: ex.ledgerRows, nettProfit: ex.nettProfit,
    rowCount: ex.rowCount, through: ex.through, basis: 'single' as const,
  }];
}

/** POST one month slice to the durable store (overwrites that slot+period). */
async function postCommit(slot: ReportSlot, staged: StagedUpload, mc: MonthCommit, summary: ReturnType<typeof summarise>): Promise<IngestReportMeta> {
  const r = await asJson<{ report: IngestReportMeta }>(
    await fetch('/api/ingest/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectorId: slot.connectorId,
        slotId: slot.slotId,
        slotLabel: slot.label,
        periodKey: mc.periodKey,
        fileName: staged.fileName,
        mimeType: staged.mimeType,
        rowCount: mc.rowCount,
        through: mc.through,
        warnings: [],
        checks: summary,
        rawFiles: staged.rawFiles,
        extracted: {
          facts: mc.facts,
          ledgerRows: mc.ledgerRows,
          nettProfit: mc.nettProfit,
          period: staged.extracted.period,
          bomCosts: staged.extracted.bomCosts,
          invoice: staged.extracted.invoice,
        },
      }),
    }),
  );
  return r.report;
}

/**
 * Save + ingest a validated upload, splitting it into one durable commit per
 * month it covers (see monthBreakdown). Returns every month's record, ascending.
 */
export async function commitReportMonths(slot: ReportSlot, staged: StagedUpload, overridePeriod: string): Promise<IngestReportMeta[]> {
  const summary = summarise(staged.checks);
  const metas: IngestReportMeta[] = [];
  for (const mc of monthBreakdown(staged, overridePeriod)) {
    metas.push(await postCommit(slot, staged, mc, summary));
  }
  return metas;
}

/** Save + ingest a single-month upload (overwrites the same slot/period). */
export async function commitReport(slot: ReportSlot, staged: StagedUpload): Promise<IngestReportMeta> {
  const [meta] = await commitReportMonths(slot, staged, staged.periodKey);
  return meta;
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

/**
 * A YYYY-MM read from a file's NAME, for reports that carry no date inside them
 * (the Amazon Business Report). Handles "Apr-2026", "April 2026", "2026-04",
 * "04-2026" and the like. Undefined when no month is encoded.
 */
export function monthFromName(name: string): string | undefined {
  const s = name.toLowerCase();
  let m = s.match(/(20\d{2})[-_. ](0[1-9]|1[0-2])(?!\d)/);      // 2026-04
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/(?<!\d)(0[1-9]|1[0-2])[-_. ](20\d{2})/);         // 04-2026
  if (m) return `${m[2]}-${m[1]}`;
  m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-_. ]?(20\d{2})/); // apr-2026 / april 2026
  if (m && MONTHS[m[1].slice(0, 3)]) return `${m[2]}-${MONTHS[m[1].slice(0, 3)]}`;
  return undefined;
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

/** Build the shared StageBase (display name + raw bytes) from one or more files. */
async function stageBaseFor(files: File[], defaultMime: string): Promise<StageBase> {
  const rawFiles = await Promise.all(
    files.map(async (f) => ({ base64: await fileToBase64(f), name: f.name, mimeType: f.type || defaultMime })),
  );
  return {
    fileName: files.length > 1 ? `${files[0].name} +${files.length - 1} more` : files[0].name,
    mimeType: files[0].type || defaultMime,
    rawFiles,
  };
}

/** A File-like with just what parseUpload needs — used for a file extracted from a ZIP. */
interface FileLike { name: string; type: string; arrayBuffer: () => Promise<ArrayBuffer>; }

/**
 * Some sellers download a ZIP (Blinkit's monthly SoA). Transparently open it and
 * return the spreadsheet inside — the order-level-charges sheet when present,
 * else the first .xlsx/.csv — so the operator can drop the ZIP as-is. Non-ZIP
 * files pass straight through.
 */
async function resolveUploadFile(file: File): Promise<File | FileLike> {
  const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  if (!isZip) return file;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const names = Object.keys(entries).filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX'));
  // Blinkit's payout ZIP has two layouts: a compact "A&B. Order_level_charges.xlsx"
  // and an expanded set where the order data is in "Forward & Return ... Orders.xlsx".
  // Prefer the order file; never the Note / Payout Breakup / per-charge summaries.
  const isXlsx = (n: string) => /\.xlsx?$/i.test(n);
  const pick = names.find((n) => isXlsx(n) && /order.{0,3}level.{0,3}charge/i.test(n))
    ?? names.find((n) => isXlsx(n) && /forward/i.test(n))
    ?? names.find((n) => isXlsx(n) && !/note|payout\s*breakup|charge|adjust|refund|inventory|storage|courier|recall|damaged|cn-?dn|pending|breakup/i.test(n))
    ?? names.find((n) => isXlsx(n))
    ?? names.find((n) => /\.csv$/i.test(n));
  if (!pick) throw new Error('No spreadsheet (.xlsx/.csv) found inside the ZIP.');
  const bytes = entries[pick];
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { name: pick.split('/').pop() || pick, type: '', arrayBuffer: async () => ab };
}

export async function runXlsxChecks(slot: ReportSlot, files: File[]): Promise<StagedUpload> {
  const parser = slot.parserId ? UPLOAD_PARSERS.find((p) => p.sourceId === slot.parserId) : undefined;
  const base = await stageBaseFor(files, 'application/octet-stream');

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
    // Several files for one source are concatenated — a year of monthly exports,
    // or one multi-month file. Each fact keeps its own date, so the deck (and the
    // month-split commit) file every row to the month it actually falls in.
    // Open any ZIP (Blinkit) to the spreadsheet inside, then parse each file.
    const resolved = await Promise.all(files.map(resolveUploadFile));
    const recs = await Promise.all(resolved.map((f) => parseUpload(parser, f as File)));
    // A file whose rows carry no date (the Amazon Business Report) is stamped to
    // the month read from its own filename, so dropping many at once files each
    // to its own month. Files that already carry dates are left untouched.
    const facts = recs.flatMap((r, i) => {
      if (r.facts.length === 0 || r.facts.some((f) => isISODate(f.date))) return r.facts;
      const m = r.period ?? monthFromName(files[i].name);
      return m ? r.facts.map((f) => (f.date ? f : { ...f, date: `${m}-01` })) : r.facts;
    });
    const rawRows = recs.reduce((s, r) => s + (r.rawRows ?? 0), 0);
    const trace = files.length > 1
      ? recs.flatMap((r, i) => [`— ${files[i].name} —`, ...(r.trace ?? [])])
      : recs[0]?.trace;
    const dates = facts.map((f) => f.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const through = dates[dates.length - 1] ?? null;
    const months = new Set(dates.map((d) => d.slice(0, 7)));
    // Months a file confirmed as zero-activity (parsed cleanly, no rows). These
    // are still ingested — an empty report marks the month covered.
    const emptyMonths = [...new Set(recs.filter((r) => r.empty && r.period).map((r) => r.period as string))]
      .filter((m) => !months.has(m));

    items.push({ id: 'read', label: 'File read', status: 'pass', detail: `${rawRows || '?'} source rows${files.length > 1 ? ` across ${files.length} files` : ''}` });
    items.push({ id: 'recognised', label: 'Report recognised', status: 'pass', detail: parser.label });
    items.push({
      id: 'rows',
      label: facts.length > 0 ? 'Rows extracted' : 'No activity',
      status: facts.length > 0 || emptyMonths.length > 0 ? 'pass' : 'fail',
      detail: facts.length > 0
        ? `${facts.length} daily facts`
        : emptyMonths.length > 0
          ? `empty month confirmed: ${emptyMonths.join(', ')} — nothing to post, filed as covered`
          : 'no rows read',
    });
    if (facts.length > 0) {
      items.push({ id: 'dates', label: 'Dates parsed', status: through ? 'pass' : 'warn', detail: through ? `through ${through}` : 'no dated rows' });
    }
    if (months.size > 1) {
      // Multi-month is now a feature, not a warning: each month is filed separately.
      items.push({ id: 'span', label: 'Months covered', status: 'pass', detail: `${[...months].sort().join(', ')} — each filed to its own month` });
    }

    const extracted: Extracted = {
      facts,
      rowCount: facts.length,
      through,
      rawPreview: recs[0]?.rawPreview,
      trace,
      emptyMonths: emptyMonths.length > 0 ? emptyMonths : undefined,
    };
    // When there are no dated facts, default the month to the latest empty month
    // the report named (so the header shows it) instead of the current month.
    const periodKey = facts.length > 0 ? derivePeriod(extracted) : (emptyMonths[emptyMonths.length - 1] ?? derivePeriod(extracted));
    return { ...base, periodKey, extracted, checks: { items, overall: overallOf(items) } };
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

// ---- Tally P&L A/c Excel (book of record → the full cascade) ---------------

/**
 * Read a Tally Profit & Loss A/c Excel. A multi-period export carries many
 * months; each is parsed to ledger rows + Nett Profit. The month whose period
 * the operator sets is the one ingested (default: the latest complete month).
 * A reconciliation check runs the close so the operator sees it ties to the
 * Nett Profit before saving.
 */
export async function runTallyXlsxChecks(slot: ReportSlot, files: File[]): Promise<StagedUpload> {
  const base = await stageBaseFor(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const items: CheckItem[] = [];
  try {
    // Several Tally exports are merged by period (a later file wins for a month it
    // repeats), so a full year can be dropped in one or many files.
    const byPeriod = new Map<string, TallyMonthExtract>();
    for (const file of files) {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      for (const m of parseTallyPnl(wb).months) byPeriod.set(m.period, m);
    }
    const months = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
    if (months.length === 0) {
      items.push({ id: 'read', label: 'Read the P&L', status: 'fail', detail: 'No month with ledger activity.' });
      const extracted: Extracted = { facts: [], rowCount: 0, through: null };
      return { ...base, periodKey: currentMonth(), extracted, checks: { items, overall: 'fail' } };
    }

    // Default to the latest COMPLETE month (period before this month) with real
    // activity; fall back to the latest substantial month, then the latest.
    const now = currentMonth();
    const substantial = months.filter((m) => m.ledgerRows.length >= 10);
    const complete = substantial.filter((m) => m.period < now);
    const pick = (complete.length ? complete : substantial.length ? substantial : months).reduce((a, b) => (a.period >= b.period ? a : b));
    return tallyStage(base, months, pick);
  } catch (e) {
    items.push({ id: 'read', label: 'Read the P&L Excel', status: 'fail', detail: e instanceof Error ? e.message : 'Could not read the file.' });
    const extracted: Extracted = { facts: [], rowCount: 0, through: null };
    return { ...base, periodKey: currentMonth(), extracted, checks: { items, overall: 'fail' } };
  }
}

type StageBase = Pick<StagedUpload, 'fileName' | 'mimeType' | 'rawFiles'>;

/** Build the staged upload (checks + extracted) for one chosen Tally month. */
function tallyStage(base: StageBase, months: TallyMonthExtract[], pick: TallyMonthExtract): StagedUpload {
  const recon = reconcileTally(pick);
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const items: CheckItem[] = [
    { id: 'read', label: 'P&L read (Excel)', status: 'pass', detail: `${months.length} month(s) in export; ingesting ${pick.periodLabel}` },
    { id: 'ledgers', label: 'Ledgers extracted', status: pick.ledgerRows.length > 0 ? 'pass' : 'fail', detail: `${pick.ledgerRows.length} ledgers` },
    { id: 'nett', label: 'Nett Profit read', status: pick.nettProfit != null ? 'pass' : 'warn', detail: pick.nettProfit != null ? inr(pick.nettProfit) : 'not found' },
    {
      id: 'reconcile',
      label: 'Cascade reconciles to Nett Profit',
      status: recon.ok ? 'pass' : 'warn',
      detail: recon.ok ? `Net Income ${inr(recon.netIncome)} ties (residual ₹0)` : `Net Income ${inr(recon.netIncome)} vs Nett Profit ${inr(pick.nettProfit ?? 0)} — residual ${inr(recon.residual)}`,
    },
  ];
  if (pick.warning) items.push({ id: 'collapsed', label: 'Trading Account note', status: 'warn', detail: pick.warning });

  const extracted: Extracted = {
    facts: [],
    rowCount: pick.ledgerRows.length,
    through: null,
    ledgerRows: pick.ledgerRows,
    nettProfit: pick.nettProfit,
    period: pick.periodLabel,
    tallyMonths: months,
    trace: [
      `Months in export: ${months.map((m) => m.periodLabel).join(', ')}`,
      `Ingesting ${pick.periodLabel}: ${pick.ledgerRows.length} ledgers, Nett Profit ${inr(pick.nettProfit ?? 0)}`,
    ],
  };
  return { ...base, periodKey: pick.period, extracted, checks: { items, overall: overallOf(items) } };
}

/** Re-stage a Tally upload for a different month the operator picked (no re-read). */
export function restageTallyMonth(staged: StagedUpload, period: string): StagedUpload {
  const months = staged.extracted.tallyMonths;
  const pick = months?.find((m) => m.period === period);
  if (!months || !pick) return { ...staged, periodKey: period };
  return tallyStage({ fileName: staged.fileName, mimeType: staged.mimeType, rawFiles: staged.rawFiles }, months, pick);
}

/** Run the month-close for one parsed Tally month to confirm it reconciles. */
function reconcileTally(m: TallyMonthExtract): { ok: boolean; netIncome: number; residual: number } {
  const nodes: LedgerNode[] = m.ledgerRows.map((r) => ({
    name: r.name, depth: Math.max(0, Math.floor(r.depth ?? 0)), path: [], amount: r.amount, isLeaf: true,
    provenance: { sourceId: 'tally', sourceLabel: 'Tally P&L', method: 'xlsx', confidence: 'exact', verified: true },
  }));
  const session = emptySession(m.period, m.periodLabel);
  session.sources = [{ id: 'tally:pnl', label: 'tally', kind: 'skuPnl', method: 'xlsx', addedAt: '', nodes, skuRows: [], bomCosts: [], crossChecks: [], warnings: [] }];
  session.anchor = { nettProfit: m.nettProfit != null ? { value: m.nettProfit, provenance: { sourceId: 'tally', sourceLabel: 'Tally P&L', method: 'xlsx', confidence: 'exact', verified: true } } : null };
  const c = computeClose(session);
  return { ok: c.reconciliation.ok, netIncome: c.netIncome, residual: c.reconciliation.residual ?? 0 };
}

// ---- Shopflo checkout invoice (PDF → Claude → platform cost) ---------------

interface InvoiceResponse extends Partial<InvoiceSummary> {
  warnings?: string[];
  error?: string;
}

/**
 * Read a platform/checkout invoice PDF through the server (Claude) into a single
 * D2C platform-cost fact. The service rule lives here, not in the model: the
 * cost is the taxable amount + GST (matching Easebuzz/Snapmint); TDS withheld is
 * recoverable and excluded. Dated to the billing-cycle end.
 */
interface ShopfloHistoryRow { invoiceNumber: string | null; dueDate: string | null; amount: number | null; status: string | null; }

/** "2026-10" → "2026-09" (Shopflo bills in arrears: a due date covers the prior month). */
function prevMonthKey(mk: string): string {
  let [y, m] = mk.split('-').map(Number);
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Read a Shopflo "Billing History" SCREENSHOT through the server (Claude) into
 * one D2C platform-cost fact per month. Each invoice's amount includes GST and
 * is booked as the cost; its due date maps to the prior service month (arrears).
 * One screenshot covers every month, so this splits across months on commit.
 */
export async function runShopfloHistoryChecks(slot: ReportSlot, files: File[]): Promise<StagedUpload> {
  const base = await stageBaseFor(files, 'image/png');
  const res = await fetch('/api/ingest/shopflo-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: base.rawFiles.map((f) => ({ imageBase64: f.base64, mimeType: f.mimeType })) }),
  });
  const body = (await res.json().catch(() => ({}))) as { rows?: ShopfloHistoryRow[]; warnings?: string[]; error?: string };
  if (!res.ok) {
    const extracted: Extracted = { facts: [], rowCount: 0, through: null };
    return { ...base, periodKey: currentMonth(), extracted, checks: { items: [{ id: 'read', label: 'Read the billing history', status: 'fail', detail: body.error || `Read failed (${res.status}).` }], overall: 'fail' } };
  }

  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  // One D2C platform-cost fact per invoice, booked to the prior month (arrears).
  const byMonth = new Map<string, number>();
  let skipped = 0;
  for (const row of rows) {
    if (row.amount == null || row.amount <= 0 || !row.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate)) { skipped += 1; continue; }
    const mo = prevMonthKey(row.dueDate.slice(0, 7));
    byMonth.set(mo, r2((byMonth.get(mo) ?? 0) + row.amount));
  }
  const facts: DailyFact[] = [...byMonth.entries()].map(([mo, fee]) => ({
    source: 'shopflo', channel: 'D2C', date: `${mo}-01`, revenue: 0, units: 0, orders: 0, fees: fee,
  }));
  const months = [...byMonth.keys()].sort();
  const total = r2(facts.reduce((s, f) => s + f.fees, 0));

  const items: CheckItem[] = [
    { id: 'read', label: 'Billing history read (Claude)', status: rows.length > 0 ? 'pass' : 'fail', detail: `${rows.length} invoice row(s)` },
    { id: 'months', label: 'Months booked', status: facts.length > 0 ? 'pass' : 'fail', detail: facts.length > 0 ? `${months.join(', ')} (due date → prior month)` : 'no datable rows' },
    { id: 'amount', label: 'Platform cost (incl. GST)', status: total > 0 ? 'pass' : 'warn', detail: inr(total) },
  ];
  if (skipped > 0) items.push({ id: 'skipped', label: 'Rows skipped', status: 'warn', detail: `${skipped} row(s) had no amount/date` });
  for (const w of body.warnings ?? []) items.push({ id: `w-${items.length}`, label: 'Model note', status: 'warn', detail: w });

  const dates = facts.map((f) => f.date).sort();
  const extracted: Extracted = {
    facts,
    rowCount: facts.length,
    through: dates[dates.length - 1] ?? null,
    trace: [
      `Read ${rows.length} invoice row(s) from the billing-history screenshot`,
      `Booked ${facts.length} month(s) to D2C Platform & Payment (amount incl. GST, due date → prior month): ${months.map((m) => `${m} ${inr(byMonth.get(m)!)}`).join(', ')}`,
      `Total Shopflo checkout cost ${inr(total)}`,
    ],
  };
  return { ...base, periodKey: facts.length ? (months[months.length - 1]) : currentMonth(), extracted, checks: { items, overall: overallOf(items) } };
}

export async function runInvoiceChecks(slot: ReportSlot, file: File): Promise<StagedUpload> {
  const rawBase64 = await fileToBase64(file);
  const base = {
    fileName: file.name,
    mimeType: file.type || 'application/pdf',
    rawFiles: [{ base64: rawBase64, name: file.name, mimeType: file.type || 'application/pdf' }],
  };

  const res = await fetch('/api/ingest/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfBase64: rawBase64 }),
  });
  const body = (await res.json().catch(() => ({}))) as InvoiceResponse;
  if (!res.ok) {
    const extracted: Extracted = { facts: [], rowCount: 0, through: null };
    return {
      ...base, periodKey: currentMonth(), extracted,
      checks: { items: [{ id: 'invoice', label: 'Read the invoice', status: 'fail', detail: body.error || `Invoice read failed (${res.status}).` }], overall: 'fail' },
    };
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const invoice: InvoiceSummary = {
    provider: body.provider ?? null,
    invoiceNumber: body.invoiceNumber ?? null,
    periodStart: body.periodStart ?? null,
    periodEnd: body.periodEnd ?? null,
    taxableAmount: typeof body.taxableAmount === 'number' ? body.taxableAmount : null,
    taxAmount: typeof body.taxAmount === 'number' ? body.taxAmount : null,
    amountWithheld: typeof body.amountWithheld === 'number' ? body.amountWithheld : null,
    total: typeof body.total === 'number' ? body.total : null,
  };

  const taxable = invoice.taxableAmount ?? 0;
  const tax = invoice.taxAmount ?? 0;
  const fee = r2(taxable + tax); // cost = taxable + GST; TDS withheld excluded (recoverable)
  const date = invoice.periodEnd ?? invoice.periodStart ?? null;

  const items: CheckItem[] = [
    { id: 'read', label: 'Invoice read (Claude)', status: invoice.taxableAmount != null ? 'pass' : 'fail', detail: invoice.provider ? `from ${invoice.provider}` : 'provider not detected' },
    { id: 'amount', label: 'Taxable + GST', status: fee > 0 ? 'pass' : 'fail', detail: `${inr(taxable)} + ${inr(tax)} = ${inr(fee)}` },
    { id: 'withheld', label: 'TDS withheld (excluded, recoverable)', status: 'pass', detail: invoice.amountWithheld ? inr(invoice.amountWithheld) : 'none' },
    { id: 'period', label: 'Billing cycle read', status: date ? 'pass' : 'warn', detail: invoice.periodStart && invoice.periodEnd ? `${invoice.periodStart} → ${invoice.periodEnd}` : (date ?? 'not detected — set the period') },
  ];
  for (const w of body.warnings ?? []) items.push({ id: `w-${items.length}`, label: 'Model note', status: 'warn', detail: w });

  const facts: DailyFact[] = fee > 0 && date
    ? [{ source: 'shopflo', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: fee }]
    : [];
  if (fee > 0 && !date) {
    items.push({ id: 'nodate', label: 'No date → no fact', status: 'fail', detail: 'Billing cycle not read; cannot date the cost. Re-upload a clearer PDF.' });
  }

  const extracted: Extracted = {
    facts,
    rowCount: facts.length,
    through: date,
    invoice,
    trace: [
      invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}${invoice.provider ? ` — ${invoice.provider}` : ''}` : 'Shopflo invoice',
      `Checkout cost ${inr(fee)} (taxable ${inr(taxable)} + GST ${inr(tax)}; TDS ${invoice.amountWithheld ? inr(invoice.amountWithheld) : '₹0'} excluded) → D2C Platform & Payment${date ? `, dated ${date}` : ''}`,
    ],
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
  if (slot.kind === 'invoice') {
    // A PDF is a single monthly invoice; a screenshot (image) is the billing
    // history covering every month — read it with the history reader instead.
    const f = files[0];
    const isImage = /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
    return isImage ? runShopfloHistoryChecks(slot, files) : runInvoiceChecks(slot, files[0]);
  }
  if (slot.kind === 'tally-xlsx') return runTallyXlsxChecks(slot, files);
  return runXlsxChecks(slot, files);
}
