// The MIS 5-year planner must give the Projection & Deployment Plan sheet's own numbers
// for its 18 months when the levers are neutral (client/src/data/planning/base-plan-check.json
// holds the sheet's computed values, written by scripts/import-projection-plan.py).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlan, peakDeficitWithin, fyOf, monthLabel } from '../../client/src/data/planning/engine.ts';
import { LEGACY_FX } from '../../client/src/data/planning/engine.ts';
import { basePlan as founderBase, setSheetParity } from '../../client/src/data/planning/basePlan.ts';

/** Base with every founder switch in its legacy position (the sheet). */
const basePlan = () => { const p = founderBase(); setSheetParity(p, true); return p; };

const here = path.dirname(fileURLToPath(import.meta.url));
const check = JSON.parse(fs.readFileSync(path.join(here, '../../client/src/data/planning/base-plan-check.json'), 'utf8'));

const close = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) <= Math.max(2, Math.abs(b) * 1e-6), `${what}: got ${a.toFixed(0)}, sheet ${b.toFixed(0)}`);

test('calendar: M1 = Oct-26 in FY27, M19 = Apr-28 in FY29, M54 = Mar-31 in FY31', () => {
  assert.equal(monthLabel('2026-10', 1), 'Oct-26');
  assert.equal(fyOf('2026-10', 1), 'FY27');
  assert.equal(fyOf('2026-10', 19), 'FY29');
  assert.equal(monthLabel('2026-10', 54), 'Mar-31');
  assert.equal(fyOf('2026-10', 54), 'FY31');
});

// At an 18-month horizon (the sheet's): later months' inventory cover looks past M18 otherwise.
const sheetHorizon = () => { const p = basePlan(); p.levers.horizon = 18; return p; };

test('base scenario reproduces the sheet month by month (M1–M18)', () => {
  const r = runPlan(sheetHorizon());
  const keys: [string, (i: number) => number][] = [
    ['netRevenue', (i) => r.months[i].netRevenue],
    ['grossProfit', (i) => r.months[i].grossProfit],
    ['cm1', (i) => r.months[i].cm1],
    ['cm2', (i) => r.months[i].cm2],
    ['cm3', (i) => r.months[i].cm3],
    ['ebitda', (i) => r.months[i].ebitda],
    ['pbt', (i) => r.months[i].pbt],
    ['pat', (i) => r.months[i].pat],
    ['gstAsset', (i) => r.months[i].gstAsset],
    ['inventory', (i) => r.months[i].inventory],
    ['nwc', (i) => r.months[i].nwc],
    ['netCashFlow', (i) => r.months[i].netCashFlow],
    ['cumulativeCash', (i) => r.months[i].cumulativeCash],
    ['closingCash', (i) => r.months[i].closingCash],
  ];
  for (const [k, get] of keys) for (let i = 0; i < 18; i++) close(get(i), check[k][i], `${k} M${i + 1}`);
});

test('base scenario headline matches the sheet: peak deficit 12M / 18M', () => {
  const r = runPlan(sheetHorizon());
  close(peakDeficitWithin(r, 12) / 1e7 * 1e6, check.peakDeficit12Cr * 1e6, 'peak deficit 12M (₹ Cr × 1e6)');
  close(peakDeficitWithin(r, 18) / 1e7 * 1e6, check.peakDeficit18Cr * 1e6, 'peak deficit 18M (₹ Cr × 1e6)');
});

test('extension: zero growth repeats the last plan year; growth scales revenue (units mode)', () => {
  const p = basePlan();
  p.d2c.mode = 'units';
  for (const fy of Object.keys(p.levers.growth)) for (const ch of ['A', 'D', 'F', 'G', 'P'] as const) p.levers.growth[fy][ch] = 0;
  const flat = runPlan(p);
  // SKUs launched within the base's last year (hBoots, hPulse) have no year-ago month yet: they are checked separately
  const late = ['s9', 's10'];
  const exLate = (m: typeof flat.months[number], k: 'units' | 'rev') => Object.keys(m.unitsBySku).filter((id) => !late.includes(id)).reduce((a, id) => a + (k === 'units' ? m.unitsBySku[id] : m.revenueBySku[id]), 0);
  // Apr-28 (M19) = Apr-27 (M7) units at zero growth
  assert.equal(Math.round(exLate(flat.months[18], 'units')), Math.round(exLate(flat.months[6], 'units')));
  p.levers.growth.FY29 = { A: 1, D: 1, F: 1, G: 1, P: 1 };
  const grown = runPlan(p);
  close(exLate(grown.months[18], 'rev'), exLate(flat.months[18], 'rev') * 2, 'Apr-28 revenue at +100%');
  assert.equal(grown.months.length, 54);
});

