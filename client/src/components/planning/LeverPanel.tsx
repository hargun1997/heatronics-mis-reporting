// Headline levers — the ones that move the 5-year picture most. Everything after the
// 18-month sheet (Apr-28 onwards) is driven by these; the sheet's months are untouched
// unless "Stretch the 18-month plan" is moved.

import { CHANNELS, CHANNEL_NAMES, type Channel, type Plan } from '../../data/planning/engine';
import { Lever, NumInput } from './inputs';

export type Update = (fn: (p: Plan) => void) => void;

const EXT_FYS = ['FY29', 'FY30', 'FY31'];

export function LeverPanel({ plan, update }: { plan: Plan; update: Update }) {
  const L = plan.levers;
  const avgGrowth = (fy: string) => CHANNELS.reduce((a, c) => a + (L.growth[fy]?.[c] ?? 0), 0) / CHANNELS.length;
  const setAll = (fy: string, v: number) => update((p) => { for (const c of CHANNELS) p.levers.growth[fy][c] = v; });
  return (
    <div className="divide-y divide-slate-100">
      <div className="pb-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Growth (all channels)</h4>
        {EXT_FYS.map((fy) => (
          <Lever key={fy} label={`${fy} unit growth`} value={avgGrowth(fy)} onChange={(v) => setAll(fy, v)} min={-0.3} max={2} step={0.05}
            hint={fy === 'FY29' ? 'vs the same month in FY28 (the sheet’s last year). Set per channel on the Revenue tab.' : undefined} />
        ))}
        <Lever label="Price change / year" value={L.aspGrowthPct} onChange={(v) => update((p) => { p.levers.aspGrowthPct = v; })} min={-0.1} max={0.15} step={0.01}
          hint="On every SKU's selling price, from FY29." />
      </div>
      <div className="py-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Margins & spend (from FY29)</h4>
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
      <div className="pt-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Stretch the 18-month plan</h4>
        <p className="text-[11px] text-slate-500 mb-1.5">Multiply the sheet's units by channel (1× = as planned). Flows into every later year.</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {CHANNELS.map((ch: Channel) => (
            <label key={ch} className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
              {CHANNEL_NAMES[ch]}
              <NumInput value={L.baseVolume[ch]} unit="x" step={0.05} min={0} max={5} width="w-14"
                onChange={(v) => update((p) => { p.levers.baseVolume[ch] = v; })} title={`${CHANNEL_NAMES[ch]} volume multiplier`} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
