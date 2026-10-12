// ----------------------------------------------------------------------------
// Live MIS client — pull the dated fact stream for a date range.
// ----------------------------------------------------------------------------

import type { DailyFact } from './facts';

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  error?: string;
  /** Earliest / latest date this source returned data for, in the range. */
  from?: string | null;
  through?: string | null;
}

export interface FactsResponse {
  from: string;
  to: string;
  sources: SourceStatus[];
  facts: DailyFact[];
  warnings: string[];
}

export async function fetchFacts(from: string, to: string): Promise<FactsResponse> {
  const res = await fetch('/api/connectors/facts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  const body = (await res.json().catch(() => ({}))) as FactsResponse & { error?: string };
  if (!res.ok) throw new Error(body.error || `Facts request failed (${res.status}).`);
  return body;
}
