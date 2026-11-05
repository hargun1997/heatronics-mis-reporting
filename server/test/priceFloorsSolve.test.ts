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
