// ----------------------------------------------------------------------------
// Shared adapter plumbing.
//
// Extracted from platformAdapters.ts when the second file of adapters arrived.
// Every helper here exists because a real export broke the naive version:
// headers that move down the sheet, columns that get renamed upstream, numbers
// arriving as strings with currency symbols in them.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { toAmount, type AdapterResult } from './adapters';
import type { Provenance } from './schema';

export function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
}

export const cell = (v: unknown) => String(v ?? '').trim();
export const lower = (v: unknown) => cell(v).toLowerCase();
export const num = (v: unknown) => toAmount(v) ?? 0;
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** First row within `limit` whose cells contain every needle. Headers move; row numbers do not survive. */
export function findHeader(rows: unknown[][], needles: string[], limit = 30): number {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = (rows[i] ?? []).map(lower);
    if (needles.every((n) => cells.some((c) => c === n))) return i;
  }
  return -1;
}

/**
 * Like findHeader, but matches on substrings.
 *
 * Flipkart and Delhivery ship headers with units baked into the name — "Final
 * Settlement Amount (Rs.)", "Charged Weight (Kg)" — so an exact match finds
 * nothing. Looser, and therefore only used where the exact pass has failed.
 */
export function findHeaderLoose(rows: unknown[][], needles: string[], limit = 30): number {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = (rows[i] ?? []).map(lower);
    if (needles.every((n) => cells.some((c) => c.includes(n)))) return i;
  }
  return -1;
}

/** Column index by exact lowercased header, trying each alias in order. */
export function col(header: string[], ...aliases: string[]): number {
  for (const a of aliases) {
    const i = header.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Column index by substring, trying each alias in order.
 *
 * Falls back from `col` rather than replacing it: an exact name should always
 * win, because "amount" matches "amount", "tax amount" and "refund amount",
 * and picking the wrong one of those is worse than not finding a column.
 */
export function colLoose(header: string[], ...aliases: string[]): number {
  const exact = col(header, ...aliases);
  if (exact >= 0) return exact;
  for (const a of aliases) {
    const i = header.findIndex((h) => h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

export function provenanceFor(sourceId: string, label: string, note: string): Provenance {
  return { sourceId, sourceLabel: label, method: 'xlsx', confidence: 'exact', verified: true, note };
}

/**
 * Provenance for a figure the adapter derived rather than read.
 *
 * An RTO loss inferred from a status column is not the same quality of fact as
 * a commission printed in a settlement file, and the close should be able to
 * tell the difference.
 */
export function derivedProvenance(sourceId: string, label: string, note: string): Provenance {
  return { sourceId, sourceLabel: label, method: 'xlsx', confidence: 'estimated', verified: false, note };
}

/** What every adapter says when it cannot find its columns: what it actually saw. */
export function headerMiss(label: string, missing: string[], header: string[]): AdapterResult {
  return {
    nodes: [],
    skuRows: [],
    bomCosts: [],
    crossChecks: [],
    warnings: [
      `${label}: could not find ${missing.map((m) => `a "${m}" column`).join(' and ')}. ` +
        `Headers actually present: ${header.filter(Boolean).join(' | ') || '(none)'}. ` +
        'If the export has been renamed upstream, add the new name to the alias list.',
    ],
  };
}

export const empty = (warnings: string[] = []): AdapterResult => ({
  nodes: [],
  skuRows: [],
  bomCosts: [],
  crossChecks: [],
  warnings,
});

export function sniffOn(hay: string, patterns: RegExp[], floor = 0.05): number {
  const hits = patterns.filter((re) => re.test(hay)).length;
  return hits === 0 ? floor : Math.min(0.55 + hits * 0.15, 1);
}

export function hayFor(wb: XLSX.WorkBook, fileName: string): string {
  const first = sheetRows(wb, wb.SheetNames[0]).slice(0, 20);
  return `${wb.SheetNames.join(' ')} ${fileName} ${first.flat().map(cell).join(' ')}`.toLowerCase();
}

/**
 * Marker for an adapter written from a documented format rather than a real file.
 *
 * Every adapter in this system that was written blind turned out to be wrong in
 * a way that still footed — Amazon prints a POSITIVE quantity on refunds, which
 * overstated units by 22%, and Shiprocket's biggest credits are COD moving into
 * the wallet rather than income, which read 74% light on freight. Both were
 * found only by running the real export. So an uncalibrated adapter says so on
 * every file it parses until someone has checked it against one real month.
 */
export function uncalibrated(label: string): string {
  return (
    `${label}: this adapter was written from the documented export format, not from one of your ` +
    'actual files. Check the yields against the platform dashboard before trusting the margin — ' +
    'sign conventions on refunds and returns are where these go wrong.'
  );
}
