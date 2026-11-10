// Published history tied to the audited financial statements (10 Nov 2026, audit recon; client/src/data/misDeck/auditTie.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MonthlyMIS } from '../../client/src/data/misDeck/misDeckData.ts';
import { PUBLISHED_MONTHS } from '../../client/src/data/misDeck/publishedBasis.ts';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import { aggregatePeriods, fyOf } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { anchoredChannelPnl, liveMisPoint } from '../../client/src/data/misDeck/liveViews.ts';
import { footCellsToChannels } from '../../client/src/data/misDeck/channelFoot.ts';
import { misPoint } from '../../client/src/data/misDeck/misSheet.ts';
import { monthlySeries } from '../../client/src/data/misDeck/analytics.ts';
import {
  applyAuditYear, belowEbitda, fyBucketLabel, interBranchNote, taxOf, tieToAudit, AUDIT_TRUE_UP_LINE, TAX_LINE,
} from '../../client/src/data/misDeck/auditTie.ts';

// Company totals from the audited financial statements FY2025-26 (with FY2024-25 comparatives), ₹ rounded to the rupee.
// These are the same totals the MIS shows for those years once tied; nothing below company level is kept here.
// Net revenue = audited revenue from operations less inter-branch transfers (the MIS view).
// material = audited material consumed less inter-branch transfers (revenue − material = the audited gross margin on the MIS basis).
const AUDITED = {
  'FY24-25': { netRevenue: 37_952_960, material: 10_582_395, ebitda: 3_920_030, pbt: 1_752_461, pat: 1_457_376, interBranch: 5_403_247 },
  'FY25-26': { netRevenue: 58_339_080, material: 23_542_355, ebitda: -105_814, pbt: -2_302_266, pat: -2_215_808, interBranch: 11_008_678 },
} as const;
// FY24-25: the workbook's revenue is ₹1,920 below the audited figure (rounding), which flows to every margin; FY25-26 ties to ₹100.
const TOL = { 'FY24-25': 2_000, 'FY25-26': 100 } as const;

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const deck = buildLiveDeck([]);
const years = aggregatePeriods(deck.months, deck.completeness, 'year');

test('FY24-25 and FY25-26: MIS net revenue, gross margin, EBITDA, PBT and net income equal the audited accounts', () => {
  for (const [fy, a] of Object.entries(AUDITED) as [keyof typeof AUDITED, (typeof AUDITED)[keyof typeof AUDITED]][]) {
    const y = years.find((p) => p.key === fy)!;
    const tol = TOL[fy];
    near(y.netRevenue, a.netRevenue, tol, `${fy} net revenue`);
    // Material: FY24-25 the raw-material line + its true-up (job work / power / labour sit in COGM in the MIS, in other
    // expenses in the audit); FY25-26 the COGM bucket (its Jan–Mar lines are allocations).
    const material = fy === 'FY24-25' ? -((y.cogmLines['Raw Materials & Inventory'] ?? 0) + (y.cogmLines[AUDIT_TRUE_UP_LINE] ?? 0)) : y.cogm;
    near(y.netRevenue - material, a.netRevenue - a.material, tol, `${fy} gross margin (revenue − material)`);
    near(y.ebitda, a.ebitda, tol, `${fy} EBITDA`);
    near(y.netIncome, a.pat, tol, `${fy} net income (after tax)`);
    const pbt = y.netIncome + (taxOf(y.nonOpLines) ?? 0);
    near(pbt, a.pbt, tol, `${fy} PBT`);
    near(y.interBranch ?? 0, a.interBranch, 1, `${fy} inter-branch`);
    // the MIS sheet shows the same lines
    const pt = liveMisPoint(y, 'company', deck.skuCells, deck.completeness);
    near(pt.ebitda!, a.ebitda, tol, `${fy} sheet EBITDA`);
    near(pt.pbt!, a.pbt, tol, `${fy} sheet PBT`);
    near(pt.netIncome!, a.pat, tol, `${fy} sheet net income`);
    near(pt.ebitda! - pt.nonOperating! - pt.tax!, pt.netIncome!, 1, `${fy} sheet foots`);
  }
});

