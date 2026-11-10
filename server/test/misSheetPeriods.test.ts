// MIS sheet + period fixes (audit round 7 #4 #5 #6 #12 #13 #14, 10 Nov 2026). Made-up figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx-js-style';
import { opexSplit, anchorMonth, isCompleteMonth, cashOverMonths, fyToDateLabel, trailingKeys } from '../../client/src/data/misDeck/misPeriods.ts';
import { rangeKeys, rangePresetLabel, sumMisPoints, liveMisPoint } from '../../client/src/data/misDeck/liveViews.ts';
import { aggregatePeriods } from '../../client/src/data/misDeck/liveAnalytics.ts';
import { MIS_SHEET_ROWS, type MisPoint } from '../../client/src/data/misDeck/misSheet.ts';
import { buildMisFormatWorkbook, type MisFormatSource } from '../../client/src/utils/misFormatExport.ts';
import { misSourceWithCash } from '../../client/src/utils/liveMisSource.ts';
import * as deckData from '../../client/src/data/misDeck/misDeckData.ts';
import type { MonthlyMIS } from '../../client/src/data/misDeck/misDeckData.ts';
import type { PeriodCompleteness } from '../../client/src/data/misDeck/liveDeck.ts';
import type { CashFlow } from '../../client/src/data/statements/statements.ts';

const comp = (periodKey: string, level: PeriodCompleteness['level'], over: Partial<PeriodCompleteness> = {}): PeriodCompleteness => ({
  periodKey, hasTally: level === 'full', cogmReal: level !== 'topline', level, sources: [], through: null, reconcileResidual: null, ...over,
});

function month(key: string, opex: number, opexLines: Record<string, number>, ebitda = -100): MonthlyMIS {
  const [year, m] = key.split('-').map(Number);
  return {
    key, label: key, month: m, year, netByChannel: { D2C: 1000 }, grossByChannel: {}, returnsByChannel: {},
    totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0, netRevenue: 1000, interBranch: 0, turnover: 0,
    grossMargin: 500, cm1: 400, cm2: 300, cm3: ebitda + opex, ebitda, netIncome: ebitda, cogm: 500,
    channelFulfillment: 100, salesMarketing: 100, platformCosts: 0, opex, nonOperating: 0, costOfFundraising: 0,
    cogmLines: {}, opexLines,
  };
}

test('#4 opexSplit: legacy Salaries / Legal & CA map to payroll / prof fee; nothing matching = null, not 0', () => {
  const legacy = opexSplit({ 'Salaries (Admin Mgmt)': -777720, 'Salaries Director': -20000, 'Legal & CA expenses': -73300, 'Administrative Expenses': -325216, 'TOTAL OPERATING EXPENSES': -1196236 });
  assert.equal(legacy.payroll, 797720);
  assert.equal(legacy.profFee, 73300);
  assert.equal(legacy.otherIncome, null);
  const live = opexSplit({ 'Payroll (Employee Cost – Indirect)': -219204, 'Professional Fees': -36000, 'Other Income (Indirect Incomes)': 5221.53, 'Staff Welfare': -9370 });
  assert.deepEqual(live, { payroll: 219204, profFee: 36000, otherIncome: 5221.53 });
  assert.deepEqual(opexSplit({ 'Admin & General Expenses': -1000 }), { payroll: null, profFee: null, otherIncome: null });
  assert.deepEqual(opexSplit(undefined), { payroll: null, profFee: null, otherIncome: null });
});

test('#4 liveMisPoint: a legacy month shows payroll / prof fee; Other Expense = the rest; no line = blank', () => {
  const ms = [
    month('2025-12', 1000, { 'Salaries (Admin Mgmt)': -600, 'Legal & CA expenses': -100, 'Administrative Expenses': -300, 'TOTAL OPERATING EXPENSES': -1000 }),
    month('2026-01', 500, { 'Administrative Expenses': -500 }),
  ];
  const c = { '2025-12': comp('2025-12', 'full', { locked: true }), '2026-01': comp('2026-01', 'full', { locked: true }) };
  const [dec, jan] = aggregatePeriods(ms, c, 'month');
  const d = liveMisPoint(dec, 'company', [], c);
  assert.equal(d.payroll, 600);
  assert.equal(d.profFee, 100);
  assert.equal(d.otherExpense, 300);
  const j = liveMisPoint(jan, 'company', [], c);
  assert.equal(j.payroll, null);
  assert.equal(j.otherExpense, 500);
});

