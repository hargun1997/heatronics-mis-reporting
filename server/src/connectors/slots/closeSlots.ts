// ----------------------------------------------------------------------------
// Close slots, server copy: label, required and how complete a stored report must be.
//
// The client catalog (client/src/data/ingest/catalog.ts) owns the slot list; this is the minimum the server needs for
// the Fix list ("which report is missing / empty / partial for which month") and the scheduled pull (autoPull.ts).
// Test `server/test/feedsAndPulls.test.ts` fails when the two lists differ (ids, label, required).
//
// Pure: no I/O.
// ----------------------------------------------------------------------------

/** First live month (client `LIVE_BOUNDARY`, liveDeck.ts; tested equal). Earlier months are frozen history. */
export const LIVE_BOUNDARY = '2026-04';

export interface CloseSlot {
  connectorId: string;
  slotId: string;
  /** The client catalog's slot label (also saved on a committed report). */
  label: string;
  /** Short name for the Fix list. */
  short: string;
  required: boolean;
  /**
   * How many days at the start / end of a month may have no rows before the report counts as partial.
   * null = no date check (one row a month, undated rows, or a source that is quiet on most days).
   */
  edgeDays: number | null;
}

export const CONNECTOR_NAME: Record<string, string> = {
  tally: 'Tally', tranzact: 'Tranzact', amazon: 'Amazon', flipkart: 'Flipkart', flipkartads: 'Flipkart Ads', blinkit: 'Blinkit',
  shopify: 'Shopify', meta: 'Meta Ads', googleads: 'Google Ads', amazonads: 'Amazon Ads', shiprocket: 'Shiprocket',
  delhivery: 'Delhivery', easebuzz: 'Easebuzz', shopflo: 'Shopflo', snapmint: 'Snapmint',
};

export const CLOSE_SLOTS: CloseSlot[] = [
  { connectorId: 'tally', slotId: 'pnl', label: 'Profit & Loss A/c (Excel)', short: 'P&L', required: true, edgeDays: null },
  { connectorId: 'tally', slotId: 'trial-balance', label: 'Trial Balance (optional)', short: 'Trial Balance', required: false, edgeDays: null },
  { connectorId: 'tranzact', slotId: 'bom', label: 'BOM pricing', short: 'BOM pricing', required: true, edgeDays: null },
  // GT / B2B invoices are not raised every day: only a wide gap counts (7–13 Oct = partial, 11–29 Apr = fine).
  { connectorId: 'tranzact', slotId: 'sales', label: 'Sales Invoice Register (GT / B2B)', short: 'Sales register', required: true, edgeDays: 12 },
  { connectorId: 'amazon', slotId: 'unified-transaction', label: 'Unified Transaction (settlement)', short: 'Settlement', required: true, edgeDays: 3 },
  { connectorId: 'amazon', slotId: 'business-report', label: 'Business Report (traffic, optional)', short: 'Business Report', required: false, edgeDays: null },
  { connectorId: 'flipkart', slotId: 'settlement', label: 'Settled Transactions', short: 'Settlement', required: true, edgeDays: 7 },
  { connectorId: 'flipkartads', slotId: 'ad-spend', label: 'Consolidated FSN ad report', short: 'Ad report', required: true, edgeDays: 5 },
  { connectorId: 'blinkit', slotId: 'order-charges', label: 'Payout — order-level charges', short: 'Payout', required: true, edgeDays: 3 },
  { connectorId: 'shopify', slotId: 'variant-sales', label: 'Sales by variant', short: 'Sales by variant', required: false, edgeDays: 3 },
  { connectorId: 'meta', slotId: 'ad-spend', label: 'Ad spend — campaign × ad set × product', short: 'Ad spend', required: true, edgeDays: 3 },
  { connectorId: 'googleads', slotId: 'ad-spend', label: 'Campaign report (total spend)', short: 'Campaign spend', required: true, edgeDays: 3 },
  { connectorId: 'googleads', slotId: 'shopping-products', label: 'Shopping products (per-item cost, optional)', short: 'Shopping products', required: false, edgeDays: null },
  { connectorId: 'amazonads', slotId: 'ad-spend', label: 'Advertised Product report', short: 'Ad spend', required: true, edgeDays: 3 },
  { connectorId: 'shiprocket', slotId: 'passbook', label: 'Wallet passbook', short: 'Freight', required: true, edgeDays: 3 },
  { connectorId: 'delhivery', slotId: 'wallet', label: 'Wallet report (warranty/returns freight)', short: 'Freight', required: true, edgeDays: null },
  { connectorId: 'easebuzz', slotId: 'settlement', label: 'Settlement / MDR', short: 'Settlement', required: true, edgeDays: 5 },
  { connectorId: 'shopflo', slotId: 'invoice', label: 'Checkout invoice (PDF or billing-history screenshot)', short: 'Invoice', required: true, edgeDays: null },
  { connectorId: 'snapmint', slotId: 'settlement', label: 'Settlement / subvention', short: 'Settlement', required: true, edgeDays: null },
];

