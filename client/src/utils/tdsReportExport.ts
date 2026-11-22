// TDS report Excel with the accounts team's styling (founder, 22 Nov 2026: "bold headers and borders, matching Ashi's"):
// bold title rows, bold block titles, bold boxed header row, every block cell boxed with thin black borders, bold Total and
// Grand Total rows, the "TDS PAYABLE" summary boxed with bold title and totals. Plain black on white (no fills), Calibri 11,
// numbers with 2 decimals, the rate column as 0.00, dates dd-mm-yyyy. Rows / kinds come from data/tds/tdsFormats.ts.
// Loaded with await import() on click (keeps xlsx-js-style out of the page chunk).
import XLSX from 'xlsx-js-style';
import { reportRowKinds, type ReportCell } from '../data/tds/tdsFormats';

const thin = { style: 'thin', color: { rgb: '000000' } };
const BOX = { top: thin, bottom: thin, left: thin, right: thin };
const FONT = { name: 'Calibri', sz: 11 };
const COLS = [{ wch: 7 }, { wch: 40 }, { wch: 13 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 13 }, { wch: 13 }];
const WIDTH = 8; // S.NO … INTREST 1.5%

/** One styled worksheet for a report sheet (rows from tdsReportSheet / historySheets). */
export function styledReportSheet(rows: ReportCell[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'dd-mm-yyyy' });
  const kinds = reportRowKinds(rows);
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  kinds.forEach((k, r) => {
    const boxed = k === 'header' || k === 'data' || k === 'total' || k === 'grand';
    const summary = k === 'summaryTitle' || k === 'summary' || k === 'summaryTotal';
    const bold = k !== 'data' && k !== 'summary' && k !== 'blank';
    const lastCol = boxed ? WIDTH - 1 : summary ? 2 : Math.max(0, rows[r].length - 1);
    if (k === 'company' || k === 'month' || k === 'block' || k === 'flag') merges.push({ s: { r, c: 0 }, e: { r, c: WIDTH - 1 } });
    for (let c = summary ? 1 : 0; c <= lastCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] ?? (ws[addr] = { t: 's', v: '' });
      const isNum = typeof cell.v === 'number';
      cell.s = {
        font: { ...FONT, bold, sz: k === 'company' ? 14 : k === 'month' || k === 'block' ? 12 : 11 },
        alignment: {
          horizontal: k === 'company' || k === 'month' ? 'center' : k === 'header' ? 'center' : isNum ? 'right' : 'left',
          vertical: 'center', wrapText: k === 'header',
        },
        ...(boxed || summary ? { border: BOX } : {}),
        ...(isNum && !(cell.v instanceof Date) ? { numFmt: c === 7 && k === 'data' ? '0.00' : c === 0 && k === 'data' ? '0' : '#,##0.00' } : {}),
        ...(cell.t === 'd' || cell.v instanceof Date ? { numFmt: 'dd-mm-yyyy' } : {}),
      };
    }
  });
  ws['!merges'] = merges;
  ws['!cols'] = COLS;
  ws['!rows'] = kinds.map((k) => (k === 'header' ? { hpt: 30 } : k === 'company' ? { hpt: 22 } : {}));
  return ws;
}

/** Workbook of report sheets (one per month), downloaded as `file`. */
export function downloadStyledReport(file: string, sheets: { name: string; rows: ReportCell[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, styledReportSheet(s.rows), s.name);
  XLSX.writeFile(wb, file, { cellStyles: true });
}
