// Excel in / out for the Bulk payments tool (browser + tests). Reads the CIB payee export (.xls BIFF8 or .xlsx) and
// writes the upload files with every cell as TEXT, so account numbers and mobiles keep their leading zeros.

import * as XLSX from 'xlsx';
import { parsePayeeRows, type ParseResult } from './payees';
import { PAYMENT_FORMAT } from './iciciFormats';
import { toCsv } from './batch';

/** Raw cells (strings stay strings; a numeric account cell is flagged by the parser). */
export function readPayeeWorkbook(data: ArrayBuffer | Uint8Array): ParseResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false });
  let best: ParseResult | null = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true });
    const r = parsePayeeRows(rows);
    if (r.headerRow >= 0 && (!best || r.payees.length > best.payees.length)) best = r;
  }
  return best ?? parsePayeeRows([]);
}

/** A one-sheet workbook of text cells. */
export function textWorkbook(rows: string[][], sheetName: string): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((v) => String(v ?? ''))));
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const c = ws[addr] as XLSX.CellObject;
    c.t = 's';
    c.z = '@';
  }
  ws['!cols'] = rows[0]?.map((h, i) => ({ wch: Math.min(40, Math.max(String(h).length, ...rows.slice(1).map((r) => String(r[i] ?? '').length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

export function workbookBytes(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** Browser download. */
export function downloadBlob(bytes: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The payment file as .xlsx and .csv (browser). */
export function downloadPaymentFiles(out: string[][], batchId: string): void {
  downloadBlob(workbookBytes(textWorkbook(out, PAYMENT_FORMAT.sheetName)), `ICICI-bulk-payment-${batchId}.xlsx`, XLSX_MIME);
  downloadBlob(toCsv(out), `ICICI-bulk-payment-${batchId}.csv`, 'text/csv');
}
