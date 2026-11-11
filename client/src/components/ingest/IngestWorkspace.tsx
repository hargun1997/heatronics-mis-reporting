// ----------------------------------------------------------------------------
// IngestWorkspace — a pill per connector (name + freshness dot), select one to
// open its report slots, each with its own upload → checks → review → save →
// ingest stepper. Ingested reports are durable (server store) and overwrite by
// connector+slot+period.
// ----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listConnectors, MODE_LABEL, type ConnectorInfo } from '../../data/monthClose/connectorsClient';
import { getIngestStatus, listIngestReports, refreshIngestStore } from '../../data/ingest/ingestClient';
import { chatStatus } from '../../data/chat/chatClient';
import { ALL_SLOTS, slotsFor } from '../../data/ingest/catalog';
import { listSlotSources, pullAndCommit, slotKey, type SlotSourceInfo } from '../../data/ingest/slotSources';
import type { IngestReportMeta, IngestStoreStatus } from '../../data/ingest/types';
import { LIVE_BOUNDARY } from '../../data/misDeck/liveDeck';
import { IngestStepper } from './IngestStepper';

type PillStatus = 'fresh' | 'stale' | 'none' | 'live';
const PILL_DOT: Record<PillStatus, string> = {
  fresh: 'bg-emerald-500', stale: 'bg-amber-500', none: 'bg-slate-300', live: 'bg-sky-500',
};

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthName(mk: string): string {
  const [y, m] = mk.split('-');
  return `${MONTH_ABBR[Number(m)] ?? m} ${y}`;
}
function shortMonth(mk: string): string {
  const [y, m] = mk.split('-');
  return `${MONTH_ABBR[Number(m)] ?? m} '${y.slice(2)}`;
}
function nextMonth(mk: string): string {
  let [y, m] = mk.split('-').map(Number);
  m += 1; if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Month keys from `start` to `end` inclusive (calendar-walked). */
function monthRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end && out.length < 120) { out.push(cur); cur = nextMonth(cur); }
  return out;
}

function lastMonth(): string {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
}

type MonthState = 'complete' | 'partial' | 'none';

/**
 * "Where we are" — the live window (from the Apr-2026 boundary to the current
 * month) laid out month by month. A month is scored against the FULL set of
 * required reports (every required slot across every upload connector), not
 * just Tally: all required sources in → green, some in → amber, none → red.
 * History before the boundary is locked legacy.
 */
