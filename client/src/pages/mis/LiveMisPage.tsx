// ----------------------------------------------------------------------------
// Live MIS — runtime run-rate from the connectors.
//
// Pulls a dated fact stream for a date range and rolls it up to Daily / Weekly
// / Monthly run-rate, sliced by Channel / SKU / SKU×Channel. Refresh re-pulls;
// auto-refresh keeps it live. This is the provisional, always-on view — the
// gated month close stays the published authority.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionCard } from '../../components/ui/Card';
import { inr } from '../../components/mis-deck/charts';
import { fetchFacts, type FactsResponse } from '../../data/liveMis/client';
import {
  periodsIn,
  rollup,
  totals,
  type Dimension,
  type Granularity,
  type MetricKey,
} from '../../data/liveMis/facts';

const iconLive = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const GRAINS: { id: Granularity; label: string; rr: string }[] = [
  { id: 'day', label: 'Daily', rr: 'DRR' },
  { id: 'week', label: 'Weekly', rr: 'WRR' },
  { id: 'month', label: 'Monthly', rr: 'MRR' },
];
const DIMS: { id: Dimension; label: string }[] = [
  { id: 'total', label: 'Total' },
  { id: 'channel', label: 'Channel' },
  { id: 'sku', label: 'SKU' },
  { id: 'sku_channel', label: 'SKU × Channel' },
];
const METRICS: { id: MetricKey; label: string; money: boolean }[] = [
  { id: 'revenue', label: 'Revenue', money: true },
  { id: 'net', label: 'Net (rev − fees)', money: true },
  { id: 'fees', label: 'Fees', money: true },
  { id: 'orders', label: 'Orders', money: false },
  { id: 'units', label: 'Units', money: false },
  { id: 'aov', label: 'AOV', money: true },
];

const AUTO_MS = 120_000; // 2 min

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
}