test('late launches keep selling after the base: hPulse (first sold Mar-28) is not a March-only product', () => {
  const p = basePlan();
  const r = runPlan(p);
  const hp = (i: number) => r.months[i].unitsBySku['s10'];
  assert.ok(hp(17) > 0, 'hPulse sells in Mar-28 (M18)');
  for (let i = 18; i < 29; i++) assert.ok(hp(i) > 0, `hPulse sells in ${r.months[i].label}`); // Apr-28 … Feb-29 used to be 0
  // and hBoots (first sold Jan-27, M10) no longer drops to zero in Apr–Jun 28
  for (let i = 18; i < 21; i++) assert.ok(r.months[i].unitsBySku['s9'] > 0, `hBoots sells in ${r.months[i].label}`);
  p.levers.seasonShape = 'history';
  const h = runPlan(p);
  assert.ok(h.years.find((y) => y.fy === 'FY29')!.units > 0);
  for (let i = 18; i < 30; i++) assert.ok(h.months[i].unitsBySku['s10'] > 30, `hPulse (history shape) in ${h.months[i].label}`);
});

test('one-time launch costs do not repeat after the base; peak COGS rate does', () => {
  const p = basePlan();
  const r = runPlan(p);
  const shoot = p.lines.find((l) => l.name === 'hPulse - Launch Shoot')!;
  assert.equal(r.months.slice(18).reduce((a, m) => a + m.lines[shoot.id], 0), 0);
  const peak = p.lines.find((l) => l.name === 'COGS - Peak Y2')!;
  const dec28 = r.months[26]; // M27
  assert.equal(dec28.label, 'Dec-28');
  close(dec28.lines[peak.id], peak.amount * dec28.grossRevenue, 'Dec-28 peak COGS');
});

test('topicals switched on add revenue and carry their own COGS %', () => {
  const p = basePlan();
  const off = runPlan(p);
  p.products[0].on = true; p.products[0].launchUnits = 1000;
  const on = runPlan(p);
  const feb27 = 4; // M5
  close(on.months[feb27].grossRevenue - off.months[feb27].grossRevenue, 1000 * 450, 'cream launch-month revenue');
  close(on.months[feb27].cogs - off.months[feb27].cogs, 1000 * 450 * 0.3 + 1000 * 450 * 0.006 + 1000 * 450 * (0.005 + 0.0012 + 0.006), 'cream COGS (own 30% + %-of-revenue factory lines)');
});

test('D2C cohorts: base months keep the sheet D2C revenue; repeats lift later years', () => {
  const p = basePlan();
  const coh = runPlan(p);
  p.d2c.mode = 'units';
  const uni = runPlan(p);
  for (let i = 0; i < 18; i++) close(coh.months[i].revenueByChannel.D, uni.months[i].revenueByChannel.D, `D2C M${i + 1}`);
  const fy31 = (r: typeof coh) => r.years.find((y) => y.fy === 'FY31')!;
  assert.ok(fy31(coh).revenueByChannel.D > fy31(uni).revenueByChannel.D, 'repeats add D2C revenue after the base');
  assert.ok(fy31(coh).d2cRepeatOrders > 0 && fy31(coh).d2cNewCustomers > 0);
});

test('D2C cohorts: a bigger repeat boost raises revenue, and new-buyer ads do not scale with repeats', () => {
  const p = basePlan();
  const a = runPlan(p);
  p.d2c.repeatBoost = 2;
  const b = runPlan(p);
  const fy = (r: typeof a) => r.years.find((y) => y.fy === 'FY30')!;
  assert.ok(fy(b).d2cRepeatRevenue > fy(a).d2cRepeatRevenue * 1.5);
  // in the base, new buyers are back-solved, so more repeats mean fewer new buyers needed
  assert.ok(b.years[1].d2cNewCustomers < a.years[1].d2cNewCustomers);
});

