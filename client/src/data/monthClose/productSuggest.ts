// ----------------------------------------------------------------------------
// Product gaps: sales rows whose key is in no SKU map (unmapped ₹), and finished goods that sell but have no BOM.
// Pure. Suggests the closest product by NAME similarity so the founder confirms in one click; nothing is
// applied until confirmed (confirmed mappings are stored: objectStore `mis/product-map`, via /api/mis/product-map).
//   • B2B Tranzact items  — key = Tranzact item name / FG id
//   • Meta product ids    — key = catalog id, name = "<id>, <name>" from the ad export
//   • Missing BOM         — FG-0025, -0028, -0049, -0050, -0051, -0053, -0100, -0101, -0106: a margin must never be
//                           shown as 100 % because no cost exists; the closest costed product is suggested as a proxy.
// ----------------------------------------------------------------------------

export interface ProductMap {
  /** "platform:NORMALISEDKEY" → FG id (the shape session.skuOverrides takes). */
  sku: Record<string, string>;
  /** FG without a BOM → FG whose BOM cost stands in for it. */
  bomProxy: Record<string, string>;
}
export const EMPTY_PRODUCT_MAP: ProductMap = { sku: {}, bomProxy: {} };

/** Finished goods that sell but have no BOM (founder list, 3 Nov 2026). */
export const MISSING_BOM_FGS = ['FG-0025', 'FG-0028', 'FG-0049', 'FG-0050', 'FG-0051', 'FG-0053', 'FG-0100', 'FG-0101', 'FG-0106'];

let ACTIVE: ProductMap = EMPTY_PRODUCT_MAP;
export function setProductMap(m: Partial<ProductMap> | null | undefined): void {
  ACTIVE = { sku: { ...(m?.sku ?? {}) }, bomProxy: { ...(m?.bomProxy ?? {}) } };
}
export const activeProductMap = () => ACTIVE;

// ---- name similarity -------------------------------------------------------

const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'pcs', 'pc', 'pack', 'new', 'electric', 'heating', 'pad']);
/** Lower-case tokens, brackets / colours kept as words, "XL" ≡ "X-L", digits kept. */
export function nameTokens(s: string): string[] {
  const t = String(s ?? '').toLowerCase()
    .replace(/\bx[\s-]?l\b/g, 'xl').replace(/\bhp[\s-]?r\b/g, 'hpr').replace(/\bhp[\s-]?xl\b/g, 'hpxl')
    .replace(/^\s*\d{6,},\s*/, '') // "<meta id>, name"
    .split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
  return [...new Set(t)];
}
const trigrams = (s: string) => { const x = `  ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `; const o = new Set<string>(); for (let i = 0; i + 3 <= x.length; i++) o.add(x.slice(i, i + 3)); return o; };

/** 0..1: token Dice blended with character-trigram Dice. */
export function similarity(a: string, b: string): number {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const sb = new Set(tb);
  const common = ta.filter((x) => sb.has(x)).length;
  const dice = (2 * common) / (ta.length + tb.length);
  const ga = trigrams(a), gb = trigrams(b);
  let g = 0;
  for (const x of ga) if (gb.has(x)) g++;
  const tri = ga.size + gb.size ? (2 * g) / (ga.size + gb.size) : 0;
  return Math.round((0.6 * dice + 0.4 * tri) * 1000) / 1000;
}

export interface Candidate { fgId: string; deckName: string; tranzactName: string }
export interface Suggestion extends Candidate { score: number }

export function suggest(name: string, candidates: Candidate[], max = 3, min = 0.25): Suggestion[] {
  return candidates
    .map((c) => ({ ...c, score: Math.max(similarity(name, c.tranzactName), similarity(name, c.deckName)) }))
    .filter((s) => s.score >= min)
    .sort((a, b) => b.score - a.score || a.fgId.localeCompare(b.fgId))
    .slice(0, max);
}

// ---- gaps ------------------------------------------------------------------

/** A sales row whose key no map knows. */
export interface UnmappedGap {
  platform: string; key: string; name: string; revenue: number; units: number; rows: number; months: string[];
  kind: 'b2b' | 'meta' | 'other';
  suggestions: Suggestion[];
}
/** A product with sales but no BOM cost. `proxy` = the confirmed stand-in; `suggested` = the closest costed product. */
export interface BomGap {
  fgId: string; deckName: string; revenue: number; units: number; channels: string[]; months: string[];
  proxy: string | null; proxyConfirmed: boolean; suggested: Suggestion | null;
}
export interface ProductGaps { unmapped: UnmappedGap[]; noBom: BomGap[] }

export const EMPTY_GAPS: ProductGaps = { unmapped: [], noBom: [] };

const kindOf = (platform: string): UnmappedGap['kind'] => (platform === 'meta' ? 'meta' : ['b2b', 'gt', 'offline', 'oem'].includes(platform) ? 'b2b' : 'other');

export function unmappedGaps(
  rows: { platform: string; key: string; name?: string; revenue: number; units: number; month: string }[],
  candidates: Candidate[],
): UnmappedGap[] {
  const by = new Map<string, UnmappedGap>();
  for (const r of rows) {
    const id = `${r.platform}|${r.key}`;
    const g = by.get(id) ?? { platform: r.platform, key: r.key, name: r.name || r.key, revenue: 0, units: 0, rows: 0, months: [], kind: kindOf(r.platform), suggestions: [] };
    g.revenue += r.revenue; g.units += r.units; g.rows += 1;
    if (!g.months.includes(r.month)) g.months.push(r.month);
    if (!g.name || g.name === g.key) g.name = r.name || g.name;
    by.set(id, g);
  }
  for (const g of by.values()) {
    g.revenue = Math.round(g.revenue * 100) / 100;
    g.suggestions = suggest(g.name === g.key ? g.key : `${g.name} ${g.key}`, candidates);
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}

/** `costed` = FG ids that have a BOM cost. Closest costed product by name for each no-BOM product. */
export function bomGaps(
  cells: { fgId: string; deckName: string; revenue: number; units: number; channel: string; month: string }[],
  candidates: Candidate[],
  costed: Set<string>,
  map: ProductMap = ACTIVE,
): BomGap[] {
  const by = new Map<string, BomGap>();
  for (const c of cells) {
    const g = by.get(c.fgId) ?? { fgId: c.fgId, deckName: c.deckName, revenue: 0, units: 0, channels: [], months: [], proxy: null, proxyConfirmed: false, suggested: null };
    g.revenue += c.revenue; g.units += c.units;
    if (!g.channels.includes(c.channel)) g.channels.push(c.channel);
    if (!g.months.includes(c.month)) g.months.push(c.month);
    by.set(c.fgId, g);
  }
  const pool = candidates.filter((c) => costed.has(c.fgId));
  for (const g of by.values()) {
    g.revenue = Math.round(g.revenue * 100) / 100;
    const confirmed = map.bomProxy[g.fgId];
    g.proxy = confirmed ?? null; g.proxyConfirmed = Boolean(confirmed);
    g.suggested = suggest(g.deckName, pool.filter((c) => c.fgId !== g.fgId), 1, 0.3)[0] ?? null;
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}
