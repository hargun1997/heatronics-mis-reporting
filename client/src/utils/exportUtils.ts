import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';
import { Transaction, MISReport, Heads } from '../types';
import { formatCurrencyFull, formatPercentage } from './cogsCalculator';

export async function exportToExcel(
  transactions: Transaction[],
  misReport: MISReport,
  heads: Heads,
  filename: string = 'MIS_Report'
): Promise<void> {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: P&L Summary
  const plData = generatePLSheetData(misReport);
  const plSheet = XLSX.utils.aoa_to_sheet(plData);
  XLSX.utils.book_append_sheet(workbook, plSheet, 'P&L Summary');

  // Sheet 2: All Transactions with Classifications
  const txnData = generateTransactionsSheetData(transactions);
  const txnSheet = XLSX.utils.aoa_to_sheet(txnData);
  XLSX.utils.book_append_sheet(workbook, txnSheet, 'Classified Transactions');

  // Sheet 3: Breakdown by Head
  const breakdownData = generateBreakdownSheetData(transactions, heads);
  const breakdownSheet = XLSX.utils.aoa_to_sheet(breakdownData);
  XLSX.utils.book_append_sheet(workbook, breakdownSheet, 'Head Breakdown');

  // Generate file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function generatePLSheetData(report: MISReport): (string | number)[][] {
  const netRevenue = report.netRevenue || 1; // Prevent division by zero
  const hasBSData = report.bsNetSales > 0;

  const data: (string | number)[][] = [
    ['P&L MIS REPORT', '', ''],
    ['Generated on:', new Date().toLocaleDateString('en-IN'), ''],
    ['Data Source:', hasBSData ? 'Balance Sheet (Authoritative)' : 'Journal Classifications', ''],
    ['', '', ''],
    ['', 'Amount (₹)', '% of Net Revenue'],
    ['', '', ''],
  ];

  // Revenue Section
  if (hasBSData) {
    data.push(
      ['A. NET REVENUE (From Balance Sheet)', '', ''],
      ['   Net Sales', report.bsNetSales, '100.0%'],
      ['', '', '']
    );
    if (report.bsGrossSales > 0 && report.bsGrossSales !== report.bsNetSales) {
      data.push(['   (Gross Sales before discounts/GST)', report.bsGrossSales, '']);
    }
  } else {
    data.push(['A. NET REVENUE (From Journal)', '', '']);
  }

  // Show journal revenue breakdown for reference
  if (report.journalRevenue > 0) {
    data.push(
      ['', '', ''],
      ['   Journal Revenue Breakdown (Reference):', '', ''],
      ...Object.entries(report.revenueByChannel)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ['      ' + k, v, formatPercentage(v, report.journalRevenue)] as (string | number)[])
    );
    if (report.journalReturns > 0) data.push(['      Less: Returns', -report.journalReturns, '']);
    if (report.journalDiscounts > 0) data.push(['      Less: Discounts', -report.journalDiscounts, '']);
    if (report.journalTaxes > 0) data.push(['      Less: Taxes (GST)', -report.journalTaxes, '']);
    data.push(['      Journal Net Revenue', report.journalNetRevenue, '']);
  }

  data.push(
    ['', '', ''],
    ['NET REVENUE (Used for P&L)', report.netRevenue, '100.0%'],
    ['', '', '']
  );

  // COGS Section
  data.push(['B. COST OF GOODS SOLD (COGS)', '', '']);
  if (hasBSData && report.bsCOGS > 0) {
    data.push(
      ['   Opening Stock (from BS)', report.bsOpeningStock, ''],
      ['   Add: Purchases (from BS)', report.bsPurchases, ''],
      ['   Less: Closing Stock (from BS)', -report.bsClosingStock, '']
    );
  }
  data.push(
    ['   ─────────────────────────────────────────────────────', '', ''],
    ['   TOTAL COGS', -report.cogm, formatPercentage(report.cogm, netRevenue)],
    ['', '', ''],
    ['GROSS MARGIN', report.grossMargin, formatPercentage(report.grossMargin, netRevenue)],
    ['', '', '']
  );

  // Purchase Register Validation
  if (report.purchaseRegisterTotal > 0 && report.bsPurchases > 0) {
    data.push(
      ['PURCHASE REGISTER VALIDATION', '', ''],
      ['   BS Purchases', report.bsPurchases, ''],
      ['   Purchase Register Total', report.purchaseRegisterTotal, ''],
      ['   Variance', report.purchaseVariance, ''],
      ['', '', '']
    );
  }

  // Expense sections from Journal
  data.push(['C. CHANNEL & FULFILLMENT (From Journal)', -report.channelCosts, formatPercentage(report.channelCosts, netRevenue)]);
  for (const [k, v] of Object.entries(report.channelCostsBreakdown)) {
    if (v > 0) data.push(['   ' + k, -v, formatPercentage(v, netRevenue)]);
  }
  data.push(
    ['', '', ''],
    ['CM1 (Contribution Margin 1)', report.cm1, formatPercentage(report.cm1, netRevenue)],
    ['', '', '']
  );

  data.push(['D. SALES & MARKETING (From Journal)', -report.marketing, formatPercentage(report.marketing, netRevenue)]);
  for (const [k, v] of Object.entries(report.marketingBreakdown)) {
    if (v > 0) data.push(['   ' + k, -v, formatPercentage(v, netRevenue)]);
  }
  data.push(
    ['', '', ''],
    ['CM2 (After Marketing)', report.cm2, formatPercentage(report.cm2, netRevenue)],
    ['', '', '']
  );

  data.push(['E. PLATFORM COSTS (From Journal)', -report.platform, formatPercentage(report.platform, netRevenue)]);
  for (const [k, v] of Object.entries(report.platformBreakdown)) {
    if (v > 0) data.push(['   ' + k, -v, formatPercentage(v, netRevenue)]);
  }
  data.push(
    ['', '', ''],
    ['CM3 (After Platform)', report.cm3, formatPercentage(report.cm3, netRevenue)],
    ['', '', '']
  );

  data.push(['F. OPERATING EXPENSES (From Journal)', -report.operating, formatPercentage(report.operating, netRevenue)]);
  for (const [k, v] of Object.entries(report.operatingBreakdown)) {
    if (v > 0) data.push(['   ' + k, -v, formatPercentage(v, netRevenue)]);
  }
  data.push(
    ['', '', ''],
    ['EBITDA', report.ebitda, formatPercentage(report.ebitda, netRevenue)],
    ['', '', '']
  );

  data.push(
    ['G. NON-OPERATING', -report.nonOperating, formatPercentage(report.nonOperating, netRevenue)],
    ['', '', ''],
    ['NET INCOME', report.netIncome, formatPercentage(report.netIncome, netRevenue)],
    ['', '', ''],
    ['', '', ''],
    ['MEMO:', '', ''],
    ['Excluded (Personal)', report.excluded, ''],
    ['Ignored (Non-P&L)', report.ignored, '']
  );

  // Reconciliation section
  if (hasBSData) {
    data.push(
      ['', '', ''],
      ['RECONCILIATION:', '', ''],
      ['BS Net Sales vs Calculated Net Revenue', '', ''],
      ['   Variance', report.revenueVariance, ''],
      ['BS Net Profit (Reference)', report.bsNetProfit, ''],
      ['   Profit Variance', report.profitVariance, '']
    );
  }

  return data;
}

