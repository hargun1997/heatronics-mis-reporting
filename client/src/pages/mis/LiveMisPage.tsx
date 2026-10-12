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
  clearUpload,
  loadUploads,
  parseUpload,
  saveUpload,
  uploadedFacts,
  UPLOAD_PARSERS,
  type UploadStore,
} from '../../data/liveMis/uploadParsers';
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
  { id: 'spend', label: 'Ad spend', money: true },
  { id: 'orders', label: 'Orders', money: false },
  { id: 'units', label: 'Units', money: false },
  { id: 'aov', label: 'AOV', money: true },
  { id: 'mer', label: 'MER (rev / spend)', money: false },
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
  const [uploads, setUploads] = useState<UploadStore>(() => loadUploads());

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

  // Live-pulled facts, plus uploaded-report facts that fall in the date range.
  // A source with an upload uses the upload, not the API: the settlement file
  // carries fees and refunds the run-rate pull (e.g. Amazon orderMetrics) does
  // not, so letting both through would double-count that source.
  const facts = useMemo(() => {
    const up = uploadedFacts(uploads).filter((f) => f.date >= from && f.date <= to);
    const uploaded = new Set(Object.keys(uploads));
    const apiFacts = (data?.facts ?? []).filter((f) => !uploaded.has(f.source));
    return [...apiFacts, ...up];
  }, [data, uploads, from, to]);
  const metricDef = METRICS.find((m) => m.id === metric)!;
  // AOV and MER are ratios — they don't sum across periods, so no Total column.
  const isRatio = metric === 'aov' || metric === 'mer';
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
      rowTotals.set(label, (rowTotals.get(label) ?? 0) + (isRatio ? 0 : b[metric]));
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
          <Tile label="Ad spend" value={inr(sum.spend)} />
          <Tile label="MER" value={sum.mer ? `${sum.mer.toFixed(2)}×` : '—'} sub="rev / spend" />
          <Tile label="Net" value={inr(sum.net)} />
          <Tile label="Orders" value={sum.orders.toLocaleString('en-IN')} />
          <Tile label="MRR" value={inr(rr.MRR)} sub="30-day run-rate" />
        </div>

        {/* Data freshness — how current each source is, and the system floor */}
        {data && (
          <Freshness
            data={data}
            uploads={uploads}
            today={today}
            onUpload={(store) => setUploads({ ...store })}
          />
        )}

        {/* Run-rate grid */}
        <SectionCard
          title={`${GRAINS.find((g) => g.id === gran)!.label} ${metricDef.label} by ${DIMS.find((d) => d.id === dim)!.label.toLowerCase()}`}
          description={`${from} → ${to} · ${days} days${isRatio ? ' · ratio metric, not summed' : ''}`}
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
                    {!isRatio && <th className="py-1.5 pl-3 text-right font-semibold">Total</th>}
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
                      {!isRatio && (
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

function daysAgo(date: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(date)) / 86400000);
}

/** Per-source coverage, the freshness floor, and the report-upload control. */
function Freshness({
  data,
  uploads,
  today,
  onUpload,
}: {
  data: FactsResponse;
  uploads: UploadStore;
  today: string;
  onUpload: (store: UploadStore) => void;
}) {
  const uploadRows = Object.values(uploads).map((u) => {
    const dates = u.facts.map((f) => f.date).sort();
    return { id: u.sourceId, label: u.label, count: u.facts.length, through: dates[dates.length - 1] ?? null };
  });

  // The system is only as current as its stalest source — live or uploaded.
  const throughs = [
    ...data.sources.filter((s) => s.ok && s.through).map((s) => s.through!),
    ...uploadRows.filter((u) => u.through).map((u) => u.through!),
  ].sort();
  const floor = throughs[0] ?? null;
  const floorLag = floor ? daysAgo(floor, today) : null;

  return (
    <SectionCard
      title="Data freshness"
      description="How far each source has data, and the date the whole system is current through."
      actions={
        floor ? (
          <span
            className={
              'text-xs px-2 py-0.5 rounded ' +
              (floorLag !== null && floorLag <= 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')
            }
          >
            System current through {floor}{floorLag !== null && floorLag > 1 ? ` · ${floorLag}d behind` : ''}
          </span>
        ) : (
          <span className="text-xs text-slate-400">No source has data yet</span>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-400 border-b border-slate-200 text-left">
              <th className="py-1.5 pr-3 font-medium">Source</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 font-medium text-right">Rows</th>
              <th className="py-1.5 font-medium">Data through</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => {
              const lag = s.through ? daysAgo(s.through, today) : null;
              return (
                <tr key={s.id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 text-slate-700 font-medium">{s.label}</td>
                  <td className="py-1.5 pr-3">
                    {s.ok ? (
                      s.count > 0 ? <span className="text-emerald-700">live</span>
                        : <span className="text-slate-400">connected · no data in range</span>
                    ) : (
                      <span className="text-slate-400">{s.error ?? 'not connected'}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{s.count || '—'}</td>
                  <td className="py-1.5">
                    {s.through ? (
                      <span className={lag !== null && lag > 2 ? 'text-amber-700' : 'text-slate-600'}>
                        {s.through}{lag !== null && lag > 2 ? ` (${lag}d ago)` : ''}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
            {uploadRows.map((u) => {
              const lag = u.through ? daysAgo(u.through, today) : null;
              return (
                <tr key={u.id} className="border-b border-slate-50 bg-slate-50/50">
                  <td className="py-1.5 pr-3 text-slate-700 font-medium">{u.label}</td>
                  <td className="py-1.5 pr-3">
                    <span className="text-indigo-600">uploaded</span>
                    <button
                      onClick={() => onUpload(clearUpload(u.id))}
                      className="ml-2 text-[10px] text-slate-400 hover:text-rose-600"
                    >
                      remove
                    </button>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{u.count}</td>
                  <td className="py-1.5">
                    {u.through ? (
                      <span className={lag !== null && lag > 2 ? 'text-amber-700' : 'text-slate-600'}>
                        {u.through}{lag !== null && lag > 2 ? ` (${lag}d ago)` : ''}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <UploadReport onUpload={onUpload} />
    </SectionCard>
  );
}

/** Upload a report for a source whose financial data has no API (e.g. Shiprocket). */
function UploadReport({ onUpload }: { onUpload: (store: UploadStore) => void }) {
  const [sourceId, setSourceId] = useState(UPLOAD_PARSERS[0]?.sourceId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const parser = UPLOAD_PARSERS.find((p) => p.sourceId === sourceId);

  const onFile = async (file: File | undefined) => {
    if (!file || !parser) return;
    setBusy(true); setMsg(null);
    try {
      const rec = await parseUpload(parser, file);
      onUpload(saveUpload(rec));
      setMsg({ kind: 'ok', text: `Loaded ${rec.facts.length} days from ${file.name}.` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not read the file.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-[11px] text-slate-500 mb-2">
        <span className="font-medium text-slate-600">Upload a report</span> for a source with no financial API
        (e.g. Shiprocket's passbook — API gives shipments, not the money). It parses into daily facts and merges above.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200"
        >
          {UPLOAD_PARSERS.map((p) => <option key={p.sourceId} value={p.sourceId}>{p.label}</option>)}
        </select>
        <label className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
          {busy ? 'Reading…' : 'Choose file'}
          <input
            type="file"
            accept={parser?.accept}
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {parser && <span className="text-[10px] text-slate-400">{parser.hint}</span>}
      </div>
      {msg && (
        <p className={'mt-1.5 text-[11px] ' + (msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700')}>{msg.text}</p>
      )}
    </div>
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
