// Excel export of a planner scenario: 5-year summary, monthly P&L + cash, assumptions.

import XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { CHANNELS, CHANNEL_NAMES, type MonthResult, type Plan, type PlanResult } from '../data/planning/engine';
import { dilution, runRateArr } from '../data/planning/growth';
import { deployment, headline, theAsk } from '../data/planning/summary';

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
  if (ys.some((y) => y.storeRevenue > 0)) add('  Own stores', ys.map((y) => y.storeRevenue));
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

  // ---- Growth builder (when the scenario has one) ----
  const G = plan.growth;
  if (G) {
    const g: (string | number | null)[][] = [[`Growth builder (${G.on ? 'on' : 'off'}) — target exit ARR ₹${r2(G.targetArr / CRORE)} Cr; exit run-rate ARR ₹${r2(runRateArr(r) / CRORE)} Cr`], []];
    const ml = (m: number | null) => (m == null ? 'end' : r.months[m - 1]?.label ?? `M${m}`);
    g.push(['New product lines', 'Family', 'Launch', 'Price ₹', 'Units/mo at launch', 'm/m yr 1', 'y/y after', 'Material %', 'Extra mktg %', 'Launch cost ₹', 'Tooling ₹', 'In-house', 'Placeholder']);
    for (const x of plan.products.filter((p) => p.category || p.growthLine)) g.push([x.name + (x.on ? '' : ' (off)'), x.category ?? '', ml(x.launchMonth), x.asp, Math.round(x.launchUnits), x.rampPct, x.steadyPct, x.cogsPct, x.marketingPct ?? 0, x.launchCost ?? 0, x.launchCapex ?? 0, (x.inHouse ?? x.category === 'device') ? 'yes' : 'no', x.placeholder ? 'yes' : '']);
    g.push([], ['Hiring', 'Team', 'People', 'From', 'To', 'CTC / month ₹']);
    for (const h of G.hires) g.push([h.role + (h.on === false ? ' (off)' : ''), h.dept, h.count, ml(h.month), ml(h.end), h.monthlyCtc]);
    g.push([], ['Capacity (today ' + G.baseCapacity + ' units/mo)', 'Capex month', 'Lead months', '+ units/mo', 'Capex ₹', 'Running ₹/mo']);
    for (const b of G.capacity) g.push([b.name + (b.on ? '' : ' (off)'), ml(b.month), b.leadMonths, b.unitsPerMonth, b.capex, b.monthlyOpex]);
    g.push([], ['Other capex', 'Group', 'Month', 'Amount ₹']);
    for (const x of G.capex) g.push([x.name + (x.on ? '' : ' (off)'), x.group, ml(x.month), x.amount]);
    g.push([], ['Rounds', 'Month', 'Amount ₹', 'Pre-money ₹', 'Sold', "Today's holders keep", 'Agreed']);
    for (const d of dilution(plan)) g.push([d.name, ml(d.month), d.amount, d.preMoney, r2(d.sold * 100) + '%', r2(d.existingAfter * 100) + '%', d.name === 'Seed' ? 'yes' : (G.rounds.find((x) => x.name === d.name)?.confirmed ? 'yes' : 'no')]);
    g.push([], ['Stores (' + (G.stores.on ? 'on' : 'off') + ')', 'Mature revenue ₹/mo', G.stores.matureRevenue, 'Ramp months', G.stores.rampMonths, 'Fit-out ₹', G.stores.capexPerStore, 'Rent ₹/mo', G.stores.rentPerStore]);
    for (const o of G.stores.openings) g.push(['  opening', ml(o.month), o.count]);
    XLSX.utils.book_append_sheet(wb, sheet(g, { widths: [36, 14, 12, 12, 14, 12, 12, 12, 12, 14, 12, 10, 12] }), 'Growth builder');
  }

  // ---- business plan (the sheet's Business Plan tab) ----
  if (plan.business) {
    const B = plan.business;
    const spans = [12, 18, r.months.length].filter((n, i, a) => n <= r.months.length && a.indexOf(n) === i);
    const label = (n: number) => (n === 12 ? '12 months' : n === 18 ? '18 months' : 'Full plan');
    const conts = spans.map((n) => (n === 12 ? B.contingency12 : plan.cash.contingencyPct));
    const hs = spans.map((n) => headline(plan, r, n));
    const as = spans.map((n, i) => theAsk(plan, r, n, conts[i]));
    const bp: (string | number | null)[][] = [['Headline (₹ Cr)', ...spans.map(label)]];
    const bpPct = new Set<number>(), bpBold = new Set<number>();
    const put = (l: string, v: number[], isPct = false, bold = false) => { bp.push([l, ...v.map((x) => (isPct ? x : r2(x / CRORE)))]); if (isPct) bpPct.add(bp.length - 1); if (bold) bpBold.add(bp.length - 1); };
    put('Revenue', hs.map((h) => h.revenue), false, true);
    bp.push(['Units', ...hs.map((h) => Math.round(h.units))]);
    put('Gross margin', hs.map((h) => h.grossMargin), true);
    put('Contribution (CM3)', hs.map((h) => h.cm3Pct), true);
    put('EBITDA', hs.map((h) => h.ebitda));
    put('EBITDA %', hs.map((h) => h.ebitdaPct), true);
    put('Exit ARR', hs.map((h) => h.exitArr), false, true);
    bp.push([]); bp.push(['THE ASK (₹ Cr)', ...spans.map(label)]); bpBold.add(bp.length - 1);
    put('Peak cash deficit', as.map((a) => a.peakDeficit));
    put('Contingency buffer', as.map((a) => a.contingency), true);
    put('Total funding need', as.map((a) => a.fundingNeed));
    put('less venture debt', as.map((a) => -a.ventureDebt));
    put('EQUITY REQUIRED', as.map((a) => a.equityRequired), false, true);
    put('of which inventory (peak)', as.map((a) => a.inventoryPeak));
    put('of which GST asset (peak)', as.map((a) => a.gstAssetPeak));
    bp.push([]); bp.push(['USE OF FUNDS (₹ Cr)', ...spans.map(label)]); bpBold.add(bp.length - 1);
    const deps = spans.map((n) => deployment(plan, r, n));
    for (const t of deps[deps.length - 1].themes) put(t.theme, deps.map((d) => d.themes.find((x) => x.theme === t.theme)?.total ?? 0));
    put('Total tagged deployment', deps.map((d) => d.themes.reduce((a, x) => a + x.total, 0)), false, true);
    bp.push([]); bp.push(['KEY ASSUMPTIONS', 'Value', 'Basis']); bpBold.add(bp.length - 1);
    for (const a of B.assumptions) bp.push([a.assumption, a.value, a.basis]);
    bp.push([]); bp.push(['KEY RISKS', 'Mitigation']); bpBold.add(bp.length - 1);
    for (const x of B.risks) bp.push([x.risk, x.mitigation]);
    bp.push([]); bp.push(['THEMES & MILESTONES', 'Milestone', 'Month']); bpBold.add(bp.length - 1);
    for (const t of B.themes) bp.push([t.theme, t.milestone, r.months[t.month - 1]?.label ?? '']);
    if (B.team) { bp.push([]); bp.push(['TEAM STRUCTURE']); bpBold.add(bp.length - 1); for (const line of B.team.split('\n')) bp.push([line]); }
    XLSX.utils.book_append_sheet(wb, sheet(bp, { pctRows: bpPct, boldRows: bpBold, widths: [44, 22, 22, 22] }), 'Business plan');

    const n18 = Math.min(18, r.months.length);
    const d = deployment(plan, r, n18);
    const dep: (string | number | null)[][] = [['₹ lakh — milestone', 'Theme', ...d.months, 'Total']];
    for (const x of d.milestones) dep.push([x.key, x.theme, ...x.byMonth.map((v) => r2(v / LAC)), r2(x.total / LAC)]);
    dep.push([]);
    for (const x of d.themes) dep.push([x.key, '(theme)', ...x.byMonth.map((v) => r2(v / LAC)), r2(x.total / LAC)]);
    dep.push(['Total key deployment', '', ...d.tagged.map((v) => r2(v / LAC)), r2(d.tagged.reduce((a, v) => a + v, 0) / LAC)]);
    dep.push(['Total spend (all costs)', '', ...d.totalSpend.map((v) => r2(v / LAC)), r2(d.totalSpend.reduce((a, v) => a + v, 0) / LAC)]);
    dep.push(['Business as usual (untagged)', '', ...d.untagged.map((v) => r2(v / LAC)), r2(d.untagged.reduce((a, v) => a + v, 0) / LAC)]);
    XLSX.utils.book_append_sheet(wb, sheet(dep, { widths: [30, 28, ...d.months.map(() => 10), 12] }), 'Capital deployment');
  }

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
  row('Inventory purchase', (m) => m.inventoryPurchase);
  row('Output GST', (m) => m.outputGst);
  row('ITC goods (refundable)', (m) => m.itcGoods);
  row('ITC services & capex', (m) => m.itcServices);
  row('GST refund received', (m) => m.gstRefund);
  row('GST stuck (services)', (m) => m.gstStuck);
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
