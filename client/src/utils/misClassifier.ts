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

function matchPattern(accountName: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern, 'i');
    return regex.test(accountName);
  } catch {
    // Fallback to simple includes
    return accountName.toLowerCase().includes(pattern.toLowerCase());
  }
}

export async function classifyTransaction(
  transaction: Transaction,
  customPatterns?: LearnedPattern[]
): Promise<ClassificationResult | null> {
  const accountName = transaction.account;

  // Load patterns
  const patterns = customPatterns || await getLearnedPatterns();

  // Try to match against patterns (user patterns first, then system)
  const userPatterns = patterns.filter(p => p.source === 'user');
  const systemPatterns = patterns.filter(p => p.source === 'system');

  // Check user patterns first (higher priority)
  for (const pattern of userPatterns) {
    if (matchPattern(accountName, pattern.pattern)) {
      return {
        head: pattern.head,
        subhead: pattern.subhead,
        confidence: 'high',
        matchedPattern: pattern.pattern
      };
    }
  }

  // Check system patterns
  for (const pattern of systemPatterns) {
    if (matchPattern(accountName, pattern.pattern)) {
      return {
        head: pattern.head,
        subhead: pattern.subhead,
        confidence: 'medium',
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
    const amount = transaction.debit || transaction.credit || 0;

    if (!result[head]) {
      result[head] = {
        head,
        subheadTotals: {},
        total: 0,
        transactionCount: 0
      };
    }

    result[head]!.subheadTotals[subhead] = (result[head]!.subheadTotals[subhead] || 0) + amount;
    result[head]!.total += amount;
    result[head]!.transactionCount += 1;
  }

  return result as Record<MISHead, HeadAggregation>;
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
