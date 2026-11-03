// Products — the cascade the founder controls (3 Nov 2026): broad assumptions → categories (with the defaults their products
// inherit) → products in each category (launch, price, volumes by ramp or typed per year, channels, economics, repeats, and
// the product's own expenses). Today's sheet SKUs sit under the current range with their volume / price tweaks.
// Engine: resolveProduct / unitsByFy / expenses in data/planning/engine.ts (Growth builder layer: needs growth on, sheet parity off).
import { Fragment, useMemo, useState } from 'react';
import {
  CHANNELS, CHANNEL_NAMES, EXPENSE_GROUP,
  type CategoryDef, type Channel, type NewProduct, type Plan, type PlanResult, type ProductExpense,
} from '../../data/planning/engine';
import { defaultCategories, emptyGrowth, ensureGrowthGroups } from '../../data/planning/growth';
import { applyFounderDecisions, setSheetParity } from '../../data/planning/basePlan';
import { SectionCard } from '../ui/Card';
import { NumInput } from './inputs';
import { LeverPanel, type Update } from './LeverPanel';
import { cr, int, money, pct } from './fmt';

const newId = (p: string) => p + Math.random().toString(36).slice(2, 8);
const btn = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
const primary = 'rounded-lg bg-cta px-3 py-1.5 text-xs font-semibold text-on-cta hover:bg-cta-hover disabled:opacity-40';
const rm = 'rounded px-1.5 py-0.5 text-[12px] font-semibold text-slate-400 hover:text-rose-600';
const txt = 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px]';
const lbl = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

function MonthSelect({ value, onChange, months, title, allowNone }: { value: number | null | undefined; onChange: (m: number | null) => void; months: { m: number; label: string }[]; title: string; allowNone?: boolean }) {
  return (
    <select aria-label={title} title={title} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={txt}>
      {allowNone && <option value="">{title.includes('end') ? 'to the end' : 'launch month'}</option>}
      {months.map((x) => <option key={x.m} value={x.m}>{x.label}</option>)}
    </select>
  );
}

/** A value that falls back to the category's default when left unset. */
function Inherit({ label, value, fallback, unit, onChange, title }: { label: string; value: number | undefined | null; fallback: number | undefined | null; unit: 'pct' | 'num'; onChange: (v: number | undefined) => void; title: string }) {
  const own = value != null;
  return (
    <div>
      <div className={lbl}>{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {own ? <NumInput unit={unit} value={value!} min={0} width="w-16" title={title} onChange={(v) => onChange(v)} />
          : <span className="text-[13px] text-slate-500" title="From the category">{fallback == null ? '—' : unit === 'pct' ? pct(fallback, 1) : int(fallback)} <span className="text-[11px]">(category)</span></span>}
        <button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => onChange(own ? undefined : fallback ?? 0)}>{own ? 'use category' : 'set'}</button>
      </div>
    </div>
  );
}

