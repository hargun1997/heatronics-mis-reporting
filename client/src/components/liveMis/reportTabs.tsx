// ----------------------------------------------------------------------------
// Live MIS report tabs that the legacy deck had and Live lacked: Revenue &
// Growth, Channel Mix, Profitability and Repeats. Each runs the legacy deck's
// own math (analytics.ts) over the live periods via liveViews.toPeriodMIS, and
// respects completeness: a line that isn't real for a period is left out
// (null point / "—"), never shown as 0.
// ----------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { KpiTile } from '../ui';
import {
  inr, pctStr, pctSigned, LineChart, StackedBarChart, GrowthBarChart, WaterfallChart, Legend,
  SERIES_COLORS, CHANNEL_COLORS, type WaterfallStep,
} from '../mis-deck/charts';
import { SALES_CHANNELS, DISCOUNT_DATA, D2C_REPEATS, AMAZON_REPEATS, type MonthlyMIS, type SalesChannel } from '../../data/misDeck/misDeckData';
import type { PeriodAgg, Granularity } from '../../data/misDeck/liveAnalytics';
import { REAL_ROWS, toPeriodMIS, liveLikeForLike, shortKey } from '../../data/misDeck/liveViews';
import {
  arrProjection, channelMix, channelHHI, topChannel, channelsAbove, channelObservations, CHANNEL_AOV,
} from '../../data/misDeck/analytics';
import { Fold, Pills, BlendToggle, BlendNote, Delta, fairGrowth, Note, TableBox, useLiveView } from './shared';
import { yearAgoOf, scopeLine } from './deckTabs';

const real = (p: PeriodAgg, row: string) => REAL_ROWS[p.level].has(row);
const GRAN_TITLE: Record<Granularity, string> = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
const fmtCount = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);
const fmtCountFull = (v: number) => Math.round(v).toLocaleString('en-IN');

/** Channels with any revenue across the periods, in the canonical order. */
function channelsIn(periods: PeriodAgg[]): SalesChannel[] {
  return SALES_CHANNELS.filter((c) => periods.some((p) => (p.netByChannel[c] ?? 0) !== 0));
}

// ============================================================================
// Revenue & Growth
// ============================================================================

export function RevenueGrowthTab({ monthly, periods, allPeriods, gran, completeThrough }: {
  monthly: PeriodAgg[]; periods: PeriodAgg[]; allPeriods: PeriodAgg[]; gran: Granularity; completeThrough: string | null;
}) {
  return (
    <div className="space-y-4">
      <ArrSection monthly={monthly} completeThrough={completeThrough} />
      <DiscountSection />
      <TrajectorySection periods={periods} allPeriods={allPeriods} gran={gran} />
    </div>
  );
}

