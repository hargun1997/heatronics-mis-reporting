// 5-year plan — the Projection & Deployment Plan sheet, run live in the MIS and extended
// to FY31, with levers and saved scenarios. Engine: data/planning/engine.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { Drawer, Popover } from '../../components/ui/overlays';
import { BTN, BTN_PRIMARY } from '../../components/ui/states';
import { askText, confirmDialog, toast } from '../../components/ui/feedback';
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
import { StatusPill } from '../../components/ui/StatusPill';
import { BP_TABS, COST_TABS, PC_TABS, REV_TABS, type CostSection } from '../../components/planning/outputs/parts';
import { SubTabs } from '../../components/planning/ui';
import { useSubTab } from '../../components/planning/subTab';

/** Excel download spans: months from the plan start (Oct-26); 0 = the whole plan. */
const DOWNLOAD_SPANS = [
  { months: 12, label: '1 year (to Sep-27)' },
  { months: 18, label: '18 months (to Mar-28)' },
  { months: 30, label: '3 years (to Mar-29)' },
  { months: 0, label: '5 years (to Mar-31)' },
];

interface Saved { id: string; name: string; note: string; updatedAt: string; updatedBy: string | null }
type View = 'overview' | 'revenue' | 'costs' | 'cash' | 'actual';

const DRAFT_KEY = 'planning-draft-v1';
// 5 tabs (22 Nov 2026, was 8): Business plan → Overview parts, Products and customers → Revenue parts,
// Capacity + Monthly P&L → Costs and P&L parts. One row of parts under the header tabs; no nested sub-tabs.
const VIEW_TABS = [{ id: 'overview', label: 'Overview' }, { id: 'revenue', label: 'Revenue' }, { id: 'costs', label: 'Costs and P&L' }, { id: 'cash', label: 'Cash and funding' }, { id: 'actual', label: 'Plan vs actual' }];
type OvPart = 'summary' | (typeof BP_TABS)[number]['id'];
const OV_PARTS: { id: OvPart; label: string }[] = [{ id: 'summary', label: 'Summary' }, ...BP_TABS];
type RevPart = (typeof REV_TABS)[number]['id'] | 'products' | 'd2c' | 'season';
const REV_PARTS: { id: RevPart; label: string }[] = [...REV_TABS, ...PC_TABS.filter((t) => t.id !== 'capacity') as { id: RevPart; label: string }[]];
type CostPart = CostSection | 'capacity' | 'monthly';
const COST_PARTS: { id: CostPart; label: string }[] = [...COST_TABS, { id: 'capacity', label: 'Capacity' }, { id: 'monthly', label: 'Monthly P&L' }];
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
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage unavailable: the draft just is not kept */ }
}

