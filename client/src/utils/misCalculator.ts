// MIS Tracking - Calculation Engine
// Generates complete MIS from parsed data

import { IndianState } from '../types';
import {
  MISPeriod,
  MISRecord,
  StateUploadData,
  RevenueData,
  COGMData,
  ChannelFulfillmentData,
  SalesMarketingData,
  PlatformCostsData,
  OperatingExpensesData,
  NonOperatingData,
  StockTransfer,
  ChannelRevenue,
  ClassifiedTransaction,
  AggregatedBalanceSheetData,
  createEmptyChannelRevenue,
  createEmptyRevenueData,
  createEmptyCOGMData,
  periodToKey,
  TransactionsByHead,
  HeadWithTransactions,
  SubheadWithTransactions,
  TransactionRef,
  UnclassifiedTransaction,
  MISHead
} from '../types/misTracking';
import { classifyTransactions, aggregateByHead, extractMISAmounts, MIS_HEADS_CONFIG } from './misClassifier';

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

export async function calculateMIS(
  period: MISPeriod,
  stateData: Record<IndianState, StateUploadData | undefined>,
  selectedStates: IndianState[]
): Promise<MISRecord> {
  // Initialize record
  const record: MISRecord = {
    period,
    periodKey: periodToKey(period),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    states: selectedStates,

    // Revenue section
    revenue: createEmptyRevenueData(),

    // COGM section
    cogm: createEmptyCOGMData(),
    grossMargin: 0,
    grossMarginPercent: 0,

    // Channel & Fulfillment
    channelFulfillment: { amazonFees: 0, blinkitFees: 0, d2cFees: 0, total: 0 },
    cm1: 0,
    cm1Percent: 0,

    // Sales & Marketing
    salesMarketing: { facebookAds: 0, googleAds: 0, amazonAds: 0, blinkitAds: 0, agencyFees: 0, total: 0 },
    cm2: 0,
    cm2Percent: 0,

    // Platform Costs
    platformCosts: { shopifySubscription: 0, watiSubscription: 0, shopfloSubscription: 0, total: 0 },
    cm3: 0,
    cm3Percent: 0,

    // Operating Expenses
    operatingExpenses: { salariesAdminMgmt: 0, miscellaneous: 0, legalCaExpenses: 0, platformCostsCRM: 0, administrativeExpenses: 0, total: 0 },
    ebitda: 0,
    ebitdaPercent: 0,

    // Non-Operating
    nonOperating: { interestExpense: 0, depreciation: 0, amortization: 0, totalIDA: 0, incomeTax: 0 },
    ebt: 0,
    ebtPercent: 0,

    netIncome: 0,
    netIncomePercent: 0,

    // Classification data
    classifiedTransactions: [],
    unclassifiedCount: 0
  };

  // ============================================
  // STEP 1: Aggregate Revenue from Sales Registers
  // ============================================
  const revenue = aggregateSalesData(stateData, selectedStates);
  record.revenue = revenue;

  // ============================================
  // STEP 2: Classify Journal Transactions
  // ============================================
  const allTransactions = collectAllTransactions(stateData, selectedStates);
  const { classified, unclassified } = await classifyTransactions(allTransactions);

  record.classifiedTransactions = classified;
  record.unclassifiedCount = unclassified.length;

  // ============================================
  // STEP 3: Extract Expense Amounts from Classifications
  // ============================================
  const aggregation = aggregateByHead(classified);
  const extracted = extractMISAmounts(aggregation);

  // ============================================
  // STEP 4: Populate COGM
  // ============================================
  // Raw Materials & Inventory comes from Balance Sheet formula
  // Other COGM items come from journal classifications
  const bsData = aggregateBalanceSheetData(stateData, selectedStates);

  // Debug logging
  console.log('BS Data for COGM:', {
    bsData,
    openingStock: bsData?.openingStock,
    purchases: bsData?.purchases,
    closingStock: bsData?.closingStock,
    calculated: bsData ? (bsData.openingStock + bsData.purchases - bsData.closingStock) : 'N/A'
  });

  const rawMaterialsFromBS = bsData
    ? (bsData.openingStock + bsData.purchases - bsData.closingStock)
    : extracted.cogm.rawMaterialsInventory; // Fallback to journal if no BS data

  console.log('Raw Materials from BS:', rawMaterialsFromBS);

  record.cogm = {
    rawMaterialsInventory: rawMaterialsFromBS,
    manufacturingWages: extracted.cogm.manufacturingWages,
    contractWagesMfg: extracted.cogm.contractWagesMfg,
    inboundTransport: extracted.cogm.inboundTransport,
    factoryRent: extracted.cogm.factoryRent,
    factoryElectricity: extracted.cogm.factoryElectricity,
    factoryMaintenance: extracted.cogm.factoryMaintenance,
    jobWork: extracted.cogm.jobWork,
    totalCOGM: 0
  };
  record.cogm.totalCOGM = calculateTotal(record.cogm);

  // ============================================
  // STEP 5: Populate Channel & Fulfillment
  // ============================================
  record.channelFulfillment = {
    amazonFees: extracted.channelFulfillment.amazonFees,
    blinkitFees: extracted.channelFulfillment.blinkitFees,
    d2cFees: extracted.channelFulfillment.d2cFees,
    total: 0
  };
  record.channelFulfillment.total =
    record.channelFulfillment.amazonFees +
    record.channelFulfillment.blinkitFees +
    record.channelFulfillment.d2cFees;

  // ============================================
  // STEP 6: Populate Sales & Marketing
  // ============================================
  record.salesMarketing = {
    facebookAds: extracted.salesMarketing.facebookAds,
    googleAds: extracted.salesMarketing.googleAds,
    amazonAds: extracted.salesMarketing.amazonAds,
    blinkitAds: extracted.salesMarketing.blinkitAds,
    agencyFees: extracted.salesMarketing.agencyFees,
    total: 0
  };
  record.salesMarketing.total =
    record.salesMarketing.facebookAds +
    record.salesMarketing.googleAds +
    record.salesMarketing.amazonAds +
    record.salesMarketing.blinkitAds +
    record.salesMarketing.agencyFees;

  // ============================================
  // STEP 7: Populate Platform Costs
  // ============================================
  record.platformCosts = {
    shopifySubscription: extracted.platformCosts.shopifySubscription,
    watiSubscription: extracted.platformCosts.watiSubscription,
    shopfloSubscription: extracted.platformCosts.shopfloSubscription,
    total: 0
  };
  record.platformCosts.total =
    record.platformCosts.shopifySubscription +
    record.platformCosts.watiSubscription +
    record.platformCosts.shopfloSubscription;

  // ============================================
  // STEP 8: Populate Operating Expenses
  // ============================================
  record.operatingExpenses = {
    salariesAdminMgmt: extracted.operatingExpenses.salariesAdminMgmt,
    miscellaneous: extracted.operatingExpenses.miscellaneous,
    legalCaExpenses: extracted.operatingExpenses.legalCaExpenses,
    platformCostsCRM: extracted.operatingExpenses.platformCostsCRM,
    administrativeExpenses: extracted.operatingExpenses.administrativeExpenses,
    total: 0
  };
  record.operatingExpenses.total =
    record.operatingExpenses.salariesAdminMgmt +
    record.operatingExpenses.miscellaneous +
    record.operatingExpenses.legalCaExpenses +
    record.operatingExpenses.platformCostsCRM +
    record.operatingExpenses.administrativeExpenses;

  // ============================================
  // STEP 9: Populate Non-Operating
  // ============================================
  record.nonOperating = {
    interestExpense: extracted.nonOperating.interestExpense,
    depreciation: extracted.nonOperating.depreciation,
    amortization: extracted.nonOperating.amortization,
    totalIDA: 0,
    incomeTax: extracted.nonOperating.incomeTax
  };
  record.nonOperating.totalIDA =
    record.nonOperating.interestExpense +
    record.nonOperating.depreciation +
    record.nonOperating.amortization;

  // ============================================
  // STEP 10: Calculate Margins
  // ============================================
  const netRevenue = record.revenue.netRevenue;

  // Gross Margin = Net Revenue - COGM
  record.grossMargin = netRevenue - record.cogm.totalCOGM;
  record.grossMarginPercent = netRevenue > 0 ? (record.grossMargin / netRevenue) * 100 : 0;

  // CM1 = Gross Margin - Channel & Fulfillment
  record.cm1 = record.grossMargin - record.channelFulfillment.total;
  record.cm1Percent = netRevenue > 0 ? (record.cm1 / netRevenue) * 100 : 0;

  // CM2 = CM1 - Sales & Marketing
  record.cm2 = record.cm1 - record.salesMarketing.total;
  record.cm2Percent = netRevenue > 0 ? (record.cm2 / netRevenue) * 100 : 0;

  // CM3 = CM2 - Platform Costs
  record.cm3 = record.cm2 - record.platformCosts.total;
  record.cm3Percent = netRevenue > 0 ? (record.cm3 / netRevenue) * 100 : 0;

  // EBITDA = CM3 - Operating Expenses
  record.ebitda = record.cm3 - record.operatingExpenses.total;
  record.ebitdaPercent = netRevenue > 0 ? (record.ebitda / netRevenue) * 100 : 0;

  // EBT = EBITDA - Non-Operating (before tax)
  record.ebt = record.ebitda - record.nonOperating.totalIDA;
  record.ebtPercent = netRevenue > 0 ? (record.ebt / netRevenue) * 100 : 0;

  // Net Income = EBT - Income Tax
  record.netIncome = record.ebt - record.nonOperating.incomeTax;
  record.netIncomePercent = netRevenue > 0 ? (record.netIncome / netRevenue) * 100 : 0;

  // ============================================
  // STEP 11: Store Balance Sheet Data (already calculated in Step 4)
  // ============================================
  record.balanceSheet = bsData;

  // ============================================
  // STEP 12: Build Transaction Tracking for Drill-Down
  // ============================================
  const { transactionsByHead, unclassifiedTransactions, ignoredTotal, excludedTotal } =
    buildTransactionsByHead(classified, unclassified, bsData);

  record.transactionsByHead = transactionsByHead;
  record.unclassifiedTransactions = unclassifiedTransactions;
  record.ignoredTotal = ignoredTotal;
  record.excludedTotal = excludedTotal;

  return record;
}

