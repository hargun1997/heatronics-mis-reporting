// Claude API usage / cost — read daily spend from /api/usage.

export interface DayUsage {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byFeature: Record<string, { calls: number; costUsd: number }>;
  models: string[];
}

export interface UsageResponse {
  days: DayUsage[];
  today: DayUsage | null;
  windowDays: number;
  totalUsd: number;
}

// Shared for 60 s per window size: the sidebar pill renders twice (rail + phone drawer) and each asked on every load.
const usageMemo = new Map<number, { at: number; p: Promise<UsageResponse> }>();
export function getUsage(days = 7): Promise<UsageResponse> {
  const hit = usageMemo.get(days);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const res = await fetch(`/api/usage?days=${days}`);
    const body = (await res.json().catch(() => ({}))) as UsageResponse & { error?: string };
    if (!res.ok) throw new Error(body.error || `Usage request failed (${res.status}).`);
    return body;
  })();
  const entry = { at: Date.now(), p };
  usageMemo.set(days, entry);
  p.catch(() => { if (usageMemo.get(days) === entry) usageMemo.delete(days); });
  return p;
}

/** Compact dollar label: "<$0.01" for tiny spend, else 2 decimals. */
export function usd(n: number): string {
  if (n > 0 && n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
