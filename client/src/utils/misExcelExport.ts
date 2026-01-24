/**
 * Professional MIS Excel Export Utility with Styling
 *
 * Creates beautifully formatted Excel workbooks with:
 * - Color-coded sections and margins
 * - Bold headers and totals
 * - Professional borders and formatting
 * - Monthly P&L reports with subheads
 * - Annual/FY summaries with month-by-month comparison
 */

import XLSX from 'xlsx-js-style';
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

interface CellStyle {
  font?: { bold?: boolean; italic?: boolean; color?: { rgb: string }; sz?: number; name?: string };
  fill?: { fgColor: { rgb: string }; patternType?: string };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: {
    top?: { style: string; color: { rgb: string } };
    bottom?: { style: string; color: { rgb: string } };
    left?: { style: string; color: { rgb: string } };
    right?: { style: string; color: { rgb: string } };
  };
  numFmt?: string;
}

// ============================================
// STYLE DEFINITIONS
// ============================================

const COLORS = {
  // Headers
  headerBg: '1E3A5F',        // Dark blue
  headerText: 'FFFFFF',      // White

  // Section headers
  sectionBg: '2C5282',       // Medium blue
  sectionText: 'FFFFFF',

  // Margins (positive)
  grossMarginBg: 'D4EDDA',   // Light green
  grossMarginText: '155724',
  cm1Bg: 'CCE5FF',           // Light blue
  cm1Text: '004085',
  cm2Bg: 'E2D6F8',           // Light purple
  cm2Text: '4A148C',
  cm3Bg: 'FFE5B4',           // Light orange
  cm3Text: 'E65100',
  ebitdaBg: 'B2EBF2',        // Light cyan
  ebitdaText: '006064',
  netIncomeBg: 'C8E6C9',     // Light green
  netIncomeText: '1B5E20',

  // Negative values
  negativeBg: 'FFEBEE',      // Light red
  negativeText: 'C62828',

  // Alternating rows
  altRowBg: 'F8F9FA',        // Very light gray

  // Totals
  totalBg: 'E9ECEF',         // Light gray
  totalText: '212529',

  // Subheads
  subheadText: '6C757D',     // Gray

  // Borders
  border: 'DEE2E6',          // Light gray border
  headerBorder: '1E3A5F',    // Dark blue border
};

