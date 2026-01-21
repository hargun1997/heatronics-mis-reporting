// Enhanced Balance Sheet Types
// For parsing Trading Account + P&L Account from Busy/Tally

import { MISHead } from './misTracking';

/**
 * A single line item extracted from the Balance Sheet
 * (either Trading Account or P&L Account)
 */
export interface BalanceSheetLineItem {
  id: string;
  accountName: string;        // Original account name from Busy/Tally
  normalizedName: string;     // Normalized for matching
  amount: number;             // The amount (always positive)
  section: 'trading' | 'pl';  // Which section it came from
  side: 'debit' | 'credit';   // Which side of the account

  // MIS Mapping (filled after mapping)
  head?: MISHead;
  subhead?: string;
  type?: 'revenue' | 'expense' | 'ignore' | 'other_income';
  plLine?: string;

  // For special items
  isSpecial?: boolean;        // Opening Stock, Closing Stock, Gross Profit, etc.
  specialType?: 'opening_stock' | 'closing_stock' | 'gross_profit' | 'net_profit' | 'net_loss' | 'sales' | 'purchase';
}

/**
 * Trading Account data structure
 * DEBIT: Opening Stock, Purchases, Direct Expenses, Gross Profit (if loss)
 * CREDIT: Sales, Closing Stock, Gross Profit (if profit)
 */
export interface TradingAccountData {
  // Key figures
  openingStock: number;
  closingStock: number;
  purchases: number;
  sales: number;
  grossProfit: number;        // Positive if profit, negative if loss

  // Direct expenses (COGM items)
  directExpenses: BalanceSheetLineItem[];

  // Totals for validation
  debitTotal: number;
  creditTotal: number;
}

/**
 * P&L Account data structure
 * DEBIT: Indirect Expenses, Net Profit (if loss)
 * CREDIT: Gross Profit (brought forward), Other Income, Net Profit (if profit)
 */
export interface PLAccountData {
  // Key figures
  grossProfit: number;        // Carried from Trading Account
  netProfitLoss: number;      // Positive if profit, negative if loss

  // All expense line items
  indirectExpenses: BalanceSheetLineItem[];

  // Other income items (if any)
  otherIncome: BalanceSheetLineItem[];

  // Totals for validation
  debitTotal: number;
  creditTotal: number;
}

/**
 * Complete Enhanced Balance Sheet Data
 * Contains all parsed data from Trading + P&L
 */
export interface EnhancedBalanceSheetData {
  // Raw parsed data
  tradingAccount: TradingAccountData;
  plAccount: PLAccountData;

  // All line items combined (for easy iteration)
  allLineItems: BalanceSheetLineItem[];

  // Mapped line items (after applying accountMapping)
  mappedItems: BalanceSheetLineItem[];
  unmappedItems: BalanceSheetLineItem[];

  // Aggregated by MIS Head/Subhead
  aggregatedByHead: Record<string, {
    head: MISHead;
    total: number;
    subheads: Record<string, {
      subhead: string;
      total: number;
      items: BalanceSheetLineItem[];
    }>;
  }>;

  // Summary metrics
  totalExpenses: number;
  totalIgnored: number;
  totalExcluded: number;

  // Validation
  isBalanced: boolean;
  tradingBalanceDiff: number;  // Should be 0
  plBalanceDiff: number;       // Should be 0
}

/**
 * Parsing result from balance sheet file
 */
export interface BalanceSheetParseResult {
  success: boolean;
  data?: EnhancedBalanceSheetData;
  errors: string[];
  warnings: string[];
}

/**
 * State-specific balance sheet data
 * Used for aggregating across multiple states
 */
export interface StateBalanceSheetDataEnhanced {
  state: string;
  data: EnhancedBalanceSheetData;

  // Special handling for UP (main warehouse)
  isMainWarehouse: boolean;
}

/**
 * Create empty Trading Account data
 */
export function createEmptyTradingAccount(): TradingAccountData {
  return {
    openingStock: 0,
    closingStock: 0,
    purchases: 0,
    sales: 0,
    grossProfit: 0,
    directExpenses: [],
    debitTotal: 0,
    creditTotal: 0
  };
}

/**
 * Create empty P&L Account data
 */
export function createEmptyPLAccount(): PLAccountData {
  return {
    grossProfit: 0,
    netProfitLoss: 0,
    indirectExpenses: [],
    otherIncome: [],
    debitTotal: 0,
    creditTotal: 0
  };
}

/**
 * Create empty Enhanced Balance Sheet data
 */
export function createEmptyEnhancedBalanceSheet(): EnhancedBalanceSheetData {
  return {
    tradingAccount: createEmptyTradingAccount(),
    plAccount: createEmptyPLAccount(),
    allLineItems: [],
    mappedItems: [],
    unmappedItems: [],
    aggregatedByHead: {},
    totalExpenses: 0,
    totalIgnored: 0,
    totalExcluded: 0,
    isBalanced: true,
    tradingBalanceDiff: 0,
    plBalanceDiff: 0
  };
}
