/**
 * Professional MIS Excel Export Utility
 *
 * Creates professionally formatted Excel workbooks with:
 * - Monthly P&L reports with ACTUAL subheads from transactionsByHead
 * - Fallback to direct MISRecord properties when transactionsByHead is empty
 * - Annual/FY summaries with month-by-month comparison
 * - Revenue formula explanations
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  MISRecord,
  periodToString,
  MISHead,
  SALES_CHANNELS
} from '../types/misTracking';

// ============================================
// TYPES
// ============================================

export interface ExcelExportOptions {
  includeSummary: boolean;
  includeFYSheets: boolean;
  includeMonthlySheets: boolean;
  includeRevenueAnalysis: boolean;
  includeExpenseAnalysis: boolean;
  includeTransactions: boolean;
  selectedFYs: string[];
  selectedMonths: string[];
}

// ============================================
// CONSTANTS
// ============================================

const FY_MONTHS = [
  { month: 4, label: 'Apr' },
  { month: 5, label: 'May' },
  { month: 6, label: 'Jun' },
  { month: 7, label: 'Jul' },
  { month: 8, label: 'Aug' },
  { month: 9, label: 'Sep' },
  { month: 10, label: 'Oct' },
  { month: 11, label: 'Nov' },
  { month: 12, label: 'Dec' },
  { month: 1, label: 'Jan' },
  { month: 2, label: 'Feb' },
  { month: 3, label: 'Mar' }
];

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatAmountFull(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function formatPercentValue(value: number): string {
  if (isNaN(value) || !isFinite(value)) return '-';
  return `${value.toFixed(2)}%`;
}

function parseFYLabel(fyLabel: string): number {
  const match = fyLabel.match(/FY (\d{4})-/);
  return match ? parseInt(match[1]) : new Date().getFullYear();
}

function getYearForMonth(fyStartYear: number, month: number): number {
  return month >= 4 ? fyStartYear : fyStartYear + 1;
}

export function getAvailableFYs(records: MISRecord[]): string[] {
  const fys = new Set<string>();
  for (const record of records) {
    const { month, year } = record.period;
    const fyStartYear = month >= 4 ? year : year - 1;
    fys.add(`FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`);
  }
  return Array.from(fys).sort().reverse();
}

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

// Get subheads for a head - from transactionsByHead or fallback to direct properties
function getSubheadsForHead(record: MISRecord, headKey: MISHead): { subhead: string; amount: number; txnCount: number; source: string }[] {
  // First try transactionsByHead
  const txnHead = record.transactionsByHead?.[headKey];
  if (txnHead && txnHead.subheads && txnHead.subheads.length > 0) {
    return txnHead.subheads.map(s => ({
      subhead: s.subhead,
      amount: s.amount,
      txnCount: s.transactionCount,
      source: s.source
    }));
  }

  // Fallback to direct properties
  const subheads: { subhead: string; amount: number; txnCount: number; source: string }[] = [];

  switch (headKey) {
    case 'F. Channel & Fulfillment':
      if (record.channelFulfillment.amazonFees > 0)
        subheads.push({ subhead: 'Amazon Fees', amount: record.channelFulfillment.amazonFees, txnCount: 0, source: 'balance_sheet' });
      if (record.channelFulfillment.blinkitFees > 0)
        subheads.push({ subhead: 'Blinkit Fees', amount: record.channelFulfillment.blinkitFees, txnCount: 0, source: 'balance_sheet' });
      if (record.channelFulfillment.d2cFees > 0)
        subheads.push({ subhead: 'D2C Fees', amount: record.channelFulfillment.d2cFees, txnCount: 0, source: 'balance_sheet' });
      break;

    case 'G. Sales & Marketing':
      if (record.salesMarketing.facebookAds > 0)
        subheads.push({ subhead: 'Facebook Ads', amount: record.salesMarketing.facebookAds, txnCount: 0, source: 'balance_sheet' });
      if (record.salesMarketing.googleAds > 0)
        subheads.push({ subhead: 'Google Ads', amount: record.salesMarketing.googleAds, txnCount: 0, source: 'balance_sheet' });
      if (record.salesMarketing.amazonAds > 0)
        subheads.push({ subhead: 'Amazon Ads', amount: record.salesMarketing.amazonAds, txnCount: 0, source: 'balance_sheet' });
      if (record.salesMarketing.blinkitAds > 0)
        subheads.push({ subhead: 'Blinkit Ads', amount: record.salesMarketing.blinkitAds, txnCount: 0, source: 'balance_sheet' });
      if (record.salesMarketing.agencyFees > 0)
        subheads.push({ subhead: 'Agency Fees', amount: record.salesMarketing.agencyFees, txnCount: 0, source: 'balance_sheet' });
      if (record.salesMarketing.advertisingMarketing > 0)
        subheads.push({ subhead: 'Advertising & Marketing', amount: record.salesMarketing.advertisingMarketing, txnCount: 0, source: 'balance_sheet' });
      break;

    case 'H. Platform Costs':
      if (record.platformCosts.shopifySubscription > 0)
        subheads.push({ subhead: 'Shopify Subscription', amount: record.platformCosts.shopifySubscription, txnCount: 0, source: 'balance_sheet' });
      if (record.platformCosts.watiSubscription > 0)
        subheads.push({ subhead: 'Wati Subscription', amount: record.platformCosts.watiSubscription, txnCount: 0, source: 'balance_sheet' });
      if (record.platformCosts.shopfloSubscription > 0)
        subheads.push({ subhead: 'Shopflo Subscription', amount: record.platformCosts.shopfloSubscription, txnCount: 0, source: 'balance_sheet' });
      break;

    case 'I. Operating Expenses':
      if (record.operatingExpenses.salariesAdminMgmt > 0)
        subheads.push({ subhead: 'Salaries (Admin Mgmt)', amount: record.operatingExpenses.salariesAdminMgmt, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.miscellaneous > 0)
        subheads.push({ subhead: 'Miscellaneous (Travel, Insurance)', amount: record.operatingExpenses.miscellaneous, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.legalCaExpenses > 0)
        subheads.push({ subhead: 'Legal & CA Expenses', amount: record.operatingExpenses.legalCaExpenses, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.platformCostsCRM > 0)
        subheads.push({ subhead: 'Platform Costs (CRM)', amount: record.operatingExpenses.platformCostsCRM, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.administrativeExpenses > 0)
        subheads.push({ subhead: 'Administrative Expenses', amount: record.operatingExpenses.administrativeExpenses, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.staffWelfareEvents > 0)
        subheads.push({ subhead: 'Staff Welfare & Events', amount: record.operatingExpenses.staffWelfareEvents, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.banksFinanceCharges > 0)
        subheads.push({ subhead: 'Banks & Finance Charges', amount: record.operatingExpenses.banksFinanceCharges, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.otherOperatingExpenses > 0)
        subheads.push({ subhead: 'Other Operating Expenses', amount: record.operatingExpenses.otherOperatingExpenses, txnCount: 0, source: 'balance_sheet' });
      break;

    case 'J. Non-Operating':
      if (record.nonOperating.interestExpense > 0)
        subheads.push({ subhead: 'Interest Expense', amount: record.nonOperating.interestExpense, txnCount: 0, source: 'balance_sheet' });
      if (record.nonOperating.depreciation > 0)
        subheads.push({ subhead: 'Depreciation', amount: record.nonOperating.depreciation, txnCount: 0, source: 'balance_sheet' });
      if (record.nonOperating.amortization > 0)
        subheads.push({ subhead: 'Amortization', amount: record.nonOperating.amortization, txnCount: 0, source: 'balance_sheet' });
      if (record.nonOperating.incomeTax > 0)
        subheads.push({ subhead: 'Income Tax', amount: record.nonOperating.incomeTax, txnCount: 0, source: 'balance_sheet' });
      break;

    case 'E. COGM':
      if (record.cogm.rawMaterialsInventory > 0)
        subheads.push({ subhead: 'Raw Materials & Inventory', amount: record.cogm.rawMaterialsInventory, txnCount: 0, source: 'calculated' });
      if (record.cogm.consumables > 0)
        subheads.push({ subhead: 'Consumables', amount: record.cogm.consumables, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.manufacturingWages > 0)
        subheads.push({ subhead: 'Manufacturing Wages', amount: record.cogm.manufacturingWages, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.contractWagesMfg > 0)
        subheads.push({ subhead: 'Contract Wages (Mfg)', amount: record.cogm.contractWagesMfg, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.inboundTransport > 0)
        subheads.push({ subhead: 'Inbound Transport', amount: record.cogm.inboundTransport, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.factoryRent > 0)
        subheads.push({ subhead: 'Factory Rent', amount: record.cogm.factoryRent, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.factoryElectricity > 0)
        subheads.push({ subhead: 'Factory Electricity', amount: record.cogm.factoryElectricity, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.factoryMaintenance > 0)
        subheads.push({ subhead: 'Factory Maintenance', amount: record.cogm.factoryMaintenance, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.jobWork > 0)
        subheads.push({ subhead: 'Job Work', amount: record.cogm.jobWork, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.qualityTesting > 0)
        subheads.push({ subhead: 'Quality Testing', amount: record.cogm.qualityTesting, txnCount: 0, source: 'balance_sheet' });
      if (record.cogm.otherDirectExpenses > 0)
        subheads.push({ subhead: 'Other Direct Expenses', amount: record.cogm.otherDirectExpenses, txnCount: 0, source: 'balance_sheet' });
      break;
  }

  return subheads;
}

// Get head total - from transactionsByHead or fallback
function getHeadTotal(record: MISRecord, headKey: MISHead): number {
  const txnHead = record.transactionsByHead?.[headKey];
  if (txnHead && txnHead.total > 0) return txnHead.total;

  switch (headKey) {
    case 'F. Channel & Fulfillment': return record.channelFulfillment.total;
    case 'G. Sales & Marketing': return record.salesMarketing.total;
    case 'H. Platform Costs': return record.platformCosts.total;
    case 'I. Operating Expenses': return record.operatingExpenses.total;
    case 'J. Non-Operating': return record.nonOperating.totalIDA + record.nonOperating.incomeTax;
    case 'E. COGM': return record.cogm.totalCOGM;
    default: return 0;
  }
}

// ============================================
// MONTHLY DETAILED P&L SHEET
// ============================================

function generateMonthlyDetailedPLSheet(record: MISRecord): XLSX.WorkSheet {
  const data: (string | number)[][] = [];
  const netRevenue = record.revenue.netRevenue || 1;

  // Title
  data.push([`${periodToString(record.period)} - DETAILED P&L STATEMENT`]);
  data.push(['Heatronics Pvt Ltd']);
  data.push([`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`]);
  data.push([]);

  // Revenue Formula Explanation
  data.push(['REVENUE CALCULATION:']);
  data.push(['Net Revenue = Gross Revenue - Returns - Discounts - Taxes (GST)']);
  data.push(['All revenue figures below are from Sales Register']);
  data.push([]);

  // Headers
  data.push(['Particulars', 'Amount (₹)', '% of Net Revenue']);
  data.push([]);

  // ===== A. REVENUE =====
  data.push(['A. GROSS REVENUE (from Sales Register)', '', '']);
  SALES_CHANNELS.forEach(channel => {
    const amount = record.revenue.grossRevenue[channel] || 0;
    if (amount > 0) {
      data.push([`    ${channel}`, formatAmountFull(amount), formatPercentValue((amount / netRevenue) * 100)]);
    }
  });
  data.push(['TOTAL GROSS REVENUE', formatAmountFull(record.revenue.totalGrossRevenue), '']);
  data.push([]);

  // ===== B. RETURNS =====
  if (record.revenue.totalReturns > 0) {
    data.push(['B. RETURNS']);
    SALES_CHANNELS.forEach(channel => {
      const amount = record.revenue.returns[channel] || 0;
      if (amount > 0) {
        data.push([`    ${channel} Returns`, formatAmountFull(-amount), formatPercentValue((amount / netRevenue) * 100)]);
      }
    });
    data.push(['TOTAL RETURNS', formatAmountFull(-record.revenue.totalReturns), formatPercentValue((record.revenue.totalReturns / netRevenue) * 100)]);
    data.push([]);
  }

  // ===== D. TAXES =====
  if (record.revenue.totalTaxes > 0) {
    data.push(['D. TAXES (GST Collected)']);
    SALES_CHANNELS.forEach(channel => {
      const amount = record.revenue.taxes[channel] || 0;
      if (amount > 0) {
        data.push([`    ${channel} GST`, formatAmountFull(-amount), formatPercentValue((amount / netRevenue) * 100)]);
      }
    });
    data.push(['TOTAL TAXES', formatAmountFull(-record.revenue.totalTaxes), formatPercentValue((record.revenue.totalTaxes / netRevenue) * 100)]);
    data.push([]);
  }

  // NET REVENUE
  data.push(['════════════════════════════════════════════════════════════════']);
  data.push(['NET REVENUE (Gross - Returns - Taxes)', formatAmountFull(record.revenue.netRevenue), '100.00%']);
  data.push(['════════════════════════════════════════════════════════════════']);
  data.push([]);

  // ===== E. COGM =====
  const cogmSubheads = getSubheadsForHead(record, 'E. COGM');
  const cogmTotal = getHeadTotal(record, 'E. COGM');

  if (cogmTotal > 0) {
    data.push(['E. COST OF GOODS MANUFACTURED (COGM)']);
    cogmSubheads.forEach(sh => {
      const txnLabel = sh.txnCount > 0 ? ` [${sh.txnCount}]` : '';
      data.push([`    ${sh.subhead}${txnLabel}`, formatAmountFull(-sh.amount), formatPercentValue((sh.amount / netRevenue) * 100)]);
    });
    data.push(['TOTAL COGM', formatAmountFull(-cogmTotal), formatPercentValue((cogmTotal / netRevenue) * 100)]);
    data.push([]);
  }

  // GROSS MARGIN
  data.push(['════════════════════════════════════════════════════════════════']);
  data.push(['GROSS MARGIN (Net Revenue - COGM)', formatAmountFull(record.grossMargin), formatPercentValue(record.grossMarginPercent)]);
  data.push(['════════════════════════════════════════════════════════════════']);
  data.push([]);

  // ===== F. CHANNEL & FULFILLMENT =====
  const channelSubheads = getSubheadsForHead(record, 'F. Channel & Fulfillment');
  const channelTotal = getHeadTotal(record, 'F. Channel & Fulfillment');

  if (channelTotal > 0) {
    data.push(['F. CHANNEL & FULFILLMENT']);
    channelSubheads.forEach(sh => {
      const txnLabel = sh.txnCount > 0 ? ` [${sh.txnCount}]` : '';
      data.push([`    ${sh.subhead}${txnLabel}`, formatAmountFull(-sh.amount), formatPercentValue((sh.amount / netRevenue) * 100)]);
    });
    data.push(['TOTAL CHANNEL & FULFILLMENT', formatAmountFull(-channelTotal), formatPercentValue((channelTotal / netRevenue) * 100)]);
    data.push([]);
  }

  // CM1
  data.push(['────────────────────────────────────────────────────────────────']);
  data.push(['CM1 (Gross Margin - Channel Costs)', formatAmountFull(record.cm1), formatPercentValue(record.cm1Percent)]);
  data.push(['────────────────────────────────────────────────────────────────']);
  data.push([]);

  // ===== G. SALES & MARKETING =====
  const marketingSubheads = getSubheadsForHead(record, 'G. Sales & Marketing');
  const marketingTotal = getHeadTotal(record, 'G. Sales & Marketing');

  if (marketingTotal > 0) {
    data.push(['G. SALES & MARKETING']);
    marketingSubheads.forEach(sh => {
      const txnLabel = sh.txnCount > 0 ? ` [${sh.txnCount}]` : '';
      data.push([`    ${sh.subhead}${txnLabel}`, formatAmountFull(-sh.amount), formatPercentValue((sh.amount / netRevenue) * 100)]);
    });
    data.push(['TOTAL SALES & MARKETING', formatAmountFull(-marketingTotal), formatPercentValue((marketingTotal / netRevenue) * 100)]);
    data.push([]);
  }

  // CM2
  data.push(['────────────────────────────────────────────────────────────────']);
  data.push(['CM2 (CM1 - Marketing)', formatAmountFull(record.cm2), formatPercentValue(record.cm2Percent)]);
  data.push(['────────────────────────────────────────────────────────────────']);
  data.push([]);

  // ===== H. PLATFORM COSTS =====
  const platformSubheads = getSubheadsForHead(record, 'H. Platform Costs');
  const platformTotal = getHeadTotal(record, 'H. Platform Costs');

  if (platformTotal > 0) {
    data.push(['H. PLATFORM COSTS']);
    platformSubheads.forEach(sh => {
      const txnLabel = sh.txnCount > 0 ? ` [${sh.txnCount}]` : '';
      data.push([`    ${sh.subhead}${txnLabel}`, formatAmountFull(-sh.amount), formatPercentValue((sh.amount / netRevenue) * 100)]);
    });
    data.push(['TOTAL PLATFORM COSTS', formatAmountFull(-platformTotal), formatPercentValue((platformTotal / netRevenue) * 100)]);
    data.push([]);
  }

  // CM3
  data.push(['────────────────────────────────────────────────────────────────']);
  data.push(['CM3 (CM2 - Platform)', formatAmountFull(record.cm3), formatPercentValue(record.cm3Percent)]);
  data.push(['────────────────────────────────────────────────────────────────']);
  data.push([]);

  // ===== I. OPERATING EXPENSES =====
  const opexSubheads = getSubheadsForHead(record, 'I. Operating Expenses');
  const opexTotal = getHeadTotal(record, 'I. Operating Expenses');

  if (opexTotal > 0) {
    data.push(['I. OPERATING EXPENSES']);
    opexSubheads.forEach(sh => {
      const txnLabel = sh.txnCount > 0 ? ` [${sh.txnCount}]` : '';
      data.push([`    ${sh.subhead}${txnLabel}`, formatAmountFull(-sh.amount), formatPercentValue((sh.amount / netRevenue) * 100)]);
    });
    data.push(['TOTAL OPERATING EXPENSES', formatAmountFull(-opexTotal), formatPercentValue((opexTotal / netRevenue) * 100)]);
    data.push([]);
  }

  // EBITDA
  data.push(['════════════════════════════════════════════════════════════════']);
  data.push(['EBITDA (CM3 - Operating Expenses)', formatAmountFull(record.ebitda), formatPercentValue(record.ebitdaPercent)]);
  data.push(['════════════════════════════════════════════════════════════════']);
  data.push([]);

  // ===== J. NON-OPERATING =====
  const nonOpSubheads = getSubheadsForHead(record, 'J. Non-Operating');
  const nonOpTotal = getHeadTotal(record, 'J. Non-Operating');

  if (nonOpTotal > 0) {
    data.push(['J. NON-OPERATING (I+D+A+Tax)']);
    nonOpSubheads.forEach(sh => {
      const txnLabel = sh.txnCount > 0 ? ` [${sh.txnCount}]` : '';
      data.push([`    ${sh.subhead}${txnLabel}`, formatAmountFull(-sh.amount), formatPercentValue((sh.amount / netRevenue) * 100)]);
    });
    data.push(['TOTAL NON-OPERATING', formatAmountFull(-nonOpTotal), formatPercentValue((nonOpTotal / netRevenue) * 100)]);
    data.push([]);
  }

  // NET INCOME
  data.push(['════════════════════════════════════════════════════════════════']);
  data.push(['NET INCOME (EBITDA - Non-Operating)', formatAmountFull(record.netIncome), formatPercentValue(record.netIncomePercent)]);
  data.push(['════════════════════════════════════════════════════════════════']);

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [55, 18, 18]);

  return ws;
}

// ============================================
// FY DETAILED P&L SHEET
// ============================================

function generateFYDetailedPLSheet(records: MISRecord[], fyLabel: string): XLSX.WorkSheet {
  const data: (string | number)[][] = [];
  const fyStartYear = parseFYLabel(fyLabel);

  // Title
  data.push([`${fyLabel} - DETAILED P&L STATEMENT`]);
  data.push(['Heatronics Pvt Ltd']);
  data.push([`April ${fyStartYear} to March ${fyStartYear + 1}`]);
  data.push([`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`]);
  data.push([]);

  // Build FY months data
  const fyMonthsData = FY_MONTHS.map(({ month, label }) => {
    const year = getYearForMonth(fyStartYear, month);
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const record = records.find(r => r.periodKey === periodKey);
    return { month, year, label: `${label}'${String(year).slice(-2)}`, periodKey, record };
  });

  // Calculate FY totals
  const fyTotals = {
    netRevenue: fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.netRevenue || 0), 0),
    grossRevenue: fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.totalGrossRevenue || 0), 0),
  };

  // Header row
  data.push([
    'Particulars',
    ...fyMonthsData.map(m => m.label),
    'FY Total',
    '% Rev'
  ]);

  // Helper to add a row
  const addRow = (label: string, getValue: (r: MISRecord | undefined) => number, isNegative = false) => {
    const row: (string | number)[] = [label];
    let total = 0;
    fyMonthsData.forEach(m => {
      const value = getValue(m.record);
      const displayValue = isNegative && value > 0 ? -value : value;
      row.push(value !== 0 ? formatAmountFull(displayValue) : '-');
      total += value;
    });
    const displayTotal = isNegative && total > 0 ? -total : total;
    row.push(formatAmountFull(displayTotal));
    row.push(fyTotals.netRevenue > 0 ? formatPercentValue((Math.abs(total) / fyTotals.netRevenue) * 100) : '-');
    return row;
  };

  // ===== A. REVENUE =====
  data.push([]);
  data.push(['A. GROSS REVENUE']);
  SALES_CHANNELS.forEach(channel => {
    const row = addRow(`    ${channel}`, r => r?.revenue.grossRevenue[channel] || 0);
    const hasData = row.slice(1, -2).some(v => v !== '-' && v !== 0);
    if (hasData) data.push(row);
  });
  data.push(addRow('TOTAL GROSS REVENUE', r => r?.revenue.totalGrossRevenue || 0));

  // Returns
  const totalReturns = fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.totalReturns || 0), 0);
  if (totalReturns > 0) {
    data.push([]);
    data.push(['B. RETURNS']);
    data.push(addRow('    Total Returns', r => r?.revenue.totalReturns || 0, true));
  }

  // Taxes
  const totalTaxes = fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.totalTaxes || 0), 0);
  if (totalTaxes > 0) {
    data.push([]);
    data.push(['D. TAXES (GST)']);
    data.push(addRow('    Total Taxes', r => r?.revenue.totalTaxes || 0, true));
  }

  // NET REVENUE
  data.push([]);
  data.push(['═══════════════════════════════════════════']);
  data.push(addRow('NET REVENUE', r => r?.revenue.netRevenue || 0));
  data.push(['═══════════════════════════════════════════']);

  // Collect all unique subheads across all months for each expense head
  const expenseHeads: MISHead[] = ['E. COGM', 'F. Channel & Fulfillment', 'G. Sales & Marketing',
                                    'H. Platform Costs', 'I. Operating Expenses', 'J. Non-Operating'];

  const margins: { head: MISHead; label: string; getValue: (r: MISRecord) => number; getPercent: (r: MISRecord) => number }[] = [
    { head: 'E. COGM', label: 'GROSS MARGIN', getValue: r => r.grossMargin, getPercent: r => r.grossMarginPercent },
    { head: 'F. Channel & Fulfillment', label: 'CM1', getValue: r => r.cm1, getPercent: r => r.cm1Percent },
    { head: 'G. Sales & Marketing', label: 'CM2', getValue: r => r.cm2, getPercent: r => r.cm2Percent },
    { head: 'H. Platform Costs', label: 'CM3', getValue: r => r.cm3, getPercent: r => r.cm3Percent },
    { head: 'I. Operating Expenses', label: 'EBITDA', getValue: r => r.ebitda, getPercent: r => r.ebitdaPercent },
    { head: 'J. Non-Operating', label: 'NET INCOME', getValue: r => r.netIncome, getPercent: r => r.netIncomePercent },
  ];

  for (const headKey of expenseHeads) {
    // Get all unique subheads across all months
    const allSubheads = new Map<string, boolean>();
    fyMonthsData.forEach(m => {
      if (m.record) {
        const subheads = getSubheadsForHead(m.record, headKey);
        subheads.forEach(sh => allSubheads.set(sh.subhead, true));
      }
    });

    const subheadNames = Array.from(allSubheads.keys());
    const headTotal = fyMonthsData.reduce((sum, m) => sum + (m.record ? getHeadTotal(m.record, headKey) : 0), 0);

    if (headTotal > 0 || subheadNames.length > 0) {
      data.push([]);
      data.push([headKey]);

      // Each subhead row
      subheadNames.forEach(subheadName => {
        const row: (string | number)[] = [`    ${subheadName}`];
        let total = 0;
        fyMonthsData.forEach(m => {
          if (m.record) {
            const subheads = getSubheadsForHead(m.record, headKey);
            const sh = subheads.find(s => s.subhead === subheadName);
            const amount = sh?.amount || 0;
            row.push(amount > 0 ? formatAmountFull(-amount) : '-');
            total += amount;
          } else {
            row.push('-');
          }
        });
        row.push(formatAmountFull(-total));
        row.push(fyTotals.netRevenue > 0 ? formatPercentValue((total / fyTotals.netRevenue) * 100) : '-');
        data.push(row);
      });

      // Head total
      const headTotalRow: (string | number)[] = [`TOTAL ${headKey.split('. ')[1]?.toUpperCase() || headKey}`];
      let fyHeadTotal = 0;
      fyMonthsData.forEach(m => {
        const total = m.record ? getHeadTotal(m.record, headKey) : 0;
        headTotalRow.push(total > 0 ? formatAmountFull(-total) : '-');
        fyHeadTotal += total;
      });
      headTotalRow.push(formatAmountFull(-fyHeadTotal));
      headTotalRow.push(fyTotals.netRevenue > 0 ? formatPercentValue((fyHeadTotal / fyTotals.netRevenue) * 100) : '-');
      data.push(headTotalRow);
    }

    // Add margin after this head
    const margin = margins.find(m => m.head === headKey);
    if (margin) {
      data.push([]);
      data.push(['───────────────────────────────────────────']);
      const marginRow: (string | number)[] = [margin.label];
      let fyMarginTotal = 0;
      fyMonthsData.forEach(m => {
        const value = m.record ? margin.getValue(m.record) : 0;
        marginRow.push(value !== 0 ? formatAmountFull(value) : '-');
        fyMarginTotal += value;
      });
      marginRow.push(formatAmountFull(fyMarginTotal));
      marginRow.push(fyTotals.netRevenue > 0 ? formatPercentValue((fyMarginTotal / fyTotals.netRevenue) * 100) : '-');
      data.push(marginRow);
      data.push(['───────────────────────────────────────────']);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [40, ...fyMonthsData.map(() => 10), 12, 8]);

  return ws;
}

// ============================================
// SUMMARY SHEET
// ============================================

function generateSummarySheet(records: MISRecord[]): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  data.push(['HEATRONICS - MIS SUMMARY REPORT']);
  data.push(['Key Financial Metrics Overview']);
  data.push([`Generated: ${new Date().toLocaleDateString('en-IN')}`]);
  data.push([]);

  // Sort records
  const sortedRecords = [...records].sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year;
    return a.period.month - b.period.month;
  });

  const recentRecords = sortedRecords.slice(-12);

  // Header
  data.push(['Metric', ...recentRecords.map(r => periodToString(r.period)), 'Total']);

  // Revenue
  data.push([]);
  const addMetricRow = (label: string, getValue: (r: MISRecord) => number) => {
    const row: (string | number)[] = [label];
    let total = 0;
    recentRecords.forEach(r => {
      const value = getValue(r);
      row.push(formatAmountFull(value));
      total += value;
    });
    row.push(formatAmountFull(total));
    data.push(row);
  };

  const addPercentRow = (label: string, getPercent: (r: MISRecord) => number) => {
    const row: (string | number)[] = [label];
    recentRecords.forEach(r => row.push(formatPercentValue(getPercent(r))));
    row.push('');
    data.push(row);
  };

  addMetricRow('Net Revenue', r => r.revenue.netRevenue);
  addMetricRow('COGM', r => r.cogm.totalCOGM);
  addPercentRow('COGS %', r => r.revenue.netRevenue > 0 ? (r.cogm.totalCOGM / r.revenue.netRevenue) * 100 : 0);
  addMetricRow('Gross Margin', r => r.grossMargin);
  addPercentRow('Gross Margin %', r => r.grossMarginPercent);
  addPercentRow('CM1 %', r => r.cm1Percent);
  addPercentRow('CM2 %', r => r.cm2Percent);
  addPercentRow('EBITDA %', r => r.ebitdaPercent);
  addPercentRow('Net Income %', r => r.netIncomePercent);

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [20, ...recentRecords.map(() => 12), 14]);

  return ws;
}

// ============================================
// TRENDS SHEET (Monthly Comparison Table)
// ============================================

function generateTrendsSheet(records: MISRecord[]): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  data.push(['MIS TRENDS - MONTHLY COMPARISON']);
  data.push(['Revenue = Net Revenue (Gross - Returns - Taxes)']);
  data.push([`Generated: ${new Date().toLocaleDateString('en-IN')}`]);
  data.push([]);

  // Sort chronologically
  const sortedRecords = [...records].sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year;
    return a.period.month - b.period.month;
  });

  // Header
  data.push(['Metric', ...sortedRecords.map(r => periodToString(r.period))]);

  // Data rows
  const metrics = [
    { label: 'Net Revenue', getValue: (r: MISRecord) => formatAmountFull(r.revenue.netRevenue) },
    { label: 'COGS %', getValue: (r: MISRecord) => formatPercentValue(r.revenue.netRevenue > 0 ? (r.cogm.totalCOGM / r.revenue.netRevenue) * 100 : 0) },
    { label: 'Gross Margin %', getValue: (r: MISRecord) => formatPercentValue(r.grossMarginPercent) },
    { label: 'CM1 %', getValue: (r: MISRecord) => formatPercentValue(r.cm1Percent) },
    { label: 'CM2 %', getValue: (r: MISRecord) => formatPercentValue(r.cm2Percent) },
    { label: 'EBITDA %', getValue: (r: MISRecord) => formatPercentValue(r.ebitdaPercent) },
    { label: 'Net Income %', getValue: (r: MISRecord) => formatPercentValue(r.netIncomePercent) },
  ];

  metrics.forEach(metric => {
    const row: (string | number)[] = [metric.label];
    sortedRecords.forEach(r => row.push(metric.getValue(r)));
    data.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [20, ...sortedRecords.map(() => 12)]);

  return ws;
}

// ============================================
// TRANSACTIONS SHEET
// ============================================

function generateTransactionsSheet(record: MISRecord): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  data.push([`${periodToString(record.period)} - TRANSACTION DETAILS`]);
  data.push(['Classified Transactions by Head and Subhead']);
  data.push([]);

  if (!record.transactionsByHead) {
    data.push(['No transaction data available']);
    return XLSX.utils.aoa_to_sheet(data);
  }

  data.push(['Head', 'Subhead', 'Date', 'Account', 'Amount (₹)', 'Type', 'Source']);
  data.push([]);

  const heads: MISHead[] = ['E. COGM', 'F. Channel & Fulfillment', 'G. Sales & Marketing',
                            'H. Platform Costs', 'I. Operating Expenses', 'J. Non-Operating',
                            'X. Exclude', 'Z. Ignore'];

  heads.forEach(headKey => {
    const headData = record.transactionsByHead![headKey];
    if (!headData || headData.transactionCount === 0) return;

    data.push([headKey, '', '', '', formatAmountFull(headData.total), `${headData.transactionCount} txns`, '']);

    headData.subheads.forEach(subhead => {
      if (subhead.transactions.length === 0) return;

      data.push(['', subhead.subhead, '', '', formatAmountFull(subhead.amount), `${subhead.transactionCount} txns`, subhead.source]);

      subhead.transactions.forEach(txn => {
        data.push(['', '', txn.date, txn.account, formatAmountFull(txn.amount), txn.type, txn.source]);
      });
    });

    data.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [25, 30, 12, 45, 15, 10, 15]);

  return ws;
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

export async function exportMISToExcel(
  allRecords: MISRecord[],
  options: ExcelExportOptions
): Promise<void> {
  const workbook = XLSX.utils.book_new();
  let sheetCount = 0;

  // 1. Summary Sheet
  if (options.includeSummary && allRecords.length > 0) {
    const summarySheet = generateSummarySheet(allRecords);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    sheetCount++;

    // Also add Trends sheet
    const trendsSheet = generateTrendsSheet(allRecords);
    XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Trends');
    sheetCount++;
  }

  // 2. FY Sheets
  if (options.includeFYSheets && options.selectedFYs.length > 0) {
    for (const fy of options.selectedFYs) {
      const fySheet = generateFYDetailedPLSheet(allRecords, fy);
      const sheetName = fy.replace(/[\/\\?*\[\]]/g, '-').slice(0, 28);
      XLSX.utils.book_append_sheet(workbook, fySheet, sheetName);
      sheetCount++;
    }
  }

  // 3. Monthly Sheets
  if (options.includeMonthlySheets && options.selectedMonths.length > 0) {
    for (const periodKey of options.selectedMonths) {
      const record = allRecords.find(r => r.periodKey === periodKey);
      if (record) {
        const monthSheet = generateMonthlyDetailedPLSheet(record);
        const sheetName = periodToString(record.period).replace(/[\/\\?*\[\]]/g, '-').slice(0, 28);
        XLSX.utils.book_append_sheet(workbook, monthSheet, sheetName);
        sheetCount++;
      }
    }
  }

  // 4. Transactions
  if (options.includeTransactions && options.selectedMonths.length > 0) {
    for (const periodKey of options.selectedMonths) {
      const record = allRecords.find(r => r.periodKey === periodKey);
      if (record && record.transactionsByHead) {
        const txnSheet = generateTransactionsSheet(record);
        const sheetName = `Txn ${periodToString(record.period)}`.replace(/[\/\\?*\[\]]/g, '-').slice(0, 28);
        XLSX.utils.book_append_sheet(workbook, txnSheet, sheetName);
        sheetCount++;
      }
    }
  }

  if (sheetCount === 0) {
    const placeholder = XLSX.utils.aoa_to_sheet([['No data selected for export']]);
    XLSX.utils.book_append_sheet(workbook, placeholder, 'Info');
  }

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const filename = `Heatronics_MIS_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(blob, filename);
}

// ============================================
// QUICK EXPORT FUNCTIONS
// ============================================

export async function exportMonthlyMISToExcel(record: MISRecord): Promise<void> {
  const workbook = XLSX.utils.book_new();

  const plSheet = generateMonthlyDetailedPLSheet(record);
  XLSX.utils.book_append_sheet(workbook, plSheet, 'P&L Statement');

  if (record.transactionsByHead) {
    const txnSheet = generateTransactionsSheet(record);
    XLSX.utils.book_append_sheet(workbook, txnSheet, 'Transactions');
  }

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const filename = `Heatronics_MIS_${periodToString(record.period).replace(' ', '_')}.xlsx`;
  saveAs(blob, filename);
}

export async function exportFYMISToExcel(allRecords: MISRecord[], fyLabel: string): Promise<void> {
  const workbook = XLSX.utils.book_new();

  const fySheet = generateFYDetailedPLSheet(allRecords, fyLabel);
  XLSX.utils.book_append_sheet(workbook, fySheet, 'P&L Statement');

  // Add trends for this FY
  const fyStartYear = parseFYLabel(fyLabel);
  const fyRecords = allRecords.filter(r => {
    const recFYStart = r.period.month >= 4 ? r.period.year : r.period.year - 1;
    return recFYStart === fyStartYear;
  });

  if (fyRecords.length > 0) {
    const trendsSheet = generateTrendsSheet(fyRecords);
    XLSX.utils.book_append_sheet(workbook, trendsSheet, 'Trends');
  }

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const filename = `Heatronics_${fyLabel.replace(' ', '_')}_MIS.xlsx`;
  saveAs(blob, filename);
}

export { parseFYLabel };
