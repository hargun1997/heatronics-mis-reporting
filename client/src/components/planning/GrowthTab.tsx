// Growth builder: new product lines, hiring, capacity, capex, fundraise rounds and stores on top of the plan,
// with the exit-ARR target, "Solve for the target" and "Fund the gap". Engine hooks: data/planning/engine.ts;
// helpers and the ₹500 Cr scenario: data/planning/growth.ts.

import { useMemo, useState } from 'react';
import {
  CATEGORY_NAMES, CHANNELS, CHANNEL_NAMES, DEPT_NAMES,
  type Channel, type Dept, type NewProduct, type Plan, type PlanResult, type ProductCategory,
} from '../../data/planning/engine';
import { build500Cr, dilution, emptyGrowth, ensureGrowthGroups, fundTheGap, runRateArr, solveForTarget } from '../../data/planning/growth';
import { SectionCard } from '../ui/Card';
import { MiniStat } from './charts';
import { NumInput } from './inputs';
import { cr, int, money, pct } from './fmt';
import type { Update } from './LeverPanel';

const CR = 1e7;
const CAPEX_GROUPS = ['Plant & Machinery', 'Testing & Certification Equipment', 'New Product Tooling & Moulds', 'Brand & Creative Build', 'Technology & Infrastructure', 'Intangibles & Deposits', 'Store Fit-out'];
const newId = (p: string) => p + Math.random().toString(36).slice(2, 8);
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

const th = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const thr = th.replace('text-left', 'text-right');
const td = 'px-2 py-1.5';
const btn = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
const rm = 'rounded px-1.5 py-0.5 text-[12px] font-semibold text-slate-400 hover:text-rose-600';
const txt = 'w-full min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px]';

