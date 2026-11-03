// Issues inbox (browser half): the server's items (books, feeds, scan) + the Live MIS items the deck already knows —
// tie breaches against Tally, products with no map or no BOM, months ready to lock. One shared open / done / snoozed state
// (POST /api/issues/state). Pure helpers (deckItems, isOpen) are tested in server/test/issuesInboxClient.test.ts.
import type { LiveDeckData } from '../misDeck/liveDeck';

export type InboxArea = 'books' | 'mis' | 'feeds' | 'products' | 'close';
export type InboxSeverity = 'high' | 'medium' | 'low';
export interface InboxItem {
  id: string; area: InboxArea; severity: InboxSeverity; title: string; detail: string; fix: string; href: string;
  count?: number; period?: string; sig: string;
}
export interface IssueStateEntry { status: 'done' | 'snoozed'; sig: string; until?: string; by: string; at: string; note?: string }
export type IssueState = Record<string, IssueStateEntry>;

export const AREA_LABEL: Record<InboxArea, string> = { books: 'Books (Tally)', mis: 'MIS numbers', feeds: 'Feeds', products: 'Products', close: 'Month close' };
export const SEV_RANK: Record<InboxSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Small stable hash for the browser's items (the server uses sha1). */
export function sig(...parts: unknown[]): string {
  const s = JSON.stringify(parts);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
const monthName = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleString('en-IN', { month: 'short', year: '2-digit' });

/** Items only the Live MIS deck knows. */
export function deckItems(deck: Pick<LiveDeckData, 'completeness' | 'productGaps'>): InboxItem[] {
  const out: InboxItem[] = [];
  const thisMonth = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  for (const [k, c] of Object.entries(deck.completeness ?? {})) {
    if (c.closed || c.locked || k > thisMonth) continue; // a month that hasn't happened can't be wrong yet
    const tie = c.tie;
    if (tie?.breach) {
      out.push({ id: `tie:${k}`, area: 'close', severity: 'high', period: k,
        title: `${monthName(k)} doesn't tie to Tally (worst ${tie.worstResidualPct?.toFixed(1) ?? '?'}% — ${tie.worstLabel ?? ''})`,
        detail: tie.breaches.slice(0, 3).join(' '),
        fix: 'Open the month on Live MIS → Month close: find the residual (a missing report, a ledger on the wrong line), fix, then lock.',
        href: `/reporting/mis/live?month=${k}#close`, sig: sig(tie.breaches.map((b) => b.replace(/₹[\d,]+/g, '₹')), Math.round((tie.worstResidualPct ?? 0) * 2)) });
    } else if (c.ready) {
      out.push({ id: `lock:${k}`, area: 'close', severity: 'low', period: k, title: `${monthName(k)} is ready to lock`,
        detail: `Tally is in and it ties (worst ${tie?.worstResidualPct?.toFixed(1) ?? '0'}%).`, fix: 'Review it once on Live MIS and press Close & lock.',
        href: `/reporting/mis/live?month=${k}#close`, sig: 'ready' });
    }
    if (c.bom && !c.bom.exact) out.push({ id: `bom:${k}`, area: 'products', severity: 'low', period: k, title: `${monthName(k)} is costed with another month's BOM`, detail: c.bom.note, fix: 'Pull the BOM pricing for the month (Production portal) on Setup.', href: `/reporting/mis/connectors?view=uploads#tranzact`, sig: sig(c.bom.month) });
  }
  const g = deck.productGaps;
  if (g?.unmapped?.length) {
    const rev = g.unmapped.reduce((s, u) => s + u.revenue, 0);
    out.push({ id: 'products:unmapped', area: 'products', severity: rev > 100_000 ? 'high' : 'medium', count: g.unmapped.length,
      title: `${g.unmapped.length} sales item${g.unmapped.length === 1 ? '' : 's'} not mapped to a product (${inr(rev)})`,
      detail: g.unmapped.slice(0, 4).map((u) => u.name || u.key).join(', '),
      fix: 'Live MIS → Product gaps: confirm the suggested product (one click) or pick one.', href: '/reporting/mis/live#product-gaps', sig: sig(g.unmapped.map((u) => u.key).sort()) });
  }
  const unconfirmed = (g?.noBom ?? []).filter((b) => !b.proxyConfirmed);
  if (unconfirmed.length) {
    out.push({ id: 'products:nobom', area: 'products', severity: 'medium', count: unconfirmed.length,
      title: `${unconfirmed.length} product${unconfirmed.length === 1 ? '' : 's'} sold without a BOM cost (estimated)`,
      detail: unconfirmed.slice(0, 4).map((b) => b.deckName).join(', '),
      fix: 'Live MIS → Product gaps: confirm a cost proxy, or add the BOM in Tranzact.', href: '/reporting/mis/live#product-gaps', sig: sig(unconfirmed.map((b) => b.fgId).sort()) });
  }
  return out;
}

export function isOpen(i: InboxItem, state: IssueState, nowIso = new Date().toISOString()): boolean {
  const s = state[i.id];
  if (!s) return true;
  if (s.status === 'done') return s.sig !== i.sig;
  return !(s.until && s.until > nowIso);
}
export function statusOf(i: InboxItem, state: IssueState, nowIso = new Date().toISOString()): 'open' | 'done' | 'snoozed' {
  if (isOpen(i, state, nowIso)) return 'open';
  return state[i.id].status;
}
export const sortItems = (a: InboxItem, b: InboxItem) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || (b.period ?? '').localeCompare(a.period ?? '') || a.title.localeCompare(b.title);

// ---- API ---------------------------------------------------------------------
export async function fetchInbox(fresh = false): Promise<{ items: InboxItem[]; state: IssueState }> {
  const r = await fetch(`/api/issues/inbox${fresh ? '?fresh=1' : ''}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Issues failed (${r.status}).`);
  return { items: j.items ?? [], state: j.state ?? {} };
}
export async function postIssueState(body: { op: 'done' | 'snooze' | 'reopen'; id: string; sig: string; days?: number; note?: string }): Promise<IssueState> {
  const r = await fetch('/api/issues/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Save failed (${r.status}).`);
  window.dispatchEvent(new Event('mis:issues'));
  return j.state ?? {};
}

/** Deck items counted for the badge: cached per tab after any deck load (Live MIS is home, so it is usually loaded). */
let deckCount: { at: number; items: InboxItem[] } | null = null;
export function rememberDeckItems(items: InboxItem[]) { deckCount = { at: Date.now(), items }; window.dispatchEvent(new Event('mis:issues')); }
export function cachedDeckItems(): InboxItem[] { return deckCount && Date.now() - deckCount.at < 10 * 60_000 ? deckCount.items : []; }
