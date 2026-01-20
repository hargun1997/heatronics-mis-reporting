import * as XLSX from 'xlsx';
import { Transaction, SalesRegisterData, IndianState, SalesLineItem } from '../types';

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Parse number from various formats
// Round to 2 decimal places to avoid floating point precision issues
function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  let num = 0;
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    // Remove currency symbols, commas, and spaces
    const cleaned = value.replace(/[₹,\s]/g, '').trim();
    num = parseFloat(cleaned);
    if (isNaN(num)) return 0;
  }
  // Round to 2 decimal places to prevent floating point accumulation errors
  return Math.round(num * 100) / 100;
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

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          blankrows: false
        }) as unknown[][];

        const transactions: Transaction[] = [];
        const errors: string[] = [];

        // Dynamically detect column positions from header row
        // Search first 5 rows for header row containing column names
        let headerRowIndex = -1;
        let dateCol = -1;
        let voucherCol = -1;
        let gstCol = -1;
        let accountCol = -1;
        let debitCol = -1;
        let creditCol = -1;
        let notesCol = -1;

        for (let i = 0; i < Math.min(5, jsonData.length); i++) {
          const row = jsonData[i];
          if (!row) continue;

          // Check if this row contains header keywords
          const rowStr = row.map(cell => String(cell || '').toLowerCase()).join(' ');
          if (rowStr.includes('debit') || rowStr.includes('credit') || rowStr.includes('account')) {
            headerRowIndex = i;

            // Detect column positions
            for (let j = 0; j < row.length; j++) {
              const header = String(row[j] || '').toLowerCase().trim();

              if (header.includes('date') && dateCol < 0) dateCol = j;
              if ((header.includes('voucher') || header.includes('vch') || header.includes('bill no')) && voucherCol < 0) voucherCol = j;
              if (header.includes('gst') && !header.includes('cgst') && !header.includes('sgst') && !header.includes('igst') && gstCol < 0) gstCol = j;
              if ((header.includes('particulars') || header.includes('account') || header.includes('ledger') || header === 'name') && accountCol < 0) accountCol = j;
              if (header.includes('debit') && debitCol < 0) debitCol = j;
              if (header.includes('credit') && creditCol < 0) creditCol = j;
              if ((header.includes('notes') || header.includes('narration') || header.includes('remarks')) && notesCol < 0) notesCol = j;
            }
            break;
          }
        }

        // If no header found, use default positions (legacy behavior)
        if (headerRowIndex < 0) {
          headerRowIndex = 2; // Assume 3 header rows (0, 1, 2)
          dateCol = 0;
          voucherCol = 1;
          gstCol = 2;
          accountCol = 3;
          debitCol = 4;
          creditCol = 5;
          notesCol = 6;
        }

        // Validate critical columns were found
        if (accountCol < 0) {
          // Fallback: account is usually after gst or voucher column
          accountCol = Math.max(gstCol, voucherCol, 0) + 1;
        }
        if (debitCol < 0) {
          // Fallback: debit is usually after account
          debitCol = accountCol + 1;
        }
        if (creditCol < 0) {
          // Fallback: credit is usually after debit
          creditCol = debitCol + 1;
        }

        console.log('Journal Excel Parser - Detected columns:', {
          headerRowIndex,
          dateCol,
          voucherCol,
          gstCol,
          accountCol,
          debitCol,
          creditCol,
          notesCol
        });

        // Parse data rows starting after header
        const startRow = headerRowIndex + 1;
        let lastDate = '';
        let lastVchNo = '';

        for (let i = startRow; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length < 3) continue;

          // Get account name from detected column
          const account = String(row[accountCol] || '').trim();

          // Skip total rows and empty account names
          if (!account || account.toLowerCase() === 'total' || account.toLowerCase() === 'grand total') {
            continue;
          }

          // Skip rows where account looks like a number (likely misaligned data)
          if (/^[\d,.\s-]+$/.test(account)) {
            continue;
          }

          // Handle multi-line entries (rows with null Date = continuation)
          const dateVal = dateCol >= 0 ? row[dateCol] : undefined;
          const date = dateVal ? parseDate(dateVal) : lastDate;
          if (dateVal) lastDate = date;

          const vchBillNo = voucherCol >= 0 && row[voucherCol] ? String(row[voucherCol]).trim() : lastVchNo;
          if (voucherCol >= 0 && row[voucherCol]) lastVchNo = vchBillNo;

          const gstNature = gstCol >= 0 ? String(row[gstCol] || '').trim() : '';
          const debit = parseNumber(row[debitCol]);
          const credit = parseNumber(row[creditCol]);
          const notes = notesCol >= 0 ? String(row[notesCol] || '').trim() : '';

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

        console.log(`Journal Excel Parser - Parsed ${transactions.length} transactions`);
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

