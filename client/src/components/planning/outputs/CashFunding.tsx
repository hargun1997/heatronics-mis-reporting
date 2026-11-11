// Output view "Cash & funding" (docs/planning/ONE-SETUP.md §3): what the plan needs funded, the rounds with
// dilution / runway, the timeline events and the GST asset note. Read only — terms, events, rounds and the
// working-capital / GST / tax inputs live in Setup → Funding / Assumptions / Starting point.

import { useMemo } from 'react';
import type { CashEvent, Plan, PlanResult } from '../../../data/planning/engine';
import { dilution, roundStats } from '../../../data/planning/growth';
import { SectionCard } from '../../ui/Card';
import { cr, money, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }

const KIND: Record<CashEvent['kind'], string> = { equity: 'Equity raise', debtDrawn: 'Debt drawn', debtRepaid: 'Debt repaid' };
const th = 'px-2 py-2 text-left text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const thr = th.replace('text-left', 'text-right');
const td = 'px-2 py-1.5';

export function CashFundingView({ plan, result }: Props) {
  const r = result;
  const c = plan.cash;
  const peak = r.months[r.peakDeficitMonth - 1];
  const low = r.months[r.minClosingCashMonth - 1];
  const gstEnd = r.months[r.months.length - 1];
  const label = (m: number) => r.months.find((x) => x.m === m)?.label ?? `M${m}`;

  const G = plan.growth;
  const parity = !!plan.fx?.sheetParity;
  const growthOn = !!G && G.on && !parity;
  const dil = useMemo(() => dilution(plan), [plan]);
  const rstats = useMemo(() => roundStats(plan, r), [plan, r]);
  const keep = dil.length ? dil[dil.length - 1].existingAfter : 1;
  const seedRow = dil.find((d) => d.name === 'Seed');
  const rounds = G?.rounds ?? [];
  const fx = plan.fx;
  const ventureOn = !!fx && !fx.sheetParity && fx.ventureDebt.on;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Box label="Peak cumulative deficit" value={`₹${cr(r.peakDeficit)} Cr`} sub={peak ? `in ${peak.label}` : ''} />
        <Box label="Funding need (with contingency)" value={`₹${cr(r.fundingRequired)} Cr`} sub={`${pct(c.contingencyPct, 0)} buffer`} />
        <Box label={r.seedEquity > 0 ? 'Still to raise after the seed' : 'Equity needed after debt'} value={`₹${cr(Math.max(0, r.equityRequired - r.seedEquity))} Cr`} sub={`Total equity ₹${cr(r.equityRequired)} Cr${r.seedEquity > 0 ? ` less seed ₹${cr(r.seedEquity)} Cr` : ''} · debt drawn ₹${cr(r.debtDrawnTotal)} Cr`} />
        <Box label="Lowest closing cash" value={money(r.minClosingCash)} sub={low ? `${low.label}${r.minClosingCash < 0 ? ': add or bring forward a raise (Setup → Funding)' : ''}` : ''} bad={r.minClosingCash < 0} />
        <Box label="Equity raised · kept" value={money(r.equityPlanned, 0)} sub={`Today’s holders keep ${pct(keep, 0)} after ${dil.length} round${dil.length === 1 ? '' : 's'} · lowest cash ${money(r.minClosingCash, 1)}`} bad={r.minClosingCash < 0} />
      </div>

      <SectionCard
        title="Rounds & dilution"
        description={`The seed${fx?.seed.on && !parity ? ` (₹${cr(fx.seed.amount, 0)} Cr in ${label(fx.seed.month)})` : ''} and the rounds from Setup → Funding. Cash before = closing cash the month before the round; burn = average monthly cash burn over the 12 months after it; runway = months until cash falls under the buffer again. Ownership ignores ESOP pools and convertibles.`}
      >
        {!growthOn && <p className="mb-3 text-[12px] text-amber-800">{parity ? 'Sheet parity is on: the rounds below are not in the numbers: the sheet\'s own timeline events (further down) are.' : 'The growth layer is off, so the rounds below are not in the numbers.'}</p>}
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12.5px] tabular-nums">
            <thead><tr className="bg-surface-tint"><th className={th}>Round</th><th className={th}>Month</th><th className={thr}>Amount</th><th className={thr}>Pre-money</th><th className={thr}>Fee</th><th className={th}>Agreed</th><th className={thr}>Cash before</th><th className={thr}>Burn / mo</th><th className={thr}>Runway</th><th className={thr}>Sold</th><th className={thr}>Today's holders keep</th></tr></thead>
            <tbody>
              {seedRow && (
                <tr className="border-t border-slate-100 text-slate-600">
                  <td className={`${td} font-medium text-slate-700`}>Seed</td><td className={td}>{label(seedRow.month)}</td>
                  <td className={`${td} text-right`}>{money(seedRow.amount, 1)}</td><td className={`${td} text-right`}>{money(seedRow.preMoney, 0)}</td>
                  <td className={td} /><td className={td}>{fx?.seed.confirmed ? '✓' : <Flag />}</td><td className={td} /><td className={td} /><td className={td} />
                  <td className={`${td} text-right`}>{pct(seedRow.sold)}</td><td className={`${td} text-right`}>{pct(seedRow.existingAfter)}</td>
                </tr>
              )}
              {rounds.map((x) => {
                const d = dil.find((y) => y.name === x.name && y.month === x.month);
                const st = rstats.find((y) => y.id === x.id);
                return (
                  <tr key={x.id} className={`border-t border-slate-100 ${x.on ? '' : 'opacity-50'}`}>
                    <td className={`${td} font-medium text-slate-700`}>{x.name}{!x.on && <span className="ml-2 text-xs sm:text-[11px] text-slate-400">off</span>}</td>
                    <td className={td}>{label(x.month)}</td>
                    <td className={`${td} text-right`}>{money(x.amount, 1)}</td>
                    <td className={`${td} text-right`}>{money(x.preMoney, 0)}</td>
                    <td className={`${td} text-right`}>{pct(x.feePct, 1)}</td>
                    <td className={td}>{x.confirmed ? '✓' : <Flag>Placeholder</Flag>}</td>
                    <td className={`${td} text-right ${st && st.cashBefore < 0 ? 'text-rose-600' : ''}`}>{st ? money(st.cashBefore, 1) : '–'}</td>
                    <td className={`${td} text-right`}>{st ? money(st.burn, 2) : '–'}</td>
                    <td className={`${td} text-right`}>{st ? (st.runway == null ? 'to the end' : `${st.runway} mo`) : '–'}</td>
                    <td className={`${td} text-right`}>{d ? pct(d.sold) : '–'}</td>
                    <td className={`${td} text-right`}>{d ? pct(d.existingAfter) : '–'}</td>
                  </tr>
                );
              })}
              {!seedRow && rounds.length === 0 && <tr className="border-t border-slate-100"><td colSpan={11} className="px-2 py-2 text-[12px] text-slate-500">No seed or rounds yet (Setup → Funding).</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Timeline events (the sheet's)" description="Equity raises and debt on the sheet's own timeline. Edited in Setup → Funding.">
        {plan.events.length === 0 && <p className="text-[13px] text-slate-500">Nothing on the timeline.</p>}
        <div className="space-y-1.5">
          {[...plan.events].sort((a, b) => a.month - b.month).map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className={`w-28 rounded-md px-2 py-0.5 text-center text-xs sm:text-[11px] font-semibold ${e.kind === 'equity' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{KIND[e.kind]}</span>
              <span className="w-16 text-slate-600">{label(e.month)}</span>
              <span className="w-24 text-right tabular-nums text-slate-900">{money(e.amount, 2)}</span>
              <span className="min-w-0 flex-1 text-slate-500">{e.note}</span>
              {e.venture && ventureOn && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs sm:text-[11px] font-semibold text-slate-500">Replaced by the venture-debt terms</span>}
            </div>
          ))}
        </div>
      </SectionCard>

      <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        GST asset at {gstEnd?.label}: ₹{cr(gstEnd?.gstAsset ?? 0)} Cr. With 5% output GST and 18% input on services and capex, services ITC that can’t be set off keeps building as revenue grows: it is carried as an asset, so it ties up cash every year.
      </p>
    </div>
  );
}

function Box({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-card ${bad ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200/80 bg-surface'}`}>
      <div className="text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${bad ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs sm:text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Flag({ children = 'Not confirmed' }: { children?: string }) {
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs sm:text-[11px] font-semibold text-amber-800">{children}</span>;
}
