// Setup → D2C customers & seasonality: the pure helpers behind client/src/components/planning/setup/Customers.tsx
// (docs/planning/ONE-SETUP.md §2.4). No React, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { basePlan, setSheetParity } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr } from '../../client/src/data/planning/growth.ts';
import { SEED_HISTORY, fitD2C } from '../../client/src/data/planning/history.ts';
import {
  SEASON_ORDER, applyShopifyDiscount, applyStoredHistory, avgYear, isNewerHistory, peakMonth, resetSkuSeason, resetToLearned,
  seasonEdit, seasonRows, seasonTint, setD2CField, setDiscountPct, setSeason, shortSource, summary, top3Share, type StoredHistory,
} from '../../client/src/data/planning/setup/customers.ts';

const stored = (asOf: string): StoredHistory => ({
  source: 'Shopify orders', asOf, orders: 20_000, customers: 17_500, skipped: { cancelled: 10, test: 2, outlier: 1 },
  history: SEED_HISTORY.map((x) => ({ ...x, discounts: (x.newSales + x.repeatSales) * 0.1 })),
  cohorts: SEED_HISTORY.map((x) => ({ month: x.month, size: x.newCustomers, repeats: [Math.round(x.newCustomers * 0.05), Math.round(x.newCustomers * 0.03)] })),
});

test('summary: the collapsed line names the model, AOV, boost, discounts and the learned source; ≤ 90 chars', () => {
  const p = basePlan();
  const s = summary(p);
  assert.match(s, /^Customers model · AOV ₹[\d,]+ · repeats 1× · discounts \d+% · learned Shopify 2026-11-02$/);
  assert.ok(s.length <= 90, `${s.length} chars: ${s}`);

  p.d2c.mode = 'units';
  p.d2c.repeatBoost = 1.5;
  p.fx!.d2cDiscount.on = false;
  assert.match(summary(p), /^Units model · .* · repeats 1\.5× · discounts off · learned Shopify 2026-11-02$/);

  // a plan saved before the founder decisions has no fx → discounts off, still a line
  delete p.fx;
  assert.match(summary(p), /discounts off/);

  const g = build500Cr(basePlan());
  assert.ok(summary(g).length > 0 && summary(g).length <= 90);
  const parity = basePlan(); setSheetParity(parity, true);
  assert.ok(summary(parity).length > 0 && summary(parity).length <= 90);
});

test('shortSource keeps a short clause and shortens a long one to its first word', () => {
  assert.equal(shortSource('Shopify orders'), 'Shopify orders');
  assert.equal(shortSource('Shopify analytics — new vs returning orders and AOV by month (pulled 2 Nov 2026)'), 'Shopify');
  assert.equal(shortSource('Shopify (export)'), 'Shopify');
  assert.equal(shortSource(''), 'history');
});

test('setD2CField sets the rate and tags the fit note "(edited)" exactly once', () => {
  const p = basePlan();
  const note = p.d2c.fit.note;
  setD2CField(p, 'sameMonth', 0.12);
  setD2CField(p, 'aovNew', 1500);
  assert.equal(p.d2c.sameMonth, 0.12);
  assert.equal(p.d2c.aovNew, 1500);
  assert.equal(p.d2c.fit.note, note + ' (edited)');
  assert.equal(avgYear(0.02), 0.24);
});

test('applyStoredHistory replaces the model with the stored fit but keeps mode and repeat boost', () => {
  const p = basePlan();
  p.d2c.mode = 'units';
  p.d2c.repeatBoost = 1.3;
  const s = stored('2026-12-01');
  assert.equal(isNewerHistory(s, p.d2c), true);
  assert.equal(isNewerHistory(stored('2026-10-01'), p.d2c), false);
  assert.equal(isNewerHistory(null, p.d2c), false);

  applyStoredHistory(p, s);
  const f = fitD2C(s.history, s.cohorts);
  assert.equal(p.d2c.mode, 'units');
  assert.equal(p.d2c.repeatBoost, 1.3);
  assert.equal(p.d2c.asOf, '2026-12-01');
  assert.equal(p.d2c.source, 'Shopify orders');
  assert.equal(p.d2c.sameMonth, f.sameMonth);
  assert.equal(p.d2c.aovNew, Math.round(f.aovNew));
  assert.ok(p.d2c.discountPct != null && Math.abs(p.d2c.discountPct - 0.1 / 1.1) < 1e-9, 'discount share learned from the stored history');
  assert.equal(p.d2c.history.length, s.history.length);
});

