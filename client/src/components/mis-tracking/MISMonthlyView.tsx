import React, { useState, useMemo } from 'react';
import { MISRecord, MISPeriod, periodToString, periodToKey, SalesChannel, SALES_CHANNELS, createEmptyChannelRevenue, createEmptyMISRecord, createEmptyCOGMData, AggregatedBalanceSheetData } from '../../types/misTracking';
import { formatCurrency, formatCurrencyFull, formatPercent } from '../../utils/misCalculator';

// ============================================
// RANGE TYPES
// ============================================

type SelectionMode = 'single' | 'range';
type RangePreset = 'last3' | 'last6' | 'last12' | 'fy_current' | 'fy_previous' | 'ytd' | 'custom';

interface RangeOption {
  id: RangePreset;
  label: string;
  getMonths: (allPeriods: MISPeriod[]) => string[];
}

// ============================================
// AGGREGATION HELPER
// ============================================

function aggregateMISRecords(records: MISRecord[]): MISRecord | null {
  if (records.length === 0) return null;
  if (records.length === 1) return records[0];

  // Sort by period
  const sorted = [...records].sort((a, b) => {
    const keyA = a.periodKey;
    const keyB = b.periodKey;
    return keyA.localeCompare(keyB);
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Create aggregated record
  const aggregated: MISRecord = {
    period: first.period, // Use first period for display
    periodKey: `${first.periodKey}_to_${last.periodKey}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    states: [...new Set(records.flatMap(r => r.states))],

    // Initialize revenue
    revenue: {
      grossRevenue: createEmptyChannelRevenue(),
      totalGrossRevenue: 0,
      returns: createEmptyChannelRevenue(),
      totalReturns: 0,
      stockTransfers: [],
      totalStockTransfers: 0,
      discounts: createEmptyChannelRevenue(),
      totalDiscounts: 0,
      taxes: createEmptyChannelRevenue(),
      totalTaxes: 0,
      totalRevenue: 0,
      netRevenue: 0,
    },

    // Initialize COGM
    cogm: createEmptyCOGMData(),
    grossMargin: 0,
    grossMarginPercent: 0,

    // Initialize expenses
    channelFulfillment: { amazonFees: 0, blinkitFees: 0, d2cFees: 0, total: 0 },
    cm1: 0,
    cm1Percent: 0,

    salesMarketing: { facebookAds: 0, googleAds: 0, amazonAds: 0, blinkitAds: 0, agencyFees: 0, total: 0 },
    cm2: 0,
    cm2Percent: 0,

    platformCosts: { shopifySubscription: 0, watiSubscription: 0, shopfloSubscription: 0, total: 0 },
    cm3: 0,
    cm3Percent: 0,

    operatingExpenses: { salariesAdminMgmt: 0, miscellaneous: 0, legalCaExpenses: 0, platformCostsCRM: 0, administrativeExpenses: 0, total: 0 },
    ebitda: 0,
    ebitdaPercent: 0,

    nonOperating: { interestExpense: 0, depreciation: 0, amortization: 0, totalIDA: 0, incomeTax: 0 },
    ebt: 0,
    ebtPercent: 0,

    netIncome: 0,
    netIncomePercent: 0,

    classifiedTransactions: [],
    unclassifiedCount: 0,

    // Balance sheet will be aggregated specially
    balanceSheet: undefined,
  };

  // For balance sheet aggregation - special handling:
  // Opening Stock = first month's opening stock
  // Closing Stock = last month's closing stock
  // Purchases, Sales, Profit/Loss = summed across all months
  let bsAggregated: AggregatedBalanceSheetData | undefined = undefined;
  let hasAnyBSData = false;

  // Aggregate all records
  for (const record of records) {
    // Revenue
    for (const channel of SALES_CHANNELS) {
      aggregated.revenue.grossRevenue[channel] += record.revenue.grossRevenue[channel];
      aggregated.revenue.returns[channel] += record.revenue.returns[channel];
      aggregated.revenue.discounts[channel] += record.revenue.discounts[channel];
      aggregated.revenue.taxes[channel] += record.revenue.taxes[channel];
    }
    aggregated.revenue.totalGrossRevenue += record.revenue.totalGrossRevenue;
    aggregated.revenue.totalReturns += record.revenue.totalReturns;
    aggregated.revenue.stockTransfers.push(...record.revenue.stockTransfers);
    aggregated.revenue.totalStockTransfers += record.revenue.totalStockTransfers;
    aggregated.revenue.totalDiscounts += record.revenue.totalDiscounts;
    aggregated.revenue.totalTaxes += record.revenue.totalTaxes;
    aggregated.revenue.totalRevenue += record.revenue.totalRevenue;
    aggregated.revenue.netRevenue += record.revenue.netRevenue;

    // COGM
    aggregated.cogm.rawMaterialsInventory += record.cogm.rawMaterialsInventory;
    aggregated.cogm.manufacturingWages += record.cogm.manufacturingWages;
    aggregated.cogm.contractWagesMfg += record.cogm.contractWagesMfg;
    aggregated.cogm.inboundTransport += record.cogm.inboundTransport;
    aggregated.cogm.factoryRent += record.cogm.factoryRent;
    aggregated.cogm.factoryElectricity += record.cogm.factoryElectricity;
    aggregated.cogm.factoryMaintenance += record.cogm.factoryMaintenance;
    aggregated.cogm.jobWork += record.cogm.jobWork;
    aggregated.cogm.totalCOGM += record.cogm.totalCOGM;

    // Margins
    aggregated.grossMargin += record.grossMargin;

    // Channel & Fulfillment
    aggregated.channelFulfillment.amazonFees += record.channelFulfillment.amazonFees;
    aggregated.channelFulfillment.blinkitFees += record.channelFulfillment.blinkitFees;
    aggregated.channelFulfillment.d2cFees += record.channelFulfillment.d2cFees;
    aggregated.channelFulfillment.total += record.channelFulfillment.total;
    aggregated.cm1 += record.cm1;

    // Sales & Marketing
    aggregated.salesMarketing.facebookAds += record.salesMarketing.facebookAds;
    aggregated.salesMarketing.googleAds += record.salesMarketing.googleAds;
    aggregated.salesMarketing.amazonAds += record.salesMarketing.amazonAds;
    aggregated.salesMarketing.blinkitAds += record.salesMarketing.blinkitAds;
    aggregated.salesMarketing.agencyFees += record.salesMarketing.agencyFees;
    aggregated.salesMarketing.total += record.salesMarketing.total;
    aggregated.cm2 += record.cm2;

    // Platform Costs
    aggregated.platformCosts.shopifySubscription += record.platformCosts.shopifySubscription;
    aggregated.platformCosts.watiSubscription += record.platformCosts.watiSubscription;
    aggregated.platformCosts.shopfloSubscription += record.platformCosts.shopfloSubscription;
    aggregated.platformCosts.total += record.platformCosts.total;
    aggregated.cm3 += record.cm3;

    // Operating Expenses
    aggregated.operatingExpenses.salariesAdminMgmt += record.operatingExpenses.salariesAdminMgmt;
    aggregated.operatingExpenses.miscellaneous += record.operatingExpenses.miscellaneous;
    aggregated.operatingExpenses.legalCaExpenses += record.operatingExpenses.legalCaExpenses;
    aggregated.operatingExpenses.platformCostsCRM += record.operatingExpenses.platformCostsCRM;
    aggregated.operatingExpenses.administrativeExpenses += record.operatingExpenses.administrativeExpenses;
    aggregated.operatingExpenses.total += record.operatingExpenses.total;
    aggregated.ebitda += record.ebitda;

    // Non-Operating
    aggregated.nonOperating.interestExpense += record.nonOperating.interestExpense;
    aggregated.nonOperating.depreciation += record.nonOperating.depreciation;
    aggregated.nonOperating.amortization += record.nonOperating.amortization;
    aggregated.nonOperating.totalIDA += record.nonOperating.totalIDA;
    aggregated.nonOperating.incomeTax += record.nonOperating.incomeTax;
    aggregated.ebt += record.ebt;
    aggregated.netIncome += record.netIncome;

    // Transactions
    aggregated.classifiedTransactions.push(...record.classifiedTransactions);
    aggregated.unclassifiedCount += record.unclassifiedCount;

    // Balance Sheet aggregation - special handling
    if (record.balanceSheet) {
      hasAnyBSData = true;
      if (!bsAggregated) {
        // First record with BS data - initialize
        bsAggregated = {
          openingStock: record.balanceSheet.openingStock,
          closingStock: record.balanceSheet.closingStock,
          purchases: record.balanceSheet.purchases,
          grossSales: record.balanceSheet.grossSales,
          netSales: record.balanceSheet.netSales,
          grossProfit: record.balanceSheet.grossProfit,
          netProfitLoss: record.balanceSheet.netProfitLoss,
          calculatedCOGS: 0, // Will recalculate at the end
        };
      } else {
        // Subsequent records - sum most values, but keep updating closing stock
        bsAggregated.closingStock = record.balanceSheet.closingStock; // Last month's closing
        bsAggregated.purchases += record.balanceSheet.purchases;
        bsAggregated.grossSales += record.balanceSheet.grossSales;
        bsAggregated.netSales += record.balanceSheet.netSales;
        bsAggregated.grossProfit += record.balanceSheet.grossProfit;
        bsAggregated.netProfitLoss += record.balanceSheet.netProfitLoss;
      }
    }
  }

  // Finalize balance sheet aggregation
  if (hasAnyBSData && bsAggregated) {
    // Recalculate COGS: Opening (first month) + Total Purchases - Closing (last month)
    bsAggregated.calculatedCOGS = bsAggregated.openingStock + bsAggregated.purchases - bsAggregated.closingStock;
    aggregated.balanceSheet = bsAggregated;
  }

  // Recalculate percentages
  const netRevenue = aggregated.revenue.netRevenue;
  if (netRevenue > 0) {
    aggregated.grossMarginPercent = (aggregated.grossMargin / netRevenue) * 100;
    aggregated.cm1Percent = (aggregated.cm1 / netRevenue) * 100;
    aggregated.cm2Percent = (aggregated.cm2 / netRevenue) * 100;
    aggregated.cm3Percent = (aggregated.cm3 / netRevenue) * 100;
    aggregated.ebitdaPercent = (aggregated.ebitda / netRevenue) * 100;
    aggregated.ebtPercent = (aggregated.ebt / netRevenue) * 100;
    aggregated.netIncomePercent = (aggregated.netIncome / netRevenue) * 100;
  }

  return aggregated;
}

// ============================================
// RANGE PRESETS
// ============================================

function getRangePresets(): RangeOption[] {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  // FY in India runs April to March
  const currentFYStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  const previousFYStart = currentFYStart - 1;

  return [
    {
      id: 'last3',
      label: 'Last 3 Months',
      getMonths: (allPeriods) => {
        const keys: string[] = [];
        for (let i = 0; i < 3; i++) {
          let month = currentMonth - i;
          let year = currentYear;
          if (month <= 0) { month += 12; year -= 1; }
          keys.push(`${year}-${String(month).padStart(2, '0')}`);
        }
        return keys.filter(k => allPeriods.some(p => periodToKey(p) === k));
      }
    },
    {
      id: 'last6',
      label: 'Last 6 Months',
      getMonths: (allPeriods) => {
        const keys: string[] = [];
        for (let i = 0; i < 6; i++) {
          let month = currentMonth - i;
          let year = currentYear;
          while (month <= 0) { month += 12; year -= 1; }
          keys.push(`${year}-${String(month).padStart(2, '0')}`);
        }
        return keys.filter(k => allPeriods.some(p => periodToKey(p) === k));
      }
    },
    {
      id: 'last12',
      label: 'Last 12 Months',
      getMonths: (allPeriods) => {
        const keys: string[] = [];
        for (let i = 0; i < 12; i++) {
          let month = currentMonth - i;
          let year = currentYear;
          while (month <= 0) { month += 12; year -= 1; }
          keys.push(`${year}-${String(month).padStart(2, '0')}`);
        }
        return keys.filter(k => allPeriods.some(p => periodToKey(p) === k));
      }
    },
    {
      id: 'ytd',
      label: 'Year to Date',
      getMonths: (allPeriods) => {
        const keys: string[] = [];
        for (let month = 1; month <= currentMonth; month++) {
          keys.push(`${currentYear}-${String(month).padStart(2, '0')}`);
        }
        return keys.filter(k => allPeriods.some(p => periodToKey(p) === k));
      }
    },
    {
      id: 'fy_current',
      label: `FY ${currentFYStart}-${(currentFYStart + 1).toString().slice(2)}`,
      getMonths: (allPeriods) => {
        const keys: string[] = [];
        // April to March
        for (let month = 4; month <= 12; month++) {
          keys.push(`${currentFYStart}-${String(month).padStart(2, '0')}`);
        }
        for (let month = 1; month <= 3; month++) {
          keys.push(`${currentFYStart + 1}-${String(month).padStart(2, '0')}`);
        }
        return keys.filter(k => allPeriods.some(p => periodToKey(p) === k));
      }
    },
    {
      id: 'fy_previous',
      label: `FY ${previousFYStart}-${(previousFYStart + 1).toString().slice(2)}`,
      getMonths: (allPeriods) => {
        const keys: string[] = [];
        for (let month = 4; month <= 12; month++) {
          keys.push(`${previousFYStart}-${String(month).padStart(2, '0')}`);
        }
        for (let month = 1; month <= 3; month++) {
          keys.push(`${previousFYStart + 1}-${String(month).padStart(2, '0')}`);
        }
        return keys.filter(k => allPeriods.some(p => periodToKey(p) === k));
      }
    },
    {
      id: 'custom',
      label: 'Custom Selection',
      getMonths: () => []
    }
  ];
}

// ============================================
// PROPS
// ============================================

interface MISMonthlyViewProps {
  currentMIS: MISRecord | null;
  savedPeriods: { periodKey: string; period: MISPeriod }[];
  onPeriodChange: (periodKey: string) => void;
  allMISRecords?: MISRecord[]; // All records for aggregation
}

export function MISMonthlyView({ currentMIS, savedPeriods, onPeriodChange, allMISRecords = [] }: MISMonthlyViewProps) {
  const [showChannelBreakdown, setShowChannelBreakdown] = useState(true);
  const [showAlgorithmGuide, setShowAlgorithmGuide] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('single');
  const [selectedPreset, setSelectedPreset] = useState<RangePreset | null>(null);
  const [customSelectedMonths, setCustomSelectedMonths] = useState<Set<string>>(new Set());

  const rangePresets = useMemo(() => getRangePresets(), []);

  // Get the periods available for selection based on preset
  const selectedPeriodKeys = useMemo(() => {
    if (selectionMode === 'single') return currentMIS ? [currentMIS.periodKey] : [];

    if (selectedPreset === 'custom') {
      return Array.from(customSelectedMonths);
    }

    const preset = rangePresets.find(p => p.id === selectedPreset);
    if (!preset) return [];

    return preset.getMonths(savedPeriods.map(p => p.period));
  }, [selectionMode, selectedPreset, customSelectedMonths, savedPeriods, currentMIS, rangePresets]);

  // Get the MIS record(s) to display (aggregated if range)
  const displayMIS = useMemo(() => {
    if (selectionMode === 'single') return currentMIS;

    const records = allMISRecords.filter(r => selectedPeriodKeys.includes(r.periodKey));
    return aggregateMISRecords(records);
  }, [selectionMode, selectedPeriodKeys, allMISRecords, currentMIS]);

  // Get display title for range
  const displayTitle = useMemo(() => {
    if (selectionMode === 'single' && displayMIS) {
      return periodToString(displayMIS.period);
    }

    if (selectedPeriodKeys.length === 0) return 'No periods selected';

    const preset = rangePresets.find(p => p.id === selectedPreset);
    if (preset && preset.id !== 'custom') {
      return `${preset.label} (${selectedPeriodKeys.length} months)`;
    }

    // Custom selection - show range
    const sorted = [...selectedPeriodKeys].sort();
    if (sorted.length === 1) {
      const p = savedPeriods.find(sp => sp.periodKey === sorted[0]);
      return p ? periodToString(p.period) : sorted[0];
    }

    const firstPeriod = savedPeriods.find(sp => sp.periodKey === sorted[0]);
    const lastPeriod = savedPeriods.find(sp => sp.periodKey === sorted[sorted.length - 1]);
    if (firstPeriod && lastPeriod) {
      return `${periodToString(firstPeriod.period)} - ${periodToString(lastPeriod.period)} (${sorted.length} months)`;
    }

    return `${sorted.length} months selected`;
  }, [selectionMode, selectedPeriodKeys, savedPeriods, displayMIS, selectedPreset, rangePresets]);

  const toggleCustomMonth = (periodKey: string) => {
    setCustomSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(periodKey)) {
        next.delete(periodKey);
      } else {
        next.add(periodKey);
      }
      return next;
    });
  };

  if (!displayMIS && savedPeriods.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-600 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-300 mb-2">No MIS Data</h3>
        <p className="text-slate-500 mb-4">
          Upload documents in the Timeline tab to generate MIS
        </p>
      </div>
    );
  }

  // These values are only used when displayMIS exists (the table is conditionally rendered)
  // We use defaults to satisfy TypeScript, but they're never actually used when displayMIS is null
  const revenue = displayMIS ? displayMIS.revenue : { grossRevenue: createEmptyChannelRevenue(), totalGrossRevenue: 0, returns: createEmptyChannelRevenue(), totalReturns: 0, stockTransfers: [], totalStockTransfers: 0, discounts: createEmptyChannelRevenue(), totalDiscounts: 0, taxes: createEmptyChannelRevenue(), totalTaxes: 0, totalRevenue: 0, netRevenue: 0 };
  const cogm = displayMIS ? displayMIS.cogm : createEmptyCOGMData();
  const channelFulfillment = displayMIS ? displayMIS.channelFulfillment : { amazonFees: 0, blinkitFees: 0, d2cFees: 0, total: 0 };
  const salesMarketing = displayMIS ? displayMIS.salesMarketing : { facebookAds: 0, googleAds: 0, amazonAds: 0, blinkitAds: 0, agencyFees: 0, total: 0 };
  const platformCosts = displayMIS ? displayMIS.platformCosts : { shopifySubscription: 0, watiSubscription: 0, shopfloSubscription: 0, total: 0 };
  const operatingExpenses = displayMIS ? displayMIS.operatingExpenses : { salariesAdminMgmt: 0, miscellaneous: 0, legalCaExpenses: 0, platformCostsCRM: 0, administrativeExpenses: 0, total: 0 };
  const nonOperating = displayMIS ? displayMIS.nonOperating : { interestExpense: 0, depreciation: 0, amortization: 0, totalIDA: 0, incomeTax: 0 };
  const netRevenue = revenue.netRevenue;

  return (
    <div className="space-y-6">
      {/* Period Selection Controls */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
        <div className="flex flex-col gap-4">
          {/* Mode Toggle */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">View Mode:</span>
            <div className="flex items-center bg-slate-700/50 rounded-lg p-0.5">
              <button
                onClick={() => setSelectionMode('single')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  selectionMode === 'single'
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Month
              </button>
              <button
                onClick={() => {
                  setSelectionMode('range');
                  if (!selectedPreset) setSelectedPreset('last6');
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  selectionMode === 'range'
                    ? 'bg-blue-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Aggregate Range
              </button>
            </div>
          </div>

          {/* Single Month Selection */}
          {selectionMode === 'single' && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">Period:</span>
              <select
                value={currentMIS?.periodKey || ''}
                onChange={(e) => onPeriodChange(e.target.value)}
                className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 min-w-[150px]"
              >
                <option value="">Select a period...</option>
                {savedPeriods.map(p => (
                  <option key={p.periodKey} value={p.periodKey}>
                    {periodToString(p.period)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Range Selection */}
          {selectionMode === 'range' && (
            <div className="space-y-3">
              {/* Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-400">Quick Select:</span>
                {rangePresets.map(preset => {
                  const monthCount = preset.id !== 'custom'
                    ? preset.getMonths(savedPeriods.map(p => p.period)).length
                    : customSelectedMonths.size;
                  const isDisabled = preset.id !== 'custom' && monthCount === 0;

                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      disabled={isDisabled}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                        selectedPreset === preset.id
                          ? 'bg-blue-500 text-white'
                          : isDisabled
                          ? 'bg-slate-700/30 text-slate-600 cursor-not-allowed'
                          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                      }`}
                    >
                      {preset.label}
                      {preset.id !== 'custom' && monthCount > 0 && (
                        <span className="ml-1 text-slate-400">({monthCount})</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Custom Month Selection */}
              {selectedPreset === 'custom' && (
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-slate-300 font-medium">Select months to aggregate:</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCustomSelectedMonths(new Set(savedPeriods.map(p => p.periodKey)))}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setCustomSelectedMonths(new Set())}
                        className="text-xs text-slate-400 hover:text-slate-300"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {savedPeriods
                      .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
                      .map(p => (
                        <button
                          key={p.periodKey}
                          onClick={() => toggleCustomMonth(p.periodKey)}
                          className={`px-2 py-1.5 text-xs rounded-md transition-all ${
                            customSelectedMonths.has(p.periodKey)
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-600/50 text-slate-300 hover:bg-slate-500/50'
                          }`}
                        >
                          {periodToString(p.period)}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Selected Summary */}
              {selectedPeriodKeys.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-400 font-medium">
                    {selectedPeriodKeys.length} month{selectedPeriodKeys.length !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400">
                    {displayTitle}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Header with Title & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-semibold text-slate-200">
            {selectionMode === 'single' && displayMIS
              ? `MIS for ${periodToString(displayMIS.period)}`
              : selectionMode === 'range' && displayMIS
              ? `Aggregated MIS: ${displayTitle}`
              : 'MIS Report'
            }
          </h3>
          {selectionMode === 'range' && selectedPeriodKeys.length > 1 && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
              Aggregated
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center text-sm text-slate-400">
            <input
              type="checkbox"
              checked={showChannelBreakdown}
              onChange={(e) => setShowChannelBreakdown(e.target.checked)}
              className="mr-2 rounded bg-slate-700 border-slate-600"
            />
            Show channel breakdown
          </label>

          <button
            onClick={() => setShowAlgorithmGuide(true)}
            className="px-4 py-2 text-sm text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors"
          >
            Algorithm Guide
          </button>

          <button className="px-4 py-2 text-sm text-slate-400 border border-slate-600 rounded-lg hover:bg-slate-700/50 hover:text-slate-300 transition-colors">
            Export
          </button>
        </div>
      </div>

      {/* Algorithm Guide Modal */}
      {showAlgorithmGuide && (
        <AlgorithmGuideModal onClose={() => setShowAlgorithmGuide(false)} />
      )}

      {/* No Data State */}
      {!displayMIS && (
        <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700">
          <div className="text-slate-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-300 mb-2">
            {selectionMode === 'range' ? 'No Data for Selected Range' : 'No MIS Data'}
          </h3>
          <p className="text-slate-500">
            {selectionMode === 'range'
              ? 'Select months with generated MIS data or use a different range preset.'
              : savedPeriods.length > 0
              ? 'Select a period from the dropdown above.'
              : 'Upload documents in the Timeline tab to generate MIS.'
            }
          </p>
        </div>
      )}

      {/* Key Metrics Cards */}
      {displayMIS && (
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            label="Net Revenue"
            value={formatCurrency(netRevenue)}
            color="blue"
          />
          <MetricCard
            label="Gross Margin"
            value={formatPercent(displayMIS.grossMarginPercent)}
            subValue={formatCurrency(displayMIS.grossMargin)}
            color="emerald"
          />
          <MetricCard
            label="CM1"
            value={formatPercent(displayMIS.cm1Percent)}
            subValue={formatCurrency(displayMIS.cm1)}
            color="violet"
          />
          <MetricCard
            label="EBITDA"
            value={formatPercent(displayMIS.ebitdaPercent)}
            subValue={formatCurrency(displayMIS.ebitda)}
            color={displayMIS.ebitda >= 0 ? 'emerald' : 'red'}
          />
        </div>
      )}

      {/* P&L Table */}
      {displayMIS && (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/50 border-b border-slate-700">
              <th className="text-left py-3 px-4 font-medium text-slate-300 text-sm">P&L</th>
              <th className="text-right py-3 px-4 font-medium text-slate-300 text-sm">Amount</th>
              <th className="text-right py-3 px-4 font-medium text-slate-300 text-sm">% of Net Rev</th>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <th key={channel} className="text-right py-3 px-4 font-medium text-slate-400 text-xs">
                  {channel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* A. Total Revenue (With GST) */}
            <SectionHeader label="A" title="Total Revenue (With GST)" />
            {SALES_CHANNELS.map((channel, idx) => (
              <LineItem
                key={channel}
                number={idx + 1}
                label={channel}
                amount={revenue.grossRevenue[channel]}
                netRevenue={netRevenue}
                showChannelBreakdown={showChannelBreakdown}
                channelValues={{ [channel]: revenue.grossRevenue[channel] }}
              />
            ))}
            <SubtotalRow
              number={6}
              label="Gross Revenue"
              amount={revenue.totalGrossRevenue}
              netRevenue={netRevenue}
              showChannelBreakdown={showChannelBreakdown}
            />

            {/* B. Less: Returns */}
            <SectionHeader label="B" title="Less: RETURNS" subtitle="(Enter as positive numbers)" />
            {SALES_CHANNELS.map((channel, idx) => (
              <LineItem
                key={channel}
                number={idx + 1}
                label={channel}
                amount={revenue.returns[channel]}
                netRevenue={netRevenue}
                showChannelBreakdown={showChannelBreakdown}
                channelValues={{ [channel]: revenue.returns[channel] }}
              />
            ))}
            <SubtotalRow
              number={6}
              label="Total Returns"
              amount={revenue.totalReturns}
              netRevenue={netRevenue}
              showChannelBreakdown={showChannelBreakdown}
              highlight="orange"
            />

            {/* Stock Transfers (if any) */}
            {revenue.totalStockTransfers > 0 && (
              <>
                <tr className="bg-purple-500/10">
                  <td colSpan={showChannelBreakdown ? 3 + SALES_CHANNELS.length : 3} className="py-2 px-4">
                    <span className="font-medium text-purple-400">Stock Transfers (Excluded)</span>
                    <span className="ml-4 text-purple-400">{formatCurrencyFull(revenue.totalStockTransfers)}</span>
                    <span className="ml-4 text-sm text-purple-400/70">
                      {revenue.stockTransfers.map(t => `${t.fromState}→${t.toState}: ${formatCurrency(t.amount)}`).join(' | ')}
                    </span>
                  </td>
                </tr>
              </>
            )}

            {/* Total Revenue Line */}
            <tr className="bg-slate-700/30 font-semibold">
              <td className="py-3 px-4 text-slate-200 text-sm">
                <span className="mr-2 text-slate-500">7</span>
                Total Revenue
              </td>
              <td className="py-3 px-4 text-right text-slate-200 text-sm">{formatCurrencyFull(revenue.totalRevenue)}</td>
              <td className="py-3 px-4 text-right text-slate-400 text-sm">-</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-3 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>

            {/* D. Less: Taxes */}
            <SectionHeader label="D" title="Less: Taxes (GST)" subtitle="(Enter as positive numbers)" />
            {SALES_CHANNELS.map((channel, idx) => (
              <LineItem
                key={channel}
                number={idx + 1}
                label={channel}
                amount={revenue.taxes[channel]}
                netRevenue={netRevenue}
                showChannelBreakdown={showChannelBreakdown}
                channelValues={{ [channel]: revenue.taxes[channel] }}
              />
            ))}
            <SubtotalRow
              number={6}
              label="Total Taxes"
              amount={revenue.totalTaxes}
              netRevenue={netRevenue}
              showChannelBreakdown={showChannelBreakdown}
              highlight="purple"
            />

            {/* NET REVENUE */}
            <tr className="bg-orange-500/20 font-bold">
              <td className="py-4 px-4 text-orange-400 text-sm">NET REVENUE</td>
              <td className="py-4 px-4 text-right text-orange-400 text-sm">{formatCurrencyFull(netRevenue)}</td>
              <td className="py-4 px-4 text-right text-orange-400/80 text-sm">100%</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-orange-400/50 text-xs">-</td>
              ))}
            </tr>

            {/* E. COGM */}
            <SectionHeader label="E" title="COST OF GOODS MANUFACTURED (COGM)" />
            <LineItem number={1} label="Raw Materials & Inventory" amount={cogm.rawMaterialsInventory} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Manufacturing Wages" amount={cogm.manufacturingWages} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Contract Wages (Mfg)" amount={cogm.contractWagesMfg} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={4} label="Inbound Transport" amount={cogm.inboundTransport} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={5} label="Factory Rent" amount={cogm.factoryRent} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS@10%" />
            <LineItem number={6} label="Factory Electricity" amount={cogm.factoryElectricity} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={7} label="Factory Maintainence" amount={cogm.factoryMaintenance} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="Power Backup" />
            <LineItem number={8} label="Job work" amount={cogm.jobWork} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={9} label="Total COGM" amount={cogm.totalCOGM} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="blue" />

            {/* GROSS MARGIN */}
            <tr className="bg-emerald-500/20 font-bold">
              <td className="py-4 px-4 text-emerald-400 text-sm">GROSS MARGIN (NET REVENUE - COGS)</td>
              <td className="py-4 px-4 text-right text-emerald-400 text-sm">{formatCurrencyFull(displayMIS.grossMargin)}</td>
              <td className="py-4 px-4 text-right text-emerald-400/80 text-sm">{formatPercent(displayMIS.grossMarginPercent)}</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-emerald-400/50 text-xs">-</td>
              ))}
            </tr>

            {/* F. Channel & Fulfillment */}
            <SectionHeader label="F" title="CHANNEL & FULFILLMENT" />
            <LineItem number={1} label="Amazon Fees" amount={channelFulfillment.amazonFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Blinkit Fees" amount={channelFulfillment.blinkitFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="D2C Fees" amount={channelFulfillment.d2cFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={7} label="Total Channel & Fulfillment" amount={channelFulfillment.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="indigo" />

            {/* CM1 */}
            <MarginRow label="CM1 (CONTRIBUTION MARGIN)" sublabel="(NET REVENUE - (COGS + CHANNEL&FULFILLMENT COSTS))" amount={displayMIS.cm1} percent={displayMIS.cm1Percent} showChannelBreakdown={showChannelBreakdown} />

            {/* G. Sales & Marketing */}
            <SectionHeader label="G" title="SALES & MARKETING (S&M)" />
            <LineItem number={1} label="Facebook Ads" amount={salesMarketing.facebookAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={2} label="Google Ads" amount={salesMarketing.googleAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={3} label="Amazon Ads" amount={salesMarketing.amazonAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={4} label="Blinkit Ads" amount={salesMarketing.blinkitAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={5} label="Agency Fees" amount={salesMarketing.agencyFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Deduct @10%" />
            <SubtotalRow number={7} label="Total S&M" amount={salesMarketing.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="pink" />

            {/* CM2 */}
            <MarginRow label="CM2 (AFTER MARKETING)" sublabel="(CM1 - MARKETING EXPENSES)" amount={displayMIS.cm2} percent={displayMIS.cm2Percent} showChannelBreakdown={showChannelBreakdown} />

            {/* H. Platform Costs */}
            <SectionHeader label="H" title="CHANNEL/PLATFORM OPERATION COSTS" />
            <LineItem number={1} label="Shopify Subscription" amount={platformCosts.shopifySubscription} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Wati Subscription" amount={platformCosts.watiSubscription} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Shopflo subscription" amount={platformCosts.shopfloSubscription} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={7} label="Total Channel and Platform Costs" amount={platformCosts.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="cyan" />

            {/* CM3 */}
            <MarginRow label="CM3 (AFTER CHANNEL OPERATIONS)" sublabel="(CM2 - CHANNEL OPERATIONS)" amount={displayMIS.cm3} percent={displayMIS.cm3Percent} showChannelBreakdown={showChannelBreakdown} />

            {/* I. Operating Expenses */}
            <SectionHeader label="I" title="OPERATING EXPENSES" />
            <LineItem number={1} label="Salaries (Admin, Mgmt)" amount={operatingExpenses.salariesAdminMgmt} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Miscellaneous (Travel, insurance)" amount={operatingExpenses.miscellaneous} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Legal & CA expenses" amount={operatingExpenses.legalCaExpenses} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={4} label="Platform Costs (CRM, inventory softwares)" amount={operatingExpenses.platformCostsCRM} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="Capex" />
            <LineItem number={5} label="Administrative Expenses (Office Rent, utilities, admin supplies)" amount={operatingExpenses.administrativeExpenses} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={6} label="Total Operating Expense" amount={operatingExpenses.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="yellow" />

            {/* EBITDA */}
            <tr className={`font-bold ${displayMIS.ebitda >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              <td className={`py-4 px-4 text-sm ${displayMIS.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                OPERATING PROFIT (EBITDA) (CM3 - Operating Expenses)
              </td>
              <td className={`py-4 px-4 text-right text-sm ${displayMIS.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrencyFull(displayMIS.ebitda)}
              </td>
              <td className={`py-4 px-4 text-right text-sm ${displayMIS.ebitda >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                {formatPercent(displayMIS.ebitdaPercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>

            {/* J. Non-Operating */}
            <SectionHeader label="J" title="NON-OPERATING" />
            <LineItem number={1} label="Less: Interest Expense" amount={nonOperating.interestExpense} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Less: Depreciation" amount={nonOperating.depreciation} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Less: Amortization" amount={nonOperating.amortization} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={4} label="Total I,D&A" amount={nonOperating.totalIDA} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="gray" />

            {/* EBT */}
            <tr className={`font-bold ${displayMIS.ebt >= 0 ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
              <td className={`py-4 px-4 text-sm ${displayMIS.ebt >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                NET INCOME Before Tax (EBT)
              </td>
              <td className={`py-4 px-4 text-right text-sm ${displayMIS.ebt >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {formatCurrencyFull(displayMIS.ebt)}
              </td>
              <td className={`py-4 px-4 text-right text-sm ${displayMIS.ebt >= 0 ? 'text-blue-400/80' : 'text-red-400/80'}`}>
                {formatPercent(displayMIS.ebtPercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>

            {/* Income Tax */}
            <LineItem number={4} label="Less: Income Tax" amount={nonOperating.incomeTax} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />

            {/* NET INCOME */}
            <tr className={`font-bold ${displayMIS.netIncome >= 0 ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
              <td className={`py-4 px-4 text-sm ${displayMIS.netIncome >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                NET INCOME (PROFIT / LOSS)
              </td>
              <td className={`py-4 px-4 text-right text-sm ${displayMIS.netIncome >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatCurrencyFull(displayMIS.netIncome)}
              </td>
              <td className={`py-4 px-4 text-right text-sm ${displayMIS.netIncome >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                {formatPercent(displayMIS.netIncomePercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {/* Balance Sheet Reconciliation Section */}
      {displayMIS && displayMIS.balanceSheet && (
        <ReconciliationSection
          balanceSheet={displayMIS.balanceSheet}
          misNetRevenue={netRevenue}
          misCOGM={cogm.totalCOGM}
          misNetIncome={displayMIS.netIncome}
        />
      )}
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function MetricCard({ label, value, subValue, color }: { label: string; value: string; subValue?: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400'
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
    </div>
  );
}

function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <tr className="bg-amber-500/15">
      <td colSpan={100} className="py-3 px-4">
        <span className="font-bold text-amber-400">{label}</span>
        <span className="ml-3 font-semibold text-amber-400">{title}</span>
        {subtitle && <span className="ml-2 text-sm text-amber-400/70">{subtitle}</span>}
      </td>
    </tr>
  );
}

function LineItem({
  number,
  label,
  amount,
  netRevenue,
  showChannelBreakdown,
  channelValues,
  note
}: {
  number: number;
  label: string;
  amount: number;
  netRevenue: number;
  showChannelBreakdown: boolean;
  channelValues?: Partial<Record<SalesChannel, number>>;
  note?: string;
}) {
  const percent = netRevenue > 0 ? (amount / netRevenue) * 100 : 0;

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-700/20">
      <td className="py-2 px-4 text-slate-300 text-sm">
        <span className="text-slate-500 mr-2">{number}</span>
        {label}
        {note && <span className="ml-2 text-xs text-slate-500">{note}</span>}
      </td>
      <td className="py-2 px-4 text-right text-slate-300 text-sm">{formatCurrencyFull(amount)}</td>
      <td className="py-2 px-4 text-right text-slate-500 text-sm">{amount > 0 ? formatPercent(percent) : '-'}</td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-2 px-4 text-right text-slate-500 text-xs">
          {channelValues?.[channel] ? formatCurrency(channelValues[channel]!) : '-'}
        </td>
      ))}
    </tr>
  );
}

function SubtotalRow({
  number,
  label,
  amount,
  netRevenue,
  showChannelBreakdown,
  highlight
}: {
  number: number;
  label: string;
  amount: number;
  netRevenue: number;
  showChannelBreakdown: boolean;
  highlight?: string;
}) {
  const percent = netRevenue > 0 ? (amount / netRevenue) * 100 : 0;

  const bgClasses: Record<string, string> = {
    orange: 'bg-orange-500/10',
    purple: 'bg-purple-500/10',
    blue: 'bg-blue-500/10',
    indigo: 'bg-indigo-500/10',
    pink: 'bg-pink-500/10',
    cyan: 'bg-cyan-500/10',
    yellow: 'bg-yellow-500/10',
    gray: 'bg-slate-700/30'
  };

  return (
    <tr className={`font-semibold ${highlight ? bgClasses[highlight] : 'bg-slate-700/20'}`}>
      <td className="py-3 px-4 text-slate-200 text-sm">
        <span className="text-slate-500 mr-2">{number}</span>
        {label}
      </td>
      <td className="py-3 px-4 text-right text-slate-200 text-sm">{formatCurrencyFull(amount)}</td>
      <td className="py-3 px-4 text-right text-slate-400 text-sm">{formatPercent(percent)}</td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-3 px-4 text-right text-slate-500 text-xs">-</td>
      ))}
    </tr>
  );
}

function MarginRow({
  label,
  sublabel,
  amount,
  percent,
  showChannelBreakdown
}: {
  label: string;
  sublabel: string;
  amount: number;
  percent: number;
  showChannelBreakdown: boolean;
}) {
  const isPositive = amount >= 0;

  return (
    <tr className={isPositive ? 'bg-emerald-500/15' : 'bg-red-500/15'}>
      <td className={`py-3 px-4 font-semibold text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {label}
        <div className="text-xs font-normal text-slate-500">{sublabel}</div>
      </td>
      <td className={`py-3 px-4 text-right font-semibold text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {formatCurrencyFull(amount)}
      </td>
      <td className={`py-3 px-4 text-right font-semibold text-sm ${isPositive ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
        {formatPercent(percent)}
      </td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-3 px-4 text-right text-slate-500 text-xs">-</td>
      ))}
    </tr>
  );
}

// ============================================
// ALGORITHM GUIDE MODAL
// ============================================

export function AlgorithmGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-slate-700/50 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">MIS Calculation Algorithm Guide</h2>
            <p className="text-sm text-slate-400">How data flows from source files to the P&L report</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-600/50 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)] space-y-6 text-sm">
          {/* Data Sources */}
          <Section title="1. Data Sources & Fetching" color="blue">
            <p className="text-slate-400 mb-3">The system fetches 4 types of files from Google Drive for each state:</p>
            <ul className="space-y-2 text-slate-300">
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">BS.pdf</span>
                <span className="text-slate-500">→</span>
                <span><strong>Balance Sheet</strong> - Authoritative source for Opening Stock, Closing Stock, Purchases, Net Sales</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">SR.xlsx</span>
                <span className="text-slate-500">→</span>
                <span><strong>Sales Register</strong> - Line-by-line sales with party names, amounts, GST (for channel classification)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">PR.xlsx</span>
                <span className="text-slate-500">→</span>
                <span><strong>Purchase Register</strong> - Purchase details (used for validation against BS)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">JR.xlsx</span>
                <span className="text-slate-500">→</span>
                <span><strong>Journal Register</strong> - All expense transactions for classification into cost heads</span>
              </li>
            </ul>
            <div className="mt-3 p-3 bg-slate-700/30 rounded-lg text-slate-400">
              <strong className="text-slate-300">Note:</strong> All 4 files are optional. MIS can be generated with whatever files are available.
            </div>
          </Section>

          {/* Revenue Calculation */}
          <Section title="2. Revenue Calculation (from Sales Register)" color="emerald">
            <div className="space-y-3">
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <div className="font-mono text-emerald-400 mb-2">Net Revenue = Gross Sales - Returns - Stock Transfers - GST</div>
              </div>
              <p className="text-slate-400">Sales are classified into channels based on party name patterns:</p>
              <ul className="space-y-1 text-slate-300 ml-4">
                <li>• <strong>Amazon</strong>: "Amazon", "AMZN", "AMZ"</li>
                <li>• <strong>Blinkit</strong>: "Blinkit", "Grofers"</li>
                <li>• <strong>Website</strong>: "Shopify", "Website", direct D2C orders</li>
                <li>• <strong>Offline/OEM</strong>: Distributors, B2B orders</li>
                <li>• <strong>Other</strong>: Unclassified sales</li>
              </ul>
              <p className="text-slate-400 mt-2">
                <strong>Stock Transfers</strong> (inter-company between states like UP→KA) are identified and excluded from net revenue.
              </p>
            </div>
          </Section>

          {/* COGS Calculation */}
          <Section title="3. COGS (Cost of Goods Sold)" color="orange">
            <div className="p-3 bg-slate-700/30 rounded-lg font-mono text-orange-400">
              COGS = Opening Stock + Purchases - Closing Stock
            </div>
            <p className="text-slate-400 mt-3">
              All values are sourced from the <strong>Balance Sheet (BS.pdf)</strong> which is considered the authoritative source.
              The Purchase Register is used for validation to ensure purchases match.
            </p>
            <div className="mt-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
              <div className="font-mono text-orange-400">Gross Margin = Net Revenue - COGS</div>
              <div className="text-slate-400 text-xs mt-1">Gross Margin % = (Gross Margin / Net Revenue) × 100</div>
            </div>
          </Section>

          {/* Expense Classification */}
          <Section title="4. Expense Classification (from Journal Register)" color="violet">
            <p className="text-slate-400 mb-3">
              Journal transactions are classified into expense heads based on account name patterns:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <ExpenseCategory
                title="Channel & Fulfillment"
                color="blue"
                items={["Shipping & Freight", "Packaging Materials", "Marketplace Fees", "Payment Gateway Charges", "Warehousing"]}
              />
              <ExpenseCategory
                title="Sales & Marketing"
                color="pink"
                items={["Advertising (Amazon, FB, Google)", "Influencer Marketing", "Promotions & Discounts", "Brand Building"]}
              />
              <ExpenseCategory
                title="Platform Costs"
                color="cyan"
                items={["Software Subscriptions", "IT Infrastructure", "ERP/Accounting Tools", "Hosting & Domains"]}
              />
              <ExpenseCategory
                title="Operating Expenses"
                color="yellow"
                items={["Salaries & Wages", "Rent & Utilities", "Legal & Professional", "Travel & Conveyance", "Office Expenses"]}
              />
            </div>
            <div className="mt-3 p-3 bg-slate-700/30 rounded-lg text-slate-400">
              <strong className="text-slate-300">Unclassified:</strong> Transactions that don't match any pattern are flagged for manual review.
              You can teach the system by classifying them - patterns are learned for future use.
            </div>
          </Section>

          {/* Contribution Margins */}
          <Section title="5. Contribution Margins (CM1, CM2, CM3)" color="indigo">
            <div className="space-y-3">
              <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="font-mono text-emerald-400">CM1 = Gross Margin - Channel & Fulfillment Costs</div>
                <div className="text-slate-400 text-xs mt-1">
                  Shows profitability after direct selling costs. Should be positive for viable unit economics.
                </div>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="font-mono text-blue-400">CM2 = CM1 - Sales & Marketing Costs</div>
                <div className="text-slate-400 text-xs mt-1">
                  Shows profitability after customer acquisition costs. Key metric for marketing efficiency.
                </div>
              </div>
              <div className="p-3 bg-violet-500/10 rounded-lg border border-violet-500/20">
                <div className="font-mono text-violet-400">CM3 = CM2 - Platform Costs</div>
                <div className="text-slate-400 text-xs mt-1">
                  Shows contribution before operating overhead. Useful for scaling decisions.
                </div>
              </div>
            </div>
          </Section>

          {/* EBITDA */}
          <Section title="6. EBITDA Calculation" color="emerald">
            <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <div className="font-mono text-emerald-400">EBITDA = CM3 - Operating Expenses</div>
              <div className="text-slate-400 text-xs mt-1">
                Earnings Before Interest, Taxes, Depreciation & Amortization
              </div>
            </div>
            <p className="text-slate-400 mt-3">
              EBITDA represents the operational profitability of the business, excluding financing and accounting decisions.
              A positive EBITDA indicates the core business operations are profitable.
            </p>
          </Section>

          {/* P&L Formula Summary */}
          <Section title="7. Complete P&L Flow" color="slate">
            <div className="font-mono text-xs bg-slate-900 p-4 rounded-lg space-y-1 text-slate-300">
              <div><span className="text-blue-400">Gross Sales</span> (by channel from Sales Register)</div>
              <div className="text-slate-500">  - Returns</div>
              <div className="text-slate-500">  - Stock Transfers (inter-company)</div>
              <div className="text-slate-500">  - GST on Sales</div>
              <div>= <span className="text-emerald-400">Net Revenue</span></div>
              <div className="text-slate-500">  - COGS (from Balance Sheet)</div>
              <div>= <span className="text-emerald-400">Gross Margin</span></div>
              <div className="text-slate-500">  - Channel & Fulfillment (from Journal)</div>
              <div>= <span className="text-blue-400">CM1</span></div>
              <div className="text-slate-500">  - Sales & Marketing (from Journal)</div>
              <div>= <span className="text-blue-400">CM2</span></div>
              <div className="text-slate-500">  - Platform Costs (from Journal)</div>
              <div>= <span className="text-violet-400">CM3</span></div>
              <div className="text-slate-500">  - Operating Expenses (from Journal)</div>
              <div>= <span className="text-emerald-400 font-bold">EBITDA</span></div>
            </div>
          </Section>

          {/* Multi-State Aggregation */}
          <Section title="8. Multi-State Aggregation" color="purple">
            <p className="text-slate-400">
              When multiple states are selected (UP, Maharashtra, Karnataka, etc.), the system:
            </p>
            <ul className="mt-2 space-y-1 text-slate-300 ml-4">
              <li>• Aggregates revenue from all states</li>
              <li>• Sums COGS across all states (each state has its own opening/closing stock)</li>
              <li>• Combines journal expenses from all states</li>
              <li>• Removes inter-company stock transfers (e.g., UP→KA) from revenue</li>
            </ul>
          </Section>

          {/* Smart Classification System */}
          <Section title="9. Smart Classification System" color="purple">
            <p className="text-slate-400 mb-3">
              The system uses a multi-layered classification approach for journal transactions:
            </p>
            <div className="space-y-3">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="font-semibold text-blue-400 mb-1">1. Rule-Based Matching</div>
                <div className="text-slate-400 text-xs">
                  Exact match against saved classification rules. These rules are learned from previous classifications you've made.
                </div>
              </div>
              <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <div className="font-semibold text-cyan-400 mb-1">2. Similarity Matching</div>
                <div className="text-slate-400 text-xs">
                  If no exact match, looks for similar entity names and keywords from existing rules.
                </div>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <div className="font-semibold text-purple-400 mb-1">3. AI Classification (Gemini)</div>
                <div className="text-slate-400 text-xs">
                  For new entities, AI analyzes the ledger/party name and suggests the appropriate MIS head and subhead.
                </div>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <div className="font-semibold text-amber-400 mb-1">4. Manual Review</div>
                <div className="text-slate-400 text-xs">
                  Low-confidence classifications are flagged for your review. Your choices are saved as rules for future use.
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-700/30 rounded-lg">
              <div className="text-slate-300 font-medium mb-2">Classification Storage</div>
              <ul className="space-y-1 text-slate-400 text-xs">
                <li>• <strong>MIS_Categories</strong>: All available heads/subheads (A. Revenue, B. Returns, etc.)</li>
                <li>• <strong>MIS_Classification_Rules</strong>: Saved rules linking entities to categories</li>
                <li>• <strong>MIS_Classification_History</strong>: Audit trail of all classifications</li>
              </ul>
            </div>

            <div className="mt-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <div className="text-emerald-400 font-medium">Learning System</div>
              <div className="text-slate-400 text-xs mt-1">
                Every time you classify a transaction, the system saves it as a rule. Next time the same or similar
                entity appears, it will be automatically classified - making the system smarter over time!
              </div>
            </div>
          </Section>

          {/* MIS Heads Reference */}
          <Section title="10. MIS Heads Reference" color="slate">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
                <span className="text-emerald-400">A. Revenue</span>
                <span className="text-slate-500 ml-2">Website, Amazon, Blinkit, Offline</span>
              </div>
              <div className="p-2 bg-red-500/10 rounded border border-red-500/20">
                <span className="text-red-400">B. Returns</span>
                <span className="text-slate-500 ml-2">By channel</span>
              </div>
              <div className="p-2 bg-red-500/10 rounded border border-red-500/20">
                <span className="text-red-400">C. Discounts</span>
                <span className="text-slate-500 ml-2">By channel</span>
              </div>
              <div className="p-2 bg-red-500/10 rounded border border-red-500/20">
                <span className="text-red-400">D. Taxes</span>
                <span className="text-slate-500 ml-2">GST on sales</span>
              </div>
              <div className="p-2 bg-orange-500/10 rounded border border-orange-500/20">
                <span className="text-orange-400">E. COGM</span>
                <span className="text-slate-500 ml-2">Raw materials, wages, factory costs</span>
              </div>
              <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20">
                <span className="text-blue-400">F. Channel</span>
                <span className="text-slate-500 ml-2">Marketplace fees, fulfillment</span>
              </div>
              <div className="p-2 bg-pink-500/10 rounded border border-pink-500/20">
                <span className="text-pink-400">G. Marketing</span>
                <span className="text-slate-500 ml-2">Ads, agency fees</span>
              </div>
              <div className="p-2 bg-cyan-500/10 rounded border border-cyan-500/20">
                <span className="text-cyan-400">H. Platform</span>
                <span className="text-slate-500 ml-2">Software subscriptions</span>
              </div>
              <div className="p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                <span className="text-yellow-400">I. OpEx</span>
                <span className="text-slate-500 ml-2">Salaries, rent, admin</span>
              </div>
              <div className="p-2 bg-violet-500/10 rounded border border-violet-500/20">
                <span className="text-violet-400">J. Non-Op</span>
                <span className="text-slate-500 ml-2">Interest, depreciation, tax</span>
              </div>
              <div className="p-2 bg-slate-600 rounded">
                <span className="text-slate-400">X. Exclude</span>
                <span className="text-slate-500 ml-2">Personal expenses</span>
              </div>
              <div className="p-2 bg-slate-600 rounded">
                <span className="text-slate-400">Z. Ignore</span>
                <span className="text-slate-500 ml-2">GST adjustments, TDS, transfers</span>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const borderColors: Record<string, string> = {
    blue: 'border-l-blue-500',
    emerald: 'border-l-emerald-500',
    orange: 'border-l-orange-500',
    violet: 'border-l-violet-500',
    indigo: 'border-l-indigo-500',
    purple: 'border-l-purple-500',
    slate: 'border-l-slate-500'
  };

  return (
    <div className={`border-l-2 ${borderColors[color] || borderColors.slate} pl-4`}>
      <h3 className="text-base font-semibold text-slate-200 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ExpenseCategory({ title, color, items }: { title: string; color: string; items: string[] }) {
  const bgColors: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/20',
    pink: 'bg-pink-500/10 border-pink-500/20',
    cyan: 'bg-cyan-500/10 border-cyan-500/20',
    yellow: 'bg-yellow-500/10 border-yellow-500/20'
  };

  return (
    <div className={`p-3 rounded-lg border ${bgColors[color] || bgColors.blue}`}>
      <div className="font-medium text-slate-200 mb-2">{title}</div>
      <ul className="text-xs text-slate-400 space-y-0.5">
        {items.map((item, idx) => (
          <li key={idx}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

// ============================================
// BALANCE SHEET RECONCILIATION SECTION
// ============================================

interface ReconciliationSectionProps {
  balanceSheet: AggregatedBalanceSheetData;
  misNetRevenue: number;
  misCOGM: number;
  misNetIncome: number;
}

function ReconciliationSection({ balanceSheet, misNetRevenue, misCOGM, misNetIncome }: ReconciliationSectionProps) {
  // Calculate variances
  // When BS value is 0 but MIS has value, variance should be flagged for review
  const revenueVariance = misNetRevenue - balanceSheet.netSales;
  const revenueVariancePercent = balanceSheet.netSales !== 0
    ? ((misNetRevenue - balanceSheet.netSales) / balanceSheet.netSales) * 100
    : (misNetRevenue !== 0 ? 100 : 0); // 100% variance if BS=0 but MIS has value

  const cogsVariance = misCOGM - balanceSheet.calculatedCOGS;
  const cogsVariancePercent = balanceSheet.calculatedCOGS !== 0
    ? ((misCOGM - balanceSheet.calculatedCOGS) / balanceSheet.calculatedCOGS) * 100
    : (misCOGM !== 0 ? 100 : 0); // 100% variance if BS=0 but MIS has value

  return (
    <div className="mt-6 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-500/20 border-b border-indigo-500/30 px-5 py-3">
        <h3 className="text-sm font-semibold text-indigo-400">Balance Sheet Reconciliation</h3>
        <p className="text-xs text-indigo-400/70 mt-0.5">Compare key figures: Net Sales, COGS, and Net Profit/Loss</p>
      </div>

      <div className="p-5">
        {/* Balance Sheet Summary */}
        <div className="mb-5">
          <h4 className="text-xs font-medium text-slate-400 mb-3">Balance Sheet Data (Aggregated)</h4>
          <div className="grid grid-cols-5 gap-3">
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="text-xs text-slate-500">Opening Stock</div>
              <div className="text-sm font-medium text-slate-200 mt-1">{formatCurrencyFull(balanceSheet.openingStock)}</div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="text-xs text-slate-500">Purchases</div>
              <div className="text-sm font-medium text-slate-200 mt-1">{formatCurrencyFull(balanceSheet.purchases)}</div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="text-xs text-slate-500">Closing Stock</div>
              <div className="text-sm font-medium text-slate-200 mt-1">{formatCurrencyFull(balanceSheet.closingStock)}</div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="text-xs text-slate-500">Gross Sales</div>
              <div className="text-sm font-medium text-slate-200 mt-1">{formatCurrencyFull(balanceSheet.grossSales)}</div>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3">
              <div className="text-xs text-slate-500">Net Sales</div>
              <div className="text-sm font-medium text-slate-200 mt-1">{formatCurrencyFull(balanceSheet.netSales)}</div>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Metric</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-slate-500">MIS Calculated</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-slate-500">Balance Sheet</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-slate-500">Variance</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-slate-500">Variance %</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Net Revenue vs Net Sales */}
              <tr className="border-b border-slate-700/50">
                <td className="py-3 px-3 text-sm text-slate-300">Net Revenue / Net Sales</td>
                <td className="py-3 px-3 text-right text-sm text-slate-200">{formatCurrencyFull(misNetRevenue)}</td>
                <td className="py-3 px-3 text-right text-sm text-slate-200">{formatCurrencyFull(balanceSheet.netSales)}</td>
                <td className={`py-3 px-3 text-right text-sm ${Math.abs(revenueVariance) < 1000 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {formatCurrencyFull(revenueVariance)}
                </td>
                <td className={`py-3 px-3 text-right text-sm ${Math.abs(revenueVariancePercent) < 5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {revenueVariancePercent.toFixed(2)}%
                </td>
                <td className="py-3 px-3 text-center">
                  {Math.abs(revenueVariancePercent) < 5 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Match
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Review
                    </span>
                  )}
                </td>
              </tr>

              {/* COGM vs Calculated COGS */}
              <tr className="border-b border-slate-700/50">
                <td className="py-3 px-3 text-sm text-slate-300">
                  <div>COGM / COGS</div>
                  <div className="text-xs text-slate-500">BS Formula: Opening + Purchases - Closing</div>
                </td>
                <td className="py-3 px-3 text-right text-sm text-slate-200">{formatCurrencyFull(misCOGM)}</td>
                <td className="py-3 px-3 text-right text-sm text-slate-200">{formatCurrencyFull(balanceSheet.calculatedCOGS)}</td>
                <td className={`py-3 px-3 text-right text-sm ${Math.abs(cogsVariance) < 1000 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {formatCurrencyFull(cogsVariance)}
                </td>
                <td className={`py-3 px-3 text-right text-sm ${Math.abs(cogsVariancePercent) < 5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {cogsVariancePercent.toFixed(2)}%
                </td>
                <td className="py-3 px-3 text-center">
                  {Math.abs(cogsVariancePercent) < 5 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Match
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Review
                    </span>
                  )}
                </td>
              </tr>

              {/* Net Profit/Loss vs BS */}
              <tr>
                <td className="py-3 px-3 text-sm text-slate-300">
                  <div>Net Profit/Loss</div>
                  <div className="text-xs text-slate-500">BS: {balanceSheet.netProfitLoss >= 0 ? 'Profit' : 'Loss'}</div>
                </td>
                <td className="py-3 px-3 text-right text-sm">
                  <span className={misNetIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatCurrencyFull(misNetIncome)}
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-sm">
                  <span className={balanceSheet.netProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatCurrencyFull(balanceSheet.netProfitLoss)}
                  </span>
                </td>
                <td className={`py-3 px-3 text-right text-sm ${
                  Math.abs(misNetIncome - balanceSheet.netProfitLoss) < 1000 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {formatCurrencyFull(misNetIncome - balanceSheet.netProfitLoss)}
                </td>
                <td className={`py-3 px-3 text-right text-sm ${
                  balanceSheet.netProfitLoss !== 0 && Math.abs(((misNetIncome - balanceSheet.netProfitLoss) / Math.abs(balanceSheet.netProfitLoss)) * 100) < 5
                    ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {balanceSheet.netProfitLoss !== 0
                    ? `${(((misNetIncome - balanceSheet.netProfitLoss) / Math.abs(balanceSheet.netProfitLoss)) * 100).toFixed(2)}%`
                    : '-'}
                </td>
                <td className="py-3 px-3 text-center">
                  {balanceSheet.netProfitLoss !== 0 &&
                  Math.abs(((misNetIncome - balanceSheet.netProfitLoss) / Math.abs(balanceSheet.netProfitLoss)) * 100) < 5 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Match
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Review
                    </span>
                  )}
                </td>
              </tr>

            </tbody>
          </table>
        </div>

        {/* Note */}
        <div className="mt-4 p-3 bg-slate-700/30 rounded-lg space-y-2">
          <p className="text-xs text-slate-400">
            <strong className="text-slate-300">Key Metrics:</strong> Only Net Sales, COGS, and Net Profit/Loss are compared
            because MIS and Balance Sheet classify direct vs indirect expenses differently.
          </p>
          <p className="text-xs text-slate-400">
            <strong className="text-slate-300">COGS Formula:</strong> Opening Stock ({formatCurrencyFull(balanceSheet.openingStock)})
            + Purchases ({formatCurrencyFull(balanceSheet.purchases)})
            - Closing Stock ({formatCurrencyFull(balanceSheet.closingStock)})
            = {formatCurrencyFull(balanceSheet.calculatedCOGS)}
          </p>
          <p className="text-xs text-slate-400">
            Variances under 5% are acceptable. Larger variances may indicate missing transactions or timing differences.
          </p>
        </div>
      </div>
    </div>
  );
}
