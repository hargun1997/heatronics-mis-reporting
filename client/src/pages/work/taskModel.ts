// Shared, non-visual logic for the Tasks pages: date labels, the agenda
// (what is due when), filters and who-is-who helpers.

import { getHandbook, type HbArticle } from '../../data/handbook/handbook';
import { addDays, diffDays, lookbackDays, occurrences, parseYmd, todayIST, ymd, type Cadence } from '../../data/work/schedule';
import type { Head, TeamMember, WorkState, WorkTask } from '../../data/work/workClient';

export const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const CADENCES: { v: Cadence; l: string }[] = [
  { v: 'daily', l: 'Daily' },
  { v: 'weekly', l: 'Weekly' },
  { v: 'monthly', l: 'Monthly' },
  { v: 'quarterly', l: 'Quarterly' },
  { v: 'half-yearly', l: 'Half-yearly' },
  { v: 'yearly', l: 'Yearly' },
  { v: 'one-time', l: 'One-time' },
];

export const readLS = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
export const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

export function periodLabel(p: string): string {
  if (p === 'once') return 'One-time';
  if (/^\d{4}$/.test(p)) return p;
  if (/^\d{4}-W\d{2}$/.test(p)) return `Week ${Number(p.slice(6))}`;
  if (/^\d{4}-\d{2}$/.test(p)) return `${MN[Number(p.slice(5))]} ${p.slice(0, 4)}`;
  const d = parseYmd(p);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MN[d.getUTCMonth() + 1]}`;
}

/** Short due text: "3 days late", "Today", "Tomorrow", "Mon 26 Oct". `late` drives the red. */
export function dueLabel(due: string, today: string): { text: string; late: boolean } {
  const n = diffDays(due, today);
  const d = parseYmd(due);
  const date = `${d.getUTCDate()} ${MN[d.getUTCMonth() + 1]}`;
  if (n < 0) return { text: `${-n} day${n < -1 ? 's' : ''} late`, late: true };
  if (n === 0) return { text: 'Today', late: false };
  if (n === 1) return { text: 'Tomorrow', late: false };
  return { text: `${WD[d.getUTCDay()]} ${date}`, late: false };
}

const AVATAR_TONES = ['bg-brand-100 text-brand-800', 'bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800'];
export const avatarTone = (id: string) => AVATAR_TONES[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_TONES.length];
export const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** "Krishna, Vivek" / "No owner" for a task's owners. */
export function ownerNames(ids: string[], memberById: Map<string, TeamMember>): string {
  const ms = ids.map((id) => memberById.get(id)).filter((m): m is TeamMember => !!m);
  return ms.length ? ms.map((m) => m.name.split(' ')[0]).join(', ') : '';
}

/** First anchor id of each handbook article (for the "How to" picker). */
export function handbookAnchors(): { id: string; a: HbArticle }[] {
  const seen = new Set<HbArticle>();
  const out: { id: string; a: HbArticle }[] = [];
  for (const [id, a] of getHandbook().idToArticle) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push({ id, a });
  }
  return out;
}

// --- agenda ------------------------------------------------------------------

export interface Item {
  task: WorkTask;
  period: string;
  due: string;
  done: boolean;
  auto: boolean;
}

export type Group = 'overdue' | 'today' | 'week' | 'later';
export const GROUPS: { key: Group; title: string }[] = [
  { key: 'overdue', title: 'Late' },
  { key: 'today', title: 'Today' },
  { key: 'week', title: 'This week' },
  { key: 'later', title: 'Later' },
];

export const trackingStart = (state: WorkState, today: string) => (state.seededAt ? todayIST(new Date(state.seededAt)) : today);

export function buildAgenda(state: WorkState, today: string): Item[] {
  const out: Item[] = [];
  const t0 = parseYmd(today);
  // Nothing before the tracker was set up counts as overdue (its status is unknown).
  const start = trackingStart(state, today);
  for (const task of state.tasks) {
    if (!task.active) continue;
    const isDone = (p: string) => !!state.done[task.id]?.[p];
    const isAuto = (p: string) => !!state.autoDone[task.id]?.includes(p);
    let from = ymd(addDays(t0, -lookbackDays(task.cadence)));
    if (from < start) from = start;
    const occ = occurrences(task, from, ymd(addDays(t0, 35)));
    let future = 0;
    for (const o of occ) {
      const done = isDone(o.period) || isAuto(o.period);
      if (o.due < today) {
        if (!done) out.push({ task, period: o.period, due: o.due, done, auto: false });
      } else if (o.due === today) {
        out.push({ task, period: o.period, due: o.due, done, auto: isAuto(o.period) });
      } else if (task.cadence !== 'daily' && future++ === 0) {
        // only the next occurrence of each task, so the list stays short
        out.push({ task, period: o.period, due: o.due, done, auto: isAuto(o.period) });
      }
    }
  }
  return out.sort((a, b) => (a.due === b.due ? a.task.title.localeCompare(b.task.title) : a.due < b.due ? -1 : 1));
}

/** Is this open item in today's daily email (owner set, reminders on, inside its window)? */
export function inTodaysEmail(i: Item, state: WorkState, today: string): boolean {
  if (i.done || i.task.remind === false || !state.settings.enabled) return false;
  if (!i.task.ownerIds.some((id) => state.members.some((m) => m.id === id))) return false;
  const n = diffDays(i.due, today);
  return n <= 0 || (state.settings.includeDueSoon && n <= (i.task.remindDaysBefore ?? 2));
}

export const hourLabelIST = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}`;

