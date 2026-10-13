// ----------------------------------------------------------------------------
// Live MIS — the legacy deck's structure, computed live from the durable
// uploads. Overview / P&L / Channels / SKU / SKU×Channel mirror the published
// deck; the Run-rate tab keeps the always-on connector fact stream. Numbers are
// real through each month's completeness level (full close / to CM2 / top line);
// the "complete through" floor is the latest fully-closed month.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PageHeader, SectionCard, KpiTile, SegmentedControl } from '../../components/ui';
import { inr } from '../../components/mis-deck/charts';
import { fetchFacts, type FactsResponse } from '../../data/liveMis/client';
import {
  clearUpload, loadUploads, parseUpload, saveUpload, uploadedFacts,
  UPLOAD_PARSERS, type UploadStore,
} from '../../data/liveMis/uploadParsers';
import {
  periodsIn, rollup, totals, type Dimension, type Granularity as RrGranularity, type MetricKey,
} from '../../data/liveMis/facts';
import { computeFreshness } from '../../data/liveMis/freshness';
import { listConnectors, type ConnectorInfo } from '../../data/monthClose/connectorsClient';
import { FreshnessHeadline, FreshnessTable } from '../../components/mis/FreshnessTable';
import { loadLiveDeck, type LiveDeckData } from '../../data/misDeck/liveDeck';
import { aggregatePeriods, monthLabel, type Granularity as DeckGran } from '../../data/misDeck/liveAnalytics';
import { OverviewTab, PnlTab, ChannelsTab, SkuTab, SkuChannelTab, LevelBadge } from '../../components/liveMis/deckTabs';

const iconLive = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

type Tab = 'overview' | 'pnl' | 'channels' | 'sku' | 'skuchannel' | 'runrate';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pnl', label: 'P&L' },
  { id: 'channels', label: 'Channels' },
  { id: 'sku', label: 'SKU' },
  { id: 'skuchannel', label: 'SKU × Channel' },
  { id: 'runrate', label: 'Run-rate' },
];
const DECK_GRAINS: { id: DeckGran; label: string }[] = [
  { id: 'month', label: 'Monthly' }, { id: 'quarter', label: 'Quarterly' }, { id: 'year', label: 'Yearly' },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-xs text-slate-500">
      <span className="block mb-1">{label}</span>
      {children}
    </div>
  );
}

