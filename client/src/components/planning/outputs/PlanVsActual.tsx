// Output view "Plan vs actual": our 5-year plan is the budget, the Live MIS months are what happened.
// Read only. Plain words for the team: 4 big numbers (arrow AND words), one chart, two folded lists.
// Maths: data/planning/planVsActual.ts. Actuals: the Live MIS deck on its Normalised basis.

import { useEffect, useMemo, useState } from 'react';
import { runPlan } from '../../../data/planning/engine';
import { basePlan, upgradePlan } from '../../../data/planning/basePlan';
import { runRateArr } from '../../../data/planning/growth';
import { METRIC_NAME, METRICS, buildPlanVsActual, monthsSubtitle, planMonthsOf, type ActualMonth, type MetricCmp, type MetricId, type MonthCmp, type PlanMonthRow, type Status } from '../../../data/planning/planVsActual';
import { actualMonthsFromDeck, UNITS_BASIS_NOTE } from '../../../data/planning/planVsActualLive';
import { loadLiveDeck } from '../../../data/misDeck/liveDeck';
import { PlanCard } from '../ui';
import { ErrorBox, InfoTip, Loading } from '../../ui/states';
import { Disclosure } from '../../ui/Disclosure';

interface Props { saved: { id: string; name: string }[] }

const istMonth = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);

