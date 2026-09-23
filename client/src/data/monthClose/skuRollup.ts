// ----------------------------------------------------------------------------
// SKU rollup.
//
// Platform rows in, per-product-per-channel aggregates out, via skuMap, priced
// from the Tranzact BOM export.
//
// Four things block here, and they are all the same failure the ledger map
// guards against: each one leaves the month totalling correctly while the
// product-level answer is wrong, so nothing downstream would ever catch it.
//
//   unmapped SKU        the platform key is not in the map
//   unconfirmed product the key resolves, but the mapping is inferred from a
//                       naming convention and has not been checked
//   uncosted product    no BOM prices it, so its margin would read as 100%
//   unset cost basis    the product exists in both generations of the Tranzact
//                       item master at costs up to 44% apart
// ----------------------------------------------------------------------------

import type { SalesChannel } from '../misDeck/misDeckData';
import type { BomCost, CostBasis, MonthCloseSession, SkuPlatform, SkuRow, UploadedSource } from './schema';
import { hcoreTwin, lookupSku, type Platform, type SkuEntry } from './skuMap';

/** Which deck channel a platform's rows belong to. */
const CHANNEL_BY_PLATFORM: Record<SkuPlatform, SalesChannel> = {
  amazon: 'Amazon',
  shopify: 'D2C',
  blinkit: 'Blinkit',
  // Shiprocket carries no SKU at all — its freight is a channel cost that
  // cannot be pushed down to products, so it never produces rows here.
  shiprocket: 'D2C',
  offline: 'Offline',
  oem: 'OEM',
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The deck name for lines it excludes from product margin. */
const ACCESSORY = 'Accessory (excl)';

// ---- Cost book -------------------------------------------------------------

export interface CostBook {
  /** FG id → every BOM that prices it. */
  byFg: Record<string, BomCost[]>;
  /** FG ids priced by more than one BOM, where the pick matters. */
  ambiguous: string[];
  count: number;
}

export const EMPTY_COST_BOOK: CostBook = { byFg: {}, ambiguous: [], count: 0 };

export function buildCostBook(sources: UploadedSource[]): CostBook {
  const byFg: Record<string, BomCost[]> = {};
  for (const source of sources) {
    for (const bom of source.bomCosts ?? []) {
      byFg[bom.fgId] = [...(byFg[bom.fgId] ?? []), bom];
    }
  }

  const ambiguous: string[] = [];
  for (const [fgId, list] of Object.entries(byFg)) {
    // Ordered by BOM number, so the item's original BOM wins. Ordering by cost
    // instead would have priced Amazon's hCore X-L Lite off FG-BOM00063
    // "Medikart-XL", an OEM variant that happens to be ₹9.55 cheaper.
    list.sort((a, b) => a.bomNumber.localeCompare(b.bomNumber));
    if (new Set(list.map((b) => b.costPerUnit)).size > 1) ambiguous.push(fgId);
  }

  return { byFg, ambiguous, count: Object.keys(byFg).length };
}

/**
 * The standard cost for a finished good.
 *
 * Where an FG has several BOMs — an OEM variant of the same item, say — the
 * lowest-numbered one is used, on the grounds that it is the item's original
 * BOM, and the FG is listed in `ambiguous` so the choice is visible rather than
 * arbitrary-looking.
 */
export function costFor(book: CostBook, fgId: string): BomCost | null {
  return book.byFg[fgId]?.[0] ?? null;
}

// ---- Aggregation -----------------------------------------------------------

export interface SkuAggregate {
  fgId: string;
  /** The FG the map holds, before the cost basis shifted it. */
  baseFgId: string;
  /** The name SKU_CELLS uses. */
  deckName: string;
  channel: SalesChannel;
  revenue: number;
  units: number;
  fees: number;
  /** Null when no BOM prices this product. */
  costPerUnit: number | null;
  cogs: number | null;
  /** revenue − cogs − fees. Null while uncosted. */
  contribution: number | null;
  /** The BOM the cost came from, for the audit trail. */
  bomNumber?: string;
  /** False when any contributing mapping is inferred rather than checked. */
  confirmed: boolean;
  /** True when any contributing row matched on a product title, not a SKU. */
  byTitle: boolean;
  /** True when this product exists in both generations of the item master. */
  basisFork: boolean;
  contributors: SkuRow[];
}

export interface SkuResult {
  aggregates: SkuAggregate[];
  /** Platform keys with no mapping. These block the close. */
  unmapped: SkuRow[];
  /** Aggregates resting on an inferred product mapping. These block too. */
  unconfirmed: SkuAggregate[];
  /** Aggregates no BOM prices. These block too. */
  uncosted: SkuAggregate[];
  /** Aggregates whose product has both a legacy and an hCore-era FG. */
  basisForked: SkuAggregate[];
  totalRevenue: number;
  totalUnits: number;
  totalFees: number;
  totalCogs: number | null;
  /** Revenue that a BOM could price. */
  costedRevenue: number;
  /** True when any platform source was supplied at all. */
  hasSkuSources: boolean;
  costBook: CostBook;
}

export function computeSku(session: MonthCloseSession, entries?: SkuEntry[]): SkuResult {
  const rows = session.sources.flatMap((s) => s.skuRows ?? []);
  const overrides = session.skuOverrides ?? {};
  const basis = session.costBasis ?? null;
  const costBook = buildCostBook(session.sources);

  const byKey = new Map<string, SkuAggregate>();
  const unmapped: SkuRow[] = [];

  for (const row of rows) {
    const hit = lookupSku(row.platform as Platform, row.key, overrides, entries, basis);
    if (!hit) {
      unmapped.push(row);
      continue;
    }

    const channel = CHANNEL_BY_PLATFORM[row.platform] ?? 'D2C';
    const id = `${hit.fgId}|${channel}`;
    const existing = byKey.get(id);

    if (existing) {
      existing.revenue = r2(existing.revenue + row.revenue);
      existing.units = r2(existing.units + row.units);
      existing.fees = r2(existing.fees + row.fees);
      existing.confirmed = existing.confirmed && hit.confirmed;
      existing.byTitle = existing.byTitle || hit.byTitle;
      existing.contributors.push(row);
    } else {
      byKey.set(id, {
        fgId: hit.fgId,
        baseFgId: hit.baseFgId,
        deckName: hit.product.deckName,
        channel,
        revenue: r2(row.revenue),
        units: r2(row.units),
        fees: r2(row.fees),
        costPerUnit: null,
        cogs: null,
        contribution: null,
        confirmed: hit.confirmed,
        byTitle: hit.byTitle,
        // The fork is a property of the product, not of the basis currently
        // chosen: what matters is that there are two costs to choose between.
        basisFork: Boolean(hcoreTwin(hit.baseFgId)),
        contributors: [row],
      });
    }
  }

  // Price every aggregate once its units are final.
  for (const a of byKey.values()) {
    const cost = costFor(costBook, a.fgId);
    if (!cost) {
      // Accessories are excluded from product margin by convention — every
      // "Accessory (excl)" cell in the committed 767 carries cogs 0 — so a
      // missing BOM for one is not the gap it is for a heating pad.
      if (a.deckName === ACCESSORY) {
        a.cogs = 0;
        a.contribution = r2(a.revenue - a.fees);
      }
      continue;
    }
    a.costPerUnit = cost.costPerUnit;
    a.bomNumber = cost.bomNumber;
    a.cogs = r2(cost.costPerUnit * a.units);
    a.contribution = r2(a.revenue - a.cogs - a.fees);
  }

  const aggregates = [...byKey.values()].sort(
    (a, b) => a.channel.localeCompare(b.channel) || b.revenue - a.revenue,
  );

  const costed = aggregates.filter((a) => a.cogs !== null);
  const uncosted = aggregates.filter((a) => a.cogs === null);

  return {
    aggregates,
    unmapped,
    unconfirmed: aggregates.filter((a) => !a.confirmed),
    uncosted,
    basisForked: aggregates.filter((a) => a.basisFork),
    totalRevenue: r2(aggregates.reduce((s, a) => s + a.revenue, 0)),
    totalUnits: r2(aggregates.reduce((s, a) => s + a.units, 0)),
    totalFees: r2(aggregates.reduce((s, a) => s + a.fees, 0)),
    totalCogs: uncosted.length > 0 ? null : r2(costed.reduce((s, a) => s + (a.cogs ?? 0), 0)),
    costedRevenue: r2(costed.reduce((s, a) => s + a.revenue, 0)),
    hasSkuSources: rows.length > 0,
    costBook,
  };
}

/**
 * What the cost basis is worth this month.
 *
 * Runs the priced aggregates through both generations of the item master so
 * the choice is a number rather than an argument — July's Amazon rows differ
 * by ₹1.43 L of CM1 between the two.
 */
export function costBasisImpact(
  result: SkuResult,
): { legacy: number; hcore: number; difference: number; forkedRevenue: number } | null {
  const { costBook } = result;
  if (costBook.count === 0) return null;

  let legacy = 0;
  let hcore = 0;
  let forkedRevenue = 0;

  for (const a of result.aggregates) {
    const twin = hcoreTwin(a.baseFgId);
    const own = costFor(costBook, a.baseFgId);
    const other = twin ? costFor(costBook, twin) : null;
    if (!own) continue;

    legacy += own.costPerUnit * a.units;
    hcore += (other ?? own).costPerUnit * a.units;
    if (other && other.costPerUnit !== own.costPerUnit) forkedRevenue += a.revenue;
  }

  return {
    legacy: r2(legacy),
    hcore: r2(hcore),
    difference: r2(hcore - legacy),
    forkedRevenue: r2(forkedRevenue),
  };
}

/** Distinct platform keys that need assigning, deduped and with their totals. */
export function unmappedSummary(
  unmapped: SkuRow[],
): { platform: SkuPlatform; key: string; keyKind: 'sku' | 'title'; name?: string; revenue: number; rows: number }[] {
  const byKey = new Map<
    string,
    { platform: SkuPlatform; key: string; keyKind: 'sku' | 'title'; name?: string; revenue: number; rows: number }
  >();

  for (const row of unmapped) {
    const id = `${row.platform}:${row.key}`;
    const existing = byKey.get(id);
    if (existing) {
      existing.revenue = r2(existing.revenue + row.revenue);
      existing.rows += 1;
      existing.name = existing.name ?? row.name;
    } else {
      byKey.set(id, {
        platform: row.platform,
        key: row.key,
        keyKind: row.keyKind ?? 'sku',
        name: row.name,
        revenue: r2(row.revenue),
        rows: 1,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Re-exported so callers do not need to know where CostBasis lives. */
export type { CostBasis };
