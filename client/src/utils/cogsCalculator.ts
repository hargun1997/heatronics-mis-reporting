import { COGSData } from '../types';

export function calculateCOGS(
  openingStock: number,
  purchases: number,
  closingStock: number
): COGSData {
  const cogs = openingStock + purchases - closingStock;
  return {
    openingStock,
    purchases,
    closingStock,
    cogs: Math.max(0, cogs) // COGS shouldn't be negative
  };
}

/**
 * Data structure for monthly balance sheet data used in proration
 */
export interface MonthlyBSDataForProration {
  periodKey: string; // e.g., "2024-04"
  month: number;
  year: number;
  openingStock: number;
  purchases: number;
  closingStock: number;
  netRevenue: number;
}

/**
 * Result of prorated raw materials calculation
 */
export interface ProratedRawMaterialsResult {
  // Annual totals
  fyOpeningStock: number;      // Opening stock from FY start (or earliest month)
  fyTotalPurchases: number;    // Sum of all purchases across the year
  fyClosingStock: number;      // Closing stock from the last submitted month
  fyTotalRawMaterials: number; // Total raw materials COGS for the year

  // Revenue data for proration
  fyTotalRevenue: number;      // Total revenue across all months

  // Per-month breakdown
  monthlyAllocations: {
    periodKey: string;
    month: number;
    year: number;
    revenueRatio: number;      // This month's revenue / total revenue
    allocatedRawMaterials: number; // Prorated amount for this month
  }[];
}

/**
 * Calculate prorated raw materials cost across months based on revenue ratios.
 *
 * Formula:
 * 1. Annual Raw Materials = Opening Stock (FY start) + Sum(All Purchases) - Closing Stock (last month)
 * 2. Each month's allocation = Annual Raw Materials × (Month Revenue / Total Revenue)
 *
 * @param monthlyData Array of monthly BS data sorted by period (oldest first)
 * @returns Prorated raw materials breakdown
 */
export function calculateProratedRawMaterials(
  monthlyData: MonthlyBSDataForProration[]
): ProratedRawMaterialsResult {
  if (monthlyData.length === 0) {
    return {
      fyOpeningStock: 0,
      fyTotalPurchases: 0,
      fyClosingStock: 0,
      fyTotalRawMaterials: 0,
      fyTotalRevenue: 0,
      monthlyAllocations: []
    };
  }

  // Sort by period to ensure correct order (oldest first)
  const sortedData = [...monthlyData].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Get opening stock from the earliest month
  const earliestMonth = sortedData[0];
  const fyOpeningStock = earliestMonth.openingStock;

  // Sum all purchases across the year
  const fyTotalPurchases = sortedData.reduce((sum, m) => sum + m.purchases, 0);

  // Get closing stock from the last submitted month
  const latestMonth = sortedData[sortedData.length - 1];
  const fyClosingStock = latestMonth.closingStock;

  // Calculate total raw materials COGS for the year
  const fyTotalRawMaterials = Math.max(0, fyOpeningStock + fyTotalPurchases - fyClosingStock);

  // Calculate total revenue for proration
  const fyTotalRevenue = sortedData.reduce((sum, m) => sum + m.netRevenue, 0);

  // Calculate monthly allocations based on revenue ratios
  const monthlyAllocations = sortedData.map(monthData => {
    const revenueRatio = fyTotalRevenue > 0
      ? monthData.netRevenue / fyTotalRevenue
      : 1 / sortedData.length; // Equal distribution if no revenue

    const allocatedRawMaterials = fyTotalRawMaterials * revenueRatio;

    return {
      periodKey: monthData.periodKey,
      month: monthData.month,
      year: monthData.year,
      revenueRatio,
      allocatedRawMaterials
    };
  });

  return {
    fyOpeningStock,
    fyTotalPurchases,
    fyClosingStock,
    fyTotalRawMaterials,
    fyTotalRevenue,
    monthlyAllocations
  };
}

/**
 * Get the allocated raw materials for a specific month from proration result
 */
export function getAllocatedRawMaterialsForMonth(
  proratedResult: ProratedRawMaterialsResult,
  periodKey: string
): number {
  const allocation = proratedResult.monthlyAllocations.find(
    a => a.periodKey === periodKey
  );
  return allocation?.allocatedRawMaterials ?? 0;
}

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);

  // Indian numbering format
  if (absAmount >= 10000000) {
    // Crores
    return (amount < 0 ? '-' : '') + '₹' + (absAmount / 10000000).toFixed(2) + ' Cr';
  } else if (absAmount >= 100000) {
    // Lakhs
    return (amount < 0 ? '-' : '') + '₹' + (absAmount / 100000).toFixed(2) + ' L';
  } else if (absAmount >= 1000) {
    // Thousands
    return (amount < 0 ? '-' : '') + '₹' + absAmount.toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  } else {
    return (amount < 0 ? '-' : '') + '₹' + absAmount.toFixed(2);
  }
}

export function formatCurrencyFull(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return sign + '₹' + Math.abs(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

export function formatPercentage(value: number, total: number): string {
  if (total === 0) return '0%';
  const percentage = (value / total) * 100;
  return percentage.toFixed(1) + '%';
}
