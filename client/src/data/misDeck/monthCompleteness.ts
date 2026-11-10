// ----------------------------------------------------------------------------
// Is a month's Tally copy usable, complete, and is the month ready to lock?
// (audit 10 Nov 2026, rounds 1 / 4 / 5). Pure rules — tests in
// server/test/monthCompleteness.test.ts.
//
//  1. A Tally copy with no sales ledger (only the opening / closing stock
//     carry-forward) is not a close: when the connectors saw sales, the month
//     is built from the connector facts (ex-GST), not shown as ₹0.
//  2. "Full Tally" = every channel with material connector sales that month has
//     a Tally sales ledger > 0 that covers at least half of them. Otherwise the
//     month is "Tally incomplete" and the missing channels are named.
//  3. "Ready to lock" = full Tally AND ties within 1 % AND closing stock posted
//     AND no required report missing / empty / partial AND the month is over.
//     Anything else is a named blocker.
// ----------------------------------------------------------------------------
import type { DailyFact } from '../liveMis/facts';
import type { SalesChannel } from './misDeckData';
import { SALES_CHANNELS } from './misDeckData';
import { connectorSales, type CloseTie } from './closeTies';
import { gstRateLabel, type NetBasis } from './gstBasis';
import { ALL_SLOTS } from '../ingest/catalog';

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
const MON = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A channel counts when its connector sales are at least this share of the month (max of Tally net revenue and connector sales). */
export const MATERIAL_CHANNEL_SHARE = 0.05;
/** Tally's channel ledger must hold at least this share of what the connector saw (the 1 % tie judges the rest). */
export const TALLY_MIN_COVER = 0.5;
/** A report is partial when its dated rows leave more than this many days uncovered at either end of the month. */
export const SLOT_EDGE_DAYS = 6;

// ---- 1. Does the Tally copy hold any sales? -----------------------------------

/** True when any channel sales ledger is non-zero. A stock carry-forward copy has none. */
export function tallyHasSalesLedger(netByChannel: Partial<Record<SalesChannel, number>>): boolean {
  return SALES_CHANNELS.some((ch) => Math.abs(netByChannel[ch] ?? 0) >= 1);
}

/** Connector sales ex-GST for the month, all channels. */
export function connectorSalesTotal(facts: DailyFact[]): number {
  let t = 0;
  for (const a of connectorSales(facts).values()) t += a.net;
  return r2(t);
}

// ---- 2. Is the Tally copy complete? -------------------------------------------

export interface TallyGap {
  channel: SalesChannel;
  /** Connector sales ex-GST. */
  connector: number;
  basis: NetBasis;
  sources: string[];
  /** Tally's sales ledger for the channel (0 = no ledger). */
  tally: number;
}

/** Channels the connectors sold on that Tally has not booked (or has booked under half of). Empty = complete. */
export function tallyGaps(netByChannel: Partial<Record<SalesChannel, number>>, netRevenue: number, facts: DailyFact[]): TallyGap[] {
  const sales = connectorSales(facts);
  let total = 0;
  for (const a of sales.values()) total += Math.max(0, a.net);
  const base = Math.max(netRevenue, total);
  if (base <= 0) return [];
  const out: TallyGap[] = [];
  for (const ch of SALES_CHANNELS) {
    const a = sales.get(ch);
    if (!a || a.net < MATERIAL_CHANNEL_SHARE * base) continue;
    const tally = r2(netByChannel[ch] ?? 0);
    if (tally > 0 && tally >= TALLY_MIN_COVER * a.net) continue;
    out.push({
      channel: ch, connector: r2(a.net), tally, sources: [...a.sources].sort(),
      basis: a.basis.has('estimated') ? 'estimated' : a.basis.has('booked') && !a.basis.has('reported') ? 'booked' : 'reported',
    });
  }
  return out.sort((x, y) => y.connector - x.connector);
}

// ---- 3a. Required reports -----------------------------------------------------

export interface SlotReport { connectorId: string; slotId: string; periodKey: string; payload?: { facts?: DailyFact[]; ledgerRows?: unknown[]; bomCosts?: unknown[] } }
export interface SlotGap { connectorId: string; slotId: string; label: string; state: 'missing' | 'empty' | 'partial'; detail: string }

const CONNECTOR_NAME: Record<string, string> = { googleads: 'Google Ads', amazonads: 'Amazon Ads', flipkartads: 'Flipkart Ads' };

/** Slots judged per month: required in the catalog, except the Tally P&L (rules 1–2) and the BOM (priced with the nearest month, shown apart). */
const JUDGED_SLOTS = ALL_SLOTS.filter((s) => s.required && s.connectorId !== 'tally' && !(s.connectorId === 'tranzact' && s.slotId === 'bom'));

/**
 * Required reports that are missing, empty or partial for a month. A slot is expected from the first month it was
 * ever stored (a feed never used — Snapmint, Easebuzz — is Setup's job, not a blocker for every month).
 */
