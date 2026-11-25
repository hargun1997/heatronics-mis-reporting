// Setup page panels: "Reports by month" (which months have every necessary upload) and "Pull the reports for 1 month"
// (one button for every connected automatic report). The old Uploads workspace is gone: each source's drawer holds its uploads.

import { BTN_PRIMARY, InfoTip, Panel } from '../ui/states';
import { useEffect, useState } from 'react';
import { StatusPill } from '../ui/StatusPill';
import { ALL_SLOTS } from '../../data/ingest/catalog';
import { pullAndCommit, slotKey, type SlotSourceInfo } from '../../data/ingest/slotSources';
import { LIVE_BOUNDARY } from '../../data/misDeck/boundary';
import { istMonth } from '../../utils/ist';

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthName(mk: string): string {
  const [y, m] = mk.split('-');
  return `${MONTH_ABBR[Number(m)] ?? m} ${y}`;
}
function shortMonth(mk: string): string {
  const [y, m] = mk.split('-');
  return `${MONTH_ABBR[Number(m)] ?? m} '${y.slice(2)}`;
}

function lastMonth(): string {
  return istMonth(-1);
}

interface MonthCov { period: string; state: 'complete' | 'partial' | 'none' | 'running' | 'locked'; expected: number; present: number; missing: { label: string; detail: string; required: boolean }[] }

/**
 * Reports by month: the SAME check as Tasks → Fix (server closeSlots.monthCoverage: every report slot, missing, empty or
 * part of the month). Tap a month to see what is missing (the old hover tooltip did not work on phones).
 */
export function CoveragePanel({ refreshKey }: { refreshKey?: unknown }) {
  const [months, setMonths] = useState<MonthCov[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/ingest/coverage').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { months: MonthCov[] }) => { if (live) { setMonths(j.months); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [refreshKey]);

  let completeThrough: string | null = null;
  for (const r of months ?? []) { if (r.state === 'complete' || r.state === 'locked') completeThrough = r.period; else if (r.state !== 'running') break; }
  const closed = (months ?? []).filter((r) => r.state !== 'running');
  const completeCount = closed.filter((r) => r.state === 'complete' || r.state === 'locked').length;
  const CHIP: Record<MonthCov['state'], string> = {
    complete: 'bg-emerald-500 text-white border-emerald-500',
    locked: 'bg-emerald-500 text-white border-emerald-500',
    partial: 'bg-amber-100 text-amber-800 border-amber-300',
    none: 'bg-red-50 text-red-700 border-red-200',
    running: 'bg-white text-slate-600 border-slate-300',
  };
  const GLYPH: Record<MonthCov['state'], string> = { complete: '✓', locked: '✓', partial: '', none: '✕', running: '' };
  const sel = (months ?? []).find((m) => m.period === open) ?? null;
  return (
    <Panel title="Reports by month"
      action={months ? <StatusPill size="sm" toneName={completeThrough ? 'positive' : 'warning'}>
        {completeThrough ? `Complete to ${monthName(completeThrough)}` : 'No complete month'} · {completeCount} of {closed.length}
      </StatusPill> : null}>
      {error && <p className="text-sm text-slate-600">Could not load the months. Reload the page.</p>}
      {!months && !error && <p role="status" className="text-sm text-slate-500">Loading…</p>}
      {months && (
        <div className="flex flex-wrap items-center gap-1.5">
          {months.map((r) => (
            <button key={r.period} type="button" aria-pressed={open === r.period} onClick={() => setOpen(open === r.period ? null : r.period)}
              className={`min-h-11 sm:min-h-8 rounded-md border px-2 text-xs font-medium tabular-nums ${CHIP[r.state]} ${open === r.period ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}>
              {GLYPH[r.state] && <span aria-hidden className="mr-1">{GLYPH[r.state]}</span>}{shortMonth(r.period)}
              {r.state === 'partial' && r.expected > 0 && <span className="ml-1 opacity-70">{r.present}/{r.expected}</span>}
              <span className="sr-only">: {r.state === 'complete' ? 'complete' : r.state === 'locked' ? 'locked' : r.state === 'running' ? 'this month, still running' : r.state === 'partial' ? 'some reports missing' : 'no reports'}</span>
            </button>
          ))}
          <InfoTip label="What the colours mean" text="Key">
            <p>Green ✓: every necessary report is in (or the month is locked).</p>
            <p>Amber 2/5: some reports are in.</p>
            <p>Red ✕: no report is in.</p>
            <p>White: this month. It is still running.</p>
            <p>Tap a month to see what is missing. Tasks → Fix uses the same check.</p>
            <p>Months before {monthName(LIVE_BOUNDARY)} are old history. They do not change.</p>
          </InfoTip>
        </div>
      )}
      {sel && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="font-semibold text-slate-900">{monthName(sel.period)}: {sel.state === 'complete' || sel.state === 'locked' ? 'every necessary report is in' : `${sel.present} of ${sel.expected} necessary reports in`}</p>
          {sel.missing.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-label text-slate-700">
              {sel.missing.map((m) => <li key={m.label}>{m.label}: {m.detail}{m.required ? '' : ' (optional)'}</li>)}
            </ul>
          )}
        </div>
      )}
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
  // Pulled reports are saved from this page: leaving it while Pull all runs loses the ones not saved yet. Warn.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);
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
    // Two at a time: Amazon's slow pulls do not hold up the quick ones.
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
          {running ? `Pulling ${results.length} of ${ready.length}…` : `Pull all for ${monthName(month)}`}
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
          <p>Stay on this page until it ends. The page saves each report.</p>
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
