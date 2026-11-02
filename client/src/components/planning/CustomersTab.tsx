// Products & customers: the D2C customer model (new buyers × AOV + repeats by cohort, learned from
// Shopify), seasonality per product, and the product roll-out.

import { useEffect, useMemo, useState } from 'react';
import { calOf, monthLabel, type D2CModel, type Plan, type PlanResult } from '../../data/planning/engine';
import { d2cModelFrom, fitD2C, predictRepeats, type Cohort } from '../../data/planning/history';
import { learnSkuSeason } from '../../data/planning/basePlan';
import { SectionCard } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import { cr, int, pct } from './fmt';
import { NumInput } from './inputs';
import type { Update } from './LeverPanel';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface StoredHistory {
  source: string; asOf: string; orders: number; customers: number; skipped: { cancelled: number; test: number; outlier: number };
  history: D2CModel['history']; cohorts: Cohort[];
}
type Job = { status: 'running' | 'done' | 'failed'; startedAt: string; error?: string } | null;

export function CustomersTab({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  return (
    <div className="space-y-5">
      <D2CCard plan={plan} r={r} update={update} />
      <SeasonCard plan={plan} update={update} />
      <RolloutCard plan={plan} r={r} update={update} />
    </div>
  );
}

// ---- D2C customers -----------------------------------------------------------------

function D2CCard({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const d = plan.d2c;
  const [stored, setStored] = useState<StoredHistory | null>(null);
  const [job, setJob] = useState<Job>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/planning/history').then((x) => x.json()).then((j: { history: StoredHistory | null; job: Job }) => {
      setStored(j.history); setJob(j.job);
    }).catch(() => {});
  }, []);

  // keep polling while a refresh runs (also after a page reload)
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = window.setInterval(() => {
      fetch('/api/planning/history').then((x) => x.json()).then((j: { history: StoredHistory | null; job: Job }) => {
        setJob(j.job); if (j.job?.status !== 'running') setStored(j.history);
      }).catch(() => {});
    }, 4000);
    return () => window.clearInterval(t);
  }, [job?.status]);

  const refresh = async () => {
    setErr('');
    setJob({ status: 'running', startedAt: new Date().toISOString() });
    try {
      const res = await fetch('/api/planning/history/refresh', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Refresh failed (${res.status})`);
      setJob(j.job); if (j.history) setStored(j.history);
    } catch (e) { setErr((e as Error).message); setJob(null); }
  };

  const learned = useMemo(() => (stored ? fitD2C(stored.history, stored.cohorts) : null), [stored]);
  const newer = stored && stored.asOf > d.asOf;
  const apply = () => {
    if (!stored || !learned) return;
    update((p) => {
      const keep = { mode: p.d2c.mode, repeatBoost: p.d2c.repeatBoost };
      p.d2c = { ...d2cModelFrom(stored.history, learned, stored.source, stored.asOf), ...keep };
    });
  };
  const resetToLearned = () => update((p) => {
    const f = stored && learned ? learned : fitD2C(p.d2c.history);
    const keep = { mode: p.d2c.mode, repeatBoost: 1 };
    p.d2c = { ...d2cModelFrom(stored ? stored.history : p.d2c.history, f, stored ? stored.source : p.d2c.source, stored ? stored.asOf : p.d2c.asOf), ...keep };
  });
  const set = <K extends keyof D2CModel>(k: K, v: D2CModel[K]) => update((p) => { p.d2c[k] = v; p.d2c.fit = { ...p.d2c.fit, note: p.d2c.fit.note.replace(/ \(edited\)$/, '') + ' (edited)' }; });

  const pred = useMemo(() => predictRepeats(d.history, d), [d]);
  const cohortsOn = d.mode === 'cohorts';
  const avgYear = (rate: number) => rate * 12; // season averages to 1

  return (
    <SectionCard
      title="D2C customers"
      description="D2C revenue = new buyers × AOV + repeat orders from everyone who bought before. In the sheet's months, new buyers are back-solved from its D2C revenue; from FY29 they grow with the D2C growth lever and repeats build on top."
      actions={
        <SegmentedControl size="sm" value={d.mode} onChange={(v) => update((p) => { p.d2c.mode = v; })}
          options={[{ id: 'cohorts', label: 'Customers' }, { id: 'units', label: 'Units' }]} aria-label="D2C model" />
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        <div className="min-w-0 flex-1">
          <div><b className="text-slate-800">Learned from:</b> {d.source} · as of {d.asOf}{d.fit.r2 != null && <> · fits history at R² {d.fit.r2.toFixed(2)}</>}</div>
          <div className="mt-0.5 text-slate-500">{d.fit.note}</div>
          {stored && (
            <div className="mt-1 text-slate-500">
              Last Shopify refresh: {int(stored.orders)} orders, {int(stored.customers)} buyers, as of {stored.asOf}
              {stored.skipped.outlier > 0 && ` · ${stored.skipped.outlier} order(s) over ₹2 lakh skipped`}
            </div>
          )}
          {err && <div className="mt-1 text-rose-600">{err}</div>}
          {job?.status === 'failed' && <div className="mt-1 text-rose-600">Refresh failed: {job.error}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {newer && learned && (
            <button onClick={apply} className="rounded-lg bg-cta px-3 py-1.5 text-xs font-semibold text-on-cta hover:bg-cta-hover">
              Use Shopify cohorts ({stored!.asOf})
            </button>
          )}
          <button onClick={refresh} disabled={job?.status === 'running'} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {job?.status === 'running' ? 'Reading Shopify orders…' : 'Refresh from Shopify orders'}
          </button>
          <button onClick={resetToLearned} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">Reset to learned</button>
        </div>
      </div>

      <div className={`mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 ${cohortsOn ? '' : 'pointer-events-none opacity-50'}`}>
        <Field label="Same-month 2nd order" hint="Share of new buyers who order again that month (× season — higher in winter)">
          <NumInput unit="pct" value={d.sameMonth} min={0} max={1} width="w-16" title="Same-month repeat" onChange={(v) => set('sameMonth', v)} />
        </Field>
        <Field label="Next-month reorder" hint="Share reordering the month after">
          <NumInput unit="pct" value={d.nextMonth} min={0} max={1} width="w-16" title="Next-month repeat" onChange={(v) => set('nextMonth', v)} />
        </Field>
        <Field label="Months 2–11, per month" hint={`≈ ${pct(avgYear(d.monthly), 1)} of buyers over that year`}>
          <NumInput unit="pct" value={d.monthly} min={0} max={0.2} width="w-16" title="Monthly repeat 2-11" onChange={(v) => set('monthly', v)} />
        </Field>
        <Field label="Year 2+, per month" hint={`Winter re-buys, replacements. ≈ ${pct(avgYear(d.yearly), 1)} a year, fading each year`}>
          <NumInput unit="pct" value={d.yearly} min={0} max={0.2} width="w-16" title="Yearly repeat" onChange={(v) => set('yearly', v)} />
        </Field>
        <Field label="Yearly fade" hint="Year-3 rate = year-2 × this, and so on">
          <NumInput unit="x" value={d.yearlyFade} min={0} max={1.5} step={0.05} width="w-16" title="Yearly fade" onChange={(v) => set('yearlyFade', v)} />
        </Field>
        <Field label="Repeat boost" hint="Scales every repeat rate — loyalty (hCoins), reminders, bundles. 1× = as learned">
          <NumInput unit="x" value={d.repeatBoost} min={0} max={5} step={0.1} width="w-16" title="Repeat boost" onChange={(v) => update((p) => { p.d2c.repeatBoost = v; })} />
        </Field>
        <Field label="AOV — new buyers" hint="At order time, before returns (sheet basis). Grows with the price lever.">
          <NumInput value={d.aovNew} min={0} width="w-24" title="AOV new" onChange={(v) => set('aovNew', v)} />
        </Field>
        <Field label="AOV — repeat orders">
          <NumInput value={d.aovRepeat} min={0} width="w-24" title="AOV repeat" onChange={(v) => set('aovRepeat', v)} />
        </Field>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <h4 className="mb-1 text-[12px] font-bold text-slate-700">History: repeat orders, actual vs model</h4>
          <HistoryChart h={d.history} pred={pred} />
        </div>
        <div className="overflow-x-auto">
          <h4 className="mb-1 text-[12px] font-bold text-slate-700">Plan by year</h4>
          <table className="w-full text-[12.5px] tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 text-left font-semibold" />
                {r.years.map((y) => <th key={y.fy} className="px-2 py-1.5 text-right font-semibold">{y.fy}{y.months < 12 ? '*' : ''}</th>)}
              </tr>
            </thead>
            <tbody>
              {([
                ['New buyers', (y) => int(y.d2cNewCustomers)],
                ['Repeat orders', (y) => int(y.d2cRepeatOrders)],
                ['Repeat share of D2C ₹', (y) => pct(y.d2cRepeatRevenue / ((y.d2cNewRevenue + y.d2cRepeatRevenue) || 1))],
                ['D2C revenue (₹ Cr)', (y) => cr(y.revenueByChannel.D)],
                ['Avg new buyers / month', (y) => int(y.d2cNewCustomers / y.months)],
              ] as [string, (y: PlanResult['years'][number]) => string][]).map(([label, f]) => (
                <tr key={label} className="border-b border-slate-100">
                  <td className="py-1 pr-2 text-slate-600">{label}</td>
                  {r.years.map((y) => <td key={y.fy} className="px-2 py-1 text-right text-slate-800">{cohortsOn ? f(y) : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {cohortsOn && <BaseCheck r={r} d={d} />}
        </div>
      </div>
    </SectionCard>
  );
}

function BaseCheck({ r, d }: { r: PlanResult; d: D2CModel }) {
  // what the sheet's D2C plan asks for, vs what the store actually did last year
  const last12 = d.history.slice(-12);
  const actualPerMonth = last12.reduce((a, x) => a + x.newCustomers, 0) / (last12.length || 1);
  const fy28 = r.years.find((y) => y.fy === 'FY28');
  if (!fy28) return null;
  const need = fy28.d2cNewCustomers / fy28.months;
  return (
    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
      The sheet's FY28 D2C revenue needs ~{int(need)} new buyers a month at these AOVs and repeat rates, vs ~{int(actualPerMonth)} a month over the last 12 months of Shopify history ({(need / (actualPerMonth || 1)).toFixed(1)}×).
    </p>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] text-slate-700">
      <span>{label}{hint && <span className="block text-[11px] leading-snug text-slate-400">{hint}</span>}</span>
      {children}
    </label>
  );
}

function HistoryChart({ h, pred }: { h: D2CModel['history']; pred: number[] }) {
  const rows = h.map((x, i) => ({ ...x, pred: pred[i] })).filter((x, i, a) => i >= a.findIndex((y) => y.newCustomers > 50));
  if (!rows.length) return <p className="text-[12px] text-slate-500">No history yet.</p>;
  const W = 560, H = 170, pl = 34, pb = 20, pt = 8;
  const max = Math.max(...rows.map((x) => Math.max(x.repeatOrders, x.pred)), 1);
  const bw = (W - pl - 6) / rows.length;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Repeat orders by month, actual vs model">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - 4} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" />
          <text x={pl - 4} y={y(max * t) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(max * t)}</text>
        </g>
      ))}
      {rows.map((x, i) => (
        <g key={x.month}>
          <rect x={pl + i * bw + bw * 0.15} width={bw * 0.7} y={y(x.repeatOrders)} height={y(0) - y(x.repeatOrders)} fill="#fdba74"><title>{x.month}: {x.repeatOrders} repeat orders (model {Math.round(x.pred)})</title></rect>
          {(i % 2 === 0) && <text x={pl + i * bw + bw / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="#64748b">{MON[Number(x.month.slice(5)) - 1]}{x.month.slice(2, 4)}</text>}
        </g>
      ))}
      <path d={rows.map((x, i) => `${i ? 'L' : 'M'}${pl + i * bw + bw / 2},${y(x.pred)}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth="1.75" />
      <text x={W - 6} y={pt + 10} textAnchor="end" fontSize="10" fill="#475569">bars = actual · line = model</text>
    </svg>
  );
}

// ---- Seasonality ---------------------------------------------------------------------

function SeasonCard({ plan, update }: { plan: Plan; update: Update }) {
  const shape = plan.levers.seasonShape ?? 'plan';
  const rows: { id: string; name: string; v: number[]; set: (i: number, x: number) => void }[] = [
    ...plan.skus.map((s) => ({
      id: s.id, name: s.name, v: plan.skuSeason[s.id] ?? Array(12).fill(1),
      set: (i: number, x: number) => update((p) => { (p.skuSeason[s.id] ??= Array(12).fill(1))[i] = x; }),
    })),
    { id: 'd2c', name: 'D2C new buyers (Shopify)', v: plan.d2c.season, set: (i: number, x: number) => update((p) => { p.d2c.season[i] = x; }) },
  ];
  // Oct first, the way the business sees the year
  const order = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  const tint = (x: number) => `rgb(var(--accent-600) / ${Math.min(0.85, Math.max(0, x / 4))})`;
  return (
    <SectionCard
      title="Seasonality"
      description="Each month's share of a normal month (1.0 = average). Products: last year's actual units, all channels (Oct-25 → Sep-26, from the sheet). D2C: new buyers on Shopify. Click a cell to change it."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl size="sm" value={shape} onChange={(v) => update((p) => { p.levers.seasonShape = v; })}
            options={[{ id: 'plan', label: "FY29+ follows the sheet's shape" }, { id: 'history', label: 'FY29+ follows these curves' }]} aria-label="Seasonality used after the base" />
          <button onClick={() => update((p) => { p.skuSeason = learnSkuSeason(p); })} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">Reset products</button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="pr-3 text-left font-semibold">Product</th>
              {order.map((i) => <th key={i} className="w-12 px-0.5 text-center font-semibold">{MON[i]}</th>)}
              <th className="pl-3 text-right font-semibold">Peak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const peak = order.reduce((a, i) => (row.v[i] > row.v[a] ? i : a), order[0]);
              const top3 = [...order].sort((a, b) => row.v[b] - row.v[a]).slice(0, 3).reduce((a, i) => a + row.v[i], 0) / 12;
              return (
                <tr key={row.id} className={row.id === 'd2c' ? 'border-t-2 border-slate-200' : ''}>
                  <td className="whitespace-nowrap py-0.5 pr-3 text-slate-700">{row.name}</td>
                  {order.map((i) => (
                    <td key={i} className="px-0.5 py-0.5">
                      <input
                        type="number" step="0.1" min="0" aria-label={`${row.name} ${MON[i]}`}
                        defaultValue={row.v[i].toFixed(2)} key={row.v[i].toFixed(3)}
                        onBlur={(e) => { const x = Number(e.target.value); if (Number.isFinite(x) && x >= 0 && Math.abs(x - row.v[i]) > 1e-6) row.set(i, x); }}
                        className="w-12 rounded border-0 px-1 py-1 text-center text-[11.5px] font-semibold outline-none focus:ring-2 focus:ring-brand-300"
                        style={{ background: tint(row.v[i]), color: row.v[i] > 2 ? '#fff' : '#0f172a' }}
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap pl-3 text-right text-slate-500" title="Share of the year's volume in the top 3 months">{MON[peak]} · top-3 {pct(top3, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Products with little history (hGo, hBoots, hPulse) borrow the whole range's curve. Values don't need to average 1 — the planner uses them as typed.</p>
    </SectionCard>
  );
}

// ---- Product roll-out ------------------------------------------------------------------

function RolloutCard({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const items = [
    ...plan.skus.map((s) => ({ id: s.id, name: s.name, isNew: false })),
    ...plan.products.filter((p) => p.on).map((p) => ({ id: p.id, name: p.name, isNew: true })),
  ];
  const ms = r.months;
  return (
    <SectionCard title="Product roll-out" description="Monthly units across the plan — launches, ramps and seasons. New products are added and edited on the Revenue tab; pick which season each follows here.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12px] tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3 text-left font-semibold">Product</th>
              <th className="px-2 text-left font-semibold">First sale</th>
              <th className="px-2 text-left font-semibold">Units by month · {ms[0].label} → {ms[ms.length - 1].label}</th>
              <th className="px-2 text-right font-semibold">FY31 units</th>
              <th className="pl-2 text-left font-semibold">Season</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const series = ms.map((m) => m.unitsBySku[it.id] ?? 0);
              const firstIdx = series.findIndex((v) => v > 0.5);
              const fy31 = ms.filter((m) => m.fy === 'FY31').reduce((a, m) => a + (m.unitsBySku[it.id] ?? 0), 0);
              const prod = plan.products.find((p) => p.id === it.id);
              return (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">{it.name}{it.isNew && <span className="ml-1.5 rounded bg-violet-50 px-1 text-[10px] text-violet-700">new</span>}</td>
                  <td className="px-2 text-slate-500">{firstIdx >= 0 ? monthLabel(plan.startMonth, firstIdx + 1) : '—'}</td>
                  <td className="px-2"><Spark v={series} base={r.base} /></td>
                  <td className="px-2 text-right text-slate-800">{fy31 ? int(fy31) : '–'}</td>
                  <td className="pl-2">
                    {prod ? (
                      <select value={prod.seasonRef ?? 'flat'} onChange={(e) => update((p) => { const x = p.products.find((q) => q.id === it.id); if (x) x.seasonRef = e.target.value; })}
                        className="rounded-md border border-slate-200 px-1 py-0.5 text-[12px]">
                        <option value="flat">Flat (no season)</option>
                        {plan.skus.map((s) => <option key={s.id} value={s.id}>Like {s.name}</option>)}
                      </select>
                    ) : <span className="text-slate-400">its own (above)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Peak month of the plan: {(() => { const i = ms.reduce((a, m, j) => (m.units > ms[a].units ? j : a), 0); return `${ms[i].label}, ${int(ms[i].units)} units (${MON[calOf(plan.startMonth, i + 1)]})`; })()}. Check it against factory capacity.</p>
    </SectionCard>
  );
}

function Spark({ v, base }: { v: number[]; base: number }) {
  const W = 300, H = 26, max = Math.max(...v, 1);
  const bw = W / v.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[26px] w-[300px]" aria-hidden="true">
      {v.map((x, i) => <rect key={i} x={i * bw} width={Math.max(1, bw - 1)} y={H - (x / max) * H} height={(x / max) * H} fill={i >= base ? 'rgb(var(--accent-300))' : 'rgb(var(--accent-600))'} />)}
    </svg>
  );
}
