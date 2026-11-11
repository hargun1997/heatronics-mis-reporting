// Setup → 11 "Sheet lines (advanced)": the sheet itself — the unit grid by SKU × channel × month and every Expense
// Calendar line (docs/planning/ONE-SETUP.md §2.11). The revenue summary rows live in the Revenue output view.

import { useMemo, useState } from 'react';
import { CHANNELS, CHANNEL_NAMES, LINE_TYPES, defaultRepeat, isPctType, isRoasType, type Section as CostSection } from '../../../data/planning/engine';
import {
  SHEET_SECTIONS, UNIT_PARTS, addLine, cellUnits, groupTotal, lineTotalsByFy, linesOf, setCellPart, summary, tagMilestone, type UnitPart,
} from '../../../data/planning/setup/sheet';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { int, lakh, cr } from '../fmt';
import { NumInput } from '../inputs';
import { Parts, SubHead, monthsOf, newId, txt, useParts } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

export function Section({ plan, update, result }: SetupSectionProps) {
  const [part, setPart] = useParts<'units' | 'lines'>('lines');
  return (
    <div className="space-y-4">
      <Parts value={part} onChange={setPart} label="Sheet part" options={[{ id: 'lines', label: 'Cost lines' }, { id: 'units', label: 'Unit grid' }]} />
      {part === 'units' && <UnitGrid plan={plan} update={update} result={result} />}
      {part === 'lines' && <CostLines plan={plan} update={update} result={result} />}
    </div>
  );
}

