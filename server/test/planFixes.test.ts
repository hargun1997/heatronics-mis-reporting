// Engine mechanics from the 9 Nov 2026 review of the pain-care plan: capacity in pad-equivalents + lost sales, receivable days per
// channel, GST refund per Rule 89(5), the Tally opening balance sheet, share-issue costs as capital, contract-maker advances and the
// overheads (warehouses, office, Plant 2 building). Each is a switch: absent = the engine as before (sheet parity in planning.test.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { calOf, CHANNELS, runPlan, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { defaultCapacityWeights, emptyGrowth, ensureGrowthGroups } from '../../client/src/data/planning/growth.ts';
import { applyTallyOpening } from '../../client/src/data/planning/opening.ts';
import { buildPainCarePlan, painCareReceivableDays, SPACE } from '../../client/src/data/planning/painCare.ts';
import type { StatementMonthIn, TbRowIn } from '../../client/src/data/statements/statements.ts';

const CR = 1e7;
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const withGrowth = (fn: (p: Plan) => void = () => {}) => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  fn(p);
  return p;
};
const pick = (p: Plan) => runPlan(p).months.map((m) => [m.netRevenue, m.ebitda, m.closingCash, m.receivables, m.payables, m.gstAsset]);

test('fixes: every new switch absent = every month as before', () => {
  const a = basePlan();
  const b = basePlan();
  b.fx = { ...b.fx!, capacityCaps: false, gstRefundRule: 'goods-first', fundraiseAsCapital: false };
  assert.deepEqual(pick(b), pick(a));
  const r = runPlan(a);
  assert.ok(r.months.every((m) => m.equityCosts === 0 && m.unitsShort === 0 && m.inHousePadEq === m.inHouseUnits));
});

test('capacity: utilisation in pad-equivalents, Dec / Jan ship 1.9 × capacity, lost sales reported but revenue untouched', () => {
  const raw = withGrowth((p) => { p.growth!.baseCapacity = 3_000; });
  const pad = withGrowth((p) => { p.growth!.baseCapacity = 3_000; p.growth!.capacityWeights = defaultCapacityWeights(p); p.growth!.peakShift = 1.9; });
  const rr = runPlan(raw).months, rp = runPlan(pad).months;
  const w = defaultCapacityWeights(pad);
  assert.equal(w.s0, 2.5); assert.equal(w.s1, 1); assert.equal(w.s4, 1.25); assert.equal(w.s5, 2.5); assert.equal(w.s6, 2.5); assert.equal(w.s8, 2.5);
  for (let i = 0; i < rp.length; i++) {
    const m = rp[i];
    const padEq = pad.skus.reduce((a, s) => a + (m.unitsBySku[s.id] ?? 0) * w[s.id], 0)
      + pad.products.filter((x) => x.on && (x.inHouse ?? x.category === 'device')).reduce((a, x) => a + (m.unitsBySku[x.id] ?? 0) * (w[x.id] ?? 1), 0);
    assert.ok(near(m.inHousePadEq, padEq), `${m.label} pad-eq`);
    assert.ok(near(m.utilisation, m.inHousePadEq / m.capacity), `${m.label} utilisation`);
    const peak = [11, 0].includes(calOf(pad.startMonth, m.m));
    assert.ok(near(m.unitsShort, Math.max(0, m.inHousePadEq - 3_000 * (peak ? 1.9 : 1))), `${m.label} short`);
    assert.ok(near(m.netRevenue, rr[i].netRevenue), 'not capped by default');
    assert.ok(near(rr[i].inHousePadEq, rr[i].inHouseUnits), 'no weights = raw units');
  }
  assert.ok(rp.some((m) => m.revenueShort > 0));
  // the cap removes exactly the reported list revenue
  const capped = structuredClone(pad); capped.fx!.capacityCaps = true;
  const rc = runPlan(capped).months;
  const list = (m: (typeof rc)[number]) => CHANNELS.reduce((a, c) => a + m.revenueByChannel[c], 0) + m.gtMarginNetted + m.retailRevenue + m.storeRevenue;
  for (let i = 0; i < rc.length; i++) assert.ok(near(list(rp[i]) - list(rc[i]), rp[i].revenueShort, 1e-6), `${rc[i].label} cap`);
  assert.ok(rc.every((m) => m.utilisation <= (([11, 0].includes(calOf(pad.startMonth, m.m))) ? 1.9 : 1) + 1e-9));
});

