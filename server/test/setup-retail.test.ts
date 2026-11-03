// Setup → Offline retail & stores (client/src/data/planning/setup/retail.ts): the summary line, the selectors and the
// feedback rows agree with the engine's own numbers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr, defaultRetail, emptyGrowth, ensureGrowthGroups } from '../../client/src/data/planning/growth.ts';
import {
  newRetailType, nextOutletStep, nextStoreOpening, outletsPlanned, retailFyRows, retailTypes, storeOpenings, storesFeedback, summary, typeLabel,
} from '../../client/src/data/planning/setup/retail.ts';

const withGrowth = (fn: (p: Plan) => void = () => {}) => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  fn(p);
  return p;
};

test('retail: outlets planned and store openings are the steps summed', () => {
  const [gt, mt, pharma] = defaultRetail();
  assert.equal(outletsPlanned(gt), 32_500);
  assert.equal(outletsPlanned(mt), 1_800);
  assert.equal(outletsPlanned(pharma), 8_000);
  assert.equal(storeOpenings(undefined), 0);
  assert.equal(storeOpenings({ ...emptyGrowth().stores, openings: [{ month: 19, count: 2 }, { month: 25, count: 5 }] }), 7);
  assert.deepEqual(retailTypes(basePlan()), []);
});

test('retail: type labels are short', () => {
  const [gt, mt, pharma] = defaultRetail();
  assert.equal(typeLabel(gt), 'GT');
  assert.equal(typeLabel(mt), 'MT');
  assert.equal(typeLabel(pharma), 'pharmacy');
  assert.equal(typeLabel({ ...gt, id: 'x1', name: 'Canteen stores (CSD)' }), 'Canteen stores');
  assert.equal(typeLabel({ ...gt, id: 'x2', name: 'A very long channel name indeed' }), 'A very long chann…');
  assert.equal(typeLabel({ ...gt, id: 'x3', name: '' }), 'x3');
});

test('retail: summary for the base plan, the ₹500 Cr plan and an edited plan (≤ 90 chars)', () => {
  const base = summary(basePlan());
  assert.equal(base, 'No offline channels · stores off');

  const big = build500Cr(basePlan());
  const s = summary(big);
  assert.equal(s, 'GT, MT, pharmacy · 42,300 outlets planned · stores off');
  assert.ok(s.length <= 90);

  // a type switched off leaves the names and the count; stores on show their openings
  const edited = build500Cr(basePlan());
  edited.growth!.retail![1].on = false;
  edited.growth!.stores.on = true;
  const e = summary(edited);
  assert.equal(e, 'GT, pharmacy · 40,500 outlets planned · stores 52 openings');
  assert.ok(e.length <= 90);

  // many custom channels collapse to a count
  const many = withGrowth((p) => { p.growth!.retail = Array.from({ length: 5 }, (_, i) => ({ ...newRetailType(`c${i}`), name: `Channel number ${i}`, outlets: [{ month: 13, add: 10 }] })); });
  const m = summary(many);
  assert.equal(m, '5 channels · 50 outlets planned · stores off');
});

test('retail: a new channel starts from the GT defaults with no outlets; steps and openings extend the last one', () => {
  const t = newRetailType('tabc');
  assert.equal(t.id, 'tabc');
  assert.equal(t.name, 'New channel');
  assert.deepEqual(t.outlets, []);
  assert.equal(t.on, true);
  assert.equal(t.tradeMarginPct, defaultRetail()[0].tradeMarginPct);
  assert.deepEqual(t.units, defaultRetail()[0].units);
  // the defaults are not shared by reference
  t.units.topical = 99;
  assert.equal(defaultRetail()[0].units.topical, 6);

  assert.deepEqual(nextOutletStep(t, 54), { month: 15, add: 500 });
  t.outlets.push({ month: 52, add: 100 });
  assert.deepEqual(nextOutletStep(t, 54), { month: 54, add: 500 });

  const st = { ...emptyGrowth().stores, openings: [] as { month: number; count: number }[] };
  assert.deepEqual(nextStoreOpening(st, 54), { month: 19, count: 1 });
  st.openings.push({ month: 50, count: 3 });
  assert.deepEqual(nextStoreOpening(st, 54), { month: 54, count: 1 });
  assert.deepEqual(nextStoreOpening(st, 12), { month: 12, count: 1 });
});

test('retail: feedback rows match the engine (outlets at FY end, invoiced per FY, store revenue per FY)', () => {
  const plan = build500Cr(basePlan());
  plan.growth!.stores.on = true;
  const r = runPlan(plan);
  const types = retailTypes(plan);
  assert.equal(types.length, 3);

  let invoicedAll = 0;
  for (const t of types) {
    const rows = retailFyRows(r, t);
    assert.deepEqual(rows.map((x) => x.fy), r.years.map((y) => y.fy));
    for (const row of rows) {
      const ms = r.months.filter((m) => m.fy === row.fy);
      assert.equal(row.outlets, ms[ms.length - 1].outlets[t.id] ?? 0);
      invoicedAll += row.invoiced;
    }
    // GT has outlets live by the end: the plan's last FY shows them
    if (t.id === 'gt') assert.ok(rows[rows.length - 1].outlets > 0, 'GT outlets live at the end');
  }
  const retailTotal = r.years.reduce((a, y) => a + y.retailRevenue, 0);
  assert.ok(retailTotal > 0, 'the ₹500 Cr plan invoices offline');
  assert.ok(Math.abs(invoicedAll - retailTotal) < 1e-6 * Math.max(1, retailTotal), 'types sum to retailRevenue');

  const sf = storesFeedback(r);
  const last = r.months[r.months.length - 1];
  assert.equal(sf.stores, last.stores);
  assert.equal(sf.label, last.label);
  assert.equal(sf.stores, 52);
  assert.deepEqual(sf.byFy, r.years.map((y) => ({ fy: y.fy, revenue: y.storeRevenue })));
  assert.ok(sf.byFy.some((y) => y.revenue > 0), 'stores earn once on');
});

test('retail: feedback is safe on a plan without a growth layer', () => {
  const r = runPlan(basePlan());
  const sf = storesFeedback(r);
  assert.equal(sf.stores, 0);
  assert.equal(sf.byFy.length, r.years.length);
  const rows = retailFyRows(r, newRetailType('t1'));
  assert.ok(rows.every((x) => x.outlets === 0 && x.invoiced === 0));
});
