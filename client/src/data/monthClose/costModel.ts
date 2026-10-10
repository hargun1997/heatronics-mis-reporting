// ----------------------------------------------------------------------------
// Two-layer product cost: COG, then COGM.
//
// WHY THIS FILE EXISTS
// --------------------
// The SKU table used to price a unit at its bill-of-materials cost and call the
// result gross margin. Tally prices the same month at raw material consumed
// PLUS factory overheads, job work, wages and the movement in stock. The two
// never met, and the deck showed both:
//
//   Jul-2026   Tally GM 42.1%   SKU-table GM 58.8%   gap ₹7.93 L
//   Apr-2026   Tally GM 19.0%   SKU-table GM 71.2%   gap ₹22.28 L
//
// The July gap is almost exactly Factory Overheads (₹3.96 L) plus stock
// movement (₹4.45 L). It was never a costing mystery — the SKU layer simply
// left out the half of manufacturing cost that is not material.
//
// So a unit now has two costs, and they are different questions:
//
//   COG    raw material only, straight off the monthly BOM export. Stable,
//          comparable across months, and the right basis for "should we keep
//          selling this product".
//   COGM   COG plus that month's conversion cost — rent, labour and direct
//          manufacturing — pushed across the units that absorbed it. Moves with
//          utilisation, and the right basis for "did the company make money".
//
// WHAT THIS IS NOT
// ----------------
// This is not true absorption costing. Real absorption capitalises conversion
// cost into finished goods at production and releases it at sale, which needs
// work-order quantities this system does not have — only sales reach it. So
// conversion cost is treated as a period cost spread over units SOLD. The
// difference between that and what Tally booked is real, and it is reported as
// a named reconciliation line rather than buried: see `reconcileToBooks`.
// Pretending the gap is zero is how the old table ended up 52 points out.
// ----------------------------------------------------------------------------

import type { ConversionCost } from './schema';

export type { ConversionCost };

export const conversionTotal = (c: ConversionCost): number =>
  r2(c.rent + c.labour + c.directManufacturing + c.other);

/**
 * How conversion cost is spread across units.
 *
 * `cogValue` is the default because material content is the only proxy for
 * production effort this data carries: a bed-sized pad with three times the
 * material genuinely occupies the floor longer than a neck pad. `unit` is the
 * honest alternative when that assumption does not hold — it says every unit
 * took the same effort, which is at least a claim you can check.
 */
export type AllocationBasis = 'cogValue' | 'unit';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface CostedUnit {
  fgId: string;
  /** Raw material per unit, from the BOM. */
  cog: number;
  /** Conversion cost allocated to one unit of this product. */
  conversionPerUnit: number;
  /** cog + conversionPerUnit. */
  cogm: number;
}

export interface UnitCostModel {
  byFg: Record<string, CostedUnit>;
  basis: AllocationBasis;
  /** Conversion cost actually spread, in rupees. */
  conversionAllocated: number;
  /** Units it was spread over. */
  unitsAbsorbing: number;
  warnings: string[];
}

export interface AllocationInput {
  /** Raw COG per unit by finished good — from the BOM cost book. */
  cogByFg: Record<string, number>;
  /** Units sold in the month by finished good. */
  unitsByFg: Record<string, number>;
  conversion: ConversionCost | null;
  basis?: AllocationBasis;
}

/**
 * Spread the month's conversion cost over the units that sold.
 *
 * A product with no BOM is left out of the allocation entirely rather than
 * absorbing at zero: a missing cost is a gap to fix, and letting it quietly
 * take a share of rent would make every other product look cheaper than it is.
 */
