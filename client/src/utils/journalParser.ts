/**
 * Journal Register Parser
 *
 * Implements the parsing rules from Heatronics Journal Register Parsing Guide:
 * - Date marks new voucher boundary
 * - First non-GST/TDS debit = expense
 * - Credit (non-GST/TDS/Bank) = party name
 * - Skip: GST, TDS, Bank, Rounded Off, Amazon B2B
 * - Use DEBIT amount, not credit
 */

import { ParsedJournalEntry, getMonthKey } from '../types/monthlyMIS';
import { classifyTransactionSync } from './misClassifier';

// ============================================
// PATTERNS TO SKIP
// ============================================

// GST entries (Balance Sheet items, not expenses)
const GST_PATTERN = /\b(cgst|sgst|igst)\s*(input|output)?\b/i;

// TDS entries (Tax deductions)
const TDS_PATTERN = /^tds\s*\(/i;

// Rounded Off (minor adjustments)
const ROUNDED_OFF_PATTERN = /rounded\s*off/i;

// NOTE: Bank/Cash, Amazon B2B, and Suspense are NO LONGER skipped
// The new rule is: skip entire voucher if first row has credit > 0

// ============================================
// ROW INTERFACE
// ============================================

interface JournalRow {
  date?: string;
  voucherNo?: string;
  gstType?: string;
  accountName: string;
  debit: number;
  credit: number;
}

// ============================================
// PARSING FUNCTIONS
// ============================================

/**
 * Check if an account should be skipped entirely
 * Only skip: GST, TDS, Rounded Off
 * Do NOT skip: Bank/Cash, Amazon B2B, Suspense (handled by first-row-credit rule)
 */
function shouldSkipAccount(accountName: string): boolean {
  if (!accountName) return true;

  const name = accountName.trim();

  // Skip GST entries
  if (GST_PATTERN.test(name)) return true;

  // Skip TDS entries
  if (TDS_PATTERN.test(name)) return true;

  // Skip Rounded Off
  if (ROUNDED_OFF_PATTERN.test(name)) return true;

  return false;
}

/**
 * Check if entire voucher should be skipped
 * NEW RULE: If first row has Credit > 0, skip entire voucher
 * (Catches payment receipts, B2C settlements, revenue entries)
 */
function shouldSkipVoucher(rows: JournalRow[]): boolean {
  if (rows.length === 0) return true;

  // If first row has credit > 0, skip entire voucher
  const firstRow = rows[0];
  if (firstRow.credit > 0) {
    return true;
  }

  return false;
}

/**
 * Group rows into vouchers based on date
 * Each voucher starts with a date; rows without date belong to previous voucher
 */
function groupIntoVouchers(rows: JournalRow[]): JournalRow[][] {
  const vouchers: JournalRow[][] = [];
  let currentVoucher: JournalRow[] = [];
  let lastDate = '';
  let lastVoucherNo = '';

  for (const row of rows) {
    // If row has a date, it starts a new voucher
    if (row.date && row.date.trim()) {
      if (currentVoucher.length > 0) {
        vouchers.push(currentVoucher);
      }
      currentVoucher = [row];
      lastDate = row.date;
      lastVoucherNo = row.voucherNo || '';
    } else {
      // Row belongs to current voucher
      // Forward-fill the date and voucher number
      currentVoucher.push({
        ...row,
        date: lastDate,
        voucherNo: row.voucherNo || lastVoucherNo,
      });
    }
  }

  // Don't forget the last voucher
  if (currentVoucher.length > 0) {
    vouchers.push(currentVoucher);
  }

  return vouchers;
}

/**
 * Parse a single voucher into MIS entries
 * Returns array because a voucher can have multiple expenses
 *
 * NEW LOGIC:
 * - Skip if first row has credit > 0
 * - Party name = "{expenseAccount} - {creditPartyName}"
 * - Classify using both expense account and credit party name
 */
function parseVoucher(rows: JournalRow[]): ParsedJournalEntry[] {
  const entries: ParsedJournalEntry[] = [];

  // Skip voucher if first row has credit > 0
  if (shouldSkipVoucher(rows)) {
    return entries;
  }

  const date = rows[0]?.date || '';
  const voucherNo = rows[0]?.voucherNo || '';
  const gstType = rows[0]?.gstType || '';

  // Find all expenses (debit entries that aren't skipped)
  const expenseRows: JournalRow[] = [];
  let creditPartyName = '';

  for (const row of rows) {
    if (shouldSkipAccount(row.accountName)) {
      continue;
    }

    // Debit = expense (must have debit > 0)
    if (row.debit > 0) {
      expenseRows.push(row);
    }

    // Credit = party (take the first non-skipped credit with amount > 0)
    if (row.credit > 0 && !creditPartyName) {
      creditPartyName = row.accountName.trim();
    }
  }

  // Create MIS entry for each expense
  for (const expenseRow of expenseRows) {
    const expenseAccount = expenseRow.accountName.trim();

    // NEW: Combine expense account + credit party for party name
    // Format: "EXPENSE ACCOUNT - CREDIT PARTY"
    const combinedPartyName = creditPartyName
      ? `${expenseAccount} - ${creditPartyName}`
      : expenseAccount;

    // Classify using both expense account and credit party name
    const classification = classifyTransactionSync(expenseAccount, creditPartyName);

    entries.push({
      date,
      voucherNo,
      expenseAccount,
      expenseAmount: expenseRow.debit,
      partyName: combinedPartyName,
      gstType,
      headCode: classification.headCode,
      subheadCode: classification.subheadCode,
      headName: classification.headName,
      subheadName: classification.subheadName,
      originalRows: rows.map(r => ({
        account: r.accountName,
        debit: r.debit,
        credit: r.credit,
      })),
    });
  }

  return entries;
}

/**
 * Parse raw Excel data into journal rows
 */
function parseExcelToRows(data: unknown[][]): JournalRow[] {
  const rows: JournalRow[] = [];

  // Skip header row(s)
  let startRow = 0;
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (row && row.some(cell =>
      typeof cell === 'string' &&
      (cell.toLowerCase().includes('date') ||
       cell.toLowerCase().includes('voucher') ||
       cell.toLowerCase().includes('debit') ||
       cell.toLowerCase().includes('credit'))
    )) {
      startRow = i + 1;
      break;
    }
  }

  // Determine column positions (they vary by export format)
  // Common formats:
  // Format 1: Date | Voucher No | GST Type | Account Name | Debit | Credit
  // Format 2: Date | Voucher No | Account Name | Debit | Credit
  // Format 3: Date | Account Name | Debit | Credit

  const headerRow = data[startRow - 1] || [];
  let dateCol = -1, voucherCol = -1, gstCol = -1, accountCol = -1, debitCol = -1, creditCol = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i] || '').toLowerCase().trim();

    if (header.includes('date') && dateCol < 0) dateCol = i;
    if ((header.includes('voucher') || header.includes('vch')) && voucherCol < 0) voucherCol = i;
    if (header.includes('gst') && gstCol < 0) gstCol = i;
    if ((header.includes('particulars') || header.includes('account') || header.includes('ledger') || header.includes('name')) && accountCol < 0) accountCol = i;
    if (header.includes('debit') && debitCol < 0) debitCol = i;
    if (header.includes('credit') && creditCol < 0) creditCol = i;
  }

  // Fallback: if no header found, assume standard positions
  if (dateCol < 0) dateCol = 0;
  if (accountCol < 0) accountCol = voucherCol >= 0 ? voucherCol + 1 : 1;
  if (debitCol < 0) debitCol = accountCol + 1;
  if (creditCol < 0) creditCol = debitCol + 1;

  // Parse data rows
  for (let i = startRow; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const accountName = String(row[accountCol] || '').trim();
    if (!accountName) continue;

    const parseNumber = (val: unknown): number => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[,\s]/g, '').replace(/[()]/g, '');
        return parseFloat(cleaned) || 0;
      }
      return 0;
    };

    rows.push({
      date: String(row[dateCol] || '').trim(),
      voucherNo: voucherCol >= 0 ? String(row[voucherCol] || '').trim() : undefined,
      gstType: gstCol >= 0 ? String(row[gstCol] || '').trim() : undefined,
      accountName,
      debit: parseNumber(row[debitCol]),
      credit: parseNumber(row[creditCol]),
    });
  }

  return rows;
}

