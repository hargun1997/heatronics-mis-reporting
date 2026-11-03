// 5-year plan — the Projection & Deployment Plan sheet, run live in the MIS and extended
// to FY31, with levers and saved scenarios. Engine: data/planning/engine.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { runPlan, type Plan, type PlanResult } from '../../data/planning/engine';
import { basePlan, upgradePlan, BASE_SOURCE_URL } from '../../data/planning/basePlan';
import { LeverPanel } from '../../components/planning/LeverPanel';
import { FyTable } from '../../components/planning/FyTable';
import { RevenueBars, CashCurve, MiniStat } from '../../components/planning/charts';
import { RevenueTab } from '../../components/planning/RevenueTab';
import { CostsTab } from '../../components/planning/CostsTab';
import { PnlGrid } from '../../components/planning/PnlGrid';
import { CashTab } from '../../components/planning/CashTab';
import { CustomersTab } from '../../components/planning/CustomersTab';
import { BusinessPlanTab } from '../../components/planning/BusinessPlanTab';
import { ProductsTab } from '../../components/planning/ProductsTab';
import { GrowthTab } from '../../components/planning/GrowthTab';
import { NumInput } from '../../components/planning/inputs';
import { ParityToggle } from '../../components/planning/FounderPanel';
import { monthBefore, openingFromTally } from '../../data/planning/opening';
import { money, pct } from '../../components/planning/fmt';
import { downloadPlanWorkbook } from '../../utils/planningExport';