const pt = (over: Partial<MisPoint>): MisPoint => ({
  qty: null, grossRevenue: null, channelMargin: null, returns: null, gst: null, ssClaim: null, discounts: null, netRevenue: 100,
  cogs: 50, grossMargin: 50, stockVariance: 1, logistics: 1, cm1: 1, marketing: 1, cm2: 1, branding: 1, cm3: 1, payroll: 10,
  profFee: 2, otherExpense: 5, otherIncome: 1, ebitda: 0, openingCash: null, funding: null, closingCash: null, cashBurn: null,
  ebitdaBurn: 0, runway: null, ...over,
});

test('#5 period EBITDA burn = max(0, −Σ EBITDA), not Σ of the loss months; blank with EBITDA', () => {
  const s = sumMisPoints([pt({ ebitda: -30, ebitdaBurn: 30 }), pt({ ebitda: 29, ebitdaBurn: 0 })]);
  assert.equal(s.ebitda, -1);
  assert.equal(s.ebitdaBurn, 1);
  assert.equal(sumMisPoints([pt({ ebitda: -10, ebitdaBurn: 10 }), pt({ ebitda: 20, ebitdaBurn: 0 })]).ebitdaBurn, 0);
  assert.equal(sumMisPoints([pt({ ebitda: -10, ebitdaBurn: 10 }), pt({ ebitda: null, ebitdaBurn: null, otherExpense: null })]).ebitdaBurn, null);
});

test('#13 payroll / prof fee / other income / memo are blank in a total whose Other Expense is blank', () => {
  const s = sumMisPoints([pt({}), pt({ otherExpense: null, ebitda: null, ebitdaBurn: null })]);
  assert.equal(s.otherExpense, null);
  for (const k of ['payroll', 'profFee', 'otherIncome'] as const) assert.equal(s[k], null, k);
  assert.equal(s.stockVariance, 2); // the memo follows COGS (still real), not Other Expense
  assert.equal(sumMisPoints([pt({}), pt({ cogs: null, grossMargin: null })]).stockVariance, null);
  const ok = sumMisPoints([pt({}), pt({ payroll: null })]);
  assert.equal(ok.payroll, 10); // a month with no payroll line does not blank the total
});

test('#6 anchor = newest complete month; running / half-booked newest month is skipped', () => {
  const keys = ['2025-11', '2025-12', '2026-08', '2026-09', '2026-10', '2026-11'];
  const c: Record<string, PeriodCompleteness> = {
    '2025-11': comp('2025-11', 'full', { locked: true }), '2025-12': comp('2025-12', 'full', { locked: true }),
    '2026-08': comp('2026-08', 'full'),
    '2026-09': comp('2026-09', 'full', { closeBlockers: [{ kind: 'stock', text: '', fix: '', hard: true }] }),
    '2026-10': comp('2026-10', 'contribution'),
    '2026-11': comp('2026-11', 'topline', { closeBlockers: [{ kind: 'running', text: '', fix: '', hard: true }] }),
  };
  assert.equal(anchorMonth(keys, c, '2025-12'), '2026-09');
  assert.equal(isCompleteMonth(comp('2026-11', 'full', { closeBlockers: [{ kind: 'running', text: '', fix: '', hard: true }] })), false);
  assert.equal(isCompleteMonth(comp('2026-02', 'topline', { published: true })), true);
  assert.equal(anchorMonth(keys, {}, null), '2026-11'); // no completeness = newest
  assert.equal(anchorMonth([], c, null), null);
});

