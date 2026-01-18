import React, { useState, useEffect, useMemo } from 'react';
import { IndianState, INDIAN_STATES } from '../types';
import {
  MISPeriod,
  MISRecord,
  StateUploadData,
  createEmptyStateUploadData,
  periodToString,
  periodToKey
} from '../types/misTracking';
import { loadMISData, saveMISRecord, getAllPeriods, getMISRecord } from '../utils/googleSheetsStorage';
import { parseSalesRegister, parseJournal, parsePurchaseRegister, parseBalanceSheet } from '../utils/misTrackingParser';
import { calculateMIS, formatCurrency, formatPercent } from '../utils/misCalculator';
import { ClassificationReviewModal } from '../components/mis-tracking/ClassificationReviewModal';
import { MISMonthlyView } from '../components/mis-tracking/MISMonthlyView';
import { MISTrendsView } from '../components/mis-tracking/MISTrendsView';

// ============================================
// TYPES
// ============================================

interface MonthData {
  period: MISPeriod;
  periodKey: string;
  uploadData: Record<IndianState, StateUploadData | undefined>;
  hasData: boolean;
  mis: MISRecord | null;
  isExpanded: boolean;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function MISTrackingNew() {
  // ============================================
  // STATE
  // ============================================
  const [activeView, setActiveView] = useState<'timeline' | 'report' | 'trends'>('timeline');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [savedPeriods, setSavedPeriods] = useState<{ periodKey: string; period: MISPeriod }[]>([]);
  const [allMISData, setAllMISData] = useState<MISRecord[]>([]);

  // Month management
  const [monthsData, setMonthsData] = useState<Record<string, MonthData>>({});
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [selectedStates, setSelectedStates] = useState<IndianState[]>(['UP']);

  // Viewing MIS
  const [viewingMIS, setViewingMIS] = useState<MISRecord | null>(null);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [generatingMonth, setGeneratingMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClassificationModal, setShowClassificationModal] = useState(false);
  const [pendingMIS, setPendingMIS] = useState<MISRecord | null>(null);

  // ============================================
  // EFFECTS
  // ============================================

  // Load saved data on mount
  useEffect(() => {
    loadSavedData();
  }, []);

  // Initialize months for selected year
  useEffect(() => {
    initializeMonthsForYear(selectedYear);
  }, [selectedYear, savedPeriods]);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadSavedData = async () => {
    setIsLoading(true);
    try {
      const data = await loadMISData();
      setSavedPeriods(data.periods.map(p => ({ periodKey: p.periodKey, period: p.period })));
      setAllMISData(data.periods);
    } catch (err) {
      console.error('Error loading MIS data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const initializeMonthsForYear = (year: number) => {
    const newMonthsData: Record<string, MonthData> = {};

    for (let month = 1; month <= 12; month++) {
      const period: MISPeriod = { month, year };
      const periodKey = periodToKey(period);
      const existingMIS = allMISData.find(m => m.periodKey === periodKey);

      newMonthsData[periodKey] = {
        period,
        periodKey,
        uploadData: monthsData[periodKey]?.uploadData || ({} as Record<IndianState, StateUploadData | undefined>),
        hasData: !!existingMIS,
        mis: existingMIS || null,
        isExpanded: expandedMonth === periodKey
      };
    }

    setMonthsData(newMonthsData);
  };

  // ============================================
  // FILE UPLOAD HANDLERS
  // ============================================

  const handleFileUpload = async (
    periodKey: string,
    state: IndianState,
    fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet',
    file: File
  ) => {
    setError(null);
    setIsLoading(true);

    try {
      const monthData = monthsData[periodKey];
      if (!monthData) return;

      const stateData = monthData.uploadData[state] || createEmptyStateUploadData(state);
      let updatedStateData = { ...stateData };

      switch (fileType) {
        case 'sales':
          updatedStateData.salesRegisterFile = file;
          const salesResult = await parseSalesRegister(file, state);
          updatedStateData.salesData = salesResult.salesData;
          updatedStateData.salesParsed = true;
          break;

        case 'journal':
          updatedStateData.journalFile = file;
          const journalResult = await parseJournal(file, state);
          updatedStateData.journalTransactions = journalResult.transactions;
          updatedStateData.journalParsed = true;
          break;

        case 'purchase':
          updatedStateData.purchaseRegisterFile = file;
          const purchaseResult = await parsePurchaseRegister(file);
          updatedStateData.purchaseTotal = purchaseResult.totalPurchases;
          updatedStateData.purchaseParsed = true;
          break;

        case 'balanceSheet':
          updatedStateData.balanceSheetFile = file;
          const bsResult = await parseBalanceSheet(file);
          updatedStateData.balanceSheetData = bsResult.data;
          updatedStateData.balanceSheetParsed = true;
          break;
      }

      setMonthsData({
        ...monthsData,
        [periodKey]: {
          ...monthData,
          uploadData: {
            ...monthData.uploadData,
            [state]: updatedStateData
          }
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // MIS GENERATION
  // ============================================

  const handleGenerateMIS = async (periodKey: string) => {
    setError(null);
    setGeneratingMonth(periodKey);

    try {
      const monthData = monthsData[periodKey];
      if (!monthData) return;

      const mis = await calculateMIS(monthData.period, monthData.uploadData, selectedStates);

      // Save to storage
      await saveMISRecord(mis);

      // Update local state
      setMonthsData({
        ...monthsData,
        [periodKey]: {
          ...monthData,
          hasData: true,
          mis
        }
      });

      // Reload all data
      await loadSavedData();

      // If there are unclassified transactions, show the modal
      if (mis.unclassifiedCount > 0) {
        setPendingMIS(mis);
        setShowClassificationModal(true);
      } else {
        // Show the report
        setViewingMIS(mis);
        setActiveView('report');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate MIS');
    } finally {
      setGeneratingMonth(null);
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const getUploadStatus = (periodKey: string, state: IndianState, fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet'): 'empty' | 'uploaded' | 'parsed' => {
    const monthData = monthsData[periodKey];
    if (!monthData) return 'empty';

    const data = monthData.uploadData[state];
    if (!data) return 'empty';

    switch (fileType) {
      case 'sales':
        return data.salesParsed ? 'parsed' : data.salesRegisterFile ? 'uploaded' : 'empty';
      case 'journal':
        return data.journalParsed ? 'parsed' : data.journalFile ? 'uploaded' : 'empty';
      case 'purchase':
        return data.purchaseParsed ? 'parsed' : data.purchaseRegisterFile ? 'uploaded' : 'empty';
      case 'balanceSheet':
        return data.balanceSheetParsed ? 'parsed' : data.balanceSheetFile ? 'uploaded' : 'empty';
    }
  };

  const canGenerateMIS = (periodKey: string): boolean => {
    const monthData = monthsData[periodKey];
    if (!monthData) return false;

    // Need at least sales register for each selected state
    for (const state of selectedStates) {
      const data = monthData.uploadData[state];
      if (!data?.salesParsed) return false;
    }
    return selectedStates.length > 0;
  };

  const getMonthCompletionStatus = (periodKey: string): 'empty' | 'partial' | 'ready' | 'complete' => {
    const monthData = monthsData[periodKey];
    if (!monthData) return 'empty';

    if (monthData.hasData) return 'complete';

    let hasAnyFile = false;
    let hasAllRequired = true;

    for (const state of selectedStates) {
      const data = monthData.uploadData[state];
      if (data?.salesParsed || data?.journalParsed || data?.purchaseParsed || data?.balanceSheetParsed) {
        hasAnyFile = true;
      }
      if (!data?.salesParsed) {
        hasAllRequired = false;
      }
    }

    if (hasAllRequired && hasAnyFile) return 'ready';
    if (hasAnyFile) return 'partial';
    return 'empty';
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MIS Reporting</h1>
          <p className="text-gray-600 mt-1">Upload documents for each month, generate P&L, and view trends</p>
        </div>

        {/* View Switcher */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[
            { id: 'timeline' as const, label: 'Timeline', icon: '📅' },
            { id: 'report' as const, label: 'View Report', icon: '📊' },
            { id: 'trends' as const, label: 'Trends', icon: '📈' }
          ].map(view => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id)}
              className={`
                px-4 py-2 rounded-md text-sm font-medium transition-all
                ${activeView === view.id
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
            >
              <span className="mr-1.5">{view.icon}</span>
              {view.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-700">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Timeline View */}
      {activeView === 'timeline' && (
        <div className="space-y-6">
          {/* Year Selector & State Selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Year:</label>
              <div className="flex gap-1">
                {years.map(year => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`
                      px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${selectedYear === year
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }
                    `}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">States:</label>
              <div className="flex gap-1">
                {INDIAN_STATES.map(state => (
                  <button
                    key={state.code}
                    onClick={() => {
                      if (selectedStates.includes(state.code)) {
                        setSelectedStates(selectedStates.filter(s => s !== state.code));
                      } else {
                        setSelectedStates([...selectedStates, state.code]);
                      }
                    }}
                    className={`
                      px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${selectedStates.includes(state.code)
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }
                    `}
                  >
                    {state.code}
                  </button>
                ))}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-500"></span> Complete
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span> Ready
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span> Partial
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-gray-300"></span> Empty
              </span>
            </div>
          </div>

          {/* Month Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {months.map((monthName, index) => {
              const period: MISPeriod = { month: index + 1, year: selectedYear };
              const periodKey = periodToKey(period);
              const status = getMonthCompletionStatus(periodKey);
              const monthData = monthsData[periodKey];
              const isExpanded = expandedMonth === periodKey;
              const isFuture = new Date(selectedYear, index) > new Date();

              return (
                <div key={periodKey} className="relative">
                  <button
                    onClick={() => setExpandedMonth(isExpanded ? null : periodKey)}
                    disabled={isFuture}
                    className={`
                      w-full p-4 rounded-xl border-2 transition-all text-left
                      ${isFuture
                        ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                        : isExpanded
                        ? 'bg-blue-50 border-blue-500 shadow-lg'
                        : status === 'complete'
                        ? 'bg-green-50 border-green-300 hover:border-green-500'
                        : status === 'ready'
                        ? 'bg-blue-50 border-blue-300 hover:border-blue-500'
                        : status === 'partial'
                        ? 'bg-yellow-50 border-yellow-300 hover:border-yellow-500'
                        : 'bg-white border-gray-200 hover:border-gray-400'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-gray-800">{monthName}</span>
                      <span className={`
                        w-3 h-3 rounded-full
                        ${status === 'complete' ? 'bg-green-500' :
                          status === 'ready' ? 'bg-blue-500' :
                          status === 'partial' ? 'bg-yellow-500' : 'bg-gray-300'}
                      `} />
                    </div>

                    {status === 'complete' && monthData?.mis && (
                      <div className="text-xs text-gray-600 space-y-1">
                        <div className="truncate">Rev: {formatCurrency(monthData.mis.revenue.netRevenue)}</div>
                        <div className={monthData.mis.ebitda >= 0 ? 'text-green-600' : 'text-red-600'}>
                          EBITDA: {formatPercent(monthData.mis.ebitdaPercent)}
                        </div>
                      </div>
                    )}

                    {status !== 'complete' && !isFuture && (
                      <div className="text-xs text-gray-500">
                        {status === 'ready' ? 'Ready to generate' :
                         status === 'partial' ? 'Upload pending' : 'Click to upload'}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Expanded Month Detail Panel */}
          {expandedMonth && monthsData[expandedMonth] && (
            <MonthDetailPanel
              monthData={monthsData[expandedMonth]}
              selectedStates={selectedStates}
              onFileUpload={(state, fileType, file) => handleFileUpload(expandedMonth, state, fileType, file)}
              getUploadStatus={(state, fileType) => getUploadStatus(expandedMonth, state, fileType)}
              canGenerate={canGenerateMIS(expandedMonth)}
              onGenerate={() => handleGenerateMIS(expandedMonth)}
              onViewMIS={() => {
                const mis = monthsData[expandedMonth].mis;
                if (mis) {
                  setViewingMIS(mis);
                  setActiveView('report');
                }
              }}
              isGenerating={generatingMonth === expandedMonth}
              isLoading={isLoading}
              onClose={() => setExpandedMonth(null)}
            />
          )}

          {/* Quick Stats - Show if we have any data */}
          {allMISData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Overview for {selectedYear}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Months with Data"
                  value={`${allMISData.filter(m => m.period.year === selectedYear).length} / 12`}
                  color="blue"
                />
                <StatCard
                  label="Avg Net Revenue"
                  value={formatCurrency(
                    allMISData
                      .filter(m => m.period.year === selectedYear)
                      .reduce((sum, m) => sum + m.revenue.netRevenue, 0) /
                    Math.max(1, allMISData.filter(m => m.period.year === selectedYear).length)
                  )}
                  color="green"
                />
                <StatCard
                  label="Avg Gross Margin"
                  value={formatPercent(
                    allMISData
                      .filter(m => m.period.year === selectedYear)
                      .reduce((sum, m) => sum + m.grossMarginPercent, 0) /
                    Math.max(1, allMISData.filter(m => m.period.year === selectedYear).length)
                  )}
                  color="purple"
                />
                <StatCard
                  label="Avg EBITDA"
                  value={formatPercent(
                    allMISData
                      .filter(m => m.period.year === selectedYear)
                      .reduce((sum, m) => sum + m.ebitdaPercent, 0) /
                    Math.max(1, allMISData.filter(m => m.period.year === selectedYear).length)
                  )}
                  color={allMISData.filter(m => m.period.year === selectedYear).reduce((sum, m) => sum + m.ebitdaPercent, 0) >= 0 ? 'green' : 'red'}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Report View */}
      {activeView === 'report' && (
        <MISMonthlyView
          currentMIS={viewingMIS}
          savedPeriods={savedPeriods}
          onPeriodChange={async (periodKey) => {
            const data = await loadMISData();
            const mis = data.periods.find(p => p.periodKey === periodKey);
            if (mis) setViewingMIS(mis);
          }}
        />
      )}

      {/* Trends View */}
      {activeView === 'trends' && (
        <MISTrendsView savedPeriods={savedPeriods} />
      )}

      {/* Classification Review Modal */}
      {showClassificationModal && pendingMIS && (
        <ClassificationReviewModal
          transactions={pendingMIS.classifiedTransactions}
          unclassifiedCount={pendingMIS.unclassifiedCount}
          onClose={() => {
            setShowClassificationModal(false);
            setViewingMIS(pendingMIS);
            setActiveView('report');
            setPendingMIS(null);
          }}
          onSave={async (updatedTransactions) => {
            const updatedMIS = { ...pendingMIS, classifiedTransactions: updatedTransactions };
            await saveMISRecord(updatedMIS);
            await loadSavedData();
            setShowClassificationModal(false);
            setViewingMIS(updatedMIS);
            setActiveView('report');
            setPendingMIS(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================
// MONTH DETAIL PANEL
// ============================================

interface MonthDetailPanelProps {
  monthData: MonthData;
  selectedStates: IndianState[];
  onFileUpload: (state: IndianState, fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet', file: File) => void;
  getUploadStatus: (state: IndianState, fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet') => 'empty' | 'uploaded' | 'parsed';
  canGenerate: boolean;
  onGenerate: () => void;
  onViewMIS: () => void;
  isGenerating: boolean;
  isLoading: boolean;
  onClose: () => void;
}

function MonthDetailPanel({
  monthData,
  selectedStates,
  onFileUpload,
  getUploadStatus,
  canGenerate,
  onGenerate,
  onViewMIS,
  isGenerating,
  isLoading,
  onClose
}: MonthDetailPanelProps) {
  const docTypes: { type: 'sales' | 'journal' | 'purchase' | 'balanceSheet'; label: string; required: boolean }[] = [
    { type: 'sales', label: 'Sales Register', required: true },
    { type: 'journal', label: 'Journal', required: false },
    { type: 'purchase', label: 'Purchase Register', required: false },
    { type: 'balanceSheet', label: 'Balance Sheet', required: false }
  ];

  return (
    <div className="bg-white rounded-xl border-2 border-blue-500 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">{periodToString(monthData.period)}</h3>
          <p className="text-blue-100 text-sm">
            {monthData.hasData ? 'MIS Generated - Click to view or update' : 'Upload documents to generate MIS'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Document Upload Grid */}
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Upload Documents</h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-sm font-medium text-gray-600">Document</th>
                  {selectedStates.map(state => (
                    <th key={state} className="text-center py-2 px-3 text-sm font-medium text-gray-600">
                      {INDIAN_STATES.find(s => s.code === state)?.name || state}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docTypes.map(doc => (
                  <tr key={doc.type} className="border-b border-gray-100">
                    <td className="py-3 px-3">
                      <span className="text-sm text-gray-700">{doc.label}</span>
                      {doc.required && <span className="text-red-500 ml-1">*</span>}
                    </td>
                    {selectedStates.map(state => (
                      <td key={state} className="py-3 px-3 text-center">
                        <FileUploadButton
                          status={getUploadStatus(state, doc.type)}
                          onUpload={(file) => onFileUpload(state, doc.type, file)}
                          isLoading={isLoading}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          {monthData.hasData ? (
            <>
              <button
                onClick={onViewMIS}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                View MIS Report
              </button>
              <button
                onClick={onGenerate}
                disabled={!canGenerate || isGenerating}
                className={`
                  flex-1 px-6 py-3 rounded-lg font-semibold transition-colors
                  ${canGenerate && !isGenerating
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Regenerating...
                  </span>
                ) : (
                  'Regenerate MIS'
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onGenerate}
              disabled={!canGenerate || isGenerating}
              className={`
                w-full px-6 py-3 rounded-lg font-semibold transition-colors
                ${canGenerate && !isGenerating
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : canGenerate ? (
                `Generate MIS for ${periodToString(monthData.period)}`
              ) : (
                'Upload Sales Register for all states to continue'
              )}
            </button>
          )}
        </div>

        {/* Existing MIS Summary */}
        {monthData.hasData && monthData.mis && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Current MIS Summary</h4>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-xs text-gray-500">Net Revenue</div>
                <div className="font-semibold text-gray-800">{formatCurrency(monthData.mis.revenue.netRevenue)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Gross Margin</div>
                <div className="font-semibold text-green-600">{formatPercent(monthData.mis.grossMarginPercent)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">CM1</div>
                <div className="font-semibold text-blue-600">{formatPercent(monthData.mis.cm1Percent)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">EBITDA</div>
                <div className={`font-semibold ${monthData.mis.ebitda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(monthData.mis.ebitdaPercent)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// FILE UPLOAD BUTTON
// ============================================

interface FileUploadButtonProps {
  status: 'empty' | 'uploaded' | 'parsed';
  onUpload: (file: File) => void;
  isLoading: boolean;
}

function FileUploadButton({ status, onUpload, isLoading }: FileUploadButtonProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  };

  if (isLoading) {
    return (
      <div className="w-10 h-10 mx-auto flex items-center justify-center">
        <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.pdf"
        onChange={handleChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        className={`
          w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-all
          ${status === 'parsed'
            ? 'bg-green-100 text-green-600 hover:bg-green-200'
            : status === 'uploaded'
            ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
            : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
          }
        `}
        title={status === 'parsed' ? 'Parsed (click to replace)' : status === 'uploaded' ? 'Uploaded (click to replace)' : 'Click to upload'}
      >
        {status === 'parsed' ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ============================================
// STAT CARD
// ============================================

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700'
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-sm opacity-80">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

export default MISTrackingNew;
