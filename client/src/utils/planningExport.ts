// Excel export of a planner scenario, laid out like the Projection & Deployment Plan sheet: Overview, Business Plan,
// 1. Revenue Planning, 2. Expense Calendar, 3. P&L, 4. Cash Flow & Fundraise (months + FY columns), then Capital
// deployment, Growth builder and Assumptions.

import XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { CHANNELS, CHANNEL_NAMES, type MonthResult, type Plan, type PlanResult } from '../data/planning/engine';
import { dilution, roundStats, runRateArr } from '../data/planning/growth';
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
  sum.push(['By channel (gross sales incl. GST, before deductions)']);
  for (const ch of CHANNELS) add(`  ${CHANNEL_NAMES[ch]}`, ys.map((y) => y.revenueByChannel[ch]));
  if (ys.some((y) => y.retailRevenue > 0)) add('  GT / MT / pharmacy (new lines)', ys.map((y) => y.retailRevenue));
  if (ys.some((y) => y.storeRevenue > 0)) add('  Own stores', ys.map((y) => y.storeRevenue));
  if (plan.growth?.on && plan.growth.path) add('Revenue target (growth path)', ys.map((y) => plan.growth!.path![y.fy] ?? NaN));
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
  sum.push(['Exit run-rate ARR, last 3 months × 4 (₹ Cr)', r2(runRateArr(r) / CRORE)]);
  sum.push(['Equity in the plan incl. seed and rounds (₹ Cr)', r2(r.equityPlanned / CRORE)]);
  XLSX.utils.book_append_sheet(wb, sheet(sum, { pctRows, boldRows: bold, widths: [44, 14, 14, 14, 14, 14] }), 'Overview');

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
    XLSX.utils.book_append_sheet(wb, sheet(bp, { pctRows: bpPct, boldRows: bpBold, widths: [44, 22, 22, 22] }), 'Business Plan');

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

  // ---- monthly tabs, laid out like the sheet: months, then one column per FY (flows summed, balances at FY end) ----
  const ms = r.months;
  const fys = r.years.map((y) => y.fy);
  type Kind = 'flow' | 'bal' | 'pct' | 'count';
  const build = (title: string) => {
    const rows: (string | number | null)[][] = [[title, ...ms.map((m) => m.label), ...fys]];
    const pctRows = new Set<number>(), boldRows = new Set<number>();
    const row = (label: string, f: (m: MonthResult) => number, kind: Kind = 'flow', opt: { bold?: boolean; base?: (m: MonthResult) => number } = {}) => {
      const vals = ms.map(f);
      const cell = (v: number) => (kind === 'pct' || kind === 'count' ? (kind === 'count' ? Math.round(v) : v) : r2(v / LAC));
      const byFy = fys.map((fy) => {
        const idx = ms.map((m, i) => (m.fy === fy ? i : -1)).filter((i) => i >= 0);
        if (kind === 'bal') return vals[idx[idx.length - 1]];
        if (kind === 'pct') { const b = opt.base ?? ((m: MonthResult) => m.netRevenue); const num = idx.reduce((a, i) => a + (opt.base ? vals[i] * b(ms[i]) : vals[i] * ms[i].netRevenue), 0); const den = idx.reduce((a, i) => a + b(ms[i]), 0); return den ? num / den : 0; }
        return idx.reduce((a, i) => a + vals[i], 0);
      });
      rows.push([label, ...vals.map(cell), ...byFy.map(cell)]);
      if (kind === 'pct') pctRows.add(rows.length - 1);
      if (opt.bold) boldRows.add(rows.length - 1);
    };
    const gap = (label = '') => { rows.push([label]); if (label) boldRows.add(rows.length - 1); };
    const done = (name: string) => XLSX.utils.book_append_sheet(wb, sheet(rows, { pctRows, boldRows, widths: [36, ...ms.map(() => 10), ...fys.map(() => 12)] }), name);
    return { row, gap, done };
  };
  const ratio = (f: (m: MonthResult) => number) => (m: MonthResult) => (m.netRevenue ? f(m) / m.netRevenue : 0);

  // 1. Revenue Planning — units and revenue by product and channel
  {
    const t = build('Units / ₹ lakh');
    const prods = [...plan.skus.map((s) => ({ id: s.id, name: s.name })), ...plan.products.filter((p) => p.on).map((p) => ({ id: p.id, name: p.name }))];
    t.gap('UNITS BY PRODUCT (all channels)');
    t.row('Total units', (m) => m.units, 'count', { bold: true });
    for (const p of prods) t.row(`  ${p.name}`, (m) => m.unitsBySku[p.id] ?? 0, 'count');
    if (ms.some((m) => m.repeatUnits > 0)) t.row('  of which repeat orders (consumables)', (m) => m.repeatUnits, 'count');
    t.gap('REVENUE BY PRODUCT (₹ lakh, incl. GST, before deductions)');
    for (const p of prods) t.row(`  ${p.name}`, (m) => m.revenueBySku[p.id] ?? 0);
    if (ms.some((m) => m.storeRevenue > 0)) t.row('  Own stores', (m) => m.storeRevenue);
    t.gap('AVERAGE PRICE REALISED (₹ / unit)');
    for (const p of prods) t.row(`  ${p.name}`, (m) => ((m.unitsBySku[p.id] ?? 0) > 0 ? (m.revenueBySku[p.id] ?? 0) / m.unitsBySku[p.id] : 0) * LAC, 'bal');
    t.gap('REVENUE BY CHANNEL (₹ lakh)');
    t.row('Gross revenue', (m) => m.grossRevenue, 'flow', { bold: true });
    for (const ch of CHANNELS) t.row(`  ${CHANNEL_NAMES[ch]}`, (m) => m.revenueByChannel[ch]);
    const types = plan.growth?.retail ?? [];
    if (ms.some((m) => m.retailRevenue > 0)) for (const ty of types) t.row(`  ${ty.name}`, (m) => m.retailByType[ty.id] ?? 0);
    if (ms.some((m) => m.storeRevenue > 0)) t.row('  Own stores', (m) => m.storeRevenue);
    t.row('Revenue deductions', (m) => -m.revenueDeductions);
    t.row('Net revenue (P&L)', (m) => m.netRevenue, 'flow', { bold: true });
    if (plan.d2c?.mode === 'cohorts') {
      t.gap('D2C CUSTOMERS');
      t.row('New buyers', (m) => m.d2cNewCustomers, 'count');
      t.row('Repeat orders', (m) => m.d2cRepeatOrders, 'count');
      t.row('New-buyer revenue', (m) => m.d2cNewRevenue);
      t.row('Repeat revenue', (m) => m.d2cRepeatRevenue);
    }
    if (types.length) {
      t.gap('OUTLETS LIVE (GT / MT / pharmacy)');
      for (const ty of types) t.row(`  ${ty.name}`, (m) => m.outlets[ty.id] ?? 0, 'count');
    }
    t.done('1. Revenue Planning');
  }

  // 2. Expense Calendar — every line by month, by group, with the Growth builder's costs per group
  {
    const rows: (string | number | null)[][] = [['₹ lakh', 'Group', 'Type', 'Amount', 'From', 'To', ...ms.map((m) => m.label), ...fys]];
    const boldRows = new Set<number>();
    const ml = (m: number | null) => (m == null ? 'end' : ms[m - 1]?.label ?? `M${m}`);
    const fyTot = (vals: number[]) => fys.map((fy) => r2(ms.reduce((a, m, i) => a + (m.fy === fy ? vals[i] : 0), 0) / LAC));
    const allGroups = [...plan.groups];
    for (const g of [...new Set(ms.flatMap((m) => Object.keys(m.groups)))]) if (!allGroups.some((x) => x.name === g)) allGroups.push({ name: g, section: 'opex' });
    for (const sec of ['revex', 'opex', 'capex', 'finex'] as const) {
      const gs = allGroups.filter((g) => g.section === sec);
      if (!gs.length) continue;
      rows.push([{ revex: 'REVENUE-LINKED', opex: 'OPEX', capex: 'CAPEX', finex: 'FINANCE' }[sec]]); boldRows.add(rows.length - 1);
      for (const g of gs) {
        const ls = plan.lines.filter((l) => l.group === g.name);
        for (const l of ls) {
          const vals = ms.map((m) => m.lines[l.id] ?? 0);
          rows.push([l.name + (l.off ? ' (off)' : ''), g.name, l.type, l.amount, ml(l.start), ml(l.end), ...vals.map((v) => r2(v / LAC)), ...fyTot(vals)]);
        }
        const tot = ms.map((m) => m.groups[g.name] ?? 0);
        const extra = ms.map((m, i) => tot[i] - ls.reduce((a, l) => a + (m.lines[l.id] ?? 0), 0));
        if (extra.some((v) => Math.abs(v) > 1)) rows.push(['  Growth builder / own-cost products', g.name, 'computed', null, null, null, ...extra.map((v) => r2(v / LAC)), ...fyTot(extra)]);
        rows.push([`Total ${g.name}`, '', '', null, null, null, ...tot.map((v) => r2(v / LAC)), ...fyTot(tot)]); boldRows.add(rows.length - 1);
      }
    }
    XLSX.utils.book_append_sheet(wb, sheet(rows, { boldRows, widths: [40, 26, 16, 10, 9, 9, ...ms.map(() => 10), ...fys.map(() => 12)] }), '2. Expense Calendar');
  }

  // 3. P&L — the cascade
  {
    const t = build('₹ lakh');
    t.row('Units', (m) => m.units, 'count');
    t.row('Gross revenue (incl. GST)', (m) => m.grossRevenue);
    t.row('Revenue deductions', (m) => -m.revenueDeductions);
    t.row('Net revenue', (m) => m.netRevenue, 'flow', { bold: true });
    t.row('COGS (material, inward, factory payroll, overhead)', (m) => -m.cogs);
    t.row('Gross profit', (m) => m.grossProfit, 'flow', { bold: true });
    t.row('Gross margin %', ratio((m) => m.grossProfit), 'pct');
    t.row('Channel commission', (m) => -(m.groups['Channel Commission'] ?? 0));
    t.row('GST services expensed', (m) => -m.gstWrittenOff);
    t.row('CM1', (m) => m.cm1, 'flow', { bold: true });
    t.row('Fulfilment & delivery', (m) => -(m.groups['Fulfilment & Delivery'] ?? 0));
    t.row('Payment & collection', (m) => -(m.groups['Payment & Collection'] ?? 0));
    t.row('CM2', (m) => m.cm2, 'flow', { bold: true });
    t.row('Performance marketing', (m) => -(m.groups['Performance Marketing'] ?? 0));
    t.row('CM3', (m) => m.cm3, 'flow', { bold: true });
    t.row('CM3 %', ratio((m) => m.cm3), 'pct');
    const opexGroups = [...plan.groups.filter((x) => x.section === 'opex' && x.name !== 'Depreciation & Amortisation').map((g) => g.name)];
    if (ms.some((m) => (m.groups['Retail Stores'] ?? 0) > 0) && !opexGroups.includes('Retail Stores')) opexGroups.push('Retail Stores');
    for (const g of opexGroups) t.row(`  ${g}`, (m) => -(m.groups[g] ?? 0));
    t.row('Opex', (m) => -m.opex, 'flow', { bold: true });
    t.row('EBITDA', (m) => m.ebitda, 'flow', { bold: true });
    t.row('EBITDA %', ratio((m) => m.ebitda), 'pct');
    t.row('Depreciation', (m) => -m.da);
    t.row('EBIT', (m) => m.ebit, 'flow', { bold: true });
    t.row('Interest', (m) => -m.interest);
    t.row('Bank charges', (m) => -m.banking);
    t.row('Fundraise costs', (m) => -m.fundraiseCosts);
    t.row('PBT', (m) => m.pbt, 'flow', { bold: true });
    t.row('Tax', (m) => -m.tax);
    t.row('PAT', (m) => m.pat, 'flow', { bold: true });
    t.done('3. P&L');
  }

  // 4. Cash Flow & Fundraise — GST, working capital, debt, equity, cash
  {
    const t = build('₹ lakh');
    t.gap('GST (INVERTED DUTY)');
    t.row('Taxable turnover', (m) => m.taxableTurnover);
    t.row('Output GST', (m) => m.outputGst);
    t.row('ITC on goods (refundable)', (m) => m.itcGoods);
    t.row('ITC on services & capex', (m) => m.itcServices);
    t.row('Set-off: services', (m) => m.gstSetOffServices);
    t.row('Set-off: goods', (m) => m.gstSetOffGoods);
    t.row('Claimable (goods)', (m) => m.gstClaimable);
    t.row('Stuck (services)', (m) => m.gstStuck);
    t.row('Refund received', (m) => m.gstRefund);
    t.row('GST asset', (m) => m.gstAsset, 'bal', { bold: true });
    t.gap('WORKING CAPITAL');
    t.row('Inventory', (m) => m.inventory, 'bal');
    t.row('Inventory purchase', (m) => m.inventoryPurchase);
    t.row('Receivables', (m) => m.receivables, 'bal');
    t.row('Payables', (m) => m.payables, 'bal');
    t.row('Net working capital', (m) => m.nwc, 'bal', { bold: true });
    t.row('Change in working capital (cash)', (m) => m.nwcChange);
    t.gap('CASH FLOW');
    t.row('EBITDA', (m) => m.ebitda);
    t.row('Tax', (m) => -m.tax);
    t.row('Interest', (m) => -m.interest);
    t.row('Bank & fundraise costs', (m) => -m.banking - m.fundraiseCosts);
    t.row('Change in working capital', (m) => m.nwcChange);
    t.row('Capex', (m) => -m.capex);
    t.row('Net cash flow (operations + capex)', (m) => m.netCashFlow, 'flow', { bold: true });
    t.row('Cumulative cash flow', (m) => m.cumulativeCash, 'bal');
    t.gap('FUNDING');
    t.row('Equity (seed, events, rounds)', (m) => m.equity);
    t.row('  of which Growth-builder rounds', (m) => m.roundEquity);
    t.row('Debt drawn − repaid', (m) => m.debtNet);
    t.row('Bank debt', (m) => m.bankDebt, 'bal');
    t.row('Venture debt', (m) => m.ventureBalance, 'bal');
    t.row('Overdraft drawn', (m) => m.overdraft, 'bal');
    t.row('Closing cash', (m) => m.closingCash, 'bal', { bold: true });
    t.row('Cumulative need (sizes the Ask)', (m) => m.cumulativeNeed, 'bal');
    t.done('4. Cash Flow & Fundraise');
  }

  // ---- Growth builder (when the scenario has one) ----
  const G = plan.growth;
  if (G) {
    const g: (string | number | null)[][] = [[`Growth builder (${G.on ? 'on' : 'off'}) — target exit ARR ₹${r2(G.targetArr / CRORE)} Cr; exit run-rate ARR ₹${r2(runRateArr(r) / CRORE)} Cr`], []];
    const ml = (m: number | null) => (m == null ? 'end' : r.months[m - 1]?.label ?? `M${m}`);
    g.push(['New product lines', 'Family', 'Launch', 'Price ₹', 'New buyers/mo at launch', 'm/m yr 1', 'y/y after', 'Material %', 'Extra mktg %', 'Launch cost ₹', 'Tooling ₹', 'In-house', 'Repeat', 'Kept / mo', 'Placeholder']);
    for (const x of plan.products.filter((p) => p.category || p.growthLine)) g.push([x.name + (x.on ? '' : ' (off)'), x.category ?? '', ml(x.launchMonth), x.asp, Math.round(x.launchUnits), x.rampPct, x.steadyPct, x.cogsPct, x.marketingPct ?? 0, x.launchCost ?? 0, x.launchCapex ?? 0, (x.inHouse ?? x.category === 'device') ? 'yes' : 'no', x.repeatPct ?? 0, x.repeatDecay ?? 0, x.placeholder ? 'yes' : '']);
    g.push([], ['Hiring', 'Team', 'People (min)', 'From', 'To', 'CTC / month ₹', 'Grows with', '1 per']);
    for (const h of G.hires) g.push([h.role + (h.on === false ? ' (off)' : ''), h.dept, h.count, ml(h.month), ml(h.end), h.monthlyCtc, h.scale ? (h.scale.by === 'outlets' ? `outlets ${h.scale.type ?? 'all'}` : h.scale.by) : 'fixed', h.scale?.every ?? null]);
    g.push([], ['Warehouses, offices & other expenses', 'Kind', 'Group', 'From', 'To', '₹/mo or %', 'Sq ft', 'Rent ₹/sq ft', 'Running ₹/mo', 'Deposit (mo)', 'Fit-out ₹', '+ / yr']);
    for (const o of G.overheads ?? []) g.push([o.name + (o.on ? '' : ' (off)'), o.kind, o.group, ml(o.month), ml(o.end), o.kind === 'site' ? null : o.amount, o.sqft ?? null, o.rentPerSqft ?? null, o.runningPerMonth ?? null, o.depositMonths ?? null, o.fitout ?? null, o.growthPct]);
    if (G.funding) g.push([], ['Round sizing', 'Cash buffer ₹', G.funding.buffer, 'Runway months', G.funding.runwayMonths, 'Min round ₹', G.funding.minRound, 'Pre-money × ARR', G.funding.preMoneyMultiple, 'Fee', G.funding.feePct]);
    g.push([], ['Round', 'Month', 'Amount ₹', 'Cash before ₹', 'Burn / mo ₹ (next 12)', 'Runway (months)']);
    for (const x of roundStats(plan, r)) g.push([x.name, ml(x.month), x.amount, Math.round(x.cashBefore), Math.round(x.burn), x.runway ?? 'to the end']);
    g.push([], ['Product channels', 'Channel', 'Share', 'From', '+ / yr']);
    for (const x of plan.products.filter((p) => p.growthLine && p.on)) for (const c of CHANNELS) if ((x.split[c] ?? 0) > 0) g.push([x.name, CHANNEL_NAMES[c], x.split[c], ml(x.chStart?.[c] ?? x.launchMonth), x.chGrowth?.[c] ?? 0]);
    g.push([], ['Capacity (today ' + G.baseCapacity + ' units/mo)', 'Capex month', 'Lead months', '+ units/mo', 'Capex ₹', 'Running ₹/mo']);
    for (const b of G.capacity) g.push([b.name + (b.on ? '' : ' (off)'), ml(b.month), b.leadMonths, b.unitsPerMonth, b.capex, b.monthlyOpex]);
    g.push([], ['Other capex', 'Group', 'Month', 'Amount ₹']);
    for (const x of G.capex) g.push([x.name + (x.on ? '' : ' (off)'), x.group, ml(x.month), x.amount]);
    g.push([], ['Rounds', 'Month', 'Amount ₹', 'Pre-money ₹', 'Sold', "Today's holders keep", 'Agreed']);
    for (const d of dilution(plan)) g.push([d.name, ml(d.month), d.amount, d.preMoney, r2(d.sold * 100) + '%', r2(d.existingAfter * 100) + '%', d.name === 'Seed' ? 'yes' : (G.rounds.find((x) => x.name === d.name)?.confirmed ? 'yes' : 'no')]);
    g.push([], ['Stores (' + (G.stores.on ? 'on' : 'off') + ')', 'Mature revenue ₹/mo', G.stores.matureRevenue, 'Ramp months', G.stores.rampMonths, 'Fit-out ₹', G.stores.capexPerStore, 'Rent ₹/mo', G.stores.rentPerStore]);
    for (const o of G.stores.openings) g.push(['  opening', ml(o.month), o.count]);
    if (G.path) { g.push([], ['Revenue path (P&L revenue ₹ Cr)', 'Target', 'Plan', 'New-buyer push']); for (const y of r.years) if (G.path[y.fy] != null) g.push([y.fy, r2(G.path[y.fy] / CRORE), r2(y.revenue / CRORE), r2(G.push?.[y.fy] ?? 1)]); }
    for (const t of G.retail ?? []) {
      g.push([], [`${t.name} (${t.on ? 'on' : 'off'})`, 'Topicals / outlet / mo', t.units.topical ?? 0, 'Nutra', t.units.nutra ?? 0, 'Devices', t.units.device ?? 0, 'Trade margin', t.tradeMarginPct, 'Schemes', t.schemePct, 'Listing ₹', t.listingFee, 'Servicing ₹/mo', t.servicePerOutlet]);
      for (const o of t.outlets) g.push(['  outlets added', ml(o.month), o.add]);
    }
    XLSX.utils.book_append_sheet(wb, sheet(g, { widths: [36, 14, 12, 12, 14, 12, 12, 12, 12, 14, 12, 10, 12] }), 'Growth builder');
  }

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
