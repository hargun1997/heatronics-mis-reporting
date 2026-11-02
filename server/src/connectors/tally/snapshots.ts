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

export interface TallySnapshot extends TallyPnlMonth { asOf: string }
export interface TallyState {
  lastTryAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  company: string | null;
  months: Record<string, string>; // period → asOf
}

const EMPTY: TallyState = { lastTryAt: null, lastOkAt: null, lastError: null, company: null, months: {} };
export const MIN_GAP_MS = 20 * 60_000;

export const readTallyState = () => readJson<TallyState>('tally/state', EMPTY);
export const readTallySnapshot = (period: string) => readJson<TallySnapshot | null>(`tally/pnl-${period}`, null);

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

/** One poll. `force` skips the 20-minute gap (signed-in Pull now). Never throws: the answer is a status. */
export async function pollTally(creds: Credentials, opts: { force?: boolean; now?: number } = {}): Promise<{ status: 'skipped' | 'down' | 'ok' | 'not_connected'; detail: string; months?: string[] }> {
  const now = opts.now ?? Date.now();
  if (!(creds.host || '').trim()) return { status: 'not_connected', detail: 'Add the Tally host + port on the Connectors page (Tally card).' };
  const state = await readTallyState();
  if (!opts.force) {
    const d = scheduledDue(now, state);
    if (!d.due) return { status: 'skipped', detail: d.why };
  }
  state.lastTryAt = new Date(now).toISOString();
  try {
    const list = await post(creds, companyListEnvelope(), 10_000);
    const loaded = /<SVCURRENTCOMPANY>([\s\S]*?)<\/SVCURRENTCOMPANY>/i.exec(list)?.[1];
    if (loaded) state.company = decode(loaded);
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
    await writeJson('tally/state', state);
    return { status: 'down', detail: `Tally not reachable: ${state.lastError}` };
  }
  const done: string[] = [];
  let failed: string | null = null;
  for (const period of monthsToPull(now, state.months)) {
    try {
      const xml = await post(creds, pnlEnvelope(period, creds.company), 60_000);
      const month = parsePnlXml(xml, period);
      if (!done.length) await writeJson('tally/raw-last', { period, at: state.lastTryAt, xml: xml.slice(0, 400_000) });
      const snap: TallySnapshot = { ...month, asOf: state.lastTryAt };
      await writeJson(`tally/pnl-${period}`, snap);
      state.months[period] = state.lastTryAt;
      done.push(period);
    } catch (e) {
      failed = `${period}: ${e instanceof Error ? e.message : String(e)}`;
      break; // Tally closed mid-run: keep what we have
    }
  }
  if (done.length) state.lastOkAt = state.lastTryAt;
  state.lastError = failed;
  await writeJson('tally/state', state);
  return { status: done.length ? 'ok' : 'down', detail: done.length ? `Stored P&L for ${done.join(', ')}${failed ? ` (stopped: ${failed})` : ''}` : `Tally answered the check but not the P&L: ${failed}`, months: done };
}
