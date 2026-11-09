// Setup → 2 Assumptions (docs/planning/ONE-SETUP.md §2.2): the levers every product sits on, the accounting
// switches, and working capital / GST / tax / interest. Absorbs LeverPanel, the Revenue tab's channel × FY growth
// table, the seasonality-shape choice, the Founder-panel switches and the Cash tab's inputs (minus the opening values).

import { CHANNELS, CHANNEL_NAMES, LEGACY_FX, type Channel, type PlanFx } from '../../../data/planning/engine';
import {
  CASH_FIELDS, EXT_FYS, addInterestStep, avgGrowth, planMode, setAllGrowth, setChannelGrowth, summary,
} from '../../../data/planning/setup/assumptions';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { cr } from '../fmt';
import { Lever, NumInput } from '../inputs';
import { CheckRow, Flag, MonthSelect, Note, Row, SubHead, ensureFx, monthsOf, td, th, thr, txt } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

export function Section({ plan, update, result }: SetupSectionProps) {
  const L = plan.levers;
  const sheet = planMode(plan) === 'sheet';
  const fx: PlanFx = plan.fx ?? LEGACY_FX;
  const setFx = (fn: (f: PlanFx) => void) => update((p) => { fn(ensureFx(p)); });
  const months = monthsOf(result);
  const fy31 = result.years.find((y) => y.fy === 'FY31');

  return (
    <div className="space-y-6">
      {/* ---- 1. Growth & costs ---------------------------------------------------------------------------------- */}
      <div className="space-y-3">
        <SubHead>Growth &amp; costs</SubHead>
        <Note>Everything after the 18-month sheet (Apr-28 onwards) is driven by these; the sheet's months are untouched unless the plan is stretched below.</Note>
        <div className="grid gap-x-8 lg:grid-cols-2">
          <div className="divide-y divide-slate-100">
            {EXT_FYS.map((fy) => (
              <Lever key={fy} label={`${fy} unit growth (all channels)`} value={avgGrowth(plan, fy)} onChange={(v) => update((p) => setAllGrowth(p, fy, v))} min={-0.3} max={2} step={0.05}
                hint={fy === 'FY29' ? 'vs the same month in FY28 (the sheet’s last year). Per channel in the table below.' : undefined} />
            ))}
            <Lever label="Price change / year" value={L.aspGrowthPct} onChange={(v) => update((p) => { p.levers.aspGrowthPct = v; })} min={-0.1} max={0.15} step={0.01}
              hint="On every SKU's selling price, from FY29." />
          </div>
          <div className="divide-y divide-slate-100">
            <Lever label="Raw material % change / year" value={L.cogsDeltaPerYear} onChange={(v) => update((p) => { p.levers.cogsDeltaPerYear = v; })} min={-0.03} max={0.03} step={0.0025}
              hint="Points of revenue. −0.5% = materials get 0.5 pt cheaper each year (scale, sourcing)." />
            <Lever label="ROAS gain / year" value={L.roasGainPct} onChange={(v) => update((p) => { p.levers.roasGainPct = v; })} min={-0.3} max={0.5} step={0.05}
              hint="On the Amazon, D2C and Flipkart ROAS lines. Negative = ads get costlier." />
            <Lever label="Brand & creative as % of revenue" value={L.brandPctOfRevenue} onChange={(v) => update((p) => { p.levers.brandPctOfRevenue = v; })} min={0} max={0.15} step={0.005}
              hint="0 = keep the fixed brand lines (with inflation). Above 0 replaces them from FY29." />
            <Lever label="Team growth / year" value={L.teamGrowthPct} onChange={(v) => update((p) => { p.levers.teamGrowthPct = v; })} min={0} max={1} step={0.05}
              hint="Extra people cost on top of inflation: salaries, factory payroll, benefits." />
            <Lever label="Inflation on fixed costs / year" value={L.inflationPct} onChange={(v) => update((p) => { p.levers.inflationPct = v; })} min={0} max={0.15} step={0.01} />
          </div>
        </div>

        <div>
          <div className="text-[13px] font-semibold text-slate-700">Unit growth by channel</div>
          <Note>Year-on-year, vs the same month a year earlier. FY27–FY28 come from the 18-month sheet; these drive FY29 onwards.</Note>
          <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="mt-1.5 overflow-x-auto">
            <table className="text-[13px]">
              <thead>
                <tr>
                  <th className={th}>Channel</th>
                  {EXT_FYS.map((fy) => <th key={fy} className={thr}>{fy}</th>)}
                  <th className={`${thr} pl-4`}>FY31 revenue</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.map((ch: Channel) => (
                  <tr key={ch} className="border-t border-slate-100">
                    <td className={`${td} font-medium text-slate-700`}>{CHANNEL_NAMES[ch]}</td>
                    {EXT_FYS.map((fy) => (
                      <td key={fy} className={`${td} text-right`}>
                        <NumInput unit="pct" value={L.growth[fy]?.[ch] ?? 0} step={5} min={-1} max={10} width="w-16" title={`${CHANNEL_NAMES[ch]} ${fy} growth`}
                          onChange={(v) => update((p) => setChannelGrowth(p, fy, ch, v))} />
                      </td>
                    ))}
                    <td className={`${td} pl-4 text-right tabular-nums text-slate-500`}>₹{cr(fy31?.revenueByChannel[ch] ?? 0)} Cr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="text-[13px] font-semibold text-slate-700">Stretch the 18-month plan</div>
          <Note>Multiply the sheet's units by channel (1× = as planned). Flows into every later year.</Note>
          <div className="mt-1.5 grid max-w-xl grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {CHANNELS.map((ch: Channel) => (
              <Row key={ch} label={CHANNEL_NAMES[ch]}>
                <NumInput value={L.baseVolume[ch]} unit="x" step={0.05} min={0} max={5} width="w-14" title={`${CHANNEL_NAMES[ch]} volume multiplier`}
                  onChange={(v) => update((p) => { p.levers.baseVolume[ch] = v; })} />
              </Row>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <div className="text-[13px] font-semibold text-slate-700">Seasonality after the sheet</div>
            <Note>'Sheet's shape' repeats the sheet's last-year month pattern; 'learned curves' spreads each FY total by the curves in D2C customers &amp; seasonality.</Note>
          </div>
          <SegmentedControl size="sm" value={L.seasonShape ?? 'plan'} onChange={(v) => update((p) => { p.levers.seasonShape = v; })}
            options={[{ id: 'plan', label: "FY29+ follows the sheet's shape" }, { id: 'history', label: 'FY29+ follows the learned curves' }]} aria-label="Seasonality used after the base" />
        </div>
      </div>

      {/* ---- 2. Accounting & tax switches ----------------------------------------------------------------------- */}
      <div className="space-y-2.5">
        <SubHead>Accounting &amp; tax switches</SubHead>
        {sheet
          ? <Note tone="amber">Sheet parity is on: every switch here is ignored and the plan books exactly as the sheet, with tax every profitable month (Starting point → My plan).</Note>
          : <Note>Each switch is a founder decision (Nov 2026). Items tagged Placeholder are not confirmed numbers.</Note>}
        <fieldset disabled={sheet} className={`grid gap-x-8 gap-y-2.5 lg:grid-cols-2 ${sheet ? 'opacity-50' : ''}`}>
          <div className="space-y-2.5">
            <CheckRow on={fx.gstServicesAsCost} set={(x) => setFx((f) => { f.gstServicesAsCost = x; })} label="Unrecoverable services GST is a cost"
              hint="Input GST on services that can’t be set off or refunded is expensed in CM1 (a line of its own), not carried as an asset." />
            <CheckRow on={fx.revenueExGst} set={(x) => setFx((f) => { f.revenueExGst = x; })} label="P&L on ex-GST revenue"
              hint="The sheet counts GST-inclusive sales as revenue. On: net revenue and EBITDA are ex-GST (GMV is still shown). Lowers EBITDA and cash by the output GST." />
            <CheckRow on={fx.gtNetRealisation} set={(x) => setFx((f) => { f.gtNetRealisation = x; })} label="General Trade at net realisation"
              hint="Revenue = list price less the distributor margin; the margin leaves the commission line. EBITDA is unchanged; revenue, receivables and GST are lower." />
          </div>
          <div className="space-y-2.5">
            <CheckRow on={fx.depreciationOnce.on} set={(x) => setFx((f) => { f.depreciationOnce.on = x; })} label="Depreciation booked once"
              hint="New capex is capitalised once and depreciated straight-line from the month after it is spent; the sheet’s flat D&A lines stop inflating." />
            {fx.depreciationOnce.on && (
              <Row label={<>Useful life (years)<Flag>Placeholder</Flag></>}>
                <NumInput value={fx.depreciationOnce.lifeYears} min={1} max={20} width="w-14" title="Useful life" onChange={(x) => setFx((f) => { f.depreciationOnce.lifeYears = x; })} />
              </Row>
            )}
            <Row label="Tax method" hint="Sheet: tax every profitable month. FY: on the year's profit, losses carried forward.">
              <select aria-label="Tax method" value={L.taxMode} onChange={(e) => update((p) => { p.levers.taxMode = e.target.value as 'sheet' | 'fy'; })} className={txt}>
                <option value="sheet">As the sheet</option>
                <option value="fy">By FY, carry losses</option>
              </select>
            </Row>
          </div>
        </fieldset>
      </div>

      {/* ---- 3. Working capital, GST, tax & interest ------------------------------------------------------------ */}
      <div className="space-y-2.5">
        <SubHead>Working capital, GST, tax &amp; interest</SubHead>
        <Note>Same mechanics as the sheet's Cash Flow &amp; Fundraise tab. Opening cash, inventory and debt are under Starting point.</Note>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {CASH_FIELDS.map((x) => (
            <Row key={x.k} label={x.label} hint={x.hint}>
              <NumInput unit={x.unit} value={plan.cash[x.k]} min={0} width="w-20" title={x.label} onChange={(v) => update((p) => { p.cash[x.k] = v; })} />
            </Row>
          ))}
          <Row label="Contingency, 12-month ask" hint="Buffer on the 12-month peak deficit (the Business plan's first column)">
            <NumInput unit="pct" value={plan.business.contingency12} min={0} max={3} width="w-20" title="Contingency, 12-month ask" onChange={(v) => update((p) => { p.business.contingency12 = v; })} />
          </Row>
          <Row label="Exit ARR growth cap" hint="Caps last-3-month growth vs a year earlier in the Exit ARR">
            <NumInput unit="x" value={plan.business.exitGrowthCap} min={1} max={5} step={0.1} width="w-20" title="Exit growth cap" onChange={(v) => update((p) => { p.business.exitGrowthCap = v; })} />
          </Row>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-slate-600">
          <span className="font-semibold text-slate-700">Interest rate</span>
          <span>{(plan.cash.interestRate * 100).toFixed(2)}% from {months[0]?.label}</span>
          {(plan.cash.interestSteps ?? []).map((st, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1">
              then
              <NumInput unit="pct" value={st.rate} min={0} max={1} width="w-16" title={`Interest rate step ${i + 1}`} onChange={(v) => update((p) => { p.cash.interestSteps[i].rate = v; })} />
              from
              <MonthSelect title={`Interest rate step ${i + 1} from`} value={st.month} months={months} onChange={(m) => update((p) => { p.cash.interestSteps[i].month = m ?? 1; })} />
              <button type="button" onClick={() => update((p) => { p.cash.interestSteps.splice(i, 1); })} className="text-slate-400 hover:text-rose-600" aria-label={`Remove rate step ${i + 1}`}>✕</button>
            </span>
          ))}
          <button type="button" onClick={() => update((p) => addInterestStep(p))} className="text-[12px] font-semibold text-brand-700 hover:underline">+ rate change</button>
        </div>
      </div>
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'assumptions',
  title: 'Assumptions',
  blurb: 'The levers every product sits on, the accounting switches, and working capital, GST, tax and interest.',
  Section,
  summary,
};
