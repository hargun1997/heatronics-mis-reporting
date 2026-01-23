import React, { useState, useMemo } from 'react';
import { MISRecord } from '../../types/misTracking';
import { formatCurrency, formatPercent } from '../../utils/misCalculator';

interface MISFYViewProps {
  allMISRecords: MISRecord[];
}

// Financial Year runs from April to March
const FY_MONTHS = [
  { month: 4, label: 'April' },
  { month: 5, label: 'May' },
  { month: 6, label: 'June' },
  { month: 7, label: 'July' },
  { month: 8, label: 'August' },
  { month: 9, label: 'September' },
  { month: 10, label: 'October' },
  { month: 11, label: 'November' },
  { month: 12, label: 'December' },
  { month: 1, label: 'January' },
  { month: 2, label: 'February' },
  { month: 3, label: 'March' }
];

// Get available FYs from MIS records
function getAvailableFYs(records: MISRecord[]): string[] {
  const fys = new Set<string>();

  for (const record of records) {
    const { month, year } = record.period;
    // FY is determined by: April-March
    // April 2024 - March 2025 = FY 2024-25
    const fyStartYear = month >= 4 ? year : year - 1;
    const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;
    fys.add(fyLabel);
  }

  return Array.from(fys).sort().reverse(); // Most recent first
}

// Parse FY label to get start year
function parseFYLabel(fyLabel: string): number {
  // "FY 2024-25" -> 2024
  const match = fyLabel.match(/FY (\d{4})-/);
  return match ? parseInt(match[1]) : new Date().getFullYear();
}

// Get year for a month in a given FY
function getYearForMonth(fyStartYear: number, month: number): number {
  // April-December are in fyStartYear, January-March are in fyStartYear + 1
  return month >= 4 ? fyStartYear : fyStartYear + 1;
}