export function buildUnitCostModel(input: AllocationInput): UnitCostModel {
  const { cogByFg, unitsByFg, conversion } = input;
  const basis = input.basis ?? 'cogValue';
  const warnings: string[] = [];

  // Only products that have BOTH a cost and units sold can absorb.
  const absorbing = Object.keys(unitsByFg).filter(
    (fg) => (unitsByFg[fg] ?? 0) > 0 && typeof cogByFg[fg] === 'number',
  );

  const uncosted = Object.keys(unitsByFg).filter(
    (fg) => (unitsByFg[fg] ?? 0) > 0 && typeof cogByFg[fg] !== 'number',
  );
  if (uncosted.length > 0) {
    warnings.push(
      `${uncosted.length} product(s) sold with no BOM cost (${uncosted.slice(0, 5).join(', ')}` +
        `${uncosted.length > 5 ? ', …' : ''}). They are excluded from the overhead spread, so the ` +
        'products that did absorb carry a slightly higher share than they would once those are priced.',
    );
  }

  const unitsAbsorbing = absorbing.reduce((s, fg) => s + (unitsByFg[fg] ?? 0), 0);
  const total = conversion ? conversionTotal(conversion) : 0;

  if (!conversion) {
    warnings.push(
      'No conversion cost supplied, so COGM equals raw COG. Gross margin read off this will be ' +
        'too high by whatever rent, labour and direct manufacturing came to — in Jul-2026 that was ₹3.96 L.',
    );
  }

  // The weight each product carries into the spread.
  const weightOf = (fg: string): number => {
    const u = unitsByFg[fg] ?? 0;
    return basis === 'unit' ? u : u * (cogByFg[fg] ?? 0);
  };
  const weightTotal = absorbing.reduce((s, fg) => s + weightOf(fg), 0);

  if (total > 0 && weightTotal === 0) {
    warnings.push(
      `₹${total.toFixed(0)} of conversion cost could not be allocated: nothing sold with a known cost. ` +
        'COGM falls back to raw COG.',
    );
  }

  const byFg: Record<string, CostedUnit> = {};

  // Every FG with a cost gets an entry, so a lookup never silently misses —
  // even one that did not sell this month and therefore absorbs nothing.
  for (const fg of Object.keys(cogByFg)) {
    const cog = cogByFg[fg];
    const units = unitsByFg[fg] ?? 0;
    const share = weightTotal > 0 && units > 0 ? (weightOf(fg) / weightTotal) * total : 0;
    const conversionPerUnit = units > 0 ? r2(share / units) : 0;
    byFg[fg] = { fgId: fg, cog: r2(cog), conversionPerUnit, cogm: r2(cog + conversionPerUnit) };
  }

  return {
    byFg,
    basis,
    conversionAllocated: weightTotal > 0 ? total : 0,
    unitsAbsorbing,
    warnings,
  };
}

// ---- Reconciliation to the books -------------------------------------------

export interface BooksReconciliation {
  /** What the SKU layer says the month's product cost was. */
  skuCogm: number;
  /** What Tally booked as COGM. */
  booksCogm: number;
  /** booksCogm − skuCogm. Positive means the books cost more than the units explain. */
  gap: number;
  gapPct: number;
  /** Named causes, largest first, so the gap is attributed rather than asserted. */
  causes: { label: string; amount: number; note: string }[];
  /** True once the gap is inside what stock movement alone can explain. */
  explained: boolean;
}

/**
 * Hold the SKU layer's product cost against Tally's and name the difference.
 *
 * The gap is expected, not an error: units sold in a month were not all made in
 * that month. What would be an error is not knowing its size. Anything the
 * caller can attribute — stock movement above all — comes in as a cause, and
 * whatever is left over is the part nobody can explain yet.
 */
export function reconcileToBooks(
  skuCogm: number,
  booksCogm: number,
  attributable: { label: string; amount: number; note: string }[] = [],
): BooksReconciliation {
  const gap = r2(booksCogm - skuCogm);
  const named = attributable.reduce((s, c) => s + c.amount, 0);
  const residual = r2(gap - named);

  const causes = [...attributable].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  if (Math.abs(residual) > 1) {
    causes.push({
      label: 'Unexplained',
      amount: residual,
      note:
        'Not attributed to any named cause. Usually production timing the unit layer cannot see, ' +
        'or a product selling at a cost the BOM no longer reflects.',
    });
  }

  return {
    skuCogm: r2(skuCogm),
    booksCogm: r2(booksCogm),
    gap,
    gapPct: booksCogm === 0 ? 0 : r2((gap / booksCogm) * 100),
    causes,
    explained: Math.abs(residual) <= 1,
  };
}
