/**
 * MIS Data Store Service
 *
 * Central service for managing monthly MIS records.
 * All data is stored per-month, with aggregation computed at view time.
 */

import {
  MonthlyMISRecord,
  MonthlyBSData,
  MonthlyTransactionData,
  ParsedJournalEntry,
  ParsedSalesEntry,
  AggregatedMISRecord,
  createEmptyMonthlyMISRecord,
  getMonthRange,
  HeadTransactions,
  SubheadTransactions,
} from '../types/monthlyMIS';

// ============================================
// MIS DATA STORE
// ============================================

class MISDataStore {
  private monthlyRecords: Map<string, MonthlyMISRecord> = new Map();

  // ----------------------------------------
  // GETTERS
  // ----------------------------------------

  /**
   * Get MIS record for a single month
   */
  getMonth(month: string): MonthlyMISRecord | undefined {
    return this.monthlyRecords.get(month);
  }

  /**
   * Get or create MIS record for a month
   */
  getOrCreateMonth(month: string): MonthlyMISRecord {
    let record = this.monthlyRecords.get(month);
    if (!record) {
      record = createEmptyMonthlyMISRecord(month);
      this.monthlyRecords.set(month, record);
    }
    return record;
  }

  /**
   * Get all months that have data
   */
  getAvailableMonths(): string[] {
    return Array.from(this.monthlyRecords.keys()).sort();
  }

  /**
   * Check if a month has data
   */
  hasData(month: string): boolean {
    const record = this.monthlyRecords.get(month);
    if (!record) return false;

    // Check if any data exists
    return (
      Object.keys(record.bsDataByState).length > 0 ||
      record.transactions.journalEntries.length > 0 ||
      record.transactions.salesEntries.length > 0
    );
  }

  // ----------------------------------------
  // BALANCE SHEET DATA
  // ----------------------------------------

  /**
   * Store Balance Sheet data for a specific month and state
   */
  storeBSData(month: string, state: string, bsData: Omit<MonthlyBSData, 'month' | 'state'>): void {
    const record = this.getOrCreateMonth(month);

    record.bsDataByState[state] = {
      ...bsData,
      month,
      state,
    };

    // Update computed values
    this.recalculateMonth(month);

    record.lastUpdated = new Date();
    record.filesUploaded.bs.push({
      state,
      filename: bsData.sourceFile,
      uploadedAt: new Date(),
    });
  }

  /**
   * Get BS data for a specific state in a month
   */
  getBSData(month: string, state: string): MonthlyBSData | undefined {
    const record = this.monthlyRecords.get(month);
    return record?.bsDataByState[state];
  }

  // ----------------------------------------
  // JOURNAL ENTRIES
  // ----------------------------------------

  /**
   * Store parsed journal entries for a month
   */
  storeJournalEntries(month: string, entries: ParsedJournalEntry[], filename: string): void {
    const record = this.getOrCreateMonth(month);

    // Replace existing entries for this month
    record.transactions.journalEntries = entries;

    // Rebuild the byHead classification
    this.rebuildHeadClassification(record);

    // Recalculate totals
    this.recalculateMonth(month);

    record.lastUpdated = new Date();
    record.filesUploaded.jr.push({
      filename,
      uploadedAt: new Date(),
    });
  }

  /**
   * Add journal entries (append mode)
   */
  addJournalEntries(month: string, entries: ParsedJournalEntry[]): void {
    const record = this.getOrCreateMonth(month);
    record.transactions.journalEntries.push(...entries);
    this.rebuildHeadClassification(record);
    this.recalculateMonth(month);
    record.lastUpdated = new Date();
  }

  // ----------------------------------------
  // SALES ENTRIES
  // ----------------------------------------

  /**
   * Store parsed sales entries for a month
   */
  storeSalesEntries(month: string, entries: ParsedSalesEntry[], filename: string): void {
    const record = this.getOrCreateMonth(month);

    record.transactions.salesEntries = entries;

    // Rebuild classification
    this.rebuildHeadClassification(record);

    // Recalculate
    this.recalculateMonth(month);

    record.lastUpdated = new Date();
    record.filesUploaded.sr.push({
      filename,
      uploadedAt: new Date(),
    });
  }

