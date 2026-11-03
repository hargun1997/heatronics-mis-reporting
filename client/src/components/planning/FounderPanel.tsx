// Founder decisions (Nov 2026) as switches: GST, General Trade, seed, opening position, venture debt,
// overdraft, D2C discounts, depreciation, SKU tweaks. "Sheet-parity mode" puts them all back to the
// sheet's treatment so the first 18 months reproduce the Projection & Deployment Plan.

import { useState } from 'react';
import { type Plan, type PlanFx } from '../../data/planning/engine';
import { applyFounderDecisions, founderFx, setSheetParity } from '../../data/planning/basePlan';
import { monthBefore, openingFromTally } from '../../data/planning/opening';
import { SectionCard } from '../ui/Card';
import { NumInput } from './inputs';
import { pct } from './fmt';
import type { Update } from './LeverPanel';

const Flag = ({ children = 'Terms not confirmed' }: { children?: string }) => (
  <span className="ml-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{children}</span>
);
const Row = ({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) => (
  <label className="flex items-center justify-between gap-3 text-[13px] text-slate-600">
    <span>{label}{hint && <span className="block text-[11px] text-slate-400">{hint}</span>}</span>
    <span className="flex items-center gap-1.5">{children}</span>
  </label>
);
const Check = ({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: React.ReactNode; hint?: string }) => (
  <Row label={label} hint={hint}><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-brand-600" /></Row>
);

export function ParityToggle({ plan, update }: { plan: Plan; update: Update }) {
  const parity = !plan.fx || plan.fx.sheetParity;
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600" title="Ignore every founder decision and book the plan the way the sheet does: the first 18 months then equal the sheet.">
      <input type="checkbox" checked={parity} className="accent-brand-600"
        onChange={(e) => update((p) => { if (!p.fx) applyFounderDecisions(p); setSheetParity(p, e.target.checked); })} />
      Sheet-parity mode
    </label>
  );
}

