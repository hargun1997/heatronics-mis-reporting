import { IgnorePattern } from '../types';

// Patterns for transactions that should be auto-ignored (not shown in classification)
// These are typically:
// - GST input/output entries
// - Bank transfers and cash entries
// - TDS entries
// - Inter-company transfers
// - Balance sheet items (not P&L)
// - Internal adjustments (Amazon Cash Sale via B2B ledger)

export const DEFAULT_IGNORE_PATTERNS: IgnorePattern[] = [
  // === AMAZON CASH SALE ADJUSTMENTS ===
  // These are internal entries to adjust Amazon cash sales via B2B ledger
  // The Amazon sale entry and corresponding party entry should both be ignored
  { pattern: "AMAZON SALE.*CASH SALE", reason: "Amazon Cash Sale Adjustment" },
  { pattern: "AMAZON.*CASH.*SALE.*DELHI", reason: "Amazon Cash Sale Adjustment" },
  { pattern: "AMAZON.*CASH.*SALE.*U\\.?P\\.?", reason: "Amazon Cash Sale Adjustment" },
  { pattern: "AMAZON.*CASH.*SALE.*MH", reason: "Amazon Cash Sale Adjustment" },
  { pattern: "AMAZON.*CASH.*SALE.*KA", reason: "Amazon Cash Sale Adjustment" },
  { pattern: "AMAZON.*CASH.*SALE.*TN", reason: "Amazon Cash Sale Adjustment" },
  { pattern: "AMAZON.*CASH.*SALE.*GJ", reason: "Amazon Cash Sale Adjustment" },
  { pattern: "AMAZON CASH SALE", reason: "Amazon Cash Sale Adjustment" },

  // GST Entries - Input
  { pattern: "CGST Input", reason: "GST Input Credit" },
  { pattern: "SGST Input", reason: "GST Input Credit" },
  { pattern: "IGST Input", reason: "GST Input Credit" },
  { pattern: "CGST Input Available", reason: "GST Input Credit (RCM)" },
  { pattern: "SGST Input Available", reason: "GST Input Credit (RCM)" },
  { pattern: "IGST Input Available", reason: "GST Input Credit (RCM)" },
  { pattern: "DEFERRED INPUT CGST", reason: "Deferred GST" },
  { pattern: "DEFERRED INPUT SGST", reason: "Deferred GST" },
  { pattern: "DEFERRED INPUT IGST", reason: "Deferred GST" },

  // GST Entries - Output
  { pattern: "CGST Output", reason: "GST Output Liability" },
  { pattern: "SGST Output", reason: "GST Output Liability" },
  { pattern: "IGST Output", reason: "GST Output Liability" },
  { pattern: "GST PAYABLE", reason: "GST Payable" },

  // TCS on GST
  { pattern: "TCS \\(CGST\\)", reason: "TCS Collected" },
  { pattern: "TCS \\(SGST\\)", reason: "TCS Collected" },
  { pattern: "TCS \\(IGST\\)", reason: "TCS Collected" },

  // TDS Entries
  { pattern: "TDS.*Professionals", reason: "TDS Deducted" },
  { pattern: "TDS.*Rent", reason: "TDS Deducted" },
  { pattern: "TDS.*Contracts", reason: "TDS Deducted" },
  { pattern: "TDS.*Commission", reason: "TDS Deducted" },
  { pattern: "TDS.*Interest", reason: "TDS Deducted" },

  // Bank and Cash entries (transfers, not expenses)
  { pattern: "^Cash$", reason: "Cash Account" },
  { pattern: "CENTRAL BANK.*OD", reason: "Bank Account" },
  { pattern: "HDFC BANK", reason: "Bank Account" },
  { pattern: "AXIS BANK", reason: "Bank Account" },
  { pattern: "ICICI BANK", reason: "Bank Account" },
  { pattern: "STATE BANK", reason: "Bank Account" },
  { pattern: "BANK OF BARODA", reason: "Bank Account" },
  { pattern: "KOTAK.*BANK", reason: "Bank Account" },
  { pattern: "YES BANK", reason: "Bank Account" },

  // Inter-company and loan accounts
  { pattern: "DIRECTOR LOAN", reason: "Director Loan" },
  { pattern: "HARLEEN CHAWLA.*LOAN", reason: "Promoter Loan" },
  { pattern: "UNSECURED LOAN", reason: "Loan Account" },

  // Capital and reserve accounts
  { pattern: "SHARE CAPITAL", reason: "Capital Account" },
  { pattern: "CAPITAL ACCOUNT", reason: "Capital Account" },
  { pattern: "RESERVE.*SURPLUS", reason: "Reserve Account" },

  // Fixed assets (Balance Sheet items)
  { pattern: "PLANT.*MACHINERY", reason: "Fixed Asset" },
  { pattern: "FURNITURE.*FIXTURE", reason: "Fixed Asset" },
  { pattern: "COMPUTER.*EQUIPMENT", reason: "Fixed Asset" },
  { pattern: "OFFICE EQUIPMENT", reason: "Fixed Asset" },
  { pattern: "ACCUMULATED DEPRECIATION", reason: "Depreciation Account" },

  // Suspense and clearing accounts
  { pattern: "SUSPENSE", reason: "Suspense Account" },
  { pattern: "CLEARING", reason: "Clearing Account" },

  // Opening/Closing balances (not transactions)
  { pattern: "OPENING BALANCE", reason: "Opening Balance Entry" },
  { pattern: "CLOSING BALANCE", reason: "Closing Balance Entry" },

  // Stock accounts (handled via COGS)
  { pattern: "STOCK.*TRADE", reason: "Stock Account" },
  { pattern: "INVENTORY", reason: "Inventory Account" }
];

// Patterns to detect Amazon Cash Sale adjustment entries (for offset matching)
export const AMAZON_CASH_SALE_PATTERNS = [
  /AMAZON.*SALE.*CASH.*SALE/i,
  /AMAZON.*CASH.*SALE/i
];

// Check if a transaction should be auto-ignored
export function shouldAutoIgnore(accountName: string, patterns: IgnorePattern[]): { ignore: boolean; reason: string } {
  for (const { pattern, reason } of patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(accountName)) {
        return { ignore: true, reason };
      }
    } catch {
      continue;
    }
  }
  return { ignore: false, reason: '' };
}

// Check if a transaction is an Amazon Cash Sale entry
export function isAmazonCashSale(accountName: string): boolean {
  return AMAZON_CASH_SALE_PATTERNS.some(pattern => pattern.test(accountName));
}

// Get all unique ignore reasons for statistics
export function getIgnoreReasons(patterns: IgnorePattern[]): string[] {
  return [...new Set(patterns.map(p => p.reason))];
}
