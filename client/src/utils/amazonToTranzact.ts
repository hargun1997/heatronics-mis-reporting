import * as XLSX from 'xlsx';
import { skuToFgMapping } from '../data/skuToFgMapping';
import { fgMaster, FgMasterEntry } from '../data/fgMaster';

export interface TransformResult {
  outputRows: OutputRow[];
  totalFgItems: number;
  totalUnitsMapped: number;
  unmatchedSkus: string[];
  missingFgItems: string[];
  totalUnsellable: number;
  skippedFbm: number;
}

// Matches Tranzact Physical Stock Reconciliation template
export interface OutputRow {
  itemId: string;
  itemName: string;
  uom: string;
  physicalStock: number;
  difference: string; // left empty — Tranzact calculates this
  price: number; // 0 — Tranzact fills from master
  comment: string;
}

interface FgStock {
  qty: number;
  skus: string[];
}

// STEP 1: Parse Amazon FBA Report (TSV text content)
function parseAmazonReport(tsvContent: string): {
  rows: { sku: string; qty: number }[];
  totalUnsellable: number;
  skippedFbm: number;
} {
  const lines = tsvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('Amazon report appears empty or has no data rows');
  }

  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  const skuIdx = headers.findIndex(h => h === 'seller-sku');
  const condIdx = headers.findIndex(h => h === 'warehouse-condition-code');
  const qtyIdx = headers.findIndex(h => h === 'quantity available');

  if (skuIdx === -1) throw new Error('Column "seller-sku" not found in Amazon report');
  if (condIdx === -1) throw new Error('Column "Warehouse-Condition-code" not found in Amazon report');
  if (qtyIdx === -1) throw new Error('Column "Quantity Available" not found in Amazon report');

  const rows: { sku: string; qty: number }[] = [];
  let totalUnsellable = 0;
  let skippedFbm = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length <= Math.max(skuIdx, condIdx, qtyIdx)) continue;

    const sku = cols[skuIdx].trim();
    const condition = cols[condIdx].trim().toUpperCase();
    const qty = parseInt(cols[qtyIdx].trim(), 10) || 0;

    if (sku.endsWith('-FBM')) {
      skippedFbm++;
      continue;
    }

    if (condition !== 'SELLABLE') {
      totalUnsellable += qty;
      continue;
    }

    rows.push({ sku, qty });
  }

  return { rows, totalUnsellable, skippedFbm };
}

// STEP 2: Match & Consolidate
function matchAndConsolidate(
  amazonRows: { sku: string; qty: number }[],
  skuMap: Record<string, string>
): { fgStock: Record<string, FgStock>; unmatchedSkus: string[] } {
  const fgStock: Record<string, FgStock> = {};
  const unmatchedSkus: string[] = [];

  for (const row of amazonRows) {
    const fgId = skuMap[row.sku];
    if (!fgId) {
      unmatchedSkus.push(row.sku);
      continue;
    }

    if (!fgStock[fgId]) {
      fgStock[fgId] = { qty: 0, skus: [] };
    }
    fgStock[fgId].qty += row.qty;
    fgStock[fgId].skus.push(row.sku);
  }

  return { fgStock, unmatchedSkus };
}

// STEP 3: Build output rows for Physical Stock Reconciliation
function buildOutputRows(
  fgStock: Record<string, FgStock>,
  master: Record<string, FgMasterEntry>
): { outputRows: OutputRow[]; missingFgItems: string[] } {
  const outputRows: OutputRow[] = [];
  const missingFgItems: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const fgId of Object.keys(fgStock).sort()) {
    const masterItem = master[fgId];
    if (!masterItem) {
      missingFgItems.push(fgId);
      continue;
    }

    const stock = fgStock[fgId];
    outputRows.push({
      itemId: fgId,
      itemName: masterItem.itemName,
      uom: masterItem.unit,
      physicalStock: stock.qty,
      difference: '',
      price: 0,
      comment: `Amazon FBA Stock | SKU(s): ${stock.skus.join(', ')} | Date: ${today}`,
    });
  }

  return { outputRows, missingFgItems };
}

// STEP 4: Generate Excel matching Tranzact Physical Stock Reconciliation template
export function generateTranzactExcel(rows: OutputRow[]): Blob {
  const wsData = [
    ['Item ID', 'Item Name', 'UOM', 'Physical Stock', 'Difference', 'Price', 'Comment'],
    ...rows.map(r => [
      r.itemId,
      r.itemName,
      r.uom,
      r.physicalStock,
      r.difference,
      r.price,
      r.comment,
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 12 },
    { wch: 35 },
    { wch: 8 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 60 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'MySheet');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Main transform — only needs the Amazon report
export function transformAmazonToTranzact(
  amazonTsvContent: string,
  customSkuMap?: Record<string, string>
): TransformResult {
  const { rows: amazonRows, totalUnsellable, skippedFbm } = parseAmazonReport(amazonTsvContent);

  const skuMap = customSkuMap || skuToFgMapping;

  const { fgStock, unmatchedSkus } = matchAndConsolidate(amazonRows, skuMap);

  const { outputRows, missingFgItems } = buildOutputRows(fgStock, fgMaster);

  const totalUnitsMapped = outputRows.reduce((sum, r) => sum + r.physicalStock, 0);

  return {
    outputRows,
    totalFgItems: outputRows.length,
    totalUnitsMapped,
    unmatchedSkus,
    missingFgItems,
    totalUnsellable,
    skippedFbm,
  };
}
