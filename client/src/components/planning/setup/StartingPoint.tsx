// Setup → 1 Starting point (docs/planning/ONE-SETUP.md §2.1): the plan basis (sheet parity or my plan), the example growth
// plan, the opening balance sheet (Tally / typed / the sheet's) and the actuals already booked. Pure helpers: data/planning/setup/mode.ts.
import { useState } from 'react';
import { monthLabel, type PlanFx } from '../../../data/planning/engine';
import { founderFx } from '../../../data/planning/basePlan';
import { buildPainCarePlan } from '../../../data/planning/painCare';
import { build500Cr } from '../../../data/planning/growth';
import { monthBefore, openingFromTally } from '../../../data/planning/opening';
import { growthSwitchedOff, planMode, setPlanMode, summary, type PlanMode } from '../../../data/planning/setup/mode';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { NumInput } from '../inputs';
import { Note, Row, SubHead, Tip, btn, ensureFx, replacePlan, useBusy } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

const BASIS: { id: PlanMode; label: string; blurb: string }[] = [
  { id: 'sheet', label: 'Sheet parity', blurb: 'The 18-month sheet, as the sheet books it.' },
  { id: 'plan', label: 'My plan', blurb: 'Founder decisions, your products and the growth layer.' },
];

const OPENING_FIELDS: { k: keyof Omit<PlanFx['opening'], 'on' | 'source' | 'asOf' | 'note'>; label: string }[] = [
  { k: 'cash', label: 'Cash and bank' },
  { k: 'receivables', label: 'Receivables' },
  { k: 'payables', label: 'Payables' },
  { k: 'inventory', label: 'Stock' },
  { k: 'gstAsset', label: 'GST input credit' },
  { k: 'debt', label: 'Debt' },
  { k: 'accumulatedLosses', label: 'Accumulated losses (tax)' },
];

