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
  period?: string;   // Inventory-Ledger period (e.g. "07/2026"), when detected
}

// Matches Tranzact Physical Stock Reconciliation template
export interface OutputRow {
  itemId: string;
  itemName: string;
  uom: string;
  physicalStock: number;
  difference: string; // left empty — Tranzact calculates this
  price: number;
  comment: string;
}

interface FgStock {
  qty: number;
  skus: string[];
}

/** Strip surrounding quotes/whitespace from a TSV cell. */
function clean(v: string): string {
  return (v ?? '').trim().replace(/^"(.*)"$/s, '$1').trim();
}

/**
 * Extract the base seller-SKU code (e.g. "VW-H1GL-KTOZ") from a raw MSKU that may
 * carry a descriptive suffix, e.g. "VW-H1GL-KTOZ- hcore Knee" → "VW-H1GL-KTOZ".
 * Falls back to the trimmed value when it doesn't match the code pattern.
 */
function extractSkuCode(raw: string): string {
  const m = clean(raw).match(/^[A-Za-z0-9]{2}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}/);
  return m ? m[0] : clean(raw);
}

interface ParsedReport {
  rows: { sku: string; qty: number }[];
  totalUnsellable: number;
  skippedFbm: number;
  period?: string;   // e.g. "07/2026" from the Inventory Ledger
}

// STEP 1: Parse Amazon FBA Report (TSV text content).
// Auto-detects two Seller Central formats:
//   (a) Manage Inventory snapshot — columns seller-sku / warehouse-condition-code / quantity available
//   (b) Inventory Ledger (monthly) — columns MSKU / Disposition / Ending Warehouse Balance
// Both reduce to: SELLABLE on-hand quantity per seller-SKU.
function parseAmazonReport(tsvContent: string): ParsedReport {
  const lines = tsvContent.replace(/\r/g, '').trim().split('\n');
  if (lines.length < 2) {
    throw new Error('Amazon report appears empty or has no data rows');
  }

  const headers = lines[0].split('\t').map(h => clean(h).toLowerCase());
  const find = (...names: string[]) => headers.findIndex(h => names.includes(h));

  // Snapshot format
  const snapSku = find('seller-sku', 'sku');
  const snapCond = find('warehouse-condition-code');
  const snapQty = find('quantity available', 'quantity-available');
  // Ledger format
  const ledSku = find('msku', 'merchant sku', 'merchant-sku');
  const ledCond = find('disposition');
  const ledQty = find('ending warehouse balance');
  const dateIdx = find('date');

  let skuIdx: number, condIdx: number, qtyIdx: number, ledger: boolean;
  if (snapSku !== -1 && snapCond !== -1 && snapQty !== -1) {
    skuIdx = snapSku; condIdx = snapCond; qtyIdx = snapQty; ledger = false;
  } else if (ledSku !== -1 && ledCond !== -1 && ledQty !== -1) {
    skuIdx = ledSku; condIdx = ledCond; qtyIdx = ledQty; ledger = true;
  } else {
    throw new Error(
      'Unrecognised Amazon report. Expected either a Manage Inventory snapshot ' +
      '(seller-sku / Warehouse-Condition-code / Quantity Available) or an Inventory ' +
      'Ledger (MSKU / Disposition / Ending Warehouse Balance).',
    );
  }

  const rows: { sku: string; qty: number }[] = [];
  let totalUnsellable = 0;
  let skippedFbm = 0;
  let period: string | undefined;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length <= Math.max(skuIdx, condIdx, qtyIdx)) continue;

    const rawSku = clean(cols[skuIdx]);
    if (!rawSku) continue;
    const sku = ledger ? extractSkuCode(rawSku) : rawSku;
    const condition = clean(cols[condIdx]).toUpperCase();
    const qty = parseInt(clean(cols[qtyIdx]), 10) || 0;
    if (ledger && dateIdx !== -1 && !period) period = clean(cols[dateIdx]) || undefined;

    if (sku.endsWith('-FBM')) {
      skippedFbm++;
      continue;
    }

    // SELLABLE is the only on-hand, sellable disposition in both formats.
    if (condition !== 'SELLABLE') {
      totalUnsellable += qty;
      continue;
    }

    rows.push({ sku, qty });
  }

  return { rows, totalUnsellable, skippedFbm, period };
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
  master: Record<string, FgMasterEntry>,
  period?: string
): { outputRows: OutputRow[]; missingFgItems: string[] } {
  const outputRows: OutputRow[] = [];
  const missingFgItems: string[] = [];
  const today = new Date().toISOString().split('T')[0];
  const asOf = period ? `Ledger: ${period}` : `Date: ${today}`;

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
      price: masterItem.defaultPrice,
      comment: `Amazon FBA Stock | SKU(s): ${[...new Set(stock.skus)].join(', ')} | ${asOf}`,
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
  const { rows: amazonRows, totalUnsellable, skippedFbm, period } = parseAmazonReport(amazonTsvContent);

  const skuMap = customSkuMap || skuToFgMapping;

  const { fgStock, unmatchedSkus } = matchAndConsolidate(amazonRows, skuMap);

  const { outputRows, missingFgItems } = buildOutputRows(fgStock, fgMaster, period);

  const totalUnitsMapped = outputRows.reduce((sum, r) => sum + r.physicalStock, 0);

  return {
    outputRows,
    totalFgItems: outputRows.length,
    totalUnitsMapped,
    unmatchedSkus: [...new Set(unmatchedSkus)],
    missingFgItems,
    totalUnsellable,
    skippedFbm,
    period,
  };
}
