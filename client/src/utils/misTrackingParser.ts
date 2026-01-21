// MIS Tracking - File Parsing Utilities
// Parses Sales Register, Purchase Register, and Balance Sheet
// Note: Expenses are now read directly from Balance Sheet (Trading + P&L)

import * as XLSX from 'xlsx';
import { IndianState } from '../types';
import {
  StateSalesData,
  StateBalanceSheetData,
  SalesLineItemNew,
  SalesChannel,
  ChannelRevenue,
  createEmptyChannelRevenue
} from '../types/misTracking';
import { parseBalanceSheetPDF } from './pdfParser';

// ============================================
// HELPERS
// ============================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols, commas, and spaces
    const cleaned = value.replace(/[₹,\s()]/g, '').trim();
    // Handle negative numbers in parentheses or with minus
    const isNegative = value.includes('(') || cleaned.startsWith('-');
    const num = parseFloat(cleaned.replace('-', ''));
    return isNaN(num) ? 0 : (isNegative ? -num : num);
  }
  return 0;
}

function parseDate(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const day = String(date.d).padStart(2, '0');
      const month = String(date.m).padStart(2, '0');
      const year = date.y;
      return `${day}-${month}-${year}`;
    }
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

// ============================================
// CHANNEL DETECTION
// ============================================

function detectChannel(partyName: string): SalesChannel {
  const name = partyName.toLowerCase();

  // Priority order: Blinkit > Amazon > Website (Shiprocket) > Offline
  if (name.includes('blinkit') || name.includes('grofers') || name.includes('blink commerce')) {
    return 'Blinkit';
  }
  if (name.includes('amazon')) {
    return 'Amazon';
  }
  if (name.includes('shiprocket') || name.includes('ship rocket')) {
    return 'Website';
  }

  // Default: Offline & OEM
  return 'Offline & OEM';
}

// ============================================
// STOCK TRANSFER DETECTION
// ============================================

// Check if this is a stock transfer (contains "heatronics" in any form)
function isStockTransfer(partyName: string): boolean {
  const name = partyName.toLowerCase();
  return name.includes('heatronics');
}

// Detect which state the stock is being transferred to
function detectTransferToState(partyName: string): IndianState | undefined {
  const name = partyName.toLowerCase();

  if (name.includes('maharashtra') || name.includes('mumbai') || name.includes('pune')) {
    return 'Maharashtra';
  }
  if (name.includes('telangana') || name.includes('hyderabad')) {
    return 'Telangana';
  }
  if (name.includes('karnataka') || name.includes('bangalore') || name.includes('bengaluru')) {
    return 'Karnataka';
  }
  if (name.includes('haryana') || name.includes('gurugram') || name.includes('gurgaon')) {
    return 'Haryana';
  }
  if (name.includes('uttar pradesh') || name.includes(' up ') || name.includes('noida') || name.includes('lucknow')) {
    return 'UP';
  }

  return undefined;
}

// ============================================
// SALES REGISTER PARSER
// ============================================

export interface SalesParseResult {
  salesData: StateSalesData;
  errors: string[];
}

