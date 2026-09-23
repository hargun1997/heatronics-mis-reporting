// ----------------------------------------------------------------------------
// Product identity across platforms.
//
// Amazon calls it "HB-QQ6J-D6E0", Tranzact calls it "FG-0001", Tranzact's item
// master calls it "HTR-HP-XL-A (Steel Blue)", and the MIS deck calls it
// "hCore X-L Lite". Four names, one product. Nothing in the codebase joined
// them before this file: skuToFgMapping.ts covered Amazon only and was used by
// the stock-reconciliation tool alone, while skuChannelPnl.ts was keyed on the
// deck's free-text display names and joined to nothing.
//
// This is the join. It does for products what ledgerMap.ts does for ledgers:
// one identity table, an unrecognised key blocks the close rather than being
// dropped or double counted, and whatever gets assigned is emitted so next
// month starts ahead.
//
// CONFIRMED vs INFERRED
// --------------------
// `confirmed: true`  came from data already in production use.
// `confirmed: false` is a reading of the naming convention and has NOT been
//                    checked by anyone. The dashboard surfaces these and will
//                    not let an inferred product reach an emitted SKU cell
//                    until it is confirmed, because a wrong product mapping
//                    moves revenue between products while still totalling
//                    correctly — the same failure mode as a mis-bucketed
//                    ledger.
// ----------------------------------------------------------------------------

import { fgMaster } from '../fgMaster';
import { skuToFgMapping } from '../skuToFgMapping';

export type Platform = 'amazon' | 'shopify' | 'blinkit' | 'shiprocket' | 'offline' | 'oem';

export const PLATFORMS: Platform[] = ['amazon', 'shopify', 'blinkit', 'shiprocket', 'offline', 'oem'];

export interface CanonicalProduct {
  fgId: string;
  /** The name SKU_CELLS uses, so emitted cells sit alongside the existing 767. */
  deckName: string;
  /** Tranzact's item name, for cross-checking against the FG master. */
  tranzactName: string;
  confirmed: boolean;
  /** Why this mapping is believed, when it is inferred. */
  basis?: string;
}

/**
 * FG ID → the deck's display name.
 *
 * Read off the Tranzact naming convention:
 *   HP-XL / HP-R      extra-large / regular heating pad
 *   KHP / CHP / FW    knee / cervical / foot
 *   BW-Single|Double  bed warmer
 *   HBR-*             heated back rest
 *   -A / -D           analog / digital
 *
 * which lines up with the deck's four heating-pad names being XL vs regular
 * crossed with analog ("Lite") vs digital. Plausible and self-consistent, but
 * nobody has confirmed it — hence confirmed: false throughout.
 */
const DECK_NAME_BY_FG: Record<string, { deckName: string; basis: string }> = {
  'FG-0001': { deckName: 'hCore X-L Lite', basis: 'HP-XL + analog → XL "Lite"' },
  'FG-0020': { deckName: 'hCore X-L Lite', basis: 'HP-XL analog, light grey colourway of FG-0001' },
  'FG-0002': { deckName: 'hCore X-L', basis: 'HP-XL + digital → XL' },
  'FG-0027': { deckName: 'hCore X-L', basis: 'HP-XL digital, light grey colourway of FG-0002' },
  'FG-0004': { deckName: 'hCore X Lite', basis: 'HP-R + analog → regular "Lite"' },
  'FG-0003': { deckName: 'hCore X', basis: 'HP-R + digital → regular' },
  'FG-0005': { deckName: 'hCore Knee', basis: 'KHP analog' },
  'FG-0006': { deckName: 'hCore Knee', basis: 'KHP digital' },
  'FG-0007': { deckName: 'hCore Neck', basis: 'CHP (cervical) analog' },
  'FG-0008': { deckName: 'hCore Neck', basis: 'CHP (cervical) digital' },
  'FG-0009': { deckName: 'hCore Foot', basis: 'FW (foot warmer) analog' },
  'FG-0010': { deckName: 'hCore Foot', basis: 'FW (foot warmer) digital' },
  'FG-0011': { deckName: 'hCore Bed Solo', basis: 'BW-Single analog' },
  'FG-0012': { deckName: 'hCore Bed Solo', basis: 'BW-Single digital' },
  'FG-0013': { deckName: 'hCore Bed Dual', basis: 'BW-Double analog' },
  'FG-0014': { deckName: 'hCore Bed Dual', basis: 'BW-Double digital' },
  'FG-0015': { deckName: 'hCore Rest', basis: 'HBR regular analog' },
  'FG-0016': { deckName: 'hCore Rest', basis: 'HBR regular digital' },
  'FG-0017': { deckName: 'hCore Rest', basis: 'HBR executive analog' },
};

