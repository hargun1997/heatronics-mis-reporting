// Loads GET /api/tds?month= (stored Tally Day Books, READ ONLY) and runs the pure TDS engine in the browser.
import { useEffect, useMemo, useState } from 'react';
import { buildTds, type TdsLedger, type TdsReport, type TdsVoucher } from './tds';
import { monthSheets, reportSheetName } from './tdsFormats';
import type { InvoiceRow } from './invoices';

export interface TdsApi { month: string; months: string[]; storedMonths: string[]; asOf: Record<string, string>; mastersAt: string | null; vouchers: TdsVoucher[]; ledgers: TdsLedger[] }

export const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
export const lastMonth = () => { const d = new Date(Date.now() + 5.5 * 3_600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

export function useTds(month: string): { api: TdsApi | null; report: TdsReport | null; error: string | null; loading: boolean } {
  const [got, setGot] = useState<{ month: string; api: TdsApi | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/tds?month=${month}`, { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Could not load (${r.status})`); return j as TdsApi; })
      .then((j) => { if (live) setGot({ month, api: j, error: null }); })
      .catch((e: Error) => { if (live) setGot({ month, api: null, error: e.message }); });
    return () => { live = false; };
  }, [month]);
  const cur = got && got.month === month ? got : null;
  const api = cur?.api ?? null;
  const report = useMemo(() => (api ? buildTds({ month: api.month, vouchers: api.vouchers, ledgers: api.ledgers, storedMonths: api.storedMonths, today: istToday() }) : null), [api]);
  return { api, report, error: cur?.error ?? null, loading: !cur };
}

/** Excel download for any month. Default = the accounts team's TDS report; working = Supplier invoices + planning sheets. */
export async function downloadTds(month: string, r: TdsReport | null, invoices: { rows: InvoiceRow[]; syncedAt: string | null } | null, working = false) {
  const sheets = monthSheets(month, r, invoices, { working });
  if (!sheets.length) return false;
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows, { cellDates: true, dateNF: 'dd-mm-yyyy' });
    if (!working) ws['!cols'] = [{ wch: 6 }, { wch: 38 }, { wch: 13 }, { wch: 12 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, working ? `tds-working-${month}.xlsx` : `Tds Report ${reportSheetName(month)}.xlsx`);
  return true;
}

export const tdsBtn =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500';

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