/** The sheet's Revenue Planning grid: per SKU, each month's units by channel, split Last year / Missed / Growth. */
function UnitGrid({ plan, update, result: r }: SetupSectionProps) {
  const [sku, setSku] = useState(0);
  const [part, setPart] = useState<UnitPart>('total');
  const B = plan.units.length;
  const s = plan.skus[Math.min(sku, plan.skus.length - 1)];
  const skuI = plan.skus.indexOf(s);
  const partI = part === 'total' ? null : (Number(part) as 0 | 1 | 2);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <SubHead info={<><p>Oct-26 to {r.months[B - 1].label}, by SKU and channel.</p><p>Each cell = last year&apos;s units + units missed (stock-outs) + growth units, as in the sheet. Change any part. Total is the sum.</p><p>&quot;Stretch the 18-month plan&quot; (Assumptions) multiplies these units for each channel.</p></>}>Unit grid</SubHead>
        </div>
        <SegmentedControl size="sm" value={part} onChange={setPart} options={UNIT_PARTS.map((x) => ({ id: x.id, label: x.label }))} aria-label="Which part of the units" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {plan.skus.map((x, i) => (
          <button key={x.id} type="button" onClick={() => setSku(i)} aria-pressed={i === skuI}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${i === skuI ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{x.name}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-slate-600">
        <span>Price (₹, incl. GST) for <b>{s.name}</b></span>
        <NumInput value={s.asp} min={0} width="w-24" title={`${s.name} price`} onChange={(v) => update((p) => { p.skus[skuI].asp = v; })} />
        <span className="text-[12px] text-slate-600">Same price on every channel, as in the sheet.</span>
      </div>
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
        <table className="text-[12.5px] tabular-nums">
          <thead>
            <tr className="text-xs sm:text-[11px] text-slate-500">
              <th className="py-1.5 pr-3 text-left font-semibold">Month</th>
              {CHANNELS.map((c) => <th key={c} className="px-1 text-right font-semibold">{CHANNEL_NAMES[c]}</th>)}
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">Units</th>
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">₹ lakh</th>
            </tr>
          </thead>
          <tbody>
            {plan.units.map((_, m) => {
              const tot = CHANNELS.reduce((a, _c, c) => a + cellUnits(plan, m, skuI, c), 0);
              return (
                <tr key={m} className="border-t border-slate-100">
                  <td className="py-0.5 pr-3 text-slate-600">{r.months[m].label}</td>
                  {CHANNELS.map((ch, c) => (
                    <td key={ch} className="px-1 py-0.5 text-right">
                      {partI === null
                        ? <span className="inline-block w-16 pr-2 text-slate-800">{int(cellUnits(plan, m, skuI, c))}</span>
                        : <NumInput value={plan.units[m][skuI][c][partI]} min={0} width="w-16" title={`${r.months[m].label} ${CHANNEL_NAMES[ch]}`}
                            onChange={(v) => update((p) => setCellPart(p, m, skuI, c, partI, v))} />}
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
    </div>
  );
}

/** Every Expense Calendar line, editable, grouped as in the sheet, with its ₹ Cr per FY as feedback on the same row. */
function CostLines({ plan, update, result: r }: SetupSectionProps) {
  const [section, setSection] = useState<CostSection>('revex');
  const [q, setQ] = useState('');
  const monthOpts = monthsOf(r);
  const fys = r.years.map((y) => y.fy);
  const totals = useMemo(() => lineTotalsByFy(r), [r]);
  const groups = plan.groups.filter((g) => g.section === section);
  const set = (id: string, fn: (l: (typeof plan.lines)[number], p: typeof plan) => void) =>
    update((p) => { const i = p.lines.findIndex((l) => l.id === id); if (i >= 0) fn(p.lines[i], p); });
  const add = (group: string) => update((p) => { addLine(p, section, group, newId('n')); });
  const sel = 'rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[12px]';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SubHead info={<><p>Select a group to change its lines.</p><p>Amount is ₹ for a monthly, quarterly, annual or one-time line. It is a % for a &quot;% of …&quot; line, and a multiple for a &quot;ROAS on …&quot; line.</p><p>Repeats: after Mar-28 the line runs as in the same month of Apr-27 to Mar-28. Clear it for one-off lines.</p><p>The ₹ Cr columns for each FY are the result of this plan.</p></>}>Expense Calendar lines</SubHead>
        <SegmentedControl options={SHEET_SECTIONS} value={section} onChange={setSection} size="sm" aria-label="Cost section" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a line" aria-label="Find a line" className={txt} />
      </div>
      {groups.map((g) => {
        const ls = linesOf(plan, g.name, q);
        if (q.trim() && !ls.length) return null;
        const lastFy = fys[fys.length - 1];
        return (
          <details key={g.name + (q.trim() ? ':q' : '')} open={!!q.trim()} className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="text-slate-400 transition-transform group-open:rotate-90">›</span>
              <span className="font-semibold text-slate-900">{g.name}</span>
              <span className="text-xs text-slate-600">{ls.length} lines</span>
              <span className="ml-auto tabular-nums text-slate-700">{lastFy} ₹{cr(groupTotal(r, g.name, lastFy))} Cr</span>
            </summary>
          <div tabIndex={0} role="region" aria-label={`${g.name} lines, scroll sideways for more`} className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[980px] text-[12.5px] tabular-nums">
              <thead>
                <tr className="bg-surface-tint text-xs text-slate-600">
                  <th className="px-3 py-2 text-left font-semibold">Line</th>
                  <th className="px-2 py-2 text-left font-semibold">Type</th>
                  <th className="px-2 py-2 text-right font-semibold">Amount</th>
                  <th className="px-2 py-2 text-left font-semibold">From</th>
                  <th className="px-2 py-2 text-left font-semibold">To</th>
                  <th className="px-2 py-2 text-center font-semibold" title="Repeat the last plan year after Mar-28">Repeats</th>
                  {fys.map((fy) => <th key={fy} className="px-2 py-2 text-right font-semibold">{fy}</th>)}
                </tr>
              </thead>
              <tbody>
                {ls.map((l) => {
                  const pctT = isPctType(l.type), roas = isRoasType(l.type);
                  return (
                    <tr key={l.id} className={`border-t border-slate-100 ${l.off ? 'opacity-45' : ''}`}>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={!l.off} onChange={(e) => set(l.id, (x) => { x.off = !e.target.checked; })} className="accent-brand-600" title="Include this line" aria-label="Include this line" />
                          <input value={l.name} onChange={(e) => set(l.id, (x) => { x.name = e.target.value; })} className="w-64 rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-slate-300" aria-label="Line name" />
                          <select value={l.milestone ?? ''} title={l.theme ? `Theme: ${l.theme}` : 'Tag with a milestone to count it as capital deployment'}
                            onChange={(e) => set(l.id, (x, p) => tagMilestone(p, x, e.target.value))}
                            className={`max-w-[160px] rounded border px-1 py-0.5 text-xs ${l.milestone ? 'border-slate-300 bg-slate-50 text-slate-800' : 'border-transparent text-slate-600 hover:border-slate-200'}`} aria-label="Milestone">
                            <option value="">{l.milestone ? 'No milestone' : '+ Milestone'}</option>
                            {plan.business.themes.map((t) => <option key={t.id} value={t.milestone}>{t.milestone} · {t.theme}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.type} onChange={(e) => set(l.id, (x) => { x.type = e.target.value; })} className={sel} aria-label="Line type">
                          {LINE_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <NumInput value={l.amount} unit={pctT ? 'pct' : roas ? 'x' : 'num'} width={pctT || roas ? 'w-16' : 'w-24'} min={0}
                          title={`${l.name} amount`} onChange={(v) => set(l.id, (x) => { x.amount = v; })} />
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.start} onChange={(e) => set(l.id, (x) => { x.start = Number(e.target.value); })} className={sel} aria-label="From month">
                          {monthOpts.map((o) => <option key={o.m} value={o.m}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.end ?? ''} onChange={(e) => set(l.id, (x) => { x.end = e.target.value ? Number(e.target.value) : null; })} className={sel} aria-label="To month">
                          <option value="">Ongoing</option>
                          {monthOpts.map((o) => <option key={o.m} value={o.m}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={l.repeat ?? defaultRepeat(l)} onChange={(e) => set(l.id, (x) => { x.repeat = e.target.checked; })} className="accent-brand-600" aria-label="Repeats yearly" />
                      </td>
                      {fys.map((fy) => <td key={fy} className="px-2 py-1 text-right text-slate-700">{cr(totals[l.id]?.[fy] ?? 0)}</td>)}
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-200 bg-slate-50/70">
                  <td className="px-3 py-1.5" colSpan={6}>
                    <button type="button" onClick={() => add(g.name)} className="min-h-8 text-[12px] font-semibold text-accent-700 hover:underline">+ Add line</button>
                    <span className="ml-3 text-xs text-slate-600">Total, ₹ Cr</span>
                  </td>
                  {fys.map((fy) => <td key={fy} className="px-2 py-1.5 text-right font-bold text-slate-900">{cr(groupTotal(r, g.name, fy))}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          </details>
        );
      })}
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'sheet',
  title: 'Sheet lines (advanced)',
  blurb: 'Change the sheet: cost lines and the unit grid. Rarely needed.',
  Section,
  summary,
};
