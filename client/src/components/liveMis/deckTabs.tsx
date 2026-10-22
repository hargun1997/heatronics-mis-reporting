// ----------------------------------------------------------------------------
// Live MIS deck tabs — the legacy deck's structure (Overview / P&L / Channel
// P&L / SKU / SKU×Channel / Units), computed live from the durable uploads via
// liveDeck + liveAnalytics + liveViews. Numbers below a month's completeness
// level are shown muted ("—"), never faked.
// ----------------------------------------------------------------------------

/* eslint-disable react-refresh/only-export-components */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { KpiTile } from '../ui';
import {
  inr, pctStr, LineChart, DonutChart, WaterfallChart, Legend, StackedBarChart, GroupedBarChart,
  SERIES_COLORS, type LineSeries, type WaterfallStep,
} from '../mis-deck/charts';
import type { SkuCell } from '../../data/misDeck/skuChannelPnl';
import type { MonthlyMIS, SalesChannel } from '../../data/misDeck/misDeckData';
import { SALES_CHANNELS, VERTICALS } from '../../data/misDeck/misDeckData';
import type { CompletenessLevel, PeriodCompleteness, TrafficRow } from '../../data/misDeck/liveDeck';
import {
  aggregatePeriods, marginPct, slicePnl, sliceOptions, scopeOf,
  type PeriodAgg, type PnlColumn, type SlicePnl, type SliceColumnBy, type Granularity,
} from '../../data/misDeck/liveAnalytics';
import {
  REAL_ROWS, toPeriodMIS, anchoredChannelPnl, anchoredColumns, companyColumn, liveSkuChannelMatrix,
} from '../../data/misDeck/liveViews';
import { topChannel } from '../../data/misDeck/analytics';
import type { CascadeLine } from '../../data/monthClose/schema';
import {
  Fold, Pills, BlendToggle, BlendNote, LevelBadge, Delta, fairGrowth, ND, Note, TableBox,
  useLiveView, VERTICAL_COLORS,
} from './shared';

export { LevelBadge } from './shared';

const isRealRow = (level: CompletenessLevel, row: string) => REAL_ROWS[level].has(row);
const GRAN_NOUN: Record<Granularity, string> = { month: 'month', quarter: 'quarter', year: 'fiscal year' };

/** Scope line for a chart: "Monthly · Dec 23 → Jul 26 (32 periods)". */
export function scopeLine(periods: PeriodAgg[], gran: Granularity): string {
  if (!periods.length) return '';
  const g = gran === 'month' ? 'Monthly' : gran === 'quarter' ? 'By fiscal quarter' : 'By fiscal year';
  return `${g} · ${periods[0].label} → ${periods[periods.length - 1].label} (${periods.length} period${periods.length === 1 ? '' : 's'})`;
}

/** The same-length period one year earlier (fair YoY frame), found by member months. */
export function yearAgoOf(p: PeriodAgg, all: PeriodAgg[]): PeriodAgg | null {
  const shift = (k: string) => `${Number(k.slice(0, 4)) - 1}${k.slice(4)}`;
  const first = shift(p.members[0]);
  return all.find((x) => x.members[0] === first && x.members.length === p.members.length) ?? null;
}

// ============================================================================
// Overview
// ============================================================================

