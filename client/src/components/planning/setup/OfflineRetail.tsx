// Setup → Offline retail & stores (docs/planning/ONE-SETUP.md §2.5): general trade / modern trade / pharmacy channel types
// (outlets added by month, offtake per outlet, margins, fees) and own stores. Was GrowthTab's "General trade, modern trade &
// pharmacy" and "Own stores / outlets" cards. Every write goes through ensureGrowth(p), so the section works before the plan
// has a growth layer. Secondary buttons only; the per-FY lines are feedback, not output tables.
import { CATEGORY_NAMES, type Plan, type RetailType } from '../../../data/planning/engine';
import { defaultRetail, emptyGrowth } from '../../../data/planning/growth';
import { NumInput } from '../inputs';
import { int, money } from '../fmt';
import type { SetupSectionDef, SetupSectionProps } from './types';
import { Check, MonthSelect, Note, SubHead, btn, ensureGrowth, monthsOf, newId, rm, txt } from './shared';
import { nextOutletStep, nextStoreOpening, newRetailType, retailFyRows, storesFeedback, summary } from '../../../data/planning/setup/retail';

export { summary };

type Growth = NonNullable<Plan['growth']>;

/** Families a type's offtake is typed for: the plan's categories, else the three built-in ones. */
function families(plan: Plan): { id: string; name: string }[] {
  const cats = plan.growth?.categories;
  if (cats?.length) return cats.map((c) => ({ id: c.id, name: c.name }));
  return ['topical', 'nutra', 'device'].map((id) => ({ id, name: CATEGORY_NAMES[id] ?? id }));
}

