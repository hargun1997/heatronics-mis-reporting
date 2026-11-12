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
export async function pullBooks(creds: Credentials, opts: { force?: boolean; now?: number; budgetMs?: number; periods?: string[] } = {}): Promise<{ masters: boolean; months: string[]; error: string | null }> {
  const now = opts.now ?? Date.now();
  const deadline = Date.now() + (opts.budgetMs ?? 120_000);
  const s = await readBooksState();
  s.lastTryAt = new Date(now).toISOString();
  const raw: Record<string, string> = {};
  let masters = false;
  const months: string[] = [];
  let error: string | null = null;
  try {
    if (opts.force || !s.mastersAt || now - Date.parse(s.mastersAt) > 20 * H) {
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
      for (const day of days) {
        if (done.has(day)) continue;
        if (deadline - Date.now() < 12_000) { complete = false; break; }
        const dx = await post(creds, dayBookDayEnvelope(day, creds.company), Math.min(deadline - Date.now() - 2_000, 60_000));
        if (!raw.daybook) raw.daybook = dx.slice(0, 300_000);
        got.push(...inRange(parseDayBook(dx), day, day));
        done.add(day);
      }
      if (!complete) {
        await writeJson(`tally/books-partial-${period}`, { period, days: [...done], vouchers: got } satisfies PartialBooks);
        error = `Day Book ${period}: read ${done.size} of ${days.length} days; pull again to finish.`;
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
