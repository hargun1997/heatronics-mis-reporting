// Output view "Business plan" (docs/planning/ONE-SETUP.md §3; 4 sub-tabs since pass 2, 11 Nov 2026): the sheet's Business Plan + Overview tabs, live —
// headline, The Ask, use of funds, capital deployment, and the plan's words (assumptions, risks, themes & milestones,
// team) as read-only lists. The text is edited in Setup → Business plan text; the numbers in Starting point / Assumptions.

import { useMemo, useState, type ReactNode } from 'react';
import { monthLabel, type Plan, type PlanResult } from '../../../data/planning/engine';
import { deployment, headline, theAsk } from '../../../data/planning/summary';
import { PlanCard as SectionCard, SubTabs } from '../ui';
import { useSubTab } from '../subTab';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { cr, int, lakh, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }
interface Span { n: number; label: string; sub: string }
const BP_TABS: { id: 'money' | 'funds' | 'words' | 'milestones'; label: string }[] = [
  { id: 'money', label: 'Headline and Ask' }, { id: 'funds', label: 'Use of funds' }, { id: 'words', label: 'Assumptions and risks' }, { id: 'milestones', label: 'Milestones and team' },
];

export function BusinessPlanView({ plan, result }: Props) {
  const r = result;
  const H = r.months.length;
  const spans: Span[] = [
    { n: 12, label: `12 months`, sub: `${r.months[0].label} → ${r.months[11]?.label}` },
    { n: 18, label: `18 months`, sub: `→ ${r.months[17]?.label}` },
    ...(H > 18 ? [{ n: H, label: 'Full plan', sub: `→ ${r.months[H - 1].label}` }] : []),
  ];
  const heads = spans.map((s) => headline(plan, r, s.n));
  const contingencies = spans.map((s) => (s.n === 12 ? plan.business.contingency12 : plan.cash.contingencyPct));
  const asks = spans.map((s, i) => theAsk(plan, r, s.n, contingencies[i]));
  const B = plan.business;
  const [tab, setTab] = useSubTab('business', BP_TABS.map((t) => t.id), 'money');

  return (
    <div className="space-y-4">
      <SubTabs value={tab} onChange={setTab} options={BP_TABS} label="Business plan part" />
      {tab === 'money' && <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Headline" info={<><p>Exit ARR = revenue of the last 12 months × growth of the last 3 months against 1 year before.</p><p>The growth is capped at {B.exitGrowthCap.toFixed(1)}×.</p><p>Jul to Sep 2026 actual revenue: ₹{cr(B.exitPriorL3M)} Cr. Change both in Setup → Starting point.</p></>}>
          <Table cols={spans} rows={[
            ['Revenue (₹ Cr)', heads.map((h) => cr(h.revenue))],
            ['Units', heads.map((h) => int(h.units))],
            ['Gross margin', heads.map((h) => pct(h.grossMargin))],
            ['Contribution (CM3)', heads.map((h) => pct(h.cm3Pct))],
            ['EBITDA (₹ Cr)', heads.map((h) => cr(h.ebitda))],
            ['EBITDA %', heads.map((h) => pct(h.ebitdaPct))],
            ['Exit ARR (₹ Cr)', heads.map((h) => cr(h.exitArr)), true],
            ['  Run-rate × growth', heads.map((h) => `${cr(h.exitRunRate)} × ${h.exitGrowth.toFixed(2)}`)],
          ]} />
        </SectionCard>

        <SectionCard title="The Ask" info={<><p>Equity required = largest cash deficit in the period × (1 + buffer) − venture debt.</p><p>The full-plan column uses the 18-month buffer.</p><p>Change the buffers in Setup → Assumptions. Change the debt in Setup → Funding.</p></>}>
          <Table cols={spans} rows={[
            ['Largest cash deficit (₹ Cr)', asks.map((a) => `${cr(a.peakDeficit)} · ${r.months[a.peakMonth - 1]?.label ?? ''}`)],
            ['Buffer', contingencies.map((c) => pct(c, 0))],
            ['Total funding need (₹ Cr)', asks.map((a) => cr(a.fundingNeed))], // net of any opening cash
            ['Less venture debt (₹ Cr)', asks.map((a) => cr(-a.ventureDebt))],
            ['Equity required (₹ Cr)', asks.map((a) => cr(a.equityRequired)), true],
            ...(asks.some((a) => a.seed > 0) ? [['Less seed round (₹ Cr)', asks.map((a) => cr(-a.seed))] as [string, string[]], ['Still to raise after seed (₹ Cr)', asks.map((a) => cr(a.equityAfterSeed)), true] as [string, string[], boolean]] : []),
            ['Of which stock (largest)', asks.map((a) => cr(a.inventoryPeak))],
            ['Of which GST asset (largest)', asks.map((a) => cr(a.gstAssetPeak))],
          ]} />
        </SectionCard>
      </div>}

      {tab === 'funds' && <>
        <UseOfFunds plan={plan} r={r} asks={asks} spans={spans} />
        <Deployment plan={plan} r={r} asks={asks} spans={spans} />
      </>}

      {tab === 'words' && <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Key assumptions" count={B.assumptions.length} info="Write and change these in Setup → Business plan text.">
          {B.assumptions.length === 0 && <p className="text-[13px] text-slate-600">No assumptions yet. Add them in Setup → Business plan text.</p>}
          <div className="divide-y divide-slate-100">
            {B.assumptions.map((a) => (
              <div key={a.id} className="grid grid-cols-[1.3fr_1fr_1.3fr] gap-3 py-1.5 text-[12.5px]">
                <span className="font-semibold text-slate-800">{a.assumption || <Empty />}</span>
                <span className="text-slate-700">{a.value || <Empty />}</span>
                <span className="text-slate-500">{a.basis || <Empty />}</span>
              </div>
            ))}
          </div>
          <LiveChecks plan={plan} r={r} />
        </SectionCard>

        <SectionCard title="Risks and what we do" count={B.risks.length} info="Write and change these in Setup → Business plan text.">
          {B.risks.length === 0 && <p className="text-[13px] text-slate-600">No risks yet. Add them in Setup → Business plan text.</p>}
          <div className="divide-y divide-slate-100">
            {B.risks.map((x) => (
              <div key={x.id} className="grid grid-cols-[1fr_1.4fr] gap-3 py-1.5 text-[12.5px]">
                <span className="font-semibold text-slate-800">{x.risk || <Empty />}</span>
                <span className="text-slate-700">{x.mitigation || <Empty />}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>}

      {tab === 'milestones' && <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Milestones plan={plan} />
        <SectionCard title="Team" info="One line for each role. An arrow (→) shows who reports to whom. Change it in Setup → Business plan text.">
          {B.team.trim() ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{B.team}</p> : <p className="text-[13px] text-slate-600">No team yet. Add it in Setup → Business plan text.</p>}
        </SectionCard>
      </div>}
    </div>
  );
}

// ---- pieces --------------------------------------------------------------------

function Empty() { return <span className="text-slate-300">—</span>; }

function Table({ cols, rows }: { cols: Span[]; rows: [string, ReactNode[], boolean?][] }) {
  return (
    <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-600">
            <th />
            {cols.map((c) => <th key={c.n} className="px-2 py-1.5 text-right font-semibold">{c.label}<span className="block text-xs font-normal normal-case text-slate-600">{c.sub}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, vals, strong]) => (
            <tr key={label} className={`border-b border-slate-100 ${strong ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-700'}`}>
              <td className="whitespace-pre py-1.5 pr-3">{label}</td>
              {vals.map((v, i) => <td key={i} className="px-2 py-1 text-right">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UseOfFunds({ plan, r, asks, spans }: { plan: Plan; r: PlanResult; asks: ReturnType<typeof theAsk>[]; spans: Span[] }) {
  const deps = spans.map((s) => deployment(plan, r, s.n));
  const themes = deps[deps.length - 1].themes.map((t) => t.theme);
  const tot = (d: ReturnType<typeof deployment>, th: string) => d.themes.find((t) => t.theme === th)?.total ?? 0;
  return (
    <SectionCard title="Use of funds" info={<><p>Spend on each theme, in ₹ Cr, and its share of the equity raise.</p><p>A cost line counts here when it has a milestone. Add milestones in Setup → Sheet lines.</p></>}>
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-600">
              <th className="py-1.5 text-left font-semibold">Theme</th>
              {spans.map((s) => <th key={s.n} colSpan={2} className="px-2 py-1.5 text-right font-semibold">{s.label} · ₹ Cr / % of raise</th>)}
            </tr>
          </thead>
          <tbody>
            {themes.map((th) => (
              <tr key={th} className="border-b border-slate-100">
                <td className="py-1.5 pr-3 text-slate-700">{th}</td>
                {deps.map((d, i) => [
                  <td key={'v' + i} className="px-2 text-right text-slate-800">{cr(tot(d, th))}</td>,
                  <td key={'p' + i} className="px-2 text-right text-slate-500">{pct(tot(d, th) / (asks[i].equityRequired || 1))}</td>,
                ])}
              </tr>
            ))}
            {themes.length === 0 && <tr><td colSpan={1 + 2 * spans.length} className="py-2 text-[12px] text-slate-500">No cost line has a milestone. Add one in Setup → Sheet lines.</td></tr>}
            <tr className="bg-slate-50 font-bold">
              <td className="py-1.5 pr-3">Total tagged deployment</td>
              {deps.map((d, i) => {
                const t = d.themes.reduce((a, x) => a + x.total, 0);
                return [<td key={'v' + i} className="px-2 text-right">{cr(t)}</td>, <td key={'p' + i} className="px-2 text-right">{pct(t / (asks[i].equityRequired || 1))}</td>];
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function Deployment({ plan, r, asks, spans }: { plan: Plan; r: PlanResult; asks: ReturnType<typeof theAsk>[]; spans: Span[] }) {
  const [span, setSpan] = useState(String(spans[1]?.n ?? spans[0].n));
  const [by, setBy] = useState<'milestone' | 'theme'>('milestone');
  const n = Number(span);
  const d = useMemo(() => deployment(plan, r, n), [plan, r, n]);
  const ask = asks[spans.findIndex((s) => s.n === n)];
  const rows = by === 'milestone' ? d.milestones : d.themes;
  const total = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
  return (
    <SectionCard
      title="Capital deployment"
      info={<><p>Spend per month, in ₹ L.</p><p>A cost line with a milestone shows here. Other spend is &quot;business as usual&quot;.</p><p>Working capital is not included.</p></>}
      action={
        <div className="flex flex-wrap gap-2">
          <SegmentedControl size="sm" value={by} onChange={setBy} options={[{ id: 'milestone', label: 'By milestone' }, { id: 'theme', label: 'By theme' }]} aria-label="Deployment grouped by" />
          <SegmentedControl size="sm" value={span} onChange={setSpan} options={spans.map((s) => ({ id: String(s.n), label: s.label }))} aria-label="Deployment period" />
        </div>
      }
    >
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="text-xs sm:text-[11px] text-slate-500">
              <th className="sticky left-0 z-10 bg-surface py-1.5 pr-3 text-left font-semibold">{by === 'milestone' ? 'Milestone' : 'Theme'}</th>
              {d.months.map((m) => <th key={m} className="whitespace-nowrap px-1.5 py-1.5 text-right font-semibold">{m}</th>)}
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">Total</th>
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">% of raise</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1 pr-3 text-slate-700">{x.key}{by === 'milestone' && <span className="ml-1.5 text-xs sm:text-[11px] text-slate-400">{x.theme}</span>}</td>
                {x.byMonth.map((v, i) => <td key={i} className="px-1.5 text-right text-slate-700">{lakh(v)}</td>)}
                <td className="bg-slate-50 px-2 text-right font-semibold">{lakh(x.total)}</td>
                <td className="bg-slate-50 px-2 text-right text-slate-500">{pct(x.total / (ask?.equityRequired || 1))}</td>
              </tr>
            ))}
            {([['Total key deployment', d.tagged], ['Total spend (all costs)', d.totalSpend], ['Business as usual (untagged)', d.untagged]] as [string, number[]][]).map(([label, xs]) => (
              <tr key={label} className="border-t-2 border-slate-200 font-semibold">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1 pr-3">{label}</td>
                {xs.map((v, i) => <td key={i} className="px-1.5 text-right">{lakh(v)}</td>)}
                <td className="bg-slate-50 px-2 text-right">{lakh(total(xs))}</td>
                <td className="bg-slate-50 px-2 text-right text-slate-500">{pct(total(xs) / (ask?.equityRequired || 1))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function Milestones({ plan }: { plan: Plan }) {
  const tagged = (ms: string) => plan.lines.filter((l) => l.milestone === ms).length;
  return (
    <SectionCard title="Themes and milestones" count={plan.business.themes.length} info="Change milestones in Setup → Business plan text. Link cost lines to a milestone in Setup → Sheet lines.">
      {plan.business.themes.length === 0 && <p className="text-[13px] text-slate-600">No milestones yet.</p>}
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-xs text-slate-600">
              <th className="py-1 pr-3 text-left font-semibold">Theme</th><th className="pr-3 text-left font-semibold">Milestone</th>
              <th className="pr-3 text-left font-semibold">Month</th><th className="text-right font-semibold">Cost lines</th>
            </tr>
          </thead>
          <tbody>
            {plan.business.themes.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 text-slate-600">{t.theme}</td>
                <td className="pr-3 font-semibold text-slate-800">{t.milestone}</td>
                <td className="pr-3 text-slate-600">{monthLabel(plan.startMonth, t.month)}</td>
                <td className="text-right text-slate-500">{tagged(t.milestone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/** A few assumptions the plan can state for itself, so the text can be checked against the numbers. */
function LiveChecks({ plan, r }: { plan: Plan; r: PlanResult }) {
  const first12 = r.months.slice(0, 12);
  const rev = first12.reduce((a, m) => a + m.netRevenue, 0);
  const octJan = first12.filter((m) => /^(Oct|Nov|Dec|Jan)/.test(m.label)).reduce((a, m) => a + m.netRevenue, 0);
  const amz = first12.reduce((a, m) => a + m.revenueByChannel.A, 0);
  const amzCost = first12.reduce((a, m) => a + plan.lines.filter((l) => /Amazon/.test(l.name) && (l.group === 'Channel Commission' || l.group === 'Fulfilment & Delivery')).reduce((s, l) => s + (m.lines[l.id] ?? 0), 0), 0);
  const peak = r.months.slice(0, 18).reduce((a, m) => Math.max(a, m.gstAsset), 0);
  return (
    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
      <b className="text-slate-800">First 12 months:</b> Oct–Jan = {pct(octJan / (rev || 1), 0)} of revenue ·
      Amazon fees and fulfilment = {pct(amzCost / (amz || 1))} of Amazon revenue · largest GST asset in 18 months ₹{cr(peak)} Cr.
    </p>
  );
}
