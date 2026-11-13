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
export const readMasters = () => readJson<StoredMasters | null>('tally/masters', null);
export const readBooks = (period: string) => readJson<StoredBooks | null>(`tally/books-${period}`, null);

const H = 3_600_000;
const istMonth = (now: number) => new Date(now + 5.5 * H).toISOString().slice(0, 7);
export function addMonths(p: string, n: number): string {
  const [y, m] = p.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Day Books to take: this + last month when older than 6 h (always when forced), then the newest unstored of the last 12. */
export function booksToPull(now: number, s: BooksState, force = false): string[] {
  const cur = istMonth(now);
  const stale = (p: string) => force || !s.months[p] || now - Date.parse(s.months[p]) > 6 * H;
  const out = [cur, addMonths(cur, -1)].filter(stale);
  for (let i = 2; i <= 12; i++) { const p = addMonths(cur, -i); if (!s.months[p]) { out.push(p); if (out.length >= 4) break; } }
  return out;
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
      s.mastersAt = s.lastTryAt;
      masters = true;
    }
    for (const period of opts.periods ?? booksToPull(now, s, opts.force)) {
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
      s.months[period] = s.lastTryAt;
      months.push(period);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  s.lastError = error;
  await writeJson('tally/books-state', s);
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
