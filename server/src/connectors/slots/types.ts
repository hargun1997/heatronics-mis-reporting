// ----------------------------------------------------------------------------
// Close-slot sources — how each month-end report slot gets filled.
//
// Every slot on the Close / ingest page (client/src/data/ingest/catalog.ts) is
// one of:
//   api          pulled by the MIS's OWN connector (Amazon SP-API, Amazon Ads,
//                Meta, Google Ads, Shiprocket, Easebuzz)
//   sheet        read from the Tranzact daily Google Sheet feed (Sheets API)
//   claude_task  filled by a named Claude scheduled task (upload is the fallback)
//   upload       manual upload, with the one-line reason why
//
// An api / sheet slot also keeps its upload box: a failed pull never blocks the
// close. A pull produces exactly what the slot's file parser would have, so the
// commit (POST /api/ingest/commit) and the close maths never learn the
// difference:
//   facts  — the same DailyFact[] the client parser emits (source / channel /
//            sku / date conventions copied from uploadParsers.ts), or
//   rows   — a sheet (header + rows) the client runs through the SAME parser.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../facts.js';
import type { Credentials } from '../types.js';

export type SlotSourceKind = 'api' | 'sheet' | 'claude_task' | 'upload';

/** One finished good's per-unit cost (the BOM pricing slot; same shape as the client's BomCostRow). */
export interface BomCostRow {
  fgId: string;
  bomNumber: string;
  bomName: string;
  costPerUnit: number;
}

/** What one pull of one slot for one month produced. */
export interface SlotPull {
  /** Facts in the client parser's exact shape (api slots). */
  facts?: DailyFact[];
  /** Finished-good unit costs (the BOM pricing slot). */
  bomCosts?: BomCostRow[];
  /** Tally P&L slot: one month's ledger rows + Nett Profit (same as the P&L Excel reader). */
  tallyMonth?: { period: string; periodLabel: string; ledgerRows: { name: string; depth: number; amount: number; confidence: number }[]; nettProfit: number | null; asOf: string };
  /** Header + data rows for the client parser (sheet slots). */
  rows?: unknown[][];
  /** Rows / items read from the source (for the checks line). */
  rowCount: number;
  trace: string[];
  warnings: string[];
  /** Parsed fine, nothing happened that month (valid empty month). */
  emptyOk?: boolean;
  /** Plain-words differences from the upload this replaces, shown on the slot. */
  note?: string;
}

export interface PullContext {
  creds: Credentials;
  periodKey: string;
  /** ms epoch the pull must stop by (a longer job finishes in the background). */
  deadline: number;
}

export interface SlotSourceDef {
  connectorId: string;
  slotId: string;
  source: SlotSourceKind;
  /** Badge line: "Amazon SP-API Finances", "Tranzact daily sheet", "Manual upload". */
  via: string;
  /** One line under the badge. For uploads: the reason it can't be automatic. */
  line: string;
  /** Connector whose credentials the pull uses (default connectorId). */
  credsFrom?: string;
  /** Required credential fields for the pull ([] = needs none, e.g. the service account). */
  needs?: string[];
  /** What to add when not connected, in plain words. */
  connectHint?: string;
  /** The Claude scheduled task that fills it (claude_task slots). */
  claudeTask?: string;
  /** Upload parser the client runs over `rows` (sheet slots). */
  parserId?: string;
  pull?: (ctx: PullContext) => Promise<SlotPull>;
}

/** A scheduled job that feeds data somewhere in the Heatronics portals. */
export interface FeedTask {
  name: string;
  /** "Claude scheduled task" or "Tranzact Recurring Report". */
  kind: 'claude_task' | 'tranzact_recurring';
  when: string;
  what: string;
  /** Where its output lands. */
  feeds: string;
}