function generateTransactionsSheetData(transactions: Transaction[]): (string | number)[][] {
  const headers = ['Date', 'Vch/Bill No', 'GST Nature', 'Account', 'Debit', 'Credit', 'Notes', 'Head', 'Subhead', 'Status'];

  const rows = transactions.map(txn => [
    txn.date,
    txn.vchBillNo,
    txn.gstNature,
    txn.account,
    txn.debit,
    txn.credit,
    txn.notes,
    txn.head || '',
    txn.subhead || '',
    txn.status
  ]);

  return [headers, ...rows];
}

function generateBreakdownSheetData(transactions: Transaction[], heads: Heads): (string | number)[][] {
  const data: (string | number)[][] = [
    ['HEAD BREAKDOWN SUMMARY'],
    [''],
    ['Head', 'Subhead', 'Debit Total', 'Credit Total', 'Net', 'Count']
  ];

  const summary = new Map<string, { debit: number; credit: number; count: number }>();

  for (const txn of transactions) {
    if (!txn.head || !txn.subhead) continue;
    const key = `${txn.head}||${txn.subhead}`;
    if (!summary.has(key)) {
      summary.set(key, { debit: 0, credit: 0, count: 0 });
    }
    const s = summary.get(key)!;
    s.debit += txn.debit;
    s.credit += txn.credit;
    s.count += 1;
  }

  // Sort by head order
  const headOrder = Object.keys(heads);
  const sortedEntries = Array.from(summary.entries()).sort((a, b) => {
    const [headA] = a[0].split('||');
    const [headB] = b[0].split('||');
    const idxA = headOrder.indexOf(headA);
    const idxB = headOrder.indexOf(headB);
    if (idxA !== idxB) return idxA - idxB;
    return a[0].localeCompare(b[0]);
  });

  for (const [key, vals] of sortedEntries) {
    const [head, subhead] = key.split('||');
    data.push([head, subhead, vals.debit, vals.credit, vals.credit - vals.debit, vals.count]);
  }

  return data;
}

