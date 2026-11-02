// ----------------------------------------------------------------------------
// Slot pulls as background jobs.
//
// Some pulls take longer than a request should wait (Amazon Finances pages at
// 0.5 req/s; Amazon Ads reports are prepared asynchronously). So a pull runs as
// a job keyed by connector × slot × month: the route waits up to PULL_WAIT_MS,
// then answers "running" and the browser polls. A finished pull is reused for
// 10 minutes unless forced. Jobs live in this instance's memory only — a lost
// job just means "Pull now" again; nothing is written anywhere until the
// operator (or the auto-pull) saves the result through /api/ingest/commit.
// ----------------------------------------------------------------------------

import type { Credentials } from '../types.js';
import type { SlotPull, SlotSourceDef } from './types.js';

export const PULL_WAIT_MS = Number(process.env.SLOT_PULL_WAIT_MS) || 25_000;
const JOB_BUDGET_MS = Number(process.env.SLOT_PULL_BUDGET_MS) || 270_000;
const REUSE_MS = 10 * 60_000;

export type JobState =
  | { status: 'running'; startedAt: string }
  | { status: 'done'; startedAt: string; pulledAt: string; result: SlotPull }
  | { status: 'failed'; startedAt: string; failedAt: string; error: string };

interface Job { state: JobState; promise: Promise<void> }
const jobs = new Map<string, Job>();
const key = (d: SlotSourceDef, periodKey: string) => `${d.connectorId}|${d.slotId}|${periodKey}`;

/** Start (or reuse) the pull and wait up to `waitMs` for it. */
export async function runPull(def: SlotSourceDef, creds: Credentials, periodKey: string, opts: { force?: boolean; waitMs?: number } = {}): Promise<JobState> {
  if (!def.pull) throw new Error('This slot has no automatic pull.');
  const k = key(def, periodKey);
  let job = jobs.get(k);
  const fresh = job && (job.state.status === 'running'
    || (job.state.status === 'done' && Date.now() - Date.parse(job.state.pulledAt) < REUSE_MS && !opts.force));
  if (!job || !fresh) {
    const startedAt = new Date().toISOString();
    const j: Job = { state: { status: 'running', startedAt }, promise: Promise.resolve() };
    j.promise = def.pull({ creds, periodKey, deadline: Date.now() + JOB_BUDGET_MS })
      .then((result) => { j.state = { status: 'done', startedAt, pulledAt: new Date().toISOString(), result }; })
      .catch((err: unknown) => { j.state = { status: 'failed', startedAt, failedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) }; });
    jobs.set(k, j);
    job = j;
  }
  const wait = opts.waitMs ?? PULL_WAIT_MS;
  await Promise.race([job.promise, new Promise((r) => setTimeout(r, wait))]);
  return job.state;
}

/** Current state without starting anything (for polling). */
export function pullState(def: SlotSourceDef, periodKey: string): JobState | null {
  return jobs.get(key(def, periodKey))?.state ?? null;
}

/** The latest finished pull per slot (any month), for the "Pulled … on <time>" line. */
export function lastPulls(): Record<string, { periodKey: string; at: string; ok: boolean; error?: string }> {
  const out: Record<string, { periodKey: string; at: string; ok: boolean; error?: string }> = {};
  for (const [k, j] of jobs) {
    const [c, s, p] = k.split('|');
    const at = j.state.status === 'done' ? j.state.pulledAt : j.state.status === 'failed' ? j.state.failedAt : null;
    if (!at) continue;
    const id = `${c}|${s}`;
    if (!out[id] || out[id].at < at) out[id] = { periodKey: p, at, ok: j.state.status === 'done', error: j.state.status === 'failed' ? j.state.error : undefined };
  }
  return out;
}