function ArrSection({ monthly, completeThrough }: { monthly: PeriodAgg[]; completeThrough: string | null }) {
  // Anchor on complete months only: a partial latest month would understate the run-rate.
  const eligible = useMemo(() => monthly.filter((p) => completeThrough && p.members[0] <= completeThrough), [monthly, completeThrough]);
  const proj = useMemo(() => (eligible.length >= 2 ? arrProjection(eligible.map(toPeriodMIS)) : null), [eligible]);
  if (!proj) {
    return (
      <Fold id="rg-arr" title="ARR & forward revenue projection">
        <p className="text-sm text-slate-400 py-4 text-center">Needs at least two fully closed months.</p>
      </Fold>
    );
  }
  const split = proj.points.findIndex((p) => p.projected);
  const actual = proj.points.map((p) => (p.projected ? null : p.value));
  const projected = proj.points.map((p, i) => (p.projected ? p.value : i === split - 1 ? p.value : null));
  return (
    <Fold id="rg-arr" title="ARR & forward revenue projection"
      meta={`Blends annualised MoM (last 3 months) with YoY, then grows the trailing 12 months · anchored on ${proj.lastMonthLabel} (latest fully closed month)`}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        <KpiTile label="Forward ARR (projected)" value={inr(proj.forwardArr)} sub={`next 12 months @ ${pctSigned(proj.blendedAnnual)} blended`} />
        <KpiTile label="Run-rate ARR" value={inr(proj.runRateArr)} sub={`${proj.lastMonthLabel} × 12`} />
        <KpiTile label="TTM revenue (actual)" value={inr(proj.ttmRevenue)} sub="trailing 12 months" />
        <KpiTile label="MoM growth · 3m" value={proj.momGrowth3m !== null ? `${pctSigned(proj.momGrowth3m)}/mo` : '–'}
          sub={proj.momAnnualised !== null ? `${pctSigned(proj.momAnnualised)} annualised` : undefined} />
        <KpiTile label="YoY growth (TTM)" value={proj.yoyGrowth !== null ? pctSigned(proj.yoyGrowth) : '–'} sub="vs prior 12 months" />
        <KpiTile label="Blended annual growth" value={proj.blendedAnnual !== null ? pctSigned(proj.blendedAnnual) : '–'} sub="avg of MoM (annualised) & YoY" />
      </div>
      <LineChart labels={proj.points.map((p) => p.label)} height={250}
        series={[{ name: 'Actual', color: SERIES_COLORS[0], values: actual }, { name: 'Projected', color: SERIES_COLORS[2], values: projected }]} />
      <div className="mt-2"><Legend items={[{ label: 'Actual (last 12m)', color: SERIES_COLORS[0] }, { label: 'Projected (next 12m)', color: SERIES_COLORS[2] }]} /></div>
      <Note>
        Illustrative projection. Blended annual growth = the average of (a) the last 3 months’ geometric-mean MoM growth,
        annualised, and (b) trailing-12-month YoY growth. That single rate is applied to each of the last 12 actual months to
        project the next 12 (seasonality preserved); Forward ARR is the sum of those projected months. Only fully closed months
        (through {proj.lastMonthLabel}) are used.
      </Note>
    </Fold>
  );
}

function DiscountSection() {
  const [basis, setBasis] = useState<'amount' | 'rate'>('amount');
  const data = DISCOUNT_DATA;
  const totalDiscount = data.reduce((s, d) => s + d.discount, 0);
  const totalSales = data.reduce((s, d) => s + d.totalSales, 0);
  const rate = totalSales > 0 ? totalDiscount / totalSales : null;
  const values = data.map((d) => (basis === 'amount' ? d.discount : d.totalSales > 0 ? d.discount / d.totalSales : null));
  const first = data[0], last = data[data.length - 1];
  return (
    <Fold id="rg-discount" secondary title="Discount over time"
      meta={`Storefront sales report · ${first.label}–${last.label} · static feed through ${last.label}`}
      actions={<Pills label="Discount basis" value={basis} onChange={setBasis} options={[{ id: 'amount', label: '₹ Discount' }, { id: 'rate', label: '% of Sales' }]} />}>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <KpiTile label="Total discounts" value={inr(totalDiscount)} sub={`over ${data.length} months`} />
        <KpiTile label="Blended rate" value={pctStr(rate)} sub="discounts ÷ total sales" />
        <KpiTile label="Total sales" value={inr(totalSales)} sub="gross, per the report" />
      </div>
      <LineChart labels={data.map((d) => d.label)} series={[{ name: basis === 'amount' ? 'Discount' : 'Discount rate', color: SERIES_COLORS[2], values }]}
        percent={basis === 'rate'} yFormat={basis === 'rate' ? (v) => `${(v * 100).toFixed(0)}%` : undefined}
        valueFormat={basis === 'rate' ? (v) => pctStr(v) : (v) => inr(v)} />
      <Note>
        {basis === 'amount' ? 'Discount ₹ given each month (positive magnitude).' : 'Discount as a % of that month’s total sales.'}{' '}
        The report window is Jul 10, 2025 – Jul 10, 2026, so the first and last months are partial. Live Shopify discount facts
        aren’t ingested yet — this is the published storefront feed.
      </Note>
    </Fold>
  );
}

