/**
 * Professional MIS Excel Export Utility
 *
 * Creates professionally formatted Excel workbooks with:
 * - Monthly P&L reports with full granularity
 * - Annual/FY summaries with month-by-month comparison
 * - Revenue analysis by channel
 * - Expense breakdowns by category
 * - Transaction details
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { MISRecord, periodToString, SalesChannel, SALES_CHANNELS } from '../types/misTracking';
import { formatCurrency, formatPercent } from './misCalculator';

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

interface CellStyle {
  bold?: boolean;
  header?: boolean;
  subheader?: boolean;
  total?: boolean;
  positive?: boolean;
  negative?: boolean;
  percent?: boolean;
  indent?: number;
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

function formatAmount(amount: number): string {
  if (amount === 0) return '-';
  const absAmount = Math.abs(amount);
  if (absAmount >= 10000000) {
    return `${(amount / 10000000).toFixed(2)} Cr`;
  } else if (absAmount >= 100000) {
    return `${(amount / 100000).toFixed(2)} L`;
  } else if (absAmount >= 1000) {
    return `${(amount / 1000).toFixed(2)} K`;
  }
  return amount.toFixed(0);
}

function formatAmountFull(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function formatPercentValue(value: number): string {
  if (isNaN(value) || !isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

function parseFYLabel(fyLabel: string): number {
  const match = fyLabel.match(/FY (\d{4})-/);
  return match ? parseInt(match[1]) : new Date().getFullYear();
}

function getYearForMonth(fyStartYear: number, month: number): number {
  return month >= 4 ? fyStartYear : fyStartYear + 1;
}

function getAvailableFYs(records: MISRecord[]): string[] {
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

function addSheetTitle(data: (string | number)[][], title: string, subtitle?: string): void {
  data.push([title]);
  if (subtitle) {
    data.push([subtitle]);
  }
  data.push([`Generated: ${new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`]);
  data.push([]);
}

// ============================================
// SUMMARY SHEET
// ============================================

function generateSummarySheet(records: MISRecord[]): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  addSheetTitle(data, 'HEATRONICS - MIS SUMMARY REPORT', 'Key Financial Metrics Overview');

  // Sort records by date (newest first)
  const sortedRecords = [...records].sort((a, b) => {
    if (a.period.year !== b.period.year) return b.period.year - a.period.year;
    return b.period.month - a.period.month;
  });

  // Get last 12 months for summary
  const recentRecords = sortedRecords.slice(0, 12).reverse();

  // Header row
  data.push([
    'Metric',
    ...recentRecords.map(r => periodToString(r.period))
  ]);

  // Revenue metrics
  data.push([]);
  data.push(['REVENUE METRICS']);
  data.push([
    'Gross Revenue',
    ...recentRecords.map(r => formatAmountFull(r.revenue.totalGrossRevenue))
  ]);
  data.push([
    'Less: Returns',
    ...recentRecords.map(r => formatAmountFull(-r.revenue.totalReturns))
  ]);
  data.push([
    'Less: Taxes (GST)',
    ...recentRecords.map(r => formatAmountFull(-r.revenue.totalTaxes))
  ]);
  data.push([
    'Net Revenue',
    ...recentRecords.map(r => formatAmountFull(r.revenue.netRevenue))
  ]);

  // Margin metrics
  data.push([]);
  data.push(['MARGIN METRICS']);
  data.push([
    'Gross Margin',
    ...recentRecords.map(r => formatAmountFull(r.grossMargin))
  ]);
  data.push([
    'Gross Margin %',
    ...recentRecords.map(r => r.grossMarginPercent.toFixed(1) + '%')
  ]);
  data.push([
    'CM1',
    ...recentRecords.map(r => formatAmountFull(r.cm1))
  ]);
  data.push([
    'CM1 %',
    ...recentRecords.map(r => r.cm1Percent.toFixed(1) + '%')
  ]);
  data.push([
    'CM2',
    ...recentRecords.map(r => formatAmountFull(r.cm2))
  ]);
  data.push([
    'CM2 %',
    ...recentRecords.map(r => r.cm2Percent.toFixed(1) + '%')
  ]);
  data.push([
    'CM3',
    ...recentRecords.map(r => formatAmountFull(r.cm3))
  ]);
  data.push([
    'CM3 %',
    ...recentRecords.map(r => r.cm3Percent.toFixed(1) + '%')
  ]);
  data.push([
    'EBITDA',
    ...recentRecords.map(r => formatAmountFull(r.ebitda))
  ]);
  data.push([
    'EBITDA %',
    ...recentRecords.map(r => r.ebitdaPercent.toFixed(1) + '%')
  ]);
  data.push([
    'Net Income',
    ...recentRecords.map(r => formatAmountFull(r.netIncome))
  ]);
  data.push([
    'Net Income %',
    ...recentRecords.map(r => r.netIncomePercent.toFixed(1) + '%')
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [20, ...recentRecords.map(() => 14)]);

  return ws;
}

// ============================================
// FY SUMMARY SHEET
// ============================================

function generateFYSummarySheet(records: MISRecord[], fyLabel: string): XLSX.WorkSheet {
  const data: (string | number)[][] = [];
  const fyStartYear = parseFYLabel(fyLabel);

  addSheetTitle(
    data,
    `${fyLabel} - PROFIT & LOSS STATEMENT`,
    `April ${fyStartYear} to March ${fyStartYear + 1}`
  );

  // Build FY data
  const fyMonths = FY_MONTHS.map(({ month, label }) => {
    const year = getYearForMonth(fyStartYear, month);
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const record = records.find(r => r.periodKey === periodKey);
    return { month, year, label, periodKey, record };
  });

  // Calculate FY totals
  const fyTotals = fyMonths.filter(m => m.record).reduce(
    (acc, m) => {
      if (!m.record) return acc;
      return {
        grossRevenue: acc.grossRevenue + m.record.revenue.totalGrossRevenue,
        returns: acc.returns + m.record.revenue.totalReturns,
        taxes: acc.taxes + m.record.revenue.totalTaxes,
        netRevenue: acc.netRevenue + m.record.revenue.netRevenue,
        cogm: acc.cogm + m.record.cogm.totalCOGM,
        grossMargin: acc.grossMargin + m.record.grossMargin,
        channelFulfillment: acc.channelFulfillment + m.record.channelFulfillment.total,
        cm1: acc.cm1 + m.record.cm1,
        salesMarketing: acc.salesMarketing + m.record.salesMarketing.total,
        cm2: acc.cm2 + m.record.cm2,
        platformCosts: acc.platformCosts + m.record.platformCosts.total,
        cm3: acc.cm3 + m.record.cm3,
        operatingExpenses: acc.operatingExpenses + m.record.operatingExpenses.total,
        ebitda: acc.ebitda + m.record.ebitda,
        nonOperatingIDA: acc.nonOperatingIDA + m.record.nonOperating.totalIDA,
        incomeTax: acc.incomeTax + m.record.nonOperating.incomeTax,
        netIncome: acc.netIncome + m.record.netIncome
      };
    },
    {
      grossRevenue: 0, returns: 0, taxes: 0, netRevenue: 0, cogm: 0, grossMargin: 0,
      channelFulfillment: 0, cm1: 0, salesMarketing: 0, cm2: 0, platformCosts: 0, cm3: 0,
      operatingExpenses: 0, ebitda: 0, nonOperatingIDA: 0, incomeTax: 0, netIncome: 0
    }
  );

  // Header row
  data.push([
    'Particulars',
    ...fyMonths.map(m => `${m.label} ${m.year}`),
    'FY Total',
    '% of Revenue'
  ]);

  // Revenue Section
  data.push([]);
  data.push(['A. REVENUE']);
  data.push([
    '    Gross Revenue',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.revenue.totalGrossRevenue) : '-'),
    formatAmountFull(fyTotals.grossRevenue),
    ''
  ]);
  data.push([
    '    Less: Returns',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.revenue.totalReturns) : '-'),
    formatAmountFull(-fyTotals.returns),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.returns / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    '    Less: Taxes (GST)',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.revenue.totalTaxes) : '-'),
    formatAmountFull(-fyTotals.taxes),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.taxes / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    'NET REVENUE',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.revenue.netRevenue) : '-'),
    formatAmountFull(fyTotals.netRevenue),
    '100.0%'
  ]);

  // COGM Section
  data.push([]);
  data.push(['B. COST OF GOODS MANUFACTURED (COGM)']);
  data.push([
    '    Total COGM',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.cogm.totalCOGM) : '-'),
    formatAmountFull(-fyTotals.cogm),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.cogm / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    'GROSS MARGIN',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.grossMargin) : '-'),
    formatAmountFull(fyTotals.grossMargin),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.grossMargin / fyTotals.netRevenue) * 100) : '-'
  ]);

  // Channel & Fulfillment
  data.push([]);
  data.push(['C. CHANNEL & FULFILLMENT']);
  data.push([
    '    Total Channel Costs',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.channelFulfillment.total) : '-'),
    formatAmountFull(-fyTotals.channelFulfillment),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.channelFulfillment / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    'CM1 (Contribution Margin 1)',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.cm1) : '-'),
    formatAmountFull(fyTotals.cm1),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.cm1 / fyTotals.netRevenue) * 100) : '-'
  ]);

  // Sales & Marketing
  data.push([]);
  data.push(['D. SALES & MARKETING']);
  data.push([
    '    Total Marketing Costs',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.salesMarketing.total) : '-'),
    formatAmountFull(-fyTotals.salesMarketing),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.salesMarketing / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    'CM2 (After Marketing)',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.cm2) : '-'),
    formatAmountFull(fyTotals.cm2),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.cm2 / fyTotals.netRevenue) * 100) : '-'
  ]);

  // Platform Costs
  data.push([]);
  data.push(['E. PLATFORM COSTS']);
  data.push([
    '    Total Platform Costs',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.platformCosts.total) : '-'),
    formatAmountFull(-fyTotals.platformCosts),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.platformCosts / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    'CM3 (After Platform)',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.cm3) : '-'),
    formatAmountFull(fyTotals.cm3),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.cm3 / fyTotals.netRevenue) * 100) : '-'
  ]);

  // Operating Expenses
  data.push([]);
  data.push(['F. OPERATING EXPENSES']);
  data.push([
    '    Total Operating Expenses',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.operatingExpenses.total) : '-'),
    formatAmountFull(-fyTotals.operatingExpenses),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.operatingExpenses / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    'EBITDA',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.ebitda) : '-'),
    formatAmountFull(fyTotals.ebitda),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.ebitda / fyTotals.netRevenue) * 100) : '-'
  ]);

  // Non-Operating
  data.push([]);
  data.push(['G. NON-OPERATING']);
  data.push([
    '    Interest, Depreciation & Amortization',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.nonOperating.totalIDA) : '-'),
    formatAmountFull(-fyTotals.nonOperatingIDA),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.nonOperatingIDA / fyTotals.netRevenue) * 100) : '-'
  ]);
  data.push([
    '    Income Tax',
    ...fyMonths.map(m => m.record ? formatAmountFull(-m.record.nonOperating.incomeTax) : '-'),
    formatAmountFull(-fyTotals.incomeTax),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.incomeTax / fyTotals.netRevenue) * 100) : '-'
  ]);

  // Net Income
  data.push([]);
  data.push([
    'NET INCOME',
    ...fyMonths.map(m => m.record ? formatAmountFull(m.record.netIncome) : '-'),
    formatAmountFull(fyTotals.netIncome),
    fyTotals.netRevenue > 0 ? formatPercentValue((fyTotals.netIncome / fyTotals.netRevenue) * 100) : '-'
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [35, ...fyMonths.map(() => 12), 14, 12]);

  return ws;
}

// ============================================
// MONTHLY P&L SHEET
// ============================================

function generateMonthlyPLSheet(record: MISRecord): XLSX.WorkSheet {
  const data: (string | number)[][] = [];
  const netRevenue = record.revenue.netRevenue || 1;

  addSheetTitle(
    data,
    `${periodToString(record.period)} - DETAILED P&L STATEMENT`,
    'All amounts in INR'
  );

  // Headers
  data.push(['Particulars', 'Amount', '% of Revenue', 'Notes']);
  data.push([]);

  // ========== A. REVENUE ==========
  data.push(['A. REVENUE', '', '', '']);
  data.push([]);

  // Revenue by Channel
  data.push(['    Revenue by Channel:', '', '', 'From Sales Register']);
  SALES_CHANNELS.forEach(channel => {
    const amount = record.revenue.grossRevenue[channel] || 0;
    if (amount > 0) {
      data.push([`        ${channel}`, formatAmountFull(amount), formatPercentValue((amount / netRevenue) * 100), '']);
    }
  });
  data.push(['    Gross Revenue', formatAmountFull(record.revenue.totalGrossRevenue), '', '']);
  data.push([]);

  // Deductions
  data.push(['    Less: Returns', formatAmountFull(-record.revenue.totalReturns), formatPercentValue((record.revenue.totalReturns / netRevenue) * 100), '']);
  if (record.revenue.totalDiscounts > 0) {
    data.push(['    Less: Discounts', formatAmountFull(-record.revenue.totalDiscounts), formatPercentValue((record.revenue.totalDiscounts / netRevenue) * 100), '']);
  }
  data.push(['    Less: Taxes (GST)', formatAmountFull(-record.revenue.totalTaxes), formatPercentValue((record.revenue.totalTaxes / netRevenue) * 100), 'IGST/CGST/SGST']);
  data.push([]);
  data.push(['NET REVENUE', formatAmountFull(record.revenue.netRevenue), '100.0%', '']);

  // ========== B. COGM ==========
  data.push([]);
  data.push(['B. COST OF GOODS MANUFACTURED (COGM)', '', '', '']);
  data.push([]);

  const cogmItems = [
    { label: 'Raw Materials & Inventory', value: record.cogm.rawMaterialsInventory, note: 'Prorated from annual BS' },
    { label: 'Consumables', value: record.cogm.consumables, note: '' },
    { label: 'Manufacturing Wages', value: record.cogm.manufacturingWages, note: '' },
    { label: 'Contract Wages (Mfg)', value: record.cogm.contractWagesMfg, note: '' },
    { label: 'Inbound Transport', value: record.cogm.inboundTransport, note: '' },
    { label: 'Factory Rent', value: record.cogm.factoryRent, note: '' },
    { label: 'Factory Electricity', value: record.cogm.factoryElectricity, note: '' },
    { label: 'Factory Maintenance', value: record.cogm.factoryMaintenance, note: '' },
    { label: 'Job Work', value: record.cogm.jobWork, note: '' },
    { label: 'Quality Testing', value: record.cogm.qualityTesting, note: '' },
    { label: 'Other Direct Expenses', value: record.cogm.otherDirectExpenses, note: '' },
  ];

  cogmItems.forEach(item => {
    if (item.value > 0) {
      data.push([`    ${item.label}`, formatAmountFull(-item.value), formatPercentValue((item.value / netRevenue) * 100), item.note]);
    }
  });
  data.push([]);
  data.push(['Total COGM', formatAmountFull(-record.cogm.totalCOGM), formatPercentValue((record.cogm.totalCOGM / netRevenue) * 100), '']);
  data.push([]);
  data.push(['GROSS MARGIN', formatAmountFull(record.grossMargin), formatPercentValue(record.grossMarginPercent), '']);

  // ========== C. CHANNEL & FULFILLMENT ==========
  data.push([]);
  data.push(['C. CHANNEL & FULFILLMENT', '', '', '']);
  data.push([]);

  if (record.channelFulfillment.amazonFees > 0) {
    data.push(['    Amazon Fees', formatAmountFull(-record.channelFulfillment.amazonFees), formatPercentValue((record.channelFulfillment.amazonFees / netRevenue) * 100), 'Commission, FBA fees']);
  }
  if (record.channelFulfillment.blinkitFees > 0) {
    data.push(['    Blinkit Fees', formatAmountFull(-record.channelFulfillment.blinkitFees), formatPercentValue((record.channelFulfillment.blinkitFees / netRevenue) * 100), 'Quick commerce fees']);
  }
  if (record.channelFulfillment.d2cFees > 0) {
    data.push(['    D2C Fees (Shiprocket, PG)', formatAmountFull(-record.channelFulfillment.d2cFees), formatPercentValue((record.channelFulfillment.d2cFees / netRevenue) * 100), 'Shipping, payment gateway']);
  }
  data.push([]);
  data.push(['Total Channel & Fulfillment', formatAmountFull(-record.channelFulfillment.total), formatPercentValue((record.channelFulfillment.total / netRevenue) * 100), '']);
  data.push([]);
  data.push(['CM1 (Contribution Margin 1)', formatAmountFull(record.cm1), formatPercentValue(record.cm1Percent), '']);

  // ========== D. SALES & MARKETING ==========
  data.push([]);
  data.push(['D. SALES & MARKETING', '', '', '']);
  data.push([]);

  const marketingItems = [
    { label: 'Facebook Ads', value: record.salesMarketing.facebookAds },
    { label: 'Google Ads', value: record.salesMarketing.googleAds },
    { label: 'Amazon Ads', value: record.salesMarketing.amazonAds },
    { label: 'Blinkit Ads', value: record.salesMarketing.blinkitAds },
    { label: 'Agency Fees', value: record.salesMarketing.agencyFees },
    { label: 'Other Advertising/Marketing', value: record.salesMarketing.advertisingMarketing },
  ];

  marketingItems.forEach(item => {
    if (item.value > 0) {
      data.push([`    ${item.label}`, formatAmountFull(-item.value), formatPercentValue((item.value / netRevenue) * 100), '']);
    }
  });
  data.push([]);
  data.push(['Total Sales & Marketing', formatAmountFull(-record.salesMarketing.total), formatPercentValue((record.salesMarketing.total / netRevenue) * 100), '']);
  data.push([]);
  data.push(['CM2 (After Marketing)', formatAmountFull(record.cm2), formatPercentValue(record.cm2Percent), '']);

  // ========== E. PLATFORM COSTS ==========
  data.push([]);
  data.push(['E. PLATFORM COSTS', '', '', '']);
  data.push([]);

  if (record.platformCosts.shopifySubscription > 0) {
    data.push(['    Shopify Subscription', formatAmountFull(-record.platformCosts.shopifySubscription), formatPercentValue((record.platformCosts.shopifySubscription / netRevenue) * 100), '']);
  }
  if (record.platformCosts.watiSubscription > 0) {
    data.push(['    Wati Subscription', formatAmountFull(-record.platformCosts.watiSubscription), formatPercentValue((record.platformCosts.watiSubscription / netRevenue) * 100), 'WhatsApp Business']);
  }
  if (record.platformCosts.shopfloSubscription > 0) {
    data.push(['    Shopflo Subscription', formatAmountFull(-record.platformCosts.shopfloSubscription), formatPercentValue((record.platformCosts.shopfloSubscription / netRevenue) * 100), '']);
  }
  data.push([]);
  data.push(['Total Platform Costs', formatAmountFull(-record.platformCosts.total), formatPercentValue((record.platformCosts.total / netRevenue) * 100), '']);
  data.push([]);
  data.push(['CM3 (After Platform)', formatAmountFull(record.cm3), formatPercentValue(record.cm3Percent), '']);

  // ========== F. OPERATING EXPENSES ==========
  data.push([]);
  data.push(['F. OPERATING EXPENSES', '', '', '']);
  data.push([]);

  const opexItems = [
    { label: 'Salaries (Admin, Mgmt)', value: record.operatingExpenses.salariesAdminMgmt },
    { label: 'Miscellaneous (Travel, Insurance)', value: record.operatingExpenses.miscellaneous },
    { label: 'Legal & CA Expenses', value: record.operatingExpenses.legalCaExpenses },
    { label: 'Platform Costs (CRM, Software)', value: record.operatingExpenses.platformCostsCRM },
    { label: 'Administrative Expenses', value: record.operatingExpenses.administrativeExpenses },
    { label: 'Staff Welfare & Events', value: record.operatingExpenses.staffWelfareEvents },
    { label: 'Bank & Finance Charges', value: record.operatingExpenses.banksFinanceCharges },
    { label: 'Other Operating Expenses', value: record.operatingExpenses.otherOperatingExpenses },
  ];

  opexItems.forEach(item => {
    if (item.value > 0) {
      data.push([`    ${item.label}`, formatAmountFull(-item.value), formatPercentValue((item.value / netRevenue) * 100), '']);
    }
  });
  data.push([]);
  data.push(['Total Operating Expenses', formatAmountFull(-record.operatingExpenses.total), formatPercentValue((record.operatingExpenses.total / netRevenue) * 100), '']);
  data.push([]);
  data.push(['EBITDA', formatAmountFull(record.ebitda), formatPercentValue(record.ebitdaPercent), '']);

  // ========== G. NON-OPERATING ==========
  data.push([]);
  data.push(['G. NON-OPERATING', '', '', '']);
  data.push([]);

  if (record.nonOperating.interestExpense > 0) {
    data.push(['    Interest Expense', formatAmountFull(-record.nonOperating.interestExpense), formatPercentValue((record.nonOperating.interestExpense / netRevenue) * 100), '']);
  }
  if (record.nonOperating.depreciation > 0) {
    data.push(['    Depreciation', formatAmountFull(-record.nonOperating.depreciation), formatPercentValue((record.nonOperating.depreciation / netRevenue) * 100), '']);
  }
  if (record.nonOperating.amortization > 0) {
    data.push(['    Amortization', formatAmountFull(-record.nonOperating.amortization), formatPercentValue((record.nonOperating.amortization / netRevenue) * 100), '']);
  }
  data.push([]);
  data.push(['EBT (Earnings Before Tax)', formatAmountFull(record.ebt), formatPercentValue(record.ebtPercent), '']);
  data.push([]);

  if (record.nonOperating.incomeTax > 0) {
    data.push(['    Less: Income Tax', formatAmountFull(-record.nonOperating.incomeTax), formatPercentValue((record.nonOperating.incomeTax / netRevenue) * 100), '']);
  }
  data.push([]);
  data.push(['NET INCOME', formatAmountFull(record.netIncome), formatPercentValue(record.netIncomePercent), '']);

  // ========== MEMO ==========
  if (record.ignoredTotal || record.excludedTotal) {
    data.push([]);
    data.push([]);
    data.push(['MEMO (Not included in P&L):', '', '', '']);
    if (record.excludedTotal) {
      data.push(['    Excluded (Personal)', formatAmountFull(record.excludedTotal), '', 'Owner withdrawals, personal expenses']);
    }
    if (record.ignoredTotal) {
      data.push(['    Ignored (Non-P&L)', formatAmountFull(record.ignoredTotal), '', 'GST entries, TDS, inter-company']);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [45, 18, 15, 35]);

  return ws;
}

// ============================================
// REVENUE ANALYSIS SHEET
// ============================================

function generateRevenueAnalysisSheet(records: MISRecord[], fyLabel?: string): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  let filteredRecords = records;
  let title = 'REVENUE ANALYSIS BY CHANNEL';
  let subtitle = 'Channel-wise Revenue Breakdown';

  if (fyLabel) {
    const fyStartYear = parseFYLabel(fyLabel);
    filteredRecords = records.filter(r => {
      const recordFYStart = r.period.month >= 4 ? r.period.year : r.period.year - 1;
      return recordFYStart === fyStartYear;
    });
    title = `${fyLabel} - REVENUE ANALYSIS BY CHANNEL`;
    subtitle = `April ${fyStartYear} to March ${fyStartYear + 1}`;
  }

  addSheetTitle(data, title, subtitle);

  // Sort by FY order
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    // Sort by FY month order (Apr first)
    const aFYMonth = a.period.month >= 4 ? a.period.month - 4 : a.period.month + 8;
    const bFYMonth = b.period.month >= 4 ? b.period.month - 4 : b.period.month + 8;
    if (a.period.year !== b.period.year) {
      return a.period.year - b.period.year;
    }
    return aFYMonth - bFYMonth;
  });

  // Header
  data.push([
    'Channel',
    ...sortedRecords.map(r => periodToString(r.period)),
    'Total',
    '% Share'
  ]);

  // Calculate totals
  const channelTotals: Record<string, number> = {};
  let grandTotal = 0;

  SALES_CHANNELS.forEach(channel => {
    const channelRow: (string | number)[] = [channel];
    let channelTotal = 0;

    sortedRecords.forEach(record => {
      const amount = record.revenue.grossRevenue[channel] || 0;
      channelRow.push(formatAmountFull(amount));
      channelTotal += amount;
    });

    channelRow.push(formatAmountFull(channelTotal));
    channelTotals[channel] = channelTotal;
    grandTotal += channelTotal;

    data.push(channelRow);
  });

  // Add percentage column
  data.forEach((row, idx) => {
    if (idx >= 5 && idx < 5 + SALES_CHANNELS.length) { // Channel rows
      const channel = row[0] as string;
      row.push(grandTotal > 0 ? formatPercentValue((channelTotals[channel] / grandTotal) * 100) : '-');
    }
  });

  // Total row
  data.push([]);
  const totalRow: (string | number)[] = ['TOTAL GROSS REVENUE'];
  sortedRecords.forEach(record => {
    totalRow.push(formatAmountFull(record.revenue.totalGrossRevenue));
  });
  totalRow.push(formatAmountFull(grandTotal));
  totalRow.push('100.0%');
  data.push(totalRow);

  // Returns section
  data.push([]);
  data.push(['RETURNS BY CHANNEL']);
  data.push([
    'Channel',
    ...sortedRecords.map(r => periodToString(r.period)),
    'Total',
    '% of Channel'
  ]);

  SALES_CHANNELS.forEach(channel => {
    const returnsRow: (string | number)[] = [channel];
    let returnsTotal = 0;

    sortedRecords.forEach(record => {
      const amount = record.revenue.returns[channel] || 0;
      returnsRow.push(formatAmountFull(amount));
      returnsTotal += amount;
    });

    returnsRow.push(formatAmountFull(returnsTotal));
    returnsRow.push(channelTotals[channel] > 0 ? formatPercentValue((returnsTotal / channelTotals[channel]) * 100) : '-');
    data.push(returnsRow);
  });

  // Net Revenue section
  data.push([]);
  data.push(['NET REVENUE SUMMARY']);
  data.push([
    'Metric',
    ...sortedRecords.map(r => periodToString(r.period)),
    'Total'
  ]);

  const netRevRow: (string | number)[] = ['Net Revenue'];
  let netRevTotal = 0;
  sortedRecords.forEach(record => {
    netRevRow.push(formatAmountFull(record.revenue.netRevenue));
    netRevTotal += record.revenue.netRevenue;
  });
  netRevRow.push(formatAmountFull(netRevTotal));
  data.push(netRevRow);

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [20, ...sortedRecords.map(() => 12), 14, 12]);

  return ws;
}

// ============================================
// EXPENSE ANALYSIS SHEET
// ============================================

function generateExpenseAnalysisSheet(records: MISRecord[], fyLabel?: string): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  let filteredRecords = records;
  let title = 'EXPENSE ANALYSIS BY CATEGORY';
  let subtitle = 'Detailed Expense Breakdown';

  if (fyLabel) {
    const fyStartYear = parseFYLabel(fyLabel);
    filteredRecords = records.filter(r => {
      const recordFYStart = r.period.month >= 4 ? r.period.year : r.period.year - 1;
      return recordFYStart === fyStartYear;
    });
    title = `${fyLabel} - EXPENSE ANALYSIS`;
    subtitle = `April ${fyStartYear} to March ${fyStartYear + 1}`;
  }

  addSheetTitle(data, title, subtitle);

  // Sort by FY order
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const aFYMonth = a.period.month >= 4 ? a.period.month - 4 : a.period.month + 8;
    const bFYMonth = b.period.month >= 4 ? b.period.month - 4 : b.period.month + 8;
    if (a.period.year !== b.period.year) {
      return a.period.year - b.period.year;
    }
    return aFYMonth - bFYMonth;
  });

  // Header
  data.push([
    'Expense Category',
    ...sortedRecords.map(r => periodToString(r.period)),
    'Total',
    '% of Revenue'
  ]);

  // Calculate total revenue for percentage
  const totalRevenue = sortedRecords.reduce((sum, r) => sum + r.revenue.netRevenue, 0);

  // COGM
  data.push([]);
  data.push(['COST OF GOODS MANUFACTURED (COGM)']);

  const cogmCategories = [
    { key: 'rawMaterialsInventory', label: 'Raw Materials & Inventory' },
    { key: 'consumables', label: 'Consumables' },
    { key: 'manufacturingWages', label: 'Manufacturing Wages' },
    { key: 'contractWagesMfg', label: 'Contract Wages (Mfg)' },
    { key: 'inboundTransport', label: 'Inbound Transport' },
    { key: 'factoryRent', label: 'Factory Rent' },
    { key: 'factoryElectricity', label: 'Factory Electricity' },
    { key: 'factoryMaintenance', label: 'Factory Maintenance' },
    { key: 'jobWork', label: 'Job Work' },
    { key: 'qualityTesting', label: 'Quality Testing' },
    { key: 'otherDirectExpenses', label: 'Other Direct Expenses' },
  ];

  cogmCategories.forEach(cat => {
    const row: (string | number)[] = [`    ${cat.label}`];
    let total = 0;
    sortedRecords.forEach(record => {
      const amount = (record.cogm as any)[cat.key] || 0;
      row.push(formatAmountFull(amount));
      total += amount;
    });
    row.push(formatAmountFull(total));
    row.push(totalRevenue > 0 ? formatPercentValue((total / totalRevenue) * 100) : '-');
    data.push(row);
  });

  // COGM Total
  const cogmTotalRow: (string | number)[] = ['TOTAL COGM'];
  let cogmTotal = 0;
  sortedRecords.forEach(record => {
    cogmTotalRow.push(formatAmountFull(record.cogm.totalCOGM));
    cogmTotal += record.cogm.totalCOGM;
  });
  cogmTotalRow.push(formatAmountFull(cogmTotal));
  cogmTotalRow.push(totalRevenue > 0 ? formatPercentValue((cogmTotal / totalRevenue) * 100) : '-');
  data.push(cogmTotalRow);

  // Channel & Fulfillment
  data.push([]);
  data.push(['CHANNEL & FULFILLMENT']);

  const channelCategories = [
    { key: 'amazonFees', label: 'Amazon Fees' },
    { key: 'blinkitFees', label: 'Blinkit Fees' },
    { key: 'd2cFees', label: 'D2C Fees (Shiprocket, PG)' },
  ];

  channelCategories.forEach(cat => {
    const row: (string | number)[] = [`    ${cat.label}`];
    let total = 0;
    sortedRecords.forEach(record => {
      const amount = (record.channelFulfillment as any)[cat.key] || 0;
      row.push(formatAmountFull(amount));
      total += amount;
    });
    row.push(formatAmountFull(total));
    row.push(totalRevenue > 0 ? formatPercentValue((total / totalRevenue) * 100) : '-');
    data.push(row);
  });

  // Sales & Marketing
  data.push([]);
  data.push(['SALES & MARKETING']);

  const marketingCategories = [
    { key: 'facebookAds', label: 'Facebook Ads' },
    { key: 'googleAds', label: 'Google Ads' },
    { key: 'amazonAds', label: 'Amazon Ads' },
    { key: 'blinkitAds', label: 'Blinkit Ads' },
    { key: 'agencyFees', label: 'Agency Fees' },
    { key: 'advertisingMarketing', label: 'Other Advertising' },
  ];

  marketingCategories.forEach(cat => {
    const row: (string | number)[] = [`    ${cat.label}`];
    let total = 0;
    sortedRecords.forEach(record => {
      const amount = (record.salesMarketing as any)[cat.key] || 0;
      row.push(formatAmountFull(amount));
      total += amount;
    });
    row.push(formatAmountFull(total));
    row.push(totalRevenue > 0 ? formatPercentValue((total / totalRevenue) * 100) : '-');
    data.push(row);
  });

  // Operating Expenses
  data.push([]);
  data.push(['OPERATING EXPENSES']);

  const opexCategories = [
    { key: 'salariesAdminMgmt', label: 'Salaries (Admin, Mgmt)' },
    { key: 'miscellaneous', label: 'Miscellaneous' },
    { key: 'legalCaExpenses', label: 'Legal & CA Expenses' },
    { key: 'platformCostsCRM', label: 'Platform Costs (CRM)' },
    { key: 'administrativeExpenses', label: 'Administrative Expenses' },
    { key: 'staffWelfareEvents', label: 'Staff Welfare & Events' },
    { key: 'banksFinanceCharges', label: 'Bank & Finance Charges' },
    { key: 'otherOperatingExpenses', label: 'Other Operating Expenses' },
  ];

  opexCategories.forEach(cat => {
    const row: (string | number)[] = [`    ${cat.label}`];
    let total = 0;
    sortedRecords.forEach(record => {
      const amount = (record.operatingExpenses as any)[cat.key] || 0;
      row.push(formatAmountFull(amount));
      total += amount;
    });
    row.push(formatAmountFull(total));
    row.push(totalRevenue > 0 ? formatPercentValue((total / totalRevenue) * 100) : '-');
    data.push(row);
  });

  // Total Expenses Summary
  data.push([]);
  data.push(['EXPENSE SUMMARY']);

  const expenseSummary = [
    { label: 'COGM', getValue: (r: MISRecord) => r.cogm.totalCOGM },
    { label: 'Channel & Fulfillment', getValue: (r: MISRecord) => r.channelFulfillment.total },
    { label: 'Sales & Marketing', getValue: (r: MISRecord) => r.salesMarketing.total },
    { label: 'Platform Costs', getValue: (r: MISRecord) => r.platformCosts.total },
    { label: 'Operating Expenses', getValue: (r: MISRecord) => r.operatingExpenses.total },
    { label: 'Non-Operating (I+D+A)', getValue: (r: MISRecord) => r.nonOperating.totalIDA },
    { label: 'Income Tax', getValue: (r: MISRecord) => r.nonOperating.incomeTax },
  ];

  let grandTotalExpense = 0;
  expenseSummary.forEach(item => {
    const row: (string | number)[] = [item.label];
    let total = 0;
    sortedRecords.forEach(record => {
      const amount = item.getValue(record);
      row.push(formatAmountFull(amount));
      total += amount;
    });
    row.push(formatAmountFull(total));
    row.push(totalRevenue > 0 ? formatPercentValue((total / totalRevenue) * 100) : '-');
    grandTotalExpense += total;
    data.push(row);
  });

  data.push([]);
  const grandTotalRow: (string | number)[] = ['TOTAL EXPENSES'];
  sortedRecords.forEach(record => {
    const totalExp = record.cogm.totalCOGM + record.channelFulfillment.total +
                     record.salesMarketing.total + record.platformCosts.total +
                     record.operatingExpenses.total + record.nonOperating.totalIDA +
                     record.nonOperating.incomeTax;
    grandTotalRow.push(formatAmountFull(totalExp));
  });
  grandTotalRow.push(formatAmountFull(grandTotalExpense));
  grandTotalRow.push(totalRevenue > 0 ? formatPercentValue((grandTotalExpense / totalRevenue) * 100) : '-');
  data.push(grandTotalRow);

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [35, ...sortedRecords.map(() => 12), 14, 12]);

  return ws;
}

// ============================================
// TRANSACTIONS SHEET
// ============================================

function generateTransactionsSheet(record: MISRecord): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  addSheetTitle(
    data,
    `${periodToString(record.period)} - TRANSACTION DETAILS`,
    'Classified Transactions by Head'
  );

  if (!record.transactionsByHead) {
    data.push(['No transaction data available']);
    return XLSX.utils.aoa_to_sheet(data);
  }

  // Headers
  data.push(['Head', 'Subhead', 'Date', 'Account', 'Amount', 'Type', 'Source', 'Notes']);
  data.push([]);

  // Group transactions by head
  const heads = Object.keys(record.transactionsByHead).sort();

  heads.forEach(headKey => {
    const headData = record.transactionsByHead![headKey];
    if (!headData || headData.transactionCount === 0) return;

    // Head header row
    data.push([`${headData.head}`, '', '', '', formatAmountFull(headData.total), '', '', '']);

    // Subheads
    headData.subheads.forEach(subhead => {
      if (subhead.transactions.length === 0) return;

      // Subhead header
      data.push(['', subhead.subhead, '', '', formatAmountFull(subhead.amount), '', subhead.source, '']);

      // Transactions
      subhead.transactions.forEach(txn => {
        data.push([
          '',
          '',
          txn.date,
          txn.account,
          formatAmountFull(txn.amount),
          txn.type,
          txn.source,
          txn.notes || ''
        ]);
      });

      data.push([]); // Space between subheads
    });

    data.push([]); // Space between heads
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [25, 25, 12, 40, 15, 10, 15, 30]);

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
  }

  // 2. FY Summary Sheets
  if (options.includeFYSheets && options.selectedFYs.length > 0) {
    for (const fy of options.selectedFYs) {
      const fySheet = generateFYSummarySheet(allRecords, fy);
      const sheetName = fy.replace(/[\/\\?*\[\]]/g, '-').slice(0, 28); // Excel sheet name limit
      XLSX.utils.book_append_sheet(workbook, fySheet, sheetName);
      sheetCount++;
    }
  }

  // 3. Monthly P&L Sheets
  if (options.includeMonthlySheets && options.selectedMonths.length > 0) {
    for (const periodKey of options.selectedMonths) {
      const record = allRecords.find(r => r.periodKey === periodKey);
      if (record) {
        const monthSheet = generateMonthlyPLSheet(record);
        const sheetName = periodToString(record.period).replace(/[\/\\?*\[\]]/g, '-').slice(0, 28);
        XLSX.utils.book_append_sheet(workbook, monthSheet, sheetName);
        sheetCount++;
      }
    }
  }

  // 4. Revenue Analysis Sheet
  if (options.includeRevenueAnalysis && allRecords.length > 0) {
    // If FYs are selected, create one sheet per FY
    if (options.selectedFYs.length > 0) {
      for (const fy of options.selectedFYs) {
        const revenueSheet = generateRevenueAnalysisSheet(allRecords, fy);
        const sheetName = `Revenue ${fy}`.replace(/[\/\\?*\[\]]/g, '-').slice(0, 28);
        XLSX.utils.book_append_sheet(workbook, revenueSheet, sheetName);
        sheetCount++;
      }
    } else {
      const revenueSheet = generateRevenueAnalysisSheet(allRecords);
      XLSX.utils.book_append_sheet(workbook, revenueSheet, 'Revenue Analysis');
      sheetCount++;
    }
  }

  // 5. Expense Analysis Sheet
  if (options.includeExpenseAnalysis && allRecords.length > 0) {
    if (options.selectedFYs.length > 0) {
      for (const fy of options.selectedFYs) {
        const expenseSheet = generateExpenseAnalysisSheet(allRecords, fy);
        const sheetName = `Expenses ${fy}`.replace(/[\/\\?*\[\]]/g, '-').slice(0, 28);
        XLSX.utils.book_append_sheet(workbook, expenseSheet, sheetName);
        sheetCount++;
      }
    } else {
      const expenseSheet = generateExpenseAnalysisSheet(allRecords);
      XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Expense Analysis');
      sheetCount++;
    }
  }

  // 6. Transaction Sheets (per month)
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

  // If no sheets were added, add a placeholder
  if (sheetCount === 0) {
    const placeholder = XLSX.utils.aoa_to_sheet([['No data selected for export']]);
    XLSX.utils.book_append_sheet(workbook, placeholder, 'Info');
  }

  // Generate and save file
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

/**
 * Export a single month's detailed P&L to Excel
 */
