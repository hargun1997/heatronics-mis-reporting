// State Data Store
// Central storage for state-level MIS data with aggregation functions

import {
  StateName,
  STATE_NAMES,
  StateMonthData,
  StateBalanceSheet,
  StateSalesRegister,
  StatePurchaseRegister,
  StateJournalRegister,
  MonthlyMISData,
  MonthlyMISAggregated,
  RangeMISData,
  JournalEntry,
  makeStateDataKey,
  FileType
} from '../types/stateData';

// ============================================
// IN-MEMORY STORE
// ============================================

// Key format: "YYYY-MM:STATE" -> StateMonthData
const stateDataStore: Map<string, StateMonthData> = new Map();

// ============================================
// STORAGE FUNCTIONS
// ============================================

function getStateKey(month: string, state: StateName): string {
  return `${month}:${state}`;
}

export function getStateData(month: string, state: StateName): StateMonthData | undefined {
  return stateDataStore.get(getStateKey(month, state));
}

export function getOrCreateStateData(month: string, state: StateName): StateMonthData {
  const key = getStateKey(month, state);
  let data = stateDataStore.get(key);
  if (!data) {
    data = { state, month };
    stateDataStore.set(key, data);
  }
  return data;
}

export function storeBalanceSheet(month: string, state: StateName, bs: StateBalanceSheet): void {
  const data = getOrCreateStateData(month, state);
  data.balanceSheet = bs;
  data.bsUploadedAt = new Date().toISOString();
  console.log(`[StateDataStore] Stored BS for ${month}:${state}`, bs);
}

export function storeSalesRegister(month: string, state: StateName, sr: StateSalesRegister): void {
  const data = getOrCreateStateData(month, state);
  data.salesRegister = sr;
  data.srUploadedAt = new Date().toISOString();
  console.log(`[StateDataStore] Stored SR for ${month}:${state}`, {
    totalRevenue: sr.totalRevenue,
    stockTransfers: sr.totalStockTransfers,
    channels: Object.keys(sr.revenueByChannel)
  });
}

export function storePurchaseRegister(month: string, state: StateName, pr: StatePurchaseRegister): void {
  const data = getOrCreateStateData(month, state);
  data.purchaseRegister = pr;
  data.prUploadedAt = new Date().toISOString();
  console.log(`[StateDataStore] Stored PR for ${month}:${state}`, {
    totalPurchases: pr.totalPurchases,
    gst: pr.sgst + pr.cgst + pr.igst
  });
}

export function storeJournalRegister(month: string, state: StateName, jr: StateJournalRegister): void {
  const data = getOrCreateStateData(month, state);
  data.journalRegister = jr;
  data.jrUploadedAt = new Date().toISOString();
  console.log(`[StateDataStore] Stored JR for ${month}:${state}`, {
    totalExpenses: jr.totalExpenses,
    heads: Object.keys(jr.expensesByHead),
    tds: jr.tds,
    gst: jr.sgst + jr.cgst + jr.igst
  });
}

// ============================================
// QUERY FUNCTIONS
// ============================================

export function getAllStatesForMonth(month: string): StateMonthData[] {
  const result: StateMonthData[] = [];
  for (const state of STATE_NAMES) {
    const data = stateDataStore.get(getStateKey(month, state));
    if (data) {
      result.push(data);
    }
  }
  return result;
}

export function getMonthsWithData(): string[] {
  const months = new Set<string>();
  for (const key of stateDataStore.keys()) {
    const month = key.split(':')[0];
    months.add(month);
  }
  return Array.from(months).sort();
}

export function hasDataForMonth(month: string): boolean {
  return getAllStatesForMonth(month).length > 0;
}

// ============================================
// AGGREGATION: States to Month
// ============================================

