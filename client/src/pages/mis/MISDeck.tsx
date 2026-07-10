import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import {
  LineChart, StackedBarChart, GrowthBarChart, DonutChart, WaterfallChart, Legend,
  inr, pctStr, pctSigned, CHANNEL_COLORS, SERIES_COLORS,
  type WaterfallStep,
} from '../../components/mis-deck/charts';
import {
  seriesFor, seriesForBlended, fyBlendedGMRates, monthlySeries, quarterlySeries, yearlySeries,
  periodGrowth, yoyGrowth, marginsOf, channelMix, deckFacts, arrProjection,
  channelObservations, channelHHI, topChannel, channelsAbove, likeForLikeChannel,
  ordersByChannel, channelLabel, channelPnl, adSpendForPeriod, CHANNEL_AOV,
  SALES_CHANNELS, FY_SUMMARY,
  type Granularity, type PeriodMIS, type ChannelPnlRow,
} from '../../data/misDeck/analytics';
import {
  MIS_GENERATED_AT, MIS_SOURCE_FILE, DISCOUNT_DATA, D2C_REPEATS, AMAZON_REPEATS,
} from '../../data/misDeck/misDeckData';
import { DeckExportModal } from '../../components/mis-deck/DeckExportModal';

const iconDeck = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

type TabId = 'overview' | 'growth' | 'channels' | 'repeats' | 'profitability' | 'pnl' | 'channelpnl';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'growth', label: 'Revenue & Growth' },
  { id: 'channels', label: 'Channel Mix' },
  { id: 'repeats', label: 'Repeats' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'pnl', label: 'P&L' },
  { id: 'channelpnl', label: 'Channel P&L' },
];

// ----------------------------------------------------------------------------

