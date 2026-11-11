// Output view "Cash & funding" (docs/planning/ONE-SETUP.md §3): what the plan needs funded, the rounds with
// dilution / runway, the timeline events and the GST asset note. Read only — terms, events, rounds and the
// working-capital / GST / tax inputs live in Setup → Funding / Assumptions / Starting point.

import { useMemo } from 'react';
import type { CashEvent, Plan, PlanResult } from '../../../data/planning/engine';
import { dilution, roundStats } from '../../../data/planning/growth';
import { PlanCard as SectionCard, Stat as Box } from '../ui';
import { CashCurve } from '../charts';
import { cr, money, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }

const KIND: Record<CashEvent['kind'], string> = { equity: 'Equity raise', debtDrawn: 'Debt drawn', debtRepaid: 'Debt repaid' };
const th = 'px-2 py-2 text-left text-xs font-semibold text-slate-600';
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Box label="Largest deficit" value={`₹${cr(r.peakDeficit)} Cr`} sub={peak ? `in ${peak.label}` : ''} />
        <Box label="Funding need" value={`₹${cr(r.fundingRequired)} Cr`} sub={`With ${pct(c.contingencyPct, 0)} buffer`} />
        <Box label={r.seedEquity > 0 ? 'Still to raise after seed' : 'Equity after debt'} value={`₹${cr(Math.max(0, r.equityRequired - r.seedEquity))} Cr`} sub={`Equity ₹${cr(r.equityRequired)} Cr${r.seedEquity > 0 ? ` − seed ₹${cr(r.seedEquity)} Cr` : ''} · debt ₹${cr(r.debtDrawnTotal)} Cr`} />
        <Box label="Lowest cash" value={money(r.minClosingCash)} sub={low ? `${low.label}${r.minClosingCash < 0 ? ' · add a raise in Setup → Funding' : ''}` : ''} bad={r.minClosingCash < 0} />
        <Box label="Equity raised" value={money(r.equityPlanned, 0)} sub={`Today’s holders keep ${pct(keep, 0)} after ${dil.length} round${dil.length === 1 ? '' : 's'}`} />
        <Box label={`GST asset, ${gstEnd?.label ?? ''}`} value={`₹${cr(gstEnd?.gstAsset ?? 0)} Cr`} sub="Services ITC we cannot set off" />
      </div>

      <SectionCard
        title="Rounds and dilution"
        count={rounds.length + (seedRow ? 1 : 0)}
        info={<>
          <p>The seed{fx?.seed.on && !parity ? ` (₹${cr(fx.seed.amount, 0)} Cr in ${label(fx.seed.month)})` : ''} and the rounds from Setup → Funding.</p>
          <p>Cash before = closing cash in the month before the round.</p>
          <p>Burn = average cash burn a month for the 12 months after the round.</p>
          <p>Runway = months until cash goes below the buffer again.</p>
          <p>Ownership does not include ESOP pools and convertibles.</p>
        </>}
      >
        {!growthOn && <p className="mb-3 text-[12px] text-amber-800">{parity ? 'Sheet parity is on. These rounds are not in the numbers. The sheet\'s own events are.' : 'The growth layer is off. These rounds are not in the numbers.'}</p>}
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12.5px] tabular-nums">
            <thead><tr className="bg-surface-tint"><th className={th}>Round</th><th className={th}>Month</th><th className={thr}>Amount</th><th className={thr}>Pre-money</th><th className={thr}>Fee</th><th className={th}>Agreed</th><th className={thr}>Cash before</th><th className={thr}>Burn a month</th><th className={thr}>Runway</th><th className={thr}>Sold</th><th className={thr}>Today's holders keep</th></tr></thead>
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
                    <td className={`${td} font-medium text-slate-700`}>{x.name}{!x.on && <span className="ml-2 text-xs text-slate-600">Off</span>}</td>
                    <td className={td}>{label(x.month)}</td>
                    <td className={`${td} text-right`}>{money(x.amount, 1)}</td>
                    <td className={`${td} text-right`}>{money(x.preMoney, 0)}</td>
                    <td className={`${td} text-right`}>{pct(x.feePct, 1)}</td>
                    <td className={td}>{x.confirmed ? '✓' : <Flag>Placeholder</Flag>}</td>
                    <td className={`${td} text-right ${st && st.cashBefore < 0 ? 'text-rose-600' : ''}`}>{st ? money(st.cashBefore, 1) : '–'}</td>
                    <td className={`${td} text-right`}>{st ? money(st.burn, 2) : '–'}</td>
                    <td className={`${td} text-right`}>{st ? (st.runway == null ? 'To the end' : `${st.runway} months`) : '–'}</td>
                    <td className={`${td} text-right`}>{d ? pct(d.sold) : '–'}</td>
                    <td className={`${td} text-right`}>{d ? pct(d.existingAfter) : '–'}</td>
                  </tr>
                );
              })}
              {!seedRow && rounds.length === 0 && <tr className="border-t border-slate-100"><td colSpan={11} className="px-2 py-2 text-[12px] text-slate-600">No seed or rounds yet. Add them in Setup → Funding.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
      <SectionCard title="Closing cash"><CashCurve r={r} compare={null} /></SectionCard>
      <SectionCard title="The sheet's cash events" count={plan.events.length} info="Equity raises and debt on the sheet's own timeline. Change them in Setup → Funding.">
        {plan.events.length === 0 && <p className="text-[13px] text-slate-600">No events.</p>}
        <div className="space-y-1.5">
          {[...plan.events].sort((a, b) => a.month - b.month).map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className={`w-28 rounded-md px-2 py-0.5 text-center text-xs sm:text-[11px] font-semibold ${e.kind === 'equity' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{KIND[e.kind]}</span>
              <span className="w-16 text-slate-600">{label(e.month)}</span>
              <span className="w-24 text-right tabular-nums text-slate-900">{money(e.amount, 2)}</span>
              <span className="min-w-0 flex-1 basis-full text-slate-600 sm:basis-0">{e.note}</span>
              {e.venture && ventureOn && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs sm:text-[11px] font-semibold text-slate-500">Venture-debt terms used</span>}
            </div>
          ))}
        </div>
      </SectionCard>

      </div>
    </div>
  );
}

function Flag({ children = 'Not confirmed' }: { children?: string }) {
  return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs sm:text-[11px] font-semibold text-amber-800">{children}</span>;
}