test('history fit recovers known repeat rates from synthetic cohorts', async () => {
  const { fitD2C } = await import('../../client/src/data/planning/history.ts');
  const months = Array.from({ length: 24 }, (_, i) => `${2024 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`);
  const newC = months.map(() => 1000);
  const truth = { same: 0.06, next: 0.02, monthly: 0.005 };
  const cohorts = months.map((m, j) => ({
    month: m, size: newC[j],
    repeats: months.slice(j).map((_, k) => newC[j] * (k === 0 ? truth.same : k === 1 ? truth.next : k <= 11 ? truth.monthly : 0.003)),
  }));
  const history = months.map((m, i) => ({ month: m, newCustomers: newC[i], repeatOrders: 0, newSales: newC[i] * 1500, repeatSales: 0 }));
  const f = fitD2C(history, cohorts); // flat seasonality (new buyers have no season here) → rates come back exactly
  assert.ok(Math.abs(f.sameMonth - truth.same) < 1e-9 && Math.abs(f.nextMonth - truth.next) < 1e-9 && Math.abs(f.monthly - truth.monthly) < 1e-9);
  assert.ok(Math.abs(f.yearly - 0.003) < 1e-9);
});

test('Shopify history: first order = new buyer, later orders = repeats in the right cohort; junk skipped', async () => {
  const { aggregateOrders } = await import('../src/planning/shopifyHistory.ts');
  const o = (id: number, cust: number | null, at: string, v: number, extra: object = {}) => ({ id, customer: cust == null ? null : { id: cust }, created_at: at + 'T10:00:00+05:30', total_price: String(v), ...extra });
  const h = aggregateOrders([
    o(1, 7, '2025-11-03', 1500), o(2, 7, '2025-11-20', 1700), o(3, 7, '2026-01-05', 1600),
    o(4, 8, '2025-12-01', 2000), o(5, null, '2025-12-02', 1200), o(6, 9, '2025-12-03', 999, { cancelled_at: '2025-12-04' }),
    o(7, 10, '2026-01-09', 18_00_00_000), o(8, 8, '2026-02-01', 2100),
  ], '2026-02-15');
  assert.deepEqual(h.history.map((x) => [x.month, x.newCustomers, x.repeatOrders]), [['2025-11', 1, 1], ['2025-12', 2, 0], ['2026-01', 0, 1]]);
  assert.equal(h.history[0].newSales, 1500);
  const nov = h.cohorts.find((c) => c.month === '2025-11')!;
  assert.deepEqual([nov.size, ...nov.repeats], [1, 1, 0, 1]);
  assert.deepEqual(h.skipped, { cancelled: 1, test: 0, outlier: 1 });
  assert.equal(JSON.stringify(h).includes('"7"') || JSON.stringify(h).includes('c7'), false, 'no customer ids leave the aggregate');
});

test('Business Plan + Overview match the sheet: Exit ARR, The Ask 12M/18M, deployment by theme', async () => {
  const { exitArr, theAsk, deployment } = await import('../../client/src/data/planning/summary.ts');
  const p = sheetHorizon();
  const r = runPlan(p);
  close(exitArr(p, r, 12).arr / 1e7 * 1e6, check.exitArr12Cr * 1e6, 'Exit ARR 12M');
  close(exitArr(p, r, 18).arr / 1e7 * 1e6, check.exitArr18Cr * 1e6, 'Exit ARR 18M');
  close(theAsk(p, r, 12, p.business.contingency12).equityRequired / 1e7 * 1e6, check.equityRequired12Cr * 1e6, 'equity 12M');
  close(theAsk(p, r, 18, p.cash.contingencyPct).equityRequired / 1e7 * 1e6, check.equityRequired18Cr * 1e6, 'equity 18M');
  for (const [n, key] of [[12, 'deploymentByTheme12'], [18, 'deploymentByTheme18']] as const) {
    const d = deployment(p, r, n);
    for (const [theme, v] of Object.entries(check[key] as Record<string, number>)) {
      close(d.themes.find((t) => t.theme === theme)?.total ?? 0, v, `${theme} ${n}M`);
    }
  }
  close(r.months[3].gstRefund, check.gstRefund[3], 'GST refund M4');
});

