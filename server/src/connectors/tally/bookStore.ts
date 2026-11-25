// ----------------------------------------------------------------------------
// Stored copies of Tally's books (connectors/tally/books.ts), taken whenever Tally is open — by the scheduled
// poll (after the P&L, within its time budget) and by "Pull Tally now" on the Tally health page.
// READ ONLY: every request goes through post() → assertTallyReadOnly (exports only).
// Storage (config store): tally/masters, tally/books-<YYYY-MM>, tally/books-state, tally/raw-books (sample of the
// last raw answers, to check the XML shape).
// ----------------------------------------------------------------------------

import type { Credentials } from '../types.js';
import { readJson, writeJson } from '../../ingest/objectStore.js';
import { post } from '../sources/tally.js';
import {
  dayBookDayEnvelope, inRange, mastersEnvelope, monthDays, parseDayBook, parseGroups, parseLedgers,
  parseStockItems, type TallyMasters, type TallyVoucher,
} from './books.js';

export interface StoredMasters extends TallyMasters { asOf: string }
export interface StoredBooks { period: string; asOf: string; vouchers: TallyVoucher[]; mode?: 'range' | 'daily' }
/** A month being read day by day across several pulls (Tally ignored the range). */
interface PartialBooks { period: string; days: string[]; vouchers: TallyVoucher[] }
export interface BooksState { mastersAt: string | null; months: Record<string, string>; lastError: string | null; lastTryAt: string | null }

const EMPTY: BooksState = { mastersAt: null, months: {}, lastError: null, lastTryAt: null };
export const readBooksState = () => readJson<BooksState>('tally/books-state', EMPTY);

// Per-instance cache of the big Day Book / masters files (sweep fix, 25 Nov 2026): Tally health, TDS, Book an invoice and
// the GST refund re-downloaded and re-parsed 3 to 16 months of Day Books from storage on every request. A copy is kept
// with the version books-state gives it (the month's asOf, mastersAt); a newer version (any instance's pull) reads the
// file again. books-state itself (small) is read at most every 15 s. Writes in this module drop the cached copy.
const STATE_TTL_MS = 15_000;
let stateMemo: { at: number; p: Promise<BooksState> } | null = null;
function cachedState(): Promise<BooksState> {
  if (stateMemo && Date.now() - stateMemo.at < STATE_TTL_MS) return stateMemo.p;
  const p = readBooksState();
  const entry = { at: Date.now(), p };
  stateMemo = entry;
  p.catch(() => { if (stateMemo === entry) stateMemo = null; });
  return p;
}
const fileMemo = new Map<string, { version: string; p: Promise<unknown> }>();
async function versioned<T>(key: string, version: string | null | undefined, load: () => Promise<T>): Promise<T> {
  if (!version) return load(); // no version known: always read
  const hit = fileMemo.get(key);
  if (hit && hit.version === version) return hit.p as Promise<T>;
  const p = load();
  fileMemo.set(key, { version, p });
  p.catch(() => { if (fileMemo.get(key)?.p === p) fileMemo.delete(key); });
  return p;
}
/** Drop cached copies after a write here (the version in books-state changes too, this only makes it at once). */
function forget(key: string) { fileMemo.delete(key); stateMemo = null; }
/** Tests only. */
export function _resetBookCache() { fileMemo.clear(); stateMemo = null; }

export const readMasters = async () => versioned('tally/masters', (await cachedState()).mastersAt, () => readJson<StoredMasters | null>('tally/masters', null));
export const readBooks = async (period: string) => versioned(`tally/books-${period}`, (await cachedState()).months[period], () => readJson<StoredBooks | null>(`tally/books-${period}`, null));

