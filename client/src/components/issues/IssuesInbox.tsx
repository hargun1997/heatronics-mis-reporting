// The "Fix" list inside Tasks (founder, 3 Nov 2026: Tasks is the one place). Everything in the MIS and the books that needs a
// person — books (Tally health checks, hanging ledgers, a Trial Balance that doesn't tie), feeds (Tally not reached, a no-API
// report not in), MIS numbers (cross-month scan) and the Live MIS's own items (tie breaches, unmapped products, products without
// a BOM, months ready to lock). Each says what is wrong, how to fix it, and links to where. Done holds until the item changes.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, Check, Clock, Info, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { cx } from '../shell/cx';
import { AREA_LABEL, statusOf, type InboxArea, type InboxItem, type InboxSeverity, type IssueState } from '../../data/issues/inbox';
import type { Inbox } from '../../data/issues/useInbox';

const SEV: Record<InboxSeverity, { label: string; cls: string; bar: string; Icon: typeof Info }> = {
  high: { label: 'Urgent', cls: 'border-red-200 bg-red-50 text-red-800', bar: 'border-l-red-500', Icon: AlertCircle },
  medium: { label: 'Check', cls: 'border-amber-200 bg-amber-50 text-amber-900', bar: 'border-l-amber-500', Icon: AlertTriangle },
  low: { label: 'Low', cls: 'border-slate-200 bg-slate-100 text-slate-700', bar: 'border-l-slate-300', Icon: Info },
};
const btn = 'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-50';
type View = 'open' | 'snoozed' | 'done';
/** Rows shown before "Show all" (page budget: 2 screens). */
const PAGE = 12;

export function IssuesInbox({ inbox }: { inbox: Inbox }) {
  const { items, state, busy, err, deckLoading, reload, act, open } = inbox;
  const [view, setView] = useState<View>('open');
  const [area, setArea] = useState<InboxArea | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const all = items ?? [];
  const by = (v: View) => all.filter((i) => statusOf(i, state) === v);
  const shown = by(view).filter((i) => area === 'all' || i.area === area);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span><b className="text-slate-900">{open.length}</b> to fix</span>
        {(['high', 'medium', 'low'] as InboxSeverity[]).map((s) => {
          const n = open.filter((i) => i.severity === s).length;
          return n ? <span key={s} className={cx('rounded-full border px-2 py-0.5 text-xs font-medium', SEV[s].cls)}>{SEV[s].label} {n}</span> : null;
        })}
        {deckLoading && <span className="text-xs text-slate-500">Checking Live MIS…</span>}
        <button type="button" onClick={() => void reload(true)} disabled={busy} className={cx(btn, 'ml-auto')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}Refresh</button>
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['open', 'snoozed', 'done'] as View[]).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={cx('min-h-[36px] rounded-full border px-3 text-sm', view === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400')}>
            {v === 'open' ? 'Open' : v === 'snoozed' ? 'Hidden for 7 days' : 'Done'} {by(v).length}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        {(['all', 'books', 'close', 'products', 'feeds', 'mis'] as const).map((a) => {
          const n = a === 'all' ? by(view).length : by(view).filter((i) => i.area === a).length;
          if (a !== 'all' && !n) return null;
          return <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)}
            className={cx('min-h-[36px] rounded-full border px-3 text-sm', area === a ? 'border-accent-500 bg-accent-50 font-medium text-accent-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
            {a === 'all' ? 'All areas' : AREA_LABEL[a]} <span className="tabular-nums text-slate-500">{n}</span></button>;
        })}
      </div>
      {items === null && !err ? <p className="py-10 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />Checking the books and the reports…</p>
        : !shown.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">{view === 'open' ? 'Nothing to fix.' : 'No items.'}</p>
        : <>
          <ul className="space-y-2">{(showAll ? shown : shown.slice(0, PAGE)).map((i) => <IssueRow key={i.id} i={i} st={state[i.id]?.status === view ? state[i.id] : undefined} view={view} act={act} />)}</ul>
          {shown.length > PAGE && <button type="button" className={btn} onClick={() => setShowAll(!showAll)}>{showAll ? `Show the first ${PAGE}` : `Show all ${shown.length}`}</button>}
        </>}
    </div>
  );
}

/** The top of the To do view: the worst open items, with a link to the full Fix list. */
export function FixPreview({ inbox, onAll, max = 4 }: { inbox: Inbox; onAll: () => void; max?: number }) {
  if (!inbox.open.length) return null;
  const top = inbox.open.slice(0, max);
  return (
    <section aria-labelledby="fix-h" className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 id="fix-h" className="text-sm font-semibold text-slate-900">Fix first</h2>
        <button type="button" onClick={onAll} className="ml-auto min-h-11 sm:min-h-8 text-sm font-medium text-accent-700 hover:underline">Show all {inbox.open.length}</button>
      </div>
      <ul className="space-y-2">{top.map((i) => <IssueRow key={i.id} i={i} view="open" act={inbox.act} compact />)}</ul>
    </section>
  );
}

export function IssueRow({ i, st, view, act }: { i: InboxItem; st?: IssueState[string]; view: View; act: (i: InboxItem, op: 'done' | 'snooze' | 'reopen', days?: number) => void; compact?: boolean }) {
  const S = SEV[i.severity];
  const [more, setMore] = useState(false);
  return (
    <li className={cx('rounded-xl border border-l-4 border-slate-200 bg-white px-3 py-2 shadow-card', S.bar)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <S.Icon className={cx('h-5 w-5 shrink-0', i.severity === 'high' ? 'text-red-600' : i.severity === 'medium' ? 'text-amber-600' : 'text-slate-500')} aria-hidden />
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="min-w-0 flex-1 basis-64 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{i.title}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{AREA_LABEL[i.area]}</span>
          </span>
          <span className={cx('block text-[13px] text-slate-600', !more && 'truncate')}>{i.fix}</span>
        </button>
        <div className="flex items-center gap-1.5">
          {i.href.startsWith('/') && <Link to={i.href} className={cx(btn, 'border-accent-200 text-accent-700')}>Open<ArrowRight className="h-4 w-4" aria-hidden /></Link>}
          {view === 'open' ? <>
            <button type="button" className={btn} onClick={() => act(i, 'done')} title="Hide until this item changes"><Check className="h-4 w-4" aria-hidden />Done</button>
            <button type="button" className={cx(btn, 'px-2')} onClick={() => act(i, 'snooze', 7)} title="Hide for 7 days" aria-label={`Hide for 7 days: ${i.title}`}><Clock className="h-4 w-4" aria-hidden /><span className="hidden lg:inline">7 days</span></button>
          </> : <button type="button" className={btn} onClick={() => act(i, 'reopen')}><RotateCcw className="h-4 w-4" aria-hidden />Open again</button>}
        </div>
      </div>
      {more && (i.detail || st) && (
        <div className="mt-1.5 border-t border-slate-100 pl-8 pt-1.5 text-[13px] text-slate-600">
          {i.detail && <p>{i.detail}</p>}
          {st && <p className="text-xs text-slate-500">{st.status === 'done' ? 'Done' : `Hidden until ${new Date(st.until!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}, by {st.by}</p>}
        </div>
      )}
    </li>
  );
}