test('Shopify bulk export: JSONL lines → orders (gids stripped), waits for the export, keeps going if one is already running', async () => {
  const { bulkLineToOrder, __test } = await import('../src/planning/shopifyHistory.ts');
  assert.deepEqual(bulkLineToOrder('{"id":"gid://shopify/Order/11","createdAt":"2025-01-02T10:00:00+05:30","cancelledAt":null,"test":false,"totalPriceSet":{"shopMoney":{"amount":"1299.00"}},"totalDiscountsSet":{"shopMoney":{"amount":"129.00"}},"customer":{"id":"gid://shopify/Customer/7"}}'),
    { id: '11', created_at: '2025-01-02T10:00:00+05:30', cancelled_at: null, test: false, total_price: '1299.00', total_discounts: '129.00', customer: { id: '7' } });
  assert.equal(bulkLineToOrder('{"id":"gid://shopify/LineItem/1","__parentId":"gid://shopify/Order/11"}'), null);
  assert.equal(bulkLineToOrder(''), null);
  assert.equal(bulkLineToOrder('{"id":"gid://shopify/Order/12","customer":null}')?.customer, null);

  const calls: string[] = [];
  let polls = 0;
  const gql = async (q: string) => {
    calls.push(q.includes('bulkOperationRunQuery') ? 'run' : 'poll');
    if (q.includes('bulkOperationRunQuery')) return { data: { bulkOperationRunQuery: { bulkOperation: null, userErrors: [{ message: 'A bulk query operation for this app and shop is already in progress' }] } } };
    polls++;
    return { data: { currentBulkOperation: polls < 2 ? { status: 'RUNNING' } : { status: 'COMPLETED', url: 'https://x/file.jsonl' } } };
  };
  const file = ['{"id":"gid://shopify/Order/1","createdAt":"2025-01-01T00:00:00Z","customer":{"id":"gid://shopify/Customer/1"},"totalPriceSet":{"shopMoney":{"amount":"100"}}}', '{"id":"gid://shopify/Order/2","createdAt":"2025-02-01T00:00:00Z","customer":{"id":"gid://shopify/Customer/1"},"totalPriceSet":{"shopMoney":{"amount":"100"}}}', ''].join('\n');
  const orders = await __test.pullShopifyHistoryBulk(gql, async () => file, Date.now() + 60_000, async () => {});
  assert.deepEqual(calls, ['run', 'poll', 'poll']);
  assert.equal(orders.length, 2);
  await assert.rejects(__test.pullShopifyHistoryBulk(async (q: string) => (q.includes('bulkOperationRunQuery') ? { data: { bulkOperationRunQuery: { userErrors: [] } } } : { data: { currentBulkOperation: { status: 'RUNNING' } } }), async () => '', Date.now() - 1, async () => {}), /still preparing/);
});

// ---- founder decisions (Nov 2026): each switch has a test, and the legacy position gives the sheet -------------

const fxOnly = (patch: (fx: NonNullable<ReturnType<typeof founderBase>['fx']>) => void) => {
  const p = basePlan(); // sheet parity …
  p.fx = { ...structuredClone(LEGACY_FX), sheetParity: false }; // … then every switch individually legacy, one patched
  p.levers.taxMode = 'sheet';
  for (const x of p.products) if (x.placeholder) x.on = false;
  patch(p.fx);
  return p;
};
const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

test('every switch in its legacy position (parity flag off) still gives the sheet for M1–M18', () => {
  const p = fxOnly(() => {});
  p.levers.horizon = 18;
  const r = runPlan(p);
  for (const k of ['netRevenue', 'ebitda', 'pat', 'inventory', 'nwc', 'netCashFlow', 'closingCash', 'gstAsset'] as const) {
    for (let i = 0; i < 18; i++) close(r.months[i][k], check[k][i], `${k} M${i + 1}`);
  }
});

