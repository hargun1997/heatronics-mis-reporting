// Stored Tally statements for Live MIS (Balance Sheet, Cash Flow, MIS Sheet cash rows), loaded once per 2 minutes,
// plus "Pull from Tally" (POST /api/tally/statements/pull: the whole FY, P&L + Trial Balance, as a server job that the
// page polls). One store for the whole page, so the status row and both tabs see the same copy and the same pull.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { statements, type Parents, type StatementMonthIn } from '../../data/statements/statements';

export interface StatementMonthResp extends StatementMonthIn { tbAsOf?: string | null; pnlAsOf?: string | null; final?: boolean }
export interface Resp {
  months: StatementMonthResp[]; parents?: Parents; lastOkAt: string | null; connected: boolean;
  lastTryAt?: string | null; lastError?: string | null; reachedAt?: string | null; due?: string[]; pulling?: boolean;
}
export interface PullResult { status: 'ok' | 'partial' | 'down' | 'not_connected'; done: string[]; remaining: string[]; failed: { period: string; error: string }[]; detail: string; at: string }
type Job = { status: 'idle' } | { status: 'running'; startedAt: string } | { status: 'done'; result: PullResult } | { status: 'failed'; error: string } | { status: 'not_connected'; detail: string };

let cache: { at: number; p: Promise<Resp> } | null = null;
function load(force = false): Promise<Resp> {
  if (!force && cache && Date.now() - cache.at < 120_000) return cache.p;
  const p = fetch('/api/tally/statements').then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); return j as Resp; });
  cache = { at: Date.now(), p };
  p.catch(() => { cache = null; });
  return p;
}

// ---- page-wide store
let state: { data: Resp | null; err: string | null; pulling: boolean; last: PullResult | null; pullErr: string | null } = { data: null, err: null, pulling: false, last: null, pullErr: null };
const subs = new Set<() => void>();
const set = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
let loading = false;
function ensure(force = false) {
  if (loading && !force) return;
  loading = true;
  load(force).then((data) => set({ data, err: null })).catch((e: Error) => set({ err: e.message })).finally(() => { loading = false; });
}

const POLL_MS = 5_000;
const MAX_WAIT_MS = 6 * 60_000;
async function post(): Promise<Job> {
  const r = await fetch('/api/tally/statements/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `${r.status}`);
  return j as Job;
}
async function poll(): Promise<Job> {
  const r = await fetch('/api/tally/statements/pull');
  return (await r.json()) as Job;
}

/** Start a pull of the whole FY (or join the one running on the server) and wait for it. Never throws. */
export async function pullFromTally(): Promise<PullResult | null> {
  if (state.pulling) return null;
  set({ pulling: true, pullErr: null });
  try {
    let job = await post();
    const until = Date.now() + MAX_WAIT_MS;
    while (job.status === 'running' && Date.now() < until) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      job = await poll();
    }
    if (job.status === 'done') { set({ last: job.result }); return job.result; }
    const msg = job.status === 'failed' ? job.error : job.status === 'not_connected' ? job.detail : job.status === 'running' ? 'The pull is still running on the server. Refresh in a few minutes.' : 'No pull ran.';
    set({ pullErr: msg });
    return null;
  } catch (e) {
    set({ pullErr: e instanceof Error ? e.message : String(e) });
    return null;
  } finally {
    set({ pulling: false });
    ensure(true);
  }
}

export function useStatements() {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => { ensure(); }, []);
  // A pull started elsewhere (another tab, the scheduled poll) shows as "pulling" from the server answer.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.data?.pulling || s.pulling) return;
    const t = window.setTimeout(() => { ensure(true); tick((n) => n + 1); }, POLL_MS * 2);
    return () => window.clearTimeout(t);
  }, [s.data?.pulling, s.pulling]);
  const built = useMemo(() => (s.data ? statements(s.data.months, s.data.parents) : null), [s.data]);
  return { data: s.data, built, err: s.err, pulling: s.pulling || !!s.data?.pulling, last: s.last, pullErr: s.pullErr };
}

/** Pure: the label parts for the status row. `asOf` = the newest month end shown (a running month = today). */
export function statementsAsOf(data: Pick<Resp, 'months'> | null, today: string): { asOf: string | null; running: boolean; provisional: boolean } {
  const withTb = (data?.months ?? []).filter((m) => m.tb).sort((a, b) => a.period.localeCompare(b.period));
  const m = withTb[withTb.length - 1];
  if (!m) return { asOf: null, running: false, provisional: false };
  const [y, mo] = m.period.split('-').map(Number);
  const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const running = end >= today;
  return { asOf: running ? today : end, running, provisional: !running && m.final === false };
}

/** Pure: Tally offline = the newest try failed and nothing answered since. */
export function tallyOffline(data: Pick<Resp, 'lastTryAt' | 'lastError' | 'reachedAt'> | null): boolean {
  if (!data?.lastTryAt || !data.lastError) return false;
  return !data.reachedAt || Date.parse(data.lastTryAt) > Date.parse(data.reachedAt);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monLabel = (p: string) => `${MON[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}`;

/** Pure: one line for the toast after a pull (ASD-STE100: short, active). */
export function pullMessage(r: PullResult | null, err: string | null): string {
  if (!r) return `Pull failed: ${err ?? 'no answer'}`;
  if (r.status === 'down') return 'Tally did not answer. The page shows the stored copy.';
  if (r.status === 'not_connected') return 'Tally is not connected. Add the host on Setup, Tally.';
  const n = r.done.length;
  const parts = [`Read ${n} month${n === 1 ? '' : 's'} from Tally.`];
  if (r.remaining.length) parts.push(`${r.remaining.length} month${r.remaining.length === 1 ? '' : 's'} left: pull again.`);
  if (r.failed.length) parts.push(`${r.failed.length} failed: ${r.failed.map((f) => monLabel(f.period)).join(', ')}.`);
  return parts.join(' ');
}
