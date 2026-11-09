// ----------------------------------------------------------------------------
// MORNING BRIEF — the one page to open first: what needs you today, the five numbers that matter, what moved since
// yesterday and what is coming due. PURE (no store, no network): the route (routes/today.ts) loads the stored Tally
// summary, the open Fix items and the open tasks, and hands them in. Tests server/test/morningBrief.test.ts.
//
// Deterministic on purpose: every line is a rule over stored numbers (no AI call, no cost, same answer twice).
// "What changed" compares with the snapshot of an earlier day (morning/snap-<day>), which this module also defines.
// ----------------------------------------------------------------------------

import type { BalanceOut, CloseMonth, WatchItem } from '../connectors/tally/ceoSummaryV2.js';
import type { SummaryMonth } from '../connectors/tally/ceoSummary.js';

export type Severity = 'high' | 'medium' | 'low';

export interface FixIn { id: string; severity: Severity; title: string; fix: string; href: string; area: string }
export interface TaskIn { id: string; title: string; area: string; due: string; /** days past due; negative = days until due */ late: number; owners: string[] }

/** What we keep of a day, so tomorrow can say what moved. Small on purpose. */
export interface MorningSnapshot {
  day: string;
  at: string;
  netCash: number | null;
  cashBank: number | null;
  overdraft: number | null;
  salesPeriod: string | null;
  sales: number | null;
  openFix: number;
  highFix: number;
  lateTasks: number;
  watchIds: string[];
}

export interface MorningInput {
  /** IST day, YYYY-MM-DD. */
  today: string;
  now: string;
  balance: BalanceOut | null;
  months: SummaryMonth[];
  watch: WatchItem[];
  close: CloseMonth[];
  fix: FixIn[];
  tasks: TaskIn[];
  tallyLastOkAt: string | null;
  prev: MorningSnapshot | null;
}

export interface Tile { id: string; label: string; value: number | null; unit: 'inr' | 'months' | 'count'; sub: string; tone: 'ok' | 'watch' | 'act'; delta: number | null }
export interface Need { kind: 'watch' | 'fix' | 'task'; severity: Severity; title: string; why: string; href: string; inr: number | null }
export interface Due { title: string; due: string; inDays: number; owners: string[]; href: string }
export interface Change { id: string; text: string; direction: 'better' | 'worse' | 'same' | 'info' }

export interface MorningBrief {
  schema: 1;
  portal: 'mis';
  day: string;
  asOf: string;
  status: 'act' | 'watch' | 'ok';
  statusLine: string;
  tiles: Tile[];
  needsYou: Need[];
  moreNeeds: number;
  dueSoon: Due[];
  changed: Change[];
  freshness: { tallyHoursOld: number | null; tallyLastOkAt: string | null; stale: boolean; line: string };
  notes: string[];
  snapshot: MorningSnapshot;
}

const SEV: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
const r0 = (n: number) => Math.round(n);

/** ₹ in the Indian short form: ₹1.2 Cr, ₹45.3 L, ₹82,000. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
}

const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (p: string) => `${MN[Number(p.slice(5, 7)) - 1] ?? p} ${p.slice(0, 4)}`;

function watchHref(w: WatchItem): string {
  if (/^cash|runway|overdraft|gst|debtor|creditor/i.test(w.id)) return '/reporting/mis/live?tab=statements';
  if (/close|tie|tb_/i.test(w.id)) return '/reporting/mis/live';
  return '/reporting/mis/live';
}

/** The newest month that has sales, plus the one before it. */
function salesPair(months: SummaryMonth[]): { cur: SummaryMonth | null; prev: SummaryMonth | null } {
  const withSales = [...months].filter((m) => m.sales != null && m.sales > 0).sort((a, b) => a.period.localeCompare(b.period));
  return { cur: withSales[withSales.length - 1] ?? null, prev: withSales[withSales.length - 2] ?? null };
}

export function hoursSince(iso: string | null, now: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  const n = Date.parse(now);
  return Number.isFinite(t) && Number.isFinite(n) ? Math.max(0, Math.round((n - t) / 3_600_000)) : null;
}

