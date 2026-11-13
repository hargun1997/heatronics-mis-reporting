// The pages People & teams (portal.heatronics.in/admin) lets this person open: GET /api/htx/pages (server/src/htxGate.ts).
// null = no teams yet or not known yet: every page shows. The server refuses the others on a full page load; the
// layout shows a notice when the browser moves to one without a reload.
import { useEffect, useState } from 'react';

export type PageGrant = '*' | string[] | null;
let memo: Promise<PageGrant> | null = null;
const load = () => (memo ??= fetch('/api/htx/pages', { credentials: 'same-origin' })
  .then((r) => (r.ok ? r.json() : { pages: null }))
  .then((j: { pages?: PageGrant }) => j.pages ?? null)
  .catch(() => null));

export const pageAllowed = (pages: PageGrant, id: string | undefined) => !pages || pages === '*' || !id || pages.includes(id);

export function useHtxPages(): PageGrant {
  const [pages, setPages] = useState<PageGrant>(null);
  useEffect(() => { let alive = true; void load().then((p) => { if (alive) setPages(p); }); return () => { alive = false; }; }, []);
  return pages;
}
