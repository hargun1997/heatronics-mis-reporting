// ----------------------------------------------------------------------------
// TDS invoice sync (founder 22 Nov 2026): pulls the Tally Day Books (READ ONLY, bookStore.pullBooks) and moves the
// supplier invoice memory forward (services/supplierInvoices.ts). Three triggers:
//   schedule  POST /api/tds/sync/run (open path + token), hourly 06:37–22:37 IST (.github/workflows/tds-sync.yml);
//             the app runs it once a day, and from the 5th re-reads last month in full (month-end sync). Tally answers
//             only while TallyPrime is open: a failed try is retried every 50 min until it works. EVERY sync re-reads
//             the whole financial year from 1 April (founder, 22 Nov 2026: old bills get edited or back-dated), this month
//             first; a pass spans runs (one day per Tally request) and counts as good when every FY month was read after it began. Nothing stored is replaced by an empty answer
//             (pullBooks keeps the stored month; days read before a cut are kept in the partial file).
//   button    POST /api/tds/sync (signed in): "Sync with Tally" on the TDS page.
//   books     any read of /api/tds/invoices: a stored Day Book newer than the memory is merged first (so a "Pull Tally
//             now" on Tally health or the P&L poll also reaches the memory).
// Storage: tds/invoices-<YYYY-MM> (InvoiceMemory), tds/sync-state (TdsSyncState).
// ----------------------------------------------------------------------------

import { getEffectiveCredentials } from '../connectors/credentialStore.js';
import { pullBooks, readBooks, readBooksState, readMasters } from '../connectors/tally/bookStore.js';
import { readJson, writeJson } from '../ingest/objectStore.js';
import {
  EMPTY_SYNC, addMonth, invoiceRows, istDay, memoryStale, memorySummary, mergeMemory, syncDue, passMonths, fyMonths,
  type InvoiceMemory, type TdsSyncState,
} from './supplierInvoices.js';

export const readMemory = (month: string) => readJson<InvoiceMemory | null>(`tds/invoices-${month}`, null);
export const readSyncState = () => readJson<TdsSyncState>('tds/sync-state', EMPTY_SYNC);
const writeSyncState = (s: TdsSyncState) => writeJson('tds/sync-state', s);

/** Brings one month's memory up to the stored Day Book (no Tally call). Returns the memory (null = no books stored). */
export async function memoryFor(month: string, at = new Date().toISOString()): Promise<InvoiceMemory | null> {
  const [mem, books, state] = await Promise.all([readMemory(month), readBooks(month), readBooksState()]);
  const asOf = state.months[month] ?? books?.asOf ?? null;
  if (!books || !memoryStale(mem, asOf)) return mem;
  const masters = await readMasters();
  const next = mergeMemory(mem, month, invoiceRows(books.vouchers, masters?.ledgers ?? []), at, asOf);
  await writeJson(`tds/invoices-${month}`, next);
  return next;
}

let running: Promise<TdsSyncState> | null = null;
export const syncRunning = () => !!running;

/** One sync: Day Books from Tally → memory. Never throws; one at a time (a second call joins the first). */
export function runTdsSync(trigger: 'schedule' | 'button', opts: { budgetMs?: number } = {}): Promise<TdsSyncState> {
  if (running) return running;
  const p = (async () => {
    const now = Date.now();
    const s = await readSyncState();
    const at = new Date(now).toISOString();
    s.lastTryAt = at;
    s.passStartedAt ??= at; // every sync belongs to a full-year re-read from 1 April
    await writeSyncState(s);
    const before = await readBooksState();
    const months = passMonths(now, before.months, s.passStartedAt);
    let error: string | null = null;
    try {
      const creds = await getEffectiveCredentials('tally', ['host', 'port', 'company']);
      if (!String(creds.host ?? '').trim()) error = 'Tally is not connected. Add the host on Setup → Tally.';
      else if (months.length) {
        const r = await pullBooks(creds, { periods: months, budgetMs: opts.budgetMs ?? 240_000 });
        error = r.error;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    // Merge whatever is stored now into every FY month's memory (also the months read before an error or the budget).
    let bills = 0;
    for (const m of fyMonths(now)) bills += memorySummary(await memoryFor(m, at)).bills;
    const st = await readBooksState();
    const left = passMonths(now, st.months, s.passStartedAt);
    s.lastError = error;
    if (!error && !left.length) {
      // The whole year was read after the pass began: a good sync.
      const d = new Date(now + 5.5 * 3_600_000);
      const fifth = Date.parse(`${d.toISOString().slice(0, 7)}-05T00:00:00+05:30`);
      if (Date.parse(s.passStartedAt) >= fifth) s.finalFor = { ...s.finalFor, [addMonth(d.toISOString().slice(0, 7), -1)]: at };
      s.lastOkAt = at;
      s.lastOkDay = istDay(now);
      s.passStartedAt = null;
    }
    s.lastRun = { at, trigger, months, bills, error };
    await writeSyncState(s);
    return s;
  })().finally(() => { running = null; });
  running = p;
  return p;
}

/** FY months not yet read in the running full-year pass (page line). */
export async function passLeft(s: TdsSyncState): Promise<string[]> {
  if (!s.passStartedAt) return [];
  return passMonths(Date.now(), (await readBooksState()).months, s.passStartedAt);
}

/** The scheduled call: runs only when due (syncDue). */
export async function scheduledSync(): Promise<{ status: 'not_due' | 'started' | 'done' | 'failed'; why: string; state?: TdsSyncState; promise?: Promise<TdsSyncState> }> {
  const s = await readSyncState();
  const due = syncDue(Date.now(), s);
  if (!due.due) return { status: 'not_due', why: due.why };
  return { status: 'started', why: due.why, promise: runTdsSync('schedule') };
}