test('receivables: days per channel; every channel at the old number = as before', () => {
  const same = basePlan();
  same.cash.receivableDaysByChannel = { A: 7, D: 7, F: 7, G: 7, P: 7, retail: 7, stores: 7 };
  const x = pick(same), y = pick(basePlan());
  x.forEach((row, i) => row.forEach((v, j) => assert.ok(near(v, y[i][j], 1e-9), `month ${i + 1} col ${j}`)));
  const p = basePlan();
  p.cash.receivableDaysByChannel = painCareReceivableDays();
  const d = p.cash.receivableDaysByChannel;
  assert.equal(d.A, 20); assert.equal(d.F, 15); assert.equal(d.G, 45); assert.equal(d.retail, 45); assert.equal(d.D, 7.8);
  for (const m of runPlan(p).months) {
    const want = CHANNELS.reduce((a, ch) => a + (m.revenueByChannel[ch] / 30) * (d[ch] ?? 7), 0) + (m.retailRevenue / 30) * 45 + (m.storeRevenue / 30) * 0;
    assert.ok(near(m.receivables, want), m.label);
  }
});

test('GST: Rule 89(5) refunds Net ITC (goods) less the output tax apportioned over goods + services ITC; services ITC never in cash', () => {
  const p = basePlan();
  p.fx!.gstRefundRule = 'rule89';
  const r89 = runPlan(p).months, old = runPlan(basePlan()).months;
  for (const m of r89) {
    const all = m.itcGoods + m.itcServices;
    const max89 = m.itcGoods - (all > 0 ? m.outputGst * m.itcGoods / all : 0);
    const unused = all - m.gstSetOffServices - m.gstSetOffGoods;
    assert.ok(near(m.gstClaimable, Math.max(0, Math.min(max89, unused))), m.label);
    assert.ok(m.gstClaimable <= m.itcGoods + 1e-6);
    assert.ok(near(m.gstStuck, unused - m.gstClaimable));
  }
  const sum = (ms: typeof r89, k: 'gstRefund') => ms.reduce((a, m) => a + m[k], 0);
  assert.ok(sum(r89, 'gstRefund') < sum(old, 'gstRefund'), 'less cash back than goods-first');
});

// a tied Sep-26 Trial Balance (made-up figures, Tally's group names)
const g = (name: string, bal: number): TbRowIn => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const l = (name: string, bal: number): TbRowIn => ({ ...g(name, bal), level: 'ledger' });
function sep26(): StatementMonthIn {
  const rows = [
    g('Capital Account', -3e7), l('Share Capital', -3e7),
    g('Loans (Liability)', -1.2e7), l('Term Loan', -1.2e7),
    g('Current Liabilities', -0.9e7), l('Sundry Creditors', -0.9e7),
    g('Fixed Assets', 2e7), l('Plant & Machinery', 2e7),
    g('Current Assets', 1.1e7), l('Bank Accounts', 0.5e7), l('Sundry Debtors', 0.6e7),
    g('Sales Accounts', -5e7), g('Indirect Expenses', 4.5e7),
  ];
  const sum = rows.filter((r) => r.level === 'group').reduce((s, r) => s + r.debit - r.credit, 0);
  rows.push(g('Opening Stock', -sum));
  return { period: '2026-09', asOf: '2026-10-05T10:00:00Z', tb: { rows, difference: 0, basis: 'fy-to-date' }, closingStock: 1.8e7, depreciation: 0, nettProfit: null };
}