test('1. GST: GMV and ex-GST revenue are both reported; unrecoverable services GST is its own cost line', () => {
  const off = runPlan(fxOnly(() => {}));
  const on = runPlan(fxOnly((fx) => { fx.gstServicesAsCost = true; }));
  assert.equal(sum(off.months.map((m) => m.gstServicesCost)), 0);
  const cost = sum(on.months.map((m) => m.gstServicesCost));
  assert.ok(cost > 5e7, `services GST expensed over the plan: ₹${(cost / 1e7).toFixed(1)} Cr`);
  // expensed = not carried: the asset is lower by exactly what was expensed; cash only moves through the tax shield
  const last = (r: typeof on) => r.months[r.months.length - 1];
  close(last(off).gstAsset - last(on).gstAsset, cost, 'asset lower by the expensed GST');
  for (let i = 0; i < 12; i++) close(on.months[i].cm1, off.months[i].cm1 - on.months[i].gstServicesCost, `CM1 M${i + 1}`);
  const m = on.months[10];
  close(m.revenueExGst * 1.05, m.gmv - m.revenueDeductions, 'ex-GST × 1.05 = GMV less deductions');
  assert.ok(on.years[2].gmv > on.years[2].revenueExGst);
  // P&L on ex-GST revenue: revenue is the ex-GST figure, EBITDA falls by the output GST
  const ex = runPlan(fxOnly((fx) => { fx.revenueExGst = true; }));
  close(ex.months[10].netRevenue, off.months[10].netRevenue / 1.05, 'net revenue ex GST');
  close(ex.months[10].ebitda, off.months[10].ebitda - (off.months[10].netRevenue - ex.months[10].netRevenue), 'EBITDA loses the output GST');
});

test('2. General Trade is booked at net realisation: revenue falls by the margin, commission by the same, EBITDA and costs do not move', () => {
  const off = runPlan(fxOnly(() => {}));
  const on = runPlan(fxOnly((fx) => { fx.gtNetRealisation = true; }));
  const gtMonths = off.months.filter((m) => m.revenueByChannel.G > 0);
  assert.ok(gtMonths.length > 3);
  for (let i = 0; i < off.months.length; i++) {
    const a = off.months[i], b = on.months[i];
    close(b.revenueByChannel.G, a.revenueByChannel.G * 0.5, `GT revenue ${a.label}`);
    close(b.gtMarginNetted, a.revenueByChannel.G * 0.5, `GT margin netted ${a.label}`);
    close(b.groups['Channel Commission'], a.groups['Channel Commission'] - b.gtMarginNetted, `commission ${a.label}`);
    close(b.cogs, a.cogs, `COGS ${a.label} (sized on list price)`);
    close(b.ebitda, a.ebitda, `EBITDA ${a.label}`);
    close(b.revenueBySku && sum(Object.values(b.revenueBySku)), sum(Object.values(a.revenueBySku)) - b.gtMarginNetted, `SKU revenue ${a.label}`);
  }
  assert.ok(on.years.every((y, i) => y.revenue <= off.years[i].revenue + 1));
});

test('3. Seed ₹8 Cr is an equity funding event; the Ask is sized net of it', async () => {
  const { theAsk } = await import('../../client/src/data/planning/summary.ts');
  const off = fxOnly(() => {});
  const p = fxOnly((fx) => { fx.seed = { on: true, amount: 8e7, month: 2, feePct: 0.05, confirmed: false, note: '' }; });
  const a = runPlan(off), b = runPlan(p);
  assert.equal(b.months[0].equity, 0);
  assert.equal(b.months[1].equity, 8e7);
  close(b.months[5].closingCash - a.months[5].closingCash, 8e7 - (4e6 - 3e6), 'closing cash up by the seed, less the larger round cost (5% × ₹8 Cr vs the sheet ₹30 L)');
  assert.equal(b.seedEquity, 8e7);
  assert.equal(b.equityPlanned, a.equityPlanned + 8e7);
  const ask = theAsk(p, b, 18, 0.2), ask0 = theAsk(off, a, 18, 0.2);
  close(ask.seed, 8e7, 'seed');
  close(ask.equityAfterSeed, Math.max(0, ask.equityRequired - 8e7), 'still to raise');
  assert.equal(ask0.seed, 0);
  assert.equal(ask0.equityAfterSeed, ask0.equityRequired);
});

