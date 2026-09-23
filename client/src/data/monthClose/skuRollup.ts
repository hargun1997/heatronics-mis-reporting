// ----------------------------------------------------------------------------
// SKU rollup.
//
// Platform rows in, per-product-per-channel aggregates out, via skuMap.
//
// Two things block here, and both are the same failure the ledger map guards
// against: a wrong product mapping moves revenue between products while the
// month still totals correctly, so nothing downstream would ever catch it.
//
//   unmapped SKU        the platform key is not in the map
//   unconfirmed product the key resolves, but the FG → deck-name mapping is
//                       inferred from the Tranzact naming convention and has
//                       not been checked by a human
// ----------------------------------------------------------------------------

import type { SalesChannel } from '../misDeck/misDeckData';
import type { MonthCloseSession, SkuPlatform, SkuRow } from './schema';
import { lookupSku, type Platform, type SkuEntry } from './skuMap';

/** Which deck channel a platform's rows belong to. */
const CHANNEL_BY_PLATFORM: Record<SkuPlatform, SalesChannel> = {
  amazon: 'Amazon',
  shopify: 'D2C',
  blinkit: 'Blinkit',
  // Shiprocket carries no revenue — it is D2C fulfilment cost, so its fees
  // attach to the D2C rows for the same product.
  shiprocket: 'D2C',
  offline: 'Offline',
  oem: 'OEM',
};

export interface SkuAggregate {
  fgId: string;
  /** The name SKU_CELLS uses. */
  deckName: string;
  channel: SalesChannel;
  revenue: number;
  units: number;
  fees: number;
  /** False when any contributing mapping is inferred rather than checked. */
  confirmed: boolean;
  contributors: SkuRow[];
}

export interface SkuResult {
  aggregates: SkuAggregate[];
  /** Platform keys with no mapping. These block the close. */
  unmapped: SkuRow[];
  /** Aggregates resting on an inferred product mapping. These block too. */
  unconfirmed: SkuAggregate[];
  totalRevenue: number;
  totalUnits: number;
  totalFees: number;
  /** True when any platform source was supplied at all. */
  hasSkuSources: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeSku(session: MonthCloseSession, entries?: SkuEntry[]): SkuResult {
  const rows = session.sources.flatMap((s) => s.skuRows ?? []);
  const overrides = session.skuOverrides ?? {};

  const byKey = new Map<string, SkuAggregate>();
  const unmapped: SkuRow[] = [];

  for (const row of rows) {
    const hit = lookupSku(row.platform as Platform, row.key, overrides, entries);
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
      existing.contributors.push(row);
    } else {
      byKey.set(id, {
        fgId: hit.fgId,
        deckName: hit.product.deckName,
        channel,
        revenue: r2(row.revenue),
        units: r2(row.units),
        fees: r2(row.fees),
        confirmed: hit.confirmed,
        contributors: [row],
      });
    }
  }

  const aggregates = [...byKey.values()].sort(
    (a, b) => a.channel.localeCompare(b.channel) || b.revenue - a.revenue,
  );

  return {
    aggregates,
    unmapped,
    unconfirmed: aggregates.filter((a) => !a.confirmed),
    totalRevenue: r2(aggregates.reduce((s, a) => s + a.revenue, 0)),
    totalUnits: r2(aggregates.reduce((s, a) => s + a.units, 0)),
    totalFees: r2(aggregates.reduce((s, a) => s + a.fees, 0)),
    hasSkuSources: rows.length > 0,
  };
}

/** Distinct platform keys that need assigning, deduped and with their totals. */
export function unmappedSummary(
  unmapped: SkuRow[],
): { platform: SkuPlatform; key: string; name?: string; revenue: number; rows: number }[] {
  const byKey = new Map<string, { platform: SkuPlatform; key: string; name?: string; revenue: number; rows: number }>();

  for (const row of unmapped) {
    const id = `${row.platform}:${row.key}`;
    const existing = byKey.get(id);
    if (existing) {
      existing.revenue = r2(existing.revenue + row.revenue);
      existing.rows += 1;
      existing.name = existing.name ?? row.name;
    } else {
      byKey.set(id, { platform: row.platform, key: row.key, name: row.name, revenue: r2(row.revenue), rows: 1 });
    }
  }

  return [...byKey.values()].sort((a, b) => b.revenue - a.revenue);
}
