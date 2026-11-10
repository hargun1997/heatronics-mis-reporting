// ----------------------------------------------------------------------------
// Scheduled pull + save of the automatic close slots (10 Nov 2026).
//
// Until now only Tally was polled: every other "automatic" slot waited for someone to press "Pull & save all", so on
// 10 Nov every October api slot was still empty. This job runs once a day from the 3rd (IST): it pulls each connected
// automatic slot for LAST month, plus a few earlier unlocked months that still miss a slot, and saves a pull ONLY when
// it is clean — the same rule and the same commit as the browser's "Pull & save all" (stagePull → commitReportMonths →
// saveReport; raw file `api-pull-<connector>-<slot>-<month>.json`). Read only against every source (each pull runs its
// own guard). An uploaded file is never overwritten; a locked month is never touched.
//
// Covered here: slots whose pull returns `facts`, `bomCosts` or `trialBalance` (no browser parser needed).
// Still manual (the browser has the reader): sheet / report slots that return `rows` (Tranzact sales register, Amazon
// Business Report) and the Tally P&L (staged through the browser's close maths; the Tally poll stores its copy anyway).
//
// stagePullServer / planAutoPull / autoPullDue are pure (tests: server/test/autoPull.test.ts).
// ----------------------------------------------------------------------------

import type { DailyFact } from '../facts.js';
import type { Credentials } from '../types.js';
import type { CommitInput, IngestReportMeta } from '../../ingest/objectStore.js';
import type { SlotPull, SlotSourceDef } from './types.js';
import { CLOSE_SLOTS, LIVE_BOUNDARY, closeSlot, monthRange, prevMonthOf, slotCoverage, type StoredSlotReport } from './closeSlots.js';

const isISODate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

// ---- Stage: a finished pull → what "Pull & save all" would commit -------------------

export type Staged =
  | { kind: 'save'; commit: CommitInput; detail: string }
  /** Pulled, but a person must look (a warning, nothing returned, dates don't cover the month). */
  | { kind: 'review'; why: string }
  /** This slot's pull needs the browser's reader. */
  | { kind: 'manual'; why: string };

/** Mirror of the client's stagePull + monthBreakdown + postCommit for pulls that need no parser. */
export function stagePullServer(def: Pick<SlotSourceDef, 'connectorId' | 'slotId' | 'via'>, periodKey: string, result: SlotPull, pulledAt: string): Staged {
  const slot = closeSlot(def.connectorId, def.slotId);
  if (!slot) return { kind: 'manual', why: 'Unknown slot.' };
  if (result.rows) return { kind: 'manual', why: 'Sheet rows are read by the browser — press Pull now on Setup.' };
  if (result.tallyMonth) return { kind: 'manual', why: 'The Tally P&L is checked in the browser — press Pull now on Setup.' };

  const fileName = `api-pull-${def.connectorId}-${def.slotId}-${periodKey}.json`;
  const raw = (body: Record<string, unknown>) => [{
    base64: Buffer.from(JSON.stringify({ via: def.via, periodKey, pulledAt, trace: result.trace, warnings: result.warnings, ...body }, null, 1), 'utf8').toString('base64'),
    name: fileName, mimeType: 'application/json',
  }];
  const base = { connectorId: def.connectorId, slotId: def.slotId, slotLabel: slot.label, periodKey, fileName, mimeType: 'application/json', warnings: [] as string[] };
  const warned = result.warnings.length > 0;
  const whyWarn = () => result.warnings.join(' ').slice(0, 300);

  if (result.trialBalance) {
    const tb = result.trialBalance;
    if (tb.rows.length === 0) return { kind: 'review', why: 'Trial Balance came back with no rows.' };
    if (Math.abs(tb.difference) >= 1) return { kind: 'review', why: `Trial Balance does not tie (difference ₹${Math.round(Math.abs(tb.difference)).toLocaleString('en-IN')}).` };
    if (warned) return { kind: 'review', why: whyWarn() };
    return { kind: 'save', detail: `Trial Balance saved (${tb.rows.length} rows)`, commit: {
      ...base, rowCount: tb.rows.length, through: null, checks: { passed: 3, warned: 0, failed: 0 },
      rawFiles: raw({ trialBalance: tb }), extracted: { facts: [], trialBalance: tb },
    } };
  }

  if (result.bomCosts) {
    if (result.bomCosts.length === 0) return { kind: 'review', why: 'No finished-good costs came back.' };
    if (warned) return { kind: 'review', why: whyWarn() };
    return { kind: 'save', detail: `${result.bomCosts.length} finished-good costs saved`, commit: {
      ...base, rowCount: result.bomCosts.length, through: null, checks: { passed: 2, warned: 0, failed: 0 },
      rawFiles: raw({ bomCosts: result.bomCosts }), extracted: { facts: [], bomCosts: result.bomCosts },
    } };
  }

  const all: DailyFact[] = result.facts ?? [];
  const inMonth = all.filter((f) => !isISODate(f.date) || f.date.slice(0, 7) === periodKey);
  if (inMonth.length !== all.length) return { kind: 'review', why: `${all.length - inMonth.length} row(s) outside ${periodKey}.` };
  if (inMonth.length === 0 && !result.emptyOk) return { kind: 'review', why: 'Nothing returned.' };
  if (warned) return { kind: 'review', why: whyWarn() };
  const dated = inMonth.filter((f) => isISODate(f.date));
  const dates = dated.map((f) => f.date).sort();
  // Date coverage (audit A4: a 7–13 Oct pull was saved as a clean October).
  const cov = slotCoverage(slot, periodKey, { connectorId: def.connectorId, slotId: def.slotId, periodKey, rows: inMonth.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null });
  if (cov.kind === 'partial') return { kind: 'review', why: `${cov.detail} — check the source, then Pull now on Setup.` };
  // Undated rows are stamped to the month only when no row carries a date (monthBreakdown).
  const facts = dated.length > 0 ? inMonth : inMonth.map((f) => (f.date ? f : { ...f, date: `${periodKey}-01` }));
  return { kind: 'save', detail: `${facts.length} facts saved`, commit: {
    ...base, rowCount: facts.length, through: dates[dates.length - 1] ?? null, checks: { passed: 2, warned: 0, failed: 0 },
    rawFiles: raw({ facts: result.facts }), extracted: { facts },
  } };
}