const STYLES: Record<string, CellStyle> = {
  title: {
    font: { bold: true, sz: 16, color: { rgb: COLORS.headerText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.headerBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  subtitle: {
    font: { bold: true, sz: 12, color: { rgb: COLORS.headerText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.sectionBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  header: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.headerText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.headerBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      bottom: { style: 'medium', color: { rgb: COLORS.headerBorder } },
    },
  },
  sectionHeader: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.sectionText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.sectionBg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
  normal: {
    font: { sz: 10, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      bottom: { style: 'thin', color: { rgb: COLORS.border } },
    },
  },
  number: {
    font: { sz: 10, name: 'Calibri' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      bottom: { style: 'thin', color: { rgb: COLORS.border } },
    },
    numFmt: '#,##0.00',
  },
  percent: {
    font: { sz: 10, name: 'Calibri' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      bottom: { style: 'thin', color: { rgb: COLORS.border } },
    },
  },
  subhead: {
    font: { sz: 10, color: { rgb: COLORS.subheadText }, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      bottom: { style: 'thin', color: { rgb: COLORS.border } },
    },
  },
  total: {
    font: { bold: true, sz: 10, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.totalBg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: COLORS.border } },
      bottom: { style: 'medium', color: { rgb: COLORS.border } },
    },
  },
  totalNumber: {
    font: { bold: true, sz: 10, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.totalBg }, patternType: 'solid' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: COLORS.border } },
      bottom: { style: 'medium', color: { rgb: COLORS.border } },
    },
    numFmt: '#,##0.00',
  },
  grossMargin: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.grossMarginText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.grossMarginBg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: '155724' } },
      bottom: { style: 'medium', color: { rgb: '155724' } },
    },
  },
  cm1: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.cm1Text }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.cm1Bg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: '004085' } },
      bottom: { style: 'medium', color: { rgb: '004085' } },
    },
  },
  cm2: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.cm2Text }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.cm2Bg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: '4A148C' } },
      bottom: { style: 'medium', color: { rgb: '4A148C' } },
    },
  },
  cm3: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.cm3Text }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.cm3Bg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: 'E65100' } },
      bottom: { style: 'medium', color: { rgb: 'E65100' } },
    },
  },
  ebitda: {
    font: { bold: true, sz: 11, color: { rgb: COLORS.ebitdaText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.ebitdaBg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'medium', color: { rgb: '006064' } },
      bottom: { style: 'medium', color: { rgb: '006064' } },
    },
  },
  netIncome: {
    font: { bold: true, sz: 12, color: { rgb: COLORS.netIncomeText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.netIncomeBg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'double', color: { rgb: '1B5E20' } },
      bottom: { style: 'double', color: { rgb: '1B5E20' } },
    },
  },
  negative: {
    font: { sz: 10, color: { rgb: COLORS.negativeText }, name: 'Calibri' },
    fill: { fgColor: { rgb: COLORS.negativeBg }, patternType: 'solid' },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '#,##0.00',
  },
  formula: {
    font: { italic: true, sz: 10, color: { rgb: '0066CC' }, name: 'Calibri' },
    fill: { fgColor: { rgb: 'E3F2FD' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
};

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

function setRowHeights(ws: XLSX.WorkSheet, heights: { [row: number]: number }): void {
  ws['!rows'] = ws['!rows'] || [];
  Object.entries(heights).forEach(([row, height]) => {
    ws['!rows']![parseInt(row)] = { hpt: height };
  });
}

// Apply style to a cell
function applyStyle(ws: XLSX.WorkSheet, cellRef: string, style: CellStyle): void {
  if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };
  ws[cellRef].s = style;
}

// Create a styled cell
function createCell(value: string | number, style: CellStyle): XLSX.CellObject {
  const cell: XLSX.CellObject = {
    v: value,
    t: typeof value === 'number' ? 'n' : 's',
    s: style,
  };
  return cell;
}

// Get subheads for a head - from transactionsByHead or fallback to direct properties
function getSubheadsForHead(record: MISRecord, headKey: MISHead): { subhead: string; amount: number; txnCount: number; source: string }[] {
  const txnHead = record.transactionsByHead?.[headKey];
  if (txnHead && txnHead.subheads && txnHead.subheads.length > 0) {
    return txnHead.subheads.map(s => ({
      subhead: s.subhead,
      amount: s.amount,
      txnCount: s.transactionCount,
      source: s.source
    }));
  }

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
        subheads.push({ subhead: 'Salaries (Admin/Mgmt)', amount: record.operatingExpenses.salariesAdminMgmt, txnCount: 0, source: 'balance_sheet' });
      if (record.operatingExpenses.miscellaneous > 0)
        subheads.push({ subhead: 'Miscellaneous', amount: record.operatingExpenses.miscellaneous, txnCount: 0, source: 'balance_sheet' });
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
        subheads.push({ subhead: 'Other Operating', amount: record.operatingExpenses.otherOperatingExpenses, txnCount: 0, source: 'balance_sheet' });
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
// MONTHLY DETAILED P&L SHEET (STYLED)
// ============================================

function generateMonthlyDetailedPLSheet(record: MISRecord): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const netRevenue = record.revenue.netRevenue || 1;
  let row = 1;

  // Merge helper
  const merges: XLSX.Range[] = [];

  // Title Section
  ws[`A${row}`] = createCell(`${periodToString(record.period)} - PROFIT & LOSS STATEMENT`, STYLES.title);
  ws[`B${row}`] = createCell('', STYLES.title);
  ws[`C${row}`] = createCell('', STYLES.title);
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;

  ws[`A${row}`] = createCell('Heatronics Pvt Ltd', STYLES.subtitle);
  ws[`B${row}`] = createCell('', STYLES.subtitle);
  ws[`C${row}`] = createCell('', STYLES.subtitle);
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;

  ws[`A${row}`] = createCell(`Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, { ...STYLES.normal, alignment: { horizontal: 'center' } });
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;

  row++; // Empty row

  // Revenue Formula
  ws[`A${row}`] = createCell('Revenue Formula: Net Revenue = Gross Revenue - Returns - Discounts - Taxes (GST)', STYLES.formula);
  ws[`B${row}`] = createCell('', STYLES.formula);
  ws[`C${row}`] = createCell('', STYLES.formula);
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 2 } });
  row++;

  row++; // Empty row

  // Headers
  ws[`A${row}`] = createCell('Particulars', STYLES.header);
  ws[`B${row}`] = createCell('Amount (₹)', STYLES.header);
  ws[`C${row}`] = createCell('% of Revenue', STYLES.header);
  row++;

  // Helper to add styled row
  const addRow = (label: string, amount: number | string, percent: string, style: CellStyle, isNegative = false) => {
    const numStyle = isNegative && typeof amount === 'number' && amount > 0
      ? { ...STYLES.negative }
      : { ...style, alignment: { horizontal: 'right' as const } };

    ws[`A${row}`] = createCell(label, style);
    ws[`B${row}`] = createCell(typeof amount === 'number' ? formatAmountFull(isNegative ? -amount : amount) : amount, numStyle);
    ws[`C${row}`] = createCell(percent, { ...style, alignment: { horizontal: 'right' as const } });
    row++;
  };

  // ===== A. REVENUE =====
  ws[`A${row}`] = createCell('A. GROSS REVENUE (from Sales Register)', STYLES.sectionHeader);
  ws[`B${row}`] = createCell('', STYLES.sectionHeader);
  ws[`C${row}`] = createCell('', STYLES.sectionHeader);
  row++;

  SALES_CHANNELS.forEach(channel => {
    const amount = record.revenue.grossRevenue[channel] || 0;
    if (amount > 0) {
      addRow(`    ${channel}`, amount, formatPercentValue((amount / netRevenue) * 100), STYLES.normal);
    }
  });
  addRow('TOTAL GROSS REVENUE', record.revenue.totalGrossRevenue, '', STYLES.total);

  // ===== B. RETURNS =====
  if (record.revenue.totalReturns > 0) {
    row++; // spacing
    ws[`A${row}`] = createCell('B. RETURNS', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    SALES_CHANNELS.forEach(channel => {
      const amount = record.revenue.returns[channel] || 0;
      if (amount > 0) {
        addRow(`    ${channel} Returns`, amount, formatPercentValue((amount / netRevenue) * 100), STYLES.normal, true);
      }
    });
    addRow('TOTAL RETURNS', record.revenue.totalReturns, formatPercentValue((record.revenue.totalReturns / netRevenue) * 100), STYLES.total, true);
  }

  // ===== D. TAXES =====
  if (record.revenue.totalTaxes > 0) {
    row++;
    ws[`A${row}`] = createCell('D. TAXES (GST Collected)', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;
    addRow('TOTAL TAXES', record.revenue.totalTaxes, formatPercentValue((record.revenue.totalTaxes / netRevenue) * 100), STYLES.total, true);
  }

  // NET REVENUE
  row++;
  const netRevStyle = { ...STYLES.grossMargin, font: { ...STYLES.grossMargin.font, sz: 12 } };
  addRow('NET REVENUE', record.revenue.netRevenue, '100.00%', netRevStyle);
  row++;

  // ===== E. COGM =====
  const cogmSubheads = getSubheadsForHead(record, 'E. COGM');
  const cogmTotal = getHeadTotal(record, 'E. COGM');

  if (cogmTotal > 0) {
    ws[`A${row}`] = createCell('E. COST OF GOODS MANUFACTURED (COGM)', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    cogmSubheads.forEach(sh => {
      addRow(`    ${sh.subhead}`, sh.amount, formatPercentValue((sh.amount / netRevenue) * 100), STYLES.subhead, true);
    });
    addRow('TOTAL COGM', cogmTotal, formatPercentValue((cogmTotal / netRevenue) * 100), STYLES.total, true);
  }

  // GROSS MARGIN
  row++;
  addRow('GROSS MARGIN', record.grossMargin, formatPercentValue(record.grossMarginPercent), STYLES.grossMargin);
  row++;

  // ===== F. CHANNEL & FULFILLMENT =====
  const channelSubheads = getSubheadsForHead(record, 'F. Channel & Fulfillment');
  const channelTotal = getHeadTotal(record, 'F. Channel & Fulfillment');

  if (channelTotal > 0) {
    ws[`A${row}`] = createCell('F. CHANNEL & FULFILLMENT', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    channelSubheads.forEach(sh => {
      addRow(`    ${sh.subhead}`, sh.amount, formatPercentValue((sh.amount / netRevenue) * 100), STYLES.subhead, true);
    });
    addRow('TOTAL CHANNEL & FULFILLMENT', channelTotal, formatPercentValue((channelTotal / netRevenue) * 100), STYLES.total, true);
  }

  // CM1
  row++;
  addRow('CM1 (Contribution Margin 1)', record.cm1, formatPercentValue(record.cm1Percent), STYLES.cm1);
  row++;

  // ===== G. SALES & MARKETING =====
  const marketingSubheads = getSubheadsForHead(record, 'G. Sales & Marketing');
  const marketingTotal = getHeadTotal(record, 'G. Sales & Marketing');

  if (marketingTotal > 0) {
    ws[`A${row}`] = createCell('G. SALES & MARKETING', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    marketingSubheads.forEach(sh => {
      addRow(`    ${sh.subhead}`, sh.amount, formatPercentValue((sh.amount / netRevenue) * 100), STYLES.subhead, true);
    });
    addRow('TOTAL SALES & MARKETING', marketingTotal, formatPercentValue((marketingTotal / netRevenue) * 100), STYLES.total, true);
  }

  // CM2
  row++;
  addRow('CM2 (Contribution Margin 2)', record.cm2, formatPercentValue(record.cm2Percent), STYLES.cm2);
  row++;

  // ===== H. PLATFORM COSTS =====
  const platformSubheads = getSubheadsForHead(record, 'H. Platform Costs');
  const platformTotal = getHeadTotal(record, 'H. Platform Costs');

  if (platformTotal > 0) {
    ws[`A${row}`] = createCell('H. PLATFORM COSTS', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    platformSubheads.forEach(sh => {
      addRow(`    ${sh.subhead}`, sh.amount, formatPercentValue((sh.amount / netRevenue) * 100), STYLES.subhead, true);
    });
    addRow('TOTAL PLATFORM COSTS', platformTotal, formatPercentValue((platformTotal / netRevenue) * 100), STYLES.total, true);
  }

  // CM3
  row++;
  addRow('CM3 (Contribution Margin 3)', record.cm3, formatPercentValue(record.cm3Percent), STYLES.cm3);
  row++;

  // ===== I. OPERATING EXPENSES =====
  const opexSubheads = getSubheadsForHead(record, 'I. Operating Expenses');
  const opexTotal = getHeadTotal(record, 'I. Operating Expenses');

  if (opexTotal > 0) {
    ws[`A${row}`] = createCell('I. OPERATING EXPENSES', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    opexSubheads.forEach(sh => {
      addRow(`    ${sh.subhead}`, sh.amount, formatPercentValue((sh.amount / netRevenue) * 100), STYLES.subhead, true);
    });
    addRow('TOTAL OPERATING EXPENSES', opexTotal, formatPercentValue((opexTotal / netRevenue) * 100), STYLES.total, true);
  }

  // EBITDA
  row++;
  addRow('EBITDA', record.ebitda, formatPercentValue(record.ebitdaPercent), STYLES.ebitda);
  row++;

  // ===== J. NON-OPERATING =====
  const nonOpSubheads = getSubheadsForHead(record, 'J. Non-Operating');
  const nonOpTotal = getHeadTotal(record, 'J. Non-Operating');

  if (nonOpTotal > 0) {
    ws[`A${row}`] = createCell('J. NON-OPERATING (I+D+A+Tax)', STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    nonOpSubheads.forEach(sh => {
      addRow(`    ${sh.subhead}`, sh.amount, formatPercentValue((sh.amount / netRevenue) * 100), STYLES.subhead, true);
    });
    addRow('TOTAL NON-OPERATING', nonOpTotal, formatPercentValue((nonOpTotal / netRevenue) * 100), STYLES.total, true);
  }

  // NET INCOME
  row++;
  row++;
  const netIncomeStyle = record.netIncome >= 0 ? STYLES.netIncome : { ...STYLES.netIncome, font: { ...STYLES.netIncome.font, color: { rgb: COLORS.negativeText } } };
  addRow('NET INCOME', record.netIncome, formatPercentValue(record.netIncomePercent), netIncomeStyle);

  // Set range
  ws['!ref'] = `A1:C${row}`;
  ws['!merges'] = merges;
  setColumnWidths(ws, [45, 18, 15]);

  return ws;
}

// ============================================
// FY DETAILED P&L SHEET (STYLED)
// ============================================

function generateFYDetailedPLSheet(records: MISRecord[], fyLabel: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const fyStartYear = parseFYLabel(fyLabel);
  let row = 1;

  const merges: XLSX.Range[] = [];

  // Build FY months data
  const fyMonthsData = FY_MONTHS.map(({ month, label }) => {
    const year = getYearForMonth(fyStartYear, month);
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const record = records.find(r => r.periodKey === periodKey);
    return { month, year, label: `${label}'${String(year).slice(-2)}`, periodKey, record };
  });

  const numCols = fyMonthsData.length + 3; // Particulars + months + FY Total + % Rev

  // Calculate FY totals
  const fyTotals = {
    netRevenue: fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.netRevenue || 0), 0),
  };

  // Title
  ws[`A${row}`] = createCell(`${fyLabel} - PROFIT & LOSS STATEMENT`, STYLES.title);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.title);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: numCols - 1 } });
  row++;

  ws[`A${row}`] = createCell(`Heatronics Pvt Ltd | April ${fyStartYear} to March ${fyStartYear + 1}`, STYLES.subtitle);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.subtitle);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: numCols - 1 } });
  row++;

  row++; // Empty

  // Revenue formula
  ws[`A${row}`] = createCell('Net Revenue = Gross Revenue - Returns - Taxes (GST) | All values in INR', STYLES.formula);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.formula);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: numCols - 1 } });
  row++;

  row++; // Empty

  // Header row
  ws[`A${row}`] = createCell('Particulars', STYLES.header);
  fyMonthsData.forEach((m, i) => {
    ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(m.label, STYLES.header);
  });
  ws[XLSX.utils.encode_cell({ r: row - 1, c: fyMonthsData.length + 1 })] = createCell('FY Total', STYLES.header);
  ws[XLSX.utils.encode_cell({ r: row - 1, c: fyMonthsData.length + 2 })] = createCell('% Rev', STYLES.header);
  row++;

  // Helper to add data row
  const addDataRow = (label: string, getValue: (r: MISRecord | undefined) => number, style: CellStyle, isNegative = false) => {
    ws[`A${row}`] = createCell(label, style);
    let total = 0;
    fyMonthsData.forEach((m, i) => {
      const value = getValue(m.record);
      const displayValue = isNegative && value > 0 ? -value : value;
      total += value;
      const numStyle = isNegative && value > 0 ? STYLES.negative : { ...style, alignment: { horizontal: 'right' as const } };
      ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(value !== 0 ? formatAmountFull(displayValue) : '-', numStyle);
    });
    const displayTotal = isNegative && total > 0 ? -total : total;
    const totalStyle = { ...STYLES.totalNumber, fill: style.fill };
    ws[XLSX.utils.encode_cell({ r: row - 1, c: fyMonthsData.length + 1 })] = createCell(formatAmountFull(displayTotal), totalStyle);
    ws[XLSX.utils.encode_cell({ r: row - 1, c: fyMonthsData.length + 2 })] = createCell(
      fyTotals.netRevenue > 0 ? formatPercentValue((Math.abs(total) / fyTotals.netRevenue) * 100) : '-',
      { ...style, alignment: { horizontal: 'right' as const } }
    );
    row++;
  };

  // Helper for margin rows
  const addMarginRow = (label: string, getValue: (r: MISRecord) => number, style: CellStyle) => {
    ws[`A${row}`] = createCell(label, style);
    let total = 0;
    fyMonthsData.forEach((m, i) => {
      const value = m.record ? getValue(m.record) : 0;
      total += value;
      const numStyle = value < 0
        ? { ...style, font: { ...style.font, color: { rgb: COLORS.negativeText } }, alignment: { horizontal: 'right' as const } }
        : { ...style, alignment: { horizontal: 'right' as const } };
      ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(value !== 0 ? formatAmountFull(value) : '-', numStyle);
    });
    ws[XLSX.utils.encode_cell({ r: row - 1, c: fyMonthsData.length + 1 })] = createCell(formatAmountFull(total), { ...style, alignment: { horizontal: 'right' as const } });
    ws[XLSX.utils.encode_cell({ r: row - 1, c: fyMonthsData.length + 2 })] = createCell(
      fyTotals.netRevenue > 0 ? formatPercentValue((total / fyTotals.netRevenue) * 100) : '-',
      { ...style, alignment: { horizontal: 'right' as const } }
    );
    row++;
  };

  // NET REVENUE
  addMarginRow('NET REVENUE', r => r.revenue.netRevenue, { ...STYLES.grossMargin, font: { ...STYLES.grossMargin.font, sz: 11 } });
  row++;

  // COGM
  ws[`A${row}`] = createCell('E. COST OF GOODS MANUFACTURED', STYLES.sectionHeader);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.sectionHeader);
  }
  row++;
  addDataRow('    COGM Total', r => r?.cogm.totalCOGM || 0, STYLES.normal, true);

  // GROSS MARGIN
  row++;
  addMarginRow('GROSS MARGIN', r => r.grossMargin, STYLES.grossMargin);
  row++;

  // Channel & Fulfillment
  ws[`A${row}`] = createCell('F. CHANNEL & FULFILLMENT', STYLES.sectionHeader);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.sectionHeader);
  }
  row++;
  addDataRow('    Channel Total', r => r?.channelFulfillment.total || 0, STYLES.normal, true);

  // CM1
  row++;
  addMarginRow('CM1', r => r.cm1, STYLES.cm1);
  row++;

  // Sales & Marketing
  ws[`A${row}`] = createCell('G. SALES & MARKETING', STYLES.sectionHeader);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.sectionHeader);
  }
  row++;
  addDataRow('    Marketing Total', r => r?.salesMarketing.total || 0, STYLES.normal, true);

  // CM2
  row++;
  addMarginRow('CM2', r => r.cm2, STYLES.cm2);
  row++;

  // Platform Costs
  ws[`A${row}`] = createCell('H. PLATFORM COSTS', STYLES.sectionHeader);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.sectionHeader);
  }
  row++;
  addDataRow('    Platform Total', r => r?.platformCosts.total || 0, STYLES.normal, true);

  // CM3
  row++;
  addMarginRow('CM3', r => r.cm3, STYLES.cm3);
  row++;

  // Operating Expenses
  ws[`A${row}`] = createCell('I. OPERATING EXPENSES', STYLES.sectionHeader);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.sectionHeader);
  }
  row++;
  addDataRow('    OpEx Total', r => r?.operatingExpenses.total || 0, STYLES.normal, true);

  // EBITDA
  row++;
  addMarginRow('EBITDA', r => r.ebitda, STYLES.ebitda);
  row++;

  // Non-Operating
  ws[`A${row}`] = createCell('J. NON-OPERATING', STYLES.sectionHeader);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.sectionHeader);
  }
  row++;
  addDataRow('    Non-Op Total', r => (r?.nonOperating.totalIDA || 0) + (r?.nonOperating.incomeTax || 0), STYLES.normal, true);

  // NET INCOME
  row++;
  row++;
  addMarginRow('NET INCOME', r => r.netIncome, STYLES.netIncome);

  // Set range and styles
  ws['!ref'] = `A1:${XLSX.utils.encode_col(numCols - 1)}${row}`;
  ws['!merges'] = merges;
  setColumnWidths(ws, [35, ...fyMonthsData.map(() => 10), 12, 8]);

  return ws;
}