export function slotGaps(periodKey: string, reports: SlotReport[]): SlotGap[] {
  const out: SlotGap[] = [];
  const [y, m] = periodKey.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (const s of JUDGED_SLOTS) {
    const mine = reports.filter((r) => r.connectorId === s.connectorId && r.slotId === s.slotId && /^\d{4}-\d{2}$/.test(r.periodKey));
    if (!mine.length) continue;
    const first = mine.map((r) => r.periodKey).sort()[0];
    if (periodKey < first) continue;
    const everHadRows = mine.some((r) => (r.payload?.facts?.length ?? 0) > 0);
    const label = `${CONNECTOR_NAME[s.connectorId] ?? `${s.connectorId[0].toUpperCase()}${s.connectorId.slice(1)}`} ${s.label.replace(/\s*\(.*\)$/, '').replace(/ — .*$/, '').toLowerCase()}`;
    const base = { connectorId: s.connectorId, slotId: s.slotId, label };
    const here = mine.filter((r) => r.periodKey === periodKey);
    if (!here.length) { if (everHadRows) out.push({ ...base, state: 'missing', detail: 'not stored' }); continue; }
    const facts = here.flatMap((r) => r.payload?.facts ?? []);
    if (!facts.length) { out.push({ ...base, state: 'empty', detail: 'stored with no rows' }); continue; }
    const dates = [...new Set(facts.map((f) => f.date).filter((d): d is string => !!d && d.startsWith(periodKey)))].sort();
    if (dates.length < 2) continue; // one dated row = a month lump, cover can't be judged
    const from = Number(dates[0].slice(8, 10)); const to = Number(dates[dates.length - 1].slice(8, 10));
    if (from - 1 > SLOT_EDGE_DAYS || days - to > SLOT_EDGE_DAYS) out.push({ ...base, state: 'partial', detail: `covers ${from}–${to} ${MON[m]} only` });
  }
  return out;
}

// ---- 3b. Blockers -------------------------------------------------------------

export type BlockerKind = 'running' | 'no-tally' | 'tally-incomplete' | 'stock' | 'tie' | 'slot';
export interface CloseBlocker {
  kind: BlockerKind;
  /** What is wrong, numbers first. */
  text: string;
  /** What to do. */
  fix: string;
  /** Hard = the month cannot be locked at all. Soft (tie, report) = can be locked with a written reason. */
  hard: boolean;
}

export interface StockCheck { opening: number; closing: number; purchases: number }
/** Closing stock was not valued: Tally prints closing = opening until it is posted. Only judged when the month bought material. */
export const stockNotPosted = (s: StockCheck | null | undefined): boolean =>
  !!s && s.purchases > 0 && Math.abs(s.opening - s.closing) < 1 && (s.opening !== 0 || s.closing !== 0);

const BASIS_NOTE = (b: NetBasis) => (b === 'estimated' ? ` (ex-GST estimated at ${gstRateLabel()})` : '');

/** The short list shown on the Month close panel and as Fix items. Empty = ready to lock. */
export function closeBlockers(a: {
  periodKey: string;
  /** Current month (IST), YYYY-MM. */
  thisMonth: string;
  hasTally: boolean;
  /** Set when a Tally copy exists but was not used (rule 1). */
  tallyIgnored?: string | null;
  tallyHasSales: boolean;
  gaps: TallyGap[];
  tie?: CloseTie | null;
  stock?: StockCheck | null;
  slots: SlotGap[];
}): CloseBlocker[] {
  const out: CloseBlocker[] = [];
  if (a.periodKey >= a.thisMonth) out.push({ kind: 'running', text: 'The month is not over yet.', fix: 'Close it after month end.', hard: true });
  if (!a.hasTally) {
    out.push({ kind: 'no-tally', hard: true,
      text: a.tallyIgnored ?? 'Tally P&L is not in yet.',
      fix: 'Finish the month in Tally, then Setup → Tally → Pull now.' });
  } else if (!a.tallyHasSales) {
    out.push({ kind: 'no-tally', hard: true, text: 'Tally has no sales booked for this month.', fix: 'Book the month’s sales in Tally, then Setup → Tally → Pull now.' });
  }
  for (const g of a.gaps) {
    out.push({ kind: 'tally-incomplete', hard: true,
      text: `${g.channel}: ${inr(g.connector)} sold${BASIS_NOTE(g.basis)}, Tally has ${g.tally > 0 ? inr(g.tally) : g.tally < 0 ? `−${inr(g.tally)}` : 'no sales ledger'}.`,
      fix: `Book the ${g.channel} sales in Tally, then pull Tally again.` });
  }
  if (a.hasTally && stockNotPosted(a.stock)) {
    out.push({ kind: 'stock', hard: true,
      text: `Closing stock = opening stock (${inr(a.stock!.closing)}) with ${inr(a.stock!.purchases)} of purchases: stock is not valued, profit is overstated.`,
      fix: 'Post the closing stock in Tally (Tasks → Closing stock into Tally), then pull Tally again.' });
  }
  if (a.hasTally && a.tallyHasSales && !a.gaps.length) {
    for (const b of a.tie?.breaches ?? []) out.push({ kind: 'tie', hard: false, text: `Does not tie: ${b}.`, fix: 'Find the gap (a missing report, a ledger on the wrong line) or lock with a written reason.' });
  }
  // Reports: one line per state so the list stays short (a running month is not judged: its reports are not due).
  if (a.periodKey < a.thisMonth) {
    const name = (list: SlotGap[]) => `${list.slice(0, 3).map((x) => x.label).join(', ')}${list.length > 3 ? ` +${list.length - 3} more` : ''}`;
    const missing = a.slots.filter((x) => x.state === 'missing');
    const empty = a.slots.filter((x) => x.state === 'empty');
    if (missing.length) out.push({ kind: 'slot', hard: false, text: `${missing.length} report${missing.length === 1 ? '' : 's'} missing: ${name(missing)}.`, fix: 'Setup → Pull & save all for the month, then upload the manual ones.' });
    if (empty.length) out.push({ kind: 'slot', hard: false, text: `${empty.length} report${empty.length === 1 ? '' : 's'} stored with no rows: ${name(empty)}.`, fix: 'Setup: upload the right file, or delete the empty one if there were no sales.' });
    for (const x of a.slots.filter((y) => y.state === 'partial')) out.push({ kind: 'slot', hard: false, text: `${x.label} ${x.detail}.`, fix: 'Setup: pull or upload the full month.' });
  }
  return out;
}
