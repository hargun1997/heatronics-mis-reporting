// ----------------------------------------------------------------------------
// Tally snapshots — Tally only answers while TallyPrime is open on the cloud
// machine (Thakur Hardsoft) with the company loaded. So the MIS checks every
// ~30 min in working hours from the 15th (GitHub Actions → POST /api/tally/poll, open path, no data
// in the answer; gate = scheduledDue) and, whenever Tally is reachable, stores the month's P&L (this month,
// last month, and up to 2 older months not stored yet, last 12). The close's
// Tally P&L slot then reads the stored copy, so Tally need not be open at close
// time; it says how old the copy is.
//
// READ ONLY: every request passes assertTallyReadOnly (exports only).
// Storage (config store): tally/state, tally/pnl-<YYYY-MM>, tally/raw-last.
// ----------------------------------------------------------------------------

import type { Credentials } from '../types.js';
import { readJson, writeJson } from '../../ingest/objectStore.js';
import { companyListEnvelope, decode, post } from '../sources/tally.js';
import { parsePnlXml, pnlEnvelope, type TallyPnlMonth } from './pnl.js';
import { pullBooks } from './bookStore.js';
import { parseTbXml, TB_BASIS, tbEnvelope, type TallyTbMonth } from './tb.js';

export interface TallySnapshot extends TallyPnlMonth { asOf: string }
export interface TallyTbSnapshot extends TallyTbMonth { asOf: string }
export interface TallyState {
  lastTryAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  company: string | null;
  months: Record<string, string>; // period → asOf
  /** Months with a stored Trial Balance (period → asOf), for the Balance Sheet / Cash Flow backfill. */
  tbMonths?: Record<string, string>;
  /** The TB basis tbMonths were taken on; a different (older) basis empties tbMonths so every TB is pulled again. */
  tbBasis?: string;
}

const EMPTY: TallyState = { lastTryAt: null, lastOkAt: null, lastError: null, company: null, months: {} };
export const MIN_GAP_MS = 20 * 60_000;

export const readTallyState = () => readJson<TallyState>('tally/state', EMPTY);
export const readTallySnapshot = (period: string) => readJson<TallySnapshot | null>(`tally/pnl-${period}`, null);
export const readTallyTb = (period: string) => readJson<TallyTbSnapshot | null>(`tally/tb-${period}`, null);

