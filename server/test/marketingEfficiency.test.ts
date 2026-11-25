// MER and CAC on the Live MIS P&L (founder, 25 Nov 2026: MIS shows MER + CAC only; ad detail stays in Ops).
import test from 'node:test';
import assert from 'node:assert/strict';
import { efficiencyCols, newBuyersMap, newBuyersOf, d2cAdSpend, OPS_AD_LINKS } from '../../client/src/data/misDeck/marketingEfficiency.js';
import type { PeriodAgg } from '../../client/src/data/misDeck/liveAnalytics.js';

const agg = (o: Partial<PeriodAgg>): PeriodAgg => ({
  key: '2026-10', label: 'Oct 26', members: ['2026-10'], netByChannel: {}, netRevenue: 0, salesMarketing: 0, marketingByPlatform: {}, ...o,
} as PeriodAgg);

test('MER, website MER and CAC from one month', () => {
  const p = agg({ netRevenue: 40_00_000, salesMarketing: 8_00_000, netByChannel: { D2C: 10_00_000 },
    marketingByPlatform: { 'Google Ads': 2_00_000, 'Meta (FB / Instagram)': 3_00_000, 'Amazon Ads': 2_50_000, 'Other / Unattributed': 50_000 } });
  const [c] = efficiencyCols([p], { '2026-10': 500 });
  assert.equal(c.mer, 5);
  assert.equal(c.d2cAds, 5_00_000);
  assert.equal(c.d2cMer, 2);
  assert.equal(c.newBuyers, 500);
  assert.equal(c.cac, 1_000);
});

test('no data stays null, never 0', () => {
  const pub = agg({ netRevenue: 30_00_000, salesMarketing: 6_00_000, marketingByPlatform: {} }); // published month: no split
  const [c] = efficiencyCols([pub], null);
  assert.equal(c.mer, 5);
  assert.equal(d2cAdSpend(pub), null);
  assert.equal(c.d2cMer, null);
  assert.equal(c.newBuyers, null);
  assert.equal(c.cac, null);
  const [z] = efficiencyCols([agg({ netRevenue: 10, salesMarketing: 0 })], null);
  assert.equal(z.mer, null);
});

test('a quarter needs every month of new buyers', () => {
  assert.equal(newBuyersOf(['2026-07', '2026-08', '2026-09'], { '2026-07': 100, '2026-08': 120, '2026-09': 90 }), 310);
  assert.equal(newBuyersOf(['2026-07', '2026-08', '2026-09'], { '2026-07': 100, '2026-09': 90 }), null);
});

test('the month the Shopify history was taken in is left out', () => {
  const m = newBuyersMap({ asOf: '2026-11-02T10:00:00Z', history: [{ month: '2026-10', newCustomers: 400 }, { month: '2026-11', newCustomers: 20 }] });
  assert.deepEqual(m, { '2026-10': 400 });
  assert.equal(newBuyersMap(null), null);
});

test('every ad platform links to its Ops page', () => {
  for (const href of Object.values(OPS_AD_LINKS)) assert.match(href, /^https:\/\/ops\.heatronics\.in\//);
  assert.ok(OPS_AD_LINKS['Meta (FB / Instagram)'].endsWith('/d2c/ads/meta'));
});
