// Output view "Overview" (docs/planning/ONE-SETUP.md §3): the six headline stats, the five-year table, revenue by
// channel, the cash curve and how the years after the sheet are built. Read only — every input lives in Setup.

import type { Plan, PlanResult } from '../../../data/planning/engine';
import { runRateArr } from '../../../data/planning/growth';
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

  // exit ARR vs the Setup → Targets exit target (only meaningful when the growth layer is applied)
  const G = plan.growth;
  const parity = !!plan.fx?.sheetParity;
  const arr = runRateArr(r);
  const target = G && G.on && !parity && G.targetArr > 0 ? G.targetArr : null;

  // capacity use (Setup → Capacity); 0 everywhere = no capacity set
  const peakUtil = Math.max(0, ...r.months.map((m) => m.utilisation));
  const overMonths = r.months.filter((m) => m.utilisation > 1);
  const hasCapacity = r.months.some((m) => m.capacity > 0);

  return (
    <div className="min-w-0 space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <MiniStat label={`${last?.fy} revenue`} value={money(last?.revenueWithActuals ?? 0, 1)} sub={Number.isFinite(cagr) ? `${pct(cagr, 0)} CAGR from FY28` : undefined} />
        <MiniStat label={`${last?.fy} EBITDA`} value={pct((last?.ebitdaWithActuals ?? 0) / (last?.revenueWithActuals || 1))} sub={`${money(last?.ebitdaWithActuals ?? 0)} · first positive full year: ${firstPositive?.fy ?? 'none'}`} bad={(last?.ebitda ?? 0) < 0} />
        <MiniStat label="Funding need" value={money(r.fundingRequired, 1)} sub={`Peak deficit ${money(r.peakDeficit, 1)} in ${peakMonth?.label ?? '–'} + contingency`} />
        <MiniStat label="Lowest cash" value={money(r.minClosingCash, 1)} sub={`${lowMonth?.label ?? ''} · with raises & debt on the timeline`} bad={r.minClosingCash < 0} />
        <MiniStat
          label={`Exit ARR (${lastM?.label} run-rate)`}
          value={money(arr, 0)}
          sub={target == null ? 'Last 3 months × 4 · no exit ARR target set (Setup → Targets)' : arr >= target ? `Target ${money(target, 0)} reached` : `${money(target - arr, 0)} short of ${money(target, 0)}`}
          bad={target != null && arr < target * 0.98}
        />
        <MiniStat
          label="Peak capacity use"
          value={hasCapacity ? pct(peakUtil, 0) : '–'}
          sub={!hasCapacity ? 'No production capacity set (Setup → Capacity, sites & capex)' : overMonths.length ? `Over 100% in ${overMonths.length} month${overMonths.length === 1 ? '' : 's'} (first ${overMonths[0].label})` : `People added: ${int(lastM?.growthHeadcount ?? 0)}`}
          bad={hasCapacity && peakUtil > 1}
        />
      </div>

      <SectionCard
        title="Five years at a glance"
        description={cmp ? `Small figures show the change vs ${compareName ?? 'the compared scenario'}.` : 'FY27 and FY28 come from the 18-month sheet; FY29–FY31 from the levers.'}
        actions={
          <div className="text-right text-[12px] text-slate-500">
            Apr–Sep ’26 actuals: <b className="text-slate-700">₹{cr(plan.levers.fy27H1Revenue, 2)} Cr</b> revenue · <b className="text-slate-700">₹{cr(plan.levers.fy27H1Ebitda, 2)} Cr</b> EBITDA
            <span className="block text-[11px] text-slate-400">Setup → Starting point</span>
          </div>
        }
      >
        <FyTable r={r} compare={cmp} compareName={compareName} />
      </SectionCard>

      <div className="space-y-5">
        <SectionCard title="Revenue by channel"><RevenueBars r={r} compare={cmp} /></SectionCard>
        <SectionCard title="Cash"><CashCurve r={r} compare={cmp} /></SectionCard>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-500">
        How the years after Mar-28 are built: each SKU × channel sells the same month’s units a year earlier × (1 + that channel’s growth); prices move by the price lever.
        Cost lines marked “repeats” run as they did in the same month of Apr-27–Mar-28, so peak-season COGS, ROAS and winter campaigns recur every year; fixed amounts rise with inflation (and team growth for people costs).
        One-off launch, tooling and fundraise lines don’t repeat — add next launches in Setup (Products & categories, or Sheet lines). Working capital, GST and debt work exactly as in the sheet.
      </p>
    </div>
  );
}

function MiniStat({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${bad ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200/80 bg-surface'} shadow-card`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${bad ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