function MonthSelect({ value, onChange, months, title, allowNone }: { value: number | null; onChange: (m: number | null) => void; months: { m: number; label: string }[]; title: string; allowNone?: boolean }) {
  return (
    <select aria-label={title} title={title} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[13px]">
      {allowNone && <option value="">to the end</option>}
      {months.map((x) => <option key={x.m} value={x.m}>{x.label}</option>)}
    </select>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" aria-label={label} title={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-600" />;
}

export function GrowthTab({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const [busy, setBusy] = useState<string | null>(null);
  const G = plan.growth;
  const months = r.months.map((m) => ({ m: m.m, label: m.label }));
  const parity = !!plan.fx?.sheetParity;

  const replace = (fn: (p: Plan) => Plan, what: string) => {
    setBusy(what);
    // let the button show its busy state before the (synchronous) runs
    window.setTimeout(() => {
      update((p) => { const next = fn(p); Object.assign(p, next); });
      setBusy(null);
    }, 30);
  };

  const arr = runRateArr(r);
  const target = G?.targetArr ?? 500 * CR;
  const lastFy = r.years[r.years.length - 1];
  const peakUtil = Math.max(0, ...r.months.map((m) => m.utilisation));
  const overMonths = r.months.filter((m) => m.utilisation > 1);
  const lastM = r.months[r.months.length - 1];
  const dil = useMemo(() => dilution(plan), [plan]);
  const keep = dil.length ? dil[dil.length - 1].existingAfter : 1;

  // exit run-rate by product family: each SKU's share of the last 3 months' gross sales × the run-rate
  const mix = useMemo(() => {
    const l3 = r.months.slice(-3);
    const gross = sum(l3.map((m) => m.grossRevenue)) || 1;
    const fam: Record<string, number> = { core: 0, stores: 0 };
    const byId: Record<string, number> = {};
    for (const m of l3) for (const [id, v] of Object.entries(m.revenueBySku)) byId[id] = (byId[id] ?? 0) + v;
    const catOf = new Map(plan.products.map((p) => [p.id, p.category ?? 'other']));
    for (const [id, v] of Object.entries(byId)) {
      const k = id === 'stores' ? 'stores' : catOf.has(id) ? catOf.get(id)! : 'core';
      fam[k] = (fam[k] ?? 0) + (v / gross) * arr;
    }
    return { fam, byId: Object.fromEntries(Object.entries(byId).map(([k, v]) => [k, (v / gross) * arr])) };
  }, [r, plan.products, arr]);

  if (!G) {
    return (
      <SectionCard title="Growth builder" description="New product lines, hiring, capacity, capex, fundraise rounds and stores on top of this plan.">
        <div className="space-y-3 p-5 text-[13px] text-slate-600">
          <p>Start from an empty builder, or load the ₹500 Cr exit-ARR scenario (topicals, nutraceuticals and new devices, with the people, capacity and rounds they need). Every number in it is a placeholder for you to change.</p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg bg-cta px-3 py-1.5 text-xs font-semibold text-on-cta hover:bg-cta-hover disabled:opacity-40" disabled={!!busy} onClick={() => replace((p) => build500Cr(p), '500')}>
              {busy === '500' ? 'Building…' : 'Load the ₹500 Cr plan'}
            </button>
            <button className={btn} onClick={() => update((p) => { p.growth = { ...emptyGrowth(), on: true }; ensureGrowthGroups(p); })}>Start empty</button>
          </div>
          {parity && <p className="text-amber-700">Sheet-parity mode is on: the Growth builder is ignored until you switch it off.</p>}
        </div>
      </SectionCard>
    );
  }

  const set = (fn: (g: NonNullable<Plan['growth']>) => void) => update((p) => { if (p.growth) fn(p.growth); });
  const setProd = (id: string, fn: (x: NewProduct) => void) => update((p) => { const x = p.products.find((y) => y.id === id); if (x) fn(x); });
  const lines = plan.products.filter((x) => x.category || x.growthLine);
  const otherProducts = plan.products.filter((x) => !x.category && !x.growthLine);

  return (
    <div className="space-y-5">
      {/* target + headline */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-surface px-4 py-3 shadow-card">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
          <Check checked={G.on} onChange={(v) => set((g) => { g.on = v; })} label="Growth builder on" /> Growth builder on
        </label>
        <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
        <span className="text-[12px] font-semibold text-slate-500">Exit ARR target</span>
        <NumInput unit="cr" value={G.targetArr} min={0} width="w-20" title="Exit ARR target" onChange={(v) => set((g) => { g.targetArr = v; })} />
        <button className={btn} disabled={!!busy || !G.on} title="Scale the launch volumes of every new line (same shape) until the exit run-rate ARR equals the target"
          onClick={() => replace((p) => solveForTarget(p)?.plan ?? p, 'solve')}>{busy === 'solve' ? 'Solving…' : 'Solve for the target'}</button>
        <button className={btn} disabled={!!busy || !G.on} title="Replace the unconfirmed rounds with rounds (at least ₹15 Cr each) sized to keep cash above ₹5 Cr for the next 12 months; pre-money = 4× the run-rate ARR at the raise (placeholder)"
          onClick={() => replace((p) => fundTheGap(p), 'fund')}>{busy === 'fund' ? 'Sizing…' : 'Fund the gap'}</button>
        <button className={btn} disabled={!!busy} onClick={() => { if (window.confirm('Replace the Growth builder and its product lines with the ₹500 Cr plan?')) replace((p) => build500Cr(p), '500'); }}>
          {busy === '500' ? 'Building…' : 'Reload the ₹500 Cr plan'}
        </button>
        <button className={`${rm} ml-auto`} onClick={() => { if (window.confirm('Remove the Growth builder from this scenario? (its product lines stay, switched to plain products)')) update((p) => { delete p.growth; }); }}>Remove</button>
        {parity && <p className="w-full text-[12px] text-amber-700">Sheet-parity mode is on, so none of this is applied. Switch it off to see the growth plan.</p>}
        {G.note && <p className="w-full text-[12px] text-slate-500">{G.note}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat label={`Exit ARR (${lastM?.label} run-rate)`} value={money(arr, 0)} sub={arr >= target ? `Target ${money(target, 0)} reached` : `${money(target - arr, 0)} short of ${money(target, 0)}`} bad={arr < target * 0.98} />
        <MiniStat label={`${lastFy?.fy} revenue · EBITDA`} value={money(lastFy?.revenue ?? 0, 0)} sub={`EBITDA ${pct((lastFy?.ebitda ?? 0) / (lastFy?.revenue || 1))} · ${money(lastFy?.ebitda ?? 0, 1)}`} bad={(lastFy?.ebitda ?? 0) < 0} />
        <MiniStat label="Equity raised · kept" value={money(r.equityPlanned, 0)} sub={`Today’s holders keep ${pct(keep, 0)} after ${dil.length} round${dil.length === 1 ? '' : 's'} · lowest cash ${money(r.minClosingCash, 1)}`} bad={r.minClosingCash < 0} />
        <MiniStat label="Peak capacity use" value={pct(peakUtil, 0)} sub={overMonths.length ? `Over 100% in ${overMonths.length} month${overMonths.length === 1 ? '' : 's'} (first ${overMonths[0].label})` : `People added: ${int(lastM?.growthHeadcount ?? 0)}`} bad={peakUtil > 1} />
      </div>

      <SectionCard title="Exit run-rate by product family" description="Each family's share of the last 3 months' sales × the exit ARR.">
        <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 py-4 text-[13px] tabular-nums">
          {Object.entries(mix.fam).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <span key={k}><span className="font-semibold text-slate-700">{k === 'core' ? 'hCore range (today)' : k === 'stores' ? 'Own stores' : CATEGORY_NAMES[k as ProductCategory] ?? k}</span> <span className="text-slate-900">{money(v, 0)}</span> <span className="text-slate-400">({pct(v / (arr || 1), 0)})</span></span>
          ))}
        </div>
      </SectionCard>

      {/* product lines */}
      <SectionCard title="New product lines" description="Price incl. GST. Volume = units a month at launch, growing month on month for a year, then year on year. Channel split in %, summing to 100. Contract-made lines don't use our capacity."
        actions={<button className={btn} onClick={() => update((p) => { p.products.push({ id: newId('g-'), name: 'New line', on: true, category: 'topical', inHouse: false, asp: 399, launchMonth: 13, launchUnits: 1000, rampPct: 0.1, steadyPct: 0.4, split: { A: 0.5, D: 0.4, F: 0.1, G: 0, P: 0 }, cogsPct: 0.3, marketingPct: 0.05, launchCost: 0, launchCapex: 0, seasonRef: 'flat', growthLine: true, placeholder: true }); })}>Add a line</button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-[12.5px] tabular-nums">
            <thead><tr className="bg-surface-tint">
              <th className={th}>On</th><th className={th}>Line</th><th className={th}>Family</th><th className={th}>Launch</th>
              <th className={thr}>Price ₹</th><th className={thr}>Units/mo at launch</th><th className={thr}>m/m yr 1</th><th className={thr}>y/y after</th>
              <th className={thr}>Material %</th><th className={thr}>Extra mktg %</th><th className={thr}>Launch cost</th><th className={thr}>Tooling</th><th className={th}>In-house</th>
              {CHANNELS.map((c) => <th key={c} className={thr}>{CHANNEL_NAMES[c]}</th>)}
              <th className={thr}>Exit ARR</th><th className={th} />
            </tr></thead>
            <tbody>
              {lines.map((x) => {
                const splitSum = sum(CHANNELS.map((c) => x.split[c] ?? 0));
                return (
                  <tr key={x.id} className={`border-t border-slate-100 ${x.on ? '' : 'opacity-50'}`}>
                    <td className={td}><Check checked={x.on} onChange={(v) => setProd(x.id, (y) => { y.on = v; })} label={`${x.name} on`} /></td>
                    <td className={td}>
                      <input className={txt} value={x.name} aria-label="Line name" onChange={(e) => setProd(x.id, (y) => { y.name = e.target.value; })} />
                      {x.placeholder && <span className="ml-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Untick once the numbers are yours">placeholder</span>}
                    </td>
                    <td className={td}>
                      <select aria-label="Family" value={x.category ?? 'other'} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[13px]"
                        onChange={(e) => setProd(x.id, (y) => { y.category = e.target.value as ProductCategory; })}>
                        {(Object.keys(CATEGORY_NAMES) as ProductCategory[]).map((k) => <option key={k} value={k}>{CATEGORY_NAMES[k]}</option>)}
                      </select>
                    </td>
                    <td className={td}><MonthSelect title="Launch month" value={x.launchMonth} months={months} onChange={(m) => setProd(x.id, (y) => { y.launchMonth = m ?? 1; })} /></td>
                    <td className={`${td} text-right`}><NumInput value={x.asp} min={0} width="w-16" title="Price" onChange={(v) => setProd(x.id, (y) => { y.asp = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput value={Math.round(x.launchUnits)} min={0} width="w-20" title="Units a month at launch" onChange={(v) => setProd(x.id, (y) => { y.launchUnits = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="pct" value={x.rampPct} width="w-14" title="Month-on-month growth, first year" onChange={(v) => setProd(x.id, (y) => { y.rampPct = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="pct" value={x.steadyPct} width="w-14" title="Year-on-year growth after" onChange={(v) => setProd(x.id, (y) => { y.steadyPct = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="pct" value={x.cogsPct ?? 0} min={0} max={1} width="w-14" title="Material cost % of revenue" onChange={(v) => setProd(x.id, (y) => { y.cogsPct = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="pct" value={x.marketingPct ?? 0} min={0} width="w-14" title="Extra marketing % of revenue" onChange={(v) => setProd(x.id, (y) => { y.marketingPct = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="lakh" value={x.launchCost ?? 0} min={0} width="w-14" title="Launch cost" onChange={(v) => setProd(x.id, (y) => { y.launchCost = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="lakh" value={x.launchCapex ?? 0} min={0} width="w-14" title="Tooling capex" onChange={(v) => setProd(x.id, (y) => { y.launchCapex = v; })} /></td>
                    <td className={td}><Check checked={x.inHouse ?? x.category === 'device'} onChange={(v) => setProd(x.id, (y) => { y.inHouse = v; })} label="Made in-house" /></td>
                    {CHANNELS.map((c: Channel) => (
                      <td key={c} className={`${td} text-right`}><NumInput unit="pct" value={x.split[c] ?? 0} min={0} max={1} width="w-12" title={`${CHANNEL_NAMES[c]} share`} onChange={(v) => setProd(x.id, (y) => { y.split[c] = v; })} /></td>
                    ))}
                    <td className={`${td} text-right ${Math.abs(splitSum - 1) > 0.005 ? 'text-rose-600' : 'text-slate-900'}`} title={Math.abs(splitSum - 1) > 0.005 ? `Channel split adds to ${pct(splitSum, 0)}` : undefined}>{cr(mix.byId[x.id] ?? 0, 0)} Cr</td>
                    <td className={td}><button className={rm} onClick={() => update((p) => { p.products = p.products.filter((y) => y.id !== x.id); })} aria-label={`Remove ${x.name}`}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {otherProducts.length > 0 && <p className="px-5 py-2 text-[12px] text-slate-500">Also in the plan (Products & customers tab): {otherProducts.map((x) => `${x.name}${x.on ? '' : ' (off)'}`).join(', ')}.</p>}
      </SectionCard>

      {/* hiring */}
      <SectionCard title="Hiring plan" description={`Monthly CTC per person; ${pct(G.benefitsPct, 0)} benefits on top, a one-off hiring cost of ${pct(G.recruitPct, 0)} of a year's CTC, ${pct(G.incrementPct, 0)} increment a year. Factory roles sit in COGS.`}
        actions={<div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          Benefits <NumInput unit="pct" value={G.benefitsPct} min={0} width="w-12" title="Benefits %" onChange={(v) => set((g) => { g.benefitsPct = v; })} />
          Hiring <NumInput unit="pct" value={G.recruitPct} min={0} width="w-12" title="Hiring cost %" onChange={(v) => set((g) => { g.recruitPct = v; })} />
          Increment <NumInput unit="pct" value={G.incrementPct} min={0} width="w-12" title="Increment %" onChange={(v) => set((g) => { g.incrementPct = v; })} />
          <button className={btn} onClick={() => set((g) => { g.hires.push({ id: newId('h'), role: 'New role', dept: 'corporate', count: 1, month: 7, end: null, monthlyCtc: 1e5, on: true }); })}>Add a role</button>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px] tabular-nums">
            <thead><tr className="bg-surface-tint"><th className={th}>On</th><th className={th}>Role</th><th className={th}>Team</th><th className={thr}>People</th><th className={th}>From</th><th className={th}>To</th><th className={thr}>CTC / month</th><th className={thr}>Year-1 cost</th><th className={th} /></tr></thead>
            <tbody>
              {G.hires.map((h, i) => (
                <tr key={h.id} className={`border-t border-slate-100 ${h.on === false ? 'opacity-50' : ''}`}>
                  <td className={td}><Check checked={h.on !== false} onChange={(v) => set((g) => { g.hires[i].on = v; })} label={`${h.role} on`} /></td>
                  <td className={td}><input className={txt} value={h.role} aria-label="Role" onChange={(e) => set((g) => { g.hires[i].role = e.target.value; })} /></td>
                  <td className={td}>
                    <select aria-label="Team" value={h.dept} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[13px]" onChange={(e) => set((g) => { g.hires[i].dept = e.target.value as Dept; })}>
                      {(Object.keys(DEPT_NAMES) as Dept[]).map((k) => <option key={k} value={k}>{DEPT_NAMES[k]}</option>)}
                    </select>
                  </td>
                  <td className={`${td} text-right`}><NumInput value={h.count} min={0} width="w-14" title="People" onChange={(v) => set((g) => { g.hires[i].count = Math.round(v); })} /></td>
                  <td className={td}><MonthSelect title="From" value={h.month} months={months} onChange={(m) => set((g) => { g.hires[i].month = m ?? 1; })} /></td>
                  <td className={td}><MonthSelect title="To" value={h.end} months={months} allowNone onChange={(m) => set((g) => { g.hires[i].end = m; })} /></td>
                  <td className={`${td} text-right`}><NumInput unit="lakh" value={h.monthlyCtc} min={0} width="w-16" title="CTC a month" onChange={(v) => set((g) => { g.hires[i].monthlyCtc = v; })} /></td>
                  <td className={`${td} text-right text-slate-700`}>{money(h.count * h.monthlyCtc * 12 * (1 + G.benefitsPct), 2)}</td>
                  <td className={td}><button className={rm} aria-label={`Remove ${h.role}`} onClick={() => set((g) => { g.hires.splice(i, 1); })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-6 px-5 py-2 text-[12px] text-slate-600">
          {r.years.map((y) => {
            const ms = r.months.filter((m) => m.fy === y.fy);
            return <span key={y.fy}>{y.fy}: <b>{int(ms[ms.length - 1]?.growthHeadcount ?? 0)}</b> people added</span>;
          })}
        </div>
      </SectionCard>

      {/* capacity + capex */}
      <div className="space-y-5">
        <SectionCard title="Production capacity" description="In-house units a month (core hCore range + in-house lines). A block's capex lands in its month; it adds capacity and running cost after its lead time."
          actions={<button className={btn} onClick={() => set((g) => { g.capacity.push({ id: newId('c'), name: 'New line', on: true, month: 13, leadMonths: 3, unitsPerMonth: 10_000, capex: 1 * CR, monthlyOpex: 2e5 }); })}>Add capacity</button>}>
          <div className="flex items-center gap-2 px-5 pt-3 text-[13px] text-slate-600">
            Capacity today <NumInput value={G.baseCapacity} min={0} width="w-20" title="Capacity today, units a month" onChange={(v) => set((g) => { g.baseCapacity = v; })} /> units / month
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px] tabular-nums">
              <thead><tr className="bg-surface-tint"><th className={th}>On</th><th className={th}>Block</th><th className={th}>Capex in</th><th className={thr}>Lead (mo)</th><th className={thr}>+ units/mo</th><th className={thr}>Capex</th><th className={thr}>Running / mo</th><th className={th} /></tr></thead>
              <tbody>
                {G.capacity.map((b, i) => (
                  <tr key={b.id} className={`border-t border-slate-100 ${b.on ? '' : 'opacity-50'}`}>
                    <td className={td}><Check checked={b.on} onChange={(v) => set((g) => { g.capacity[i].on = v; })} label={`${b.name} on`} /></td>
                    <td className={td}><input className={txt} value={b.name} aria-label="Block" onChange={(e) => set((g) => { g.capacity[i].name = e.target.value; })} /></td>
                    <td className={td}><MonthSelect title="Capex month" value={b.month} months={months} onChange={(m) => set((g) => { g.capacity[i].month = m ?? 1; })} /></td>
                    <td className={`${td} text-right`}><NumInput value={b.leadMonths} min={0} width="w-12" title="Lead months" onChange={(v) => set((g) => { g.capacity[i].leadMonths = Math.round(v); })} /></td>
                    <td className={`${td} text-right`}><NumInput value={b.unitsPerMonth} min={0} width="w-20" title="Units a month added" onChange={(v) => set((g) => { g.capacity[i].unitsPerMonth = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="cr" value={b.capex} min={0} width="w-14" title="Capex" onChange={(v) => set((g) => { g.capacity[i].capex = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="lakh" value={b.monthlyOpex} min={0} width="w-14" title="Running cost a month" onChange={(v) => set((g) => { g.capacity[i].monthlyOpex = v; })} /></td>
                    <td className={td}><button className={rm} aria-label={`Remove ${b.name}`} onClick={() => set((g) => { g.capacity.splice(i, 1); })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 text-[12px] text-slate-600">
            {r.years.map((y) => {
              const ms = r.months.filter((m) => m.fy === y.fy);
              const pk = ms.reduce((a, m) => (m.utilisation > a.utilisation ? m : a), ms[0]);
              return <div key={y.fy} className={pk && pk.utilisation > 1 ? 'text-rose-600' : ''}>{y.fy}: peak {pct(pk?.utilisation ?? 0, 0)} in {pk?.label} ({int(pk?.inHouseUnits ?? 0)} of {int(pk?.capacity ?? 0)} units)</div>;
            })}
            {overMonths.length > 0 && <p className="mt-1 text-rose-600">Over capacity means stock must be built ahead of the peak or capacity added earlier.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Other capex" description="One-off spends (depreciated when that switch is on)."
          actions={<button className={btn} onClick={() => set((g) => { g.capex.push({ id: newId('x'), name: 'New capex', on: true, group: 'Plant & Machinery', month: 13, amount: 50e5 }); })}>Add capex</button>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px] tabular-nums">
              <thead><tr className="bg-surface-tint"><th className={th}>On</th><th className={th}>Item</th><th className={th}>Group</th><th className={th}>Month</th><th className={thr}>Amount</th><th className={th} /></tr></thead>
              <tbody>
                {G.capex.map((x, i) => (
                  <tr key={x.id} className={`border-t border-slate-100 ${x.on ? '' : 'opacity-50'}`}>
                    <td className={td}><Check checked={x.on} onChange={(v) => set((g) => { g.capex[i].on = v; })} label={`${x.name} on`} /></td>
                    <td className={td}><input className={txt} value={x.name} aria-label="Item" onChange={(e) => set((g) => { g.capex[i].name = e.target.value; })} /></td>
                    <td className={td}>
                      <select aria-label="Group" value={x.group} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[13px]" onChange={(e) => set((g) => { g.capex[i].group = e.target.value; })}>
                        {CAPEX_GROUPS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                    <td className={td}><MonthSelect title="Month" value={x.month} months={months} onChange={(m) => set((g) => { g.capex[i].month = m ?? 1; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="cr" value={x.amount} min={0} width="w-16" title="Amount" onChange={(v) => set((g) => { g.capex[i].amount = v; })} /></td>
                    <td className={td}><button className={rm} aria-label={`Remove ${x.name}`} onClick={() => set((g) => { g.capex.splice(i, 1); })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* fundraise */}
      <SectionCard title="Fundraise rounds" description={`The ₹${cr(plan.fx?.seed.amount ?? 0, 0)} Cr seed comes from Founder decisions. Rounds add equity in their month; the fee is a fundraise cost. "Fund the gap" re-sizes the unconfirmed rounds.`}
        actions={<div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          Seed pre-money <NumInput unit="cr" value={G.seedPreMoney} min={0} width="w-16" title="Seed pre-money" onChange={(v) => set((g) => { g.seedPreMoney = v; })} />
          <button className={btn} onClick={() => set((g) => { g.rounds.push({ id: newId('r'), name: 'New round', on: true, month: 19, amount: 25 * CR, preMoney: 100 * CR, feePct: 0.03, confirmed: false }); })}>Add a round</button>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px] tabular-nums">
            <thead><tr className="bg-surface-tint"><th className={th}>On</th><th className={th}>Round</th><th className={th}>Month</th><th className={thr}>Amount</th><th className={thr}>Pre-money</th><th className={thr}>Fee</th><th className={th}>Agreed</th><th className={thr}>Sold</th><th className={thr}>Today's holders keep</th><th className={th} /></tr></thead>
            <tbody>
              {dil.filter((d) => d.name === 'Seed').map((d) => (
                <tr key="seed" className="border-t border-slate-100 text-slate-600">
                  <td className={td} /><td className={td}>Seed</td><td className={td}>{months.find((x) => x.m === d.month)?.label}</td>
                  <td className={`${td} text-right`}>{money(d.amount, 1)}</td><td className={`${td} text-right`}>{money(d.preMoney, 0)}</td><td className={td} /><td className={td} />
                  <td className={`${td} text-right`}>{pct(d.sold)}</td><td className={`${td} text-right`}>{pct(d.existingAfter)}</td><td className={td} />
                </tr>
              ))}
              {G.rounds.map((x, i) => {
                const d = dil.find((y) => y.name === x.name && y.month === x.month);
                return (
                  <tr key={x.id} className={`border-t border-slate-100 ${x.on ? '' : 'opacity-50'}`}>
                    <td className={td}><Check checked={x.on} onChange={(v) => set((g) => { g.rounds[i].on = v; })} label={`${x.name} on`} /></td>
                    <td className={td}><input className={txt} value={x.name} aria-label="Round" onChange={(e) => set((g) => { g.rounds[i].name = e.target.value; })} /></td>
                    <td className={td}><MonthSelect title="Month" value={x.month} months={months} onChange={(m) => set((g) => { g.rounds[i].month = m ?? 1; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="cr" value={x.amount} min={0} width="w-16" title="Amount" onChange={(v) => set((g) => { g.rounds[i].amount = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="cr" value={x.preMoney} min={0} width="w-16" title="Pre-money" onChange={(v) => set((g) => { g.rounds[i].preMoney = v; })} /></td>
                    <td className={`${td} text-right`}><NumInput unit="pct" value={x.feePct} min={0} width="w-12" title="Fee %" onChange={(v) => set((g) => { g.rounds[i].feePct = v; })} /></td>
                    <td className={td}><Check checked={x.confirmed} onChange={(v) => set((g) => { g.rounds[i].confirmed = v; })} label="Agreed (Fund the gap keeps it)" /></td>
                    <td className={`${td} text-right`}>{d ? pct(d.sold) : '–'}</td>
                    <td className={`${td} text-right`}>{d ? pct(d.existingAfter) : '–'}</td>
                    <td className={td}><button className={rm} aria-label={`Remove ${x.name}`} onClick={() => set((g) => { g.rounds.splice(i, 1); })}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-2 text-[12px] text-slate-500">Rounds from "Fund the gap" are placeholders: at least ₹15 Cr, sized for the next 12 months, pre-money 4× the run-rate ARR at the raise (at least ₹50 Cr). Ownership ignores ESOP pools and convertibles.</p>
      </SectionCard>

      {/* stores */}
      <SectionCard title="Own stores / outlets" description="Revenue per store a month once mature (incl. GST), reached in a straight line over the ramp. Rent, running costs and staff in Retail Stores; fit-out is capex in the opening month."
        actions={<label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700"><Check checked={G.stores.on} onChange={(v) => set((g) => { g.stores.on = v; })} label="Stores on" /> Stores on</label>}>
        <div className={`grid gap-6 px-5 py-4 text-[13px] text-slate-600 lg:grid-cols-[auto_minmax(0,1fr)] ${G.stores.on ? '' : 'opacity-60'}`}>
          <div className="grid grid-cols-[minmax(0,13rem)_auto] items-center gap-x-4 gap-y-2">
            <span>Mature revenue / store / mo</span><NumInput unit="lakh" value={G.stores.matureRevenue} min={0} width="w-16" title="Mature revenue" onChange={(v) => set((g) => { g.stores.matureRevenue = v; })} />
            <span>Ramp (months)</span><NumInput value={G.stores.rampMonths} min={1} width="w-16" title="Ramp months" onChange={(v) => set((g) => { g.stores.rampMonths = Math.round(v); })} />
            <span>Fit-out capex / store</span><NumInput unit="lakh" value={G.stores.capexPerStore} min={0} width="w-16" title="Fit-out" onChange={(v) => set((g) => { g.stores.capexPerStore = v; })} />
            <span>Rent / store / mo</span><NumInput unit="lakh" value={G.stores.rentPerStore} min={0} width="w-16" title="Rent" onChange={(v) => set((g) => { g.stores.rentPerStore = v; })} />
            <span>Other running / store / mo</span><NumInput unit="lakh" value={G.stores.otherOpexPerStore} min={0} width="w-16" title="Other running cost" onChange={(v) => set((g) => { g.stores.otherOpexPerStore = v; })} />
            <span>Staff / store</span><NumInput value={G.stores.staffPerStore} min={0} width="w-16" title="Staff per store" onChange={(v) => set((g) => { g.stores.staffPerStore = Math.round(v); })} />
            <span>Staff CTC / mo</span><NumInput unit="lakh" value={G.stores.staffCtc} min={0} width="w-16" title="Staff CTC" onChange={(v) => set((g) => { g.stores.staffCtc = v; })} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><b className="text-slate-700">Openings</b>
              <button className={btn} onClick={() => set((g) => { g.stores.openings.push({ month: 19, count: 1 }); })}>Add openings</button></div>
            {G.stores.openings.map((o, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <MonthSelect title="Opening month" value={o.month} months={months} onChange={(m) => set((g) => { g.stores.openings[i].month = m ?? 1; })} />
                <NumInput value={o.count} min={0} width="w-14" title="Stores opened" onChange={(v) => set((g) => { g.stores.openings[i].count = Math.round(v); })} /> stores
                <button className={rm} aria-label="Remove openings" onClick={() => set((g) => { g.stores.openings.splice(i, 1); })}>✕</button>
              </div>
            ))}
            <p className="mt-2 text-[12px]">{int(lastM?.stores ?? 0)} stores at {lastM?.label} · {r.years.map((y) => `${y.fy} ${money(y.storeRevenue, 1)}`).join(' · ')}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
