// Issues inbox (server half): everything that needs a person, in one list with a live count — books (Tally health checks,
// hanging ledgers, a Trial Balance that doesn't tie), feeds (Tally not reached, a manual report not in for last month) and
// the cross-month anomaly scan. The browser adds the Live MIS items it already computes (tie breaches, unmapped products,
// products without a BOM, a month ready to lock) and both sides share one open / done / snoozed store (`issues/state`).
// Each item has a stable id and a `sig` (what it says now): "Done" holds until the sig changes, then it reopens.
import { createHash } from 'node:crypto';
import type { ChartReport, HangKind } from '../connectors/tally/chart.js';
import { HANG_LABEL } from '../connectors/tally/chart.js';
import type { HealthReport } from '../connectors/tally/books.js';
import { CONNECTOR_NAME, monthLabel, prevMonthOf, slotProblems, type SlotProblem, type StoredSlotReport } from '../connectors/slots/closeSlots.js';

export type InboxArea = 'books' | 'mis' | 'feeds' | 'products' | 'close';
export type InboxSeverity = 'high' | 'medium' | 'low';
export interface InboxItem {
  id: string;
  area: InboxArea;
  severity: InboxSeverity;
  title: string;
  detail: string;
  /** What to do, in one line. */
  fix: string;
  /** Where to fix it in the MIS. */
  href: string;
  count?: number;
  period?: string;
  sig: string;
}
export type IssueStatus = 'done' | 'snoozed';
export interface IssueStateEntry { status: IssueStatus; sig: string; until?: string; by: string; at: string; note?: string }
export type IssueState = Record<string, IssueStateEntry>;

export const AREA_LABEL: Record<InboxArea, string> = { books: 'Books (Tally)', mis: 'MIS numbers', feeds: 'Feeds', products: 'Products', close: 'Month close' };

export const sigOf = (...parts: unknown[]) => createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12);

/** Manual-upload slots the close needs every month (no API). */
export const MANUAL_SLOTS: { connectorId: string; slotId: string; label: string; dueDay: number }[] = [
  { connectorId: 'flipkart', slotId: 'settlement', label: 'Flipkart settled transactions', dueDay: 10 },
  { connectorId: 'flipkartads', slotId: 'ad-spend', label: 'Flipkart Ads FSN report', dueDay: 10 },
  { connectorId: 'blinkit', slotId: 'order-charges', label: 'Blinkit payout', dueDay: 10 },
  { connectorId: 'snapmint', slotId: 'settlement', label: 'Snapmint settlement', dueDay: 10 },
  { connectorId: 'shopflo', slotId: 'invoice', label: 'Shopflo invoice', dueDay: 10 },
];

