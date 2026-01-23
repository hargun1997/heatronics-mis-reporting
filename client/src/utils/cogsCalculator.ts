import { COGSData } from '../types';

// ============================================
// FY-SPECIFIC COGS OVERRIDES
// ============================================
// For specific financial years, use these hardcoded values instead of
// calculating from balance sheet data. The value is the total raw materials
// COGS for the entire FY, which will be prorated across months by revenue ratio.

const FY_COGS_OVERRIDES: Record<string, number> = {
  'FY 2024-25': 15985642.38,  // ₹1,59,85,642.38
};

/**
 * Get the FY label for a given month/year
 * FY runs April to March: April 2024 - March 2025 = FY 2024-25
 */
export function getFYLabel(month: number, year: number): string {
  const fyStartYear = month >= 4 ? year : year - 1;
  return `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;
}

/**
 * Check if an FY has a COGS override
 */
export function getFYCogsOverride(fyLabel: string): number | null {
  return FY_COGS_OVERRIDES[fyLabel] ?? null;
}

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
 * Group months by Financial Year
 */
function groupMonthsByFY(monthlyData: MonthlyBSDataForProration[]): Record<string, MonthlyBSDataForProration[]> {
  const fyGroups: Record<string, MonthlyBSDataForProration[]> = {};

  for (const monthData of monthlyData) {
    const fyLabel = getFYLabel(monthData.month, monthData.year);
    if (!fyGroups[fyLabel]) {
      fyGroups[fyLabel] = [];
    }
    fyGroups[fyLabel].push(monthData);
  }

  return fyGroups;
}

/**
 * Calculate prorated raw materials for a SINGLE FY
 */
function calculateProratedRawMaterialsForFY(
  fyLabel: string,
  fyMonthsData: MonthlyBSDataForProration[]
): {
  fyOpeningStock: number;
  fyTotalPurchases: number;
  fyClosingStock: number;
  fyTotalRawMaterials: number;
  fyTotalRevenue: number;
  monthlyAllocations: {
    periodKey: string;
    month: number;
    year: number;
    revenueRatio: number;
    allocatedRawMaterials: number;
  }[];
} {
  // Sort by period to ensure correct order (oldest first)
  const sortedData = [...fyMonthsData].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  console.log(`[COGS DEBUG] Processing ${fyLabel} with ${sortedData.length} months`);

  // Check for FY-specific override
  const fyOverride = getFYCogsOverride(fyLabel);
  console.log(`[COGS DEBUG] ${fyLabel} override:`, fyOverride);

  // Get opening stock from the earliest month in this FY
  const earliestMonth = sortedData[0];
  const fyOpeningStock = earliestMonth.openingStock;

  // Sum all purchases across this FY
  const fyTotalPurchases = sortedData.reduce((sum, m) => sum + m.purchases, 0);

  // Get closing stock from the last submitted month in this FY
  const latestMonth = sortedData[sortedData.length - 1];
  const fyClosingStock = latestMonth.closingStock;

  // Calculate total raw materials COGS for this FY
  // Use override if available, otherwise calculate from balance sheet
  let fyTotalRawMaterials: number;
  if (fyOverride !== null) {
    fyTotalRawMaterials = fyOverride;
    console.log(`[COGS] Using FY override for ${fyLabel}: ₹${fyOverride.toLocaleString('en-IN')}`);
  } else {
    fyTotalRawMaterials = Math.max(0, fyOpeningStock + fyTotalPurchases - fyClosingStock);
    console.log(`[COGS] Calculated from balance sheet for ${fyLabel}: ₹${fyTotalRawMaterials.toLocaleString('en-IN')}`);
  }

  // Calculate total revenue for proration within this FY
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
 * Calculate prorated raw materials cost across months based on revenue ratios.
 * Now handles multiple FYs properly - each FY is calculated separately with its own override.
 *
 * Formula:
 * 1. Annual Raw Materials = Opening Stock (FY start) + Sum(All Purchases) - Closing Stock (last month)
 *    OR use FY-specific override if configured (e.g., FY 2024-25)
 * 2. Each month's allocation = Annual Raw Materials × (Month Revenue / Total Revenue)
 *
 * @param monthlyData Array of monthly BS data (can span multiple FYs)
 * @returns Prorated raw materials breakdown (combined from all FYs)
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

  // Group months by FY
  const fyGroups = groupMonthsByFY(monthlyData);
  const fyLabels = Object.keys(fyGroups).sort();

  console.log('[COGS DEBUG] FY Groups found:', fyLabels);
  console.log('[COGS DEBUG] Available overrides:', FY_COGS_OVERRIDES);

  // Calculate proration for each FY separately
  const allAllocations: ProratedRawMaterialsResult['monthlyAllocations'] = [];
  let totalOpeningStock = 0;
  let totalPurchases = 0;
  let totalClosingStock = 0;
  let totalRawMaterials = 0;
  let totalRevenue = 0;

  for (const fyLabel of fyLabels) {
    const fyResult = calculateProratedRawMaterialsForFY(fyLabel, fyGroups[fyLabel]);

    allAllocations.push(...fyResult.monthlyAllocations);
    totalOpeningStock += fyResult.fyOpeningStock;
    totalPurchases += fyResult.fyTotalPurchases;
    totalClosingStock += fyResult.fyClosingStock;
    totalRawMaterials += fyResult.fyTotalRawMaterials;
    totalRevenue += fyResult.fyTotalRevenue;
  }

  // Sort allocations by period
  allAllocations.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  return {
    fyOpeningStock: totalOpeningStock,
    fyTotalPurchases: totalPurchases,
    fyClosingStock: totalClosingStock,
    fyTotalRawMaterials: totalRawMaterials,
    fyTotalRevenue: totalRevenue,
    monthlyAllocations: allAllocations
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