// ---- words ----
const WORD: Record<Status, string> = { on_track: 'On track', behind: 'Behind plan', ahead: 'Ahead of plan' };
const ARROW: Record<Status, string> = { on_track: '►', behind: '▼', ahead: '▲' };
const TONE: Record<Status, { text: string; bg: string; bar: string }> = {
  on_track: { text: 'text-slate-700', bg: 'bg-slate-100', bar: 'rgb(var(--chart-ink))' },
  behind: { text: 'text-rose-700', bg: 'bg-rose-50', bar: 'rgb(var(--red-600))' },
  ahead: { text: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'rgb(var(--emerald-600))' },
};
/** ₹ in lakh below 1 Cr, else Cr. */
function inr(v: number, signed = false): string {
  const s = v < 0 ? '−' : signed && v > 0 ? '+' : '';
  const a = Math.abs(v);
  if (a >= 1e7) return `${s}₹${(a / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  return `${s}₹${(a / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
}
const units = (v: number, signed = false) => (v < 0 ? '−' : signed && v > 0 ? '+' : '') + Math.round(Math.abs(v)).toLocaleString('en-IN');
const fmt = (id: MetricId, v: number, signed = false) => (id === 'units' ? units(v, signed) : inr(v, signed));
const pctWords = (c: Pick<MetricCmp, 'gapPct' | 'status'>) => (c.status == null ? '' : c.gapPct == null ? WORD[c.status] : `${Math.abs(c.gapPct * 100).toFixed(1)}% ${c.status === 'behind' ? 'below plan' : c.status === 'ahead' ? 'above plan' : 'from plan'}`);

function Pill({ status }: { status: Status | null }) {
  if (!status) return <span className="inline-flex min-h-[28px] items-center rounded-full bg-slate-100 px-2.5 text-[12px] font-semibold text-slate-500">No data yet</span>;
  const t = TONE[status];
  return <span className={`inline-flex min-h-[28px] items-center gap-1 rounded-full px-2.5 text-[12px] font-bold ${t.bg} ${t.text}`}><span aria-hidden>{ARROW[status]}</span>{WORD[status]}</span>;
}

function BigNumber({ n, label, value, c, sub }: { n: number; label: string; value: string | null; c: Pick<MetricCmp, 'gapPct' | 'status'> | null; sub: string }) {
  const st = c?.status ?? null;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-surface p-4 shadow-card" data-testid={`pva-big-${n}`}>
      <div className="flex items-center gap-2 text-[12px] font-bold text-slate-600">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[12px] text-white">{n}</span>{label}
      </div>
      <div className="mt-2 text-[28px] font-extrabold leading-tight tabular-nums text-slate-900">{value ?? 'No data yet'}</div>
      {st && c ? (
        <div className={`mt-1 text-[14px] font-bold ${TONE[st].text}`}><span aria-hidden>{ARROW[st]}</span> {pctWords(c)}</div>
      ) : (
        <div className="mt-1 text-[14px] font-semibold text-slate-600">Waiting for the books</div>
      )}
      <div className="mt-1 text-[12px] text-slate-500">{sub}</div>
    </div>
  );
}

// ---- chart: plan bar next to actual bar, one pair per month ----
function Chart({ months, metric }: { months: MonthCmp[]; metric: MetricId }) {
  const W = Math.max(320, 56 * months.length + 48), H = 220, padL = 44, padB = 34, padT = 14;
  const vals = months.flatMap((m) => [m.metrics[metric].plan, m.metrics[metric].actual ?? 0]);
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const span = hi - lo || 1;
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - lo) / span);
  const bw = (W - padL - 8) / months.length;
  const ticks = [lo, lo + span / 2, hi];
  const short = (v: number) => (metric === 'units' ? Math.round(v).toLocaleString('en-IN') : Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : `${(v / 1e5).toFixed(0)}L`);
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, 520) }} className="w-full" role="img" aria-label={`${METRIC_NAME[metric]}: plan and actual by month`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="rgb(var(--n-200))" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="rgb(var(--n-500))">{short(t)}</text>
          </g>
        ))}
        <line x1={padL} x2={W - 4} y1={y(0)} y2={y(0)} stroke="rgb(var(--n-400))" />
        {months.map((m, i) => {
          const c = m.metrics[metric];
          const x0 = padL + i * bw + bw * 0.12, w = bw * 0.38;
          const bar = (v: number) => ({ y: Math.min(y(v), y(0)), h: Math.abs(y(v) - y(0)) });
          const p = bar(c.plan);
          const st = c.status;
          return (
            <g key={m.key}>
              <rect x={x0} width={w} y={p.y} height={Math.max(p.h, 1)} fill="rgb(var(--chart-cmp))"><title>{m.label} plan {fmt(metric, c.plan)}</title></rect>
              {c.actual != null ? (() => { const a = bar(c.actual); return <rect x={x0 + w + 2} width={w} y={a.y} height={Math.max(a.h, 1)} fill={st ? TONE[st].bar : 'rgb(var(--chart-ink))'} opacity={m.state === 'running' || m.state === 'partial' ? 0.55 : 1}><title>{m.label} actual {fmt(metric, c.actual)}{m.state === 'running' ? ' (month not finished)' : m.state === 'partial' ? ' (books not complete, not counted)' : ''}</title></rect>; })()
                : <text x={x0 + w + 2 + w / 2} y={y(0) - 6} textAnchor="middle" fontSize="9" fill="rgb(var(--n-500))">no data</text>}
              <text x={x0 + w} y={H - 16} textAnchor="middle" fontSize="10" fill="rgb(var(--n-600))">{m.label}</text>
              {(m.state === 'running' || m.state === 'partial') && <text x={x0 + w} y={H - 4} textAnchor="middle" fontSize="9" fill="rgb(var(--n-500))">{m.state === 'running' ? 'so far' : 'partial'}</text>}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'rgb(var(--chart-cmp))' }} />Plan</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TONE.on_track.bar }} />Actual: on track</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TONE.behind.bar }} />Actual: behind</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TONE.ahead.bar }} />Actual: ahead</span>
      </div>
    </div>
  );
}

function rowsOf(p: ReturnType<typeof basePlan>): PlanMonthRow[] { const r = runPlan(p); return planMonthsOf(r, p.startMonth, (e) => runRateArr(r, e)); }