export function OverviewTab({ period, periods, allPeriods, gran, traffic = [], isRange = false }: {
  period: PeriodAgg; periods: PeriodAgg[]; allPeriods: PeriodAgg[]; gran: Granularity; traffic?: TrafficRow[]; isRange?: boolean;
}) {
  const { chName, chColor } = useLiveView();
  const lvl = period.level;
  const real = (k: string) => isRealRow(lvl, k);
  const idx = allPeriods.findIndex((p) => p.key === period.key);
  const prev = !isRange && idx > 0 ? allPeriods[idx - 1] : null;
  const yAgo = !isRange ? yearAgoOf(period, allPeriods) : null;
  const n = period.members.length;
  const seq = fairGrowth({ v: period.netRevenue, n }, prev ? { v: prev.netRevenue, n: prev.members.length } : null);
  const yoy = fairGrowth({ v: period.netRevenue, n }, yAgo ? { v: yAgo.netRevenue, n: yAgo.members.length } : null);
  const seqLabel = gran === 'month' ? 'MoM' : gran === 'quarter' ? 'QoQ' : 'YoY';
  const pm = toPeriodMIS(period);
  const top = topChannel(pm);
  const pct = (v: number) => marginPct(v, period.netRevenue);
  const costs = period.cogm + period.channelFulfillment + period.salesMarketing + period.platformCosts + period.opex;

  // Trend series across the shown history (muted where a period isn't real yet).
  const trend = periods;
  const labels = trend.map((p) => p.label);
  const realV = (p: PeriodAgg, key: string, v: number): number | null => (isRealRow(p.level, key) ? v : null);
  const moneySeries: LineSeries[] = [
    { name: 'Net Revenue', color: SERIES_COLORS[0], values: trend.map((p) => p.netRevenue) },
    { name: 'CM2', color: SERIES_COLORS[1], values: trend.map((p) => realV(p, 'cm2', p.cm2)) },
    { name: 'EBITDA', color: SERIES_COLORS[2], values: trend.map((p) => realV(p, 'ebitda', p.ebitda)) },
  ];
  const ratio = (p: PeriodAgg, key: string, v: number) => (p.netRevenue ? realV(p, key, v / p.netRevenue) : null);
  const pctSeries: LineSeries[] = [
    { name: 'GM %', color: SERIES_COLORS[0], values: trend.map((p) => ratio(p, 'gross_margin', p.grossMargin)) },
    { name: 'CM1 %', color: SERIES_COLORS[3], values: trend.map((p) => ratio(p, 'cm1', p.cm1)) },
    { name: 'CM2 %', color: SERIES_COLORS[2], values: trend.map((p) => ratio(p, 'cm2', p.cm2)) },
    { name: 'EBITDA %', color: SERIES_COLORS[1], values: trend.map((p) => ratio(p, 'ebitda', p.ebitda)) },
    { name: 'Net Income %', color: SERIES_COLORS[4], values: trend.map((p) => ratio(p, 'net_income', p.netIncome)) },
  ];

  const mix = (Object.entries(period.netByChannel) as [string, number][])
    .filter(([, v]) => v > 0).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  const totalMix = mix.reduce((s, d) => s + d.value, 0);
  const mixColors = Object.fromEntries(mix.map((d) => [d.key, chColor(d.key)]));

  // P&L bridge for the selected period — the lines that are real at its level.
  const WF: { label: string; value: number; type: 'total' | 'cost'; real: string; skipZero?: boolean }[] = [
    { label: 'Net Rev', value: period.netRevenue, type: 'total', real: 'net_revenue' },
    { label: '− COGM', value: -period.cogm, type: 'cost', real: 'cogm' },
    { label: 'Gross', value: period.grossMargin, type: 'total', real: 'gross_margin' },
    { label: '− Ch & Ful', value: -period.channelFulfillment, type: 'cost', real: 'channel_fulfilment' },
    { label: 'CM1', value: period.cm1, type: 'total', real: 'cm1' },
    { label: '− S&M', value: -period.salesMarketing, type: 'cost', real: 'sales_marketing' },
    { label: 'CM2', value: period.cm2, type: 'total', real: 'cm2' },
    { label: '− Brand inv.', value: -period.platformCosts, type: 'cost', real: 'platform_payment' },
    { label: 'CM3', value: period.cm3, type: 'total', real: 'cm3' },
    { label: '− OPEX', value: -period.opex, type: 'cost', real: 'opex' },
    { label: 'EBITDA', value: period.ebitda, type: 'total', real: 'ebitda' },
    { label: '− Non-Op', value: -period.nonOperating, type: 'cost', real: 'non_operating' },
    { label: '− Fundraising', value: -period.costOfFundraising, type: 'cost', real: 'cost_of_fundraising', skipZero: true },
    { label: 'Net Inc', value: period.netIncome, type: 'total', real: 'net_income' },
  ];
  const steps: WaterfallStep[] = WF.filter((s) => real(s.real) && !(s.skipZero && s.value === 0)).map(({ label, value, type }) => ({ label, value, type }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Snapshot for <span className="font-medium text-slate-700">{period.label}</span>{n > 1 ? ` · ${scopeOf(period)}` : ''}</p>
        <BlendToggle />
      </div>
      <BlendNote />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Net Revenue" value={inr(period.netRevenue)}
          sub={<span className="inline-flex flex-wrap gap-x-2">{!isRange && <span>{seqLabel} <Delta value={seq} /></span>}{!isRange && gran !== 'year' && <span>YoY <Delta value={yoy} /></span>}</span>} />
        <KpiTile label="Gross Margin" value={real('gross_margin') && pct(period.grossMargin) != null ? pctStr(pct(period.grossMargin)) : '—'}
          sub={real('gross_margin') ? `Gross profit ${inr(period.grossMargin)}` : 'needs COGM'} />
        <KpiTile label="EBITDA" value={real('ebitda') ? inr(period.ebitda) : '—'}
          sub={real('ebitda') ? `${pctStr(pct(period.ebitda))} of revenue` : 'needs Tally'} />
        <KpiTile label="Net Income" value={real('net_income') ? inr(period.netIncome) : '—'}
          sub={real('net_income') ? `${pctStr(pct(period.netIncome))} of revenue` : 'needs Tally'} />
        <KpiTile label="Contribution (CM2)" value={real('cm2') ? pctStr(pct(period.cm2)) : '—'}
          sub={real('cm2') ? `${inr(period.cm2)} after channel & marketing` : 'needs COGM'} />
        <KpiTile label="Top channel" value={totalMix > 0 ? `${chName(top.channel)} · ${pctStr(top.share, 0)}` : '—'} sub="of net revenue" />
        <KpiTile label="Period covers" value={n === 1 ? '1 month' : `${n} months`} sub={scopeOf(period).replace(/ · \d+m$/, '')} />
        <KpiTile label="Costs" value={real('opex') ? inr(costs) : '—'} sub={real('opex') ? 'COGM + channel + S&M + platform + opex' : 'needs Tally'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Fold id="ov-trend" title="Revenue & margin — trend" meta={scopeLine(trend, gran)}>
          <LineChart labels={labels} series={moneySeries} />
          <div className="mt-2"><Legend items={moneySeries.map((s) => ({ label: s.name, color: s.color }))} /></div>
        </Fold>
        <Fold id="ov-margin" title="Margin ladder % — trend" meta={scopeLine(trend, gran)}>
          <LineChart labels={labels} series={pctSeries} percent yFormat={(v) => `${Math.round(v * 100)}%`} valueFormat={(v) => pctStr(v)} />
          <div className="mt-2"><Legend items={pctSeries.map((s) => ({ label: s.name, color: s.color }))} /></div>
        </Fold>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Fold id="ov-mix" title={`Channel mix · ${period.label}`} meta="Share of net revenue">
          {mix.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">No channel revenue.</p> : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <DonutChart data={mix} colors={mixColors} size={180} />
              <div className="space-y-1 w-full">
                {mix.map((d) => (
                  <div key={d.key} className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: chColor(d.key) }} />
                    <span className="text-slate-600 flex-1 truncate">{chName(d.key)}</span>
                    <span className="tabular-nums text-slate-400">{inr(d.value)}</span>
                    <span className="tabular-nums font-medium text-slate-700 w-12 text-right">{pctStr(totalMix ? d.value / totalMix : 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Fold>
        <Fold id="ov-bridge" title={`P&L bridge · ${period.label}`} meta="Net revenue → net income">
          {steps.length >= 3 ? <WaterfallChart steps={steps} />
            : <p className="text-xs text-slate-400 py-6 text-center">Upload the month's Tally P&amp;L to see the full bridge.</p>}
        </Fold>
      </div>

      {traffic.length > 0 && <AmazonTraffic rows={traffic} label={period.label} />}

      <Note>
        {period.label} · <LevelBadge level={period.level} published={period.published} />{' '}
        {period.level === 'full'
          ? period.published ? 'shown from the published MIS (no full live close for it yet).' : 'every line is real and reconciled to Tally.'
          : period.level === 'contribution'
            ? 'real through Contribution Margin; OPEX, EBITDA and Net Income need the Tally P&L for this month.'
            : 'top line only; upload the BOM and Tally P&L to complete the cascade.'}{' '}
        {!isRange && <>{seqLabel} compares with the previous {GRAN_NOUN[gran]}; YoY with the same {GRAN_NOUN[gran]} a year earlier. Growth is
        only shown when both periods cover the same number of months, so partial periods (e.g. a fiscal year still in progress) aren’t compared unfairly.</>}
      </Note>
    </div>
  );
}

/** Amazon traffic & conversion for the period — from the Business Report (not the P&L). */
function AmazonTraffic({ rows, label }: { rows: TrafficRow[]; label: string }) {
  const totS = rows.reduce((s, r) => s + r.sessions, 0);
  const totP = rows.reduce((s, r) => s + r.pageViews, 0);
  const totU = rows.reduce((s, r) => s + r.units, 0);
  const conv = (u: number, s: number) => (s > 0 ? `${((100 * u) / s).toFixed(1)}%` : '—');
  const top = [...rows].sort((a, b) => b.sessions - a.sessions).slice(0, 12);
  const n = (v: number) => v.toLocaleString('en-IN');
  return (
    <Fold id="ov-traffic" secondary title={`Amazon traffic & conversion · ${label}`} meta="Sessions → units ordered (Business Report — not revenue)">
      <TableBox>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[10px] text-slate-400 text-left border-b border-slate-200 bg-slate-50">
              <th className="py-1.5 px-2">Product</th>
              <th className="py-1.5 px-2 text-right">Sessions</th>
              <th className="py-1.5 px-2 text-right">Page views</th>
              <th className="py-1.5 px-2 text-right">Units</th>
              <th className="py-1.5 px-2 text-right">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.sku} className="border-b border-slate-50">
                <td className="py-1 px-2 text-slate-700 max-w-[260px] truncate" title={r.name}>{r.name}</td>
                <td className="py-1 px-2 text-right tabular-nums text-slate-600">{n(r.sessions)}</td>
                <td className="py-1 px-2 text-right tabular-nums text-slate-500">{n(r.pageViews)}</td>
                <td className="py-1 px-2 text-right tabular-nums text-slate-600">{n(r.units)}</td>
                <td className="py-1 px-2 text-right tabular-nums font-medium text-slate-800">{conv(r.units, r.sessions)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold text-slate-800 bg-slate-50/50">
              <td className="py-1.5 px-2">Total{rows.length > top.length ? ` (${rows.length} products)` : ''}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{n(totS)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{n(totP)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{n(totU)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{conv(totU, totS)}</td>
            </tr>
          </tfoot>
        </table>
      </TableBox>
    </Fold>
  );
}

// ============================================================================
// P&L
// ============================================================================

export type PnlDisplay = 'amount' | 'percent' | 'both';

interface PnlRow { k: string; label: string; title?: string; get: (p: PeriodAgg) => number; kind: 'rev' | 'cost' | 'margin' }
export const PNL_ROWS: PnlRow[] = [
  { k: 'net_revenue', label: 'Net Revenue', get: (p) => p.netRevenue, kind: 'rev' },
  { k: 'cogm', label: 'COGM', get: (p) => -p.cogm, kind: 'cost' },
  { k: 'gross_margin', label: 'Gross Margin', get: (p) => p.grossMargin, kind: 'margin' },
  { k: 'channel_fulfilment', label: 'Channel & Fulfilment', get: (p) => -p.channelFulfillment, kind: 'cost' },
  { k: 'cm1', label: 'CM1', get: (p) => p.cm1, kind: 'margin' },
  { k: 'sales_marketing', label: 'Sales & Marketing', get: (p) => -p.salesMarketing, kind: 'cost' },
  { k: 'cm2', label: 'CM2', get: (p) => p.cm2, kind: 'margin' },
  { k: 'platform_payment', label: 'Brand Investment / Platform & Payment', title: 'The legacy deck called this line "Brand Investment"; Tally books it as Platform & Payment (gateway, checkout, BNPL, warranty freight).', get: (p) => -p.platformCosts, kind: 'cost' },
  { k: 'cm3', label: 'CM3', get: (p) => p.cm3, kind: 'margin' },
  { k: 'opex', label: 'Operating Expenses', get: (p) => -p.opex, kind: 'cost' },
  { k: 'ebitda', label: 'EBITDA', get: (p) => p.ebitda, kind: 'margin' },
  { k: 'cost_of_fundraising', label: 'Cost of Fundraising', get: (p) => -p.costOfFundraising, kind: 'cost' },
  { k: 'non_operating', label: 'Non-Operating (interest / D&A / tax)', get: (p) => -p.nonOperating, kind: 'cost' },
  { k: 'net_income', label: 'Net Income', get: (p) => p.netIncome, kind: 'margin' },
];

// Cost rows that drill into Tally's own ledger buckets (live months).
const PNL_TALLY: Record<string, CascadeLine[]> = {
  channel_fulfilment: ['channel_fulfilment'],
  platform_payment: ['platform_payment'],
  cost_of_fundraising: ['cost_of_fundraising'],
};
const MKT_ORDER = ['Google Ads', 'Meta (FB / Instagram)', 'Amazon Ads', 'Flipkart Ads', 'Other / Blended'];

interface DrillLine { key: string; label: string; value: (p: PeriodAgg) => number | null; strong?: boolean; gate?: string }

/** Column header scope: "Dec 23–Mar 24 · 4m (partial)" under quarter / year / range labels. */
function colScope(p: PeriodAgg, gran: Granularity): string | null {
  const n = p.members.length;
  if (gran === 'month' && n === 1) return null;
  const full = gran === 'quarter' ? 3 : gran === 'year' ? 12 : n;
  return `${scopeOf(p)}${n < full ? ' (partial)' : ''}`;
}

export function PnlTab({ periods, months, completeness, gran, display, setDisplay }: {
  periods: PeriodAgg[];
  /** All months (blend applied) — for the Metric trends chart's own grain. */
  months: MonthlyMIS[];
  completeness: Record<string, PeriodCompleteness>;
  gran: Granularity;
  display: PnlDisplay;
  setDisplay: (d: PnlDisplay) => void;
}) {
  const { chName } = useLiveView();
  const cols = periods;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cols.length]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Drill lines per expandable row (union across the shown columns).
  const drills = useMemo(() => {
    const out: Record<string, DrillLine[]> = {};
    const ledger = (field: 'cogmLines' | 'opexLines', gate: string): DrillLine[] => {
      const keys: string[] = [];
      for (const p of cols) for (const k of Object.keys(p[field])) if (!keys.includes(k)) keys.push(k);
      return keys.map((k) => ({ key: k, label: k, gate, value: (p) => (k in p[field] ? p[field][k] : null) }));
    };
    out.cogm = ledger('cogmLines', 'cogm');
    out.opex = ledger('opexLines', 'opex');

    // Revenue build-up (gross → returns → GST → net), where the months carry it.
    const chGross = SALES_CHANNELS.filter((c) => cols.some((p) => p.hasBuildUp && p.grossByChannel[c]));
    const chRet = SALES_CHANNELS.filter((c) => cols.some((p) => p.hasBuildUp && p.returnsByChannel[c]));
    const bu = (f: (p: PeriodAgg) => number | undefined) => (p: PeriodAgg) => (p.hasBuildUp ? (f(p) ?? null) : null);
    if (cols.some((p) => p.hasBuildUp)) {
      out.net_revenue = [
        { key: 'gross', label: 'Gross revenue (incl. GST)', strong: true, value: bu((p) => p.totalGrossRevenue) },
        ...chGross.map((c) => ({ key: `g:${c}`, label: `  ${chName(c)}`, value: bu((p) => p.grossByChannel[c] ?? 0) })),
        { key: 'returns', label: 'Returns', strong: true, value: bu((p) => p.totalReturns) },
        ...chRet.map((c) => ({ key: `r:${c}`, label: `  ${chName(c)}`, value: bu((p) => p.returnsByChannel[c] ?? 0) })),
        { key: 'gst', label: 'GST / taxes', strong: true, value: bu((p) => p.totalTaxes) },
      ];
    }

    // S&M by ad platform (live months).
    const present = new Set<string>();
    for (const p of cols) for (const l of Object.keys(p.marketingByPlatform ?? {})) present.add(l);
    const mk = [...MKT_ORDER.filter((l) => present.has(l)), ...[...present].filter((l) => !MKT_ORDER.includes(l))];
    out.sales_marketing = mk.map((l) => ({ key: l, label: l, gate: 'sales_marketing', value: (p) => (p.marketingByPlatform?.[l] ? -p.marketingByPlatform[l] : null) }));

    // Tally ledger buckets (live months).
    for (const [row, cascades] of Object.entries(PNL_TALLY)) {
      const seen = new Map<string, string>();
      for (const p of cols) for (const l of p.tallyLines ?? []) if (cascades.includes(l.cascadeLine) && !seen.has(l.lineKey)) seen.set(l.lineKey, l.label);
      out[row] = [...seen.entries()].map(([lk, label]) => ({ key: lk, label, gate: row, value: (p) => p.tallyLines.find((l) => l.lineKey === lk)?.total ?? null }));
    }

    // Non-operating: its Tally ledgers (finance cost, depreciation …), then EBT
    // (before income tax), then any income-tax ledger.
    const nonOpKeys: string[] = [];
    for (const p of cols) for (const k of Object.keys(p.nonOpLines)) if (!nonOpKeys.includes(k)) nonOpKeys.push(k);
    if (nonOpKeys.length) {
      const isTax = (k: string) => /tax/i.test(k);
      const has = (p: PeriodAgg) => Object.keys(p.nonOpLines).length > 0;
      out.non_operating = [
        ...nonOpKeys.filter((k) => !isTax(k)).map((k) => ({ key: k, label: k, gate: 'non_operating', value: (p: PeriodAgg) => p.nonOpLines[k] ?? (has(p) ? 0 : null) })),
        {
          key: '__ebt', label: 'EBT (before income tax)', strong: true, gate: 'non_operating',
          value: (p: PeriodAgg) => (has(p) ? p.ebitda - p.costOfFundraising + Object.entries(p.nonOpLines).filter(([k]) => !isTax(k)).reduce((s, [, v]) => s + v, 0) : null),
        },
        ...nonOpKeys.filter(isTax).map((k) => ({ key: k, label: k, gate: 'non_operating', value: (p: PeriodAgg) => p.nonOpLines[k] ?? (has(p) ? 0 : null) })),
      ];
    }
    return out;
  }, [cols, chName]);

  const cell = (v: number | null, p: PeriodAgg, strong: boolean, small = false) => {
    if (v == null) return <span className="text-slate-300">—</span>;
    const share = p.netRevenue ? v / p.netRevenue : null;
    return (
      <>
        {display !== 'percent' && <div>{inr(v)}</div>}
        {display !== 'amount' && (
          <div className={display === 'both' ? `text-[10px] ${strong ? 'font-medium' : 'font-normal'} text-slate-400 mt-0.5` : ''}>{pctStr(share)}</div>
        )}
        {small && null}
      </>
    );
  };

  const desc = display === 'percent'
    ? 'Each line as a % of net revenue (common-size). Costs read negative.'
    : display === 'both'
      ? 'Figures in ₹ with each line’s % of net revenue beneath. Costs shown as negatives.'
      : 'All figures in ₹. Costs shown as negatives.';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{desc} Column scope under each heading; partial periods are annotated.</p>
        <div className="flex flex-wrap items-center gap-2">
          <BlendToggle />
          <Pills label="Show" value={display} onChange={setDisplay}
            options={[{ id: 'amount', label: '₹' }, { id: 'percent', label: '% Rev' }, { id: 'both', label: '₹ + %' }]} />
        </div>
      </div>
      <BlendNote />

      <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200">
              <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white z-10 min-w-[150px]">Particulars</th>
              {cols.map((p) => {
                const sc = colScope(p, gran);
                return (
                  <th key={p.key} className="py-1.5 px-2 text-right font-medium whitespace-nowrap align-bottom">
                    <div className="text-slate-600 font-semibold">{p.label}</div>
                    {sc && <div className="font-normal text-slate-400">{sc}</div>}
                    <div className="font-normal mt-0.5"><LevelBadge level={p.level} published={p.published} /></div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PNL_ROWS.map((row) => {
              const lines = drills[row.k] ?? [];
              const canExpand = lines.length > 0;
              const isOpen = expanded.has(row.k);
              const strong = row.kind !== 'cost';
              return (
                <Fragment key={row.k}>
                  <tr className={`border-b border-slate-50 ${row.kind === 'margin' ? 'bg-slate-50/60' : ''}`}>
                    <td title={row.title} className={`py-1.5 px-3 sticky left-0 bg-white ${strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                      {canExpand ? (
                        <button onClick={() => toggle(row.k)} className="inline-flex items-center gap-1 text-left hover:text-slate-900" aria-expanded={isOpen}>
                          <span className="text-slate-400 w-2 inline-block">{isOpen ? '▾' : '▸'}</span>
                          {row.kind === 'cost' ? '− ' : ''}{row.label}
                        </button>
                      ) : <>{row.kind === 'cost' ? '− ' : ''}{row.label}</>}
                    </td>
                    {cols.map((p) => (
                      <td key={p.key} className={`py-1.5 px-2 text-right tabular-nums align-top ${strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                        {isRealRow(p.level, row.k) ? cell(row.get(p), p, strong) : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                  </tr>
                  {isOpen && lines.map((ln) => (
                    <tr key={`${row.k}:${ln.key}`} className={`border-b border-slate-50 ${ln.strong ? 'bg-slate-50/40' : ''}`}>
                      <td className={`py-1 pr-3 pl-7 sticky left-0 bg-white text-[11px] whitespace-pre ${ln.strong ? 'font-medium text-slate-600' : 'text-slate-500'}`}>{ln.label}</td>
                      {cols.map((p) => (
                        <td key={p.key} className="py-1 px-2 text-right tabular-nums text-[11px] text-slate-500 align-top">
                          {ln.gate && !isRealRow(p.level, ln.gate) ? <span className="text-slate-300">—</span> : cell(ln.value(p), p, !!ln.strong)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note>
        ▸ Click a line to drill in — Net Revenue into its gross → returns → GST build-up (where the month’s source carries
        it), COGM and Operating Expenses into their ledger lines, Sales &amp; Marketing into the ad platforms, and the other
        cost lines into Tally’s own ledger buckets (live months). Non-Operating lists its Tally ledgers with an EBT subtotal.
      </Note>

      <MetricTrends months={months} completeness={completeness} />

      <Note>
        Net Revenue = external sales net of returns &amp; GST (excludes inter-branch transfers). COGM is derived so the Net
        Revenue → Net Income bridge reconciles exactly. Depreciation is generally excluded from the EBITDA/Net-income basis,
        consistent with the source MIS. Percentages are each line’s share of that period’s net revenue.
      </Note>
      <Note>
        <span className="font-medium text-slate-500">FY 2025-26 restated:</span> tied to the company’s provisional P&amp;L as on
        31-03-2026 — COGM ₹2.35 Cr (gross margin 59.7%), EBITDA ≈ −₹0.97 L (breakeven), with depreciation (₹12.91 L) and
        interest (₹9.00 L) below EBITDA for a net loss of −₹22.88 L. The Jan–Mar 2026 months were smoothed to remove the
        volatile actual-consumption COGM that had overstated full-year cost of goods.
      </Note>
    </div>
  );
}

// ---- Metric trends (any P&L line over time) --------------------------------

const METRIC_COLORS = ['#4f46e5', '#94a3b8', '#0ea5e9', '#cbd5e1', '#06b6d4', '#f59e0b', '#8b5cf6', '#eab308', '#ec4899', '#f97316', '#6366f1', '#64748b', '#0284c7', '#0f766e'];

function MetricTrends({ months, completeness }: { months: MonthlyMIS[]; completeness: Record<string, PeriodCompleteness> }) {
  const [g, setG] = useState<Granularity>('month');
  const [basis, setBasis] = useState<'amount' | 'percent'>('amount');
  const [selected, setSelected] = useState<string[]>(['net_revenue', 'gross_margin', 'ebitda']);
  const series = useMemo(() => aggregatePeriods(months, completeness, g), [months, completeness, g]);
  const metrics = PNL_ROWS.map((r, i) => ({ ...r, color: METRIC_COLORS[i % METRIC_COLORS.length] }));
  const chosen = metrics.filter((m) => selected.includes(m.k));
  const chart = chosen.map((m) => ({
    name: m.label, color: m.color,
    values: series.map((p) => {
      if (!isRealRow(p.level, m.k)) return null;
      const v = m.get(p);
      return basis === 'percent' ? (p.netRevenue ? v / p.netRevenue : null) : v;
    }),
  }));
  const toggle = (k: string) => setSelected((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  return (
    <Fold id="pnl-trends" title="Metric trends" meta={basis === 'percent' ? `Each line as % of net revenue, by ${GRAN_NOUN[g]} — costs negative` : `Any P&L line over time, by ${GRAN_NOUN[g]} — costs negative`}
      actions={<>
        <Pills label="Basis" value={basis} onChange={setBasis} options={[{ id: 'amount', label: '₹ Value' }, { id: 'percent', label: '% of Revenue' }]} />
        <Pills label="Grain" value={g} onChange={setG} options={[{ id: 'month', label: 'Monthly' }, { id: 'quarter', label: 'Quarterly' }, { id: 'year', label: 'Yearly' }]} />
      </>}>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {metrics.map((m) => {
          const on = selected.includes(m.k);
          return (
            <button key={m.k} type="button" onClick={() => toggle(m.k)} aria-pressed={on}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${on ? 'border-slate-300 bg-slate-50 text-slate-800' : 'border-slate-200 text-slate-400 hover:text-slate-600'}`}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: on ? m.color : '#cbd5e1' }} />
              {m.label.replace(' / Platform & Payment', '')}
            </button>
          );
        })}
      </div>
      {chosen.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">Select one or more lines above to plot their trend.</div>
      ) : (
        <>
          <LineChart labels={series.map((p) => p.label)} series={chart} height={280}
            percent={basis === 'percent'} yFormat={basis === 'percent' ? (v) => `${Math.round(v * 100)}%` : undefined}
            valueFormat={basis === 'percent' ? (v) => pctStr(v) : (v) => inr(v)} />
          <div className="mt-2"><Legend items={chosen.map((m) => ({ label: m.label, color: m.color }))} /></div>
          <Note>Points below a period’s completeness level are left out (not plotted as zero).</Note>
        </>
      )}
    </Fold>
  );
}

// ============================================================================
// Bifurcated full P&L (shared table)
// ============================================================================
//
// One table renders every bifurcated P&L (by channel / vertical / SKU, and the
// SKU×Channel / Channel×SKU slices, and the MIS-anchored Channel P&L). Rows
// below the period's completeness level are muted to '—'.

interface CascadeRow { k: keyof PnlColumn; label: string; kind: 'rev' | 'cost' | 'margin'; real: string; strong?: boolean }
const FULL_CASCADE: CascadeRow[] = [
  { k: 'rev', label: 'Net Revenue', kind: 'rev', real: 'net_revenue' },
  { k: 'cogm', label: 'COGM', kind: 'cost', real: 'cogm' },
  { k: 'gm', label: 'Gross Margin', kind: 'margin', real: 'gross_margin' },
  { k: 'fulfilment', label: 'Channel & Fulfilment', kind: 'cost', real: 'channel_fulfilment' },
  { k: 'cm1', label: 'CM1', kind: 'margin', real: 'cm1' },
  { k: 'marketing', label: 'Sales & Marketing', kind: 'cost', real: 'sales_marketing' },
  { k: 'cm2', label: 'CM2', kind: 'margin', real: 'cm2' },
  { k: 'platform', label: 'Brand Investment / Platform', kind: 'cost', real: 'platform_payment' },
  { k: 'cm3', label: 'CM3', kind: 'margin', real: 'cm3' },
  { k: 'opex', label: 'Operating Expenses', kind: 'cost', real: 'opex' },
  { k: 'ebitda', label: 'EBITDA', kind: 'margin', real: 'ebitda', strong: true },
  { k: 'nonOperating', label: 'Non-Operating + Fundraising', kind: 'cost', real: 'non_operating' },
  { k: 'netIncome', label: 'Net Income', kind: 'margin', real: 'net_income', strong: true },
];
// Margin % rows (G33) — each gated by its own cascade row.
const MARGIN_ROWS: { k: keyof PnlColumn; label: string; real: string }[] = [
  { k: 'gm', label: 'GM %', real: 'gross_margin' },
  { k: 'cm1', label: 'CM1 %', real: 'cm1' },
  { k: 'cm2', label: 'CM2 %', real: 'cm2' },
  { k: 'ebitda', label: 'EBITDA %', real: 'ebitda' },
  { k: 'netIncome', label: 'Net margin %', real: 'net_income' },
];

function FullPnlTable({ slice, firstCol, level, pctHeader = false }: { slice: SlicePnl; firstCol: string; level: CompletenessLevel; pctHeader?: boolean }) {
  if (slice.columns.length === 0 && !slice.tied) return <Empty what="data for this slice" />;
  const real = REAL_ROWS[level];
  const cols: PnlColumn[] = [...slice.columns, ...(slice.recon ? [slice.recon] : []), slice.total];
  const totRev = slice.total.rev;
  const colCls = (c: PnlColumn) =>
    c.kind === 'total' ? 'font-semibold text-slate-800' : c.kind === 'recon' ? 'text-slate-400 italic' : 'text-slate-600';
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-200">
            <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white z-10">{firstCol}</th>
            {cols.map((c) => (
              <th key={c.key} title={c.label}
                className={`py-1.5 px-2 text-right font-medium whitespace-nowrap align-bottom ${c.kind === 'total' ? 'text-slate-700' : c.kind === 'recon' ? 'text-slate-400' : 'text-slate-600'}`}>
                <span className="inline-block max-w-[120px] truncate align-bottom">{c.label}</span>
                {pctHeader && c.kind === 'slice' && totRev ? <div className="font-normal text-slate-400">{pctStr(c.rev / totRev)} of rev</div> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FULL_CASCADE.map((row) => {
            const isReal = real.has(row.real);
            return (
              <tr key={row.k as string} className={`border-b border-slate-50 ${row.kind === 'margin' ? 'bg-slate-50/60' : ''}`}>
                <td className={`py-1.5 px-3 sticky left-0 bg-white whitespace-nowrap ${row.strong || row.kind !== 'cost' ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                  {row.kind === 'cost' ? '− ' : ''}{row.label}
                </td>
                {cols.map((c) => {
                  if (!isReal) return <td key={c.key} className="py-1.5 px-2 text-right text-slate-300">—</td>;
                  const raw = c[row.k] as number;
                  return <td key={c.key} className={`py-1.5 px-2 text-right tabular-nums ${colCls(c)}`}>{inr(row.kind === 'cost' ? -raw : raw)}</td>;
                })}
              </tr>
            );
          })}
          {MARGIN_ROWS.map((row, i) => (
            <tr key={`pct:${row.label}`} className={`text-slate-500 ${i === 0 ? 'border-t border-slate-200' : ''}`}>
              <td className="py-1 px-3 sticky left-0 bg-white text-[11px] italic">{row.label}</td>
              {cols.map((c) => (
                <td key={c.key} className="py-1 px-2 text-right tabular-nums text-[11px]">
                  {!real.has(row.real) || c.kind === 'recon' || !c.rev ? <span className="text-slate-300">—</span> : pctStr((c[row.k] as number) / c.rev)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BasisNote({ slice, dim, hasTally }: { slice: SlicePnl; dim: string; hasTally: boolean }) {
  return (
    <Note>
      Each {dim} column is its own connector numbers to CM2 (channel-specific fees &amp; ad spend, BOM cost + 10% factory); CM3,
      OPEX and finance are spread pro-rata by sales.{' '}
      {slice.tied ? (
        <>The <span className="italic">Recon → Tally</span> column carries what the connectors don’t see, so every line sums across the columns to the Tally <span className="font-medium text-slate-500">Total</span>.</>
      ) : hasTally ? 'Totals are for this slice.' : (
        <>Upload the month’s Tally P&amp;L on the <a href="/reporting/mis/ingest" className="text-brand-600 underline">Upload data</a> page to light up CM3 and below.</>
      )}
    </Note>
  );
}

// ============================================================================
// Channel P&L — MIS-anchored (legacy method) or Bottom-up + Recon
// ============================================================================

export type ChannelBasis = 'anchored' | 'bottomup';

export function ChannelsTab({ period, periods, cells, periodKeys, completeness }: {
  period: PeriodAgg; periods: PeriodAgg[]; cells: SkuCell[]; periodKeys: Set<string>; completeness: Record<string, PeriodCompleteness>;
}) {
  const { merged, chName, chColor } = useLiveView();
  const [by, setBy] = useState<'vertical' | 'channel'>('channel');
  const [basis, setBasis] = useState<ChannelBasis>('anchored');
  const bottomUp = useMemo(() => slicePnl(period, cells, periodKeys, by), [period, cells, periodKeys, by]);
  const anchored = useMemo(() => anchoredChannelPnl(period, cells, completeness), [period, cells, completeness]);
  const slice: SlicePnl = useMemo(() => {
    if (basis === 'bottomup') {
      return { ...bottomUp, columns: bottomUp.columns.map((c) => ({ ...c, label: by === 'channel' ? chName(c.key) : c.label })) };
    }
    return { columnBy: by, columns: anchoredColumns(anchored, by, merged), recon: null, total: companyColumn(period), tied: false };
  }, [basis, bottomUp, anchored, by, merged, period, chName]);

  // Timeline (every period at this grain) on the chosen basis, for the charts.
  const timeline = useMemo(() => periods.map((pp) => {
    const cols = basis === 'anchored'
      ? anchoredColumns(anchoredChannelPnl(pp, cells, completeness), by, merged)
      : slicePnl(pp, cells, new Set(pp.members), by).columns;
    return { p: pp, cols };
  }), [periods, cells, completeness, basis, by, merged]);
  const ORDER: readonly string[] = by === 'vertical' ? VERTICALS : SALES_CHANNELS;
  const keyOrder = [...new Set(timeline.flatMap((t) => t.cols.map((c) => c.key)))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const nameOf = (k: string) => (by === 'channel' ? chName(k) : k);
  const colorOf = (k: string) => (by === 'channel' ? chColor(k) : VERTICAL_COLORS[k] ?? '#94a3b8');
  const names = keyOrder.map(nameOf);
  const colors = Object.fromEntries(keyOrder.map((k) => [nameOf(k), colorOf(k)]));
  const tLabels = timeline.map((t) => t.p.label);
  const revData = timeline.map((t) => Object.fromEntries(keyOrder.map((k) => [nameOf(k), t.cols.find((c) => c.key === k)?.rev ?? 0])));
  const revLines = keyOrder.map((k) => ({ name: nameOf(k), color: colorOf(k), values: timeline.map((t) => t.cols.find((c) => c.key === k)?.rev ?? null) }));
  const nmLines = keyOrder.map((k) => ({
    name: nameOf(k), color: colorOf(k),
    values: timeline.map((t) => {
      const c = t.cols.find((x) => x.key === k);
      return c && c.rev > 0 && isRealRow(t.p.level, 'net_income') ? c.netIncome / c.rev : null;
    }),
  }));
  const legend = keyOrder.map((k) => ({ label: nameOf(k), color: colorOf(k) }));
  const donut = slice.columns.filter((c) => c.rev > 0).map((c) => ({ key: c.label, value: c.rev }));
  const donutColors = Object.fromEntries(slice.columns.map((c) => [c.label, colorOf(c.key)]));
  const real = (k: string) => isRealRow(period.level, k);
  const nm = period.netRevenue ? period.netIncome / period.netRevenue : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pills label="Basis" value={basis} onChange={setBasis}
            options={[{ id: 'anchored', label: 'MIS-anchored' }, { id: 'bottomup', label: 'Bottom-up + Recon' }]} />
          <Pills label="Columns" value={by} onChange={setBy} options={[{ id: 'channel', label: 'Channels' }, { id: 'vertical', label: 'Verticals' }]} />
        </div>
        <LevelBadge level={period.level} published={period.published} />
      </div>

      {basis === 'anchored' ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
          <span className="font-medium text-slate-800">Totals hold, splits are data-driven.</span> The company P&amp;L is the book of
          record and does not move; each line is split across channels — revenue by each channel’s real revenue share,
          <span className="font-medium"> COGM by the real per-unit COGS of the SKU mix</span> sold there,
          <span className="font-medium"> Sales &amp; Marketing by each channel’s real ad spend</span> (so OEM/B2B and Offline/GT carry
          almost none), and channel &amp; fulfilment, platform, opex and non-operating by revenue share. COGM includes the 10% factory
          cost. No reconciliation column — the Total ties to the MIS exactly.
        </div>
      ) : (
        <BasisNote slice={slice} dim={by === 'vertical' ? 'vertical' : 'channel'} hasTally={period.hasTally} />
      )}

      {slice.columns.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KpiTile label="Net Revenue" value={inr(period.netRevenue)} />
          <KpiTile label="EBITDA" value={real('ebitda') ? inr(period.ebitda) : '—'} sub={`across ${slice.columns.length} ${by === 'vertical' ? 'vertical' : 'channel'}${slice.columns.length === 1 ? '' : 's'}`} />
          <KpiTile label="Net margin %" value={real('net_income') ? pctStr(nm) : '—'} />
        </div>
      )}

      <Fold id="ch-table" title={`Channel P&L · ${period.label}`} meta="₹, costs negative · % of rev under each column">
        {basis === 'anchored' && anchored.length === 0
          ? <Empty what="SKU × channel data" />
          : <FullPnlTable slice={slice} firstCol="Particulars" level={period.level} pctHeader />}
      </Fold>

      {keyOrder.length > 0 && (
        <>
          <Fold id="ch-grouped" secondary title="Revenue by channel — every period, all years" meta="One bar per channel within each period (follows the grain)">
            <GroupedBarChart labels={tLabels} keys={names} colors={colors} data={revData} height={300} valueFormat={(v) => inr(v)} />
            <div className="mt-2"><Legend items={legend} /></div>
          </Fold>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Fold id="ch-stacked" secondary title="Revenue mix by channel — since inception" meta="Net revenue per channel across every period">
                <StackedBarChart labels={tLabels} keys={names} colors={colors} data={revData} height={280} />
                <div className="mt-2"><Legend items={legend} /></div>
              </Fold>
            </div>
            <Fold id="ch-donut" secondary title={`Revenue share · ${period.label}`}>
              <div className="flex justify-center py-1"><DonutChart data={donut} colors={donutColors} size={180} /></div>
              <div className="mt-2"><Legend items={slice.columns.map((c) => ({ label: `${c.label} ${slice.total.rev ? pctStr(c.rev / slice.total.rev, 0) : ''}`, color: colorOf(c.key) }))} /></div>
            </Fold>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Fold id="ch-lines" secondary title="Revenue by channel over time">
              <LineChart labels={tLabels} series={revLines} valueFormat={(v) => inr(v)} height={260} />
              <div className="mt-2"><Legend items={legend} /></div>
            </Fold>
            <Fold id="ch-nm" secondary title="Net margin % by channel" meta="Net income ÷ revenue, full-close periods only">
              <LineChart labels={tLabels} series={nmLines} percent yFormat={(v) => `${Math.round(v * 100)}%`} valueFormat={(v) => pctStr(v)} height={260} />
              <div className="mt-2"><Legend items={legend} /></div>
            </Fold>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// SKU (all, full P&L)
// ============================================================================

export function SkuTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  const slice = useMemo(() => slicePnl(period, cells, periodKeys, 'sku'), [period, cells, periodKeys]);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><LevelBadge level={period.level} published={period.published} /></div>
      <FullPnlTable slice={slice} firstCol="Line" level={period.level} pctHeader />
      <BasisNote slice={slice} dim="SKU" hasTally={period.hasTally} />
    </div>
  );
}

// ============================================================================
// SKU × Channel — matrix (metric toggle, transpose) + full P&L slices
// ============================================================================

type MatrixMetric = 'con' | 'rev' | 'sm' | 'cm' | 'u';

export function SkuChannelTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  const { chName } = useLiveView();
  // mode 'matrix'  → products × channels grid with a metric toggle
  // mode 'sku'     → SKU × Channel: pick a SKU, columns are its channels (full P&L)
  // mode 'channel' → Channel × SKU: pick a channel, columns are its SKUs (full P&L)
  const [mode, setMode] = useState<'matrix' | 'sku' | 'channel'>('matrix');
  const [sel, setSel] = useState<string>('');
  const orient = mode === 'channel' ? 'channel' : 'sku';
  const options = useMemo(() => sliceOptions(cells, periodKeys, orient), [cells, periodKeys, orient]);
  const selected = options.find((o) => o.key === sel)?.key ?? options[0]?.key ?? '';
  const columnBy: SliceColumnBy = orient === 'sku' ? 'channel' : 'sku';
  const slice = useMemo(() => {
    if (mode === 'matrix' || !selected) return null;
    const s = slicePnl(period, cells, periodKeys, columnBy, orient === 'sku' ? { product: selected } : { channel: selected as SalesChannel });
    return columnBy === 'channel' ? { ...s, columns: s.columns.map((c) => ({ ...c, label: chName(c.key) })) } : s;
  }, [mode, period, cells, periodKeys, columnBy, orient, selected, chName]);
  if (options.length === 0) return <Empty what="SKU × channel data" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pills label="View" value={mode} onChange={(v) => { setMode(v); setSel(''); }}
          options={[{ id: 'matrix', label: 'Matrix' }, { id: 'sku', label: 'SKU × Channel' }, { id: 'channel', label: 'Channel × SKU' }]} />
        <span className="ml-auto"><LevelBadge level={period.level} published={period.published} /></span>
      </div>
      {mode === 'matrix' ? <SkuMatrix period={period} cells={cells} periodKeys={periodKeys} /> : (
        <>
          {orient === 'channel' && options.length <= 10 ? (
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <button key={o.key} type="button" onClick={() => setSel(o.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs border ${o.key === selected ? 'bg-brand-50 text-brand-700 font-medium border-brand-200' : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'}`}>
                  {chName(o.key)}
                </button>
              ))}
            </div>
          ) : (
            <select value={selected} onChange={(e) => setSel(e.target.value)} aria-label={orient === 'sku' ? 'SKU' : 'Channel'}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs max-w-full sm:max-w-[260px]">
              {options.map((o) => <option key={o.key} value={o.key}>{orient === 'channel' ? chName(o.label) : o.label}</option>)}
            </select>
          )}
          {slice && <FullPnlTable slice={slice} firstCol={orient === 'sku' ? 'Line  (channels →)' : 'Line  (SKUs →)'} level={period.level} pctHeader />}
          <Note>
            {orient === 'sku' ? `Full P&L for “${selected}” across every channel it sold in.` : `Full P&L for every SKU under ${chName(selected)}.`}{' '}
            Net Revenue → CM2 is each column’s own connector numbers (channel-specific fees &amp; ad); CM3, OPEX and finance are
            spread pro-rata by sales. Totals are for this slice, not the whole company.
          </Note>
        </>
      )}
    </div>
  );
}

function SkuMatrix({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  const { chName } = useLiveView();
  const [metric, setMetric] = useState<MatrixMetric>('con');
  const [transpose, setTranspose] = useState(false);
  const mx = useMemo(() => liveSkuChannelMatrix(cells, periodKeys), [cells, periodKeys]);
  const cm2Real = isRealRow(period.level, 'cm2');
  const rowKeys = transpose ? (mx.channels as string[]) : mx.products;
  const colKeys = transpose ? mx.products : (mx.channels as string[]);
  const label = (k: string, isCh: boolean) => (isCh ? chName(k) : k);
  const at = (rk: string, ck: string) => (transpose ? mx.cell(ck, rk as SalesChannel) : mx.cell(rk, ck as SalesChannel));
  const rowTot = (rk: string) => (transpose ? mx.channelTotal(rk as SalesChannel) : mx.productTotal(rk));
  const colTot = (ck: string) => (transpose ? mx.productTotal(ck) : mx.channelTotal(ck as SalesChannel));
  const fmt = (a: { rev: number; con: number; sm: number; u: number } | undefined) => {
    if (!a || (a.rev === 0 && a.con === 0 && a.u === 0)) return <span className="text-slate-300">·</span>;
    if (metric === 'rev') return inr(a.rev);
    if (metric === 'u') return Math.round(a.u).toLocaleString('en-IN');
    if (!cm2Real && (metric === 'con' || metric === 'cm')) return ND;
    if (metric === 'con') return inr(a.con);
    if (metric === 'sm') return a.sm > 0 ? inr(a.sm) : <span className="text-slate-300">·</span>;
    return a.rev > 0 ? pctStr(a.con / a.rev) : <span className="text-slate-300">·</span>;
  };
  const nonAcc = mx.products.filter((p) => !p.startsWith('Accessory')).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Revenue" value={inr(mx.grand.rev)} />
        <KpiTile label="Contribution" value={cm2Real ? inr(mx.grand.con) : '—'} sub={`${nonAcc} products × ${mx.channels.length} channels`} />
        <KpiTile label="Blended CM %" value={cm2Real && mx.grand.rev > 0 ? pctStr(mx.grand.con / mx.grand.rev) : '—'} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pills label="Metric" value={metric} onChange={setMetric}
          options={[{ id: 'con', label: 'CM2' }, { id: 'rev', label: 'Revenue' }, { id: 'sm', label: 'Ad spend' }, { id: 'cm', label: 'CM2 %' }, { id: 'u', label: 'Units' }]} />
        <Pills label="Orientation" value={transpose ? 't' : 'n'} onChange={(v) => setTranspose(v === 't')}
          options={[{ id: 'n', label: 'SKU × Channel' }, { id: 't', label: 'Channel × SKU' }]} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs border-collapse whitespace-nowrap">
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200">
              <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white z-10">{transpose ? 'Channel' : 'Product'}</th>
              {colKeys.map((c) => <th key={c} className="py-1.5 px-2 text-right font-medium text-slate-600">{label(c, !transpose)}</th>)}
              <th className="py-1.5 px-3 text-right font-semibold text-slate-700">Total</th>
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((rk) => {
              const faint = !transpose && rk.startsWith('Accessory');
              return (
                <tr key={rk} className={`border-b border-slate-50 ${faint ? 'text-slate-400 italic' : 'text-slate-600'}`}>
                  <td className="py-1.5 px-3 sticky left-0 bg-white font-medium">{label(rk, transpose)}</td>
                  {colKeys.map((ck) => <td key={ck} className="py-1.5 px-2 text-right tabular-nums">{fmt(at(rk, ck))}</td>)}
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-slate-800">{fmt(rowTot(rk))}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
              <td className="py-1.5 px-3 sticky left-0 bg-white">Total</td>
              {colKeys.map((ck) => <td key={ck} className="py-1.5 px-2 text-right tabular-nums">{fmt(colTot(ck))}</td>)}
              <td className="py-1.5 px-3 text-right tabular-nums">{fmt(mx.grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <Note>
        CM2 = revenue − COGM (product COGS + 10% factory) − channel &amp; fulfilment − ads. Ad spend is measured per product
        (Meta/Google mapped by campaign; Amazon by advertised product). Accessory rows in italics, sorted last.
        {!cm2Real && ' This period is top line only — CM2 needs the BOM (costs) for every month in it.'}
      </Note>
    </div>
  );
}

// ============================================================================
// Units sold (quantity) by product × channel
// ============================================================================

export function SkuUnitsTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  const { chName } = useLiveView();
  const { products, channels, units, rowTotal, colTotal, grand } = useMemo(() => {
    const inPeriod = cells.filter((c) => periodKeys.has(c.m));
    const units = new Map<string, Map<string, number>>(); // product -> channel -> units
    const colTotal = new Map<string, number>();
    for (const c of inPeriod) {
      if (!c.u) continue;
      const row = units.get(c.p) ?? new Map<string, number>();
      row.set(c.ch, (row.get(c.ch) ?? 0) + c.u);
      units.set(c.p, row);
      colTotal.set(c.ch, (colTotal.get(c.ch) ?? 0) + c.u);
    }
    const rowTotal = new Map<string, number>();
    for (const [p, row] of units) rowTotal.set(p, [...row.values()].reduce((s, v) => s + v, 0));
    const products = [...units.keys()].sort((a, b) => (rowTotal.get(b) ?? 0) - (rowTotal.get(a) ?? 0));
    const channels = [...colTotal.keys()].sort((a, b) => (colTotal.get(b) ?? 0) - (colTotal.get(a) ?? 0));
    const grand = [...colTotal.values()].reduce((s, v) => s + v, 0);
    return { products, channels, units, rowTotal, colTotal, grand };
  }, [cells, periodKeys]);

  if (products.length === 0) return <Empty what="units data" />;
  const n = (v: number) => Math.round(v).toLocaleString('en-IN');
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><LevelBadge level={period.level} published={period.published} /></div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200">
              <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white z-10">Product</th>
              {channels.map((ch) => <th key={ch} className="py-1.5 px-2 text-right font-medium whitespace-nowrap">{chName(ch)}</th>)}
              <th className="py-1.5 px-3 text-right font-semibold text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const row = units.get(p)!;
              return (
                <tr key={p} className="border-b border-slate-50">
                  <td className="py-1.5 px-3 sticky left-0 bg-white text-slate-700 whitespace-nowrap">{p}</td>
                  {channels.map((ch) => {
                    const v = row.get(ch) ?? 0;
                    return <td key={ch} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{v ? n(v) : <span className="text-slate-300">—</span>}</td>;
                  })}
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-slate-800">{n(rowTotal.get(p) ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/60">
              <td className="py-1.5 px-3 sticky left-0 bg-slate-50 font-semibold text-slate-700">Total</td>
              {channels.map((ch) => <td key={ch} className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-800">{n(colTotal.get(ch) ?? 0)}</td>)}
              <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-slate-900">{n(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Note>Quantity sold per product, split by channel, for the selected period. Units are net of returns where the channel reports them.</Note>
    </div>
  );
}

export function Empty({ what }: { what: string }) {
  return (
    <p className="text-sm text-slate-400 py-6 text-center">
      No {what} for this period yet. Upload marketplace settlements and the Tranzact BOM on the{' '}
      <a href="/reporting/mis/ingest" className="text-brand-600 underline">Upload data</a> page.
    </p>
  );
}
