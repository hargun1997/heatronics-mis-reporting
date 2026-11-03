// Cash & funding: raises and debt on a timeline, working-capital and GST assumptions,
// and what the plan needs funded.

import type { CashEvent, CashInputs, Plan, PlanResult } from '../../data/planning/engine';
import { SectionCard } from '../ui/Card';
import { cr, money, pct } from './fmt';
import { NumInput } from './inputs';
import type { Update } from './LeverPanel';
import { FounderPanel } from './FounderPanel';

const KIND: Record<CashEvent['kind'], string> = { equity: 'Equity raise', debtDrawn: 'Debt drawn', debtRepaid: 'Debt repaid' };

export function CashTab({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const c = plan.cash;
  const monthOpts = r.months.map((m) => ({ m: m.m, label: m.label }));
  const setC = <K extends keyof CashInputs>(k: K, v: CashInputs[K]) => update((p) => { p.cash[k] = v; });
  const peak = r.months[r.peakDeficitMonth - 1];
  const low = r.months[r.minClosingCashMonth - 1];
  const gstEnd = r.months[r.months.length - 1];

  const inputs: { k: keyof CashInputs; label: string; unit: 'pct' | 'num' | 'cr'; hint?: string }[] = [
    { k: 'inventoryDays', label: 'Inventory days', unit: 'num', hint: 'Forward cover on the next 3 months’ COGS' },
    { k: 'gmStandard', label: 'Standard gross margin (for inventory)', unit: 'pct' },
    { k: 'receivableDays', label: 'Receivable days', unit: 'num' },
    { k: 'payableDays', label: 'Payable days', unit: 'num' },
    { k: 'refundLagMonths', label: 'GST refund lag (months)', unit: 'num', hint: 'Goods ITC refund under inverted duty' },
    { k: 'gstWriteOffPct', label: 'Stuck services ITC written off', unit: 'pct', hint: 'Share of non-refundable ITC expensed instead of carried' },
    { k: 'interestRate', label: 'Interest rate (start)', unit: 'pct' },
    { k: 'taxRate', label: 'Tax rate', unit: 'pct' },
    { k: 'contingencyPct', label: 'Contingency on peak deficit', unit: 'pct' },
    { k: 'openingInventory', label: 'Opening inventory (Oct-26)', unit: 'cr' },
    { k: 'openingDebt', label: 'Opening debt (Oct-26)', unit: 'cr' },
    { k: 'openingCash', label: 'Opening cash (Oct-26)', unit: 'cr' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Box label="Peak cumulative deficit" value={`₹${cr(r.peakDeficit)} Cr`} sub={peak ? `in ${peak.label}` : ''} />
        <Box label="Funding need (with contingency)" value={`₹${cr(r.fundingRequired)} Cr`} sub={`${pct(c.contingencyPct, 0)} buffer`} />
        <Box label={r.seedEquity > 0 ? "Still to raise after the seed" : "Equity needed after debt"} value={`₹${cr(Math.max(0, r.equityRequired - r.seedEquity))} Cr`} sub={`Total equity ₹${cr(r.equityRequired)} Cr${r.seedEquity > 0 ? ` less seed ₹${cr(r.seedEquity)} Cr` : ""} · debt drawn ₹${cr(r.debtDrawnTotal)} Cr`} />
        <Box label="Lowest closing cash" value={money(r.minClosingCash)} sub={low ? `${low.label}${r.minClosingCash < 0 ? ' — add or bring forward a raise' : ''}` : ''} bad={r.minClosingCash < 0} />
      </div>

      <FounderPanel plan={plan} update={update} />

      <SectionCard
        title="Raises & debt"
        description="Put the Seed round, venture debt and a Series A on the timeline; closing cash shows whether they land in time."
        actions={
          <div className="flex gap-2">
            {(['equity', 'debtDrawn', 'debtRepaid'] as const).map((k) => (
              <button key={k} onClick={() => update((p) => { p.events.push({ id: k + Math.random().toString(36).slice(2, 7), kind: k, month: 1, amount: 0, note: '' }); })}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">+ {KIND[k]}</button>
            ))}
          </div>
        }
      >
        {plan.events.length === 0 && <p className="text-[13px] text-slate-500">Nothing on the timeline yet.</p>}
        <div className="space-y-2">
          {[...plan.events].sort((a, b) => a.month - b.month).map((e) => {
            const i = plan.events.findIndex((x) => x.id === e.id);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 text-[13px]">
                <span className={`w-28 rounded-md px-2 py-0.5 text-center text-[11px] font-semibold ${e.kind === 'equity' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{KIND[e.kind]}</span>
                <select value={e.month} onChange={(ev) => update((p) => { p.events[i].month = Number(ev.target.value); })} className="rounded-md border border-slate-200 px-1.5 py-1 text-[13px]">
                  {monthOpts.map((o) => <option key={o.m} value={o.m}>{o.label}</option>)}
                </select>
                <NumInput unit="cr" value={e.amount} min={0} width="w-20" title="Amount" onChange={(v) => update((p) => { p.events[i].amount = v; })} />
                <input value={e.note} placeholder="Note (e.g. Seed — Hyperscale lead)" onChange={(ev) => update((p) => { p.events[i].note = ev.target.value; })} className="min-w-[220px] flex-1 rounded-md border border-slate-200 px-2 py-1 text-[13px]" />
                {e.venture && plan.fx && !plan.fx.sheetParity && plan.fx.ventureDebt.on && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Replaced by the venture-debt terms above</span>}
                <button onClick={() => update((p) => { p.events.splice(i, 1); })} className="text-[12px] text-slate-400 hover:text-rose-600">Remove</button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-slate-600">
          <span className="font-semibold text-slate-700">Interest rate</span>
          <span>{pct(c.interestRate, 2)} from {r.months[0].label}</span>
          {(c.interestSteps ?? []).map((st, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1">
              then
              <NumInput unit="pct" value={st.rate} min={0} max={1} width="w-16" title="Interest rate" onChange={(v) => update((p) => { p.cash.interestSteps[i].rate = v; })} />
              from
              <select value={st.month} onChange={(e) => update((p) => { p.cash.interestSteps[i].month = Number(e.target.value); })} className="rounded-md border border-slate-200 px-1 py-0.5 text-[12px]">
                {monthOpts.map((o) => <option key={o.m} value={o.m}>{o.label}</option>)}
              </select>
              <button onClick={() => update((p) => { p.cash.interestSteps.splice(i, 1); })} className="text-slate-400 hover:text-rose-600" aria-label="Remove rate step">✕</button>
            </span>
          ))}
          <button onClick={() => update((p) => { (p.cash.interestSteps ??= []).push({ month: 13, rate: p.cash.interestRate }); })} className="text-[12px] font-semibold text-brand-700 hover:underline">+ rate change</button>
        </div>
      </SectionCard>

      <SectionCard title="Working capital, GST & tax" description="Same mechanics as the sheet's Cash Flow & Fundraise tab.">
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {inputs.map((x) => (
            <label key={x.k} className="flex items-center justify-between gap-3 text-[13px] text-slate-600" title={x.hint}>
              <span>{x.label}{x.hint && <span className="block text-[11px] text-slate-400">{x.hint}</span>}</span>
              <NumInput unit={x.unit} value={c[x.k] as number} min={0} width="w-20" title={x.label} onChange={(v) => setC(x.k, v as never)} />
            </label>
          ))}
          <label className="flex items-center justify-between gap-3 text-[13px] text-slate-600">
            <span>Tax method<span className="block text-[11px] text-slate-400">Sheet: tax every profitable month. FY: on the year's profit, losses carried forward.</span></span>
            <select value={plan.levers.taxMode} onChange={(e) => update((p) => { p.levers.taxMode = e.target.value as 'sheet' | 'fy'; })} className="rounded-md border border-slate-200 px-1.5 py-1 text-[13px]">
              <option value="sheet">As the sheet</option>
              <option value="fy">By FY, carry losses</option>
            </select>
          </label>
        </div>
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          GST asset at {gstEnd?.label}: ₹{cr(gstEnd?.gstAsset ?? 0)} Cr. With 5% output GST and 18% input on services and capex, services ITC that can’t be set off keeps building as revenue grows — it is carried as an asset, so it ties up cash every year.
        </p>
      </SectionCard>
    </div>
  );
}

function Box({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-card ${bad ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200/80 bg-surface'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-extrabold tabular-nums ${bad ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
