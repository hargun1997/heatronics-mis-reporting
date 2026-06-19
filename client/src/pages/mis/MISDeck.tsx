import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import {
  LineChart, StackedBarChart, GrowthBarChart, DonutChart, WaterfallChart, Legend,
  inr, pctStr, pctSigned, CHANNEL_COLORS, SERIES_COLORS,
  type WaterfallStep,
} from '../../components/mis-deck/charts';
import {
  seriesFor, monthlySeries, quarterlySeries, yearlySeries,
  periodGrowth, yoyGrowth, marginsOf, channelMix, deckFacts, arrProjection,
  channelObservations, channelHHI, topChannel, channelsAbove, likeForLikeChannel,
  SALES_CHANNELS, FY_SUMMARY,
  type Granularity, type PeriodMIS,
} from '../../data/misDeck/analytics';
import { MIS_GENERATED_AT, MIS_SOURCE_FILE } from '../../data/misDeck/misDeckData';

const iconDeck = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

type TabId = 'overview' | 'growth' | 'channels' | 'profitability' | 'pnl';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'growth', label: 'Revenue & Growth' },
  { id: 'channels', label: 'Channel Mix' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'pnl', label: 'P&L' },
];

// ----------------------------------------------------------------------------

export function MISDeck() {
  const [tab, setTab] = useState<TabId>('overview');
  const facts = useMemo(() => deckFacts(), []);

  return (
    <>
      <PageHeader
        title="MIS Reporting"
        accent="brand"
        icon={iconDeck}
        description="Investor-grade financial deck — channel-mix, growth and margin trends across month, quarter and fiscal year."
        crumbs={[{ label: 'Reporting', to: '/reporting' }, { label: 'MIS Reporting' }]}
        actions={
          <span className="text-[11px] text-slate-400 hidden sm:block">
            Source: {MIS_SOURCE_FILE} · {MIS_GENERATED_AT}
          </span>
        }
      />

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

        {tab === 'overview' && <OverviewTab facts={facts} />}
        {tab === 'growth' && <GrowthTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'profitability' && <ProfitabilityTab />}
        {tab === 'pnl' && <PnlTab />}
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

// ----------------------------------------------------------------------------
// Overview
// ----------------------------------------------------------------------------

function OverviewTab({ facts }: { facts: ReturnType<typeof deckFacts> }) {
  const months = useMemo(() => monthlySeries(), []);
  const last24 = months.slice(-24);
  const m = facts.latestMargins;

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={`Net Revenue · ${facts.latest.label}`} value={inr(facts.latest.netRevenue)}
          sub={<>MoM <Delta value={facts.momRevGrowth} /> · YoY <Delta value={facts.yoyRevGrowth} /></>} tone="brand" />
        <KpiCard label="TTM Net Revenue" value={inr(facts.ttmRevenue)}
          sub={<>vs prior 12m <Delta value={facts.ttmGrowth} /></>} />
        <KpiCard label="Gross Margin" value={pctStr(m.grossMarginPct)}
          sub={`EBITDA ${pctStr(m.ebitdaPct)} · CM2 ${pctStr(m.cm2Pct)}`} tone="brand" />
        <KpiCard label={`Revenue CAGR (${facts.cagrYears}y FY)`} value={facts.revenueCagrFY !== null ? pctStr(facts.revenueCagrFY) : '–'}
          sub={`${facts.fyFirst.longLabel} → ${facts.fyLast.longLabel}`} tone="brand" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="EBITDA · latest" value={inr(facts.latest.ebitda)} tone={facts.latest.ebitda >= 0 ? 'brand' : 'slate'}
          sub={pctStr(m.ebitdaPct) + ' of revenue'} />
        <KpiCard label="Net Income · latest" value={inr(facts.latest.netIncome)} tone={facts.latest.netIncome >= 0 ? 'brand' : 'slate'}
          sub={pctStr(m.netIncomePct) + ' of revenue'} />
        <KpiCard label="Data Coverage" value={`${facts.monthsOfData} months`}
          sub={`${months[0].longLabel} → ${facts.latest.longLabel}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Net Revenue & EBITDA" description="Last 24 months" className="lg:col-span-2">
          <LineChart
            labels={last24.map((p) => p.label)}
            series={[
              { name: 'Net Revenue', color: SERIES_COLORS[0], values: last24.map((p) => p.netRevenue) },
              { name: 'EBITDA', color: SERIES_COLORS[1], values: last24.map((p) => p.ebitda) },
            ]}
          />
          <div className="mt-3"><Legend items={[
            { label: 'Net Revenue', color: SERIES_COLORS[0] },
            { label: 'EBITDA', color: SERIES_COLORS[1] },
          ]} /></div>
        </SectionCard>

        <SectionCard title="Channel Mix" description={facts.latest.longLabel}>
          <div className="flex flex-col items-center">
            <DonutChart
              data={SALES_CHANNELS.map((c) => ({ key: c, value: facts.latest.netByChannel[c] }))}
              colors={CHANNEL_COLORS}
            />
            <div className="mt-4 w-full space-y-1.5">
              {SALES_CHANNELS.filter((c) => facts.latest.netByChannel[c] > 0).map((c) => {
                const mix = channelMix(facts.latest);
                return (
                  <div key={c} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CHANNEL_COLORS[c] }} />{c}
                    </span>
                    <span className="text-slate-500">{inr(facts.latest.netByChannel[c])} · <span className="font-medium text-slate-700">{pctStr(mix[c])}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>
      </div>
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

  // Fair, like-for-like YoY comparison (same calendar frame, one year earlier)
  const lfl = useMemo(() => likeForLikeChannel(g), [g]);
  const lflMix = channelMix(lfl.current);
  const observations = useMemo(() => channelObservations(), []);

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

function ProfitabilityTab() {
  const [g, setG] = useState<Granularity>('month');
  const series = useMemo(() => seriesFor(g), [g]);
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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Margins & unit economics</h2>
        <GranularityToggle value={g} onChange={setG} />
      </div>

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

const PNL_ROWS: { label: string; key: keyof PeriodMIS; kind: 'rev' | 'cost' | 'margin' }[] = [
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

function PnlTab() {
  const [g, setG] = useState<Granularity>('year');
  const series = useMemo(() => seriesFor(g), [g]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Profit &amp; Loss statement</h2>
        <GranularityToggle value={g} onChange={setG} />
      </div>

      <SectionCard title={`P&L · ${capitalizeGran(g)}`} description="All figures in ₹. Costs shown as negatives. Column scope shown under each heading — partial periods are annotated.">
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
                      const raw = p[row.key] as number;
                      const val = row.kind === 'cost' ? -raw : raw;
                      return (
                        <td key={p.key} className={`py-2 px-3 text-right tabular-nums ${isMargin ? 'text-slate-800' : 'text-slate-600'}`}>
                          {inr(val)}
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

      <p className="text-xs text-slate-400">
        Net Revenue = external sales net of returns &amp; GST (excludes inter-branch transfers). COGM is derived so the
        Net Revenue → Net Income bridge reconciles exactly. Depreciation is generally excluded from the EBITDA/Net-income
        basis, consistent with the source MIS.
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

function capitalizeGran(g: Granularity): string {
  return g === 'month' ? 'Monthly' : g === 'quarter' ? 'Quarterly' : 'Yearly';
}
