// ----------------------------------------------------------------------------
// Product identity across platforms.
//
// Amazon calls it "HB-QQ6J-D6E0-hcore X-L lite", Shopify calls it
// "HCORE-XL-LITE", Tranzact calls it "FG-0001" or "FG-0038" depending on which
// generation of the item master you look at, and the MIS deck calls it
// "hCore X-L Lite". Four vocabularies, one product.
//
// This is the join. It does for products what ledgerMap.ts does for ledgers:
// one identity table, an unrecognised key blocks the close rather than being
// dropped or double counted, and whatever gets assigned is emitted so next
// month starts ahead.
//
// THREE THINGS THE REAL EXPORTS FORCED
// ------------------------------------
// 1. Amazon keys are compound. `HB-QQ6J-D6E0`, `HB-QQ6J-D6E0-FBM`,
//    `HB-QQ6J-D6E0-hcore X-L lite` and `...-hcore X-L lite-FBM` are one
//    product. July had 26 raw strings covering 12 products, so identity keys
//    on the merchant token, not the whole string.
//
// 2. Shopify rows can have no SKU. 30% of July's D2C revenue sits on variants
//    that had no SKU set when the orders were placed. Shopify reports it as it
//    was, so re-exporting does not fix it; those rows key on the product title
//    and are marked as the weaker match they are.
//
// 3. Tranzact carries two generations of finished good for the same physical
//    product — the legacy `HTR-*` codes and the later `hCore-*` codes — whose
//    standard costs differ by up to 44%. Which one a platform SKU means is a
//    decision, not a lookup, so it is modelled as one (see CostBasis).
//
// CONFIRMED vs INFERRED
// --------------------
// `confirmed: true`  came from data already in production use, or from a name
//                    that is identical on both sides of the join.
// `confirmed: false` is a reading of a naming convention and has NOT been
//                    checked by anyone. The dashboard surfaces these and will
//                    not let an inferred product reach an emitted SKU cell
//                    until it is confirmed, because a wrong product mapping
//                    moves revenue between products while still totalling
//                    correctly — the same failure mode as a mis-bucketed
//                    ledger.
// ----------------------------------------------------------------------------

import { fgMaster } from '../fgMaster';
import { skuToFgMapping } from '../skuToFgMapping';
import type { CostBasis } from './schema';

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
 * The hCore-era finished goods.
 *
 * These appear in the Tranzact BOM export (FG-BOM00035..FG-BOM00044) but not in
 * `fgMaster.ts`, which was last refreshed before they existed. They are held
 * here rather than added to the FG master because `amazonToTranzact.ts` writes
 * `defaultPrice` straight into a Tranzact stock import: adding these with a
 * price of zero would turn an item it currently reports as missing into one it
 * silently values at nil.
 *
 * Their Tranzact names are the deck names, give or take punctuation, so unlike
 * the legacy codes these need no inference.
 */
const HCORE_ERA_FG: Record<string, { tranzactName: string; deckName: string }> = {
  'FG-0036': { tranzactName: 'hCore X', deckName: 'hCore X' },
  'FG-0037': { tranzactName: 'hCore XL', deckName: 'hCore X-L' },
  'FG-0038': { tranzactName: 'hCore XL (Lite)', deckName: 'hCore X-L Lite' },
  'FG-0039': { tranzactName: 'hCore X (lite)', deckName: 'hCore X Lite' },
  'FG-0040': { tranzactName: 'hCore Knee', deckName: 'hCore Knee' },
  'FG-0041': { tranzactName: 'hCore Neck', deckName: 'hCore Neck' },
  'FG-0042': { tranzactName: 'hCore Foot Warmer', deckName: 'hCore Foot' },
  'FG-0043': { tranzactName: 'hCore Rest', deckName: 'hCore Rest' },
  'FG-0044': { tranzactName: 'hCore Bed Warmer (Solo)', deckName: 'hCore Bed Solo' },
  'FG-0045': { tranzactName: 'hCore Bed Warmer (Dual)', deckName: 'hCore Bed Dual' },
};

/**
 * Legacy FG → deck name, and the hCore-era FG that is the same product.
 *
 * The deck names were originally read off the Tranzact naming convention
 *   HP-XL / HP-R      extra-large / regular heating pad
 *   KHP / CHP / FW    knee / cervical / foot
 *   BW-Single|Double  bed warmer
 *   HBR-*             heated back rest
 *   -A / -D           analog / digital
 * and are now corroborated by the hCore-era items, whose names say the product
 * outright: FG-0006 `HTR-KHP-D` and FG-0040 `hCore Knee` are the same pad, so
 * "hCore Knee" for FG-0006 is not a guess any more. Anything without a pairing
 * stays inferred.
 */
