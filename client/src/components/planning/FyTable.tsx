// The 5-year summary: metrics down, financial years across.

import type { PlanResult, YearResult } from '../../data/planning/engine';
import { cr, pct } from './fmt';

interface Row { label: string; get: (y: YearResult, i: number, all: YearResult[]) => number; kind: 'cr' | 'pct' | 'int'; strong?: boolean; hint?: string }

const ROWS: Row[] = [
  { label: 'Revenue', get: (y) => y.revenueWithActuals, kind: 'cr', strong: true, hint: 'FY27 includes the Apr–Sep actuals you entered' },
  { label: 'Growth YoY', get: (y, i, a) => (i && (a[i - 1].months === 12 || a[i - 1].revenueWithActuals > a[i - 1].revenue) ? y.revenueWithActuals / a[i - 1].revenueWithActuals - 1 : NaN), kind: 'pct', hint: 'Blank when the year before is only part-plan — enter Apr–Sep ’26 actuals to see FY28 growth' },
  { label: 'Units', get: (y) => y.units, kind: 'int' },
  { label: 'Gross margin', get: (y) => y.grossProfit / y.revenue, kind: 'pct' },
  { label: 'CM3 (after media)', get: (y) => y.cm3 / y.revenue, kind: 'pct' },
  { label: 'EBITDA', get: (y) => y.ebitdaWithActuals, kind: 'cr', strong: true },
  { label: 'EBITDA %', get: (y) => y.ebitdaWithActuals / y.revenueWithActuals, kind: 'pct' },
  { label: 'PAT', get: (y) => y.pat, kind: 'cr', hint: 'Plan months only' },
  { label: 'Capex', get: (y) => y.capex, kind: 'cr' },
  { label: 'Net cash flow', get: (y) => y.netCashFlow, kind: 'cr', hint: 'Operating + capex, before raises and debt' },
  { label: 'Closing cash', get: (y) => y.closingCash, kind: 'cr', strong: true },
  { label: 'Closing debt', get: (y) => y.endDebt, kind: 'cr' },
];

const show = (v: number, k: Row['kind']) => (k === 'pct' ? pct(v) : k === 'int' ? Math.round(v).toLocaleString('en-IN') : cr(v));

export function FyTable({ r, compare, compareName }: { r: PlanResult; compare?: PlanResult | null; compareName?: string }) {
  const ys = r.years;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px] tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 text-left font-semibold">₹ Cr</th>
            {ys.map((y) => (
              <th key={y.fy} className="px-2 py-2 text-right font-semibold">
                {y.fy}{y.months < 12 && <span className="block text-[10px] font-normal normal-case text-slate-400">{y.months} mo plan</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className={`border-b border-slate-100 ${row.strong ? 'bg-slate-50/70' : ''}`}>
              <td className={`py-1.5 pr-3 ${row.strong ? 'font-bold text-slate-900' : 'text-slate-600'}`} title={row.hint}>{row.label}</td>
              {ys.map((y, i) => {
                const v = row.get(y, i, ys);
                const cy = compare?.years.find((c) => c.fy === y.fy);
                const ci = compare ? compare.years.indexOf(cy!) : -1;
                const cv = cy ? row.get(cy, ci, compare!.years) : NaN;
                const d = v - cv;
                const showDelta = compare && Number.isFinite(d) && Math.abs(d) > (row.kind === 'pct' ? 0.0005 : row.kind === 'int' ? 0.5 : 5e4);
                return (
                  <td key={y.fy} className={`px-2 py-1.5 text-right ${v < 0 ? 'text-rose-600' : row.strong ? 'font-bold text-slate-900' : 'text-slate-800'}`}>
                    {show(v, row.kind)}
                    {showDelta && (
                      <span className={`block text-[10px] ${d > 0 ? 'text-emerald-600' : 'text-rose-600'}`} title={`vs ${compareName}`}>
                        {d > 0 ? '+' : '−'}{row.kind === 'pct' ? (Math.abs(d) * 100).toFixed(1) + ' pt' : row.kind === 'int' ? Math.round(Math.abs(d)).toLocaleString('en-IN') : cr(Math.abs(d))}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
