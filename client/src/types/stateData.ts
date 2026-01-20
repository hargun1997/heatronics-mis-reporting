// State-Level Data Types
// Data is stored per state, per month, then aggregated up

export type StateName = 'UP' | 'MH' | 'KA' | 'HR' | 'TG';

export const STATE_NAMES: StateName[] = ['UP', 'MH', 'KA', 'HR', 'TG'];

export const STATE_FULL_NAMES: Record<StateName, string> = {
  'UP': 'Uttar Pradesh',
  'MH': 'Maharashtra',
  'KA': 'Karnataka',
  'HR': 'Haryana',
  'TG': 'Telangana'
};

// ============================================
// BALANCE SHEET DATA (Per State)
// ============================================

export interface StateBalanceSheet {
  openingStock: number;
  closingStock: number;
  purchases: number;
  grossSales: number;
  netProfit: number;  // One of profit/loss will be 0
  netLoss: number;
  netProfitLoss: number; // Calculated: profit - loss
}

// ============================================
// SALES REGISTER DATA (Per State)
// ============================================

export interface SalesRegisterEntry {
  date: string;
  party: string;
  channel: string;  // Amazon, Blinkit, D2C, Offline
  amount: number;
  sgst: number;
  cgst: number;
  igst: number;
  isStockTransfer: boolean;  // True if party contains "Heatronics"
  toEntity?: string;  // Which Heatronics entity (for stock transfers)
}

export interface StateSalesRegister {
  entries: SalesRegisterEntry[];
  revenueByChannel: Record<string, number>;
  totalRevenue: number;  // Excludes stock transfers
  stockTransfers: { toEntity: string; amount: number }[];
  totalStockTransfers: number;
  sgst: number;
  cgst: number;
  igst: number;
  roundOffs: number;
}

// ============================================
// PURCHASE REGISTER DATA (Per State)
// ============================================

export interface PurchaseRegisterEntry {
  date: string;
  party: string;
  category: string;
  amount: number;
  sgst: number;
  cgst: number;
  igst: number;
}

export interface StatePurchaseRegister {
  entries: PurchaseRegisterEntry[];
  purchasesByCategory: Record<string, number>;
  totalPurchases: number;
  sgst: number;
  cgst: number;
  igst: number;
  roundOffs: number;
}

// ============================================
// JOURNAL REGISTER DATA (Per State)
// ============================================

export interface JournalEntry {
  date: string;
  debitAmount: number;
  debitParticulars: string;
  creditParty: string;
  misHead: string;  // Classified MIS head
  state: string;    // State tag for drill-down
  // Classification flags
  isGST: boolean;
  isTDS: boolean;
  isRoundOff: boolean;
  isSkipped: boolean;  // Bank, Amazon B2B
  skipReason?: string;
}

export interface StateJournalRegister {
  entries: JournalEntry[];  // All entries for drill-down
  expenseEntries: JournalEntry[];  // Only classified expenses
  expensesByHead: Record<string, number>;
  totalExpenses: number;
  // Tracked separately (not in expenses)
  sgst: number;
  cgst: number;
  igst: number;
  tds: number;
  roundOffs: number;
}

// ============================================
// STATE MONTH DATA (Combined)
// ============================================

export interface StateMonthData {
  state: StateName;
  month: string;  // "YYYY-MM"

  balanceSheet?: StateBalanceSheet;
  salesRegister?: StateSalesRegister;
  purchaseRegister?: StatePurchaseRegister;
  journalRegister?: StateJournalRegister;

  // Timestamps for tracking
  bsUploadedAt?: string;
  srUploadedAt?: string;
  prUploadedAt?: string;
  jrUploadedAt?: string;
}

// ============================================
// MONTHLY MIS DATA (Aggregated from States)
// ============================================

export interface MonthlyMISAggregated {
  month: string;

  // Revenue (from all states SR)
  grossRevenue: number;
  revenueByChannel: Record<string, number>;
  stockTransfers: number;
  netRevenue: number;  // grossRevenue - stockTransfers

  // COGM (Opening/Closing from UP only, Purchases from all)
  cogm: {
    openingStock: number;   // UP BS only
    closingStock: number;   // UP BS only
    purchases: number;      // All states BS sum
    totalCOGM: number;      // opening + purchases - closing
  };

  grossProfit: number;  // netRevenue - cogm

  // Expenses by MIS head (from all states JR)
  expensesByHead: Record<string, number>;
  totalExpenses: number;

  // Expense entries for drill-down (from all states)
  expenseEntries: JournalEntry[];

  netIncome: number;  // grossProfit - totalExpenses

  // Tax Summary
  taxSummary: {
    outputGST: {  // From all states SR
      sgst: number;
      cgst: number;
      igst: number;
      total: number;
    };
    inputGST: {  // From all states PR
      sgst: number;
      cgst: number;
      igst: number;
      total: number;
    };
    expenseGST: {  // From all states JR
      sgst: number;
      cgst: number;
      igst: number;
      total: number;
    };
    netGST: number;  // output - input - expense (payable if positive)
    tds: number;     // From all states JR
    roundOffs: number;  // SR - PR + JR
  };

  // BS Reconciliation
  bsReconciliation: {
    bsGrossSales: number;     // Sum all states BS
    bsNetProfitLoss: number;  // Sum all states BS
    misRevenue: number;       // netRevenue
    misNetIncome: number;     // netIncome
    stockTransfers: number;
    revenueVariance: number;  // misRevenue - (bsGrossSales - stockTransfers)
    profitVariance: number;   // misNetIncome - bsNetProfitLoss
  };
}

export interface MonthlyMISData {
  month: string;
  statesData: StateMonthData[];  // All states' raw data
  aggregated: MonthlyMISAggregated;
}

// ============================================
// RANGE MIS DATA (Aggregated from Months)
// ============================================

export interface RangeMISData {
  startMonth: string;
  endMonth: string;
  months: MonthlyMISData[];

  aggregated: MonthlyMISAggregated;  // Same structure, but:
  // - openingStock from FIRST month UP only
  // - closingStock from LAST month UP only
  // - everything else summed across months
}

// ============================================
// STORAGE KEY HELPERS
// ============================================

export type FileType = 'BS' | 'SR' | 'PR' | 'JR';

export function makeStateDataKey(month: string, state: StateName, fileType: FileType): string {
  return `${month}:${state}:${fileType}`;
}

export function parseStateDataKey(key: string): { month: string; state: StateName; fileType: FileType } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  return {
    month: parts[0],
    state: parts[1] as StateName,
    fileType: parts[2] as FileType
  };
}
