// The founder's pain-care plan (3 Nov 2026, lean first since 7 Nov 2026): lean to Mar-27, scale from Apr-27, offline from Jan-28,
// ₹100 → 250 → 500 Cr FY29–31, cash never past the ₹2 Cr CC limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFounderDecisions, basePlan } from '../../client/src/data/planning/basePlan.ts';
import { runPlan } from '../../client/src/data/planning/engine.ts';
import { dilution, roundStats } from '../../client/src/data/planning/growth.ts';
import {
  buildPainCarePlan, LEAN_HIRE_ROLES, LEAN_UNTIL, OFFLINE_MONTH, OVERDRAFT_LIMIT_CR, SCALE_FROM, SERIES_A_MONTH, SERIES_B_MONTH,
} from '../../client/src/data/planning/painCare.ts';

const CR = 1e7;
const P = buildPainCarePlan(basePlan());
const R = runPlan(P);
// the base with the founder decisions and no growth layer = "like today"
const B0 = basePlan();
applyFounderDecisions(B0);
B0.fx!.sheetParity = false;
const RB = runPlan(B0);

test('pain-care plan: FY29–FY31 land on the path and FY28 is left to the launches', () => {
  const rev = Object.fromEntries(R.years.map((y) => [y.fy, y.revenue]));
  for (const [fy, t] of [['FY29', 100], ['FY30', 250], ['FY31', 500]] as const) assert.ok(Math.abs(rev[fy] / CR - t) / t < 0.01, `${fy} ${rev[fy] / CR}`);
  assert.equal(P.growth!.path!.FY28, undefined);
  assert.ok(rev.FY28 > 25 * CR && rev.FY28 < 60 * CR, `FY28 ${rev.FY28 / CR}`);
});

test('pain-care plan: lean to Mar-27 — no growth hires before Apr-27 except the two topical roles, in seat by Nov-26', () => {
  assert.equal(P.growth!.leanUntil, LEAN_UNTIL);
  assert.equal(SCALE_FROM, 7);
  for (const h of P.growth!.hires.filter((x) => x.on !== false && x.month < SCALE_FROM)) assert.ok(LEAN_HIRE_ROLES.includes(h.role), `${h.role} hired M${h.month}`);
  for (const role of LEAN_HIRE_ROLES) assert.ok(P.growth!.hires.find((h) => h.role === role)!.month <= 2, role);
  assert.ok(R.months.slice(0, LEAN_UNTIL).every((m) => m.growthHeadcount <= LEAN_HIRE_ROLES.length));
});

test('pain-care plan: lean to Mar-27 — marketing and current-range volumes as today, only the rebrand and ₹17.5 L capex committed', () => {
  for (let i = 0; i < LEAN_UNTIL; i++) {
    const a = R.months[i], b = RB.months[i];
    for (const g of ['Performance Marketing', 'Brand Marketing', 'Marketing Production & Creative']) {
      assert.ok((a.groups[g] ?? 0) <= (b.groups[g] ?? 0) + 1, `${g} ${a.label}: ${a.groups[g]} vs today ${b.groups[g]}`);
    }
    for (const s of P.skus) assert.ok(Math.abs((a.unitsBySku[s.id] ?? 0) - (b.unitsBySku[s.id] ?? 0)) < 1e-6, `${s.name} ${a.label}: no device push yet`);
  }
  // the push starts with the scale phase
  assert.ok(R.months[SCALE_FROM - 1].unitsBySku.s8 > RB.months[SCALE_FROM - 1].unitsBySku.s8 * 1.4);
  const lean = P.growth!.capex.filter((x) => x.on && x.month <= LEAN_UNTIL);
  const brand = lean.filter((x) => x.group === 'Brand & Creative Build');
  assert.ok(brand.every((x) => x.month >= 3 && x.month <= 5));
  assert.ok(Math.abs(brand.reduce((a, x) => a + x.amount, 0) - 50e5) < 1);
  const plant = lean.filter((x) => x.group === 'Plant & Machinery');
  assert.equal(plant.length, 1);
  assert.ok(plant[0].amount >= 15e5 && plant[0].amount <= 20e5);
  assert.equal(lean.length, brand.length + plant.length, 'nothing else committed in the lean phase');
  assert.ok(P.growth!.capacity.every((c) => c.month >= OFFLINE_MONTH));
});

