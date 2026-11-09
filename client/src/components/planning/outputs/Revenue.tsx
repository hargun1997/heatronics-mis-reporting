// Output view "Revenue" (docs/planning/ONE-SETUP.md §3): the sheet's revenue summary by month, units and revenue
// by product per FY, revenue vs the FY targets, the exit run-rate by product family, and offline / store revenue.
// Read only — the unit grid is in Setup → Sheet lines, growth in Assumptions, targets in Targets.

import { Fragment, useMemo } from 'react';
import { CATEGORY_NAMES, CHANNELS, CHANNEL_NAMES, type Plan, type PlanResult } from '../../../data/planning/engine';
import { runRateArr } from '../../../data/planning/growth';
import { SectionCard } from '../../ui/Card';
import { cr, int, lakh, money, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }

const th = 'px-2 py-2 text-left text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const thr = th.replace('text-left', 'text-right');
const td = 'px-2 py-1.5';
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

export function RevenueView({ plan, result }: Props) {
  const r = result;
  const months = r.months;
  const items = [...plan.skus.map((s) => ({ id: s.id, name: s.name })), ...plan.products.filter((p) => p.on).map((p) => ({ id: p.id, name: p.name + ' (new)' }))];
  const G = plan.growth;
  const parity = !!plan.fx?.sheetParity;
  const growthOn = !!G && G.on && !parity;
  const arr = runRateArr(r);

  // exit run-rate by product family: each SKU's share of the last 3 months' gross sales × the run-rate (GrowthTab's mix)
  const mix = useMemo(() => {
    const l3 = r.months.slice(-3);
    const gross = sum(l3.map((m) => m.grossRevenue)) || 1;
    const fam: Record<string, number> = { core: 0, stores: 0 };
    const byId: Record<string, number> = {};
    for (const m of l3) for (const [id, v] of Object.entries(m.revenueBySku)) byId[id] = (byId[id] ?? 0) + v;
    const catOf = new Map(plan.products.map((p) => [p.id, p.category ?? 'other']));
    for (const [id, v] of Object.entries(byId)) {
      const k = id === 'stores' ? 'stores' : catOf.has(id) ? catOf.get(id)! : 'core';
      fam[k] = (fam[k] ?? 0) + (v / gross) * arr;
    }
    return { fam, byId: Object.fromEntries(Object.entries(byId).map(([k, v]) => [k, (v / gross) * arr])) };
  }, [r, plan.products, arr]);
  const famName = (k: string) => (k === 'core' ? 'hCore range (today)' : k === 'stores' ? 'Own stores' : (G?.categories ?? []).find((c) => c.id === k)?.name ?? CATEGORY_NAMES[k] ?? k);

  const retail = growthOn ? (G?.retail ?? []).filter((t) => t.on) : [];
  const storesOn = growthOn && !!G?.stores.on;
  const lastM = months[months.length - 1];

  return (
    <div className="space-y-5">
      <RevenueSummary plan={plan} r={r} />

      <SectionCard title="Units and revenue by product" description="Per financial year. Revenue in ₹ Cr. New products are set up in Setup → Products & categories.">
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px] tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-xs sm:text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-3 text-left font-semibold">Product</th>
                {r.years.map((y) => <th key={y.fy} colSpan={2} className="px-2 py-1.5 text-right font-semibold">{y.fy}{y.months < 12 ? '*' : ''}<span className="block text-xs sm:text-[11px] font-normal normal-case text-slate-400">units · ₹ Cr</span></th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">{s.name}</td>
                  {r.years.map((y) => {
                    const ms = months.filter((m) => m.fy === y.fy);
                    const u = ms.reduce((a, m) => a + (m.unitsBySku[s.id] ?? 0), 0);
                    const rv = ms.reduce((a, m) => a + (m.revenueBySku[s.id] ?? 0), 0);
                    return [
                      <td key={y.fy + 'u'} className="px-2 py-1 text-right text-slate-500">{u ? int(u) : '–'}</td>,
                      <td key={y.fy + 'r'} className="px-2 py-1 text-right text-slate-800">{rv ? cr(rv) : '–'}</td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs sm:text-[11px] text-slate-500">*part year</p>
      </SectionCard>

      <SectionCard title="Revenue vs targets" description={growthOn
        ? 'Target P&L revenue per FY (Setup → Targets). "Fit the plan to these targets" pushes the new lines\' new buyers in each year until each target is met; push 1× = the volumes entered.'
        : 'Targets apply to the growth layer (Setup → Starting point → My plan, then Targets). Plan revenue, EBITDA and closing cash per FY are shown regardless.'}>
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px] tabular-nums">
            <thead><tr className="bg-surface-tint"><th className={th}>FY</th><th className={thr}>Target</th><th className={thr}>Plan revenue</th><th className={thr}>Gap</th><th className={thr}>of which GT / MT / pharmacy</th><th className={thr}>New-buyer push</th><th className={thr}>EBITDA</th><th className={thr}>Closing cash</th></tr></thead>
            <tbody>
              {r.years.map((y) => {
                const t = growthOn ? G?.path?.[y.fy] : undefined;
                const gap = t != null ? y.revenue - t : null;
                const push = growthOn ? G?.push?.[y.fy] : undefined;
                return (
                  <tr key={y.fy} className="border-t border-slate-100">
                    <td className={`${td} font-semibold text-slate-700`}>{y.fy}{y.months < 12 ? ` (${y.months} mo)` : ''}</td>
                    <td className={`${td} text-right text-slate-700`}>{t != null && t > 0 ? money(t, 1) : '–'}</td>
                    <td className={`${td} text-right text-slate-900`}>{money(y.revenue, 1)}</td>
                    <td className={`${td} text-right ${gap != null && Math.abs(gap) > Math.max(1e5, (t ?? 0) * 0.01) ? 'text-rose-600' : 'text-slate-500'}`}>{gap == null ? '–' : money(gap, 1)}</td>
                    <td className={`${td} text-right`}>{money(y.retailRevenue, 1)}</td>
                    <td className={`${td} text-right`}>{push != null ? `${push.toFixed(2)}×` : '1×'}</td>
                    <td className={`${td} text-right ${y.ebitda < 0 ? 'text-rose-600' : ''}`}>{money(y.ebitda, 1)} <span className="text-slate-400">({pct(y.ebitda / (y.revenue || 1), 0)})</span></td>
                    <td className={`${td} text-right ${y.closingCash < 0 ? 'text-rose-600' : ''}`}>{money(y.closingCash, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Exit run-rate by product family" description={`Each family's share of the last 3 months' sales × the exit ARR (${lastM?.label} run-rate ${money(arr, 0)} = last 3 months' revenue × 4).`}>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] tabular-nums">
          {Object.entries(mix.fam).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <span key={k}><span className="font-semibold text-slate-700">{famName(k)}</span> <span className="text-slate-900">{money(v, 0)}</span> <span className="text-slate-400">({pct(v / (arr || 1), 0)})</span></span>
          ))}
        </div>
        {plan.products.some((x) => x.on && (x.category || x.growthLine)) && (
          <ul className="mt-3 divide-y divide-slate-100 text-[13px]">
            {plan.products.filter((x) => x.category || x.growthLine).map((x) => (
              <li key={x.id} className={`flex flex-wrap items-center gap-3 py-1.5 ${x.on ? '' : 'opacity-50'}`}>
                <span className="font-medium text-slate-900">{x.name}</span>
                <span className="text-slate-500">{famName(x.category ?? 'other')}</span>
                <span className="text-slate-500">from {months.find((m) => m.m === x.launchMonth)?.label ?? '—'}</span>
                {!x.on && <span className="text-slate-400">off</span>}
                <span className="ml-auto tabular-nums text-slate-700">exit ARR {cr(mix.byId[x.id] ?? 0, 0)} Cr</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Offline revenue by channel type" description="General trade, modern trade and pharmacy: outlets live at the end of each FY and what they are invoiced (list price less the trade margin). Own stores: revenue per FY. Set up in Setup → Offline retail & stores.">
        {retail.length === 0 && !storesOn && <p className="text-[13px] text-slate-500">{growthOn ? 'No offline channels or stores in this plan.' : 'The growth layer is not applied (sheet parity / growth off), so there is no offline revenue.'}</p>}
        {retail.length > 0 && (
          <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px] tabular-nums">
              <thead>
                <tr className="bg-surface-tint"><th className={th}>Channel</th>{r.years.map((y) => <th key={y.fy} className={thr}>{y.fy}<span className="block text-xs sm:text-[11px] font-normal normal-case text-slate-400">outlets · invoiced</span></th>)}</tr>
              </thead>
              <tbody>
                {retail.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className={`${td} font-medium text-slate-700`}>{t.name}</td>
                    {r.years.map((y) => {
                      const ms = months.filter((m) => m.fy === y.fy);
                      const outlets = ms[ms.length - 1]?.outlets[t.id] ?? 0;
                      const inv = ms.reduce((a, m) => a + (m.retailByType[t.id] ?? 0), 0);
                      return <td key={y.fy} className={`${td} text-right`}><b className="text-slate-700">{int(outlets)}</b> <span className="text-slate-400">·</span> {money(inv, 1)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {storesOn && (
          <p className={`text-[12.5px] text-slate-600 ${retail.length ? 'mt-3' : ''}`}>
            <b className="text-slate-700">Own stores:</b> {int(lastM?.stores ?? 0)} stores at {lastM?.label} · {r.years.map((y) => `${y.fy} ${money(y.storeRevenue, 1)}`).join(' · ')}
          </p>
        )}
      </SectionCard>
    </div>
  );
}

/** Revenue Planning rows 33–55: by channel, mix, growth vs last year, MoM and blended ASP, per sheet month. */
function RevenueSummary({ plan, r }: { plan: Plan; r: PlanResult }) {
  const B = plan.units.length;
  const ms = r.months.slice(0, B);
  // Prior-year base revenue (row 46): last year's units at today's prices
  const py = ms.map((_, m) => plan.skus.reduce((a, s, i) => a + plan.units[m][i].reduce((t, cell) => t + cell[0], 0) * s.asp, 0));
  const rows: [string, (m: number) => string, boolean?][] = [
    ...CHANNELS.map((c) => [`${CHANNEL_NAMES[c]} (₹ L)`, (i: number) => lakh(ms[i].revenueByChannel[c])] as [string, (m: number) => string]),
    ['Total (₹ L)', (i) => lakh(ms[i].grossRevenue), true],
    ...CHANNELS.map((c) => [`${CHANNEL_NAMES[c]} mix`, (i: number) => pct(ms[i].revenueByChannel[c] / (ms[i].grossRevenue || 1), 0)] as [string, (m: number) => string]),
    ['Last year at today’s prices (₹ L)', (i) => lakh(py[i])],
    ['Growth vs last year', (i) => (py[i] ? `${(ms[i].grossRevenue / py[i]).toFixed(1)}×` : '–')],
    ['Growth MoM', (i) => (i ? pct(ms[i].grossRevenue / (ms[i - 1].grossRevenue || 1) - 1, 0) : '–')],
    ['Blended ASP (₹)', (i) => int(ms[i].grossRevenue / (ms[i].units || 1))],
  ];
  return (
    <SectionCard title="Revenue summary (the sheet's months)" description="Revenue Planning rows 33–55. Uses the D2C customer model when it is on. The unit grid behind it is in Setup → Sheet lines.">
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="text-xs sm:text-[11px] text-slate-500">
              <th className="sticky left-0 z-10 bg-surface py-1.5 pr-3 text-left font-semibold" />
              {ms.map((m) => <th key={m.m} className="whitespace-nowrap px-1.5 text-right font-semibold">{m.label}</th>)}
              <th className="bg-slate-100 px-2 text-right font-semibold text-slate-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f, strong], k) => (
              <Fragment key={label}>
                {(k === CHANNELS.length + 1 || k === 2 * CHANNELS.length + 1) && <tr><td colSpan={ms.length + 2} className="h-2" /></tr>}
                <tr className={`border-t border-slate-100 ${strong ? 'font-semibold' : ''}`}>
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-1 pr-3 text-slate-700">{label}</td>
                  {ms.map((_, i) => <td key={i} className="px-1.5 text-right text-slate-800">{f(i)}</td>)}
                  <td className="bg-slate-50 px-2 text-right font-semibold">
                    {label.endsWith('(₹ L)') && !label.startsWith('Last') ? cr(label.startsWith('Total') ? ms.reduce((a, m) => a + m.grossRevenue, 0) : ms.reduce((a, m) => a + (m.revenueByChannel[CHANNELS.find((c) => label.startsWith(CHANNEL_NAMES[c]))!] ?? 0), 0)) + ' Cr' : ''}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
