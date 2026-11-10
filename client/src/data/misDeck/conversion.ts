// Conversion cost inside a Tally month's COGM (10 Nov 2026, audit round 2 finding A1).
//
// Tally's COGM = raw-material purchases + stock movement + Direct Expenses. The BOM cost per unit is MATERIAL only,
// so the normalised basis must carry every Direct Expense ledger (factory overheads, manufacturing costs = job work /
// wages, inward freight, any other direct ledger the close maps into COGM) next to the BOM cost of the units sold.
// What is then left between Tally's COGM and the normalised COGM is only material: purchases + stock movement − BOM
// material of the units sold = the "Stock build / drawdown (purchase timing)" memo line. Pure; tests in
// server/test/normalisedCogm.test.ts.

const r2 = (n: number) => Math.round(n * 100) / 100;

const RM_LABEL = 'Raw Material Purchases';
const FACTORY_LABEL = 'Factory Overheads';
const STOCK_PREFIX = 'Stock movement';
const TOTAL_LABEL = 'TOTAL COGM';

export interface ConversionCost {
  /** Factory overhead used for the month (Tally's ledger, else the labelled 10 % fallback). */
  factory: number;
  /** Every other Direct Expense ledger inside COGM (manufacturing costs, inward freight …), signed as cost. */
  other: number;
  /** factory + other = the conversion cost in the normalised COGM. */
  total: number;
}

/**
 * Split a close's `cogmLines` (label → −amount, as computeClose emits them) into material and conversion.
 * `factoryAmount` is the month's factory overhead as the deck already uses it (the ledger, else the 10 % fallback).
 */
export function conversionCost(cogmLines: Record<string, number>, factoryAmount: number): ConversionCost {
  let other = 0;
  for (const [label, v] of Object.entries(cogmLines)) {
    if (label === RM_LABEL || label === FACTORY_LABEL || label === TOTAL_LABEL || label.startsWith(STOCK_PREFIX)) continue;
    other += -v;
  }
  other = r2(other);
  return { factory: r2(factoryAmount), other, total: r2(factoryAmount + other) };
}

/**
 * Tally prints closing stock = opening stock until the month's stock is valued. With purchases booked and no stock
 * movement, the month's Tally COGM (and so the memo line) is not final.
 */
export function stockUnposted(cogmLines: Record<string, number>): boolean {
  const key = Object.keys(cogmLines).find((k) => k.startsWith(STOCK_PREFIX));
  if (!key) return false;
  return Math.abs(cogmLines[key]) < 0.005 && Math.abs(cogmLines[RM_LABEL] ?? 0) > 0;
}
