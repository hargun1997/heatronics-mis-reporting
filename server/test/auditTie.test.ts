// Published history tied to the audited financial statements (10 Nov 2026, audit recon; client/src/data/misDeck/auditTie.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MonthlyMIS } from '../../client/src/data/misDeck/misDeckData.ts';
import { PUBLISHED_MONTHS } from '../../client/src/data/misDeck/publishedBasis.ts';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import { aggregatePeriods, fyOf } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { anchoredChannelPnl, liveMisPoint } from '../../client/src/data/misDeck/liveViews.ts';
import {
  applyAuditYear, belowEbitda, fyBucketLabel, interBranchNote, taxOf, tieToAudit, AUDIT_TRUE_UP_LINE, TAX_LINE,
} from '../../client/src/data/misDeck/auditTie.ts';

// Company totals from the audited financial statements FY2025-26 (with FY2024-25 comparatives), ₹ rounded to the rupee.
// These are the same totals the MIS shows for those years once tied; nothing below company level is kept here.
// Net revenue = audited revenue from operations less inter-branch transfers (the MIS view).
const AUDITED = {
  'FY24-25': { netRevenue: 37_952_960, ebitda: 3_920_030, pbt: 1_752_461, pat: 1_457_376, interBranch: 5_403_247 },
  'FY25-26': { netRevenue: 58_339_080, ebitda: -105_814, pbt: -2_302_266, pat: -2_215_808, interBranch: 11_008_678 },
} as const;

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const deck = buildLiveDeck([]);
const years = aggregatePeriods(deck.months, deck.completeness, 'year');

test('FY24-25 and FY25-26: MIS net revenue, EBITDA, PBT and net income equal the audited accounts', () => {
  for (const [fy, a] of Object.entries(AUDITED)) {
    const y = years.find((p) => p.key === fy)!;
    near(y.netRevenue, a.netRevenue, 2_000, `${fy} net revenue`);          // FY24-25: ₹1,920 revenue rounding in the workbook
    near(y.ebitda, a.ebitda, 1_000, `${fy} EBITDA`);
    near(y.netIncome, a.pat, 1_000, `${fy} net income (after tax)`);
    const pbt = y.netIncome + (taxOf(y.nonOpLines) ?? 0);
    near(pbt, a.pbt, 1_000, `${fy} PBT`);
    near(y.interBranch ?? 0, a.interBranch, 1, `${fy} inter-branch`);
    // the MIS sheet shows the same lines
    const pt = liveMisPoint(y, 'company', deck.skuCells, deck.completeness);
    near(pt.ebitda!, a.ebitda, 1_000, `${fy} sheet EBITDA`);
    near(pt.pbt!, a.pbt, 1_000, `${fy} sheet PBT`);
    near(pt.netIncome!, a.pat, 1_000, `${fy} sheet net income`);
    near(pt.ebitda! - pt.nonOperating! - pt.tax!, pt.netIncome!, 1, `${fy} sheet foots`);
  }
});

test('year-end entries are visible lines: true-up, other income and tax in March; other income no longer netted', () => {
  const mar25 = PUBLISHED_MONTHS.find((m) => m.key === '2025-03')!;
  assert.equal(mar25.opexLines[AUDIT_TRUE_UP_LINE], 1_171_971);
  assert.equal(mar25.opexLines['Other income'], 27_660);
  assert.equal(mar25.nonOpLines?.[TAX_LINE], -295_085);
  assert.match(mar25.auditNote ?? '', /audit adjustment/);
  const mar26 = PUBLISHED_MONTHS.find((m) => m.key === '2026-03')!;
  assert.equal(mar26.opexLines['Other income'], 146_730);
  assert.equal(mar26.nonOpLines?.[TAX_LINE], 86_458);              // deferred-tax credit
  const fy25 = years.find((p) => p.key === 'FY24-25')!;
  const sheet = liveMisPoint(fy25, 'company', deck.skuCells, deck.completeness);
  assert.equal(sheet.otherIncome, 27_660);
  assert.equal(sheet.auditTrueUp, 1_171_971);
  assert.equal(sheet.tax, 295_085);
  // a month without a tax line has no tax data (null), not ₹0
  const apr24 = aggregatePeriods(deck.months.filter((m) => m.key === '2024-04'), deck.completeness, 'month')[0];
  assert.equal(liveMisPoint(apr24, 'company', deck.skuCells, deck.completeness).tax, null);
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
  const [m] = applyAuditYear([base], { fy: 'X', month: '2025-03', materialTrueUp: 20, financeTrueUp: 0, otherIncome: 5, otherIncomeInOpex: false, tax: 3, note: 'n' });
  assert.equal(m.opex, 75);
  assert.equal(m.ebitda, 75);
  assert.equal(m.nonOperating, 13);
  assert.equal(m.netIncome, 62);
  assert.equal(taxOf(m.nonOpLines), 3);
  assert.equal(taxOf({ 'Interest & depreciation': -10 }), null);
  assert.deepEqual(belowEbitda(75, 62, m.nonOpLines), { nonOperating: 10, pbt: 65, tax: 3, netIncome: 62 });
  assert.deepEqual(belowEbitda(75, 62, {}), { nonOperating: 13, pbt: 62, tax: null, netIncome: 62 });
  assert.equal(tieToAudit(PUBLISHED_MONTHS), PUBLISHED_MONTHS);             // idempotent
  assert.equal(fyBucketLabel('FY26-27', ['2026-04', '2026-05'], (k) => k), 'FY26-27');
  assert.equal(interBranchNote('FY24-25', 5_403_247), 'FY24-25: audited revenue includes ₹54.03 L inter-branch transfers; MIS excludes them.');
  assert.equal(interBranchNote('FY26-27', 0), null);
});
