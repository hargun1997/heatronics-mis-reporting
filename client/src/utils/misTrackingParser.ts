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

        console.log('Journal Parser - Detected columns:', {
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
        // First pass: collect all entries grouped by voucher
        const startRow = headerRowIndex + 1;
        let lastDate = '';
        let lastVchNo = '';

        interface RawEntry {
          date: string;
          vchBillNo: string;
          gstNature: string;
          account: string;
          debit: number;
          credit: number;
          notes: string;
        }

        const entriesByVoucher: Map<string, RawEntry[]> = new Map();

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

          const entry: RawEntry = { date, vchBillNo, gstNature, account, debit, credit, notes };

          // Group by voucher number
          // For entries without voucher numbers, detect voucher boundaries:
          // A new voucher starts when we see a DEBIT entry after CREDIT entries
          if (vchBillNo) {
            // Has voucher number - use it as group key
            if (!entriesByVoucher.has(vchBillNo)) {
              entriesByVoucher.set(vchBillNo, []);
            }
            entriesByVoucher.get(vchBillNo)!.push(entry);
          } else {
            // No voucher number - need to detect voucher boundaries
            // Use a special tracking key for the current date
            const trackKey = `__track__${date}`;
            if (!entriesByVoucher.has(trackKey)) {
              entriesByVoucher.set(trackKey, [{ _voucherIdx: 0, _lastWasCredit: false } as any]);
            }
            const tracker = entriesByVoucher.get(trackKey)![0] as any;

            // New voucher starts when: debit entry appears after credit entry
            if (debit > 0 && tracker._lastWasCredit) {
              tracker._voucherIdx++;
            }

            // Update tracker
            tracker._lastWasCredit = credit > 0;

            // Add to the appropriate voucher group
            const groupKey = `date-${date}-v${tracker._voucherIdx}`;
            if (!entriesByVoucher.has(groupKey)) {
              entriesByVoucher.set(groupKey, []);
            }
            entriesByVoucher.get(groupKey)!.push(entry);
          }
        }

        // Clean up tracking entries and prepare voucher groups
        const voucherGroups: Map<string, RawEntry[]> = new Map();
        for (const [groupKey, entries] of entriesByVoucher) {
          // Skip tracker entries
          if (groupKey.startsWith('__track__')) continue;
          voucherGroups.set(groupKey, entries);
        }

        // Debug: Log voucher groupings
        console.log('=== Journal Parser Voucher Groupings ===');
        console.log(`Total voucher groups: ${voucherGroups.size}`);
        for (const [groupKey, entries] of voucherGroups) {
          if (entries.length <= 4) { // Only log small vouchers to avoid spam
            console.log(`Voucher ${groupKey}:`, entries.map(e => ({
              account: e.account,
              debit: e.debit,
              credit: e.credit
            })));
          }
        }

        // Second pass: link debit entries with credit entries (party names)
        for (const [groupKey, entries] of voucherGroups) {
          // Check if first entry is a credit - if so, this is likely a payment/receipt voucher
          // not an expense voucher, so skip party name linking
          const firstEntry = entries[0];
          const isPaymentVoucher = firstEntry && firstEntry.credit > 0 && firstEntry.debit === 0;

          // Find credit entries (potential party names) - exclude GST/TDS entries and bank accounts
          const creditEntries = entries.filter(e =>
            e.credit > 0 &&
            !/sgst|cgst|igst|tds|round/i.test(e.account) &&
            !/bank|od limit|overdraft|^cash$/i.test(e.account)
          );

          // Find the main party name (largest credit entry that's not a tax/bank account)
          // But ONLY for expense vouchers (first entry is debit)
          const mainParty = (!isPaymentVoucher && creditEntries.length > 0)
            ? creditEntries.reduce((max, e) => e.credit > max.credit ? e : max, creditEntries[0])
            : null;

          // Debug: Log party selection for vouchers with Advertisement entries
          if (entries.some(e => e.account.toLowerCase().includes('advertisement'))) {
            console.log(`[DEBUG] Voucher ${groupKey} has Advertisement entry:`);
            console.log('  First entry:', { account: firstEntry?.account, debit: firstEntry?.debit, credit: firstEntry?.credit });
            console.log('  Is payment voucher:', isPaymentVoucher);
            console.log('  Credit entries:', creditEntries.map(e => ({ account: e.account, credit: e.credit })));
            console.log('  Selected mainParty:', mainParty?.account);
          }

          // Create transactions with party name linked
          for (const entry of entries) {
            // For debit entries (expenses), link the party name from credit side
            // But only for expense vouchers (not payment vouchers)
            let partyName: string | undefined;
            if (entry.debit > 0 && mainParty && !isPaymentVoucher) {
              partyName = mainParty.account;
            }

            transactions.push({
              id: generateId(),
              date: entry.date,
              vchBillNo: entry.vchBillNo,
              gstNature: entry.gstNature,
              account: entry.account,
              debit: entry.debit,
              credit: entry.credit,
              notes: entry.notes,
              status: 'unclassified',
              state,
              partyName
            });
          }
        }

        console.log(`Journal Parser - Parsed ${transactions.length} transactions from ${state}`);
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
