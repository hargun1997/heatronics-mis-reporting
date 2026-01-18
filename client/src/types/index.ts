// Available states for file uploads
export type IndianState = 'UP' | 'Maharashtra' | 'Telangana' | 'Karnataka' | 'Haryana';

export const INDIAN_STATES: { code: IndianState; name: string }[] = [
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'Maharashtra', name: 'Maharashtra' },
  { code: 'Telangana', name: 'Telangana' },
  { code: 'Karnataka', name: 'Karnataka' },
  { code: 'Haryana', name: 'Haryana' }
];

// File types for uploads
export type FileType = 'balanceSheet' | 'journal' | 'purchase' | 'sales';

export const FILE_TYPES: { type: FileType; label: string; accept: string }[] = [
  { type: 'balanceSheet', label: 'Balance Sheet', accept: '.pdf,.xlsx,.xls' },
  { type: 'journal', label: 'Journal Vouchers', accept: '.xlsx,.xls' },
  { type: 'purchase', label: 'Purchase Ledger', accept: '.xlsx,.xls' },
  { type: 'sales', label: 'Sales Register', accept: '.xlsx,.xls' }
];

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
  state?: IndianState;  // State this transaction belongs to
}

export interface HeadConfig {
  subheads: string[];
  type: 'credit' | 'debit' | 'calculated' | 'exclude';
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
  head: string | null;
  subhead: string | null;  // Channel filter for Revenue/Returns
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

// Sales Register Data
export interface SalesLineItem {
  id: string;
  partyName: string;
  amount: number;
  channel: string;          // Assigned channel (Amazon, Blinkit, Website, Offline/OEM)
  isReturn: boolean;        // True if this is a return (negative amount)
  isInterCompany: boolean;  // True if inter-company transfer
  toState?: IndianState;    // If inter-company, which state
  originalChannel?: string; // Original auto-detected channel (before manual edit)
  // Tax fields
  igst?: number;
  cgst?: number;
  sgst?: number;
  totalTax?: number;        // igst + cgst + sgst
}

export interface SalesRegisterData {
  grossSales: number;           // All positive sales
  returns: number;              // All negative sales (stored as positive value)
  interCompanyTransfers: number; // Sales to other Heatronics entities (for UP state)
  netSales: number;             // grossSales - interCompanyTransfers (returns NOT subtracted here)
  itemCount: number;
  totalTaxes: number;           // Total of all IGST + CGST + SGST
  salesByChannel?: { [key: string]: number };
  interCompanyDetails?: {       // Details of inter-company transfers
    toState: IndianState;
    amount: number;
  }[];
  lineItems?: SalesLineItem[];  // Individual line items for verification
}

// Aggregated revenue data across all states
export interface AggregatedRevenueData {
  totalGrossSales: number;          // Sum of all states' gross sales
  totalStockTransfer: number;       // Total inter-company stock transfers (UP to other states)
  totalReturns: number;             // Sum of all returns across states
  totalTaxes: number;               // Sum of all taxes (placeholder for now)
  totalDiscounts: number;           // Sum of all discounts (placeholder for now)
  totalNetRevenue: number;          // totalGrossSales - stockTransfer - returns - taxes - discounts
  salesByState: { [key in IndianState]?: number };
  returnsByState: { [key in IndianState]?: number };
}

// State-specific file uploads
export interface StateFileData {
  balanceSheetFile: File | null;
  journalFile: File | null;
  purchaseFile: File | null;
  salesFile: File | null;
  balanceSheetParsed: boolean;
  journalParsed: boolean;
  purchaseParsed: boolean;
  salesParsed: boolean;
  balanceSheetData: BalanceSheetData | null;
  transactions: Transaction[];
  purchaseTotal: number;
  salesData: SalesRegisterData | null;
  cogsData: COGSData | null;
}

// Multi-state data container
export interface MultiStateData {
  selectedStates: IndianState[];
  stateData: { [key in IndianState]?: StateFileData };
}

// Helper to create empty state file data
export function createEmptyStateFileData(): StateFileData {
  return {
    balanceSheetFile: null,
    journalFile: null,
    purchaseFile: null,
    salesFile: null,
    balanceSheetParsed: false,
    journalParsed: false,
    purchaseParsed: false,
    salesParsed: false,
    balanceSheetData: null,
    transactions: [],
    purchaseTotal: 0,
    salesData: null,
    cogsData: null
  };
}
