// Output view "Costs" (docs/planning/ONE-SETUP.md §3): one row for each Expense Calendar group with its total per FY;
// select a group to see its lines in a modal. Plus what the growth layer adds (people, opex per FY). Read only: lines are
// edited in Setup → Sheet lines. Pass 2 (11 Nov 2026): group table + modal in place of 12 stacked line tables.

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { defaultRepeat, isPctType, isRoasType, type ExpenseLine, type Plan, type PlanResult, type Section } from '../../../data/planning/engine';
import { Modal } from '../../ui/overlays';
import { cr, int, money, pct } from '../fmt';
import { PlanCard, Stat, SubTabs } from '../ui';
import { useSubTab } from '../subTab';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'revex', label: 'Revenue-linked' }, { id: 'opex', label: 'Opex' }, { id: 'capex', label: 'Capex' }, { id: 'finex', label: 'Finance' },
];
const IDS = SECTIONS.map((s) => s.id);
const th = 'px-2 py-2 text-right text-xs font-semibold text-slate-600';

export function CostsView({ plan, result }: Props) {
  const r = result;
  const [section, setSection] = useSubTab<Section>('costs', IDS, 'revex');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const fys = r.years.map((y) => y.fy);
  const label = (m: number) => r.months.find((x) => x.m === m)?.label ?? `M${m}`;

  const totals = useMemo(() => {
    const t: Record<string, Record<string, number>> = {};
    for (const m of r.months) for (const [id, v] of Object.entries(m.lines)) {
      (t[id] ??= {})[m.fy] = (t[id][m.fy] ?? 0) + v;
    }
    return t;
  }, [r]);
  const groupFy = useMemo(() => {
    const t: Record<string, Record<string, number>> = {};
    for (const m of r.months) for (const [g, v] of Object.entries(m.groups)) (t[g] ??= {})[m.fy] = (t[g][m.fy] ?? 0) + v;
    return t;
  }, [r]);

  const groups = plan.groups.filter((g) => g.section === section);
  const amount = (l: ExpenseLine) => (isPctType(l.type) ? pct(l.amount, 1) : isRoasType(l.type) ? `${l.amount.toFixed(1)}×` : '₹' + int(l.amount));
  const sectionTot = (fy: string) => groups.reduce((a, g) => a + (groupFy[g.name]?.[fy] ?? 0), 0);

  const last = r.years[r.years.length - 1];
  const lastMs = r.months.filter((m) => m.fy === last?.fy);
  const opexLast = lastMs.reduce((a, m) => a + m.opex, 0);
  const people = lastMs[lastMs.length - 1]?.growthHeadcount ?? 0;
  const og = openGroup ? plan.groups.find((g) => g.name === openGroup) : undefined;
  const ls = og ? plan.lines.filter((l) => l.group === og.name) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SECTIONS.map((s) => {
          const v = plan.groups.filter((g) => g.section === s.id).reduce((a, g) => a + (groupFy[g.name]?.[last?.fy ?? ''] ?? 0), 0);
          return <Stat key={s.id} label={`${s.label}, ${last?.fy}`} value={money(v, 1)} sub={s.id === 'opex' ? `${pct(opexLast / (last?.revenue || 1), 0)} of revenue · ${int(people)} people added` : `${pct(v / (last?.revenue || 1), 0)} of revenue`} />;
        })}
      </div>

      <PlanCard
        title="Cost groups, ₹ Cr"
        count={groups.length}
        action={<SubTabs value={section} onChange={setSection} options={SECTIONS} label="Cost section" />}
        info={<>
          <p>Select a group to see its lines.</p>
          <p>Amount is ₹ for a monthly, quarterly, annual or one-time line. It is a % for a &quot;% of …&quot; line, and a multiple for a &quot;ROAS on …&quot; line.</p>
          <p>A line that repeats runs after Mar-28 as in the same month of Apr-27 to Mar-28.</p>
          <p>Change lines in Setup → Sheet lines.</p>
        </>}
        flush
      >
        <div tabIndex={0} role="region" aria-label="Cost groups, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Group</th>
                <th className={th}>Lines</th>
                {fys.map((fy) => <th key={fy} className={th}>{fy}</th>)}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const n = plan.lines.filter((l) => l.group === g.name).length;
                return (
                  <tr key={g.name} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpenGroup(g.name)}>
                    <td className="px-4 py-0">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenGroup(g.name); }}
                        className="min-h-11 w-full text-left font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:min-h-9">
                        {g.name}
                      </button>
                    </td>
                    <td className="px-2 text-right text-slate-600">{n}</td>
                    {fys.map((fy) => <td key={fy} className="px-2 text-right text-slate-800">{cr(groupFy[g.name]?.[fy] ?? 0)}</td>)}
                    <td className="pr-3 text-right"><ChevronRight className="ml-auto h-4 w-4 text-slate-400" aria-hidden /></td>
                  </tr>
                );
              })}
              {groups.length === 0 && <tr><td colSpan={3 + fys.length} className="px-4 py-3 text-[13px] text-slate-600">No cost groups in this section.</td></tr>}
              {groups.length > 0 && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-2">Total</td><td />
                  {fys.map((fy) => <td key={fy} className="px-2 text-right">{cr(sectionTot(fy))}</td>)}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PlanCard>

      <Modal open={!!og} onClose={() => setOpenGroup(null)} title={og?.name} subtitle={`${ls.length} lines · ₹ Cr per FY`} width={1100}>
        <div tabIndex={0} role="region" aria-label="Lines, scroll sideways for more" className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12.5px] tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-600">
                <th className="px-2 py-2 text-left font-semibold">Line</th>
                <th className="px-2 py-2 text-left font-semibold">Type</th>
                <th className="px-2 py-2 text-right font-semibold">Amount</th>
                <th className="px-2 py-2 text-left font-semibold">From</th>
                <th className="px-2 py-2 text-left font-semibold">To</th>
                <th className="px-2 py-2 text-center font-semibold">Repeats</th>
                {fys.map((fy) => <th key={fy} className="px-2 py-2 text-right font-semibold">{fy}</th>)}
              </tr>
            </thead>
            <tbody>
              {ls.map((l) => (
                <tr key={l.id} className={`border-t border-slate-100 ${l.off ? 'opacity-50' : ''}`}>
                  <td className="px-2 py-1.5 text-slate-800">
                    {l.name}
                    {l.off && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">Off</span>}
                    {l.milestone && <span className="ml-2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700" title={l.theme ? `Theme: ${l.theme}` : undefined}>{l.milestone}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{l.type}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{amount(l)}</td>
                  <td className="px-2 py-1.5 text-slate-600">{label(l.start)}</td>
                  <td className="px-2 py-1.5 text-slate-600">{l.end == null ? 'Ongoing' : label(l.end)}</td>
                  <td className="px-2 py-1.5 text-center text-slate-600">{(l.repeat ?? defaultRepeat(l)) ? 'Yes' : 'No'}</td>
                  {fys.map((fy) => <td key={fy} className="px-2 py-1.5 text-right text-slate-700">{cr(totals[l.id]?.[fy] ?? 0)}</td>)}
                </tr>
              ))}
              {ls.length === 0 && <tr><td colSpan={6 + fys.length} className="px-2 py-3 text-[13px] text-slate-600">No lines in this group.</td></tr>}
              {og && (
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-2 py-1.5" colSpan={6}>Total</td>
                  {fys.map((fy) => <td key={fy} className="px-2 py-1.5 text-right">{cr(groupFy[og.name]?.[fy] ?? 0)}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <PlanCard title="Opex and people by year" info="People added by the hiring plan. Opex includes every opex group. Change them in Setup → Team and hiring, and Setup → Capacity, sites and capex.">
        <div tabIndex={0} role="region" aria-label="Opex by year, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px] tabular-nums">
            <thead><tr className="border-b border-slate-200"><th className="py-1.5 text-left text-xs font-semibold text-slate-600" />{r.years.map((y) => <th key={y.fy} className={th}>{y.fy}</th>)}</tr></thead>
            <tbody>
              <tr className="border-t border-slate-100"><td className="py-1.5 text-slate-700">People added</td>{r.years.map((y) => { const ms = r.months.filter((m) => m.fy === y.fy); return <td key={y.fy} className="px-2 text-right">{int(ms[ms.length - 1]?.growthHeadcount ?? 0)}</td>; })}</tr>
              <tr className="border-t border-slate-100"><td className="py-1.5 text-slate-700">Opex</td>{r.years.map((y) => { const o = r.months.filter((m) => m.fy === y.fy).reduce((a, m) => a + m.opex, 0); return <td key={y.fy} className="px-2 text-right">{money(o, 1)}</td>; })}</tr>
              <tr className="border-t border-slate-100"><td className="py-1.5 text-slate-700">Opex, % of revenue</td>{r.years.map((y) => { const o = r.months.filter((m) => m.fy === y.fy).reduce((a, m) => a + m.opex, 0); return <td key={y.fy} className="px-2 text-right text-slate-600">{pct(o / (y.revenue || 1), 0)}</td>; })}</tr>
            </tbody>
          </table>
        </div>
      </PlanCard>
    </div>
  );
}