export function Section({ plan, update }: SetupSectionProps) {
  const mode = planMode(plan);
  const basis = BASIS.find((b) => b.id === mode) ?? BASIS[0];
  const [busy, run] = useBusy();
  const [msg, setMsg] = useState<string | null>(null);
  const startLabel = monthLabel(plan.startMonth, 1);
  const priorLabel = monthLabel(plan.startMonth, 0);
  const o = plan.fx?.opening;

  const setFx = (fn: (f: PlanFx) => void) => update((p) => { fn(ensureFx(p)); });

  const loadTally = async () => {
    setMsg('Loading');
    try {
      const res = await fetch('/api/tally/statements');
      const j = (await res.json()) as { months?: Parameters<typeof openingFromTally>[0][]; connected?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      const want = monthBefore(plan.startMonth);
      const m = j.months?.find((x) => x.period === want);
      const got = m ? openingFromTally(m, plan.fx?.opening ?? founderFx(plan.cash).opening) : null;
      if (!got) { setMsg(j.connected ? `No Trial Balance for ${want}. Pull it in Tally health.` : 'Tally is not connected. Connect it in Setup.'); return; }
      setFx((f) => { f.opening = got.opening; });
      setMsg(`${want} balance sheet loaded.${got.warnings.length ? ' ' + got.warnings[0] : ''}`);
    } catch (e) { setMsg((e as Error).message); }
  };

  const loadExample = () => {
    if (!window.confirm('Replace products, hires, capacity, rounds and targets with the example plan? All its numbers are placeholders.')) return;
    run('Building…', () => replacePlan(update, build500Cr));
  };
  const loadPainCare = () => {
    if (!window.confirm('Replace products, hires, capacity, rounds and targets with the pain-care plan?')) return;
    run('Building…', () => replacePlan(update, buildPainCarePlan));
  };

  return (
    <div className="space-y-5">
      {/* 1. plan basis */}
      <div className="space-y-2">
        <SubHead info={<><p>Sheet parity: the plan ignores all switches, products, hires, rounds and targets. Tax is monthly.</p><p>Then the first 18 months are equal to the sheet.</p><p>My plan: the founder decisions, your products and the growth layer apply.</p></>}>Plan basis</SubHead>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<PlanMode> options={BASIS.map(({ id, label }) => ({ id, label }))} value={mode} onChange={(m) => update((p) => setPlanMode(p, m))} size="md" aria-label="Plan basis" />
          <Note>{basis.blurb}</Note>
        </div>
        {growthSwitchedOff(plan) && (
          <div className="flex flex-wrap items-center gap-3">
            <Note tone="amber">The growth layer is off in this scenario.</Note>
            <button type="button" className={btn} onClick={() => update((p) => { p.growth!.on = true; })}>Turn on</button>
          </div>
        )}
      </div>

      {/* 2. example plans */}
      <div className="space-y-2">
        <SubHead info={<><p>Example: ₹30 → 100 → 250 → 500 Cr in FY28 to FY31. All numbers are placeholders.</p><p>Pain-care (Nov 2026): online only for 12 months (Amazon, Flipkart, D2C), topicals and hGo. GT, pharmacy, physio and new devices start at the Jan-28 round. ₹100 → 250 → 500 Cr in FY29 to FY31.</p><p>A load replaces products, hires, capacity, rounds and targets. Then click &quot;Save as scenario&quot;.</p><p>Select &quot;My plan&quot; first.</p></>}>Start from a ready plan</SubHead>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} disabled={!!busy || mode === 'sheet'} onClick={loadExample}
            title={mode === 'sheet' ? 'Select My plan first' : undefined}>
            {busy ?? 'Load the example plan'}
          </button>
          <button type="button" className={btn} disabled={!!busy || mode === 'sheet'} onClick={loadPainCare}
            title={mode === 'sheet' ? 'Select My plan first' : undefined}>
            {busy ?? 'Load the pain-care plan'}
          </button>
        </div>
      </div>

      {/* 3. opening position */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <SubHead>Opening position, {startLabel} (₹ Cr)</SubHead>
          {mode === 'plan' ? (
            <>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{!o || o.source === 'sheet' ? 'Sheet values' : o.source === 'tally' ? `Tally, ${String(o.asOf ?? '').slice(0, 10)}` : 'Typed'}</span>
              <button type="button" className={btn} onClick={loadTally}>Load {priorLabel} from Tally</button>
              {msg && <span className="text-[12px] text-slate-600" role="status">{msg}</span>}
            </>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Sheet values</span>
          )}
        </div>
        {mode === 'plan' && o ? (
          <>
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {OPENING_FIELDS.map(({ k, label }) => (
                <Row key={k} label={label}>
                  <NumInput unit="cr" value={o[k]} min={0} width="w-20" title={label} onChange={(x) => setFx((f) => { f.opening[k] = x; f.opening.source = 'manual'; })} />
                </Row>
              ))}
            </div>
            {o.note && <p className="flex items-center gap-1 text-[12px] text-slate-600">Note<Tip label="Note on the opening values">{o.note}</Tip></p>}
          </>
        ) : (
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Cash">
              <NumInput unit="cr" value={plan.cash.openingCash} min={0} width="w-20" title="Opening cash" onChange={(v) => update((p) => { p.cash.openingCash = v; if (p.fx?.opening.source === 'sheet') p.fx.opening.cash = v; })} />
            </Row>
            <Row label="Stock">
              <NumInput unit="cr" value={plan.cash.openingInventory} min={0} width="w-20" title="Opening inventory" onChange={(v) => update((p) => { p.cash.openingInventory = v; if (p.fx?.opening.source === 'sheet') p.fx.opening.inventory = v; })} />
            </Row>
            <Row label="Debt">
              <NumInput unit="cr" value={plan.cash.openingDebt} min={0} width="w-20" title="Opening debt" onChange={(v) => update((p) => { p.cash.openingDebt = v; if (p.fx?.opening.source === 'sheet') p.fx.opening.debt = v; })} />
            </Row>
          </div>
        )}
      </div>

      {/* 4. actuals already booked */}
      <div className="space-y-2">
        <SubHead>Actuals already booked (₹ Cr)</SubHead>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Revenue, Apr–Sep 26" hint="FY27 adds this, so it shows the full year.">
            <NumInput unit="cr" value={plan.levers.fy27H1Revenue} min={0} width="w-20" title="Apr–Sep 2026 actual revenue" onChange={(v) => update((p) => { p.levers.fy27H1Revenue = v; })} />
          </Row>
          <Row label="EBITDA, Apr–Sep 26">
            <NumInput unit="cr" value={plan.levers.fy27H1Ebitda} width="w-20" title="Apr–Sep 2026 actual EBITDA" onChange={(v) => update((p) => { p.levers.fy27H1Ebitda = v; })} />
          </Row>
          <Row label="Revenue, Jul–Sep 26" hint="The 12-month Exit ARR uses this.">
            <NumInput unit="cr" value={plan.business.exitPriorL3M} min={0} width="w-20" title="Jul–Sep 2026 revenue" onChange={(v) => update((p) => { p.business.exitPriorL3M = v; })} />
          </Row>
        </div>
      </div>
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'start',
  title: 'Starting point',
  blurb: 'The plan basis, the opening balance sheet and the actuals.',
  Section,
  summary,
};