// ============================================
// SUMMARY SHEET (STYLED)
// ============================================

function generateSummarySheet(records: MISRecord[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let row = 1;
  const merges: XLSX.Range[] = [];

  const sortedRecords = [...records].sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year;
    return a.period.month - b.period.month;
  });
  const recentRecords = sortedRecords.slice(-12);
  const numCols = recentRecords.length + 2;

  // Title
  ws[`A${row}`] = createCell('HEATRONICS - MIS SUMMARY REPORT', STYLES.title);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.title);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: numCols - 1 } });
  row++;

  ws[`A${row}`] = createCell(`Generated: ${new Date().toLocaleDateString('en-IN')}`, STYLES.subtitle);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.subtitle);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: numCols - 1 } });
  row++;

  row++; // Empty

  // Header
  ws[`A${row}`] = createCell('Metric', STYLES.header);
  recentRecords.forEach((r, i) => {
    ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(periodToString(r.period), STYLES.header);
  });
  ws[XLSX.utils.encode_cell({ r: row - 1, c: recentRecords.length + 1 })] = createCell('Total', STYLES.header);
  row++;

  // Data rows
  const addMetricRow = (label: string, getValue: (r: MISRecord) => number, style: CellStyle) => {
    ws[`A${row}`] = createCell(label, style);
    let total = 0;
    recentRecords.forEach((r, i) => {
      const value = getValue(r);
      total += value;
      ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(formatAmountFull(value), { ...style, alignment: { horizontal: 'right' } });
    });
    ws[XLSX.utils.encode_cell({ r: row - 1, c: recentRecords.length + 1 })] = createCell(formatAmountFull(total), { ...STYLES.totalNumber, fill: style.fill });
    row++;
  };

  const addPercentRow = (label: string, getPercent: (r: MISRecord) => number, style: CellStyle) => {
    ws[`A${row}`] = createCell(label, style);
    recentRecords.forEach((r, i) => {
      const value = getPercent(r);
      const pctStyle = value < 0 ? { ...style, font: { ...style.font, color: { rgb: COLORS.negativeText } }, alignment: { horizontal: 'right' as const } } : { ...style, alignment: { horizontal: 'right' as const } };
      ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(formatPercentValue(value), pctStyle);
    });
    ws[XLSX.utils.encode_cell({ r: row - 1, c: recentRecords.length + 1 })] = createCell('', style);
    row++;
  };

  addMetricRow('Net Revenue', r => r.revenue.netRevenue, STYLES.normal);
  addMetricRow('COGM', r => r.cogm.totalCOGM, STYLES.normal);
  addPercentRow('COGS %', r => r.revenue.netRevenue > 0 ? (r.cogm.totalCOGM / r.revenue.netRevenue) * 100 : 0, STYLES.normal);
  addMetricRow('Gross Margin', r => r.grossMargin, STYLES.grossMargin);
  addPercentRow('Gross Margin %', r => r.grossMarginPercent, STYLES.grossMargin);
  addPercentRow('CM1 %', r => r.cm1Percent, STYLES.cm1);
  addPercentRow('CM2 %', r => r.cm2Percent, STYLES.cm2);
  addPercentRow('EBITDA %', r => r.ebitdaPercent, STYLES.ebitda);
  addPercentRow('Net Income %', r => r.netIncomePercent, STYLES.netIncome);

  ws['!ref'] = `A1:${XLSX.utils.encode_col(numCols - 1)}${row}`;
  ws['!merges'] = merges;
  setColumnWidths(ws, [18, ...recentRecords.map(() => 11), 12]);

  return ws;
}