export function parseSalesRegister(file: File, sourceState: IndianState): Promise<SalesParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          blankrows: false
        }) as unknown[][];

        // Initialize data structures
        let grossSales = 0;
        let returns = 0;
        let stockTransfers = 0;
        const salesByChannel: ChannelRevenue = createEmptyChannelRevenue();
        const returnsByChannel: ChannelRevenue = createEmptyChannelRevenue();
        const taxesByChannel: ChannelRevenue = createEmptyChannelRevenue();
        let totalTaxes = 0;
        const lineItems: SalesLineItemNew[] = [];
        const errors: string[] = [];

        // Find header row and column indices
        let headerRowIndex = -1;
        let accountColIndex = -1;  // "Account" column contains party name
        let totalAmountColIndex = -1;  // "Total Amount" - the main amount to use
        let saleAmountColIndex = -1;  // "Sale Amount" - alternative
        let igstColIndex = -1;
        let cgstColIndex = -1;
        let sgstColIndex = -1;
        let vchBillColIndex = -1;
        let dateColIndex = -1;

        // Search for header row in first 10 rows
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i];
          if (!row) continue;

          let foundHeader = false;
          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || '').toLowerCase().trim();

            // Account column (contains party names like "AMAZON SALE(CASH SALE) DELHI")
            if (cell === 'account' || cell === 'party' || cell === 'particulars' || cell === 'customer') {
              accountColIndex = j;
              foundHeader = true;
            }
            // Total Amount column - primary amount
            if (cell === 'total amount' || cell === 'total amt' || cell === 'total amt.') {
              totalAmountColIndex = j;
            }
            // Sale Amount column - alternative
            if (cell === 'sale amount' || cell === 'sale amt' || cell === 'sale amt.') {
              saleAmountColIndex = j;
            }
            // Tax columns
            if (cell === 'igst') {
              igstColIndex = j;
            }
            if (cell === 'cgst') {
              cgstColIndex = j;
            }
            if (cell === 'sgst') {
              sgstColIndex = j;
            }
            // Invoice/Bill column
            if (cell === 'vch/bill no' || cell === 'vch no' || cell === 'bill no' || cell === 'invoice') {
              vchBillColIndex = j;
            }
            // Date column
            if (cell === 'date') {
              dateColIndex = j;
            }
          }

          if (foundHeader) {
            headerRowIndex = i;
            break;
          }
        }

        // If we couldn't find headers, try default positions based on your format
        if (headerRowIndex < 0) {
          // Assume first row is header
          headerRowIndex = 0;
          dateColIndex = 0;
          vchBillColIndex = 1;
          accountColIndex = 2;
          totalAmountColIndex = 5;
          saleAmountColIndex = 6;
          igstColIndex = 8;
          cgstColIndex = 9;
          sgstColIndex = 10;
        }

        // Use Total Amount as primary, fall back to Sale Amount
        const amountColIndex = totalAmountColIndex >= 0 ? totalAmountColIndex : saleAmountColIndex;

        console.log('Sales Register Parser - Column indices:', {
          headerRowIndex, accountColIndex, amountColIndex, igstColIndex, cgstColIndex, sgstColIndex
        });

        // Process data rows
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 3) continue;

          // Get the account/party name
          const accountName = String(row[accountColIndex] || '').trim();
          if (!accountName) continue;

          // Skip cancelled entries
          if (accountName.toLowerCase().includes('cancel')) {
            continue;
          }

          // Skip total/summary rows
          const firstCell = String(row[0] || '').trim().toLowerCase();
          if (firstCell === 'total' || firstCell === 'grand total' || firstCell.includes('total')) {
            continue;
          }

          // Get the amount (Total Amount column)
          let amount = amountColIndex >= 0 ? parseNumber(row[amountColIndex]) : 0;

          // If amount is still 0, try searching for a non-zero numeric value
          if (amount === 0) {
            for (let j = 4; j < Math.min(row.length, 12); j++) {
              const val = parseNumber(row[j]);
              if (Math.abs(val) > 100) { // Minimum threshold to avoid picking up small values
                amount = val;
                break;
              }
            }
          }

          // Skip rows with no meaningful amount
          if (amount === 0) continue;

          // Get tax amounts - use actual signed values, don't use Math.abs()
          // Some entries may have negative taxes (adjustments, credit notes)
          const igst = igstColIndex >= 0 ? parseNumber(row[igstColIndex]) : 0;
          const cgst = cgstColIndex >= 0 ? parseNumber(row[cgstColIndex]) : 0;
          const sgst = sgstColIndex >= 0 ? parseNumber(row[sgstColIndex]) : 0;
          const lineTax = igst + cgst + sgst;  // Sum with actual signs

          // Get other fields
          const invoiceNo = vchBillColIndex >= 0 ? String(row[vchBillColIndex] || '') : '';
          const date = dateColIndex >= 0 ? parseDate(row[dateColIndex]) : '';

          // Determine if this is a return (negative amount)
          const isReturn = amount < 0;
          const absAmount = Math.abs(amount);

          // Determine if this is a stock transfer (any "HEATRONICS" in the account name)
          const isTransfer = isStockTransfer(accountName);
          const toState = isTransfer ? detectTransferToState(accountName) : undefined;

          // Detect channel from account name
          const channel: SalesChannel | 'Stock Transfer' = isTransfer ? 'Stock Transfer' : detectChannel(accountName);

          // Create line item
          const lineItem: SalesLineItemNew = {
            id: generateId(),
            date,
            partyName: accountName,
            invoiceNo,
            amount: absAmount,
            taxAmount: lineTax,
            channel,
            isReturn,
            isStockTransfer: isTransfer,
            toState
          };
          lineItems.push(lineItem);

          // Aggregate data based on type
          if (isTransfer) {
            stockTransfers += absAmount;
          } else if (isReturn) {
            returns += absAmount;
            if (channel !== 'Stock Transfer') {
              returnsByChannel[channel] += absAmount;
              // Add taxes for returns too - they will be negative, effectively subtracting
              // from the total. The sign in the data reflects the reversal.
              taxesByChannel[channel] += lineTax;
            }
            totalTaxes += lineTax;
          } else {
            // Regular sale - add both amount and taxes
            grossSales += absAmount;
            if (channel !== 'Stock Transfer') {
              salesByChannel[channel] += absAmount;
              taxesByChannel[channel] += lineTax;
            }
            totalTaxes += lineTax;
          }
        }

        console.log('Sales Register Parser - Results:', {
          grossSales,
          returns,
          stockTransfers,
          totalTaxes,
          salesByChannel,
          lineItemCount: lineItems.length
        });

        resolve({
          salesData: {
            grossSales,
            returns,
            stockTransfers,
            salesByChannel,
            returnsByChannel,
            taxesByChannel,
            totalTaxes,
            lineItems
          },
          errors
        });
      } catch (error) {
        reject(new Error(`Failed to parse sales register: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ============================================
// PURCHASE REGISTER PARSER
// ============================================

export interface PurchaseParseResult {
  totalPurchases: number;
  itemCount: number;
  errors: string[];
}

export function parsePurchaseRegister(file: File): Promise<PurchaseParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          blankrows: false
        }) as unknown[][];

        let totalPurchases = 0;
        let itemCount = 0;
        const errors: string[] = [];

        // Skip first 5 rows (headers typically)
        for (let i = 5; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2) continue;

          const firstCol = String(row[0] || '').trim().toLowerCase();

          if (firstCol === 'total' || firstCol === 'grand total') {
            // Total row found - get the amount from appropriate column
            for (let j = row.length - 1; j >= 0; j--) {
              const val = parseNumber(row[j]);
              if (val > 0) {
                totalPurchases = val;
                break;
              }
            }
          } else if (firstCol && !firstCol.includes('particulars') && !firstCol.includes('date')) {
            itemCount++;
            // Sum up purchase amounts from debit column
            const amount = parseNumber(row[4]) || parseNumber(row[5]);
            if (amount > 0 && totalPurchases === 0) {
              totalPurchases += amount;
            }
          }
        }

        resolve({ totalPurchases, itemCount, errors });
      } catch (error) {
        reject(new Error(`Failed to parse purchase register: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// ============================================
// BALANCE SHEET PARSER
// ============================================

export interface BalanceSheetParseResult {
  data: StateBalanceSheetData;
  errors: string[];
}

export async function parseBalanceSheet(file: File): Promise<BalanceSheetParseResult> {
  const fileName = file.name.toLowerCase();

  // Use PDF parser for PDF files
  if (fileName.endsWith('.pdf')) {
    try {
      const pdfResult = await parseBalanceSheetPDF(file);

      // Calculate net profit/loss (positive for profit, negative for loss)
      let netProfitLoss = 0;
      if (pdfResult.netProfit > 0) {
        netProfitLoss = pdfResult.netProfit;
      } else if (pdfResult.netLoss > 0) {
        netProfitLoss = -pdfResult.netLoss; // Make loss negative
      }

      return {
        data: {
          openingStock: pdfResult.openingStock,
          closingStock: pdfResult.closingStock,
          purchases: pdfResult.purchases,
          grossSales: pdfResult.grossSales,
          netSales: pdfResult.netSales,
          grossProfit: pdfResult.grossProfit,
          netProfitLoss
        },
        errors: pdfResult.errors
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF balance sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Use Excel parser for Excel files
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          blankrows: false
        }) as unknown[][];

        let openingStock = 0;
        let closingStock = 0;
        let purchases = 0;
        let grossSales = 0;
        let netSales = 0;
        let grossProfit = 0;
        let netProfit = 0;
        let netLoss = 0;
        const errors: string[] = [];

        // Search for key terms
        for (const row of jsonData) {
          if (!row || row.length < 2) continue;

          const text = String(row[0] || '').toLowerCase();

          if (text.includes('opening stock') || text.includes('opening inventory') || text.includes('to opening stock')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > openingStock) openingStock = amt;
          } else if (text.includes('closing stock') || text.includes('closing inventory') || text.includes('by closing stock')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > closingStock) closingStock = amt;
          } else if (text.includes('purchase') && !text.includes('return')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > purchases) purchases = amt;
          } else if (text.includes('gross sales') || (text.includes('sales') && text.includes('gross'))) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > grossSales) grossSales = amt;
          } else if (text.includes('net sales') || (text.includes('sales') && text.includes('net'))) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > netSales) netSales = amt;
          } else if (text.includes('by sale') || (text.includes('sales') && !text.includes('return') && !text.includes('tax'))) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > grossSales) grossSales = amt;
          } else if (text.includes('gross profit') || text.includes('to gross profit') || text.includes('by gross profit')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > grossProfit) grossProfit = amt;
          } else if ((text.includes('net profit') || text.includes('by profit')) && !text.includes('loss')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > netProfit) netProfit = amt;
          } else if (text.includes('net loss') || text.includes('nett loss') || text.includes('by nett loss') || text.includes('loss to be adjusted')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > netLoss) netLoss = amt;
          }
        }

        // If net sales not found, use gross sales
        if (netSales === 0) netSales = grossSales;

        // Calculate net profit/loss (positive for profit, negative for loss)
        let netProfitLoss = 0;
        if (netProfit > 0) {
          netProfitLoss = netProfit;
        } else if (netLoss > 0) {
          netProfitLoss = -netLoss; // Make loss negative
        }

        resolve({
          data: {
            openingStock,
            closingStock,
            purchases,
            grossSales,
            netSales,
            grossProfit,
            netProfitLoss
          },
          errors
        });
      } catch (error) {
        reject(new Error(`Failed to parse balance sheet: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