const LEGACY_FG: Record<string, { deckName: string; hcore?: string; basis: string; confirmed: boolean }> = {
  'FG-0001': { deckName: 'hCore X-L Lite', hcore: 'FG-0038', basis: 'HP-XL analog; pairs with hCore XL (Lite)', confirmed: true },
  'FG-0020': { deckName: 'hCore X-L Lite', hcore: 'FG-0038', basis: 'HP-XL analog, light grey colourway of FG-0001', confirmed: true },
  'FG-0002': { deckName: 'hCore X-L', hcore: 'FG-0037', basis: 'HP-XL digital; pairs with hCore XL', confirmed: true },
  'FG-0027': { deckName: 'hCore X-L', hcore: 'FG-0037', basis: 'HP-XL digital, light grey colourway of FG-0002', confirmed: true },
  'FG-0004': { deckName: 'hCore X Lite', hcore: 'FG-0039', basis: 'HP-R analog; pairs with hCore X (lite)', confirmed: true },
  'FG-0003': { deckName: 'hCore X', hcore: 'FG-0036', basis: 'HP-R digital; pairs with hCore X', confirmed: true },
  'FG-0005': { deckName: 'hCore Knee', hcore: 'FG-0040', basis: 'KHP analog; pairs with hCore Knee', confirmed: true },
  'FG-0006': { deckName: 'hCore Knee', hcore: 'FG-0040', basis: 'KHP digital; pairs with hCore Knee', confirmed: true },
  'FG-0007': { deckName: 'hCore Neck', hcore: 'FG-0041', basis: 'CHP (cervical) analog; pairs with hCore Neck', confirmed: true },
  'FG-0008': { deckName: 'hCore Neck', hcore: 'FG-0041', basis: 'CHP (cervical) digital; pairs with hCore Neck', confirmed: true },
  'FG-0009': { deckName: 'hCore Foot', hcore: 'FG-0042', basis: 'FW analog; pairs with hCore Foot Warmer', confirmed: true },
  'FG-0010': { deckName: 'hCore Foot', hcore: 'FG-0042', basis: 'FW digital; pairs with hCore Foot Warmer', confirmed: true },
  'FG-0011': { deckName: 'hCore Bed Solo', hcore: 'FG-0044', basis: 'BW-Single analog; pairs with hCore Bed Warmer (Solo)', confirmed: true },
  'FG-0012': { deckName: 'hCore Bed Solo', hcore: 'FG-0044', basis: 'BW-Single digital; pairs with hCore Bed Warmer (Solo)', confirmed: true },
  'FG-0013': { deckName: 'hCore Bed Dual', hcore: 'FG-0045', basis: 'BW-Double analog; pairs with hCore Bed Warmer (Dual)', confirmed: true },
  'FG-0014': { deckName: 'hCore Bed Dual', hcore: 'FG-0045', basis: 'BW-Double digital; pairs with hCore Bed Warmer (Dual)', confirmed: true },
  // The three HBR variants collapse onto one deck name, and only one hCore Rest
  // BOM exists, so which HBR a Rest sale is cannot be read off the names.
  'FG-0015': { deckName: 'hCore Rest', hcore: 'FG-0043', basis: 'HBR regular analog — three HBR variants share one deck name', confirmed: false },
  'FG-0016': { deckName: 'hCore Rest', hcore: 'FG-0043', basis: 'HBR regular digital — three HBR variants share one deck name', confirmed: false },
  'FG-0017': { deckName: 'hCore Rest', hcore: 'FG-0043', basis: 'HBR executive analog — three HBR variants share one deck name', confirmed: false },
  'FG-0030': { deckName: 'hCore Rest', hcore: 'FG-0043', basis: 'HBR executive digital — three HBR variants share one deck name', confirmed: false },
  // Accessories the deck excludes from product margin.
  'FG-0019': { deckName: 'Accessory (excl)', basis: 'Hot water bottle — not a powered product', confirmed: true },
  'FG-0021': { deckName: 'Accessory (excl)', basis: 'Tennis elbow support — not a powered product', confirmed: true },
  'FG-0022': { deckName: 'Accessory (excl)', basis: 'Knee binder — not a powered product', confirmed: true },
  'FG-0023': { deckName: 'Accessory (excl)', basis: 'Tummy trimmer — not a powered product', confirmed: true },
};