export function buildMorningBrief(x: MorningInput): MorningBrief {
  const notes: string[] = [];
  const lateTasks = x.tasks.filter((t) => t.late > 0);
  const dueToday = x.tasks.filter((t) => t.late === 0);
  const upcoming = x.tasks.filter((t) => t.late < 0);

  // ---- needs you: high first; a task more than 3 days late counts as high
  const needs: Need[] = [];
  for (const w of x.watch) {
    if (w.severity === 'low') continue;
    needs.push({ kind: 'watch', severity: w.severity, title: w.title, why: w.reason, href: watchHref(w), inr: w.inr ?? null });
  }
  for (const f of x.fix) {
    needs.push({ kind: 'fix', severity: f.severity, title: f.title, why: f.fix, href: f.href || '/tasks?view=fix', inr: null });
  }
  for (const t of [...lateTasks, ...dueToday]) {
    const sev: Severity = t.late >= 3 ? 'high' : 'medium';
    const when = t.late > 0 ? `${t.late} day${t.late === 1 ? '' : 's'} late` : 'due today';
    needs.push({ kind: 'task', severity: sev, title: t.title, why: `${when}${t.owners.length ? ` · ${t.owners.join(', ')}` : ' · nobody assigned'}`, href: '/tasks', inr: null });
  }
  needs.sort((a, b) => SEV[b.severity] - SEV[a.severity] || (b.inr ? Math.abs(b.inr) : 0) - (a.inr ? Math.abs(a.inr) : 0));
  const top = needs.slice(0, 6);

  const high = needs.filter((n) => n.severity === 'high').length;
  const status: MorningBrief['status'] = high ? 'act' : needs.length ? 'watch' : 'ok';
  const statusLine = high
    ? `${high} thing${high === 1 ? '' : 's'} need${high === 1 ? 's' : ''} you today`
    : needs.length ? `${needs.length} to keep an eye on, nothing urgent` : 'Nothing needs you today';

  // ---- numbers
  const b = x.balance;
  const { cur, prev: prevM } = salesPair(x.months);
  const runway = x.watch.find((w) => w.id === 'cash_runway');
  const cashDelta = b && x.prev?.netCash != null ? r0(b.netCash - x.prev.netCash) : null;
  const tiles: Tile[] = [
    {
      id: 'net_cash', label: 'Net cash', value: b ? r0(b.netCash) : null, unit: 'inr',
      sub: b ? `${inrShort(b.cashBank)} in bank − ${inrShort(b.overdraft)} overdraft · ${monthLabel(b.period)} books` : 'No Trial Balance stored yet',
      tone: b && b.netCash < 0 ? 'act' : 'ok', delta: cashDelta,
    },
    {
      id: 'runway', label: 'Cash lasts', value: runway?.pct ?? null, unit: 'months',
      sub: runway ? 'at the last 3 months’ average outflow' : 'Cash is growing, or not enough months stored',
      tone: runway ? (runway.severity === 'high' ? 'act' : runway.severity === 'medium' ? 'watch' : 'ok') : 'ok', delta: null,
    },
    {
      id: 'sales', label: cur ? `Sales ${monthLabel(cur.period)}` : 'Sales', value: cur?.sales ?? null, unit: 'inr',
      sub: cur && prevM?.sales ? `${cur.sales! >= prevM.sales ? '▲' : '▼'} ${Math.abs(Math.round(((cur.sales! - prevM.sales) / prevM.sales) * 100))}% vs ${monthLabel(prevM.period)}` : 'From the Tally books',
      tone: 'ok', delta: cur && prevM?.sales ? r0(cur.sales! - prevM.sales) : null,
    },
    {
      id: 'fix', label: 'To fix', value: x.fix.length, unit: 'count',
      sub: x.fix.length ? `${x.fix.filter((f) => f.severity === 'high').length} urgent · books, feeds and numbers` : 'Books and feeds look clean',
      tone: x.fix.some((f) => f.severity === 'high') ? 'act' : x.fix.length ? 'watch' : 'ok',
      delta: x.prev ? x.fix.length - x.prev.openFix : null,
    },
    {
      id: 'late', label: 'Tasks late', value: lateTasks.length, unit: 'count',
      sub: dueToday.length ? `${dueToday.length} more due today` : upcoming.length ? `${upcoming.length} coming up` : 'All on time',
      tone: lateTasks.some((t) => t.late >= 3) ? 'act' : lateTasks.length ? 'watch' : 'ok',
      delta: x.prev ? lateTasks.length - x.prev.lateTasks : null,
    },
  ];

  // ---- coming up
  const dueSoon: Due[] = upcoming
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6)
    .map((t) => ({ title: t.title, due: t.due, inDays: -t.late, owners: t.owners, href: '/tasks' }));

  // ---- what changed since an earlier day
  const changed: Change[] = [];
  const p = x.prev;
  if (!p) {
    changed.push({ id: 'first', text: 'First snapshot saved. Changes show from tomorrow.', direction: 'info' });
  } else {
    if (b && p.netCash != null && Math.abs(b.netCash - p.netCash) >= 50_000) {
      const d = b.netCash - p.netCash;
      changed.push({ id: 'cash', text: `Net cash ${d > 0 ? 'up' : 'down'} ${inrShort(Math.abs(d))} since ${p.day}`, direction: d > 0 ? 'better' : 'worse' });
    }
    const dFix = x.fix.length - p.openFix;
    if (dFix) changed.push({ id: 'fix', text: `${Math.abs(dFix)} ${dFix > 0 ? 'new' : 'fewer'} thing${Math.abs(dFix) === 1 ? '' : 's'} to fix (${p.openFix} → ${x.fix.length})`, direction: dFix > 0 ? 'worse' : 'better' });
    const dLate = lateTasks.length - p.lateTasks;
    if (dLate) changed.push({ id: 'late', text: `${Math.abs(dLate)} ${dLate > 0 ? 'more' : 'fewer'} task${Math.abs(dLate) === 1 ? '' : 's'} late (${p.lateTasks} → ${lateTasks.length})`, direction: dLate > 0 ? 'worse' : 'better' });
    const nowIds = new Set(x.watch.map((w) => w.id));
    for (const w of x.watch) if (!p.watchIds.includes(w.id)) changed.push({ id: `new-${w.id}`, text: `New to watch: ${w.title}`, direction: 'worse' });
    for (const id of p.watchIds) if (!nowIds.has(id)) changed.push({ id: `gone-${id}`, text: `No longer flagged: ${id.replace(/_/g, ' ')}`, direction: 'better' });
    if (!changed.length) changed.push({ id: 'same', text: `Nothing moved since ${p.day}`, direction: 'same' });
  }

  // ---- how fresh is the books copy
  const age = hoursSince(x.tallyLastOkAt, x.now);
  const stale = age == null || age > 48;
  const freshness = {
    tallyHoursOld: age,
    tallyLastOkAt: x.tallyLastOkAt,
    stale,
    line: age == null ? 'Tally has not been read yet' : age <= 1 ? 'Tally read within the last hour' : age < 48 ? `Tally read ${age} hours ago` : `Tally last read ${Math.round(age / 24)} days ago — open TallyPrime so the poll can read it`,
  };
  if (stale) notes.push('The books numbers may be old: ' + freshness.line + '.');
  if (!b) notes.push('Cash needs a stored Trial Balance (Setup → Tally → Pull now).');

  return {
    schema: 1, portal: 'mis', day: x.today, asOf: x.now, status, statusLine, tiles,
    needsYou: top, moreNeeds: Math.max(0, needs.length - top.length), dueSoon, changed, freshness, notes,
    snapshot: {
      day: x.today, at: x.now,
      netCash: b ? r0(b.netCash) : null, cashBank: b ? r0(b.cashBank) : null, overdraft: b ? r0(b.overdraft) : null,
      salesPeriod: cur?.period ?? null, sales: cur?.sales ?? null,
      openFix: x.fix.length, highFix: x.fix.filter((f) => f.severity === 'high').length,
      lateTasks: lateTasks.length, watchIds: x.watch.map((w) => w.id),
    },
  };
}

/** The newest snapshot day strictly before `today`. */
export function previousDay(days: string[], today: string): string | null {
  return [...days].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today).sort().pop() ?? null;
}

/** Keep the index to the last `keep` days, newest last, no duplicates. */
export function withDay(days: string[], day: string, keep = 45): string[] {
  return [...new Set([...days, day])].sort().slice(-keep);
}