test('#6 Last 12 / FY to date end on the anchor; YTD is the Indian FY, labelled "FY26-27 to date"', () => {
  const all: string[] = [];
  for (let y = 2024; y <= 2026; y++) for (let m = 1; m <= 12; m++) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k <= '2026-11') all.push(k); }
  const l12 = rangeKeys('last12', all, [], '2026-09');
  assert.equal(l12.length, 12);
  assert.equal(l12[0], '2025-10');
  assert.equal(l12[11], '2026-09');
  assert.deepEqual(rangeKeys('ytd', all, [], '2026-09'), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.deepEqual(rangeKeys('ytd', all, [], '2026-02').slice(0, 2), ['2025-04', '2025-05']); // Jan–Mar stay in the FY that began in April
  assert.equal(rangePresetLabel('ytd', all, '2026-09'), 'FY26-27 to date');
  assert.equal(fyToDateLabel('2027-01'), 'FY26-27 to date');
  assert.equal(rangeKeys('last12', all, [])[11], '2026-11'); // no anchor = old behaviour
  assert.deepEqual(trailingKeys('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
});

const cf = (period: string, open: number, close: number, equity = 0) => ({ period, openingCash: open, closingCash: close, openingNetCash: open, closingNetCash: close, equity, asOf: null }) as unknown as CashFlow;

test('#13 FY cash rows over the months that have a cash flow, labelled; all months = no label', () => {
  const rows: Record<string, { openingCash: number; closingCash: number; funding: number; cashBurn: number; runway: number | null }> = {
    '2026-10': { openingCash: 100, closingCash: 80, funding: 0, cashBurn: 20, runway: 1.3 },
    '2026-11': { openingCash: 80, closingCash: 150, funding: 100, cashBurn: 30, runway: 1.7 },
  };
  const keys = ['2026-04', '2026-05', '2026-10', '2026-11'];
  const c = cashOverMonths(keys, (k) => rows[k] ?? null)!;
  assert.equal(c.openingCash, 100);
  assert.equal(c.closingCash, 150);
  assert.equal(c.cashBurn, 50);
  assert.equal(c.funding, 100);
  assert.equal(c.runway, 1.7);
  assert.equal(c.label, 'Oct–Nov');
  assert.equal(cashOverMonths(['2026-10', '2026-11'], (k) => rows[k] ?? null)!.label, null);
  assert.equal(cashOverMonths(['2026-04'], () => null), null);

  // Through misSourceWithCash: the FY total keeps cash for the months that have it and names them (finished months only).
  const fk = ['2025-04', '2025-05', '2025-10', '2025-11'];
  const base: MisFormatSource = {
    fiscalYears: [{ name: 'FY 2025-26', months: fk.map((k) => ({ key: k, label: k })) }],
    point: () => pt({ netRevenue: 1000 }), channels: [], label: () => 'Company',
  };
  const src = misSourceWithCash(base, [cf('2025-10', 100, 80), cf('2025-11', 80, 150, 100)]);
  const tot = src.point(fk, 'company');
  assert.equal(tot.closingCash, 150);
  assert.equal(tot.openingCash, 100);
  assert.equal(tot.cashMonths, 'Oct–Nov');
  assert.equal(src.point(['2025-04'], 'company').closingCash, null);
});

test('#12 % view / % export print cash rows in ₹ Lac, not % of net revenue', () => {
  const cashRows = MIS_SHEET_ROWS.filter((r) => r.cash).map((r) => r.label);
  assert.deepEqual(cashRows, ['Opening Cash Balance (₹ lakh)', 'Funding (equity)', 'Closing Cash Balance (₹ lakh)', 'Total Cash Burn', 'EBITDA Burn']);
  const src: MisFormatSource = {
    fiscalYears: [{ name: 'FY 2026-27', months: [{ key: '2026-10', label: 'Oct' }] }],
    point: () => pt({ netRevenue: 10_00_000, payroll: 1_00_000, openingCash: 94_28_000, closingCash: 80_00_000, ebitda: -2_00_000, ebitdaBurn: 2_00_000 }),
    channels: [], label: () => 'Company', percent: true,
  };
  const ws = buildMisFormatWorkbook(src).Sheets['P&L Summary'];
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 });
  const val = (label: string) => grid.find((r) => r[0] === label)?.[1];
  assert.equal(val('Payroll Costs'), 0.1); // P&L row: % of NR
  assert.equal(val('Opening Cash Balance (₹ lakh)'), 94.28); // cash row: ₹ Lac, not 942.8 %
  assert.equal(val('EBITDA Burn'), 2);
});

test('#14 the stale FY_SUMMARY is gone (fiscal years are summed from the deck)', () => {
  assert.equal('FY_SUMMARY' in deckData, false);
});
