// Issues inbox (server half): everything that needs a person, in one list with a live count — books (Tally health checks,
// hanging ledgers, a Trial Balance that doesn't tie), feeds (Tally not reached, a manual report not in for last month) and
// the cross-month anomaly scan. The browser adds the Live MIS items it already computes (tie breaches, unmapped products,
// products without a BOM, a month ready to lock) and both sides share one open / done / snoozed store (`issues/state`).
// Each item has a stable id and a `sig` (what it says now): "Done" holds until the sig changes, then it reopens.
import { createHash } from 'node:crypto';
import type { ChartReport, HangKind } from '../connectors/tally/chart.js';
import { HANG_LABEL } from '../connectors/tally/chart.js';
import type { HealthReport } from '../connectors/tally/books.js';

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
  /** Months whose two stored P&L copies (poll snapshot vs committed report) differ in Nett Profit by > ₹1,000 (pnlCopies.ts). */
  pnlGaps?: { period: string; snapshot: number; committed: number; gap: number; newer: 'snapshot' | 'committed' }[];
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
  // Books: the two stored P&L copies of a month disagree (Live MIS reads the committed one, statements / MCP the newer one)
  for (const g of x.pnlGaps ?? []) {
    out.push({ id: `pnl-copies:${g.period}`, area: 'books', severity: 'medium', period: g.period,
      title: `${g.period}: two Tally P&L copies differ by ${inr(g.gap)}`,
      detail: `Nett Profit ${inr(g.snapshot)}${g.snapshot < 0 ? ' loss' : ''} in the stored poll copy vs ${inr(g.committed)}${g.committed < 0 ? ' loss' : ''} in the committed close report. Live MIS uses the committed one; statements and the CEO summary use the ${g.newer === 'committed' ? 'committed (newer)' : 'poll (newer)'} copy.`,
      fix: 'Pull Tally now, then re-pull the Tally P&L slot for the month and save it, so both copies match.',
      href: '/reporting/mis/connectors?view=uploads#tally', sig: sigOf(g.snapshot, g.committed) });
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
  // Feeds: manual reports for last month
  const last = prevMonth(x.today);
  const day = Number(x.today.slice(8, 10));
  for (const s of MANUAL_SLOTS) {
    if (!x.everUsed.has(s.connectorId)) continue;
    if (x.committed.has(`${s.connectorId}|${s.slotId}|${last}`)) continue;
    out.push({ id: `upload:${s.connectorId}:${s.slotId}:${last}`, area: 'feeds', severity: day > s.dueDay ? 'medium' : 'low', period: last,
      title: `${s.label} for ${last} not uploaded`, detail: 'No API for this report: it comes in by hand.',
      fix: `Download it from the channel and drop it on the ${s.label} slot.`, href: `/reporting/mis/connectors?view=uploads#${s.connectorId}`, sig: 'missing' });
  }
  // MIS numbers: cross-month anomaly scan
  // (the running month and future months are skipped — a month that hasn't finished can't be judged yet, round 10 D — and
  // the same check over several months is one item)
  const thisMonth = x.today.slice(0, 7);
  const RANK = { high: 0, medium: 1, low: 2 } as const;
  const scan = new Map<string, InboxInputs['anomalies']>();
  for (const a of x.anomalies) {
    if (a.period && a.period.slice(0, 7) >= thisMonth) continue;
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
