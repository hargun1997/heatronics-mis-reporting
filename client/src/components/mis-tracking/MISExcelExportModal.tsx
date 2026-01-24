import React, { useState } from 'react';
import { MISRecord, periodToString } from '../../types/misTracking';
import {
  exportMISToExcel,
  exportMonthlyMISToExcel,
  exportFYMISToExcel,
  getAvailableFYs,
  ExcelExportOptions
} from '../../utils/misExcelExport';

interface MISExcelExportModalProps {
  allMISRecords: MISRecord[];
  onClose: () => void;
  // Optional: Pre-select a specific month or FY
  preSelectedMonth?: string;
  preSelectedFY?: string;
}

export function MISExcelExportModal({
  allMISRecords,
  onClose,
  preSelectedMonth,
  preSelectedFY
}: MISExcelExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  // Export options
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeFYSheets, setIncludeFYSheets] = useState(true);
  const [includeMonthlySheets, setIncludeMonthlySheets] = useState(false);
  const [includeRevenueAnalysis, setIncludeRevenueAnalysis] = useState(true);
  const [includeExpenseAnalysis, setIncludeExpenseAnalysis] = useState(true);
  const [includeTransactions, setIncludeTransactions] = useState(false);

  // FY selection
  const availableFYs = getAvailableFYs(allMISRecords);
  const [selectedFYs, setSelectedFYs] = useState<string[]>(
    preSelectedFY ? [preSelectedFY] : (availableFYs.length > 0 ? [availableFYs[0]] : [])
  );

  // Individual months selection
  const allMonths = allMISRecords
    .sort((a, b) => {
      if (a.period.year !== b.period.year) return b.period.year - a.period.year;
      return b.period.month - a.period.month;
    })
    .map(r => ({ periodKey: r.periodKey, label: periodToString(r.period), record: r }));

  const [selectedMonths, setSelectedMonths] = useState<string[]>(
    preSelectedMonth ? [preSelectedMonth] : []
  );

  // FY toggle functions
  const toggleFY = (fy: string) => {
    setSelectedFYs(prev =>
      prev.includes(fy)
        ? prev.filter(f => f !== fy)
        : [...prev, fy]
    );
  };

  const selectAllFYs = () => setSelectedFYs([...availableFYs]);
  const clearAllFYs = () => setSelectedFYs([]);

  // Month toggle functions
  const toggleMonth = (periodKey: string) => {
    setSelectedMonths(prev =>
      prev.includes(periodKey)
        ? prev.filter(k => k !== periodKey)
        : [...prev, periodKey]
    );
  };

  const selectAllMonths = () => setSelectedMonths(allMonths.map(m => m.periodKey));
  const clearAllMonths = () => setSelectedMonths([]);

  // Quick export functions
  const handleQuickExportMonth = async (periodKey: string) => {
    const record = allMISRecords.find(r => r.periodKey === periodKey);
    if (!record) return;

    setIsExporting(true);
    setExportProgress(`Exporting ${periodToString(record.period)}...`);

    try {
      await exportMonthlyMISToExcel(record);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export Excel file');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  const handleQuickExportFY = async (fyLabel: string) => {
    setIsExporting(true);
    setExportProgress(`Exporting ${fyLabel}...`);

    try {
      await exportFYMISToExcel(allMISRecords, fyLabel);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export Excel file');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // Main export function
  const handleExport = async () => {
    const hasSelection = includeSummary ||
      (includeFYSheets && selectedFYs.length > 0) ||
      (includeMonthlySheets && selectedMonths.length > 0) ||
      (includeRevenueAnalysis && (selectedFYs.length > 0 || allMISRecords.length > 0)) ||
      (includeExpenseAnalysis && (selectedFYs.length > 0 || allMISRecords.length > 0)) ||
      (includeTransactions && selectedMonths.length > 0);

    if (!hasSelection) {
      alert('Please select at least one section to export');
      return;
    }

    setIsExporting(true);
    setExportProgress('Preparing Excel workbook...');

    try {
      const options: ExcelExportOptions = {
        includeSummary,
        includeFYSheets,
        includeMonthlySheets,
        includeRevenueAnalysis,
        includeExpenseAnalysis,
        includeTransactions,
        selectedFYs,
        selectedMonths
      };

      await exportMISToExcel(allMISRecords, options);
      setExportProgress('Export complete!');

      // Close modal after a brief delay
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export Excel file. Please try again.');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  // Calculate estimated sheet count
  const estimatedSheets = (() => {
    let count = 0;
    if (includeSummary) count += 1;
    if (includeFYSheets) count += selectedFYs.length;
    if (includeMonthlySheets) count += selectedMonths.length;
    if (includeRevenueAnalysis) count += Math.max(selectedFYs.length, 1);
    if (includeExpenseAnalysis) count += Math.max(selectedFYs.length, 1);
    if (includeTransactions) count += selectedMonths.length;
    return count;
  })();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Export MIS Report to Excel</h2>
            <p className="text-sm text-slate-400 mt-1">Professional multi-sheet Excel workbook with detailed analysis</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Quick Export Section */}
          <div className="bg-slate-700/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">Quick Export</h3>
            <div className="flex flex-wrap gap-3">
              {availableFYs.slice(0, 3).map(fy => (
                <button
                  key={fy}
                  onClick={() => handleQuickExportFY(fy)}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {fy} Complete
                </button>
              ))}
              {allMonths.length > 0 && (
                <button
                  onClick={() => handleQuickExportMonth(allMonths[0].periodKey)}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {allMonths[0].label} Only
                </button>
              )}
            </div>
          </div>

          {/* Section Selection */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Custom Export - Select Sheets</h3>

            {/* Summary Option */}
            <label className="flex items-start gap-3 p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors">
              <input
                type="checkbox"
                checked={includeSummary}
                onChange={(e) => setIncludeSummary(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
              />
              <div className="flex-1">
                <div className="font-medium text-slate-200">Summary Sheet</div>
                <div className="text-sm text-slate-400">Key metrics overview with 12-month comparison</div>
              </div>
              <div className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">1 sheet</div>
            </label>

            {/* FY Summary Option */}
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFYSheets}
                  onChange={(e) => setIncludeFYSheets(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-200">Financial Year P&L Sheets</div>
                  <div className="text-sm text-slate-400">Month-by-month P&L statement for each selected FY</div>
                </div>
                <div className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                  {selectedFYs.length} sheet{selectedFYs.length !== 1 ? 's' : ''}
                </div>
              </label>

              {includeFYSheets && (
                <div className="mt-4 pl-7">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={selectAllFYs} className="text-xs text-emerald-400 hover:text-emerald-300">
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button onClick={clearAllFYs} className="text-xs text-slate-400 hover:text-slate-300">
                      Clear All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableFYs.map(fy => (
                      <label
                        key={fy}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors
                          ${selectedFYs.includes(fy)
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFYs.includes(fy)}
                          onChange={() => toggleFY(fy)}
                          className="w-3 h-3 rounded border-slate-500 text-emerald-500"
                        />
                        {fy}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Monthly P&L Option */}
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMonthlySheets}
                  onChange={(e) => setIncludeMonthlySheets(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-200">Monthly P&L Sheets</div>
                  <div className="text-sm text-slate-400">Detailed P&L with full breakdown for each selected month</div>
                </div>
                <div className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                  {selectedMonths.length} sheet{selectedMonths.length !== 1 ? 's' : ''}
                </div>
              </label>

              {includeMonthlySheets && (
                <div className="mt-4 pl-7">
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={selectAllMonths} className="text-xs text-emerald-400 hover:text-emerald-300">
                      Select All
                    </button>
                    <span className="text-slate-600">|</span>
                    <button onClick={clearAllMonths} className="text-xs text-slate-400 hover:text-slate-300">
                      Clear All
                    </button>
                    <span className="text-xs text-slate-500 ml-2">({selectedMonths.length} selected)</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {allMonths.map(({ periodKey, label }) => (
                      <label
                        key={periodKey}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors
                          ${selectedMonths.includes(periodKey)
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMonths.includes(periodKey)}
                          onChange={() => toggleMonth(periodKey)}
                          className="w-3 h-3 rounded border-slate-500 text-emerald-500"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Analysis Sheets */}
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-start gap-3 p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors">
                <input
                  type="checkbox"
                  checked={includeRevenueAnalysis}
                  onChange={(e) => setIncludeRevenueAnalysis(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                />
                <div>
                  <div className="font-medium text-slate-200">Revenue Analysis</div>
                  <div className="text-sm text-slate-400">Channel-wise revenue breakdown</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors">
                <input
                  type="checkbox"
                  checked={includeExpenseAnalysis}
                  onChange={(e) => setIncludeExpenseAnalysis(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                />
                <div>
                  <div className="font-medium text-slate-200">Expense Analysis</div>
                  <div className="text-sm text-slate-400">Detailed expense category breakdown</div>
                </div>
              </label>
            </div>

            {/* Transactions Option */}
            <div className="p-4 bg-slate-700/50 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTransactions}
                  onChange={(e) => setIncludeTransactions(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-slate-500 text-emerald-500 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-200">Transaction Details</div>
                  <div className="text-sm text-slate-400">Detailed transaction listing for selected months (requires Monthly Sheets)</div>
                </div>
              </label>

              {includeTransactions && selectedMonths.length === 0 && (
                <div className="mt-3 pl-7 text-xs text-amber-400 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Select months above to include transaction sheets
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-400">
              {exportProgress || (
                estimatedSheets > 0
                  ? `${estimatedSheets} sheet${estimatedSheets !== 1 ? 's' : ''} will be generated`
                  : 'Select options to export'
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting || estimatedSheets === 0}
              className={`
                flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all
                ${isExporting || estimatedSheets === 0
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }
              `}
            >
              {isExporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export Excel
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MISExcelExportModal;