export const closeSlot = (connectorId: string, slotId: string) => CLOSE_SLOTS.find((s) => s.connectorId === connectorId && s.slotId === slotId);

// ---- Months ----------------------------------------------------------------------

export const daysInMonth = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const prevMonthOf = (period: string) => { const [y, m] = period.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09" → "Sep 26". */
export const monthLabel = (period: string) => `${MON[Number(period.slice(5, 7)) - 1] ?? period} ${period.slice(2, 4)}`;

// ---- What a stored report holds ----------------------------------------------------

/** One committed report, reduced to what coverage needs (no figures). */
export interface StoredSlotReport {
  connectorId: string;
  slotId: string;
  periodKey: string;
  /** Rows of any kind the close can use: facts, BOM costs, ledger rows, Trial Balance rows. */
  rows: number;
  /** First / last dated fact inside the month (null = no dated fact). */
  first: string | null;
  last: string | null;
  /** Raw file name when known ("api-pull-…" = saved by a pull). */
  fileName?: string;
  savedAt?: string;
}

/** Reduce an extracted payload (objectStore ExtractedReport) to its coverage. */
export function storedSlotReport(r: { connectorId: string; slotId: string; periodKey: string; payload: unknown }): StoredSlotReport {
  const p = (r.payload ?? {}) as { facts?: unknown; bomCosts?: unknown; ledgerRows?: unknown; trialBalance?: { rows?: unknown } | null; invoice?: unknown };
  const facts = Array.isArray(p.facts) ? (p.facts as { date?: unknown }[]) : [];
  const dates = facts.map((f) => (typeof f?.date === 'string' ? f.date : '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.slice(0, 7) === r.periodKey).sort();
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const rows = facts.length + len(p.bomCosts) + len(p.ledgerRows) + len(p.trialBalance?.rows) + (p.invoice && typeof p.invoice === 'object' ? 1 : 0);
  return { connectorId: r.connectorId, slotId: r.slotId, periodKey: r.periodKey, rows, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null };
}

export type CoverageKind = 'ok' | 'missing' | 'empty' | 'partial';
export interface Coverage { kind: CoverageKind; /** Plain words, e.g. "only 5–23 Sep". */ detail: string }

/** Is one slot's stored report enough for a finished month? */
export function slotCoverage(slot: CloseSlot, period: string, report: StoredSlotReport | undefined): Coverage {
  const m = monthLabel(period);
  if (!report) return { kind: 'missing', detail: `${m} missing` };
  if (report.rows === 0) return { kind: 'empty', detail: `${m} has 0 rows` };
  if (slot.edgeDays != null && report.first && report.last) {
    const dim = daysInMonth(period);
    const a = Number(report.first.slice(8, 10));
    const b = Number(report.last.slice(8, 10));
    if (a > slot.edgeDays || b < dim - slot.edgeDays) {
      return { kind: 'partial', detail: `${m} covers ${a}–${b} ${m.slice(0, 3)} only` };
    }
  }
  return { kind: 'ok', detail: '' };
}

export interface SlotProblem { slot: CloseSlot; period: string; kind: Exclude<CoverageKind, 'ok'>; detail: string }

/**
 * Month each slot starts being checked: its first stored report, else its connector's first stored report (a slot
 * added later), else null (connector never loaded: every month is checked, the caller marks it low). Months before a
 * source was in use are not nagged (review of PR #405: Shopflo stored from Aug was flagged for Apr–Jul).
 */
export function slotStarts(reports: StoredSlotReport[]): (slot: CloseSlot) => string | null {
  const first = new Map<string, string>();
  const keep = (k: string, p: string) => { const c = first.get(k); if (!c || p < c) first.set(k, p); };
  for (const r of reports) { keep(`${r.connectorId}|${r.slotId}`, r.periodKey); keep(r.connectorId, r.periodKey); }
  return (slot) => first.get(`${slot.connectorId}|${slot.slotId}`) ?? first.get(slot.connectorId) ?? null;
}

/**
 * Every slot × unlocked month (LIVE_BOUNDARY … last finished month) whose stored report is missing, empty or partial,
 * from the slot's first stored month on (`slotStarts`). `today` = YYYY-MM-DD in IST.
 */
export function slotProblems(x: { today: string; reports: StoredSlotReport[]; locked?: Set<string>; from?: string }): SlotProblem[] {
  const last = prevMonthOf(x.today.slice(0, 7));
  const from = x.from ?? LIVE_BOUNDARY;
  if (last < from) return [];
  const by = new Map(x.reports.map((r) => [`${r.connectorId}|${r.slotId}|${r.periodKey}`, r]));
  const startOf = slotStarts(x.reports);
  const out: SlotProblem[] = [];
  for (const period of monthRange(from, last)) {
    if (x.locked?.has(period)) continue;
    for (const slot of CLOSE_SLOTS) {
      const start = startOf(slot);
      if (start && period < start) continue;
      const c = slotCoverage(slot, period, by.get(`${slot.connectorId}|${slot.slotId}|${period}`));
      if (c.kind !== 'ok') out.push({ slot, period, kind: c.kind, detail: c.detail });
    }
  }
  return out;
}