export const groupOf = (due: string, today: string): Group => {
  const n = diffDays(due, today);
  return n < 0 ? 'overdue' : n === 0 ? 'today' : n <= 7 ? 'week' : 'later';
};

/** The period to work on: the earliest open one (overdue / today), else the next. */
export function currentPeriod(task: WorkTask, state: WorkState, today: string): string | undefined {
  let from = ymd(addDays(parseYmd(today), -lookbackDays(task.cadence)));
  const start = trackingStart(state, today);
  if (from < start) from = start;
  const occ = occurrences(task, from, ymd(addDays(parseYmd(today), 400)));
  const open = occ.find((o) => !state.done[task.id]?.[o.period]);
  return (open ?? occ[occ.length - 1])?.period;
}

// --- filters -----------------------------------------------------------------

export type Who = 'all' | 'mine' | 'unassigned' | string;
export type When = '' | 'overdue' | 'today' | 'week';
export type Kind = '' | 'daily' | 'weekly' | 'monthly' | 'periodic' | 'uploads' | 'guide';

export const KINDS: { k: Exclude<Kind, ''>; l: string; test: (t: WorkTask) => boolean }[] = [
  { k: 'daily', l: 'Daily', test: (t) => t.cadence === 'daily' },
  { k: 'weekly', l: 'Weekly', test: (t) => t.cadence === 'weekly' },
  { k: 'monthly', l: 'Monthly', test: (t) => t.cadence === 'monthly' },
  { k: 'periodic', l: 'Quarterly & yearly', test: (t) => ['quarterly', 'half-yearly', 'yearly', 'one-time'].includes(t.cadence) },
  { k: 'uploads', l: 'MIS uploads', test: (t) => !!t.upload },
  { k: 'guide', l: 'Has a guide', test: (t) => !!t.howTo },
];

export const WHENS: { k: Exclude<When, ''>; l: string }[] = [
  { k: 'overdue', l: 'Late' },
  { k: 'today', l: 'Today' },
  { k: 'week', l: 'Next 7 days' },
];

/** "CFO / Accounts Manager" → ["cfo", "accounts manager"]; drops "(…)". */
export const roleTokens = (label?: string) =>
  (label ?? '')
    .replace(/\([^)]*\)/g, '')
    .split(/\s*(?:\/|,|&|\band\b)\s*/i)
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

/** A task is in a head by its area or by any of its roles (case-insensitive). */
export const inHead = (t: WorkTask, h: Head) => {
  const roles = h.roles.map((r) => r.toLowerCase());
  return h.areas.includes(t.area) || roleTokens(t.roleLabel).some((r) => roles.includes(r));
};

/** Active tasks with no (existing) owner. */
export const unownedTasks = (state: WorkState) => state.tasks.filter((t) => t.active && !t.ownerIds.some((id) => state.members.some((m) => m.id === id)));

export type View = 'agenda' | 'month' | 'all';
export interface Filters {
  head: string;
  area: string;
  kind: Kind;
  when: When;
}
export const NO_FILTERS: Filters = { head: '', area: '', kind: '', when: '' };