const H = 3_600_000;
const istMonth = (now: number) => new Date(now + 5.5 * H).toISOString().slice(0, 7);
export function addMonths(p: string, n: number): string {
  const [y, m] = p.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Months of the Indian financial year `now` falls in: April → this month (IST), oldest first. */
export function fyMonthsTo(now: number): string[] {
  const cur = istMonth(now);
  const [y, m] = cur.split('-').map(Number);
  const start = `${m >= 4 ? y : y - 1}-04`;
  const out: string[] = [];
  for (let p = start; p <= cur; p = addMonths(p, 1)) out.push(p);
  return out;
}

// ---- FY sweep (founder, 22 Nov 2026: "every Tally pull must re-read the WHOLE financial year from 1 April": older
// entries get edited or back-dated, and the stored copy must catch it). One Day Book request per day (Tally ignores a
// range), 5–11 s a day, so a whole FY (~240 days) is 20–45 min of Tally time: far more than one run. Every caller (the
// scheduled poll, "Pull Tally now", the TDS sync) continues ONE pass: April → this month in order, a cut month resumes
// from its partial file (days already read are kept), a finished month replaces its stored copy (same guards as
// before: an empty or half-empty answer never replaces good books). After the last month the next pass starts at April.
export interface BooksSweep {
  fy: string | null;          // FY start month of the pass, YYYY-04
  next: string | null;        // month the next run starts at; null = start a new pass at April
  passStartedAt: string | null;
  lastPassDoneAt: string | null;
  /** Runs in a row where a month made no progress (no new day read): after SWEEP_MAX_TRIES it is skipped this pass. */
  tries: Record<string, number>;
  /** Months skipped in the current pass (stored copy kept), with the reason. Cleared when a new pass starts. */
  skipped: Record<string, string>;
}
export const EMPTY_SWEEP: BooksSweep = { fy: null, next: null, passStartedAt: null, lastPassDoneAt: null, tries: {}, skipped: {} };
export const SWEEP_MAX_TRIES = 4;
export const readSweep = () => readJson<BooksSweep>('tally/books-sweep', EMPTY_SWEEP);

/** Months this run reads, in order: from the sweep's `next` to this month; a new pass (or a new FY) starts at April. */
export function sweepOrder(now: number, sw: BooksSweep): { months: string[]; newPass: boolean } {
  const fy = fyMonthsTo(now);
  const i = sw.fy === fy[0] && sw.next ? fy.indexOf(sw.next) : -1;
  return i < 0 ? { months: fy, newPass: true } : { months: fy.slice(i), newPass: false };
}

/** A pass is running (started, not finished): the scheduled callers keep going every run until it ends. */
export const sweepInProgress = (sw: BooksSweep) => !!sw.next;

/**
 * Pure bookkeeping after a run: `asked` = months in order, `completed` = months whose copy was replaced, `progress` =
 * months where at least one new day was read. Returns the next sweep state.
 */
export function advanceSweep(sw: BooksSweep, now: number, asked: string[], newPass: boolean, completed: string[], progress: string[], error: string | null): BooksSweep {
  const at = new Date(now).toISOString();
  const fy = fyMonthsTo(now)[0];
  const next: BooksSweep = newPass
    ? { fy, next: asked[0] ?? null, passStartedAt: at, lastPassDoneAt: sw.lastPassDoneAt, tries: {}, skipped: {} }
    : { ...sw, tries: { ...sw.tries }, skipped: { ...sw.skipped } };
  let k = 0;
  while (k < asked.length && completed.includes(asked[k])) { delete next.tries[asked[k]]; k++; }
  if (k >= asked.length) return { ...next, next: null, lastPassDoneAt: at };
  const stuck = asked[k];
  if (progress.includes(stuck)) delete next.tries[stuck];
  else next.tries[stuck] = (next.tries[stuck] ?? 0) + 1;
  if ((next.tries[stuck] ?? 0) >= SWEEP_MAX_TRIES) {
    // Tally keeps failing on this month (an empty answer, a day that never answers): keep its stored copy, go on.
    next.skipped[stuck] = error ?? 'no progress';
    delete next.tries[stuck];
    const after = asked[k + 1];
    return after ? { ...next, next: after } : { ...next, next: null, lastPassDoneAt: at };
  }
  return { ...next, next: stuck };
}

/** One run of the FY sweep (masters first when older than 20 h, or `masters`). Never throws. */
export async function pullBooksSweep(creds: Credentials, opts: { now?: number; budgetMs?: number; masters?: boolean } = {}): Promise<{ masters: boolean; months: string[]; error: string | null; sweep: BooksSweep; asked: string[] }> {
  const now = opts.now ?? Date.now();
  const sw = await readSweep();
  const { months: asked, newPass } = sweepOrder(now, sw);
  const before = await Promise.all(asked.map(async (p) => (await readPartial(p))?.days.length ?? 0));
  const r = await pullBooks(creds, { now, budgetMs: opts.budgetMs, masters: opts.masters, periods: asked });
  const after = await Promise.all(asked.map(async (p) => (await readPartial(p))?.days.length ?? 0));
  const progress = asked.filter((p, i) => r.months.includes(p) || after[i] > before[i]);
  const next = advanceSweep(sw, now, asked, newPass, r.months, progress, r.error);
  await writeJson('tally/books-sweep', next);
  return { ...r, sweep: next, asked };
}

/** Masters (once a day, or forced) then Day Books until `budgetMs` runs out. Never throws. */
export async function pullBooks(creds: Credentials, opts: { force?: boolean; masters?: boolean; now?: number; budgetMs?: number; periods?: string[] } = {}): Promise<{ masters: boolean; months: string[]; error: string | null }> {
  const now = opts.now ?? Date.now();
  const deadline = Date.now() + (opts.budgetMs ?? 120_000);
  const s = await readBooksState();
  s.lastTryAt = new Date(now).toISOString();
  const raw: Record<string, string> = {};
  let masters = false;
  const months: string[] = [];
  let error: string | null = null;
  try {
    if (opts.force || opts.masters || !s.mastersAt || now - Date.parse(s.mastersAt) > 20 * H) {
      const gx = await post(creds, mastersEnvelope('Groups', creds.company), 60_000);
      const lx = await post(creds, mastersEnvelope('Ledgers', creds.company), 90_000);
      let sx = '';
      try { sx = await post(creds, mastersEnvelope('Stock Items', creds.company), 60_000); } catch { /* stock items are optional */ }
      raw.groups = gx.slice(0, 60_000); raw.ledgers = lx.slice(0, 150_000); raw.stock = sx.slice(0, 60_000);
      const groups = parseGroups(gx);
      const ledgers = parseLedgers(lx, groups);
      const stockItems = sx ? parseStockItems(sx) : [];
      const warnings: string[] = [];
      if (!ledgers.length) warnings.push('No ledgers recognised in Tally\'s answer — the XML shape may differ (see tally/raw-books).');
      if (!groups.length) warnings.push('No groups recognised — primary groups fall back to the ledger\'s own group.');
      const doc: StoredMasters = { asOf: s.lastTryAt, ledgers, groups, stockItems, warnings };
      await writeJson('tally/masters', doc);
      forget('tally/masters');
      s.mastersAt = s.lastTryAt;
      masters = true;
    }
    for (const period of opts.periods ?? fyMonthsTo(now)) {
      if (deadline - Date.now() < 15_000) break;
      // One day at a time: a whole exploded month is too big for one Tally answer (it timed out behind the 120 s
      // proxy), and Tally always honours the one-day range with SVCURRENTDATE. Resumable across pulls.
      const part = await readJson<PartialBooks | null>(`tally/books-partial-${period}`, null);
      const done = new Set(part?.days ?? []);
      const got: TallyVoucher[] = [...(part?.vouchers ?? [])];
      const days = monthDays(period);
      let complete = true;
      // Each day is saved as soon as it is read: a request cut by the proxy (it answered 503 at ~90 s on 12 Nov 2026)
      // or a slow day that times out keeps every day read before it, and the next pull goes on from there.
      // GCS allows about one write a second to one object: a fast Tally answered days quicker than that (429 on
      // 12 Nov 2026), so a day is saved at most every 2 s; the last days are always saved below.
      let lastSave = 0;
      const writePart = () => writeJson(`tally/books-partial-${period}`, { period, days: [...done], vouchers: got } satisfies PartialBooks);
      const savePart = async (always = false) => {
        if (!always && Date.now() - lastSave < 2_000) return;
        lastSave = Date.now();
        await writePart();
      };
      let dayError: string | null = null;
      for (const day of days) {
        if (done.has(day)) continue;
        if (deadline - Date.now() < 12_000) { complete = false; break; }
        let dx: string;
        try {
          dx = await post(creds, dayBookDayEnvelope(day, creds.company), Math.min(deadline - Date.now() - 2_000, 78_000));
        } catch (e) {
          complete = false;
          dayError = `${day}: ${e instanceof Error ? e.message : String(e)}`;
          break;
        }
        if (!raw.daybook) raw.daybook = dx.slice(0, 300_000);
        const parsed = parseDayBook(dx);
        const inside = inRange(parsed, day, day);
        if (parsed.length && !inside.length) {
          // Tally answered with another day's vouchers (range ignored): never count the day as empty.
          raw.daybook = dx.slice(0, 300_000);
          complete = false;
          dayError = `${day}: Tally sent vouchers of other dates, not of this day`;
          break;
        }
        got.push(...inside);
        done.add(day);
        await savePart();
      }
      if (!complete) {
        await savePart(true);
        error = `Day Book ${period}: read ${done.size} of ${days.length} days${dayError ? ` (stopped at ${dayError})` : ''}; pull again to finish.`;
        break;
      }
      const stored = await readJson<StoredBooks | null>(`tally/books-${period}`, null);
      const lostDays = emptiedDays(stored?.vouchers ?? [], got);
      if (got.length && lostDays.length) {
        // Days that Tally answered empty (e.g. while another company was active) can sit in the partial file as
        // "done" and be kept when the pull resumes later (12-13 Nov 2026: May came back with only 22-31 May).
        // Keep the stored month, drop the partial so the next pull reads every day again.
        await writeJson(`tally/books-partial-${period}`, null);
        error = `Day Book ${period}: ${lostDays.length} day(s) came back empty but the stored copy has vouchers on them (${lostDays.slice(0, 5).join(', ')}${lostDays.length > 5 ? ' …' : ''}); kept the stored copy. Pull again to read the month afresh.`;
        break;
      }
      if (!got.length && (stored?.vouchers.length ?? 0) > 0) {
        // A whole month with no vouchers while the stored copy has some = Tally answered empty (wrong company open,
        // or no company loaded). Keep the stored month; never replace good books with an empty month (12 Nov 2026).
        await writeJson(`tally/books-partial-${period}`, null);
        error = `Day Book ${period}: Tally sent no vouchers for the whole month (the stored copy has ${stored!.vouchers.length}); kept the stored copy. Check that the right company is open in Tally, then pull again.`;
        break;
      }
      await writeJson(`tally/books-partial-${period}`, null);
      await writeJson(`tally/books-${period}`, { period, asOf: s.lastTryAt, vouchers: got, mode: 'daily' } satisfies StoredBooks);
      forget(`tally/books-${period}`);
      s.months[period] = s.lastTryAt;
      months.push(period);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  s.lastError = error;
  await writeJson('tally/books-state', s);
  stateMemo = null;
  if (Object.keys(raw).length) await writeJson('tally/raw-books', { at: s.lastTryAt, ...raw });
  return { masters, months, error };
}

/** Stored vouchers for the given months (missing months skipped). */
export async function readVouchers(periods: string[]): Promise<{ vouchers: TallyVoucher[]; periods: string[] }> {
  const docs = await Promise.all(periods.map(readBooks));
  const have = docs.filter((d): d is StoredBooks => !!d);
  return { vouchers: have.flatMap((d) => d.vouchers), periods: have.map((d) => d.period) };
}

/** The newest `n` stored months. */
export async function latestMonths(n = 3): Promise<string[]> {
  const s = await readBooksState();
  return Object.keys(s.months).sort().reverse().slice(0, n);
}

/** Days (YYYY-MM-DD) where the stored copy has at least `min` vouchers but the new pull has none. */
export function emptiedDays(stored: { date: string }[], fresh: { date: string }[], min = 5): string[] {
  const had = new Map<string, number>();
  for (const v of stored) had.set(v.date, (had.get(v.date) || 0) + 1);
  const now = new Set(fresh.map((v) => v.date));
  return [...had].filter(([d, n]) => n >= min && !now.has(d)).map(([d]) => d).sort();
}

// ---- One day on request + half-read months (14 Nov 2026: a heavy day such as 31-Aug kept a whole month out of reach).
export const readPartial = (period: string) => readJson<PartialBooks | null>(`tally/books-partial-${period}`, null);

/** One day's vouchers straight from Tally (READ ONLY export). day = YYYYMMDD. Throws when Tally does not answer. */
export async function pullDay(creds: Credentials, day: string, timeoutMs = 78_000): Promise<TallyVoucher[]> {
  const dx = await post(creds, dayBookDayEnvelope(day, creds.company), timeoutMs);
  const parsed = parseDayBook(dx);
  const inside = inRange(parsed, day, day);
  if (parsed.length && !inside.length) throw new Error(`Tally sent vouchers of other dates, not of ${day}`);
  return inside;
}

/** Adds a day pulled on request to the month's partial file, when that month is being read and the day is not in it yet.
 *  Never touches a stored (complete) month. Best effort: errors are swallowed. */
export async function addDayToPartial(day: string, vouchers: TallyVoucher[]): Promise<boolean> {
  try {
    const period = `${day.slice(0, 4)}-${day.slice(4, 6)}`;
    const part = await readPartial(period);
    if (!part || part.days.includes(day)) return false;
    await writeJson(`tally/books-partial-${period}`, { period, days: [...part.days, day], vouchers: [...part.vouchers, ...vouchers] } satisfies PartialBooks);
    return true;
  } catch {
    return false;
  }
}

/** Stored month + the days read since (pure). A half-read day replaces the stored copy of that day, except a day that came back
 *  empty while the stored copy has vouchers on it (Tally answered empty: keep the stored day). */
export function mergePartial(stored: TallyVoucher[], part: { days: string[]; vouchers: TallyVoucher[] } | null): { vouchers: TallyVoucher[]; freshDays: string[] } {
  if (!part || !part.days.length) return { vouchers: stored, freshDays: [] };
  const key = (d: string) => d.replace(/-/g, '');
  const partDays = new Set(part.days);
  const withPart = new Set(part.vouchers.map((v) => key(v.date)));
  const storedDays = new Set(stored.map((v) => key(v.date)));
  const fresh = [...partDays].filter((d) => withPart.has(d) || !storedDays.has(d));
  const freshSet = new Set(fresh);
  const out = [...stored.filter((v) => !freshSet.has(key(v.date))), ...part.vouchers.filter((v) => freshSet.has(key(v.date)))];
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { vouchers: out, freshDays: fresh.sort() };
}
