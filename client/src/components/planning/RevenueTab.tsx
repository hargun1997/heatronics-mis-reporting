// Revenue: growth by channel × FY, new products (topicals etc.), and units / revenue by SKU per FY.

import { CHANNELS, CHANNEL_NAMES, type NewProduct, type Plan, type PlanResult } from '../../data/planning/engine';
import { SectionCard } from '../ui/Card';
import { CH_COLOR, cr, int } from './fmt';
import { NumInput } from './inputs';
import type { Update } from './LeverPanel';
import { RevenueSummary, UnitPlanEditor } from './UnitPlanEditor';

const EXT_FYS = ['FY29', 'FY30', 'FY31'];

export function RevenueTab({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const L = plan.levers;
  const months = r.months;
  const monthOpts = months.map((m) => ({ m: m.m, label: m.label }));
  const items = [...plan.skus.map((s) => ({ id: s.id, name: s.name })), ...plan.products.filter((p) => p.on).map((p) => ({ id: p.id, name: p.name + ' (new)' }))];

  const addProduct = () => update((p) => {
    p.products.push({
      id: 'p-' + Math.random().toString(36).slice(2, 8), name: 'New product', on: true, asp: 1000, launchMonth: 7, launchUnits: 200,
      rampPct: 0.1, steadyPct: 0.3, split: { A: 0.5, D: 0.5, F: 0, G: 0, P: 0 }, cogsPct: null,
    });
  });
  const setP = (i: number, fn: (x: NewProduct) => void) => update((p) => fn(p.products[i]));

  return (
    <div className="space-y-5">
      <UnitPlanEditor plan={plan} r={r} update={update} />
      <RevenueSummary plan={plan} r={r} />
      <SectionCard title="Unit growth by channel" description="Year-on-year, vs the same month a year earlier. FY27–FY28 come from the 18-month sheet; these drive FY29 onwards.">
        <div className="overflow-x-auto">
          <table className="text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                <th className="pr-4 py-1.5 text-left font-semibold">Channel</th>
                {EXT_FYS.map((fy) => <th key={fy} className="px-2 py-1.5 text-right font-semibold">{fy}</th>)}
                <th className="pl-4 py-1.5 text-right font-semibold">FY31 revenue</th>
              </tr>
            </thead>
            <tbody>
              {CHANNELS.map((ch) => (
                <tr key={ch} className="border-t border-slate-100">
                  <td className="pr-4 py-1.5 font-medium text-slate-700"><span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ background: CH_COLOR[ch] }} />{CHANNEL_NAMES[ch]}</td>
                  {EXT_FYS.map((fy) => (
                    <td key={fy} className="px-2 py-1 text-right">
                      <NumInput unit="pct" value={L.growth[fy]?.[ch] ?? 0} step={5} min={-1} max={10} width="w-16" title={`${CHANNEL_NAMES[ch]} ${fy} growth`}
                        onChange={(v) => update((p) => { p.levers.growth[fy] ??= { A: 0, D: 0, F: 0, G: 0, P: 0 }; p.levers.growth[fy][ch] = v; })} />
                    </td>
                  ))}
                  <td className="pl-4 text-right tabular-nums text-slate-700">{cr(r.years.find((y) => y.fy === 'FY31')?.revenueByChannel[ch] ?? 0)} Cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="New products"
        description="Lines not in the sheet's unit grid. Units ramp month-on-month for the first year, then grow year-on-year. Own COGS % replaces the plan's raw-material % for that product."
        actions={<button onClick={addProduct} className="rounded-lg bg-cta px-3 py-1.5 text-xs font-semibold text-on-cta hover:bg-cta-hover">Add product</button>}
      >
        <div className="space-y-3">
          {plan.products.map((p, i) => (
            <div key={p.id} className={`rounded-xl border p-3 ${p.on ? 'border-slate-200' : 'border-dashed border-slate-200 bg-slate-50/60'}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-600">
                <label className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                  <input type="checkbox" checked={p.on} onChange={(e) => setP(i, (x) => { x.on = e.target.checked; })} className="accent-brand-600" />
                  <input value={p.name} onChange={(e) => setP(i, (x) => { x.name = e.target.value; })} className="w-44 rounded-md border border-slate-200 px-2 py-1 text-[13px]" aria-label="Product name" />
                </label>
                <span>Price <NumInput value={p.asp} onChange={(v) => setP(i, (x) => { x.asp = v; })} width="w-16" title="Price ₹" min={0} /></span>
                <span>Launch
                  <select value={p.launchMonth} onChange={(e) => setP(i, (x) => { x.launchMonth = Number(e.target.value); })} className="ml-1 rounded-md border border-slate-200 px-1.5 py-1 text-[13px]">
                    {monthOpts.map((o) => <option key={o.m} value={o.m}>{o.label}</option>)}
                  </select>
                </span>
                <span>Units / mo at launch <NumInput value={p.launchUnits} onChange={(v) => setP(i, (x) => { x.launchUnits = v; })} width="w-16" min={0} title="Launch units" /></span>
                <span>Ramp MoM <NumInput unit="pct" value={p.rampPct} onChange={(v) => setP(i, (x) => { x.rampPct = v; })} width="w-14" title="Ramp" /></span>
                <span>Then YoY <NumInput unit="pct" value={p.steadyPct} onChange={(v) => setP(i, (x) => { x.steadyPct = v; })} width="w-14" title="Steady growth" /></span>
                <span>Own COGS <NumInput unit="pct" value={p.cogsPct ?? 0} onChange={(v) => setP(i, (x) => { x.cogsPct = v > 0 ? v : null; })} width="w-14" title="COGS %" /></span>
                {p.placeholder && (
                  <label className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="Volume, price and COGS are placeholders until you confirm them">
                    <input type="checkbox" checked={false} onChange={() => setP(i, (x) => { x.placeholder = false; })} className="accent-brand-600" />
                    Assumption — tick when confirmed
                  </label>
                )}
                <button onClick={() => update((pl) => { pl.products.splice(i, 1); })} className="ml-auto text-[12px] text-slate-400 hover:text-rose-600">Remove</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600">
                <span className="text-slate-500">Channel split</span>
                {CHANNELS.map((ch) => (
                  <span key={ch}>{CHANNEL_NAMES[ch]} <NumInput unit="pct" value={p.split[ch] ?? 0} width="w-12" min={0} max={1} title={`${CHANNEL_NAMES[ch]} share`} onChange={(v) => setP(i, (x) => { x.split[ch] = v; })} /></span>
                ))}
                {Math.abs(CHANNELS.reduce((a, c) => a + (p.split[c] ?? 0), 0) - 1) > 0.001 && <span className="font-semibold text-amber-700">Split adds to {Math.round(CHANNELS.reduce((a, c) => a + (p.split[c] ?? 0), 0) * 100)}%</span>}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Units and revenue by product" description="Per financial year. Revenue in ₹ Cr.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px] tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-3 text-left font-semibold">Product</th>
                {r.years.map((y) => <th key={y.fy} colSpan={2} className="px-2 py-1.5 text-right font-semibold">{y.fy}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">{s.name}</td>
                  {r.years.map((y) => {
                    const ms = months.filter((m) => m.fy === y.fy);
                    const u = ms.reduce((a, m) => a + (m.unitsBySku[s.id] ?? 0), 0);
                    const rv = ms.reduce((a, m) => a + (m.revenueBySku[s.id] ?? 0), 0);
                    return [
                      <td key={y.fy + 'u'} className="px-2 py-1 text-right text-slate-500">{u ? int(u) : '–'}</td>,
                      <td key={y.fy + 'r'} className="px-2 py-1 text-right text-slate-800">{rv ? cr(rv) : '–'}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