export function aggregateStatesToMonth(month: string): MonthlyMISData | null {
  const statesData = getAllStatesForMonth(month);
  if (statesData.length === 0) return null;

  // Find UP data for COGM
  const upData = statesData.find(s => s.state === 'UP');

  // Initialize aggregated values
  let grossRevenue = 0;
  const revenueByChannel: Record<string, number> = {};
  let stockTransfers = 0;

  let openingStock = 0;
  let closingStock = 0;
  let purchases = 0;

  const expensesByHead: Record<string, number> = {};
  let totalExpenses = 0;
  const expenseEntries: JournalEntry[] = [];

  // Tax summary accumulators
  let outputSGST = 0, outputCGST = 0, outputIGST = 0;
  let inputSGST = 0, inputCGST = 0, inputIGST = 0;
  let expenseSGST = 0, expenseCGST = 0, expenseIGST = 0;
  let tds = 0;
  let srRoundOffs = 0, prRoundOffs = 0, jrRoundOffs = 0;

  // BS reconciliation
  let bsGrossSales = 0;
  let bsNetProfitLoss = 0;

  // Aggregate from all states
  for (const stateData of statesData) {
    // Sales Register
    if (stateData.salesRegister) {
      const sr = stateData.salesRegister;
      grossRevenue += sr.totalRevenue;
      stockTransfers += sr.totalStockTransfers;

      // Revenue by channel
      for (const [channel, amount] of Object.entries(sr.revenueByChannel)) {
        revenueByChannel[channel] = (revenueByChannel[channel] || 0) + amount;
      }

      // Output GST
      outputSGST += sr.sgst;
      outputCGST += sr.cgst;
      outputIGST += sr.igst;
      srRoundOffs += sr.roundOffs;
    }

    // Purchase Register
    if (stateData.purchaseRegister) {
      const pr = stateData.purchaseRegister;
      // Input GST
      inputSGST += pr.sgst;
      inputCGST += pr.cgst;
      inputIGST += pr.igst;
      prRoundOffs += pr.roundOffs;
    }

    // Journal Register
    if (stateData.journalRegister) {
      const jr = stateData.journalRegister;
      totalExpenses += jr.totalExpenses;

      // Expenses by head
      for (const [head, amount] of Object.entries(jr.expensesByHead)) {
        expensesByHead[head] = (expensesByHead[head] || 0) + amount;
      }

      // Add entries for drill-down (with state tag)
      expenseEntries.push(...jr.expenseEntries);

      // Expense GST & TDS
      expenseSGST += jr.sgst;
      expenseCGST += jr.cgst;
      expenseIGST += jr.igst;
      tds += jr.tds;
      jrRoundOffs += jr.roundOffs;
    }

    // Balance Sheet
    if (stateData.balanceSheet) {
      const bs = stateData.balanceSheet;
      purchases += bs.purchases;
      bsGrossSales += bs.grossSales;
      bsNetProfitLoss += bs.netProfitLoss;

      // Only UP for opening/closing stock
      if (stateData.state === 'UP') {
        openingStock = bs.openingStock;
        closingStock = bs.closingStock;
      }
    }
  }

  // Calculate derived values
  const netRevenue = grossRevenue - stockTransfers;
  const totalCOGM = openingStock + purchases - closingStock;
  const grossProfit = netRevenue - totalCOGM;
  const netIncome = grossProfit - totalExpenses;

  // Tax totals
  const outputTotal = outputSGST + outputCGST + outputIGST;
  const inputTotal = inputSGST + inputCGST + inputIGST;
  const expenseTotal = expenseSGST + expenseCGST + expenseIGST;
  const netGST = outputTotal - inputTotal - expenseTotal;
  const roundOffs = srRoundOffs - prRoundOffs + jrRoundOffs;

  // Revenue variance: MIS revenue vs BS (gross sales - stock transfers)
  const revenueVariance = netRevenue - (bsGrossSales - stockTransfers);
  const profitVariance = netIncome - bsNetProfitLoss;

  const aggregated: MonthlyMISAggregated = {
    month,
    grossRevenue,
    revenueByChannel,
    stockTransfers,
    netRevenue,
    cogm: {
      openingStock,
      closingStock,
      purchases,
      totalCOGM
    },
    grossProfit,
    expensesByHead,
    totalExpenses,
    expenseEntries,
    netIncome,
    taxSummary: {
      outputGST: { sgst: outputSGST, cgst: outputCGST, igst: outputIGST, total: outputTotal },
      inputGST: { sgst: inputSGST, cgst: inputCGST, igst: inputIGST, total: inputTotal },
      expenseGST: { sgst: expenseSGST, cgst: expenseCGST, igst: expenseIGST, total: expenseTotal },
      netGST,
      tds,
      roundOffs
    },
    bsReconciliation: {
      bsGrossSales,
      bsNetProfitLoss,
      misRevenue: netRevenue,
      misNetIncome: netIncome,
      stockTransfers,
      revenueVariance,
      profitVariance
    }
  };

  return {
    month,
    statesData,
    aggregated
  };
}

// ============================================
// AGGREGATION: Months to Range
// ============================================