// ---- Plan: which slot × month to pull today ---------------------------------------------

export const AUTO_PULL_FROM_DAY = 3;      // from the 3rd: last month's settlements, ads and freight are in
export const AUTO_PULL_REFRESH_DAY = 8;   // one more pull of last month from the 8th (late adjustments)
export const AUTO_PULL_FROM_HOUR = 7;     // IST
export const AUTO_PULL_MAX_EARLIER = 4;   // earlier unlocked months: a few slot-months a run, one per connector
export const AUTO_PULL_MAX_TRIES = 3;     // an earlier month that keeps failing is left to the Fix list

export interface AutoPullState {
  /** IST day of the last finished run. */
  lastRunDay: string | null;
  runningSince?: string | null;
  /** Failed / needs-review tries per "connector|slot|month". */
  tries?: Record<string, { n: number; day: string; why: string }>;
  last?: AutoPullRun | null;
}
export interface AutoPullRow { connectorId: string; slotId: string; periodKey: string; outcome: 'saved' | 'review' | 'failed' | 'not_connected' | 'manual' | 'running'; detail: string }
export interface AutoPullRun { day: string; startedAt: string; finishedAt: string | null; rows: AutoPullRow[] }

const ist = (now: number) => new Date(now + 5.5 * 3_600_000);
export const istDayOf = (now: number) => ist(now).toISOString().slice(0, 10);

/** May the scheduled run go now? Once per IST day, from the 3rd, after 07:00 IST. */
export function autoPullDue(now: number, state: AutoPullState): { due: boolean; why: string } {
  const d = ist(now);
  const day = d.toISOString().slice(0, 10);
  if (d.getUTCDate() < AUTO_PULL_FROM_DAY) return { due: false, why: `Runs from the ${AUTO_PULL_FROM_DAY}rd of the month.` };
  if (d.getUTCHours() < AUTO_PULL_FROM_HOUR) return { due: false, why: `Runs after ${AUTO_PULL_FROM_HOUR}:00 IST.` };
  if (state.lastRunDay === day) return { due: false, why: 'Already ran today.' };
  if (state.runningSince && now - Date.parse(state.runningSince) < 10 * 60_000) return { due: false, why: 'A run is in progress.' };
  return { due: true, why: '' };
}

export interface AutoTarget { connectorId: string; slotId: string; periodKey: string; why: 'missing' | 'empty' | 'partial' | 'refresh' }

/** Automatic slots a server-side save can handle (pull returns facts / bomCosts / trialBalance). */
export function serverSavable(def: SlotSourceDef): boolean {
  if (!def.pull || def.source === 'upload') return false;
  if (def.source === 'sheet' || def.parserId) return false;          // rows → the browser's reader
  if (def.connectorId === 'tally' && def.slotId === 'pnl') return false; // browser close maths; the Tally poll stores its own copy
  return true;
}

