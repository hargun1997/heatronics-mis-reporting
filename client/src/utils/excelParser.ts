import * as XLSX from 'xlsx';
import { Transaction, SalesRegisterData, IndianState, SalesLineItem } from '../types';

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

// Patterns to identify inter-company transfers to other Heatronics entities
const HEATRONICS_ENTITY_PATTERNS = [
  /heatronics\s*(medical)?\s*(devices)?.*maharashtra/i,
  /heatronics\s*(medical)?\s*(devices)?.*telangana/i,
  /heatronics\s*(medical)?\s*(devices)?.*karnataka/i,
  /heatronics\s*(medical)?\s*(devices)?.*haryana/i,
  /heatronics\s*(medical)?\s*(devices)?.*hyderabad/i,
  /heatronics\s*(medical)?\s*(devices)?.*bangalore/i,
  /heatronics\s*(medical)?\s*(devices)?.*mumbai/i,
  /heatronics\s*(medical)?\s*(devices)?.*pune/i,
  /heatronics\s*(medical)?\s*(devices)?.*gurugram/i,
  /heatronics\s*(medical)?\s*(devices)?.*gurgaon/i,
];

// Map to identify which state an inter-company transfer goes to
function detectInterCompanyState(partyName: string): IndianState | null {
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
  return null;
}

function isInterCompanyTransfer(partyName: string): boolean {
  return HEATRONICS_ENTITY_PATTERNS.some(pattern => pattern.test(partyName));
}

// Categorize party name into channel
// Priority: Blinkit > Amazon > Shiprocket (Website) > Offline/OEM (default)
function categorizeChannel(partyName: string): string {
  const name = partyName.toLowerCase();

  if (name.includes('blinkit') || name.includes('grofers')) {
    return 'Blinkit';
  }
  if (name.includes('amazon')) {
    return 'Amazon';
  }
  if (name.includes('shiprocket')) {
    return 'Website';
  }
  // Default: everything else goes to Offline/OEM
  return 'Offline/OEM';
}

export function parseSalesExcel(file: File, sourceState?: IndianState): Promise<SalesParseResult> {
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

        let grossSales = 0;        // All positive sales
        let returns = 0;           // All negative sales (stored as positive)
        let interCompanyTransfers = 0;  // Sales to other Heatronics entities
        let itemCount = 0;
        const salesByChannel: { [key: string]: number } = {};
        const interCompanyDetails: { toState: IndianState; amount: number }[] = [];
        const lineItems: SalesLineItem[] = [];  // Track individual items for verification
        const errors: string[] = [];

        // Skip first few rows (headers)
        // Expected columns based on Heatronics Sales Register format:
        // 0: Date, 1: Vch/Bill No, 2: Account, 3: TIN/GSTIN No, 4: Type, 5: Total Amount, 6: Sale Amount, 7: Taxable Amt, 8: IGST
        for (let i = 3; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 3) continue;

          const firstCol = String(row[0] || '').trim().toLowerCase();

          // Skip total rows and header-like rows
          if (firstCol === 'total' || firstCol === 'grand total' ||
              firstCol.includes('particulars') || firstCol.includes('date') ||
              firstCol.includes('invoice') || !firstCol) {
            continue;
          }

          itemCount++;

          // Get party/account name from column 2 (Account column)
          const partyName = String(row[2] || row[1] || row[0] || '').trim();

          // Skip if no party name
          if (!partyName) continue;

          // Get amount - prefer Sale Amount (col 6) or Total Amount (col 5)
          let amount = parseNumber(row[6]) || parseNumber(row[5]) || parseNumber(row[4]);

          // Also check for amount in other common positions
          if (amount === 0) {
            for (let j = 3; j < row.length; j++) {
              const val = parseNumber(row[j]);
              if (val !== 0) {
                amount = val;
                break;
              }
            }
          }

          if (amount === 0) continue;

          // Handle negative amounts (returns)
          if (amount < 0) {
            const absAmount = Math.abs(amount);
            returns += absAmount;
            const channel = categorizeChannel(partyName);

            // Track return line item
            lineItems.push({
              id: generateId(),
              partyName,
              amount: absAmount,
              channel,
              isReturn: true,
              isInterCompany: false,
              originalChannel: channel
            });
            continue;
          }

          // Check if this is an inter-company transfer (only for UP state)
          if (sourceState === 'UP' && isInterCompanyTransfer(partyName)) {
            interCompanyTransfers += amount;
            const toState = detectInterCompanyState(partyName);
            if (toState) {
              // Check if we already have an entry for this state
              const existing = interCompanyDetails.find(d => d.toState === toState);
              if (existing) {
                existing.amount += amount;
              } else {
                interCompanyDetails.push({ toState, amount });
              }
            }

            // Track inter-company line item
            lineItems.push({
              id: generateId(),
              partyName,
              amount,
              channel: 'Inter-Company',
              isReturn: false,
              isInterCompany: true,
              toState: toState || undefined,
              originalChannel: 'Inter-Company'
            });
            continue; // Don't add to regular sales
          }

          // Categorize by channel using updated logic
          const channel = categorizeChannel(partyName);

          // Add to gross sales
          grossSales += amount;
          salesByChannel[channel] = (salesByChannel[channel] || 0) + amount;

          // Track sales line item
          lineItems.push({
            id: generateId(),
            partyName,
            amount,
            channel,
            isReturn: false,
            isInterCompany: false,
            originalChannel: channel
          });
        }

        // Net sales = gross sales (returns are NOT subtracted, they go to returns section)
        // Inter-company transfers are also not in gross sales as they were excluded above
        const netSales = grossSales;

        resolve({
          salesData: {
            grossSales,
            returns,
            interCompanyTransfers,
            netSales,
            itemCount,
            salesByChannel: Object.keys(salesByChannel).length > 0 ? salesByChannel : undefined,
            interCompanyDetails: interCompanyDetails.length > 0 ? interCompanyDetails : undefined,
            lineItems: lineItems.length > 0 ? lineItems : undefined
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
