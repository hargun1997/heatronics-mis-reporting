// 5-year plan — the Projection & Deployment Plan sheet, run live in the MIS and extended
// to FY31, with levers and saved scenarios. Engine: data/planning/engine.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Drawer, Popover } from '../../components/ui/overlays';
import { BTN } from '../../components/ui/states';
import { runPlan, type Plan, type PlanResult } from '../../data/planning/engine';
import { basePlan, upgradePlan, BASE_SOURCE_URL } from '../../data/planning/basePlan';
import { SetupPanel, panelSummary } from '../../components/planning/setup/SetupPanel';
import { OverviewView } from '../../components/planning/outputs/Overview';
import { BusinessPlanView } from '../../components/planning/outputs/BusinessPlan';
import { RevenueView } from '../../components/planning/outputs/Revenue';
import { CostsView } from '../../components/planning/outputs/Costs';
import { CashFundingView } from '../../components/planning/outputs/CashFunding';
import { ProductsCustomersView } from '../../components/planning/outputs/ProductsCustomers';
import { PlanVsActualView } from '../../components/planning/outputs/PlanVsActual';
import { planMonthsOf } from '../../data/planning/planVsActual';
import { runRateArr } from '../../data/planning/growth';
import { PnlGrid } from '../../components/planning/PnlGrid';
import { monthBefore, openingFromTally } from '../../data/planning/opening';

interface Saved { id: string; name: string; note: string; updatedAt: string; updatedBy: string | null }
type View = 'overview' | 'business' | 'revenue' | 'costs' | 'monthly' | 'cash' | 'products' | 'actual';

const DRAFT_KEY = 'planning-draft-v1';
const VIEW_TABS = [{ id: 'overview', label: 'Overview' }, { id: 'business', label: 'Business plan' }, { id: 'revenue', label: 'Revenue' }, { id: 'costs', label: 'Costs' }, { id: 'monthly', label: 'Monthly P&L' }, { id: 'cash', label: 'Cash and funding' }, { id: 'products', label: 'Products and customers' }, { id: 'actual', label: 'Plan vs actual' }];
const MENU = 'flex min-h-11 sm:min-h-9 w-full items-center rounded-lg px-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40';


async function api<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(url, {
    method: method || (body === undefined ? 'GET' : 'PUT'),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || `Request failed (${res.status})`);
  return j as T;
}

interface Draft { plan: Plan; selected: string; clean: string }
function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d?.plan?.version === 1 && typeof d.clean === 'string' ? { ...d, plan: upgradePlan(d.plan), clean: JSON.stringify(upgradePlan(JSON.parse(d.clean) as Plan)) } : null;
  } catch { return null; }
}
function saveDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage unavailable: the draft just isn't kept */ }
}