// ============================================
// TRENDS SHEET (STYLED)
// ============================================

function generateTrendsSheet(records: MISRecord[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let row = 1;
  const merges: XLSX.Range[] = [];

  const sortedRecords = [...records].sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year;
    return a.period.month - b.period.month;
  });

  const numCols = sortedRecords.length + 1;

  // Title
  ws[`A${row}`] = createCell('MIS TRENDS - MONTHLY COMPARISON', STYLES.title);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.title);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: numCols - 1 } });
  row++;

  ws[`A${row}`] = createCell('Net Revenue = Gross Revenue - Returns - Taxes (GST)', STYLES.formula);
  for (let c = 1; c < numCols; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.formula);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: numCols - 1 } });
  row++;

  row++; // Empty

  // Header
  ws[`A${row}`] = createCell('Metric', STYLES.header);
  sortedRecords.forEach((r, i) => {
    ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(periodToString(r.period), STYLES.header);
  });
  row++;

  // Data rows
  const metrics: { label: string; getValue: (r: MISRecord) => string | number; style: CellStyle }[] = [
    { label: 'Net Revenue', getValue: r => formatAmountFull(r.revenue.netRevenue), style: STYLES.normal },
    { label: 'COGS %', getValue: r => formatPercentValue(r.revenue.netRevenue > 0 ? (r.cogm.totalCOGM / r.revenue.netRevenue) * 100 : 0), style: STYLES.normal },
    { label: 'Gross Margin %', getValue: r => formatPercentValue(r.grossMarginPercent), style: STYLES.grossMargin },
    { label: 'CM1 %', getValue: r => formatPercentValue(r.cm1Percent), style: STYLES.cm1 },
    { label: 'CM2 %', getValue: r => formatPercentValue(r.cm2Percent), style: STYLES.cm2 },
    { label: 'EBITDA %', getValue: r => formatPercentValue(r.ebitdaPercent), style: STYLES.ebitda },
    { label: 'Net Income %', getValue: r => formatPercentValue(r.netIncomePercent), style: STYLES.netIncome },
  ];

  metrics.forEach(metric => {
    ws[`A${row}`] = createCell(metric.label, metric.style);
    sortedRecords.forEach((r, i) => {
      const value = metric.getValue(r);
      const isNegative = typeof value === 'string' && value.startsWith('-');
      const cellStyle = isNegative
        ? { ...metric.style, font: { ...metric.style.font, color: { rgb: COLORS.negativeText } }, alignment: { horizontal: 'right' as const } }
        : { ...metric.style, alignment: { horizontal: 'right' as const } };
      ws[XLSX.utils.encode_cell({ r: row - 1, c: i + 1 })] = createCell(value, cellStyle);
    });
    row++;
  });

  ws['!ref'] = `A1:${XLSX.utils.encode_col(numCols - 1)}${row}`;
  ws['!merges'] = merges;
  setColumnWidths(ws, [18, ...sortedRecords.map(() => 11)]);

  return ws;
}