/**
 * What to pull today. Last month: every savable slot that is not stored, or whose stored copy came from a pull and is
 * empty / partial, or (from the 8th) was pulled before the 8th. Earlier unlocked months: slots with nothing stored, newest
 * first, one per connector, ≤ AUTO_PULL_MAX_EARLIER, skipping those that failed AUTO_PULL_MAX_TRIES times. An uploaded
 * file is never replaced.
 */
export function planAutoPull(x: {
  today: string; defs: SlotSourceDef[]; reports: StoredSlotReport[]; locked: Set<string>; state: AutoPullState; from?: string;
}): AutoTarget[] {
  const last = prevMonthOf(x.today.slice(0, 7));
  const from = x.from ?? LIVE_BOUNDARY;
  if (last < from) return [];
  const day = Number(x.today.slice(8, 10));
  const by = new Map(x.reports.map((r) => [`${r.connectorId}|${r.slotId}|${r.periodKey}`, r]));
  const savable = x.defs.filter(serverSavable).filter((d) => closeSlot(d.connectorId, d.slotId));
  const out: AutoTarget[] = [];
  if (!x.locked.has(last)) {
    for (const d of savable) {
      const r = by.get(`${d.connectorId}|${d.slotId}|${last}`);
      const cov = slotCoverage(closeSlot(d.connectorId, d.slotId)!, last, r);
      const pulled = Boolean(r?.fileName?.startsWith('api-pull-'));
      if (!r) out.push({ connectorId: d.connectorId, slotId: d.slotId, periodKey: last, why: 'missing' });
      else if (!pulled) continue; // an upload wins
      else if (cov.kind === 'empty' || cov.kind === 'partial') out.push({ connectorId: d.connectorId, slotId: d.slotId, periodKey: last, why: cov.kind });
      else if (day >= AUTO_PULL_REFRESH_DAY && r.savedAt && istDayOf(Date.parse(r.savedAt)) < `${x.today.slice(0, 8)}${String(AUTO_PULL_REFRESH_DAY).padStart(2, '0')}`) {
        out.push({ connectorId: d.connectorId, slotId: d.slotId, periodKey: last, why: 'refresh' });
      }
    }
  }
  if (last > from) {
    const earlier = monthRange(from, prevMonthOf(last)).filter((p) => !x.locked.has(p)).reverse();
    const taken = new Set<string>();
    let n = 0;
    for (const p of earlier) {
      for (const d of savable) {
        if (n >= AUTO_PULL_MAX_EARLIER) break;
        const k = `${d.connectorId}|${d.slotId}|${p}`;
        if (by.has(k) || taken.has(d.connectorId)) continue;
        if ((x.state.tries?.[k]?.n ?? 0) >= AUTO_PULL_MAX_TRIES) continue;
        taken.add(d.connectorId);
        out.push({ connectorId: d.connectorId, slotId: d.slotId, periodKey: p, why: 'missing' });
        n++;
      }
    }
  }
  return out;
}

/** Slots the job leaves to a person, with the reason (shown on Setup / in the run answer). */
export function manualSlots(defs: SlotSourceDef[]): { connectorId: string; slotId: string; why: string }[] {
  return CLOSE_SLOTS.map((s) => {
    const d = defs.find((x) => x.connectorId === s.connectorId && x.slotId === s.slotId);
    if (d && serverSavable(d)) return null;
    const why = !d || !d.pull || d.source === 'upload' ? 'Manual upload (no API).'
      : d.connectorId === 'tally' ? 'Stored by the Tally check; saved to the close with Pull now (checked in the browser).'
      : 'Read by the browser — Pull now / "Pull & save all" on Setup.';
    return { connectorId: s.connectorId, slotId: s.slotId, why };
  }).filter((v): v is { connectorId: string; slotId: string; why: string } => v !== null);
}

// ---- Run ---------------------------------------------------------------------------------

export interface AutoPullDeps {
  now: () => number;
  defs: SlotSourceDef[];
  /** Effective credentials for a slot + its missing required fields. */
  creds: (def: SlotSourceDef) => Promise<{ creds: Credentials; missing: string[] }>;
  /** Run one pull to the end (or its own budget). */
  pull: (def: SlotSourceDef, creds: Credentials, periodKey: string) => Promise<{ status: 'done'; result: SlotPull; pulledAt: string } | { status: 'failed'; error: string } | { status: 'running' }>;
  reports: () => Promise<StoredSlotReport[]>;
  locked: () => Promise<Set<string>>;
  save: (commit: CommitInput) => Promise<IngestReportMeta>;
  readState: () => Promise<AutoPullState>;
  writeState: (s: AutoPullState) => Promise<void>;
  /** Pulls at once (different sources; one source's own pacing is inside its pull). */
  concurrency?: number;
}