export function Section({ plan, update, result }: SetupSectionProps) {
  const months = monthsOf(result);
  const horizon = months.length;
  const G = plan.growth;
  const retail = G?.retail ?? [];
  const stores = G?.stores ?? emptyGrowth().stores;
  const parity = !plan.fx || plan.fx.sheetParity;
  const layerOff = !!G && !G.on;
  const set = (fn: (g: Growth) => void) => update((p) => { fn(ensureGrowth(p)); });
  const fams = families(plan);
  const sf = storesFeedback(result);

  return (
    <div className="space-y-5">
      {parity && <Note>Sheet parity: offline channels and stores are not in the numbers (Starting point → My plan).</Note>}
      {!parity && layerOff && <Note tone="amber">The products & growth layer is switched off in this saved scenario (Starting point).</Note>}

      {/* offline channel types */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>General trade, modern trade & pharmacy</SubHead>
          <button type="button" className={btn} onClick={() => set((g) => { g.retail = [...(g.retail ?? []), newRetailType(newId('t'))]; })}>Add a channel</button>
        </div>
        <Note>Outlets added by month; each sells units a month per product family at full offtake (after the ramp), split evenly over that family's live lines. We invoice list price less the trade margin; schemes are a revenue deduction, listing fees and servicing are channel costs.</Note>
        {retail.length === 0 && (
          <p className="text-[13px] text-slate-500">
            No offline channels yet.{' '}
            <button type="button" className="font-semibold text-brand-700 underline" onClick={() => set((g) => { g.retail = defaultRetail(); })}>Add GT, MT and pharmacy</button>
          </p>
        )}
        {retail.map((t: RetailType, i) => {
          const setT = (fn: (x: RetailType) => void) => set((g) => { if (g.retail?.[i]) fn(g.retail[i]); });
          const fyRows = retailFyRows(result, t);
          return (
            <div key={t.id} className={`rounded-xl border border-slate-200 p-3 ${t.on ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                <Check checked={t.on} onChange={(v) => setT((x) => { x.on = v; })} label={`${t.name} on`} />
                <input className={`${txt} w-full min-w-[140px] max-w-[360px] font-semibold`} value={t.name} aria-label="Channel" onChange={(e) => setT((x) => { x.name = e.target.value; })} />
                <button type="button" className={`${rm} ml-auto`} aria-label={`Remove ${t.name}`} onClick={() => set((g) => { g.retail?.splice(i, 1); })}>✕</button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-slate-600">
                <span className="text-slate-700">Units / outlet / mo:</span>
                {fams.map((f) => (
                  <span key={f.id}>{f.name.toLowerCase()} <NumInput value={t.units[f.id] ?? 0} min={0} width="w-14" title={`${f.name} units per outlet a month`} onChange={(v) => setT((x) => { x.units[f.id] = v; })} /></span>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-slate-600">
                <span>Trade margin <NumInput unit="pct" value={t.tradeMarginPct} min={0} max={0.9} width="w-12" title="Trade margin" onChange={(v) => setT((x) => { x.tradeMarginPct = v; })} /></span>
                <span>Schemes <NumInput unit="pct" value={t.schemePct} min={0} width="w-12" title="Schemes" onChange={(v) => setT((x) => { x.schemePct = v; })} /></span>
                <span>Listing fee ₹ <NumInput value={t.listingFee} min={0} width="w-16" title="Listing fee per new outlet" onChange={(v) => setT((x) => { x.listingFee = v; })} /></span>
                <span>Servicing ₹/outlet/mo <NumInput value={t.servicePerOutlet} min={0} width="w-16" title="Servicing cost per outlet a month" onChange={(v) => setT((x) => { x.servicePerOutlet = v; })} /></span>
                <span>Ramp <NumInput value={t.rampMonths} min={1} width="w-12" title="Ramp months" onChange={(v) => setT((x) => { x.rampMonths = Math.round(v); })} /> mo</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">
                <b className="text-slate-700">Outlets added</b>
                {t.outlets.map((o, j) => (
                  <span key={j} className="inline-flex items-center gap-1 rounded-lg bg-surface-tint px-1.5 py-1">
                    <MonthSelect title="Month" value={o.month} months={months} onChange={(m) => setT((x) => { x.outlets[j].month = m ?? 1; })} />
                    +<NumInput value={o.add} min={0} width="w-16" title="Outlets added" onChange={(v) => setT((x) => { x.outlets[j].add = Math.round(v); })} />
                    <button type="button" className={rm} aria-label="Remove outlets step" onClick={() => setT((x) => { x.outlets.splice(j, 1); })}>✕</button>
                  </span>
                ))}
                <button type="button" className={btn} onClick={() => setT((x) => { x.outlets.push(nextOutletStep(x, horizon)); })}>+ outlets</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 text-[12px] text-slate-500">
                {fyRows.map((x) => <span key={x.fy}>{x.fy}: <b className="text-slate-700">{int(x.outlets)}</b> outlets · {money(x.invoiced, 1)}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      {/* own stores */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubHead>Own stores / outlets</SubHead>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
            <Check checked={stores.on} onChange={(v) => set((g) => { g.stores.on = v; })} label="Stores on" /> Stores on
          </label>
        </div>
        <Note>Revenue per store a month once mature (incl. GST), reached in a straight line over the ramp. Rent, running costs and staff in Retail Stores; fit-out is capex in the opening month.</Note>
        <div className={`grid gap-6 text-[13px] text-slate-600 lg:grid-cols-[auto_minmax(0,1fr)] ${stores.on ? '' : 'opacity-60'}`}>
          <div className="grid grid-cols-[minmax(0,13rem)_auto] items-center gap-x-4 gap-y-2">
            <span>Mature revenue / store / mo</span><NumInput unit="lakh" value={stores.matureRevenue} min={0} width="w-16" title="Mature revenue" onChange={(v) => set((g) => { g.stores.matureRevenue = v; })} />
            <span>Ramp (months)</span><NumInput value={stores.rampMonths} min={1} width="w-16" title="Ramp months" onChange={(v) => set((g) => { g.stores.rampMonths = Math.round(v); })} />
            <span>Fit-out capex / store</span><NumInput unit="lakh" value={stores.capexPerStore} min={0} width="w-16" title="Fit-out" onChange={(v) => set((g) => { g.stores.capexPerStore = v; })} />
            <span>Rent / store / mo</span><NumInput unit="lakh" value={stores.rentPerStore} min={0} width="w-16" title="Rent" onChange={(v) => set((g) => { g.stores.rentPerStore = v; })} />
            <span>Other running / store / mo</span><NumInput unit="lakh" value={stores.otherOpexPerStore} min={0} width="w-16" title="Other running cost" onChange={(v) => set((g) => { g.stores.otherOpexPerStore = v; })} />
            <span>Staff / store</span><NumInput value={stores.staffPerStore} min={0} width="w-16" title="Staff per store" onChange={(v) => set((g) => { g.stores.staffPerStore = Math.round(v); })} />
            <span>Staff CTC / mo</span><NumInput unit="lakh" value={stores.staffCtc} min={0} width="w-16" title="Staff CTC" onChange={(v) => set((g) => { g.stores.staffCtc = v; })} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <b className="text-slate-700">Openings</b>
              <button type="button" className={btn} onClick={() => set((g) => { g.stores.openings.push(nextStoreOpening(g.stores, horizon)); })}>Add openings</button>
            </div>
            {stores.openings.length === 0 && <p className="text-[12px] text-slate-500">No openings yet.</p>}
            {stores.openings.map((o, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <MonthSelect title="Opening month" value={o.month} months={months} onChange={(m) => set((g) => { g.stores.openings[i].month = m ?? 1; })} />
                <NumInput value={o.count} min={0} width="w-14" title="Stores opened" onChange={(v) => set((g) => { g.stores.openings[i].count = Math.round(v); })} /> stores
                <button type="button" className={rm} aria-label="Remove openings" onClick={() => set((g) => { g.stores.openings.splice(i, 1); })}>✕</button>
              </div>
            ))}
            <p className="mt-2 text-[12px] text-slate-500">{int(sf.stores)} stores at {sf.label} · {sf.byFy.map((y) => `${y.fy} ${money(y.revenue, 1)}`).join(' · ')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'retail',
  title: 'Offline retail & stores',
  blurb: 'General trade, modern trade and pharmacies (outlets, offtake, margins), and own stores.',
  Section,
  summary,
};