  // ----------------------------------------
  // CLASSIFICATION
  // ----------------------------------------

  /**
   * Rebuild the byHead classification from raw entries
   */
  private rebuildHeadClassification(record: MonthlyMISRecord): void {
    const byHead = new Map<string, HeadTransactions>();

    // Process journal entries
    for (const entry of record.transactions.journalEntries) {
      this.addToHeadMap(byHead, entry.headCode, entry.headName, entry.subheadCode, entry.subheadName, entry.expenseAmount, entry);
    }

    // Process sales entries
    for (const entry of record.transactions.salesEntries) {
      this.addToHeadMap(byHead, entry.headCode, 'Revenue', entry.subheadCode, entry.subheadCode, entry.taxableAmount, entry);
    }

    record.transactions.byHead = byHead;

    // Update headTotals and subheadTotals
    record.transactions.headTotals = {};
    record.transactions.subheadTotals = {};

    for (const [headCode, headData] of byHead) {
      record.transactions.headTotals[headCode] = headData.total;
      for (const [subheadCode, subheadData] of headData.subheads) {
        record.transactions.subheadTotals[subheadCode] = subheadData.total;
      }
    }
  }

  /**
   * Helper to add an entry to the byHead map
   */
  private addToHeadMap(
    byHead: Map<string, HeadTransactions>,
    headCode: string,
    headName: string,
    subheadCode: string,
    subheadName: string,
    amount: number,
    entry: ParsedJournalEntry | ParsedSalesEntry
  ): void {
    if (!byHead.has(headCode)) {
      byHead.set(headCode, {
        headCode,
        headName,
        total: 0,
        subheads: new Map(),
      });
    }

    const headData = byHead.get(headCode)!;
    headData.total += amount;

    if (!headData.subheads.has(subheadCode)) {
      headData.subheads.set(subheadCode, {
        subheadCode,
        subheadName,
        total: 0,
        transactions: [],
      });
    }

    const subheadData = headData.subheads.get(subheadCode)!;
    subheadData.total += amount;
    subheadData.transactions.push(entry);
  }

  // ----------------------------------------
  // CALCULATION
  // ----------------------------------------

  /**
   * Recalculate computed values for a month
   */
  private recalculateMonth(month: string): void {
    const record = this.monthlyRecords.get(month);
    if (!record) return;

    const computed = record.computed;

    // RM/Inventory from primary state BS (usually UP)
    const primaryBS = record.bsDataByState[record.primaryState];
    if (primaryBS) {
      computed.openingStock = primaryBS.openingStock;
      computed.purchases = primaryBS.purchases;
      computed.closingStock = primaryBS.closingStock;
      computed.rmCost = primaryBS.openingStock + primaryBS.purchases - primaryBS.closingStock;
    }

    // Revenue from sales entries (sum of taxable amounts)
    computed.grossRevenue = record.transactions.salesEntries.reduce(
      (sum, entry) => sum + entry.taxableAmount,
      0
    );

    // Revenue by state
    computed.revenueByState = {};
    for (const entry of record.transactions.salesEntries) {
      computed.revenueByState[entry.state] = (computed.revenueByState[entry.state] || 0) + entry.taxableAmount;
    }

    // Also add sales from BS if available (for states without SR data)
    for (const [state, bsData] of Object.entries(record.bsDataByState)) {
      if (bsData.grossSales > 0 && !computed.revenueByState[state]) {
        computed.revenueByState[state] = bsData.grossSales;
        computed.grossRevenue += bsData.grossSales;
      }
    }

    // Head totals from transactions
    computed.headTotals = { ...record.transactions.headTotals };

    // Calculate margins (simplified - will be enhanced)
    this.calculateMargins(record);
  }

