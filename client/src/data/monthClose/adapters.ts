// ----------------------------------------------------------------------------
// Source adapters.
//
// One adapter per source family. Each declares what it accepts, sniffs whether
// a given file is its business, and flattens it into LedgerNode[]. Everything
// downstream — mapping, cascade, emit — is adapter-agnostic, so supporting a
// new export next month is a new entry in ADAPTERS rather than a new page.
//
// Screenshots do not parse here: they go to the server for vision extraction
// and come back as nodes already (see visionSource in ingestClient.ts).
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { normaliseLedger } from './ledgerMap';
import type { LedgerNode, Provenance, SkuRow, SourceKind } from './schema';

export interface AdapterInput {
  file: File;
  sourceId: string;
  /** Sheet-of-cells for spreadsheets; adapters may re-read the workbook. */
  workbook: XLSX.WorkBook;
}

export interface AdapterResult {
  nodes: LedgerNode[];
  /** Product rows, for platform exports. Tally adapters return none. */
  skuRows?: SkuRow[];
  warnings: string[];
}

export interface SourceAdapter {
  kind: SourceKind;
  label: string;
  /** 0–1. The highest scorer claims the file; below 0.2 nothing claims it. */
  sniff: (wb: XLSX.WorkBook, fileName: string) => number;
  parse: (input: AdapterInput) => AdapterResult;
}

const SPREADSHEET_RE = /\.(xlsx|xlsm|xls|csv|tsv)$/i;
export const isSpreadsheet = (name: string) => SPREADSHEET_RE.test(name);
export const isImage = (name: string) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);

function prov(sourceId: string, label: string, note?: string): Provenance {
  return { sourceId, sourceLabel: label, method: 'xlsx', confidence: 'exact', verified: true, note };
}

/** Rupees out of whatever Tally or a platform export put in the cell. */
export function toAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;

  let s = v.trim();
  if (!s) return null;

  // Tally prints credits as "1,234.00 Cr" and brackets for negatives.
  let sign = 1;
  if (/\bcr\b/i.test(s)) sign = -1;
  if (/^\(.*\)$/.test(s)) sign = -1;

  s = s.replace(/\b(dr|cr)\b/gi, '').replace(/[()₹,\s]/g, '');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;

  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * Math.abs(n) * (n < 0 ? -1 : 1) : null;
}

/** Indent depth from leading whitespace, as the Tally workbooks encode it. */
function depthOf(raw: string): number {
  const lead = raw.length - raw.replace(/^[\s\u00a0]+/, '').length;
  return Math.floor(lead / 6);
}

function sheetRows(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
}

function allText(wb: XLSX.WorkBook): string {
  return wb.SheetNames.join(' ').toLowerCase();
}

/**
 * Walk a two-column "Particulars | Amount" sheet into a tree, using the indent
 * of the label column for depth. Rollups whose children sum to them are kept
 * but marked non-leaf so pickNodes can prefer whichever level is mapped.
 */
function parseIndentedSheet(
  rows: unknown[][],
  labelCol: number,
  amountCol: number,
  p: Provenance,
): AdapterResult {
  const nodes: LedgerNode[] = [];
  const warnings: string[] = [];
  const stack: string[] = [];

  for (const row of rows) {
    const rawLabel = row[labelCol];
    if (typeof rawLabel !== 'string' || !rawLabel.trim()) continue;

    const name = rawLabel.trim();
    if (/^particulars$/i.test(name)) continue;

    const amount = toAmount(row[amountCol]);
    if (amount === null) continue;

    const depth = depthOf(rawLabel);
    stack.length = depth;
    // An indent that jumps more than one level leaves holes in the stack, so
    // drop them rather than carrying undefined into the path.
    const path = stack.filter((s): s is string => typeof s === 'string' && s.length > 0);
    stack[depth] = name;

    nodes.push({ name, depth, path, amount, isLeaf: true, provenance: p });
  }

  // Second pass: a node is a leaf unless the next node is deeper.
  for (let i = 0; i < nodes.length; i++) {
    const next = nodes[i + 1];
    nodes[i].isLeaf = !next || next.depth <= nodes[i].depth;
  }

  if (nodes.length === 0) warnings.push('No "Particulars / Amount" rows were recognised in this sheet.');
  return { nodes, warnings };
}

// ---- Tally P&L -------------------------------------------------------------

const tallyPnl: SourceAdapter = {
  kind: 'tallyPnl',
  label: 'Tally P&L A/c',
  sniff: (wb, fileName) => {
    const t = allText(wb);
    let score = 0;
    if (/p&l|profit/i.test(t)) score += 0.6;
    if (/expense detail|revenue detail/i.test(t)) score += 0.3;
    if (/pnl|p&l|profit/i.test(fileName)) score += 0.2;
    return Math.min(score, 1);
  },
  parse: ({ workbook, sourceId, file }) => {
    const p = prov(sourceId, file.name);
    const nodes: LedgerNode[] = [];
    const warnings: string[] = [];

    // Detail sheets carry the full tree and win. The summary P&L sheet is read
    // second, purely to pick up ledgers the detail sheets never list — opening
    // and closing stock, and indirect incomes — with anything already seen
    // dropped so the two sheets cannot double count.
    const detail = workbook.SheetNames.filter((n) => /detail/i.test(n));
    const summary = workbook.SheetNames.filter((n) => !/detail|ratio|note/i.test(n));
    const ordered = detail.length > 0 ? [...detail, ...summary] : workbook.SheetNames.slice(0, 1);

    const seen = new Set<string>();
    for (const sheetName of ordered) {
      const rows = sheetRows(workbook, sheetName);
      if (rows.length === 0) continue;
      const { labelCol, amountCol } = findColumns(rows);
      if (labelCol < 0) {
        warnings.push(`Sheet "${sheetName}": could not find a label column.`);
        continue;
      }
      const res = parseIndentedSheet(rows, labelCol, amountCol, { ...p, note: `sheet: ${sheetName}` });
      for (const node of res.nodes) {
        const id = normaliseLedger(node.name);
        if (seen.has(id)) continue;
        seen.add(id);
        nodes.push(node);
      }
      warnings.push(...res.warnings.map((w) => `Sheet "${sheetName}": ${w}`));
    }

    if (!nodes.some((n) => /opening stock/i.test(n.name))) {
      warnings.push('No opening/closing stock found — stock movement will be zero until you enter it.');
    }
    return { nodes, warnings };
  },
};

