// Sales with no BOM cost inside the normalised COGM (10 Nov 2026, audit round 6 A6-1 / A6-9).
//
// Normalised COGM = Σ SkuCell COGS (BOM material) + conversion. Two kinds of sales carry NO material cost there:
//   • cells marked `noCost` (a mapped product with no BOM and no proxy): cogs 0 on the cell;
//   • sales no product map knows (`MonthlyMIS.unmappedRevenue`): no cell at all.
// Left at ₹0 they would show as 100 % margin. Instead they are costed at the month's own material rate (Σ cogs ÷ Σ rev of
// the BOM-costed cells), the amount is reported as an estimate, and a month where most sales have no cost stays as booked.
// Pure; tests in server/test/normalisedCogm.test.ts.

import type { SkuCell } from './skuChannelPnl';
import { NO_PRODUCT_LABEL } from './skuLayer';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Above this share of the month's product sales with no cost, the month is not normalised (kept as booked). */
export const UNCOSTED_SKIP_SHARE = 0.5;

export interface UncostedEstimate {
  /** Sales with no BOM cost: `noCost` cells + unmapped sales. */
  revenue: number;
  /** Of which unmapped (no product). */
  unmappedRevenue: number;
  /** Material rate used = Σ cogs ÷ Σ rev of the BOM-costed cells (null when none). */
  rate: number | null;
  /** Estimated material for `revenue` at `rate` (0 when no revenue; null when no rate). */
  estCost: number | null;
  /** revenue ÷ (costed cell revenue + revenue). */
  share: number;
}

export function uncostedEstimate(cells: SkuCell[], unmappedRevenue = 0): UncostedEstimate {
  let costedRev = 0, costedCogs = 0, noCostRev = 0;
  for (const c of cells) {
    if (c.p === 'Accessory (excl)' || c.p === NO_PRODUCT_LABEL) continue; // unmapped sales come in once, as `unmappedRevenue`
    if (c.noCost) noCostRev += c.rev;
    else { costedRev += c.rev; costedCogs += c.cogs; }
  }
  const um = Math.max(0, unmappedRevenue);
  const revenue = r2(noCostRev + um);
  const rate = costedRev > 0 ? costedCogs / costedRev : null;
  const estCost = revenue === 0 ? 0 : rate === null ? null : r2(rate * revenue);
  const base = costedRev + revenue;
  return { revenue, unmappedRevenue: r2(um), rate, estCost, share: base > 0 ? revenue / base : 0 };
}
