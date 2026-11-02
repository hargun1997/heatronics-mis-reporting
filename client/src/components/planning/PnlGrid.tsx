// Monthly P&L + cash grid, the sheet's "3. P&L" and "4. Cash Flow" laid out over every month,
// with an FY total after each March. Figures in ₹ lakh.

import { Fragment, useState } from 'react';
import type { MonthResult, PlanResult } from '../../data/planning/engine';
import { lakh, pct } from './fmt';
import { SegmentedControl } from '../ui/SegmentedControl';

type Kind = 'sum' | 'end' | 'pct';
interface Row { label: string; get: (m: MonthResult) => number; kind?: Kind; strong?: boolean; of?: (m: MonthResult) => number; head?: boolean }

const g = (name: string) => (m: MonthResult) => m.groups[name] ?? 0;
const neg = (f: (m: MonthResult) => number) => (m: MonthResult) => -f(m);

const PNL: Row[] = [
  { label: 'Net revenue', get: (m) => m.netRevenue, strong: true },
  { label: 'Raw material & packaging', get: neg(g('Raw Material & Packaging')) },
  { label: 'Inward logistics', get: neg(g('Inward Logistics')) },
  { label: 'Factory payroll', get: neg(g('Factory Payroll')) },
  { label: 'Manufacturing overhead', get: neg(g('Manufacturing Overhead')) },
  { label: 'Gross profit', get: (m) => m.grossProfit, strong: true },
  { label: 'Gross margin %', get: (m) => m.grossProfit, of: (m) => m.netRevenue, kind: 'pct' },
  { label: 'Channel commission', get: neg(g('Channel Commission')) },
  { label: 'CM1', get: (m) => m.cm1, strong: true },
  { label: 'Fulfilment & delivery', get: neg(g('Fulfilment & Delivery')) },
  { label: 'Payment & collection', get: neg(g('Payment & Collection')) },
  { label: 'CM2', get: (m) => m.cm2, strong: true },
  { label: 'Performance marketing', get: neg(g('Performance Marketing')) },
  { label: 'CM3', get: (m) => m.cm3, strong: true },
  { label: 'CM3 %', get: (m) => m.cm3, of: (m) => m.netRevenue, kind: 'pct' },
  { label: 'Opex', get: (m) => -m.opex },
  { label: 'EBITDA', get: (m) => m.ebitda, strong: true },
  { label: 'EBITDA %', get: (m) => m.ebitda, of: (m) => m.netRevenue, kind: 'pct' },
  { label: 'Depreciation', get: (m) => -m.da },
  { label: 'Interest', get: (m) => -m.interest },
  { label: 'Bank & fundraise costs', get: (m) => -m.banking - m.fundraiseCosts },
  { label: 'Tax', get: (m) => -m.tax },
  { label: 'PAT', get: (m) => m.pat, strong: true },
];

const CASH: Row[] = [
  { label: 'EBITDA', get: (m) => m.ebitda },
  { label: 'Tax, interest, bank, fundraise', get: (m) => -m.tax - m.interest - m.banking - m.fundraiseCosts },
  { label: 'Change in working capital', get: (m) => m.nwcChange },
  { label: 'Capex', get: (m) => -m.capex },
  { label: 'Net cash flow', get: (m) => m.netCashFlow, strong: true },
  { label: 'Equity raised', get: (m) => m.equity },
  { label: 'Debt drawn − repaid', get: (m) => m.debtNet },
  { label: 'Closing cash', get: (m) => m.closingCash, kind: 'end', strong: true },
  { label: 'Working capital', get: () => 0, head: true },
  { label: 'Inventory', get: (m) => m.inventory, kind: 'end' },
  { label: 'Receivables', get: (m) => m.receivables, kind: 'end' },
  { label: 'Payables', get: (m) => m.payables, kind: 'end' },
  { label: 'GST asset (stuck ITC + refunds due)', get: (m) => m.gstAsset, kind: 'end' },
  { label: 'Net working capital', get: (m) => m.nwc, kind: 'end', strong: true },
  { label: 'Closing debt', get: (m) => m.debt, kind: 'end' },
];

