// ----------------------------------------------------------------------------
// TDS invoice sync (founder 22 Nov 2026): pulls the Tally Day Books (READ ONLY, bookStore.pullBooks) and moves the
// supplier invoice memory forward (services/supplierInvoices.ts). Three triggers:
//   schedule  POST /api/tds/sync/run (open path + token), hourly 06:37–22:37 IST (.github/workflows/tds-sync.yml);
//             the app runs it once a day, and from the 5th re-reads last month in full (month-end sync). Tally answers
//             only while TallyPrime is open: a failed try is retried every 50 min until it works, and the next good
//             sync also reads the months missed while Tally was closed. Nothing stored is replaced by an empty answer
//             (pullBooks keeps the stored month; days read before a cut are kept in the partial file).
//   button    POST /api/tds/sync (signed in): "Sync with Tally" on the TDS page.
//   books     any read of /api/tds/invoices: a stored Day Book newer than the memory is merged first (so a "Pull Tally
//             now" on Tally health or the P&L poll also reaches the memory).
// Storage: tds/invoices-<YYYY-MM> (InvoiceMemory), tds/sync-state (TdsSyncState).
// ----------------------------------------------------------------------------

import { getEffectiveCredentials } from '../connectors/credentialStore.js';
import { fyMonthsTo, pullBooks, pullBooksSweep, readBooks, readBooksState, readMasters, readSweep, sweepInProgress } from '../connectors/tally/bookStore.js';
import { readJson, writeJson } from '../ingest/objectStore.js';
import {
  EMPTY_SYNC, invoiceRows, istDay, memoryStale, memorySummary, mergeMemory, syncDue,
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
export function runTdsSync(trigger: 'schedule' | 'button', opts: { monthEnd?: boolean; months?: string[]; budgetMs?: number } = {}): Promise<TdsSyncState> {
  if (running) return running;
  const p = (async () => {
    const now = Date.now();
    const s = await readSyncState();
    const at = new Date(now).toISOString();
    s.lastTryAt = at;
    await writeSyncState(s);
    // Founder, 22 Nov 2026: every sync re-reads the WHOLE financial year (back-dated entries). Without `months` the
    // sync continues the shared FY sweep (bookStore.pullBooksSweep, April → this month, resumable across runs).
    const fy = fyMonthsTo(now);
    let months = opts.months ?? fy;
    let error: string | null = null;
    try {
      const creds = await getEffectiveCredentials('tally', ['host', 'port', 'company']);
      if (!String(creds.host ?? '').trim()) error = 'Tally is not connected. Add the host on Setup → Tally.';
      else if (opts.months) {
        error = (await pullBooks(creds, { periods: opts.months, budgetMs: opts.budgetMs ?? 240_000 })).error;
      } else {
        const r = await pullBooksSweep(creds, { now, budgetMs: opts.budgetMs ?? 240_000 });
        error = r.error;
        months = r.asked;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    // Merge whatever is stored now for every FY month (also months read before an error, or by another caller).
    let bills = 0;
    for (const m of [...new Set([...fy, ...months])]) bills += memorySummary(await memoryFor(m, at)).bills;
    const st = await readBooksState();
    s.lastError = error;
    if (!error) {
      s.lastOkAt = at;
      s.lastOkDay = istDay(now);
    }
    // Month-end: last month counts as final once its Day Book was read again on / after the 5th (by any caller).
    const cur = fy[fy.length - 1];
    const lastMonth = new Date(Date.UTC(Number(cur.slice(0, 4)), Number(cur.slice(5)) - 2, 1)).toISOString().slice(0, 7);
    const fifth = Date.parse(`${cur}-05T00:00:00+05:30`);
    if (st.months[lastMonth] && Date.parse(st.months[lastMonth]) >= fifth && !(s.finalFor[lastMonth] && Date.parse(s.finalFor[lastMonth]) >= fifth)) {
      s.finalFor = { ...s.finalFor, [lastMonth]: st.months[lastMonth] };
    }
    s.lastRun = { at, trigger, months, bills, error };
    await writeSyncState(s);
    return s;
  })().finally(() => { running = null; });
  running = p;
  return p;
}

/** The scheduled call: runs only when due (syncDue). */
export async function scheduledSync(): Promise<{ status: 'not_due' | 'started' | 'done' | 'failed'; why: string; state?: TdsSyncState; promise?: Promise<TdsSyncState> }> {
  const s = await readSyncState();
  const now = Date.now();
  const due = syncDue(now, s);
  if (!due.due) {
    // While a FY pass is running, every hourly call continues it (inside 06:00–23:00, 50 min apart).
    const hour = new Date(now + 5.5 * 3_600_000).getUTCHours();
    const since = s.lastTryAt ? now - Date.parse(s.lastTryAt) : Infinity;
    if (!(sweepInProgress(await readSweep()) && hour >= 6 && hour < 23 && since >= 50 * 60_000)) return { status: 'not_due', why: due.why };
    return { status: 'started', why: 'FY pass running: continue it.', promise: runTdsSync('schedule') };
  }
  return { status: 'started', why: due.why, promise: runTdsSync('schedule', { monthEnd: due.monthEnd }) };
}
