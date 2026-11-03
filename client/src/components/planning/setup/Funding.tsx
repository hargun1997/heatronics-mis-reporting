// Setup → Funding (docs/planning/ONE-SETUP.md §2.8): seed / venture debt / overdraft terms, the sheet's timeline events,
// how rounds are sized, the rounds themselves (inputs + Sold / holders-keep feedback) and the Indian D2C benchmarks with
// "Add these rounds as a starting point". Sizing itself happens in Targets → Fit; nothing here runs the engine.

import { useMemo } from 'react';
import { monthLabel, type CashEvent, type Plan, type PlanFx } from '../../../data/planning/engine';
import { founderFx } from '../../../data/planning/basePlan';
import { defaultFunding, dilution, emptyGrowth } from '../../../data/planning/growth';
import { summary, mergeBenchRounds, roundsFromDefaults, seedMonth, BENCH_PREFIX } from '../../../data/planning/setup/funding';
import { FUNDING_DEFAULTS, type Range3 } from '../../../data/planning/setup/fundingDefaults';
import { NumInput } from '../inputs';
import { cr, money, pct } from '../fmt';
import type { SetupSectionDef, SetupSectionProps } from './types';
import { CR, Check, Flag, MonthSelect, Note, Row, SubHead, btn, ensureFx, ensureGrowth, monthsOf, newId, rm, td, th, thr, txt } from './shared';

// The §1 skeleton exports `summary` and `SECTION` beside the component (react-refresh accepts only components).
// eslint-disable-next-line react-refresh/only-export-components
export { summary };

const KIND: Record<CashEvent['kind'], string> = { equity: 'Equity raise', debtDrawn: 'Debt drawn', debtRepaid: 'Debt repaid' };

const range = (r: Range3, f: (v: number) => string) => `${f(r.typical)} (${f(r.min)}–${f(r.max)})`;
const crRange = (v: number) => `₹${v} Cr`;
const xRange = (v: number) => `${v}×`;
const pctRange = (v: number) => pct(v, 0);

