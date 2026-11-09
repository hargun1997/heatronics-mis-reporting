// Price floors v2: the ₹1,000 referral band, the FBM courier route, unsellable returns and 1P (no reseller margin).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bandAdvice, bandLine, detailLines, groupLines, isFirstParty, marginAt, resellerOf, routeTag, solve, unsellOf, waterfallRows, withSpecs,
  DEFAULT_GLOBAL, type FloorSettings, type FloorSku,
} from '../../client/src/utils/priceFloors.js';
import { buildFloorsPdf } from '../../client/src/utils/priceFloorsExport.js';

// hCore X Lite, the worked example: asp ₹662, material ₹318.51 + conversion ₹74.45, FBA ₹151.72 incl. GST, referral 10%,
// returns 38 of 159, freight to FC ₹14.43, storage ₹15.
const xl: FloorSku = { asin: 'B0CZK16SYF', name: 'hCore X Lite', sku: 's', item: 'FG-0039', asp: 662, sold: 159, returned: 38, fba: 151.72, admin: 103.67, refPct: 0.1, tacos: null, inbound: 14.43, storage: 15, reportId: null };
const st = (g: Partial<FloorSettings['global']> = {}, skus: FloorSku[] = [xl]): FloorSettings => ({ global: { ...DEFAULT_GLOBAL, ...g }, skus, updatedAt: null, updatedBy: null });
const c = { material: 318.51, conversion: 74.45 };

test('marginAt(solve price) = the target margin; solve is unchanged in shape', () => {
  const s = st();
  const { price, lines } = solve(xl, s, c, 0, 0.1);
  assert.ok(price < 1000);
  assert.ok(Math.abs(lines.margin - 0.08 * price / 1.05) < 0.05);
  assert.ok(Math.abs(marginAt(xl, s, c, 0, 0.1, price).margin - lines.margin) < 1e-9);
});

test('band: ₹999 margin, dead zone ₹1,000 → X, X earns at least as much and X − 1 less', () => {
  const s = st();
  const a = bandAdvice(xl, s, c, 0, 0.1);
  assert.equal(a.below, 999);
  assert.ok(Math.abs(a.belowMargin - marginAt(xl, s, c, 0, 0.1, 999).margin) < 1e-9);
  assert.ok(a.deadTo != null && a.deadTo > 1000);
  assert.ok(marginAt(xl, s, c, 0, 0.1, a.deadTo!).margin >= a.belowMargin);
  assert.ok(marginAt(xl, s, c, 0, 0.1, a.deadTo! - 1).margin < a.belowMargin);
  assert.ok(marginAt(xl, s, c, 0, 0.1, 1000).margin < a.belowMargin); // the referral + closing step
  assert.equal(a.priceAtBelow, false); // today ₹662 is under the band: the normal action stands
  assert.match(bandLine(a), /^Band: ₹999 keeps ₹\d+; avoid ₹1,000–₹1,\d{3}$/);
});

test('band: today in the dead zone and the floor under ₹999 → Price at ₹999', () => {
  const s = st();
  const at1050 = bandAdvice({ ...xl, asp: 1050 }, s, c, 0, 0.1);
  assert.equal(at1050.priceAtBelow, true);
  const past = bandAdvice({ ...xl, asp: 1400 }, s, c, 0, 0.1); // above X: keep it
  assert.equal(past.priceAtBelow, false);
  // a product whose floor is above the band never gets ₹999
  const dear = bandAdvice({ ...xl, asp: 1050 }, s, { material: 900, conversion: 100 }, 0, 0.1);
  assert.ok(dear.floor > 999);
  assert.equal(dear.priceAtBelow, false);
});