// Check if party name is an inter-company transfer (any Heatronics entity)
function isInterCompanyTransfer(partyName: string): boolean {
  return partyName.toLowerCase().includes('heatronics');
}

// Map to identify which state an inter-company transfer goes to (optional)
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
        let totalTaxes = 0;        // Sum of all IGST + CGST + SGST
        let itemCount = 0;
        const salesByChannel: { [key: string]: number } = {};
        const interCompanyDetails: { toState: IndianState; amount: number }[] = [];
        const lineItems: SalesLineItem[] = [];  // Track individual items for verification
        const errors: string[] = [];

        // Scan header rows to find tax column indices
        // Check first 3 rows for headers
        let igstCol = -1;
        let cgstCol = -1;
        let sgstCol = -1;

        for (let headerRow = 0; headerRow < Math.min(3, jsonData.length); headerRow++) {
          const row = jsonData[headerRow];
          if (!row) continue;

          for (let col = 0; col < row.length; col++) {
            const cellValue = String(row[col] || '').toLowerCase().trim();
            if (cellValue.includes('igst') && !cellValue.includes('cgst') && !cellValue.includes('sgst')) {
              igstCol = col;
            } else if (cellValue.includes('cgst')) {
              cgstCol = col;
            } else if (cellValue.includes('sgst')) {
              sgstCol = col;
            }
          }
        }

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

          // Skip if party name looks like a number (likely a total row)
          const partyNameLower = partyName.toLowerCase();
          if (/^[\d,.\s]+$/.test(partyName) ||
              partyNameLower.includes('total') ||
              partyNameLower.includes('grand')) {
            continue;
          }

          // Get amount from Total Amount (col 5) which includes tax
          // Skip row if Total Amount is missing or 0
          const amount = parseNumber(row[5]);
          if (amount === 0) continue;

          // Extract tax values for this row
          const igst = igstCol >= 0 ? Math.abs(parseNumber(row[igstCol])) : 0;
          const cgst = cgstCol >= 0 ? Math.abs(parseNumber(row[cgstCol])) : 0;
          const sgst = sgstCol >= 0 ? Math.abs(parseNumber(row[sgstCol])) : 0;
          const lineTax = igst + cgst + sgst;

          // Handle negative amounts (returns)
          if (amount < 0) {
            const absAmount = Math.abs(amount);
            returns += absAmount;
            const channel = categorizeChannel(partyName);

            // For returns, taxes are also negative (credit), so we still track them
            totalTaxes += lineTax;

            // Track return line item
            lineItems.push({
              id: generateId(),
              partyName,
              amount: absAmount,
              channel,
              isReturn: true,
              isInterCompany: false,
              originalChannel: channel,
              igst,
              cgst,
              sgst,
              totalTax: lineTax
            });
            continue;
          }

          // Check if this is an inter-company transfer (any state selling to another Heatronics entity)
          if (isInterCompanyTransfer(partyName)) {
            interCompanyTransfers += amount;
            totalTaxes += lineTax;
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
              originalChannel: 'Inter-Company',
              igst,
              cgst,
              sgst,
              totalTax: lineTax
            });
            continue; // Don't add to regular sales
          }

          // Categorize by channel using updated logic
          const channel = categorizeChannel(partyName);

          // Add to gross sales and taxes
          grossSales += amount;
          totalTaxes += lineTax;
          salesByChannel[channel] = (salesByChannel[channel] || 0) + amount;

          // Track sales line item
          lineItems.push({
            id: generateId(),
            partyName,
            amount,
            channel,
            isReturn: false,
            isInterCompany: false,
            originalChannel: channel,
            igst,
            cgst,
            sgst,
            totalTax: lineTax
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
            totalTaxes,
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