export function PlanningPage() {
  const [draft] = useState(loadDraft);
  const [plan, setPlan] = useState<Plan>(() => draft?.plan ?? basePlan());
  const [selected, setSelected] = useState<string>(draft?.selected ?? 'base');
  const [cleanJson, setCleanJson] = useState<string>(() => draft?.clean ?? JSON.stringify(basePlan()));
  const [saved, setSaved] = useState<Saved[]>([]);
  const [view, setView] = useState<View>('overview');
  const [setupOpen, setSetupOpen] = useState(false);
  const [compareId, setCompareId] = useState<string>('base');
  const [comparePlan, setComparePlan] = useState<Plan | null>(() => basePlan());
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = cleanJson !== JSON.stringify(plan);
  useEffect(() => { saveDraft({ plan, selected, clean: cleanJson }); }, [plan, selected, cleanJson]);

  const refreshList = useCallback(() => api<{ scenarios: Saved[] }>('/api/planning/scenarios').then((r) => setSaved(r.scenarios)).catch(() => {}), []);
  useEffect(() => { refreshList(); }, [refreshList]);

  // A fresh Base opens on the real Sep-26 balance sheet when Tally has it (a saved scenario keeps its own numbers)
  useEffect(() => {
    if (selected !== 'base' || draft) return;
    fetch('/api/tally/statements').then((r) => r.json()).then((j: { months?: Parameters<typeof openingFromTally>[0][] }) => {
      const b = basePlan();
      const m = j.months?.find((x) => x.period === monthBefore(b.startMonth));
      const o = m && b.fx ? openingFromTally(m, b.fx.opening) : null;
      if (!o || !b.fx) return;
      b.fx.opening = o.opening;
      setPlan((cur) => (cur.fx && cur.fx.opening.source === 'sheet' ? { ...cur, fx: { ...cur.fx, opening: o.opening } } : cur));
      setCleanJson((c) => { const q = JSON.parse(c) as Plan; if (q.fx && q.fx.opening.source === 'sheet') q.fx.opening = o.opening; return JSON.stringify(q); });
    }).catch(() => { /* Tally not reachable: the sheet's opening values stay */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((fn: (p: Plan) => void) => {
    setPlan((prev) => { const next = structuredClone(prev); fn(next); return next; });
  }, []);

  const result: PlanResult = useMemo(() => runPlan(plan), [plan]);
  const compareResult = useMemo(() => (comparePlan ? runPlan(comparePlan) : null), [comparePlan]);
  const compareName = compareId === 'base' ? 'Base' : saved.find((s) => s.id === compareId)?.name ?? '';

  const flash = (text: string, bad = false) => { setMsg({ text, bad }); window.setTimeout(() => setMsg(null), 4000); };

  const open = async (id: string) => {
    if (dirty && !window.confirm('Changes are not saved. Open the other scenario and lose the changes?')) return;
    if (id === 'base') {
      const b = basePlan(); setPlan(b); setSelected('base'); setCleanJson(JSON.stringify(b)); return;
    }
    try {
      const s = await api<{ plan: Plan }>(`/api/planning/scenarios/${id}`);
      const pl = upgradePlan(s.plan);
      setPlan(pl); setSelected(id); setCleanJson(JSON.stringify(pl));
    } catch (e) { flash((e as Error).message, true); }
  };

  const chooseCompare = async (id: string) => {
    setCompareId(id);
    if (id === 'none') { setComparePlan(null); return; }
    if (id === 'base') { setComparePlan(basePlan()); return; }
    try { setComparePlan(upgradePlan((await api<{ plan: Plan }>(`/api/planning/scenarios/${id}`)).plan)); }
    catch (e) { flash((e as Error).message, true); }
  };

  const save = async (asNew: boolean) => {
    let name = plan.name;
    if (asNew || selected === 'base') {
      const n = window.prompt('Name this scenario', selected === 'base' ? 'Plan: ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : plan.name + ' (copy)');
      if (!n?.trim()) return;
      name = n.trim();
    }
    setBusy(true);
    try {
      const next = { ...plan, name };
      const row = await api<Saved>('/api/planning/scenarios', { id: asNew || selected === 'base' ? undefined : selected, name, plan: next, summary: planMonthsOf(result, next.startMonth, (e) => runRateArr(result, e)) });
      setPlan(next); setSelected(row.id); setCleanJson(JSON.stringify(next));
      await refreshList();
      flash(`Saved “${name}”.`);
    } catch (e) { flash((e as Error).message, true); }
    setBusy(false);
  };

  const remove = async () => {
    if (selected === 'base' || !window.confirm(`Delete “${plan.name}” for everyone?`)) return;
    try {
      await api(`/api/planning/scenarios/${selected}`, undefined, 'DELETE');
      await refreshList();
      const b = basePlan(); setPlan(b); setSelected('base'); setCleanJson(JSON.stringify(b));
      flash('Deleted.');
    } catch (e) { flash((e as Error).message, true); }
  };

  return (
    <>
      <PageHeader
        title="5-year plan"
        description="The plan to FY31. Change the inputs in Setup. The tabs show the results."
        status={<>
          {dirty && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Not saved</span>}
          {msg && <span className={`text-xs ${msg.bad ? 'text-rose-700' : 'text-emerald-700'}`} role="status">{msg.text}</span>}
        </>}
        tabs={VIEW_TABS} tab={view} onTab={(v) => setView(v as View)}
        help={<>
          <p>Base is the Projection and Deployment Plan sheet.</p>
          <p>Each saved scenario is a copy with your changes. All persons see the saved scenarios.</p>
          <p><a href={BASE_SOURCE_URL} target="_blank" rel="noreferrer" className="font-medium text-accent-600 hover:underline">Open the source sheet</a></p>
        </>}
        actions={<>
          <label className="sr-only" htmlFor="scn">Scenario</label>
          <select id="scn" value={selected} onChange={(e) => open(e.target.value)} className="min-h-11 sm:min-h-9 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium">
            <option value="base">Base plan</option>
            {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" disabled={busy || (!dirty && selected !== 'base')} onClick={() => save(false)} className={BTN}>
            {selected === 'base' ? 'Save as scenario' : 'Save'}
          </button>
          <button type="button" onClick={() => setSetupOpen(true)} className={BTN}><SlidersHorizontal className="h-4 w-4" aria-hidden />Setup</button>
          <Popover align="right" width={260} buttonClassName={BTN} buttonLabel="More actions" button={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
            <div className="space-y-1 p-2 text-sm">
              <label className="block px-2 pt-1 text-xs font-medium text-slate-600" htmlFor="cmp">Compare with</label>
              <select id="cmp" value={compareId} onChange={(e) => chooseCompare(e.target.value)} className="mx-2 mb-1 min-h-11 sm:min-h-9 w-[calc(100%-1rem)] rounded-lg border border-slate-200 px-2 text-sm">
                <option value="none">No scenario</option>
                <option value="base">Base plan</option>
                {saved.filter((s) => s.id !== selected).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {selected !== 'base' && <button type="button" disabled={busy} onClick={() => save(true)} className={MENU}>Save as new scenario</button>}
              <button type="button" disabled={!dirty} onClick={() => { if (window.confirm('Remove all changes made after the last save?')) setPlan(JSON.parse(cleanJson)); }} className={MENU}>Undo changes</button>
              <button type="button" onClick={() => void import('../../utils/planningExport').then((m) => m.downloadPlanWorkbook(plan, result))} className={MENU}>Download Excel</button>
              <Link to="/tools/round-planner" className={MENU}>Open Round planner</Link>
              {selected !== 'base' && <button type="button" onClick={remove} className={MENU + ' text-rose-700'}>Delete this scenario</button>}
            </div>
          </Popover>
        </>}
      />
      <Drawer open={setupOpen} onClose={() => setSetupOpen(false)} title="Setup" subtitle={panelSummary(plan)} width={920}>
        <SetupPanel embedded plan={plan} update={update} result={result} />
      </Drawer>
      <div className="mx-auto max-w-7xl space-y-4 px-4 pb-10 sm:px-6 lg:px-8">
        {view === 'overview' && <OverviewView plan={plan} result={result} compare={compareId !== 'none' ? compareResult : null} compareName={compareName} />}
        {view === 'business' && <BusinessPlanView plan={plan} result={result} />}
        {view === 'revenue' && <RevenueView plan={plan} result={result} />}
        {view === 'costs' && <CostsView plan={plan} result={result} />}
        {view === 'monthly' && <PnlGrid r={result} />}
        {view === 'cash' && <CashFundingView plan={plan} result={result} />}
        {view === 'products' && <ProductsCustomersView plan={plan} result={result} />}
        {view === 'actual' && <PlanVsActualView saved={saved} />}
      </div>
    </>
  );
}
