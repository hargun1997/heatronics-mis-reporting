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
import { CheckRow, Flag, MonthSelect, Note, Parts, Row, SubHead, ensureFx, monthsOf, td, th, thr, txt, useParts } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

export function Section({ plan, update, result }: SetupSectionProps) {
  const L = plan.levers;
  const sheet = planMode(plan) === 'sheet';
  const fx: PlanFx = plan.fx ?? LEGACY_FX;
  const setFx = (fn: (f: PlanFx) => void) => update((p) => { fn(ensureFx(p)); });
  const months = monthsOf(result);
  const fy31 = result.years.find((y) => y.fy === 'FY31');
  const [part, setPart] = useParts<'growth' | 'channels' | 'switches' | 'cash'>('growth');

  return (
    <div className="space-y-4">
      <Parts value={part} onChange={setPart} label="Assumptions part" options={[
        { id: 'growth', label: 'Growth and costs' }, { id: 'channels', label: 'Channels' }, { id: 'switches', label: 'Accounting' }, { id: 'cash', label: 'Cash and tax' },
      ]} />
      {/* ---- 1. Growth & costs ---------------------------------------------------------------------------------- */}
      {part === 'growth' && <div className="space-y-3">
        <SubHead info={<><p>These levers drive the plan from Apr-28, after the 18-month sheet.</p><p>The sheet&apos;s months do not change. To change them, use &quot;Stretch the 18-month plan&quot; in Channels.</p></>}>Growth and costs, from FY29</SubHead>
        <div className="grid gap-x-8 lg:grid-cols-2">
          <div className="divide-y divide-slate-100">
            {EXT_FYS.map((fy) => (
              <Lever key={fy} label={`${fy} unit growth (all channels)`} value={avgGrowth(plan, fy)} onChange={(v) => update((p) => setAllGrowth(p, fy, v))} min={-0.3} max={2} step={0.05}
                hint={fy === 'FY29' ? 'Against the same month in FY28, the last year of the sheet. Set each channel in Channels.' : undefined} />
            ))}
            <Lever label="Price change a year" value={L.aspGrowthPct} onChange={(v) => update((p) => { p.levers.aspGrowthPct = v; })} min={-0.1} max={0.15} step={0.01}
              hint="Applies to the selling price of each SKU from FY29." />
          </div>
          <div className="divide-y divide-slate-100">
            <Lever label="Material cost change a year" value={L.cogsDeltaPerYear} onChange={(v) => update((p) => { p.levers.cogsDeltaPerYear = v; })} min={-0.03} max={0.03} step={0.0025}
              hint="In points of revenue. −0.5% = materials cost 0.5 points less each year." />
            <Lever label="ROAS gain a year" value={L.roasGainPct} onChange={(v) => update((p) => { p.levers.roasGainPct = v; })} min={-0.3} max={0.5} step={0.05}
              hint="Applies to the Amazon, D2C and Flipkart ROAS lines. Negative = ads cost more." />
            <Lever label="Brand and creative, % of revenue" value={L.brandPctOfRevenue} onChange={(v) => update((p) => { p.levers.brandPctOfRevenue = v; })} min={0} max={0.15} step={0.005}
              hint="0 = keep the fixed brand lines, with inflation. More than 0 replaces them from FY29." />
            <Lever label="Team growth a year" value={L.teamGrowthPct} onChange={(v) => update((p) => { p.levers.teamGrowthPct = v; })} min={0} max={1} step={0.05}
              hint="People cost added to inflation: salaries, factory payroll and benefits." />
            <Lever label="Inflation on fixed costs a year" value={L.inflationPct} onChange={(v) => update((p) => { p.levers.inflationPct = v; })} min={0} max={0.15} step={0.01} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SubHead info={<><p>Sheet&apos;s shape: FY29 and later repeat the month pattern of the sheet&apos;s last year.</p><p>Learned curves: each FY total is spread by the curves in D2C customers and seasonality.</p></>}>Seasons from FY29</SubHead>
          <SegmentedControl size="sm" value={L.seasonShape ?? 'plan'} onChange={(v) => update((p) => { p.levers.seasonShape = v; })}
            options={[{ id: 'plan', label: "Sheet's shape" }, { id: 'history', label: 'Learned curves' }]} aria-label="Seasons from FY29" />
        </div>
      </div>}

      {part === 'channels' && <div className="space-y-4">
        <div>
          <SubHead info="Growth against the same month 1 year before. FY27 and FY28 come from the 18-month sheet.">Unit growth by channel</SubHead>
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
                    <td className={`${td} pl-4 text-right tabular-nums text-slate-600`}>₹{cr(fy31?.revenueByChannel[ch] ?? 0)} Cr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SubHead info="Multiplies the sheet's units for each channel. 1× = as in the sheet. All later years change too.">Stretch the 18-month plan</SubHead>
          <div className="mt-1.5 grid max-w-xl grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {CHANNELS.map((ch: Channel) => (
              <Row key={ch} label={CHANNEL_NAMES[ch]}>
                <NumInput value={L.baseVolume[ch]} unit="x" step={0.05} min={0} max={5} width="w-14" title={`${CHANNEL_NAMES[ch]} volume multiplier`}
                  onChange={(v) => update((p) => { p.levers.baseVolume[ch] = v; })} />
              </Row>
            ))}
          </div>
        </div>

      </div>}

      {/* ---- 2. Accounting & tax switches ----------------------------------------------------------------------- */}
      {part === 'switches' && <div className="space-y-2.5">
        <SubHead info="Each switch is a founder decision (Nov 2026). Placeholder = the number is not confirmed.">Accounting and tax switches</SubHead>
        {sheet && <Note tone="amber">Sheet parity is on. The plan ignores these switches. Select My plan in Starting point.</Note>}
        <fieldset disabled={sheet} className={`grid gap-x-8 gap-y-2.5 lg:grid-cols-2 ${sheet ? 'opacity-50' : ''}`}>
          <div className="space-y-2.5">
            <CheckRow on={fx.gstServicesAsCost} set={(x) => setFx((f) => { f.gstServicesAsCost = x; })} label="Services GST we cannot recover is a cost"
              hint="Input GST on services that we cannot set off or refund is a cost in CM1, on its own line. It is not carried as an asset." />
            <CheckRow on={fx.revenueExGst} set={(x) => setFx((f) => { f.revenueExGst = x; })} label="P&L on ex-GST revenue"
              hint="The sheet counts sales with GST as revenue. On: net revenue and EBITDA have no GST. GMV still shows. EBITDA and cash go down by the output GST." />
            <CheckRow on={fx.gtNetRealisation} set={(x) => setFx((f) => { f.gtNetRealisation = x; })} label="General Trade at net realisation"
              hint="Revenue = list price less the distributor margin. The margin leaves the commission line. EBITDA does not change. Revenue, receivables and GST go down." />
          </div>
          <div className="space-y-2.5">
            <CheckRow on={fx.depreciationOnce.on} set={(x) => setFx((f) => { f.depreciationOnce.on = x; })} label="Depreciation booked once"
              hint="New capex is depreciated straight-line from the month after the spend. The flat D&A lines of the sheet stop inflating." />
            {fx.depreciationOnce.on && (
              <Row label={<>Useful life (years)<Flag>Placeholder</Flag></>}>
                <NumInput value={fx.depreciationOnce.lifeYears} min={1} max={20} width="w-14" title="Useful life" onChange={(x) => setFx((f) => { f.depreciationOnce.lifeYears = x; })} />
              </Row>
            )}
            <Row label="Tax method" hint="As the sheet: tax in each month with a profit. By FY: tax on the profit of the year, losses carried forward.">
              <select aria-label="Tax method" value={L.taxMode} onChange={(e) => update((p) => { p.levers.taxMode = e.target.value as 'sheet' | 'fy'; })} className={txt}>
                <option value="sheet">As the sheet</option>
                <option value="fy">By FY, carry losses</option>
              </select>
            </Row>
          </div>
        </fieldset>
      </div>}

      {/* ---- 3. Working capital, GST, tax & interest ------------------------------------------------------------ */}
      {part === 'cash' && <div className="space-y-2.5">
        <SubHead info="These work as in the sheet's Cash Flow and Fundraise tab. Set opening cash, stock and debt in Starting point.">Working capital, GST, tax and interest</SubHead>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {CASH_FIELDS.map((x) => (
            <Row key={x.k} label={x.label} hint={x.hint}>
              <NumInput unit={x.unit} value={plan.cash[x.k]} min={0} width="w-20" title={x.label} onChange={(v) => update((p) => { p.cash[x.k] = v; })} />
            </Row>
          ))}
          <Row label="Buffer, 12-month ask" hint="Buffer on the largest deficit of the first 12 months (first column of the Business plan).">
            <NumInput unit="pct" value={plan.business.contingency12} min={0} max={3} width="w-20" title="Contingency, 12-month ask" onChange={(v) => update((p) => { p.business.contingency12 = v; })} />
          </Row>
          <Row label="Exit ARR growth cap" hint="The highest growth of the last 3 months, against 1 year before, that Exit ARR uses.">
            <NumInput unit="x" value={plan.business.exitGrowthCap} min={1} max={5} step={0.1} width="w-20" title="Exit growth cap" onChange={(v) => update((p) => { p.business.exitGrowthCap = v; })} />
          </Row>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-slate-600">
          <span className="font-semibold text-slate-700">Interest rate</span>
          <span>{(plan.cash.interestRate * 100).toFixed(2)}% from {months[0]?.label}</span>
          {(plan.cash.interestSteps ?? []).map((st, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1">
              Then
              <NumInput unit="pct" value={st.rate} min={0} max={1} width="w-16" title={`Interest rate step ${i + 1}`} onChange={(v) => update((p) => { p.cash.interestSteps[i].rate = v; })} />
              from
              <MonthSelect title={`Interest rate step ${i + 1} from`} value={st.month} months={months} onChange={(m) => update((p) => { p.cash.interestSteps[i].month = m ?? 1; })} />
              <button type="button" onClick={() => update((p) => { p.cash.interestSteps.splice(i, 1); })} className="text-slate-400 hover:text-rose-600" aria-label={`Remove rate step ${i + 1}`}>✕</button>
            </span>
          ))}
          <button type="button" onClick={() => update((p) => addInterestStep(p))} className="min-h-11 sm:min-h-8 text-[12px] font-semibold text-accent-700 hover:underline">+ Add rate change</button>
        </div>
      </div>}
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'assumptions',
  title: 'Assumptions',
  blurb: 'Growth levers, accounting switches, working capital, GST, tax and interest.',
  Section,
  summary,
};
