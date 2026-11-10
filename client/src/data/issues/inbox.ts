// Issues inbox (browser half): the server's items (books, feeds, scan) + the Live MIS items the deck already knows —
// tie breaches against Tally, products with no map or no BOM, months ready to lock. One shared open / done / snoozed state
// (POST /api/issues/state). Pure helpers (deckItems, isOpen) are tested in server/test/issuesInboxClient.test.ts.
import type { LiveDeckData } from '../misDeck/liveDeck';
import { overAttributions, overKind } from '../misDeck/channelAlloc';

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
export function deckItems(deck: Pick<LiveDeckData, 'completeness' | 'productGaps'> & Partial<Pick<LiveDeckData, 'liveFeed' | 'months'>>): InboxItem[] {
  const out: InboxItem[] = [];
  const feed = deck.liveFeed;
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);   // a feed problem marked Done comes back the next day if it still holds
  if (feed && !feed.ok) {
    out.push({ id: 'feed:live', area: 'feeds', severity: 'high', title: 'Live sales feed did not load — Live MIS shows uploads only',
      detail: feed.error ?? 'The connector pull failed.', fix: 'Press Refresh on Live MIS. If it fails again, open Setup and check the connector cards.',
      href: '/reporting/mis/connectors', sig: `down:${today}` });
  }
  for (const x of feed?.sources ?? []) {
    // Flipkart refuses its API until the self-access app is approved: a wait, not a fault (the server lists it once, low).
    if (x.id === 'flipkart' && x.error && /not in approved state|not approved|approval pending/i.test(x.error)) continue;
    if (!x.ok && x.error && x.error !== 'not connected' && !x.partial) {
      out.push({ id: `feed:${x.id}`, area: 'feeds', severity: 'medium', title: `${x.label}: live pull failed`, detail: x.error,
        fix: 'Open Setup → this connector and press Pull now; fix the credentials if it says so.', href: `/reporting/mis/connectors?view=uploads#${x.id}`, sig: `${sig(x.error.slice(0, 60))}:${today}` });
    } else if (x.partial) {
      out.push({ id: `feed:${x.id}:partial`, area: 'feeds', severity: 'low', title: `${x.label}: numbers still loading (partial)`, detail: 'The source was still preparing data. It is pulled again within 5 minutes.',
        fix: 'Refresh Live MIS in a few minutes.', href: '/reporting/mis/live', sig: `partial:${today}` });
    }
  }
  const thisMonth = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
  for (const [k, c] of Object.entries(deck.completeness ?? {})) {
    if (c.closed || c.locked || k > thisMonth) continue; // a month that hasn't happened can't be wrong yet
    const tie = c.tie;
    const blockers = c.closeBlockers ?? [];
    // What blocks the close besides the tie (its own item below): Tally incomplete, a channel with no data, stock not posted,
    // reports. A month with no Tally yet is not a problem by itself, but a channel missing from a finished month always is.
    const todo = blockers.filter((b) => (c.hasTally && (b.kind === 'tally-incomplete' || b.kind === 'stock' || b.kind === 'slot'))
      || (b.kind === 'channel-missing' && k < thisMonth));
    if (todo.length) {
      const hard = todo.some((b) => b.hard);
      out.push({ id: `close:${k}`, area: 'close', severity: hard ? 'high' : 'medium', period: k, count: todo.length,
        title: `${monthName(k)} can't be closed yet: ${todo.length} thing${todo.length === 1 ? '' : 's'} to fix${c.tallyGaps?.length ? ' (Tally incomplete)' : c.missingChannels?.length ? ` (no data: ${c.missingChannels.map((x) => x.channel).join(', ')})` : ''}`,
        detail: todo.slice(0, 4).map((b, i) => `${i + 1}. ${b.text}`).join(' '),
        fix: todo[0].fix, href: `/reporting/mis/live?month=${k}#close`, sig: sig(todo.map((b) => `${b.kind}:${b.text.replace(/₹[\d,]+/g, '₹')}`)) });
    }
    if (tie?.breach && !c.tallyGaps?.length) {
      out.push({ id: `tie:${k}`, area: 'close', severity: 'high', period: k,
        title: `${monthName(k)} doesn't tie to Tally (worst ${tie.worstResidualPct?.toFixed(1) ?? '?'}% — ${tie.worstLabel ?? ''})`,
        detail: tie.breaches.slice(0, 3).join(' '),
        fix: 'Open the month on Live MIS → Month close: find the residual (a missing report, a ledger on the wrong line), fix, then lock.',
        href: `/reporting/mis/live?month=${k}#close`, sig: sig(tie.breaches.map((b) => b.replace(/₹[\d,]+/g, '₹')), Math.round((tie.worstResidualPct ?? 0) * 2)) });
    } else if (c.ready) {
      out.push({ id: `lock:${k}`, area: 'close', severity: 'low', period: k, title: `${monthName(k)} is ready to lock`,
        detail: `Tally is complete, it ties (worst ${tie?.worstResidualPct?.toFixed(1) ?? '0'}%) and stock is posted.`, fix: 'Review it once on Live MIS and press Close & lock.',
        href: `/reporting/mis/live?month=${k}#close`, sig: 'ready' });
    }
    if (c.bom && !c.bom.exact) out.push({ id: `bom:${k}`, area: 'products', severity: 'low', period: k, title: `${monthName(k)} is costed with another month's BOM`, detail: c.bom.note, fix: 'Pull the BOM pricing for the month (Production portal) on Setup.', href: `/reporting/mis/connectors?view=uploads#tranzact`, sig: sig(c.bom.month) });
  }
  // A report says more cost than Tally booked on the line: the Channel P&L caps it at Tally's total; accounts check the booking.
  for (const o of overAttributions(deck.months ?? [])) {
    const c = deck.completeness?.[o.month];
    if (c?.closed || c?.locked || o.month > thisMonth) continue;
    out.push({ id: `over:${o.month}:${o.lineKey}`, area: 'books', severity: o.excess >= 50_000 ? 'high' : 'medium', period: o.month,
      title: `${monthName(o.month)}: ${o.channel} ${overKind(o.cascadeLine)} in the report exceed Tally by ${inr(o.excess)} — check the booking`,
      detail: `Report ${inr(o.reported)} vs Tally "${o.label}" ${inr(o.tally)}. The Channel P&L uses Tally's total.`,
      fix: 'In Tally, check this month\'s entries for the line: a bill not booked yet, booked in another month, or under another ledger.',
      href: `/reporting/mis/live?month=${o.month}#close`, sig: sig(o.channel, Math.round(o.excess / 1000)) });
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
