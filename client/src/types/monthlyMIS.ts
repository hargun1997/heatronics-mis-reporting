/**
 * Monthly MIS Data Types
 *
 * Architecture: All data is stored per-month, with aggregation computed at view time.
 * This prevents data corruption from mixing months and enables proper drill-down.
 */

// ============================================
// BALANCE SHEET DATA (Per State, Per Month)
// ============================================

export interface MonthlyBSData {
  month: string;           // "2025-12"
  state: string;           // "UP", "HR", "MH", etc.

  // From Trading Account
  openingStock: number;
  purchases: number;
  closingStock: number;
  grossSales: number;
  directExpenses: number;  // Direct/Mfg expenses from Trading A/c
  grossProfit: number;

  // From P&L Account
  netProfit: number;
  netLoss: number;

  // Metadata
  parsedAt: Date;
  sourceFile: string;
  extractedLines: { label: string; value: number; source: string }[];
}

// ============================================
// TRANSACTION DATA
// ============================================

export interface ParsedJournalEntry {
  date: string;
  voucherNo: string;
  expenseAccount: string;    // The expense (first debit)
  expenseAmount: number;     // Debit amount
  partyName: string;         // Credit party (who we paid)
  gstType?: string;

  // Classification
  headCode: string;
  subheadCode: string;
  headName: string;
  subheadName: string;

  // Original row data for audit
  originalRows: {
    account: string;
    debit: number;
    credit: number;
  }[];
}

export interface ParsedSalesEntry {
  date: string;
  invoiceNo: string;
  partyName: string;
  state: string;             // Which state this sale is from
  taxableAmount: number;     // Revenue without GST
  gstAmount: number;
  totalAmount: number;

  // Classification
  headCode: string;          // Usually "REVENUE"
  subheadCode: string;       // e.g., "AMAZON_SALES", "DIRECT_SALES"
}

export interface ParsedPurchaseEntry {
  date: string;
  invoiceNo: string;
  partyName: string;
  itemDescription: string;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;

  // Classification
  headCode: string;
  subheadCode: string;
}

// ============================================
// MONTHLY TRANSACTION COLLECTION
// ============================================

export interface HeadTransactions {
  headCode: string;
  headName: string;
  total: number;
  subheads: Map<string, SubheadTransactions>;
}

export interface SubheadTransactions {
  subheadCode: string;
  subheadName: string;
  total: number;
  transactions: (ParsedJournalEntry | ParsedSalesEntry | ParsedPurchaseEntry)[];
}

export interface MonthlyTransactionData {
  month: string;

  // Raw parsed entries
  journalEntries: ParsedJournalEntry[];
  salesEntries: ParsedSalesEntry[];
  purchaseEntries: ParsedPurchaseEntry[];

  // Classified by head (for quick totals)
  byHead: Map<string, HeadTransactions>;

  // Totals for quick access
  headTotals: Record<string, number>;
  subheadTotals: Record<string, number>;
}

// ============================================
// COMPLETE MONTHLY MIS RECORD
// ============================================

export interface MonthlyMISRecord {
  month: string;             // "2025-12"

  // Balance Sheet data by state
  bsDataByState: Record<string, MonthlyBSData>;

  // Primary state for RM calculation (usually "UP")
  primaryState: string;

  // Transaction data
  transactions: MonthlyTransactionData;

  // Computed MIS values for this month
  computed: {
    // Revenue
    grossRevenue: number;
    revenueByState: Record<string, number>;

    // RM/Inventory (from primary state BS)
    openingStock: number;
    purchases: number;
    closingStock: number;
    rmCost: number;          // Opening + Purchases - Closing

    // Head totals (from transactions)
    headTotals: Record<string, number>;

    // Margins
    cm1: number;
    cm2: number;
    cm3: number;
    ebitda: number;
    pbt: number;
    pat: number;
  };

  // Metadata
  lastUpdated: Date;
  filesUploaded: {
    bs: { state: string; filename: string; uploadedAt: Date }[];
    jr: { filename: string; uploadedAt: Date }[];
    sr: { filename: string; uploadedAt: Date }[];
    pr: { filename: string; uploadedAt: Date }[];
  };
}

// ============================================
// AGGREGATED VIEW (For Date Ranges)
// ============================================

export interface AggregatedMISRecord {
  startMonth: string;        // "2025-04"
  endMonth: string;          // "2025-12"
  monthsIncluded: string[];  // ["2025-04", "2025-05", ...]

  // RM/Inventory (special aggregation)
  openingStock: number;      // From FIRST month
  totalPurchases: number;    // SUM of all months
  closingStock: number;      // From LAST month
  rmCost: number;            // Opening + TotalPurchases - Closing

  // Revenue (summed)
  grossRevenue: number;
  revenueByState: Record<string, number>;

  // Expenses (summed by head)
  headTotals: Record<string, number>;
  subheadTotals: Record<string, number>;

  // Margins (calculated on aggregated values)
  cm1: number;
  cm2: number;
  cm3: number;
  ebitda: number;
  pbt: number;
  pat: number;

  // No drill-down in aggregated view
  // Individual transactions only available in single-month view
}

// ============================================
// STATE CODES
// ============================================

export const STATE_CODES: Record<string, string> = {
  'UP': 'Uttar Pradesh',
  'HR': 'Haryana',
  'DL': 'Delhi',
  'MH': 'Maharashtra',
  'KA': 'Karnataka',
  'TG': 'Telangana',
  'GJ': 'Gujarat',
  'RJ': 'Rajasthan',
  'TN': 'Tamil Nadu',
  'WB': 'West Bengal',
};

// State code from GSTIN (first 2 digits)
export const GSTIN_STATE_MAP: Record<string, string> = {
  '09': 'UP',
  '06': 'HR',
  '07': 'DL',
  '27': 'MH',
  '29': 'KA',
  '36': 'TG',
  '24': 'GJ',
  '08': 'RJ',
  '33': 'TN',
  '19': 'WB',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, month };
}

export function getMonthRange(startMonth: string, endMonth: string): string[] {
  const start = parseMonthKey(startMonth);
  const end = parseMonthKey(endMonth);

  const months: string[] = [];
  let current = new Date(start.year, start.month - 1, 1);
  const endDate = new Date(end.year, end.month - 1, 1);

  while (current <= endDate) {
    months.push(getMonthKey(current));
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

export function createEmptyMonthlyMISRecord(month: string): MonthlyMISRecord {
  return {
    month,
    bsDataByState: {},
    primaryState: 'UP',
    transactions: {
      month,
      journalEntries: [],
      salesEntries: [],
      purchaseEntries: [],
      byHead: new Map(),
      headTotals: {},
      subheadTotals: {},
    },
    computed: {
      grossRevenue: 0,
      revenueByState: {},
      openingStock: 0,
      purchases: 0,
      closingStock: 0,
      rmCost: 0,
      headTotals: {},
      cm1: 0,
      cm2: 0,
      cm3: 0,
      ebitda: 0,
      pbt: 0,
      pat: 0,
    },
    lastUpdated: new Date(),
    filesUploaded: {
      bs: [],
      jr: [],
      sr: [],
      pr: [],
    },
  };
}
