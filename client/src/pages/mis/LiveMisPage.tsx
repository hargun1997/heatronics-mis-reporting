// ----------------------------------------------------------------------------
// Live MIS — every report of the legacy deck, computed live from the durable
// uploads: Overview, Revenue & Growth, Channel Mix, Profitability, P&L, Channel
// P&L, SKU, SKU×Channel, Units, Repeats and the MIS Sheet; the Run-rate tab keeps
// the always-on connector fact stream. Numbers are real through each month's
// completeness level (full close / to CM2 / top line); the "complete through"
// floor is the latest fully-closed month.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
import { loadLiveDeck, swapAlternates, LIVE_BOUNDARY, type LiveDeckData } from '../../data/misDeck/liveDeck';
import { aggregatePeriods, monthLabel, type Granularity as DeckGran } from '../../data/misDeck/liveAnalytics';
import {
  blendLiveMonths, unifyChannels, rangeKeys, rangePresetLabel, aggregateRange, type RangePreset,
} from '../../data/misDeck/liveViews';
import {
  OverviewTab, PnlTab, ChannelsTab, SkuTab, SkuChannelTab, SkuUnitsTab, LevelBadge, type PnlDisplay,
} from '../../components/liveMis/deckTabs';
import { RevenueGrowthTab, ChannelMixTab, ProfitabilityTab, RepeatsTab } from '../../components/liveMis/reportTabs';
import { LiveMisSheetTab } from '../../components/liveMis/LiveMisSheetTab';
import { LiveExcelModal, LivePdfModal } from '../../components/liveMis/LiveExportModals';
import { LiveViewProvider, Pills } from '../../components/liveMis/shared';

const iconLive = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

type Tab = 'overview' | 'growth' | 'mix' | 'profit' | 'pnl' | 'channels' | 'sku' | 'skuchannel' | 'units' | 'repeats' | 'missheet' | 'runrate';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'growth', label: 'Revenue & Growth' },
  { id: 'mix', label: 'Channel Mix' },
  { id: 'profit', label: 'Profitability' },
  { id: 'pnl', label: 'P&L' },
  { id: 'channels', label: 'Channel P&L' },
  { id: 'sku', label: 'SKU' },
  { id: 'skuchannel', label: 'SKU × Channel' },
  { id: 'units', label: 'Units sold' },
  { id: 'repeats', label: 'Repeats' },
  { id: 'missheet', label: 'MIS Sheet' },
  { id: 'runrate', label: 'Run-rate' },
];
// Tabs that don't use the period controls (they carry their own scope).
const NO_PERIOD: Tab[] = ['runrate', 'repeats', 'missheet'];
// Tabs that show the Actual|Blended toggle + note; all others always use actual COGM.
const BLEND_TABS: Tab[] = ['overview', 'profit', 'pnl'];

type Grain = DeckGran | 'range';
const DECK_GRAINS: { id: Grain; label: string }[] = [
  { id: 'month', label: 'Monthly' }, { id: 'quarter', label: 'Quarterly' }, { id: 'year', label: 'Yearly' }, { id: 'range', label: 'Range' },
];
const RANGE_PRESETS: RangePreset[] = ['last3', 'last6', 'last12', 'ytd', 'fy_current', 'fy_previous', 'custom'];

// Heatronics runs an Apr–Mar fiscal year, so a month's FY starts in the April on
// or before it: Apr 2025 → Mar 2026 is "FY25–26".
const isMonthKey = (k: string) => /^\d{4}-\d{2}$/.test(k);
const fyStartOf = (monthKey: string): number => {
  const [y, m] = monthKey.split('-').map(Number);
  return m >= 4 ? y : y - 1;
};
const fyLabel = (startY: number): string => `FY${String(startY).slice(2)}–${String((startY + 1) % 100).padStart(2, '0')}`;