export function MISFYView({ allMISRecords }: MISFYViewProps) {
  // Get available FYs
  const availableFYs = useMemo(() => getAvailableFYs(allMISRecords), [allMISRecords]);

  // Default to most recent FY or current FY
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const defaultFYStartYear = currentMonth >= 4 ? currentYear : currentYear - 1;
  const defaultFY = `FY ${defaultFYStartYear}-${String(defaultFYStartYear + 1).slice(-2)}`;

  const [selectedFY, setSelectedFY] = useState<string>(
    availableFYs.includes(defaultFY) ? defaultFY : availableFYs[0] || defaultFY
  );

  // Get FY start year from selection
  const fyStartYear = parseFYLabel(selectedFY);

  // Build data for the selected FY
  const fyData = useMemo(() => {
    return FY_MONTHS.map(({ month, label }) => {
      const year = getYearForMonth(fyStartYear, month);
      const periodKey = `${year}-${String(month).padStart(2, '0')}`;

      // Find MIS record for this month
      const record = allMISRecords.find(r => r.periodKey === periodKey);

      return {
        month,
        year,
        label,
        periodKey,
        record,
        hasData: !!record
      };
    });
  }, [allMISRecords, fyStartYear]);

  // Calculate totals
  const totals = useMemo(() => {
    const recordsWithData = fyData.filter(d => d.record).map(d => d.record!);

    if (recordsWithData.length === 0) {
      return null;
    }

    return {
      netRevenue: recordsWithData.reduce((sum, r) => sum + r.revenue.netRevenue, 0),
      grossMargin: recordsWithData.reduce((sum, r) => sum + r.grossMargin, 0),
      cm1: recordsWithData.reduce((sum, r) => sum + r.cm1, 0),
      cm2: recordsWithData.reduce((sum, r) => sum + r.cm2, 0),
      cm3: recordsWithData.reduce((sum, r) => sum + r.cm3, 0),
      ebitda: recordsWithData.reduce((sum, r) => sum + r.ebitda, 0),
      netIncome: recordsWithData.reduce((sum, r) => sum + r.netIncome, 0)
    };
  }, [fyData]);

  // Calculate percentages for totals
  const totalPercentages = useMemo(() => {
    if (!totals || totals.netRevenue === 0) return null;

    return {
      grossMarginPercent: (totals.grossMargin / totals.netRevenue) * 100,
      cm1Percent: (totals.cm1 / totals.netRevenue) * 100,
      cm2Percent: (totals.cm2 / totals.netRevenue) * 100,
      cm3Percent: (totals.cm3 / totals.netRevenue) * 100,
      ebitdaPercent: (totals.ebitda / totals.netRevenue) * 100,
      netIncomePercent: (totals.netIncome / totals.netRevenue) * 100
    };
  }, [totals]);

  // Format cell value with color
  const formatMetricCell = (value: number | undefined, isPercent: boolean = false) => {
    if (value === undefined) return '-';

    const formatted = isPercent ? formatPercent(value) : formatCurrency(value);
    const colorClass = value >= 0 ? 'text-slate-200' : 'text-red-400';

    return <span className={colorClass}>{formatted}</span>;
  };

  const formatPercentCell = (value: number | undefined) => {
    if (value === undefined) return '-';

    const colorClass = value >= 0 ? 'text-emerald-400' : 'text-red-400';
    return <span className={colorClass}>{formatPercent(value)}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header with FY Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-400">Financial Year:</label>
        <select
          value={selectedFY}
          onChange={(e) => setSelectedFY(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
        >
          {availableFYs.length > 0 ? (
            availableFYs.map(fy => (
              <option key={fy} value={fy}>{fy}</option>
            ))
          ) : (
            <option value={defaultFY}>{defaultFY}</option>
          )}
        </select>
      </div>

      {/* FY Summary Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-slate-100">
            {selectedFY} - P&L Summary
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            April {fyStartYear} to March {fyStartYear + 1}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Month
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Net Revenue
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Gross Margin
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  CM1
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  CM2
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  CM3
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  EBITDA
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Net Profit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {fyData.map(({ month, year, label, record, hasData }) => (
                <tr
                  key={`${year}-${month}`}
                  className={`
                    transition-colors
                    ${hasData ? 'hover:bg-slate-700/30' : 'opacity-50'}
                  `}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{label}</span>
                      <span className="text-xs text-slate-500">{year}</span>
                      {!hasData && (
                        <span className="text-xs text-slate-600 italic">No data</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    {hasData ? formatMetricCell(record?.revenue.netRevenue) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      {hasData ? formatMetricCell(record?.grossMargin) : '-'}
                      {hasData && record && (
                        <span className="text-xs">{formatPercentCell(record.grossMarginPercent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      {hasData ? formatMetricCell(record?.cm1) : '-'}
                      {hasData && record && (
                        <span className="text-xs">{formatPercentCell(record.cm1Percent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      {hasData ? formatMetricCell(record?.cm2) : '-'}
                      {hasData && record && (
                        <span className="text-xs">{formatPercentCell(record.cm2Percent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      {hasData ? formatMetricCell(record?.cm3) : '-'}
                      {hasData && record && (
                        <span className="text-xs">{formatPercentCell(record.cm3Percent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      {hasData ? formatMetricCell(record?.ebitda) : '-'}
                      {hasData && record && (
                        <span className="text-xs">{formatPercentCell(record.ebitdaPercent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      {hasData ? formatMetricCell(record?.netIncome) : '-'}
                      {hasData && record && (
                        <span className="text-xs">{formatPercentCell(record.netIncomePercent)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {/* Totals Row */}
              {totals && (
                <tr className="bg-slate-700/70 font-semibold">
                  <td className="py-4 px-4">
                    <span className="text-sm font-bold text-slate-100">FY Total</span>
                  </td>
                  <td className="py-4 px-4 text-right text-sm">
                    <span className="text-blue-400">{formatCurrency(totals.netRevenue)}</span>
                  </td>
                  <td className="py-4 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      <span className={totals.grossMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(totals.grossMargin)}
                      </span>
                      {totalPercentages && (
                        <span className="text-xs">{formatPercentCell(totalPercentages.grossMarginPercent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      <span className={totals.cm1 >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(totals.cm1)}
                      </span>
                      {totalPercentages && (
                        <span className="text-xs">{formatPercentCell(totalPercentages.cm1Percent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      <span className={totals.cm2 >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(totals.cm2)}
                      </span>
                      {totalPercentages && (
                        <span className="text-xs">{formatPercentCell(totalPercentages.cm2Percent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      <span className={totals.cm3 >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(totals.cm3)}
                      </span>
                      {totalPercentages && (
                        <span className="text-xs">{formatPercentCell(totalPercentages.cm3Percent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      <span className={totals.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(totals.ebitda)}
                      </span>
                      {totalPercentages && (
                        <span className="text-xs">{formatPercentCell(totalPercentages.ebitdaPercent)}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-right text-sm">
                    <div className="flex flex-col items-end">
                      <span className={totals.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {formatCurrency(totals.netIncome)}
                      </span>
                      {totalPercentages && (
                        <span className="text-xs">{formatPercentCell(totalPercentages.netIncomePercent)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* No Data Message */}
        {!totals && (
          <div className="p-8 text-center">
            <div className="text-slate-400 mb-2">No MIS data available for {selectedFY}</div>
            <div className="text-sm text-slate-500">
              Generate MIS reports from the Timeline view to see data here.
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="text-xs text-slate-500 flex items-center gap-4">
        <span>GM = Gross Margin</span>
        <span>CM1 = Contribution Margin 1 (after Channel costs)</span>
        <span>CM2 = CM1 - Marketing</span>
        <span>CM3 = CM2 - Platform costs</span>
      </div>
    </div>
  );
}

export default MISFYView;
