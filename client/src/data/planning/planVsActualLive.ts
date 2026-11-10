// Plan vs Actual — the deck side: the Live MIS months as ActualMonth rows (what the Live MIS page shows on its
// Normalised basis, so the plan is compared with the same numbers the P&L tab reads).

import type { LiveDeckData } from '../misDeck/liveDeck';
import { isReal, normaliseLiveMonths } from '../misDeck/liveViews';
import type { ActualMonth } from './planVsActual';
import { isCompleteMonth } from '../misDeck/misPeriods';

/**
 * Plan units for Amazon are ORDERED units (the sheet's "Units : Last Year" follows the Sales API); the deck's Amazon cells are
 * SETTLED units, net of refunds. Per month, the Business Report's units ordered ÷ the Amazon cells' settled units puts the actual on
 * the plan's basis (`amazonOrderedRatio`). Without a Business Report the measured fallback is used: Oct 2025 – Jun 2026 (audit round
 * 10, B1c) plan last-year Amazon 12,254 vs settled cells 10,171 = ×1.205 (labelled an estimate).
 */
export const AMAZON_ORDERED_PER_SETTLED = 1.205;
export const UNITS_BASIS_NOTE = `Units: Amazon settled units × the month's Business Report ordered ÷ settled ratio (else × ${AMAZON_ORDERED_PER_SETTLED}, estimate) to match the plan's ordered units.`;

/** Business Report units ordered ÷ settled Amazon cell units for a month; null when either is missing or the ratio is implausible. */
export function amazonOrderedRatio(cells: { m: string; ch: string; u: number }[], traffic: { units: number }[] | undefined, key: string): number | null {
  const ordered = (traffic ?? []).reduce((t, r) => t + (r.units || 0), 0);
  const settled = cells.reduce((t, c) => (c.m === key && c.ch === 'Amazon' ? t + c.u : t), 0);
  if (ordered <= 0 || settled <= 0) return null;
  const r = ordered / settled;
  return r >= 0.5 && r <= 3 ? r : null;
}

/** One ActualMonth per deck month from `fromKey` on. A figure the month's completeness cannot give is null, not 0. */
export function actualMonthsFromDeck(deck: Pick<LiveDeckData, 'months' | 'completeness' | 'skuCells'> & { traffic?: LiveDeckData['traffic'] }, fromKey: string): ActualMonth[] {
  const norm = normaliseLiveMonths(deck.months, deck.completeness, deck);
  const skipped = new Set(norm.skipped);
  const ratio = new Map<string, number>();
  const ratioOf = (k: string) => {
    if (!ratio.has(k)) ratio.set(k, amazonOrderedRatio(deck.skuCells, deck.traffic?.[k], k) ?? AMAZON_ORDERED_PER_SETTLED);
    return ratio.get(k) as number;
  };
  const units = new Map<string, number>();
  for (const c of deck.skuCells) if (c.p !== 'Accessory (excl)') units.set(c.m, (units.get(c.m) ?? 0) + c.u * (c.ch === 'Amazon' ? ratioOf(c.m) : 1));
  return norm.months.filter((m) => m.key >= fromKey).map((m) => {
    const comp = deck.completeness[m.key];
    const level = comp?.level ?? 'topline';
    const real = (row: string) => isReal(level, row);
    return {
      key: m.key,
      level,
      complete: isCompleteMonth(comp),
      basis: skipped.has(m.key) ? 'booked' : 'normalised',
      netRevenue: real('net_revenue') ? m.netRevenue : null,
      grossMargin: real('gross_margin') ? m.grossMargin : null,
      cm3: real('cm3') ? m.cm3 : null,
      ebitda: real('ebitda') ? m.ebitda : null,
      units: units.has(m.key) ? Math.round(units.get(m.key) as number) : null,
    };
  });
}
