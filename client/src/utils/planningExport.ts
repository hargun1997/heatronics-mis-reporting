// Excel export of a planner scenario: 5-year summary, monthly P&L + cash, assumptions.

import XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { CHANNELS, CHANNEL_NAMES, type MonthResult, type Plan, type PlanResult } from '../data/planning/engine';

const LAC = 1e5;
const CRORE = 1e7;
const r2 = (n: number) => Math.round(n * 100) / 100;
type Style = NonNullable<XLSX.CellObject['s']>;
const HEAD: Style = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'FE4705' } }, alignment: { horizontal: 'center' } };
const BOLD: Style = { font: { bold: true } };
const NUM = '#,##0.00;[Red]-#,##0.00';
const PCT = '0.0%';

function sheet(rows: (string | number | null)[][], opts: { pctRows?: Set<number>; boldRows?: Set<number>; widths?: number[] } = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let R = range.s.r; R <= range.e.r; R++) for (let C = range.s.c; C <= range.e.c; C++) {
    const ref = XLSX.utils.encode_cell({ r: R, c: C });
    const cell = ws[ref];
    if (!cell) continue;
    if (R === 0) { cell.s = HEAD; continue; }
    const s: Style = {};
    if (opts.boldRows?.has(R)) Object.assign(s, BOLD);
    if (cell.t === 'n') cell.z = opts.pctRows?.has(R) ? PCT : NUM;
    cell.s = s;
  }
  ws['!cols'] = (opts.widths ?? [34]).map((w) => ({ wch: w }));
  ws['!freeze'] = { xSplit: 1, ySplit: 1 };
  return ws;
}