export function PlanningPage() {
  const [draft] = useState(loadDraft);
  const [plan, setPlan] = useState<Plan>(() => draft?.plan ?? basePlan());
  const [selected, setSelected] = useState<string>(draft?.selected ?? 'base');
  const [cleanJson, setCleanJson] = useState<string>(() => draft?.clean ?? JSON.stringify(basePlan()));
  const [saved, setSaved] = useState<Saved[]>([]);
  const [view, setView] = useState<View>('overview');
  const [ovPart, setOvPart] = useSubTab<OvPart>('overview', OV_PARTS.map((t) => t.id), 'summary');
  const [revPart, setRevPart] = useSubTab<RevPart>('revenue-parts', REV_PARTS.map((t) => t.id), 'year');
  const [costPart, setCostPart] = useSubTab<CostPart>('costs-parts', COST_PARTS.map((t) => t.id), 'revex');
  const [setupOpen, setSetupOpen] = useState(false);
  const [compareId, setCompareId] = useState<string>('base');
  const [comparePlan, setComparePlan] = useState<Plan | null>(() => basePlan());
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

  const flash = (text: string, _bad = false) => { void _bad; toast(text); };

  const open = async (id: string) => {
    if (dirty && !(await confirmDialog({ title: 'Open the other scenario?', body: 'Your changes are not saved. They are lost when the other scenario opens.', confirm: 'Open and discard changes', danger: true }))) return;
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
      const n = await askText({ title: 'Name this scenario', label: 'Scenario name', confirm: 'Save', initial: selected === 'base' ? 'Plan: ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : plan.name + ' (copy)' });
      if (!n?.trim()) return;
      name = n.trim();
    }
    setBusy(true);
    try {
      const next = { ...plan, name };
      const row = await api<Saved>('/api/planning/scenarios', { id: asNew || selected === 'base' ? undefined : selected, name, plan: next, summary: planMonthsOf(result, next.startMonth, (e) => runRateArr(result, e)) });
      setPlan(next); setSelected(row.id); setCleanJson(JSON.stringify(next));
      await refreshList();
      flash(`Saved “${name}”`);
    } catch (e) { flash((e as Error).message, true); }
    setBusy(false);
  };

  const remove = async () => {
    if (selected === 'base' || !(await confirmDialog({ title: `Delete “${plan.name}”?`, body: 'The scenario goes for every person. You cannot undo this.', confirm: 'Delete', danger: true }))) return;
    try {
      await api(`/api/planning/scenarios/${selected}`, undefined, 'DELETE');
      await refreshList();
      const b = basePlan(); setPlan(b); setSelected('base'); setCleanJson(JSON.stringify(b));
      flash('Deleted');
    } catch (e) { flash((e as Error).message, true); }
  };

  return (
    <>
      <PageHeader
        title="5-year plan"
        description="The plan to FY31. Change the inputs in Setup. The tabs show the results."
        status={<>
          {dirty && <StatusPill toneName="warning" size="sm">Not saved</StatusPill>}
        </>}
        tabs={VIEW_TABS} tab={view} onTab={(v) => setView(v as View)}
        help={<>
          <p>Base is the Projection and Deployment Plan sheet.</p>
          <p>Each saved scenario is a copy with your changes. All persons see the saved scenarios.</p>
          <p><a href={BASE_SOURCE_URL} target="_blank" rel="noreferrer" className="font-medium text-accent-600 hover:underline">Open the source sheet</a></p>
        </>}
        actions={<>
          <label className="sr-only" htmlFor="scn">Scenario</label>
          <select id="scn" value={selected} onChange={(e) => open(e.target.value)} className="min-h-11 sm:min-h-9 max-w-[140px] sm:max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium">
            <option value="base">Base plan</option>
            {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {/* Phones: Compare with lives in the "…" menu, so the header stays one row. */}
          <label className="sr-only" htmlFor="cmp">Compare with</label>
          <select id="cmp" value={compareId} onChange={(e) => chooseCompare(e.target.value)} className="max-sm:hidden min-h-11 sm:min-h-9 max-w-[200px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
            <option value="none">Compare with: none</option>
            <option value="base">Compare with: Base plan</option>
            {saved.filter((s) => s.id !== selected).map((s) => <option key={s.id} value={s.id}>Compare with: {s.name}</option>)}
          </select>
          <button type="button" disabled={busy || (!dirty && selected !== 'base')} onClick={() => save(false)} className={BTN_PRIMARY}>
            {selected === 'base' ? <><span className="sm:hidden">Save</span><span className="max-sm:hidden">Save as scenario</span></> : 'Save'}
          </button>
          <button type="button" onClick={() => setSetupOpen(true)} className={BTN} aria-label="Setup"><SlidersHorizontal className="h-4 w-4" aria-hidden /><span className="max-sm:sr-only">Setup</span></button>
          <Popover kind="menu" closeOnSelect align="right" width={260} buttonClassName={BTN} buttonLabel="More actions" button={<MoreHorizontal className="h-4 w-4" aria-hidden />}>
            <div className="space-y-1 p-2 text-sm">
              <label className="block px-2 pb-1 sm:hidden">
                <span className="mb-1 block text-xs font-medium text-slate-600">Compare with</span>
                <select value={compareId} onChange={(e) => chooseCompare(e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
                  <option value="none">None</option>
                  <option value="base">Base plan</option>
                  {saved.filter((s) => s.id !== selected).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              {selected !== 'base' && <button type="button" disabled={busy} onClick={() => save(true)} className={MENU}>Save as new scenario</button>}
              <button type="button" disabled={!dirty} onClick={() => { const before = plan; setPlan(JSON.parse(cleanJson)); toast('Changes removed', { undo: () => setPlan(before) }); }} className={MENU}>Undo changes</button>
              <p className="px-2 pt-2 text-xs font-medium text-slate-600">Download Excel</p>
              {DOWNLOAD_SPANS.map((d) => (
                <button key={d.months} type="button" onClick={() => void import('../../utils/planningExport').then((m) => m.downloadPlanWorkbook(plan, result, d.months))} className={MENU}>{d.label}</button>
              ))}
              <Link to="/tools/round-planner" className={MENU}>Open Round planner</Link>
              {selected !== 'base' && <button type="button" onClick={remove} className={MENU + ' border-t border-slate-200 text-red-700'}>Delete this scenario</button>}
            </div>
          </Popover>
        </>}
      />
      <Drawer open={setupOpen} onClose={() => setSetupOpen(false)} title="Setup" subtitle={panelSummary(plan)} width={920}>
        <SetupPanel embedded plan={plan} update={update} result={result} />
      </Drawer>
      <PageBody>
        {view === 'overview' && <>
          <SubTabs value={ovPart} onChange={setOvPart} options={OV_PARTS} label="Overview part" />
          {ovPart === 'summary' ? <OverviewView plan={plan} result={result} compare={compareId !== 'none' ? compareResult : null} compareName={compareName} />
            : <BusinessPlanView plan={plan} result={result} part={ovPart} />}
        </>}
        {view === 'revenue' && <>
          <SubTabs value={revPart} onChange={setRevPart} options={REV_PARTS} label="Revenue part" />
          {revPart === 'products' || revPart === 'd2c' || revPart === 'season' ? <ProductsCustomersView plan={plan} result={result} part={revPart} />
            : <RevenueView plan={plan} result={result} part={revPart} />}
        </>}
        {view === 'costs' && <>
          <SubTabs value={costPart} onChange={setCostPart} options={COST_PARTS} label="Costs and P&L part" />
          {costPart === 'monthly' ? <PnlGrid r={result} />
            : costPart === 'capacity' ? <ProductsCustomersView plan={plan} result={result} part="capacity" />
            : <CostsView plan={plan} result={result} part={costPart} />}
        </>}
        {view === 'cash' && <CashFundingView plan={plan} result={result} />}
        {view === 'actual' && <PlanVsActualView saved={saved} />}
      </PageBody>
    </>
  );
}
