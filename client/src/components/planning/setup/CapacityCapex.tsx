// Setup → 7 "Capacity, sites & capex" (docs/planning/ONE-SETUP.md §2.7): production capacity blocks, warehouses / offices /
// running costs and one-off capex, written into the growth layer through `ensureGrowth`. Feedback = one peak-use line; the
// per-FY capacity table lives in the Products & customers output, opex per FY in the Costs output.

import type { CapacityBlock, CapexItem, Overhead, Plan } from '../../../data/planning/engine';
import { defaultOverheads } from '../../../data/planning/growth';
import { NumInput } from '../inputs';
import { CAPEX_GROUPS, baseCapacityOf, newBlock, newCapex, newExpense, newSite, overheadGroups, peakUseLine, summary } from '../../../data/planning/setup/capacity';
import { Check, MonthSelect, Note, SubHead, btn, ensureGrowth, monthsOf, newId, rm, td, th, thr, txt } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

// eslint-disable-next-line react-refresh/only-export-components -- the section contract (types.ts) re-exports the pure summary
export { summary };

type Growth = NonNullable<Plan['growth']>;
const sel = 'rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[13px]';
const name = `${txt} w-full min-w-[140px]`;

export function Section({ plan, update, result }: SetupSectionProps) {
  const G = plan.growth;
  const months = monthsOf(result);
  const horizon = months.length || 1;
  const startMonth = Math.min(13, horizon);
  const set = (fn: (g: Growth) => void) => update((p) => { fn(ensureGrowth(p)); });
  const capacity = G?.capacity ?? [];
  const overheads = G?.overheads ?? [];
  const capex = G?.capex ?? [];
  const parity = !!plan.fx?.sheetParity;
  const peak = peakUseLine(result.months);
  const over = result.months.some((m) => m.utilisation > 1);

  return (
    <div className="space-y-6">
      {parity && <Note>Sheet parity: capacity, sites and capex are not in the numbers (Starting point → My plan).</Note>}

      {/* production capacity */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Production capacity</SubHead>
          <button type="button" className={btn} onClick={() => set((g) => { g.capacity.push(newBlock(newId('c'), startMonth)); })}>Add capacity</button>
        </div>
        <Note>In-house units a month (core hCore range + in-house lines). A block's capex lands in its month; it adds capacity and running cost after its lead time.</Note>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
          Capacity today <NumInput value={baseCapacityOf(plan)} min={0} width="w-20" title="Capacity today, units a month" onChange={(v) => set((g) => { g.baseCapacity = v; })} /> units / month
        </div>
        {capacity.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px] tabular-nums">
              <thead><tr className="bg-surface-tint"><th className={th}>On</th><th className={th}>Block</th><th className={th}>Capex in</th><th className={thr}>Lead (mo)</th><th className={thr}>+ units/mo</th><th className={thr}>Capex</th><th className={thr}>Running / mo</th><th className={th} /></tr></thead>
              <tbody>
                {capacity.map((b: CapacityBlock, i) => {
                  const sb = (fn: (x: CapacityBlock) => void) => set((g) => { if (g.capacity[i]) fn(g.capacity[i]); });
                  return (
                    <tr key={b.id} className={`border-t border-slate-100 ${b.on ? '' : 'opacity-50'}`}>
                      <td className={td}><Check checked={b.on} onChange={(v) => sb((x) => { x.on = v; })} label={`${b.name} on`} /></td>
                      <td className={td}><input className={name} value={b.name} aria-label="Block" onChange={(e) => sb((x) => { x.name = e.target.value; })} /></td>
                      <td className={td}><MonthSelect title="Capex month" value={b.month} months={months} onChange={(m) => sb((x) => { x.month = m ?? 1; })} /></td>
                      <td className={`${td} text-right`}><NumInput value={b.leadMonths} min={0} width="w-12" title="Lead months" onChange={(v) => sb((x) => { x.leadMonths = Math.round(v); })} /></td>
                      <td className={`${td} text-right`}><NumInput value={b.unitsPerMonth} min={0} width="w-20" title="Units a month added" onChange={(v) => sb((x) => { x.unitsPerMonth = v; })} /></td>
                      <td className={`${td} text-right`}><NumInput unit="cr" value={b.capex} min={0} width="w-14" title="Capex" onChange={(v) => sb((x) => { x.capex = v; })} /></td>
                      <td className={`${td} text-right`}><NumInput unit="lakh" value={b.monthlyOpex} min={0} width="w-14" title="Running cost a month" onChange={(v) => sb((x) => { x.monthlyOpex = v; })} /></td>
                      <td className={td}><button type="button" className={rm} aria-label={`Remove ${b.name}`} onClick={() => set((g) => { g.capacity.splice(i, 1); })}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Note tone={over ? 'amber' : 'grey'}>{peak}{over ? ' — build stock ahead of the peak or add capacity earlier.' : ''}</Note>
      </section>

      {/* overheads */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Warehouses, offices &amp; running costs</SubHead>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => set((g) => { (g.overheads ??= []).push(newSite(newId('o'), startMonth)); })}>Add a site</button>
            <button type="button" className={btn} onClick={() => set((g) => { (g.overheads ??= []).push(newExpense(newId('o'), Math.min(7, horizon))); })}>Add an expense</button>
          </div>
        </div>
        <Note>Sites cost sq ft × rent (escalating yearly) plus running cost, with a deposit and fit-out as capex in the opening month. Fixed costs grow by their rate a year; % lines follow revenue.</Note>
        {overheads.length === 0 && (
          <p className="text-[13px] text-slate-500">
            None yet. <button type="button" className="font-semibold text-brand-700 underline" onClick={() => set((g) => { g.overheads = defaultOverheads(); })}>Add warehouses, office and running costs</button>
          </p>
        )}
        {overheads.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[12.5px] tabular-nums">
              <thead><tr className="bg-surface-tint"><th className={th}>On</th><th className={th}>Item</th><th className={th}>Kind</th><th className={th}>Group</th><th className={th}>From</th><th className={th}>To</th><th className={thr}>₹ / mo or %</th><th className={thr}>Sq ft</th><th className={thr}>Rent ₹/sq ft</th><th className={thr}>Running / mo</th><th className={thr}>Deposit (mo)</th><th className={thr}>Fit-out</th><th className={thr}>+ / yr</th><th className={th} /></tr></thead>
              <tbody>
                {overheads.map((o: Overhead, i) => {
                  const so = (fn: (x: Overhead) => void) => set((g) => { if (g.overheads?.[i]) fn(g.overheads[i]); });
                  const site = o.kind === 'site';
                  return (
                    <tr key={o.id} className={`border-t border-slate-100 ${o.on ? '' : 'opacity-50'}`}>
                      <td className={td}><Check checked={o.on} onChange={(v) => so((x) => { x.on = v; })} label={`${o.name} on`} /></td>
                      <td className={td}><input className={name} value={o.name} aria-label="Item" onChange={(e) => so((x) => { x.name = e.target.value; })} /></td>
                      <td className={td}>
                        <select aria-label="Kind" value={o.kind} className={sel} onChange={(e) => so((x) => { x.kind = e.target.value as Overhead['kind']; })}>
                          <option value="site">Site (rent)</option><option value="fixed">Fixed ₹ / mo</option><option value="pct">% of revenue</option>
                        </select>
                      </td>
                      <td className={td}>
                        <select aria-label="Group" value={o.group} className={sel} onChange={(e) => so((x) => { x.group = e.target.value; })}>
                          {overheadGroups(plan, o.group).map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </td>
                      <td className={td}><MonthSelect title="From" value={o.month} months={months} onChange={(m) => so((x) => { x.month = m ?? 1; })} /></td>
                      <td className={td}><MonthSelect title="To" value={o.end} months={months} allowNone onChange={(m) => so((x) => { x.end = m; })} /></td>
                      <td className={`${td} text-right`}>{site ? <span className="text-slate-400">–</span> : o.kind === 'pct'
                        ? <NumInput unit="pct" value={o.amount} min={0} width="w-14" title="% of revenue" onChange={(v) => so((x) => { x.amount = v; })} />
                        : <NumInput unit="lakh" value={o.amount} min={0} width="w-14" title="₹ a month" onChange={(v) => so((x) => { x.amount = v; })} />}</td>
                      <td className={`${td} text-right`}>{site ? <NumInput value={o.sqft ?? 0} min={0} width="w-20" title="Sq ft" onChange={(v) => so((x) => { x.sqft = v; })} /> : '–'}</td>
                      <td className={`${td} text-right`}>{site ? <NumInput value={o.rentPerSqft ?? 0} min={0} width="w-14" title="Rent per sq ft a month" onChange={(v) => so((x) => { x.rentPerSqft = v; })} /> : '–'}</td>
                      <td className={`${td} text-right`}>{site ? <NumInput unit="lakh" value={o.runningPerMonth ?? 0} min={0} width="w-16" title="Running cost a month" onChange={(v) => so((x) => { x.runningPerMonth = v; })} /> : '–'}</td>
                      <td className={`${td} text-right`}>{site ? <NumInput value={o.depositMonths ?? 0} min={0} width="w-12" title="Deposit in months of rent" onChange={(v) => so((x) => { x.depositMonths = v; })} /> : '–'}</td>
                      <td className={`${td} text-right`}>{site ? <NumInput unit="lakh" value={o.fitout ?? 0} min={0} width="w-16" title="Fit-out capex" onChange={(v) => so((x) => { x.fitout = v; })} /> : '–'}</td>
                      <td className={`${td} text-right`}>{o.kind === 'pct' ? '–' : <NumInput unit="pct" value={o.growthPct} width="w-12" title="Increase a year" onChange={(v) => so((x) => { x.growthPct = v; })} />}</td>
                      <td className={td}><button type="button" className={rm} aria-label={`Remove ${o.name}`} onClick={() => set((g) => { g.overheads?.splice(i, 1); })}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* other capex */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Other capex</SubHead>
          <button type="button" className={btn} onClick={() => set((g) => { g.capex.push(newCapex(newId('x'), startMonth)); })}>Add capex</button>
        </div>
        <Note>One-off spends, booked in their month (depreciated when that switch is on under Assumptions).</Note>
        {capex.length === 0 && <p className="text-[13px] text-slate-500">None yet.</p>}
        {capex.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px] tabular-nums">
              <thead><tr className="bg-surface-tint"><th className={th}>On</th><th className={th}>Item</th><th className={th}>Group</th><th className={th}>Month</th><th className={thr}>Amount</th><th className={th} /></tr></thead>
              <tbody>
                {capex.map((x: CapexItem, i) => {
                  const sx = (fn: (y: CapexItem) => void) => set((g) => { if (g.capex[i]) fn(g.capex[i]); });
                  return (
                    <tr key={x.id} className={`border-t border-slate-100 ${x.on ? '' : 'opacity-50'}`}>
                      <td className={td}><Check checked={x.on} onChange={(v) => sx((y) => { y.on = v; })} label={`${x.name} on`} /></td>
                      <td className={td}><input className={name} value={x.name} aria-label="Item" onChange={(e) => sx((y) => { y.name = e.target.value; })} /></td>
                      <td className={td}>
                        <select aria-label="Group" value={x.group} className={sel} onChange={(e) => sx((y) => { y.group = e.target.value; })}>
                          {[...new Set([x.group, ...CAPEX_GROUPS])].map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </td>
                      <td className={td}><MonthSelect title="Month" value={x.month} months={months} onChange={(m) => sx((y) => { y.month = m ?? 1; })} /></td>
                      <td className={`${td} text-right`}><NumInput unit="cr" value={x.amount} min={0} width="w-16" title="Amount" onChange={(v) => sx((y) => { y.amount = v; })} /></td>
                      <td className={td}><button type="button" className={rm} aria-label={`Remove ${x.name}`} onClick={() => set((g) => { g.capex.splice(i, 1); })}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the section contract (types.ts) exports the definition object
export const SECTION: SetupSectionDef = {
  id: 'capacity',
  title: 'Capacity, sites & capex',
  blurb: 'Production capacity blocks, warehouses / offices / running costs, and one-off capex.',
  Section,
  summary,
};