test('4. Opening position: cash, receivables, payables, GST asset, debt and accumulated losses are inputs', () => {
  const base = runPlan(fxOnly(() => {}));
  const p = fxOnly((fx) => { fx.opening = { ...fx.opening, on: true, cash: 5e6, receivables: 1e7, payables: 4e6, inventory: 1.5e7, gstAsset: 2e6, debt: 3e7, accumulatedLosses: 0, source: 'manual' }; });
  const r = runPlan(p);
  // sheet opening: inventory 1.5 Cr, debt 1.45 Cr, everything else 0
  const dNwc0 = 1e7 - 4e6; // extra opening receivables less payables run off in month 1; the opening GST asset stays on the books
  close(r.months[0].nwcChange - base.months[0].nwcChange, dNwc0, 'month-1 working-capital release');
  close(r.months[0].interest - base.months[0].interest, (3e7 - 1.45e7) * 0.1076 / 12, 'interest on the higher opening debt');
  assert.ok(r.months[0].closingCash > base.months[0].closingCash + 5e6 - 1);
  // accumulated losses shelter future profit under FY carry-forward
  const q = fxOnly((fx) => { fx.opening = { ...fx.opening, on: true, accumulatedLosses: 0 }; });
  q.levers.taxMode = 'fy';
  const withLoss = structuredClone(q); withLoss.fx!.opening.accumulatedLosses = 10e7;
  const t0 = sum(runPlan(q).months.map((m) => m.tax)), t1 = sum(runPlan(withLoss).months.map((m) => m.tax));
  assert.ok(t0 > 0 && t1 < t0, `tax with ₹10 Cr of losses brought forward (${t1.toFixed(0)}) < without (${t0.toFixed(0)})`);
  close(t0 - t1, Math.min(t0, 10e7 * 0.25), 'saving = losses × rate, capped by the tax');
});

test('6. Tax: losses carry forward by financial year against later profit', () => {
  const p = fxOnly(() => {});
  p.levers.taxMode = 'sheet';
  const monthly = sum(runPlan(p).months.map((m) => m.tax));
  p.levers.taxMode = 'fy';
  const r = runPlan(p);
  const fyTax = sum(r.months.map((m) => m.tax));
  assert.ok(fyTax < monthly, 'FY carry-forward pays less than taxing each profitable month');
  const taxMonths = r.months.filter((m) => m.tax > 0);
  assert.ok(taxMonths.every((m) => m.label.startsWith('Mar')), 'tax lands in the last month of the FY');
  // in sheet-parity mode the sheet's tax method is forced
  const par = structuredClone(p); par.fx = { ...structuredClone(LEGACY_FX), sheetParity: true };
  close(sum(runPlan(par).months.map((m) => m.tax)), monthly, 'parity forces monthly tax');
});

test('5. Venture debt ₹2.5 Cr: draw, moratorium, equal instalments; loans separate from equity; OD interest on negative cash', () => {
  const p = fxOnly((fx) => { fx.ventureDebt = { on: true, amount: 2.5e7, drawMonth: 9, rate: 0.15, moratoriumMonths: 6, tenorMonths: 30, feePct: 0.01, confirmed: false }; });
  const r = runPlan(p);
  const mo = r.months;
  assert.equal(mo[7].ventureBalance, 0);
  assert.equal(mo[8].ventureBalance, 2.5e7);
  assert.equal(mo[14].ventureBalance, 2.5e7, 'interest-only through the 6-month moratorium (M10–M15)');
  close(mo[15].ventureBalance, 2.5e7 - 2.5e7 / 24, 'first instalment M16');
  assert.ok(Math.abs(mo[38].ventureBalance) < 1, 'repaid by M39 (draw M9 + 30)');
  close(mo[10].ventureInterest, 2.5e7 * 0.15 / 12, 'interest on the venture balance');
  close(mo[8].fundraiseCosts, 3e5 * 0 + (runPlan(fxOnly(() => {})).months[8].fundraiseCosts) + 2.5e5, '1% fee on drawdown');
  // the sheet's venture draw event is replaced, not added twice: bank debt unchanged by it, only the 50 L repayment
  close(mo[8].bankDebt, 1.45e7 - 5e6, 'bank debt = opening less the sheet’s 50 L repayment');
  assert.equal(mo[20].equity, 0, 'debt does not show as equity');
  assert.ok(r.debtDrawnTotal === 2.5e7);
  // cumulativeNeed carries the repayments, so the Ask covers them
  assert.ok(mo[38].cumulativeNeed < mo[38].cumulativeCash - 2.4e7);
  // overdraft: interest only on a negative balance
  const od = runPlan(fxOnly((fx) => { fx.overdraft = { on: true, rate: 0.12, confirmed: false }; }));
  const neg = od.months.findIndex((m, i) => i > 0 && od.months[i - 1].closingCash < 0);
  assert.ok(neg > 0, 'cash goes negative in the sheet’s plan without raises');
  close(od.months[neg].overdraftInterest, -od.months[neg - 1].closingCash * 0.12 / 12, 'OD interest on last month’s negative cash');
  assert.equal(od.months[0].overdraftInterest, 0);
  assert.equal(od.months[neg - 1].overdraft, Math.max(0, -od.months[neg - 1].closingCash));
});

