// ----------------------------------------------------------------------------
// Ingestion types — shared shapes for the report-slot catalog, the AI-checks
// report, the extracted preview, and the committed-report record (mirrors the
// server's IngestReportMeta in server/src/ingest/objectStore.ts).
// ----------------------------------------------------------------------------

import type { DailyFact } from '../liveMis/facts';

/** How a report slot is read into the pipeline. */
export type SlotKind = 'xlsx' | 'vision' | 'bom' | 'invoice' | 'tally-xlsx';

/** One month read from a Tally P&L A/c Excel (a multi-period export has several). */
export interface TallyMonthExtract {
  period: string;
  periodLabel: string;
  ledgerRows: { name: string; depth: number; amount: number; confidence: number }[];
  nettProfit: number | null;
  warning?: string;
}

/** The money summary read from a platform/checkout invoice PDF (Shopflo). */
export interface InvoiceSummary {
  provider: string | null;
  invoiceNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  taxableAmount: number | null;
  taxAmount: number | null;
  amountWithheld: number | null;
  total: number | null;
}

export interface BomCostRow {
  fgId: string;
  bomNumber: string;
  bomName: string;
  costPerUnit: number;
}

/** One report a connector can receive (a connector may have several). */
export interface ReportSlot {
  connectorId: string;
  slotId: string;
  label: string;
  required: boolean;
  /** file-input accept list */
  accept: string;
  /** exact export steps shown to the operator */
  exportSteps: string[];
  kind: SlotKind;
  /** UPLOAD_PARSERS sourceId when a parser is wired; absent = not built yet */
  parserId?: string;
  note?: string;
  /** Deep link straight to the export screen (a saved report, a console page). */
  exportUrl?: { label: string; url: string };
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface CheckReport {
  items: CheckItem[];
  overall: CheckStatus;
}

/** What a single run through a file produced, before it is saved. */
export interface Extracted {
  facts: DailyFact[];
  rowCount: number;
  through: string | null;
  rawPreview?: string[][];
  trace?: string[];
  /** Tally vision path only. */
  ledgerRows?: { name: string; depth: number; amount: number; confidence: number }[];
  nettProfit?: number | null;
  period?: string | null;
  /** Tranzact BOM path only — standard cost per finished good. */
  bomCosts?: BomCostRow[];
  /** Invoice-PDF path only (Shopflo) — the money summary read by Claude. */
  invoice?: InvoiceSummary;
  /** Tally P&L Excel path only — every period in the export, for the month picker. */
  tallyMonths?: TallyMonthExtract[];
}

/** The server's record of a committed (saved + ingested) report. */
export interface IngestReportMeta {
  connectorId: string;
  slotId: string;
  slotLabel: string;
  periodKey: string;
  fileName: string;
  mimeType: string;
  rawExt: string;
  rowCount: number;
  through: string | null;
  warnings: string[];
  checks: { passed: number; warned: number; failed: number };
  savedAt: string;
  ingestedAt: string | null;
}

export interface IngestStoreStatus {
  backend: 'gcs' | 'local-file';
  durable: boolean;
  bucket: string;
  project: string;
  serviceAccount: string;
  error: string | null;
  grantHint: string | null;
}

export interface RawFile {
  base64: string;
  name: string;
  mimeType: string;
}

/** The result of validating file(s), held in the stepper until the user saves. */
export interface StagedUpload {
  checks: CheckReport;
  extracted: Extracted;
  /** Display name (first file, "+N more" when several). */
  fileName: string;
  mimeType: string;
  /** One or more raw files — a report can be several screenshots. */
  rawFiles: RawFile[];
  periodKey: string;
}