/** A per-browser view preference (a convenience only — the page works without storage). */
function usePref<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { return (localStorage.getItem(`livemis:${key}`) as T | null) ?? fallback; } catch { return fallback; }
  });
  const set = (n: T) => { setV(n); try { localStorage.setItem(`livemis:${key}`, n); } catch { /* private mode */ } };
  return [v, set];
}

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
  const [gran, setGran] = useState<Grain>('month');
  const [periodKey, setPeriodKey] = useState<string>('');
  const [display, setDisplay] = useState<PnlDisplay>('both');
  const [fy, setFy] = useState<string>('all');
  // COGM basis: Blended by default, as the legacy deck (owner's call, Oct 2026);
  // Actual (ties to Tally month by month) is one click and remembered.
  const [blendPref, setBlendPref] = usePref<'actual' | 'blended'>('cogm', 'blended');
  const [chanPref, setChanPref] = usePref<'continuous' | 'booked'>('channels', 'continuous');
  const [showLive, setShowLive] = useState(false);
  const [preset, setPreset] = useState<RangePreset>('last12');
  const [custom, setCustom] = useState<string[]>([]);
  const [excelOpen, setExcelOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const blended = blendPref === 'blended';
  const merged = chanPref === 'continuous';

  const loadDeck = useCallback(async () => {
    setDeckLoading(true); setDeckError(null);
    try { setDeck(await loadLiveDeck()); }
    catch (e) { setDeckError(e instanceof Error ? e.message : 'Could not load the MIS.'); }
    finally { setDeckLoading(false); }
  }, []);
  useEffect(() => { void loadDeck(); }, [loadDeck]);

  // The deck as viewed: live partials swapped in on request, then the continuous
  // channel taxonomy (G6). Raw `deck` stays the source of truth.
  const view = useMemo(() => {
    if (!deck) return null;
    const d = showLive ? swapAlternates(deck) : deck;
    return merged ? unifyChannels(d) : d;
  }, [deck, showLive, merged]);
  const blend = useMemo(() => (view ? blendLiveMonths(view.months, view.completeness) : null), [view]);
  // Blended COGM applies only on the tabs that carry the Actual|Blended toggle and
  // its note (Overview, Profitability, P&L) — like the legacy deck, every other
  // tab (Channel P&L, Revenue & Growth, SKU, Channel Mix …) stays on actual COGM.
  const blendTab = BLEND_TABS.includes(tab);
  const months = useMemo(() => (view ? (blended && blendTab && blend ? blend.months : view.months) : []), [view, blend, blended, blendTab]);
  const completeness = useMemo(() => view?.completeness ?? {}, [view]);

  const aggGran: DeckGran = gran === 'range' ? 'month' : gran;
  const allPeriods = useMemo(() => aggregatePeriods(months, completeness, aggGran), [months, completeness, aggGran]);
  const monthly = useMemo(() => aggregatePeriods(months, completeness, 'month'), [months, completeness]);
  const quarterly = useMemo(() => aggregatePeriods(months, completeness, 'quarter'), [months, completeness]);
  const yearly = useMemo(() => aggregatePeriods(months, completeness, 'year'), [months, completeness]);
  // Fiscal years present in the data, newest first — drives the Year filter.
  const fys = useMemo(() => {
    const ys = new Set<number>();
    for (const p of view?.periods ?? []) if (isMonthKey(p)) ys.add(fyStartOf(p));
    return [...ys].sort((a, b) => b - a);
  }, [view]);
  const isRange = gran === 'range';
  // Range grain: one aggregated period over the chosen months.
  const selKeys = useMemo(() => (view && isRange ? rangeKeys(preset, view.periods, custom) : []), [view, isRange, preset, custom]);
  const rangeAgg = useMemo(
    () => (view && isRange ? aggregateRange(months, completeness, selKeys, rangePresetLabel(preset, view.periods)) : null),
    [view, isRange, months, completeness, selKeys, preset],
  );
  // The periods actually shown — scoped to one fiscal year unless "All"; in
  // range mode, the range's own months.
  const shownPeriods = useMemo(() => {
    if (isRange) return monthly.filter((p) => selKeys.includes(p.key));
    if (fy === 'all') return allPeriods;
    const start = Number(fy);
    return allPeriods.filter((p) => p.members.some((mk) => isMonthKey(mk) && fyStartOf(mk) === start));
  }, [isRange, monthly, selKeys, allPeriods, fy]);
  const selected = useMemo(
    () => (isRange ? rangeAgg ?? undefined : shownPeriods.find((p) => p.key === periodKey) ?? shownPeriods[shownPeriods.length - 1]),
    [isRange, rangeAgg, shownPeriods, periodKey],
  );
  const periodKeys = useMemo(() => new Set(selected?.members ?? []), [selected]);
  const pnlCols = useMemo(() => (isRange && rangeAgg ? [...shownPeriods, rangeAgg] : shownPeriods), [isRange, rangeAgg, shownPeriods]);
  // Amazon traffic (Business Report) for the selected period — aggregated per SKU
  // across the period's months. Overview-only; never part of the P&L.
  const trafficRows = useMemo(() => {
    if (!view || !selected) return [];
    const byKey = new Map<string, { sku: string; name: string; sessions: number; pageViews: number; units: number }>();
    for (const mk of selected.members) {
      for (const r of view.traffic[mk] ?? []) {
        const e = byKey.get(r.sku) ?? { sku: r.sku, name: r.name, sessions: 0, pageViews: 0, units: 0 };
        e.sessions += r.sessions; e.pageViews += r.pageViews; e.units += r.units;
        byKey.set(r.sku, e);
      }
    }
    return [...byKey.values()];
  }, [view, selected]);

  const ctx = useMemo(() => ({
    merged, blended, setBlended: (b: boolean) => setBlendPref(b ? 'blended' : 'actual'), rates: blend?.rates ?? new Map<string, number>(),
  }), [merged, blended, blend, setBlendPref]);
  const showControls = !NO_PERIOD.includes(tab) && view && allPeriods.length > 0;

  return (
    <LiveViewProvider value={ctx}>
      <PageHeader
        title="Live MIS"
        accent="brand"
        icon={iconLive}
        description="The MIS, live from your uploads — every report of the published deck. Each month is real through its completeness level; the full P&L lands once its Tally P&L is in."
        crumbs={[
          { label: 'Reporting', to: '/reporting' },
          { label: 'MIS Reporting', to: '/reporting/mis' },
          { label: 'Live MIS' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/reporting/mis/rulebook" className="px-2.5 py-1 rounded-lg text-slate-600 text-[11px] hover:bg-white/70 underline-offset-2 hover:underline">
              How it’s calculated
            </Link>
            <button onClick={() => setExcelOpen(true)} disabled={!deck || deckLoading}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11px] hover:bg-slate-50 disabled:opacity-40">
              Export Excel
            </button>
            <button onClick={() => setPdfOpen(true)} disabled={!deck || deckLoading}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11px] hover:bg-slate-50 disabled:opacity-40">
              Export PDF
            </button>
            <button onClick={() => void loadDeck()} disabled={deckLoading}
              className="px-2.5 py-1 rounded-lg bg-brand-600 text-white text-[11px] hover:bg-brand-700 disabled:opacity-40">
              {deckLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        }
      />

      {view && excelOpen && <LiveExcelModal deck={showLive ? swapAlternates(deck!) : deck!} open onClose={() => setExcelOpen(false)} blended={blended} merged={merged} />}
      {view && pdfOpen && <LivePdfModal deck={showLive ? swapAlternates(deck!) : deck!} open onClose={() => setPdfOpen(false)} blended={blended} merged={merged} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Completeness floor */}
        {deck && view && <CompletenessBanner deck={view} raw={deck} showLive={showLive} setShowLive={setShowLive} />}
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

        {/* Deck-tab controls (grain, year / range, period, channel naming) */}
        {showControls && (
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <Field label="Grain">
              <SegmentedControl size="sm" aria-label="Granularity" options={DECK_GRAINS}
                value={gran} onChange={(v) => { setGran(v); setPeriodKey(''); }} />
            </Field>
            {!isRange && fys.length > 1 && (
              <Field label="Year">
                <select value={fy} onChange={(e) => { setFy(e.target.value); setPeriodKey(''); }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm">
                  <option value="all">All years</option>
                  {fys.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
                </select>
              </Field>
            )}
            {isRange && view && (
              <Field label="Range">
                <select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm">
                  {RANGE_PRESETS.map((p) => <option key={p} value={p}>{rangePresetLabel(p, view.periods)}</option>)}
                </select>
              </Field>
            )}
            {!isRange && tab !== 'pnl' && (
              <Field label="Period">
                <select value={selected?.key ?? ''} onChange={(e) => setPeriodKey(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm">
                  {[...shownPeriods].reverse().map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Channels">
              <Pills label="Channel naming" value={chanPref} onChange={setChanPref}
                options={[{ id: 'continuous', label: 'Continuous' }, { id: 'booked', label: 'As booked' }]} />
            </Field>
          </div>
        )}
        {showControls && isRange && view && preset === 'custom' && (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="flex items-center gap-3 mb-1.5 text-xs">
              <span className="font-medium text-slate-600">Months</span>
              <button type="button" className="text-brand-600" onClick={() => setCustom([...view.periods])}>Select all</button>
              <button type="button" className="text-slate-500" onClick={() => setCustom([])}>Clear</button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {view.periods.map((k) => {
                const on = custom.includes(k);
                return (
                  <button key={k} type="button" onClick={() => setCustom(on ? custom.filter((x) => x !== k) : [...custom, k])}
                    className={`px-2 py-0.5 rounded-md text-[11px] border ${on ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                    {monthLabel(k)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {showControls && isRange && selected && (
          <p className="text-xs text-slate-500">Showing <span className="font-medium text-slate-700">{selected.label}</span>: {selected.members.map(monthLabel).join(', ')} — aggregated; completeness is the lowest month’s.</p>
        )}

        {/* Tab content */}
        {tab === 'runrate' ? (
          <RunRateTab />
        ) : tab === 'repeats' ? (
          <RepeatsTab />
        ) : !view ? (
          <p className="text-sm text-slate-400 py-8 text-center">{deckLoading ? 'Loading the MIS…' : 'No data yet.'}</p>
        ) : tab === 'missheet' ? (
          <LiveMisSheetTab deck={view} />
        ) : allPeriods.length === 0 ? (
          <NoData />
        ) : !selected ? (
          <p className="text-sm text-slate-400 py-8 text-center">{isRange ? 'Pick at least one month for the range.' : 'No period in this selection.'}</p>
        ) : (
          <div>
            {tab === 'overview' && <OverviewTab period={selected} periods={shownPeriods} allPeriods={allPeriods} gran={aggGran} traffic={trafficRows} isRange={isRange} />}
            {tab === 'growth' && <RevenueGrowthTab monthly={monthly} periods={shownPeriods} allPeriods={allPeriods} gran={aggGran} completeThrough={view.completeThrough} />}
            {tab === 'mix' && <ChannelMixTab period={selected} periods={shownPeriods} months={view.months} monthly={monthly} quarterly={quarterly} yearly={yearly} gran={aggGran} />}
            {tab === 'profit' && <ProfitabilityTab period={selected} periods={shownPeriods} gran={aggGran} />}
            {tab === 'pnl' && <PnlTab periods={pnlCols} months={months} completeness={completeness} gran={isRange ? 'month' : aggGran} display={display} setDisplay={setDisplay} />}
            {tab === 'channels' && <ChannelsTab period={selected} periods={shownPeriods} cells={view.skuCells} periodKeys={periodKeys} completeness={completeness} />}
            {tab === 'sku' && <SectionCard title="SKU P&L"><SkuTab period={selected} cells={view.skuCells} periodKeys={periodKeys} /></SectionCard>}
            {tab === 'skuchannel' && <SkuChannelTab period={selected} cells={view.skuCells} periodKeys={periodKeys} />}
            {tab === 'units' && <SectionCard title="Units sold"><SkuUnitsTab period={selected} cells={view.skuCells} periodKeys={periodKeys} /></SectionCard>}
          </div>
        )}
      </div>
    </LiveViewProvider>
  );
}

function CompletenessBanner({ deck, raw, showLive, setShowLive }: {
  deck: LiveDeckData; raw: LiveDeckData; showLive: boolean; setShowLive: (v: boolean) => void;
}) {
  const through = deck.completeThrough;
  const latest = deck.periods[deck.periods.length - 1];
  const published = deck.periods.filter((k) => deck.completeness[k]?.published);
  const altKeys = Object.keys(raw.alternates).sort();
  const span = (ks: string[]) => (ks.length === 1 ? monthLabel(ks[0]) : `${monthLabel(ks[0])}–${monthLabel(ks[ks.length - 1])}`);
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {through ? (
        <span className="text-slate-600">
          MIS <span className="font-semibold text-slate-900">fully closed through {monthLabel(through)}</span>
        </span>
      ) : (
        <span className="text-amber-700 font-medium">No month is fully closed yet — upload a Tally P&amp;L to complete a month.</span>
      )}
      {latest && latest !== through && (
        <span className="text-slate-400 flex items-center gap-1.5">Latest data: {monthLabel(latest)} (partial <LevelBadge level={deck.completeness[latest]?.level ?? 'topline'} />)</span>
      )}
      <span className="text-slate-400 flex items-center gap-1.5">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-500">Locked</span>
        history through {monthLabel(prevMonth(LIVE_BOUNDARY))} · live from {monthLabel(LIVE_BOUNDARY)}
      </span>
      {published.length > 0 && (
        <span className="text-slate-400 flex items-center gap-1.5">
          <LevelBadge level="full" published /> {span(published)} from the published MIS until a full live close replaces {published.length === 1 ? 'it' : 'them'}
        </span>
      )}
      {altKeys.length > 0 && (
        <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} />
          Show live partials for {span(altKeys)} instead of the published months
        </label>
      )}
      <span className="text-slate-400 sm:ml-auto">{deck.periods.length} month{deck.periods.length === 1 ? '' : 's'} with data</span>
    </div>
  );
}

function prevMonth(pk: string): string {
  let [y, m] = pk.split('-').map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function NoData() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center">
      <p className="text-sm text-slate-500">No uploads have been ingested yet.</p>
      <p className="text-xs text-slate-400 mt-1">
        Head to <a href="/reporting/mis/ingest" className="text-brand-600 underline">Upload data</a> to upload each source,
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
