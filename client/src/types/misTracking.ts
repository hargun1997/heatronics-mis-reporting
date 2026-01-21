// MIS Tracking New - Types and Interfaces

import { IndianState, Transaction } from './index';

// ============================================
// PERIOD & STATE MANAGEMENT
// ============================================

export interface MISPeriod {
  month: number; // 1-12
  year: number;  // e.g., 2024
}

export function periodToString(period: MISPeriod): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[period.month - 1]} ${period.year}`;
}

export function periodToKey(period: MISPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

// ============================================
// CHANNEL TYPES
// ============================================

export type SalesChannel = 'Website' | 'Amazon' | 'Blinkit' | 'Offline & OEM';

export const SALES_CHANNELS: SalesChannel[] = ['Website', 'Amazon', 'Blinkit', 'Offline & OEM'];

// ============================================
// REVENUE DATA STRUCTURES
// ============================================

export interface ChannelRevenue {
  Website: number;
  Amazon: number;
  Blinkit: number;
  'Offline & OEM': number;
}

export function createEmptyChannelRevenue(): ChannelRevenue {
  return { Website: 0, Amazon: 0, Blinkit: 0, 'Offline & OEM': 0 };
}

export interface StockTransfer {
  fromState: IndianState;
  toState: IndianState | 'Unknown';  // 'Unknown' when destination state cannot be detected
  amount: number;
}

export interface RevenueData {
  // A. Gross Revenue (With GST) - by channel
  grossRevenue: ChannelRevenue;
  totalGrossRevenue: number;

  // B. Returns - by channel
  returns: ChannelRevenue;
  totalReturns: number;

  // Stock Transfers (excluded from calculations)
  stockTransfers: StockTransfer[];
  totalStockTransfers: number;

  // C. Discounts (ignored for now)
  discounts: ChannelRevenue;
  totalDiscounts: number;

  // D. Taxes (GST) - by channel
  taxes: ChannelRevenue;
  totalTaxes: number;

  // Calculated
  totalRevenue: number;  // Gross - Returns - Discounts
  netRevenue: number;    // Total Revenue - Taxes
}

// ============================================
// COGS/COGM DATA STRUCTURE (Cost of Goods Manufactured)
// ============================================

export interface COGMData {
  rawMaterialsInventory: number;    // E.1
  manufacturingWages: number;        // E.2
  contractWagesMfg: number;          // E.3
  inboundTransport: number;          // E.4
  factoryRent: number;               // E.5
  factoryElectricity: number;        // E.6
  factoryMaintenance: number;        // E.7
  jobWork: number;                   // E.8
  totalCOGM: number;
}

export function createEmptyCOGMData(): COGMData {
  return {
    rawMaterialsInventory: 0,
    manufacturingWages: 0,
    contractWagesMfg: 0,
    inboundTransport: 0,
    factoryRent: 0,
    factoryElectricity: 0,
    factoryMaintenance: 0,
    jobWork: 0,
    totalCOGM: 0
  };
}

// ============================================
// EXPENSE DATA STRUCTURES
// ============================================

// F. Channel & Fulfillment
export interface ChannelFulfillmentData {
  amazonFees: number;
  blinkitFees: number;
  d2cFees: number;  // Shiprocket, Payment Gateway
  total: number;
}

// G. Sales & Marketing
export interface SalesMarketingData {
  facebookAds: number;
  googleAds: number;
  amazonAds: number;
  blinkitAds: number;
  agencyFees: number;
  total: number;
}

// H. Channel/Platform Operation Costs
export interface PlatformCostsData {
  shopifySubscription: number;
  watiSubscription: number;
  shopfloSubscription: number;
  total: number;
}

// I. Operating Expenses
export interface OperatingExpensesData {
  salariesAdminMgmt: number;
  miscellaneous: number;  // Travel, insurance
  legalCaExpenses: number;
  platformCostsCRM: number;  // CRM, inventory softwares - Capex
  administrativeExpenses: number;  // Office Rent, utilities, admin supplies
  total: number;
}

// J. Non-Operating
export interface NonOperatingData {
  interestExpense: number;
  depreciation: number;
  amortization: number;
  totalIDA: number;  // Interest, Depreciation, Amortization
  incomeTax: number;
}

// ============================================
// COMPLETE MIS RECORD
// ============================================

export interface MISRecord {
  // Period info
  period: MISPeriod;
  periodKey: string;
  createdAt: string;
  updatedAt: string;

  // States included
  states: IndianState[];

  // Revenue Section
  revenue: RevenueData;

  // Cost Section
  cogm: COGMData;
  grossMargin: number;
  grossMarginPercent: number;

  // Expenses
  channelFulfillment: ChannelFulfillmentData;
  cm1: number;  // Contribution Margin 1 = Gross Margin - Channel & Fulfillment
  cm1Percent: number;

  salesMarketing: SalesMarketingData;
  cm2: number;  // = CM1 - Sales & Marketing
  cm2Percent: number;

  platformCosts: PlatformCostsData;
  cm3: number;  // = CM2 - Platform Costs
  cm3Percent: number;

  operatingExpenses: OperatingExpensesData;
  ebitda: number;  // = CM3 - Operating Expenses
  ebitdaPercent: number;

  nonOperating: NonOperatingData;
  ebt: number;  // Earnings Before Tax = EBITDA - Non-Operating (before tax)
  ebtPercent: number;

  netIncome: number;  // = EBT - Income Tax
  netIncomePercent: number;

  // Balance Sheet data for reconciliation (aggregated from all states)
  balanceSheet?: AggregatedBalanceSheetData;

  // Classification data (for review/correction)
  classifiedTransactions: ClassifiedTransaction[];
  unclassifiedCount: number;

  // Enhanced: Transactions grouped by head/subhead for drill-down view
  transactionsByHead?: TransactionsByHead;

  // Unclassified transactions for display
  unclassifiedTransactions?: UnclassifiedTransaction[];

  // Ignored and excluded transaction counts/amounts
  ignoredTotal?: number;
  excludedTotal?: number;
}

// ============================================
// CLASSIFICATION SYSTEM
// ============================================

export interface ClassifiedTransaction extends Transaction {
  misHead: MISHead;
  misSubhead: string;
  isAutoClassified: boolean;
  confidence: 'high' | 'medium' | 'low';
}

// ============================================
// TRANSACTION TRACKING BY SUBHEAD
// ============================================

// Reference to a transaction for drill-down view
export interface TransactionRef {
  id: string;
  date: string;
  account: string;
  amount: number;
  type: 'debit' | 'credit';
  source: 'journal' | 'purchase_register' | 'sales_register' | 'balance_sheet';
  notes?: string;
  // Original classification for reclassification tracking
  originalHead?: MISHead;
  originalSubhead?: string;
  // Additional context for display
  state?: string;  // State code (UP, Maharashtra, etc.)
  partyName?: string;  // Counterparty name
}

// Subhead with transaction details for drill-down
export interface SubheadWithTransactions {
  subhead: string;
  amount: number;
  transactionCount: number;
  transactions: TransactionRef[];
  source: 'journal' | 'balance_sheet' | 'sales_register' | 'calculated';
}

// Head with all subheads and their transactions
export interface HeadWithTransactions {
  head: MISHead;
  total: number;
  transactionCount: number;
  subheads: SubheadWithTransactions[];
}

// Enhanced MIS data with transaction tracking
export interface TransactionsByHead {
  [key: string]: HeadWithTransactions;  // key is MISHead
}

// Unclassified transaction for display
export interface UnclassifiedTransaction {
  id: string;
  date: string;
  account: string;
  amount: number;
  type: 'debit' | 'credit';
  source: 'journal';
}

export type MISHead =
  | 'A. Revenue'
  | 'B. Returns'
  | 'C. Discounts'
  | 'D. Taxes'
  | 'E. COGM'
  | 'F. Channel & Fulfillment'
  | 'G. Sales & Marketing'
  | 'H. Platform Costs'
  | 'I. Operating Expenses'
  | 'J. Non-Operating'
  | 'X. Exclude'
  | 'Z. Ignore';

export interface LearnedPattern {
  id: string;
  pattern: string;  // The account name pattern to match
  matchType: 'exact' | 'contains' | 'regex';
  head: MISHead;
  subhead: string;
  confidence: number;
  priority: number;  // 0 = user (highest), 1 = system, 2 = AI
  active: boolean;
  createdAt: string;
  source: 'user' | 'system' | 'gemini';
  notes?: string;
}

// ============================================
// FILE UPLOAD STATE (per state)
// ============================================

export interface StateUploadData {
  state: IndianState;

  // Files
  salesRegisterFile: File | null;
  purchaseRegisterFile: File | null;
  balanceSheetFile: File | null;

  // Parse status
  salesParsed: boolean;
  purchaseParsed: boolean;
  balanceSheetParsed: boolean;

  // Parsed data
  salesData: StateSalesData | null;
  purchaseTotal: number;
  balanceSheetData: StateBalanceSheetData | null;

  // Enhanced balance sheet data (for expense extraction)
  enhancedBalanceSheetData?: import('./balanceSheet').EnhancedBalanceSheetData;
}

export interface StateSalesData {
  grossSales: number;
  returns: number;
  stockTransfers: number;
  salesByChannel: ChannelRevenue;
  returnsByChannel: ChannelRevenue;
  taxesByChannel: ChannelRevenue;
  totalTaxes: number;
  lineItems: SalesLineItemNew[];
}

export interface SalesLineItemNew {
  id: string;
  date: string;
  partyName: string;
  invoiceNo: string;
  amount: number;
  taxAmount: number;
  channel: SalesChannel | 'Stock Transfer';
  isReturn: boolean;
  isStockTransfer: boolean;
  toState?: IndianState;  // For stock transfers
}

export interface StateBalanceSheetData {
  openingStock: number;
  closingStock: number;
  purchases: number;
  grossSales: number;
  netSales: number;
  grossProfit: number;
  netProfitLoss: number;  // Positive = profit, Negative = loss
}

// Aggregated Balance Sheet data for MIS reconciliation
export interface AggregatedBalanceSheetData {
  openingStock: number;
  closingStock: number;
  purchases: number;
  grossSales: number;
  netSales: number;
  grossProfit: number;
  netProfitLoss: number;  // Positive = profit, Negative = loss
  // Calculated COGS from BS: Opening Stock + Purchases - Closing Stock
  calculatedCOGS: number;
  // Inter-company stock transfers (to be excluded from revenue comparison)
  stockTransfers?: number;
}

// ============================================
// GOOGLE SHEETS STORAGE
// ============================================

export interface MISStorageData {
  version: string;
  lastUpdated: string;
  periods: MISRecord[];
  learnedPatterns: LearnedPattern[];
}

// ============================================
// UI STATE
// ============================================

export type MISTab = 'upload' | 'monthly' | 'trends';

export interface MISTrackingState {
  activeTab: MISTab;
  selectedPeriod: MISPeriod;
  selectedStates: IndianState[];
  uploadData: { [key in IndianState]?: StateUploadData };
  currentMIS: MISRecord | null;
  savedPeriods: MISPeriod[];
  isLoading: boolean;
  error: string | null;
}

// ============================================
// HELPERS
// ============================================

export function createEmptyStateUploadData(state: IndianState): StateUploadData {
  return {
    state,
    salesRegisterFile: null,
    purchaseRegisterFile: null,
    balanceSheetFile: null,
    salesParsed: false,
    purchaseParsed: false,
    balanceSheetParsed: false,
    salesData: null,
    purchaseTotal: 0,
    balanceSheetData: null,
    enhancedBalanceSheetData: undefined
  };
}

export function createEmptyRevenueData(): RevenueData {
  return {
    grossRevenue: createEmptyChannelRevenue(),
    totalGrossRevenue: 0,
    returns: createEmptyChannelRevenue(),
    totalReturns: 0,
    stockTransfers: [],
    totalStockTransfers: 0,
    discounts: createEmptyChannelRevenue(),
    totalDiscounts: 0,
    taxes: createEmptyChannelRevenue(),
    totalTaxes: 0,
    totalRevenue: 0,
    netRevenue: 0
  };
}

export function createEmptyMISRecord(period: MISPeriod): MISRecord {
  return {
    period,
    periodKey: periodToKey(period),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    states: [],
    revenue: createEmptyRevenueData(),
    cogm: createEmptyCOGMData(),
    grossMargin: 0,
    grossMarginPercent: 0,
    channelFulfillment: { amazonFees: 0, blinkitFees: 0, d2cFees: 0, total: 0 },
    cm1: 0,
    cm1Percent: 0,
    salesMarketing: { facebookAds: 0, googleAds: 0, amazonAds: 0, blinkitAds: 0, agencyFees: 0, total: 0 },
    cm2: 0,
    cm2Percent: 0,
    platformCosts: { shopifySubscription: 0, watiSubscription: 0, shopfloSubscription: 0, total: 0 },
    cm3: 0,
    cm3Percent: 0,
    operatingExpenses: { salariesAdminMgmt: 0, miscellaneous: 0, legalCaExpenses: 0, platformCostsCRM: 0, administrativeExpenses: 0, total: 0 },
    ebitda: 0,
    ebitdaPercent: 0,
    nonOperating: { interestExpense: 0, depreciation: 0, amortization: 0, totalIDA: 0, incomeTax: 0 },
    ebt: 0,
    ebtPercent: 0,
    netIncome: 0,
    netIncomePercent: 0,
    classifiedTransactions: [],
    unclassifiedCount: 0
  };
}
