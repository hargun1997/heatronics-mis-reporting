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

// Hardcoded raw materials ratio overrides for specific FYs
// Ratio = Raw Materials / Net Revenue
const FY_RATIO_OVERRIDES: Record<string, number> = {
  'FY25-26': 0.4504485697,
  'FY24-25': 0.3096822168,
  'FY23-24': 0.561487163,
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

// ============================================
// FINANCIAL YEAR UTILITIES
// ============================================

/**
 * Financial Year info
 * Indian FY runs April to March
 * e.g., FY 24-25 = April 2024 to March 2025
 */
export interface FinancialYear {
  fyKey: string;      // e.g., "FY24-25"
  fyStartYear: number; // e.g., 2024 for FY 24-25
  fyEndYear: number;   // e.g., 2025 for FY 24-25
  startMonth: number;  // Always 4 (April)
  endMonth: number;    // Always 3 (March)
}

/**
 * Determine which Financial Year a month/year belongs to
 * Indian FY: April to March
 * - April 2024 to March 2025 = FY 24-25
 * - April 2025 to March 2026 = FY 25-26
 */
export function getFinancialYear(month: number, year: number): FinancialYear {
  // If month is Jan-Mar, it belongs to FY that started previous year
  // If month is Apr-Dec, it belongs to FY that started this year
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;

  return {
    fyKey: `FY${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`,
    fyStartYear,
    fyEndYear,
    startMonth: 4,  // April
    endMonth: 3     // March
  };
}

/**
 * Get all months that belong to a financial year
 */
export function getFYMonths(fy: FinancialYear): { month: number; year: number }[] {
  const months: { month: number; year: number }[] = [];

  // April to December of start year
  for (let m = 4; m <= 12; m++) {
    months.push({ month: m, year: fy.fyStartYear });
  }

  // January to March of end year
  for (let m = 1; m <= 3; m++) {
    months.push({ month: m, year: fy.fyEndYear });
  }

  return months;
}

/**
 * Check if a period is in a specific FY
 */
export function isPeriodInFY(month: number, year: number, fy: FinancialYear): boolean {
  const periodFY = getFinancialYear(month, year);
  return periodFY.fyKey === fy.fyKey;
}

// ============================================
// FY-AWARE RAW MATERIALS CALCULATION
// ============================================

/**
 * Calculation method used for raw materials
 */
export type RawMaterialsCalculationMethod =
  | 'FY25-26_PURCHASES_RATIO'  // Purchases / Sales ratio (no stock adjustment)
  | 'FY24-25_AUDITED'          // Opening (Apr) + Purchases - Closing (Mar)
  | 'FY23-24_PARTIAL'          // Opening (Jan) + Purchases - Closing (Mar) - partial data
  | 'LEGACY_MONTHLY';          // Old per-month calculation

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
  // FY info
  fyKey: string;
  calculationMethod: RawMaterialsCalculationMethod;

  // Annual totals
  fyOpeningStock: number;      // Opening stock from FY start (or earliest month)
  fyTotalPurchases: number;    // Sum of all purchases across the year
  fyClosingStock: number;      // Closing stock from the last submitted month
  fyTotalRawMaterials: number; // Total raw materials COGS for the year

  // Revenue data for proration
  fyTotalRevenue: number;      // Total revenue across all months

  // Ratio used for proration
  rawMaterialsRatio: number;   // Raw materials / Revenue ratio

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
 * Calculate FY-aware prorated raw materials cost.
 *
 * Different calculation methods based on FY:
 *
 * FY 25-26 (Unaudited):
 *   Ratio = Sum of Purchases / Sum of Net Sales
 *   Monthly Raw Materials = Ratio × Net Sales
 *
 * FY 24-25 (Audited):
 *   Annual Raw Materials = Opening Stock (April) + Sum of Purchases - Closing Stock (March)
 *   Ratio = Annual Raw Materials / Sum of Net Sales
 *   Monthly Raw Materials = Ratio × Net Sales
 *
 * FY 23-24 (Partial - only Jan-Mar 2024):
 *   Raw Materials = Opening Stock (January) + Sum of Purchases - Closing Stock (March)
 *   Ratio = Raw Materials / Sum of Net Sales
 *   Monthly Raw Materials = Ratio × Net Sales
 */
export function calculateFYAwareRawMaterials(
  monthlyData: MonthlyBSDataForProration[]
): ProratedRawMaterialsResult {
  if (monthlyData.length === 0) {
    return {
      fyKey: 'UNKNOWN',
      calculationMethod: 'LEGACY_MONTHLY',
      fyOpeningStock: 0,
      fyTotalPurchases: 0,
      fyClosingStock: 0,
      fyTotalRawMaterials: 0,
      fyTotalRevenue: 0,
      rawMaterialsRatio: 0,
      monthlyAllocations: []
    };
  }

  // Sort by period to ensure correct order (oldest first)
  const sortedData = [...monthlyData].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Determine which FY this data belongs to (use first month to determine)
  const firstMonth = sortedData[0];
  const fy = getFinancialYear(firstMonth.month, firstMonth.year);

  // Sum all purchases and revenue across the data
  const fyTotalPurchases = sortedData.reduce((sum, m) => sum + m.purchases, 0);
  const fyTotalRevenue = sortedData.reduce((sum, m) => sum + m.netRevenue, 0);

  let fyOpeningStock = 0;
  let fyClosingStock = 0;
  let fyTotalRawMaterials = 0;
  let calculationMethod: RawMaterialsCalculationMethod;
  let rawMaterialsRatio = 0;

  // Determine calculation method based on FY
  if (fy.fyKey === 'FY25-26') {
    // FY 25-26: Use hardcoded ratio override
    calculationMethod = 'FY25-26_PURCHASES_RATIO';
    fyOpeningStock = 0; // Not used in this method
    fyClosingStock = 0; // Not used in this method
    // Use hardcoded ratio if available, otherwise calculate from data
    rawMaterialsRatio = FY_RATIO_OVERRIDES[fy.fyKey] ?? (fyTotalRevenue > 0 ? fyTotalPurchases / fyTotalRevenue : 0);
    fyTotalRawMaterials = rawMaterialsRatio * fyTotalRevenue; // Derive from ratio × revenue

  } else if (fy.fyKey === 'FY24-25') {
    // FY 24-25: Use hardcoded ratio override
    calculationMethod = 'FY24-25_AUDITED';
    fyOpeningStock = 0;
    fyClosingStock = 0;
    // Use hardcoded ratio if available, otherwise calculate from data
    rawMaterialsRatio = FY_RATIO_OVERRIDES[fy.fyKey] ?? (fyTotalRevenue > 0 ? fyTotalPurchases / fyTotalRevenue : 0);
    fyTotalRawMaterials = rawMaterialsRatio * fyTotalRevenue;

  } else if (fy.fyKey === 'FY23-24') {
    // FY 23-24: Use hardcoded ratio override
    calculationMethod = 'FY23-24_PARTIAL';
    fyOpeningStock = 0;
    fyClosingStock = 0;
    // Use hardcoded ratio if available, otherwise calculate from data
    rawMaterialsRatio = FY_RATIO_OVERRIDES[fy.fyKey] ?? (fyTotalRevenue > 0 ? fyTotalPurchases / fyTotalRevenue : 0);
    fyTotalRawMaterials = rawMaterialsRatio * fyTotalRevenue;

  } else {
    // Other FYs: Use same logic as FY 24-25 (audited method)
    calculationMethod = 'LEGACY_MONTHLY';
    fyOpeningStock = sortedData[0].openingStock;
    fyClosingStock = sortedData[sortedData.length - 1].closingStock;
    fyTotalRawMaterials = Math.max(0, fyOpeningStock + fyTotalPurchases - fyClosingStock);
    rawMaterialsRatio = fyTotalRevenue > 0 ? fyTotalRawMaterials / fyTotalRevenue : 0;
  }

  // Calculate monthly allocations based on revenue ratios
  // Monthly Raw Materials = Ratio × Net Sales of that month
  const monthlyAllocations = sortedData.map(monthData => {
    const revenueRatio = fyTotalRevenue > 0
      ? monthData.netRevenue / fyTotalRevenue
      : 1 / sortedData.length;

    // Apply ratio to this month's revenue
    const allocatedRawMaterials = rawMaterialsRatio * monthData.netRevenue;

    return {
      periodKey: monthData.periodKey,
      month: monthData.month,
      year: monthData.year,
      revenueRatio,
      allocatedRawMaterials
    };
  });

  return {
    fyKey: fy.fyKey,
    calculationMethod,
    fyOpeningStock,
    fyTotalPurchases,
    fyClosingStock,
    fyTotalRawMaterials,
    fyTotalRevenue,
    rawMaterialsRatio,
    monthlyAllocations
  };
}

/**
 * Calculate prorated raw materials cost across months based on revenue ratios.
 * @deprecated Use calculateFYAwareRawMaterials instead for FY-specific logic
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
  // Use the new FY-aware calculation
  return calculateFYAwareRawMaterials(monthlyData);
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