test('opening: the Tally Sep-26 balance sheet replaces the sheet placeholders; without it the 0s stay and the flag says so', () => {
  const p = basePlan();
  const none = applyTallyOpening(p, null);
  assert.equal(none.openingIsPlaceholder, true);
  assert.equal(none.plan, p);
  assert.equal(runPlan(p).openingIsPlaceholder, true);
  const got = applyTallyOpening(p, [sep26()]);
  assert.equal(got.openingIsPlaceholder, false);
  const o = got.plan.fx!.opening;
  assert.equal(o.source, 'tally');
  assert.equal(o.cash, 0.5e7); assert.equal(o.receivables, 0.6e7); assert.equal(o.payables, 0.9e7); assert.equal(o.inventory, 1.8e7); assert.equal(o.debt, 1.2e7);
  assert.equal(p.fx!.opening.source, 'sheet', 'pure: the input plan is unchanged');
  const r = runPlan(got.plan);
  assert.equal(r.openingIsPlaceholder, false);
  assert.ok(near(r.months[0].closingCash - r.months[0].netCashFlow - r.months[0].equity - r.months[0].debtNet, 0.5e7, 1e-9));
  // the pain-care plan takes it when supplied
  const pc = buildPainCarePlan(basePlan(), { statements: [sep26()], fixes: ['opening'] });
  assert.equal(pc.fx!.opening.source, 'tally');
  assert.equal(buildPainCarePlan(basePlan(), { fixes: ['opening'] }).fx!.opening.source, 'sheet');
});

test('opening: an opening GST credit is refunded with the first Rule 89 cycle (it used to be stranded)', () => {
  const p = basePlan();
  p.fx!.gstRefundRule = 'rule89';
  const q = structuredClone(p); q.fx!.opening.gstAsset = 0.5e7;
  const a = runPlan(p).months, b = runPlan(q).months, lag = p.cash.refundLagMonths;
  assert.ok(near(b[lag - 1].gstRefund - a[lag - 1].gstRefund, 0.5e7));
});

test('fundraise as capital: round costs come off the equity, not the P&L; cash month by month unchanged', () => {
  const mk = (cap: boolean) => withGrowth((p) => {
    p.growth!.rounds.push({ id: 'r', name: 'A', on: true, month: 12, amount: 30 * CR, preMoney: 100 * CR, feePct: 0.03, confirmed: true });
    p.fx!.fundraiseAsCapital = cap;
  });
  const a = runPlan(mk(false)).months, b = runPlan(mk(true)).months;
  for (let i = 0; i < a.length; i++) assert.ok(near(b[i].equityCosts + b[i].fundraiseCosts, a[i].fundraiseCosts), a[i].label);
  assert.ok(near(b[11].equityCosts, 0.03 * 30 * CR));
  assert.equal(b[11].fundraiseCosts, 0);
  assert.ok(near(b[11].pbt - a[11].pbt, 0.03 * 30 * CR, 1e-6));
  // tax rises with the PBT (FY basis), otherwise the cash is the same
  for (let i = 0; i < a.length; i++) assert.ok(near(b[i].closingCash + b.slice(0, i + 1).reduce((s, m) => s + m.tax, 0), a[i].closingCash + a.slice(0, i + 1).reduce((s, m) => s + m.tax, 0), 1e-6), a[i].label);
});

