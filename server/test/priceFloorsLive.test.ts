// Live price floors: Ops' Finances event aggregates → the fee-report row shape (per ASIN, GST-inclusive sales and fees),
// then the client's own mergeReport folds it into the settings exactly like an uploaded report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSku, liveWindow, mapFloorRows, type SkuAgg } from '../src/services/priceFloorsLive.js';
import { DEFAULT_SETTINGS, mergeReport, type FeeReport } from '../../client/src/utils/priceFloors.js';

const agg = (o: Partial<SkuAgg>): SkuAgg => ({
  kind: 'order', sku: 'X', items: 0, units: 0, principal: 0, tax: 0, commission: 0, refUnits: 0, refBase: 0, fba: 0, fbaUnits: 0,
  closing: 0, closeUnits: 0, admin: 0, adminItems: 0, feeAll: 0, feeGst: 0, ...o,
});
const W = { from: '2026-10-04', to: '2026-11-02' };

test('orders + refunds → sold, returned, ASP incl. GST, fees per unit incl. their GST, referral % above the band', () => {
  // 100 units of the knee at ₹1,428.57 + 5 % GST = ₹1,500 each; 90 units paid referral at 10 % of the GST-incl price (ex GST on fee);
  // FBA ₹20 / unit and closing ₹55 / unit before 18 % GST (itemised); 10 refunds, 8 charged a ₹110 admin fee before GST.
  const skus: SkuAgg[] = [
    agg({ sku: 'VW-H1GL-KTOZ', items: 100, units: 80, principal: 80 * 1428.57, tax: 80 * 71.43, commission: -80 * 150, refUnits: 80, refBase: 80 * 1500,
      fba: -80 * 20, fbaUnits: 80, closing: -80 * 55, closeUnits: 80, feeAll: -80 * 225, feeGst: -80 * 225 * 0.18 }),
    agg({ sku: 'VW-H1GL-KTOZ-FBM', items: 20, units: 20, principal: 20 * 1428.57, tax: 20 * 71.43, commission: -10 * 150, refUnits: 10, refBase: 10 * 1500,
      fba: -20 * 20, fbaUnits: 20, closing: -20 * 55, closeUnits: 20, feeAll: -20 * 225 + 140 * 10, feeGst: -(20 * 225 - 1400) * 0.18 }),
    agg({ kind: 'refund', sku: 'VW-H1GL-KTOZ', items: 10, units: 10, principal: -10 * 1428.57, admin: -8 * 110, adminItems: 8, feeAll: -880, feeGst: -880 * 0.18 }),
    agg({ sku: 'NOPE', units: 7, principal: 700 }),
  ];
  const r = mapFloorRows({
    skus,
    asinOf: new Map([['VW-H1GL-KTOZ', { asin: 'B0CZJZ3MJ5', name: 'hCore Knee' }], ['VW-H1GL-KTOZ-FBM', { asin: 'B0CZJZ3MJ5' }]]),
    adsByAsin: new Map([['B0CZJZ3MJ5', 15000]]),
    storage: -2000,
  }, W);
  assert.equal(r.rows.length, 1);
  const k = r.rows[0];
  assert.equal(k.asin, 'B0CZJZ3MJ5');
  assert.equal(k.sku, 'VW-H1GL-KTOZ', 'busiest SKU, cleaned');
  assert.equal(k.sold, 100);
  assert.equal(k.returned, 10);
  assert.equal(k.asp, 1500);
  assert.equal(k.sales, 150000);
  assert.equal(k.fba, 23.6, '₹20 + 18 % GST');
  assert.equal(k.closing, 64.9, '₹55 + 18 % GST');
  assert.equal(k.admin, 129.8, '₹110 + 18 % GST');
  assert.equal(k.refPct, 0.118, '10 % + 18 % GST on the fee, of the GST-incl price');
  assert.equal(k.ads, 15000);
  assert.equal(k.tacos, 0.1);
  assert.equal(r.live.feesGst, 'itemised');
  assert.equal(r.observed.storage, 23.6, 'storage per unit sold incl. GST');
  assert.match(r.live.notes.join(' '), /7 units/);
  assert.equal(r.totals.units, 100);
});

test('referral % is withheld when few units paid it (sold below the band); fees grossed up when GST is not itemised', () => {
  const r = mapFloorRows({
    skus: [agg({ sku: 'A', units: 100, principal: 50000, tax: 2500, commission: -100, refUnits: 5, refBase: 5000, fba: -1000, fbaUnits: 100, feeAll: -1100 })],
    asinOf: new Map([['A', { asin: 'B0AAAAAAAA' }]]), adsByAsin: new Map(), storage: 0,
  }, W);
  assert.equal(r.rows[0].refPct, null);
  assert.equal(r.rows[0].fba, 11.8);
  assert.equal(r.live.feesGst, 'assumed');
  assert.match(r.live.notes.join(' '), /grossed up by 18/);
});

test('mergeReport folds the live report in like an upload (fees, ASP, units; product links untouched)', () => {
  const r = mapFloorRows({
    skus: [agg({ sku: 'VW-H1GL-KTOZ', units: 50, principal: 50 * 1600, tax: 50 * 80, fba: -50 * 20, fbaUnits: 50, feeAll: -1000, feeGst: -180 })],
    asinOf: new Map([['VW-H1GL-KTOZ', { asin: 'B0CZJZ3MJ5' }]]), adsByAsin: new Map(), storage: 0,
  }, W);
  const m = mergeReport(DEFAULT_SETTINGS, r as unknown as FeeReport);
  const knee = m.settings.skus.find((s) => s.asin === 'B0CZJZ3MJ5')!;
  assert.equal(knee.sold, 50);
  assert.equal(knee.asp, 1680);
  assert.equal(knee.fba, 23.6);
  assert.equal(knee.item, 'FG-0040', 'product link kept');
  assert.equal(knee.reportId, 'live-2026-11-02');
});

test('window = the last 30 full IST days; SKU clean-up matches the report parser', () => {
  assert.deepEqual(liveWindow(30, Date.parse('2026-11-03T02:00:00Z')), { from: '2026-10-04', to: '2026-11-02' });
  assert.deepEqual(liveWindow(30, Date.parse('2026-11-02T20:00:00Z')), { from: '2026-10-04', to: '2026-11-02' }, '01:30 IST on 3 Nov');
  assert.equal(cleanSku('VW-H1GL-KTOZ-FBM'), 'VW-H1GL-KTOZ');
});
