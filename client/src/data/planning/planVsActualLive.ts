// Plan vs Actual — the deck side: the Live MIS months as ActualMonth rows (what the Live MIS page shows on its
// Normalised basis, so the plan is compared with the same numbers the P&L tab reads).

import type { LiveDeckData } from '../misDeck/liveDeck';
import { isReal, normaliseLiveMonths } from '../misDeck/liveViews';
import type { ActualMonth } from './planVsActual';

/**
 * Plan units for Amazon are ORDERED units (the sheet's "Units : Last Year" follows the Sales API); the deck's Amazon cells are
 * SETTLED units, net of refunds. Measured over Oct 2025 – Jun 2026 (audit round 10, B1c): plan last-year Amazon 12,254 vs settled
 * cells 10,171 = ×1.205. Actual Amazon units are put on the plan's basis with it, so a refund gap never reads as "behind".
 */
export const AMAZON_ORDERED_PER_SETTLED = 1.205;
export const UNITS_BASIS_NOTE = `Units: Amazon settled units × ${AMAZON_ORDERED_PER_SETTLED} to match the plan's ordered units (estimate).`;

/** One ActualMonth per deck month from `fromKey` on. A figure the month's completeness cannot give is null, not 0. */
export function actualMonthsFromDeck(deck: Pick<LiveDeckData, 'months' | 'completeness' | 'skuCells'>, fromKey: string): ActualMonth[] {
  const norm = normaliseLiveMonths(deck.months, deck.completeness, deck);
  const skipped = new Set(norm.skipped);
  const units = new Map<string, number>();
  for (const c of deck.skuCells) if (c.p !== 'Accessory (excl)') units.set(c.m, (units.get(c.m) ?? 0) + c.u * (c.ch === 'Amazon' ? AMAZON_ORDERED_PER_SETTLED : 1));
  return norm.months.filter((m) => m.key >= fromKey).map((m) => {
    const level = deck.completeness[m.key]?.level ?? 'topline';
    const real = (row: string) => isReal(level, row);
    return {
      key: m.key,
      level,
      basis: skipped.has(m.key) ? 'booked' : 'normalised',
      netRevenue: real('net_revenue') ? m.netRevenue : null,
      grossMargin: real('gross_margin') ? m.grossMargin : null,
      cm3: real('cm3') ? m.cm3 : null,
      ebitda: real('ebitda') ? m.ebitda : null,
      units: units.has(m.key) ? Math.round(units.get(m.key) as number) : null,
    };
  });
}