test('material true-up is in COGM, spread over the year (no month negative); other income and tax in March', () => {
  const fy25m = PUBLISHED_MONTHS.filter((m) => m.key >= '2024-04' && m.key <= '2025-03');
  near(fy25m.reduce((s, m) => s + (m.cogmLines[AUDIT_TRUE_UP_LINE] ?? 0), 0), 1_170_367, 0.01, 'FY25 true-up');
  for (const m of fy25m) {
    assert.ok(m.cogm > 0 && m.opex > 0, `${m.key} COGM ${m.cogm} / opex ${m.opex}`);
    assert.match(m.auditNote ?? '', /audit adjustment/);
    near(m.netRevenue - m.cogm, m.grossMargin, 0.02, `${m.key} GM`);
    near(m.grossMargin - m.channelFulfillment - m.salesMarketing - m.platformCosts - m.opex, m.ebitda, 0.05, `${m.key} EBITDA`);
  }
  const mar25 = PUBLISHED_MONTHS.find((m) => m.key === '2025-03')!;
  assert.equal(mar25.opexLines[AUDIT_TRUE_UP_LINE], undefined);
  assert.equal(mar25.opexLines['Other income'], 27_660);
  assert.equal(mar25.nonOpLines?.[TAX_LINE], -295_085);
  const mar26 = PUBLISHED_MONTHS.find((m) => m.key === '2026-03')!;
  assert.equal(mar26.opexLines['Other income'], 146_730);
  assert.equal(mar26.nonOpLines?.[TAX_LINE], 86_458);              // deferred-tax credit
  const fy25 = years.find((p) => p.key === 'FY24-25')!;
  const sheet = liveMisPoint(fy25, 'company', deck.skuCells, deck.completeness);
  assert.equal(sheet.otherIncome, 27_660);
  assert.equal(sheet.tax, 295_085);
  // audited-year months with no tax booked show ₹0 tax; Dec 23–Mar 24 (tax not in the MIS) and live months show no data
  const month = (k: string) => aggregatePeriods(deck.months.filter((m) => m.key === k), deck.completeness, 'month')[0];
  assert.equal(liveMisPoint(month('2024-04'), 'company', deck.skuCells, deck.completeness).tax, 0);
  assert.equal(liveMisPoint(month('2024-01'), 'company', deck.skuCells, deck.completeness).tax, null);
  // legacy MIS-format company point: Other Expense never negative, other income split out
  const legacyMar = misPoint(monthlySeries().find((p) => p.key === '2025-03')!, 'company');
  assert.ok((legacyMar.otherExpense ?? 0) > 0);
  assert.equal(legacyMar.otherIncome, 27_660);
});

test('channels still foot to the company after the true-up and tax (company lines, not in channels)', () => {
  for (const fy of Object.keys(AUDITED)) {
    const y = years.find((p) => p.key === fy)!;
    const rows = anchoredChannelPnl(y, deck.skuCells, deck.completeness);
    const tot = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    near(tot((r) => r.cm3), y.cm3, 1, `${fy} CM3`);
    near(tot((r) => r.ebitda), y.ebitda, 1, `${fy} EBITDA`);
    near(tot((r) => r.netIncome), y.netIncome, 1, `${fy} net income`);
  }
  // SKU × channel cells foot to the year's gross margin (the true-up rides in the cells' COGM rest)
  for (const fy of Object.keys(AUDITED)) {
    const y = years.find((p) => p.key === fy)!;
    const monthsAgg = aggregatePeriods(deck.months.filter((m) => y.members.includes(m.key)), deck.completeness, 'month');
    const cells = footCellsToChannels(deck.skuCells, monthsAgg, deck.completeness).filter((c) => y.members.includes(c.m));
    near(cells.reduce((s, c) => s + c.rev - c.cogs - (c.fac ?? 0), 0), y.grossMargin, 5, `${fy} SKU cells GM`);
  }
  // channel MIS-sheet points stop at EBITDA: no tax / PBT on a channel
  const y = years.find((p) => p.key === 'FY24-25')!;
  const ch = liveMisPoint(y, 'Amazon', deck.skuCells, deck.completeness);
  assert.equal(ch.tax, null);
  assert.equal(ch.netIncome, null);
});

