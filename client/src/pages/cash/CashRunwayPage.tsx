// Cash runway — 13 weeks ahead in three cases, from the stored Tally books. Numbers first; the chart is one glance.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { KpiTile } from '../../components/ui/KpiTile';
import { Modal } from '../../components/ui/overlays';
import { BTN, BTN_PRIMARY, Empty, ErrorBox, Loading, Panel } from '../../components/ui/states';

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
const nice = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'Not in 13 weeks');
const COLOR = { base: 'rgb(var(--chart-ink))', hard: 'rgb(var(--chart-heat))', easy: 'rgb(var(--chart-cmp))' } as const;
const BAND = { act: 'bg-red-50 border-red-200 text-red-800', watch: 'bg-amber-50 border-amber-200 text-amber-800', ok: 'bg-emerald-50 border-emerald-200 text-emerald-800', unknown: 'bg-slate-50 border-slate-200 text-slate-700' } as const;
const WORD = { act: 'Act now', watch: 'Watch', ok: 'OK', unknown: 'No data' } as const;

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
      {r.odLimit != null ? <><line x1={P.l} x2={W - P.r} y1={y(-r.odLimit)} y2={y(-r.odLimit)} stroke="rgb(var(--red-600))" strokeDasharray="4 3" /><text x={P.l - 6} y={y(-r.odLimit) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--red-700))">{inr(-r.odLimit)}</text><text x={W - P.r} y={y(-r.odLimit) - 4} textAnchor="end" fontSize="11" fill="rgb(var(--red-700))">Overdraft limit</text></> : null}
      {Math.abs(y(hi) - y(0)) > 14 && <text x={P.l - 6} y={P.t + 8} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">{inr(hi)}</text>}
      {Math.abs(y(lo) - y(0)) > 14 && (r.odLimit == null || Math.abs(y(lo) - y(-r.odLimit)) > 14) && <text x={P.l - 6} y={H - P.b} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">{inr(lo)}</text>}
      {(['hard', 'base', 'easy'] as const).map((k) => <polyline key={k} points={line(k)} fill="none" stroke={COLOR[k]} strokeWidth={k === 'base' ? 3 : 2} strokeLinejoin="round" />)}
      <text x={P.l} y={H - 6} fontSize="11" fill="currentColor" fillOpacity="0.7">Today</text>
      <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.7">+13 weeks</text>
    </svg>
  );
}

export function CashRunwayPage() {
  const [r, setR] = useState<Runway | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [od, setOd] = useState('');
  const [odErr, setOdErr] = useState<string | null>(null);
  const [odOpen, setOdOpen] = useState(false);
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
    if (raw !== '' && !/^\d+(\.\d+)?$/.test(raw)) { setOdErr('Type the limit in rupees, digits only. Example: 5000000 for ₹50 L.'); return; }
    const res = await fetch('/api/cash/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ odLimit: raw === '' ? null : Number(raw) }) });
    if (!res.ok) { setOdErr('Could not save the limit. Try again.'); return; }
    setOdErr(null); setOdOpen(false);
    await load();
  };
  const has = !!r && r.weeks.length > 0;
  return (
    <>
      <PageHeader title="Cash runway"
        description={has ? r!.line : 'Net cash for the next 13 weeks, in 3 cases.'}
        status={r ? <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BAND[r.status]}`}>{WORD[r.status]}</span> : undefined}
        help={r?.notes.length ? <ul className="list-disc space-y-1 pl-4">{r.notes.map((n, i) => <li key={i} className="!list-disc">{n}</li>)}</ul> : undefined}
        actions={<>
          <button type="button" onClick={() => { setOdErr(null); setOdOpen(true); }} className={BTN}>Overdraft limit{r?.odLimit != null ? `: ${inr(r.odLimit)}` : ''}</button>
          <button type="button" onClick={() => void load(true)} disabled={busy} className={BTN}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden /> Refresh</button>
        </>} />
      <PageBody>
        {err && <ErrorBox onRetry={() => void load(true)}>{err}</ErrorBox>}
        {!r && !err && <Loading />}
        {r && !has && (
          <Empty title={r.line} hint={r.notes[0]} action={<Link to="/reporting/mis/connectors" className={BTN}>Open Setup</Link>} />
        )}
        {has && r && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiTile label="Net cash now" value={inr(r.netCash)} sub={`Bank less overdraft · ${r.basis} books`} />
              {r.cases.map((c) => (
                <KpiTile key={c.id} label={c.label} value={inr(c.end)} tone={c.end < 0 ? 'critical' : 'default'}
                  sub={<><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COLOR[c.id] }} />In 13 weeks · {inr(c.perMonth)} a month</>} />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Net cash, next 13 weeks" className="lg:col-span-2"
                action={<ul className="flex flex-wrap gap-x-3 text-xs text-slate-600">{r.cases.map((c) => <li key={c.id} className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded" style={{ background: COLOR[c.id] }} />{c.label}</li>)}</ul>}>
                <Chart r={r} />
              </Panel>
              <Panel title="Key dates" flush>
                <ul className="divide-y divide-slate-100">
                  {r.cases.map((c) => (
                    <li key={c.id} className="px-4 py-3 text-sm">
                      <p className="flex items-center gap-1.5 font-semibold text-slate-900"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COLOR[c.id] }} />{c.label}</p>
                      <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
                        <div><dt className="text-slate-600">Below ₹0</dt><dd className={`font-medium ${c.zeroOn ? 'text-red-700' : 'text-slate-900'}`}>{nice(c.zeroOn)}</dd></div>
                        <div><dt className="text-slate-600">Hits limit</dt><dd className="font-medium text-slate-900">{r.odLimit == null ? 'No limit set' : nice(c.limitOn)}</dd></div>
                        <div><dt className="text-slate-600">Lowest</dt><dd className="font-medium tabular-nums text-slate-900">{inr(c.low)}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </>
        )}
      </PageBody>
      <Modal open={odOpen} onClose={() => setOdOpen(false)} title="Overdraft limit" subtitle="Used only for the “Hits limit” dates."
        footer={<><button type="button" onClick={() => setOdOpen(false)} className={BTN}>Cancel</button><button type="button" onClick={() => void saveOd()} className={BTN_PRIMARY}>Save limit</button></>}>
        <label className="block text-sm font-medium text-slate-700">Limit in ₹
          <input value={od} onChange={(e) => setOd(e.target.value)} inputMode="numeric" className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="5000000" aria-describedby="od-hint" />
        </label>
        <p id="od-hint" className="mt-1 text-xs text-slate-600">Digits only. Leave empty to remove the limit.</p>
        {odErr && <p role="alert" className="mt-2 text-sm text-red-700">{odErr}</p>}
      </Modal>
    </>
  );
}
