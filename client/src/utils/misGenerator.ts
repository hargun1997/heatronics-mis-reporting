import { Transaction, MISReport, Heads, BalanceSheetData } from '../types';

export function generateMISReport(
  transactions: Transaction[],
  heads: Heads,
  balanceSheetData?: BalanceSheetData | null,
  purchaseRegisterTotal?: number
): MISReport {
  // Initialize breakdown objects for expense categories
  const revenueByChannel: { [key: string]: number } = {};
  const channelCostsBreakdown: { [key: string]: number } = {};
  const marketingBreakdown: { [key: string]: number } = {};
  const platformBreakdown: { [key: string]: number } = {};
  const operatingBreakdown: { [key: string]: number } = {};

  // Initialize subheads for each category
  heads["A. Revenue"]?.subheads.forEach(s => revenueByChannel[s] = 0);
  heads["F. Channel & Fulfillment"]?.subheads.forEach(s => channelCostsBreakdown[s] = 0);
  heads["G. Sales & Marketing"]?.subheads.forEach(s => marketingBreakdown[s] = 0);
  heads["H. Platform Costs"]?.subheads.forEach(s => platformBreakdown[s] = 0);
  heads["I. Operating Expenses"]?.subheads.forEach(s => operatingBreakdown[s] = 0);

  // Journal data (for validation against Balance Sheet)
  let journalRevenue = 0;
  let journalReturns = 0;
  let journalDiscounts = 0;
  let journalTaxes = 0;
  let journalCOGM = 0;

  // Expense classifications (from Journal)
  let channelCosts = 0;
  let marketing = 0;
  let platform = 0;
  let operating = 0;
  let nonOperating = 0;
  let excluded = 0;
  let ignored = 0;

  // Process each transaction from journal
  for (const txn of transactions) {
    if (!txn.head || !txn.subhead) continue;

    const amount = txn.credit > 0 ? txn.credit : txn.debit;

    switch (txn.head) {
      // Revenue items (captured for validation, but BS is authoritative)
      case "A. Revenue":
        journalRevenue += txn.credit;
        if (revenueByChannel[txn.subhead] !== undefined) {
          revenueByChannel[txn.subhead] += txn.credit;
        }
        break;

      case "B. Returns":
        journalReturns += txn.debit;
        break;

      case "C. Discounts":
        journalDiscounts += txn.debit;
        break;

      case "D. Taxes (GST)":
        journalTaxes += txn.credit > 0 ? txn.credit : txn.debit;
        break;

      // COGM from journal (for validation, but BS is authoritative)
      case "E. COGM":
        journalCOGM += txn.debit;
        break;

      // Expense categories (these are used from journal)
      case "F. Channel & Fulfillment":
        channelCosts += txn.debit;
        if (channelCostsBreakdown[txn.subhead] !== undefined) {
          channelCostsBreakdown[txn.subhead] += txn.debit;
        }
        break;

      case "G. Sales & Marketing":
        marketing += txn.debit;
        if (marketingBreakdown[txn.subhead] !== undefined) {
          marketingBreakdown[txn.subhead] += txn.debit;
        }
        break;

      case "H. Platform Costs":
        platform += txn.debit;
        if (platformBreakdown[txn.subhead] !== undefined) {
          platformBreakdown[txn.subhead] += txn.debit;
        }
        break;

      case "I. Operating Expenses":
        operating += txn.debit;
        if (operatingBreakdown[txn.subhead] !== undefined) {
          operatingBreakdown[txn.subhead] += txn.debit;
        }
        break;

      case "J. Non-Operating":
        nonOperating += txn.debit;
        break;

      case "X. Exclude (Personal)":
        excluded += amount;
        break;

      case "Z. Ignore (Non-P&L)":
        ignored += amount;
        break;
    }
  }

  // === BALANCE SHEET DATA (AUTHORITATIVE SOURCE) ===
  const bsNetSales = balanceSheetData?.netSales || 0;
  const bsGrossSales = balanceSheetData?.grossSales || 0;
  const bsPurchases = balanceSheetData?.purchases || 0;
  const bsOpeningStock = balanceSheetData?.openingStock || 0;
  const bsClosingStock = balanceSheetData?.closingStock || 0;
  const bsNetProfit = balanceSheetData?.netProfit || 0;

  // Calculate COGS from Balance Sheet
  const bsCOGS = Math.max(0, bsOpeningStock + bsPurchases - bsClosingStock);

  // === P&L CALCULATIONS (using BS for Revenue and COGS) ===
  // If Balance Sheet data is available, use it. Otherwise fall back to journal data
  const netRevenue = bsNetSales > 0 ? bsNetSales : (journalRevenue - journalReturns - journalDiscounts - journalTaxes);
  const cogm = bsCOGS > 0 ? bsCOGS : journalCOGM;

  const grossMargin = netRevenue - cogm;
  const cm1 = grossMargin - channelCosts;
  const cm2 = cm1 - marketing;
  const cm3 = cm2 - platform;
  const ebitda = cm3 - operating;
  const netIncome = ebitda - nonOperating;

  // Journal net revenue (for comparison/validation)
  const journalNetRevenue = journalRevenue - journalReturns - journalDiscounts - journalTaxes;

  // === PURCHASE REGISTER VALIDATION ===
  const prTotal = purchaseRegisterTotal || 0;
  const purchaseVariance = bsPurchases - prTotal;

  // === RECONCILIATION ===
  const revenueVariance = bsNetSales - journalNetRevenue;
  const cogsVariance = bsCOGS - journalCOGM;
  const profitVariance = bsNetProfit - netIncome;

  return {
    // === FROM BALANCE SHEET (AUTHORITATIVE SOURCE) ===
    bsNetSales,
    bsGrossSales,
    bsPurchases,
    bsOpeningStock,
    bsClosingStock,
    bsCOGS,
    bsNetProfit,

    // === PURCHASE REGISTER VALIDATION ===
    purchaseRegisterTotal: prTotal,
    purchaseVariance,

    // === P&L REPORT (using BS for Revenue and COGS) ===
    netRevenue,
    cogm,
    grossMargin,

    // === EXPENSE CLASSIFICATIONS (from Journal) ===
    channelCosts,
    channelCostsBreakdown,
    cm1,
    marketing,
    marketingBreakdown,
    cm2,
    platform,
    platformBreakdown,
    cm3,
    operating,
    operatingBreakdown,
    ebitda,
    nonOperating,
    netIncome,

    // === OTHER JOURNAL ITEMS ===
    excluded,
    ignored,

    // === JOURNAL DATA (for validation/reference) ===
    journalRevenue,
    journalReturns,
    journalDiscounts,
    journalTaxes,
    journalNetRevenue,
    journalCOGM,
    revenueByChannel,

    // === RECONCILIATION ===
    revenueVariance,
    cogsVariance,
    profitVariance
  };
}

export interface HeadSummary {
  head: string;
  subhead: string;
  debitTotal: number;
  creditTotal: number;
  count: number;
}

export function calculateHeadTotals(transactions: Transaction[]): HeadSummary[] {
  const summaryMap = new Map<string, HeadSummary>();

  for (const txn of transactions) {
    if (!txn.head || !txn.subhead) continue;

    const key = `${txn.head}::${txn.subhead}`;

    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        head: txn.head,
        subhead: txn.subhead,
        debitTotal: 0,
        creditTotal: 0,
        count: 0
      });
    }

    const summary = summaryMap.get(key)!;
    summary.debitTotal += txn.debit;
    summary.creditTotal += txn.credit;
    summary.count += 1;
  }

  return Array.from(summaryMap.values()).sort((a, b) => {
    if (a.head !== b.head) return a.head.localeCompare(b.head);
    return a.subhead.localeCompare(b.subhead);
  });
}
