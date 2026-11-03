// Issues — the one inbox of things that need a person, now that the MIS runs live: books (Tally health checks, hanging
// ledgers, a Trial Balance that doesn't tie), feeds (Tally not reached, a manual report not in), MIS numbers (cross-month
// scan) and the Live MIS's own items (tie breaches, unmapped products, products without a BOM, months ready to lock).
// Each item says what is wrong, how to fix it and links to where. Done holds until the item changes; Snooze for N days.
// Server: GET /api/issues/inbox + POST /api/issues/state (shared by everyone). Sidebar badge: useIssueCount.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, Check, Clock, Info, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { cx } from '../../components/shell/cx';
import { loadLiveDeck } from '../../data/misDeck/liveDeck';
import { AREA_LABEL, deckItems, fetchInbox, postIssueState, rememberDeckItems, sortItems, statusOf, type InboxArea, type InboxItem, type InboxSeverity, type IssueState } from '../../data/issues/inbox';

const icon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M12 8v4m0 3h.01" /></svg>
);
const SEV: Record<InboxSeverity, { label: string; cls: string; bar: string; Icon: typeof Info }> = {
  high: { label: 'Fix now', cls: 'border-red-200 bg-red-50 text-red-800', bar: 'border-l-red-500', Icon: AlertCircle },
  medium: { label: 'Check', cls: 'border-amber-200 bg-amber-50 text-amber-900', bar: 'border-l-amber-500', Icon: AlertTriangle },
  low: { label: 'Tidy', cls: 'border-slate-200 bg-slate-100 text-slate-700', bar: 'border-l-slate-300', Icon: Info },
};
const btn = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50';
type View = 'open' | 'snoozed' | 'done';

export function IssuesPage() {
  const [server, setServer] = useState<InboxItem[] | null>(null);
  const [deck, setDeck] = useState<InboxItem[] | null>(null);
  const [state, setState] = useState<IssueState>({});
  const [view, setView] = useState<View>('open');
  const [area, setArea] = useState<InboxArea | 'all'>('all');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (fresh = false) => {
    setBusy(true); setErr(null);
    try { const r = await fetchInbox(fresh); setServer(r.items); setState(r.state); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    loadLiveDeck({ force: fresh }).then((d) => { const it = deckItems(d); setDeck(it); rememberDeckItems(it); }).catch(() => setDeck([]));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const all = useMemo(() => [...(server ?? []), ...(deck ?? [])].sort(sortItems), [server, deck]);
  const now = new Date().toISOString();
  const by = (v: View) => all.filter((i) => statusOf(i, state, now) === v);
  const shown = by(view).filter((i) => area === 'all' || i.area === area);
  const open = by('open');
  const areaCount = (a: InboxArea) => by(view).filter((i) => i.area === a).length;

  const act = async (i: InboxItem, op: 'done' | 'snooze' | 'reopen', days?: number) => {
    try { setState(await postIssueState({ op, id: i.id, sig: i.sig, days })); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="Issues" icon={icon}
        description="Everything in the MIS and the books that needs a person: what is wrong, how to fix it, and where. Fixed at the source, an item leaves on its own; Done hides it until it changes."
        actions={<button type="button" onClick={() => void load(true)} disabled={busy} className={btn}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}Check again</button>} />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span><b className="text-slate-900">{open.length}</b> open</span>
          {(['high', 'medium', 'low'] as InboxSeverity[]).map((s) => {
            const n = open.filter((i) => i.severity === s).length;
            return n ? <span key={s} className={cx('rounded-full border px-2 py-0.5 text-xs font-medium', SEV[s].cls)}>{SEV[s].label} {n}</span> : null;
          })}
          {deck === null && <span className="text-xs text-slate-500">· loading Live MIS checks…</span>}
        </div>
        {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl aria-label="Status" value={view} onChange={setView} options={[
            { id: 'open', label: `Open (${open.length})` }, { id: 'snoozed', label: `Snoozed (${by('snoozed').length})` }, { id: 'done', label: `Done (${by('done').length})` }]} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Area">
            {(['all', 'books', 'close', 'products', 'feeds', 'mis'] as const).map((a) => {
              const n = a === 'all' ? by(view).length : areaCount(a);
              if (a !== 'all' && !n) return null;
              return <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)}
                className={cx('h-9 rounded-full border px-3 text-sm', area === a ? 'border-accent-500 bg-accent-50 font-medium text-accent-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                {a === 'all' ? 'All' : AREA_LABEL[a]} <span className="tabular-nums text-slate-500">{n}</span></button>;
            })}
          </div>
        </div>

        {server === null && !err ? <p className="py-10 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Checking the books and feeds…</p>
          : !shown.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">{view === 'open' ? 'Nothing open. The MIS and the books are clean.' : `Nothing ${view}.`}</p>
          : <ul className="space-y-2">{shown.map((i) => <Row key={i.id} i={i} st={state[i.id]?.status === view ? state[i.id] : undefined} view={view} act={act} />)}</ul>}
      </div>
    </>
  );
}

function Row({ i, st, view, act }: { i: InboxItem; st?: IssueState[string]; view: View; act: (i: InboxItem, op: 'done' | 'snooze' | 'reopen', days?: number) => void }) {
  const S = SEV[i.severity];
  const internal = i.href.startsWith('/');
  return (
    <li className={cx('rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-card', S.bar)}>
      <div className="flex flex-wrap items-start gap-3">
        <S.Icon className={cx('mt-0.5 h-5 w-5 shrink-0', i.severity === 'high' ? 'text-red-600' : i.severity === 'medium' ? 'text-amber-600' : 'text-slate-500')} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-slate-900">{i.title}</h2>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{AREA_LABEL[i.area]}</span>
          </div>
          {i.detail && <p className="mt-1 text-sm text-slate-600">{i.detail}</p>}
          <p className="mt-1.5 text-sm text-slate-800"><span className="font-medium">Fix: </span>{i.fix}</p>
          {st && <p className="mt-1 text-xs text-slate-500">{st.status === 'done' ? 'Marked done' : `Snoozed until ${new Date(st.until!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`} by {st.by}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {internal ? <Link to={i.href} className={cx(btn, 'border-accent-200 text-accent-700')}>Open<ArrowRight className="h-4 w-4" aria-hidden /></Link> : null}
          {view === 'open' ? <>
            <button type="button" className={btn} onClick={() => act(i, 'snooze', 7)} title="Hide for 7 days"><Clock className="h-4 w-4" aria-hidden />Snooze 7 d</button>
            <button type="button" className={btn} onClick={() => act(i, 'done')} title="Hide until this item changes"><Check className="h-4 w-4" aria-hidden />Done</button>
          </> : <button type="button" className={btn} onClick={() => act(i, 'reopen')}><RotateCcw className="h-4 w-4" aria-hidden />Reopen</button>}
        </div>
      </div>
    </li>
  );
}
