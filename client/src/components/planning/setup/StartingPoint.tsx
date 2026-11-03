// Setup → 1 Starting point (docs/planning/ONE-SETUP.md §2.1): the plan basis (sheet parity or my plan), the example growth
// plan, the opening balance sheet (Tally / typed / the sheet's) and the actuals already booked. Pure helpers: data/planning/setup/mode.ts.
/* eslint-disable react-refresh/only-export-components -- the section contract (types.ts) exports `summary` and `SECTION` next to the component */
import { useState } from 'react';
import { monthLabel, type PlanFx } from '../../../data/planning/engine';
import { founderFx } from '../../../data/planning/basePlan';
import { build500Cr } from '../../../data/planning/growth';
import { monthBefore, openingFromTally } from '../../../data/planning/opening';
import { growthSwitchedOff, planMode, setPlanMode, summary, type PlanMode } from '../../../data/planning/setup/mode';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { NumInput } from '../inputs';
import { Note, Row, SubHead, btn, ensureFx, replacePlan, useBusy } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

const BASIS: { id: PlanMode; label: string; blurb: string }[] = [
  { id: 'sheet', label: 'Sheet parity', blurb: 'the 18-month Projection & Deployment Plan, exactly as the sheet books it' },
  { id: 'plan', label: 'My plan', blurb: 'founder decisions, your products and the growth layer' },
];

const OPENING_FIELDS: { k: keyof Omit<PlanFx['opening'], 'on' | 'source' | 'asOf' | 'note'>; label: string }[] = [
  { k: 'cash', label: 'Cash & bank' },
  { k: 'receivables', label: 'Receivables' },
  { k: 'payables', label: 'Payables' },
  { k: 'inventory', label: 'Inventory' },
  { k: 'gstAsset', label: 'GST input credit (asset)' },
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
    setMsg('Loading…');
    try {
      const res = await fetch('/api/tally/statements');
      const j = (await res.json()) as { months?: Parameters<typeof openingFromTally>[0][]; connected?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
      const want = monthBefore(plan.startMonth);
      const m = j.months?.find((x) => x.period === want);
      const got = m ? openingFromTally(m, plan.fx?.opening ?? founderFx(plan.cash).opening) : null;
      if (!got) { setMsg(j.connected ? `No Trial Balance stored for ${want} yet — Tally health → Pull now.` : 'Tally is not connected (Setup → Tally).'); return; }
      setFx((f) => { f.opening = got.opening; });
      setMsg(`Loaded the ${want} balance sheet.${got.warnings.length ? ' ' + got.warnings[0] : ''}`);
    } catch (e) { setMsg((e as Error).message); }
  };

  const loadExample = () => {
    if (!window.confirm('Replace products, hires, capacity, rounds and targets with the example growth plan (₹30 → 100 → 250 → 500 Cr, every number a placeholder)?')) return;
    run('Building…', () => replacePlan(update, build500Cr));
  };

  return (
    <div className="space-y-5">
      {/* 1. plan basis */}
      <div className="space-y-2">
        <SubHead>Plan basis</SubHead>
        <SegmentedControl<PlanMode> options={BASIS.map(({ id, label }) => ({ id, label }))} value={mode} onChange={(m) => update((p) => setPlanMode(p, m))} size="md" aria-label="Plan basis" />
        <Note>{basis.label} — {basis.blurb}.</Note>
        <Note>Sheet parity ignores every switch, product, hire, round and target below and books tax monthly — the first 18 months then equal the sheet. Outputs show a ‘Sheet parity’ chip.</Note>
        {growthSwitchedOff(plan) && (
          <div className="flex flex-wrap items-center gap-3">
            <Note tone="amber">The products &amp; growth layer is switched off in this saved scenario.</Note>
            <button type="button" className={btn} onClick={() => update((p) => { p.growth!.on = true; })}>Switch it on</button>
          </div>
        )}
      </div>

      {/* 2. example growth plan */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn} disabled={!!busy || mode === 'sheet'} onClick={loadExample}
          title={mode === 'sheet' ? 'Switch the plan basis to My plan first' : 'Replace products, hires, capacity, rounds and targets with the example growth plan'}>
          {busy ?? 'Load the example growth plan'}
        </button>
        <Note>₹30 → 100 → 250 → 500 Cr in FY28–FY31, every number a placeholder to change.</Note>
      </div>

      {/* 3. opening position */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <SubHead>Opening position ({startLabel})</SubHead>
          {mode === 'plan' ? (
            <>
              <span className="text-[12px] text-slate-500">{!o || o.source === 'sheet' ? 'Sheet values — replace with Tally' : o.source === 'tally' ? `From Tally, ${o.asOf ?? ''}` : 'Typed in'}</span>
              <button type="button" className={btn} onClick={loadTally}>Load {priorLabel} from Tally</button>
              {msg && <span className="text-[12px] text-slate-500" role="status">{msg}</span>}
            </>
          ) : (
            <span className="text-[12px] text-slate-500">Sheet’s opening values</span>
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
            {o.note && <Note>{o.note}</Note>}
          </>
        ) : (
          <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <Row label={`Opening cash (${startLabel})`}>
              <NumInput unit="cr" value={plan.cash.openingCash} min={0} width="w-20" title="Opening cash" onChange={(v) => update((p) => { p.cash.openingCash = v; })} />
            </Row>
            <Row label={`Opening inventory (${startLabel})`}>
              <NumInput unit="cr" value={plan.cash.openingInventory} min={0} width="w-20" title="Opening inventory" onChange={(v) => update((p) => { p.cash.openingInventory = v; })} />
            </Row>
            <Row label={`Opening debt (${startLabel})`}>
              <NumInput unit="cr" value={plan.cash.openingDebt} min={0} width="w-20" title="Opening debt" onChange={(v) => update((p) => { p.cash.openingDebt = v; })} />
            </Row>
          </div>
        )}
      </div>

      {/* 4. actuals already booked */}
      <div className="space-y-2">
        <SubHead>Actuals already booked</SubHead>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Apr–Sep ’26 actual revenue" hint="So FY27 shows the whole year">
            <NumInput unit="cr" value={plan.levers.fy27H1Revenue} min={0} width="w-20" title="Apr–Sep 2026 actual revenue" onChange={(v) => update((p) => { p.levers.fy27H1Revenue = v; })} />
          </Row>
          <Row label="Apr–Sep ’26 actual EBITDA">
            <NumInput unit="cr" value={plan.levers.fy27H1Ebitda} width="w-20" title="Apr–Sep 2026 actual EBITDA" onChange={(v) => update((p) => { p.levers.fy27H1Ebitda = v; })} />
          </Row>
          <Row label="Jul–Sep ’26 revenue" hint="For the 12-month Exit ARR">
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
  blurb: 'What the plan starts from: the sheet or your plan, the opening balance sheet, and the actuals already booked.',
  Section,
  summary,
};
