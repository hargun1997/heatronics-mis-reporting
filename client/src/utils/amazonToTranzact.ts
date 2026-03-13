import * as XLSX from 'xlsx';
import { skuToFgMapping } from '../data/skuToFgMapping';

export interface FgMasterItem {
  itemId: string;
  itemName: string;
  unit: string;
  defaultPrice: number;
}

export interface TransformResult {
  outputRows: OutputRow[];
  totalFgItems: number;
  totalUnitsMapped: number;
  unmatchedSkus: string[];
  missingFgItems: string[];
  totalUnsellable: number;
  skippedFbm: number;
}

export interface OutputRow {
  itemId: string;
  itemName: string;
  unit: string;
  changeByQty: number;
  finalQty: string;
  price: number;
  adjustmentType: string;
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

    // Skip FBM SKUs
    if (sku.endsWith('-FBM')) {
      skippedFbm++;
      continue;
    }

    // Only SELLABLE
    if (condition !== 'SELLABLE') {
      totalUnsellable += qty;
      continue;
    }

    rows.push({ sku, qty });
  }

  return { rows, totalUnsellable, skippedFbm };
}

// STEP 2: Parse FG Master from Excel (ArrayBuffer)
function parseFgMaster(workbook: XLSX.WorkBook): Record<string, FgMasterItem> {
  const sheet = workbook.Sheets['Data'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('No "Data" sheet found in FG Master file');

  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const master: Record<string, FgMasterItem> = {};

  for (const row of data) {
    const itemId = String(row['Item ID'] || '').trim();
    if (!itemId) continue;

    master[itemId] = {
      itemId,
      itemName: String(row['Item Name'] || '').trim(),
      unit: String(row['Unit of Measurement'] || '').trim(),
      defaultPrice: parseFloat(String(row['Default Price'] || '0')) || 0,
    };
  }

  return master;
}

// STEP 4: Match & Consolidate
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

// STEP 5: Build output rows
function buildOutputRows(
  fgStock: Record<string, FgStock>,
  fgMaster: Record<string, FgMasterItem>
): { outputRows: OutputRow[]; missingFgItems: string[] } {
  const outputRows: OutputRow[] = [];
  const missingFgItems: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const fgId of Object.keys(fgStock).sort()) {
    const masterItem = fgMaster[fgId];
    if (!masterItem) {
      missingFgItems.push(fgId);
      continue;
    }

    const stock = fgStock[fgId];
    outputRows.push({
      itemId: fgId,
      itemName: masterItem.itemName,
      unit: masterItem.unit,
      changeByQty: stock.qty,
      finalQty: '',
      price: masterItem.defaultPrice,
      adjustmentType: 'Other',
      comment: `Amazon FBA Stock | SKU(s): ${stock.skus.join(', ')} | Date: ${today}`,
    });
  }

  return { outputRows, missingFgItems };
}

// STEP 6: Generate Excel output
export function generateTranzactExcel(rows: OutputRow[]): Blob {
  const wsData = [
    ['Item ID', 'Item Name', 'Unit', 'Change By Qty', 'Final Qty', 'Price', 'Adjustment Type', 'Comment'],
    ...rows.map(r => [
      r.itemId,
      r.itemName,
      r.unit,
      r.changeByQty,
      r.finalQty,
      r.price,
      r.adjustmentType,
      r.comment,
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // Item ID
    { wch: 35 }, // Item Name
    { wch: 10 }, // Unit
    { wch: 14 }, // Change By Qty
    { wch: 10 }, // Final Qty
    { wch: 10 }, // Price
    { wch: 16 }, // Adjustment Type
    { wch: 60 }, // Comment
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'MySheet');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Main transform function
export function transformAmazonToTranzact(
  amazonTsvContent: string,
  fgMasterWorkbook: XLSX.WorkBook,
  customSkuMap?: Record<string, string>
): TransformResult {
  // Step 1
  const { rows: amazonRows, totalUnsellable, skippedFbm } = parseAmazonReport(amazonTsvContent);

  // Step 2
  const fgMaster = parseFgMaster(fgMasterWorkbook);

  // Step 3
  const skuMap = customSkuMap || skuToFgMapping;

  // Step 4
  const { fgStock, unmatchedSkus } = matchAndConsolidate(amazonRows, skuMap);

  // Step 5
  const { outputRows, missingFgItems } = buildOutputRows(fgStock, fgMaster);

  // Step 7: summary
  const totalUnitsMapped = outputRows.reduce((sum, r) => sum + r.changeByQty, 0);

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