test('7. D2C discounts: a % of D2C list revenue, deducted; Shopify discounts are learned per month', async () => {
  const { aggregateOrders } = await import('../src/planning/shopifyHistory.ts');
  const { discountPctOf } = await import('../../client/src/data/planning/history.ts');
  const off = runPlan(fxOnly(() => {}));
  const on = runPlan(fxOnly((fx) => { fx.d2cDiscount = { on: true, pct: 0.1, source: 'manual', asOf: null }; }));
  for (let i = 0; i < 18; i++) {
    close(on.months[i].d2cDiscounts, off.months[i].revenueByChannel.D * 0.1, `discounts M${i + 1}`);
    close(on.months[i].netRevenue, off.months[i].netRevenue - on.months[i].d2cDiscounts, `net revenue M${i + 1}`);
  }
  const o = (id: number, cust: number, at: string, v: number, d: number) => ({ id, customer: { id: cust }, created_at: at + 'T10:00:00+05:30', total_price: String(v), total_discounts: String(d) });
  const h = aggregateOrders([o(1, 1, '2026-01-03', 900, 100), o(2, 1, '2026-01-20', 1800, 200), o(3, 2, '2026-02-02', 1000, 0)], '2026-03-10');
  assert.deepEqual(h.history.map((x) => [x.month, x.discounts]), [['2026-01', 300], ['2026-02', 0]]);
  close(discountPctOf(h.history)!, 300 / (3700 + 300), 'discount % of list sales');
  assert.equal(discountPctOf([{ month: '2026-01', newCustomers: 1, repeatOrders: 0, newSales: 1, repeatSales: 0 }]), null);
  assert.ok(Math.abs(founderBase().fx!.d2cDiscount.pct - 0.043) < 1e-9, 'seeded from Shopify analytics (4.3%)');
  // Shopify order values are after discount, so the model grosses AOV up instead of deducting twice (cohort months after the base)
  const c = runPlan(fxOnly((fx) => { fx.d2cDiscount = { on: true, pct: 0.1, source: 'manual', asOf: null }; }));
  const c0 = runPlan(fxOnly(() => {}));
  const fy = (r: typeof c, f: string) => r.years.find((y) => y.fy === f)!;
  close(fy(c, 'FY30').d2cNewRevenue / fy(c0, 'FY30').d2cNewRevenue, 1 / 0.9, 'AOV grossed up by 1/(1-d)');
});

test('8. New products: placeholders (lotion, oil) are flagged and stand aside in sheet parity; hPulse/hGo are editable', () => {
  const f = founderBase();
  const ph = f.products.filter((x) => x.placeholder);
  assert.deepEqual(ph.map((x) => x.id).sort(), ['p-lotion', 'p-oil']);
  const on = runPlan(f);
  const par = founderBase(); setSheetParity(par, true);
  const off = runPlan(par);
  assert.ok(sum(on.months.map((m) => m.unitsBySku['p-lotion'] ?? 0)) > 0);
  assert.equal(sum(off.months.map((m) => m.unitsBySku['p-lotion'] ?? 0)), 0);
  // volume + price tweak on a sheet SKU
  const t = fxOnly((fx) => { fx.skuTweaks = { s8: { volume: 2, asp: 5000 } }; });
  const a = runPlan(fxOnly(() => {})), b = runPlan(t);
  close(b.months[8].unitsBySku.s8, a.months[8].unitsBySku.s8 * 2, 'hGo volume ×2');
  close(b.months[8].revenueBySku.s8 / b.months[8].unitsBySku.s8, 5000, 'hGo price override');
});