export const prevMonth = (istDay: string) => { const [y, m] = istDay.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

export interface InboxInputs {
  /** YYYY-MM-DD in IST. */
  today: string;
  health: HealthReport | null;
  chart: ChartReport | null;
  /** Newest stored Trial Balance (Dr − Cr difference). */
  tb: { period: string; difference: number } | null;
  tally: { connected: boolean; lastOkAt: string | null; lastError: string | null } | null;
  /** connector|slot|period keys of every committed report. */
  committed: Set<string>;
  /** Connectors that were ever committed for any month (a channel not started yet isn't nagged). */
  everUsed: Set<string>;
  anomalies: { id: string; severity: InboxSeverity; category: string; period: string; title: string; detail: string }[];
  /**
   * Every committed report reduced to its coverage (rows, first / last date). Given = the full check: every close slot,
   * every unlocked month from LIVE_BOUNDARY to last month, missing / empty / partial. Absent = the old last-month check.
   */
  reports?: StoredSlotReport[];
  /** Locked months (YYYY-MM): closed, never nagged. */
  locked?: Set<string>;
  /** How each slot is fed ("connector|slot" → source + whether its pull is connected). */
  slotFeeds?: Record<string, { source: 'api' | 'sheet' | 'claude_task' | 'upload'; connected: boolean; connectHint?: string | null }>;
  /** Live sources (/api/connectors/facts): age of this month's copy + the last refresh error while it is still failing. */
  liveFacts?: { id: string; label: string; cachedAt: string | null; error: string | null; errorAt: string | null }[];
}

/** Flipkart refuses its API until the self-access app is approved: a wait, not a fault. */
export const FLIPKART_WAITING = /not in approved state|not approved|approval pending/i;
const LIVE_STALE_H = 2; // older than the slowest refresh window (closed months refresh daily: their items show ≥ 1 day)

/** Close reports missing / empty / partial: one item per connector, months listed, with the action. */
export function slotItems(x: Pick<InboxInputs, 'today' | 'reports' | 'locked' | 'slotFeeds'>): InboxItem[] {
  if (!x.reports) return [];
  const problems = slotProblems({ today: x.today, reports: x.reports, locked: x.locked });
  const used = new Set(x.reports.filter((r) => r.rows > 0).map((r) => r.connectorId));
  const last = prevMonthOf(x.today.slice(0, 7));
  const day = Number(x.today.slice(8, 10));
  const byConnector = new Map<string, SlotProblem[]>();
  for (const p of problems) (byConnector.get(p.slot.connectorId) ?? byConnector.set(p.slot.connectorId, []).get(p.slot.connectorId)!).push(p);
  const out: InboxItem[] = [];
  for (const [cid, list] of byConnector) {
    const name = CONNECTOR_NAME[cid] ?? cid;
    const months = [...new Set(list.map((p) => p.period))].sort();
    const neverUsed = !used.has(cid);
    const anyStored = x.reports.some((r) => r.connectorId === cid);
    const feeds = list.map((p) => x.slotFeeds?.[`${cid}|${p.slot.slotId}`]);
    const auto = feeds.some((f) => f && f.source !== 'upload');
    const notConnected = feeds.find((f) => f && f.source !== 'upload' && !f.connected);
    const manual = feeds.some((f) => !f || f.source === 'upload');
    // Severity: a required report missing for a finished month the close needs = high; partial / empty = medium;
    // a connector never loaded, optional slots, or last month before the 10th = low.
    const req = list.filter((p) => p.slot.required);
    const overdue = req.some((p) => p.kind === 'missing' && (p.period < last || day > 10));
    const severity: InboxSeverity = neverUsed || req.length === 0 ? 'low' : overdue ? 'high' : req.some((p) => p.period < last || day > 3) ? 'medium' : 'low';
    // Detail: per slot, newest month first ("Payout: Oct 26 not loaded; Sep 26 has only 5–23 Sep.")
    const bySlot = new Map<string, SlotProblem[]>();
    for (const p of list) (bySlot.get(p.slot.slotId) ?? bySlot.set(p.slot.slotId, []).get(p.slot.slotId)!).push(p);
    const detail = [...bySlot.values()].map((ps) => {
      const sorted = [...ps].sort((a, b) => b.period.localeCompare(a.period));
      const shown = sorted.slice(0, 6).map((p) => p.detail).join('; ');
      return `${ps[0].slot.short}${ps[0].slot.required ? '' : ' (optional)'}: ${shown}${sorted.length > 6 ? `; and ${sorted.length - 6} more` : ''}.`;
    }).join(' ');
    const fixes: string[] = [];
    if (auto && notConnected) fixes.push(notConnected.connectHint || 'Connect it on Setup first.');
    if (auto && !notConnected) fixes.push(`Setup → ${name} → Pull now for each month (the daily auto-pull also tries last month and this month).`);
    if (manual) fixes.push(cid.startsWith('flipkart')
      ? `Download the report from Flipkart Seller Hub and upload it on Setup → ${name} (the Flipkart API is waiting for approval).`
      : `Download the report and upload it on Setup → ${name}.`);
    if (list.some((p) => p.kind === 'empty')) fixes.push('A month with really no activity: mark this Done.');
    if (neverUsed) fixes.push(`If ${name} is not in use, mark this Done.`);
    const monthsText = months.length <= 4 ? months.map(monthLabel).join(', ') : `${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`;
    out.push({
      id: `slot:${cid}`, area: 'feeds', severity, period: months[months.length - 1], count: list.length,
      title: neverUsed && !anyStored ? `${name}: never loaded (${months.length} month${months.length === 1 ? '' : 's'})` : `${name}: ${months.length} month${months.length === 1 ? '' : 's'} not complete (${monthsText})`,
      detail, fix: fixes.join(' '), href: `/reporting/mis/connectors?view=uploads#${cid}`,
      // Stable per set of missing (slot, month) pairs: Done holds until a new pair goes missing.
      sig: sigOf(list.map((p) => `${p.slot.slotId}|${p.period}`).sort()),
    });
  }
  return out;
}

/** Live sources whose refresh keeps failing: the page shows the last good copy, so say how old it is and why. */
export function liveFactItems(x: Pick<InboxInputs, 'today' | 'liveFacts'>, nowMs = Date.parse(`${x.today}T12:00:00+05:30`)): InboxItem[] {
  const out: InboxItem[] = [];
  for (const s of x.liveFacts ?? []) {
    if (!s.error) continue;
    if (s.id === 'flipkart' && FLIPKART_WAITING.test(s.error)) {
      out.push({ id: 'live:flipkart', area: 'feeds', severity: 'low', title: 'Flipkart live feed: waiting for Flipkart approval',
        detail: 'Flipkart has not approved the self-access app yet, so it gives no live orders.',
        fix: 'Flipkart Seller Hub → Manage Profile → Developer Access: approve / resubmit the app. Until then upload the settlement report.',
        href: '/reporting/mis/connectors?view=uploads#flipkart', sig: 'waiting' });
      continue;
    }
    if (!s.cachedAt) continue; // no copy at all: the page already shows the source as failed
    const hours = (nowMs - Date.parse(s.cachedAt)) / 3_600_000;
    if (!(hours > LIVE_STALE_H)) continue;
    const days = Math.floor(hours / 24);
    const age = days >= 1 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.floor(hours)} hours`;
    out.push({ id: `live:${s.id}`, area: 'feeds', severity: days >= 3 ? 'high' : days >= 1 ? 'medium' : 'low',
      title: `${s.label} live numbers are ${age} old`,
      detail: `The refresh keeps failing, so Live MIS shows the last good copy. Error: ${s.error.slice(0, 200)}`,
      fix: 'Open Live MIS and press Refresh. If it fails again, check the connector on Setup (login / token).',
      href: `/reporting/mis/connectors?view=uploads#${s.id}`, sig: sigOf(s.error.slice(0, 60), Math.min(days, 3)) });
  }
  return out;
}

