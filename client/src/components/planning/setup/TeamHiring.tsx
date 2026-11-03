// Setup → 6 Team & hiring (docs/planning/ONE-SETUP.md §2.6): GrowthTab's "Hiring plan" card as a Setup section — benefits /
// hiring / increment %, "Add a role", the hires table, and "People added" per FY as feedback. Writes go through `ensureGrowth`
// so the section works even when the plan has no growth layer yet; the maths lives in data/planning/setup/team.ts.
import { DEPT_NAMES, type Dept, type GrowthPlan } from '../../../data/planning/engine';
import { applyScaleKey, newHire, peopleAddedByFy, scaleKey, summary, teamOf } from '../../../data/planning/setup/team';
import { NumInput } from '../inputs';
import { int, pct } from '../fmt';
import { Check, MonthSelect, Note, btn, ensureGrowth, monthsOf, newId, rm, td, th, thr, txt } from './shared';
import type { SetupSectionDef, SetupSectionProps } from './types';

export { summary };

const txtWide = `w-full min-w-[140px] ${txt}`;

export function Section({ plan, update, result }: SetupSectionProps) {
  const G = teamOf(plan);
  const months = monthsOf(result);
  const retail = plan.growth?.retail ?? [];
  const set = (fn: (g: GrowthPlan) => void) => update((p) => { fn(ensureGrowth(p)); });
  const added = peopleAddedByFy(result);

  return (
    <div className="space-y-3">
      <Note>
        Fixed roles hire their people in the From month; roles that grow with the business add one person per revenue / units /
        outlets step (never fewer than People). Monthly CTC per person; {pct(G.benefitsPct, 0)} benefits on top, a one-off hiring
        cost of {pct(G.recruitPct, 0)} of a year's CTC, {pct(G.incrementPct, 0)} increment a year. Factory roles sit in COGS.
      </Note>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-500">
        <label className="flex items-center gap-1.5">Benefits <NumInput unit="pct" value={G.benefitsPct} min={0} width="w-12" title="Benefits %" onChange={(v) => set((g) => { g.benefitsPct = v; })} /></label>
        <label className="flex items-center gap-1.5">Hiring cost <NumInput unit="pct" value={G.recruitPct} min={0} width="w-12" title="Hiring cost %" onChange={(v) => set((g) => { g.recruitPct = v; })} /></label>
        <label className="flex items-center gap-1.5">Increment <NumInput unit="pct" value={G.incrementPct} min={0} width="w-12" title="Increment %" onChange={(v) => set((g) => { g.incrementPct = v; })} /></label>
        <button type="button" className={btn} onClick={() => set((g) => { g.hires.push(newHire(newId('h'))); })}>Add a role</button>
      </div>

      {G.hires.length === 0 ? (
        <Note>No roles yet — the plan's people costs are the sheet's lines only. Add a role to layer hires on top.</Note>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12.5px] tabular-nums">
            <thead>
              <tr className="bg-surface-tint">
                <th className={th}>On</th><th className={th}>Role</th><th className={th}>Team</th><th className={thr}>People</th>
                <th className={th}>From</th><th className={th}>To</th><th className={th}>Grows with</th><th className={thr}>1 per</th>
                <th className={thr}>CTC / month</th><th className={thr}>People at end</th><th className={th} />
              </tr>
            </thead>
            <tbody>
              {G.hires.map((h, i) => (
                <tr key={h.id} className={`border-t border-slate-100 ${h.on === false ? 'opacity-50' : ''}`}>
                  <td className={td}><Check checked={h.on !== false} onChange={(v) => set((g) => { g.hires[i].on = v; })} label={`${h.role} on`} /></td>
                  <td className={td}><input className={txtWide} value={h.role} aria-label="Role" onChange={(e) => set((g) => { g.hires[i].role = e.target.value; })} /></td>
                  <td className={td}>
                    <select aria-label="Team" value={h.dept} className={txt} onChange={(e) => set((g) => { g.hires[i].dept = e.target.value as Dept; })}>
                      {(Object.keys(DEPT_NAMES) as Dept[]).map((k) => <option key={k} value={k}>{DEPT_NAMES[k]}</option>)}
                    </select>
                  </td>
                  <td className={`${td} text-right`}><NumInput value={h.count} min={0} width="w-14" title="People" onChange={(v) => set((g) => { g.hires[i].count = Math.round(v); })} /></td>
                  <td className={td}><MonthSelect title="From" value={h.month} months={months} onChange={(m) => set((g) => { g.hires[i].month = m ?? 1; })} /></td>
                  <td className={td}><MonthSelect title="To" value={h.end} months={months} allowNone onChange={(m) => set((g) => { g.hires[i].end = m; })} /></td>
                  <td className={td}>
                    <select aria-label="Grows with" value={scaleKey(h)} className={txt} onChange={(e) => { const key = e.target.value; set((g) => { applyScaleKey(g.hires[i], key); }); }}>
                      <option value="fixed">Fixed</option>
                      <option value="revenue">Revenue (₹ Cr ARR)</option>
                      <option value="units">Units / month</option>
                      <option value="outlets:">All outlets</option>
                      {retail.map((t) => <option key={t.id} value={`outlets:${t.id}`}>{t.name.split(' (')[0]} outlets</option>)}
                    </select>
                  </td>
                  <td className={`${td} text-right`}>
                    {h.scale
                      ? <NumInput value={h.scale.every} min={0} width="w-16" title="One person per" onChange={(v) => set((g) => { const s = g.hires[i].scale; if (s) s.every = v; })} />
                      : <span className="text-slate-400">–</span>}
                  </td>
                  <td className={`${td} text-right`}><NumInput unit="lakh" value={h.monthlyCtc} min={0} width="w-16" title="CTC a month" onChange={(v) => set((g) => { g.hires[i].monthlyCtc = v; })} /></td>
                  <td className={`${td} text-right text-slate-700`}>{h.scale ? 'scaled' : int(h.count)}</td>
                  <td className={td}><button type="button" className={rm} aria-label={`Remove ${h.role}`} onClick={() => set((g) => { g.hires.splice(i, 1); })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 text-[12px] text-slate-600">
        {added.map((y) => <span key={y.fy}>{y.fy}: <b>{int(y.people)}</b> people added</span>)}
      </div>
    </div>
  );
}

export const SECTION: SetupSectionDef = {
  id: 'team',
  title: 'Team & hiring',
  blurb: 'Roles, when they join, CTC, and which roles grow with revenue, units or outlets.',
  Section,
  summary,
};
