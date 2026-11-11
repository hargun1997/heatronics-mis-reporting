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
//  4. A channel that sold in any of the previous 3 months (≥ 5 % of those
//     months' sales) with no sales data in the month is named as missing and
//     the month is not ready (soft: lockable with a written reason, since a
//     channel can really stop). Views show it as "no data", never ₹0.
// ----------------------------------------------------------------------------
import type { DailyFact } from '../liveMis/facts';
import type { SalesChannel } from './misDeckData';
import { SALES_CHANNELS } from './misDeckData';
import { connectorSales, type CloseTie } from './closeTies';
import { gstRateLabel, type NetBasis } from './gstBasis';
import { ALL_SLOTS } from '../ingest/catalog';
import type { BuiltMonth } from './liveDeck';
import { CHANNEL_FOLD } from './liveAnalytics';

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

export type BlockerKind = 'running' | 'no-tally' | 'tally-incomplete' | 'channel-missing' | 'stock' | 'tie' | 'slot';
export interface CloseBlocker {
  kind: BlockerKind;
  /** What is wrong, numbers first. */
  text: string;
  /** What to do. */
  fix: string;
  /** Hard = the month cannot be locked at all. Soft (tie, report) = can be locked with a written reason. */
  hard: boolean;
}

export interface StockCheck { opening: number; closing: number; purchases: number; /** Net sales of the month. */ sales?: number }
/** Closing stock was not valued: Tally prints closing = opening until it is posted. Only judged when the month bought or sold goods. */
export const stockNotPosted = (s: StockCheck | null | undefined): boolean =>
  !!s && (s.purchases > 0 || (s.sales ?? 0) > 0) && Math.abs(s.opening - s.closing) < 1 && (s.opening !== 0 || s.closing !== 0);

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
  if (a.periodKey >= a.thisMonth) out.push({ kind: 'running', text: 'The month is not over yet.', fix: 'Lock it after month end.', hard: true });
  if (!a.hasTally) {
    out.push({ kind: 'no-tally', hard: true,
      text: a.tallyIgnored ?? 'Tally P&L is not in yet.',
      fix: '1. Finish the month in Tally. 2. Go to Setup → Tally → Pull.' });
  } else if (!a.tallyHasSales) {
    out.push({ kind: 'no-tally', hard: true, text: 'Tally has no sales booked for this month.', fix: '1. Enter the sales of the month in Tally. 2. Go to Setup → Tally → Pull.' });
  }
  for (const g of a.gaps) {
    out.push({ kind: 'tally-incomplete', hard: true,
      text: `${g.channel}: ${inr(g.connector)} sold${BASIS_NOTE(g.basis)}, Tally has ${g.tally > 0 ? inr(g.tally) : g.tally < 0 ? `−${inr(g.tally)}` : 'no sales ledger'}.`,
      fix: `1. Enter the ${g.channel} sales in Tally. 2. Pull Tally again.` });
  }
  if (a.hasTally && stockNotPosted(a.stock)) {
    out.push({ kind: 'stock', hard: true,
      text: `Closing stock = opening stock (${inr(a.stock!.closing)}) with ${a.stock!.purchases > 0 ? `${inr(a.stock!.purchases)} of purchases` : `${inr(a.stock!.sales ?? 0)} of sales`}: closing stock not posted, profit is wrong.`,
      fix: '1. Post the closing stock in Tally (Tasks → Closing stock into Tally). 2. Pull Tally again.' });
  }
  if (a.hasTally && a.tallyHasSales && !a.gaps.length) {
    for (const b of a.tie?.breaches ?? []) out.push({ kind: 'tie', hard: false, text: `Does not tie: ${b}.`, fix: '1. Find the gap: a missing report or a ledger on the wrong line. 2. Fix it, or lock with a reason.' });
  }
  // Reports: one line per state so the list stays short (a running month is not judged: its reports are not due).
  if (a.periodKey < a.thisMonth) {
    const name = (list: SlotGap[]) => `${list.slice(0, 3).map((x) => x.label).join(', ')}${list.length > 3 ? ` +${list.length - 3} more` : ''}`;
    const missing = a.slots.filter((x) => x.state === 'missing');
    const empty = a.slots.filter((x) => x.state === 'empty');
    if (missing.length) out.push({ kind: 'slot', hard: false, text: `${missing.length} report${missing.length === 1 ? '' : 's'} missing: ${name(missing)}.`, fix: '1. On Setup, click Pull & save all for the month. 2. Upload the reports that have no API.' });
    if (empty.length) out.push({ kind: 'slot', hard: false, text: `${empty.length} report${empty.length === 1 ? '' : 's'} stored with no rows: ${name(empty)}.`, fix: 'On Setup, upload the correct file. If there were no sales, delete the empty report.' });
    for (const x of a.slots.filter((y) => y.state === 'partial')) out.push({ kind: 'slot', hard: false, text: `${x.label} ${x.detail}.`, fix: 'On Setup, pull or upload the full month.' });
  }
  return out;
}

// ---- 4. Channels that sold in the last 3 months -----------------------------------

