// Costs: every Expense Calendar line, editable, grouped as in the sheet, with its total per FY.

import { useMemo, useState } from 'react';
import { LINE_TYPES, defaultRepeat, isPctType, isRoasType, type ExpenseLine, type Plan, type PlanResult, type Section } from '../../data/planning/engine';
import { cr } from './fmt';
import { NumInput } from './inputs';
import type { Update } from './LeverPanel';
import { SegmentedControl } from '../ui/SegmentedControl';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'revex', label: 'Revenue-linked' }, { id: 'opex', label: 'Opex' }, { id: 'capex', label: 'Capex' }, { id: 'finex', label: 'Finance' },
];

export function CostsTab({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const [section, setSection] = useState<Section>('revex');
  const [q, setQ] = useState('');
  const monthOpts = r.months.map((m) => ({ m: m.m, label: m.label }));
  const fys = r.years.map((y) => y.fy);

  const totals = useMemo(() => {
    const t: Record<string, Record<string, number>> = {};
    for (const m of r.months) for (const [id, v] of Object.entries(m.lines)) {
      (t[id] ??= {})[m.fy] = (t[id][m.fy] ?? 0) + v;
    }
    return t;
  }, [r]);

  const groups = plan.groups.filter((g) => g.section === section);
  const set = (id: string, fn: (l: ExpenseLine) => void) => update((p) => { const i = p.lines.findIndex((l) => l.id === id); if (i >= 0) fn(p.lines[i]); });
  const add = (group: string) => update((p) => {
    const l: ExpenseLine = { id: 'n' + Math.random().toString(36).slice(2, 8), name: 'New line', section, group, type: 'Monthly', amount: 0, start: 1, end: null, theme: null, milestone: null, repeat: true };
    const after = p.lines.map((x) => x.group).lastIndexOf(group);
    p.lines.splice(after + 1, 0, l);
  });
  const ql = q.trim().toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl options={SECTIONS} value={section} onChange={setSection} size="sm" aria-label="Cost section" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a line…" className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px]" />
        <p className="text-[12px] text-slate-500">
          Amount is ₹ for Monthly / Quarterly / Annual / One Time, a % for “% of …”, and the ROAS multiple for “ROAS on …”.
          <b> Repeats</b> = after Mar-28 the line runs as it did in the same month of Apr-27–Mar-28 (seasonal rates carry on); untick for one-offs.
        </p>
      </div>
      {groups.map((g) => {
        const ls = plan.lines.filter((l) => l.group === g.name && (!ql || l.name.toLowerCase().includes(ql)));
        if (ql && !ls.length) return null;
        const gTot = (fy: string) => r.months.filter((m) => m.fy === fy).reduce((a, m) => a + (m.groups[g.name] ?? 0), 0);
        return (
          <div key={g.name} className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface shadow-card">
            <table className="w-full min-w-[980px] text-[12.5px] tabular-nums">
              <thead>
                <tr className="bg-surface-tint text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-bold text-slate-800 normal-case text-[13px]">{g.name}</th>
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
                          <input type="checkbox" checked={!l.off} onChange={(e) => set(l.id, (x) => { x.off = !e.target.checked; })} className="accent-brand-600" title="Include this line" />
                          <input value={l.name} onChange={(e) => set(l.id, (x) => { x.name = e.target.value; })} className="w-64 rounded border border-transparent px-1 py-0.5 hover:border-slate-200 focus:border-slate-300" aria-label="Line name" />
                          {l.milestone && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700" title={l.theme ?? ''}>{l.milestone}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.type} onChange={(e) => set(l.id, (x) => { x.type = e.target.value; })} className="rounded-md border border-slate-200 px-1 py-0.5 text-[12px]">
                          {LINE_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <NumInput value={l.amount} unit={pctT ? 'pct' : roas ? 'x' : 'num'} width={pctT || roas ? 'w-16' : 'w-24'} min={0}
                          title={`${l.name} amount`} onChange={(v) => set(l.id, (x) => { x.amount = v; })} />
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.start} onChange={(e) => set(l.id, (x) => { x.start = Number(e.target.value); })} className="rounded-md border border-slate-200 px-1 py-0.5 text-[12px]">
                          {monthOpts.map((o) => <option key={o.m} value={o.m}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select value={l.end ?? ''} onChange={(e) => set(l.id, (x) => { x.end = e.target.value ? Number(e.target.value) : null; })} className="rounded-md border border-slate-200 px-1 py-0.5 text-[12px]">
                          <option value="">ongoing</option>
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
                    <button onClick={() => add(g.name)} className="text-[12px] font-semibold text-brand-700 hover:underline">+ Add line</button>
                    <span className="ml-3 text-[11px] text-slate-400">₹ Cr per FY →</span>
                  </td>
                  {fys.map((fy) => <td key={fy} className="px-2 py-1.5 text-right font-bold text-slate-900">{cr(gTot(fy))}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
