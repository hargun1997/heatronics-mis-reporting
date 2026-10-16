// ----------------------------------------------------------------------------
// Live MIS deck tabs — the legacy deck's structure (Overview / P&L / Channels /
// SKU / SKU×Channel), computed live from the durable uploads via liveDeck +
// liveAnalytics. Numbers below a month's completeness level are shown muted,
// never faked.
// ----------------------------------------------------------------------------

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { KpiTile } from '../ui';
import {
  inr, pctStr, LineChart, DonutChart, WaterfallChart, Legend,
  CHANNEL_COLORS, SERIES_COLORS, type LineSeries, type WaterfallStep,
} from '../mis-deck/charts';
import type { SkuCell } from '../../data/misDeck/skuChannelPnl';
import type { SalesChannel } from '../../data/misDeck/misDeckData';
import type { CompletenessLevel, TrafficRow } from '../../data/misDeck/liveDeck';
import {
  marginPct, slicePnl, sliceOptions,
  type PeriodAgg, type PnlColumn, type SlicePnl, type SliceColumnBy,
} from '../../data/misDeck/liveAnalytics';
import type { CascadeLine } from '../../data/monthClose/schema';

// Which cascade rows are real at each completeness level.
const REAL_ROWS: Record<CompletenessLevel, Set<string>> = {
  full: new Set(['net_revenue', 'cogm', 'gross_margin', 'channel_fulfilment', 'cm1', 'sales_marketing', 'cm2', 'platform_payment', 'cm3', 'opex', 'ebitda', 'non_operating', 'net_income']),
  contribution: new Set(['net_revenue', 'cogm', 'gross_margin', 'channel_fulfilment', 'cm1', 'sales_marketing', 'cm2']),
  topline: new Set(['net_revenue', 'channel_fulfilment', 'sales_marketing']),
};