/** Months looked back on, and the smallest monthly average that counts (below it a quiet month is normal). */
export const HISTORY_MONTHS = 3;
export const HISTORY_MIN_INR = 10_000;

export interface MissingChannel {
  channel: SalesChannel;
  /** Average monthly sales over the previous months that had data. */
  priorAvg: number;
  /** Months it was averaged over (YYYY-MM). */
  months: string[];
}

const prevKey = (k: string, n: number) => {
  const [y, m] = k.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Channels that sold in the previous HISTORY_MONTHS months (average ≥ 5 % of those months' sales and ≥ ₹10,000)
 * but have no sales (≤ 0) in this month. `history` = net sales by channel per month (the deck's months).
 */
export function missingChannels(periodKey: string, currentIn: Partial<Record<SalesChannel, number>>,
  historyIn: Map<string, Partial<Record<SalesChannel, number>>>): MissingChannel[] {
  // Published months say OEM / Offline, live months B2B / GT: compare on the folded names (CHANNEL_FOLD).
  const current = foldChannels(currentIn);
  const history = new Map([...historyIn].map(([k, v]) => [k, foldChannels(v)]));
  const prior = Array.from({ length: HISTORY_MONTHS }, (_, i) => prevKey(periodKey, i + 1)).filter((k) => history.has(k));
  if (!prior.length) return [];
  const avg = (ch: SalesChannel) => prior.reduce((s, k) => s + Math.max(0, history.get(k)![ch] ?? 0), 0) / prior.length;
  const total = SALES_CHANNELS.reduce((s, ch) => s + avg(ch), 0);
  const out: MissingChannel[] = [];
  for (const ch of SALES_CHANNELS) {
    const a = avg(ch);
    if (a < HISTORY_MIN_INR || a < MATERIAL_CHANNEL_SHARE * total) continue;
    if ((current[ch] ?? 0) > 0) continue;
    out.push({ channel: ch, priorAvg: r2(a), months: prior });
  }
  return out.sort((x, y) => y.priorAvg - x.priorAvg);
}

function foldChannels(v: Partial<Record<SalesChannel, number>>): Partial<Record<SalesChannel, number>> {
  const out: Partial<Record<SalesChannel, number>> = {};
  for (const ch of SALES_CHANNELS) if (v[ch] != null) { const to = CHANNEL_FOLD[ch] ?? ch; out[to] = (out[to] ?? 0) + (v[ch] ?? 0); }
  return out;
}

const monthName = (k: string) => `${MON[Number(k.slice(5, 7))]} ${k.slice(2, 4)}`;

/**
 * Rule 4 on the built live months, in place. History = the published month where there is one and the live month is
 * not full, else the live month. A channel already named by tallyGaps (the connectors saw it — that one is a hard
 * blocker) is not named twice. A channel with no data at all is a SOFT blocker: it may really have stopped (lumpy OEM),
 * so the month keeps its level and can be locked with a written reason. Locked months are left alone.
 */
export function applyChannelHistory(built: Map<string, BuiltMonth>,
  published: { key: string; netByChannel: Partial<Record<SalesChannel, number>> }[], locks: Record<string, unknown> = {}): void {
  const history = new Map<string, Partial<Record<SalesChannel, number>>>();
  for (const m of published) history.set(m.key, m.netByChannel);
  for (const [k, b] of built) if (b.completeness.level === 'full' || !history.has(k)) history.set(k, b.month.netByChannel);
  for (const [k, b] of built) {
    const c = b.completeness;
    if (c.locked || locks[k]) continue;
    const named = new Set((c.tallyGaps ?? []).map((g) => CHANNEL_FOLD[g.channel] ?? g.channel));
    const miss = missingChannels(k, b.month.netByChannel, history).filter((x) => !named.has(x.channel));
    if (!miss.length) continue;
    const blockers: CloseBlocker[] = miss.map((x) => ({
      kind: 'channel-missing', hard: false,
      text: `${x.channel} had no sales in ${monthName(k)} (${inr(x.priorAvg)} a month in ${x.months.length === 1 ? monthName(x.months[0]) : `the last ${x.months.length} months`}) — stopped, or not booked?`,
      fix: c.hasTally ? `If it stopped, lock with a written reason. If not, book the ${x.channel} sales in Tally and pull again.`
        : `If it stopped, ignore. If not, pull or upload the ${x.channel} report for the month on Setup.`,
    }));
    b.completeness = { ...c, missingChannels: miss, closeBlockers: [...(c.closeBlockers ?? []), ...blockers] };
  }
}

/** True when the month names this channel as missing (no data): views show "no data", not ₹0. */
export function channelNoData(c: { tallyGaps?: TallyGap[]; missingChannels?: MissingChannel[] } | null | undefined, ch: SalesChannel): boolean {
  if (!c) return false;
  const f = CHANNEL_FOLD[ch] ?? ch;
  return (c.tallyGaps ?? []).some((g) => g.tally <= 0 && (CHANNEL_FOLD[g.channel] ?? g.channel) === f)
    || (c.missingChannels ?? []).some((m) => m.channel === f);
}