  /**
   * Calculate CM1, CM2, etc. for a month
   */
  private calculateMargins(record: MonthlyMISRecord): void {
    const computed = record.computed;
    const headTotals = computed.headTotals;

    // Get totals by head code
    const getHeadTotal = (code: string) => headTotals[code] || 0;

    // Revenue
    const revenue = computed.grossRevenue;

    // COGM = RM Cost + Direct Labour + Direct Expenses
    const cogm = computed.rmCost +
      getHeadTotal('DIRECT_LABOUR') +
      getHeadTotal('DIRECT_EXPENSES');

    // CM1 = Revenue - COGM
    computed.cm1 = revenue - cogm;

    // CM2 = CM1 - Variable Costs (Inbound Transport, Sales Commission, etc.)
    const variableCosts = getHeadTotal('INBOUND_TRANSPORT') +
      getHeadTotal('SALES_COMMISSION') +
      getHeadTotal('OUTBOUND_TRANSPORT') +
      getHeadTotal('PACKAGING');
    computed.cm2 = computed.cm1 - variableCosts;

    // CM3 = CM2 - Semi-Variable Costs
    const semiVariableCosts = getHeadTotal('INDIRECT_LABOUR') +
      getHeadTotal('UTILITIES') +
      getHeadTotal('MAINTENANCE');
    computed.cm3 = computed.cm2 - semiVariableCosts;

    // EBITDA = CM3 - Fixed Costs (excluding D&A)
    const fixedCosts = getHeadTotal('RENT') +
      getHeadTotal('ADMIN_EXPENSES') +
      getHeadTotal('INSURANCE') +
      getHeadTotal('PROFESSIONAL_FEES');
    computed.ebitda = computed.cm3 - fixedCosts;

    // PBT = EBITDA - D&A - Interest
    const dna = getHeadTotal('DEPRECIATION');
    const interest = getHeadTotal('INTEREST');
    computed.pbt = computed.ebitda - dna - interest;

    // PAT = PBT - Tax (simplified)
    const tax = getHeadTotal('TAX');
    computed.pat = computed.pbt - tax;
  }

  // ----------------------------------------
  // AGGREGATION
  // ----------------------------------------

  /**
   * Get aggregated MIS for a date range
   * Opening Stock from FIRST month, Closing Stock from LAST month
   * Everything else is summed
   */
  getAggregated(startMonth: string, endMonth: string): AggregatedMISRecord {
    const months = getMonthRange(startMonth, endMonth);
    const monthsWithData = months.filter(m => this.hasData(m));

    const result: AggregatedMISRecord = {
      startMonth,
      endMonth,
      monthsIncluded: monthsWithData,
      openingStock: 0,
      totalPurchases: 0,
      closingStock: 0,
      rmCost: 0,
      grossRevenue: 0,
      revenueByState: {},
      headTotals: {},
      subheadTotals: {},
      cm1: 0,
      cm2: 0,
      cm3: 0,
      ebitda: 0,
      pbt: 0,
      pat: 0,
    };

    if (monthsWithData.length === 0) {
      return result;
    }

    // First month for opening stock
    const firstMonthRecord = this.monthlyRecords.get(monthsWithData[0]);
    if (firstMonthRecord) {
      result.openingStock = firstMonthRecord.computed.openingStock;
    }

    // Last month for closing stock
    const lastMonthRecord = this.monthlyRecords.get(monthsWithData[monthsWithData.length - 1]);
    if (lastMonthRecord) {
      result.closingStock = lastMonthRecord.computed.closingStock;
    }

    // Sum everything else
    for (const month of monthsWithData) {
      const record = this.monthlyRecords.get(month);
      if (!record) continue;

      // Sum purchases
      result.totalPurchases += record.computed.purchases;

      // Sum revenue
      result.grossRevenue += record.computed.grossRevenue;

      // Sum revenue by state
      for (const [state, amount] of Object.entries(record.computed.revenueByState)) {
        result.revenueByState[state] = (result.revenueByState[state] || 0) + amount;
      }

      // Sum head totals
      for (const [headCode, amount] of Object.entries(record.computed.headTotals)) {
        result.headTotals[headCode] = (result.headTotals[headCode] || 0) + amount;
      }

      // Sum subhead totals
      for (const [subheadCode, amount] of Object.entries(record.transactions.subheadTotals)) {
        result.subheadTotals[subheadCode] = (result.subheadTotals[subheadCode] || 0) + amount;
      }
    }

    // Calculate RM Cost: Opening + Total Purchases - Closing
    result.rmCost = result.openingStock + result.totalPurchases - result.closingStock;

    // Calculate margins on aggregated values
    this.calculateAggregatedMargins(result);

    return result;
  }