export async function exportToImage(
  elementId: string,
  filename: string = 'MIS_Report'
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Element not found for export');
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false
  });

  canvas.toBlob((blob) => {
    if (blob) {
      saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.png`);
    }
  }, 'image/png');
}

export function exportMISAsText(report: MISReport): string {
  const netRevenue = report.netRevenue || 1;
  const hasBSData = report.bsNetSales > 0;
  const sourceLabel = hasBSData ? 'Revenue & COGS from Balance Sheet' : 'All data from Journal';
  const revenueSource = hasBSData ? '(From Balance Sheet)' : '(From Journal)';

  let text = `
╔════════════════════════════════════════════════════════════════╗
║                       P&L MIS REPORT                           ║
║  ${sourceLabel.padEnd(60)}║
╠════════════════════════════════════════════════════════════════╣

A. NET REVENUE ${revenueSource}
`;

  text += `   Net Revenue               ${formatCurrencyFull(report.netRevenue).padStart(15)}  100.0%

B. COST OF GOODS SOLD
`;

  if (hasBSData) {
    text += `   Opening Stock             ${formatCurrencyFull(report.bsOpeningStock).padStart(15)}
   Add: Purchases            ${formatCurrencyFull(report.bsPurchases).padStart(15)}
   Less: Closing Stock      (${formatCurrencyFull(report.bsClosingStock).padStart(14)})
`;
  }

  text += `   ─────────────────────────────────────────────────────
   TOTAL COGS               (${formatCurrencyFull(report.cogm).padStart(14)})  ${formatPercentage(report.cogm, netRevenue).padStart(6)}

   GROSS MARGIN              ${formatCurrencyFull(report.grossMargin).padStart(15)}  ${formatPercentage(report.grossMargin, netRevenue).padStart(6)}

C. CHANNEL & FULFILLMENT    (${formatCurrencyFull(report.channelCosts).padStart(14)})  ${formatPercentage(report.channelCosts, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   CM1 (Contribution)        ${formatCurrencyFull(report.cm1).padStart(15)}  ${formatPercentage(report.cm1, netRevenue).padStart(6)}

D. SALES & MARKETING        (${formatCurrencyFull(report.marketing).padStart(14)})  ${formatPercentage(report.marketing, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   CM2 (After Marketing)     ${formatCurrencyFull(report.cm2).padStart(15)}  ${formatPercentage(report.cm2, netRevenue).padStart(6)}

E. PLATFORM COSTS           (${formatCurrencyFull(report.platform).padStart(14)})  ${formatPercentage(report.platform, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   CM3 (After Platform)      ${formatCurrencyFull(report.cm3).padStart(15)}  ${formatPercentage(report.cm3, netRevenue).padStart(6)}

F. OPERATING EXPENSES       (${formatCurrencyFull(report.operating).padStart(14)})  ${formatPercentage(report.operating, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   EBITDA                    ${formatCurrencyFull(report.ebitda).padStart(15)}  ${formatPercentage(report.ebitda, netRevenue).padStart(6)}

G. NON-OPERATING            (${formatCurrencyFull(report.nonOperating).padStart(14)})
   ─────────────────────────────────────────────────────
   NET INCOME                ${formatCurrencyFull(report.netIncome).padStart(15)}  ${formatPercentage(report.netIncome, netRevenue).padStart(6)}

╚════════════════════════════════════════════════════════════════╝
`;

  return text;
}