/** Every FG item, with the deck name where one could be inferred. */
export const PRODUCTS: Record<string, CanonicalProduct> = Object.fromEntries(
  Object.values(fgMaster).map((fg) => {
    const hit = DECK_NAME_BY_FG[fg.itemId];
    return [
      fg.itemId,
      {
        fgId: fg.itemId,
        // Items outside the hCore range (OEM/white-label: Fedora, Coronation,
        // Healthsense, Infi, Dipnish) have no deck name and fall to the FG name.
        deckName: hit?.deckName ?? fg.itemName,
        tranzactName: fg.itemName,
        confirmed: false,
        basis: hit?.basis ?? 'No deck name inferred — white-label or accessory line.',
      } satisfies CanonicalProduct,
    ];
  }),
);

export interface SkuEntry {
  platform: Platform;
  /** The platform's own key, as it appears in their export. */
  key: string;
  fgId: string;
  confirmed: boolean;
}

/**
 * Platform key → FG.
 *
 * Amazon is seeded from skuToFgMapping.ts, which the Amazon→Tranzact stock tool
 * already relies on in production, so those are confirmed. No Shopify, Blinkit
 * or Shiprocket keys exist yet — those arrive the first time one of their
 * exports is ingested, as blockers to be assigned.
 */
export const SEED_SKU_MAP: SkuEntry[] = Object.entries(skuToFgMapping).map(([key, fgId]) => ({
  platform: 'amazon' as const,
  key,
  fgId,
  confirmed: true,
}));

/** Platform keys vary in case and separators between exports; identity does not. */
export function normaliseSku(key: string): string {
  if (typeof key !== 'string') return '';
  return key.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export interface SkuLookup {
  fgId: string;
  product: CanonicalProduct;
  /** True only when BOTH the SKU entry and the product mapping are confirmed. */
  confirmed: boolean;
}

/**
 * Resolve one platform key to a product.
 *
 * `overrides` are this month's assignments, keyed "platform:NORMALISEDKEY", and
 * are treated as confirmed — a human just made the call.
 */
export function lookupSku(
  platform: Platform,
  key: string,
  overrides: Record<string, string> = {},
  entries: SkuEntry[] = SEED_SKU_MAP,
): SkuLookup | null {
  const norm = normaliseSku(key);
  if (!norm) return null;

  const overrideFg = overrides[`${platform}:${norm}`] ?? overrides[norm];
  if (overrideFg) {
    const product = PRODUCTS[overrideFg];
    if (product) return { fgId: overrideFg, product, confirmed: true };
  }

  // Prefer a same-platform hit; fall back to any platform, since Tranzact item
  // names and FG ids turn up verbatim in several exports.
  const hit =
    entries.find((e) => e.platform === platform && normaliseSku(e.key) === norm) ??
    entries.find((e) => normaliseSku(e.key) === norm);
  if (hit) {
    const product = PRODUCTS[hit.fgId];
    if (product) return { fgId: hit.fgId, product, confirmed: hit.confirmed && product.confirmed };
  }

  // An FG id or Tranzact item name used directly.
  const direct = PRODUCTS[key.trim().toUpperCase()];
  if (direct) return { fgId: direct.fgId, product: direct, confirmed: direct.confirmed };

  const byName = Object.values(PRODUCTS).find(
    (p) => normaliseSku(p.tranzactName) === norm || normaliseSku(p.deckName) === norm,
  );
  if (byName) return { fgId: byName.fgId, product: byName, confirmed: byName.confirmed };

  return null;
}

/** Deck names currently reachable, for the assign dropdown. */
export function deckNames(): string[] {
  return [...new Set(Object.values(PRODUCTS).map((p) => p.deckName))].sort();
}

/** Render this month's new SKU assignments as a TS fragment to merge into the seed. */
export function renderSkuAdditions(overrides: Record<string, string>): string {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return '// No new SKUs this month — the seed map covered everything.\n';

  const lines = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, fgId]) => {
      const [platform, sku] = key.includes(':') ? key.split(':') : ['amazon', key];
      const name = PRODUCTS[fgId]?.deckName ?? fgId;
      return `  { platform: '${platform}', key: '${sku}', fgId: '${fgId}', confirmed: true }, // ${name}`;
    });

  return `// Learned this month — merge into SEED_SKU_MAP.\n${lines.join('\n')}\n`;
}
