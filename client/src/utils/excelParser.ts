import * as XLSX from 'xlsx';
import { Transaction, SalesRegisterData } from '../types';

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Parse number from various formats
function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Remove currency symbols, commas, and spaces
    const cleaned = value.replace(/[₹,\s]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

// Parse date from Excel serial or string
function parseDate(value: unknown): string {
  if (!value) return '';

  if (typeof value === 'number') {
    // Excel serial date
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

export interface JournalParseResult {
  transactions: Transaction[];
  errors: string[];
}

export function parseJournalExcel(file: File): Promise<JournalParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON, skipping first 3 rows
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          blankrows: false
        }) as unknown[][];

        const transactions: Transaction[] = [];
        const errors: string[] = [];

        // Skip first 3 rows (headers)
        // Expected columns: Date, Vch/Bill No, GST Nature, Account, Debit, Credit, Notes
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
            status: 'unclassified'
          });
        }

        resolve({ transactions, errors });
      } catch (error) {
        reject(new Error(`Failed to parse journal file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export interface PurchaseParseResult {
  totalPurchases: number;
  itemCount: number;
  errors: string[];
}

export function parsePurchaseExcel(file: File): Promise<PurchaseParseResult> {
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

        // Skip first 5 rows (headers)
        // Look for "Total" row to get total purchases
        for (let i = 5; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2) continue;

          const firstCol = String(row[0] || '').trim().toLowerCase();

          if (firstCol === 'total' || firstCol === 'grand total') {
            // Total row found - get the amount from appropriate column
            // Usually the total is in a later column (could be index 4, 5, or 6)
            for (let j = row.length - 1; j >= 0; j--) {
              const val = parseNumber(row[j]);
              if (val > 0) {
                totalPurchases = val;
                break;
              }
            }
          } else if (firstCol && !firstCol.includes('particulars') && !firstCol.includes('date')) {
            // Count items
            itemCount++;
            // Sum up purchase amounts from debit column (usually column 4 or 5)
            const amount = parseNumber(row[4]) || parseNumber(row[5]);
            if (amount > 0 && totalPurchases === 0) {
              totalPurchases += amount;
            }
          }
        }

        resolve({ totalPurchases, itemCount, errors });
      } catch (error) {
        reject(new Error(`Failed to parse purchase file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function parseBalanceSheetExcel(file: File): Promise<{
  openingStock: number;
  closingStock: number;
  sales: number;
  netProfit: number;
  errors: string[];
}> {
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
        let sales = 0;
        let netProfit = 0;
        const errors: string[] = [];

        // Search for key terms in the balance sheet
        for (const row of jsonData) {
          if (!row || row.length < 2) continue;

          const text = String(row[0] || '').toLowerCase();

          // Look for specific keywords and extract amounts
          if (text.includes('opening stock') || text.includes('opening inventory')) {
            openingStock = parseNumber(row[1]) || parseNumber(row[2]) || 0;
          } else if (text.includes('closing stock') || text.includes('closing inventory')) {
            closingStock = parseNumber(row[1]) || parseNumber(row[2]) || 0;
          } else if (text.includes('sales') && !text.includes('return')) {
            const amt = parseNumber(row[1]) || parseNumber(row[2]) || 0;
            if (amt > sales) sales = amt;
          } else if (text.includes('net profit') || text.includes('profit for the year')) {
            netProfit = parseNumber(row[1]) || parseNumber(row[2]) || 0;
          }
        }

        resolve({ openingStock, closingStock, sales, netProfit, errors });
      } catch (error) {
        reject(new Error(`Failed to parse balance sheet: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export interface SalesParseResult {
  salesData: SalesRegisterData;
  errors: string[];
}

export function parseSalesExcel(file: File): Promise<SalesParseResult> {
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

        let totalSales = 0;
        let itemCount = 0;
        const salesByChannel: { [key: string]: number } = {};
        const errors: string[] = [];

        // Skip first few rows (headers)
        // Look for "Total" row to get total sales
        for (let i = 3; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 2) continue;

          const firstCol = String(row[0] || '').trim().toLowerCase();

          if (firstCol === 'total' || firstCol === 'grand total') {
            // Total row found - get the amount from appropriate column
            for (let j = row.length - 1; j >= 0; j--) {
              const val = parseNumber(row[j]);
              if (val > 0) {
                totalSales = val;
                break;
              }
            }
          } else if (firstCol && !firstCol.includes('particulars') && !firstCol.includes('date') && !firstCol.includes('invoice')) {
            // Count items and try to categorize by channel
            itemCount++;

            // Try to extract channel from account/party name
            const partyName = String(row[1] || row[0] || '').toLowerCase();
            let channel = 'Other';

            if (partyName.includes('amazon')) {
              channel = 'Amazon';
            } else if (partyName.includes('blinkit') || partyName.includes('grofers')) {
              channel = 'Blinkit';
            } else if (partyName.includes('flipkart')) {
              channel = 'Flipkart';
            } else if (partyName.includes('website') || partyName.includes('shopify') || partyName.includes('d2c')) {
              channel = 'Website/D2C';
            } else if (partyName.includes('offline') || partyName.includes('retail') || partyName.includes('oem')) {
              channel = 'Offline/OEM';
            }

            // Sum up sales amounts from credit column (usually column 5 or 6)
            const amount = parseNumber(row[5]) || parseNumber(row[6]) || parseNumber(row[4]);
            if (amount > 0) {
              salesByChannel[channel] = (salesByChannel[channel] || 0) + amount;
              if (totalSales === 0) {
                totalSales += amount;
              }
            }
          }
        }

        resolve({
          salesData: {
            totalSales,
            itemCount,
            salesByChannel: Object.keys(salesByChannel).length > 0 ? salesByChannel : undefined
          },
          errors
        });
      } catch (error) {
        reject(new Error(`Failed to parse sales file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
