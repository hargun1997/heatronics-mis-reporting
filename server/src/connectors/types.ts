// ----------------------------------------------------------------------------
// Connector contract.
//
// A connector is a named live source (Tally, Amazon, Shopify, …) that knows
// three things: what credentials it needs, how to prove they work, and how to
// pull one month of data into ConnectorSource[]. The registry holds one per
// source; routes and the UI are connector-agnostic.
// ----------------------------------------------------------------------------

import type { ConnectorSource } from './schema.js';
import type { FactResult } from './facts.js';

/** One credential input the UI renders in the connector's config drawer. */
export interface CredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  /** One line under the field: where to find this value. */
  help?: string;
  optional?: boolean;
}

/**
 * How a connector gets its data, which is also how honest the UI can be about
 * what "connected" means.
 *   api      — a documented REST pull with stored credentials
 *   xmlhttp  — Tally's XML-over-HTTP, reachable only if the host exposes :9000
 *   webhook  — the source pushes to us; credentials register the endpoint
 *   file     — no usable pull API; still a report drop (the fallback we have)
 */
export type FetchMode = 'api' | 'xmlhttp' | 'webhook' | 'file';

/**
 * How this connector is fed in practice — the thing the operator marks per
 * source. Independent of `fetchMode` (the capability): a source that *could*
 * expose an API (Amazon) may still run on 'manual-upload' while that API is
 * being stood up. This is what drives the console badge, whether a loader box
 * appears for it, and how its freshness is expected to arrive.
 *   live-api      — pulled automatically from a stored-credential API
 *   manual-upload — fed by a report file dropped on the readiness page
 */
export type ConnectorMode = 'live-api' | 'manual-upload';

/** Rough grouping for the console, mirroring FEED_SOURCES tiers. */
export type ConnectorGroup = 'book' | 'marketplace' | 'd2c' | 'logistics' | 'payments' | 'marketing';

export type Credentials = Record<string, string>;

export interface TestResult {
  ok: boolean;
  /** One line shown next to the status dot. */
  detail: string;
}

export interface FetchResult {
  sources: ConnectorSource[];
  warnings: string[];
}

export interface ConnectorDef {
  id: string;
  label: string;
  group: ConnectorGroup;
  fetchMode: FetchMode;
  /** How this source is fed today — 'live-api' or 'manual-upload'. */
  mode: ConnectorMode;
  /** The P&L book of record; there is only one (Tally). Affects UI ordering. */
  bookOfRecord?: boolean;
  /** True once the monthly pull is wired; false means credentials-only so far. */
  implemented: boolean;
  credentialFields: CredentialField[];
  /** Honest one-liner on the integration reality, shown in the drawer. */
  note?: string;

  /** Cheap round-trip that proves the credentials reach the source. */
  test(creds: Credentials): Promise<TestResult>;
  /** Pull one month as a close-ready rollup. periodKey is "YYYY-MM". */
  fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult>;
  /**
   * Pull a dated fact stream for the live run-rate view, [fromISO, toISO]
   * inclusive ('YYYY-MM-DD'). Present only on sources that can date their
   * data; its absence means the source feeds the close but not the run-rate.
   */
  fetchFacts?(creds: Credentials, fromISO: string, toISO: string): Promise<FactResult>;
}

/** Thrown by a connector whose fetch is not implemented yet. */
export class NotImplementedError extends Error {
  constructor(label: string) {
    super(
      `The ${label} connector can store and test credentials, but its monthly ` +
        `pull is not wired yet. Use the file upload on the close page for now.`,
    );
    this.name = 'NotImplementedError';
  }
}

/** Period "YYYY-MM" → inclusive [start, end] ISO date strings for that month. */
export function monthBounds(periodKey: string): { startISO: string; endISO: string } {
  const [y, m] = periodKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Bad period "${periodKey}" — expected YYYY-MM.`);
  }
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59)); // day 0 of next month = last day
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}
