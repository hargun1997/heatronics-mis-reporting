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

  return [
    ['P&L MIS REPORT', '', ''],
    ['Generated on:', new Date().toLocaleDateString('en-IN'), ''],
    ['', '', ''],
    ['', 'Amount (₹)', '% of Net Revenue'],
    ['', '', ''],
    ['A. GROSS REVENUE (With GST)', report.grossRevenue, ''],
    ...Object.entries(report.revenueByChannel)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ['   ' + k, v, formatPercentage(v, report.grossRevenue)]),
    ['', '', ''],
    ['B. LESS: RETURNS', -report.returns, formatPercentage(report.returns, report.grossRevenue)],
    ['C. LESS: DISCOUNTS', -report.discounts, formatPercentage(report.discounts, report.grossRevenue)],
    ['D. LESS: TAXES (GST)', -report.taxes, formatPercentage(report.taxes, report.grossRevenue)],
    ['', '', ''],
    ['NET REVENUE', report.netRevenue, '100.0%'],
    ['', '', ''],
    ['E. COST OF GOODS MANUFACTURED (COGM)', -report.cogm, formatPercentage(report.cogm, netRevenue)],
    ...Object.entries(report.cogmBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ['   ' + k, -v, formatPercentage(v, netRevenue)]),
    ['', '', ''],
    ['GROSS MARGIN', report.grossMargin, formatPercentage(report.grossMargin, netRevenue)],
    ['', '', ''],
    ['F. CHANNEL & FULFILLMENT', -report.channelCosts, formatPercentage(report.channelCosts, netRevenue)],
    ...Object.entries(report.channelCostsBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ['   ' + k, -v, formatPercentage(v, netRevenue)]),
    ['', '', ''],
    ['CM1 (Contribution Margin 1)', report.cm1, formatPercentage(report.cm1, netRevenue)],
    ['', '', ''],
    ['G. SALES & MARKETING', -report.marketing, formatPercentage(report.marketing, netRevenue)],
    ...Object.entries(report.marketingBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ['   ' + k, -v, formatPercentage(v, netRevenue)]),
    ['', '', ''],
    ['CM2 (After Marketing)', report.cm2, formatPercentage(report.cm2, netRevenue)],
    ['', '', ''],
    ['H. PLATFORM COSTS', -report.platform, formatPercentage(report.platform, netRevenue)],
    ...Object.entries(report.platformBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ['   ' + k, -v, formatPercentage(v, netRevenue)]),
    ['', '', ''],
    ['CM3 (After Platform)', report.cm3, formatPercentage(report.cm3, netRevenue)],
    ['', '', ''],
    ['I. OPERATING EXPENSES', -report.operating, formatPercentage(report.operating, netRevenue)],
    ...Object.entries(report.operatingBreakdown)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ['   ' + k, -v, formatPercentage(v, netRevenue)]),
    ['', '', ''],
    ['EBITDA', report.ebitda, formatPercentage(report.ebitda, netRevenue)],
    ['', '', ''],
    ['J. NON-OPERATING', -report.nonOperating, formatPercentage(report.nonOperating, netRevenue)],
    ['', '', ''],
    ['NET INCOME', report.netIncome, formatPercentage(report.netIncome, netRevenue)],
    ['', '', ''],
    ['', '', ''],
    ['MEMO:', '', ''],
    ['Excluded (Personal)', report.excluded, ''],
    ['Ignored (Non-P&L)', report.ignored, '']
  ];
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

  let text = `
╔════════════════════════════════════════════════════════════════╗
║                       P&L MIS REPORT                           ║
╠════════════════════════════════════════════════════════════════╣

A. TOTAL REVENUE (With GST)
`;

  for (const [channel, amount] of Object.entries(report.revenueByChannel)) {
    if (amount > 0) {
      text += `   ${channel.padEnd(25)} ${formatCurrencyFull(amount).padStart(15)}  ${formatPercentage(amount, report.grossRevenue).padStart(6)}\n`;
    }
  }

  text += `   ─────────────────────────────────────────────────────
   GROSS REVENUE             ${formatCurrencyFull(report.grossRevenue).padStart(15)}

B. LESS: RETURNS             (${formatCurrencyFull(report.returns).padStart(14)})
C. LESS: DISCOUNTS           (${formatCurrencyFull(report.discounts).padStart(14)})
D. LESS: TAXES (GST)         (${formatCurrencyFull(report.taxes).padStart(14)})
   ─────────────────────────────────────────────────────
   NET REVENUE               ${formatCurrencyFull(report.netRevenue).padStart(15)}  100.0%

E. COST OF GOODS MANUFACTURED (COGM)
`;

  for (const [item, amount] of Object.entries(report.cogmBreakdown)) {
    if (amount > 0) {
      text += `   ${item.padEnd(25)} ${formatCurrencyFull(amount).padStart(15)}\n`;
    }
  }

  text += `   ─────────────────────────────────────────────────────
   TOTAL COGM               (${formatCurrencyFull(report.cogm).padStart(14)})  ${formatPercentage(report.cogm, netRevenue).padStart(6)}

   GROSS MARGIN              ${formatCurrencyFull(report.grossMargin).padStart(15)}  ${formatPercentage(report.grossMargin, netRevenue).padStart(6)}

F. CHANNEL & FULFILLMENT    (${formatCurrencyFull(report.channelCosts).padStart(14)})  ${formatPercentage(report.channelCosts, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   CM1 (Contribution)        ${formatCurrencyFull(report.cm1).padStart(15)}  ${formatPercentage(report.cm1, netRevenue).padStart(6)}

G. SALES & MARKETING        (${formatCurrencyFull(report.marketing).padStart(14)})  ${formatPercentage(report.marketing, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   CM2 (After Marketing)     ${formatCurrencyFull(report.cm2).padStart(15)}  ${formatPercentage(report.cm2, netRevenue).padStart(6)}

H. PLATFORM COSTS           (${formatCurrencyFull(report.platform).padStart(14)})  ${formatPercentage(report.platform, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   CM3 (After Platform)      ${formatCurrencyFull(report.cm3).padStart(15)}  ${formatPercentage(report.cm3, netRevenue).padStart(6)}

I. OPERATING EXPENSES       (${formatCurrencyFull(report.operating).padStart(14)})  ${formatPercentage(report.operating, netRevenue).padStart(6)}
   ─────────────────────────────────────────────────────
   EBITDA                    ${formatCurrencyFull(report.ebitda).padStart(15)}  ${formatPercentage(report.ebitda, netRevenue).padStart(6)}

J. NON-OPERATING            (${formatCurrencyFull(report.nonOperating).padStart(14)})
   ─────────────────────────────────────────────────────
   NET INCOME                ${formatCurrencyFull(report.netIncome).padStart(15)}  ${formatPercentage(report.netIncome, netRevenue).padStart(6)}

╚════════════════════════════════════════════════════════════════╝
`;

  return text;
}
