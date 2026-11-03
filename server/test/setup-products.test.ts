// Setup → Products & categories (client/src/data/planning/setup/products.ts): the collapsed summary counts, the default
// row a new product gets, and the category / sheet-SKU mutations the section makes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan, setSheetParity } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr, defaultCategories, emptyGrowth, ensureGrowthGroups } from '../../client/src/data/planning/growth.ts';
import {
  addCategory, addProduct, byFy, categoriesOf, newProductRow, orphans, planMode, removeCategory, setSkuTweak, splitSum, summary,
} from '../../client/src/data/planning/setup/products.ts';

const withGrowth = (fn: (p: Plan) => void = () => {}) => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  fn(p);
  return p;
};

test('summary: counts categories, products on, placeholders and off', () => {
  const p = withGrowth();
  const on = p.products.filter((x) => x.on);
  const ph = on.filter((x) => x.placeholder).length;
  assert.equal(summary(p), `${defaultCategories().length} categories · ${on.length} products (${ph} placeholders) · ${p.products.length - on.length} off`);

  const q = withGrowth((x) => {
    x.growth!.categories = [{ id: 'one', name: 'One' }];
    x.products = [
      { id: 'a', name: 'A', on: true, category: 'one', asp: 1, launchMonth: 1, launchUnits: 1, rampPct: 0, steadyPct: 0, split: { A: 1, D: 0, F: 0, G: 0, P: 0 }, cogsPct: null, placeholder: true },
      { id: 'b', name: 'B', on: false, category: 'one', asp: 1, launchMonth: 1, launchUnits: 1, rampPct: 0, steadyPct: 0, split: { A: 1, D: 0, F: 0, G: 0, P: 0 }, cogsPct: null, placeholder: true },
    ];
  });
  assert.equal(summary(q), '1 category · 1 product (1 placeholder) · 1 off');
  // no growth layer at all: the default categories are what the section shows
  const bare = basePlan(); delete bare.growth;
  assert.match(summary(bare), /^3 categories · \d+ products \(\d+ placeholders\) · \d+ off$/);
  assert.ok(summary(basePlan()).length > 0 && summary(build500Cr(basePlan())).length > 0);
  assert.ok(summary(build500Cr(basePlan())).length <= 90);
});

test('planMode: sheet without fx or with parity on, else plan', () => {
  const p = basePlan();
  assert.equal(planMode(p), 'plan');
  setSheetParity(p, true);
  assert.equal(planMode(p), 'sheet');
  const q = basePlan(); delete q.fx;
  assert.equal(planMode(q), 'sheet');
});

test('addProduct: a g- row in the category, inheriting its split, placeholder, growth line, launch after the sheet', () => {
  const p = withGrowth();
  const before = p.products.length;
  const row = addProduct(p, 'topical');
  assert.ok(row, 'known category');
  assert.equal(p.products.length, before + 1);
  assert.equal(p.products[p.products.length - 1], row);
  assert.ok(row!.id.startsWith('g-'), row!.id);
  assert.equal(row!.category, 'topical');
  assert.equal(row!.name, 'New topical');
  assert.deepEqual(row!.split, defaultCategories().find((c) => c.id === 'topical')!.split);
  assert.notEqual(row!.split, categoriesOf(p).find((c) => c.id === 'topical')!.split, 'a copy, not the category object');
  assert.ok(Math.abs(splitSum(row!) - 1) < 1e-9);
  assert.equal(row!.on, true);
  assert.equal(row!.placeholder, true);
  assert.equal(row!.growthLine, true);
  assert.equal(row!.cogsPct, null, 'material % inherited from the category');
  assert.equal(row!.marketingPct, undefined);
  assert.equal(row!.seasonRef, 'flat');
  assert.deepEqual(row!.expenses, []);
  assert.equal(row!.launchMonth, Math.min(13, p.units.length + 1));
  // an explicit id is kept; an unknown category adds nothing
  assert.equal(addProduct(p, 'topical', 'g-fixed')!.id, 'g-fixed');
  assert.equal(addProduct(p, 'nope'), null);
  assert.equal(p.products.length, before + 2);
  // the plan still runs with the new line on
  const r = runPlan(p);
  assert.ok(r.months.some((m) => (m.unitsBySku['g-fixed'] ?? 0) > 0));
});

test('addProduct on a plan with no growth layer creates it (on) with the default categories', () => {
  const p = basePlan(); delete p.growth;
  const row = addProduct(p, 'device');
  assert.ok(row);
  assert.equal(p.growth?.on, true);
  assert.equal(p.growth?.categories?.length, 3);
  assert.ok(p.groups.some((g) => g.name === 'Product Running Costs'), 'growth groups ensured');
  // an existing switched-off layer keeps `on` as it was
  const q = basePlan(); q.growth = { ...emptyGrowth(), on: false }; delete q.growth.categories;
  addProduct(q, 'nutra');
  assert.equal(q.growth.on, false);
  assert.equal(q.growth.categories?.length, 3);
});

test('newProductRow uses a neutral split when the category has none', () => {
  const row = newProductRow({ id: 'x', name: 'Gels' }, 7, 'g-1');
  assert.equal(row.name, 'New gel');
  assert.equal(row.launchMonth, 7);
  assert.ok(Math.abs(splitSum(row) - 1) < 1e-9);
});

test('categories: add, remove only when empty; orphans are products outside the list', () => {
  const p = withGrowth();
  const c = addCategory(p, 'cat-t');
  assert.equal(c.id, 'cat-t');
  assert.equal(c.name, 'New category');
  assert.ok(categoriesOf(p).some((k) => k.id === 'cat-t'));
  assert.equal(removeCategory(p, 'cat-t'), true);
  assert.ok(!categoriesOf(p).some((k) => k.id === 'cat-t'));
  assert.equal(removeCategory(p, 'cat-t'), false, 'unknown');
  addProduct(p, 'topical', 'g-a');
  assert.equal(removeCategory(p, 'topical'), false, 'still holds a product');
  assert.ok(categoriesOf(p).some((k) => k.id === 'topical'));
  // the base's lotion / oil have no category → orphans; the new product is not
  const o = orphans(p).map((x) => x.id);
  assert.ok(o.includes('p-lotion') && o.includes('p-oil'));
  assert.ok(!o.includes('g-a'));
});

test('setSkuTweak applies founder decisions when missing and merges volume / price', () => {
  const p = basePlan(); delete p.fx;
  const sku = p.skus[0].id;
  setSkuTweak(p, sku, { volume: 1.5 });
  assert.ok(p.fx, 'fx applied');
  assert.deepEqual(p.fx!.skuTweaks[sku], { volume: 1.5, asp: null });
  setSkuTweak(p, sku, { asp: 1234 });
  assert.deepEqual(p.fx!.skuTweaks[sku], { volume: 1.5, asp: 1234 });
  setSkuTweak(p, sku, { asp: null });
  assert.deepEqual(p.fx!.skuTweaks[sku], { volume: 1.5, asp: null });
});

test('byFy sums revenue and units per product per FY from a run', () => {
  const p = withGrowth();
  const r = runPlan(p);
  const b = byFy(r);
  const sku = p.skus[0].id;
  const fy = r.months[0].fy;
  const rev = r.months.filter((m) => m.fy === fy).reduce((a, m) => a + (m.revenueBySku[sku] ?? 0), 0);
  const units = r.months.filter((m) => m.fy === fy).reduce((a, m) => a + (m.unitsBySku[sku] ?? 0), 0);
  assert.ok(Math.abs(b[sku][fy].rev - rev) < 1e-6);
  assert.ok(Math.abs(b[sku][fy].units - units) < 1e-6);
});
