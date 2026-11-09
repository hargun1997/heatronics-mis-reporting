// 5-year plan — the Projection & Deployment Plan sheet, run live in the MIS and extended
// to FY31, with levers and saved scenarios. Engine: data/planning/engine.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { runPlan, type Plan, type PlanResult } from '../../data/planning/engine';
import { basePlan, upgradePlan, BASE_SOURCE_URL } from '../../data/planning/basePlan';
import { SetupPanel } from '../../components/planning/setup/SetupPanel';
import { OverviewView } from '../../components/planning/outputs/Overview';
import { BusinessPlanView } from '../../components/planning/outputs/BusinessPlan';
import { RevenueView } from '../../components/planning/outputs/Revenue';
import { CostsView } from '../../components/planning/outputs/Costs';
import { CashFundingView } from '../../components/planning/outputs/CashFunding';
import { ProductsCustomersView } from '../../components/planning/outputs/ProductsCustomers';
import { PnlGrid } from '../../components/planning/PnlGrid';
import { monthBefore, openingFromTally } from '../../data/planning/opening';
import { downloadPlanWorkbook } from '../../utils/planningExport';

interface Saved { id: string; name: string; note: string; updatedAt: string; updatedBy: string | null }
type View = 'overview' | 'business' | 'revenue' | 'costs' | 'monthly' | 'cash' | 'products';

const DRAFT_KEY = 'planning-draft-v1';
const icon = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 15l4-4 3 3 6-7" />
  </svg>
);

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
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage unavailable — the draft just isn't kept */ }
}

export function PlanningPage() {
  const [draft] = useState(loadDraft);
  const [plan, setPlan] = useState<Plan>(() => draft?.plan ?? basePlan());
  const [selected, setSelected] = useState<string>(draft?.selected ?? 'base');
  const [cleanJson, setCleanJson] = useState<string>(() => draft?.clean ?? JSON.stringify(basePlan()));
  const [saved, setSaved] = useState<Saved[]>([]);
  const [view, setView] = useState<View>('overview');
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
    if (dirty && !window.confirm('Discard unsaved changes to this scenario?')) return;
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
      const n = window.prompt('Name this scenario', selected === 'base' ? 'Plan — ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : plan.name + ' (copy)');
      if (!n?.trim()) return;
      name = n.trim();
    }
    setBusy(true);
    try {
      const next = { ...plan, name };
      const row = await api<Saved>('/api/planning/scenarios', { id: asNew || selected === 'base' ? undefined : selected, name, plan: next });
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
        description="Your Projection & Deployment Plan, running live and extended to FY31. Everything you can change is in Setup; everything below it is the result."
        icon={icon}
        accent="brand"
        actions={<a href={BASE_SOURCE_URL} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">Source sheet ↗</a>}
      />
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {/* scenario bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-surface px-4 py-3 shadow-card">
          <label className="text-[12px] font-semibold text-slate-500" htmlFor="scn">Scenario</label>
          <select id="scn" value={selected} onChange={(e) => open(e.target.value)} className="max-w-[260px] rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] font-semibold">
            <option value="base">Base — Projection & Deployment Plan</option>
            {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {dirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs sm:text-[11px] font-semibold text-amber-700">Unsaved changes</span>}
          <button disabled={busy || (!dirty && selected !== 'base')} onClick={() => save(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            {selected === 'base' ? 'Save as scenario' : 'Save'}
          </button>
          {selected !== 'base' && <button disabled={busy} onClick={() => save(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Save as new</button>}
          <button onClick={() => { if (!dirty || window.confirm('Undo all changes since the last save?')) { setPlan(JSON.parse(cleanJson)); } }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" disabled={!dirty}>Undo changes</button>
          {selected !== 'base' && <button onClick={remove} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 hover:text-rose-600">Delete</button>}
          <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
          <label className="text-[12px] font-semibold text-slate-500" htmlFor="cmp">Compare with</label>
          <select id="cmp" value={compareId} onChange={(e) => chooseCompare(e.target.value)} className="max-w-[220px] rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]">
            <option value="none">Nothing</option>
            <option value="base">Base</option>
            {saved.filter((s) => s.id !== selected).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => downloadPlanWorkbook(plan, result)} className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Export Excel</button>
          {msg && <span className={`w-full text-[12px] ${msg.bad ? 'text-rose-600' : 'text-emerald-700'}`} role="status">{msg.text}</span>}
        </div>

        <SetupPanel plan={plan} update={update} result={result} />

        <div className="-mx-1 overflow-x-auto px-1 [&_button]:whitespace-nowrap">
          <SegmentedControl<View>
            options={[{ id: 'overview', label: 'Overview' }, { id: 'business', label: 'Business plan' }, { id: 'revenue', label: 'Revenue' }, { id: 'costs', label: 'Costs' }, { id: 'monthly', label: 'Monthly P&L' }, { id: 'cash', label: 'Cash & funding' }, { id: 'products', label: 'Products & customers' }]}
            value={view} onChange={setView} aria-label="Plan output"
          />
        </div>

        {view === 'overview' && <OverviewView plan={plan} result={result} compare={compareId !== 'none' ? compareResult : null} compareName={compareName} />}
        {view === 'business' && <BusinessPlanView plan={plan} result={result} />}
        {view === 'revenue' && <RevenueView plan={plan} result={result} />}
        {view === 'costs' && <CostsView plan={plan} result={result} />}
        {view === 'monthly' && <PnlGrid r={result} />}
        {view === 'cash' && <CashFundingView plan={plan} result={result} />}
        {view === 'products' && <ProductsCustomersView plan={plan} result={result} />}
      </div>
    </>
  );
}