interface Saved { id: string; name: string; note: string; updatedAt: string; updatedBy: string | null }
type Tab = 'overview' | 'products' | 'growth' | 'business' | 'customers' | 'revenue' | 'costs' | 'monthly' | 'cash';

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
  const [tab, setTab] = useState<Tab>('overview');
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

  const ys = result.years;
  const fy28 = ys.find((y) => y.fy === 'FY28');
  const last = ys[ys.length - 1];
  const cagr = fy28 && last && last.fy !== 'FY28' ? Math.pow(last.revenueWithActuals / fy28.revenueWithActuals, 1 / (ys.indexOf(last) - ys.indexOf(fy28))) - 1 : NaN;
  const firstPositive = ys.find((y) => y.months === 12 && y.ebitda > 0);
  const peakMonth = result.months[result.peakDeficitMonth - 1];
  const lowMonth = result.months[result.minClosingCashMonth - 1];

  return (
    <>
      <PageHeader
        title="5-year plan"
        description="Your Projection & Deployment Plan, running live and extended to FY31. Move the levers, save scenarios, compare them, export to Excel."
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
          {dirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Unsaved changes</span>}
          <button disabled={busy || (!dirty && selected !== 'base')} onClick={() => save(false)} className="rounded-lg bg-cta px-3 py-1.5 text-xs font-semibold text-on-cta hover:bg-cta-hover disabled:opacity-40">
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
          <ParityToggle plan={plan} update={update} />
          <button onClick={() => downloadPlanWorkbook(plan, result)} className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Export Excel</button>
          {msg && <span className={`w-full text-[12px] ${msg.bad ? 'text-rose-600' : 'text-emerald-700'}`} role="status">{msg.text}</span>}
        </div>

        <div className="-mx-1 overflow-x-auto px-1 [&_button]:whitespace-nowrap">
        <SegmentedControl<Tab>
          options={[{ id: 'overview', label: '5-year view' }, { id: 'products', label: 'Products' }, { id: 'growth', label: 'Growth builder' }, { id: 'business', label: 'Business plan' }, { id: 'customers', label: 'D2C customers' }, { id: 'revenue', label: 'Revenue' }, { id: 'costs', label: 'Costs' }, { id: 'monthly', label: 'Monthly P&L' }, { id: 'cash', label: 'Cash & funding' }]}
          value={tab} onChange={setTab} aria-label="Planner view"
        />
        </div>

        {tab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <SectionCard title="Levers" description="Change one and everything recalculates.">
                <LeverPanel plan={plan} update={update} />
              </SectionCard>
            </aside>
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <MiniStat label={`${last?.fy} revenue`} value={money(last?.revenueWithActuals ?? 0, 1)} sub={Number.isFinite(cagr) ? `${pct(cagr, 0)} CAGR from FY28` : undefined} />
                <MiniStat label={`${last?.fy} EBITDA`} value={pct((last?.ebitdaWithActuals ?? 0) / (last?.revenueWithActuals || 1))} sub={`${money(last?.ebitdaWithActuals ?? 0)} · first positive full year: ${firstPositive?.fy ?? 'none'}`} bad={(last?.ebitda ?? 0) < 0} />
                <MiniStat label="Funding need" value={money(result.fundingRequired, 1)} sub={`Peak deficit ${money(result.peakDeficit, 1)} in ${peakMonth?.label ?? '–'} + contingency`} />
                <MiniStat label="Lowest cash" value={money(result.minClosingCash, 1)} sub={`${lowMonth?.label ?? ''} · with raises & debt on the timeline`} bad={result.minClosingCash < 0} />
              </div>

              <SectionCard
                title="Five years at a glance"
                description={compareResult && compareId !== 'none' ? `Small figures show the change vs ${compareName}.` : 'FY27 and FY28 come from the 18-month sheet; FY29–FY31 from the levers.'}
                actions={
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                    Apr–Sep ’26 actuals
                    <NumInput unit="cr" value={plan.levers.fy27H1Revenue} min={0} width="w-16" title="Apr–Sep 2026 actual revenue" onChange={(v) => update((p) => { p.levers.fy27H1Revenue = v; })} />
                    <span>rev</span>
                    <NumInput unit="cr" value={plan.levers.fy27H1Ebitda} width="w-16" title="Apr–Sep 2026 actual EBITDA" onChange={(v) => update((p) => { p.levers.fy27H1Ebitda = v; })} />
                    <span>EBITDA</span>
                  </div>
                }
              >
                <FyTable r={result} compare={compareId !== 'none' ? compareResult : null} compareName={compareName} />
              </SectionCard>

              <div className="space-y-5">
                <SectionCard title="Revenue by channel"><RevenueBars r={result} compare={compareId !== 'none' ? compareResult : null} /></SectionCard>
                <SectionCard title="Cash"><CashCurve r={result} compare={compareId !== 'none' ? compareResult : null} /></SectionCard>
              </div>
              <p className="text-[12px] leading-relaxed text-slate-500">
                How the years after Mar-28 are built: each SKU × channel sells the same month’s units a year earlier × (1 + that channel’s growth); prices move by the price lever.
                Cost lines marked “repeats” run as they did in the same month of Apr-27–Mar-28, so peak-season COGS, ROAS and winter campaigns recur every year; fixed amounts rise with inflation (and team growth for people costs).
                One-off launch, tooling and fundraise lines don’t repeat — add next launches on the Costs tab. Working capital, GST and debt work exactly as in the sheet.
              </p>
            </div>
          </div>
        )}
        {tab === 'products' && <ProductsTab plan={plan} r={result} update={update} />}
        {tab === 'growth' && <GrowthTab plan={plan} r={result} update={update} onOpenProducts={() => setTab('products')} />}
        {tab === 'business' && <BusinessPlanTab plan={plan} r={result} update={update} />}
        {tab === 'customers' && <CustomersTab plan={plan} r={result} update={update} />}
        {tab === 'revenue' && <RevenueTab plan={plan} r={result} update={update} />}
        {tab === 'costs' && <CostsTab plan={plan} r={result} update={update} />}
        {tab === 'monthly' && <PnlGrid r={result} />}
        {tab === 'cash' && <CashTab plan={plan} r={result} update={update} />}
      </div>
    </>
  );
}
