// Today — the page to open first. What needs you, five numbers, what moved since yesterday, what is coming.
// Reads GET /api/today (stored data only). Numbers first, then the numbered list; all on one screen.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, CircleAlert, RefreshCw } from 'lucide-react';
import { PageHeader, PageBody } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { BTN, Empty, ErrorBox, Loading, Panel, StepNo } from '../../components/ui/states';
import { SourceChip } from '../../components/ui/SourceChip';

interface Tile { id: string; label: string; value: number | null; unit: 'inr' | 'months' | 'count'; sub: string; tone: 'ok' | 'watch' | 'act'; delta: number | null }
interface Need { kind: 'watch' | 'fix' | 'task'; severity: 'high' | 'medium' | 'low'; title: string; why: string; href: string; inr: number | null }
interface Due { title: string; due: string; inDays: number; owners: string[]; href: string }
interface Change { id: string; text: string; direction: 'better' | 'worse' | 'same' | 'info' }
interface Brief {
  day: string; asOf: string; status: 'act' | 'watch' | 'ok'; statusLine: string; tiles: Tile[]; needsYou: Need[]; moreNeeds: number;
  dueSoon: Due[]; changed: Change[]; freshness: { line: string; stale: boolean; tallyLastOkAt?: string | null }; notes: string[];
}

function inr(n: number | null): string {
  if (n == null) return '—';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
}
const show = (t: Tile) => (t.value == null ? '—' : t.unit === 'inr' ? inr(t.value) : t.unit === 'months' ? `${t.value} mo` : String(t.value));
const tileDelta = (t: Tile) => (t.delta == null || t.delta === 0 ? null : t.unit === 'inr' ? inr(Math.abs(t.delta)) : String(Math.abs(t.delta)));
const TONE = {
  ok: 'text-emerald-700', watch: 'text-amber-700', act: 'text-red-700',
} as const;
const BAND = {
  act: { box: 'bg-red-50 border-red-200 text-red-800', Icon: CircleAlert },
  watch: { box: 'bg-amber-50 border-amber-200 text-amber-800', Icon: AlertTriangle },
  ok: { box: 'bg-emerald-50 border-emerald-200 text-emerald-800', Icon: CheckCircle2 },
} as const;
const KIND = { watch: 'Watch', fix: 'Fix', task: 'Task' } as const;

export function TodayPage() {
  const [b, setB] = useState<Brief | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (fresh = false) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/today${fresh ? '?fresh=1' : ''}`);
      if (!r.ok) throw new Error(`Could not load (${r.status})`);
      setB((await r.json()) as Brief); setErr(null);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load'); }
    setBusy(false);
  };
  useEffect(() => { void load(); }, []);

  const band = b ? BAND[b.status] : null;
  const total = b ? b.needsYou.length + b.moreNeeds : 0;
  return (
    <>
      <PageHeader
        title="Today"
        description={b ? b.statusLine : 'Do the numbered items first.'}
        status={b && band ? <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${band.box}`}><band.Icon className="h-3.5 w-3.5" aria-hidden />{b.status === 'act' ? 'Act now' : b.status === 'watch' ? 'Watch' : 'All clear'}</span> : undefined}
        help={<><p>The 5 numbers come from the Tally books and the Tasks list.</p><p>"What changed" compares today with the last saved day.</p></>}
        actions={<>
          {b && <SourceChip
            items={[
              { label: 'Tally books', asOf: b.freshness.tallyLastOkAt ?? null, staleAfterH: 48, note: 'Net cash, sales and watch items' },
              { label: 'Tasks and Fix list', asOf: b.asOf, note: 'Read live' },
            ]}
            notes={b.notes}
          />}
          <button type="button" onClick={() => void load(true)} disabled={busy} className={BTN}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden /> Refresh</button>
        </>}
      />
      <PageBody>
        {err && <ErrorBox onRetry={() => void load(true)}>{err}</ErrorBox>}
        {!b && !err && <Loading />}
        {b && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {b.tiles.map((t) => {
                const d = tileDelta(t);
                // for cash and sales up is good; for fix / late counts up is bad
                const good = t.unit === 'count' ? (t.delta ?? 0) < 0 : (t.delta ?? 0) > 0;
                return (
                  <KpiTile key={t.id} label={t.label} value={<span className={TONE[t.tone]}>{show(t)}</span>}
                    delta={d ? { dir: (t.delta ?? 0) > 0 ? 'up' : 'down', text: d, good } : undefined}
                    sub={t.sub} />
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Do these first" count={total} className="lg:col-span-2" flush
                action={total > 0 ? <Link to="/tasks" className={BTN}>Open Tasks</Link> : undefined}>
                {b.needsYou.length === 0 ? <div className="p-4"><Empty title="Nothing to do now" hint="No late task. No open Fix item." /></div> : (
                  <ol className="divide-y divide-slate-100">
                    {b.needsYou.map((n, i) => (
                      <li key={i}>
                        <Link to={n.href} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500">
                          <StepNo n={i + 1} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">{n.title}</span>
                            <span className="block truncate text-xs text-slate-600" title={n.why}>{n.why}</span>
                          </span>
                          {n.inr != null && <span className="shrink-0 text-sm tabular-nums text-slate-700">{inr(n.inr)}</span>}
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${n.severity === 'high' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{KIND[n.kind]}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                {b.moreNeeds > 0 && <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600">{b.moreNeeds} more in <Link to="/tasks?view=fix" className="font-medium text-accent-600 hover:underline">Tasks, Fix list</Link></p>}
              </Panel>

              <div className="space-y-4">
                <Panel title="What changed">
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {b.changed.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.direction === 'better' ? 'bg-emerald-500' : c.direction === 'worse' ? 'bg-red-500' : 'bg-slate-300'}`} />
                        <span>{c.text}<span className="sr-only"> ({c.direction})</span></span>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <Panel title="Due soon" count={b.dueSoon.length} flush>
                  {b.dueSoon.length === 0 ? <p className="p-4 text-sm text-slate-600">No task is due soon.</p> : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {b.dueSoon.slice(0, 5).map((d, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
                          <Link to={d.href} className="min-w-0 truncate text-slate-900 hover:underline">{d.title}</Link>
                          <span className="shrink-0 text-xs text-slate-600">{d.inDays === 1 ? 'Tomorrow' : `${d.inDays} days`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
