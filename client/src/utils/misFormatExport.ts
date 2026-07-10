// Export / import the MIS in the target "MIS Sheet" format (Masterchow layout):
// a "P&L Summary" sheet (company) and a "Channel" sheet (per channel), with the
// line-item rows down the side and months (grouped by fiscal year, with FY
// totals) across the top. Values in ₹ Lac; percentages as real % cells.

import XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { SALES_CHANNELS } from '../data/misDeck/misDeckData';
import { channelLabel } from '../data/misDeck/analytics';
import {
  MIS_SHEET_ROWS,
  misPoint,
  sumPoints,
  misFiscalYears,
  type MisEntity,
} from '../data/misDeck/misSheet';

const LAC = 1e5;
const round2 = (n: number) => Math.round(n * 100) / 100;

type Style = NonNullable<XLSX.CellObject['s']>;

const S = {
  title: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' }, alignment: { horizontal: 'left' } },
  head: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' }, patternType: 'solid' }, alignment: { horizontal: 'center' } },
  band: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '2C5282' }, patternType: 'solid' }, alignment: { horizontal: 'left' } },
  label: { font: { sz: 10 }, alignment: { horizontal: 'left' } },
  labelBold: { font: { bold: true, sz: 10 }, alignment: { horizontal: 'left' } },
  num: { font: { sz: 10 }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' },
  numBold: { font: { bold: true, sz: 10 }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' },
  pct: { font: { italic: true, sz: 10, color: { rgb: '555555' } }, alignment: { horizontal: 'right' }, numFmt: '0.0%' },
  total: { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: 'E9ECEF' }, patternType: 'solid' }, alignment: { horizontal: 'right' }, numFmt: '#,##0.00' },
} satisfies Record<string, Style>;

interface Col { label: string; total: boolean; monthKeys: string[] }

/** Columns = each fiscal year's months, followed by that FY's total. */
function buildColumns(): Col[] {
  const cols: Col[] = [];
  for (const fy of misFiscalYears()) {
    for (const m of fy.months) cols.push({ label: m.label, total: false, monthKeys: [m.key] });
    cols.push({ label: `${fy.name} Total`, total: true, monthKeys: fy.months.map((m) => m.key) });
  }
  return cols;
}

const fyByKey = (() => {
  const map = new Map<string, ReturnType<typeof misFiscalYears>[number]['months'][number]>();
  for (const fy of misFiscalYears()) for (const m of fy.months) map.set(m.key, m);
  return map;
})();

function pointForKeys(monthKeys: string[], entity: MisEntity) {
  const pts = monthKeys.map((k) => misPoint(fyByKey.get(k)!, entity));
  return pts.length === 1 ? pts[0] : sumPoints(pts);
}

/** Render one entity's block (header + rows) into ws starting at `startRow`. */
function writeBlock(
  ws: XLSX.WorkSheet, startRow: number, cols: Col[], entity: MisEntity, heading: string,
): number {
  let row = startRow;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s };
  };

  // Heading band across the row-label column + all columns.
  put(row, 0, heading, S.band);
  for (let c = 1; c <= cols.length; c++) put(row, c, '', S.band);
  row++;

  // Header row.
  put(row, 0, 'Particulars in INR Lac', S.head);
  cols.forEach((col, i) => put(row, i + 1, col.total ? 'Grand Total' : col.label, S.head));
  row++;

  // Rows.
  const points = cols.map((col) => pointForKeys(col.monthKeys, entity));
  for (const def of MIS_SHEET_ROWS) {
    put(row, 0, def.label, def.bold ? S.labelBold : S.label);
    cols.forEach((col, i) => {
      const raw = def.get(points[i]);
      if (raw === null) {
        put(row, i + 1, '', S.label);
      } else if (def.pct) {
        put(row, i + 1, round2(raw * 1000) / 1000, S.pct);
      } else if (def.count) {
        put(row, i + 1, Math.round(raw), col.total ? { ...S.total, numFmt: '#,##0' } : { ...S.num, numFmt: '#,##0' });
      } else {
        const v = round2(raw / LAC);
        put(row, i + 1, v, col.total ? S.total : def.bold ? S.numBold : S.num);
      }
    });
    row++;
  }
  return row;
}

export function downloadMisFormat(): void {
  const wb = XLSX.utils.book_new();
  const cols = buildColumns();
  const nCols = cols.length + 1;

  // P&L Summary (company)
  const summary: XLSX.WorkSheet = {};
  let r = writeBlock(summary, 0, cols, 'company', 'HEATRONICS MIS · Company P&L (₹ Lac)');
  summary['!ref'] = `A1:${XLSX.utils.encode_cell({ r, c: nCols - 1 })}`;
  summary['!cols'] = [{ wch: 26 }, ...cols.map(() => ({ wch: 11 }))];
  XLSX.utils.book_append_sheet(wb, summary, 'P&L Summary');

  // Channel (each channel stacked)
  const channel: XLSX.WorkSheet = {};
  let cr = 0;
  for (const c of SALES_CHANNELS) {
    cr = writeBlock(channel, cr, cols, c, channelLabel(c));
    cr += 1; // spacer between channels
  }
  channel['!ref'] = `A1:${XLSX.utils.encode_cell({ r: cr, c: nCols - 1 })}`;
  channel['!cols'] = [{ wch: 26 }, ...cols.map(() => ({ wch: 11 }))];
  XLSX.utils.book_append_sheet(wb, channel, 'Channel');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Heatronics_MIS_Sheet_${new Date().toISOString().split('T')[0]}.xlsx`,
  );
}

// ----------------------------------------------------------------------------
// Import: read a workbook in this format and pull the "P&L Summary" block back
// into a display table (round-trips with the export above).
// ----------------------------------------------------------------------------

export interface ImportedMis {
  columns: string[];
  rows: { label: string; pct: boolean; values: (number | null)[] }[];
}

const ROW_BY_LABEL = new Map(MIS_SHEET_ROWS.map((r) => [r.label.toLowerCase(), r]));

export function parseMisFormat(data: ArrayBuffer): ImportedMis | null {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames.find((n) => /p&?l summary|summary/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: true });

  // Find the header row ("Particulars…") and the data column span.
  const headerIdx = grid.findIndex((r) => typeof r[0] === 'string' && /particulars/i.test(r[0] as string));
  if (headerIdx < 0) return null;
  const header = grid[headerIdx];
  const columns = header.slice(1).map((v, i) =>
    v === undefined || v === '' ? `Col ${i + 1}` : String(v),
  );

  const rows: ImportedMis['rows'] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i];
    const label = typeof raw[0] === 'string' ? raw[0].trim() : '';
    if (!label) continue;
    const known = ROW_BY_LABEL.get(label.toLowerCase());
    const pct = !!known?.pct || /%$/.test(label);
    const values = columns.map((_, c) => {
      const cell = raw[c + 1];
      return typeof cell === 'number' ? cell : null;
    });
    rows.push({ label, pct, values });
    if (/^ebitda%/i.test(label)) break; // stop after the P&L block (skip cash/notes)
  }
  return { columns, rows };
}
