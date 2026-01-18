import React, { useState, useEffect, useCallback } from 'react';
import { IndianState, INDIAN_STATES } from '../types';
import {
  MISPeriod,
  MISRecord,
  MISTab,
  StateUploadData,
  createEmptyStateUploadData,
  periodToString,
  periodToKey
} from '../types/misTracking';
import { loadMISData, saveMISRecord, getAllPeriods } from '../utils/googleSheetsStorage';
import { parseSalesRegister, parseJournal, parsePurchaseRegister, parseBalanceSheet } from '../utils/misTrackingParser';
import { calculateMIS, formatCurrency, formatPercent } from '../utils/misCalculator';
import { ClassificationReviewModal } from '../components/mis-tracking/ClassificationReviewModal';
import { MISMonthlyView } from '../components/mis-tracking/MISMonthlyView';
import { MISTrendsView } from '../components/mis-tracking/MISTrendsView';

// ============================================
// MAIN COMPONENT
// ============================================

export function MISTrackingNew() {
  // ============================================
  // STATE
  // ============================================
  const [activeTab, setActiveTab] = useState<MISTab>('upload');

  // Period selection
  const currentDate = new Date();
  const [selectedPeriod, setSelectedPeriod] = useState<MISPeriod>({
    month: currentDate.getMonth() + 1,
    year: currentDate.getFullYear()
  });

  // State selection
  const [selectedStates, setSelectedStates] = useState<IndianState[]>(['UP']);

  // Upload data per state
  const [uploadData, setUploadData] = useState<Record<IndianState, StateUploadData | undefined>>({} as Record<IndianState, StateUploadData | undefined>);

  // Generated MIS
  const [currentMIS, setCurrentMIS] = useState<MISRecord | null>(null);

  // Saved periods
  const [savedPeriods, setSavedPeriods] = useState<{ periodKey: string; period: MISPeriod }[]>([]);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClassificationModal, setShowClassificationModal] = useState(false);

  // ============================================
  // EFFECTS
  // ============================================

  // Load saved periods on mount
  useEffect(() => {
    loadSavedPeriods();
  }, []);

  // Initialize upload data for selected states
  useEffect(() => {
    const newUploadData = { ...uploadData };
    for (const state of selectedStates) {
      if (!newUploadData[state]) {
        newUploadData[state] = createEmptyStateUploadData(state);
      }
    }
    setUploadData(newUploadData);
  }, [selectedStates]);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadSavedPeriods = async () => {
    const periods = await getAllPeriods();
    setSavedPeriods(periods);
  };

  // ============================================
  // FILE UPLOAD HANDLERS
  // ============================================

  const handleFileUpload = async (
    state: IndianState,
    fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet',
    file: File
  ) => {
    setError(null);
    setIsLoading(true);

    try {
      const stateData = uploadData[state] || createEmptyStateUploadData(state);
      let updatedData = { ...stateData };

      switch (fileType) {
        case 'sales':
          updatedData.salesRegisterFile = file;
          const salesResult = await parseSalesRegister(file, state);
          updatedData.salesData = salesResult.salesData;
          updatedData.salesParsed = true;
          break;

        case 'journal':
          updatedData.journalFile = file;
          const journalResult = await parseJournal(file, state);
          updatedData.journalTransactions = journalResult.transactions;
          updatedData.journalParsed = true;
          break;

        case 'purchase':
          updatedData.purchaseRegisterFile = file;
          const purchaseResult = await parsePurchaseRegister(file);
          updatedData.purchaseTotal = purchaseResult.totalPurchases;
          updatedData.purchaseParsed = true;
          break;

        case 'balanceSheet':
          updatedData.balanceSheetFile = file;
          const bsResult = await parseBalanceSheet(file);
          updatedData.balanceSheetData = bsResult.data;
          updatedData.balanceSheetParsed = true;
          break;
      }

      setUploadData({ ...uploadData, [state]: updatedData });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // MIS GENERATION
  // ============================================

  const handleGenerateMIS = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      const mis = await calculateMIS(selectedPeriod, uploadData as Record<IndianState, StateUploadData | undefined>, selectedStates);
      setCurrentMIS(mis);

      // Save to storage
      await saveMISRecord(mis);
      await loadSavedPeriods();

      // If there are unclassified transactions, show the modal
      if (mis.unclassifiedCount > 0) {
        setShowClassificationModal(true);
      } else {
        // Switch to monthly view
        setActiveTab('monthly');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate MIS');
    } finally {
      setIsGenerating(false);
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const getUploadStatus = (state: IndianState, fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet'): 'empty' | 'uploaded' | 'parsed' => {
    const data = uploadData[state];
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

  const canGenerate = (): boolean => {
    // Need at least sales register for each selected state
    for (const state of selectedStates) {
      const data = uploadData[state];
      if (!data?.salesParsed) return false;
    }
    return selectedStates.length > 0;
  };

  const getParseStats = () => {
    let totalSalesEntries = 0;
    let totalJournalTransactions = 0;

    for (const state of selectedStates) {
      const data = uploadData[state];
      if (data?.salesData) {
        totalSalesEntries += data.salesData.lineItems.length;
      }
      if (data?.journalTransactions) {
        totalJournalTransactions += data.journalTransactions.length;
      }
    }

    return { totalSalesEntries, totalJournalTransactions };
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">MIS Tracking</h1>
        <p className="text-gray-600 mt-1">Upload documents, generate MIS, and track trends</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'upload' as const, label: 'Upload & Generate', icon: '📤' },
            { id: 'monthly' as const, label: 'Monthly View', icon: '📊' },
            { id: 'trends' as const, label: 'Trends', icon: '📈' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'upload' && (
        <UploadTab
          selectedPeriod={selectedPeriod}
          setSelectedPeriod={setSelectedPeriod}
          selectedStates={selectedStates}
          setSelectedStates={setSelectedStates}
          uploadData={uploadData}
          handleFileUpload={handleFileUpload}
          getUploadStatus={getUploadStatus}
          canGenerate={canGenerate}
          handleGenerateMIS={handleGenerateMIS}
          isLoading={isLoading}
          isGenerating={isGenerating}
          getParseStats={getParseStats}
          savedPeriods={savedPeriods}
        />
      )}

      {activeTab === 'monthly' && (
        <MISMonthlyView
          currentMIS={currentMIS}
          savedPeriods={savedPeriods}
          onPeriodChange={async (periodKey) => {
            const data = await loadMISData();
            const mis = data.periods.find(p => p.periodKey === periodKey);
            if (mis) setCurrentMIS(mis);
          }}
        />
      )}

      {activeTab === 'trends' && (
        <MISTrendsView savedPeriods={savedPeriods} />
      )}

      {/* Classification Review Modal */}
      {showClassificationModal && currentMIS && (
        <ClassificationReviewModal
          transactions={currentMIS.classifiedTransactions}
          unclassifiedCount={currentMIS.unclassifiedCount}
          onClose={() => {
            setShowClassificationModal(false);
            setActiveTab('monthly');
          }}
          onSave={async (updatedTransactions) => {
            // Update MIS with new classifications
            const updatedMIS = { ...currentMIS, classifiedTransactions: updatedTransactions };
            setCurrentMIS(updatedMIS);
            await saveMISRecord(updatedMIS);
            setShowClassificationModal(false);
            setActiveTab('monthly');
          }}
        />
      )}
    </div>
  );
}

// ============================================
// UPLOAD TAB COMPONENT
// ============================================

interface UploadTabProps {
  selectedPeriod: MISPeriod;
  setSelectedPeriod: (period: MISPeriod) => void;
  selectedStates: IndianState[];
  setSelectedStates: (states: IndianState[]) => void;
  uploadData: Record<IndianState, StateUploadData | undefined>;
  handleFileUpload: (state: IndianState, fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet', file: File) => Promise<void>;
  getUploadStatus: (state: IndianState, fileType: 'sales' | 'journal' | 'purchase' | 'balanceSheet') => 'empty' | 'uploaded' | 'parsed';
  canGenerate: () => boolean;
  handleGenerateMIS: () => Promise<void>;
  isLoading: boolean;
  isGenerating: boolean;
  getParseStats: () => { totalSalesEntries: number; totalJournalTransactions: number };
  savedPeriods: { periodKey: string; period: MISPeriod }[];
}

function UploadTab({
  selectedPeriod,
  setSelectedPeriod,
  selectedStates,
  setSelectedStates,
  uploadData,
  handleFileUpload,
  getUploadStatus,
  canGenerate,
  handleGenerateMIS,
  isLoading,
  isGenerating,
  getParseStats,
  savedPeriods
}: UploadTabProps) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const stats = getParseStats();

  // Check if period already has data
  const periodExists = savedPeriods.some(p => p.periodKey === periodToKey(selectedPeriod));

  return (
    <div className="space-y-6">
      {/* Step 1: Select Period */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 text-sm font-bold">1</span>
          Select Period
        </h3>

        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              value={selectedPeriod.month}
              onChange={(e) => setSelectedPeriod({ ...selectedPeriod, month: parseInt(e.target.value) })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {months.map((month, index) => (
                <option key={month} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <select
              value={selectedPeriod.year}
              onChange={(e) => setSelectedPeriod({ ...selectedPeriod, year: parseInt(e.target.value) })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {periodExists && (
            <div className="ml-4 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg text-sm">
              Data exists for this period. Uploading will replace it.
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Select States */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 text-sm font-bold">2</span>
          Select Active States
        </h3>

        <div className="flex flex-wrap gap-3">
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
                px-4 py-2 rounded-lg border-2 transition-all
                ${selectedStates.includes(state.code)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }
              `}
            >
              {selectedStates.includes(state.code) && (
                <svg className="w-4 h-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {state.name}
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: Upload Documents */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 text-sm font-bold">3</span>
          Upload Documents
        </h3>

        {selectedStates.length === 0 ? (
          <p className="text-gray-500">Please select at least one state to upload documents.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Document</th>
                  {selectedStates.map(state => (
                    <th key={state} className="text-center py-3 px-4 font-medium text-gray-700">
                      {INDIAN_STATES.find(s => s.code === state)?.name || state}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { type: 'sales' as const, label: 'Sales Register', required: true },
                  { type: 'journal' as const, label: 'Journal', required: false },
                  { type: 'purchase' as const, label: 'Purchase Register', required: false },
                  { type: 'balanceSheet' as const, label: 'Balance Sheet', required: false }
                ].map(doc => (
                  <tr key={doc.type} className="border-b border-gray-100">
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-700">{doc.label}</span>
                      {doc.required && <span className="text-red-500 ml-1">*</span>}
                    </td>
                    {selectedStates.map(state => (
                      <td key={state} className="py-3 px-4 text-center">
                        <FileUploadCell
                          status={getUploadStatus(state, doc.type)}
                          onUpload={(file) => handleFileUpload(state, doc.type, file)}
                          isLoading={isLoading}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Parse Stats */}
        {(stats.totalSalesEntries > 0 || stats.totalJournalTransactions > 0) && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-gray-500">Sales Entries:</span>
                <span className="ml-2 font-semibold text-gray-700">{stats.totalSalesEntries}</span>
              </div>
              <div>
                <span className="text-gray-500">Journal Transactions:</span>
                <span className="ml-2 font-semibold text-gray-700">{stats.totalJournalTransactions}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step 4: Generate */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mr-3 text-sm font-bold">4</span>
          Generate MIS
        </h3>

        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerateMIS}
            disabled={!canGenerate() || isGenerating}
            className={`
              px-6 py-3 rounded-lg font-semibold text-white transition-all
              ${canGenerate() && !isGenerating
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-400 cursor-not-allowed'
              }
            `}
          >
            {isGenerating ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </span>
            ) : (
              <>
                Generate MIS for {periodToString(selectedPeriod)}
              </>
            )}
          </button>

          {!canGenerate() && (
            <span className="text-sm text-gray-500">
              Upload Sales Register for all selected states to continue
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// FILE UPLOAD CELL COMPONENT
// ============================================

interface FileUploadCellProps {
  status: 'empty' | 'uploaded' | 'parsed';
  onUpload: (file: File) => void;
  isLoading: boolean;
}

function FileUploadCell({ status, onUpload, isLoading }: FileUploadCellProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    // Reset input
    e.target.value = '';
  };

  if (isLoading) {
    return (
      <div className="w-10 h-10 mx-auto flex items-center justify-center">
        <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
        title={status === 'parsed' ? 'Parsed successfully (click to replace)' : status === 'uploaded' ? 'Uploaded (click to replace)' : 'Click to upload'}
      >
        {status === 'parsed' ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : status === 'uploaded' ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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

export default MISTrackingNew;