test('advances: a contract-made line paid 50 % with the PO gets no supplier credit and carries a prepayment', () => {
  const prod = (adv: number) => withGrowth((p) => {
    p.products.push({ id: 'cm', name: 'Cream', on: true, asp: 400, launchMonth: 3, launchUnits: 5_000, rampPct: 0.05, steadyPct: 0.3, split: { A: 0.5, D: 0.5, F: 0, G: 0, P: 0 }, cogsPct: 0.3, category: 'topical', inHouse: false, growthLine: true, advancePct: adv });
  });
  const zero = runPlan(prod(0)).months, half = runPlan(prod(0.5)).months;
  const P = prod(0.5);
  assert.deepEqual(zero.map((m) => m.payables), runPlan(prod(0)).months.map((m) => m.payables));
  for (let i = 0; i < half.length - 1; i++) {
    const m = half[i], next = half[i + 1];
    const mat = (x: typeof m) => (x.revenueBySku.cm ?? 0) * 0.3;
    const share = Math.min(1, mat(m) / m.stdCogs);
    const want = -Math.max(0, m.inventoryPurchase) * (1 - share) / 30 * P.cash.payableDays + mat(next) * 0.5;
    assert.ok(near(m.payables, want), m.label);
  }
  assert.ok(half[5].payables > zero[5].payables, 'less credit, more cash tied up');
});

test('overheads: pain-care warehouses and office sized from its stock and headcount; Plant 2 building tied to its capacity block', () => {
  const P = buildPainCarePlan(basePlan(), { fixes: ['overheads'] });
  const oh = P.growth!.overheads!;
  const plant = P.growth!.capacity.find((c) => /plant 2/i.test(c.name))!;
  const b = oh.find((o) => /plant 2 building/i.test(o.name))!;
  assert.equal(b.month, plant.month + plant.leadMonths - SPACE.plant2LeadMonths);
  assert.equal(b.sqft! * b.rentPerSqft!, 18e5);
  assert.equal(b.sqft! * b.rentPerSqft! * b.depositMonths!, 1.08 * CR);
  assert.equal(b.fitout, 2.5 * CR);
  assert.ok(oh.some((o) => /warehouse/i.test(o.name)), 'warehouses');
  assert.ok(oh.some((o) => /office/i.test(o.name)), 'office');
  assert.ok(oh.every((o) => o.month >= 7), 'nothing in the lean phase');
  const r = runPlan(P).months;
  assert.ok(near(r[b.month - 1].groups['Intangibles & Deposits'] ?? 0, 1.08 * CR + oh.filter((o) => o.month === b.month && o !== b).reduce((a, o) => a + o.sqft! * o.rentPerSqft! * o.depositMonths!, 0), 1e-6));
  assert.ok((r[b.month].groups['Manufacturing Overhead'] ?? 0) - (runPlan(buildPainCarePlan(basePlan(), { fixes: [] })).months[b.month].groups['Manufacturing Overhead'] ?? 0) >= 18e5 - 1);
});

test('pain-care with every fix: founder rounds kept, lost sales and any cash past the CC limit are shown, not hidden', () => {
  const P = buildPainCarePlan(basePlan());
  const R = runPlan(P);
  assert.equal(P.fx!.gstRefundRule, 'rule89');
  assert.equal(P.fx!.fundraiseAsCapital, true);
  assert.ok(!P.fx!.capacityCaps, 'reported, not capped');
  assert.ok(P.products.filter((x) => x.growthLine && x.inHouse === false).every((x) => x.advancePct === 0.5));
  const a = P.growth!.rounds.find((r) => r.id === 'bench-a')!, b = P.growth!.rounds.find((r) => r.id === 'bench-b')!;
  assert.equal(a.month, 12); assert.ok(a.amount >= 30 * CR && a.amount <= 40 * CR); assert.equal(b.month, 34); assert.equal(b.amount, 100 * CR);
  const dec27 = R.months.find((m) => m.label === 'Dec-27')!;
  assert.ok(dec27.unitsShort > 0 && dec27.revenueShort > 0, 'Dec-27 peak beyond the line');
  const limit = P.fx!.overdraft.limit!;
  for (const m of R.months) assert.ok(near(m.overdraftOverLimit, Math.max(0, -m.closingCash - limit)));
  assert.equal(R.openingIsPlaceholder, true, 'no Tally payload in the test');
});
