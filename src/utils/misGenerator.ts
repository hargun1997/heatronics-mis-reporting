import { Transaction, MISReport, Heads } from '../types';

export function generateMISReport(
  transactions: Transaction[],
  heads: Heads
): MISReport {
  // Initialize breakdown objects
  const revenueByChannel: { [key: string]: number } = {};
  const cogmBreakdown: { [key: string]: number } = {};
  const channelCostsBreakdown: { [key: string]: number } = {};
  const marketingBreakdown: { [key: string]: number } = {};
  const platformBreakdown: { [key: string]: number } = {};
  const operatingBreakdown: { [key: string]: number } = {};

  // Initialize subheads for each category
  heads["A. Revenue"]?.subheads.forEach(s => revenueByChannel[s] = 0);
  heads["E. COGM"]?.subheads.forEach(s => cogmBreakdown[s] = 0);
  heads["F. Channel & Fulfillment"]?.subheads.forEach(s => channelCostsBreakdown[s] = 0);
  heads["G. Sales & Marketing"]?.subheads.forEach(s => marketingBreakdown[s] = 0);
  heads["H. Platform Costs"]?.subheads.forEach(s => platformBreakdown[s] = 0);
  heads["I. Operating Expenses"]?.subheads.forEach(s => operatingBreakdown[s] = 0);

  let grossRevenue = 0;
  let returns = 0;
  let discounts = 0;
  let taxes = 0;
  let cogm = 0;
  let channelCosts = 0;
  let marketing = 0;
  let platform = 0;
  let operating = 0;
  let nonOperating = 0;
  let excluded = 0;
  let ignored = 0;

  // Process each transaction
  for (const txn of transactions) {
    if (!txn.head || !txn.subhead) continue;

    const amount = txn.credit > 0 ? txn.credit : txn.debit;

    switch (txn.head) {
      case "A. Revenue":
        grossRevenue += txn.credit;
        if (revenueByChannel[txn.subhead] !== undefined) {
          revenueByChannel[txn.subhead] += txn.credit;
        }
        break;

      case "B. Returns":
        returns += txn.debit;
        break;

      case "C. Discounts":
        discounts += txn.debit;
        break;

      case "D. Taxes (GST)":
        taxes += txn.credit > 0 ? txn.credit : txn.debit;
        break;

      case "E. COGM":
        cogm += txn.debit;
        if (cogmBreakdown[txn.subhead] !== undefined) {
          cogmBreakdown[txn.subhead] += txn.debit;
        }
        break;

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

  const netRevenue = grossRevenue - returns - discounts - taxes;
  const grossMargin = netRevenue - cogm;
  const cm1 = grossMargin - channelCosts;
  const cm2 = cm1 - marketing;
  const cm3 = cm2 - platform;
  const ebitda = cm3 - operating;
  const netIncome = ebitda - nonOperating;

  return {
    grossRevenue,
    revenueByChannel,
    returns,
    discounts,
    taxes,
    netRevenue,
    cogm,
    cogmBreakdown,
    grossMargin,
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
    excluded,
    ignored
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