const GST: Row[] = [
  { label: 'Taxable turnover (ex-GST)', get: (m) => m.taxableTurnover },
  { label: 'Output GST @ 5%', get: (m) => m.outputGst, strong: true },
  { label: 'ITC on goods (refundable)', get: (m) => m.itcGoods },
  { label: 'ITC on services & capex (not refundable)', get: (m) => m.itcServices },
  { label: 'Set off — services & capex first', get: (m) => m.gstSetOffServices },
  { label: 'Set off — goods', get: (m) => m.gstSetOffGoods },
  { label: 'Refund claimable — goods', get: (m) => m.gstClaimable },
  { label: 'Refund received (lagged)', get: (m) => m.gstRefund },
  { label: 'ITC stuck — services & capex', get: (m) => m.gstStuck },
  { label: 'Written off to P&L', get: (m) => m.gstWrittenOff },
  { label: 'Closing GST asset', get: (m) => m.gstAsset, kind: 'end', strong: true },
  { label: 'Inventory', get: () => 0, head: true },
  { label: 'COGS at standard margin', get: (m) => m.stdCogs },
  { label: 'Closing inventory (forward cover)', get: (m) => m.inventory, kind: 'end' },
  { label: 'Inventory purchase (cash out)', get: (m) => m.inventoryPurchase, strong: true },
];

function agg(ms: MonthResult[], row: Row): number {
  if (row.kind === 'end') return row.get(ms[ms.length - 1]);
  const s = ms.reduce((a, m) => a + row.get(m), 0);
  if (row.kind === 'pct') return s / (ms.reduce((a, m) => a + row.of!(m), 0) || 1);
  return s;
}

export function PnlGrid({ r }: { r: PlanResult }) {
  const [view, setView] = useState<'pnl' | 'cash' | 'gst'>('pnl');
  const [grain, setGrain] = useState<'month' | 'fy'>('month');
  const rows = view === 'pnl' ? PNL : view === 'cash' ? CASH : GST;
  const cols: { key: string; label: string; ms: MonthResult[]; fy: boolean; ext: boolean }[] = [];
  for (const y of r.years) {
    const ms = r.months.filter((m) => m.fy === y.fy);
    if (grain === 'month') for (const m of ms) cols.push({ key: 'm' + m.m, label: m.label, ms: [m], fy: false, ext: m.m > r.base });
    cols.push({ key: y.fy, label: y.fy + (y.months < 12 ? '*' : ''), ms, fy: true, ext: false });
  }
  const cell = (row: Row, ms: MonthResult[]) => {
    const v = row.kind === 'pct' ? agg(ms, row) : agg(ms, row);
    return row.kind === 'pct' ? pct(v) : lakh(v);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl options={[{ id: 'pnl', label: 'P&L' }, { id: 'cash', label: 'Cash & working capital' }, { id: 'gst', label: 'GST & inventory' }]} value={view} onChange={setView} size="sm" />
        <SegmentedControl options={[{ id: 'month', label: 'Months + FY' }, { id: 'fy', label: 'FY only' }]} value={grain} onChange={setGrain} size="sm" />
        <span className="text-[12px] text-slate-500">₹ lakh · shaded months come from the levers (after the 18-month sheet) · *part year</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface shadow-card">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="sticky left-0 z-10 bg-surface-tint px-3 py-2 text-left font-semibold">Line</th>
              {cols.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-2 py-2 text-right font-semibold ${c.fy ? 'bg-slate-100 text-slate-800' : c.ext ? 'bg-amber-50/60' : 'bg-surface-tint'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={`border-t border-slate-100 ${row.strong ? 'font-semibold' : ''}`}>
                <td className={`sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1 ${row.head ? 'pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500' : row.strong ? 'text-slate-900' : 'text-slate-600'}`}>{row.label}</td>
                {cols.map((c) => (
                  <Fragment key={c.key}>
                    {row.head ? <td className={c.fy ? 'bg-slate-50' : ''} /> : (
                      <td className={`whitespace-nowrap px-2 py-1 text-right ${c.fy ? 'bg-slate-50 font-semibold' : c.ext ? 'bg-amber-50/30' : ''} ${agg(c.ms, row) < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{cell(row, c.ms)}</td>
                    )}
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
