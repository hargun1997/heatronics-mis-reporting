// ----------------------------------------------------------------------------
// Live MIS deck tabs — the legacy deck's structure (Overview / P&L / Channels /
// SKU / SKU×Channel), computed live from the durable uploads via liveDeck +
// liveAnalytics. Numbers below a month's completeness level are shown muted,
// never faked.
// ----------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { KpiTile } from '../ui';
import { inr, pctStr } from '../mis-deck/charts';
import type { SkuCell } from '../../data/misDeck/skuChannelPnl';
import { SALES_CHANNELS, type SalesChannel } from '../../data/misDeck/misDeckData';
import type { CompletenessLevel } from '../../data/misDeck/liveDeck';
import {
  channelRollup, skuRollup, skuChannelMatrix, marginPct,
  type PeriodAgg, type MatrixMetric,
} from '../../data/misDeck/liveAnalytics';

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

export function OverviewTab({ period }: { period: PeriodAgg }) {
  const real = REAL_ROWS[period.level];
  const topChannel = useMemo(() => {
    const entries = Object.entries(period.netByChannel) as [string, number][];
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0];
  }, [period]);
  const gmPct = marginPct(period.grossMargin, period.netRevenue);
  const cm2Pct = marginPct(period.cm2, period.netRevenue);
  const ebitdaPct = marginPct(period.ebitda, period.netRevenue);

  const ND = '—';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Net Revenue" value={inr(period.netRevenue)} />
        <KpiTile label="Gross Margin" value={real.has('gross_margin') && gmPct != null ? pctStr(gmPct) : ND} sub="of net rev" />
        <KpiTile label="CM2" value={real.has('cm2') ? inr(period.cm2) : ND} sub={cm2Pct != null && real.has('cm2') ? pctStr(cm2Pct) : 'needs COGM'} />
        <KpiTile label="EBITDA" value={real.has('ebitda') ? inr(period.ebitda) : ND} sub={real.has('ebitda') && ebitdaPct != null ? pctStr(ebitdaPct) : 'needs Tally'} />
        <KpiTile label="Net Income" value={real.has('net_income') ? inr(period.netIncome) : ND} sub="needs Tally" />
        <KpiTile label="Top channel" value={topChannel ? topChannel[0] : ND} sub={topChannel ? inr(topChannel[1]) : undefined} />
      </div>
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

