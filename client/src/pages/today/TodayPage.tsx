// Today — the page to open first. What needs you, five numbers, what moved since yesterday, what is coming.
// Reads GET /api/today (stored data only). Numbers first; every section folds.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, AlertTriangle, CircleAlert, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Disclosure } from '../../components/ui/Disclosure';
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
  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="Today"
        description="What needs you, the five numbers that matter, and what moved since yesterday."
        status={b && band ? <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${band.box}`}><band.Icon className="h-3.5 w-3.5" aria-hidden />{b.status === 'act' ? 'Act now' : b.status === 'watch' ? 'Watch' : 'All clear'}</span> : undefined}
        actions={<button type="button" onClick={() => void load(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden /> Refresh</button>}
      />
      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}
      {!b && !err && <div className="text-sm text-slate-500" role="status">Loading…</div>}
      {b && band && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold text-slate-900" role="status">{b.statusLine}</p>
            <SourceChip
              items={[
                { label: 'Tally books', asOf: b.freshness.tallyLastOkAt ?? null, staleAfterH: 48, note: 'Cash, sales and watch items' },
                { label: 'Tasks & Fix list', asOf: b.asOf, note: 'Read live' },
              ]}
              notes={b.notes}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {b.tiles.map((t) => {
              const d = tileDelta(t);
              // for cash and sales up is good; for fix / late counts up is bad
              const good = t.unit === 'count' ? (t.delta ?? 0) < 0 : (t.delta ?? 0) > 0;
              return (
                <Card key={t.id} className="p-4">
                  <p className="text-xs text-slate-500">{t.label}</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${TONE[t.tone]}`}>{show(t)}</p>
                  {d && (
                    <p className={`mt-0.5 flex items-center gap-0.5 text-xs ${good ? 'text-emerald-700' : 'text-red-700'}`}>
                      {(t.delta ?? 0) > 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
                      {d} vs last saved day
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">{t.sub}</p>
                </Card>
              );
            })}
          </div>

          <Disclosure title="Needs you" defaultOpen badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{b.needsYou.length + b.moreNeeds}</span>}>
            {b.needsYou.length === 0 ? <p className="py-2 text-slate-500">Nothing open.</p> : (
              <ol className="divide-y divide-slate-100">
                {b.needsYou.map((n, i) => (
                  <li key={i} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${n.severity === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{KIND[n.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <Link to={n.href} className="font-medium text-slate-900 hover:underline">{n.title}</Link>
                      <p className="text-xs text-slate-600">{n.why}</p>
                    </div>
                    {n.inr != null && <span className="shrink-0 text-sm tabular-nums text-slate-700">{inr(n.inr)}</span>}
                  </li>
                ))}
              </ol>
            )}
            {b.moreNeeds > 0 && <p className="pt-2 text-xs text-slate-500">+{b.moreNeeds} more — <Link to="/tasks?view=fix" className="underline">see all in Tasks</Link></p>}
          </Disclosure>

          <Disclosure title="What changed" defaultOpen subtitle="Compared with the last saved day">
            <ul className="space-y-1.5 py-1">
              {b.changed.map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.direction === 'better' ? 'bg-emerald-500' : c.direction === 'worse' ? 'bg-red-500' : 'bg-slate-300'}`} />
                  <span>{c.text}<span className="sr-only"> ({c.direction})</span></span>
                </li>
              ))}
            </ul>
          </Disclosure>

          <Disclosure title="Coming up" badge={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{b.dueSoon.length}</span>}>
            {b.dueSoon.length === 0 ? <p className="py-2 text-slate-500">Nothing due in the next few days.</p> : (
              <ul className="divide-y divide-slate-100">
                {b.dueSoon.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <Link to={d.href} className="hover:underline">{d.title}</Link>
                    <span className="shrink-0 text-xs text-slate-600">{d.inDays === 1 ? 'tomorrow' : `in ${d.inDays} days`}{d.owners.length ? ` · ${d.owners.join(', ')}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Disclosure>

        </>
      )}
    </div>
  );
}
