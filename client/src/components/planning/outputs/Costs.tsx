// Output view "Costs" (docs/planning/ONE-SETUP.md §3): every Expense Calendar line grouped as in the sheet with its
// total per FY, plus what the growth layer adds (people, opex per FY). Read only — lines are edited in Setup → Sheet lines.

import { useMemo, useState } from 'react';
import { defaultRepeat, isPctType, isRoasType, type ExpenseLine, type Plan, type PlanResult, type Section } from '../../../data/planning/engine';
import { SectionCard } from '../../ui/Card';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { cr, int, money, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'revex', label: 'Revenue-linked' }, { id: 'opex', label: 'Opex' }, { id: 'capex', label: 'Capex' }, { id: 'finex', label: 'Finance' },
];

export function CostsView({ plan, result }: Props) {
  const r = result;
  const [section, setSection] = useState<Section>('revex');
  const fys = r.years.map((y) => y.fy);
  const label = (m: number) => r.months.find((x) => x.m === m)?.label ?? `M${m}`;

  const totals = useMemo(() => {
    const t: Record<string, Record<string, number>> = {};
    for (const m of r.months) for (const [id, v] of Object.entries(m.lines)) {
      (t[id] ??= {})[m.fy] = (t[id][m.fy] ?? 0) + v;
    }
    return t;
  }, [r]);

  const groups = plan.groups.filter((g) => g.section === section);
  const amount = (l: ExpenseLine) => (isPctType(l.type) ? pct(l.amount, 1) : isRoasType(l.type) ? `${l.amount.toFixed(1)}×` : '₹' + int(l.amount));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl options={SECTIONS} value={section} onChange={setSection} size="sm" aria-label="Cost section" />
        <p className="text-[12px] text-slate-500">
          Amount is ₹ for Monthly / Quarterly / Annual / One Time, a % for “% of …”, and the ROAS multiple for “ROAS on …”.
          <b> Repeats</b> = after Mar-28 the line runs as it did in the same month of Apr-27–Mar-28. Edit lines in Setup → Sheet lines.
        </p>
      </div>

      {groups.map((g) => {
        const ls = plan.lines.filter((l) => l.group === g.name);
        const gTot = (fy: string) => r.months.filter((m) => m.fy === fy).reduce((a, m) => a + (m.groups[g.name] ?? 0), 0);
        return (
          <div key={g.name} tabIndex={0} role="region" aria-label="Table, scroll sideways for more"  className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-surface shadow-card">
            <table className="w-full min-w-[900px] text-[12.5px] tabular-nums">
              <thead>
                <tr className="bg-surface-tint text-xs sm:text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left text-[13px] font-bold normal-case text-slate-800">{g.name}</th>
                  <th className="px-2 py-2 text-left font-semibold">Type</th>
                  <th className="px-2 py-2 text-right font-semibold">Amount</th>
                  <th className="px-2 py-2 text-left font-semibold">From</th>
                  <th className="px-2 py-2 text-left font-semibold">To</th>
                  <th className="px-2 py-2 text-center font-semibold" title="Repeats the last plan year after Mar-28">Repeats</th>
                  {fys.map((fy) => <th key={fy} className="px-2 py-2 text-right font-semibold">{fy}</th>)}
                </tr>
              </thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.id} className={`border-t border-slate-100 ${l.off ? 'opacity-45' : ''}`}>
                    <td className="px-3 py-1 text-slate-800">
                      {l.name}
                      {l.off && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs sm:text-[11px] font-semibold text-slate-500">off</span>}
                      {l.milestone && <span className="ml-2 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs sm:text-[11px] text-violet-700" title={l.theme ? `Theme: ${l.theme}` : undefined}>{l.milestone}</span>}
                    </td>
                    <td className="px-2 py-1 text-slate-600">{l.type}</td>
                    <td className="px-2 py-1 text-right text-slate-700">{amount(l)}</td>
                    <td className="px-2 py-1 text-slate-600">{label(l.start)}</td>
                    <td className="px-2 py-1 text-slate-600">{l.end == null ? 'ongoing' : label(l.end)}</td>
                    <td className="px-2 py-1 text-center text-slate-600">{(l.repeat ?? defaultRepeat(l)) ? '✓' : '–'}</td>
                    {fys.map((fy) => <td key={fy} className="px-2 py-1 text-right text-slate-700">{cr(totals[l.id]?.[fy] ?? 0)}</td>)}
                  </tr>
                ))}
                {ls.length === 0 && <tr className="border-t border-slate-100"><td colSpan={6 + fys.length} className="px-3 py-2 text-[12px] text-slate-500">No lines in this group.</td></tr>}
                <tr className="border-t border-slate-200 bg-slate-50/70">
                  <td className="px-3 py-1.5 text-xs sm:text-[11px] text-slate-400" colSpan={6}>{g.name} · ₹ Cr per FY →</td>
                  {fys.map((fy) => <td key={fy} className="px-2 py-1.5 text-right font-bold text-slate-900">{cr(gTot(fy))}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      {groups.length === 0 && <p className="text-[13px] text-slate-500">No cost groups in this section.</p>}

      <SectionCard title="From the growth layer" description="People added by the hiring plan and total opex per FY (Setup → Team & hiring, Capacity, sites & capex). Opex includes every opex group above.">
        <div className="space-y-2 text-[12.5px] text-slate-600">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="font-semibold text-slate-700">People added</span>
            {r.years.map((y) => {
              const ms = r.months.filter((m) => m.fy === y.fy);
              return <span key={y.fy}>{y.fy}: <b>{int(ms[ms.length - 1]?.growthHeadcount ?? 0)}</b></span>;
            })}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="font-semibold text-slate-700">Opex</span>
            {r.years.map((y) => {
              const ms = r.months.filter((m) => m.fy === y.fy);
              const opex = ms.reduce((a, m) => a + m.opex, 0);
              return <span key={y.fy}>{y.fy}: <b>{money(opex, 1)}</b> <span className="text-slate-400">({pct(opex / (y.revenue || 1), 0)} of revenue)</span></span>;
            })}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