export function PnlTab({ periods, showPct }: { periods: PeriodAgg[]; showPct: boolean }) {
  const cols = periods.slice(-12);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-200">
            <th className="py-1.5 pr-3 text-left font-medium sticky left-0 bg-white">Line</th>
            {cols.map((p) => (
              <th key={p.key} className="py-1.5 px-2 text-right font-medium whitespace-nowrap">
                <div>{p.label}</div><div className="font-normal"><LevelBadge level={p.level} /></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PNL_ROWS.map((row) => (
            <tr key={row.k} className={`border-b border-slate-50 ${row.kind === 'margin' ? 'bg-slate-50/60' : ''}`}>
              <td className={`py-1.5 pr-3 sticky left-0 bg-white ${row.kind === 'margin' ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                {row.kind === 'cost' ? '− ' : ''}{row.label}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Channels --------------------------------------------------------------

export function ChannelsTab({ period, cells, periodKeys }: { period: PeriodAgg; cells: SkuCell[]; periodKeys: Set<string> }) {
  const rollBy = useMemo(() => {
    const m = new Map<SalesChannel, ReturnType<typeof channelRollup>[number]>();
    for (const r of channelRollup(cells, periodKeys)) m.set(r.channel, r);
    return m;
  }, [cells, periodKeys]);

  // Net Revenue is the authoritative figure per channel (reconciles to the P&L);
  // COGM/fees/CM2 come from the SKU-level uploads, shown only where they cover
  // the channel's revenue well enough to be meaningful.
  const rows = useMemo(() => {
    const chans = SALES_CHANNELS.filter((ch) => (period.netByChannel[ch] ?? 0) !== 0 || rollBy.has(ch));
    return chans.map((ch) => {
      const roll = rollBy.get(ch);
      const revenue = period.netByChannel[ch] ?? roll?.revenue ?? 0;
      const coverage = roll && revenue ? roll.revenue / revenue : 0;
      const measured = !!roll && coverage >= 0.8;
      return { ch, revenue, roll, measured };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [period, rollBy]);

  const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
  const anyMeasured = rows.some((r) => r.measured);
  if (rows.length === 0) return <Empty what="channel data" />;
  const ND = <span className="text-slate-300">—</span>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-200 text-right">
            <th className="py-1.5 pr-3 text-left font-medium">Channel</th>
            <th className="py-1.5 px-2 font-medium">Mix</th>
            <th className="py-1.5 px-2 font-medium">Net Revenue</th>
            <th className="py-1.5 px-2 font-medium">COGM</th>
            <th className="py-1.5 px-2 font-medium">Fees</th>
            <th className="py-1.5 px-2 font-medium">Ad</th>
            <th className="py-1.5 px-2 font-medium">CM2</th>
            <th className="py-1.5 pl-2 font-medium">CM2 %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ ch, revenue, roll, measured }) => (
            <tr key={ch} className="border-b border-slate-50 text-right">
              <td className="py-1.5 pr-3 text-left text-slate-700 font-medium">{ch}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-400">{totalRev ? pctStr(revenue / totalRev) : '—'}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-700">{inr(revenue)}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-500">{measured && roll ? inr(roll.cogs + roll.factory) : ND}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-500">{measured && roll ? inr(roll.fees) : ND}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-500">{measured && roll ? inr(roll.ad) : ND}</td>
              <td className="py-1.5 px-2 tabular-nums font-semibold text-slate-800">{measured && roll ? inr(roll.cm2) : ND}</td>
              <td className="py-1.5 pl-2 tabular-nums text-slate-600">{measured && roll && roll.revenue ? pctStr(roll.cm2 / roll.revenue) : ND}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-2">
        Net Revenue is the P&amp;L figure per channel. COGM / Fees / CM2 come from the SKU-level uploads and show
        {anyMeasured ? ' where they cover the channel' : ' once that channel’s settlement is uploaded'} (COGM = product cost + 10% factory).
      </p>
    </div>
  );
}

// ---- SKU -------------------------------------------------------------------

export function SkuTab({ cells, periodKeys }: { cells: SkuCell[]; periodKeys: Set<string> }) {
  const rolls = useMemo(() => skuRollup(cells, periodKeys), [cells, periodKeys]);
  if (rolls.length === 0) return <Empty what="SKU contribution" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-[10px] text-slate-400 border-b border-slate-200 text-right">
            <th className="py-1.5 pr-3 text-left font-medium">Product</th>
            <th className="py-1.5 px-2 font-medium">Units</th>
            <th className="py-1.5 px-2 font-medium">Net Revenue</th>
            <th className="py-1.5 px-2 font-medium">COGM</th>
            <th className="py-1.5 px-2 font-medium">Fees</th>
            <th className="py-1.5 px-2 font-medium">Ad</th>
            <th className="py-1.5 px-2 font-medium">CM2</th>
            <th className="py-1.5 pl-2 font-medium">CM2 %</th>
          </tr>
        </thead>
        <tbody>
          {rolls.map((r) => (
            <tr key={r.product} className="border-b border-slate-50 text-right">
              <td className="py-1.5 pr-3 text-left text-slate-700 font-medium max-w-[220px] truncate" title={r.product}>{r.product}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-500">{r.units.toLocaleString('en-IN')}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-700">{inr(r.revenue)}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-500">{inr(r.cogs + r.factory)}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-500">{inr(r.fees)}</td>
              <td className="py-1.5 px-2 tabular-nums text-slate-500">{inr(r.ad)}</td>
              <td className="py-1.5 px-2 tabular-nums font-semibold text-slate-800">{inr(r.cm2)}</td>
              <td className="py-1.5 pl-2 tabular-nums text-slate-600">{r.revenue ? pctStr(r.cm2 / r.revenue) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- SKU × Channel ---------------------------------------------------------

const MATRIX_METRICS: { id: MatrixMetric; label: string; money: boolean }[] = [
  { id: 'cm2', label: 'CM2', money: true },
  { id: 'revenue', label: 'Revenue', money: true },
  { id: 'units', label: 'Units', money: false },
  { id: 'cm2pct', label: 'CM2 %', money: false },
];

export function SkuChannelTab({ cells, periodKeys }: { cells: SkuCell[]; periodKeys: Set<string> }) {
  const [metric, setMetric] = useState<MatrixMetric>('cm2');
  const m = useMemo(() => skuChannelMatrix(cells, periodKeys, metric), [cells, periodKeys, metric]);
  const def = MATRIX_METRICS.find((x) => x.id === metric)!;
  const fmt = (v: number | undefined) => v == null ? '·' : def.id === 'cm2pct' ? pctStr(v) : def.money ? inr(v) : v.toLocaleString('en-IN');
  if (m.products.length === 0) return <Empty what="SKU × channel data" />;
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
        {MATRIX_METRICS.map((x) => (
          <button key={x.id} onClick={() => setMetric(x.id)}
            className={'px-2.5 py-1 text-xs ' + (metric === x.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50')}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200">
              <th className="py-1.5 pr-3 text-left font-medium sticky left-0 bg-white">Product</th>
              {m.channels.map((ch) => <th key={ch} className="py-1.5 px-2 text-right font-medium">{ch}</th>)}
            </tr>
          </thead>
          <tbody>
            {m.products.map((p) => (
              <tr key={p} className="border-b border-slate-50">
                <td className="py-1.5 pr-3 text-slate-700 font-medium sticky left-0 bg-white max-w-[200px] truncate" title={p}>{p}</td>
                {m.channels.map((ch) => (
                  <td key={ch} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmt(m.cell[p]?.[ch])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <p className="text-sm text-slate-400 py-6 text-center">
      No {what} for this period yet. Upload marketplace settlements and the Tranzact BOM on the{' '}
      <a href="/reporting/mis/ingest" className="text-brand-600 underline">Data readiness</a> page.
    </p>
  );
}
