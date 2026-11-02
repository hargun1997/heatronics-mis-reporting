// Business plan: the sheet's "Business Plan" + "Overview" tabs, live — headline, The Ask,
// use of funds, key assumptions, risks, themes & milestones, capital deployment, team.

import { useMemo, useState } from 'react';
import { monthLabel, type BusinessPlan, type Plan, type PlanResult } from '../../data/planning/engine';
import { deployment, headline, theAsk } from '../../data/planning/summary';
import { SectionCard } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import { cr, int, lakh, pct } from './fmt';
import { NumInput } from './inputs';
import type { Update } from './LeverPanel';

export function BusinessPlanTab({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const H = r.months.length;
  const spans = [
    { n: 12, label: `12 months`, sub: `${r.months[0].label} → ${r.months[11]?.label}` },
    { n: 18, label: `18 months`, sub: `→ ${r.months[17]?.label}` },
    ...(H > 18 ? [{ n: H, label: 'Full plan', sub: `→ ${r.months[H - 1].label}` }] : []),
  ];
  const heads = spans.map((s) => headline(plan, r, s.n));
  const contingencies = spans.map((s) => (s.n === 12 ? plan.business.contingency12 : plan.cash.contingencyPct));
  const asks = spans.map((s, i) => theAsk(plan, r, s.n, contingencies[i]));
  const setCont = (n: number, v: number) => update((p) => { if (n === 12) p.business.contingency12 = v; else p.cash.contingencyPct = v; });
  const setB = (fn: (b: BusinessPlan) => void) => update((p) => fn(p.business));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Headline" description="Business Plan rows 4–12. Exit ARR = trailing-12-month revenue × last-3-month growth vs a year earlier (capped at 2×).">
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
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
            Jul–Sep ’26 actual revenue (for the 12-month exit)
            <NumInput unit="cr" value={plan.business.exitPriorL3M} min={0} width="w-16" title="Jul–Sep 26 revenue" onChange={(v) => setB((b) => { b.exitPriorL3M = v; })} />
            · growth cap
            <NumInput unit="x" value={plan.business.exitGrowthCap} min={1} max={5} step={0.1} width="w-14" title="Exit growth cap" onChange={(v) => setB((b) => { b.exitGrowthCap = v; })} />
          </p>
        </SectionCard>

        <SectionCard title="The Ask" description="Peak cumulative cash deficit in the period, plus a contingency buffer, less venture debt drawn in it.">
          <Table cols={spans} rows={[
            ['Peak cash deficit (₹ Cr)', asks.map((a) => `${cr(a.peakDeficit)} · ${r.months[a.peakMonth - 1]?.label ?? ''}`)],
            ['Contingency buffer', spans.map((s, i) => (
              <NumInput key={s.n} unit="pct" value={contingencies[i]} min={0} max={3} width="w-16" title={`Contingency ${s.label}`} onChange={(v) => setCont(s.n, v)} />
            ))],
            ['Total funding need (₹ Cr)', asks.map((a) => cr(a.fundingNeed))], // net of any opening cash
            ['less venture debt (₹ Cr)', asks.map((a) => cr(-a.ventureDebt))],
            ['EQUITY REQUIRED (₹ Cr)', asks.map((a) => cr(a.equityRequired)), true],
            ...(asks.some((a) => a.seed > 0) ? [['less seed round (₹ Cr)', asks.map((a) => cr(-a.seed))] as [string, string[]], ['STILL TO RAISE after seed (₹ Cr)', asks.map((a) => cr(a.equityAfterSeed)), true] as [string, string[], boolean]] : []),
            ['of which inventory (peak)', asks.map((a) => cr(a.inventoryPeak))],
            ['of which GST asset (peak)', asks.map((a) => cr(a.gstAssetPeak))],
          ]} />
          <p className="mt-2 text-[11px] text-slate-500">Full-plan column uses the 18-month buffer. Venture debt comes from the Cash & funding timeline.</p>
        </SectionCard>
      </div>

      <UseOfFunds plan={plan} r={r} asks={asks} spans={spans} />
      <Deployment plan={plan} r={r} asks={asks} spans={spans} />

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="Key assumptions" description="What the plan rests on — kept with the numbers so the deck and the model never drift."
          actions={<AddBtn onClick={() => setB((b) => { b.assumptions.push({ id: rid(), assumption: '', value: '', basis: '' }); })} />}>
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
          <LiveChecks plan={plan} r={r} />
        </SectionCard>

        <SectionCard title="Key risks & mitigation"
          actions={<AddBtn onClick={() => setB((b) => { b.risks.push({ id: rid(), risk: '', mitigation: '' }); })} />}>
          <div className="space-y-1.5">
            {plan.business.risks.map((x, i) => (
              <div key={x.id} className="grid grid-cols-[1fr_1.4fr_auto] gap-1.5">
                <Txt value={x.risk} placeholder="Risk" onChange={(v) => setB((b) => { b.risks[i].risk = v; })} bold area />
                <Txt value={x.mitigation} placeholder="Mitigation" onChange={(v) => setB((b) => { b.risks[i].mitigation = v; })} area />
                <Del onClick={() => setB((b) => { b.risks.splice(i, 1); })} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Milestones plan={plan} r={r} update={update} />
        <SectionCard title="Team structure" description="From the Overview tab. One line per role; → for who reports into whom.">
          <textarea value={plan.business.team} onChange={(e) => setB((b) => { b.team = e.target.value; })} rows={10}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] leading-relaxed" aria-label="Team structure" />
        </SectionCard>
      </div>
    </div>
  );
}

// ---- pieces --------------------------------------------------------------------------

const rid = () => Math.random().toString(36).slice(2, 9);

function Table({ cols, rows }: { cols: { n: number; label: string; sub: string }[]; rows: [string, React.ReactNode[], boolean?][] }) {
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

function UseOfFunds({ plan, r, asks, spans }: { plan: Plan; r: PlanResult; asks: ReturnType<typeof theAsk>[]; spans: { n: number; label: string }[] }) {
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

function Deployment({ plan, r, asks, spans }: { plan: Plan; r: PlanResult; asks: ReturnType<typeof theAsk>[]; spans: { n: number; label: string }[] }) {
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
      description="Overview rows 42–87, per month in ₹ lakh. Tag a cost line with a milestone on the Costs tab and it shows up here; untagged spend is business as usual. Working capital is excluded."
      actions={
        <div className="flex flex-wrap gap-2">
          <SegmentedControl size="sm" value={by} onChange={setBy} options={[{ id: 'milestone', label: 'By milestone' }, { id: 'theme', label: 'By theme' }]} />
          <SegmentedControl size="sm" value={span} onChange={setSpan} options={spans.map((s) => ({ id: String(s.n), label: s.label }))} />
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
            {[['Total key deployment', d.tagged], ['Total spend (all costs)', d.totalSpend], ['Business as usual (untagged)', d.untagged]].map(([label, xs]) => (
              <tr key={label as string} className="border-t-2 border-slate-200 font-semibold">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1 pr-3">{label as string}</td>
                {(xs as number[]).map((v, i) => <td key={i} className="px-1.5 text-right">{lakh(v)}</td>)}
                <td className="bg-slate-50 px-2 text-right">{lakh(total(xs as number[]))}</td>
                <td className="bg-slate-50 px-2 text-right text-slate-500">{pct(total(xs as number[]) / (ask?.equityRequired || 1))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function Milestones({ plan, r, update }: { plan: Plan; r: PlanResult; update: Update }) {
  const themes = [...new Set(plan.business.themes.map((t) => t.theme))];
  const tagged = (ms: string) => plan.lines.filter((l) => l.milestone === ms).length;
  const rename = (i: number, v: string) => update((p) => {
    const old = p.business.themes[i].milestone;
    p.business.themes[i].milestone = v;
    for (const l of p.lines) if (l.milestone === old) l.milestone = v; // keep cost lines attached
  });
  const retheme = (i: number, v: string) => update((p) => {
    const ms = p.business.themes[i].milestone;
    p.business.themes[i].theme = v;
    for (const l of p.lines) if (l.milestone === ms) l.theme = v;
  });
  return (
    <SectionCard title="Themes & milestones" description="Overview rows 10–36. Renaming a milestone or moving it to another theme updates every cost line tagged with it."
      actions={<AddBtn onClick={() => update((p) => { p.business.themes.push({ id: rid(), theme: themes[0] ?? 'New theme', milestone: 'New milestone', month: 1 }); })} />}>
      <datalist id="plan-themes">{themes.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1 text-left font-semibold">Theme</th><th className="text-left font-semibold">Milestone</th>
              <th className="text-left font-semibold">Month</th><th className="text-right font-semibold">Cost lines</th><th />
            </tr>
          </thead>
          <tbody>
            {plan.business.themes.map((t, i) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-1 pr-2"><input list="plan-themes" value={t.theme} onChange={(e) => retheme(i, e.target.value)} className="w-56 rounded border border-slate-200 px-2 py-1" aria-label="Theme" /></td>
                <td className="pr-2"><input value={t.milestone} onChange={(e) => rename(i, e.target.value)} className="w-52 rounded border border-slate-200 px-2 py-1 font-semibold" aria-label="Milestone" /></td>
                <td className="pr-2">
                  <select value={t.month} onChange={(e) => update((p) => { p.business.themes[i].month = Number(e.target.value); })} className="rounded border border-slate-200 px-1.5 py-1">
                    {r.months.map((m) => <option key={m.m} value={m.m}>{monthLabel(plan.startMonth, m.m)}</option>)}
                  </select>
                </td>
                <td className="text-right text-slate-500">{tagged(t.milestone)}</td>
                <td className="pl-2 text-right"><Del onClick={() => update((p) => { p.business.themes.splice(i, 1); })} /></td>
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

function Txt({ value, onChange, placeholder, bold, muted, area }: { value: string; onChange: (v: string) => void; placeholder: string; bold?: boolean; muted?: boolean; area?: boolean }) {
  const cls = `w-full rounded border border-slate-200 px-2 py-1 text-[12.5px] ${bold ? 'font-semibold text-slate-800' : muted ? 'text-slate-500' : 'text-slate-700'}`;
  return area
    ? <textarea value={value} placeholder={placeholder} rows={2} onChange={(e) => onChange(e.target.value)} className={cls} aria-label={placeholder} />
    : <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} aria-label={placeholder} />;
}
function AddBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">+ Add</button>;
}
function Del({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="px-1 text-[12px] text-slate-400 hover:text-rose-600" aria-label="Remove">✕</button>;
}
