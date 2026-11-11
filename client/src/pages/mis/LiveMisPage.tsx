// ----------------------------------------------------------------------------
// Live MIS — five tabs, each a stack of expandable sections (founder, 5 Nov 2026:
// "expandable … declutter … the P&L is the MIS"):
//   Overview   Headline · Revenue & growth · Run-rate (whole business)
//   P&L        the MIS sheet (₹ Lac | % of net revenue, COGM basis Actual | Normalised) ·
//              Margin ladder & cost structure · Detailed P&L · By channel
//   Channels   Channel mix · SKU × channel
//   Products   SKU P&L · Units sold
//   Statements Balance sheet · Cash flow (Tally's stored month-end Trial Balances)
// Numbers are real through each month's completeness level (full close / to CM2
// / top line); the "complete through" floor is the latest locked month. Data
// freshness and report uploads live in Setup; repeat purchase / cohorts in Ops.
// ----------------------------------------------------------------------------

import { anchorMonth } from '../../data/misDeck/misPeriods';
import { LabeledField } from '../../components/ui/LabeledField';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Lock, RefreshCw } from 'lucide-react';
import { PageHeader, HeaderMore, KpiTile, SegmentedControl, Popover, ErrorBox, BTN } from '../../components/ui';
import { inr } from '../../components/mis-deck/format';
import { fetchFacts, type FactsResponse } from '../../data/liveMis/client';
import { BalanceSheetTab, CashFlowTab } from '../../components/liveMis/StatementsTabs';
import {
  periodsIn, rollup, totals, type Dimension, type Granularity as RrGranularity, type MetricKey,
} from '../../data/liveMis/facts';
import { ProductGapsPanel } from '../../components/liveMis/ProductGapsPanel';
import { PublishedGapChip } from '../../components/liveMis/PublishedGapChip';
import { loadLiveDeck, swapAlternates, LIVE_BOUNDARY, type LiveDeckData } from '../../data/misDeck/liveDeck';
import { aggregatePeriods, monthLabel, type Granularity as DeckGran, type PeriodAgg } from '../../data/misDeck/liveAnalytics';
import {
  normaliseLiveMonths, unifyChannels, rangeKeys, rangePresetLabel, aggregateRange, type RangePreset,
} from '../../data/misDeck/liveViews';
import {
  OverviewTab, PnlTab, ChannelsTab, SkuTab, SkuChannelTab, SkuUnitsTab, LevelBadge, type PnlDisplay,
} from '../../components/liveMis/deckTabs';
import { RevenueGrowthTab, ChannelMixTab, ProfitabilityTab } from '../../components/liveMis/reportTabs';
import { LiveMisSheetTab } from '../../components/liveMis/LiveMisSheetTab';
import { MonthClosePanel } from '../../components/liveMis/MonthClosePanel';
import { deckItems, rememberDeckItems } from '../../data/issues/inbox';
import { LiveExcelModal, LivePdfModal } from '../../components/liveMis/LiveExportModals';
import { LiveViewProvider, Pills, Section, type CogmBasis } from '../../components/liveMis/shared';
import { WhyItMoved } from '../../components/liveMis/WhyItMoved';
import { useWhyData, useSaveBridge, whySummary } from '../../components/liveMis/whyData';

type Tab = 'overview' | 'pnl' | 'channels' | 'products' | 'statements';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pnl', label: 'P&L' },
  { id: 'channels', label: 'Channels' },
  { id: 'products', label: 'Products' },
  { id: 'statements', label: 'Statements' },
];
// Old tab ids (links, bookmarks, the remembered tab) → where that content now lives.
const LEGACY_TABS: Record<string, Tab> = {
  growth: 'overview', runrate: 'overview', repeats: 'overview',
  profit: 'pnl', missheet: 'pnl', channels: 'pnl',
  mix: 'channels', skuchannel: 'channels',
  sku: 'products', units: 'products',
  bs: 'statements', cashflow: 'statements',
};
const isTab = (v: string | null | undefined): v is Tab => !!v && TABS.some((t) => t.id === v);
const resolveTab = (v: string | null | undefined): Tab | null => (isTab(v) ? v : v && LEGACY_TABS[v] ? LEGACY_TABS[v] : null);
// Tabs that don't use the period controls (Statements carries its own months).
const NO_PERIOD: Tab[] = ['statements'];
// Tabs on which the Actual|Normalised COGM basis applies (Overview's headline, the whole P&L tab); the rest stay on actual COGM.
const BASIS_TABS: Tab[] = ['overview', 'pnl'];

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