test('resetToLearned re-fits (stored history when there is one, else the plan\'s own) and puts the boost back to 1×', () => {
  const p = basePlan();
  setD2CField(p, 'sameMonth', 0.5);
  p.d2c.repeatBoost = 2;
  resetToLearned(p, null);
  const own = fitD2C(SEED_HISTORY);
  assert.equal(p.d2c.sameMonth, own.sameMonth);
  assert.equal(p.d2c.repeatBoost, 1);
  assert.equal(p.d2c.asOf, '2026-11-02');
  assert.doesNotMatch(p.d2c.fit.note, /\(edited\)/);

  const s = stored('2027-01-15');
  resetToLearned(p, s);
  assert.equal(p.d2c.asOf, '2027-01-15');
  assert.equal(p.d2c.sameMonth, fitD2C(s.history, s.cohorts).sameMonth);
});

test('discounts: typed = manual and clamped to 0–50 %; "Use Shopify\'s" takes the learned share', () => {
  const p = basePlan();
  setDiscountPct(p.fx!, 0.8);
  assert.equal(p.fx!.d2cDiscount.pct, 0.5);
  assert.equal(p.fx!.d2cDiscount.source, 'manual');
  setDiscountPct(p.fx!, -1);
  assert.equal(p.fx!.d2cDiscount.pct, 0);

  assert.equal(applyShopifyDiscount(p), true);
  assert.equal(p.fx!.d2cDiscount.pct, p.d2c.discountPct);
  assert.equal(p.fx!.d2cDiscount.source, 'shopify');
  assert.equal(p.fx!.d2cDiscount.asOf, p.d2c.asOf);

  p.d2c.discountPct = null;
  p.fx!.d2cDiscount.pct = 0.07;
  assert.equal(applyShopifyDiscount(p), false, 'no learned share = nothing changes');
  assert.equal(p.fx!.d2cDiscount.pct, 0.07);

  const old = basePlan(); delete old.fx;
  assert.equal(applyShopifyDiscount(old), false, 'no fx = nothing changes (the section calls ensureFx first)');
});

test('seasonality rows: one per sheet SKU (Jan..Dec) then the D2C new-buyer row; edits land in skuSeason / d2c.season', () => {
  const p = basePlan();
  const rows = seasonRows(p);
  assert.equal(rows.length, p.skus.length + 1);
  assert.equal(rows[rows.length - 1].id, 'd2c');
  assert.equal(rows[rows.length - 1].kind, 'd2c');
  for (const r of rows) assert.equal(r.v.length, 12, `${r.name} has 12 months`);
  assert.deepEqual(SEASON_ORDER, [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8]);

  const sku = rows[0];
  setSeason(p, sku, 10, 2.5);
  assert.equal(p.skuSeason[sku.id][10], 2.5);
  setSeason(p, rows[rows.length - 1], 0, 0.4);
  assert.equal(p.d2c.season[0], 0.4);

  // an unlearned SKU gets a flat curve created on first edit
  delete p.skuSeason[sku.id];
  setSeason(p, sku, 3, 1.7);
  assert.deepEqual(p.skuSeason[sku.id].map((x, i) => (i === 3 ? x : 1)), p.skuSeason[sku.id]);
  assert.equal(p.skuSeason[sku.id][3], 1.7);

  resetSkuSeason(p);
  assert.deepEqual(p.skuSeason, basePlan().skuSeason, 'Reset products = the sheet-learned curves');
});

test('seasonality maths: peak month (Oct-first ties), top-3 share, tint and typed-cell validation', () => {
  const flat = Array(12).fill(1);
  assert.equal(peakMonth(flat), 9, 'all equal → Oct, the first in business order');
  const winter = [1.2, 0.8, 0.6, 0.4, 0.3, 0.3, 0.4, 0.6, 0.9, 1.4, 2.4, 2.7];
  assert.equal(peakMonth(winter), 11);
  assert.ok(Math.abs(top3Share(flat) - 0.25) < 1e-12);
  assert.ok(Math.abs(top3Share(winter) - (2.7 + 2.4 + 1.4) / 12) < 1e-12);
  assert.equal(top3Share(Array(12).fill(0)), 0);

  assert.equal(seasonTint(0), 0);
  assert.equal(seasonTint(2), 0.5);
  assert.equal(seasonTint(10), 0.85, 'never fully opaque');

  assert.equal(seasonEdit('1.50', 1.5), null, 'unchanged = no write');
  assert.equal(seasonEdit('1.6', 1.5), 1.6);
  assert.equal(seasonEdit('-1', 1.5), null);
  assert.equal(seasonEdit('abc', 1.5), null);
  assert.equal(seasonEdit('', 1.5), null);
  assert.equal(seasonEdit('0', 1.5), 0);
});