export function ProductsTab({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const months = r.months.map((m) => ({ m: m.m, label: m.label }));
  const fys = [...new Set(r.months.map((m) => m.fy))];
  const parity = !plan.fx || plan.fx.sheetParity;
  const growthOn = !!plan.growth?.on;
  const active = growthOn && !parity;
  const cats = plan.growth?.categories ?? defaultCategories();

  // per product: revenue + units by FY, from the run
  const byFy = useMemo(() => {
    const out: Record<string, Record<string, { rev: number; units: number }>> = {};
    for (const m of r.months) for (const [id, v] of Object.entries(m.revenueBySku)) {
      const o = (out[id] ??= {}); const c = (o[m.fy] ??= { rev: 0, units: 0 });
      c.rev += v; c.units += m.unitsBySku[id] ?? 0;
    }
    return out;
  }, [r]);

  const enable = () => update((p) => {
    if (!p.fx) applyFounderDecisions(p);
    setSheetParity(p, false);
    if (!p.growth) p.growth = { ...emptyGrowth(), on: true };
    p.growth.on = true;
    ensureGrowthGroups(p);
  });
  const setCats = (fn: (c: CategoryDef[]) => void) => update((p) => {
    if (!p.growth) { p.growth = { ...emptyGrowth(), on: false }; ensureGrowthGroups(p); }
    if (!p.growth.categories) p.growth.categories = defaultCategories();
    fn(p.growth.categories);
  });
  const setProd = (id: string, fn: (x: NewProduct) => void) => update((p) => { const x = p.products.find((y) => y.id === id); if (x) fn(x); });
  const addProduct = (cat: CategoryDef) => {
    const id = newId('g-');
    update((p) => {
      if (!p.growth) { p.growth = { ...emptyGrowth(), on: true }; ensureGrowthGroups(p); }
      if (!p.growth.categories) p.growth.categories = defaultCategories();
      p.products.push({
        id, name: `New ${cat.name.toLowerCase().replace(/s$/, '')}`, on: true, category: cat.id, asp: 999, launchMonth: Math.min(13, p.units.length + 1),
        launchUnits: 500, rampPct: 0.1, steadyPct: 0.3, split: { ...(cat.split ?? { A: 0.5, D: 0.4, F: 0.1, G: 0, P: 0 }) }, cogsPct: null,
        seasonRef: 'flat', growthLine: true, placeholder: true, expenses: [],
      });
    });
    setOpen(id);
  };
  const catOf = (x: NewProduct) => cats.find((c) => c.id === (x.category ?? '')) ?? null;
  const orphans = plan.products.filter((x) => !catOf(x));

  return (
    <div className="space-y-5">
      {!active && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <span className="min-w-0 flex-1">
            {parity ? 'Sheet-parity mode is on, so the products, categories and product expenses below are not in the numbers.' : 'The growth layer is off, so the products below are not in the numbers.'}
            {' '}Turn it on to plan with them (the 18-month sheet view stays one click away: tick Sheet-parity mode again).
          </span>
          <button className={primary} onClick={enable}>Use my products in the plan</button>
        </div>
      )}

      {showAssumptions ? (
        <SectionCard title="Broad assumptions" description="The levers every product sits on: growth of today's range by channel and year, price change, raw-material trend, ROAS, brand spend, team growth and inflation."
          actions={<button className={btn} onClick={() => setShowAssumptions(false)} aria-expanded>Hide</button>}>
          <div className="max-w-xl"><LeverPanel plan={plan} update={update} /></div>
        </SectionCard>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-surface px-5 py-4 shadow-card">
          <div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-slate-900">Broad assumptions</h3>
            <p className="mt-0.5 text-xs text-slate-500">The levers every product sits on: growth of today's range by channel and year, price change, raw-material trend, ROAS, brand spend, team growth and inflation.</p></div>
          <button className={btn} onClick={() => setShowAssumptions(true)} aria-expanded={false}>Show</button>
        </div>
      )}

      {/* today's range */}
      <SectionCard title="Current range (from the sheet)" description="Today's SKUs. Volume × scales every month's units (1 = as planned); price overrides the selling price incl. GST.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px] tabular-nums">
            <thead><tr className="bg-surface-tint text-left">
              <th className="px-3 py-2 font-semibold text-slate-500">SKU</th><th className="px-2 text-right font-semibold text-slate-500">Volume ×</th><th className="px-2 text-right font-semibold text-slate-500">Price ₹</th>
              {fys.map((f) => <th key={f} className="px-2 text-right font-semibold text-slate-500">{f} ₹ Cr</th>)}
            </tr></thead>
            <tbody>{plan.skus.map((s) => {
              const tw = plan.fx?.skuTweaks?.[s.id];
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-900">{s.name}</td>
                  <td className="px-2 text-right"><NumInput value={tw?.volume ?? 1} min={0} step={0.05} width="w-14" title={`${s.name} volume ×`} disabled={!plan.fx || parity}
                    onChange={(v) => update((p) => { if (!p.fx) applyFounderDecisions(p); p.fx!.skuTweaks[s.id] = { volume: v, asp: p.fx!.skuTweaks[s.id]?.asp ?? null }; })} /></td>
                  <td className="px-2 text-right"><NumInput value={tw?.asp ?? s.asp} min={0} width="w-16" title={`${s.name} price`} disabled={!plan.fx || parity}
                    onChange={(v) => update((p) => { if (!p.fx) applyFounderDecisions(p); p.fx!.skuTweaks[s.id] = { volume: p.fx!.skuTweaks[s.id]?.volume ?? 1, asp: v }; })} /></td>
                  {fys.map((f) => <td key={f} className="px-2 text-right text-slate-700">{cr(byFy[s.id]?.[f]?.rev ?? 0, 1)}</td>)}
                </tr>);
            })}</tbody>
          </table>
        </div>
        {parity && <p className="px-4 py-2 text-[12px] text-slate-500">Volume and price tweaks apply once Sheet-parity mode is off.</p>}
      </SectionCard>

      {/* categories → products */}
      {cats.map((c, ci) => {
        const prods = plan.products.filter((x) => (x.category ?? '') === c.id);
        const rev = (f: string) => prods.reduce((a, x) => a + (byFy[x.id]?.[f]?.rev ?? 0), 0);
        return (
          <section key={c.id} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-card" aria-label={c.name}>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <input className={`${txt} text-[15px] font-semibold`} value={c.name} aria-label="Category name" onChange={(e) => setCats((cs) => { cs[ci].name = e.target.value; })} />
              <span className="text-[12px] text-slate-500">{prods.length} product{prods.length === 1 ? '' : 's'} · {fys.slice(-3).map((f) => `${f} ${money(rev(f), 1)}`).join(' · ')}</span>
              <button className={`${primary} ml-auto`} onClick={() => addProduct(c)}>+ Add product</button>
              <button className={rm} title={prods.length ? 'Move or delete its products first' : 'Remove this category'} disabled={prods.length > 0}
                onClick={() => setCats((cs) => { cs.splice(ci, 1); })}>Remove</button>
            </div>
            <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 bg-surface-tint/50 px-4 py-3 text-[12.5px]">
              <span className="text-[12px] font-semibold text-slate-600">Defaults its products inherit:</span>
              <div><div className={lbl}>Material %</div><NumInput unit="pct" value={c.cogsPct ?? 0} min={0} max={1} width="w-14" title="Material cost % of revenue" onChange={(v) => setCats((cs) => { cs[ci].cogsPct = v; })} /></div>
              <div><div className={lbl}>Marketing %</div><NumInput unit="pct" value={c.marketingPct ?? 0} min={0} width="w-14" title="Extra marketing % of revenue" onChange={(v) => setCats((cs) => { cs[ci].marketingPct = v; })} /></div>
              <div><div className={lbl}>Repeat / mo</div><NumInput unit="pct" value={c.repeatPct ?? 0} min={0} max={1} width="w-14" title="Share of a month's buyers who buy again next month" onChange={(v) => setCats((cs) => { cs[ci].repeatPct = v; })} /></div>
              <div><div className={lbl}>Repeaters kept / mo</div><NumInput unit="pct" value={c.repeatDecay ?? 0} min={0} max={1} width="w-14" title="Month-on-month retention" onChange={(v) => setCats((cs) => { cs[ci].repeatDecay = v; })} /></div>
              <label className="flex items-center gap-1.5 pb-1"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!c.inHouse} onChange={(e) => setCats((cs) => { cs[ci].inHouse = e.target.checked; })} /> Made in-house</label>
              <div className="flex items-end gap-1.5">{CHANNELS.map((ch) => (
                <div key={ch}><div className={lbl}>{CHANNEL_NAMES[ch]}</div><NumInput unit="pct" value={c.split?.[ch] ?? 0} min={0} max={1} width="w-12" title={`${CHANNEL_NAMES[ch]} share for new products`}
                  onChange={(v) => setCats((cs) => { cs[ci].split = { ...(cs[ci].split ?? { A: 0, D: 0, F: 0, G: 0, P: 0 }), [ch]: v }; })} /></div>))}</div>
            </div>
            {prods.length === 0 ? <p className="px-4 py-4 text-[13px] text-slate-500">No products yet — “+ Add product”.</p> : (
              <ul className="divide-y divide-slate-100">{prods.map((x) => (
                <ProductRow key={x.id} x={x} c={c} cats={cats} months={months} fys={fys} byFy={byFy[x.id] ?? {}} open={open === x.id}
                  onToggle={() => setOpen(open === x.id ? null : x.id)} setProd={setProd} update={update} />
              ))}</ul>
            )}
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} onClick={() => setCats((cs) => { cs.push({ id: newId('cat-'), name: 'New category', cogsPct: 0.3, marketingPct: 0.05, repeatPct: 0, repeatDecay: 0, inHouse: false, split: { A: 0.5, D: 0.4, F: 0.1, G: 0, P: 0 } }); })}>+ Add category</button>
      </div>
      {orphans.length > 0 && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-surface px-4 py-3" aria-label="Products without a category">
          <h3 className="text-sm font-bold text-slate-900">Not in a category yet</h3>
          <p className="mt-0.5 text-xs text-slate-500">Older product lines from the sheet. Put each in a category to edit its volumes, economics and expenses here.</p>
          <ul className="mt-2 divide-y divide-slate-100">{orphans.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1 text-slate-900">{x.name}{x.placeholder && !/placeholder/i.test(x.name) ? ' (placeholder)' : ''}{x.on ? '' : <span className="text-slate-500"> · off</span>}</span>
              <span className="text-[12px] tabular-nums text-slate-500">{fys.slice(-3).map((f) => `${f} ${money(byFy[x.id]?.[f]?.rev ?? 0, 1)}`).join(' · ')}</span>
              <select className="min-h-[36px] rounded-lg border border-slate-200 bg-surface px-2 text-[13px]" aria-label={`Category for ${x.name}`} value=""
                onChange={(e) => { const id = e.target.value; if (id) setProd(x.id, (q) => { q.category = id; }); }}>
                <option value="">Put in category…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </li>))}</ul>
        </section>
      )}
    </div>
  );
}