export async function exportMonthlyMISToExcel(record: MISRecord): Promise<void> {
  const workbook = XLSX.utils.book_new();

  // P&L Sheet
  const plSheet = generateMonthlyPLSheet(record);
  XLSX.utils.book_append_sheet(workbook, plSheet, 'P&L Statement');

  // Transactions Sheet (if available)
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

/**
 * Export FY summary with all analysis sheets
 */
export async function exportFYMISToExcel(allRecords: MISRecord[], fyLabel: string): Promise<void> {
  const workbook = XLSX.utils.book_new();

  // FY Summary Sheet
  const fySheet = generateFYSummarySheet(allRecords, fyLabel);
  XLSX.utils.book_append_sheet(workbook, fySheet, 'P&L Summary');

  // Revenue Analysis
  const revenueSheet = generateRevenueAnalysisSheet(allRecords, fyLabel);
  XLSX.utils.book_append_sheet(workbook, revenueSheet, 'Revenue Analysis');

  // Expense Analysis
  const expenseSheet = generateExpenseAnalysisSheet(allRecords, fyLabel);
  XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Expense Analysis');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const filename = `Heatronics_${fyLabel.replace(' ', '_')}_MIS.xlsx`;
  saveAs(blob, filename);
}

// Export helper functions for use in modal
export { getAvailableFYs, parseFYLabel };
