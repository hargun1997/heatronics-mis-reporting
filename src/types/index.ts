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
  status: 'unclassified' | 'suggested' | 'classified';
  suggestedHead?: string;
  suggestedSubhead?: string;
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

export interface BalanceSheetData {
  openingStock: number;
  closingStock: number;
  sales: number;
  netProfit: number;
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
  grossRevenue: number;
  revenueByChannel: { [key: string]: number };
  returns: number;
  discounts: number;
  taxes: number;
  netRevenue: number;
  cogm: number;
  cogmBreakdown: { [key: string]: number };
  grossMargin: number;
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
  excluded: number;
  ignored: number;
}

export interface FilterState {
  search: string;
  status: 'all' | 'unclassified' | 'suggested' | 'classified';
  head: string | null;
  type: 'all' | 'debit' | 'credit';
}

export interface AppState {
  transactions: Transaction[];
  heads: Heads;
  cogsData: COGSData | null;
  balanceSheetData: BalanceSheetData | null;
  filter: FilterState;
  selectedIds: string[];
  customPatterns: AccountPattern[];
}
