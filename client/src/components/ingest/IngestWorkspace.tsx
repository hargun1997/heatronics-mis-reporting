// Setup page panels: "Reports by month" (which months have every necessary upload) and "Pull the reports for 1 month"
// (one button for every connected automatic report). The old Uploads workspace is gone: each source's drawer holds its uploads.

import { BTN_PRIMARY, InfoTip, Panel } from '../ui/states';
import { useState } from 'react';
import type { ConnectorInfo } from '../../data/monthClose/connectorsClient';
import { ALL_SLOTS, slotsFor } from '../../data/ingest/catalog';
import { pullAndCommit, slotKey, type SlotSourceInfo } from '../../data/ingest/slotSources';
import type { IngestReportMeta } from '../../data/ingest/types';
import { LIVE_BOUNDARY } from '../../data/misDeck/liveDeck';

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

  const GLYPH: Record<MonthState, string> = { complete: '✓', partial: '', none: '✕' };
  return (
    <Panel title="Reports by month"
      action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${completeThrough ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {completeThrough ? `Complete to ${monthName(completeThrough)}` : 'No complete month'} · {completeCount} of {rows.length}
      </span>}>
      <div className="flex flex-wrap items-center gap-1.5">
        {rows.map((r) => (
          <div key={r.mk} title={tip(r)}
            className={`rounded-md border px-2 py-1 text-xs font-medium tabular-nums ${CHIP[r.state]}`}>
            {GLYPH[r.state] && <span aria-hidden className="mr-1">{GLYPH[r.state]}</span>}{shortMonth(r.mk)}
            {r.state === 'partial' && expected.length > 0 && <span className="ml-1 opacity-70">{r.present}/{expected.length}</span>}
            <span className="sr-only">: {r.state === 'complete' ? 'complete' : r.state === 'partial' ? 'some reports missing' : 'no reports'}</span>
          </div>
        ))}
        <InfoTip label="What the colours mean" text="Key">
          <p>Green ✓: all necessary uploads are in.</p>
          <p>Amber 2/5: some uploads are in.</p>
          <p>Red ✕: no upload is in.</p>
          <p>Point at a month to see the missing reports.</p>
          <p>Months before {monthName(LIVE_BOUNDARY)} are old history. They do not change.</p>
        </InfoTip>
      </div>
    </Panel>
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

  const off = auto.filter((s) => !sources.get(slotKey(s.connectorId, s.slotId))?.connected);
  return (
    <Panel title="Pull the reports for 1 month"
      action={<span className="text-xs text-slate-600">{ready.length} of {auto.length} connected · {manual.length} manual</span>}>
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" aria-label="Month to pull" value={month} onChange={(e) => setMonth(e.target.value)} className="min-h-11 sm:min-h-9 rounded-lg border border-slate-300 px-2 text-sm" />
        <button type="button" onClick={() => void run()} disabled={running || ready.length === 0 || !/^\d{4}-\d{2}$/.test(month)} className={BTN_PRIMARY}>
          {running ? 'Pulling…' : `Pull all for ${monthName(month)}`}
        </button>
        {off.length > 0 && (
          <InfoTip label={`${off.length} reports not connected`} text={`${off.length} not connected`}>
            <p className="font-semibold text-slate-900">{off.length} reports are not connected</p>
            <ul className="list-disc pl-4">{off.map((s) => <li key={slotKey(s.connectorId, s.slotId)}>{s.label}</li>)}</ul>
          </InfoTip>
        )}
        <InfoTip label="How Pull all works" text="How it works">
          <p>Pull all gets each connected report for the month.</p>
          <p>It saves a report only when all checks pass.</p>
          <p>If a check fails, open the source below. Then review the report or upload the file.</p>
        </InfoTip>
      </div>
      {results.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? 'text-emerald-700' : 'text-amber-800'}>{r.ok ? '✓' : '!'} <span className="font-medium">{r.label}</span>: {r.detail}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
