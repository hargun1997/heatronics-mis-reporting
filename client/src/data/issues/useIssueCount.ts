// Live count of open issues for the sidebar badge: the server's open items (GET /api/issues/count) + the Live MIS items
// remembered in this tab. Refreshes on mount, every 5 minutes and whenever an issue is marked (window event mis:issues).
import { useEffect, useState } from 'react';
import { cachedDeckItems, isOpen, type IssueState } from './inbox';

export function useIssueCount(): { open: number; high: number } | null {
  const [n, setN] = useState<{ open: number; high: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch('/api/issues/count');
        if (!r.ok) return;
        const j = (await r.json()) as { open: number; high: number; state: IssueState };
        const deck = cachedDeckItems().filter((i) => isOpen(i, j.state ?? {}));
        if (alive) setN({ open: j.open + deck.length, high: j.high + deck.filter((i) => i.severity === 'high').length });
      } catch { /* badge is best-effort */ }
    };
    void load();
    const t = setInterval(load, 5 * 60_000);
    window.addEventListener('mis:issues', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('mis:issues', load); };
  }, []);
  return n;
}
