// Shopify D2C history refresh (new vs repeat buyers per month): one job per instance, shared by the 5-year plan's
// "Refresh" button and the daily auto-pull run, so CAC on Live MIS → P&L → Marketing efficiency stays current
// (founder, 25 Nov 2026). READ ONLY on Shopify (pullShopifyHistory).
import { readJson, writeJson } from '../ingest/objectStore.js';
import { getConnector } from '../connectors/registry.js';
import { getEffectiveCredentials } from '../connectors/credentialStore.js';
import { pullShopifyHistory, type D2CHistory } from './shopifyHistory.js';

export const HISTORY_KEY = 'planning-d2c-history';
export const HISTORY_BUDGET_MS = 8 * 60_000;
const IST_MS = 5.5 * 3_600_000;

export type HistJob =
  | { status: 'running'; startedAt: string }
  | { status: 'done'; startedAt: string; finishedAt: string }
  | { status: 'failed'; startedAt: string; error: string };

let histJob: { state: HistJob; promise: Promise<void> } | null = null;

export const historyJobState = (): HistJob | null => histJob?.state ?? null;
export const readHistory = () => readJson<D2CHistory | null>(HISTORY_KEY, null);

/** Pure: the stored history is due a daily refresh when it was not taken today (IST) and it is 07:00 IST or later. */
export function historyDue(asOf: string | null | undefined, now: number): boolean {
  const ist = new Date(now + IST_MS);
  if (ist.getUTCHours() < 7) return false;
  const today = ist.toISOString().slice(0, 10);
  if (!asOf) return true;
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return true;
  return new Date(t + IST_MS).toISOString().slice(0, 10) < today;
}

/** Starts a refresh unless one is running (a run stuck past its budget + 1 min is replaced). null = Shopify not connected. */
export async function startHistoryRefresh(): Promise<{ state: HistJob; promise: Promise<void> } | null> {
  const c = getConnector('shopify');
  if (!c) return null;
  const creds = await getEffectiveCredentials('shopify', c.credentialFields.map((f) => f.key));
  if (!creds.shopDomain || !(creds.accessToken || (creds.clientId && creds.clientSecret))) return null;
  const stale = histJob?.state.status === 'running' && Date.now() - Date.parse(histJob.state.startedAt) > HISTORY_BUDGET_MS + 60_000;
  if (!histJob || histJob.state.status !== 'running' || stale) {
    const startedAt = new Date().toISOString();
    const job: { state: HistJob; promise: Promise<void> } = { state: { status: 'running', startedAt }, promise: Promise.resolve() };
    job.promise = pullShopifyHistory(creds, Date.now() + HISTORY_BUDGET_MS)
      .then(async (hist) => { await writeJson(HISTORY_KEY, hist); job.state = { status: 'done', startedAt, finishedAt: new Date().toISOString() }; })
      .catch((err: unknown) => { job.state = { status: 'failed', startedAt, error: err instanceof Error ? err.message : String(err) }; });
    histJob = job;
  }
  return histJob;
}

/** Daily: refresh only when the stored copy is older than today (IST). Never throws. */
export async function refreshHistoryIfDue(now = Date.now()): Promise<'started' | 'fresh' | 'not_connected' | 'failed'> {
  try {
    const stored = await readHistory();
    if (!historyDue(stored?.asOf, now)) return 'fresh';
    if (histJob?.state.status === 'running') return 'started';
    return (await startHistoryRefresh()) ? 'started' : 'not_connected';
  } catch (e) {
    console.error('history refresh failed:', e instanceof Error ? e.message : e);
    return 'failed';
  }
}