// ============================================
// TRANSACTION TRACKING HELPER
// ============================================

function buildTransactionsByHead(
  classified: ClassifiedTransaction[],
  unclassified: import('../types').Transaction[],
  bsData?: AggregatedBalanceSheetData
): {
  transactionsByHead: TransactionsByHead;
  unclassifiedTransactions: UnclassifiedTransaction[];
  ignoredTotal: number;
  excludedTotal: number;
} {
  const transactionsByHead: TransactionsByHead = {};
  let ignoredTotal = 0;
  let excludedTotal = 0;

  // Group classified transactions by head and subhead
  for (const txn of classified) {
    const head = txn.misHead;
    const subhead = txn.misSubhead;

    // Get the head type to determine which side to count
    const headConfig = MIS_HEADS_CONFIG[head];
    const headType = headConfig?.type || 'expense';

    // For expense heads: count DEBIT side only (money going out)
    // For revenue heads: count CREDIT side only (money coming in)
    // For ignore heads: count both (for transparency in the display)
    let countableAmount = 0;
    if (headType === 'expense') {
      countableAmount = txn.debit || 0;
    } else if (headType === 'revenue') {
      countableAmount = txn.credit || 0;
    } else {
      // ignore type - count both for display purposes
      countableAmount = txn.debit || txn.credit || 0;
    }

    // IMPORTANT: Skip transactions that don't contribute to the head type
    // For expense heads: skip credit-only entries (like payments received)
    // For revenue heads: skip debit-only entries
    // This prevents showing B2C payment receipts under expense heads
    if (headType === 'expense' && (txn.debit || 0) === 0) {
      continue; // Skip credit-only entries for expense heads
    }
    if (headType === 'revenue' && (txn.credit || 0) === 0) {
      continue; // Skip debit-only entries for revenue heads
    }

    // Track ignored/excluded totals (use countable amount)
    if (head === 'Z. Ignore') {
      ignoredTotal += countableAmount;
    } else if (head === 'X. Exclude') {
      excludedTotal += countableAmount;
    }

    // Initialize head if not exists
    if (!transactionsByHead[head]) {
      transactionsByHead[head] = {
        head: head as MISHead,
        total: 0,
        transactionCount: 0,
        subheads: []
      };
    }

    // Find or create subhead
    let subheadEntry = transactionsByHead[head].subheads.find(s => s.subhead === subhead);
    if (!subheadEntry) {
      subheadEntry = {
        subhead,
        amount: 0,
        transactionCount: 0,
        transactions: [],
        source: 'journal'
      };
      transactionsByHead[head].subheads.push(subheadEntry);
    }

    // Create transaction reference - use the countable amount (not both debit/credit)
    const txnRef: TransactionRef = {
      id: txn.id,
      date: txn.date,
      account: txn.account,
      amount: countableAmount,
      type: txn.debit ? 'debit' : 'credit',
      source: 'journal',
      notes: txn.notes,
      originalHead: txn.misHead,
      originalSubhead: txn.misSubhead
    };

    // Add transaction to the list for display
    subheadEntry.transactions.push(txnRef);
    subheadEntry.transactionCount += 1;

    // Add to totals
    if (countableAmount > 0) {
      subheadEntry.amount += countableAmount;
      transactionsByHead[head].total += countableAmount;
    }
    transactionsByHead[head].transactionCount += 1;
  }

  // Add Balance Sheet derived data for COGM Raw Materials
  if (bsData && bsData.openingStock > 0) {
    const cogmHead = 'E. COGM';
    if (!transactionsByHead[cogmHead]) {
      transactionsByHead[cogmHead] = {
        head: cogmHead,
        total: 0,
        transactionCount: 0,
        subheads: []
      };
    }

    // Find or update Raw Materials subhead to mark as BS sourced
    let rawMatSubhead = transactionsByHead[cogmHead].subheads.find(
      s => s.subhead === 'Raw Materials & Inventory'
    );

    if (rawMatSubhead) {
      // Update source to balance_sheet
      rawMatSubhead.source = 'balance_sheet';
      // Clear journal transactions since we're using BS data
      const bsAmount = bsData.openingStock + bsData.purchases - bsData.closingStock;
      rawMatSubhead.amount = bsAmount;
      rawMatSubhead.transactions = [
        {
          id: 'bs-opening-stock',
          date: '',
          account: 'Opening Stock (Balance Sheet)',
          amount: bsData.openingStock,
          type: 'debit',
          source: 'balance_sheet'
        },
        {
          id: 'bs-purchases',
          date: '',
          account: 'Add: Purchases (Balance Sheet)',
          amount: bsData.purchases,
          type: 'debit',
          source: 'balance_sheet'
        },
        {
          id: 'bs-closing-stock',
          date: '',
          account: 'Less: Closing Stock (Balance Sheet)',
          amount: -bsData.closingStock,
          type: 'credit',
          source: 'balance_sheet'
        }
      ];
      rawMatSubhead.transactionCount = 3;
    } else {
      // Create new Raw Materials subhead from BS
      const bsAmount = bsData.openingStock + bsData.purchases - bsData.closingStock;
      transactionsByHead[cogmHead].subheads.unshift({
        subhead: 'Raw Materials & Inventory',
        amount: bsAmount,
        transactionCount: 3,
        source: 'balance_sheet',
        transactions: [
          {
            id: 'bs-opening-stock',
            date: '',
            account: 'Opening Stock (Balance Sheet)',
            amount: bsData.openingStock,
            type: 'debit',
            source: 'balance_sheet'
          },
          {
            id: 'bs-purchases',
            date: '',
            account: 'Add: Purchases (Balance Sheet)',
            amount: bsData.purchases,
            type: 'debit',
            source: 'balance_sheet'
          },
          {
            id: 'bs-closing-stock',
            date: '',
            account: 'Less: Closing Stock (Balance Sheet)',
            amount: -bsData.closingStock,
            type: 'credit',
            source: 'balance_sheet'
          }
        ]
      });
    }
  }

  // Build unclassified transactions list
  const unclassifiedTransactions: UnclassifiedTransaction[] = unclassified.map(txn => ({
    id: txn.id,
    date: txn.date,
    account: txn.account,
    amount: txn.debit || txn.credit || 0,
    type: txn.debit ? 'debit' : 'credit',
    source: 'journal' as const
  }));

  return {
    transactionsByHead,
    unclassifiedTransactions,
    ignoredTotal,
    excludedTotal
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function aggregateSalesData(
  stateData: Record<IndianState, StateUploadData | undefined>,
  selectedStates: IndianState[]
): RevenueData {
  const revenue: RevenueData = createEmptyRevenueData();
  const stockTransfers: StockTransfer[] = [];

  for (const state of selectedStates) {
    const data = stateData[state];
    if (!data?.salesData) continue;

    const sales = data.salesData;

    // Aggregate gross revenue by channel
    revenue.grossRevenue.Website += sales.salesByChannel.Website;
    revenue.grossRevenue.Amazon += sales.salesByChannel.Amazon;
    revenue.grossRevenue.Blinkit += sales.salesByChannel.Blinkit;
    revenue.grossRevenue['Offline & OEM'] += sales.salesByChannel['Offline & OEM'];

    // Aggregate returns by channel
    revenue.returns.Website += sales.returnsByChannel.Website;
    revenue.returns.Amazon += sales.returnsByChannel.Amazon;
    revenue.returns.Blinkit += sales.returnsByChannel.Blinkit;
    revenue.returns['Offline & OEM'] += sales.returnsByChannel['Offline & OEM'];

    // Aggregate taxes by channel
    revenue.taxes.Website += sales.taxesByChannel.Website;
    revenue.taxes.Amazon += sales.taxesByChannel.Amazon;
    revenue.taxes.Blinkit += sales.taxesByChannel.Blinkit;
    revenue.taxes['Offline & OEM'] += sales.taxesByChannel['Offline & OEM'];

    // Track stock transfers
    if (sales.stockTransfers > 0) {
      // Get stock transfer details from line items
      const transferItems = sales.lineItems.filter(item => item.isStockTransfer);
      for (const item of transferItems) {
        // Always count stock transfers, even if toState is unknown
        stockTransfers.push({
          fromState: state,
          toState: item.toState || 'Unknown',  // Default to 'Unknown' if state not detected
          amount: item.amount
        });
      }
    }
  }

  // Calculate totals
  revenue.totalGrossRevenue = sumChannelRevenue(revenue.grossRevenue);
  revenue.totalReturns = sumChannelRevenue(revenue.returns);
  revenue.totalTaxes = sumChannelRevenue(revenue.taxes);
  revenue.totalDiscounts = 0; // Ignored for now
  revenue.stockTransfers = stockTransfers;
  revenue.totalStockTransfers = stockTransfers.reduce((sum, t) => sum + t.amount, 0);

  // Calculate net values
  // Total Revenue = Gross Revenue - Returns - Discounts (Stock transfers already excluded)
  revenue.totalRevenue = revenue.totalGrossRevenue - revenue.totalReturns - revenue.totalDiscounts;

  // Net Revenue = Total Revenue - Taxes
  revenue.netRevenue = revenue.totalRevenue - revenue.totalTaxes;

  return revenue;
}

function collectAllTransactions(
  stateData: Record<IndianState, StateUploadData | undefined>,
  selectedStates: IndianState[]
): import('../types').Transaction[] {
  const transactions: import('../types').Transaction[] = [];

  for (const state of selectedStates) {
    const data = stateData[state];
    if (!data?.journalTransactions) continue;

    transactions.push(...data.journalTransactions);
  }

  return transactions;
}

function sumChannelRevenue(channel: ChannelRevenue): number {
  return channel.Website + channel.Amazon + channel.Blinkit + channel['Offline & OEM'];
}

function calculateTotal(cogm: COGMData): number {
  return (
    cogm.rawMaterialsInventory +
    cogm.manufacturingWages +
    cogm.contractWagesMfg +
    cogm.inboundTransport +
    cogm.factoryRent +
    cogm.factoryElectricity +
    cogm.factoryMaintenance +
    cogm.jobWork
  );
}

// Aggregate Balance Sheet data from selected states for reconciliation
// IMPORTANT: COGM (Opening Stock, Purchases, Closing Stock) ALL come from UP only
// as UP is the main warehouse/manufacturing facility. Other states receive stock via transfers.
// grossSales and netProfitLoss are summed from all selected states for reporting.
function aggregateBalanceSheetData(
  stateData: Record<IndianState, StateUploadData | undefined>,
  selectedStates: IndianState[]
): AggregatedBalanceSheetData | undefined {
  const aggregated: AggregatedBalanceSheetData = {
    openingStock: 0,
    closingStock: 0,
    purchases: 0,
    grossSales: 0,
    netSales: 0,
    grossProfit: 0,
    netProfitLoss: 0,
    calculatedCOGS: 0
  };

  console.log('=== aggregateBalanceSheetData Debug ===');
  console.log('Selected states:', selectedStates);

  // COGM values ALWAYS come from UP only (main warehouse)
  const upData = stateData['UP'];
  console.log('UP stateData:', upData);
  console.log('UP balanceSheetData (RAW):', upData?.balanceSheetData);

  if (upData?.balanceSheetData) {
    // Log the raw values BEFORE assignment to catch any issues
    console.log('RAW UP BS field values:', {
      'upData.balanceSheetData.openingStock': upData.balanceSheetData.openingStock,
      'upData.balanceSheetData.purchases': upData.balanceSheetData.purchases,
      'upData.balanceSheetData.closingStock': upData.balanceSheetData.closingStock,
    });

    aggregated.openingStock = upData.balanceSheetData.openingStock || 0;
    aggregated.closingStock = upData.balanceSheetData.closingStock || 0;
    aggregated.purchases = upData.balanceSheetData.purchases || 0;
    console.log('UP BS values (used for COGM):', {
      openingStock: aggregated.openingStock,
      closingStock: aggregated.closingStock,
      purchases: aggregated.purchases
    });
  }

  // Sum grossSales, netProfitLoss from selected states (for reporting)
  let hasAnyData = false;
  for (const state of selectedStates) {
    const data = stateData[state];
    if (!data?.balanceSheetData) continue;

    hasAnyData = true;
    aggregated.grossSales += data.balanceSheetData.grossSales || 0;
    aggregated.netSales += data.balanceSheetData.netSales || 0;
    aggregated.grossProfit += data.balanceSheetData.grossProfit || 0;
    aggregated.netProfitLoss += data.balanceSheetData.netProfitLoss || 0;

    console.log(`State ${state} BS values:`, {
      grossSales: data.balanceSheetData.grossSales,
      netProfitLoss: data.balanceSheetData.netProfitLoss
    });
  }

  // If UP has data, we have COGM data even if no selected state has BS data
  if (upData?.balanceSheetData) {
    hasAnyData = true;
  }

  if (!hasAnyData) {
    console.log('No BS data found - returning undefined');
    return undefined;
  }

  // Calculate COGS from Balance Sheet formula: Opening Stock + Purchases - Closing Stock
  aggregated.calculatedCOGS = aggregated.openingStock + aggregated.purchases - aggregated.closingStock;

  console.log('Aggregated BS result:', aggregated);
  console.log('=== End aggregateBalanceSheetData Debug ===');

  return aggregated;
}

// ============================================
// FORMATTING UTILITIES
// ============================================

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 10000000) {
    // Crores
    return `${sign}₹${(absAmount / 10000000).toFixed(2)} Cr`;
  } else if (absAmount >= 100000) {
    // Lakhs
    return `${sign}₹${(absAmount / 100000).toFixed(2)} L`;
  } else if (absAmount >= 1000) {
    // Thousands
    return `${sign}₹${(absAmount / 1000).toFixed(2)} K`;
  } else {
    return `${sign}₹${absAmount.toFixed(2)}`;
  }
}

export function formatCurrencyFull(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  return `${sign}₹${absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatPercent(value: number): string {
  const sign = value < 0 ? '' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// ============================================
// COMPARISON UTILITIES
// ============================================

export function calculateChange(current: number, previous: number): {
  absolute: number;
  percent: number;
  direction: 'up' | 'down' | 'flat';
} {
  const absolute = current - previous;
  const percent = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  const direction = absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat';

  return { absolute, percent, direction };
}
