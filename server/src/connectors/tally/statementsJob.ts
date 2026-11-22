// ----------------------------------------------------------------------------
// Statements pull as a background job (Balance Sheet / Cash Flow "Pull from Tally").
// A month is 3 Tally answers (P&L + 2 Trial Balance requests) and a busy Tally takes 10–60 s each, so a pull
// of several months runs past the ~90 s proxy cut. The route starts the job, waits up to WAIT_MS and answers
// "running"; the browser polls GET. One job per instance at a time; its result stays readable for 30 min.
// Nothing here writes to Tally (pullStatements sends Export requests only).
// ----------------------------------------------------------------------------

import type { Credentials } from '../types.js';
import { pullStatements, type StatementsPullResult } from './snapshots.js';

export const WAIT_MS = Number(process.env.STATEMENTS_PULL_WAIT_MS) || 25_000;
const BUDGET_MS = Number(process.env.STATEMENTS_PULL_BUDGET_MS) || 240_000;

export type StatementsJob =
  | { status: 'idle' }
  | { status: 'running'; startedAt: string; months: string[] | null }
  | { status: 'done'; startedAt: string; finishedAt: string; result: StatementsPullResult }
  | { status: 'failed'; startedAt: string; finishedAt: string; error: string };

let job: StatementsJob = { status: 'idle' };
let running: Promise<void> | null = null;

export const statementsJob = (): StatementsJob => job;

/** Start a pull (or join the one running) and wait up to `waitMs` for it. */
export async function startStatementsPull(creds: Credentials, months: string[] | undefined, waitMs = WAIT_MS): Promise<StatementsJob> {
  // A job past its budget + 1 min is treated as dead, so a hung Tally request never blocks the button.
  const stuck = job.status === 'running' && Date.now() - Date.parse(job.startedAt) > BUDGET_MS + 60_000;
  if (!running || stuck) {
    const startedAt = new Date().toISOString();
    job = { status: 'running', startedAt, months: months ?? null };
    const mine = pullStatements(creds, { months, budgetMs: BUDGET_MS })
      .then((result) => { job = { status: 'done', startedAt, finishedAt: new Date().toISOString(), result }; })
      .catch((e: unknown) => { job = { status: 'failed', startedAt, finishedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }; })
      .finally(() => { if (running === mine) running = null; });
    running = mine;
  }
  await Promise.race([running, new Promise((r) => setTimeout(r, waitMs))]);
  return job;
}

/** Test hook: forget the last job. */
export function resetStatementsJob(): void { job = { status: 'idle' }; running = null; }