export function PlanVsActualView({ saved }: Props) {
  const [scn, setScn] = useState('base');
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [actuals, setActuals] = useState<ActualMonth[] | null>(null);
  const [deckErr, setDeckErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricId>('revenue');
  const [stored, setStored] = useState<'idle' | 'ok' | 'fail'>('idle');

  // the plan: Base from the engine, a saved scenario from its saved plan (opened when it is picked)
  const baseRows = useMemo(() => rowsOf(basePlan()), []);
  const [scnRows, setScnRows] = useState<PlanMonthRow[] | null>(null);
  const choose = (id: string) => {
    setScn(id); setPlanErr(null); setScnRows(null);
    if (id === 'base') return;
    fetch(`/api/planning/scenarios/${id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not open that scenario.'))))
      .then((s: { plan: ReturnType<typeof basePlan> }) => setScnRows(rowsOf(upgradePlan(s.plan))))
      .catch((e: Error) => setPlanErr(e.message));
  };
  const plan = scn === 'base' ? baseRows : scnRows;

  // the actuals: the Live MIS deck (shared load, cached for 2 minutes)
  useEffect(() => {
    let live = true;
    loadLiveDeck().then((d) => { if (live) setActuals(actualMonthsFromDeck(d, '2026-10')); })
      .catch((e: unknown) => { if (live) setDeckErr(e instanceof Error ? e.message : 'Could not load the MIS.'); });
    return () => { live = false; };
  }, []);

  // keep a copy on the server so the assistant (MCP tool mis_get_plan_vs_actual) can answer without the browser
  useEffect(() => {
    if (!actuals || !actuals.length) return;
    fetch('/api/planning/actuals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: actuals }) })
      .then((r) => setStored(r.ok ? 'ok' : 'fail')).catch(() => setStored('fail'));
  }, [actuals]);

  const asOf = istMonth();
  const r = useMemo(() => (plan && actuals ? buildPlanVsActual(plan, actuals, asOf) : null), [plan, actuals, asOf]);

  const scnName = scn === 'base' ? 'Base plan' : saved.find((s) => s.id === scn)?.name ?? 'Saved plan';
  const t = r?.ytd?.totals;
  const arr = r?.arr ?? null;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="pva-scn" className="text-[13px] font-medium text-slate-600">Compare with</label>
        <select id="pva-scn" value={scn} onChange={(e) => choose(e.target.value)} className="min-h-11 sm:min-h-9 max-w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium">
          <option value="base">Base plan</option>
          {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <InfoTip label="How plan and actual are compared" width={360}>
          <p>Plan = the 5-year plan. Actual = the Live MIS, with normalised costs.</p>
          <p>On track = within 5% of plan. A month with no data shows &quot;No data yet&quot;, never 0.</p>
          <p>The month in progress shows, but the big numbers do not count it.</p>
          <p>Exit ARR pace = the last 3 closed months × 4, compared with the plan for the same months. The gap is carried to {arr?.fyEndLabel ?? 'the end of the year'}.</p>
          {r?.notes.map((n) => <p key={n}>{n}</p>)}
          <p>{UNITS_BASIS_NOTE}</p>
          {stored === 'ok' && <p>These actuals are saved for the assistant.</p>}
          {stored === 'fail' && <p>The actuals were not saved for the assistant.</p>}
        </InfoTip>
      </div>

      {planErr && <ErrorBox>{planErr}</ErrorBox>}
      {deckErr && <ErrorBox>{deckErr}</ErrorBox>}
      {!r && !planErr && !deckErr && <Loading label="Loading the plan and the MIS" />}

      {r && (
        <>
          <section aria-label="Big numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <BigNumber n={1} label="Revenue vs plan" value={t?.revenue ? inr(t.revenue.actual as number) : null} c={t?.revenue ?? null}
              sub={t?.revenue ? `Plan ${inr(t.revenue.plan)} · gap ${inr(t.revenue.gap as number, true)} · ${r.ytd?.fromLabel} to ${r.ytd?.toLabel}` : 'No closed month yet'} />
            <BigNumber n={2} label="EBITDA vs plan" value={t?.ebitda ? inr(t.ebitda.actual as number) : null} c={t?.ebitda ?? null}
              sub={t?.ebitda ? `Plan ${inr(t.ebitda.plan)} · gap ${inr(t.ebitda.gap as number, true)}` : 'Waiting for the Tally P&L'} />
            <BigNumber n={3} label="Units vs plan" value={t?.units ? units(t.units.actual as number) : null} c={t?.units ?? null}
              sub={t?.units ? `Plan ${units(t.units.plan)} · gap ${units(t.units.gap as number, true)}` : 'No units yet'} />
            <BigNumber n={4} label="Exit ARR pace" value={arr?.projectedExitArr != null ? inr(arr.projectedExitArr) : null}
              c={arr?.status ? { status: arr.status, gapPct: arr.planExitArr ? (arr.gap as number) / Math.abs(arr.planExitArr) : null } : null}
              sub={arr ? `Plan for ${arr.fyEndLabel}: ${inr(arr.planExitArr)} · now ${inr(arr.actualArr)} a year` : 'Needs one closed month'} />
          </section>

          <PlanCard title={`Month by month · ${scnName}`} info="Left bar = plan. Right bar = actual."
            action={
              <select aria-label="What to show" value={metric} onChange={(e) => setMetric(e.target.value as MetricId)} className="min-h-11 sm:min-h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium">
                {METRICS.map((id) => <option key={id} value={id}>{METRIC_NAME[id]}</option>)}
              </select>
            }>
            {r.months.length ? <Chart months={r.months} metric={metric} /> : <p className="text-[14px] text-slate-600">{r.notes[0] ?? 'No data yet.'}</p>}
          </PlanCard>

          <Disclosure
            title="1. Behind plan"
            badge={<span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${r.behind.length ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{r.behind.length}</span>}
            subtitle={r.behind.length ? `Biggest gap: ${r.behind[0].label} ${METRIC_NAME[r.behind[0].metric]}, ${inr(r.behind[0].gap, true)}.` : 'No closed month is behind plan.'}>
            {r.behind.length ? (
              <ol className="space-y-2">
                {r.behind.map((b, i) => (
                  <li key={b.key + b.metric} className="flex min-h-[44px] items-start gap-3 rounded-lg bg-rose-50/50 px-3 py-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[12px] font-bold text-white">{i + 1}</span>
                    <span className="text-[14px] text-slate-800"><b>{b.label} {METRIC_NAME[b.metric]}</b><br />
                      <span className="font-bold text-rose-700"><span aria-hidden>▼</span> {inr(Math.abs(b.gap))} behind plan{b.gapPct != null ? ` (${Math.abs(b.gapPct * 100).toFixed(1)}% below)` : ''}</span></span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-[14px] text-slate-600">Nothing to fix here.</p>}
          </Disclosure>

          <Disclosure
            title="2. All months"
            subtitle={monthsSubtitle(r)}>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-[13px] tabular-nums">
                <thead><tr className="border-b border-slate-200 text-left text-[12px] text-slate-500"><th className="py-2 pr-3">Month</th><th className="pr-3 text-right">Plan</th><th className="pr-3 text-right">Actual</th><th className="pr-3 text-right">Gap</th><th>Status</th></tr></thead>
                <tbody>
                  {r.months.map((m) => { const c = m.metrics.revenue; return (
                    <tr key={m.key} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-semibold">{m.label}{m.state === 'running' ? ' (so far)' : m.state === 'partial' ? ' (partial)' : ''}</td>
                      <td className="pr-3 text-right">{inr(c.plan)}</td>
                      <td className="pr-3 text-right">{c.actual == null ? 'No data yet' : inr(c.actual)}</td>
                      <td className="pr-3 text-right">{c.gap == null ? '–' : `${inr(c.gap, true)} (${c.gapPct == null ? '–' : (c.gapPct * 100).toFixed(1) + '%'})`}</td>
                      <td>{m.state === 'running' ? <span className="text-[12px] font-semibold text-slate-500">Month not finished</span> : m.state === 'partial' ? <span className="text-[12px] font-semibold text-slate-500">Books not complete</span> : <Pill status={m.status} />}</td>
                    </tr>); })}
                </tbody>
              </table>
              <p className="mt-2 text-[12px] text-slate-600">Net revenue.</p>
            </div>
            <ul className="space-y-2 sm:hidden">
              {r.months.map((m) => { const c = m.metrics.revenue; return (
                <li key={m.key} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2"><b className="text-[14px]">{m.label}</b>{m.state === 'running' ? <span className="text-[12px] font-semibold text-slate-500">Month not finished</span> : m.state === 'partial' ? <span className="text-[12px] font-semibold text-slate-500">Books not complete</span> : <Pill status={m.status} />}</div>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[13px] text-slate-700">
                    <span>Plan</span><span className="text-right font-semibold">{inr(c.plan)}</span>
                    <span>Actual</span><span className="text-right font-semibold">{c.actual == null ? 'No data yet' : inr(c.actual)}</span>
                    <span>Gap</span><span className="text-right font-semibold">{c.gap == null ? '–' : inr(c.gap, true)}</span>
                  </div>
                </li>); })}
            </ul>
          </Disclosure>

        </>
      )}
    </div>
  );
}
