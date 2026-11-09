// Cash runway — 13 weeks ahead in three cases, from the stored Tally books. Numbers first; the chart is one glance.
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Disclosure } from '../../components/ui/Disclosure';

interface Week { week: number; start: string; base: number; hard: number; easy: number }
interface Case { id: 'base' | 'hard' | 'easy'; label: string; perMonth: number; zeroOn: string | null; limitOn: string | null; low: number; end: number }
interface Runway { today: string; basis: string | null; netCash: number | null; odLimit: number | null; weeks: Week[]; cases: Case[]; status: 'act' | 'watch' | 'ok' | 'unknown'; line: string; notes: string[] }

function inr(n: number | null): string {
  if (n == null) return '—';
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
}
const nice = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'not in 13 weeks');
const COLOR = { base: 'var(--chart-1, #2a78d6)', hard: 'var(--chart-2, #eb6834)', easy: 'var(--chart-3, #1baf7a)' } as const;
const BAND = { act: 'bg-red-50 border-red-200 text-red-800', watch: 'bg-amber-50 border-amber-200 text-amber-800', ok: 'bg-emerald-50 border-emerald-200 text-emerald-800', unknown: 'bg-slate-50 border-slate-200 text-slate-700' } as const;

function Chart({ r }: { r: Runway }) {
  const W = 720, H = 240, P = { l: 56, r: 12, t: 12, b: 26 };
  const all = r.weeks.flatMap((w) => [w.base, w.hard, w.easy]).concat(r.netCash ?? 0, 0, r.odLimit ? -r.odLimit : 0);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i: number) => P.l + (i / Math.max(1, r.weeks.length)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b);
  const line = (k: 'base' | 'hard' | 'easy') => [`${x(0)},${y(r.netCash ?? 0)}`, ...r.weeks.map((w, i) => `${x(i + 1)},${y(w[k])}`)].join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Net cash over the next 13 weeks in three cases">
      <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.35" />
      <text x={P.l - 6} y={y(0) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">₹0</text>
      {r.odLimit != null ? <><line x1={P.l} x2={W - P.r} y1={y(-r.odLimit)} y2={y(-r.odLimit)} stroke="#d03b3b" strokeDasharray="4 3" /><text x={P.l - 6} y={y(-r.odLimit) + 4} textAnchor="end" fontSize="11" fill="#d03b3b">limit</text></> : null}
      {Math.abs(y(hi) - y(0)) > 14 && <text x={P.l - 6} y={P.t + 8} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">{inr(hi)}</text>}
      {Math.abs(y(lo) - y(0)) > 14 && <text x={P.l - 6} y={H - P.b} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">{inr(lo)}</text>}
      {(['hard', 'base', 'easy'] as const).map((k) => <polyline key={k} points={line(k)} fill="none" stroke={COLOR[k]} strokeWidth={k === 'base' ? 3 : 2} strokeLinejoin="round" />)}
      <text x={P.l} y={H - 6} fontSize="11" fill="currentColor" fillOpacity="0.7">today</text>
      <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">+13 weeks</text>
    </svg>
  );
}

export function CashRunwayPage() {
  const [r, setR] = useState<Runway | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [od, setOd] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async (fresh = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/cash/runway${fresh ? '?fresh=1' : ''}`);
      if (!res.ok) throw new Error(`Could not load (${res.status})`);
      const j = (await res.json()) as Runway; setR(j); setErr(null); setOd(j.odLimit != null ? String(j.odLimit) : '');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load'); }
    setBusy(false);
  };
  useEffect(() => { void load(); }, []);
  const saveOd = async () => {
    const raw = od.replace(/[,\s₹]/g, '');
    if (raw !== '' && !/^\d+(\.\d+)?$/.test(raw)) { setErr('Type the limit in rupees, digits only (e.g. 5000000 for ₹50 L).'); return; }
    const res = await fetch('/api/cash/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ odLimit: raw === '' ? null : Number(raw) }) });
    if (!res.ok) { setErr('Could not save the limit'); return; }
    await load();
  };
  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader title="Cash runway" description="If the last months repeat, when does cash run out? 13 weeks, three cases."
        status={r ? <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BAND[r.status]}`}>{r.status === 'act' ? 'Act now' : r.status === 'watch' ? 'Watch' : r.status === 'ok' ? 'OK' : 'No data'}</span> : undefined}
        actions={<button type="button" onClick={() => void load(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden /> Refresh</button>} />
      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}
      {!r && !err && <div className="text-sm text-slate-500" role="status">Loading…</div>}
      {r && (
        <>
          <p className="text-base font-semibold text-slate-900" role="status">{r.line}</p>
          {r.weeks.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="p-4"><p className="text-xs text-slate-500">Net cash now</p><p className="mt-1 text-2xl font-semibold tabular-nums">{inr(r.netCash)}</p><p className="mt-1 text-xs text-slate-500">bank − overdraft, {r.basis} books</p></Card>
                {r.cases.map((c) => (
                  <Card key={c.id} className="p-4">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COLOR[c.id] }} />{c.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{inr(c.end)}</p>
                    <p className="mt-1 text-xs text-slate-500">in 13 weeks · {inr(c.perMonth)} a month</p>
                  </Card>
                ))}
              </div>
              <Card className="p-4"><Chart r={r} /></Card>
              <Disclosure title="Key dates" defaultOpen>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium">Case</th><th className="font-medium">Below zero</th><th className="font-medium">Overdraft limit</th><th className="text-right font-medium">Lowest</th></tr></thead>
                  <tbody>{r.cases.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="py-2">{c.label}</td><td>{nice(c.zeroOn)}</td><td>{r.odLimit == null ? 'set a limit' : nice(c.limitOn)}</td><td className="text-right tabular-nums">{inr(c.low)}</td></tr>)}</tbody>
                </table>
              </Disclosure>
            </>
          )}
          <Disclosure title="Overdraft limit" subtitle="Used only for the dates above">
            <div className="flex items-end gap-2 py-1">
              <label className="text-sm text-slate-700">Limit in ₹<input value={od} onChange={(e) => setOd(e.target.value)} inputMode="numeric" className="mt-1 block w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. 5000000" /></label>
              <button type="button" onClick={() => void saveOd()} className="rounded-lg bg-cta px-4 py-2 text-sm font-medium text-on-cta hover:bg-cta-hover">Save</button>
            </div>
          </Disclosure>
          <Disclosure title="How this is worked out">
            <ul className="list-disc space-y-1 pl-5 py-1">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </Disclosure>
        </>
      )}
    </div>
  );
}