export function aggregateMonthsToRange(startMonth: string, endMonth: string): RangeMISData | null {
  // Get all months in range
  const allMonths = getMonthsWithData().filter(m => m >= startMonth && m <= endMonth).sort();
  if (allMonths.length === 0) return null;

  const months: MonthlyMISData[] = [];
  for (const month of allMonths) {
    const monthData = aggregateStatesToMonth(month);
    if (monthData) {
      months.push(monthData);
    }
  }

  if (months.length === 0) return null;

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  // Initialize aggregated values
  let grossRevenue = 0;
  const revenueByChannel: Record<string, number> = {};
  let stockTransfers = 0;
  let purchases = 0;

  const expensesByHead: Record<string, number> = {};
  let totalExpenses = 0;
  const expenseEntries: JournalEntry[] = [];

  // Tax accumulators
  let outputSGST = 0, outputCGST = 0, outputIGST = 0;
  let inputSGST = 0, inputCGST = 0, inputIGST = 0;
  let expenseSGST = 0, expenseCGST = 0, expenseIGST = 0;
  let tds = 0;
  let roundOffs = 0;

  // BS reconciliation
  let bsGrossSales = 0;
  let bsNetProfitLoss = 0;

  // Sum across all months
  for (const monthData of months) {
    const agg = monthData.aggregated;

    grossRevenue += agg.grossRevenue;
    stockTransfers += agg.stockTransfers;
    purchases += agg.cogm.purchases;

    // Revenue by channel
    for (const [channel, amount] of Object.entries(agg.revenueByChannel)) {
      revenueByChannel[channel] = (revenueByChannel[channel] || 0) + amount;
    }

    // Expenses by head
    for (const [head, amount] of Object.entries(agg.expensesByHead)) {
      expensesByHead[head] = (expensesByHead[head] || 0) + amount;
    }
    totalExpenses += agg.totalExpenses;
    expenseEntries.push(...agg.expenseEntries);

    // Tax summary
    outputSGST += agg.taxSummary.outputGST.sgst;
    outputCGST += agg.taxSummary.outputGST.cgst;
    outputIGST += agg.taxSummary.outputGST.igst;
    inputSGST += agg.taxSummary.inputGST.sgst;
    inputCGST += agg.taxSummary.inputGST.cgst;
    inputIGST += agg.taxSummary.inputGST.igst;
    expenseSGST += agg.taxSummary.expenseGST.sgst;
    expenseCGST += agg.taxSummary.expenseGST.cgst;
    expenseIGST += agg.taxSummary.expenseGST.igst;
    tds += agg.taxSummary.tds;
    roundOffs += agg.taxSummary.roundOffs;

    // BS reconciliation
    bsGrossSales += agg.bsReconciliation.bsGrossSales;
    bsNetProfitLoss += agg.bsReconciliation.bsNetProfitLoss;
  }

  // Opening from FIRST month, Closing from LAST month (UP only)
  const openingStock = firstMonth.aggregated.cogm.openingStock;
  const closingStock = lastMonth.aggregated.cogm.closingStock;

  // Calculate derived values
  const netRevenue = grossRevenue - stockTransfers;
  const totalCOGM = openingStock + purchases - closingStock;
  const grossProfit = netRevenue - totalCOGM;
  const netIncome = grossProfit - totalExpenses;

  // Tax totals
  const outputTotal = outputSGST + outputCGST + outputIGST;
  const inputTotal = inputSGST + inputCGST + inputIGST;
  const expenseTotal = expenseSGST + expenseCGST + expenseIGST;
  const netGST = outputTotal - inputTotal - expenseTotal;

  // Variances
  const revenueVariance = netRevenue - (bsGrossSales - stockTransfers);
  const profitVariance = netIncome - bsNetProfitLoss;

  const aggregated: MonthlyMISAggregated = {
    month: `${startMonth} to ${endMonth}`,
    grossRevenue,
    revenueByChannel,
    stockTransfers,
    netRevenue,
    cogm: {
      openingStock,
      closingStock,
      purchases,
      totalCOGM
    },
    grossProfit,
    expensesByHead,
    totalExpenses,
    expenseEntries,
    netIncome,
    taxSummary: {
      outputGST: { sgst: outputSGST, cgst: outputCGST, igst: outputIGST, total: outputTotal },
      inputGST: { sgst: inputSGST, cgst: inputCGST, igst: inputIGST, total: inputTotal },
      expenseGST: { sgst: expenseSGST, cgst: expenseCGST, igst: expenseIGST, total: expenseTotal },
      netGST,
      tds,
      roundOffs
    },
    bsReconciliation: {
      bsGrossSales,
      bsNetProfitLoss,
      misRevenue: netRevenue,
      misNetIncome: netIncome,
      stockTransfers,
      revenueVariance,
      profitVariance
    }
  };

  return {
    startMonth,
    endMonth,
    months,
    aggregated
  };
}

// ============================================
// UTILITY: Clear Store
// ============================================

export function clearStateDataStore(): void {
  stateDataStore.clear();
  console.log('[StateDataStore] Cleared all data');
}

export function clearMonthData(month: string): void {
  for (const state of STATE_NAMES) {
    stateDataStore.delete(getStateKey(month, state));
  }
  console.log(`[StateDataStore] Cleared data for ${month}`);
}

// ============================================
// DEBUG: Get Store Stats
// ============================================

export function getStoreStats(): { totalEntries: number; months: string[]; entriesByMonth: Record<string, string[]> } {
  const months = getMonthsWithData();
  const entriesByMonth: Record<string, string[]> = {};

  for (const month of months) {
    entriesByMonth[month] = [];
    for (const state of STATE_NAMES) {
      const data = stateDataStore.get(getStateKey(month, state));
      if (data) {
        const files: string[] = [];
        if (data.balanceSheet) files.push('BS');
        if (data.salesRegister) files.push('SR');
        if (data.purchaseRegister) files.push('PR');
        if (data.journalRegister) files.push('JR');
        if (files.length > 0) {
          entriesByMonth[month].push(`${state}(${files.join(',')})`);
        }
      }
    }
  }

  return {
    totalEntries: stateDataStore.size,
    months,
    entriesByMonth
  };
}