export function LiveMisPage() {
  const [tab, setTab] = useState<Tab>('overview');

  // ---- Deck data (the durable-upload cascade) ----
  const [deck, setDeck] = useState<LiveDeckData | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [gran, setGran] = useState<DeckGran>('month');
  const [periodKey, setPeriodKey] = useState<string>('');
  const [pnlPct, setPnlPct] = useState(false);

  const loadDeck = useCallback(async () => {
    setDeckLoading(true); setDeckError(null);
    try { setDeck(await loadLiveDeck()); }
    catch (e) { setDeckError(e instanceof Error ? e.message : 'Could not load the MIS.'); }
    finally { setDeckLoading(false); }
  }, []);
  useEffect(() => { void loadDeck(); }, [loadDeck]);

  const periods = useMemo(
    () => (deck ? aggregatePeriods(deck.months, deck.completeness, gran) : []),
    [deck, gran],
  );
  const selected = useMemo(
    () => periods.find((p) => p.key === periodKey) ?? periods[periods.length - 1],
    [periods, periodKey],
  );
  const periodKeys = useMemo(() => new Set(selected?.members ?? []), [selected]);

  return (
    <>
      <PageHeader
        title="Live MIS"
        accent="brand"
        icon={iconLive}
        description="The MIS, live from your uploads — same structure as the published deck. Each month is real through its completeness level; the full P&L lands once its Tally P&L is in."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Live MIS' },
        ]}
        actions={
          <button onClick={() => void loadDeck()} disabled={deckLoading}
            className="px-2.5 py-1 rounded-lg bg-brand-600 text-white text-[11px] hover:bg-brand-700 disabled:opacity-40">
            {deckLoading ? 'Loading…' : 'Refresh'}
          </button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Completeness floor */}
        {deck && <CompletenessBanner deck={deck} />}
        {deckError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{deckError}</div>}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ' +
                (tab === t.id ? 'border-brand-500 text-brand-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-700')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Deck-tab controls (period + granularity) */}
        {tab !== 'runrate' && deck && periods.length > 0 && (
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Grain">
              <SegmentedControl size="sm" aria-label="Granularity" options={DECK_GRAINS}
                value={gran} onChange={(v) => { setGran(v); setPeriodKey(''); }} />
            </Field>
            {tab !== 'pnl' && (
              <Field label="Period">
                <select value={selected?.key ?? ''} onChange={(e) => setPeriodKey(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm">
                  {[...periods].reverse().map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </Field>
            )}
            {tab === 'pnl' && (
              <Field label="Show">
                <SegmentedControl size="sm" aria-label="Value mode"
                  options={[{ id: 'inr', label: '₹' }, { id: 'pct', label: '% of rev' }]}
                  value={pnlPct ? 'pct' : 'inr'} onChange={(v) => setPnlPct(v === 'pct')} />
              </Field>
            )}
          </div>
        )}

        {/* Tab content */}
        {tab === 'runrate' ? (
          <RunRateTab />
        ) : !deck ? (
          <p className="text-sm text-slate-400 py-8 text-center">{deckLoading ? 'Loading the MIS…' : 'No data yet.'}</p>
        ) : periods.length === 0 ? (
          <NoData />
        ) : (
          <SectionCard title={TABS.find((t) => t.id === tab)!.label}>
            {tab === 'overview' && selected && <OverviewTab period={selected} />}
            {tab === 'pnl' && <PnlTab periods={periods} showPct={pnlPct} />}
            {tab === 'channels' && selected && <ChannelsTab period={selected} cells={deck.skuCells} periodKeys={periodKeys} />}
            {tab === 'sku' && selected && <SkuTab period={selected} cells={deck.skuCells} periodKeys={periodKeys} />}
            {tab === 'skuchannel' && selected && <SkuChannelTab period={selected} cells={deck.skuCells} periodKeys={periodKeys} />}
          </SectionCard>
        )}
      </div>
    </>
  );
}

function CompletenessBanner({ deck }: { deck: LiveDeckData }) {
  const through = deck.completeThrough;
  const latest = deck.periods[deck.periods.length - 1];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {through ? (
        <span className="text-slate-600">
          MIS <span className="font-semibold text-emerald-700">fully closed through {monthLabel(through)}</span>
        </span>
      ) : (
        <span className="text-amber-700 font-medium">No month is fully closed yet — upload a Tally P&amp;L to complete a month.</span>
      )}
      {latest && latest !== through && (
        <span className="text-slate-400 flex items-center gap-1.5">Latest data: {monthLabel(latest)} (partial <LevelBadge level={deck.completeness[latest]?.level ?? 'topline'} />)</span>
      )}
      <span className="text-slate-400 flex items-center gap-1.5">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-500">Locked</span>
        history through Mar 2026 · live from Apr 2026
      </span>
      <span className="text-slate-400 ml-auto">{deck.periods.length} month{deck.periods.length === 1 ? '' : 's'} with data</span>
    </div>
  );
}

function NoData() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center">
      <p className="text-sm text-slate-500">No uploads have been ingested yet.</p>
      <p className="text-xs text-slate-400 mt-1">
        Head to <a href="/reporting/mis/ingest" className="text-brand-600 underline">Data readiness</a> to upload each source,
        or see the <a href="/reporting/mis/rulebook" className="text-brand-600 underline">Data rulebook</a> for what feeds what.
      </p>
    </div>
  );
}

// ============================================================================
// Run-rate tab — the always-on connector fact stream (daily/weekly/monthly).
// ============================================================================

