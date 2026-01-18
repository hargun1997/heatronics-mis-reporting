// MIS Tracking - File Parsing Utilities
// Parses Sales Register, Journal, Purchase Register, and Balance Sheet

import * as XLSX from 'xlsx';
import { IndianState, Transaction } from '../types';
import {
  StateSalesData,
  StateBalanceSheetData,
  SalesLineItemNew,
  SalesChannel,
  ChannelRevenue,
  createEmptyChannelRevenue
} from '../types/misTracking';

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
        let partyColIndex = -1;
        let amountColIndex = -1;
        let igstColIndex = -1;
        let cgstColIndex = -1;
        let sgstColIndex = -1;
        let invoiceColIndex = -1;
        let dateColIndex = -1;

        // Search for header row in first 10 rows
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i];
          if (!row) continue;

          for (let j = 0; j < row.length; j++) {
            const cell = String(row[j] || '').toLowerCase().trim();

            if (cell.includes('party') || cell.includes('customer') || cell.includes('particulars')) {
              partyColIndex = j;
              headerRowIndex = i;
            }
            if (cell === 'igst' || cell.includes('igst amount')) {
              igstColIndex = j;
            }
            if (cell === 'cgst' || cell.includes('cgst amount')) {
              cgstColIndex = j;
            }
            if (cell === 'sgst' || cell.includes('sgst amount')) {
              sgstColIndex = j;
            }
            if (cell.includes('total') || cell.includes('amount') || cell.includes('value')) {
              // Take the last "total" or "amount" column as the main amount
              amountColIndex = j;
            }
            if (cell.includes('invoice') || cell.includes('bill')) {
              invoiceColIndex = j;
            }
            if (cell.includes('date')) {
              dateColIndex = j;
            }
          }

          if (partyColIndex >= 0) break;
        }

        // If we couldn't find party column, try default positions
        if (partyColIndex < 0) {
          partyColIndex = 1; // Usually second column
          headerRowIndex = 2; // Usually after 2 header rows
        }
        if (amountColIndex < 0) {
          amountColIndex = 5; // Try common position
        }

        // Process data rows
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2) continue;

          const firstCell = String(row[0] || '').trim().toLowerCase();

          // Skip header-like and total rows
          if (firstCell === 'total' || firstCell === 'grand total' ||
              firstCell.includes('particulars') || firstCell.includes('date') ||
              !firstCell) {
            continue;
          }

          // Get party name
          const partyName = String(row[partyColIndex] || row[0] || '').trim();
          if (!partyName) continue;

          // Get amounts
          let amount = parseNumber(row[amountColIndex]);

          // If amount is 0, search for non-zero value in later columns
          if (amount === 0) {
            for (let j = 3; j < row.length; j++) {
              const val = parseNumber(row[j]);
              if (Math.abs(val) > 0) {
                amount = val;
                break;
              }
            }
          }

          if (amount === 0) continue;

          // Get tax amounts
          const igst = igstColIndex >= 0 ? parseNumber(row[igstColIndex]) : 0;
          const cgst = cgstColIndex >= 0 ? parseNumber(row[cgstColIndex]) : 0;
          const sgst = sgstColIndex >= 0 ? parseNumber(row[sgstColIndex]) : 0;
          const lineTax = Math.abs(igst) + Math.abs(cgst) + Math.abs(sgst);

          // Get other fields
          const invoiceNo = invoiceColIndex >= 0 ? String(row[invoiceColIndex] || '') : '';
          const date = dateColIndex >= 0 ? parseDate(row[dateColIndex]) : '';

          // Determine if return (negative amount)
          const isReturn = amount < 0;
          const absAmount = Math.abs(amount);

          // Determine if stock transfer
          const isTransfer = isStockTransfer(partyName);
          const toState = isTransfer ? detectTransferToState(partyName) : undefined;

          // Detect channel
          const channel: SalesChannel | 'Stock Transfer' = isTransfer ? 'Stock Transfer' : detectChannel(partyName);

          // Create line item
          const lineItem: SalesLineItemNew = {
            id: generateId(),
            date,
            partyName,
            invoiceNo,
            amount: absAmount,
            taxAmount: lineTax,
            channel,
            isReturn,
            isStockTransfer: isTransfer,
            toState
          };
          lineItems.push(lineItem);

          // Aggregate data
          if (isTransfer) {
            stockTransfers += absAmount;
          } else if (isReturn) {
            returns += absAmount;
            if (channel !== 'Stock Transfer') {
              returnsByChannel[channel] += absAmount;
              taxesByChannel[channel] += lineTax;
            }
          } else {
            grossSales += absAmount;
            if (channel !== 'Stock Transfer') {
              salesByChannel[channel] += absAmount;
              taxesByChannel[channel] += lineTax;
            }
          }

          totalTaxes += lineTax;
        }

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
// JOURNAL PARSER
// ============================================

export interface JournalParseResult {
  transactions: Transaction[];
  errors: string[];
}

export function parseJournal(file: File, state: IndianState): Promise<JournalParseResult> {
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

        const transactions: Transaction[] = [];
        const errors: string[] = [];

        // Skip first 3 rows (headers)
        let lastDate = '';
        let lastVchNo = '';

        for (let i = 3; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 4) continue;

          // Skip total rows and empty account names
          const account = String(row[3] || '').trim();
          if (!account || account.toLowerCase() === 'total' || account.toLowerCase() === 'grand total') {
            continue;
          }

          // Handle multi-line entries (rows with null Date = continuation)
          const dateVal = row[0];
          const date = dateVal ? parseDate(dateVal) : lastDate;
          if (dateVal) lastDate = date;

          const vchBillNo = row[1] ? String(row[1]).trim() : lastVchNo;
          if (row[1]) lastVchNo = vchBillNo;

          const gstNature = String(row[2] || '').trim();
          const debit = parseNumber(row[4]);
          const credit = parseNumber(row[5]);
          const notes = String(row[6] || '').trim();

          // Skip rows where both debit and credit are 0
          if (debit === 0 && credit === 0) continue;

          transactions.push({
            id: generateId(),
            date,
            vchBillNo,
            gstNature,
            account,
            debit,
            credit,
            notes,
            status: 'unclassified',
            state
          });
        }

        resolve({ transactions, errors });
      } catch (error) {
        reject(new Error(`Failed to parse journal: ${error instanceof Error ? error.message : 'Unknown error'}`));
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

export function parseBalanceSheet(file: File): Promise<BalanceSheetParseResult> {
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
        const errors: string[] = [];

        // Search for key terms
        for (const row of jsonData) {
          if (!row || row.length < 2) continue;

          const text = String(row[0] || '').toLowerCase();

          if (text.includes('opening stock') || text.includes('opening inventory')) {
            openingStock = parseNumber(row[1]) || parseNumber(row[2]) || 0;
          } else if (text.includes('closing stock') || text.includes('closing inventory')) {
            closingStock = parseNumber(row[1]) || parseNumber(row[2]) || 0;
          } else if (text.includes('purchase') && !text.includes('return')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > purchases) purchases = amt;
          } else if (text.includes('gross sales') || (text.includes('sales') && text.includes('gross'))) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > grossSales) grossSales = amt;
          } else if (text.includes('net sales') || (text.includes('sales') && text.includes('net'))) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > netSales) netSales = amt;
          } else if (text.includes('sales') && !text.includes('return') && !text.includes('tax')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > grossSales) grossSales = amt;
          }
        }

        // If net sales not found, use gross sales
        if (netSales === 0) netSales = grossSales;

        resolve({
          data: {
            openingStock,
            closingStock,
            purchases,
            grossSales,
            netSales
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