test('FBM: courier per order replaces FBA fee, storage and freight; labelled in the waterfall', () => {
  const s = st({ fbmPerKg: 45, fbmMin: 70 });
  const solo = { ...xl, item: 'FG-0044', name: 'hCore BW Solo', asp: 2829, fba: 34.33, route: 'FBM' as const, chargeKg: 4.15 };
  const r = solve(solo, s, c, 0, 0.1);
  assert.equal(r.lines.fba, 45 * 4.15);
  assert.equal(r.lines.storage, 0);
  assert.equal(r.lines.placement + r.lines.transport, 0);
  const light = solve({ ...solo, chargeKg: 0.5 }, s, c, 0, 0.1);
  assert.equal(light.lines.fba, 70); // the minimum
  const d = detailLines(r.lines, solo, s, c);
  assert.match(d.amazon![0][0], /Courier per order \(FBM, 4\.15 kg/);
  assert.ok(d.amazon!.some(([n]) => /Easy Ship/.test(n)));
  const g = groupLines(r.lines, r.price);
  for (const k of ['amazon', 'returns'] as const) {
    const sum = (d[k] || []).reduce((a, [, v]) => a + v, 0);
    assert.ok(Math.abs(sum - g[k]) < 0.01, `${k}: ${sum} vs ${g[k]}`);
  }
  assert.equal(waterfallRows(s, solo).find((w) => w.k === 'amazon')!.label, 'Amazon fees + courier (FBM)');
  assert.equal(routeTag(solo, s), 'FBM');
});

test('withSpecs takes route and chargeable kg from Production specs; FBM gets no FBA storage / freight', () => {
  const s = st({}, [{ ...xl, inbound: null, storage: null }, { ...xl, asin: 'S', item: 'FG-0044', inbound: null, storage: null }]);
  const out = withSpecs(s, [
    { item: 'FG-0039', L: 27.5, B: 14.7, H: 9.5, kg: 0.63, perCarton: 25, cL: 65, cB: 44, cH: 35, route: 'FBA', chargeKg: 0.77 },
    { item: 'FG-0044', L: 46.5, B: 37.2, H: 12, kg: 2.09, perCarton: 4, cL: 52, cB: 50, cH: 44, route: 'FBM' },
  ]);
  assert.equal(out.skus[0].route, 'FBA');
  assert.equal(out.skus[0].chargeKg, 0.77);
  assert.ok(out.skus[0].storage! > 0);
  assert.equal(out.skus[1].route, 'FBM');
  assert.equal(out.skus[1].chargeKg, Math.round(Math.max(2.09, (46.5 * 37.2 * 12) / 5000) * 100) / 100);
  assert.equal(out.skus[1].storage, null); // FBM: none filled
});

test('unsellable share: setting read, clamped, raises the floor', () => {
  assert.equal(unsellOf(st()), 0);
  assert.equal(unsellOf(st({ unsell: 0.25 })), 0.25);
  assert.equal(unsellOf(st({ unsell: 3 })), 1);
  const s = st({ unsell: 0.25 });
  assert.ok(solve(xl, s, c, unsellOf(s), 0.1).price > solve(xl, s, c, 0, 0.1).price);
});

test('1P: per-SKU toggle beats the global default; no reseller margin', () => {
  const on = st(); // own-brand pays 3P margin (current behaviour)
  assert.equal(isFirstParty(xl, on), false);
  assert.equal(resellerOf(xl, on), 0.04);
  assert.equal(isFirstParty({ ...xl, firstParty: true }, on), true);
  const off = st({ ownPays3p: false });
  assert.equal(isFirstParty(xl, off), true);
  assert.equal(isFirstParty({ ...xl, firstParty: false }, off), false);
  const p3 = solve(xl, on, c, 0, 0.1);
  const p1 = solve({ ...xl, firstParty: true }, on, c, 0, 0.1);
  assert.ok(p1.price < p3.price);
  assert.equal(p1.lines.resellerEx, 0);
  assert.ok(!waterfallRows(on, { ...xl, firstParty: true }).some((w) => w.k === 'reseller'));
  assert.ok(waterfallRows(on, xl).some((w) => w.k === 'reseller'));
});

test('PDF: band action, FBM tag and band line; text stays inside the page', () => {
  const calls: { x: number; y: number }[] = [];
  const skus = [
    { ...xl, asp: 1050 },
    ...Array.from({ length: 5 }, (_, i) => ({ ...xl, asin: `A${i}`, name: `P${i}` })),
    { ...xl, asin: 'S', item: 'FG-0039', name: 'hCore BW Solo', route: 'FBM' as const, chargeKg: 4.15 },
  ];
  const s = st({}, skus);
  const products = [{ item: 'FG-0039', name: 'X Lite', bom: '', material: c.material, conversion: c.conversion, cost: 393, chg1: null }];
  const r = buildFloorsPdf({ skus, settings: s, products, costs: null, feeReport: null, tacos: 0.1 });
  assert.equal(r.written, 7);
  const raw = r.pdf.output();
  assert.ok(raw.includes('Price at Rs 999'));
  assert.ok(raw.includes('hCore BW Solo  FBM'));
  assert.ok(raw.includes('Fees + courier \\(FBM\\)') || raw.includes('Fees + courier (FBM)'));
  assert.ok(/Band: Rs 999 keeps Rs \d+; avoid Rs 1,000-Rs 1,\d{3}/.test(raw));
  // every text position on every page sits inside A4 landscape with the 12 mm margin (y in pt from the top in the stream)
  const k = 72 / 25.4;
  for (const m of raw.matchAll(/([\d.]+) ([\d.]+) Td/g)) calls.push({ x: Number(m[1]) / k, y: 210 - Number(m[2]) / k });
  assert.ok(calls.length > 50);
  for (const p of calls) assert.ok(p.x >= 11 && p.x <= 286 && p.y >= 11 && p.y <= 205, `text at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`);
});