// ============================================
// TRANSACTIONS SHEET (STYLED)
// ============================================

function generateTransactionsSheet(record: MISRecord): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let row = 1;
  const merges: XLSX.Range[] = [];

  // Title
  ws[`A${row}`] = createCell(`${periodToString(record.period)} - TRANSACTION DETAILS`, STYLES.title);
  for (let c = 1; c < 7; c++) {
    ws[XLSX.utils.encode_cell({ r: row - 1, c })] = createCell('', STYLES.title);
  }
  merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 6 } });
  row++;

  row++; // Empty

  if (!record.transactionsByHead) {
    ws[`A${row}`] = createCell('No transaction data available', STYLES.normal);
    ws['!ref'] = `A1:G${row}`;
    ws['!merges'] = merges;
    return ws;
  }

  // Header
  const headers = ['Head', 'Subhead', 'Date', 'Account', 'Amount (₹)', 'Type', 'Source'];
  headers.forEach((h, i) => {
    ws[XLSX.utils.encode_cell({ r: row - 1, c: i })] = createCell(h, STYLES.header);
  });
  row++;

  const heads: MISHead[] = ['E. COGM', 'F. Channel & Fulfillment', 'G. Sales & Marketing',
    'H. Platform Costs', 'I. Operating Expenses', 'J. Non-Operating'];

  heads.forEach(headKey => {
    const headData = record.transactionsByHead![headKey];
    if (!headData || headData.transactionCount === 0) return;

    // Head row
    ws[`A${row}`] = createCell(headKey, STYLES.sectionHeader);
    ws[`B${row}`] = createCell('', STYLES.sectionHeader);
    ws[`C${row}`] = createCell('', STYLES.sectionHeader);
    ws[`D${row}`] = createCell('', STYLES.sectionHeader);
    ws[`E${row}`] = createCell(formatAmountFull(headData.total), { ...STYLES.sectionHeader, alignment: { horizontal: 'right' } });
    ws[`F${row}`] = createCell(`${headData.transactionCount} txns`, STYLES.sectionHeader);
    ws[`G${row}`] = createCell('', STYLES.sectionHeader);
    row++;

    headData.subheads.forEach(subhead => {
      if (subhead.transactions.length === 0) return;

      // Subhead row
      ws[`A${row}`] = createCell('', STYLES.subhead);
      ws[`B${row}`] = createCell(subhead.subhead, { ...STYLES.subhead, font: { ...STYLES.subhead.font, bold: true } });
      ws[`C${row}`] = createCell('', STYLES.subhead);
      ws[`D${row}`] = createCell('', STYLES.subhead);
      ws[`E${row}`] = createCell(formatAmountFull(subhead.amount), { ...STYLES.subhead, alignment: { horizontal: 'right' } });
      ws[`F${row}`] = createCell(`${subhead.transactionCount} txns`, STYLES.subhead);
      ws[`G${row}`] = createCell(subhead.source, STYLES.subhead);
      row++;

      // Transaction rows
      subhead.transactions.forEach(txn => {
        ws[`A${row}`] = createCell('', STYLES.normal);
        ws[`B${row}`] = createCell('', STYLES.normal);
        ws[`C${row}`] = createCell(txn.date, STYLES.normal);
        ws[`D${row}`] = createCell(txn.account, STYLES.normal);
        ws[`E${row}`] = createCell(formatAmountFull(txn.amount), { ...STYLES.number });
        ws[`F${row}`] = createCell(txn.type, STYLES.normal);
        ws[`G${row}`] = createCell(txn.source, STYLES.normal);
        row++;
      });
    });

    row++; // Spacing between heads
  });

  ws['!ref'] = `A1:G${row}`;
  ws['!merges'] = merges;
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
