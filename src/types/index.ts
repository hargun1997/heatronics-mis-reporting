export interface Transaction {
  id: string;
  date: string;
  vchBillNo: string;
  gstNature: string;
  account: string;
  debit: number;
  credit: number;
  notes: string;
  head?: string;
  subhead?: string;
  status: 'unclassified' | 'suggested' | 'classified' | 'ignored';
  suggestedHead?: string;
  suggestedSubhead?: string;
  isAutoIgnored?: boolean;  // Auto-ignored based on patterns
}

export interface HeadConfig {
  subheads: string[];
  type: 'credit' | 'debit' | 'calculated' | 'exclude' | 'ignore';
}

export interface Heads {
  [key: string]: HeadConfig;
}

export interface Classification {
  head: string;
  subhead: string;
}

export interface AccountPattern {
  pattern: string;
  head: string;
  subhead: string;
}

export interface IgnorePattern {
  pattern: string;
  reason: string;
}

export interface BalanceSheetData {
  openingStock: number;
  closingStock: number;
  grossSales: number;
  netSales: number;  // Net of discounts and GST - use this for reconciliation
  revenueDiscounts: number;
  gstOnSales: number;
  netProfit: number;
  purchases: number;
  extractedLines?: { label: string; value: number; source: string }[];
}

export interface COGSData {
  openingStock: number;
  purchases: number;
  closingStock: number;
  cogs: number;
}

export interface HeadTotal {
  head: string;
  subhead: string;
  total: number;
  count: number;
}

export interface MISLineItem {
  label: string;
  amount: number;
  percentage?: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
  indent?: number;
}

export interface MISReport {
  // === FROM BALANCE SHEET (AUTHORITATIVE SOURCE) ===
  bsNetSales: number;           // Net Sales from Balance Sheet (used as Revenue)
  bsGrossSales: number;         // Gross Sales from Balance Sheet
  bsPurchases: number;          // Purchases from Balance Sheet
  bsOpeningStock: number;       // Opening Stock from Balance Sheet
  bsClosingStock: number;       // Closing Stock from Balance Sheet
  bsCOGS: number;               // COGS calculated from BS (Opening + Purchases - Closing)
  bsNetProfit: number;          // Net Profit from Balance Sheet (for reference)

  // === PURCHASE REGISTER VALIDATION ===
  purchaseRegisterTotal: number;  // Total from Purchase Register Excel
  purchaseVariance: number;       // bsPurchases - purchaseRegisterTotal

  // === P&L REPORT (using BS for Revenue and COGS) ===
  netRevenue: number;           // = bsNetSales (from Balance Sheet)
  cogm: number;                 // = bsCOGS (from Balance Sheet)
  grossMargin: number;          // = netRevenue - cogm

  // === EXPENSE CLASSIFICATIONS (from Journal) ===
  channelCosts: number;
  channelCostsBreakdown: { [key: string]: number };
  cm1: number;
  marketing: number;
  marketingBreakdown: { [key: string]: number };
  cm2: number;
  platform: number;
  platformBreakdown: { [key: string]: number };
  cm3: number;
  operating: number;
  operatingBreakdown: { [key: string]: number };
  ebitda: number;
  nonOperating: number;
  netIncome: number;

  // === OTHER JOURNAL ITEMS ===
  excluded: number;
  ignored: number;

  // === JOURNAL DATA (for validation/reference) ===
  journalRevenue: number;       // Gross revenue found in journal
  journalReturns: number;       // Returns from journal
  journalDiscounts: number;     // Discounts from journal
  journalTaxes: number;         // Taxes from journal
  journalNetRevenue: number;    // Net revenue from journal (gross - returns - discounts - taxes)
  journalCOGM: number;          // COGM from journal classifications
  revenueByChannel: { [key: string]: number };  // Journal revenue breakdown

  // === RECONCILIATION ===
  revenueVariance: number;      // bsNetSales - journalNetRevenue (should be ~0 or explained)
  cogsVariance: number;         // bsCOGS - journalCOGM
  profitVariance: number;       // bsNetProfit - netIncome
}

export interface FilterState {
  search: string;
  status: 'all' | 'unclassified' | 'suggested' | 'classified' | 'ignored';
  head: string | null;
  type: 'all' | 'debit' | 'credit';
  showIgnored: boolean;
}

export interface AppState {
  transactions: Transaction[];
  heads: Heads;
  cogsData: COGSData | null;
  balanceSheetData: BalanceSheetData | null;
  filter: FilterState;
  selectedIds: string[];
  customPatterns: AccountPattern[];
  ignorePatterns: IgnorePattern[];
}
