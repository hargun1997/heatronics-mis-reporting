// Output view "Business plan" (docs/planning/ONE-SETUP.md §3): the sheet's Business Plan + Overview tabs, live —
// headline, The Ask, use of funds, capital deployment, and the plan's words (assumptions, risks, themes & milestones,
// team) as read-only lists. The text is edited in Setup → Business plan text; the numbers in Starting point / Assumptions.

import { useMemo, useState, type ReactNode } from 'react';
import { monthLabel, type Plan, type PlanResult } from '../../../data/planning/engine';
import { deployment, headline, theAsk } from '../../../data/planning/summary';
import { SectionCard } from '../../ui/Card';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { cr, int, lakh, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }
interface Span { n: number; label: string; sub: string }

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

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Headline" description="Business Plan rows 4–12. Exit ARR = trailing-12-month revenue × last-3-month growth vs a year earlier (capped).">
          <Table cols={spans} rows={[
            ['Revenue (₹ Cr)', heads.map((h) => cr(h.revenue))],
            ['Units', heads.map((h) => int(h.units))],
            ['Gross margin', heads.map((h) => pct(h.grossMargin))],
            ['Contribution (CM3)', heads.map((h) => pct(h.cm3Pct))],
            ['EBITDA (₹ Cr)', heads.map((h) => cr(h.ebitda))],
            ['EBITDA %', heads.map((h) => pct(h.ebitdaPct))],
            ['Exit ARR (₹ Cr)', heads.map((h) => cr(h.exitArr)), true],
            ['  run-rate × growth', heads.map((h) => `${cr(h.exitRunRate)} × ${h.exitGrowth.toFixed(2)}`)],
          ]} />
          <p className="mt-2 text-[12px] text-slate-500">
            Jul–Sep ’26 actual revenue (for the 12-month exit) <b className="text-slate-700">₹{cr(B.exitPriorL3M)} Cr</b> · growth cap <b className="text-slate-700">{B.exitGrowthCap.toFixed(1)}×</b>
            <span className="text-slate-400"> — Setup → Starting point / Assumptions</span>
          </p>
        </SectionCard>

        <SectionCard title="The Ask" description="Peak cumulative cash deficit in the period, plus a contingency buffer, less venture debt drawn in it.">
          <Table cols={spans} rows={[
            ['Peak cash deficit (₹ Cr)', asks.map((a) => `${cr(a.peakDeficit)} · ${r.months[a.peakMonth - 1]?.label ?? ''}`)],
            ['Contingency buffer', contingencies.map((c) => pct(c, 0))],
            ['Total funding need (₹ Cr)', asks.map((a) => cr(a.fundingNeed))], // net of any opening cash
            ['less venture debt (₹ Cr)', asks.map((a) => cr(-a.ventureDebt))],
            ['EQUITY REQUIRED (₹ Cr)', asks.map((a) => cr(a.equityRequired)), true],
            ...(asks.some((a) => a.seed > 0) ? [['less seed round (₹ Cr)', asks.map((a) => cr(-a.seed))] as [string, string[]], ['STILL TO RAISE after seed (₹ Cr)', asks.map((a) => cr(a.equityAfterSeed)), true] as [string, string[], boolean]] : []),
            ['of which inventory (peak)', asks.map((a) => cr(a.inventoryPeak))],
            ['of which GST asset (peak)', asks.map((a) => cr(a.gstAssetPeak))],
          ]} />
          <p className="mt-2 text-[11px] text-slate-500">Full-plan column uses the 18-month buffer. Venture debt comes from the funding timeline (Setup → Funding); the buffers from Setup → Assumptions.</p>
        </SectionCard>
      </div>

      <UseOfFunds plan={plan} r={r} asks={asks} spans={spans} />
      <Deployment plan={plan} r={r} asks={asks} spans={spans} />

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Key assumptions" description="What the plan rests on — kept with the numbers so the deck and the model never drift.">
          {B.assumptions.length === 0 && <p className="text-[13px] text-slate-500">No assumptions written yet (Setup → Business plan text).</p>}
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

        <SectionCard title="Key risks & mitigation">
          {B.risks.length === 0 && <p className="text-[13px] text-slate-500">No risks written yet (Setup → Business plan text).</p>}
          <div className="divide-y divide-slate-100">
            {B.risks.map((x) => (
              <div key={x.id} className="grid grid-cols-[1fr_1.4fr] gap-3 py-1.5 text-[12.5px]">
                <span className="font-semibold text-slate-800">{x.risk || <Empty />}</span>
                <span className="text-slate-700">{x.mitigation || <Empty />}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Milestones plan={plan} />
        <SectionCard title="Team structure" description="From the Overview tab. One line per role; → for who reports into whom.">
          {B.team.trim() ? <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{B.team}</p> : <p className="text-[13px] text-slate-500">Nothing written yet (Setup → Business plan text).</p>}
        </SectionCard>
      </div>
    </div>
  );
}

// ---- pieces --------------------------------------------------------------------

function Empty() { return <span className="text-slate-300">—</span>; }

function Table({ cols, rows }: { cols: Span[]; rows: [string, ReactNode[], boolean?][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <th />
            {cols.map((c) => <th key={c.n} className="px-2 py-1.5 text-right font-semibold">{c.label}<span className="block text-[10px] font-normal normal-case text-slate-400">{c.sub}</span></th>)}
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
    <SectionCard title="Use of funds" description="Spend tagged to each theme (cost lines carrying a milestone), and its share of the equity raise for that period.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
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
            {themes.length === 0 && <tr><td colSpan={1 + 2 * spans.length} className="py-2 text-[12px] text-slate-500">No cost line carries a milestone yet (Setup → Sheet lines).</td></tr>}
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
      description="Overview rows 42–87, per month in ₹ lakh. A cost line tagged with a milestone (Setup → Sheet lines) shows up here; untagged spend is business as usual. Working capital is excluded."
      actions={
        <div className="flex flex-wrap gap-2">
          <SegmentedControl size="sm" value={by} onChange={setBy} options={[{ id: 'milestone', label: 'By milestone' }, { id: 'theme', label: 'By theme' }]} aria-label="Deployment grouped by" />
          <SegmentedControl size="sm" value={span} onChange={setSpan} options={spans.map((s) => ({ id: String(s.n), label: s.label }))} aria-label="Deployment period" />
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="sticky left-0 z-10 bg-surface py-1.5 pr-3 text-left font-semibold">{by === 'milestone' ? 'Milestone' : 'Theme'}</th>
              {d.months.map((m) => <th key={m} className="whitespace-nowrap px-1.5 py-1.5 text-right font-semibold">{m}</th>)}
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">Total</th>
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">% of raise</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.key} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1 pr-3 text-slate-700">{x.key}{by === 'milestone' && <span className="ml-1.5 text-[10px] text-slate-400">{x.theme}</span>}</td>
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
    <SectionCard title="Themes & milestones" description="Overview rows 10–36. Edited in Setup → Business plan text; cost lines are tagged with a milestone in Setup → Sheet lines.">
      {plan.business.themes.length === 0 && <p className="text-[13px] text-slate-500">No milestones yet.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
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
      <b className="text-slate-800">From the numbers (first 12 months):</b> Oct–Jan = {pct(octJan / (rev || 1), 0)} of revenue ·
      Amazon fees + fulfilment = {pct(amzCost / (amz || 1))} of Amazon revenue · peak GST asset ₹{cr(peak)} Cr in 18 months.
    </p>
  );
}