export function LiveMisPage() {
  const today = iso(new Date());
  const monthAgo = iso(new Date(Date.now() - 29 * 86400000));

  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [gran, setGran] = useState<Granularity>('day');
  const [dim, setDim] = useState<Dimension>('channel');
  const [metric, setMetric] = useState<MetricKey>('revenue');
  const [auto, setAuto] = useState(false);

  const [data, setData] = useState<FactsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetchFacts(from, to);
      setData(res);
      setFetchedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pull facts.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh keeps the view live while the tab is open.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void loadRef.current(), AUTO_MS);
    return () => clearInterval(t);
  }, [auto]);

  const facts = data?.facts ?? [];
  const metricDef = METRICS.find((m) => m.id === metric)!;
  const fmt = (v: number) => (metricDef.money ? inr(v) : v.toLocaleString('en-IN'));

  const sum = useMemo(() => totals(facts), [facts]);
  const buckets = useMemo(() => rollup(facts, gran, dim), [facts, gran, dim]);
  const periods = useMemo(() => periodsIn(buckets), [buckets]);

  // Pivot: rows = dimension key, cols = periods, cell = selected metric.
  const { rows, cell, rowTotals } = useMemo(() => {
    const cell = new Map<string, number>(); // `${key}||${period}` -> value
    const rowTotals = new Map<string, number>();
    const keys = new Set<string>();
    for (const b of buckets) {
      const label = dim === 'total' ? 'All sources' : b.key;
      keys.add(label);
      cell.set(`${label}||${b.period}`, b[metric]);
      // AOV doesn't sum across periods; show the range AOV instead.
      rowTotals.set(label, (rowTotals.get(label) ?? 0) + (metric === 'aov' ? 0 : b[metric]));
    }
    const rows = [...keys].sort((a, b) => (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0));
    return { rows, cell, rowTotals };
  }, [buckets, dim, metric]);

  const days = daysBetween(from, to);
  const drr = sum.revenue / days;
  const rr = { DRR: drr, WRR: drr * 7, MRR: drr * 30 };

  return (
    <>
      <PageHeader
        title="Live MIS"
        accent="emerald"
        icon={iconLive}
        description="Runtime run-rate pulled from the connectors. Provisional and always-on — the month close stays the published truth."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Live MIS' },
        ]}
        actions={
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {fetchedAt && <span>updated {fetchedAt.toLocaleTimeString()}</span>}
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              auto
            </label>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {loading ? 'Pulling…' : 'Refresh'}
            </button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Controls */}
        <SectionCard title="View" description="Date range, run-rate grain, and how to slice it.">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs text-slate-500">
              <span className="block mb-0.5">From</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-0.5">To</span>
              <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
            </label>
            <Toggle label="Run-rate" options={GRAINS.map((g) => ({ id: g.id, label: g.label }))} value={gran} onChange={(v) => setGran(v as Granularity)} />
            <Toggle label="Slice by" options={DIMS} value={dim} onChange={(v) => setDim(v as Dimension)} />
            <label className="text-xs text-slate-500">
              <span className="block mb-0.5">Metric</span>
              <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm">
                {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
        </SectionCard>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile label="Revenue" value={inr(sum.revenue)} />
          <Tile label="Net" value={inr(sum.net)} />
          <Tile label="Orders" value={sum.orders.toLocaleString('en-IN')} />
          <Tile label="DRR" value={inr(rr.DRR)} sub="rev / day" />
          <Tile label="WRR" value={inr(rr.WRR)} sub="7-day run-rate" />
          <Tile label="MRR" value={inr(rr.MRR)} sub="30-day run-rate" />
        </div>

        {/* Source status */}
        {data && (
          <div className="flex flex-wrap gap-2">
            {data.sources.map((s) => (
              <span key={s.id}
                className={'px-2 py-0.5 rounded text-[11px] ' +
                  (s.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
                {s.label}: {s.ok ? `${s.count} rows` : s.error}
              </span>
            ))}
          </div>
        )}

        {/* Run-rate grid */}
        <SectionCard
          title={`${GRAINS.find((g) => g.id === gran)!.label} ${metricDef.label} by ${DIMS.find((d) => d.id === dim)!.label.toLowerCase()}`}
          description={`${from} → ${to} · ${days} days${metric === 'aov' ? ' · AOV is per-period, not summed' : ''}`}
        >
          {facts.length === 0 ? (
            <p className="text-sm text-slate-400">
              No data for this range. Connect a dateable source (Shopify today) on the{' '}
              <a href="/reporting/mis/connectors" className="text-emerald-700 underline">Data sources</a> page and pull.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-400 border-b border-slate-200">
                    <th className="py-1.5 pr-3 text-left font-medium sticky left-0 bg-white">{DIMS.find((d) => d.id === dim)!.label}</th>
                    {periods.map((p) => <th key={p} className="py-1.5 px-2 text-right font-medium whitespace-nowrap">{p}</th>)}
                    {metric !== 'aov' && <th className="py-1.5 pl-3 text-right font-semibold">Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((key) => (
                    <tr key={key} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 text-slate-700 font-medium sticky left-0 bg-white max-w-[220px] truncate" title={key}>{key}</td>
                      {periods.map((p) => {
                        const v = cell.get(`${key}||${p}`);
                        return <td key={p} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{v == null ? '·' : fmt(v)}</td>;
                      })}
                      {metric !== 'aov' && (
                        <td className="py-1.5 pl-3 text-right tabular-nums font-semibold text-slate-800">
                          {fmt(rowTotals.get(key) ?? 0)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {data && data.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
            {data.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
          </div>
        )}
      </div>
    </>
  );
}

function Toggle({ label, options, value, onChange }: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="text-xs text-slate-500">
      <span className="block mb-0.5">{label}</span>
      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
        {options.map((o) => (
          <button key={o.id} onClick={() => onChange(o.id)}
            className={'px-2.5 py-1.5 text-xs ' + (value === o.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-800 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}