test('pain-care plan: topicals — cream Mar-27, roll-on Jun-27, oil after Oct-27; later launches at most one a quarter', () => {
  const at = (pid: string) => P.products.find((x) => x.id === pid)!.launchMonth;
  assert.equal(at('p-cream'), 6);
  assert.equal(at('p-rollon'), 9);
  assert.ok(at('g-oil') > 13);
  const later = P.products.filter((x) => x.on && x.growthLine && !['p-cream', 'p-rollon', 'g-oil'].includes(x.id)).map((x) => x.launchMonth).sort((a, b) => a - b);
  assert.ok(later[0] > SERIES_A_MONTH, 'the rest of the range after the Series A');
  for (let i = 1; i < later.length; i++) assert.ok(later[i] - later[i - 1] >= 3, `launches M${later[i - 1]} and M${later[i]}`);
  for (const p of P.products.filter((x) => x.on && x.category === 'device')) assert.ok(p.launchMonth > OFFLINE_MONTH, `${p.name} launches M${p.launchMonth}`);
  assert.equal(P.fx!.skuTweaks.s8?.volume, 1.5); // hGo pushed (from the scale phase)
});

test('pain-care plan: online only until Jan-28 — no outlet revenue before, and never a product before its launch', () => {
  for (const m of R.months.slice(0, OFFLINE_MONTH - 1)) assert.ok(Object.values(m.retailByType).reduce((a, x) => a + x, 0) < 1, `outlets sold in ${m.label}`);
  for (const p of P.products.filter((x) => x.on && x.growthLine && x.category !== 'device')) {
    assert.equal(p.chStart?.G, OFFLINE_MONTH, `${p.name} GT start`);
    assert.equal(p.chStart?.P, OFFLINE_MONTH, `${p.name} physio start`);
  }
  for (const p of P.products.filter((x) => x.on && x.growthLine)) {
    for (const m of R.months.slice(0, p.launchMonth - 1)) assert.ok((m.unitsBySku[p.id] ?? 0) < 1e-9, `${p.name} sells in ${m.label} before its launch`);
  }
  assert.ok(R.months.slice(OFFLINE_MONTH).some((m) => Object.values(m.retailByType).some((x) => x > 0)), 'outlets start');
});

test('pain-care plan: key hires 3 months before what they serve; a finance controller before the Series A', () => {
  const hire = (re: RegExp) => P.growth!.hires.find((h) => re.test(h.role))!;
  assert.ok(hire(/Head of offline sales/).month <= OFFLINE_MONTH - 3);
  assert.ok(hire(/Finance controller/).month <= Math.min(13, SERIES_A_MONTH - 3));
  assert.ok(hire(/Nutraceuticals/).month <= P.products.find((x) => x.id === 'g-joint')!.launchMonth - 3);
});

test('pain-care plan: seed ₹8 Cr Jan-27 at ₹23 Cr pre, its 5% cost paid with it and labelled seed', () => {
  assert.equal(P.fx!.seed.amount, 8 * CR);
  assert.equal(P.fx!.seed.month, 4);
  assert.equal(P.growth!.seedPreMoney, 23 * CR);
  const seed = dilution(P).find((d) => d.name === 'Seed')!;
  assert.ok(Math.abs(seed.sold - 8 / 31) < 1e-9);
  assert.equal(R.months[0].lines.e378, 0, 'not booked in Oct-26');
  assert.ok(Math.abs(R.months[3].lines.e378 - 0.05 * 8 * CR) < 1);
  assert.equal(P.lines.find((l) => l.id === 'e378')!.milestone, 'Seed');
});

// Before the 9 Nov 2026 engine fixes (receivables per channel, Rule 89, advances, overheads) the founder's rounds fit inside the CC limit;
// with them the plan shows the gap instead (planFixes.test.ts). These checks hold the founder's round mechanics on the old basis.
const P0 = buildPainCarePlan(basePlan(), { fixes: [] });
const R0 = runPlan(P0);
test('pain-care plan (before the engine fixes): cash never past the ₹2 Cr CC limit; Series A ₹30–40 Cr with no bridge; Series B ₹100 Cr', () => {
  const P = P0, R = R0;
  const low = Math.min(...R.months.map((m) => m.closingCash));
  assert.ok(low >= -OVERDRAFT_LIMIT_CR * CR, `min cash ${low / CR}`);
  assert.equal(P.fx!.overdraft.limit, 2 * CR);
  assert.ok(R.months.every((m) => m.overdraftOverLimit === 0));
  const a = P.growth!.rounds.find((r) => r.id === 'bench-a')!;
  const b = P.growth!.rounds.find((r) => r.id === 'bench-b')!;
  assert.equal(a.month, SERIES_A_MONTH);
  assert.ok(a.amount >= 30 * CR && a.amount <= 40 * CR, `A ${a.amount / CR}`);
  assert.ok(a.preMoney >= 50 * CR && a.preMoney < 300 * CR, `pre ${a.preMoney / CR}`);
  assert.equal(a.confirmed, false);
  assert.equal(b.month, SERIES_B_MONTH);
  assert.equal(b.amount, 100 * CR);
  assert.ok(!P.growth!.rounds.some((r) => r.on && r.month > a.month && r.month < b.month), 'no bridge between the A and the B');
  // each round's runway is counted on its own cash (the later rounds switched off)
  const st = roundStats(P, R);
  assert.equal(typeof st.find((s) => s.id === 'bench-a')!.runway, 'number');
});
