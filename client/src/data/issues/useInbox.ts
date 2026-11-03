// One load of the issues inbox for a page: the server's items + the Live MIS's own items + the shared state.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadLiveDeck } from '../misDeck/liveDeck';
import { deckItems, fetchInbox, postIssueState, rememberDeckItems, sortItems, statusOf, type InboxItem, type IssueState } from './inbox';

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
  const [deck, setDeck] = useState<InboxItem[] | null>(null);
  const [state, setState] = useState<IssueState>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async (fresh = false) => {
    setBusy(true); setErr(null);
    loadLiveDeck({ force: fresh }).then((d) => { const it = deckItems(d); setDeck(it); rememberDeckItems(it); }).catch(() => setDeck([]));
    try { const r = await fetchInbox(fresh); setServer(r.items); setState(r.state); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const items = useMemo(() => (server ? [...server, ...(deck ?? [])].sort(sortItems) : null), [server, deck]);
  const open = useMemo(() => (items ?? []).filter((i) => statusOf(i, state) === 'open'), [items, state]);
  const act = useCallback(async (i: InboxItem, op: 'done' | 'snooze' | 'reopen', days?: number) => {
    try { setState(await postIssueState({ op, id: i.id, sig: i.sig, days })); } catch (e) { setErr((e as Error).message); }
  }, []);
  return { items, state, busy, err, deckLoading: deck === null, reload, act, open };
}