const SEV_HEALTH = { error: 'high', warn: 'medium', info: 'low' } as const;
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

export function serverItems(x: InboxInputs): InboxItem[] {
  const out: InboxItem[] = [];
  // Books: Tally health checks over the stored Day Books
  for (const i of x.health?.issues ?? []) {
    out.push({ id: `tally:${i.id}`, area: 'books', severity: SEV_HEALTH[i.severity], title: i.title, detail: i.why, fix: i.fix, href: '/tally?tab=issues', count: i.count, sig: sigOf(i.count, i.samples.slice(0, 3).map((s) => s.number || s.ledger || s.detail)) });
  }
  // Books: hanging ledgers, one item per kind
  if (x.chart) {
    const byKind = new Map<HangKind, number>();
    for (const h of x.chart.hanging) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
    for (const [kind, n] of byKind) {
      const names = x.chart.hanging.filter((h) => h.kind === kind);
      const sugg = names.filter((h) => h.suggest).length;
      out.push({
        id: `chart:${kind}`, area: 'books', severity: kind === 'channel_mismatch' || kind === 'no_group' ? 'high' : 'medium',
        title: `${n} ledger${n === 1 ? '' : 's'} hanging: ${HANG_LABEL[kind].toLowerCase()}`,
        detail: `${names.slice(0, 4).map((h) => h.ledger).join(', ')}${n > 4 ? ` and ${n - 4} more` : ''}. ${sugg} have a suggested group.`,
        fix: 'Open the chart, check each suggested group, then move it in TallyPrime (Alt+G → Alter → Ledger → Under).',
        href: '/tally?tab=chart', count: n, sig: sigOf(names.map((h) => h.ledger).sort()),
      });
    }
  }
  // Books: TB doesn't tie
  if (x.tb && Math.abs(x.tb.difference) >= 1) {
    out.push({ id: `tb:${x.tb.period}`, area: 'books', severity: 'high', period: x.tb.period, title: `Trial Balance for ${x.tb.period} doesn't tie (${inr(x.tb.difference)})`,
      detail: 'Debits and credits differ in the copy Tally gave. Usually an opening-balance difference or a ledger with a broken parent.',
      fix: 'In TallyPrime open Trial Balance for the month; the "Difference in opening balances" line names it. Fix the opening, then Pull Tally now.',
      href: '/reporting/mis/live', sig: sigOf(Math.round(x.tb.difference)) });
  }
  // Feeds: Tally not reached lately (it only answers while TallyPrime is open on the cloud machine)
  if (x.tally?.connected) {
    const age = x.tally.lastOkAt ? (Date.parse(`${x.today}T12:00:00+05:30`) - Date.parse(x.tally.lastOkAt)) / 86_400_000 : Infinity;
    if (age > 3) out.push({ id: 'feed:tally', area: 'feeds', severity: age > 10 ? 'high' : 'medium',
      title: `Tally not reached for ${Number.isFinite(age) ? `${Math.floor(age)} days` : 'ever'}`,
      detail: x.tally.lastError ? `Last try: ${x.tally.lastError.slice(0, 160)}` : 'No answer from the cloud machine.',
      fix: 'Open TallyPrime on the cloud machine with the company loaded; the next 30-minute check picks it up (or Tally health → Pull Tally now).',
      href: '/tally', sig: sigOf(Math.floor(age / 7)) });
  } else if (x.tally && !x.tally.connected) {
    out.push({ id: 'feed:tally', area: 'feeds', severity: 'high', title: 'Tally not connected', detail: 'No host / port saved for the Tally connector.', fix: 'Add the Tally host and port on Setup (Tally card).', href: '/reporting/mis/connectors', sig: 'nc' });
  }
  // Feeds: close reports. With the stored reports' coverage: every slot × unlocked month (missing / empty / partial).
  if (x.reports) out.push(...slotItems(x));
  else {
    // Old check (no coverage given): the manual reports for last month.
    const last = prevMonth(x.today);
    const day = Number(x.today.slice(8, 10));
    for (const s of MANUAL_SLOTS) {
      if (!x.everUsed.has(s.connectorId)) continue;
      if (x.committed.has(`${s.connectorId}|${s.slotId}|${last}`)) continue;
      out.push({ id: `upload:${s.connectorId}:${s.slotId}:${last}`, area: 'feeds', severity: day > s.dueDay ? 'medium' : 'low', period: last,
        title: `${s.label} for ${last} not uploaded`, detail: 'No API for this report: it comes in by hand.',
        fix: `Download it from the channel and drop it on the ${s.label} slot.`, href: `/reporting/mis/connectors?view=uploads#${s.connectorId}`, sig: 'missing' });
    }
  }
  // Feeds: a live source whose refresh keeps failing (the copy shown is old)
  out.push(...liveFactItems(x));
  // MIS numbers: cross-month anomaly scan
  // (future months are skipped — a month that hasn't happened can't be wrong yet — and the same check over several months is one item)
  const thisMonth = x.today.slice(0, 7);
  const RANK = { high: 0, medium: 1, low: 2 } as const;
  const scan = new Map<string, InboxInputs['anomalies']>();
  for (const a of x.anomalies) {
    if (a.period && a.period.slice(0, 7) > thisMonth) continue;
    const list = scan.get(a.title) ?? [];
    list.push(a); scan.set(a.title, list);
  }
  for (const [title, list] of scan) {
    const months = [...new Set(list.map((a) => a.period).filter(Boolean))].sort().reverse();
    const worst = list.reduce((w, a) => (RANK[a.severity] < RANK[w.severity] ? a : w), list[0]);
    const newest = list.find((a) => a.period === months[0]) ?? list[0];
    out.push({ id: `scan:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`, area: 'mis', severity: worst.severity, period: months[0],
      title: months.length > 1 ? `${title} (${months.length} months)` : title,
      detail: months.length > 1 ? `${months.join(', ')}. Newest: ${newest.detail}` : newest.detail,
      fix: 'Check the month on Live MIS; re-pull or re-upload the report behind it.', href: months[0] ? `/reporting/mis/live?month=${months[0]}` : '/reporting/mis/live',
      count: months.length > 1 ? months.length : undefined, sig: sigOf(months) });
  }
  return out;
}

/** Open = not done (with the same sig) and not snoozed past now. */
export function openItems(items: InboxItem[], state: IssueState, nowIso: string): InboxItem[] {
  return items.filter((i) => {
    const s = state[i.id];
    if (!s) return true;
    if (s.status === 'done') return s.sig !== i.sig;
    return !(s.until && s.until > nowIso);
  });
}

export function applyIssueOp(state: IssueState, op: { op: 'done' | 'snooze' | 'reopen'; id: string; sig: string; days?: number; note?: string }, by: string, nowIso: string): IssueState {
  const next = { ...state };
  if (op.op === 'reopen') { delete next[op.id]; return next; }
  if (op.op === 'done') next[op.id] = { status: 'done', sig: op.sig, by, at: nowIso, ...(op.note ? { note: op.note.slice(0, 300) } : {}) };
  else next[op.id] = { status: 'snoozed', sig: op.sig, until: new Date(Date.parse(nowIso) + Math.min(30, Math.max(1, op.days ?? 7)) * 86_400_000).toISOString(), by, at: nowIso };
  return next;
}