/** Counts only — what a machine caller may see. */
export function runCounts(run: AutoPullRun | null | undefined) {
  const rows = run?.rows ?? [];
  const n = (o: AutoPullRow['outcome']) => rows.filter((r) => r.outcome === o).length;
  return { tried: rows.length, saved: n('saved'), review: n('review'), failed: n('failed'), notConnected: n('not_connected'), running: n('running') };
}

/** One full run: plan → pull (a few at a time) → save the clean ones → record. Never throws for a slot. */
export async function runAutoPull(deps: AutoPullDeps, opts: { force?: boolean } = {}): Promise<{ status: 'not_due' | 'done'; why?: string; run: AutoPullRun | null }> {
  const state = await deps.readState();
  const now = deps.now();
  if (!opts.force) {
    const due = autoPullDue(now, state);
    if (!due.due) return { status: 'not_due', why: due.why, run: state.last ?? null };
  }
  const today = istDayOf(now);
  const startedAt = new Date(now).toISOString();
  await deps.writeState({ ...state, runningSince: startedAt });
  const run: AutoPullRun = { day: today, startedAt, finishedAt: null, rows: [] };
  const tries = { ...(state.tries ?? {}) };
  try {
    const [reports, locked] = await Promise.all([deps.reports(), deps.locked()]);
    const targets = planAutoPull({ today, defs: deps.defs, reports, locked, state });
    const one = async (t: AutoTarget): Promise<AutoPullRow> => {
      const row = (outcome: AutoPullRow['outcome'], detail: string): AutoPullRow => ({ connectorId: t.connectorId, slotId: t.slotId, periodKey: t.periodKey, outcome, detail: detail.slice(0, 300) });
      const def = deps.defs.find((d) => d.connectorId === t.connectorId && d.slotId === t.slotId);
      if (!def) return row('failed', 'No such slot.');
      try {
        const { creds, missing } = await deps.creds(def);
        if (missing.length) return row('not_connected', def.connectHint ?? `Not connected — missing ${missing.join(', ')}.`);
        const ans = await deps.pull(def, creds, t.periodKey);
        if (ans.status === 'running') return row('running', 'Still running — the next run picks it up.');
        if (ans.status === 'failed') return row('failed', ans.error);
        const staged = stagePullServer(def, t.periodKey, ans.result, ans.pulledAt);
        if (staged.kind === 'manual') return row('manual', staged.why);
        if (staged.kind === 'review') return row('review', `Pulled, needs review — ${staged.why}`);
        // The month may have been locked or uploaded while the pull ran: look again before writing.
        const [lockedNow, nowReports] = await Promise.all([deps.locked(), deps.reports()]);
        if (lockedNow.has(t.periodKey)) return row('review', 'Month was locked meanwhile — not saved.');
        const cur = nowReports.find((r) => r.connectorId === t.connectorId && r.slotId === t.slotId && r.periodKey === t.periodKey);
        if (cur && !cur.fileName?.startsWith('api-pull-')) return row('review', 'A file was uploaded meanwhile — not replaced.');
        await deps.save(staged.commit);
        return row('saved', staged.detail);
      } catch (e) {
        return row('failed', e instanceof Error ? e.message : String(e));
      }
    };
    const queue = [...targets];
    const workers = Array.from({ length: Math.max(1, Math.min(deps.concurrency ?? 4, queue.length)) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) run.rows.push(await one(t));
    });
    await Promise.all(workers);
    for (const r of run.rows) {
      const k = `${r.connectorId}|${r.slotId}|${r.periodKey}`;
      if (r.outcome === 'saved') delete tries[k];
      else if (r.outcome === 'failed' || r.outcome === 'review') tries[k] = { n: (tries[k]?.n ?? 0) + 1, day: today, why: r.detail };
    }
  } finally {
    run.finishedAt = new Date(deps.now()).toISOString();
    // A pull still running does not close the day: the next scheduled call tries again.
    const unfinished = run.rows.some((r) => r.outcome === 'running');
    await deps.writeState({ lastRunDay: unfinished ? state.lastRunDay : today, runningSince: null, tries, last: run }).catch(() => undefined);
  }
  return { status: 'done', run };
}
