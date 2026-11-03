// Setup → Products & categories (docs/planning/ONE-SETUP.md §2.3): the pure parts — the collapsed summary line and the
// plan mutations the section makes (add / remove a category, add a product, move an orphan, tweak a sheet SKU).
// No React here: server/test/setup-products.test.ts imports this file.
import { CHANNELS, type CategoryDef, type Channel, type NewProduct, type Plan, type PlanResult } from '../engine';
import { applyFounderDecisions } from '../basePlan';
import { defaultCategories, emptyGrowth, ensureGrowthGroups } from '../growth';

export type PlanMode = 'sheet' | 'plan';
/** Sheet parity (or no founder decisions yet) = the sheet; otherwise the founder's plan. */
export const planMode = (plan: Plan): PlanMode => (!plan.fx || plan.fx.sheetParity ? 'sheet' : 'plan');

export const ZERO_SPLIT: Record<Channel, number> = { A: 0, D: 0, F: 0, G: 0, P: 0 };
const NEW_SPLIT: Record<Channel, number> = { A: 0.5, D: 0.4, F: 0.1, G: 0, P: 0 };

const rnd = () => Math.random().toString(36).slice(2, 8);
export const productId = () => 'g-' + rnd();
export const categoryId = () => 'cat-' + rnd();
export const expenseId = () => 'e-' + rnd();

/** The categories the section shows: the plan's, else the defaults (device / topical / nutra). */
export const categoriesOf = (plan: Plan): CategoryDef[] => plan.growth?.categories ?? defaultCategories();

/** The growth layer, created on first write (does NOT change `on` of an existing one), with its categories filled in. */
export function growthWithCategories(p: Plan): NonNullable<Plan['growth']> & { categories: CategoryDef[] } {
  p.growth ??= { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  p.growth.categories ??= defaultCategories();
  return p.growth as NonNullable<Plan['growth']> & { categories: CategoryDef[] };
}

export const categoryOf = (x: NewProduct, cats: CategoryDef[]): CategoryDef | null => cats.find((c) => c.id === (x.category ?? '')) ?? null;
/** Products whose category is not in the list (older lines from the sheet). */
export const orphans = (plan: Plan): NewProduct[] => { const cats = categoriesOf(plan); return plan.products.filter((x) => !categoryOf(x, cats)); };

/** The default row for a new product in `cat` (id prefix `g-`; inherits the category's channel split). */
export function newProductRow(cat: CategoryDef, launchMonth: number, id = productId()): NewProduct {
  return {
    id, name: `New ${cat.name.toLowerCase().replace(/s$/, '')}`, on: true, category: cat.id, asp: 999, launchMonth,
    launchUnits: 500, rampPct: 0.1, steadyPct: 0.3, split: { ...(cat.split ?? NEW_SPLIT) }, cogsPct: null,
    seasonRef: 'flat', growthLine: true, placeholder: true, expenses: [],
  };
}

/** Add a product to `categoryId` (launch = the first month after the sheet, capped at month 13). Returns it, or null when the category is unknown. */
export function addProduct(p: Plan, categoryId: string, id = productId()): NewProduct | null {
  const g = growthWithCategories(p);
  const cat = g.categories.find((c) => c.id === categoryId);
  if (!cat) return null;
  const row = newProductRow(cat, Math.min(13, p.units.length + 1), id);
  p.products.push(row);
  return row;
}

export function newCategoryRow(id = categoryId()): CategoryDef {
  return { id, name: 'New category', cogsPct: 0.3, marketingPct: 0.05, repeatPct: 0, repeatDecay: 0, inHouse: false, split: { ...NEW_SPLIT } };
}
export function addCategory(p: Plan, id = categoryId()): CategoryDef {
  const g = growthWithCategories(p);
  const row = newCategoryRow(id);
  g.categories.push(row);
  return row;
}
/** Remove an empty category; false when it still holds products (or is unknown). */
export function removeCategory(p: Plan, id: string): boolean {
  if (p.products.some((x) => (x.category ?? '') === id)) return false;
  const g = growthWithCategories(p);
  const i = g.categories.findIndex((c) => c.id === id);
  if (i < 0) return false;
  g.categories.splice(i, 1);
  return true;
}

/** Volume × / price of a sheet SKU (`fx.skuTweaks`); founder decisions are applied first when the plan has none. */
export function setSkuTweak(p: Plan, skuId: string, t: { volume?: number; asp?: number | null }): void {
  if (!p.fx) applyFounderDecisions(p);
  const cur = p.fx!.skuTweaks[skuId] ?? { volume: 1, asp: null };
  p.fx!.skuTweaks[skuId] = { volume: t.volume ?? cur.volume, asp: t.asp === undefined ? cur.asp : t.asp };
}

export const splitSum = (x: NewProduct) => CHANNELS.reduce((a, ch) => a + (x.split[ch] ?? 0), 0);

/** Revenue + units per product per FY, from a run (feedback lines next to the inputs). */
export function byFy(r: PlanResult): Record<string, Record<string, { rev: number; units: number }>> {
  const out: Record<string, Record<string, { rev: number; units: number }>> = {};
  for (const m of r.months) for (const [id, v] of Object.entries(m.revenueBySku)) {
    const o = (out[id] ??= {}); const c = (o[m.fy] ??= { rev: 0, units: 0 });
    c.rev += v; c.units += m.unitsBySku[id] ?? 0;
  }
  return out;
}

/** Collapsed line: `3 categories · 10 products (8 placeholders) · 2 off`. */
export function summary(plan: Plan): string {
  const cats = categoriesOf(plan).length;
  const on = plan.products.filter((x) => x.on);
  const placeholders = on.filter((x) => x.placeholder).length;
  const off = plan.products.length - on.length;
  return `${cats} categor${cats === 1 ? 'y' : 'ies'} · ${on.length} product${on.length === 1 ? '' : 's'} (${placeholders} placeholder${placeholders === 1 ? '' : 's'}) · ${off} off`;
}
