import React, { useState, useEffect } from 'react';
import { MISRecord, MISPeriod, periodToString } from '../../types/misTracking';
import { loadMISData } from '../../utils/googleSheetsStorage';
import { formatCurrency, formatPercent } from '../../utils/misCalculator';

interface MISTrendsViewProps {
  savedPeriods: { periodKey: string; period: MISPeriod }[];
}

export function MISTrendsView({ savedPeriods }: MISTrendsViewProps) {
  const [allMISData, setAllMISData] = useState<MISRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<'revenue' | 'margins' | 'channels'>('revenue');

  useEffect(() => {
    loadAllData();
  }, [savedPeriods]);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const data = await loadMISData();
      // Sort by date (oldest first for chart)
      const sorted = data.periods.sort((a, b) => {
        if (a.period.year !== b.period.year) {
          return a.period.year - b.period.year;
        }
        return a.period.month - b.period.month;
      });
      setAllMISData(sorted);
    } catch (error) {
      console.error('Error loading MIS data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-400 border-t-transparent rounded-full mx-auto"></div>
        <p className="text-slate-400 mt-4">Loading trend data...</p>
      </div>
    );
  }

  if (allMISData.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-600 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-300 mb-2">No Trend Data Available</h3>
        <p className="text-slate-500">
          Upload data for multiple months to see trends
        </p>
      </div>
    );
  }

  // Calculate max values for scaling
  const maxRevenue = Math.max(...allMISData.map(d => d.revenue.netRevenue));
  const maxBarHeight = 200; // pixels

  return (
    <div className="space-y-6">
      {/* Header with Metric Selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-slate-400">View:</span>
        <div className="flex gap-2">
          {[
            { id: 'revenue' as const, label: 'Revenue Trend' },
            { id: 'margins' as const, label: 'Margin Trends' },
            { id: 'channels' as const, label: 'Channel Mix' }
          ].map(option => (
            <button
              key={option.id}
              onClick={() => setSelectedMetric(option.id)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${selectedMetric === option.id
                  ? 'bg-slate-700 text-blue-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-300'
                }
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">

      {/* Revenue Trend Chart */}
      {selectedMetric === 'revenue' && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
          <h3 className="text-base font-semibold text-slate-200 mb-6">Net Revenue Trend</h3>

          <div className="flex items-end gap-2 h-64">
            {allMISData.map((mis, index) => {
              const height = maxRevenue > 0
                ? (mis.revenue.netRevenue / maxRevenue) * maxBarHeight
                : 0;

              return (
                <div key={mis.periodKey} className="flex-1 flex flex-col items-center">
                  {/* Bar */}
                  <div className="w-full flex flex-col items-center">
                    <div className="text-xs text-slate-400 mb-1">
                      {formatCurrency(mis.revenue.netRevenue)}
                    </div>
                    <div
                      className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-400"
                      style={{ height: `${height}px` }}
                      title={`${periodToString(mis.period)}: ${formatCurrency(mis.revenue.netRevenue)}`}
                    />
                  </div>
                  {/* Label */}
                  <div className="text-xs text-slate-400 mt-2 text-center">
                    {periodToString(mis.period).split(' ')[0]}
                    <br />
                    <span className="text-slate-500">{mis.period.year}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Margin Trends */}
      {selectedMetric === 'margins' && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
          <h3 className="text-base font-semibold text-slate-200 mb-6">Margin Trends</h3>

          <div className="space-y-8">
            {/* Legend */}
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-emerald-500 rounded"></div>
                <span className="text-slate-400">Gross Margin</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-slate-400">CM1</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                <span className="text-slate-400">CM2</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span className="text-slate-400">EBITDA</span>
              </div>
            </div>

            {/* Chart */}
            <div className="relative h-64">
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 bottom-8 w-12 flex flex-col justify-between text-xs text-slate-500">
                <span>60%</span>
                <span>40%</span>
                <span>20%</span>
                <span>0%</span>
                <span>-20%</span>
              </div>

              {/* Chart area */}
              <div className="ml-14 h-full flex items-end gap-4">
                {allMISData.map((mis) => (
                  <div key={mis.periodKey} className="flex-1 h-full flex flex-col justify-end">
                    <div className="relative h-[calc(100%-2rem)] flex items-end gap-1">
                      {/* Bars */}
                      <MarginBar value={mis.grossMarginPercent} color="bg-emerald-500" maxPercent={60} />
                      <MarginBar value={mis.cm1Percent} color="bg-blue-500" maxPercent={60} />
                      <MarginBar value={mis.cm2Percent} color="bg-purple-500" maxPercent={60} />
                      <MarginBar value={mis.ebitdaPercent} color="bg-orange-500" maxPercent={60} />
                    </div>
                    <div className="text-xs text-slate-400 mt-2 text-center">
                      {periodToString(mis.period).split(' ')[0]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Channel Mix */}
      {selectedMetric === 'channels' && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-6">
          <h3 className="text-base font-semibold text-slate-200 mb-6">Channel Mix Evolution</h3>

          <div className="space-y-4">
            {/* Legend */}
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span className="text-slate-400">Amazon</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-slate-400">Blinkit</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-slate-400">Website</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-slate-500 rounded"></div>
                <span className="text-slate-400">Offline & OEM</span>
              </div>
            </div>

            {/* Stacked bars */}
            <div className="space-y-2">
              {allMISData.map((mis) => {
                const total = mis.revenue.totalGrossRevenue || 1;
                const amazonPct = (mis.revenue.grossRevenue.Amazon / total) * 100;
                const blinkitPct = (mis.revenue.grossRevenue.Blinkit / total) * 100;
                const websitePct = (mis.revenue.grossRevenue.Website / total) * 100;
                const offlinePct = (mis.revenue.grossRevenue['Offline & OEM'] / total) * 100;

                return (
                  <div key={mis.periodKey} className="flex items-center gap-4">
                    <div className="w-20 text-sm text-slate-400">
                      {periodToString(mis.period).split(' ')[0]} '{String(mis.period.year).slice(-2)}
                    </div>
                    <div className="flex-1 h-8 flex rounded-lg overflow-hidden">
                      <div
                        className="bg-orange-500 flex items-center justify-center text-xs text-white"
                        style={{ width: `${amazonPct}%` }}
                        title={`Amazon: ${amazonPct.toFixed(1)}%`}
                      >
                        {amazonPct > 10 && `${amazonPct.toFixed(0)}%`}
                      </div>
                      <div
                        className="bg-yellow-500 flex items-center justify-center text-xs text-white"
                        style={{ width: `${blinkitPct}%` }}
                        title={`Blinkit: ${blinkitPct.toFixed(1)}%`}
                      >
                        {blinkitPct > 10 && `${blinkitPct.toFixed(0)}%`}
                      </div>
                      <div
                        className="bg-blue-500 flex items-center justify-center text-xs text-white"
                        style={{ width: `${websitePct}%` }}
                        title={`Website: ${websitePct.toFixed(1)}%`}
                      >
                        {websitePct > 10 && `${websitePct.toFixed(0)}%`}
                      </div>
                      <div
                        className="bg-slate-500 flex items-center justify-center text-xs text-white"
                        style={{ width: `${offlinePct}%` }}
                        title={`Offline: ${offlinePct.toFixed(1)}%`}
                      >
                        {offlinePct > 10 && `${offlinePct.toFixed(0)}%`}
                      </div>
                    </div>
                    <div className="w-24 text-right text-sm text-slate-400">
                      {formatCurrency(mis.revenue.totalGrossRevenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h3 className="text-base font-semibold text-slate-200">Monthly Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-700/50">
                <th className="text-left py-3 px-4 font-medium text-slate-300 text-sm">Metric</th>
                {allMISData.map(mis => (
                  <th key={mis.periodKey} className="text-right py-3 px-4 font-medium text-slate-300 text-sm">
                    {periodToString(mis.period)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-700/50">
                <td className="py-3 px-4 text-slate-300 text-sm">Net Revenue</td>
                {allMISData.map(mis => (
                  <td key={mis.periodKey} className="py-3 px-4 text-right text-slate-300 text-sm">
                    {formatCurrency(mis.revenue.netRevenue)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-3 px-4 text-slate-300 text-sm">COGS %</td>
                {allMISData.map(mis => {
                  const cogsPercent = mis.revenue.netRevenue > 0
                    ? (mis.cogm.totalCOGM / mis.revenue.netRevenue) * 100
                    : 0;
                  return (
                    <td key={mis.periodKey} className="py-3 px-4 text-right text-slate-300 text-sm">
                      {formatPercent(cogsPercent)}
                    </td>
                  );
                })}
              </tr>
              <tr className="border-b border-slate-700/50 bg-emerald-500/10">
                <td className="py-3 px-4 text-emerald-400 font-medium text-sm">Gross Margin %</td>
                {allMISData.map(mis => (
                  <td key={mis.periodKey} className="py-3 px-4 text-right text-emerald-400 font-medium text-sm">
                    {formatPercent(mis.grossMarginPercent)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-3 px-4 text-slate-300 text-sm">CM1 %</td>
                {allMISData.map(mis => (
                  <td key={mis.periodKey} className="py-3 px-4 text-right text-slate-300 text-sm">
                    {formatPercent(mis.cm1Percent)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-3 px-4 text-slate-300 text-sm">CM2 %</td>
                {allMISData.map(mis => (
                  <td key={mis.periodKey} className="py-3 px-4 text-right text-slate-300 text-sm">
                    {formatPercent(mis.cm2Percent)}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-700/50 bg-blue-500/10">
                <td className="py-3 px-4 text-blue-400 font-medium text-sm">EBITDA %</td>
                {allMISData.map(mis => (
                  <td key={mis.periodKey} className={`py-3 px-4 text-right font-medium text-sm ${mis.ebitdaPercent >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {formatPercent(mis.ebitdaPercent)}
                  </td>
                ))}
              </tr>
              <tr className="bg-slate-700/30">
                <td className="py-3 px-4 text-slate-200 font-semibold text-sm">Net Income %</td>
                {allMISData.map(mis => (
                  <td key={mis.periodKey} className={`py-3 px-4 text-right font-semibold text-sm ${mis.netIncomePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatPercent(mis.netIncomePercent)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}

// Helper component for margin bars
function MarginBar({ value, color, maxPercent }: { value: number; color: string; maxPercent: number }) {
  // Handle negative values by showing them below the zero line
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const height = (absValue / maxPercent) * 100;

  if (isNegative) {
    return (
      <div className="flex-1 flex flex-col items-center" style={{ marginTop: `${height}%` }}>
        <div
          className={`w-full ${color} rounded-b-sm opacity-50`}
          style={{ height: `${height}%` }}
          title={`${value.toFixed(1)}%`}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex-1 ${color} rounded-t-sm`}
      style={{ height: `${height}%` }}
      title={`${value.toFixed(1)}%`}
    />
  );
}
