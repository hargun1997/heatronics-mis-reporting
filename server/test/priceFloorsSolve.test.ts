// Price-floor maths: the floor leaves exactly the target margin; GST stuck follows the inverted-duty refund (goods only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, stuckOf, DEFAULT_GLOBAL, type FloorSettings, type FloorSku } from '../../client/src/utils/priceFloors.js';

const sku: FloorSku = { asin: 'A', name: 'X Lite', sku: 's', item: 'FG-0039', asp: 650, sold: 100, returned: 20, fba: 19.29, admin: 103.67, refPct: 0.1, tacos: null, inbound: 14.43, reportId: null };
const st = (g: Partial<FloorSettings['global']> = {}): FloorSettings => ({ global: { ...DEFAULT_GLOBAL, ...g }, skus: [sku], updatedAt: null, updatedBy: null });
const c = { material: 318.51, conversion: 74.45 };

test('stuck GST = services share after the sale GST (Rule 89(5))', () => {
  assert.equal(stuckOf(30, 20, 60, true), 0); // credits below the sale GST: nothing stuck
  assert.equal(Math.round(stuckOf(60, 40, 30, true) * 100) / 100, 28); // 40 − 30 × 40/100
  assert.equal(stuckOf(60, 40, 30, false), 0);
});

test('floor leaves the target margin of net sales, by hand', () => {
  const s = st({ stuckOn: true, margin: 0.05, reseller: 0.04, packing: 0.01 });
  const { price, lines } = solve(sku, s, c, 0, 0.1);
  const b = 0.18;
  const net = price / 1.05;
  const r = 0.2, k = r / (1 - r);
  const store = s.global.storage;
  const above = price >= s.global.band;
  const amazon = sku.fba + 14.43 + store + (above ? 0.1 * price + s.global.closeHi : s.global.closeLo) + k * (sku.fba + sku.admin);
  const goods = b * c.material, serv = (amazon * b) / (1 + b) + b * 0.1 * price + b * 0.01 * net;
  const outGst = price - net;
  const stuck = Math.max(0, serv - (outGst * serv) / (goods + serv));
  // cash view: everything paid (incl. GST) minus refunds and credits, against the price received
  const paid = c.material * (1 + b) + c.conversion + amazon + 0.1 * price * (1 + b) + 0.01 * net * (1 + b) + 0.04 * net;
  const gstNet = outGst - (goods + serv) + stuck; // sale GST paid − credits/refund recovered
  const margin = price - paid - gstNet;
  assert.ok(Math.abs(margin - 0.05 * net) < 0.05, `margin ${margin} vs ${0.05 * net}`);
  assert.ok(Math.abs(lines.stuck - stuck) < 0.05);
});

test('per-SKU storage replaces the average', () => {
  const a = solve(sku, st(), c, 0, 0.1).price;
  const big = solve({ ...sku, storage: 80 }, st(), c, 0, 0.1);
  assert.ok(big.price > a);
  assert.equal(big.lines.storage, 80);
});

test('detail lines add up to their waterfall rows', async () => {
  const { detailLines, groupLines } = await import('../../client/src/utils/priceFloors.js');
  for (const x of [sku, { ...sku, pick: 60, asp: 1500 }]) {
    const s = st({ stuckOn: false });
    const { price, lines } = solve(x, s, c, 0.25, 0.1);
    const g = groupLines(lines, price);
    const d = detailLines(lines, x, s, c);
    for (const k of ['cost', 'amazon', 'returns'] as const) {
      const sum = (d[k] || []).reduce((a, [, v]) => a + v, 0);
      assert.ok(Math.abs(sum - g[k]) < 0.01, `${k}: ${sum} vs ${g[k]}`);
    }
  }
});

test('withSpecs fills storage and freight from Production specs, keeps own values', async () => {
  const { withSpecs, ATS_PER_CTN } = await import('../../client/src/utils/priceFloors.js');
  const s = { ...st(), skus: [{ ...sku, inbound: null, storage: null }, { ...sku, asin: 'B', item: 'FG-0038', sold: 100, inbound: 38.11, storage: null }] };
  const specs = [
    { item: 'FG-0039', L: 27.5, B: 14.7, H: 9.5, kg: 0.63, perCarton: 25, cL: 65, cB: 44, cH: 35 },
    { item: 'FG-0038', L: 33.5, B: 24, H: 9.5, kg: 0.88, perCarton: 10, cL: 65, cB: 44, cH: 35 },
  ];
  const out = withSpecs(s, specs);
  assert.equal(out.skus[0].inbound, Math.round((ATS_PER_CTN / 25) * 100) / 100);
  assert.equal(out.skus[1].inbound, 38.11); // its own value wins
  const avg = (27.5 * 14.7 * 9.5 * 100 + 33.5 * 24 * 9.5 * 100) / 200;
  assert.ok(Math.abs(out.skus[0].storage! - (s.global.storage * 27.5 * 14.7 * 9.5) / avg) < 0.01);
  assert.equal(withSpecs(s, []).skus[0].inbound, null);
});