export function FounderPanel({ plan, update }: { plan: Plan; update: Update }) {
  const [msg, setMsg] = useState<string | null>(null);
  const raw = plan.fx;
  const months = Array.from({ length: plan.units.length + 12 }, (_, i) => i + 1);

  const set = (fn: (f: PlanFx) => void) => update((p) => { if (!p.fx) applyFounderDecisions(p); fn(p.fx!); });

  const loadTally = async () => {
    setMsg('Loading…');
    try {
      const res = await fetch('/api/tally/statements');
      const j = (await res.json()) as { months?: Parameters<typeof openingFromTally>[0][]; connected?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      const want = monthBefore(plan.startMonth);
      const m = j.months?.find((x) => x.period === want);
      const o = m ? openingFromTally(m, plan.fx?.opening ?? founderFx(plan.cash).opening) : null;
      if (!o) { setMsg(j.connected ? `No Trial Balance stored for ${want} yet — Tally health → Pull now.` : 'Tally is not connected (Data sources → Tally).'); return; }
      set((f) => { f.opening = o.opening; });
      setMsg(`Loaded the ${want} balance sheet.${o.warnings.length ? ' ' + o.warnings[0] : ''}`);
    } catch (e) { setMsg((e as Error).message); }
  };

  if (!raw) {
    return (
      <SectionCard title="Founder decisions" description="This scenario was saved before the Nov-2026 decisions (GST, General Trade, seed, opening position, venture debt, tax, discounts, depreciation). Its numbers are unchanged.">
        <button onClick={() => update((p) => applyFounderDecisions(p))} className="rounded-lg bg-cta px-3 py-1.5 text-xs font-semibold text-on-cta hover:bg-cta-hover">Apply the founder decisions</button>
      </SectionCard>
    );
  }
  const off = raw.sheetParity;
  const o = raw.opening, v = raw.ventureDebt, d = raw.d2cDiscount;

  return (
    <SectionCard
      title="Founder decisions"
      description={off ? 'Sheet-parity mode is on: every switch below is ignored and the plan books exactly as the sheet.' : 'Each switch is a lever. Items tagged “Terms not confirmed” are placeholders — replace them with the real numbers.'}
      actions={<ParityToggle plan={plan} update={update} />}
    >
      <div className={`grid gap-x-8 gap-y-3 lg:grid-cols-2 ${off ? 'opacity-50' : ''}`}>
        <div className="space-y-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Revenue &amp; GST</h4>
          <Check on={raw.gstServicesAsCost} set={(x) => set((f) => { f.gstServicesAsCost = x; })} label="Unrecoverable services GST is a cost" hint="Input GST on services that can’t be set off or refunded is expensed in CM1 (a line of its own), not carried as an asset." />
          <Check on={raw.revenueExGst} set={(x) => set((f) => { f.revenueExGst = x; })} label="P&L on ex-GST revenue" hint="The sheet counts GST-inclusive sales as revenue. On: net revenue and EBITDA are ex-GST (GMV is still shown). Lowers EBITDA and cash by the output GST." />
          <Check on={raw.gtNetRealisation} set={(x) => set((f) => { f.gtNetRealisation = x; })} label="General Trade at net realisation" hint="Revenue = list price less the distributor margin; the margin leaves the commission line. EBITDA is unchanged; revenue, receivables and GST are lower." />
          <Row label={<>D2C discounts &amp; coupons{d.source === 'placeholder' && <Flag>Placeholder</Flag>}</>} hint={`% of D2C list revenue.${plan.d2c.discountPct != null ? ` Shopify says ${pct(plan.d2c.discountPct)}.` : ''}`}>
            <input type="checkbox" checked={d.on} onChange={(e) => set((f) => { f.d2cDiscount.on = e.target.checked; })} className="h-4 w-4 accent-brand-600" />
            <NumInput unit="pct" value={d.pct} min={0} max={0.5} width="w-14" title="D2C discount %" onChange={(x) => set((f) => { f.d2cDiscount.pct = x; f.d2cDiscount.source = 'manual'; })} />
            {plan.d2c.discountPct != null && <button onClick={() => set((f) => { f.d2cDiscount.pct = plan.d2c.discountPct!; f.d2cDiscount.source = 'shopify'; f.d2cDiscount.asOf = plan.d2c.asOf; })} className="text-[11px] font-semibold text-brand-700 hover:underline">Use Shopify’s</button>}
          </Row>
          <Check on={raw.depreciationOnce.on} set={(x) => set((f) => { f.depreciationOnce.on = x; })} label="Depreciation booked once" hint="New capex is capitalised once and depreciated straight-line from the month after it is spent; the sheet’s flat D&amp;A lines stop inflating." />
          {raw.depreciationOnce.on && <Row label="Useful life (years)"><NumInput value={raw.depreciationOnce.lifeYears} min={1} max={20} width="w-14" title="Useful life" onChange={(x) => set((f) => { f.depreciationOnce.lifeYears = x; })} /><Flag>Placeholder</Flag></Row>}
          <Row label="Tax" hint="Losses carried forward by financial year (set under Working capital, GST & tax below)."><span className="text-[12px] font-semibold text-slate-700">{plan.levers.taxMode === 'fy' ? 'By FY, carry losses' : 'As the sheet'}</span></Row>
        </div>

        <div className="space-y-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Funding</h4>
          <Row label={<>Seed round{!raw.seed.confirmed && <Flag>Timing not confirmed</Flag>}</>} hint="Equity. The sheet’s round-cost line follows it (5%).">
            <input type="checkbox" checked={raw.seed.on} onChange={(e) => set((f) => { f.seed.on = e.target.checked; })} className="h-4 w-4 accent-brand-600" />
            <NumInput unit="cr" value={raw.seed.amount} min={0} width="w-16" title="Seed amount" onChange={(x) => set((f) => { f.seed.amount = x; })} />
            <select value={raw.seed.month} onChange={(e) => set((f) => { f.seed.month = Number(e.target.value); f.seed.confirmed = true; })} className="rounded-md border border-slate-200 px-1 py-0.5 text-[12px]" aria-label="Seed month">
              {months.slice(0, plan.units.length).map((m) => <option key={m} value={m}>M{m}</option>)}
            </select>
          </Row>
          <Row label={<>Venture debt{!v.confirmed && <Flag />}</>} hint="Replaces the sheet’s ₹2.5 Cr draw. Interest-only through the moratorium, then equal instalments.">
            <input type="checkbox" checked={v.on} onChange={(e) => set((f) => { f.ventureDebt.on = e.target.checked; })} className="h-4 w-4 accent-brand-600" />
            <NumInput unit="cr" value={v.amount} min={0} width="w-16" title="Venture debt amount" onChange={(x) => set((f) => { f.ventureDebt.amount = x; f.ventureDebt.confirmed = false; })} />
          </Row>
          {v.on && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600">
              <Row label="Interest rate"><NumInput unit="pct" value={v.rate} min={0} max={0.4} width="w-14" title="Venture debt rate" onChange={(x) => set((f) => { f.ventureDebt.rate = x; })} /></Row>
              <Row label="Drawn in M"><NumInput value={v.drawMonth} min={1} max={60} width="w-12" title="Draw month" onChange={(x) => set((f) => { f.ventureDebt.drawMonth = Math.round(x); })} /></Row>
              <Row label="Moratorium (months)"><NumInput value={v.moratoriumMonths} min={0} max={36} width="w-12" title="Moratorium" onChange={(x) => set((f) => { f.ventureDebt.moratoriumMonths = Math.round(x); })} /></Row>
              <Row label="Tenor (months)"><NumInput value={v.tenorMonths} min={1} max={72} width="w-12" title="Tenor" onChange={(x) => set((f) => { f.ventureDebt.tenorMonths = Math.round(x); })} /></Row>
              <Row label="Processing fee"><NumInput unit="pct" value={v.feePct} min={0} max={0.1} width="w-14" title="Processing fee" onChange={(x) => set((f) => { f.ventureDebt.feePct = x; })} /></Row>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={v.confirmed} onChange={(e) => set((f) => { f.ventureDebt.confirmed = e.target.checked; })} className="accent-brand-600" />Terms confirmed</label>
            </div>
          )}
          <Row label={<>Overdraft / negative-cash interest{!raw.overdraft.confirmed && <Flag />}</>} hint="Charged on last month’s negative closing cash. Debt and overdraft are shown apart from equity.">
            <input type="checkbox" checked={raw.overdraft.on} onChange={(e) => set((f) => { f.overdraft.on = e.target.checked; })} className="h-4 w-4 accent-brand-600" />
            <NumInput unit="pct" value={raw.overdraft.rate} min={0} max={0.4} width="w-14" title="Overdraft rate" onChange={(x) => set((f) => { f.overdraft.rate = x; f.overdraft.confirmed = false; })} />
          </Row>
        </div>
      </div>

      <div className={`mt-5 border-t border-slate-100 pt-4 ${off ? 'opacity-50' : ''}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Opening position ({plan.startMonth})</h4>
          <span className="text-[12px] text-slate-500">{o.source === 'tally' ? `From Tally, ${o.asOf}` : o.source === 'manual' ? 'Typed in' : 'Sheet values — replace with Tally'}</span>
          <button onClick={loadTally} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Load Sep-26 from Tally</button>
          {msg && <span className="text-[12px] text-slate-500" role="status">{msg}</span>}
        </div>
        <div className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {([['cash', 'Cash &amp; bank'], ['receivables', 'Receivables'], ['payables', 'Payables'], ['inventory', 'Inventory'], ['gstAsset', 'GST input credit (asset)'], ['debt', 'Debt'], ['accumulatedLosses', 'Accumulated losses (tax)']] as const).map(([k, l]) => (
            <Row key={k} label={<span dangerouslySetInnerHTML={{ __html: l }} />}>
              <NumInput unit="cr" value={o[k]} min={0} width="w-20" title={l.replace('&amp;', '&')} onChange={(x) => set((f) => { f.opening[k] = x; f.opening.source = 'manual'; })} />
            </Row>
          ))}
        </div>
        {o.note && <p className="mt-2 text-[11px] text-slate-500">{o.note}</p>}
      </div>

      <div className={`mt-5 border-t border-slate-100 pt-4 ${off ? 'opacity-50' : ''}`}>
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">hGo and hPulse (sheet SKUs) <Flag>Placeholders</Flag></h4>
        <p className="text-[11px] text-slate-500">Volume multiplier and price over the sheet’s plan. hPulse used to stop selling after its first month (March); it now keeps its run-rate. Lotion and oil are on the Revenue tab.</p>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
          {plan.skus.filter((s) => s.name === 'hGo' || s.name === 'hPulse').map((s) => {
            const t = raw.skuTweaks[s.id] ?? { volume: 1, asp: null };
            return (
              <div key={s.id} className="flex items-center gap-2 text-[13px] text-slate-600">
                <span className="w-14 font-semibold text-slate-800">{s.name}</span>
                volume <NumInput unit="x" value={t.volume} min={0} max={10} step={0.1} width="w-14" title={`${s.name} volume`} onChange={(x) => set((f) => { f.skuTweaks[s.id] = { ...t, volume: x }; })} />
                price <NumInput value={t.asp ?? s.asp} min={0} width="w-16" title={`${s.name} price ₹`} onChange={(x) => set((f) => { f.skuTweaks[s.id] = { ...t, asp: x }; })} />
              </div>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}
