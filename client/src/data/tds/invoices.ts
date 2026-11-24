// Supplier invoice register (TDS page → Invoices): GET /api/tds/invoices?month= (stored Tally Day Books + the memory of
// each bill across syncs; server/src/services/supplierInvoices.ts), "Sync with Tally" (POST /api/tds/sync) and the
// Excel download for any month (layout in tdsFormats.ts INVOICE_COLUMNS).
import { useCallback, useEffect, useState } from 'react';
import { sectionOf } from './tds';
import type { FiledDoc } from './filed';

export interface InvoiceChange { at: string; field: string; from: string | number; to: string | number }
export interface InvoiceRow {
  key: string; month: string; date: string; voucherType: string; voucherNo: string; supplier: string; pan: string; gstin: string;
  invoiceNo: string; invoiceDate: string; ledgers: string; taxable: number; igst: number; cgst: number; sgst: number; cess: number;
  tdsLedger: string; tds: number; total: number; payable: number; partyTds: string; narration: string;
  firstSeen: string; lastSeen: string; status: 'active' | 'removed'; removedAt?: string; changes: InvoiceChange[];
}
export interface SyncState {
  lastTryAt: string | null; lastOkAt: string | null; lastOkDay: string | null; lastError: string | null; finalFor: Record<string, string>;
  lastRun?: { at: string; trigger: string; months: string[]; bills: number; error: string | null };
}
export interface SyncInfo { sync: SyncState; running: boolean; reachedAt: string | null; nextWhy: string; offline: boolean; waiting: string[]; passLeft?: string[] }
export interface InvoicesApi extends SyncInfo {
  month: string; stored: boolean; booksAsOf: string | null; syncedAt: string | null;
  summary: { bills: number; suppliers: number; taxable: number; tds: number; withTds: number; edited: number; removed: number };
  duplicates: { supplier: string; invoiceNo: string; voucherNos: string[]; total: number }[];
  rows: InvoiceRow[];
}

/** TDS section of a row ('' = no TDS on the bill). Same mapping as the TDS engine. */
export const rowSection = (r: Pick<InvoiceRow, 'tdsLedger' | 'tds'>) => (r.tds > 0 && r.tdsLedger ? sectionOf(r.tdsLedger) : '');
export const rowRate = (r: Pick<InvoiceRow, 'tds' | 'taxable'>) => (r.tds > 0 && r.taxable > 0 ? Math.round((r.tds / r.taxable) * 10_000) / 100 : null);

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'include', ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Could not load (${r.status})`);
  return j as T;
}

export function useInvoices(month: string) {
  const [got, setGot] = useState<{ month: string; api: InvoicesApi | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    getJson<InvoicesApi>(`/api/tds/invoices?month=${month}`)
      .then((j) => { if (live) setGot({ month, api: j, error: null }); })
      .catch((e: Error) => { if (live) setGot({ month, api: null, error: e.message }); });
    return () => { live = false; };
  }, [month, tick]);

  /** Sync with Tally now: the server answers within 25 s or says "running"; then poll every 15 s until it is done. */
  const sync = useCallback(async (): Promise<{ ok: boolean; error: string | null; running?: boolean }> => {
    setSyncing(true);
    try {
      let r = await getJson<SyncInfo & { status: string }>('/api/tds/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      for (let i = 0; r.running && i < 24; i++) {
        await new Promise((ok) => setTimeout(ok, 15_000));
        r = { status: 'running', ...(await getJson<SyncInfo>('/api/tds/sync')) };
      }
      reload();
      return { ok: !r.sync.lastError, error: r.sync.lastError, running: !!r.running };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Sync failed' };
    } finally {
      setSyncing(false);
    }
  }, [month, reload]);

  const cur = got && got.month === month ? got : null;
  return { api: cur?.api ?? null, error: cur?.error ?? null, loading: !cur, syncing, sync, reload };
}

export type MonthState = 'ok' | 'stale' | 'partial' | 'missing' | 'running';
export interface HistoryMonth {
  month: string; state: MonthState; note: string; booksAsOf: string | null; syncedAt: string | null;
  summary: InvoicesApi['summary']; rows: InvoiceRow[];
  /** The team's filed report for the month (the truth for a filed month); null = not uploaded. */
  filed: FiledDoc | null;
}
export interface HistoryApi extends SyncInfo { fy: string | null; months: HistoryMonth[] }

export const loadHistory = () => getJson<HistoryApi>('/api/tds/history');

export function useHistory(enabled: boolean) {
  const [got, setGot] = useState<{ api: HistoryApi | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadHistory()
      .then((j) => { if (live) setGot({ api: j, error: null }); })
      .catch((e: Error) => { if (live) setGot({ api: null, error: e.message }); });
    return () => { live = false; };
  }, [enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { api: got?.api ?? null, error: got?.error ?? null, loading: enabled && !got, reload };
}

/** Store one month's filed report (parsed in the browser). */
export const saveFiled = (doc: FiledDoc) => getJson<{ ok: boolean; bills: number; netPayable: number }>(`/api/tds/filed/${doc.month}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc),
});
/** Remove a month's filed report (the month goes back to Tally). */
export const deleteFiled = (month: string) => getJson<{ ok: boolean }>(`/api/tds/filed/${month}`, { method: 'DELETE' });