/** Every FG item the map can reach, from both generations of the item master. */
export const PRODUCTS: Record<string, CanonicalProduct> = {
  ...Object.fromEntries(
    Object.values(fgMaster).map((fg) => {
      const hit = LEGACY_FG[fg.itemId];
      return [
        fg.itemId,
        {
          fgId: fg.itemId,
          // Items outside the hCore range (OEM/white-label: Fedora, Coronation,
          // Healthsense, Infi, Dipnish) have no deck name and fall to the FG name.
          deckName: hit?.deckName ?? fg.itemName,
          tranzactName: fg.itemName,
          confirmed: hit?.confirmed ?? false,
          basis: hit?.basis ?? 'No deck name inferred — white-label or accessory line.',
        } satisfies CanonicalProduct,
      ];
    }),
  ),
  ...Object.fromEntries(
    Object.entries(HCORE_ERA_FG).map(([fgId, v]) => [
      fgId,
      {
        fgId,
        deckName: v.deckName,
        tranzactName: v.tranzactName,
        confirmed: true,
        basis: 'Tranzact item name is the deck name.',
      } satisfies CanonicalProduct,
    ]),
  ),
};

/** The hCore-era twin of a legacy FG, where Tranzact carries both. */
export function hcoreTwin(fgId: string): string | undefined {
  return LEGACY_FG[fgId]?.hcore;
}

/** Legacy/hCore FG pairs, for the cost-basis card. */
export function costBasisPairs(): { legacy: string; hcore: string; deckName: string }[] {
  const seen = new Set<string>();
  const out: { legacy: string; hcore: string; deckName: string }[] = [];
  for (const [legacy, v] of Object.entries(LEGACY_FG)) {
    if (!v.hcore || seen.has(`${legacy}|${v.hcore}`)) continue;
    seen.add(`${legacy}|${v.hcore}`);
    out.push({ legacy, hcore: v.hcore, deckName: v.deckName });
  }
  return out;
}

export interface SkuEntry {
  platform: Platform;
  /** The platform's own key, as it appears in their export. */
  key: string;
  fgId: string;
  confirmed: boolean;
  /** Set when `key` is a product title rather than a SKU — a weaker match. */
  byTitle?: boolean;
  /** Why, when the mapping is inferred. */
  basis?: string;
}

/**
 * Shopify variant SKUs, seeded from the July and Aug–Sep 2026 exports.
 *
 * The numbered XL/X variants are size crossed with heat level: 3-level is the
 * "Lite" product and 5-level the full one, per the variant list in Shopify
 * (32"/3, 32"/5, 40"/3, 40"/5 at ₹899 / ₹1,299 / ₹1,379 / ₹1,699). That reading
 * is not confirmed, so they carry `confirmed: false`.
 */
const SHOPIFY_SKUS: SkuEntry[] = [
  { platform: 'shopify', key: 'HCORE-KNEE', fgId: 'FG-0006', confirmed: true },
  { platform: 'shopify', key: 'HCORE-NECK', fgId: 'FG-0008', confirmed: true },
  { platform: 'shopify', key: 'HCORE-FOOT', fgId: 'FG-0010', confirmed: true },
  { platform: 'shopify', key: 'HCORE-REST', fgId: 'FG-0016', confirmed: false, basis: 'Three HBR variants share the Rest deck name' },
  { platform: 'shopify', key: 'HCORE-BED-SOLO', fgId: 'FG-0012', confirmed: true },
  { platform: 'shopify', key: 'HCORE-XL-LITE', fgId: 'FG-0001', confirmed: true },
  { platform: 'shopify', key: 'HCORE-X-LITE', fgId: 'FG-0004', confirmed: true },
  { platform: 'shopify', key: 'HCORE-XL-1', fgId: 'FG-0001', confirmed: false, basis: '32", 3-level → XL Lite' },
  { platform: 'shopify', key: 'HCORE-XL-2', fgId: 'FG-0002', confirmed: false, basis: '32", 5-level → XL' },
  { platform: 'shopify', key: 'HCORE-XL-3', fgId: 'FG-0001', confirmed: false, basis: '40", 3-level → XL Lite' },
  { platform: 'shopify', key: 'HCORE-XL-4', fgId: 'FG-0002', confirmed: false, basis: '40", 5-level → XL' },
  { platform: 'shopify', key: 'HCORE-X-1', fgId: 'FG-0004', confirmed: false, basis: '3-level → X Lite' },
  { platform: 'shopify', key: 'HCORE-X-2', fgId: 'FG-0003', confirmed: false, basis: '5-level → X' },
  { platform: 'shopify', key: 'HCORE-X-3', fgId: 'FG-0004', confirmed: false, basis: '3-level → X Lite' },
  { platform: 'shopify', key: 'HCORE-X-4', fgId: 'FG-0003', confirmed: false, basis: '5-level → X' },
];