const istMonth = (now: number) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 7);
function addMonths(p: string, n: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Months to pull this time: this month + last month always; then up to 2 of the last 12 not stored yet. */
export function monthsToPull(now: number, stored: Record<string, string>): string[] {
  const cur = istMonth(now);
  const out = [cur, addMonths(cur, -1)];
  for (let i = 2; i <= 12 && out.length < 4; i++) {
    const p = addMonths(cur, -i);
    if (!stored[p]) out.push(p);
  }
  return out;
}

/**
 * When a scheduled check may run (founder, 2 Nov 2026): from the 15th of the month (books for last month are final by then),
 * Monday–Saturday, 10:00–19:00 IST (working hours, when Tally is likely open). Every 20 min until last month has a copy taken
 * on or after this month's 15th; after that once a day (to refresh this month so far). "Pull now" ignores all of this.
 */
export function scheduledDue(now: number, state: TallyState): { due: boolean; why: string } {
  const ist = new Date(now + 5.5 * 3_600_000);
  const day = ist.getUTCDate(), hour = ist.getUTCHours(), dow = ist.getUTCDay();
  if (day < 15) return { due: false, why: 'Before the 15th: last month is not final yet.' };
  if (dow === 0) return { due: false, why: 'Sunday.' };
  if (hour < 10 || hour >= 19) return { due: false, why: 'Outside 10:00–19:00 IST.' };
  const cur = istMonth(now);
  const cutoff = Date.parse(`${cur}-15T00:00:00+05:30`);
  const lastAsOf = state.months[addMonths(cur, -1)];
  const finalTaken = lastAsOf != null && Date.parse(lastAsOf) >= cutoff;
  const since = state.lastTryAt ? now - Date.parse(state.lastTryAt) : Infinity;
  if (!finalTaken) return since >= MIN_GAP_MS ? { due: true, why: 'Last month not taken since the 15th.' } : { due: false, why: 'Checked less than 20 min ago.' };
  const okDay = state.lastOkAt ? new Date(Date.parse(state.lastOkAt) + 5.5 * 3_600_000).toISOString().slice(0, 10) : null;
  return okDay === ist.toISOString().slice(0, 10) ? { due: false, why: 'Already taken today.' } : since >= MIN_GAP_MS ? { due: true, why: 'Daily refresh.' } : { due: false, why: 'Checked less than 20 min ago.' };
}

/** A Tally answer is stored only when it carries rows: an empty answer (Tally busy, company closing) keeps the old copy. */
export const keepCopy = (rows: number) => rows > 0;

/**
 * Months whose Trial Balance the backfill pulls this poll: up to 3 of the last 13 that have a P&L copy (closing stock is
 * needed, else the Balance Sheet shows stock unknown) and no TB yet, other than the months pulled this run.
 */
export function tbBackfill(now: number, state: Pick<TallyState, 'months' | 'tbMonths'>, done: string[]): string[] {
  const cur = istMonth(now);
  return Array.from({ length: 13 }, (_, i) => addMonths(cur, -i)).filter((p) => !state.tbMonths?.[p] && state.months[p] && !done.includes(p)).slice(0, 3);
}

/** Trial Balance at the end of `period` (groups-only answer first, so exploded children are told apart). */
async function pullTb(creds: Credentials, period: string, state: TallyState, keepRaw: boolean): Promise<void> {
  const groupsXml = await post(creds, tbEnvelope(period, creds.company, false), 60_000);
  const groups = new Set(parseTbXml(groupsXml, period).rows.map((r) => r.name));
  const tbXml = await post(creds, tbEnvelope(period, creds.company, true), 60_000);
  if (keepRaw) await writeJson('tally/tb-raw-last', { period, at: state.lastTryAt, xml: tbXml.slice(0, 400_000) });
  const tb = parseTbXml(tbXml, period, groups);
  // An answer without TB rows never overwrites a good copy (it would read as cash ₹0 / profit = stock): round 7 #11.
  if (!keepCopy(tb.rows.length)) throw new Error('Tally answered without Trial Balance rows; the stored copy was kept');
  await writeJson(`tally/tb-${period}`, { ...tb, asOf: state.lastTryAt ?? new Date().toISOString() } satisfies TallyTbSnapshot);
  state.tbMonths = { ...(state.tbMonths ?? {}), [period]: state.lastTryAt! };
}

/**
 * One month: the P&L copy, then its Trial Balance (closing stock comes from the P&L copy, so they are taken together).
 * A Tally error on the P&L request is thrown (Tally closed mid-run); an empty P&L answer keeps the old copy and still
 * tries the TB; a TB failure never undoes the P&L copy.
 */
async function pullMonth(creds: Credentials, period: string, state: TallyState, keepRaw: boolean): Promise<{ pnl: boolean; tbError: string | null }> {
  const xml = await post(creds, pnlEnvelope(period, creds.company), 60_000);
  const month = parsePnlXml(xml, period);
  if (keepRaw) await writeJson('tally/raw-last', { period, at: state.lastTryAt, xml: xml.slice(0, 400_000) });
  const pnl = keepCopy(month.ledgerRows.length); // empty answer: keep the stored copy; not a success
  if (pnl) {
    await writeJson(`tally/pnl-${period}`, { ...month, asOf: state.lastTryAt! } satisfies TallySnapshot);
    state.months[period] = state.lastTryAt!;
  }
  let tbError: string | null = null;
  try { await pullTb(creds, period, state, keepRaw); } catch (e) { tbError = e instanceof Error ? e.message : String(e); }
  return { pnl, tbError };
}

/** Ask Tally which company is loaded. Throws when Tally is not reachable (closed on the host). */
async function reach(creds: Credentials, state: TallyState): Promise<void> {
  try {
    const list = await post(creds, companyListEnvelope(), 10_000);
    const loaded = /<SVCURRENTCOMPANY>([\s\S]*?)<\/SVCURRENTCOMPANY>/i.exec(list)?.[1];
    if (loaded) state.company = decode(loaded);
  } catch (e) {
    // Heatronics' TallyPrime answers "Could not find Report 'List of Companies'!" (seen live 22 Nov 2026). Since post()
    // reads LINEERROR answers as errors (14 Nov 2026), that refusal stopped every P&L / TB poll here although Tally
    // was open. A refusal is an answer: Tally is reachable; the P&L request names the company itself.
    if (!/Tally refused the request/.test(e instanceof Error ? e.message : String(e))) throw e;
  }
  // Only after Tally answered: a basis change empties the TB index so every TB is pulled again. Done before the
  // check, a failed poll wiped the index of TBs that are still stored (22 Nov 2026).
  if (state.tbBasis !== TB_BASIS) { state.tbMonths = {}; state.tbBasis = TB_BASIS; }
}

// One Tally request stream at a time (TallyPrime Silver is single-user): the scheduled poll, Pull now and the
// statements pull queue behind each other in this instance.
let chain: Promise<unknown> = Promise.resolve();
export function withTallyLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/** One poll. `force` skips the 20-minute gap (signed-in Pull now). Never throws: the answer is a status. */
export function pollTally(creds: Credentials, opts: { force?: boolean; now?: number; skipBooks?: boolean } = {}): Promise<{ status: 'skipped' | 'down' | 'ok' | 'not_connected'; detail: string; months?: string[] }> {
  return withTallyLock(() => pollTallyNow(creds, opts));
}

async function pollTallyNow(creds: Credentials, opts: { force?: boolean; now?: number; skipBooks?: boolean }): Promise<{ status: 'skipped' | 'down' | 'ok' | 'not_connected'; detail: string; months?: string[] }> {
  const now = opts.now ?? Date.now();
  if (!(creds.host || '').trim()) return { status: 'not_connected', detail: 'Add the Tally host and port in Setup (Tally card).' };
  const state = await readTallyState();
  if (!opts.force) {
    const d = scheduledDue(now, state);
    if (!d.due) return { status: 'skipped', detail: d.why };
  }
  state.lastTryAt = new Date(now).toISOString();
  try {
    await reach(creds, state);
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
    await writeJson('tally/state', state);
    return { status: 'down', detail: `Tally not reachable: ${state.lastError}` };
  }
  const done: string[] = [];
  let failed: string | null = null;
  let tbFailed: string | null = null;
  const empty: string[] = [];
  for (const period of monthsToPull(now, state.months)) {
    try {
      const r = await pullMonth(creds, period, state, !done.length && !empty.length);
      if (r.pnl) done.push(period); else empty.push(period);
      if (r.tbError) tbFailed = `${period}: ${r.tbError}`;
    } catch (e) {
      failed = `${period}: ${e instanceof Error ? e.message : String(e)}`;
      break; // Tally closed mid-run: keep what we have
    }
  }
  // Balance Sheet / Cash Flow need a Trial Balance for every month (and the one before): fill up to 3 of the last 13
  // months that have a P&L copy but no TB yet.
  if (done.length && !failed) {
    for (const p of tbBackfill(now, state, done)) {
      try { await pullTb(creds, p, state, false); } catch (e) { tbFailed = `${p}: ${e instanceof Error ? e.message : String(e)}`; break; }
    }
  }
  if (done.length) state.lastOkAt = state.lastTryAt;
  state.lastError = failed ?? (empty.length ? `Tally answered without P&L rows for ${empty.join(', ')}; the stored copies were kept` : null);
  await writeJson('tally/state', state);
  // While Tally is open, also refresh the stored books (masters daily, Day Books) in what is left of ~4 min.
  let books = '';
  if (done.length && !failed && !opts.skipBooks) {
    const b = await pullBooks(creds, { now, budgetMs: 230_000 - (Date.now() - now) });
    books = b.masters || b.months.length ? `; books: ${[b.masters ? 'masters' : '', ...b.months].filter(Boolean).join(', ')}` : '';
  }
  return { status: done.length ? 'ok' : 'down', detail: done.length ? `Stored P&L + Trial Balance for ${done.join(', ')}${tbFailed ? ` (Trial Balance failed: ${tbFailed})` : ''}${failed ? ` (stopped: ${failed})` : ''}${books}` : `Tally answered the check but not the P&L: ${failed ?? state.lastError}`, months: done };
}

// ---------------------------------------------------------------- statements pull (Balance Sheet / Cash Flow)

/** Days after month end a copy must be taken on to count as final (books for the month closed). Same 5 days as the P&L slot. */
export const FINAL_AFTER_DAYS = 5;

/** True when a copy taken at `asOf` is late enough to hold the month's final books. */
export function isFinalCopy(period: string, asOf: string | null | undefined): boolean {
  if (!asOf) return false;
  const end = Date.parse(`${addMonths(period, 1)}-01T00:00:00+05:30`);
  return Date.parse(asOf) >= end + FINAL_AFTER_DAYS * 86_400_000;
}

/**
 * Months the statements pull takes, newest first: of the last `span` months (this month included), every month with no
 * stored TB, or whose TB or P&L copy is not final (this month is never final, so it is always refreshed).
 */
export function statementMonthsDue(now: number, state: Pick<TallyState, 'months' | 'tbMonths'>, span = 13): string[] {
  const cur = istMonth(now);
  return Array.from({ length: span }, (_, i) => addMonths(cur, -i))
    .filter((p) => !isFinalCopy(p, state.tbMonths?.[p]) || !isFinalCopy(p, state.months[p]));
}

const PERIOD_RE = /^\d{4}-\d{2}$/;

export interface StatementsPullResult {
  status: 'ok' | 'partial' | 'down' | 'not_connected';
  /** Months whose P&L + TB were stored this run. */
  done: string[];
  /** Months asked for but not reached in the time budget (pull again). */
  remaining: string[];
  failed: { period: string; error: string }[];
  detail: string;
  at: string;
}

/**
 * Pull P&L + Trial Balance for the given months (default: `statementMonthsDue`), newest first, until `budgetMs` is
 * spent. READ ONLY (every request is an Export). Months are never skipped because a P&L copy is missing (the old
 * backfill only took months that already had one).
 */
export function pullStatements(creds: Credentials, opts: { months?: string[]; now?: number; budgetMs?: number } = {}): Promise<StatementsPullResult> {
  return withTallyLock(() => pullStatementsNow(creds, opts));
}

async function pullStatementsNow(creds: Credentials, opts: { months?: string[]; now?: number; budgetMs?: number }): Promise<StatementsPullResult> {
  const now = opts.now ?? Date.now();
  const at = new Date(now).toISOString();
  const deadline = Date.now() + (opts.budgetMs ?? 230_000);
  if (!(creds.host || '').trim()) return { status: 'not_connected', done: [], remaining: [], failed: [], detail: 'Add the Tally host and port in Setup (Tally card).', at };
  const state = await readTallyState();
  state.lastTryAt = at;
  try {
    await reach(creds, state);
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
    await writeJson('tally/state', state);
    return { status: 'down', done: [], remaining: opts.months ?? [], failed: [], detail: `Tally not reachable: ${state.lastError}`, at };
  }
  const want = [...new Set((opts.months ?? statementMonthsDue(now, state)).filter((p) => PERIOD_RE.test(p)))].sort().reverse();
  const done: string[] = [];
  const failed: { period: string; error: string }[] = [];
  let i = 0;
  for (; i < want.length; i++) {
    if (deadline - Date.now() < 45_000) break; // one month = 3 Tally answers; leave room so a month is never cut halfway
    const period = want[i];
    try {
      const r = await pullMonth(creds, period, state, i === 0);
      if (r.tbError) failed.push({ period, error: r.tbError });
      else done.push(period);
      if (!r.pnl) failed.push({ period, error: 'Tally answered without P&L rows; the stored P&L copy was kept' });
    } catch (e) {
      failed.push({ period, error: e instanceof Error ? e.message : String(e) });
      i++;
      break; // Tally closed mid-run: keep what we have
    }
    await writeJson('tally/state', state); // each month counts as soon as it is stored
  }
  const remaining = want.slice(i);
  if (done.length) state.lastOkAt = at;
  state.lastError = failed.length ? `${failed[0].period}: ${failed[0].error}` : null;
  await writeJson('tally/state', state);
  const status = !done.length ? (failed.length ? 'down' : 'ok') : failed.length || remaining.length ? 'partial' : 'ok';
  const detail = [
    done.length ? `Stored P&L + Trial Balance for ${done.join(', ')}.` : want.length ? 'Nothing stored.' : 'Every month is already final.',
    remaining.length ? `${remaining.length} month(s) left: pull again.` : '',
    failed.length ? `Failed: ${failed.map((f) => `${f.period} (${f.error})`).join('; ')}.` : '',
  ].filter(Boolean).join(' ');
  return { status, done, remaining, failed, detail, at };
}
