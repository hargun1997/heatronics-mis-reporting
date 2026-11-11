// Output view "Overview" (docs/planning/ONE-SETUP.md §3): the six headline stats, the five-year table, revenue by
// channel, the cash curve and how the years after the sheet are built. Read only — every input lives in Setup.

import { InfoTip } from '../../ui/states';
import type { Plan, PlanResult } from '../../../data/planning/engine';
import { runRateArr } from '../../../data/planning/growth';
import { targetMode } from '../../../data/planning/setup/targets';
import { SectionCard } from '../../ui/Card';
import { FyTable } from '../FyTable';
import { CashCurve, RevenueBars } from '../charts';
import { cr, int, money, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }

export function OverviewView({ plan, result, compare, compareName }: Props) {
  const r = result;
  const cmp = compare ?? null;
  const ys = r.years;
  const fy28 = ys.find((y) => y.fy === 'FY28');
  const last = ys[ys.length - 1];
  const cagr = fy28 && last && last.fy !== 'FY28' ? Math.pow(last.revenueWithActuals / fy28.revenueWithActuals, 1 / (ys.indexOf(last) - ys.indexOf(fy28))) - 1 : NaN;
  const firstPositive = ys.find((y) => y.months === 12 && y.ebitda > 0);
  const peakMonth = r.months[r.peakDeficitMonth - 1];
  const lowMonth = r.months[r.minClosingCashMonth - 1];
  const lastM = r.months[r.months.length - 1];

  // exit ARR vs the Setup → Targets exit target (only meaningful when the growth layer is applied and the target type is Exit ARR;
  // in "Revenue by year" mode `targetArr` is just the untouched default, so it is not a target)
  const G = plan.growth;
  const parity = !!plan.fx?.sheetParity;
  const arr = runRateArr(r);
  const byYear = targetMode(plan) === 'path';
  const target = G && G.on && !parity && !byYear && G.targetArr > 0 ? G.targetArr : null;

  // capacity use (Setup → Capacity); 0 everywhere = no capacity set
  const peakUtil = Math.max(0, ...r.months.map((m) => m.utilisation));
  const overMonths = r.months.filter((m) => m.utilisation > 1);
  const hasCapacity = r.months.some((m) => m.capacity > 0);

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniStat label={`${last?.fy} revenue`} value={money(last?.revenueWithActuals ?? 0, 1)} sub={Number.isFinite(cagr) ? `${pct(cagr, 0)} CAGR from FY28` : undefined} />
        <MiniStat label={`${last?.fy} EBITDA`} value={pct((last?.ebitdaWithActuals ?? 0) / (last?.revenueWithActuals || 1))} sub={`${money(last?.ebitdaWithActuals ?? 0)} · first profit year: ${firstPositive?.fy ?? 'none'}`} bad={(last?.ebitda ?? 0) < 0} />
        <MiniStat label="Funding need" value={money(r.fundingRequired, 1)} sub={`Largest deficit ${money(r.peakDeficit, 1)}, ${peakMonth?.label ?? ''}`} />
        <MiniStat label="Lowest cash" value={money(r.minClosingCash, 1)} sub={lowMonth?.label ?? ''} bad={r.minClosingCash < 0} />
        <MiniStat
          label={`Exit ARR, ${lastM?.label}`}
          value={money(arr, 0)}
          sub={target == null ? 'Last 3 months × 4' : arr >= target ? `Target ${money(target, 0)} met` : `${money(target - arr, 0)} below target ${money(target, 0)}`}
          bad={target != null && arr < target * 0.98}
        />
        <MiniStat
          label="Highest capacity use"
          value={hasCapacity ? pct(peakUtil, 0) : '–'}
          sub={!hasCapacity ? 'Set capacity in Setup' : overMonths.length ? `Above 100% in ${overMonths.length} month${overMonths.length === 1 ? '' : 's'}, from ${overMonths[0].label}` : `People added: ${int(lastM?.growthHeadcount ?? 0)}`}
          bad={hasCapacity && peakUtil > 1}
        />
      </div>

      <SectionCard
        title="5 years, ₹ Cr"
        description={cmp ? `Small numbers: change from ${compareName ?? 'the other scenario'}.` : undefined}
        actions={<span className="text-xs text-slate-600">Apr to Sep 2026 actual: ₹{cr(plan.levers.fy27H1Revenue, 2)} Cr revenue, ₹{cr(plan.levers.fy27H1Ebitda, 2)} Cr EBITDA</span>}
      >
        <FyTable r={r} compare={cmp} compareName={compareName} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Revenue by channel"><RevenueBars r={r} compare={cmp} /></SectionCard>
        <SectionCard title="Cash" actions={
          <InfoTip label="How the years after March 2028 are made" text="How it is made" align="right" width={380}>
            <p>After March 2028, each SKU in each channel sells the units of the same month 1 year before × (1 + channel growth).</p>
            <p>Prices change with the price lever.</p>
            <p>Cost lines marked "repeats" use the same month of April 2027 to March 2028. Fixed costs increase with inflation.</p>
            <p>One-time launch, tooling and fundraise lines do not repeat. Add the next launches in Setup.</p>
            <p>Working capital, GST and debt work as in the sheet.</p>
          </InfoTip>}><CashCurve r={r} compare={cmp} /></SectionCard>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${bad ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200/80 bg-surface'} shadow-card`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tracking-[-0.02em] tabular-nums ${bad ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs sm:text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