export function Section({ plan, update, result }: SetupSectionProps) {
  const months = useMemo(() => monthsOf(result), [result]);
  const parity = !plan.fx || plan.fx.sheetParity;
  // shown values: the plan's fx, or what the first edit will apply (ensureFx → founder decisions)
  const fx: PlanFx = plan.fx ?? founderFx(plan.cash);
  const G = plan.growth;
  const seedPreMoney = G?.seedPreMoney ?? emptyGrowth().seedPreMoney;
  const funding = { ...defaultFunding(), ...(G?.funding ?? {}) };
  const rounds = G?.rounds ?? [];

  const setFx = (fn: (f: PlanFx) => void) => update((p) => { fn(ensureFx(p)); });
  const setG = (fn: (g: NonNullable<Plan['growth']>) => void) => update((p) => { fn(ensureGrowth(p)); });
  const setFunding = (k: keyof typeof funding, v: number) => setG((g) => { g.funding = { ...defaultFunding(), ...(g.funding ?? {}), [k]: v }; });

  // feedback: ownership sold per round (the seed row is shown even before the growth layer exists)
  const dil = useMemo(() => dilution(G ? plan : { ...plan, growth: emptyGrowth() }), [plan, G]);
  const seedRow = dil.find((d) => d.name === 'Seed');
  const bench = useMemo(() => roundsFromDefaults(plan, result), [plan, result]);
  const horizon = result.months.length;
  const seedM = seedMonth(plan);
  const clamped = FUNDING_DEFAULTS.rounds.filter((d) => seedM + d.timing.afterSeedMonths > horizon);
  const hasBench = rounds.some((r) => r.id.startsWith(BENCH_PREFIX));

  const addBenchmarkRounds = () => update((p) => {
    const g = ensureGrowth(p);
    const b = roundsFromDefaults(p, result);
    g.rounds = mergeBenchRounds(g.rounds, b.rounds);
    if (b.preMoneyMultiple != null) g.funding = { ...defaultFunding(), ...(g.funding ?? {}), preMoneyMultiple: b.preMoneyMultiple };
  });

  const v = fx.ventureDebt;
  const fxCls = parity ? 'opacity-60' : '';

  return (
    <div className="space-y-6 text-[13px] text-slate-600">
      {parity && <Note>Sheet parity is on: the seed, venture debt, overdraft and rounds below are kept but not in the numbers (Starting point → My plan).</Note>}

      {/* 1. seed, venture debt, overdraft */}
      <div className={`space-y-2.5 ${fxCls}`}>
        <SubHead>Seed, venture debt, overdraft</SubHead>
        <Row label={<>Seed round{!fx.seed.confirmed && <Flag>Timing not confirmed</Flag>}</>} hint="Equity. The sheet’s round-cost line follows it (5%).">
          <Check checked={fx.seed.on} onChange={(x) => setFx((f) => { f.seed.on = x; })} label="Seed on" />
          <NumInput unit="cr" value={fx.seed.amount} min={0} width="w-16" title="Seed amount" onChange={(x) => setFx((f) => { f.seed.amount = x; })} />
          <MonthSelect title="Seed month" value={fx.seed.month} months={months} onChange={(m) => setFx((f) => { f.seed.month = m ?? 1; f.seed.confirmed = true; })} />
        </Row>
        <Row label="Seed pre-money" hint="For the dilution table only (placeholder until agreed).">
          <NumInput unit="cr" value={seedPreMoney} min={0} width="w-16" title="Seed pre-money" onChange={(x) => setG((g) => { g.seedPreMoney = x; })} />
          {seedRow && <span className="text-[11px] text-slate-500">sold {pct(seedRow.sold, 0)}</span>}
        </Row>
        <Row label={<>Venture debt{!v.confirmed && <Flag />}</>} hint="Replaces the sheet’s ₹2.5 Cr draw. Interest-only through the moratorium, then equal instalments.">
          <Check checked={v.on} onChange={(x) => setFx((f) => { f.ventureDebt.on = x; })} label="Venture debt on" />
          <NumInput unit="cr" value={v.amount} min={0} width="w-16" title="Venture debt amount" onChange={(x) => setFx((f) => { f.ventureDebt.amount = x; f.ventureDebt.confirmed = false; })} />
        </Row>
        {v.on && (
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600 sm:grid-cols-2">
            <Row label="Interest rate"><NumInput unit="pct" value={v.rate} min={0} max={0.4} width="w-14" title="Venture debt rate" onChange={(x) => setFx((f) => { f.ventureDebt.rate = x; })} /></Row>
            <Row label="Drawn in"><MonthSelect title="Draw month" value={v.drawMonth} months={months} onChange={(m) => setFx((f) => { f.ventureDebt.drawMonth = m ?? 1; })} /></Row>
            <Row label="Moratorium (months)"><NumInput value={v.moratoriumMonths} min={0} max={36} width="w-12" title="Moratorium" onChange={(x) => setFx((f) => { f.ventureDebt.moratoriumMonths = Math.round(x); })} /></Row>
            <Row label="Tenor (months)"><NumInput value={v.tenorMonths} min={1} max={72} width="w-12" title="Tenor" onChange={(x) => setFx((f) => { f.ventureDebt.tenorMonths = Math.round(x); })} /></Row>
            <Row label="Processing fee"><NumInput unit="pct" value={v.feePct} min={0} max={0.1} width="w-14" title="Processing fee" onChange={(x) => setFx((f) => { f.ventureDebt.feePct = x; })} /></Row>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={v.confirmed} onChange={(e) => setFx((f) => { f.ventureDebt.confirmed = e.target.checked; })} className="h-4 w-4 accent-brand-600" />Terms confirmed</label>
          </div>
        )}
        <Row label={<>Overdraft / negative-cash interest{!fx.overdraft.confirmed && <Flag />}</>} hint="Charged on last month’s negative closing cash. Debt and overdraft are shown apart from equity.">
          <Check checked={fx.overdraft.on} onChange={(x) => setFx((f) => { f.overdraft.on = x; })} label="Overdraft on" />
          <NumInput unit="pct" value={fx.overdraft.rate} min={0} max={0.4} width="w-14" title="Overdraft rate" onChange={(x) => setFx((f) => { f.overdraft.rate = x; f.overdraft.confirmed = false; })} />
        </Row>
      </div>

      {/* 2. timeline events */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Timeline events (the sheet’s)</SubHead>
          <div className="flex flex-wrap gap-2">
            {(['equity', 'debtDrawn', 'debtRepaid'] as const).map((k) => (
              <button key={k} type="button" className={btn} onClick={() => update((p) => { p.events.push({ id: newId(k), kind: k, month: 1, amount: 0, note: '' }); })}>+ {KIND[k]}</button>
            ))}
          </div>
        </div>
        {plan.events.length === 0 && <Note>Nothing on the timeline yet.</Note>}
        {[...plan.events].sort((a, b) => a.month - b.month).map((e) => {
          const i = plan.events.findIndex((x) => x.id === e.id);
          const replaced = !!e.venture && !!plan.fx && !plan.fx.sheetParity && plan.fx.ventureDebt.on;
          return (
            <div key={e.id} className={`flex flex-wrap items-center gap-2 ${replaced ? 'opacity-60' : ''}`}>
              <span className={`w-28 rounded-md px-2 py-0.5 text-center text-[11px] font-semibold ${e.kind === 'equity' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{KIND[e.kind]}</span>
              <MonthSelect title={`${KIND[e.kind]} month`} value={e.month} months={months} onChange={(m) => update((p) => { p.events[i].month = m ?? 1; })} />
              <NumInput unit="cr" value={e.amount} min={0} width="w-20" title="Amount" onChange={(x) => update((p) => { p.events[i].amount = x; })} />
              <input value={e.note} placeholder="Note (e.g. Seed — Hyperscale lead)" aria-label="Note" onChange={(ev) => update((p) => { p.events[i].note = ev.target.value; })} className={`${txt} min-w-[200px] flex-1`} />
              {replaced && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Replaced by the venture-debt terms above</span>}
              <button type="button" className={rm} aria-label={`Remove ${KIND[e.kind]} in ${e.month}`} onClick={() => update((p) => { p.events.splice(i, 1); })}>Remove</button>
            </div>
          );
        })}
      </div>

      {/* 3. how rounds are sized */}
      <div className="space-y-2">
        <SubHead>How rounds are sized</SubHead>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
          <span>keep cash above <NumInput unit="cr" value={funding.buffer} min={0} width="w-14" title="Cash buffer" onChange={(x) => setFunding('buffer', x)} /></span>
          <span>for the next <NumInput value={funding.runwayMonths} min={3} width="w-12" title="Runway months" onChange={(x) => setFunding('runwayMonths', Math.round(x))} /> months</span>
          <span>at least <NumInput unit="cr" value={funding.minRound} min={0} width="w-14" title="Minimum round" onChange={(x) => setFunding('minRound', x)} /> a round</span>
          <span>pre-money <NumInput unit="x" value={funding.preMoneyMultiple} min={0} width="w-12" title="Pre-money multiple of run-rate ARR" onChange={(x) => setFunding('preMoneyMultiple', x)} /> run-rate ARR</span>
          <span>fee <NumInput unit="pct" value={funding.feePct} min={0} width="w-12" title="Round fee" onChange={(x) => setFunding('feePct', x)} /></span>
          <span>first round ≥ <NumInput value={funding.earliestAfterSeed} min={0} width="w-12" title="Months after the seed" onChange={(x) => setFunding('earliestAfterSeed', Math.round(x))} /> months after the seed</span>
        </div>
        <Note>Rounds are (re)sized when you fit the plan (Targets). Rounds ticked Agreed are kept.</Note>
      </div>

      {/* 4. rounds */}
      <div className={`space-y-2 ${fxCls}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Rounds</SubHead>
          <button type="button" className={btn} onClick={() => setG((g) => { g.rounds.push({ id: newId('r'), name: 'New round', on: true, month: Math.min(horizon, 19), amount: 25 * CR, preMoney: 100 * CR, feePct: funding.feePct, confirmed: false }); })}>Add a round</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px] tabular-nums">
            <thead>
              <tr className="bg-surface-tint">
                <th className={th}>On</th><th className={th}>Round</th><th className={th}>Month</th><th className={thr}>Amount</th><th className={thr}>Pre-money</th><th className={thr}>Fee</th>
                <th className={th} title="An agreed round is kept as it is when the plan is fitted">Agreed</th>
                <th className={thr} title="Share of the company this round buys">Sold</th><th className={thr} title="What today’s holders keep after this round">Today’s holders keep</th><th className={th} />
              </tr>
            </thead>
            <tbody>
              {seedRow && (
                <tr className="border-t border-slate-100 text-slate-500">
                  <td className={td} /><td className={td}>Seed</td><td className={td}>{monthLabel(plan.startMonth, seedRow.month)}</td>
                  <td className={`${td} text-right`}>{money(seedRow.amount, 1)}</td><td className={`${td} text-right`}>{money(seedRow.preMoney, 0)}</td><td className={td} /><td className={td} />
                  <td className={`${td} text-right`}>{pct(seedRow.sold)}</td><td className={`${td} text-right`}>{pct(seedRow.existingAfter)}</td><td className={td} />
                </tr>
              )}
              {rounds.length === 0 && <tr className="border-t border-slate-100"><td colSpan={10} className={`${td} text-slate-500`}>No rounds yet — fit the plan (Targets), add one, or start from the benchmarks below.</td></tr>}
              {rounds.map((x, i) => {
                const d = dil.find((y) => y.name === x.name && y.month === x.month);
                return (
                  <tr key={x.id} className={`border-t border-slate-100 ${x.on ? '' : 'opacity-50'}`}>
                    <td className={td}><Check checked={x.on} onChange={(on) => setG((g) => { g.rounds[i].on = on; })} label={`${x.name} on`} /></td>
                    <td className={td}><input className={`${txt} min-w-[120px]`} value={x.name} aria-label="Round" onChange={(e) => setG((g) => { g.rounds[i].name = e.target.value; })} /></td>
                    <td className={td}><MonthSelect title="Month" value={x.month} months={months} onChange={(m) => setG((g) => { g.rounds[i].month = m ?? 1; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="cr" value={x.amount} min={0} width="w-16" title="Amount" onChange={(a) => setG((g) => { g.rounds[i].amount = a; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="cr" value={x.preMoney} min={0} width="w-16" title="Pre-money" onChange={(a) => setG((g) => { g.rounds[i].preMoney = a; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="pct" value={x.feePct} min={0} width="w-12" title="Fee %" onChange={(a) => setG((g) => { g.rounds[i].feePct = a; })} /></td>
                    <td className={td}><Check checked={x.confirmed} onChange={(c) => setG((g) => { g.rounds[i].confirmed = c; })} label="Agreed (kept when the plan is fitted)" /></td>
                    <td className={`${td} text-right`}>{d ? pct(d.sold) : '–'}</td>
                    <td className={`${td} text-right`}>{d ? pct(d.existingAfter) : '–'}</td>
                    <td className={td}><button type="button" className={rm} aria-label={`Remove ${x.name}`} onClick={() => setG((g) => { g.rounds.splice(i, 1); })}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note>Ownership ignores ESOP pools and convertibles. Cash before, burn and runway per round are on the Cash &amp; funding view.</Note>
      </div>

      {/* 5. benchmarks */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Benchmarks (Indian D2C, {FUNDING_DEFAULTS.asOf})</SubHead>
          <button type="button" className={btn} onClick={addBenchmarkRounds} title={hasBench ? 'Replaces the benchmark rounds not ticked Agreed' : 'Adds a Series A, B and C from the typical values below'}>
            {hasBench ? 'Reset the benchmark rounds' : 'Add these rounds as a starting point'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12px]">
            <thead>
              <tr className="bg-surface-tint">
                <th className={th}>Round</th><th className={th}>When</th><th className={thr}>Size</th><th className={thr} title="Pre-money ÷ run-rate ARR">Pre-money × ARR</th><th className={thr}>Dilution</th><th className={th}>Milestones</th>
              </tr>
            </thead>
            <tbody>
              {FUNDING_DEFAULTS.rounds.map((d) => {
                const b = bench.rounds.find((r) => r.name === d.name);
                return (
                  <tr key={d.name} className="border-t border-slate-100 align-top">
                    <td className={`${td} whitespace-nowrap font-semibold text-slate-700`}>{d.name}</td>
                    <td className={td}>
                      <span className="whitespace-nowrap">{b ? monthLabel(plan.startMonth, b.month) : '–'} · ≈ ₹{d.timing.arrAtLeastCr ?? '–'} Cr ARR</span>
                      <span className="block text-[11px] text-slate-500">{d.timing.rule}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>{range(d.sizeCr, crRange)}</td>
                    <td className={`${td} whitespace-nowrap text-right`}>{range(d.preMoneyArrMultiple, xRange)}</td>
                    <td className={`${td} whitespace-nowrap text-right`}>{range(d.dilutionPct, pctRange)}</td>
                    <td className={`${td} min-w-[260px] text-[11px] text-slate-500`}>{d.milestones}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note>
          Typical (min–max). Pre-money is written as the multiple × this plan’s run-rate ARR in that month (at least ₹{cr(50 * CR, 0)} Cr); fee {pct(FUNDING_DEFAULTS.feePct, 0)}; every round unticked.
          Venture debt alongside: ~{pct(FUNDING_DEFAULTS.ventureDebt.shareOfRound, 0)} of the round, {FUNDING_DEFAULTS.ventureDebt.tenureMonths} months at {pct(FUNDING_DEFAULTS.ventureDebt.ratePct, 0)}.
          {clamped.length > 0 && ` ${clamped.map((d) => d.name).join(', ')} would fall after the plan’s horizon and sit in its last month.`}
          {' '}Planning defaults, not market quotes.
        </Note>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const SECTION: SetupSectionDef = {
  id: 'funding',
  title: 'Funding',
  blurb: 'Seed, venture debt and overdraft terms, the sheet’s timeline events, the rounds, and how rounds are sized.',
  Section,
  summary,
};