export function downloadPlanWorkbook(plan: Plan, r: PlanResult) {
  const wb = XLSX.utils.book_new();

  // ---- 5-year summary (₹ Cr) ----
  const ys = r.years;
  const sum: (string | number | null)[][] = [['₹ Cr', ...ys.map((y) => y.fy + (y.months < 12 ? ` (${y.months} mo plan)` : ''))]];
  const pctRows = new Set<number>(), bold = new Set<number>();
  const add = (label: string, vals: number[], isPct = false, isBold = false) => {
    sum.push([label, ...vals.map((v) => (Number.isFinite(v) ? (isPct ? v : r2(v / CRORE)) : null))]);
    if (isPct) pctRows.add(sum.length - 1);
    if (isBold) bold.add(sum.length - 1);
  };
  add('Revenue (incl. Apr–Sep ’26 actuals entered)', ys.map((y) => y.revenueWithActuals), false, true);
  for (const ch of CHANNELS) add(`  ${CHANNEL_NAMES[ch]}`, ys.map((y) => y.revenueByChannel[ch]));
  add('Growth YoY', ys.map((y, i) => (i && (ys[i - 1].months === 12 || ys[i - 1].revenueWithActuals > ys[i - 1].revenue) ? y.revenueWithActuals / ys[i - 1].revenueWithActuals - 1 : NaN)), true);
  if (plan.d2c?.mode === 'cohorts') {
    sum.push(['D2C new buyers', ...ys.map((y) => Math.round(y.d2cNewCustomers))]);
    sum.push(['D2C repeat orders', ...ys.map((y) => Math.round(y.d2cRepeatOrders))]);
    add('D2C repeat share of revenue', ys.map((y) => y.d2cRepeatRevenue / ((y.d2cNewRevenue + y.d2cRepeatRevenue) || 1)), true);
  }
  add('Gross margin %', ys.map((y) => y.grossProfit / y.revenue), true);
  add('CM3 %', ys.map((y) => y.cm3 / y.revenue), true);
  add('EBITDA', ys.map((y) => y.ebitdaWithActuals), false, true);
  add('EBITDA %', ys.map((y) => y.ebitdaWithActuals / y.revenueWithActuals), true);
  add('PAT (plan months)', ys.map((y) => y.pat));
  add('Capex', ys.map((y) => y.capex));
  add('Net cash flow', ys.map((y) => y.netCashFlow));
  add('Closing cash', ys.map((y) => y.closingCash), false, true);
  add('Closing debt', ys.map((y) => y.endDebt));
  sum.push([]);
  sum.push(['Peak cumulative deficit (₹ Cr)', r2(r.peakDeficit / CRORE)]);
  sum.push(['Funding need incl. contingency (₹ Cr)', r2(r.fundingRequired / CRORE)]);
  sum.push(['Equity needed after debt (₹ Cr)', r2(r.equityRequired / CRORE)]);
  sum.push(['Lowest closing cash (₹ Cr)', r2(r.minClosingCash / CRORE)]);
  XLSX.utils.book_append_sheet(wb, sheet(sum, { pctRows, boldRows: bold, widths: [44, 14, 14, 14, 14, 14] }), '5-year summary');

  // ---- monthly P&L + cash (₹ lakh) ----
  const ms = r.months;
  const monthly: (string | number | null)[][] = [['₹ lakh', ...ms.map((m) => m.label)]];
  const mPct = new Set<number>(), mBold = new Set<number>();
  const row = (label: string, f: (m: MonthResult) => number, opt: { pct?: boolean; bold?: boolean } = {}) => {
    monthly.push([label, ...ms.map((m) => (opt.pct ? (m.netRevenue ? f(m) / m.netRevenue : 0) : r2(f(m) / LAC)))]);
    if (opt.pct) mPct.add(monthly.length - 1);
    if (opt.bold) mBold.add(monthly.length - 1);
  };
  row('Units', (m) => m.units * LAC);
  row('Net revenue', (m) => m.netRevenue, { bold: true });
  for (const ch of CHANNELS) row(`  ${CHANNEL_NAMES[ch]}`, (m) => m.revenueByChannel[ch]);
  row('COGS', (m) => -m.cogs);
  row('Gross profit', (m) => m.grossProfit, { bold: true });
  row('Gross margin %', (m) => m.grossProfit, { pct: true });
  row('Channel commission', (m) => -(m.groups['Channel Commission'] ?? 0));
  row('CM1', (m) => m.cm1, { bold: true });
  row('Fulfilment, payment', (m) => -(m.groups['Fulfilment & Delivery'] ?? 0) - (m.groups['Payment & Collection'] ?? 0));
  row('CM2', (m) => m.cm2, { bold: true });
  row('Performance marketing', (m) => -(m.groups['Performance Marketing'] ?? 0));
  row('CM3', (m) => m.cm3, { bold: true });
  for (const g of plan.groups.filter((x) => x.section === 'opex' && x.name !== 'Depreciation & Amortisation')) row(`  ${g.name}`, (m) => -(m.groups[g.name] ?? 0));
  row('EBITDA', (m) => m.ebitda, { bold: true });
  row('EBITDA %', (m) => m.ebitda, { pct: true });
  row('Depreciation', (m) => -m.da);
  row('Interest', (m) => -m.interest);
  row('Bank & fundraise costs', (m) => -m.banking - m.fundraiseCosts);
  row('Tax', (m) => -m.tax);
  row('PAT', (m) => m.pat, { bold: true });
  monthly.push([]);
  row('Change in working capital', (m) => m.nwcChange);
  row('Capex', (m) => -m.capex);
  row('Net cash flow', (m) => m.netCashFlow, { bold: true });
  row('Equity raised', (m) => m.equity);
  row('Debt drawn − repaid', (m) => m.debtNet);
  row('Closing cash', (m) => m.closingCash, { bold: true });
  row('Inventory', (m) => m.inventory);
  row('GST asset', (m) => m.gstAsset);
  row('Net working capital', (m) => m.nwc);
  row('Closing debt', (m) => m.debt);
  XLSX.utils.book_append_sheet(wb, sheet(monthly, { pctRows: mPct, boldRows: mBold, widths: [30, ...ms.map(() => 10)] }), 'Monthly');

  // ---- assumptions ----
  const L = plan.levers;
  const a: (string | number | null)[][] = [['Assumption', 'Value']];
  a.push(['Scenario', plan.name], ['Base', plan.source ?? ''], ['Horizon', `${ms[0].label} → ${ms[ms.length - 1].label}`]);
  for (const fy of Object.keys(L.growth)) for (const ch of CHANNELS) a.push([`${fy} unit growth — ${CHANNEL_NAMES[ch]}`, L.growth[fy][ch]]);
  for (const ch of CHANNELS) a.push([`18-month plan volume × — ${CHANNEL_NAMES[ch]}`, L.baseVolume[ch]]);
  a.push(['Price change / year (from FY29)', L.aspGrowthPct], ['Raw material % change / year', L.cogsDeltaPerYear], ['ROAS gain / year', L.roasGainPct],
    ['Inflation on fixed costs / year', L.inflationPct], ['Team growth / year', L.teamGrowthPct], ['Brand & creative % of revenue (0 = fixed lines)', L.brandPctOfRevenue],
    ['Tax method', L.taxMode === 'fy' ? 'By FY, losses carried forward' : 'As the sheet (each profitable month)'],
    ['Seasonality after the base', L.seasonShape === 'history' ? 'Learned curves per product' : "The sheet's last-year month shape"]);
  if (plan.d2c) {
    const d = plan.d2c;
    a.push(['D2C model', d.mode === 'cohorts' ? 'Customers: new buyers × AOV + repeats' : 'Units (as sheet)'], ['D2C learned from', `${d.source}, as of ${d.asOf}`],
      ['Same-month 2nd order', d.sameMonth], ['Next-month reorder', d.nextMonth], ['Months 2–11 repeat / month', d.monthly], ['Year 2+ repeat / month', d.yearly],
      ['Yearly fade', d.yearlyFade], ['Repeat boost', d.repeatBoost], ['AOV new buyers ₹', Math.round(d.aovNew)], ['AOV repeat ₹', Math.round(d.aovRepeat)]);
  }
  for (const p of plan.products.filter((x) => x.on)) a.push([`New product: ${p.name}`, `₹${p.asp}, launch ${ms[p.launchMonth - 1]?.label}, ${p.launchUnits}/mo, ramp ${Math.round(p.rampPct * 100)}% MoM, then ${Math.round(p.steadyPct * 100)}% YoY`]);
  for (const e of plan.events) a.push([`${e.kind === 'equity' ? 'Equity' : e.kind === 'debtDrawn' ? 'Debt drawn' : 'Debt repaid'} ${ms[e.month - 1]?.label}`, `₹${r2(e.amount / CRORE)} Cr ${e.note}`]);
  XLSX.utils.book_append_sheet(wb, sheet(a, { widths: [50, 60] }), 'Assumptions');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const safe = plan.name.replace(/[^\w\- ]+/g, '').trim() || 'Plan';
  saveAs(new Blob([out], { type: 'application/octet-stream' }), `Heatronics 5-year plan — ${safe}.xlsx`);
}