const RR_GRAINS: { id: RrGranularity; label: string }[] = [
  { id: 'day', label: 'Daily' }, { id: 'week', label: 'Weekly' }, { id: 'month', label: 'Monthly' },
];
const RR_DIMS: { id: Dimension; label: string }[] = [
  { id: 'total', label: 'Total' }, { id: 'channel', label: 'Channel' },
  { id: 'sku', label: 'SKU' }, { id: 'sku_channel', label: 'SKU × Channel' },
];
const RR_METRICS: { id: MetricKey; label: string; money: boolean }[] = [
  { id: 'revenue', label: 'Revenue', money: true },
  { id: 'net', label: 'Net (rev − fees)', money: true },
  { id: 'fees', label: 'Fees', money: true },
  { id: 'spend', label: 'Ad spend', money: true },
  { id: 'orders', label: 'Orders', money: false },
  { id: 'units', label: 'Units', money: false },
  { id: 'aov', label: 'AOV', money: true },
  { id: 'mer', label: 'MER (rev / spend)', money: false },
];
const AUTO_MS = 120_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);

function RunRateTab() {
  const today = iso(new Date());
  const monthAgo = iso(new Date(Date.now() - 29 * 86400000));
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [gran, setGran] = useState<RrGranularity>('day');
  const [dim, setDim] = useState<Dimension>('channel');
  const [metric, setMetric] = useState<MetricKey>('revenue');
  const [auto, setAuto] = useState(false);
  const [data, setData] = useState<FactsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [uploads, setUploads] = useState<UploadStore>(() => loadUploads());
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);

  useEffect(() => { listConnectors().then((r) => setConnectors(r.connectors)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchFacts(from, to)); setFetchedAt(new Date()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not pull facts.'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void loadRef.current(), AUTO_MS);
    return () => clearInterval(t);
  }, [auto]);

  const facts = useMemo(() => {
    const up = uploadedFacts(uploads).filter((f) => f.date >= from && f.date <= to);
    const uploaded = new Set(Object.keys(uploads));
    const apiFacts = (data?.facts ?? []).filter((f) => !uploaded.has(f.source));
    return [...apiFacts, ...up];
  }, [data, uploads, from, to]);

  const metricDef = RR_METRICS.find((m) => m.id === metric)!;
  const isRatio = metric === 'aov' || metric === 'mer';
  const fmt = (v: number) => (metricDef.money ? inr(v) : v.toLocaleString('en-IN'));
  const sum = useMemo(() => totals(facts), [facts]);
  const buckets = useMemo(() => rollup(facts, gran, dim), [facts, gran, dim]);
  const periods = useMemo(() => periodsIn(buckets), [buckets]);

  const { rows, cell, rowTotals } = useMemo(() => {
    const cell = new Map<string, number>();
    const rowTotals = new Map<string, number>();
    const keys = new Set<string>();
    for (const b of buckets) {
      const label = dim === 'total' ? 'All sources' : b.key;
      keys.add(label);
      cell.set(`${label}||${b.period}`, b[metric]);
      rowTotals.set(label, (rowTotals.get(label) ?? 0) + (isRatio ? 0 : b[metric]));
    }
    const rows = [...keys].sort((a, b) => (rowTotals.get(b) ?? 0) - (rowTotals.get(a) ?? 0));
    return { rows, cell, rowTotals };
  }, [buckets, dim, metric, isRatio]);

  const days = daysBetween(from, to);
  const rr = { MRR: (sum.revenue / days) * 30 };

  return (
    <div className="space-y-5">
      <SectionCard title="View" description="Date range, run-rate grain, and how to slice it."
        actions={
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {fetchedAt && <span>updated {fetchedAt.toLocaleTimeString()}</span>}
            <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto</label>
            <button onClick={() => void load()} disabled={loading} className="px-2.5 py-1 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40">{loading ? 'Pulling…' : 'Refresh'}</button>
          </div>
        }>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="From">
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
          </Field>
          <Field label="To">
            <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
          </Field>
          <Field label="Run-rate"><SegmentedControl size="sm" aria-label="Run-rate grain" options={RR_GRAINS} value={gran} onChange={setGran} /></Field>
          <Field label="Slice by"><SegmentedControl size="sm" aria-label="Slice by" options={RR_DIMS} value={dim} onChange={setDim} /></Field>
          <Field label="Metric">
            <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm">
              {RR_METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>
        </div>
      </SectionCard>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Revenue" value={inr(sum.revenue)} />
        <KpiTile label="Ad spend" value={inr(sum.spend)} />
        <KpiTile label="MER" value={sum.mer ? `${sum.mer.toFixed(2)}×` : '—'} sub="rev / spend" />
        <KpiTile label="Net" value={inr(sum.net)} />
        <KpiTile label="Orders" value={sum.orders.toLocaleString('en-IN')} />
        <KpiTile label="MRR" value={inr(rr.MRR)} sub="30-day run-rate" />
      </div>

      {data && (
        <SectionCard title="Data freshness"
          description="Every connector, how current it is, and the date the whole MIS is live through — the system is only as current as its stalest source."
          actions={<FreshnessHeadline fresh={computeFreshness(connectors, data.facts, uploads)} />}>
          <FreshnessTable fresh={computeFreshness(connectors, data.facts, uploads)} onRemoveUpload={(id) => setUploads({ ...clearUpload(id) })} />
          <UploadReport onUpload={(s) => setUploads({ ...s })} />
        </SectionCard>
      )}

      <SectionCard title={`${RR_GRAINS.find((g) => g.id === gran)!.label} ${metricDef.label} by ${RR_DIMS.find((d) => d.id === dim)!.label.toLowerCase()}`}
        description={`${from} → ${to} · ${days} days${isRatio ? ' · ratio metric, not summed' : ''}`}>
        {facts.length === 0 ? (
          <p className="text-sm text-slate-400">No data for this range. Connect a dateable source (Shopify today) on the{' '}
            <a href="/reporting/mis/connectors" className="text-emerald-700 underline">Data sources</a> page and pull.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-[10px] text-slate-400 border-b border-slate-200">
                <th className="py-1.5 pr-3 text-left font-medium sticky left-0 bg-white">{RR_DIMS.find((d) => d.id === dim)!.label}</th>
                {periods.map((p) => <th key={p} className="py-1.5 px-2 text-right font-medium whitespace-nowrap">{p}</th>)}
                {!isRatio && <th className="py-1.5 pl-3 text-right font-semibold">Total</th>}
              </tr></thead>
              <tbody>
                {rows.map((key) => (
                  <tr key={key} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 text-slate-700 font-medium sticky left-0 bg-white max-w-[220px] truncate" title={key}>{key}</td>
                    {periods.map((p) => { const v = cell.get(`${key}||${p}`); return <td key={p} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{v == null ? '·' : fmt(v)}</td>; })}
                    {!isRatio && <td className="py-1.5 pl-3 text-right tabular-nums font-semibold text-slate-800">{fmt(rowTotals.get(key) ?? 0)}</td>}
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
  );
}

function UploadReport({ onUpload }: { onUpload: (store: UploadStore) => void }) {
  const [sourceId, setSourceId] = useState(UPLOAD_PARSERS[0]?.sourceId ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const parser = UPLOAD_PARSERS.find((p) => p.sourceId === sourceId);
  const onFile = async (file: File | undefined) => {
    if (!file || !parser) return;
    setBusy(true); setMsg(null);
    try { const rec = await parseUpload(parser, file); onUpload(saveUpload(rec)); setMsg({ kind: 'ok', text: `Loaded ${rec.facts.length} days from ${file.name}.` }); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not read the file.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-[11px] text-slate-500 mb-2"><span className="font-medium text-slate-600">Upload a report</span> for a source with no financial API (e.g. Shiprocket's passbook). It parses into daily facts and merges above.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200">
          {UPLOAD_PARSERS.map((p) => <option key={p.sourceId} value={p.sourceId}>{p.label}</option>)}
        </select>
        <label className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
          {busy ? 'Reading…' : 'Choose file'}
          <input type="file" accept={parser?.accept} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {parser && <span className="text-[10px] text-slate-400">{parser.hint}</span>}
      </div>
      {msg && <p className={'mt-1.5 text-[11px] ' + (msg.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700')}>{msg.text}</p>}
    </div>
  );
}
