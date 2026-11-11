// The one Setup panel of the 5-year plan (docs/planning/ONE-SETUP.md §0): a collapsible card holding every input, as numbered
// collapsible sections, each with a one-line summary when closed. Everything below the panel on the page is read-only.
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Plan, PlanResult } from '../../../data/planning/engine';
import { cx } from '../../shell/cx';
import type { SetupSectionDef, SetupSectionId, Update } from './types';
import { SECTION as START } from './StartingPoint';
import { SECTION as ASSUMPTIONS } from './Assumptions';
import { SECTION as PRODUCTS } from './Products';
import { SECTION as CUSTOMERS } from './Customers';
import { SECTION as RETAIL } from './OfflineRetail';
import { SECTION as TEAM } from './TeamHiring';
import { SECTION as CAPACITY } from './CapacityCapex';
import { SECTION as FUNDING } from './Funding';
import { SECTION as TARGETS } from './Targets';
import { SECTION as NARRATIVE } from './Narrative';
import { SECTION as SHEET } from './SheetLines';

export const SECTIONS: SetupSectionDef[] = [START, ASSUMPTIONS, PRODUCTS, CUSTOMERS, RETAIL, TEAM, CAPACITY, FUNDING, TARGETS, NARRATIVE, SHEET];

const KEY = 'planning-setup-v1';
interface OpenState { open: boolean; sections: Partial<Record<SetupSectionId, boolean>> }
const DEFAULT: OpenState = { open: true, sections: { start: true } };

function load(): OpenState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const j = JSON.parse(raw) as Partial<OpenState>;
    return { open: j.open ?? true, sections: j.sections ?? {} };
  } catch { return DEFAULT; }
}

export function panelSummary(plan: Plan): string {
  const products = plan.products.filter((p) => p.on).length;
  const hires = plan.growth?.hires.filter((h) => h.on !== false).length ?? 0;
  const rounds = plan.growth?.rounds.filter((r) => r.on).length ?? 0;
  const parity = !plan.fx || plan.fx.sheetParity;
  return `${products} products · ${hires} hires · ${rounds} rounds · sheet parity ${parity ? 'on' : 'off'}`;
}

export function SetupPanel({ plan, update, result, embedded }: { plan: Plan; update: Update; result: PlanResult; /** Inside the Setup drawer: no outer fold, always open. */ embedded?: boolean }) {
  const [st, setSt] = useState<OpenState>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* per-viewer convenience only */ } }, [st]);
  const parity = !plan.fx || plan.fx.sheetParity;
  const summaries = useMemo(() => SECTIONS.map((s) => { try { return s.summary(plan); } catch { return ''; } }), [plan]);

  return (
    <section aria-label="Plan setup" className={embedded ? '' : 'overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-card'}>
      {/* disclosure pattern: heading wraps the toggle button (a heading inside a button is invalid HTML) */}
      {!embedded && <h2 className="m-0">
        <button type="button" aria-expanded={st.open} aria-controls="setup-body" onClick={() => setSt((s) => ({ ...s, open: !s.open }))}
          className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
          {st.open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
          <span id="setup-h" className="text-[15px] font-semibold text-slate-900">Setup</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-500">{panelSummary(plan)}</span>
          {parity && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs sm:text-[11px] font-semibold text-amber-800">Sheet parity</span>}
          <span className="text-[12px] font-medium text-accent-700">{st.open ? 'Collapse' : 'Expand'}</span>
        </button>
      </h2>}
      {(st.open || embedded) && (
        <div id="setup-body" className="divide-y divide-slate-100 border-t border-slate-100">
          {SECTIONS.map((s, i) => {
            const open = !!st.sections[s.id];
            const bodyId = `setup-${s.id}`;
            return (
              <div key={s.id}>
                <h3 className="m-0">
                  <button type="button" aria-expanded={open} aria-controls={bodyId}
                    onClick={() => setSt((cur) => ({ ...cur, sections: { ...cur.sections, [s.id]: !open } }))}
                    className={cx('flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500', open ? 'bg-surface-tint/60' : 'hover:bg-slate-50')}>
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold tabular-nums text-white">{i + 1}</span>
                    <span className="text-[13.5px] font-semibold text-slate-900">{s.title}</span>
                    <span className="min-w-0 flex-1 basis-full truncate pl-[3.25rem] text-[12px] text-slate-600 sm:basis-0 sm:pl-0">{open ? s.blurb : summaries[i]}</span>
                  </button>
                </h3>
                {open && (
                  <div id={bodyId} className="space-y-4 px-4 pb-5 pt-3">
                    <s.Section plan={plan} update={update} result={result} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