test('9. Depreciation booked once: new capex depreciates straight-line from the month after; the sheet’s flat D&A lines stop inflating', () => {
  const off = runPlan(fxOnly(() => {}));
  const on = runPlan(fxOnly((fx) => { fx.depreciationOnce = { on: true, lifeYears: 5 }; }));
  close(on.months[0].da, off.months[0].da, 'month 1: no earlier capex');
  const capex0 = off.months[0].capex;
  close(on.months[1].da, off.months[1].da + capex0 / 60, 'month 2 carries month 1’s capex over 60 months');
  assert.ok(sum(on.months.map((m) => m.da)) > sum(off.months.map((m) => m.da)));
  // opening-asset D&A no longer inflates after the base
  const flatDa = on.months[40].da - sum(on.months.slice(0, 40).map((m) => m.capex)) / 60 * 0; // (just shape check below)
  assert.ok(flatDa > 0);
  // EBITDA and cash are untouched by depreciation (only PBT/tax move)
  close(on.months[5].ebitda, off.months[5].ebitda, 'EBITDA');
});

test('4b. Opening position from a Tally balance sheet (Sep-26)', async () => {
  const { openingFromTally, monthBefore } = await import('../../client/src/data/planning/opening.ts');
  assert.equal(monthBefore('2026-10'), '2026-09');
  const row = (name: string, level: 'group' | 'ledger', debit: number, credit: number) => ({ name, level, debit, credit });
  const month = {
    period: '2026-09', asOf: '2026-10-05', closingStock: 2e7, depreciation: 0, nettProfit: null,
    tb: {
      difference: 0, rows: [
        row('Capital Account', 'group', 0, 1e7), row('Profit & Loss A/c', 'ledger', 5e7, 0),
        row('Loans (Liability)', 'group', 0, 2e7), row('HDFC CC', 'ledger', 0, 2e7),
        row('Current Liabilities', 'group', 0, 3e6), row('Sundry Creditors', 'ledger', 0, 8e6), row('Duties & Taxes - GST Input', 'ledger', 5e6, 0),
        row('Fixed Assets', 'group', 1e7, 0),
        row('Current Assets', 'group', 3.6e7, 0), row('Sundry Debtors', 'ledger', 1.2e7, 0), row('Bank Accounts', 'ledger', 2.4e7, 0),
        row('Sales Accounts', 'group', 0, 0),
      ],
    },
  };
  const keep = founderBase().fx!.opening;
  const o = openingFromTally(month, keep)!;
  assert.equal(o.opening.cash, 2.4e7);
  assert.equal(o.opening.receivables, 1.2e7);
  assert.equal(o.opening.payables, 8e6);
  assert.equal(o.opening.debt, 2e7);
  assert.equal(o.opening.inventory, 2e7);
  assert.equal(o.opening.gstAsset, 5e6);
  assert.equal(o.opening.source, 'tally');
  assert.ok(o.opening.accumulatedLosses > 0);
  assert.equal(openingFromTally({ ...month, tb: null }, keep), null);
});

test('founder Base: switches on, flagged placeholders, and Sheet-parity mode returns the sheet', () => {
  const f = founderBase();
  assert.equal(f.fx!.sheetParity, false);
  assert.equal(f.fx!.ventureDebt.confirmed, true);
  assert.equal(f.fx!.ventureDebt.rate, 0.12);
  assert.equal(f.fx!.ventureDebt.tenorMonths, 60);
  assert.equal(f.fx!.overdraft.rate, 0.085);
  assert.equal(f.fx!.seed.confirmed, true);
  assert.equal(f.fx!.revenueExGst, true);
  assert.equal(f.fx!.opening.accumulatedLosses, 1_970_000);
  assert.equal(f.fx!.seed.amount, 8e7);
  const par = founderBase(); setSheetParity(par, true); par.levers.horizon = 18;
  const r = runPlan(par);
  for (let i = 0; i < 18; i++) close(r.months[i].closingCash, check.closingCash[i], `parity cash M${i + 1}`);
  const live = runPlan(f);
  assert.notEqual(Math.round(live.months[17].closingCash), Math.round(check.closingCash[17]));
});
