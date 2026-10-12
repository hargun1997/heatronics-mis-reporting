// ----------------------------------------------------------------------------
// Ingestion types — shared shapes for the report-slot catalog, the AI-checks
// report, the extracted preview, and the committed-report record (mirrors the
// server's IngestReportMeta in server/src/ingest/objectStore.ts).
// ----------------------------------------------------------------------------

import type { DailyFact } from '../liveMis/facts';

/** How a report slot is read into the pipeline. */
export type SlotKind = 'xlsx' | 'vision';

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