// ============================================
// MAIN EXPORT
// ============================================

/**
 * Parse Journal Register Excel data
 * Returns entries grouped by month
 */
export function parseJournalRegister(data: unknown[][]): {
  entriesByMonth: Map<string, ParsedJournalEntry[]>;
  totalVouchers: number;
  totalExpenses: number;
  skippedVouchers: number;
} {
  const entriesByMonth = new Map<string, ParsedJournalEntry[]>();
  let totalVouchers = 0;
  let totalExpenses = 0;
  let skippedVouchers = 0;

  // Parse raw data to rows
  const rows = parseExcelToRows(data);

  // Group into vouchers
  const vouchers = groupIntoVouchers(rows);
  totalVouchers = vouchers.length;

  // Parse each voucher
  for (const voucherRows of vouchers) {
    const entries = parseVoucher(voucherRows);

    if (entries.length === 0) {
      skippedVouchers++;
      continue;
    }

    totalExpenses += entries.length;

    // Group by month
    for (const entry of entries) {
      // Parse date to get month key
      const monthKey = getMonthFromDate(entry.date);

      if (!entriesByMonth.has(monthKey)) {
        entriesByMonth.set(monthKey, []);
      }
      entriesByMonth.get(monthKey)!.push(entry);
    }
  }

  return {
    entriesByMonth,
    totalVouchers,
    totalExpenses,
    skippedVouchers,
  };
}

/**
 * Parse date string to month key
 * Handles various formats: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
 */
function getMonthFromDate(dateStr: string): string {
  if (!dateStr) return 'unknown';

  // Try DD-MM-YYYY or DD/MM/YYYY
  let match = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD
  match = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const [, year, month] = match;
    return `${year}-${month.padStart(2, '0')}`;
  }

  // Try parsing as Date object
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return getMonthKey(date);
  }

  return 'unknown';
}

/**
 * Parse Journal Register for a specific month
 * Convenience function when you only want one month's data
 */
export function parseJournalRegisterForMonth(data: unknown[][], targetMonth: string): ParsedJournalEntry[] {
  const { entriesByMonth } = parseJournalRegister(data);
  return entriesByMonth.get(targetMonth) || [];
}
