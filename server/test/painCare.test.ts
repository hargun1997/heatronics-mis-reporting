// The founder's pain-care plan (3 Nov 2026): online first for 12 months, offline from the next round, ₹100 → 250 → 500 Cr FY29–31.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { runPlan } from '../../client/src/data/planning/engine.ts';
import { buildPainCarePlan, NEXT_ROUND_MONTH, SERIES_B_MONTH } from '../../client/src/data/planning/painCare.ts';

const CR = 1e7;
const P = buildPainCarePlan(basePlan());
const R = runPlan(P);

test('pain-care plan: FY29–FY31 land on the path and FY28 is left to the launches', () => {
  const rev = Object.fromEntries(R.years.map((y) => [y.fy, y.revenue]));
  for (const [fy, t] of [['FY29', 100], ['FY30', 250], ['FY31', 500]] as const) assert.ok(Math.abs(rev[fy] / CR - t) / t < 0.01, `${fy} ${rev[fy] / CR}`);
  assert.equal(P.growth!.path!.FY28, undefined);
  assert.ok(rev.FY28 > 25 * CR && rev.FY28 < 60 * CR, `FY28 ${rev.FY28 / CR}`);
});

test('pain-care plan: year 1 is online only — no outlet revenue before the next round, new lines start GT / physio with it', () => {
  for (const m of R.months.slice(0, NEXT_ROUND_MONTH - 1)) {
    assert.ok(Object.values(m.retailByType).reduce((a, x) => a + x, 0) < 1, `outlets sold in ${m.label}`);
  }
  for (const p of P.products.filter((x) => x.on && x.growthLine && x.category !== 'device')) {
    assert.equal(p.chStart?.G, NEXT_ROUND_MONTH, `${p.name} GT start`);
    assert.equal(p.chStart?.P, NEXT_ROUND_MONTH, `${p.name} physio start`);
    assert.equal(p.retailStart, NEXT_ROUND_MONTH, `${p.name} retail start`);
  }
  const first = R.months.slice(NEXT_ROUND_MONTH + 2).find((m) => Object.values(m.retailByType).some((x) => x > 0));
  assert.ok(first, 'outlets start after the round');
});

test('pain-care plan: only hGo (a sheet SKU) launches as a device in year 1; new devices come after the round', () => {
  for (const p of P.products.filter((x) => x.on && x.category === 'device')) assert.ok(p.launchMonth > NEXT_ROUND_MONTH, `${p.name} launches M${p.launchMonth}`);
  assert.equal(P.fx!.skuTweaks.s8?.volume, 1.5); // hGo pushed
  assert.ok(P.products.filter((x) => x.on && x.category === 'topical' && x.launchMonth <= 12).length >= 2, 'topicals in year 1');
});

test('pain-care plan: founder round sizes — Series A ₹30 Cr at the round month, Series B ₹100 Cr 18 months later', () => {
  const a = P.growth!.rounds.find((r) => r.id === 'bench-a')!;
  const b = P.growth!.rounds.find((r) => r.id === 'bench-b')!;
  assert.equal(a.month, NEXT_ROUND_MONTH);
  assert.equal(a.amount, 30 * CR);
  assert.equal(b.month, SERIES_B_MONTH);
  assert.equal(b.amount, 100 * CR);
  assert.equal(P.fx!.seed.amount, 8 * CR);
  assert.ok(a.preMoney >= 50 * CR && a.preMoney < 300 * CR, `pre ${a.preMoney / CR}`);
  assert.equal(a.confirmed, false);
  // fundTheGap kept it and sized the rest after it
  for (const r of P.growth!.rounds) assert.ok(r.month >= NEXT_ROUND_MONTH, `${r.name} M${r.month}`);
});

test('pain-care plan: branding and the ₹15–20 L capex are booked in the first quarter', () => {
  const brand = P.growth!.capex.find((x) => x.group === 'Brand & Creative Build')!;
  const now = P.growth!.capex.find((x) => x.group === 'Plant & Machinery' && x.month <= 3)!;
  assert.ok(brand && brand.month <= 3 && brand.amount === 50e5);
  assert.ok(now && now.amount >= 15e5 && now.amount <= 20e5);
});
