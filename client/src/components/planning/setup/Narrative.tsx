// Setup → Business plan text (docs/planning/ONE-SETUP.md §2.10): the words next to the numbers — key assumptions,
// risks & mitigation, themes & milestones (renaming / re-theming keeps the tagged cost lines attached), team structure.
// The read-only "From the numbers" checks live on the Business plan output view, not here.
import type { BusinessPlan } from '../../../data/planning/engine';
import { addAssumption, addMilestone, addRisk, renameMilestone, rethemeMilestone, summary, taggedLines, themesOf } from '../../../data/planning/setup/narrative';
import { btn, MonthSelect, monthsOf, Note, SubHead, th, thr } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

export function Section({ plan, update, result }: SetupSectionProps) {
  const setB = (fn: (b: BusinessPlan) => void) => update((p) => fn(p.business));
  const themes = themesOf(plan);
  const months = monthsOf(result);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <SubHead>Key assumptions</SubHead>
            <AddBtn label="Add an assumption" onClick={() => update(addAssumption)} />
          </div>
          <Note>What the plan rests on: kept with the numbers so the deck and the model never drift.</Note>
          {plan.business.assumptions.length === 0 && <Note>No assumptions yet.</Note>}
          <div className="space-y-1.5">
            {plan.business.assumptions.map((a, i) => (
              <div key={a.id} className="grid grid-cols-[1.3fr_1fr_1.3fr_auto] gap-1.5">
                <Txt value={a.assumption} placeholder="Assumption" onChange={(v) => setB((b) => { b.assumptions[i].assumption = v; })} bold />
                <Txt value={a.value} placeholder="Value" onChange={(v) => setB((b) => { b.assumptions[i].value = v; })} />
                <Txt value={a.basis} placeholder="Basis" onChange={(v) => setB((b) => { b.assumptions[i].basis = v; })} muted />
                <Del onClick={() => setB((b) => { b.assumptions.splice(i, 1); })} />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <SubHead>Key risks &amp; mitigation</SubHead>
            <AddBtn label="Add a risk" onClick={() => update(addRisk)} />
          </div>
          <Note>One line per risk, and what the plan does about it.</Note>
          {plan.business.risks.length === 0 && <Note>No risks yet.</Note>}
          <div className="space-y-1.5">
            {plan.business.risks.map((x, i) => (
              <div key={x.id} className="grid grid-cols-[1fr_1.4fr_auto] gap-1.5">
                <Txt value={x.risk} placeholder="Risk" onChange={(v) => setB((b) => { b.risks[i].risk = v; })} bold area />
                <Txt value={x.mitigation} placeholder="Mitigation" onChange={(v) => setB((b) => { b.risks[i].mitigation = v; })} area />
                <Del onClick={() => setB((b) => { b.risks.splice(i, 1); })} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <SubHead>Themes &amp; milestones</SubHead>
            <AddBtn label="Add a milestone" onClick={() => update(addMilestone)} />
          </div>
          <Note>
            Overview rows 10–36. Renaming a milestone or moving it to another theme updates every cost line tagged with it
            (tag lines in Sheet lines; the spend shows on the Business plan view as capital deployment).
          </Note>
          <datalist id="plan-themes">{themes.map((t) => <option key={t} value={t} />)}</datalist>
          <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={th}>Theme</th>
                  <th className={th}>Milestone</th>
                  <th className={th}>Month</th>
                  <th className={thr}>Cost lines</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plan.business.themes.length === 0 && (
                  <tr><td colSpan={5} className="px-2 py-2 text-[12px] text-slate-500">No milestones yet.</td></tr>
                )}
                {plan.business.themes.map((t, i) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="py-1 pr-2">
                      <input list="plan-themes" value={t.theme} onChange={(e) => update((p) => rethemeMilestone(p, i, e.target.value))}
                        className="w-56 rounded border border-slate-200 bg-white px-2 py-1" aria-label="Theme" />
                    </td>
                    <td className="pr-2">
                      <input value={t.milestone} onChange={(e) => update((p) => renameMilestone(p, i, e.target.value))}
                        className="w-52 rounded border border-slate-200 bg-white px-2 py-1 font-semibold" aria-label="Milestone" />
                    </td>
                    <td className="pr-2">
                      <MonthSelect title="Milestone month" value={t.month} months={months}
                        onChange={(m) => { if (m !== null) setB((b) => { b.themes[i].month = m; }); }} />
                    </td>
                    <td className="px-2 text-right tabular-nums text-slate-500">{taggedLines(plan, t.milestone)}</td>
                    <td className="pl-2 text-right"><Del onClick={() => setB((b) => { b.themes.splice(i, 1); })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <SubHead>Team structure</SubHead>
          <Note>From the sheet’s Overview tab. One line per role; → for who reports into whom.</Note>
          <textarea value={plan.business.team} onChange={(e) => setB((b) => { b.team = e.target.value; })} rows={10}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed" aria-label="Team structure" />
        </div>
      </div>
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'narrative',
  title: 'Business plan text',
  blurb: 'The words next to the numbers: assumptions, risks, themes & milestones, team structure.',
  Section,
  summary,
};

// ---- local helpers -------------------------------------------------------------------------------------------------

function Txt({ value, onChange, placeholder, bold, muted, area }: {
  value: string; onChange: (v: string) => void; placeholder: string; bold?: boolean; muted?: boolean; area?: boolean;
}) {
  const cls = `w-full rounded border border-slate-200 bg-white px-2 py-1 text-[12.5px] ${bold ? 'font-semibold text-slate-800' : muted ? 'text-slate-500' : 'text-slate-700'}`;
  return area
    ? <textarea value={value} placeholder={placeholder} rows={2} onChange={(e) => onChange(e.target.value)} className={cls} aria-label={placeholder} />
    : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} aria-label={placeholder} />;
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className={btn} aria-label={label} title={label}>+ Add</button>;
}

function Del({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="px-1 text-[12px] text-slate-400 hover:text-rose-600" aria-label="Remove" title="Remove">✕</button>;
}
