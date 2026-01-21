// MIS Tracking - Calculation Engine
// Generates complete MIS from parsed data
// Uses Balance Sheet (Trading + P&L) for expenses instead of Journal

import { IndianState } from '../types';
import {
  MISPeriod,
  MISRecord,
  StateUploadData,
  RevenueData,
  COGMData,
  StockTransfer,
  ChannelRevenue,
  AggregatedBalanceSheetData,
  createEmptyChannelRevenue,
  createEmptyRevenueData,
  createEmptyCOGMData,
  periodToKey,
  TransactionsByHead,
  HeadWithTransactions,
  SubheadWithTransactions,
  TransactionRef,
  MISHead
} from '../types/misTracking';
import { EnhancedBalanceSheetData } from '../types/balanceSheet';
import { MIS_HEADS_CONFIG } from './misClassifier';
import {
  parseBalanceSheetEnhanced,
  extractCOGMFromBalanceSheet,
  extractChannelFromBalanceSheet,
  extractMarketingFromBalanceSheet,
  extractPlatformFromBalanceSheet,
  extractOperatingFromBalanceSheet,
  extractNonOperatingFromBalanceSheet,
  getIgnoredExcludedTotals
} from './balanceSheetParser';

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
    salesMarketing: { facebookAds: 0, googleAds: 0, amazonAds: 0, blinkitAds: 0, agencyFees: 0, advertisingMarketing: 0, total: 0 },
    cm2: 0,
    cm2Percent: 0,

    // Platform Costs
    platformCosts: { shopifySubscription: 0, watiSubscription: 0, shopfloSubscription: 0, total: 0 },
    cm3: 0,
    cm3Percent: 0,

    // Operating Expenses
    operatingExpenses: { salariesAdminMgmt: 0, miscellaneous: 0, legalCaExpenses: 0, platformCostsCRM: 0, administrativeExpenses: 0, staffWelfareEvents: 0, banksFinanceCharges: 0, otherOperatingExpenses: 0, total: 0 },
    ebitda: 0,
    ebitdaPercent: 0,

    // Non-Operating
    nonOperating: { interestExpense: 0, depreciation: 0, amortization: 0, totalIDA: 0, incomeTax: 0 },
    ebt: 0,
    ebtPercent: 0,

    netIncome: 0,
    netIncomePercent: 0,

    // Classification data (now from balance sheet)
    classifiedTransactions: [],
    unclassifiedCount: 0
  };

  // ============================================
  // STEP 1: Aggregate Revenue from Sales Registers
  // ============================================
  const revenue = aggregateSalesData(stateData, selectedStates);
  record.revenue = revenue;

  // ============================================
  // STEP 2: Aggregate Balance Sheet Data for Key Figures
  // ============================================
  const bsData = aggregateBalanceSheetData(stateData, selectedStates);
  record.balanceSheet = bsData;

  // ============================================
  // STEP 3: Extract Expenses from Balance Sheet
  // Aggregate expenses from all states' balance sheets
  // ============================================
  const aggregatedExpenses = aggregateExpensesFromBalanceSheets(stateData, selectedStates);

  // ============================================
  // STEP 4: Populate COGM
  // Raw Materials from UP Balance Sheet (Opening + Purchases - Closing)
  // Other COGM items from aggregated balance sheet expenses
  // ============================================

  // Raw materials ONLY from UP (main warehouse)
  const rawMaterialsFromBS = bsData
    ? (bsData.openingStock + bsData.purchases - bsData.closingStock)
    : 0;

  console.log('COGM Calculation:', {
    openingStock: bsData?.openingStock,
    purchases: bsData?.purchases,
    closingStock: bsData?.closingStock,
    rawMaterialsFromBS,
    otherCOGMFromBS: aggregatedExpenses.cogm
  });

  record.cogm = {
    rawMaterialsInventory: rawMaterialsFromBS,
    manufacturingWages: aggregatedExpenses.cogm.manufacturingWages,
    contractWagesMfg: aggregatedExpenses.cogm.contractWagesMfg,
    inboundTransport: aggregatedExpenses.cogm.inboundTransport,
    factoryRent: aggregatedExpenses.cogm.factoryRent,
    factoryElectricity: aggregatedExpenses.cogm.factoryElectricity,
    factoryMaintenance: aggregatedExpenses.cogm.factoryMaintenance,
    jobWork: aggregatedExpenses.cogm.jobWork,
    totalCOGM: 0
  };
  record.cogm.totalCOGM = calculateTotal(record.cogm);

  // ============================================
  // STEP 5: Populate Channel & Fulfillment
  // ============================================
  record.channelFulfillment = {
    amazonFees: aggregatedExpenses.channel.amazonFees,
    blinkitFees: aggregatedExpenses.channel.blinkitFees,
    d2cFees: aggregatedExpenses.channel.d2cFees,
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
    facebookAds: aggregatedExpenses.marketing.facebookAds,
    googleAds: aggregatedExpenses.marketing.googleAds,
    amazonAds: aggregatedExpenses.marketing.amazonAds,
    blinkitAds: aggregatedExpenses.marketing.blinkitAds,
    agencyFees: aggregatedExpenses.marketing.agencyFees,
    advertisingMarketing: aggregatedExpenses.marketing.advertisingMarketing,
    total: 0
  };
  record.salesMarketing.total =
    record.salesMarketing.facebookAds +
    record.salesMarketing.googleAds +
    record.salesMarketing.amazonAds +
    record.salesMarketing.blinkitAds +
    record.salesMarketing.agencyFees +
    record.salesMarketing.advertisingMarketing;

  // ============================================
  // STEP 7: Populate Platform Costs
  // ============================================
  record.platformCosts = {
    shopifySubscription: aggregatedExpenses.platform.shopifySubscription,
    watiSubscription: aggregatedExpenses.platform.watiSubscription,
    shopfloSubscription: aggregatedExpenses.platform.shopfloSubscription,
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
    salariesAdminMgmt: aggregatedExpenses.operating.salariesAdminMgmt,
    miscellaneous: aggregatedExpenses.operating.miscellaneous,
    legalCaExpenses: aggregatedExpenses.operating.legalCaExpenses,
    platformCostsCRM: aggregatedExpenses.operating.platformCostsCRM,
    administrativeExpenses: aggregatedExpenses.operating.administrativeExpenses,
    staffWelfareEvents: aggregatedExpenses.operating.staffWelfareEvents,
    banksFinanceCharges: aggregatedExpenses.operating.banksFinanceCharges,
    otherOperatingExpenses: aggregatedExpenses.operating.otherOperatingExpenses,
    total: 0
  };
  record.operatingExpenses.total =
    record.operatingExpenses.salariesAdminMgmt +
    record.operatingExpenses.miscellaneous +
    record.operatingExpenses.legalCaExpenses +
    record.operatingExpenses.platformCostsCRM +
    record.operatingExpenses.administrativeExpenses +
    record.operatingExpenses.staffWelfareEvents +
    record.operatingExpenses.banksFinanceCharges +
    record.operatingExpenses.otherOperatingExpenses;

  // ============================================
  // STEP 9: Populate Non-Operating
  // ============================================
  record.nonOperating = {
    interestExpense: aggregatedExpenses.nonOperating.interestExpense,
    depreciation: aggregatedExpenses.nonOperating.depreciation,
    amortization: aggregatedExpenses.nonOperating.amortization,
    totalIDA: 0,
    incomeTax: aggregatedExpenses.nonOperating.incomeTax
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
  // STEP 11: Build Transaction Tracking for Drill-Down
  // ============================================
  const { transactionsByHead, ignoredTotal, excludedTotal } =
    buildTransactionsByHead(aggregatedExpenses, bsData);

  record.transactionsByHead = transactionsByHead;
  record.ignoredTotal = ignoredTotal;
  record.excludedTotal = excludedTotal;

  return record;
}