  /**
   * Calculate margins for aggregated data
   */
  private calculateAggregatedMargins(result: AggregatedMISRecord): void {
    const getHeadTotal = (code: string) => result.headTotals[code] || 0;

    // COGM
    const cogm = result.rmCost +
      getHeadTotal('DIRECT_LABOUR') +
      getHeadTotal('DIRECT_EXPENSES');

    // CM1
    result.cm1 = result.grossRevenue - cogm;

    // CM2
    const variableCosts = getHeadTotal('INBOUND_TRANSPORT') +
      getHeadTotal('SALES_COMMISSION') +
      getHeadTotal('OUTBOUND_TRANSPORT') +
      getHeadTotal('PACKAGING');
    result.cm2 = result.cm1 - variableCosts;

    // CM3
    const semiVariableCosts = getHeadTotal('INDIRECT_LABOUR') +
      getHeadTotal('UTILITIES') +
      getHeadTotal('MAINTENANCE');
    result.cm3 = result.cm2 - semiVariableCosts;

    // EBITDA
    const fixedCosts = getHeadTotal('RENT') +
      getHeadTotal('ADMIN_EXPENSES') +
      getHeadTotal('INSURANCE') +
      getHeadTotal('PROFESSIONAL_FEES');
    result.ebitda = result.cm3 - fixedCosts;

    // PBT
    result.pbt = result.ebitda - getHeadTotal('DEPRECIATION') - getHeadTotal('INTEREST');

    // PAT
    result.pat = result.pbt - getHeadTotal('TAX');
  }

  // ----------------------------------------
  // UTILITIES
  // ----------------------------------------

  /**
   * Clear all data
   */
  clear(): void {
    this.monthlyRecords.clear();
  }

  /**
   * Clear data for a specific month
   */
  clearMonth(month: string): void {
    this.monthlyRecords.delete(month);
  }

  /**
   * Export all data (for debugging/backup)
   */
  exportData(): Record<string, MonthlyMISRecord> {
    const data: Record<string, MonthlyMISRecord> = {};
    for (const [month, record] of this.monthlyRecords) {
      // Convert Maps to objects for JSON serialization
      data[month] = {
        ...record,
        transactions: {
          ...record.transactions,
          byHead: Object.fromEntries(
            Array.from(record.transactions.byHead.entries()).map(([k, v]) => [
              k,
              {
                ...v,
                subheads: Object.fromEntries(v.subheads),
              },
            ])
          ) as unknown as Map<string, HeadTransactions>,
        },
      };
    }
    return data;
  }

  /**
   * Get summary of what data exists
   */
  getDataSummary(): Record<string, { hasBS: string[]; hasJR: boolean; hasSR: boolean }> {
    const summary: Record<string, { hasBS: string[]; hasJR: boolean; hasSR: boolean }> = {};

    for (const [month, record] of this.monthlyRecords) {
      summary[month] = {
        hasBS: Object.keys(record.bsDataByState),
        hasJR: record.transactions.journalEntries.length > 0,
        hasSR: record.transactions.salesEntries.length > 0,
      };
    }

    return summary;
  }
}

// Singleton instance
export const misDataStore = new MISDataStore();

// Export class for testing
export { MISDataStore };