const LEVEL_BADGE: Record<CompletenessLevel, { label: string; cls: string }> = {
  full: { label: 'Full close', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  contribution: { label: 'To CM2', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  topline: { label: 'Top line', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export function LevelBadge({ level }: { level: CompletenessLevel }) {
  const b = LEVEL_BADGE[level];
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${b.cls}`}>{b.label}</span>;
}

// ---- Overview --------------------------------------------------------------

// Channel colours, with the channels the base palette doesn't name.
const CH_COLORS: Record<string, string> = {
  ...CHANNEL_COLORS, Flipkart: '#1D4ED8', GT: '#16A34A', B2B: '#9333EA',
};

/** ▲/▼ growth chip vs the prior period of the same grain. */
function GrowthChip({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null || prev === 0) return null;
  const g = (cur - prev) / Math.abs(prev);
  const up = g >= 0;
  return (
    <span className={`text-[10px] font-medium ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
      {up ? '▲' : '▼'} {pctStr(Math.abs(g))}
    </span>
  );
}

export function OverviewTab({ period, periods, traffic = [] }: { period: PeriodAgg; periods: PeriodAgg[]; traffic?: TrafficRow[] }) {
  const real = REAL_ROWS[period.level];
  const idx = periods.findIndex((p) => p.key === period.key);
  const prev = idx > 0 ? periods[idx - 1] : null;
  const gmPct = marginPct(period.grossMargin, period.netRevenue);
  const cm2Pct = marginPct(period.cm2, period.netRevenue);
  const ebitdaPct = marginPct(period.ebitda, period.netRevenue);
  const ND = '—';

  // Trend series across the whole history (muted where a period isn't real yet).
  const labels = periods.map((p) => p.label);
  const realV = (p: PeriodAgg, key: string, v: number): number | null => (REAL_ROWS[p.level].has(key) ? v : null);
  const moneySeries: LineSeries[] = [
    { name: 'Net Revenue', color: SERIES_COLORS[0], values: periods.map((p) => p.netRevenue) },
    { name: 'CM2', color: SERIES_COLORS[1], values: periods.map((p) => realV(p, 'cm2', p.cm2)) },
    { name: 'EBITDA', color: SERIES_COLORS[2], values: periods.map((p) => realV(p, 'ebitda', p.ebitda)) },
  ];
  const pctSeries: LineSeries[] = [
    { name: 'GM %', color: SERIES_COLORS[0], values: periods.map((p) => (p.netRevenue ? realV(p, 'gross_margin', p.grossMargin / p.netRevenue) : null)) },
    { name: 'CM2 %', color: SERIES_COLORS[1], values: periods.map((p) => (p.netRevenue ? realV(p, 'cm2', p.cm2 / p.netRevenue) : null)) },
    { name: 'EBITDA %', color: SERIES_COLORS[2], values: periods.map((p) => (p.netRevenue ? realV(p, 'ebitda', p.ebitda / p.netRevenue) : null)) },
  ];

  const mix = (Object.entries(period.netByChannel) as [string, number][])
    .filter(([, v]) => v > 0).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
  const totalMix = mix.reduce((s, d) => s + d.value, 0);

  // P&L waterfall for the selected period — the lines that are real at its level.
  const WF: { label: string; value: number; type: 'total' | 'cost'; real: string }[] = [
    { label: 'Net Rev', value: period.netRevenue, type: 'total', real: 'net_revenue' },
    { label: '− COGM', value: -period.cogm, type: 'cost', real: 'cogm' },
    { label: 'Gross', value: period.grossMargin, type: 'total', real: 'gross_margin' },
    { label: '− Ch & Ful', value: -period.channelFulfillment, type: 'cost', real: 'channel_fulfilment' },
    { label: 'CM1', value: period.cm1, type: 'total', real: 'cm1' },
    { label: '− S&M', value: -period.salesMarketing, type: 'cost', real: 'sales_marketing' },
    { label: 'CM2', value: period.cm2, type: 'total', real: 'cm2' },
    { label: '− Platform', value: -period.platformCosts, type: 'cost', real: 'platform_payment' },
    { label: '− OPEX', value: -period.opex, type: 'cost', real: 'opex' },
    { label: 'EBITDA', value: period.ebitda, type: 'total', real: 'ebitda' },
    { label: 'Net Inc', value: period.netIncome, type: 'total', real: 'net_income' },
  ];
  const steps: WaterfallStep[] = WF.filter((s) => real.has(s.real)).map(({ label, value, type }) => ({ label, value, type }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Net Revenue" value={inr(period.netRevenue)} sub={<GrowthChip cur={period.netRevenue} prev={prev?.netRevenue ?? null} />} />
        <KpiTile label="Gross Margin" value={real.has('gross_margin') && gmPct != null ? pctStr(gmPct) : ND} sub="of net rev" />
        <KpiTile label="CM2" value={real.has('cm2') ? inr(period.cm2) : ND} sub={real.has('cm2') ? <GrowthChip cur={period.cm2} prev={prev && REAL_ROWS[prev.level].has('cm2') ? prev.cm2 : null} /> : 'needs COGM'} />
        <KpiTile label="EBITDA" value={real.has('ebitda') ? inr(period.ebitda) : ND} sub={real.has('ebitda') && ebitdaPct != null ? pctStr(ebitdaPct) : 'needs Tally'} />
        <KpiTile label="Net Income" value={real.has('net_income') ? inr(period.netIncome) : ND} sub={real.has('net_income') ? <GrowthChip cur={period.netIncome} prev={prev && REAL_ROWS[prev.level].has('net_income') ? prev.netIncome : null} /> : 'needs Tally'} />
        <KpiTile label="CM2 %" value={real.has('cm2') && cm2Pct != null ? pctStr(cm2Pct) : ND} sub="of net rev" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-1.5">Revenue &amp; margin — trend</h4>
          <LineChart labels={labels} series={moneySeries} />
          <Legend items={moneySeries.map((s) => ({ label: s.name, color: s.color }))} />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-1.5">Margin % — trend</h4>
          <LineChart labels={labels} series={pctSeries} percent yFormat={(n) => pctStr(n)} valueFormat={(n) => pctStr(n)} />
          <Legend items={pctSeries.map((s) => ({ label: s.name, color: s.color }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-1.5">Channel mix · {period.label}</h4>
          {mix.length === 0 ? <p className="text-xs text-slate-400 py-6 text-center">No channel revenue.</p> : (
            <div className="flex items-center gap-4">
              <DonutChart data={mix} colors={CH_COLORS} />
              <div className="space-y-1">
                {mix.map((d) => (
                  <div key={d.key} className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CH_COLORS[d.key] ?? '#94a3b8' }} />
                    <span className="text-slate-600 w-20">{d.key}</span>
                    <span className="tabular-nums text-slate-500">{pctStr(totalMix ? d.value / totalMix : 0)}</span>
                    <span className="tabular-nums text-slate-400">{inr(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-700 mb-1.5">P&amp;L bridge · {period.label}</h4>
          {steps.length >= 3 ? <WaterfallChart steps={steps} />
            : <p className="text-xs text-slate-400 py-6 text-center">Upload the month's Tally P&amp;L to see the full bridge.</p>}
        </div>
      </div>

      {traffic.length > 0 && <AmazonTraffic rows={traffic} label={period.label} />}

      <p className="text-[11px] text-slate-400">
        {period.label} · <LevelBadge level={period.level} />{' '}
        {period.level === 'full'
          ? 'every line is real and reconciled to Tally.'
          : period.level === 'contribution'
            ? 'real through Contribution Margin; OPEX, EBITDA and Net Income need the Tally P&L for this month.'
            : 'top line only; upload the BOM and Tally P&L to complete the cascade.'}
      </p>
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
    <div>
      <h4 className="text-xs font-semibold text-slate-700 mb-1.5">
        Amazon traffic &amp; conversion · {label}
        <span className="ml-2 font-normal text-slate-400">sessions → units ordered (from the Business Report — not revenue)</span>
      </h4>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
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
      </div>
    </div>
  );
}

// ---- P&L -------------------------------------------------------------------

interface PnlRow { k: string; label: string; get: (p: PeriodAgg) => number; kind: 'rev' | 'cost' | 'margin'; pctOf?: boolean; }
const PNL_ROWS: PnlRow[] = [
  { k: 'net_revenue', label: 'Net Revenue', get: (p) => p.netRevenue, kind: 'rev' },
  { k: 'cogm', label: 'COGM', get: (p) => -p.cogm, kind: 'cost' },
  { k: 'gross_margin', label: 'Gross Margin', get: (p) => p.grossMargin, kind: 'margin', pctOf: true },
  { k: 'channel_fulfilment', label: 'Channel & Fulfilment', get: (p) => -p.channelFulfillment, kind: 'cost' },
  { k: 'cm1', label: 'CM1', get: (p) => p.cm1, kind: 'margin', pctOf: true },
  { k: 'sales_marketing', label: 'Sales & Marketing', get: (p) => -p.salesMarketing, kind: 'cost' },
  { k: 'cm2', label: 'CM2', get: (p) => p.cm2, kind: 'margin', pctOf: true },
  { k: 'platform_payment', label: 'Platform & Payment', get: (p) => -p.platformCosts, kind: 'cost' },
  { k: 'cm3', label: 'CM3', get: (p) => p.cm3, kind: 'margin', pctOf: true },
  { k: 'opex', label: 'Operating Expenses', get: (p) => -p.opex, kind: 'cost' },
  { k: 'ebitda', label: 'EBITDA', get: (p) => p.ebitda, kind: 'margin', pctOf: true },
  { k: 'non_operating', label: 'Non-Operating + Fundraising', get: (p) => -(p.nonOperating + p.costOfFundraising), kind: 'cost' },
  { k: 'net_income', label: 'Net Income', get: (p) => p.netIncome, kind: 'margin', pctOf: true },
];

// Which cost rows drill down into Tally's own ledger buckets, and which cascade
// blocks they expand. "Non-Operating + Fundraising" pools its two blocks.
const PNL_EXPANDABLE: Record<string, CascadeLine[]> = {
  channel_fulfilment: ['channel_fulfilment'],
  sales_marketing: ['sales_marketing'],
  platform_payment: ['platform_payment'],
  non_operating: ['non_operating', 'cost_of_fundraising'],
};

export function PnlTab({ periods, showPct }: { periods: PeriodAgg[]; showPct: boolean }) {
  // Show the whole history (Dec-2023 onward), scrollable. Start scrolled to the
  // most recent month so the current period is in view without hiding the past.
  const cols = periods;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cols.length]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  // Tally bucket lines for an expandable row: the union of ledger lines across
  // the shown periods, in first-seen (cascade) order.
  const bucketLines = (cascades: CascadeLine[]) => {
    const seen = new Map<string, string>();
    for (const p of cols) for (const l of p.tallyLines ?? []) {
      if (cascades.includes(l.cascadeLine) && !seen.has(l.lineKey)) seen.set(l.lineKey, l.label);
    }
    return [...seen.entries()].map(([lineKey, label]) => ({ lineKey, label }));
  };

  // Sales & Marketing drills into its ad-platform split (Google / Meta / Amazon /
  // Flipkart / Other), rebuilt from connector ad facts — the breakdown Tally no
  // longer carries. Union the platform labels across the shown periods, in a
  // stable order, then any extras as they first appear.
  const MKT_ORDER = ['Google Ads', 'Meta (FB / Instagram)', 'Amazon Ads', 'Flipkart Ads', 'Other / Blended'];
  const marketingLines = () => {
    const present = new Set<string>();
    for (const p of cols) for (const label of Object.keys(p.marketingByPlatform ?? {})) present.add(label);
    const ordered = [...MKT_ORDER.filter((l) => present.has(l)), ...[...present].filter((l) => !MKT_ORDER.includes(l))];
    return ordered.map((label) => ({ lineKey: label, label }));
  };

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-200">
            <th className="py-1.5 pr-3 text-left font-medium sticky left-0 bg-white z-10">Line</th>
            {cols.map((p) => (
              <th key={p.key} className="py-1.5 px-2 text-right font-medium whitespace-nowrap">
                <div>{p.label}</div><div className="font-normal"><LevelBadge level={p.level} /></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PNL_ROWS.map((row) => {
            const isMarketing = row.k === 'sales_marketing';
            const cascades = PNL_EXPANDABLE[row.k];
            const lines = isMarketing ? marketingLines() : cascades ? bucketLines(cascades) : [];
            const canExpand = lines.length > 0;
            const isOpen = expanded.has(row.k);
            return (
              <Fragment key={row.k}>
                <tr className={`border-b border-slate-50 ${row.kind === 'margin' ? 'bg-slate-50/60' : ''}`}>
                  <td className={`py-1.5 pr-3 sticky left-0 bg-white ${row.kind === 'margin' ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                    {canExpand ? (
                      <button onClick={() => toggle(row.k)} className="inline-flex items-center gap-1 hover:text-slate-900">
                        <span className="text-slate-400 w-2 inline-block">{isOpen ? '▾' : '▸'}</span>
                        − {row.label}
                      </button>
                    ) : (
                      <>{row.kind === 'cost' ? '− ' : ''}{row.label}</>
                    )}
                  </td>
                  {cols.map((p) => {
                    const real = REAL_ROWS[p.level].has(row.k);
                    if (!real) return <td key={p.key} className="py-1.5 px-2 text-right text-slate-300">—</td>;
                    const v = row.get(p);
                    const pct = row.pctOf ? marginPct(v, p.netRevenue) : null;
                    return (
                      <td key={p.key} className={`py-1.5 px-2 text-right tabular-nums ${row.kind === 'margin' ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                        {showPct && row.pctOf ? (pct != null ? pctStr(pct) : '—') : inr(v)}
                      </td>
                    );
                  })}
                </tr>
                {isOpen && lines.map((ln) => (
                  <tr key={`${row.k}:${ln.lineKey}`} className="border-b border-slate-50 bg-white">
                    <td className="py-1 pr-3 pl-6 sticky left-0 bg-white text-[11px] text-slate-500">{ln.label}</td>
                    {cols.map((p) => {
                      if (isMarketing) {
                        const v = p.marketingByPlatform?.[ln.lineKey];
                        return (
                          <td key={p.key} className="py-1 px-2 text-right tabular-nums text-[11px] text-slate-500">
                            {v != null && v !== 0 ? inr(-v) : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      }
                      const line = (p.tallyLines ?? []).find((l) => l.lineKey === ln.lineKey);
                      return (
                        <td key={p.key} className="py-1 px-2 text-right tabular-nums text-[11px] text-slate-500">
                          {line ? inr(line.total) : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-2">
        ▸ Click a cost line to drill in — Sales &amp; Marketing splits by ad platform (Google / Meta / Amazon / Flipkart); the rest drill into Tally’s own ledger buckets.
      </p>
    </div>
  );
}

// ---- Bifurcated full P&L (shared table) ------------------------------------
//
// One table renders every bifurcated P&L (by channel, by vertical, by SKU, and
// the SKU×Channel / Channel×SKU slices). Each COLUMN is a full cascade to Net
// Income: Net Revenue → CM2 is the column's own connector numbers (channel-
// specific fees & ad, BOM cost + 10% factory), and CM3 / OPEX / finance are
// spread pro-rata by sales. A whole-company slice also carries a "Recon → Tally"
// column so every line ties to the Tally Total.

// `real` is the REAL_ROWS key for completeness gating — rows below a month's
// level are muted to '—', exactly as the company P&L and Overview tabs do, so
// the bifurcated views never show fabricated numbers on a not-yet-closed month.
interface CascadeRow { k: keyof PnlColumn; label: string; kind: 'rev' | 'cost' | 'margin'; real: string; strong?: boolean }
const FULL_CASCADE: CascadeRow[] = [
  { k: 'rev', label: 'Net Revenue', kind: 'rev', real: 'net_revenue' },
  { k: 'cogm', label: 'COGM', kind: 'cost', real: 'cogm' },
  { k: 'gm', label: 'Gross Margin', kind: 'margin', real: 'gross_margin' },
  { k: 'fulfilment', label: 'Channel & Fulfilment', kind: 'cost', real: 'channel_fulfilment' },
  { k: 'cm1', label: 'CM1', kind: 'margin', real: 'cm1' },
  { k: 'marketing', label: 'Sales & Marketing', kind: 'cost', real: 'sales_marketing' },
  { k: 'cm2', label: 'CM2', kind: 'margin', real: 'cm2' },
  { k: 'platform', label: 'Platform & Payment', kind: 'cost', real: 'platform_payment' },
  { k: 'cm3', label: 'CM3', kind: 'margin', real: 'cm3' },
  { k: 'opex', label: 'Operating Expenses', kind: 'cost', real: 'opex' },
  { k: 'ebitda', label: 'EBITDA', kind: 'margin', real: 'ebitda', strong: true },
  { k: 'nonOperating', label: 'Non-Operating + Fundraising', kind: 'cost', real: 'non_operating' },
  { k: 'netIncome', label: 'Net Income', kind: 'margin', real: 'net_income', strong: true },
];

function FullPnlTable({ slice, firstCol, level }: { slice: SlicePnl; firstCol: string; level: CompletenessLevel }) {
  // A tied whole-company slice is worth showing even with no connector columns —
  // its Tally Total still stands. Otherwise, nothing to render.
  if (slice.columns.length === 0 && !slice.tied) return <Empty what="data for this slice" />;
  const real = REAL_ROWS[level];
  const cols: PnlColumn[] = [...slice.columns, ...(slice.recon ? [slice.recon] : []), slice.total];
  const colCls = (c: PnlColumn) =>
    c.kind === 'total' ? 'font-semibold text-slate-800' : c.kind === 'recon' ? 'text-slate-400 italic' : 'text-slate-600';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-200">
            <th className="py-1.5 pr-3 text-left font-medium sticky left-0 bg-white">{firstCol}</th>
            {cols.map((c) => (
              <th key={c.key} title={c.label}
                className={`py-1.5 px-2 text-right font-medium whitespace-nowrap ${c.kind === 'total' ? 'text-slate-700' : c.kind === 'recon' ? 'text-slate-400' : ''}`}>
                <span className="inline-block max-w-[120px] truncate align-bottom">{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FULL_CASCADE.map((row) => {
            const isReal = real.has(row.real);
            return (
            <tr key={row.k as string} className={`border-b border-slate-50 ${row.kind === 'margin' ? 'bg-slate-50/60' : ''}`}>
              <td className={`py-1.5 pr-3 sticky left-0 bg-white ${row.strong || row.kind === 'margin' ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                {row.kind === 'cost' ? '− ' : ''}{row.label}
              </td>
              {cols.map((c) => {
                if (!isReal) return <td key={c.key} className="py-1.5 px-2 text-right text-slate-300">—</td>;
                const raw = c[row.k] as number;
                return (
                  <td key={c.key} className={`py-1.5 px-2 text-right tabular-nums ${colCls(c)}`}>
                    {inr(row.kind === 'cost' ? -raw : raw)}
                  </td>
                );
              })}
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BasisNote({ slice, dim, hasTally }: { slice: SlicePnl; dim: string; hasTally: boolean }) {
  return (
    <p className="text-[10px] text-slate-400">
      Each {dim} column is its own connector numbers to CM2 (channel-specific fees &amp; ad spend, BOM cost + 10% factory); CM3,
      OPEX and finance are spread pro-rata by sales.{' '}
      {slice.tied ? (
        <>The <span className="italic">Recon → Tally</span> column carries what the connectors don’t see, so every line sums across the columns to the Tally <span className="font-medium text-slate-500">Total</span>.</>
      ) : hasTally ? (
        'Totals are for this slice.'
      ) : (
        <>Upload the month’s Tally P&amp;L on the <a href="/reporting/mis/ingest" className="text-brand-600 underline">Upload data</a> page to light up CM3 and below.</>
      )}
    </p>
  );
}

// ---- Channels / Verticals (all, full P&L) ----------------------------------

export function ChannelsTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  const [by, setBy] = useState<'vertical' | 'channel'>('vertical');
  const slice = useMemo(() => slicePnl(period, cells, periodKeys, by), [period, cells, periodKeys, by]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {(['vertical', 'channel'] as const).map((x) => (
            <button key={x} onClick={() => setBy(x)}
              className={'px-2.5 py-1 text-xs ' + (by === x ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50')}>
              {x === 'vertical' ? 'Verticals' : 'Channels'}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-slate-400"><LevelBadge level={period.level} /></span>
      </div>
      <FullPnlTable slice={slice} firstCol="Line" level={period.level} />
      <BasisNote slice={slice} dim={by === 'vertical' ? 'vertical' : 'channel'} hasTally={period.hasTally} />
    </div>
  );
}

// ---- SKU (all, full P&L) ---------------------------------------------------

export function SkuTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  const slice = useMemo(() => slicePnl(period, cells, periodKeys, 'sku'), [period, cells, periodKeys]);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><span className="text-[10px] text-slate-400"><LevelBadge level={period.level} /></span></div>
      <FullPnlTable slice={slice} firstCol="Line" level={period.level} />
      <BasisNote slice={slice} dim="SKU" hasTally={period.hasTally} />
    </div>
  );
}

// ---- SKU × Channel / Channel × SKU (pick one, full P&L) --------------------

export function SkuChannelTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  // orient 'sku'     → SKU × Channel: pick a SKU, columns are its channels.
  // orient 'channel' → Channel × SKU: pick a channel, columns are its SKUs.
  const [orient, setOrient] = useState<'sku' | 'channel'>('sku');
  const [sel, setSel] = useState<string>('');
  const options = useMemo(() => sliceOptions(cells, periodKeys, orient), [cells, periodKeys, orient]);
  const selected = options.find((o) => o.key === sel)?.key ?? options[0]?.key ?? '';
  const columnBy: SliceColumnBy = orient === 'sku' ? 'channel' : 'sku';
  const slice = useMemo(
    () => (selected ? slicePnl(period, cells, periodKeys, columnBy, orient === 'sku' ? { product: selected } : { channel: selected as SalesChannel }) : null),
    [period, cells, periodKeys, columnBy, orient, selected],
  );
  if (options.length === 0) return <Empty what="SKU × channel data" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
          {([['sku', 'SKU × Channel'], ['channel', 'Channel × SKU']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setOrient(id); setSel(''); }}
              className={'px-2.5 py-1 text-xs ' + (orient === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50')}>
              {label}
            </button>
          ))}
        </div>
        <select value={selected} onChange={(e) => setSel(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs max-w-[260px]">
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <span className="text-[10px] text-slate-400 ml-auto"><LevelBadge level={period.level} /></span>
      </div>
      {slice && <FullPnlTable slice={slice} firstCol={orient === 'sku' ? 'Line  (channels →)' : 'Line  (SKUs →)'} level={period.level} />}
      <p className="text-[10px] text-slate-400">
        {orient === 'sku'
          ? `Full P&L for “${selected}” across every channel it sold in.`
          : `Full P&L for every SKU under ${selected}.`}{' '}
        Net Revenue → CM2 is each column’s own connector numbers (channel-specific fees &amp; ad); CM3, OPEX and finance are
        spread pro-rata by sales. Totals are for this slice, not the whole company.
      </p>
    </div>
  );
}

// ---- Units sold (quantity) by product × channel ----------------------------

export function SkuUnitsTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
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
    // Rows (products) and columns (channels) both ordered by total units, desc.
    const products = [...units.keys()].sort((a, b) => (rowTotal.get(b) ?? 0) - (rowTotal.get(a) ?? 0));
    const channels = [...colTotal.keys()].sort((a, b) => (colTotal.get(b) ?? 0) - (colTotal.get(a) ?? 0));
    const grand = [...colTotal.values()].reduce((s, v) => s + v, 0);
    return { products, channels, units, rowTotal, colTotal, grand };
  }, [cells, periodKeys]);

  if (products.length === 0) return <Empty what="units data" />;
  const n = (v: number) => Math.round(v).toLocaleString('en-IN');
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><span className="text-[10px] text-slate-400"><LevelBadge level={period.level} /></span></div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200">
              <th className="py-1.5 pr-3 text-left font-medium sticky left-0 bg-white z-10">Product</th>
              {channels.map((ch) => <th key={ch} className="py-1.5 px-2 text-right font-medium whitespace-nowrap">{ch}</th>)}
              <th className="py-1.5 pl-3 text-right font-semibold text-slate-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const row = units.get(p)!;
              return (
                <tr key={p} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 sticky left-0 bg-white text-slate-700">{p}</td>
                  {channels.map((ch) => {
                    const v = row.get(ch) ?? 0;
                    return <td key={ch} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{v ? n(v) : <span className="text-slate-300">—</span>}</td>;
                  })}
                  <td className="py-1.5 pl-3 text-right tabular-nums font-semibold text-slate-800">{n(rowTotal.get(p) ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50/60">
              <td className="py-1.5 pr-3 sticky left-0 bg-slate-50 font-semibold text-slate-700">Total</td>
              {channels.map((ch) => <td key={ch} className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-800">{n(colTotal.get(ch) ?? 0)}</td>)}
              <td className="py-1.5 pl-3 text-right tabular-nums font-semibold text-slate-900">{n(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-slate-400">
        Quantity sold per product, split by channel, for the selected period. Units are net of returns where the channel reports them.
      </p>
    </div>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <p className="text-sm text-slate-400 py-6 text-center">
      No {what} for this period yet. Upload marketplace settlements and the Tranzact BOM on the{' '}
      <a href="/reporting/mis/ingest" className="text-brand-600 underline">Upload data</a> page.
    </p>
  );
}
