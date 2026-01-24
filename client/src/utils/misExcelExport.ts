/**
 * Professional MIS Excel Export Utility
 *
 * Creates professionally formatted Excel workbooks with:
 * - Monthly P&L reports with ACTUAL subheads from transactionsByHead
 * - Annual/FY summaries with month-by-month comparison
 * - All data comes from the actual classified transactions, not hardcoded categories
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  MISRecord,
  periodToString,
  MISHead,
  TransactionsByHead,
  HeadWithTransactions,
  SubheadWithTransactions,
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

// Order of heads for display
const HEAD_ORDER: MISHead[] = [
  'A. Revenue',
  'B. Returns',
  'C. Discounts',
  'D. Taxes',
  'E. COGM',
  'F. Channel & Fulfillment',
  'G. Sales & Marketing',
  'H. Platform Costs',
  'I. Operating Expenses',
  'J. Non-Operating',
  'X. Exclude',
  'Z. Ignore'
];

// Margins to display after certain heads
const MARGIN_AFTER_HEAD: Record<string, { label: string; getValue: (r: MISRecord) => number; getPercent: (r: MISRecord) => number }> = {
  'D. Taxes': { label: 'NET REVENUE', getValue: r => r.revenue.netRevenue, getPercent: () => 100 },
  'E. COGM': { label: 'GROSS MARGIN', getValue: r => r.grossMargin, getPercent: r => r.grossMarginPercent },
  'F. Channel & Fulfillment': { label: 'CM1 (Contribution Margin 1)', getValue: r => r.cm1, getPercent: r => r.cm1Percent },
  'G. Sales & Marketing': { label: 'CM2 (After Marketing)', getValue: r => r.cm2, getPercent: r => r.cm2Percent },
  'H. Platform Costs': { label: 'CM3 (After Platform)', getValue: r => r.cm3, getPercent: r => r.cm3Percent },
  'I. Operating Expenses': { label: 'EBITDA', getValue: r => r.ebitda, getPercent: r => r.ebitdaPercent },
  'J. Non-Operating': { label: 'NET INCOME', getValue: r => r.netIncome, getPercent: r => r.netIncomePercent },
};

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

// Check if a head is an expense head (negative impact)
function isExpenseHead(head: MISHead): boolean {
  return ['B. Returns', 'C. Discounts', 'D. Taxes', 'E. COGM', 'F. Channel & Fulfillment',
          'G. Sales & Marketing', 'H. Platform Costs', 'I. Operating Expenses', 'J. Non-Operating'].includes(head);
}

// ============================================
// MONTHLY DETAILED P&L SHEET (Using transactionsByHead)
// ============================================

function generateMonthlyDetailedPLSheet(record: MISRecord): XLSX.WorkSheet {
  const data: (string | number)[][] = [];
  const netRevenue = record.revenue.netRevenue || 1;

  addSheetTitle(
    data,
    `${periodToString(record.period)} - DETAILED P&L STATEMENT`,
    'All amounts in INR'
  );

  // Headers
  data.push(['Particulars', 'Amount (₹)', '% of Revenue']);
  data.push([]);

  const txnByHead = record.transactionsByHead || {};

  // Process each head in order
  for (const headKey of HEAD_ORDER) {
    const headData = txnByHead[headKey];

    // Skip X. Exclude and Z. Ignore for main P&L
    if (headKey === 'X. Exclude' || headKey === 'Z. Ignore') continue;

    // Special handling for Revenue - use sales register data
    if (headKey === 'A. Revenue') {
      data.push([headKey, '', '']);

      // Show revenue by channel from sales register
      SALES_CHANNELS.forEach(channel => {
        const amount = record.revenue.grossRevenue[channel] || 0;
        if (amount > 0) {
          data.push([`    ${channel}`, formatAmountFull(amount), formatPercentValue((amount / netRevenue) * 100)]);
        }
      });

      data.push(['GROSS REVENUE', formatAmountFull(record.revenue.totalGrossRevenue), '']);
      data.push([]);
      continue;
    }

    // Special handling for Returns - use sales register data
    if (headKey === 'B. Returns') {
      if (record.revenue.totalReturns > 0) {
        data.push([headKey, '', '']);

        SALES_CHANNELS.forEach(channel => {
          const amount = record.revenue.returns[channel] || 0;
          if (amount > 0) {
            data.push([`    ${channel} Returns`, formatAmountFull(-amount), formatPercentValue((amount / netRevenue) * 100)]);
          }
        });

        data.push(['TOTAL RETURNS', formatAmountFull(-record.revenue.totalReturns), formatPercentValue((record.revenue.totalReturns / netRevenue) * 100)]);
        data.push([]);
      }
      continue;
    }

    // Special handling for Taxes - use sales register data
    if (headKey === 'D. Taxes') {
      if (record.revenue.totalTaxes > 0) {
        data.push([headKey, '', '']);

        SALES_CHANNELS.forEach(channel => {
          const amount = record.revenue.taxes[channel] || 0;
          if (amount > 0) {
            data.push([`    ${channel} GST`, formatAmountFull(-amount), formatPercentValue((amount / netRevenue) * 100)]);
          }
        });

        data.push(['TOTAL TAXES (GST)', formatAmountFull(-record.revenue.totalTaxes), formatPercentValue((record.revenue.totalTaxes / netRevenue) * 100)]);
        data.push([]);
      }

      // Add NET REVENUE margin
      const margin = MARGIN_AFTER_HEAD[headKey];
      if (margin) {
        data.push(['═══════════════════════════════════════════════════════', '', '']);
        data.push([margin.label, formatAmountFull(margin.getValue(record)), formatPercentValue(margin.getPercent(record))]);
        data.push(['═══════════════════════════════════════════════════════', '', '']);
        data.push([]);
      }
      continue;
    }

    // Skip C. Discounts if zero
    if (headKey === 'C. Discounts' && record.revenue.totalDiscounts === 0) continue;

    // For other heads, use transactionsByHead data
    if (headData && headData.total > 0) {
      data.push([headKey, '', '']);

      // Show each subhead from the actual data
      headData.subheads.forEach(subhead => {
        if (subhead.amount > 0) {
          const displayAmount = isExpenseHead(headKey) ? -subhead.amount : subhead.amount;
          const txnCount = subhead.transactionCount > 0 ? ` [${subhead.transactionCount}]` : '';
          data.push([
            `    ${subhead.subhead}${txnCount}`,
            formatAmountFull(displayAmount),
            formatPercentValue((subhead.amount / netRevenue) * 100)
          ]);
        }
      });

      // Total for this head
      const totalDisplayAmount = isExpenseHead(headKey) ? -headData.total : headData.total;
      data.push([`TOTAL ${headKey.split('. ')[1]?.toUpperCase() || headKey}`, formatAmountFull(totalDisplayAmount), formatPercentValue((headData.total / netRevenue) * 100)]);
      data.push([]);
    }

    // Add margin row after this head if applicable
    const margin = MARGIN_AFTER_HEAD[headKey];
    if (margin && (headData?.total > 0 || headKey === 'E. COGM')) {
      // For COGM, always show even if transactionsByHead is empty (it uses cogm object)
      if (headKey === 'E. COGM' && (!headData || headData.total === 0)) {
        // Use cogm object directly
        data.push([headKey, '', '']);
        if (record.cogm.rawMaterialsInventory > 0) {
          data.push(['    Raw Materials & Inventory', formatAmountFull(-record.cogm.rawMaterialsInventory), formatPercentValue((record.cogm.rawMaterialsInventory / netRevenue) * 100)]);
        }
        if (record.cogm.totalCOGM > 0) {
          data.push(['TOTAL COGM', formatAmountFull(-record.cogm.totalCOGM), formatPercentValue((record.cogm.totalCOGM / netRevenue) * 100)]);
        }
        data.push([]);
      }

      data.push(['═══════════════════════════════════════════════════════', '', '']);
      data.push([margin.label, formatAmountFull(margin.getValue(record)), formatPercentValue(margin.getPercent(record))]);
      data.push(['═══════════════════════════════════════════════════════', '', '']);
      data.push([]);
    }
  }

  // Memo section for excluded/ignored
  if (record.excludedTotal || record.ignoredTotal) {
    data.push([]);
    data.push(['MEMO (Not included in P&L)', '', '']);

    const excludeHead = txnByHead['X. Exclude'];
    if (excludeHead && excludeHead.total > 0) {
      data.push(['X. Exclude (Personal)', '', '']);
      excludeHead.subheads.forEach(subhead => {
        if (subhead.amount > 0) {
          data.push([`    ${subhead.subhead}`, formatAmountFull(subhead.amount), '']);
        }
      });
      data.push(['Total Excluded', formatAmountFull(excludeHead.total), '']);
    }

    const ignoreHead = txnByHead['Z. Ignore'];
    if (ignoreHead && ignoreHead.total > 0) {
      data.push(['Z. Ignore (Non-P&L)', '', '']);
      ignoreHead.subheads.forEach(subhead => {
        if (subhead.amount > 0) {
          data.push([`    ${subhead.subhead}`, formatAmountFull(subhead.amount), '']);
        }
      });
      data.push(['Total Ignored', formatAmountFull(ignoreHead.total), '']);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [50, 18, 15]);

  return ws;
}

// ============================================
// FY DETAILED P&L SHEET (With all subheads month-by-month)
// ============================================

function generateFYDetailedPLSheet(records: MISRecord[], fyLabel: string): XLSX.WorkSheet {
  const data: (string | number)[][] = [];
  const fyStartYear = parseFYLabel(fyLabel);

  addSheetTitle(
    data,
    `${fyLabel} - DETAILED P&L STATEMENT`,
    `April ${fyStartYear} to March ${fyStartYear + 1}`
  );

  // Build FY months data
  const fyMonthsData = FY_MONTHS.map(({ month, label }) => {
    const year = getYearForMonth(fyStartYear, month);
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;
    const record = records.find(r => r.periodKey === periodKey);
    return { month, year, label: `${label} ${year}`, periodKey, record };
  });

  // Calculate FY totals for revenue
  const fyTotals = {
    netRevenue: fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.netRevenue || 0), 0),
    grossRevenue: fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.totalGrossRevenue || 0), 0),
  };

  // Header row
  data.push([
    'Particulars',
    ...fyMonthsData.map(m => m.label),
    'FY Total',
    '% of Rev'
  ]);

  // Collect all unique subheads across all months for each head
  const allSubheadsByHead: Record<string, Set<string>> = {};

  HEAD_ORDER.forEach(headKey => {
    allSubheadsByHead[headKey] = new Set();
    fyMonthsData.forEach(m => {
      if (m.record?.transactionsByHead?.[headKey]) {
        m.record.transactionsByHead[headKey].subheads.forEach(sh => {
          allSubheadsByHead[headKey].add(sh.subhead);
        });
      }
    });
  });

  // ===== A. REVENUE =====
  data.push([]);
  data.push(['A. REVENUE']);

  SALES_CHANNELS.forEach(channel => {
    const row: (string | number)[] = [`    ${channel}`];
    let total = 0;
    fyMonthsData.forEach(m => {
      const amount = m.record?.revenue.grossRevenue[channel] || 0;
      row.push(amount > 0 ? formatAmountFull(amount) : '-');
      total += amount;
    });
    row.push(formatAmountFull(total));
    row.push(fyTotals.netRevenue > 0 ? formatPercentValue((total / fyTotals.netRevenue) * 100) : '-');
    if (total > 0) data.push(row);
  });

  // Gross Revenue total
  const grossRevRow: (string | number)[] = ['GROSS REVENUE'];
  fyMonthsData.forEach(m => {
    grossRevRow.push(m.record ? formatAmountFull(m.record.revenue.totalGrossRevenue) : '-');
  });
  grossRevRow.push(formatAmountFull(fyTotals.grossRevenue));
  grossRevRow.push('');
  data.push(grossRevRow);

  // ===== B. RETURNS =====
  const totalReturns = fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.totalReturns || 0), 0);
  if (totalReturns > 0) {
    data.push([]);
    data.push(['B. RETURNS']);

    SALES_CHANNELS.forEach(channel => {
      const row: (string | number)[] = [`    ${channel} Returns`];
      let total = 0;
      fyMonthsData.forEach(m => {
        const amount = m.record?.revenue.returns[channel] || 0;
        row.push(amount > 0 ? formatAmountFull(-amount) : '-');
        total += amount;
      });
      row.push(formatAmountFull(-total));
      row.push(fyTotals.netRevenue > 0 ? formatPercentValue((total / fyTotals.netRevenue) * 100) : '-');
      if (total > 0) data.push(row);
    });

    const totalReturnsRow: (string | number)[] = ['TOTAL RETURNS'];
    fyMonthsData.forEach(m => {
      totalReturnsRow.push(m.record ? formatAmountFull(-m.record.revenue.totalReturns) : '-');
    });
    totalReturnsRow.push(formatAmountFull(-totalReturns));
    totalReturnsRow.push(formatPercentValue((totalReturns / fyTotals.netRevenue) * 100));
    data.push(totalReturnsRow);
  }

  // ===== D. TAXES =====
  const totalTaxes = fyMonthsData.reduce((sum, m) => sum + (m.record?.revenue.totalTaxes || 0), 0);
  if (totalTaxes > 0) {
    data.push([]);
    data.push(['D. TAXES (GST)']);

    SALES_CHANNELS.forEach(channel => {
      const row: (string | number)[] = [`    ${channel} GST`];
      let total = 0;
      fyMonthsData.forEach(m => {
        const amount = m.record?.revenue.taxes[channel] || 0;
        row.push(amount > 0 ? formatAmountFull(-amount) : '-');
        total += amount;
      });
      row.push(formatAmountFull(-total));
      row.push(fyTotals.netRevenue > 0 ? formatPercentValue((total / fyTotals.netRevenue) * 100) : '-');
      if (total > 0) data.push(row);
    });

    const totalTaxRow: (string | number)[] = ['TOTAL TAXES'];
    fyMonthsData.forEach(m => {
      totalTaxRow.push(m.record ? formatAmountFull(-m.record.revenue.totalTaxes) : '-');
    });
    totalTaxRow.push(formatAmountFull(-totalTaxes));
    totalTaxRow.push(formatPercentValue((totalTaxes / fyTotals.netRevenue) * 100));
    data.push(totalTaxRow);
  }

  // NET REVENUE
  data.push([]);
  data.push(['═══════════════════════════════════════════']);
  const netRevRow: (string | number)[] = ['NET REVENUE'];
  fyMonthsData.forEach(m => {
    netRevRow.push(m.record ? formatAmountFull(m.record.revenue.netRevenue) : '-');
  });
  netRevRow.push(formatAmountFull(fyTotals.netRevenue));
  netRevRow.push('100.00%');
  data.push(netRevRow);
  data.push(['═══════════════════════════════════════════']);

  // ===== E. COGM and other expense heads =====
  const expenseHeads: MISHead[] = ['E. COGM', 'F. Channel & Fulfillment', 'G. Sales & Marketing',
                                    'H. Platform Costs', 'I. Operating Expenses', 'J. Non-Operating'];

  for (const headKey of expenseHeads) {
    const subheads = Array.from(allSubheadsByHead[headKey] || []);

    // Calculate head total across FY
    let headFYTotal = 0;
    fyMonthsData.forEach(m => {
      if (m.record?.transactionsByHead?.[headKey]) {
        headFYTotal += m.record.transactionsByHead[headKey].total;
      }
    });

    // For COGM, also check the cogm object
    if (headKey === 'E. COGM') {
      const cogmTotal = fyMonthsData.reduce((sum, m) => sum + (m.record?.cogm.totalCOGM || 0), 0);
      if (cogmTotal > headFYTotal) headFYTotal = cogmTotal;
    }

    if (headFYTotal > 0 || subheads.length > 0) {
      data.push([]);
      data.push([headKey]);

      // Show each subhead row
      subheads.forEach(subhead => {
        const row: (string | number)[] = [`    ${subhead}`];
        let total = 0;

        fyMonthsData.forEach(m => {
          const headData = m.record?.transactionsByHead?.[headKey];
          const subheadData = headData?.subheads.find(s => s.subhead === subhead);
          const amount = subheadData?.amount || 0;
          row.push(amount > 0 ? formatAmountFull(-amount) : '-');
          total += amount;
        });

        row.push(formatAmountFull(-total));
        row.push(fyTotals.netRevenue > 0 ? formatPercentValue((total / fyTotals.netRevenue) * 100) : '-');
        data.push(row);
      });

      // For COGM with no transactionsByHead data, show from cogm object
      if (headKey === 'E. COGM' && subheads.length === 0) {
        const rawMatTotal = fyMonthsData.reduce((sum, m) => sum + (m.record?.cogm.rawMaterialsInventory || 0), 0);
        if (rawMatTotal > 0) {
          const row: (string | number)[] = ['    Raw Materials & Inventory'];
          fyMonthsData.forEach(m => {
            const amount = m.record?.cogm.rawMaterialsInventory || 0;
            row.push(amount > 0 ? formatAmountFull(-amount) : '-');
          });
          row.push(formatAmountFull(-rawMatTotal));
          row.push(formatPercentValue((rawMatTotal / fyTotals.netRevenue) * 100));
          data.push(row);
        }
      }

      // Head total row
      const headTotalRow: (string | number)[] = [`TOTAL ${headKey.split('. ')[1]?.toUpperCase() || headKey}`];
      let fyHeadTotal = 0;
      fyMonthsData.forEach(m => {
        let headTotal = m.record?.transactionsByHead?.[headKey]?.total || 0;
        // For COGM, use cogm object if transactionsByHead is empty
        if (headKey === 'E. COGM' && headTotal === 0) {
          headTotal = m.record?.cogm.totalCOGM || 0;
        }
        headTotalRow.push(headTotal > 0 ? formatAmountFull(-headTotal) : '-');
        fyHeadTotal += headTotal;
      });
      headTotalRow.push(formatAmountFull(-fyHeadTotal));
      headTotalRow.push(formatPercentValue((fyHeadTotal / fyTotals.netRevenue) * 100));
      data.push(headTotalRow);
    }

    // Add margin after this head
    const margin = MARGIN_AFTER_HEAD[headKey];
    if (margin) {
      data.push([]);
      data.push(['═══════════════════════════════════════════']);
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
      data.push(['═══════════════════════════════════════════']);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [40, ...fyMonthsData.map(() => 12), 14, 10]);

  return ws;
}

// ============================================
// SUMMARY SHEET
// ============================================

function generateSummarySheet(records: MISRecord[]): XLSX.WorkSheet {
  const data: (string | number)[][] = [];

  addSheetTitle(data, 'HEATRONICS - MIS SUMMARY REPORT', 'Key Financial Metrics Overview');

  // Sort records by date (newest first for display, oldest first for columns)
  const sortedRecords = [...records].sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year;
    return a.period.month - b.period.month;
  });

  // Get last 12 months for summary
  const recentRecords = sortedRecords.slice(-12);

  // Header row
  data.push([
    'Metric',
    ...recentRecords.map(r => periodToString(r.period)),
    'Total'
  ]);

  // Revenue
  data.push([]);
  data.push(['REVENUE']);

  const addMetricRow = (label: string, getValue: (r: MISRecord) => number, showTotal = true) => {
    const row: (string | number)[] = [label];
    let total = 0;
    recentRecords.forEach(r => {
      const value = getValue(r);
      row.push(formatAmountFull(value));
      total += value;
    });
    if (showTotal) row.push(formatAmountFull(total));
    else row.push('');
    data.push(row);
  };

  const addPercentRow = (label: string, getPercent: (r: MISRecord) => number) => {
    const row: (string | number)[] = [label];
    recentRecords.forEach(r => {
      row.push(formatPercentValue(getPercent(r)));
    });
    row.push(''); // No total for percentages
    data.push(row);
  };

  addMetricRow('Net Revenue', r => r.revenue.netRevenue);
  addMetricRow('Gross Margin', r => r.grossMargin);
  addPercentRow('Gross Margin %', r => r.grossMarginPercent);
  addMetricRow('CM1', r => r.cm1);
  addPercentRow('CM1 %', r => r.cm1Percent);
  addMetricRow('CM2', r => r.cm2);
  addPercentRow('CM2 %', r => r.cm2Percent);
  addMetricRow('CM3', r => r.cm3);
  addPercentRow('CM3 %', r => r.cm3Percent);
  addMetricRow('EBITDA', r => r.ebitda);
  addPercentRow('EBITDA %', r => r.ebitdaPercent);
  addMetricRow('Net Income', r => r.netIncome);
  addPercentRow('Net Income %', r => r.netIncomePercent);

  const ws = XLSX.utils.aoa_to_sheet(data);
  setColumnWidths(ws, [20, ...recentRecords.map(() => 12), 14]);

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
    'Classified Transactions by Head and Subhead'
  );

  if (!record.transactionsByHead) {
    data.push(['No transaction data available']);
    return XLSX.utils.aoa_to_sheet(data);
  }

  // Headers
  data.push(['Head', 'Subhead', 'Date', 'Account', 'Amount (₹)', 'Type', 'Source']);
  data.push([]);

  // Process each head
  HEAD_ORDER.forEach(headKey => {
    const headData = record.transactionsByHead![headKey];
    if (!headData || headData.transactionCount === 0) return;

    // Head header
    data.push([headKey, '', '', '', formatAmountFull(headData.total), `${headData.transactionCount} txns`, '']);

    // Each subhead
    headData.subheads.forEach(subhead => {
      if (subhead.transactions.length === 0) return;

      // Subhead row
      data.push(['', subhead.subhead, '', '', formatAmountFull(subhead.amount), `${subhead.transactionCount} txns`, subhead.source]);

      // Individual transactions
      subhead.transactions.forEach(txn => {
        data.push([
          '',
          '',
          txn.date,
          txn.account,
          formatAmountFull(txn.amount),
          txn.type,
          txn.source
        ]);
      });
    });

    data.push([]); // Space between heads
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
  }

  // 2. FY Detailed P&L Sheets
  if (options.includeFYSheets && options.selectedFYs.length > 0) {
    for (const fy of options.selectedFYs) {
      const fySheet = generateFYDetailedPLSheet(allRecords, fy);
      const sheetName = fy.replace(/[\/\\?*\[\]]/g, '-').slice(0, 28);
      XLSX.utils.book_append_sheet(workbook, fySheet, sheetName);
      sheetCount++;
    }
  }

  // 3. Monthly Detailed P&L Sheets
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

  // 4. Transaction Sheets
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

  // If no sheets, add placeholder
  if (sheetCount === 0) {
    const placeholder = XLSX.utils.aoa_to_sheet([['No data selected for export']]);
    XLSX.utils.book_append_sheet(workbook, placeholder, 'Info');
  }

  // Generate and save
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

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const filename = `Heatronics_${fyLabel.replace(' ', '_')}_MIS.xlsx`;
  saveAs(blob, filename);
}

export { parseFYLabel };