/** The tab to open: ?tab= (old ids mapped), else the remembered one, else Overview. */
function useTab(): [Tab, (t: Tab) => void] {
  const [pref, setPref] = usePref<string>('tab', 'overview');
  const [tab, setTabState] = useState<Tab>(() => {
    try { const q = resolveTab(new URLSearchParams(window.location.search).get('tab')); if (q) return q; } catch { /* no window */ }
    return resolveTab(pref) ?? 'overview';
  });
  const setTab = (t: Tab) => {
    setTabState(t); setPref(t);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', t);
      window.history.replaceState(window.history.state, '', u);
    } catch { /* no history */ }
  };
  return [tab, setTab];
}

/** A control with its label on the same line (one row of filters under the tabs). */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <LabeledField label={label} className="flex items-center gap-2 text-xs text-slate-600" captionClassName="font-medium">{children}</LabeledField>;
}

export function LiveMisPage() {
  const [tab, setTab] = useTab();

  // ---- Deck data (the durable-upload cascade) ----
  const [deck, setDeck] = useState<LiveDeckData | null>(null);
  useEffect(() => {
    if (!deck) return;
    rememberDeckItems(deckItems(deck)); // the Issues badge counts tie breaches / product gaps without loading the deck again
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [deck]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [gran, setGran] = useState<Grain>('month');
  // ?month=YYYY-MM (links from Issues) opens that month; #close / #product-gaps scroll to the panel once the deck is in
  const [periodKey, setPeriodKey] = useState<string>(() => { try { const m = new URLSearchParams(window.location.search).get('month'); return m && /^\d{4}-\d{2}$/.test(m) ? m : ''; } catch { return ''; } });
  const [display, setDisplay] = useState<PnlDisplay>('both');
  const [fy, setFy] = useState<string>('all');
  // COGM basis: Normalised by default (founder, 5 Nov 2026: GM should move with revenue and mix — the flat FY
  // blend is retired); Actual (ties to Tally month by month) is one click and remembered. ONE switch (on the
  // P&L sheet / Overview headline) drives every section of that tab.
  const [basis, setBasis] = usePref<CogmBasis>('basis', 'normalised');
  const [chanPref, setChanPref] = usePref<'continuous' | 'booked'>('channels', 'continuous');
  const [showLive, setShowLive] = useState(false);
  const [preset, setPreset] = useState<RangePreset>('last12');
  const [custom, setCustom] = useState<string[]>([]);
  const [excelOpen, setExcelOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const merged = chanPref === 'continuous';

  const loadDeck = useCallback(async (force = false) => {
    setDeckLoading(true); setDeckError(null);
    try { setDeck(await loadLiveDeck({ force })); }
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
  const normalised = useMemo(() => (view ? normaliseLiveMonths(view.months, view.completeness, view) : null), [view]);
  const basisTab = BASIS_TABS.includes(tab);
  const months = useMemo(() => (view ? (basis === 'normalised' && basisTab && normalised ? normalised.months : view.months) : []), [view, normalised, basis, basisTab]);
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
  // Range presets end on the newest COMPLETE month, never the running / half-booked one (misPeriods.anchorMonth).
  const anchor = useMemo(() => (view ? anchorMonth(view.periods, view.completeness, view.completeThrough) : null), [view]);
  const selKeys = useMemo(() => (view && isRange ? rangeKeys(preset, view.periods, custom, anchor) : []), [view, isRange, preset, custom, anchor]);
  const rangeAgg = useMemo(
    () => (view && isRange ? aggregateRange(months, completeness, selKeys, rangePresetLabel(preset, view.periods, anchor)) : null),
    [view, isRange, months, completeness, selKeys, preset, anchor],
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

  // "Why it moved": always the ACTUAL months (as booked) plus their normalised twins, whatever the basis switch says.
  const whyActual = useMemo(() => (view ? aggregatePeriods(view.months, completeness, 'month') : []), [view, completeness]);
  const whyNorm = useMemo(() => (normalised ? aggregatePeriods(normalised.months, completeness, 'month') : []), [normalised, completeness]);
  const why = useWhyData(selected, whyActual, whyNorm, view);
  useSaveBridge(why, !!view && !showLive);

  const ctx = useMemo(() => ({ merged, basis, setBasis, basisNote: normalised?.note ?? '' }), [merged, basis, setBasis, normalised]);
  const showControls = !NO_PERIOD.includes(tab) && view && allPeriods.length > 0;

  // A section that needs the deck: loading / no data / no period fallbacks, else its content.
  const withDeck = (render: () => ReactNode) => {
    if (!view) return <p className="text-sm text-slate-400 py-6 text-center">{deckLoading ? 'Loading…' : 'No data.'}</p>;
    if (allPeriods.length === 0) return <NoData />;
    return render();
  };
  const withPeriod = (render: (sel: PeriodAgg, v: LiveDeckData) => ReactNode) => withDeck(() => (
    selected ? render(selected, view!) : <p className="text-sm text-slate-400 py-6 text-center">{isRange ? 'Select 1 month or more.' : 'No period for this selection.'}</p>
  ));
  const selLabel = selected ? selected.label : '—';

  return (
    <LiveViewProvider value={ctx}>
      <PageHeader
        title="Live MIS"
        description="The P&L by month, channel and product, from Tally and the connected reports."
        status={deck && view ? <CompletenessBanner deck={view} raw={deck} showLive={showLive} setShowLive={setShowLive} /> : undefined}
        tabs={TABS} tab={tab} onTab={(t) => setTab(t as Tab)}
        help={<>
          <p>A month is final only after you lock it.</p>
          <p>Until then, the numbers change when a report or the Tally books change.</p>
          <p><Link to="/reporting/mis/rulebook" className="font-medium text-accent-600 hover:underline">Read how each number is made</Link></p>
        </>}
        actions={<>
          <Popover align="right" width={200} buttonClassName={BTN} button={<>Download<ChevronDown className="h-4 w-4" aria-hidden /></>}>
            <div className="p-1.5">
              <button type="button" onClick={() => setExcelOpen(true)} disabled={!deck || deckLoading} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">Download Excel</button>
              <button type="button" onClick={() => setPdfOpen(true)} disabled={!deck || deckLoading} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">Download PDF</button>
            </div>
          </Popover>
          <HeaderMore>
            <Link to="/reporting/mis/send" className={BTN}>Send report</Link>
            <button type="button" onClick={() => void loadDeck(true)} disabled={deckLoading} title="Pull every live report again now. They also refresh every 15 minutes." className={BTN}>
              <RefreshCw className={`h-4 w-4 ${deckLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />Refresh
            </button>
          </HeaderMore>
        </>}
      />

      {view && excelOpen && <LiveExcelModal deck={showLive ? swapAlternates(deck!) : deck!} open onClose={() => setExcelOpen(false)} basis={basis} merged={merged} />}
      {view && pdfOpen && <LivePdfModal deck={showLive ? swapAlternates(deck!) : deck!} open onClose={() => setPdfOpen(false)} basis={basis} merged={merged} />}

      <div className="mx-auto max-w-7xl space-y-3 px-4 pb-10 sm:px-6 lg:px-8">
        {deck?.productGaps && <div id="product-gaps" className="scroll-mt-24"><ProductGapsPanel gaps={deck.productGaps} onChanged={() => void loadDeck(true)} /></div>}
        {deckError && <ErrorBox onRetry={() => void loadDeck(true)}>{deckError}</ErrorBox>}

        {/* Period controls (grain, year / range, period, channel naming) — once, for every tab but Statements */}
        {showControls && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Field label="Period type">
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
                  {RANGE_PRESETS.map((p) => <option key={p} value={p}>{rangePresetLabel(p, view.periods, anchor)}</option>)}
                </select>
              </Field>
            )}
            {!isRange && (
              <Field label="Period">
                <select value={selected?.key ?? ''} onChange={(e) => setPeriodKey(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm">
                  {[...shownPeriods].reverse().map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Channel names">
              <Pills label="Channel naming" value={chanPref} onChange={setChanPref}
                options={[{ id: 'continuous', label: 'Merged' }, { id: 'booked', label: 'As booked' }]} />
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
                    className={`px-2 py-0.5 rounded-md text-xs sm:text-[11px] border ${on ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                    {monthLabel(k)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {view && !isRange && selected && selected.members.length === 1 && view.completeness[selected.members[0]]?.level !== undefined && (
          <div id="close" className="scroll-mt-24"><MonthClosePanel periodKey={selected.members[0]} comp={view.completeness[selected.members[0]]} onChanged={() => void loadDeck(true)} /></div>
        )}
        {showControls && isRange && selected && (
          <p className="text-xs text-slate-500"><span className="font-medium text-slate-700">{selected.label}</span>: {selected.members.length} months added together.</p>
        )}

        {/* ---- Overview ---- */}
        {tab === 'overview' && (
          <>
            <Section id="ov-headline" title="Headline" defaultOpen
              meta={selLabel}>
              {withPeriod((sel) => <OverviewTab period={sel} periods={shownPeriods} allPeriods={allPeriods} gran={aggGran} traffic={trafficRows} isRange={isRange} />)}
            </Section>
            <Section id="ov-why" title="Why it moved" meta={whySummary(why)}>
              {withDeck(() => <WhyItMoved data={why} />)}
            </Section>
            <Section id="ov-growth" title="Revenue and growth"
              meta="ARR, discounts, growth">
              {withDeck(() => <RevenueGrowthTab monthly={monthly} periods={shownPeriods} allPeriods={allPeriods} gran={aggGran} completeThrough={view!.completeThrough} />)}
            </Section>
            <Section id="ov-runrate" title="Run-rate"
              meta="Daily sales, ad spend and orders from the connected reports">
              <RunRateTab />
            </Section>
          </>
        )}

        {/* ---- P&L (this IS the MIS) ---- */}
        {tab === 'pnl' && (
          <>
            <Section id="pnl-sheet" title="MIS sheet" defaultOpen
              meta="Months of 1 fiscal year and the total">
              {withDeck(() => <LiveMisSheetTab deck={view!} normalisedMonths={normalised?.months ?? null} />)}
            </Section>
            <Section id="pnl-ladder" title="Margins and costs"
              meta="Margin ladder, P&L bridge, costs as % of net revenue">
              {withPeriod((sel) => <ProfitabilityTab period={sel} periods={shownPeriods} gran={aggGran} />)}
            </Section>
            <Section id="pnl-detail" title="Detailed P&L"
              meta="1 column per period. Select a line to see its ledgers.">
              {withDeck(() => <PnlTab periods={pnlCols} months={months} completeness={completeness} gran={isRange ? 'month' : aggGran} display={display} setDisplay={setDisplay} />)}
            </Section>
            <Section id="pnl-channels" title="By channel"
              meta={`Channel P&L, ${selLabel}`}>
              {withPeriod((sel, v) => <ChannelsTab period={sel} periods={shownPeriods} cells={v.skuCells} periodKeys={periodKeys} completeness={completeness} />)}
            </Section>
          </>
        )}

        {/* ---- Channels ---- */}
        {tab === 'channels' && (
          <>
            <Section id="ch-mix" title="Channel mix" defaultOpen
              meta={selLabel}>
              {withPeriod((sel, v) => <ChannelMixTab period={sel} periods={shownPeriods} months={v.months} monthly={monthly} quarterly={quarterly} yearly={yearly} gran={aggGran} />)}
            </Section>
            <Section id="ch-skuchannel" title="SKU × channel"
              meta={`Products by channel, ${selLabel}`}>
              {withPeriod((sel, v) => <SkuChannelTab period={sel} cells={v.skuCells} periodKeys={periodKeys} completeness={completeness} />)}
            </Section>
          </>
        )}

        {/* ---- Products ---- */}
        {tab === 'products' && (
          <>
            <Section id="pr-sku" title="SKU P&L" defaultOpen meta={`P&L per product, ${selLabel}`}>
              {withPeriod((sel, v) => <SkuTab period={sel} cells={v.skuCells} periodKeys={periodKeys} />)}
            </Section>
            <Section id="pr-units" title="Units sold" meta={`Units per product and channel, ${selLabel}`}>
              {withPeriod((sel, v) => <SkuUnitsTab period={sel} cells={v.skuCells} periodKeys={periodKeys} />)}
            </Section>
          </>
        )}

        {/* ---- Statements ---- */}
        {tab === 'statements' && (
          <>
            <Section id="st-bs" title="Balance sheet" defaultOpen meta="Month end, last 12 months, ₹ lakh, from the Tally trial balance">
              <BalanceSheetTab />
            </Section>
            <Section id="st-cf" title="Cash flow" meta="Month to month, ₹ lakh: operations, investing, financing">
              <CashFlowTab />
            </Section>
          </>
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
  const ready = deck.periods.filter((k) => deck.completeness[k]?.ready);
  return (
    <Popover align="left" width={340} buttonLabel="Month status"
      buttonClassName={`inline-flex min-h-11 sm:min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${through ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
      button={<><Lock className="h-3.5 w-3.5" aria-hidden />{through ? `Locked to ${monthLabel(through)}` : 'No month locked'}{ready.length > 0 && <span className="rounded-full bg-white/70 px-1.5 text-accent-700">{ready.length} ready</span>}</>}>
      <dl className="space-y-2 p-4 text-[13px] font-normal text-slate-700">
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Locked to</dt><dd className="font-semibold text-slate-900">{through ? monthLabel(through) : 'No month'}</dd></div>
        {ready.length > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-500">Ready to lock</dt><dd className="text-right font-medium text-accent-700">{ready.map(monthLabel).join(', ')}</dd></div>}
        {latest && latest !== through && <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Newest data</dt><dd className="flex items-center gap-1.5">{monthLabel(latest)} <LevelBadge level={deck.completeness[latest]?.level ?? 'topline'} /></dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Old history (fixed)</dt><dd>to {monthLabel(prevMonth(LIVE_BOUNDARY))}</dd></div>
        {published.length > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-500">From the published MIS</dt><dd>{span(published)}</dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-slate-500">Months with data</dt><dd className="tabular-nums">{deck.periods.length}</dd></div>
        <PublishedGapChip deck={deck} />
        {altKeys.length > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 border-t border-slate-200 pt-2 text-slate-700">
            <input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} />
            Show live numbers for {span(altKeys)}
          </label>
        )}
      </dl>
    </Popover>
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
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-900">No data</p>
      <p className="mt-1 text-sm text-slate-600">Pull or upload the reports in <Link to="/reporting/mis/connectors" className="font-medium text-brand-600 underline">Setup</Link>.</p>
    </div>
  );
}

// ============================================================================
// Run-rate — the always-on connector fact stream for the WHOLE business
// (daily / weekly / monthly). Freshness and uploads live in Setup.
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
  { id: 'net', label: 'Net (revenue less fees)', money: true },
  { id: 'fees', label: 'Fees', money: true },
  { id: 'spend', label: 'Ad spend', money: true },
  { id: 'orders', label: 'Orders', money: false },
  { id: 'units', label: 'Units', money: false },
  { id: 'aov', label: 'AOV', money: true },
  { id: 'mer', label: 'MER (revenue ÷ ad spend)', money: false },
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchFacts(from, to)); setFetchedAt(new Date()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not pull the reports. Try again.'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void loadRef.current(), AUTO_MS);
    return () => clearInterval(t);
  }, [auto]);

  const facts = useMemo(() => data?.facts ?? [], [data]);

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
  const mrr = (sum.revenue / days) * 30;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
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
        <div className="flex items-center gap-3 text-xs sm:text-[11px] text-slate-400 sm:ml-auto pb-1">
          {fetchedAt && <span>updated {fetchedAt.toLocaleTimeString()}</span>}
          <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto</label>
          <button onClick={() => void load()} disabled={loading} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile label="Revenue" value={inr(sum.revenue)} sub={`${days} days`} />
        <KpiTile label="MRR" value={inr(mrr)} sub="30 days at this rate" />
        <KpiTile label="Ad spend" value={inr(sum.spend)} />
        <KpiTile label="MER" value={sum.mer ? `${sum.mer.toFixed(2)}×` : '—'} sub="Revenue ÷ ad spend" />
        <KpiTile label="Net" value={inr(sum.net)} sub="Revenue less fees" />
        <KpiTile label="Orders" value={sum.orders.toLocaleString('en-IN')} />
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2">
          <span className="font-medium text-slate-700">{RR_GRAINS.find((g) => g.id === gran)!.label} {metricDef.label} by {RR_DIMS.find((d) => d.id === dim)!.label.toLowerCase()}</span>
          {' '}· {from} to {to}{isRatio ? ' · a ratio, no total' : ''}
        </p>
        {facts.length === 0 ? (
          <p className="text-sm text-slate-600">No data for these dates. Connect Shopify in <Link to="/reporting/mis/connectors" className="font-medium text-brand-600 underline">Setup</Link>.</p>
        ) : (
          <div tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-xs sm:text-[11px] text-slate-400 border-b border-slate-200">
                <th className="py-1.5 px-3 text-left font-medium sticky left-0 bg-white">{RR_DIMS.find((d) => d.id === dim)!.label}</th>
                {periods.map((p) => <th key={p} className="py-1.5 px-2 text-right font-medium whitespace-nowrap">{p}</th>)}
                {!isRatio && <th className="py-1.5 pl-3 pr-3 text-right font-semibold">Total</th>}
              </tr></thead>
              <tbody>
                {rows.map((key) => (
                  <tr key={key} className="border-b border-slate-50">
                    <td className="py-1.5 px-3 text-slate-700 font-medium sticky left-0 bg-white max-w-[220px] truncate" title={key}>{key}</td>
                    {periods.map((p) => { const v = cell.get(`${key}||${p}`); return <td key={p} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{v == null ? '·' : fmt(v)}</td>; })}
                    {!isRatio && <td className="py-1.5 pl-3 pr-3 text-right tabular-nums font-semibold text-slate-800">{fmt(rowTotals.get(key) ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
          {data.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}
    </div>
  );
}
