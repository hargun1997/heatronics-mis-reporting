// MIS Tracking - Transaction Classifier
// Auto-classifies journal transactions into MIS heads

import { Transaction } from '../types';
import {
  MISHead,
  ClassifiedTransaction,
  LearnedPattern
} from '../types/misTracking';
import { getLearnedPatterns } from './googleSheetsStorage';

// ============================================
// SUBHEAD MAPPING (Exact heads from user's MIS)
// ============================================

export const MIS_HEADS_CONFIG: Record<MISHead, { subheads: string[]; type: 'revenue' | 'expense' | 'ignore' }> = {
  'A. Revenue': {
    subheads: ['Website', 'Amazon', 'Blinkit', 'Offline & OEM'],
    type: 'revenue'
  },
  'B. Returns': {
    subheads: ['Website', 'Amazon', 'Blinkit', 'Offline & OEM'],
    type: 'expense'
  },
  'C. Discounts': {
    subheads: ['Website', 'Amazon', 'Blinkit', 'Offline & OEM'],
    type: 'expense'
  },
  'D. Taxes': {
    subheads: ['Website', 'Amazon', 'Blinkit', 'Offline & OEM'],
    type: 'expense'
  },
  'E. COGM': {
    subheads: [
      'Raw Materials & Inventory',
      'Manufacturing Wages',
      'Contract Wages (Mfg)',
      'Inbound Transport',
      'Factory Rent',
      'Factory Electricity',
      'Factory Maintainence',
      'Job work'
    ],
    type: 'expense'
  },
  'F. Channel & Fulfillment': {
    subheads: ['Amazon Fees', 'Blinkit Fees', 'D2C Fees'],
    type: 'expense'
  },
  'G. Sales & Marketing': {
    subheads: ['Facebook Ads', 'Google Ads', 'Amazon Ads', 'Blinkit Ads', 'Agency Fees'],
    type: 'expense'
  },
  'H. Platform Costs': {
    subheads: ['Shopify Subscription', 'Wati Subscription', 'Shopflo subscription'],
    type: 'expense'
  },
  'I. Operating Expenses': {
    subheads: [
      'Salaries (Admin, Mgmt)',
      'Miscellaneous (Travel, insurance)',
      'Legal & CA expenses',
      'Platform Costs (CRM, inventory softwares)',
      'Administrative Expenses (Office Rent, utilities, admin supplies)'
    ],
    type: 'expense'
  },
  'J. Non-Operating': {
    subheads: ['Less: Interest Expense', 'Less: Depreciation', 'Less: Amortization', 'Less: Income Tax'],
    type: 'expense'
  },
  'X. Exclude': {
    subheads: ['Personal Expenses', 'Owner Withdrawals'],
    type: 'ignore'
  },
  'Z. Ignore': {
    subheads: ['GST Input/Output', 'TDS', 'Bank Transfers', 'Inter-company'],
    type: 'ignore'
  }
};

// ============================================
// AUTO-CLASSIFICATION
// ============================================

interface ClassificationResult {
  head: MISHead;
  subhead: string;
  confidence: 'high' | 'medium' | 'low';
  matchedPattern?: string;
}

function matchPattern(
  accountName: string,
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex' = 'contains'
): boolean {
  const normalizedAccount = accountName.toLowerCase().trim();
  const normalizedPattern = pattern.toLowerCase().trim();

  switch (matchType) {
    case 'exact':
      return normalizedAccount === normalizedPattern;
    case 'contains':
      return normalizedAccount.includes(normalizedPattern);
    case 'regex':
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(accountName);
      } catch {
        // Invalid regex, fallback to contains
        return normalizedAccount.includes(normalizedPattern);
      }
    default:
      return normalizedAccount.includes(normalizedPattern);
  }
}

export async function classifyTransaction(
  transaction: Transaction,
  customPatterns?: LearnedPattern[]
): Promise<ClassificationResult | null> {
  const accountName = transaction.account;

  // Load patterns
  const patterns = customPatterns || await getLearnedPatterns();

  // Filter for active patterns and sort by priority (lower = higher priority)
  const activePatterns = patterns
    .filter(p => p.active !== false) // Include patterns without active field for backwards compatibility
    .sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1));

  // Try to match against sorted patterns
  for (const pattern of activePatterns) {
    const matchType = pattern.matchType || 'contains'; // Default to contains for backwards compatibility
    if (matchPattern(accountName, pattern.pattern, matchType)) {
      // Determine confidence level from pattern or source
      let confidenceLevel: 'high' | 'medium' | 'low';
      if (pattern.confidence !== undefined) {
        // Use numeric confidence to determine level
        if (pattern.confidence >= 0.8) confidenceLevel = 'high';
        else if (pattern.confidence >= 0.5) confidenceLevel = 'medium';
        else confidenceLevel = 'low';
      } else {
        // Fallback based on source
        confidenceLevel = pattern.source === 'user' ? 'high' : 'medium';
      }

      return {
        head: pattern.head,
        subhead: pattern.subhead,
        confidence: confidenceLevel,
        matchedPattern: pattern.pattern
      };
    }
  }

  return null;
}