/**
 * Shopify product titles, for July's rows with no variant SKU.
 *
 * Titles that name the product and its heat level are unambiguous. Two are
 * NOT, and are deliberately absent so they block rather than get guessed:
 *
 *   "Heating Pad for Back Pain"    ₹1,47,665 — spans HCORE-XL-1..4, i.e. both
 *                                  X-L Lite and X-L
 *   "Heating Pad for Period Pain"  ₹29,348  — spans HCORE-X-1..4, likewise
 *
 * Those two are 14% of July's D2C revenue. Assign them in the dashboard, or
 * split them on the variant mix from a later month where the SKUs are set.
 */
const SHOPIFY_TITLES: SkuEntry[] = [
  { platform: 'shopify', key: 'Knee Heating Pad', fgId: 'FG-0006', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Neck Heating Pad', fgId: 'FG-0008', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Foot Warmer for Cold Feet', fgId: 'FG-0010', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Heated Backrest', fgId: 'FG-0016', confirmed: false, byTitle: true, basis: 'Three HBR variants share the Rest deck name' },
  { platform: 'shopify', key: 'Single Bed Warmer', fgId: 'FG-0012', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Cervical Heating Pad for Stiff Neck & Frozen Shoulder – Analog by Heatronics', fgId: 'FG-0007', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Cervical Heating Pad for Stiff Neck & Frozen Shoulder – Digital by Heatronics', fgId: 'FG-0008', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Extra Large Heating Pad for Full Body Relief – Digital by Heatronics', fgId: 'FG-0002', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Extra Large Heating Pad for Back & Shoulder – Analog by Heatronics', fgId: 'FG-0001', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Heating Pad for Period and Back – Regular Size, Analog by Heatronics', fgId: 'FG-0004', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Heating Pad for Period & Back – Regular Size, Digital by Heatronics', fgId: 'FG-0003', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Knee Heating Pad for Joint & Arthritis – Analog by Heatronics', fgId: 'FG-0005', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Knee Heating Pad with Temperature Control – Digital by Heatronics', fgId: 'FG-0006', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Single Bed Heating Blanket with Auto-Cutoff – Digital by Heatronics', fgId: 'FG-0012', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Single Bed Warmer for Winters – Analog by Heatronics', fgId: 'FG-0011', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Foot Warmer Heating Pad for Cold Feet – Analog by Heatronics', fgId: 'FG-0009', confirmed: true, byTitle: true },
  { platform: 'shopify', key: 'Foot Warmer with Auto-Cutoff – Digital by Heatronics', fgId: 'FG-0010', confirmed: true, byTitle: true },
];

/** Blinkit's own numeric item ids, read off the July payout workbook. */
const BLINKIT_SKUS: SkuEntry[] = [
  { platform: 'blinkit', key: '10230152', fgId: 'FG-0021', confirmed: false, basis: 'Blinkit "Active Tennis Elbow Support & Guard"' },
  { platform: 'blinkit', key: '10225010', fgId: 'FG-0019', confirmed: false, basis: 'Blinkit "Pain Relief Hot Water Bag"' },
  { platform: 'blinkit', key: '10190437', fgId: 'FG-0004', confirmed: false, basis: 'Blinkit "Analog Electric Heating Pad (Regular)"' },
];

/**
 * Platform key → FG.
 *
 * Amazon is seeded from skuToFgMapping.ts, which the Amazon→Tranzact stock tool
 * already relies on in production, so those are confirmed. `BP-E09Z-J064` is
 * added here: it sold on Amazon in July and is the hCore Rest listing, which
 * skuToFgMapping predates.
 */
export const SEED_SKU_MAP: SkuEntry[] = [
  ...Object.entries(skuToFgMapping).map(([key, fgId]) => ({
    platform: 'amazon' as const,
    key,
    fgId,
    confirmed: true,
  })),
  { platform: 'amazon', key: 'BP-E09Z-J064', fgId: 'FG-0016', confirmed: false, basis: 'Amazon "hCore Heated Back Support for Office Chair" — which HBR variant is unknown' },
  ...SHOPIFY_SKUS,
  ...SHOPIFY_TITLES,
  ...BLINKIT_SKUS,
];

/** Platform keys vary in case and separators between exports; identity does not. */
export function normaliseSku(key: string): string {
  if (typeof key !== 'string') return '';
  return key.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

/**
 * Amazon merchant tokens: two characters, four, four.
 *
 * Everything Amazon appends after the token — a product nickname, `-FBM`, or
 * both — is decoration on the same listing. Matching on the whole string would
 * treat `HB-QQ6J-D6E0` and `HB-QQ6J-D6E0-hcore X-L lite-FBM` as different
 * products and drop the revenue of whichever was not in the map.
 */
const AMAZON_TOKEN = /^([0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{4})/i;

/** The identity a platform key collapses to, before any lookup. */
export function platformKey(platform: Platform, key: string): string {
  if (typeof key !== 'string') return '';
  if (platform === 'amazon') {
    const token = AMAZON_TOKEN.exec(key.trim());
    if (token) return normaliseSku(token[1]);
  }
  return normaliseSku(key);
}

export interface SkuLookup {
  fgId: string;
  /**
   * The FG the map itself holds, before the cost basis shifted it.
   *
   * Under the hCore basis `fgId` is already the hCore-era twin, so asking
   * `hcoreTwin(fgId)` again would say there is no fork. Keeping the original
   * is what lets callers see that a choice was made at all.
   */
  baseFgId: string;
  product: CanonicalProduct;
  /** True only when BOTH the SKU entry and the product mapping are confirmed. */
  confirmed: boolean;
  /** True when the key matched a product title rather than a SKU. */
  byTitle: boolean;
}

/**
 * Resolve one platform key to a product.
 *
 * `overrides` are this month's assignments, keyed "platform:NORMALISEDKEY", and
 * are treated as confirmed — a human just made the call.
 *
 * `basis` shifts a resolved product to its hCore-era twin. It changes which FG
 * record prices the unit, not which product it is, so the deck name is the same
 * either way.
 */
export function lookupSku(
  platform: Platform,
  key: string,
  overrides: Record<string, string> = {},
  entries: SkuEntry[] = SEED_SKU_MAP,
  basis: CostBasis | null = null,
): SkuLookup | null {
  const norm = platformKey(platform, key);
  if (!norm) return null;

  const withBasis = (fgId: string, confirmed: boolean, byTitle: boolean): SkuLookup | null => {
    // A product-level override is how the dashboard records "yes, FG-0016 really
    // is the Rest we sell". It is keyed on the FG id, so it has to be consulted
    // after the platform key resolves — looking only at platform-keyed
    // overrides silently ignored every product confirmation.
    const override = overrides[fgId];
    const chosen = override && PRODUCTS[override] ? override : fgId;
    const userConfirmed = Boolean(override);

    const twin = basis === 'hcore' ? hcoreTwin(chosen) : undefined;
    const resolved = twin && PRODUCTS[twin] ? twin : chosen;
    const product = PRODUCTS[resolved];
    if (!product) return null;
    return {
      fgId: resolved,
      baseFgId: chosen,
      product,
      confirmed: userConfirmed || (confirmed && product.confirmed),
      byTitle,
    };
  };

  const overrideFg = overrides[`${platform}:${norm}`] ?? overrides[norm];
  if (overrideFg && PRODUCTS[overrideFg]) {
    const hit = withBasis(overrideFg, true, false);
    // A human just made this call, so it stands whatever the product's own flag says.
    if (hit) return { ...hit, confirmed: true };
  }

  // Prefer a same-platform hit; fall back to any platform, since Tranzact item
  // names and FG ids turn up verbatim in several exports.
  const entry =
    entries.find((e) => e.platform === platform && platformKey(e.platform, e.key) === norm) ??
    entries.find((e) => platformKey(e.platform, e.key) === norm);
  if (entry) {
    const hit = withBasis(entry.fgId, entry.confirmed, entry.byTitle ?? false);
    if (hit) return hit;
  }

  // An FG id or Tranzact item name used directly.
  const direct = PRODUCTS[key.trim().toUpperCase()];
  if (direct) return withBasis(direct.fgId, direct.confirmed, false);

  const byName = Object.values(PRODUCTS).find(
    (p) => normaliseSku(p.tranzactName) === norm || normaliseSku(p.deckName) === norm,
  );
  if (byName) return withBasis(byName.fgId, byName.confirmed, false);

  return null;
}

/** Why a seeded entry is not yet trusted, for the confirm list. */
export function seedBasis(platform: Platform, key: string, entries: SkuEntry[] = SEED_SKU_MAP): string | undefined {
  const norm = platformKey(platform, key);
  return entries.find((e) => e.platform === platform && platformKey(e.platform, e.key) === norm)?.basis;
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
