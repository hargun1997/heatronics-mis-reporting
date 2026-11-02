// The sheet's Revenue Planning grid, editable: per SKU, each month's units by channel, split into
// Last year / Missed / Growth exactly as the sheet holds them, plus SKU prices and the summary rows
// (revenue by channel, mix, growth vs last year, MoM, blended ASP).

import { Fragment, useState } from 'react';
import { CHANNELS, CHANNEL_NAMES, type Plan, type PlanResult } from '../../data/planning/engine';
import { SectionCard } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import { cr, int, lakh, pct } from './fmt';
import { NumInput } from './inputs';
import type { Update } from './LeverPanel';

const PARTS = [{ id: '0', label: 'Last year' }, { id: '1', label: 'Missed' }, { id: '2', label: 'Growth' }, { id: 'total', label: 'Total' }] as const;
type Part = (typeof PARTS)[number]['id'];

export function UnitPlanEditor({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const [sku, setSku] = useState(0);
  const [part, setPart] = useState<Part>('total');
  const B = plan.units.length;
  const s = plan.skus[sku];
  const cellTotal = (m: number, c: number) => plan.units[m][sku][c].reduce((a, x) => a + x, 0);
  const setCell = (m: number, c: number, v: number) => update((p) => { p.units[m][sku][c][Number(part)] = Math.max(0, Math.round(v)); });

  return (
    <SectionCard
      title="Unit plan (the sheet's grid)"
      description={`Oct-26 → ${r.months[B - 1].label}, by SKU × channel. Each cell = last year's units + units missed (stock-outs) + growth units, as in the sheet. Edit any part; Total is the sum.`}
      actions={<SegmentedControl size="sm" value={part} onChange={setPart} options={PARTS.map((x) => ({ id: x.id, label: x.label }))} aria-label="Which part of the units" />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {plan.skus.map((x, i) => (
          <button key={x.id} onClick={() => setSku(i)}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${i === sku ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{x.name}</button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[13px] text-slate-600">
        <span>Price (₹, incl. GST) for <b>{s.name}</b></span>
        <NumInput value={s.asp} min={0} width="w-24" title={`${s.name} price`} onChange={(v) => update((p) => { p.skus[sku].asp = v; })} />
        <span className="text-[12px] text-slate-400">Same price on every channel, as in the sheet.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[12.5px] tabular-nums">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="py-1.5 pr-3 text-left font-semibold">Month</th>
              {CHANNELS.map((c) => <th key={c} className="px-1 text-right font-semibold">{CHANNEL_NAMES[c]}</th>)}
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">Units</th>
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">₹ lakh</th>
            </tr>
          </thead>
          <tbody>
            {plan.units.map((_, m) => {
              const tot = CHANNELS.reduce((a, _c, c) => a + cellTotal(m, c), 0);
              return (
                <tr key={m} className="border-t border-slate-100">
                  <td className="py-0.5 pr-3 text-slate-600">{r.months[m].label}</td>
                  {CHANNELS.map((ch, c) => (
                    <td key={ch} className="px-1 py-0.5 text-right">
                      {part === 'total'
                        ? <span className="inline-block w-16 pr-2 text-slate-800">{int(cellTotal(m, c))}</span>
                        : <NumInput value={plan.units[m][sku][c][Number(part)]} min={0} width="w-16" title={`${r.months[m].label} ${CHANNEL_NAMES[ch]}`} onChange={(v) => setCell(m, c, v)} />}
                    </td>
                  ))}
                  <td className="bg-slate-50 px-2 text-right font-semibold">{int(tot)}</td>
                  <td className="bg-slate-50 px-2 text-right">{lakh(tot * s.asp)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">The “Stretch the 18-month plan” multipliers on the 5-year view scale these units per channel on top.</p>
    </SectionCard>
  );
}

/** Revenue Planning rows 33–55: by channel, mix, growth vs last year, MoM and blended ASP, per month. */
export function RevenueSummary({ plan, r }: { plan: Plan; r: PlanResult }) {
  const B = plan.units.length;
  const ms = r.months.slice(0, B);
  // Prior-year base revenue (row 46): last year's units at today's prices
  const py = ms.map((_, m) => plan.skus.reduce((a, s, i) => a + plan.units[m][i].reduce((t, cell) => t + cell[0], 0) * s.asp, 0));
  const rows: [string, (m: number) => string, boolean?][] = [
    ...CHANNELS.map((c) => [`${CHANNEL_NAMES[c]} (₹ L)`, (i: number) => lakh(ms[i].revenueByChannel[c])] as [string, (m: number) => string]),
    ['Total (₹ L)', (i) => lakh(ms[i].grossRevenue), true],
    ...CHANNELS.map((c) => [`${CHANNEL_NAMES[c]} mix`, (i: number) => pct(ms[i].revenueByChannel[c] / (ms[i].grossRevenue || 1), 0)] as [string, (m: number) => string]),
    ['Last year at today’s prices (₹ L)', (i) => lakh(py[i])],
    ['Growth vs last year', (i) => (py[i] ? `${(ms[i].grossRevenue / py[i]).toFixed(1)}×` : '–')],
    ['Growth MoM', (i) => (i ? pct(ms[i].grossRevenue / (ms[i - 1].grossRevenue || 1) - 1, 0) : '–')],
    ['Blended ASP (₹)', (i) => int(ms[i].grossRevenue / (ms[i].units || 1))],
  ];
  return (
    <SectionCard title="Revenue summary (the sheet's months)" description="Revenue Planning rows 33–55. Uses the D2C customer model when it is on.">
      <div className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="sticky left-0 z-10 bg-surface py-1.5 pr-3 text-left font-semibold" />
              {ms.map((m) => <th key={m.m} className="whitespace-nowrap px-1.5 text-right font-semibold">{m.label}</th>)}
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f, strong], k) => (
              <Fragment key={label}>
                {(k === CHANNELS.length + 1 || k === 2 * CHANNELS.length + 1) && <tr><td colSpan={ms.length + 2} className="h-2" /></tr>}
                <tr className={`border-t border-slate-100 ${strong ? 'font-semibold' : ''}`}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1 pr-3 text-slate-700">{label}</td>
                  {ms.map((_, i) => <td key={i} className="px-1.5 text-right text-slate-800">{f(i)}</td>)}
                  <td className="bg-slate-50 px-2 text-right font-semibold">
                    {label.endsWith('(₹ L)') && !label.startsWith('Last') ? cr(label.startsWith('Total') ? ms.reduce((a, m) => a + m.grossRevenue, 0) : ms.reduce((a, m) => a + (m.revenueByChannel[CHANNELS.find((c) => label.startsWith(CHANNEL_NAMES[c]))!] ?? 0), 0)) + ' Cr' : ''}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