test('Jan–Mar 2026: inter-branch to the books, build-up foots to the restated net', () => {
  for (const m of PUBLISHED_MONTHS.filter((x) => x.key >= '2026-01' && x.key <= '2026-03')) {
    near(m.totalGrossRevenue + m.totalReturns + m.totalTaxes, m.netRevenue, 1, `${m.key} build-up`);
    near(m.turnover, m.netRevenue + m.interBranch, 1, `${m.key} turnover`);
  }
  const q4 = PUBLISHED_MONTHS.filter((x) => x.key >= '2026-01' && x.key <= '2026-03').reduce((s, m) => s + m.interBranch, 0);
  near(q4, 1_193_198, 1, 'Q4 inter-branch');
});

test('Dec 2023 – Mar 2024: a 4-month partial year with 4/12 of the depreciation', () => {
  const fy24 = years.find((p) => fyOf(p.members[0]) === 'FY23-24')!;
  assert.equal(fy24.members.length, 4);
  assert.equal(fy24.label, 'FY23-24 (Dec 23–Mar 24, 4 months)');
  const mar24 = PUBLISHED_MONTHS.find((m) => m.key === '2024-03')!;
  const dec23 = PUBLISHED_MONTHS.find((m) => m.key === '2023-12')!;
  near(mar24.nonOperating - dec23.nonOperating, 23_264 - 23_944, 1, 'Mar 24 carries 1/12 like the other months');
  assert.equal(years.find((p) => p.key === 'FY25-26')!.label, 'FY25-26');
});

test('pure helpers', () => {
  const base = { key: '2025-03', opex: 100, ebitda: 50, nonOperating: 10, netIncome: 40, opexLines: {}, costOfFundraising: 0 } as unknown as MonthlyMIS;
  const base2 = { ...base, key: '2025-02', cogm: 60, grossMargin: 40, cm1: 40, cm2: 40, cm3: 40, cogmLines: { 'Raw Materials & Inventory': -30 } } as unknown as MonthlyMIS;
  const b1 = { ...base, cogm: 60, grossMargin: 40, cm1: 40, cm2: 40, cm3: 40, cogmLines: { 'Raw Materials & Inventory': -10 } } as unknown as MonthlyMIS;
  const [feb, m] = applyAuditYear([base2, b1], { fy: 'FY24-25', month: '2025-03', materialTrueUp: 20, financeTrueUp: 0, otherIncome: 5, otherIncomeInOpex: false, tax: 3, note: 'n' });
  assert.equal(feb.cogm, 45);                                        // 3/4 of the true-up by material
  assert.equal(m.cogm, 55);
  assert.equal(m.opex, 95);                                          // only the new other income leaves opex
  assert.equal(m.ebitda, 60);
  assert.equal(m.nonOperating, 13);
  assert.equal(m.netIncome, 47);
  assert.equal(taxOf(m.nonOpLines), 3);
  assert.equal(taxOf({ 'Interest & depreciation': -10 }), null);
  assert.equal(taxOf({ [TAX_LINE]: 0 }), 0);
  assert.deepEqual(belowEbitda(60, 47, m.nonOpLines), { nonOperating: 10, pbt: 50, tax: 3, netIncome: 47 });
  assert.deepEqual(belowEbitda(60, 47, {}), { nonOperating: 13, pbt: 47, tax: null, netIncome: 47 });
  assert.equal(tieToAudit(PUBLISHED_MONTHS), PUBLISHED_MONTHS);             // idempotent
  assert.equal(fyBucketLabel('FY26-27', ['2026-04', '2026-05'], (k) => k), 'FY26-27');
  assert.equal(interBranchNote('FY24-25', 5_403_247), 'FY24-25: audited revenue includes ₹54.03 L inter-branch transfers; MIS excludes them.');
  assert.equal(interBranchNote('FY26-27', 0), null);
});
