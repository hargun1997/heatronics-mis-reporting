// THE count of open work (UI pass, 22 Nov 2026). Before this, the same idea showed 5 different numbers: Today's headline
// (high items only), Today's "Do these first" (all needs), Today's "To fix" (server items only), Tasks' "to fix" (server +
// Live MIS items) and the sidebar badge (server + Live MIS-if-open + due tasks). Now the sidebar badge, Today and the
// Tasks header all read this one store, so a number you see on one page is the number on every page.
//
// Open work = Fix items (server Fix list + Live MIS items, still open) + tasks late + tasks due today, for every person.
// Urgent = high Fix items + late tasks. One fetch is shared by every component (module store + subscribers).
import { useEffect, useState } from 'react';
import { cachedDeckItems, isOpen, type IssueState } from './inbox';
import { getWork } from '../work/workClient';
import { todayIST } from '../work/schedule';

export interface WorkCount {
  /** Fix items still open (server + Live MIS). */
  fix: number;
  fixHigh: number;
  /** Tasks past their due date, every owner. */
  late: number;
  dueToday: number;
  /** Tasks due in the next 7 days (after today). */
  dueWeek: number;
  /** fix + late + dueToday: the Tasks badge and Today's list count. */
  open: number;
  /** fixHigh + late: what "Act now" means. */
  urgent: number;
}

let current: WorkCount | null = null;
let inflight: Promise<void> | null = null;
let lastAt = 0;
const subs = new Set<(c: WorkCount) => void>();

async function load(): Promise<void> {
  // taskModel pulls in the handbook: imported on demand so the badge does not put it in the shell chunk.
  const [r, work, { buildAgenda }] = await Promise.all([fetch('/api/issues/count'), getWork().catch(() => null), import('../../pages/work/taskModel')]);
  if (!r.ok) return;
  const j = (await r.json()) as { open: number; high: number; state: IssueState };
  const deck = cachedDeckItems().filter((i) => isOpen(i, j.state ?? {}));
  const today = todayIST();
  const week = new Date(Date.parse(today) + 7 * 86_400_000).toISOString().slice(0, 10);
  const agenda = work ? buildAgenda(work, today).filter((i) => !i.done) : [];
  const late = agenda.filter((i) => i.due < today).length;
  const dueToday = agenda.filter((i) => i.due === today).length;
  const dueWeek = agenda.filter((i) => i.due > today && i.due <= week).length;
  const fix = j.open + deck.length;
  const fixHigh = j.high + deck.filter((i) => i.severity === 'high').length;
  current = { fix, fixHigh, late, dueToday, dueWeek, open: fix + late + dueToday, urgent: fixHigh + late };
  lastAt = Date.now();
  subs.forEach((f) => f(current!));
}

/** Loads once for all callers; `force` (a Done, a Refresh) loads again. */
export function refreshWorkCount(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && current && Date.now() - lastAt < 60_000) return Promise.resolve();
  inflight = load().catch(() => { /* best effort: keep the last count */ }).finally(() => { inflight = null; });
  return inflight;
}

export function useWorkCount(): WorkCount | null {
  const [c, setC] = useState<WorkCount | null>(current);
  useEffect(() => {
    subs.add(setC);
    void refreshWorkCount();
    const onChange = () => void refreshWorkCount(true);
    const t = setInterval(() => void refreshWorkCount(true), 5 * 60_000);
    window.addEventListener('mis:issues', onChange);
    window.addEventListener('mis:work', onChange);
    return () => { subs.delete(setC); clearInterval(t); window.removeEventListener('mis:issues', onChange); window.removeEventListener('mis:work', onChange); };
  }, []);
  return c;
}