// ============================================
// AGGREGATE EXPENSES FROM BALANCE SHEETS
// ============================================

interface AggregatedExpenses {
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
  channel: {
    amazonFees: number;
    blinkitFees: number;
    d2cFees: number;
  };
  marketing: {
    facebookAds: number;
    googleAds: number;
    amazonAds: number;
    blinkitAds: number;
    agencyFees: number;
    advertisingMarketing: number;
  };
  platform: {
    shopifySubscription: number;
    watiSubscription: number;
    shopfloSubscription: number;
  };
  operating: {
    salariesAdminMgmt: number;
    miscellaneous: number;
    legalCaExpenses: number;
    platformCostsCRM: number;
    administrativeExpenses: number;
    staffWelfareEvents: number;
    banksFinanceCharges: number;
    otherOperatingExpenses: number;
  };
  nonOperating: {
    interestExpense: number;
    depreciation: number;
    amortization: number;
    incomeTax: number;
  };
  ignoredTotal: number;
  excludedTotal: number;
  enhancedBSData: EnhancedBalanceSheetData[];
}

function aggregateExpensesFromBalanceSheets(
  stateData: Record<IndianState, StateUploadData | undefined>,
  selectedStates: IndianState[]
): AggregatedExpenses {
  const result: AggregatedExpenses = {
    cogm: {
      rawMaterialsInventory: 0,
      manufacturingWages: 0,
      contractWagesMfg: 0,
      inboundTransport: 0,
      factoryRent: 0,
      factoryElectricity: 0,
      factoryMaintenance: 0,
      jobWork: 0
    },
    channel: { amazonFees: 0, blinkitFees: 0, d2cFees: 0 },
    marketing: { facebookAds: 0, googleAds: 0, amazonAds: 0, blinkitAds: 0, agencyFees: 0, advertisingMarketing: 0 },
    platform: { shopifySubscription: 0, watiSubscription: 0, shopfloSubscription: 0 },
    operating: { salariesAdminMgmt: 0, miscellaneous: 0, legalCaExpenses: 0, platformCostsCRM: 0, administrativeExpenses: 0, staffWelfareEvents: 0, banksFinanceCharges: 0, otherOperatingExpenses: 0 },
    nonOperating: { interestExpense: 0, depreciation: 0, amortization: 0, incomeTax: 0 },
    ignoredTotal: 0,
    excludedTotal: 0,
    enhancedBSData: []
  };

  console.log('=== Aggregating Expenses from Balance Sheets ===');

  for (const state of selectedStates) {
    const data = stateData[state];
    if (!data?.enhancedBalanceSheetData) {
      console.log(`State ${state}: No enhanced balance sheet data`);
      continue;
    }

    const bsData = data.enhancedBalanceSheetData;
    result.enhancedBSData.push(bsData);

    console.log(`State ${state}: Processing enhanced balance sheet with ${bsData.mappedItems.length} mapped items`);

    // Extract and aggregate COGM (except raw materials which comes from UP only)
    const cogm = extractCOGMFromBalanceSheet(bsData);
    result.cogm.manufacturingWages += cogm.manufacturingWages;
    result.cogm.contractWagesMfg += cogm.contractWagesMfg;
    result.cogm.inboundTransport += cogm.inboundTransport;
    result.cogm.factoryRent += cogm.factoryRent;
    result.cogm.factoryElectricity += cogm.factoryElectricity;
    result.cogm.factoryMaintenance += cogm.factoryMaintenance;
    result.cogm.jobWork += cogm.jobWork;

    // Extract and aggregate Channel & Fulfillment
    const channel = extractChannelFromBalanceSheet(bsData);
    result.channel.amazonFees += channel.amazonFees;
    result.channel.blinkitFees += channel.blinkitFees;
    result.channel.d2cFees += channel.d2cFees;

    // Extract and aggregate Sales & Marketing
    const marketing = extractMarketingFromBalanceSheet(bsData);
    result.marketing.facebookAds += marketing.facebookAds;
    result.marketing.googleAds += marketing.googleAds;
    result.marketing.amazonAds += marketing.amazonAds;
    result.marketing.blinkitAds += marketing.blinkitAds;
    result.marketing.agencyFees += marketing.agencyFees;
    result.marketing.advertisingMarketing += marketing.advertisingMarketing;

    // Extract and aggregate Platform Costs
    const platform = extractPlatformFromBalanceSheet(bsData);
    result.platform.shopifySubscription += platform.shopifySubscription;
    result.platform.watiSubscription += platform.watiSubscription;
    result.platform.shopfloSubscription += platform.shopfloSubscription;

    // Extract and aggregate Operating Expenses
    const operating = extractOperatingFromBalanceSheet(bsData);
    result.operating.salariesAdminMgmt += operating.salariesAdminMgmt;
    result.operating.miscellaneous += operating.miscellaneous;
    result.operating.legalCaExpenses += operating.legalCaExpenses;
    result.operating.platformCostsCRM += operating.platformCostsCRM;
    result.operating.administrativeExpenses += operating.administrativeExpenses;
    result.operating.staffWelfareEvents += operating.staffWelfareEvents;
    result.operating.banksFinanceCharges += operating.banksFinanceCharges;
    result.operating.otherOperatingExpenses += operating.otherOperatingExpenses;

    // Extract and aggregate Non-Operating
    const nonOp = extractNonOperatingFromBalanceSheet(bsData);
    result.nonOperating.interestExpense += nonOp.interestExpense;
    result.nonOperating.depreciation += nonOp.depreciation;
    result.nonOperating.amortization += nonOp.amortization;
    result.nonOperating.incomeTax += nonOp.incomeTax;

    // Get ignored/excluded totals
    const { ignoredTotal, excludedTotal } = getIgnoredExcludedTotals(bsData);
    result.ignoredTotal += ignoredTotal;
    result.excludedTotal += excludedTotal;

    console.log(`State ${state} expenses:`, {
      channel: channel,
      marketing: marketing,
      operating: operating
    });
  }

  console.log('=== Aggregated Expenses Total ===', result);

  return result;
}