export async function classifyTransactions(
  transactions: Transaction[]
): Promise<{
  classified: ClassifiedTransaction[];
  unclassified: Transaction[];
  stats: {
    total: number;
    classified: number;
    unclassified: number;
    byHead: Record<string, number>;
  };
}> {
  const patterns = await getLearnedPatterns();
  const classified: ClassifiedTransaction[] = [];
  const unclassified: Transaction[] = [];
  const byHead: Record<string, number> = {};

  for (const transaction of transactions) {
    const result = await classifyTransaction(transaction, patterns);

    if (result) {
      classified.push({
        ...transaction,
        misHead: result.head,
        misSubhead: result.subhead,
        isAutoClassified: true,
        confidence: result.confidence,
        status: 'suggested',
        suggestedHead: result.head,
        suggestedSubhead: result.subhead
      });

      byHead[result.head] = (byHead[result.head] || 0) + 1;
    } else {
      unclassified.push(transaction);
    }
  }

  return {
    classified,
    unclassified,
    stats: {
      total: transactions.length,
      classified: classified.length,
      unclassified: unclassified.length,
      byHead
    }
  };
}

// ============================================
// MANUAL CLASSIFICATION HELPERS
// ============================================

export function getHeadOptions(): { head: MISHead; subheads: string[] }[] {
  return Object.entries(MIS_HEADS_CONFIG).map(([head, config]) => ({
    head: head as MISHead,
    subheads: config.subheads
  }));
}

export function getSubheadsForHead(head: MISHead): string[] {
  return MIS_HEADS_CONFIG[head]?.subheads || [];
}

// ============================================
// AGGREGATION BY HEAD
// ============================================

export interface HeadAggregation {
  head: MISHead;
  subheadTotals: Record<string, number>;
  total: number;
  transactionCount: number;
}

export function aggregateByHead(
  transactions: ClassifiedTransaction[]
): Record<MISHead, HeadAggregation> {
  const result: Partial<Record<MISHead, HeadAggregation>> = {};

  for (const transaction of transactions) {
    const head = transaction.misHead;
    const subhead = transaction.misSubhead;

    // Get the head type to determine which side to count
    const headConfig = MIS_HEADS_CONFIG[head];
    const headType = headConfig?.type || 'expense';

    // For expense heads: count DEBIT side only (money going out)
    // For revenue heads: count CREDIT side only (money coming in)
    // For ignore heads: count both (for transparency)
    let amount = 0;
    if (headType === 'expense') {
      amount = transaction.debit || 0;
    } else if (headType === 'revenue') {
      amount = transaction.credit || 0;
    } else {
      // ignore type - count both for display purposes
      amount = transaction.debit || transaction.credit || 0;
    }

    if (!result[head]) {
      result[head] = {
        head,
        subheadTotals: {},
        total: 0,
        transactionCount: 0
      };
    }

    // Only add to totals if there's an amount on the correct side
    if (amount > 0) {
      result[head]!.subheadTotals[subhead] = (result[head]!.subheadTotals[subhead] || 0) + amount;
      result[head]!.total += amount;
    }
    result[head]!.transactionCount += 1;
  }

  return result as Record<MISHead, HeadAggregation>;
}

// ============================================
// SIMPLE SYNCHRONOUS CLASSIFICATION
// For use by journalParser (no async pattern loading)
// ============================================

interface SimpleClassificationResult {
  headCode: string;
  subheadCode: string;
  headName: string;
  subheadName: string;
}

