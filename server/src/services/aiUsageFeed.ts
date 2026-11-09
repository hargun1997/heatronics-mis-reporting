// ----------------------------------------------------------------------------
// AI usage feed (schema 1) — what this portal spent on Claude (and Gemini, if it
// ever calls it again) per IST month, for the master portal's Spend view.
// Contract: heatronics-portal/mcp/ai-usage-feed.md. Pure: no store, no network.
// ----------------------------------------------------------------------------

export interface FeedUsageRecord {
  /** IST day the record was filed under (YYYY-MM-DD). */
  day: string;
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
}

export interface FeedMoney { usd: number; inr: number; calls: number }
export interface FeedVendor extends FeedMoney { inputTokens: number; outputTokens: number }
export interface FeedMonth extends FeedMoney {
  month: string;
  vendors: Record<string, FeedVendor>;
  models: Record<string, FeedMoney>;
  purposes: Record<string, FeedMoney>;
}
export interface AiUsageFeed {
  schema: 1;
  portal: 'mis';
  usdInr: number;
  asOf: string;
  months: FeedMonth[];
  notes: string[];
}

// The MIS has no exchange-rate setting of its own; 88 ₹ / US$ is the figure the
// other Heatronics portals price with (see the contract). Change here, nowhere else.
export const USD_INR = 88;

export const FEED_MONTHS_DEFAULT = 6;
export const FEED_MONTHS_MAX = 24;

/** `months` query → 1..24, default 6. */
export function clampMonths(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return FEED_MONTHS_DEFAULT;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return FEED_MONTHS_DEFAULT;
  return Math.max(1, Math.min(FEED_MONTHS_MAX, n));
}

/** IST calendar month (YYYY-MM) of an instant. */
export function istMonth(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
}

/** First IST day (YYYY-MM-DD) of the month `months - 1` months before `now`'s IST month. */
export function feedFromDay(now: Date, months: number): string {
  const [y, m] = istMonth(now).split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1 - (months - 1), 1));
  return start.toISOString().slice(0, 10);
}

/** Vendor from the model name: gemini-* → gemini, everything else → claude. */
export function vendorOf(model: string): 'claude' | 'gemini' {
  return /^gemini/i.test(model) ? 'gemini' : 'claude';
}

const usd4 = (n: number) => Math.round(n * 1e4) / 1e4;
const inrOf = (usd: number, rate: number) => Math.round(usd * rate);

function bump(map: Record<string, FeedMoney>, key: string, usd: number): void {
  const m = (map[key] ??= { usd: 0, inr: 0, calls: 0 });
  m.usd += usd;
  m.calls += 1;
}

function finish(map: Record<string, FeedMoney>, rate: number): void {
  for (const m of Object.values(map)) {
    m.usd = usd4(m.usd);
    m.inr = inrOf(m.usd, rate);
  }
}

/**
 * Records → feed. Months newest first, a month with no calls omitted, at most
 * `months` entries counting back from `now`'s IST month. Records older than the
 * window are ignored (the reader usually pre-filters them).
 */
export function buildAiUsageFeed(
  records: FeedUsageRecord[],
  opts: { months?: number; now?: Date; usdInr?: number; notes?: string[] } = {},
): AiUsageFeed {
  const months = clampMonths(opts.months ?? FEED_MONTHS_DEFAULT);
  const now = opts.now ?? new Date();
  const rate = opts.usdInr ?? USD_INR;
  const fromMonth = feedFromDay(now, months).slice(0, 7);
  const toMonth = istMonth(now);

  const byMonth = new Map<string, FeedMonth>();
  for (const r of records) {
    const month = (r.day ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || month < fromMonth || month > toMonth) continue;
    let fm = byMonth.get(month);
    if (!fm) {
      fm = { month, usd: 0, inr: 0, calls: 0, vendors: {}, models: {}, purposes: {} };
      byMonth.set(month, fm);
    }
    const usd = Number(r.costUsd) || 0;
    const input = (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0);
    fm.usd += usd;
    fm.calls += 1;
    const v = (fm.vendors[vendorOf(r.model)] ??= { usd: 0, inr: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
    v.usd += usd;
    v.calls += 1;
    v.inputTokens += input;
    v.outputTokens += r.outputTokens || 0;
    bump(fm.models, r.model || 'unknown', usd);
    bump(fm.purposes, r.feature || 'other', usd);
  }

  const list = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
  for (const fm of list) {
    fm.usd = usd4(fm.usd);
    fm.inr = inrOf(fm.usd, rate);
    finish(fm.vendors as Record<string, FeedMoney>, rate);
    finish(fm.models, rate);
    finish(fm.purposes, rate);
  }

  return { schema: 1, portal: 'mis', usdInr: rate, asOf: now.toISOString(), months: list, notes: opts.notes ?? [] };
}
