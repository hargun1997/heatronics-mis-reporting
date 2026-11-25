// One load of the issues inbox for a page: the server's items + the Live MIS's own items + the shared state.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cachedDeckItems, deckItems, fetchInbox, postIssueState, rememberDeckItems, sortItems, statusOf, type InboxItem, type IssueState } from './inbox';
import { toast } from '../../components/ui/feedback';

export interface Inbox {
  items: InboxItem[] | null;
  state: IssueState;
  busy: boolean;
  err: string | null;
  deckLoading: boolean;
  reload: (fresh?: boolean) => Promise<void>;
  act: (i: InboxItem, op: 'done' | 'snooze' | 'reopen', days?: number) => Promise<void>;
  open: InboxItem[];
}

export function useInbox(): Inbox {
  const [server, setServer] = useState<InboxItem[] | null>(null);
  // The Live MIS items: the last 24 h copy at once, then a fresh build in the background (the deck engine, 222 kB,
  // loads on demand so Tasks opens without it).
  const [deck, setDeck] = useState<InboxItem[] | null>(() => { const c = cachedDeckItems(); return c.length ? c : null; });
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<IssueState>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async (fresh = false) => {
    setBusy(true); setErr(null);
    import('../misDeck/liveDeck').then((m) => m.loadLiveDeck({ force: fresh })).then((d) => { const it = deckItems(d); setDeck(it); rememberDeckItems(it); }).catch(() => setDeck((x) => x ?? []));
    try { const r = await fetchInbox(fresh); setServer(r.items); setState(r.state); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const items = useMemo(() => (server ? [...server, ...(deck ?? [])].sort(sortItems) : null), [server, deck]);
  const open = useMemo(() => (items ?? []).filter((i) => statusOf(i, state) === 'open' && !hidden.has(i.id)), [items, state, hidden]);
  // Done / snooze leave the list at once; the save runs behind. A failed save brings the row back and says so.
  const act = useCallback(async (i: InboxItem, op: 'done' | 'snooze' | 'reopen', days?: number) => {
    const hide = op !== 'reopen';
    if (hide) setHidden((h) => new Set(h).add(i.id));
    try {
      setState(await postIssueState({ op, id: i.id, sig: i.sig, days }));
    } catch (e) {
      setErr((e as Error).message);
      toast('Could not save. The item is back in the list.');
    } finally {
      if (hide) setHidden((h) => { const n = new Set(h); n.delete(i.id); return n; });
    }
  }, []);
  return { items, state, busy, err, deckLoading: deck === null, reload, act, open };
}