export function CoveragePanel({ reports, connectors }: { reports: IngestReportMeta[]; connectors: ConnectorInfo[] }) {
  const today = currentMonthKey();
  const end = today > LIVE_BOUNDARY ? today : LIVE_BOUNDARY;
  const months = monthRange(LIVE_BOUNDARY, end);

  // The required uploads for a complete month: every required slot on every
  // connector that is uploaded (live-API sources pull themselves, so they don't
  // count). Each entry is `${connectorId}|${slotId}` with a label for tooltips.
  const expected = connectors
    .filter((c) => c.mode !== 'live-api')
    .flatMap((c) => slotsFor(c.id).filter((s) => s.required).map((s) => ({ key: `${c.id}|${s.slotId}`, label: `${c.label} · ${s.label}` })));

  const stateOf = (mk: string): { state: MonthState; present: number; missing: string[] } => {
    const have = new Set(reports.filter((r) => r.periodKey === mk).map((r) => `${r.connectorId}|${r.slotId}`));
    const present = expected.filter((e) => have.has(e.key));
    const missing = expected.filter((e) => !have.has(e.key)).map((e) => e.label);
    const anyHere = reports.some((r) => r.periodKey === mk);
    // Guard before connectors load (expected empty): fall back to any-data.
    if (expected.length === 0) return { state: anyHere ? 'partial' : 'none', present: anyHere ? 1 : 0, missing: [] };
    if (present.length === expected.length) return { state: 'complete', present: present.length, missing: [] };
    if (present.length > 0 || anyHere) return { state: 'partial', present: present.length, missing };
    return { state: 'none', present: 0, missing };
  };
  const rows = months.map((mk) => ({ mk, ...stateOf(mk) }));

  // Complete-through = the contiguous run of fully-complete months from the start.
  let completeThrough: string | null = null;
  for (const r of rows) { if (r.state === 'complete') completeThrough = r.mk; else break; }
  const completeCount = rows.filter((r) => r.state === 'complete').length;

  const CHIP: Record<MonthState, string> = {
    complete: 'bg-emerald-500 text-white border-emerald-500',
    partial: 'bg-amber-100 text-amber-800 border-amber-300',
    none: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  const tip = (r: typeof rows[number]) => {
    if (r.state === 'complete') return `${monthName(r.mk)} — complete · all ${expected.length} required reports in`;
    if (r.state === 'none') return `${monthName(r.mk)} — nothing uploaded · ${expected.length} required`;
    return `${monthName(r.mk)} — partial · ${r.present}/${expected.length} in · missing: ${r.missing.join(', ')}`;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-800">Where we are</h3>
        <span className="text-xs sm:text-[11px] text-slate-500">
          Live window from <span className="font-medium text-slate-700">{monthName(LIVE_BOUNDARY)}</span>
          {completeThrough
            ? <> · <span className="text-emerald-700 font-medium">complete through {monthName(completeThrough)}</span></>
            : <> · <span className="text-amber-700 font-medium">no month fully complete yet</span></>}
          {' '}· {completeCount} of {rows.length} month{rows.length === 1 ? '' : 's'} complete
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <div key={r.mk} title={tip(r)}
            className={`px-2 py-1 rounded-md border text-xs sm:text-[11px] font-medium tabular-nums ${CHIP[r.state]}`}>
            {shortMonth(r.mk)}
            {r.state === 'partial' && expected.length > 0 && <span className="ml-1 opacity-70">{r.present}/{expected.length}</span>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Complete (all required in)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-300" /> Partial (some in)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-300" /> Nothing in yet</span>
        <span className="text-slate-400">· Hover a month for what's missing. History before {monthName(LIVE_BOUNDARY)} is locked legacy.</span>
      </div>
    </div>
  );
}

/**
 * One button for every automatic slot (API / sheet) of a month: pull each, and
 * save the ones whose checks pass cleanly. Anything that fails or warns stays
 * for review in its slot below (with the upload box as fallback).
 */
export function AutoPullPanel({ sources, onDone }: { sources: Map<string, SlotSourceInfo>; onDone: () => void }) {
  const [month, setMonth] = useState(lastMonth());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ label: string; ok: boolean; detail: string }[]>([]);
  const auto = ALL_SLOTS.filter((s) => sources.get(slotKey(s.connectorId, s.slotId))?.pullable);
  const ready = auto.filter((s) => sources.get(slotKey(s.connectorId, s.slotId))?.connected);
  const manual = ALL_SLOTS.filter((s) => {
    const src = sources.get(slotKey(s.connectorId, s.slotId));
    return src && (src.source === 'upload' || src.source === 'claude_task');
  });
  if (auto.length === 0) return null;

  const run = async () => {
    setRunning(true); setResults([]);
    const out: { label: string; ok: boolean; detail: string }[] = [];
    // Two at a time: Amazon's slow pulls don't hold up the quick ones.
    for (let i = 0; i < ready.length; i += 2) {
      const batch = await Promise.all(ready.slice(i, i + 2).map(async (slot) => {
        const r = await pullAndCommit(slot, sources.get(slotKey(slot.connectorId, slot.slotId))!, month);
        return { label: slot.label, ok: r.ok, detail: r.detail };
      }));
      out.push(...batch);
      setResults([...out]);
    }
    setRunning(false);
    onDone();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Automatic sources</h3>
        <span className="text-xs sm:text-[11px] text-slate-500">{auto.length} reports fill themselves ({ready.length} connected) · {manual.length} are manual uploads</span>
        <div className="ml-auto flex items-center gap-2">
          <input type="month" aria-label="Month to pull" value={month} onChange={(e) => setMonth(e.target.value)} className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
          <button onClick={() => void run()} disabled={running || ready.length === 0 || !/^\d{4}-\d{2}$/.test(month)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cta text-on-cta hover:bg-cta-hover disabled:opacity-40">
            {running ? 'Pulling…' : `Pull & save all for ${monthName(month)}`}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {auto.map((s) => {
          const src = sources.get(slotKey(s.connectorId, s.slotId))!;
          return (
            <span key={slotKey(s.connectorId, s.slotId)} title={src.line} className={`text-xs sm:text-[11px] px-2 py-0.5 rounded-md border ${src.connected ? 'border-slate-200 bg-white text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              {s.label}{src.connected ? '' : ' · connect'}
            </span>
          );
        })}
      </div>
      {results.length > 0 && (
        <ul className="text-xs sm:text-[11px] space-y-0.5">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? 'text-emerald-700' : 'text-amber-800'}>{r.ok ? '✓' : '!'} <span className="font-medium">{r.label}</span> — {r.detail}</li>
          ))}
        </ul>
      )}
      <p className="text-xs sm:text-[11px] text-slate-500">Only clean pulls are saved. A pull that needs a look (a warning or failed check) is listed here; open that source below to review it or upload the report by hand.</p>
    </div>
  );
}

export function IngestWorkspace() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [reports, setReports] = useState<IngestReportMeta[]>([]);
  const [store, setStore] = useState<IngestStoreStatus | null>(null);
  const [claudeLive, setClaudeLive] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [rechecking, setRechecking] = useState(false);
  const [sources, setSources] = useState<Map<string, SlotSourceInfo>>(new Map());
  // Founder, 3 Nov 2026: Uploads lists only what still needs a person. Automatic slots fill from "Pull & save all";
  // their upload box (the fallback) opens with "Show automatic reports too".
  const [showAuto, setShowAuto] = useState(false);

  const reloadReports = useCallback(async () => {
    try { setReports(await listIngestReports()); } catch { /* keep prior */ }
  }, []);

  useEffect(() => {
    listConnectors().then((r) => {
      setConnectors(r.connectors);
      // #<connectorId> (links from Issues) opens that source
      const want = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
      setSelected((cur) => cur || (want && r.connectors.some((c) => c.id === want) ? want : '') || r.connectors[0]?.id || '');
    }).catch(() => {});
    getIngestStatus().then((r) => setStore(r.store)).catch(() => {});
    chatStatus().then((s) => setClaudeLive(s.configured)).catch(() => setClaudeLive(false));
    listSlotSources()
      .then((r) => setSources(new Map(r.slots.map((x) => [slotKey(x.connectorId, x.slotId), x]))))
      .catch(() => {});
    void reloadReports();
  }, [reloadReports]);

  // Latest report per connector+slot.
  const latest = useMemo(() => {
    const m = new Map<string, IngestReportMeta>();
    for (const r of reports) {
      const k = `${r.connectorId}|${r.slotId}`;
      const cur = m.get(k);
      if (!cur || r.periodKey > cur.periodKey) m.set(k, r);
    }
    return m;
  }, [reports]);

  const target = lastMonth();
  const statusFor = useCallback((c: ConnectorInfo): PillStatus => {
    if (c.mode === 'live-api') return 'live';
    const slots = slotsFor(c.id);
    const required = slots.filter((s) => s.required);
    const hasAny = slots.some((s) => latest.has(`${c.id}|${s.slotId}`));
    if (!hasAny) return 'none';
    const allFresh = required.length > 0 && required.every((s) => {
      const r = latest.get(`${c.id}|${s.slotId}`);
      return r && r.periodKey >= target;
    });
    return allFresh ? 'fresh' : 'stale';
  }, [latest, target]);

  const loaded = sources.size > 0;
  const isManual = useCallback((connectorId: string, slotId: string) => {
    const src = sources.get(slotKey(connectorId, slotId));
    return !loaded || !src || src.source === 'upload';
  }, [sources, loaded]);
  const manualCount = (id: string) => slotsFor(id).filter((s) => isManual(id, s.slotId)).length;
  const shownConnectors = showAuto ? connectors : connectors.filter((c) => manualCount(c.id) > 0);
  useEffect(() => {
    if (!loaded || !shownConnectors.length) return;
    if (!shownConnectors.some((c) => c.id === selected)) setSelected(shownConnectors[0].id);
  }, [loaded, shownConnectors, selected]);

  const sel = shownConnectors.find((c) => c.id === selected);
  const allSlots = sel ? slotsFor(sel.id) : [];
  const selSlots = showAuto ? allSlots : allSlots.filter((s) => isManual(sel!.id, s.slotId));
  const hiddenAuto = allSlots.length - selSlots.length;

  return (
    <div className="space-y-5">
      {/* "Where we are" — the live window month by month */}
      <CoveragePanel reports={reports} connectors={connectors} />

      <AutoPullPanel sources={sources} onDone={reloadReports} />

      {/* Status strip: Claude API (reads Tally screenshots + Ask the MIS) + store durability */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-[11px]">
        <span className={
          'px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 font-medium ' +
          (claudeLive ? 'bg-emerald-50 text-emerald-700' : claudeLive === false ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400')
        }>
          <span className={'w-1.5 h-1.5 rounded-full ' + (claudeLive ? 'bg-emerald-500' : claudeLive === false ? 'bg-amber-500' : 'bg-slate-300')} />
          Claude API {claudeLive == null ? '…' : claudeLive ? 'live' : 'offline'}
        </span>
        <span className="text-slate-400">reads Tally screenshots &amp; powers Ask the MIS</span>
        <span className="text-slate-400">· AI spend is in the top bar &amp; <a href="/reporting/mis/insights" className="text-brand-600 hover:underline">AI Insights</a></span>
        {store && (
          <span className="text-slate-400">
            · storage: {store.durable ? <span className="text-emerald-700">Cloud Storage</span> : <span className="text-amber-700">temporary</span>}
          </span>
        )}
      </div>

      {/* Store durability banner */}
      {store && !store.durable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 space-y-2">
          <p className="font-medium">⚠ Uploaded reports are saved to a temporary store and will be cleared on restart.</p>
          {store.grantHint ? (
            <>
              <p>To make the ingestion store durable (a Cloud Storage bucket), run this once in Cloud Shell, then Re-check:</p>
              <pre className="bg-amber-100 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs sm:text-[11px]">{store.grantHint}</pre>
              {store.error && <p className="text-amber-700">Storage said: {store.error}</p>}
            </>
          ) : <p>This server isn't on GCP, so reports persist only in a temp directory.</p>}
          <button onClick={async () => { setRechecking(true); try { const r = await refreshIngestStore(); setStore(r.store); } finally { setRechecking(false); } }}
            disabled={rechecking}
            className="px-2.5 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-40">
            {rechecking ? 'Re-checking…' : 'Re-check store'}
          </button>
        </div>
      )}
      {store && store.durable && (
        <p className="text-xs sm:text-[11px] text-slate-400">Reports saved durably to Cloud Storage bucket <span className="font-mono">{store.bucket}</span>.</p>
      )}

      {/* Manual uploads: only the reports no API, sheet or Claude task can fill */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-800">{showAuto ? 'All reports (uploads as a fallback)' : 'Manual uploads'}</h3>
        <span className="text-xs sm:text-[11px] text-slate-500">
          {showAuto ? 'Automatic reports are shown too: upload one only if its pull fails.' : 'Only the reports that have no API, sheet or Claude task. Everything else fills from "Pull & save all" above.'}
        </span>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs sm:text-[11px] text-slate-600">
          <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} />
          Show automatic reports too
        </label>
      </div>

      {/* Pill bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {shownConnectors.map((c) => {
          const st = statusFor(c);
          const active = c.id === selected;
          return (
            <button key={c.id} onClick={() => setSelected(c.id)}
              className={
                'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm whitespace-nowrap transition-colors ' +
                (active ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50')
              }>
              <span className={`w-2 h-2 rounded-full ${PILL_DOT[st]}`} />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Selected connector detail */}
      {sel && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-800">{sel.label}</h3>
            {(() => {
              const m = manualCount(sel.id);
              const auto = m === 0 && loaded;
              return <span className={'px-1.5 py-0.5 rounded text-xs sm:text-[11px] ' + (auto || sel.mode === 'live-api' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800')}>
                {auto ? 'Automatic' : sel.mode === 'live-api' ? MODE_LABEL[sel.mode] : 'Manual upload'}
              </span>;
            })()}
          </div>
          {hiddenAuto > 0 && (
            <p className="text-xs sm:text-[11px] text-slate-500">{hiddenAuto} more {sel.label} report{hiddenAuto === 1 ? '' : 's'} fill automatically (hidden; tick "Show automatic reports too" to upload one by hand).</p>
          )}

          {sel.mode === 'live-api' && showAuto ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Pulled automatically via API on the Live MIS page — no upload needed.
              {selSlots.length > 0 && <span className="text-slate-400"> A manual fallback report is available below if ever needed.</span>}
            </div>
          ) : null}

          {selSlots.map((slot) => (
            <IngestStepper
              key={slot.slotId}
              slot={slot}
              existing={latest.get(`${sel.id}|${slot.slotId}`)}
              onCommitted={reloadReports}
              source={sources.get(slotKey(sel.id, slot.slotId))}
            />
          ))}

          {selSlots.length === 0 && (
            <p className="text-sm text-slate-400">No report slots defined for this connector yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