// Default classification patterns (used when no custom patterns loaded)
const DEFAULT_PATTERNS: { pattern: RegExp; head: MISHead; subhead: string }[] = [
  // COGM - Raw Materials
  { pattern: /opening\s*stock/i, head: 'E. COGM', subhead: 'Raw Materials & Inventory' },
  { pattern: /closing\s*stock/i, head: 'E. COGM', subhead: 'Raw Materials & Inventory' },
  { pattern: /purchase/i, head: 'E. COGM', subhead: 'Raw Materials & Inventory' },
  { pattern: /raw\s*material/i, head: 'E. COGM', subhead: 'Raw Materials & Inventory' },

  // COGM - Manufacturing
  { pattern: /job\s*work/i, head: 'E. COGM', subhead: 'Job work' },
  { pattern: /manufacturing\s*wage/i, head: 'E. COGM', subhead: 'Manufacturing Wages' },
  { pattern: /contract\s*wage/i, head: 'E. COGM', subhead: 'Contract Wages (Mfg)' },
  { pattern: /factory\s*rent/i, head: 'E. COGM', subhead: 'Factory Rent' },
  { pattern: /factory.*electric/i, head: 'E. COGM', subhead: 'Factory Electricity' },
  { pattern: /electricity.*water/i, head: 'E. COGM', subhead: 'Factory Electricity' },
  { pattern: /power\s*backup/i, head: 'E. COGM', subhead: 'Factory Electricity' },
  { pattern: /factory.*maintain/i, head: 'E. COGM', subhead: 'Factory Maintainence' },
  { pattern: /consumable/i, head: 'E. COGM', subhead: 'Raw Materials & Inventory' },

  // COGM - Transport
  { pattern: /freight/i, head: 'E. COGM', subhead: 'Inbound Transport' },
  { pattern: /inbound.*transport/i, head: 'E. COGM', subhead: 'Inbound Transport' },
  { pattern: /transport.*inward/i, head: 'E. COGM', subhead: 'Inbound Transport' },

  // Channel & Fulfillment
  { pattern: /amazon.*fee/i, head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees' },
  { pattern: /blinkit.*fee/i, head: 'F. Channel & Fulfillment', subhead: 'Blinkit Fees' },
  { pattern: /courier|shiprocket|delhivery/i, head: 'F. Channel & Fulfillment', subhead: 'D2C Fees' },

  // Sales & Marketing
  { pattern: /facebook.*ad|meta.*ad/i, head: 'G. Sales & Marketing', subhead: 'Facebook Ads' },
  { pattern: /google.*ad/i, head: 'G. Sales & Marketing', subhead: 'Google Ads' },
  { pattern: /amazon.*ad/i, head: 'G. Sales & Marketing', subhead: 'Amazon Ads' },
  { pattern: /blinkit.*ad/i, head: 'G. Sales & Marketing', subhead: 'Blinkit Ads' },
  { pattern: /agency|marketing.*agency/i, head: 'G. Sales & Marketing', subhead: 'Agency Fees' },

  // Platform Costs
  { pattern: /shopify/i, head: 'H. Platform Costs', subhead: 'Shopify Subscription' },
  { pattern: /wati/i, head: 'H. Platform Costs', subhead: 'Wati Subscription' },
  { pattern: /shopflo/i, head: 'H. Platform Costs', subhead: 'Shopflo subscription' },

  // Operating Expenses
  { pattern: /salary|salaries/i, head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)' },
  { pattern: /travel|insurance/i, head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel, insurance)' },
  { pattern: /legal|ca\s*fee|audit/i, head: 'I. Operating Expenses', subhead: 'Legal & CA expenses' },
  { pattern: /crm|inventory\s*software|busy/i, head: 'I. Operating Expenses', subhead: 'Platform Costs (CRM, inventory softwares)' },
  { pattern: /office\s*rent|admin.*expense|stationery/i, head: 'I. Operating Expenses', subhead: 'Administrative Expenses (Office Rent, utilities, admin supplies)' },

  // Non-Operating
  { pattern: /interest/i, head: 'J. Non-Operating', subhead: 'Less: Interest Expense' },
  { pattern: /depreciation/i, head: 'J. Non-Operating', subhead: 'Less: Depreciation' },
  { pattern: /amortization/i, head: 'J. Non-Operating', subhead: 'Less: Amortization' },
  { pattern: /income\s*tax/i, head: 'J. Non-Operating', subhead: 'Less: Income Tax' },

  // Ignore
  { pattern: /gst|cgst|sgst|igst/i, head: 'Z. Ignore', subhead: 'GST Input/Output' },
  { pattern: /^tds/i, head: 'Z. Ignore', subhead: 'TDS' },
  { pattern: /bank\s*transfer|neft|rtgs|imps/i, head: 'Z. Ignore', subhead: 'Bank Transfers' },
  { pattern: /inter.*company|heatronics/i, head: 'Z. Ignore', subhead: 'Inter-company' },

  // Exclude
  { pattern: /personal|owner.*withdraw/i, head: 'X. Exclude', subhead: 'Personal Expenses' },
];

/**
 * Simple synchronous classification for journal parser
 * Uses default patterns - no async pattern loading
 */
export function classifyTransactionSync(accountName: string, partyName?: string): SimpleClassificationResult {
  const name = accountName.toLowerCase().trim();

  // Try to match against default patterns
  for (const { pattern, head, subhead } of DEFAULT_PATTERNS) {
    if (pattern.test(name)) {
      return {
        headCode: head,
        subheadCode: subhead,
        headName: head,
        subheadName: subhead,
      };
    }
  }

  // Also check party name for classification hints
  if (partyName) {
    const party = partyName.toLowerCase();
    for (const { pattern, head, subhead } of DEFAULT_PATTERNS) {
      if (pattern.test(party)) {
        return {
          headCode: head,
          subheadCode: subhead,
          headName: head,
          subheadName: subhead,
        };
      }
    }
  }

  // Default: unclassified goes to Operating Expenses - Miscellaneous
  return {
    headCode: 'I. Operating Expenses',
    subheadCode: 'Miscellaneous (Travel, insurance)',
    headName: 'I. Operating Expenses',
    subheadName: 'Miscellaneous (Travel, insurance)',
  };
}

// ============================================
// EXTRACT AMOUNTS FOR MIS CALCULATION
// ============================================

export function extractMISAmounts(aggregation: Record<MISHead, HeadAggregation>): {
  cogm: {
    rawMaterialsInventory: number;
    manufacturingWages: number;
    contractWagesMfg: number;
    inboundTransport: number;
    factoryRent: number;
    factoryElectricity: number;
    factoryMaintenance: number;
    jobWork: number;
  };
  channelFulfillment: {
    amazonFees: number;
    blinkitFees: number;
    d2cFees: number;
  };
  salesMarketing: {
    facebookAds: number;
    googleAds: number;
    amazonAds: number;
    blinkitAds: number;
    agencyFees: number;
  };
  platformCosts: {
    shopifySubscription: number;
    watiSubscription: number;
    shopfloSubscription: number;
  };
  operatingExpenses: {
    salariesAdminMgmt: number;
    miscellaneous: number;
    legalCaExpenses: number;
    platformCostsCRM: number;
    administrativeExpenses: number;
  };
  nonOperating: {
    interestExpense: number;
    depreciation: number;
    amortization: number;
    incomeTax: number;
  };
} {
  const getSubheadTotal = (head: MISHead, subhead: string): number => {
    return aggregation[head]?.subheadTotals[subhead] || 0;
  };

  return {
    cogm: {
      rawMaterialsInventory: getSubheadTotal('E. COGM', 'Raw Materials & Inventory'),
      manufacturingWages: getSubheadTotal('E. COGM', 'Manufacturing Wages'),
      contractWagesMfg: getSubheadTotal('E. COGM', 'Contract Wages (Mfg)'),
      inboundTransport: getSubheadTotal('E. COGM', 'Inbound Transport'),
      factoryRent: getSubheadTotal('E. COGM', 'Factory Rent'),
      factoryElectricity: getSubheadTotal('E. COGM', 'Factory Electricity'),
      factoryMaintenance: getSubheadTotal('E. COGM', 'Factory Maintainence'),
      jobWork: getSubheadTotal('E. COGM', 'Job work')
    },
    channelFulfillment: {
      amazonFees: getSubheadTotal('F. Channel & Fulfillment', 'Amazon Fees'),
      blinkitFees: getSubheadTotal('F. Channel & Fulfillment', 'Blinkit Fees'),
      d2cFees: getSubheadTotal('F. Channel & Fulfillment', 'D2C Fees')
    },
    salesMarketing: {
      facebookAds: getSubheadTotal('G. Sales & Marketing', 'Facebook Ads'),
      googleAds: getSubheadTotal('G. Sales & Marketing', 'Google Ads'),
      amazonAds: getSubheadTotal('G. Sales & Marketing', 'Amazon Ads'),
      blinkitAds: getSubheadTotal('G. Sales & Marketing', 'Blinkit Ads'),
      agencyFees: getSubheadTotal('G. Sales & Marketing', 'Agency Fees')
    },
    platformCosts: {
      shopifySubscription: getSubheadTotal('H. Platform Costs', 'Shopify Subscription'),
      watiSubscription: getSubheadTotal('H. Platform Costs', 'Wati Subscription'),
      shopfloSubscription: getSubheadTotal('H. Platform Costs', 'Shopflo subscription')
    },
    operatingExpenses: {
      salariesAdminMgmt: getSubheadTotal('I. Operating Expenses', 'Salaries (Admin, Mgmt)'),
      miscellaneous: getSubheadTotal('I. Operating Expenses', 'Miscellaneous (Travel, insurance)'),
      legalCaExpenses: getSubheadTotal('I. Operating Expenses', 'Legal & CA expenses'),
      platformCostsCRM: getSubheadTotal('I. Operating Expenses', 'Platform Costs (CRM, inventory softwares)'),
      administrativeExpenses: getSubheadTotal('I. Operating Expenses', 'Administrative Expenses (Office Rent, utilities, admin supplies)')
    },
    nonOperating: {
      interestExpense: getSubheadTotal('J. Non-Operating', 'Less: Interest Expense'),
      depreciation: getSubheadTotal('J. Non-Operating', 'Less: Depreciation'),
      amortization: getSubheadTotal('J. Non-Operating', 'Less: Amortization'),
      incomeTax: getSubheadTotal('J. Non-Operating', 'Less: Income Tax')
    }
  };
}