export function MISDeck() {
  const [tab, setTab] = useState<TabId>('overview');
  const [showExport, setShowExport] = useState(false);
  // Shared across the margin-bearing tabs so the Actual|Blended choice is consistent.
  const [blended, setBlended] = useState(true);

  return (
    <>
      <PageHeader
        title="MIS Reporting"
        accent="brand"
        icon={iconDeck}
        description="Investor-grade financial deck — channel-mix, growth and margin trends across month, quarter and fiscal year."
        crumbs={[{ label: 'Reporting', to: '/reporting' }, { label: 'MIS Reporting' }]}
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 hidden sm:block">
              Source: {MIS_SOURCE_FILE} · {MIS_GENERATED_AT}
            </span>
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
          </div>
        }
      />

      {showExport && <DeckExportModal onClose={() => setShowExport(false)} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab blended={blended} setBlended={setBlended} />}
        {tab === 'growth' && <GrowthTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'repeats' && <RepeatsTab />}
        {tab === 'profitability' && <ProfitabilityTab blended={blended} setBlended={setBlended} />}
        {tab === 'pnl' && <PnlTab blended={blended} setBlended={setBlended} />}
        {tab === 'channelpnl' && <ChannelPnlTab blended={blended} setBlended={setBlended} />}
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Shared UI
// ----------------------------------------------------------------------------

function KpiCard({ label, value, sub, tone = 'slate' }: {
  label: string; value: string; sub?: React.ReactNode;
  tone?: 'slate' | 'brand' | 'amber';
}) {
  const toneMap = {
    slate: 'text-slate-900', brand: 'text-brand-700', amber: 'text-amber-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-soft p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneMap[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// Direction is conveyed by the arrow, not by colour (no red/green).
function Delta({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null || !isFinite(value)) return <span className="text-slate-400">–</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${up ? 'text-brand-700' : 'text-slate-500'}`}>
      {up ? '▲' : '▼'} {pctSigned(value)}{suffix}
    </span>
  );
}

function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  const opts: { id: Granularity; label: string }[] = [
    { id: 'month', label: 'Monthly' },
    { id: 'quarter', label: 'Quarterly' },
    { id: 'year', label: 'Yearly' },
  ];
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === o.id ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type BlendProps = { blended: boolean; setBlended: (v: boolean) => void };

function BlendToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const opts: { id: boolean; label: string }[] = [
    { id: false, label: 'Actual' },
    { id: true, label: 'Blended' },
  ];
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
      {opts.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === o.id ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Explains the Blended view and lists the per-FY blended GM% rates. Shown when Blended is on. */
function BlendNote() {
  const note = Array.from(fyBlendedGMRates().entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fy, r]) => `${fy.replace('FY ', 'FY')} ${Math.round(r * 100)}%`)
    .join(' · ');
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-600">
      <span className="font-medium text-brand-700">Blended COGM (FY-level).</span> Actual COGM is booked on
      purchase/consumption timing, so monthly gross margin is noisy (e.g. Apr'26 19% vs May'26 84%). This view restates
      each month's COGM to its fiscal year's revenue-weighted GM% (applied in proportion to that month's revenue) and
      cascades the change through CM1–EBITDA; channel, marketing, platform &amp; opex stay as booked. Full fiscal years
      are unchanged. <span className="block mt-1 text-slate-500">Blended GM% by FY: {note}</span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Overview
// ----------------------------------------------------------------------------

function OverviewTab({ blended, setBlended }: BlendProps) {
  const [g, setG] = useState<Granularity>('month');
  const series = useMemo(() => (blended ? seriesForBlended(g) : seriesFor(g)), [g, blended]);
  const [idx, setIdx] = useState(series.length - 1);

  // Keep the selection valid (default to the latest period) whenever granularity changes.
  // (Blending never changes the period count or order, so this only needs to react to `g`.)
  useEffect(() => { setIdx(seriesFor(g).length - 1); }, [g]);
  const safeIdx = Math.min(idx, series.length - 1);
  const p = series[safeIdx];

  const m = marginsOf(p);
  const seqLabel = g === 'month' ? 'MoM' : g === 'quarter' ? 'QoQ' : 'YoY';
  const yoyOffset = g === 'month' ? 12 : g === 'quarter' ? 4 : 1;

  // Comparable-frame guard so partial periods don't produce misleading growth.
  const fairGrowth = (other?: PeriodMIS) =>
    other && other.monthsCount === p.monthsCount && other.netRevenue > 0
      ? (p.netRevenue - other.netRevenue) / other.netRevenue
      : null;
  const seqGrowth = fairGrowth(series[safeIdx - 1]);
  const yoyG = fairGrowth(series[safeIdx - yoyOffset]);

  const scope = p.monthsCount > 1 ? `${p.firstMonthShort}–${p.lastMonthShort} · ${p.monthsCount}m` : p.firstMonthShort;
  const top = topChannel(p);
  const mix = channelMix(p);

  // Trend window: last 24 months, else the whole series.
  const trend = g === 'month' ? series.slice(-24) : series;

  return (
    <div className="space-y-6">
      {/* Period controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Snapshot for a period</h2>
          <p className="text-xs text-slate-400">Pick a month, quarter or fiscal year to see its key numbers.</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <BlendToggle value={blended} onChange={setBlended} />
          <GranularityToggle value={g} onChange={setG} />
          <select
            value={safeIdx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {series.map((s, i) => (
              <option key={s.key} value={i}>{s.longLabel}</option>
            ))}
          </select>
        </div>
      </div>

      {blended && <BlendNote />}

      {/* KPI grid — all scoped to the selected period */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={`Net Revenue · ${p.label}`} value={inr(p.netRevenue)} tone="brand"
          sub={<>{seqLabel} <Delta value={seqGrowth} />{g !== 'year' && <> · YoY <Delta value={yoyG} /></>}</>} />
        <KpiCard label="Gross Margin" value={pctStr(m.grossMarginPct)} tone="brand"
          sub={`Gross profit ${inr(p.grossMargin)}`} />
        <KpiCard label="EBITDA" value={inr(p.ebitda)} tone={p.ebitda >= 0 ? 'brand' : 'slate'}
          sub={`${pctStr(m.ebitdaPct)} of revenue`} />
        <KpiCard label="Net Income" value={inr(p.netIncome)} tone={p.netIncome >= 0 ? 'brand' : 'slate'}
          sub={`${pctStr(m.netIncomePct)} of revenue`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Contribution Margin (CM2)" value={pctStr(m.cm2Pct)}
          sub={`${inr(p.cm2)} after channel & marketing`} />
        <KpiCard label="Top channel" value={top.channel} tone="amber"
          sub={`${pctStr(top.share, 0)} of net revenue`} />
        <KpiCard label="Period covers" value={g === 'month' ? '1 month' : `${p.monthsCount} months`}
          sub={scope} />
        <KpiCard label="Costs" value={inr(p.cogm + p.channelFulfillment + p.salesMarketing + p.platformCosts + p.opex)}
          sub="COGM + opex (pre-interest)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard
          title="Net Revenue & EBITDA"
          description={g === 'month' ? 'Last 24 months' : g === 'quarter' ? 'By fiscal quarter' : 'By fiscal year'}
          className="lg:col-span-2"
        >
          <LineChart
            labels={trend.map((t) => t.label)}
            series={[
              { name: 'Net Revenue', color: SERIES_COLORS[0], values: trend.map((t) => t.netRevenue) },
              { name: 'EBITDA', color: SERIES_COLORS[1], values: trend.map((t) => t.ebitda) },
            ]}
          />
          <div className="mt-3"><Legend items={[
            { label: 'Net Revenue', color: SERIES_COLORS[0] },
            { label: 'EBITDA', color: SERIES_COLORS[1] },
          ]} /></div>
        </SectionCard>

        <SectionCard title="Channel Mix" description={p.longLabel}>
          <div className="flex flex-col items-center">
            <DonutChart
              data={SALES_CHANNELS.map((c) => ({ key: c, value: p.netByChannel[c] }))}
              colors={CHANNEL_COLORS}
            />
            <div className="mt-4 w-full space-y-1.5">
              {SALES_CHANNELS.filter((c) => p.netByChannel[c] > 0).map((c) => (
                <div key={c} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CHANNEL_COLORS[c] }} />{c}
                  </span>
                  <span className="text-slate-500">{inr(p.netByChannel[c])} · <span className="font-medium text-slate-700">{pctStr(mix[c])}</span></span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <p className="text-xs text-slate-400">
        All figures are for the selected period ({p.longLabel}). {seqLabel} compares with the previous {g}; YoY compares
        with the same {g} a year earlier. Growth is only shown when the two periods cover the same number of months, so
        partial periods (e.g. a fiscal year still in progress) aren't compared unfairly.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Revenue & Growth
// ----------------------------------------------------------------------------

function ArrProjectionSection() {
  const proj = useMemo(() => arrProjection(), []);

  const labels = proj.points.map((p) => p.label);
  const splitIdx = proj.points.findIndex((p) => p.projected);
  const actualValues = proj.points.map((p) => (p.projected ? null : p.value));
  const projectedValues = proj.points.map((p, i) =>
    p.projected ? p.value : i === splitIdx - 1 ? p.value : null,
  );

  return (
    <SectionCard
      title="ARR & forward revenue projection"
      description="Blends annualised MoM (last 3 months) with YoY growth, then grows the trailing 12 months for the next 12"
    >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <KpiCard label="Forward ARR (projected)" value={inr(proj.forwardArr)} tone="brand"
          sub={`next 12 months @ ${pctSigned(proj.blendedAnnual)} blended`} />
        <KpiCard label="Current run-rate ARR" value={inr(proj.runRateArr)}
          sub={`${proj.lastMonthLabel} × 12`} />
        <KpiCard label="TTM Revenue (actual)" value={inr(proj.ttmRevenue)}
          sub="trailing 12 months" />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <KpiCard label="MoM growth · 3m (annualised)"
          value={proj.momAnnualised !== null ? pctSigned(proj.momAnnualised) : '–'} tone="amber"
          sub={proj.momGrowth3m !== null ? `${pctSigned(proj.momGrowth3m)} per month` : undefined} />
        <KpiCard label="YoY growth (TTM)"
          value={proj.yoyGrowth !== null ? pctSigned(proj.yoyGrowth) : '–'} tone="amber"
          sub="vs prior 12 months" />
        <KpiCard label="Blended annual growth"
          value={proj.blendedAnnual !== null ? pctSigned(proj.blendedAnnual) : '–'} tone="brand"
          sub="avg of MoM(annualised) & YoY" />
      </div>

      <LineChart
        labels={labels}
        series={[
          { name: 'Actual', color: SERIES_COLORS[0], values: actualValues },
          { name: 'Projected', color: SERIES_COLORS[2], values: projectedValues },
        ]}
        height={260}
      />
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <Legend items={[
          { label: 'Actual (last 12m)', color: SERIES_COLORS[0] },
          { label: 'Projected (next 12m)', color: SERIES_COLORS[2] },
        ]} />
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Illustrative projection. Blended annual growth = the average of (a) the last 3 months' geometric-mean MoM growth,
        annualised, and (b) trailing-12-month YoY growth. That single rate is applied to each of the last 12 actual months
        to project the next 12 (so seasonality is preserved); Forward ARR is the sum of those projected months. Actual
        results will vary, and the most recent months may include management estimates from the source MIS.
      </p>
    </SectionCard>
  );
}

function DiscountOverTimeSection() {
  const [basis, setBasis] = useState<'amount' | 'rate'>('amount');
  const data = DISCOUNT_DATA;

  const totalDiscount = data.reduce((s, d) => s + d.discount, 0);
  const totalSales = data.reduce((s, d) => s + d.totalSales, 0);
  const blendedRate = totalSales > 0 ? totalDiscount / totalSales : null;

  const values = data.map((d) =>
    basis === 'amount' ? d.discount : d.totalSales > 0 ? d.discount / d.totalSales : null,
  );
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <SectionCard
      title="Discount over time"
      description={`Monthly discounts from the storefront sales report · ${first.label}–${last.label} (first & last months partial)`}
      actions={
        <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
          {([['amount', '₹ Discount'], ['rate', '% of Sales']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setBasis(id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                basis === id ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard label="Total discounts" value={inr(totalDiscount)} tone="amber" sub={`over ${data.length} months`} />
        <KpiCard label="Blended discount rate" value={pctStr(blendedRate)} tone="amber" sub="discounts ÷ total sales" />
        <KpiCard label="Total sales" value={inr(totalSales)} sub="gross, per the report" />
      </div>
      <LineChart
        labels={data.map((d) => d.label)}
        series={[{ name: basis === 'amount' ? 'Discount' : 'Discount rate', color: SERIES_COLORS[2], values }]}
        percent={basis === 'rate'}
        valueFormat={basis === 'rate' ? (v) => pctStr(v) : (v) => inr(v)}
      />
      <p className="text-xs text-slate-400 mt-3">
        {basis === 'amount'
          ? 'Discount ₹ given each month (shown as a positive magnitude).'
          : 'Discount as a percentage of that month’s total sales.'}{' '}
        The report window is Jul 10, 2025 – Jul 10, 2026, so the first and last months are partial.
      </p>
    </SectionCard>
  );
}

function GrowthTab() {
  const [g, setG] = useState<Granularity>('month');
  const series = useMemo(() => seriesFor(g), [g]);
  const yoyOffset = g === 'month' ? 12 : g === 'quarter' ? 4 : 1;

  const pop = useMemo(() => periodGrowth(series, (p) => p.netRevenue), [series]);
  const yoy = useMemo(() => yoyGrowth(series, (p) => p.netRevenue, yoyOffset), [series, yoyOffset]);

  const popLabel = g === 'month' ? 'MoM' : g === 'quarter' ? 'QoQ' : 'YoY';

  return (
    <div className="space-y-6">
      <ArrProjectionSection />

      <DiscountOverTimeSection />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Revenue trajectory & growth</h2>
        <GranularityToggle value={g} onChange={setG} />
      </div>

      <SectionCard title="Net Revenue" description={`${capitalizeGran(g)} net revenue (external, net of returns & GST)`}>
        <StackedBarChart
          labels={series.map((p) => p.label)}
          keys={[...SALES_CHANNELS]}
          colors={CHANNEL_COLORS}
          data={series.map((p) => ({ ...p.netByChannel })) as any}
        />
        <div className="mt-3"><Legend items={SALES_CHANNELS.map((c) => ({ label: c, color: CHANNEL_COLORS[c] }))} /></div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title={`${popLabel} Revenue Growth`} description="Period-over-period change">
          <GrowthBarChart labels={series.map((p) => p.label)} values={pop} />
        </SectionCard>
        <SectionCard title="YoY Revenue Growth" description="Same period, prior year">
          <GrowthBarChart labels={series.map((p) => p.label)} values={yoy} />
        </SectionCard>
      </div>

      <SectionCard title={`${capitalizeGran(g)} detail`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Period</th>
                <th className="py-2 px-3 text-right font-medium">Net Revenue</th>
                <th className="py-2 px-3 text-right font-medium">{popLabel}</th>
                <th className="py-2 px-3 text-right font-medium">YoY</th>
                <th className="py-2 px-3 text-right font-medium">Gross Margin</th>
                <th className="py-2 px-3 text-right font-medium">EBITDA</th>
                <th className="py-2 pl-3 text-right font-medium">EBITDA %</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p, i) => {
                const mar = marginsOf(p);
                return (
                  <tr key={p.key} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-700">{p.longLabel}</td>
                    <td className="py-2 px-3 text-right text-slate-700">{inr(p.netRevenue)}</td>
                    <td className="py-2 px-3 text-right"><Delta value={pop[i]} /></td>
                    <td className="py-2 px-3 text-right"><Delta value={yoy[i]} /></td>
                    <td className="py-2 px-3 text-right text-slate-600">{pctStr(mar.grossMarginPct)}</td>
                    <td className="py-2 px-3 text-right text-slate-700">{inr(p.ebitda)}</td>
                    <td className="py-2 pl-3 text-right text-slate-600">{pctStr(mar.ebitdaPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Channel Mix
// ----------------------------------------------------------------------------

function ChannelsTab() {
  const [g, setG] = useState<Granularity>('quarter');
  const series = useMemo(() => seriesFor(g), [g]);

  // channel mix % per period
  const mixData = series.map((p) => {
    const mix = channelMix(p);
    return SALES_CHANNELS.reduce((acc, c) => { acc[c] = mix[c]; return acc; }, {} as Record<string, number>);
  });

  // per-channel absolute net revenue lines
  const channelLines = SALES_CHANNELS.map((c) => ({
    name: c, color: CHANNEL_COLORS[c], values: series.map((p) => p.netByChannel[c]),
  }));

  // per-channel estimated order-count lines (net revenue ÷ AOV). D2C = Shopify.
  const orderData = series.map((p) => ordersByChannel(p));
  const orderChannels = SALES_CHANNELS.filter((c) => series.some((p) => (p.netByChannel[c] || 0) > 0));
  const orderLines = orderChannels.map((c) => ({
    name: channelLabel(c), color: CHANNEL_COLORS[c], values: orderData.map((o) => o[c]),
  }));

  // Fair, like-for-like YoY comparison (same calendar frame, one year earlier)
  const lfl = useMemo(() => likeForLikeChannel(g), [g]);
  const lflMix = channelMix(lfl.current);
  const observations = useMemo(() => channelObservations(), []);

  // Channel-wise growth over time — MoM / QoQ / YoY (own basis, independent of the tab granularity).
  // Only equal-length frames are compared so partial periods don't distort the trend.
  const [growthBasis, setGrowthBasis] = useState<'MoM' | 'QoQ' | 'YoY'>('YoY');
  const growthSeries = useMemo(
    () => (growthBasis === 'QoQ' ? quarterlySeries() : monthlySeries()),
    [growthBasis],
  );
  const growthOffset = growthBasis === 'YoY' ? 12 : 1; // YoY: monthly vs 12m ago; MoM/QoQ: sequential
  const channelGrowthLines = SALES_CHANNELS.map((c) => ({
    name: c,
    color: CHANNEL_COLORS[c],
    values: growthSeries.map((p, i) => {
      const j = i - growthOffset;
      if (j < 0) return null;
      const prev = growthSeries[j];
      if (p.monthsCount !== prev.monthsCount) return null; // fair frames only
      const a = prev.netByChannel[c];
      return a > 0 ? (p.netByChannel[c] - a) / a : null;
    }),
  }));
  const hasGrowth = channelGrowthLines.some((l) => l.values.some((v) => v !== null));
  const growthDesc =
    growthBasis === 'MoM' ? 'Month-over-month growth per channel'
    : growthBasis === 'QoQ' ? 'Quarter-over-quarter growth per channel'
    : 'Year-over-year growth per channel (monthly)';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Channel mix & trends</h2>
        <GranularityToggle value={g} onChange={setG} />
      </div>

      <SectionCard title="Channel Mix %" description={`Share of net revenue by channel, ${g}`}>
        <StackedBarChart
          labels={series.map((p) => p.label)}
          keys={[...SALES_CHANNELS]}
          colors={CHANNEL_COLORS}
          data={mixData as any}
          asShare
        />
        <div className="mt-3"><Legend items={SALES_CHANNELS.map((c) => ({ label: c, color: CHANNEL_COLORS[c] }))} /></div>
      </SectionCard>

      <SectionCard title="Channel Net Revenue" description="Absolute ₹ by channel over time">
        <LineChart labels={series.map((p) => p.label)} series={channelLines} />
        <div className="mt-3"><Legend items={SALES_CHANNELS.map((c) => ({ label: c, color: CHANNEL_COLORS[c] }))} /></div>
      </SectionCard>

      <SectionCard
        title="Channel Orders (estimated)"
        description={`Order volume by channel, ${g} — estimated as each channel's net revenue ÷ its average order value`}
      >
        <LineChart
          labels={series.map((p) => p.label)}
          series={orderLines}
          valueFormat={fmtCountFull}
          yFormat={fmtCount}
        />
        <div className="mt-3">
          <Legend items={orderChannels.map((c) => ({ label: channelLabel(c), color: CHANNEL_COLORS[c] }))} />
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Orders are estimated from a fixed average order value (AOV) per channel, so each channel's order trend tracks
          its revenue trend. AOV assumed: {orderChannels.map((c) => `${channelLabel(c)} ₹${CHANNEL_AOV[c].toLocaleString('en-IN')}`).join(' · ')}.
        </p>
      </SectionCard>

      {hasGrowth && (
        <SectionCard
          title="Channel growth over time"
          description={`${growthDesc} — only equal-length frames are compared (partial periods omitted)`}
          actions={
            <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
              {(['MoM', 'QoQ', 'YoY'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setGrowthBasis(b)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    growthBasis === b ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          }
        >
          <LineChart
            labels={growthSeries.map((p) => p.label)}
            series={channelGrowthLines}
            percent
            valueFormat={(v) => pctSigned(v)}
            yFormat={(v) => `${Math.round(v * 100)}%`}
          />
          <div className="mt-3"><Legend items={SALES_CHANNELS.map((c) => ({ label: c, color: CHANNEL_COLORS[c] }))} /></div>
        </SectionCard>
      )}

      {/* Channel observations */}
      {observations.length > 0 && (
        <SectionCard title="Channel observations" description="Trend read across the full history (first quarter with data → latest quarter)">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Top channel" value={topChannel(lfl.current).channel}
              sub={pctStr(topChannel(lfl.current).share, 0) + ' of net revenue'} tone="amber" />
            <KpiCard label="Channels > 5%" value={`${channelsAbove(lfl.current)} of ${SALES_CHANNELS.length}`}
              sub="diversification" />
            <KpiCard label="Concentration (HHI)" value={`${channelHHI(lfl.current)}`}
              sub={channelHHI(lfl.current) > 3000 ? 'high' : channelHHI(lfl.current) > 1800 ? 'moderate' : 'low'} />
            <KpiCard label="Active channels" value={`${SALES_CHANNELS.filter((c) => lfl.current.netByChannel[c] > 0).length}`}
              sub="with revenue this period" />
          </div>
          <ul className="space-y-2">
            {observations.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-brand-500 mt-0.5">▸</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={`Channel growth · like-for-like ${g === 'year' ? 'FY-to-date' : g}`}
        description={`${lfl.curScope} vs ${lfl.priorScope} — ${lfl.frameNote}${lfl.priorComplete ? '' : ' (prior frame partly unavailable)'}`}
      >
        <div className="mb-3 text-sm text-slate-600">
          Total net revenue {inr(lfl.curRevenue)} vs {inr(lfl.priorRevenue)} · <Delta value={lfl.revenueGrowth} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Channel</th>
                <th className="py-2 px-3 text-right font-medium">{lfl.priorScope}</th>
                <th className="py-2 px-3 text-right font-medium">{lfl.curScope}</th>
                <th className="py-2 px-3 text-right font-medium">YoY growth</th>
                <th className="py-2 pl-3 text-right font-medium">Mix now</th>
              </tr>
            </thead>
            <tbody>
              {lfl.rows.map((r) => (
                <tr key={r.channel} className="border-b border-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-700 flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CHANNEL_COLORS[r.channel] }} />{r.channel}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-600">{inr(r.prior)}</td>
                  <td className="py-2 px-3 text-right text-slate-700">{inr(r.cur)}</td>
                  <td className="py-2 px-3 text-right"><Delta value={r.growth} /></td>
                  <td className="py-2 pl-3 text-right text-slate-600">{pctStr(lflMix[r.channel])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* FY channel mix from source summary */}
      <SectionCard title="Fiscal-year channel mix" description="From the consolidated MIS summary">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">FY</th>
                <th className="py-2 px-3 text-right font-medium">Net Rev</th>
                {SALES_CHANNELS.map((c) => <th key={c} className="py-2 px-3 text-right font-medium">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {FY_SUMMARY.filter((f) => f.netRevenue > 0).map((f) => (
                <tr key={f.name} className="border-b border-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-700">{f.name}</td>
                  <td className="py-2 px-3 text-right text-slate-700">{inr(f.netRevenue)}</td>
                  {SALES_CHANNELS.map((c) => (
                    <td key={c} className="py-2 px-3 text-right text-slate-600">{f.mix[c] ? pctStr(f.mix[c], 0) : '–'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Profitability
// ----------------------------------------------------------------------------

function ProfitabilityTab({ blended, setBlended }: BlendProps) {
  const [g, setG] = useState<Granularity>('month');
  const series = useMemo(() => (blended ? seriesForBlended(g) : seriesFor(g)), [g, blended]);
  const last = series[series.length - 1];

  const marginSeries = series.map((p) => marginsOf(p));

  const waterfall: WaterfallStep[] = last ? [
    { label: 'Net Revenue', value: last.netRevenue, type: 'total' },
    { label: 'COGM', value: -last.cogm, type: 'cost' },
    { label: 'Channel & Fulfil', value: -last.channelFulfillment, type: 'cost' },
    { label: 'Sales & Mktg', value: -last.salesMarketing, type: 'cost' },
    { label: 'Platform', value: -last.platformCosts, type: 'cost' },
    { label: 'OpEx', value: -last.opex, type: 'cost' },
    { label: 'Non-Op', value: -last.nonOperating, type: 'cost' },
    { label: 'Net Income', value: last.netIncome, type: 'total' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-700">Margins & unit economics</h2>
        <div className="flex items-center gap-2">
          <BlendToggle value={blended} onChange={setBlended} />
          <GranularityToggle value={g} onChange={setG} />
        </div>
      </div>

      {blended && <BlendNote />}

      <SectionCard title="Margin ladder over time" description="Gross margin → CM1 → CM2 → EBITDA → Net income (% of net revenue)">
        <LineChart
          labels={series.map((p) => p.label)}
          percent
          valueFormat={(v) => pctStr(v)}
          yFormat={(v) => `${Math.round(v * 100)}%`}
          series={[
            { name: 'Gross Margin', color: SERIES_COLORS[0], values: marginSeries.map((m) => m.grossMarginPct) },
            { name: 'CM1', color: SERIES_COLORS[3], values: marginSeries.map((m) => m.cm1Pct) },
            { name: 'CM2', color: SERIES_COLORS[2], values: marginSeries.map((m) => m.cm2Pct) },
            { name: 'EBITDA', color: SERIES_COLORS[1], values: marginSeries.map((m) => m.ebitdaPct) },
            { name: 'Net Income', color: SERIES_COLORS[4], values: marginSeries.map((m) => m.netIncomePct) },
          ]}
        />
        <div className="mt-3"><Legend items={[
          { label: 'Gross Margin', color: SERIES_COLORS[0] },
          { label: 'CM1', color: SERIES_COLORS[3] },
          { label: 'CM2', color: SERIES_COLORS[2] },
          { label: 'EBITDA', color: SERIES_COLORS[1] },
          { label: 'Net Income', color: SERIES_COLORS[4] },
        ]} /></div>
      </SectionCard>

      <SectionCard title={`P&L bridge · ${last?.longLabel ?? ''}`} description="From net revenue to net income">
        {last && <WaterfallChart steps={waterfall} />}
      </SectionCard>

      <SectionCard title="Cost structure (% of net revenue)" description={`${capitalizeGran(g)}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Period</th>
                {['COGM', 'Channel', 'S&M', 'Platform', 'OpEx', 'EBITDA %', 'Net %'].map((h) => (
                  <th key={h} className="py-2 px-3 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((p) => {
                const m = marginsOf(p);
                const rev = p.netRevenue || 1;
                return (
                  <tr key={p.key} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-700">{p.longLabel}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{pctStr(p.cogm / rev)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{pctStr(p.channelFulfillment / rev)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{pctStr(p.salesMarketing / rev)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{pctStr(p.platformCosts / rev)}</td>
                    <td className="py-2 px-3 text-right text-slate-600">{pctStr(p.opex / rev)}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-800">{pctStr(m.ebitdaPct)}</td>
                    <td className="py-2 px-3 text-right text-slate-700">{pctStr(m.netIncomePct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// P&L
// ----------------------------------------------------------------------------

type PnlMetricKind = 'rev' | 'cost' | 'margin';

const PNL_ROWS: { label: string; key: keyof PeriodMIS; kind: PnlMetricKind }[] = [
  { label: 'Net Revenue', key: 'netRevenue', kind: 'rev' },
  { label: '  COGM', key: 'cogm', kind: 'cost' },
  { label: 'Gross Margin', key: 'grossMargin', kind: 'margin' },
  { label: '  Channel & Fulfillment', key: 'channelFulfillment', kind: 'cost' },
  { label: 'CM1', key: 'cm1', kind: 'margin' },
  { label: '  Sales & Marketing', key: 'salesMarketing', kind: 'cost' },
  { label: 'CM2', key: 'cm2', kind: 'margin' },
  { label: '  Platform Costs', key: 'platformCosts', kind: 'cost' },
  { label: 'CM3', key: 'cm3', kind: 'margin' },
  { label: '  Operating Expenses', key: 'opex', kind: 'cost' },
  { label: 'EBITDA', key: 'ebitda', kind: 'margin' },
  { label: '  Non-Operating', key: 'nonOperating', kind: 'cost' },
  { label: 'Net Income', key: 'netIncome', kind: 'margin' },
];

// Signed display amount for a row within a period (costs shown negative, like the statement).
function pnlAmount(p: PeriodMIS, key: keyof PeriodMIS, kind: PnlMetricKind): number {
  const raw = p[key] as number;
  return kind === 'cost' ? -raw : raw;
}

// Share of the period's net revenue (fraction). Net Revenue is 100%; costs are negative.
function pnlShare(p: PeriodMIS, key: keyof PeriodMIS, kind: PnlMetricKind): number | null {
  if (!p.netRevenue) return null;
  return pnlAmount(p, key, kind) / p.netRevenue;
}

// ----------------------------------------------------------------------------
// P&L metric-trends chart (overlay any P&L lines across month/quarter/year)
// ----------------------------------------------------------------------------

// Distinct categorical hues (deliberately no red/green value signalling), one per P&L line.
const METRIC_COLORS = [
  '#4f46e5', '#94a3b8', '#0ea5e9', '#cbd5e1', '#06b6d4', '#f59e0b', '#8b5cf6',
  '#eab308', '#ec4899', '#f97316', '#6366f1', '#64748b', '#0284c7',
];

const TREND_METRICS = PNL_ROWS.map((r, i) => ({
  key: r.key,
  kind: r.kind,
  label: r.label.trim(),
  color: METRIC_COLORS[i % METRIC_COLORS.length],
}));

type MetricBasis = 'amount' | 'percent';

function BasisToggle({ value, onChange }: { value: MetricBasis; onChange: (v: MetricBasis) => void }) {
  const opts: { id: MetricBasis; label: string }[] = [
    { id: 'amount', label: '₹ Value' },
    { id: 'percent', label: '% of Revenue' },
  ];
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === o.id ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MetricTrendsSection({ blended }: { blended: boolean }) {
  const [g, setG] = useState<Granularity>('month');
  const [basis, setBasis] = useState<MetricBasis>('amount');
  const [selected, setSelected] = useState<(keyof PeriodMIS)[]>(['netRevenue', 'grossMargin', 'ebitda']);

  const series = useMemo(() => (blended ? seriesForBlended(g) : seriesFor(g)), [g, blended]);

  const toggle = (key: keyof PeriodMIS) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const chosen = TREND_METRICS.filter((m) => selected.includes(m.key));
  const chartSeries = chosen.map((m) => ({
    name: m.label,
    color: m.color,
    values: series.map((p) =>
      basis === 'percent' ? pnlShare(p, m.key, m.kind) : pnlAmount(p, m.key, m.kind),
    ),
  }));

  return (
    <SectionCard
      title="Metric trends"
      description={
        basis === 'percent'
          ? `Each selected line as a % of net revenue, by ${g}. Costs read as negative share.`
          : `Track any P&L line over time, by ${g}. Costs shown as negatives.`
      }
      actions={
        <div className="flex items-center gap-2">
          <BasisToggle value={basis} onChange={setBasis} />
          <GranularityToggle value={g} onChange={setG} />
        </div>
      }
    >
      {/* Metric picker */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TREND_METRICS.map((m) => {
          const on = selected.includes(m.key);
          return (
            <button
              key={m.key}
              onClick={() => toggle(m.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                on ? 'border-slate-300 bg-slate-50 text-slate-800' : 'border-slate-200 text-slate-400 hover:text-slate-600'
              }`}
            >
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: on ? m.color : '#cbd5e1' }} />
              {m.label}
            </button>
          );
        })}
      </div>

      {chosen.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-sm text-slate-400">
          Select one or more metrics above to plot their trend.
        </div>
      ) : (
        <>
          <LineChart
            labels={series.map((p) => p.label)}
            series={chartSeries}
            height={300}
            percent={basis === 'percent'}
            valueFormat={basis === 'percent' ? (v) => pctStr(v) : (v) => inr(v)}
          />
          <div className="mt-3">
            <Legend items={chosen.map((m) => ({ label: m.label, color: m.color }))} />
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ----------------------------------------------------------------------------

type PnlDisplay = 'amount' | 'percent' | 'both';

function PnlDisplayToggle({ value, onChange }: { value: PnlDisplay; onChange: (v: PnlDisplay) => void }) {
  const opts: { id: PnlDisplay; label: string }[] = [
    { id: 'amount', label: '₹' },
    { id: 'percent', label: '% Rev' },
    { id: 'both', label: '₹ + %' },
  ];
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === o.id ? 'bg-white text-brand-700 shadow-soft' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PnlTab({ blended, setBlended }: BlendProps) {
  const [g, setG] = useState<Granularity>('year');
  const [display, setDisplay] = useState<PnlDisplay>('both');
  const series = useMemo(() => (blended ? seriesForBlended(g) : seriesFor(g)), [g, blended]);

  const desc =
    display === 'percent'
      ? 'Each line as a % of net revenue (common-size). Costs shown as negatives; column scope under each heading.'
      : display === 'both'
        ? 'Figures in ₹ with each line’s % of net revenue beneath. Costs shown as negatives; column scope under each heading.'
        : 'All figures in ₹. Costs shown as negatives. Column scope shown under each heading — partial periods are annotated.';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-700">Profit &amp; Loss statement</h2>
        <div className="flex items-center gap-2">
          <BlendToggle value={blended} onChange={setBlended} />
          <GranularityToggle value={g} onChange={setG} />
        </div>
      </div>

      {blended && <BlendNote />}

      <SectionCard
        title={`P&L · ${capitalizeGran(g)}`}
        description={desc}
        actions={<PnlDisplayToggle value={display} onChange={setDisplay} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 text-left font-medium sticky left-0 bg-white align-bottom">Particulars</th>
                {series.map((p) => {
                  const partial = g === 'year' && p.monthsCount < 12;
                  const scope = g === 'month'
                    ? null
                    : p.monthsCount > 1
                      ? `${p.firstMonthShort}–${p.lastMonthShort}`
                      : p.firstMonthShort;
                  return (
                    <th key={p.key} className="py-2 px-3 text-right font-medium align-bottom">
                      <div className="text-slate-600 font-semibold">{p.label}</div>
                      {scope && (
                        <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                          {scope} · {p.monthsCount}m{partial ? ' (partial)' : ''}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {PNL_ROWS.map((row) => {
                const isMargin = row.kind === 'margin' || row.kind === 'rev';
                return (
                  <tr key={row.label} className={`border-b border-slate-50 ${isMargin ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                    <td className={`py-2 pr-4 text-left sticky left-0 bg-white ${row.label.startsWith('  ') ? 'pl-4' : ''}`}>{row.label.trim()}</td>
                    {series.map((p) => {
                      const val = pnlAmount(p, row.key, row.kind);
                      const share = pnlShare(p, row.key, row.kind);
                      return (
                        <td key={p.key} className={`py-2 px-3 text-right tabular-nums ${isMargin ? 'text-slate-800' : 'text-slate-600'}`}>
                          {display !== 'percent' && <div>{inr(val)}</div>}
                          {display !== 'amount' && (
                            <div className={display === 'both' ? 'text-[10px] font-normal text-slate-400 mt-0.5' : ''}>
                              {pctStr(share)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <MetricTrendsSection blended={blended} />

      <p className="text-xs text-slate-400">
        Net Revenue = external sales net of returns &amp; GST (excludes inter-branch transfers). COGM is derived so the
        Net Revenue → Net Income bridge reconciles exactly. Depreciation is generally excluded from the EBITDA/Net-income
        basis, consistent with the source MIS. Percentages are each line’s share of that period’s net revenue.
      </p>
      <p className="text-xs text-slate-400">
        <span className="font-medium text-slate-500">FY 2025-26 restated:</span> tied to the company's provisional P&amp;L
        as on 31-03-2026 — COGM ₹2.35 Cr (gross margin 59.7%), EBITDA ≈ −₹0.97 L (breakeven), with depreciation
        (₹12.91 L) and interest (₹9.00 L) below EBITDA for a net loss of −₹22.88 L. The Jan–Mar 2026 months were smoothed
        to remove the volatile actual-consumption COGM that had overstated full-year cost of goods.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Channel P&L (shared costs allocated by net-revenue share)
// ----------------------------------------------------------------------------

function ChannelPnlTab({ blended, setBlended }: BlendProps) {
  const [g, setG] = useState<Granularity>('year');
  const series = useMemo(() => (blended ? seriesForBlended(g) : seriesFor(g)), [g, blended]);
  const [idx, setIdx] = useState(series.length - 1);
  useEffect(() => { setIdx(seriesFor(g).length - 1); }, [g]);
  const safeIdx = Math.min(idx, series.length - 1);
  const p = series[safeIdx];

  const marketing = adSpendForPeriod(g, p);
  const blinkitLeftover = p.salesMarketing - marketing.d2c - marketing.amazon;
  const rows = channelPnl(p, marketing);
  const byCh = new Map(rows.map((r) => [r.channel, r]));
  // Show a channel if it has revenue or carries attributed marketing (so Blinkit's
  // leftover S&M is visible and the columns still reconcile to the Total).
  const activeChannels = SALES_CHANNELS.filter(
    (c) => (p.netByChannel[c] || 0) > 0 || Math.abs(byCh.get(c)!.salesMarketing) > 0.5,
  );
  const shareOf = (c: SalesChannelKey) => (p.netRevenue ? Math.max(0, p.netByChannel[c] || 0) / p.netRevenue : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Channel-level P&amp;L</h2>
          <p className="text-xs text-slate-400">Marketing follows actual ad spend; other shared costs split by net revenue.</p>
        </div>
        <div className="flex items-center gap-2">
          <BlendToggle value={blended} onChange={setBlended} />
          <GranularityToggle value={g} onChange={setG} />
          <select
            value={safeIdx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {series.map((s, i) => (
              <option key={s.key} value={i}>{s.longLabel}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-slate-600">
        <span className="font-medium text-amber-700">Marketing by ad spend; other costs allocated.</span> Sales &amp;
        Marketing is attributed to channels from the actual ad-spend feeds — <span className="font-medium">Shopify</span> =
        Meta + Google, <span className="font-medium">Amazon</span> = Amazon Ads, and the leftover booked S&amp;M goes to
        <span className="font-medium"> Blinkit</span>. COGM, platform, opex &amp; non-operating remain company totals split
        by each channel's net revenue. All lines still reconcile to the company total.
        {blinkitLeftover < 0 && (
          <span className="block mt-1 text-amber-700">
            Note: in {p.longLabel}, reported ad spend (Shopify + Amazon = {inr(marketing.d2c + marketing.amazon)}) exceeds
            booked S&amp;M ({inr(p.salesMarketing)}), so Blinkit's leftover is negative ({inr(-blinkitLeftover)} over-spend)
            — a timing/booking difference between the ad platforms and the accounts.
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Shopify ad spend" value={inr(marketing.d2c)} tone="brand" sub="Meta + Google" />
        <KpiCard label="Amazon ad spend" value={inr(marketing.amazon)} tone="amber" sub="Amazon Ads" />
        <KpiCard label="Blinkit (leftover S&M)" value={inr(blinkitLeftover)}
          sub={`booked S&M ${inr(p.salesMarketing)} − ads`} />
      </div>

      {blended && <BlendNote />}

      <SectionCard
        title={`Channel P&L · ${p.longLabel}`}
        description="All figures in ₹. Costs shown as negatives. Sales & Marketing follows ad spend (Shopify/Amazon/Blinkit); other costs by net-revenue share."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 text-left font-medium sticky left-0 bg-white align-bottom">Particulars</th>
                {activeChannels.map((c) => (
                  <th key={c} className="py-2 px-3 text-right font-medium align-bottom">
                    <div className="text-slate-600 font-semibold">{channelLabel(c)}</div>
                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">{pctStr(shareOf(c), 0)} of rev</div>
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-medium align-bottom text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {PNL_ROWS.map((row) => {
                const isMargin = row.kind === 'margin' || row.kind === 'rev';
                return (
                  <tr key={row.label} className={`border-b border-slate-50 ${isMargin ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                    <td className={`py-2 pr-4 text-left sticky left-0 bg-white ${row.label.startsWith('  ') ? 'pl-4' : ''}`}>{row.label.trim()}</td>
                    {activeChannels.map((c) => {
                      const r = byCh.get(c)!;
                      const raw = r[row.key as keyof ChannelPnlRow] as number;
                      const val = row.kind === 'cost' ? -raw : raw;
                      return (
                        <td key={c} className={`py-2 px-3 text-right tabular-nums ${isMargin ? 'text-slate-800' : 'text-slate-600'}`}>
                          {inr(val)}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right tabular-nums font-medium text-slate-800">
                      {inr(pnlAmount(p, row.key, row.kind))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Repeats (repeat-purchase behaviour — Shopify/D2C + Amazon feeds)
// ----------------------------------------------------------------------------

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function repeatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]} '${String((y || 0) % 100).padStart(2, '0')}`;
}

const D2C_COLOR = CHANNEL_COLORS.D2C;      // indigo — Shopify
const AMZ_COLOR = CHANNEL_COLORS.Amazon;   // amber — Amazon
const fmt2 = (v: number) => v.toFixed(2);

function RepeatsTab() {
  const d2cLast = D2C_REPEATS[D2C_REPEATS.length - 1];
  const amzLast = AMAZON_REPEATS[AMAZON_REPEATS.length - 1];

  // Shared timeline for the cross-channel comparison.
  const allKeys = [...new Set([...D2C_REPEATS.map((r) => r.key), ...AMAZON_REPEATS.map((r) => r.key)])].sort();
  const cmpLabels = allKeys.map(repeatMonthLabel);
  const d2cByKey = new Map(D2C_REPEATS.map((r) => [r.key, r]));
  const amzByKey = new Map(AMAZON_REPEATS.map((r) => [r.key, r]));
  const cmpSeries = [
    { name: 'Shopify (D2C)', color: D2C_COLOR, values: allKeys.map((k) => d2cByKey.get(k)?.repeatRate ?? null) },
    { name: 'Amazon', color: AMZ_COLOR, values: allKeys.map((k) => amzByKey.get(k)?.repeatCustomerShare ?? null) },
  ];

  const d2cLabels = D2C_REPEATS.map((r) => repeatMonthLabel(r.key));
  const amzLabels = AMAZON_REPEATS.map((r) => repeatMonthLabel(r.key));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Repeat purchases</h2>
        <p className="text-xs text-slate-400">Shopify (D2C) and Amazon each from their own repeat-purchase feed.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={`Shopify repeat rate · ${repeatMonthLabel(d2cLast.key)}`} value={pctStr(d2cLast.repeatRate)} tone="brand"
          sub="of the month's cohort" />
        <KpiCard label={`Amazon repeat rate · ${repeatMonthLabel(amzLast.key)}`} value={pctStr(amzLast.repeatCustomerShare)} tone="amber"
          sub="of active customers" />
        <KpiCard label="Shopify purchase frequency" value={fmt2(d2cLast.freq)}
          sub={`orders/buyer · ${repeatMonthLabel(d2cLast.key)}`} />
        <KpiCard label="Amazon repeat sales share" value={pctStr(amzLast.repeatSalesShare)}
          sub={`of total sales · ${repeatMonthLabel(amzLast.key)}`} />
      </div>

      <SectionCard
        title="Repeat rate — Shopify vs Amazon"
        description="Share of customers who are repeat buyers, per channel, month by month"
      >
        <LineChart labels={cmpLabels} series={cmpSeries} percent valueFormat={(v) => pctStr(v)} height={280} />
        <div className="mt-3">
          <Legend items={[{ label: 'Shopify (D2C)', color: D2C_COLOR }, { label: 'Amazon', color: AMZ_COLOR }]} />
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Definitions differ slightly by source: Shopify's rate is the share of a month's <span className="font-medium">new
          cohort</span> that later reordered (so recent months read low — less elapsed time), while Amazon's is the share of
          that month's <span className="font-medium">active customers</span> who were repeat buyers. Compare trends, not exact levels.
        </p>
      </SectionCard>

      {/* Shopify / D2C detail */}
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: D2C_COLOR }} />
        <h3 className="text-sm font-semibold text-slate-700">Shopify (D2C)</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Repeat rate" description="Share of each month's cohort that reordered">
          <LineChart labels={d2cLabels} series={[{ name: 'Repeat rate', color: D2C_COLOR, values: D2C_REPEATS.map((r) => r.repeatRate) }]}
            percent valueFormat={(v) => pctStr(v)} />
        </SectionCard>
        <SectionCard title="Purchase frequency" description="Orders per buyer">
          <LineChart labels={d2cLabels} series={[{ name: 'Frequency', color: SERIES_COLORS[1], values: D2C_REPEATS.map((r) => r.freq) }]}
            valueFormat={fmt2} yFormat={fmt2} />
        </SectionCard>
      </div>
      <SectionCard title="Products & units per customer" description="Average distinct products and units in a customer's basket">
        <LineChart
          labels={d2cLabels}
          series={[
            { name: 'Avg products/customer', color: SERIES_COLORS[0], values: D2C_REPEATS.map((r) => r.avgProducts) },
            { name: 'Avg units/customer', color: SERIES_COLORS[2], values: D2C_REPEATS.map((r) => r.avgUnits) },
          ]}
          valueFormat={fmt2}
          yFormat={fmt2}
        />
        <div className="mt-3">
          <Legend items={[{ label: 'Avg products/customer', color: SERIES_COLORS[0] }, { label: 'Avg units/customer', color: SERIES_COLORS[2] }]} />
        </div>
      </SectionCard>
      <SectionCard title="Shopify monthly detail" description="Buyers, orders, AOV, frequency & repeat rate (Aug '25 & May '26 partial)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Month</th>
                <th className="py-2 px-3 text-right font-medium">Buyers</th>
                <th className="py-2 px-3 text-right font-medium">Orders</th>
                <th className="py-2 px-3 text-right font-medium">AOV</th>
                <th className="py-2 px-3 text-right font-medium">Freq</th>
                <th className="py-2 px-3 text-right font-medium">Repeat %</th>
                <th className="py-2 pl-3 text-right font-medium">Avg products</th>
              </tr>
            </thead>
            <tbody>
              {D2C_REPEATS.map((r) => (
                <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-700">{repeatMonthLabel(r.key)}{r.partial ? ' *' : ''}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{fmtCountFull(r.buyers)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{fmtCountFull(r.orders)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{inr(r.aov)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{fmt2(r.freq)}</td>
                  <td className="py-2 px-3 text-right font-medium text-slate-800">{pctStr(r.repeatRate)}</td>
                  <td className="py-2 pl-3 text-right text-slate-600">{fmt2(r.avgProducts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Amazon detail */}
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: AMZ_COLOR }} />
        <h3 className="text-sm font-semibold text-slate-700">Amazon</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Repeat customer share" description="Repeat customers ÷ total customers, per month">
          <LineChart labels={amzLabels} series={[{ name: 'Repeat customer share', color: AMZ_COLOR, values: AMAZON_REPEATS.map((r) => r.repeatCustomerShare) }]}
            percent valueFormat={(v) => pctStr(v)} />
        </SectionCard>
        <SectionCard title="Repeat order sales" description="₹ sales from repeat orders (with % of total sales)">
          <LineChart labels={amzLabels} series={[{ name: 'Repeat sales', color: SERIES_COLORS[3], values: AMAZON_REPEATS.map((r) => r.repeatSales) }]} />
        </SectionCard>
      </div>
      <SectionCard title="Amazon monthly detail" description="Orders, customers & repeat metrics (Jun '26 partial)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-4 font-medium">Month</th>
                <th className="py-2 px-3 text-right font-medium">Orders</th>
                <th className="py-2 px-3 text-right font-medium">Customers</th>
                <th className="py-2 px-3 text-right font-medium">Repeat cust.</th>
                <th className="py-2 px-3 text-right font-medium">Repeat cust. %</th>
                <th className="py-2 px-3 text-right font-medium">Repeat sales</th>
                <th className="py-2 pl-3 text-right font-medium">Repeat sales %</th>
              </tr>
            </thead>
            <tbody>
              {AMAZON_REPEATS.map((r) => (
                <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-medium text-slate-700">{repeatMonthLabel(r.key)}{r.partial ? ' *' : ''}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{fmtCountFull(r.orders)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{fmtCountFull(r.customers)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{fmtCountFull(r.repeatCustomers)}</td>
                  <td className="py-2 px-3 text-right font-medium text-slate-800">{pctStr(r.repeatCustomerShare)}</td>
                  <td className="py-2 px-3 text-right text-slate-600">{inr(r.repeatSales)}</td>
                  <td className="py-2 pl-3 text-right text-slate-600">{pctStr(r.repeatSalesShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ----------------------------------------------------------------------------

type SalesChannelKey = (typeof SALES_CHANNELS)[number];

/** Compact order-count formatter for axis ticks (e.g. 1.2k). */
function fmtCount(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

/** Full order-count formatter for tooltips (e.g. 1,234). */
function fmtCountFull(v: number): string {
  return Math.round(v).toLocaleString('en-IN');
}

function capitalizeGran(g: Granularity): string {
  return g === 'month' ? 'Monthly' : g === 'quarter' ? 'Quarterly' : 'Yearly';
}
