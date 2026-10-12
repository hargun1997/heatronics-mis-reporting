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

export async function getUsage(days = 7): Promise<UsageResponse> {
  const res = await fetch(`/api/usage?days=${days}`);
  const body = (await res.json().catch(() => ({}))) as UsageResponse & { error?: string };
  if (!res.ok) throw new Error(body.error || `Usage request failed (${res.status}).`);
  return body;
}

/** Compact dollar label: "<$0.01" for tiny spend, else 2 decimals. */
export function usd(n: number): string {
  if (n > 0 && n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