const tallyGroupSummary: SourceAdapter = {
  kind: 'tallyGroupSummary',
  label: 'Tally group summary',
  sniff: (wb, fileName) => {
    const t = `${allText(wb)} ${fileName.toLowerCase()}`;
    return /group summary|ledger summary|trial/i.test(t) ? 0.8 : 0.1;
  },
  parse: ({ workbook, sourceId, file }) => {
    const p = prov(sourceId, file.name);
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    const { labelCol, amountCol } = findColumns(rows);
    if (labelCol < 0) return { nodes: [], warnings: ['Could not find a label column.'] };
    return parseIndentedSheet(rows, labelCol, amountCol, p);
  },
};

// ---- Flat two-column platform exports --------------------------------------

/**
 * Channel revenue, ad spend and SKU P&L all arrive as flat tables: a name
 * column and one or more numeric columns. One parser serves all three; they
 * differ only in which column they total and what they are called.
 */
function flatTableAdapter(
  kind: SourceKind,
  label: string,
  sniffWords: RegExp,
  amountHeader: RegExp,
): SourceAdapter {
  return {
    kind,
    label,
    sniff: (wb, fileName) => {
      const t = `${allText(wb)} ${fileName.toLowerCase()}`;
      const head = headerText(wb);
      return sniffWords.test(t) || sniffWords.test(head) ? 0.7 : 0.1;
    },
    parse: ({ workbook, sourceId, file }) => {
      const p = prov(sourceId, file.name);
      const rows = sheetRows(workbook, workbook.SheetNames[0]);
      if (rows.length === 0) return { nodes: [], warnings: ['Sheet is empty.'] };

      const headerIdx = rows.findIndex((r) => r.some((c) => typeof c === 'string' && c.trim()));
      const header = (rows[headerIdx] ?? []).map((c) => String(c ?? '').toLowerCase());

      const labelCol = header.findIndex((h) => /name|item|sku|channel|campaign|product|particular/.test(h));
      let amountCol = header.findIndex((h) => amountHeader.test(h));
      if (amountCol < 0) amountCol = header.findIndex((h, i) => i !== labelCol && /amount|value|total|spend|sales|revenue|cost/.test(h));

      const warnings: string[] = [];
      if (labelCol < 0 || amountCol < 0) {
        return {
          nodes: [],
          warnings: [`Could not identify name and amount columns. Header read as: ${header.filter(Boolean).join(' | ') || '(blank)'}`],
        };
      }

      const nodes: LedgerNode[] = [];
      for (const row of rows.slice(headerIdx + 1)) {
        const name = String(row[labelCol] ?? '').trim();
        if (!name) continue;
        const amount = toAmount(row[amountCol]);
        if (amount === null) continue;
        nodes.push({ name, depth: 0, path: [], amount, isLeaf: true, provenance: p });
      }

      if (nodes.length === 0) warnings.push('No rows with both a name and an amount.');
      return { nodes, warnings };
    },
  };
}

function headerText(wb: XLSX.WorkBook): string {
  const rows = sheetRows(wb, wb.SheetNames[0]).slice(0, 6);
  return rows.flat().map((c) => String(c ?? '')).join(' ').toLowerCase();
}

function findColumns(rows: unknown[][]): { labelCol: number; amountCol: number } {
  // The label column is the first that holds mostly strings; the amount column
  // the first to its right that holds mostly numbers.
  const width = Math.max(...rows.map((r) => r.length), 0);
  const stringiness: number[] = [];
  const numeriness: number[] = [];

  for (let c = 0; c < width; c++) {
    let s = 0;
    let n = 0;
    for (const row of rows) {
      const v = row[c];
      if (typeof v === 'string' && v.trim()) s++;
      if (toAmount(v) !== null) n++;
    }
    stringiness[c] = s;
    numeriness[c] = n;
  }

  const labelCol = stringiness.findIndex((s) => s >= Math.max(3, rows.length * 0.2));
  if (labelCol < 0) return { labelCol: -1, amountCol: -1 };

  let amountCol = -1;
  let best = 0;
  for (let c = labelCol + 1; c < width; c++) {
    if (numeriness[c] > best) {
      best = numeriness[c];
      amountCol = c;
    }
  }
  return { labelCol, amountCol: amountCol < 0 ? labelCol + 1 : amountCol };
}

/** Tally and generic table adapters. Platform ones live in platformAdapters.ts. */
export const BASE_ADAPTERS: SourceAdapter[] = [
  tallyPnl,
  tallyGroupSummary,
  flatTableAdapter('channelRevenue', 'Channel revenue (generic)', /channel|net sales|marketplace/, /net\s*sales|revenue/),
  flatTableAdapter('adSpend', 'Ad spend', /ad\s*spend|campaign|meta|google ads|amount spent/, /spend|cost|amount/),
  flatTableAdapter('skuPnl', 'SKU P&L (generic)', /sku|asin|style|variant/, /revenue|net\s*sales|amount/),
];