function TrajectorySection({ periods, allPeriods, gran }: { periods: PeriodAgg[]; allPeriods: PeriodAgg[]; gran: Granularity }) {
  const { chName, chColor } = useLiveView();
  const popLabel = gran === 'month' ? 'MoM' : gran === 'quarter' ? 'QoQ' : 'YoY';
  const chans = channelsIn(periods);
  const keys = chans.map((c) => chName(c));
  const colors = Object.fromEntries(chans.map((c) => [chName(c), chColor(c)]));
  const data = periods.map((p) => Object.fromEntries(chans.map((c) => [chName(c), p.netByChannel[c] ?? 0])));
  const idxAll = (p: PeriodAgg) => allPeriods.findIndex((x) => x.key === p.key);
  const pop = periods.map((p) => {
    const i = idxAll(p);
    const prev = i > 0 ? allPeriods[i - 1] : null;
    return fairGrowth({ v: p.netRevenue, n: p.members.length }, prev ? { v: prev.netRevenue, n: prev.members.length } : null);
  });
  const yoy = periods.map((p) => {
    const y = yearAgoOf(p, allPeriods);
    return fairGrowth({ v: p.netRevenue, n: p.members.length }, y ? { v: y.netRevenue, n: y.members.length } : null);
  });
  const labels = periods.map((p) => p.label);
  return (
    <>
      <Fold id="rg-stack" title="Revenue trajectory" meta={`${scopeLine(periods, gran)} · net revenue by channel (net of returns & GST)`}>
        <StackedBarChart labels={labels} keys={keys} colors={colors} data={data} />
        <div className="mt-2"><Legend items={keys.map((k) => ({ label: k, color: colors[k] }))} /></div>
      </Fold>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Fold id="rg-pop" secondary title={`${popLabel} revenue growth`} meta="Period-over-period, equal-length frames only">
          <GrowthBarChart labels={labels} values={pop} />
        </Fold>
        <Fold id="rg-yoy" secondary title="YoY revenue growth" meta="Same period, prior year, equal-length frames only">
          <GrowthBarChart labels={labels} values={yoy} />
        </Fold>
      </div>
      <Fold id="rg-detail" title={`${GRAN_TITLE[gran]} detail`}>
        <TableBox>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 border-b border-slate-200">
                <th className="py-1.5 pr-3 font-medium sticky left-0 bg-white">Period</th>
                <th className="py-1.5 px-2 text-right font-medium">Net Revenue</th>
                <th className="py-1.5 px-2 text-right font-medium">{popLabel}</th>
                <th className="py-1.5 px-2 text-right font-medium">YoY</th>
                <th className="py-1.5 px-2 text-right font-medium">Gross Margin</th>
                <th className="py-1.5 px-2 text-right font-medium">EBITDA</th>
                <th className="py-1.5 pl-2 text-right font-medium">EBITDA %</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p, i) => (
                <tr key={p.key} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 font-medium text-slate-700 sticky left-0 bg-white">{p.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">{inr(p.netRevenue)}</td>
                  <td className="py-1.5 px-2 text-right"><Delta value={pop[i]} /></td>
                  <td className="py-1.5 px-2 text-right"><Delta value={yoy[i]} /></td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{real(p, 'gross_margin') && p.netRevenue ? pctStr(p.grossMargin / p.netRevenue) : '—'}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">{real(p, 'ebitda') ? inr(p.ebitda) : '—'}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-slate-600">{real(p, 'ebitda') && p.netRevenue ? pctStr(p.ebitda / p.netRevenue) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
        <Note>Growth is shown only where both periods cover the same number of months.</Note>
      </Fold>
    </>
  );
}

// ============================================================================
// Channel Mix
// ============================================================================

export function ChannelMixTab({ period, periods, months, monthly, quarterly, yearly, gran }: {
  period: PeriodAgg; periods: PeriodAgg[]; months: MonthlyMIS[];
  monthly: PeriodAgg[]; quarterly: PeriodAgg[]; yearly: PeriodAgg[]; gran: Granularity;
}) {
  const { chName, chColor, merged } = useLiveView();
  const chans = channelsIn(periods);
  const names = chans.map(chName);
  const colors = Object.fromEntries(chans.map((c) => [chName(c), chColor(c)]));
  const labels = periods.map((p) => p.label);
  const mixData = periods.map((p) => {
    const mix = channelMix(toPeriodMIS(p));
    return Object.fromEntries(chans.map((c) => [chName(c), mix[c]]));
  });
  const revLines = chans.map((c) => ({ name: chName(c), color: chColor(c), values: periods.map((p) => p.netByChannel[c] ?? 0) }));

  // Orders: actual where every member month carries connector order counts, else net revenue ÷ AOV.
  const orderRows = periods.map((p) => {
    const actual = p.ordersMonths > 0 && p.ordersMonths === p.members.length;
    // Estimates are priced per SOURCE channel (OEM ₹325 even when shown as B2B (OEM)).
    return { actual, v: Object.fromEntries(chans.map((c) => [c, actual ? (p.ordersByChannel[c] ?? 0) : (p.estOrdersByChannel[c] ?? 0)])) as Record<string, number> };
  });
  const anyActual = orderRows.some((r) => r.actual);
  // AOVs actually applied: the SOURCE channels behind the shown periods.
  const aovChans = SALES_CHANNELS.filter((c) => periods.some((p) => {
    const raw = months.filter((m) => p.members.includes(m.key)).reduce((s, m) => s + ((m.rawNetByChannel ?? m.netByChannel)[c] ?? 0), 0);
    return raw > 0;
  }));
  const orderLines = chans.map((c) => ({ name: chName(c), color: chColor(c), values: orderRows.map((r) => r.v[c] ?? 0) }));

  // Channel growth over time — own MoM / QoQ / YoY basis, equal frames only.
  const [gb, setGb] = useState<'MoM' | 'QoQ' | 'YoY'>('YoY');
  const gSeries = gb === 'QoQ' ? quarterly : monthly;
  const gOff = gb === 'YoY' ? 12 : 1;
  const gChans = channelsIn(gSeries);
  const growthLines = gChans.map((c) => ({
    name: chName(c), color: chColor(c),
    values: gSeries.map((p, i) => {
      const j = i - gOff;
      if (j < 0) return null;
      const prev = gSeries[j];
      if (prev.members.length !== p.members.length) return null;
      const a = prev.netByChannel[c] ?? 0;
      return a > 0 ? ((p.netByChannel[c] ?? 0) - a) / a : null;
    }),
  }));

  const pm = toPeriodMIS(period);
  const top = topChannel(pm);
  const hhi = channelHHI(pm);
  const obs = useMemo(() => channelObservations(quarterly.map(toPeriodMIS))
    .map((t) => t.replace(/\bB2B\b/g, chName('B2B')).replace(/\bGT\b/g, chName('GT'))), [quarterly, chName]);
  const lfl = useMemo(() => liveLikeForLike(period, months), [period, months]);
  const fyChans = channelsIn(yearly);

  return (
    <div className="space-y-4">
      <Fold id="cm-mix" title="Channel mix %" meta={`${scopeLine(periods, gran)} · share of net revenue`}>
        <StackedBarChart labels={labels} keys={names} colors={colors} data={mixData} asShare />
        <div className="mt-2"><Legend items={names.map((n) => ({ label: n, color: colors[n] }))} /></div>
      </Fold>
      <Fold id="cm-rev" title="Channel net revenue" meta="Absolute ₹ by channel over time">
        <LineChart labels={labels} series={revLines} />
        <div className="mt-2"><Legend items={names.map((n) => ({ label: n, color: colors[n] }))} /></div>
      </Fold>
      <Fold id="cm-orders" secondary title={`Channel orders${anyActual ? '' : ' (estimated)'}`}
        meta={anyActual ? 'Actual connector order counts where every month in the period reports them; estimated (revenue ÷ AOV) elsewhere' : 'Estimated as each channel’s net revenue ÷ its average order value'}>
        <LineChart labels={labels} series={orderLines} valueFormat={fmtCountFull} yFormat={fmtCount} />
        <div className="mt-2"><Legend items={names.map((n) => ({ label: n, color: colors[n] }))} /></div>
        <Note>
          {anyActual && <>Periods with actual orders: {periods.filter((_, i) => orderRows[i].actual).map((p) => p.label).join(', ')}. </>}
          Estimates use a fixed AOV per channel, so an estimated trend tracks revenue. AOV assumed:{' '}
          {aovChans.map((c) => `${c} ₹${CHANNEL_AOV[c].toLocaleString('en-IN')}`).join(' · ')} (D2C = Shopify storefront).
          {merged && aovChans.some((c) => c === 'OEM' || c === 'Offline') && ' OEM / Offline history keeps its own AOV inside B2B (OEM) / GT (Offline).'}
        </Note>
      </Fold>
      <Fold id="cm-growth" secondary title="Channel growth over time"
        meta={`${gb === 'MoM' ? 'Month-over-month' : gb === 'QoQ' ? 'Quarter-over-quarter' : 'Year-over-year (monthly)'} growth per channel — equal-length frames only`}
        actions={<Pills label="Growth basis" value={gb} onChange={setGb} options={[{ id: 'MoM', label: 'MoM' }, { id: 'QoQ', label: 'QoQ' }, { id: 'YoY', label: 'YoY' }]} />}>
        <LineChart labels={gSeries.map((p) => p.label)} series={growthLines} percent valueFormat={(v) => pctSigned(v)} yFormat={(v) => `${Math.round(v * 100)}%`} />
        <div className="mt-2"><Legend items={gChans.map((c) => ({ label: chName(c), color: chColor(c) }))} /></div>
      </Fold>
      <Fold id="cm-obs" title="Channel observations" meta={`KPIs for ${period.label}; bullets read the full history (first → latest quarter)`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <KpiTile label="Top channel" value={chName(top.channel)} sub={`${pctStr(top.share, 0)} of net revenue`} />
          <KpiTile label="Channels > 5%" value={`${channelsAbove(pm)} of ${channelsIn([period]).length}`} sub="diversification" />
          <KpiTile label="Concentration (HHI)" value={`${hhi}`} sub={hhi > 3000 ? 'high' : hhi > 1800 ? 'moderate' : 'low'} />
          <KpiTile label="Active channels" value={`${SALES_CHANNELS.filter((c) => (period.netByChannel[c] ?? 0) > 0).length}`} sub="with revenue this period" />
        </div>
        <ul className="space-y-1.5">
          {obs.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="text-brand-500">▸</span><span>{t}</span></li>)}
        </ul>
      </Fold>
      <Fold id="cm-lfl" title={`Channel growth · like-for-like ${gran === 'year' ? 'FY-to-date' : gran}`}
        meta={`${lfl.curScope} vs ${lfl.priorScope} — same calendar months a year earlier${lfl.priorComplete ? '' : ' (prior frame partly unavailable)'}`}>
        <p className="mb-2 text-sm text-slate-600">Total net revenue {inr(lfl.curRevenue)} vs {inr(lfl.priorRevenue)} · <Delta value={lfl.revenueGrowth} /></p>
        <TableBox>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 border-b border-slate-200">
                <th className="py-1.5 pr-3 font-medium">Channel</th>
                <th className="py-1.5 px-2 text-right font-medium">{lfl.priorScope}</th>
                <th className="py-1.5 px-2 text-right font-medium">{lfl.curScope}</th>
                <th className="py-1.5 px-2 text-right font-medium">YoY growth</th>
                <th className="py-1.5 pl-2 text-right font-medium">Mix now</th>
              </tr>
            </thead>
            <tbody>
              {lfl.rows.map((r) => (
                <tr key={r.channel} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 font-medium text-slate-700"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: chColor(r.channel) }} />{chName(r.channel)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{inr(r.prior)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">{inr(r.cur)}</td>
                  <td className="py-1.5 px-2 text-right"><Delta value={r.growth} /></td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-slate-600">{pctStr(r.mix)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </Fold>
      <Fold id="cm-fy" secondary title="Fiscal-year channel mix" meta="Net revenue by fiscal year, computed from the monthly MIS">
        <TableBox>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 border-b border-slate-200">
                <th className="py-1.5 pr-3 font-medium sticky left-0 bg-white">FY</th>
                <th className="py-1.5 px-2 text-right font-medium">Net Rev</th>
                {fyChans.map((c) => <th key={c} className="py-1.5 px-2 text-right font-medium">{chName(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {yearly.filter((y) => y.netRevenue > 0).map((y) => {
                const mix = channelMix(toPeriodMIS(y));
                return (
                  <tr key={y.key} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 font-medium text-slate-700 sticky left-0 bg-white">{y.label}{y.members.length < 12 ? ` (${y.members.length}m)` : ''}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">{inr(y.netRevenue)}</td>
                    {fyChans.map((c) => <td key={c} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{mix[c] ? pctStr(mix[c], 0) : '–'}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableBox>
      </Fold>
    </div>
  );
}

// ============================================================================
// Profitability
// ============================================================================

export function ProfitabilityTab({ period, periods, gran }: { period: PeriodAgg; periods: PeriodAgg[]; gran: Granularity }) {
  const [cm3, setCm3] = useState(false);
  const ratio = (p: PeriodAgg, row: string, v: number) => (real(p, row) && p.netRevenue ? v / p.netRevenue : null);
  const series = [
    { name: 'Gross Margin', color: SERIES_COLORS[0], values: periods.map((p) => ratio(p, 'gross_margin', p.grossMargin)) },
    { name: 'CM1', color: SERIES_COLORS[3], values: periods.map((p) => ratio(p, 'cm1', p.cm1)) },
    { name: 'CM2', color: SERIES_COLORS[2], values: periods.map((p) => ratio(p, 'cm2', p.cm2)) },
    ...(cm3 ? [{ name: 'CM3', color: SERIES_COLORS[5], values: periods.map((p) => ratio(p, 'cm3', p.cm3)) }] : []),
    { name: 'EBITDA', color: SERIES_COLORS[1], values: periods.map((p) => ratio(p, 'ebitda', p.ebitda)) },
    { name: 'Net Income', color: SERIES_COLORS[4], values: periods.map((p) => ratio(p, 'net_income', p.netIncome)) },
  ];
  const lp = period;
  const WF: (WaterfallStep & { row: string; skipZero?: boolean })[] = [
    { label: 'Net Revenue', value: lp.netRevenue, type: 'total', row: 'net_revenue' },
    { label: 'COGM', value: -lp.cogm, type: 'cost', row: 'cogm' },
    { label: 'Channel & Fulfil', value: -lp.channelFulfillment, type: 'cost', row: 'channel_fulfilment' },
    { label: 'Sales & Mktg', value: -lp.salesMarketing, type: 'cost', row: 'sales_marketing' },
    { label: 'Brand Investment', value: -lp.platformCosts, type: 'cost', row: 'platform_payment' },
    { label: 'OpEx', value: -lp.opex, type: 'cost', row: 'opex' },
    { label: 'Non-Op', value: -lp.nonOperating, type: 'cost', row: 'non_operating' },
    { label: 'Fundraising', value: -lp.costOfFundraising, type: 'cost', row: 'cost_of_fundraising', skipZero: true },
    { label: 'Net Income', value: lp.netIncome, type: 'total', row: 'net_income' },
  ];
  const full = lp.level === 'full';
  const steps = WF.filter((s) => !(s.skipZero && s.value === 0)).map(({ label, value, type }) => ({ label, value, type }));
  const c = (p: PeriodAgg, row: string, v: number) => (real(p, row) && p.netRevenue ? pctStr(v / p.netRevenue) : '—');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Margins &amp; unit economics · {scopeLine(periods, gran)}</p>
        <BlendToggle />
      </div>
      <BlendNote />
      <Fold id="pr-ladder" title="Margin ladder over time" meta="Gross margin → CM1 → CM2 → EBITDA → Net income (% of net revenue)"
        actions={<label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={cm3} onChange={(e) => setCm3(e.target.checked)} /> show CM3</label>}>
        <LineChart labels={periods.map((p) => p.label)} series={series} percent valueFormat={(v) => pctStr(v)} yFormat={(v) => `${Math.round(v * 100)}%`} />
        <div className="mt-2"><Legend items={series.map((s) => ({ label: s.name, color: s.color }))} /></div>
      </Fold>
      <Fold id="pr-bridge" title={`P&L bridge · ${lp.label}`} meta="From net revenue to net income">
        {full ? <WaterfallChart steps={steps} /> : <p className="text-xs text-slate-400 py-6 text-center">The full bridge needs a full close (Tally P&amp;L) for every month in {lp.label}.</p>}
      </Fold>
      <Fold id="pr-cost" title="Cost structure (% of net revenue)" meta={GRAN_TITLE[gran]}>
        <TableBox>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 border-b border-slate-200">
                <th className="py-1.5 pr-3 font-medium sticky left-0 bg-white">Period</th>
                {['COGM', 'Channel', 'S&M', 'Platform', 'OpEx', 'EBITDA %', 'Net %'].map((h) => <th key={h} className="py-1.5 px-2 text-right font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.key} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 font-medium text-slate-700 sticky left-0 bg-white">{p.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{c(p, 'cogm', p.cogm)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{c(p, 'channel_fulfilment', p.channelFulfillment)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{c(p, 'sales_marketing', p.salesMarketing)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{c(p, 'platform_payment', p.platformCosts)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{c(p, 'opex', p.opex)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium text-slate-800">{c(p, 'ebitda', p.ebitda)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">{c(p, 'net_income', p.netIncome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </Fold>
    </div>
  );
}

// ============================================================================
// Repeats (static repeat-purchase feeds — Shopify D2C + Amazon)
// ============================================================================

const D2C_COLOR = CHANNEL_COLORS.D2C;
const AMZ_COLOR = CHANNEL_COLORS.Amazon;
const fmt2 = (v: number) => v.toFixed(2);

export function RepeatsTab() {
  const allKeys = [...new Set([...D2C_REPEATS.map((r) => r.key), ...AMAZON_REPEATS.map((r) => r.key)])].sort();
  const d2c = new Map(D2C_REPEATS.map((r) => [r.key, r]));
  const amz = new Map(AMAZON_REPEATS.map((r) => [r.key, r]));
  const cmp = [
    { name: 'Shopify (D2C)', color: D2C_COLOR, values: allKeys.map((k) => d2c.get(k)?.repeatRate ?? null) },
    { name: 'Amazon', color: AMZ_COLOR, values: allKeys.map((k) => amz.get(k)?.repeatCustomerShare ?? null) },
  ];
  const dL = D2C_REPEATS.map((r) => shortKey(r.key));
  const aL = AMAZON_REPEATS.map((r) => shortKey(r.key));
  const lastD = D2C_REPEATS[D2C_REPEATS.length - 1]?.key, lastA = AMAZON_REPEATS[AMAZON_REPEATS.length - 1]?.key;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
        Repeat purchases come from each channel’s own repeat-purchase report — a <span className="font-medium">static feed</span>{' '}
        through {lastD ? shortKey(lastD) : '—'} (Shopify) and {lastA ? shortKey(lastA) : '—'} (Amazon). The live connectors don’t
        carry customer-level history yet, so these aren’t rebuilt from uploads. * = partial month.
      </div>
      <Fold id="rp-cmp" title="Repeat rate — Shopify vs Amazon" meta="Share of customers who are repeat buyers, per channel, month by month">
        <LineChart labels={allKeys.map(shortKey)} series={cmp} percent valueFormat={(v) => pctStr(v)} yFormat={(v) => `${Math.round(v * 100)}%`} height={260} />
        <div className="mt-2"><Legend items={cmp.map((s) => ({ label: s.name, color: s.color }))} /></div>
        <Note>
          Definitions differ by source: Shopify’s rate is the share of a month’s new cohort that later reordered (recent months
          read low — less elapsed time); Amazon’s is the share of that month’s active customers who were repeat buyers. Compare
          trends, not exact levels.
        </Note>
      </Fold>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Fold id="rp-d2c-rate" secondary title="Shopify · repeat rate" meta="Share of each month’s cohort that reordered">
          <LineChart labels={dL} series={[{ name: 'Repeat rate', color: D2C_COLOR, values: D2C_REPEATS.map((r) => r.repeatRate) }]} percent valueFormat={(v) => pctStr(v)} yFormat={(v) => `${Math.round(v * 100)}%`} />
        </Fold>
        <Fold id="rp-d2c-freq" secondary title="Shopify · purchase frequency" meta="Orders per buyer">
          <LineChart labels={dL} series={[{ name: 'Frequency', color: SERIES_COLORS[1], values: D2C_REPEATS.map((r) => r.freq) }]} valueFormat={fmt2} yFormat={fmt2} />
        </Fold>
      </div>
      <Fold id="rp-d2c-basket" secondary title="Shopify · products & units per customer">
        <LineChart labels={dL} valueFormat={fmt2} yFormat={fmt2} series={[
          { name: 'Avg products/customer', color: SERIES_COLORS[0], values: D2C_REPEATS.map((r) => r.avgProducts) },
          { name: 'Avg units/customer', color: SERIES_COLORS[2], values: D2C_REPEATS.map((r) => r.avgUnits) },
        ]} />
        <div className="mt-2"><Legend items={[{ label: 'Avg products/customer', color: SERIES_COLORS[0] }, { label: 'Avg units/customer', color: SERIES_COLORS[2] }]} /></div>
      </Fold>
      <Fold id="rp-d2c-table" title="Shopify (D2C) monthly detail" meta={`${D2C_REPEATS.length} months`}>
        <TableBox>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 border-b border-slate-200">
                {['Month', 'Buyers', 'Orders', 'AOV', 'Freq', 'Repeat %', 'Avg products'].map((h, i) => <th key={h} className={`py-1.5 ${i === 0 ? 'pr-3' : 'px-2 text-right'} font-medium`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {D2C_REPEATS.map((r) => (
                <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 font-medium text-slate-700">{shortKey(r.key)}{r.partial ? ' *' : ''}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtCountFull(r.buyers)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtCountFull(r.orders)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{inr(r.aov)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmt2(r.freq)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium text-slate-800">{pctStr(r.repeatRate)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmt2(r.avgProducts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </Fold>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Fold id="rp-amz-share" secondary title="Amazon · repeat customer share" meta="Repeat customers ÷ total customers">
          <LineChart labels={aL} series={[{ name: 'Repeat customer share', color: AMZ_COLOR, values: AMAZON_REPEATS.map((r) => r.repeatCustomerShare) }]} percent valueFormat={(v) => pctStr(v)} yFormat={(v) => `${Math.round(v * 100)}%`} />
        </Fold>
        <Fold id="rp-amz-sales" secondary title="Amazon · repeat order sales" meta="₹ sales from repeat orders">
          <LineChart labels={aL} series={[{ name: 'Repeat sales', color: SERIES_COLORS[3], values: AMAZON_REPEATS.map((r) => r.repeatSales) }]} />
        </Fold>
      </div>
      <Fold id="rp-amz-table" title="Amazon monthly detail" meta={`${AMAZON_REPEATS.length} months`}>
        <TableBox>
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="text-left text-[10px] text-slate-400 border-b border-slate-200">
                {['Month', 'Orders', 'Customers', 'Repeat cust.', 'Repeat cust. %', 'Repeat sales', 'Repeat sales %'].map((h, i) => <th key={h} className={`py-1.5 ${i === 0 ? 'pr-3' : 'px-2 text-right'} font-medium`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {AMAZON_REPEATS.map((r) => (
                <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-1.5 pr-3 font-medium text-slate-700">{shortKey(r.key)}{r.partial ? ' *' : ''}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtCountFull(r.orders)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtCountFull(r.customers)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmtCountFull(r.repeatCustomers)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium text-slate-800">{pctStr(r.repeatCustomerShare)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{inr(r.repeatSales)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{pctStr(r.repeatSalesShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </Fold>
    </div>
  );
}
