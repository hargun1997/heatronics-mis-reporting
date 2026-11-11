// Setup → 9 Targets (docs/planning/ONE-SETUP.md §2.9): where the plan should land (revenue by year, or an exit ARR) and the
// ONE action of the whole planning page — "Fit the plan to these targets" — which is also its only primary button.
import { useState } from 'react';
import type { Plan } from '../../../data/planning/engine';
import { runRateArr } from '../../../data/planning/growth';
import { fitToTargets, setTargetMode, summary, targetMode, type TargetMode } from '../../../data/planning/setup/targets';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { NumInput } from '../inputs';
import { money } from '../fmt';
import { CR, Note, Row, Tip, ensureGrowth, replacePlan, td, th, thr, useBusy } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

const MODES: { id: TargetMode; label: string }[] = [
  { id: 'path', label: 'Revenue by year' },
  { id: 'arr', label: 'Exit ARR' },
];

export function Section({ plan, update, result }: SetupSectionProps) {
  const [busy, run] = useBusy();
  const [notes, setNotes] = useState<string[]>([]);
  const mode = targetMode(plan);
  const sheet = !plan.fx || plan.fx.sheetParity;
  const G = plan.growth;
  const linesOn = plan.products.some((x) => x.growthLine && x.on);
  const blocked = sheet ? 'Select My plan in Starting point.' : plan.growth && !plan.growth.on ? 'The growth layer is off. Turn it on in Starting point.' : !linesOn ? 'Add a product in Products and categories.' : null;
  const set = (fn: (g: NonNullable<Plan['growth']>) => void) => update((p) => { fn(ensureGrowth(p)); });

  const arr = runRateArr(result);
  const target = G?.targetArr ?? 500 * CR;
  const lastM = result.months[result.months.length - 1];

  // Fit from the plan as rendered (not inside the state updater: React may run that lazily at render time, after
  // setNotes has already read an empty list), then replace the draft with the fitted plan.
  const fit = () => run('Fitting…', () => {
    const r = fitToTargets(plan);
    replacePlan(update, () => r.plan);
    setNotes(r.notes);
  });

  return (
    <div className="space-y-4">
      <Row label="Target type" hint="Revenue by year: increases the new buyers of the new lines in each FY. Exit ARR: changes their launch volumes.">
        <SegmentedControl<TargetMode> size="sm" aria-label="Target type" options={MODES} value={mode}
          onChange={(m) => { if (m !== mode) update((p) => setTargetMode(p, m, result)); }} />
      </Row>

      {mode === 'path' ? (
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px] tabular-nums">
            <thead>
              <tr className="bg-surface-tint">
                <th className={th}>FY</th>
                <th className={thr}>Target</th>
                <th className={thr}>Plan revenue</th>
                <th className={thr}>Gap</th>
                <th className={thr}>New-buyer push</th>
              </tr>
            </thead>
            <tbody>
              {result.years.map((y) => {
                const t = G?.path?.[y.fy];
                const gap = t != null ? y.revenue - t : null;
                const off = gap != null && Math.abs(gap) > Math.max(1e5, (t ?? 0) * 0.01);
                return (
                  <tr key={y.fy} className="border-t border-slate-100">
                    <td className={`${td} font-semibold text-slate-700`}>{y.fy}{y.months < 12 ? ` (${y.months} mo)` : ''}</td>
                    <td className={`${td} text-right`}>
                      <NumInput unit="cr" value={t ?? 0} min={0} width="w-20" title={`${y.fy} revenue target`}
                        onChange={(v) => set((g) => { g.path = { ...(g.path ?? {}) }; if (v > 0) g.path[y.fy] = v; else delete g.path[y.fy]; })} />
                    </td>
                    <td className={`${td} text-right text-slate-900`}>{money(y.revenue, 1)}</td>
                    <td className={`${td} text-right ${off ? 'text-rose-700' : 'text-slate-600'}`}>{gap == null ? '–' : money(gap, 1)}</td>
                    <td className={`${td} text-right text-slate-700`}>{G?.push?.[y.fy] != null ? `${G.push[y.fy].toFixed(2)}×` : '1×'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Note>A year with no target keeps its pace. With no targets, the type changes to Exit ARR.</Note>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Row label="Exit ARR target" hint="P&L revenue of the last 3 months × 4, at the end of the plan.">
            <NumInput unit="cr" value={target} min={0} width="w-24" title="Exit ARR target" onChange={(v) => set((g) => { g.targetArr = v; })} />
          </Row>
          <Note>
            Exit ARR now: {money(arr, 0)} ({lastM?.label ?? 'last month'}){arr >= target ? '. Target met.' : `. ${money(target - arr, 0)} below target.`}
          </Note>
        </div>
      )}

      <div className="space-y-2 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-1">
        <button type="button" className="inline-flex min-h-11 sm:min-h-9 items-center rounded-lg bg-cta px-3.5 text-sm font-semibold text-on-cta hover:bg-cta-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
          disabled={!!busy || !!blocked} title={blocked ?? undefined} onClick={fit}>
          {busy ?? 'Fit the plan to these targets'}
        </button>
        <Tip label="What Fit does"><p>Fit increases the new buyers of the new lines, 1 year at a time, until each year meets its target. For Exit ARR, it changes their launch volumes.</p><p>Then it changes the size of the rounds that are not confirmed, so cash stays above the buffer.</p></Tip>
        </div>
        {blocked && <span className="text-[12px] text-amber-800">{blocked}</span>}
        {notes.map((n, i) => <Note key={i} tone="amber">{n}</Note>)}
        {G?.note && <Note>{G.note}</Note>}
      </div>
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'targets',
  title: 'Targets',
  blurb: 'Where the plan must land. Fit sets volumes and rounds to it.',
  Section,
  summary,
};