function ProductRow({ x, c, cats, months, fys, byFy, open, onToggle, setProd, update }: {
  x: NewProduct; c: CategoryDef; cats: CategoryDef[]; months: { m: number; label: string }[]; fys: string[]; byFy: Record<string, { rev: number; units: number }>;
  open: boolean; onToggle: () => void; setProd: (id: string, fn: (x: NewProduct) => void) => void; update: Update;
}) {
  const set = (fn: (y: NewProduct) => void) => setProd(x.id, fn);
  const byYear = !!x.unitsByFy && Object.keys(x.unitsByFy).length > 0;
  const splitSum = CHANNELS.reduce((a, ch) => a + (x.split[ch] ?? 0), 0);
  return (
    <li className={x.on ? '' : 'opacity-60'}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={x.on} aria-label={`${x.name} on`} onChange={(e) => set((y) => { y.on = e.target.checked; })} />
        <input className={`${txt} min-w-[180px] font-medium`} value={x.name} aria-label="Product name" onChange={(e) => set((y) => { y.name = e.target.value; })} />
        {x.placeholder && <button type="button" className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Click once these numbers are yours" onClick={() => set((y) => { y.placeholder = false; })}>placeholder</button>}
        <span className="text-[12px] text-slate-500">launch</span><MonthSelect title="Launch month" value={x.launchMonth} months={months} onChange={(m) => set((y) => { y.launchMonth = m ?? 1; })} />
        <span className="text-[12px] text-slate-500">price</span><NumInput value={x.asp} min={0} width="w-16" title="Price incl. GST" onChange={(v) => set((y) => { y.asp = v; })} />
        <span className="ml-auto text-[12px] tabular-nums text-slate-600">{fys.slice(-3).map((f) => `${f} ${cr(byFy[f]?.rev ?? 0, 1)} Cr`).join(' · ')}</span>
        <button type="button" className="rounded px-1.5 py-0.5 text-[12px] font-semibold text-brand-700 hover:underline" aria-expanded={open} onClick={onToggle}>{open ? 'Close' : 'Edit'}</button>
        <button className={rm} aria-label={`Remove ${x.name}`} onClick={() => { if (window.confirm(`Remove ${x.name}?`)) update((p) => { p.products = p.products.filter((y) => y.id !== x.id); }); }}>✕</button>
      </div>
      {open && (
        <div className="grid gap-4 bg-surface-tint/40 px-4 py-4 lg:grid-cols-2">
          {/* volume */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2"><span className="text-[13px] font-semibold text-slate-800">Volume (new buyers)</span>
              <select className={`${txt} ml-auto`} aria-label="Volume mode" value={byYear ? 'year' : 'ramp'}
                onChange={(e) => set((y) => { if (e.target.value === 'year') { y.unitsByFy = Object.fromEntries(fys.map((f) => [f, Math.round(byFy[f]?.units ?? 0)])); } else { delete y.unitsByFy; } })}>
                <option value="ramp">Launch + growth</option><option value="year">Type units per year</option>
              </select></div>
            {byYear ? (
              <div className="flex flex-wrap gap-2">{fys.map((f) => (
                <div key={f}><div className={lbl}>{f}</div><NumInput value={x.unitsByFy?.[f] ?? 0} min={0} width="w-20" title={`${f} units`} onChange={(v) => set((y) => { y.unitsByFy = { ...(y.unitsByFy ?? {}), [f]: v }; })} /></div>))}
                <p className="w-full text-[11.5px] text-slate-500">New-buyer units in each FY, spread over its months on sale; repeat orders come on top. The revenue-path solver leaves typed years alone.</p></div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <div><div className={lbl}>Units / mo at launch</div><NumInput value={Math.round(x.launchUnits)} min={0} width="w-20" title="Units a month at launch" onChange={(v) => set((y) => { y.launchUnits = v; })} /></div>
                <div><div className={lbl}>Growth m/m, year 1</div><NumInput unit="pct" value={x.rampPct} width="w-14" title="Month-on-month growth, first year" onChange={(v) => set((y) => { y.rampPct = v; })} /></div>
                <div><div className={lbl}>Growth y/y after</div><NumInput unit="pct" value={x.steadyPct} width="w-14" title="Year-on-year growth after" onChange={(v) => set((y) => { y.steadyPct = v; })} /></div>
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 text-[12px] tabular-nums text-slate-600">{fys.map((f) => <span key={f}>{f}: {int(byFy[f]?.units ?? 0)} units</span>)}</div>
            <div className="flex items-center gap-2 text-[12.5px]"><span className="text-slate-600">Category</span>
              <select className={txt} aria-label="Category" value={x.category ?? ''} onChange={(e) => set((y) => { y.category = e.target.value; })}>
                {cats.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select></div>
          </div>

          {/* economics */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[13px] font-semibold text-slate-800">Economics <span className="font-normal text-slate-500">(blank = {c.name}'s default)</span></div>
            <div className="flex flex-wrap gap-4">
              <Inherit label="Material %" unit="pct" value={x.cogsPct} fallback={c.cogsPct} title="Material cost % of revenue" onChange={(v) => set((y) => { y.cogsPct = v ?? null; })} />
              <Inherit label="Marketing %" unit="pct" value={x.marketingPct} fallback={c.marketingPct} title="Extra marketing % of revenue" onChange={(v) => set((y) => { y.marketingPct = v; })} />
              <Inherit label="Repeat / mo" unit="pct" value={x.repeatPct} fallback={c.repeatPct} title="Repeat rate" onChange={(v) => set((y) => { y.repeatPct = v; })} />
              <Inherit label="Repeaters kept" unit="pct" value={x.repeatDecay} fallback={c.repeatDecay} title="Repeat buyers kept each month" onChange={(v) => set((y) => { y.repeatDecay = v; })} />
              <div><div className={lbl}>Made</div>
                <select className={`${txt} mt-1`} aria-label="Made in-house" value={x.inHouse == null ? '' : x.inHouse ? 'in' : 'out'} onChange={(e) => set((y) => { y.inHouse = e.target.value === '' ? undefined : e.target.value === 'in'; })}>
                  <option value="">{c.inHouse ? 'in-house (category)' : 'outsourced (category)'}</option><option value="in">in-house</option><option value="out">outsourced</option>
                </select></div>
            </div>
          </div>

          {/* channels */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 lg:col-span-2">
            <div className="flex items-center gap-2"><span className="text-[13px] font-semibold text-slate-800">Channels</span>
              <span className={`text-[12px] ${Math.abs(splitSum - 1) > 0.005 ? 'text-rose-600' : 'text-slate-500'}`}>shares add to {pct(splitSum, 0)}</span></div>
            <div className="flex flex-wrap gap-3">{CHANNELS.map((ch: Channel) => (
              <div key={ch} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px]">
                <div className="mb-1 font-semibold text-slate-700">{CHANNEL_NAMES[ch]}</div>
                <div className="flex items-center gap-1">share <NumInput unit="pct" value={x.split[ch] ?? 0} min={0} max={1} width="w-12" title={`${CHANNEL_NAMES[ch]} share`} onChange={(v) => set((y) => { y.split[ch] = v; })} /></div>
                <div className="mt-1 flex items-center gap-1">from <MonthSelect title={`${CHANNEL_NAMES[ch]} start`} value={x.chStart?.[ch] ?? x.launchMonth} months={months} onChange={(m) => set((y) => { y.chStart = { ...(y.chStart ?? {}), [ch]: m ?? y.launchMonth }; })} /></div>
                <div className="mt-1 flex items-center gap-1">+ / yr <NumInput unit="pct" value={x.chGrowth?.[ch] ?? 0} width="w-12" title={`${CHANNEL_NAMES[ch]} extra growth a year`} onChange={(v) => set((y) => { y.chGrowth = { ...(y.chGrowth ?? {}), [ch]: v }; })} /></div>
              </div>))}
              <div className="rounded-lg border border-slate-200 px-2.5 py-2 text-[12.5px]"><div className="mb-1 font-semibold text-slate-700">GT / MT / pharmacy</div>
                <div className="flex items-center gap-1">in outlets from <MonthSelect title="Offline start" value={x.retailStart ?? x.launchMonth} months={months} onChange={(m) => set((y) => { y.retailStart = m ?? y.launchMonth; })} /></div>
                <p className="mt-1 max-w-[200px] text-[11.5px] text-slate-500">Outlets and offtake per category: Growth builder → outlet plan.</p></div>
            </div>
          </div>

          {/* expenses */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 lg:col-span-2">
            <div className="flex items-center gap-2"><span className="text-[13px] font-semibold text-slate-800">This product's expenses</span>
              <button className={`${btn} ml-auto`} onClick={() => set((y) => { y.expenses = [...(y.expenses ?? []), { id: newId('e-'), label: 'Launch campaign', kind: 'oneoff', amount: 500_000 }]; })}>+ Add expense</button></div>
            {(x.launchCost || x.launchCapex) ? <p className="text-[12px] text-slate-500">Also: launch cost {money(x.launchCost ?? 0, 2)} and tooling {money(x.launchCapex ?? 0, 2)} in the launch month (Growth builder table).</p> : null}
            {!(x.expenses ?? []).length ? <p className="text-[12.5px] text-slate-500">None. Add formulation / licences / trials (one-off), moulds (capex), a brand manager or warehouse slot (monthly), or royalties / extra commission (% of its revenue).</p> : (
              <table className="w-full text-[12.5px]"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1 font-semibold">What</th><th className="font-semibold">Kind</th><th className="text-right font-semibold">Amount</th><th className="font-semibold">From</th><th className="font-semibold">To</th><th className="text-right font-semibold">+ / yr</th><th className="font-semibold">P&L group</th><th /></tr></thead>
                <tbody>{(x.expenses ?? []).map((e, ei) => {
                  const setE = (fn: (q: ProductExpense) => void) => set((y) => { fn(y.expenses![ei]); });
                  return (
                    <Fragment key={e.id}>
                      <tr className="border-t border-slate-100">
                        <td className="py-1 pr-2"><input className={`${txt} w-full min-w-[140px]`} value={e.label} aria-label="Expense" onChange={(ev) => setE((q) => { q.label = ev.target.value; })} /></td>
                        <td className="pr-2"><select className={txt} aria-label="Kind" value={e.kind} onChange={(ev) => setE((q) => { q.kind = ev.target.value as ProductExpense['kind']; if (q.kind === 'pct' && q.amount > 1) q.amount = 0.02; })}>
                          <option value="oneoff">One-off</option><option value="capex">Capex (one-off)</option><option value="monthly">Monthly</option><option value="pct">% of its revenue</option></select></td>
                        <td className="pr-2 text-right">{e.kind === 'pct' ? <NumInput unit="pct" value={e.amount} min={0} width="w-14" title="Share of revenue" onChange={(v) => setE((q) => { q.amount = v; })} />
                          : <NumInput unit="lakh" value={e.amount} min={0} width="w-16" title="₹ lakh" onChange={(v) => setE((q) => { q.amount = v; })} />}</td>
                        <td className="pr-2"><MonthSelect title="Start (blank = launch)" allowNone value={e.month ?? null} months={months} onChange={(m) => setE((q) => { q.month = m ?? undefined; })} /></td>
                        <td className="pr-2">{e.kind === 'monthly' || e.kind === 'pct' ? <MonthSelect title="end" allowNone value={e.end ?? null} months={months} onChange={(m) => setE((q) => { q.end = m; })} /> : <span className="text-slate-400">—</span>}</td>
                        <td className="pr-2 text-right">{e.kind === 'monthly' ? <NumInput unit="pct" value={e.growthPct ?? 0} width="w-12" title="Rise a year" onChange={(v) => setE((q) => { q.growthPct = v; })} /> : <span className="text-slate-400">—</span>}</td>
                        <td className="pr-2 text-slate-600">{e.group || EXPENSE_GROUP[e.kind]}</td>
                        <td><button className={rm} aria-label={`Remove ${e.label}`} onClick={() => set((y) => { y.expenses = (y.expenses ?? []).filter((q) => q.id !== e.id); })}>✕</button></td>
                      </tr>
                    </Fragment>);
                })}</tbody></table>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