// ============================================
// TRANSACTION TRACKING HELPER
// ============================================

function buildTransactionsByHead(
  aggregatedExpenses: AggregatedExpenses,
  bsData?: AggregatedBalanceSheetData
): {
  transactionsByHead: TransactionsByHead;
  ignoredTotal: number;
  excludedTotal: number;
} {
  const transactionsByHead: TransactionsByHead = {};

  // Build from enhanced balance sheet data
  for (const bsEnhanced of aggregatedExpenses.enhancedBSData) {
    for (const item of bsEnhanced.mappedItems) {
      if (!item.head || !item.subhead) continue;

      const head = item.head;
      const subhead = item.subhead;

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
          source: 'balance_sheet'
        };
        transactionsByHead[head].subheads.push(subheadEntry);
      }

      // Create transaction reference
      const txnRef: TransactionRef = {
        id: item.id,
        date: '',
        account: item.accountName,
        amount: item.amount,
        type: item.side === 'debit' ? 'debit' : 'credit',
        source: 'balance_sheet',
        notes: `${item.section} account`,
        originalHead: item.head,
        originalSubhead: item.subhead
      };

      // Add transaction
      subheadEntry.transactions.push(txnRef);
      subheadEntry.transactionCount += 1;
      subheadEntry.amount += item.amount;
      transactionsByHead[head].total += item.amount;
      transactionsByHead[head].transactionCount += 1;
    }
  }

  // Add Balance Sheet COGM Raw Materials entry
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

    const bsAmount = bsData.openingStock + bsData.purchases - bsData.closingStock;

    // Add or update Raw Materials subhead
    let rawMatSubhead = transactionsByHead[cogmHead].subheads.find(
      s => s.subhead === 'Raw Materials & Inventory'
    );

    if (!rawMatSubhead) {
      rawMatSubhead = {
        subhead: 'Raw Materials & Inventory',
        amount: bsAmount,
        transactionCount: 3,
        source: 'balance_sheet',
        transactions: []
      };
      transactionsByHead[cogmHead].subheads.unshift(rawMatSubhead);
    }

    // Set balance sheet breakdown
    rawMatSubhead.source = 'balance_sheet';
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
  }

  return {
    transactionsByHead,
    ignoredTotal: aggregatedExpenses.ignoredTotal,
    excludedTotal: aggregatedExpenses.excludedTotal
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
      const transferItems = sales.lineItems.filter(item => item.isStockTransfer);
      for (const item of transferItems) {
        stockTransfers.push({
          fromState: state,
          toState: item.toState || 'Unknown',
          amount: item.amount
        });
      }
    }
  }

  // Calculate totals
  revenue.totalGrossRevenue = sumChannelRevenue(revenue.grossRevenue);
  revenue.totalReturns = sumChannelRevenue(revenue.returns);
  revenue.totalTaxes = sumChannelRevenue(revenue.taxes);
  revenue.totalDiscounts = 0;
  revenue.stockTransfers = stockTransfers;
  revenue.totalStockTransfers = stockTransfers.reduce((sum, t) => sum + t.amount, 0);

  // Calculate net values
  revenue.totalRevenue = revenue.totalGrossRevenue - revenue.totalReturns - revenue.totalDiscounts;
  revenue.netRevenue = revenue.totalRevenue - revenue.totalTaxes;

  return revenue;
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

  // COGM values ALWAYS come from UP only (main warehouse)
  const upData = stateData['UP'];

  if (upData?.balanceSheetData) {
    aggregated.openingStock = upData.balanceSheetData.openingStock || 0;
    aggregated.closingStock = upData.balanceSheetData.closingStock || 0;
    aggregated.purchases = upData.balanceSheetData.purchases || 0;
    console.log('UP BS values (used for COGM):', {
      openingStock: aggregated.openingStock,
      closingStock: aggregated.closingStock,
      purchases: aggregated.purchases
    });
  }

  // Sum grossSales, netProfitLoss from selected states
  let hasAnyData = false;
  for (const state of selectedStates) {
    const data = stateData[state];
    if (!data?.balanceSheetData) continue;

    hasAnyData = true;
    aggregated.grossSales += data.balanceSheetData.grossSales || 0;
    aggregated.netSales += data.balanceSheetData.netSales || 0;
    aggregated.grossProfit += data.balanceSheetData.grossProfit || 0;
    aggregated.netProfitLoss += data.balanceSheetData.netProfitLoss || 0;
  }

  if (upData?.balanceSheetData) {
    hasAnyData = true;
  }

  if (!hasAnyData) {
    return undefined;
  }

  // Calculate COGS from Balance Sheet
  aggregated.calculatedCOGS = aggregated.openingStock + aggregated.purchases - aggregated.closingStock;

  console.log('Aggregated BS result:', aggregated);

  return aggregated;
}

// ============================================
// FORMATTING UTILITIES
// ============================================

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 10000000) {
    return `${sign}₹${(absAmount / 10000000).toFixed(2)} Cr`;
  } else if (absAmount >= 100000) {
    return `${sign}₹${(absAmount / 100000).toFixed(2)} L`;
  } else if (absAmount >= 1000) {
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
  return `${value.toFixed(2)}%`;
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
