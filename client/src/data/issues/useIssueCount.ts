// Live count for the Tasks badge in the sidebar (founder, 3 Nov 2026: Tasks is the one place): open Fix items (the server's
// open items from GET /api/issues/count + the Live MIS items remembered in this tab) + tasks late or due today.
// Refreshes on mount, every 5 minutes and whenever an issue is marked (window event mis:issues).
import { useEffect, useState } from 'react';
import { cachedDeckItems, isOpen, type IssueState } from './inbox';
import { getWork } from '../work/workClient';
import { buildAgenda } from '../../pages/work/taskModel';
import { todayIST } from '../work/schedule';

export function useIssueCount(): { open: number; high: number } | null {
  const [n, setN] = useState<{ open: number; high: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [r, work] = await Promise.all([fetch('/api/issues/count'), getWork().catch(() => null)]);
        if (!r.ok) return;
        const j = (await r.json()) as { open: number; high: number; state: IssueState };
        const deck = cachedDeckItems().filter((i) => isOpen(i, j.state ?? {}));
        const today = todayIST();
        const due = work ? buildAgenda(work, today).filter((i) => !i.done && i.due <= today) : [];
        const late = due.filter((i) => i.due < today).length;
        if (alive) setN({ open: j.open + deck.length + due.length, high: j.high + deck.filter((i) => i.severity === 'high').length + late });
      } catch { /* badge is best-effort */ }
    };
    void load();
    const t = setInterval(load, 5 * 60_000);
    window.addEventListener('mis:issues', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('mis:issues', load); };
  }, []);
  return n;
}
