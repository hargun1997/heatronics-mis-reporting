// Output view "Products & customers" (docs/planning/ONE-SETUP.md §3): the product roll-out (units by month), capacity
// and utilisation by FY, the D2C customer model's plan by year with its history check, and the seasonality curves.
// Read only — products in Setup → Products & categories, cohorts / seasons in Setup → D2C customers & seasonality.

import { useMemo } from 'react';
import { calOf, monthLabel, type D2CModel, type Plan, type PlanResult } from '../../../data/planning/engine';
import { predictRepeats } from '../../../data/planning/history';
import { PlanCard as SectionCard, SubTabs } from '../ui';
import { useSubTab } from '../subTab';
import { cr, int, pct } from '../fmt';

interface Props { plan: Plan; result: PlanResult; compare?: PlanResult | null; compareName?: string }

const PC_TABS: { id: 'products' | 'capacity' | 'd2c' | 'season'; label: string }[] = [
  { id: 'products', label: 'Products' }, { id: 'capacity', label: 'Capacity' }, { id: 'd2c', label: 'D2C customers' }, { id: 'season', label: 'Seasons' },
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ProductsCustomersView({ plan, result }: Props) {
  const r = result;
  const [tab, setTab] = useSubTab('products', PC_TABS.map((t) => t.id), 'products');
  return (
    <div className="space-y-4">
      <SubTabs value={tab} onChange={setTab} options={PC_TABS} label="Products and customers part" />
      {tab === 'products' && <RolloutCard plan={plan} r={r} />}
      {tab === 'capacity' && <CapacityCard plan={plan} r={r} />}
      {tab === 'd2c' && <D2CCard plan={plan} r={r} />}
      {tab === 'season' && <SeasonCard plan={plan} />}
    </div>
  );
}

// ---- Product roll-out ------------------------------------------------------------------

function RolloutCard({ plan, r }: { plan: Plan; r: PlanResult }) {
  const items = [
    ...plan.skus.map((s) => ({ id: s.id, name: s.name, isNew: false })),
    ...plan.products.filter((p) => p.on).map((p) => ({ id: p.id, name: p.name, isNew: true })),
  ];
  const ms = r.months;
  const lastFy = r.years[r.years.length - 1]?.fy;
  const seasonOf = (id: string) => {
    const prod = plan.products.find((p) => p.id === id);
    if (!prod) return 'Its own';
    const cat = (plan.growth?.categories ?? []).find((c) => c.id === prod.category);
    const ref = prod.seasonRef ?? cat?.seasonRef ?? 'flat';
    if (ref === 'flat') return 'Flat (no season)';
    const sku = plan.skus.find((s) => s.id === ref);
    return sku ? `Like ${sku.name}` : ref;
  };
  const peak = ms.reduce((a, m, j) => (m.units > ms[a].units ? j : a), 0);
  return (
    <SectionCard title="Product roll-out" count={items.length} info={<><p>Units for each month of the plan: launches, ramps and seasons.</p><p>Peak month: {ms[peak].label}, {int(ms[peak].units)} units ({MON[calOf(plan.startMonth, peak + 1)]}). Compare it with factory capacity.</p><p>Set up products and their season in Setup → Products and categories.</p></>}>
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12px] tabular-nums">
          <thead>
            <tr className="text-xs text-slate-600">
              <th className="py-1 pr-3 text-left font-semibold">Product</th>
              <th className="px-2 text-left font-semibold">First sale</th>
              <th className="px-2 text-left font-semibold">Units by month · {ms[0].label} → {ms[ms.length - 1].label}</th>
              <th className="px-2 text-right font-semibold">{lastFy} units</th>
              <th className="pl-2 text-left font-semibold">Season</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const series = ms.map((m) => m.unitsBySku[it.id] ?? 0);
              const firstIdx = series.findIndex((v) => v > 0.5);
              const lastUnits = ms.filter((m) => m.fy === lastFy).reduce((a, m) => a + (m.unitsBySku[it.id] ?? 0), 0);
              return (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">{it.name}{it.isNew && <span className="ml-1.5 rounded bg-slate-100 px-1 text-xs text-slate-700">New</span>}</td>
                  <td className="px-2 text-slate-500">{firstIdx >= 0 ? monthLabel(plan.startMonth, firstIdx + 1) : '—'}</td>
                  <td className="px-2"><Spark v={series} base={r.base} /></td>
                  <td className="px-2 text-right text-slate-800">{lastUnits ? int(lastUnits) : '–'}</td>
                  <td className="pl-2 text-slate-500">{seasonOf(it.id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function Spark({ v, base }: { v: number[]; base: number }) {
  const W = 300, H = 26, max = Math.max(...v, 1);
  const bw = W / v.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[26px] w-[300px]" aria-hidden="true">
      {v.map((x, i) => <rect key={i} x={i * bw} width={Math.max(1, bw - 1)} y={H - (x / max) * H} height={(x / max) * H} fill={i >= base ? 'rgb(var(--accent-300))' : 'rgb(var(--accent-600))'} />)}
    </svg>
  );
}

// ---- Capacity & utilisation ---------------------------------------------------------------

function CapacityCard({ plan, r }: { plan: Plan; r: PlanResult }) {
  const hasCapacity = r.months.some((m) => m.capacity > 0);
  const overMonths = r.months.filter((m) => m.utilisation > 1);
  const G = plan.growth;
  const blocks = (G?.capacity ?? []).filter((b) => b.on);
  const label = (m: number) => r.months.find((x) => x.m === m)?.label ?? `M${m}`;
  return (
    <SectionCard title="Capacity use by FY" info={<><p>In-house units a month (the hCore range and in-house lines) against production capacity.</p><p>Over 100%: build stock before the peak, or add capacity earlier.</p><p>Set capacity in Setup → Capacity, sites and capex.</p></>}>
      {!hasCapacity && <p className="text-[13px] text-slate-600">No capacity set. Set it in Setup → Capacity, sites and capex.</p>}
      {hasCapacity && (
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12.5px] tabular-nums">
            <thead>
              <tr className="bg-surface-tint text-xs text-slate-600">
                <th className="px-2 py-2 text-left font-semibold">FY</th><th className="px-2 py-2 text-left font-semibold">Peak month</th>
                <th className="px-2 py-2 text-right font-semibold">Peak use</th><th className="px-2 py-2 text-right font-semibold">In-house units</th>
                <th className="px-2 py-2 text-right font-semibold">Capacity</th><th className="px-2 py-2 text-right font-semibold">Months over 100%</th>
              </tr>
            </thead>
            <tbody>
              {r.years.map((y) => {
                const ms = r.months.filter((m) => m.fy === y.fy);
                const pk = ms.reduce((a, m) => (m.utilisation > a.utilisation ? m : a), ms[0]);
                const over = ms.filter((m) => m.utilisation > 1).length;
                return (
                  <tr key={y.fy} className={`border-t border-slate-100 ${pk && pk.utilisation > 1 ? 'text-rose-600' : 'text-slate-700'}`}>
                    <td className="px-2 py-1.5 font-semibold">{y.fy}</td>
                    <td className="px-2 py-1.5">{pk?.label}</td>
                    <td className="px-2 py-1.5 text-right">{pct(pk?.utilisation ?? 0, 0)}</td>
                    <td className="px-2 py-1.5 text-right">{int(pk?.inHouseUnits ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right">{int(pk?.capacity ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right">{over || '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {overMonths.length > 0 && <p className="mt-2 text-[12px] text-rose-700">Over 100% in {overMonths.length} months, from {overMonths[0].label}.</p>}
      {G && (
        <p className="mt-2 text-[12px] text-slate-600">
          Capacity today {int(G.baseCapacity)} units / month{blocks.length ? ` · added: ${blocks.map((b) => `${b.name} +${int(b.unitsPerMonth)} from ${label(b.month + b.leadMonths)}`).join(', ')}` : ' · nothing added'}.
        </p>
      )}
    </SectionCard>
  );
}

// ---- D2C customers -----------------------------------------------------------------

function D2CCard({ plan, r }: { plan: Plan; r: PlanResult }) {
  const d = plan.d2c;
  const pred = useMemo(() => predictRepeats(d.history, d), [d]);
  const cohortsOn = d.mode === 'cohorts';
  const avgYear = (rate: number) => rate * 12; // season averages to 1
  return (
    <SectionCard
      title="D2C customers"
      info={<><p>D2C revenue = new buyers × AOV + repeat orders from earlier buyers.</p><p>In the sheet&apos;s months, new buyers come from the sheet&apos;s D2C revenue. From FY29, new buyers grow with the D2C growth lever.</p><p>Change the rates in Setup → D2C customers and seasonality.</p></>}
    >
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        <div><b className="text-slate-800">Model:</b> {cohortsOn ? 'Customers (new buyers × AOV + repeats by cohort)' : 'Units (the sheet\'s unit grid, no cohorts)'} · <b className="text-slate-800">From:</b> {d.source} · as of {d.asOf}{d.fit.r2 != null && <> · fits history at R² {d.fit.r2.toFixed(2)}</>}</div>
        <div className="mt-0.5 text-slate-600">{d.fit.note}</div>
        {cohortsOn && (
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-slate-600">
            <span>Same-month 2nd order <b>{pct(d.sameMonth, 1)}</b></span>
            <span>Next-month reorder <b>{pct(d.nextMonth, 1)}</b></span>
            <span>Months 2–11 <b>{pct(d.monthly, 2)}</b>/mo (≈ {pct(avgYear(d.monthly), 1)} a year)</span>
            <span>Year 2+ <b>{pct(d.yearly, 2)}</b>/mo (≈ {pct(avgYear(d.yearly), 1)} a year), fade <b>{d.yearlyFade.toFixed(2)}×</b></span>
            <span>Repeat boost <b>{d.repeatBoost.toFixed(2)}×</b></span>
            <span>AOV new <b>₹{int(d.aovNew)}</b> · repeat <b>₹{int(d.aovRepeat)}</b></span>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <h4 className="mb-1 text-[12px] font-semibold text-slate-700">Repeat orders: actual and model</h4>
          <HistoryChart h={d.history} pred={pred} />
        </div>
        <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
          <h4 className="mb-1 text-[12px] font-semibold text-slate-700">Plan by year</h4>
          <table className="w-full text-[12.5px] tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-600">
                <th className="py-1.5 text-left font-semibold" />
                {r.years.map((y) => <th key={y.fy} className="px-2 py-1.5 text-right font-semibold">{y.fy}{y.months < 12 ? '*' : ''}</th>)}
              </tr>
            </thead>
            <tbody>
              {([
                ['New buyers', (y) => int(y.d2cNewCustomers)],
                ['Repeat orders', (y) => int(y.d2cRepeatOrders)],
                ['Repeat share of D2C ₹', (y) => pct(y.d2cRepeatRevenue / ((y.d2cNewRevenue + y.d2cRepeatRevenue) || 1))],
                ['D2C revenue (₹ Cr)', (y) => cr(y.revenueByChannel.D)],
                ['Avg new buyers / month', (y) => int(y.d2cNewCustomers / y.months)],
              ] as [string, (y: PlanResult['years'][number]) => string][]).map(([label, f]) => (
                <tr key={label} className="border-b border-slate-100">
                  <td className="py-1 pr-2 text-slate-600">{label}</td>
                  {r.years.map((y) => <td key={y.fy} className="px-2 py-1 text-right text-slate-800">{cohortsOn ? f(y) : '–'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {cohortsOn && <BaseCheck r={r} d={d} />}
          {!cohortsOn && <p className="mt-2 text-[12px] text-slate-600">The Units model is on. D2C uses the sheet&apos;s units, so there are no buyers or repeats.</p>}
        </div>
      </div>
    </SectionCard>
  );
}

function BaseCheck({ r, d }: { r: PlanResult; d: D2CModel }) {
  // what the sheet's D2C plan asks for, vs what the store actually did last year
  const last12 = d.history.slice(-12);
  const actualPerMonth = last12.reduce((a, x) => a + x.newCustomers, 0) / (last12.length || 1);
  const fy28 = r.years.find((y) => y.fy === 'FY28');
  if (!fy28) return null;
  const need = fy28.d2cNewCustomers / fy28.months;
  return (
    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
      FY28 needs {int(need)} new buyers a month. The last 12 months had {int(actualPerMonth)} a month ({(need / (actualPerMonth || 1)).toFixed(1)}×).
    </p>
  );
}

function HistoryChart({ h, pred }: { h: D2CModel['history']; pred: number[] }) {
  const rows = h.map((x, i) => ({ ...x, pred: pred[i] })).filter((x, i, a) => i >= a.findIndex((y) => y.newCustomers > 50));
  if (!rows.length) return <p className="text-[12px] text-slate-500">No history yet.</p>;
  const W = 560, H = 170, pl = 34, pb = 20, pt = 8;
  const max = Math.max(...rows.map((x) => Math.max(x.repeatOrders, x.pred)), 1);
  const bw = (W - pl - 6) / rows.length;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Repeat orders by month, actual vs model">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - 4} y1={y(max * t)} y2={y(max * t)} className="text-slate-200" stroke="currentColor" />
          <text x={pl - 4} y={y(max * t) + 3} textAnchor="end" fontSize="9" className="fill-slate-400">{Math.round(max * t)}</text>
        </g>
      ))}
      {rows.map((x, i) => (
        <g key={x.month}>
          <rect x={pl + i * bw + bw * 0.15} width={bw * 0.7} y={y(x.repeatOrders)} height={y(0) - y(x.repeatOrders)} fill="rgb(var(--accent-300))"><title>{x.month}: {x.repeatOrders} repeat orders (model {Math.round(x.pred)})</title></rect>
          {(i % 2 === 0) && <text x={pl + i * bw + bw / 2} y={H - 6} fontSize="9" textAnchor="middle" className="fill-slate-500">{MON[Number(x.month.slice(5)) - 1]}{x.month.slice(2, 4)}</text>}
        </g>
      ))}
      <path d={rows.map((x, i) => `${i ? 'L' : 'M'}${pl + i * bw + bw / 2},${y(x.pred)}`).join(' ')} fill="none" className="text-slate-900" stroke="currentColor" strokeWidth="1.75" />
      <text x={W - 6} y={pt + 10} textAnchor="end" fontSize="10" className="fill-slate-600">Bars = actual · line = model</text>
    </svg>
  );
}

// ---- Seasonality (read-only heatmap) ---------------------------------------------------------

function SeasonCard({ plan }: { plan: Plan }) {
  const shape = plan.levers.seasonShape ?? 'plan';
  const rows: { id: string; name: string; v: number[] }[] = [
    ...plan.skus.map((s) => ({ id: s.id, name: s.name, v: plan.skuSeason[s.id] ?? Array(12).fill(1) })),
    { id: 'd2c', name: 'D2C new buyers (Shopify)', v: plan.d2c.season },
  ];
  // Oct first, the way the business sees the year
  const order = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];
  const tint = (x: number) => `rgb(var(--accent-600) / ${Math.min(0.85, Math.max(0, x / 4))})`;
  return (
    <SectionCard
      title="Seasonality"
      info={<><p>Each month against an average month (1.00 = average).</p><p>Products: last year&apos;s units, all channels. D2C: new buyers on Shopify.</p><p>From FY29 the plan {shape === 'history' ? 'uses these curves' : "uses the sheet's shape"} (Setup → Assumptions). Change the curves in Setup → D2C customers and seasonality.</p></>}
    >
      <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto">
        <table className="text-[12px] tabular-nums">
          <thead>
            <tr className="text-xs sm:text-[11px] text-slate-500">
              <th className="pr-3 text-left font-semibold">Product</th>
              {order.map((i) => <th key={i} className="w-12 px-0.5 text-center font-semibold">{MON[i]}</th>)}
              <th className="pl-3 text-right font-semibold">Peak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const peak = order.reduce((a, i) => (row.v[i] > row.v[a] ? i : a), order[0]);
              const top3 = [...order].sort((a, b) => row.v[b] - row.v[a]).slice(0, 3).reduce((a, i) => a + row.v[i], 0) / 12;
              return (
                <tr key={row.id} className={row.id === 'd2c' ? 'border-t-2 border-slate-200' : ''}>
                  <td className="whitespace-nowrap py-0.5 pr-3 text-slate-700">{row.name}</td>
                  {order.map((i) => (
                    <td key={i} className="px-0.5 py-0.5">
                      <span className={`block w-12 rounded px-1 py-1 text-center text-xs sm:text-[11.5px] font-semibold ${row.v[i] > 2 ? 'text-white' : 'text-slate-900'}`} style={{ background: tint(row.v[i]) }} title={`${row.name} ${MON[i]}`}>{row.v[i].toFixed(2)}</span>
                    </td>
                  ))}
                  <td className="whitespace-nowrap pl-3 text-right text-slate-500" title="Share of the year's units in the top 3 months">{MON[peak]} · top 3 {pct(top3, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
