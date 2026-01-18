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
import {
  checkDriveStatus,
  getDriveFolderStructure,
  getFileContent,
  base64ToFile,
  DriveStatus,
  DriveFolderStructure,
  DriveMonthData,
  DriveStateData,
  STATE_NAMES
} from '../utils/driveApi';

// ============================================
// DRIVE STATE CODE MAPPING
// ============================================

// Map Drive state codes to IndianState type
const DRIVE_STATE_MAP: Record<string, IndianState> = {
  'KA': 'Karnataka',
  'Karnataka': 'Karnataka',
  'MH': 'Maharashtra',
  'Maharashtra': 'Maharashtra',
  'HR': 'Haryana',
  'Haryana': 'Haryana',
  'UP': 'UP',
  'TL': 'Telangana',
  'Telangana': 'Telangana'
};

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
  // All 5 states are always selected
  const selectedStates: IndianState[] = ['UP', 'Maharashtra', 'Telangana', 'Karnataka', 'Haryana'];

  // Viewing MIS
  const [viewingMIS, setViewingMIS] = useState<MISRecord | null>(null);

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [generatingMonth, setGeneratingMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClassificationModal, setShowClassificationModal] = useState(false);
  const [pendingMIS, setPendingMIS] = useState<MISRecord | null>(null);

  // Google Drive State
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [driveStructure, setDriveStructure] = useState<DriveFolderStructure | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [fetchingFromDrive, setFetchingFromDrive] = useState<string | null>(null);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{ current: number; total: number; currentMonth: string } | null>(null);

  // ============================================
  // EFFECTS
  // ============================================

  // Load saved data on mount
  useEffect(() => {
    loadSavedData();
    checkDriveConnection();
  }, []);

  // Check Drive connection and load structure
  const checkDriveConnection = async () => {
    setIsDriveLoading(true);
    try {
      const status = await checkDriveStatus();
      setDriveStatus(status);

      if (status.connected) {
        const structure = await getDriveFolderStructure();
        setDriveStructure(structure);
      }
    } catch (err) {
      console.error('Error checking Drive status:', err);
    } finally {
      setIsDriveLoading(false);
    }
  };

  // Initialize months for selected year
  useEffect(() => {
    initializeMonthsForYear(selectedYear);
  }, [selectedYear, savedPeriods]);

  // Auto-fetch from Drive when structure is loaded
  useEffect(() => {
    if (driveStructure && driveStructure.years.length > 0 && !isAutoFetching) {
      autoFetchAllFromDrive();
    }
  }, [driveStructure]);

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

    // Allow generation if at least one file is parsed for any selected state
    // All file types are optional
    for (const state of selectedStates) {
      const data = monthData.uploadData[state];
      if (data?.salesParsed || data?.journalParsed || data?.purchaseParsed || data?.balanceSheetParsed) {
        return true;
      }
    }
    return false;
  };

  const getMonthCompletionStatus = (periodKey: string): 'empty' | 'partial' | 'ready' | 'complete' => {
    const monthData = monthsData[periodKey];
    if (!monthData) return 'empty';

    let hasAnyFile = false;
    let statesWithData = 0;

    for (const state of selectedStates) {
      const data = monthData.uploadData[state];
      if (data?.salesParsed || data?.journalParsed || data?.purchaseParsed || data?.balanceSheetParsed) {
        hasAnyFile = true;
        statesWithData++;
      }
    }

    // If has uploaded/parsed data, show status based on that
    if (hasAnyFile) {
      // All selected states have data - ready to generate
      if (statesWithData === selectedStates.length) return 'ready';
      // Only some states have data
      return 'partial';
    }

    // No uploaded data in this session - check if has saved MIS from before
    if (monthData.hasData) return 'complete';

    return 'empty';
  };

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  // ============================================
  // GOOGLE DRIVE HELPERS
  // ============================================

  // Get Drive data for a specific month/year
  const getDriveMonthData = (year: number, month: number): DriveMonthData | null => {
    if (!driveStructure) return null;

    for (const yearData of driveStructure.years) {
      for (const monthData of yearData.months) {
        if (monthData.year === year && monthData.month === month) {
          return monthData;
        }
      }
    }
    return null;
  };

  // Check if a month has data in Drive
  const hasDataInDrive = (year: number, month: number): boolean => {
    return getDriveMonthData(year, month) !== null;
  };

  // Get states available in Drive for a month
  const getDriveStatesForMonth = (year: number, month: number): DriveStateData[] => {
    const monthData = getDriveMonthData(year, month);
    return monthData?.states || [];
  };

  // Fetch all files from Drive for a month and parse them
  const handleFetchFromDrive = async (periodKey: string, year: number, month: number) => {
    const driveMonth = getDriveMonthData(year, month);
    if (!driveMonth) return;

    setFetchingFromDrive(periodKey);
    setError(null);

    try {
      const monthData = monthsData[periodKey];
      if (!monthData) return;

      let updatedUploadData = { ...monthData.uploadData };

      for (const stateData of driveMonth.states) {
        // Map Drive state code to IndianState
        const indianState = DRIVE_STATE_MAP[stateData.code];
        if (!indianState || !INDIAN_STATES.some(s => s.code === indianState)) continue;

        let stateUpload = updatedUploadData[indianState] || createEmptyStateUploadData(indianState);

        // Process each file type
        for (const fileInfo of stateData.files) {
          const content = await getFileContent(fileInfo.id);
          if (!content) continue;

          const file = base64ToFile(content, fileInfo.name, fileInfo.mimeType);

          switch (fileInfo.type) {
            case 'sales_register':
              stateUpload.salesRegisterFile = file;
              const salesResult = await parseSalesRegister(file, indianState);
              stateUpload.salesData = salesResult.salesData;
              stateUpload.salesParsed = true;
              break;

            case 'journal_register':
              stateUpload.journalFile = file;
              const journalResult = await parseJournal(file, indianState);
              stateUpload.journalTransactions = journalResult.transactions;
              stateUpload.journalParsed = true;
              break;

            case 'purchase_register':
              stateUpload.purchaseRegisterFile = file;
              const purchaseResult = await parsePurchaseRegister(file);
              stateUpload.purchaseTotal = purchaseResult.totalPurchases;
              stateUpload.purchaseParsed = true;
              break;

            case 'balance_sheet':
              stateUpload.balanceSheetFile = file;
              const bsResult = await parseBalanceSheet(file);
              stateUpload.balanceSheetData = bsResult.data;
              stateUpload.balanceSheetParsed = true;
              break;
          }
        }

        updatedUploadData[indianState] = stateUpload;
      }

      setMonthsData({
        ...monthsData,
        [periodKey]: {
          ...monthData,
          uploadData: updatedUploadData
        }
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch from Drive');
    } finally {
      setFetchingFromDrive(null);
    }
  };

  // Helper to fetch and parse a single file
  const fetchAndParseFile = async (
    fileInfo: { id: string; name: string; mimeType: string; type: string },
    indianState: IndianState
  ): Promise<{ type: string; result: any } | null> => {
    try {
      const content = await getFileContent(fileInfo.id);
      if (!content) return null;

      const file = base64ToFile(content, fileInfo.name, fileInfo.mimeType);

      switch (fileInfo.type) {
        case 'sales_register':
          const salesResult = await parseSalesRegister(file, indianState);
          return { type: 'sales_register', result: { file, salesData: salesResult.salesData } };
        case 'journal_register':
          const journalResult = await parseJournal(file, indianState);
          return { type: 'journal_register', result: { file, transactions: journalResult.transactions } };
        case 'purchase_register':
          const purchaseResult = await parsePurchaseRegister(file);
          return { type: 'purchase_register', result: { file, totalPurchases: purchaseResult.totalPurchases } };
        case 'balance_sheet':
          const bsResult = await parseBalanceSheet(file);
          return { type: 'balance_sheet', result: { file, data: bsResult.data } };
        default:
          return null;
      }
    } catch (err) {
      console.error(`Error fetching file ${fileInfo.name}:`, err);
      return null;
    }
  };

  // Auto-fetch all data from Drive (optimized with parallel fetching)
  const autoFetchAllFromDrive = async () => {
    if (!driveStructure || isAutoFetching) return;

    setIsAutoFetching(true);
    setError(null);

    try {
      // Count total months for progress
      const allMonths: { yearData: any; driveMonth: any }[] = [];
      for (const yearData of driveStructure.years) {
        for (const driveMonth of yearData.months) {
          allMonths.push({ yearData, driveMonth });
        }
      }

      // Process each month and update state progressively
      let processedMonths = 0;

      for (const { driveMonth } of allMonths) {
        const periodKey = `${driveMonth.year}-${String(driveMonth.month).padStart(2, '0')}`;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthLabel = `${monthNames[driveMonth.month - 1]} ${driveMonth.year}`;

        setFetchProgress({ current: processedMonths + 1, total: allMonths.length, currentMonth: monthLabel });

        // Check if month already has data - skip if so
        const existingMonthData = monthsData[periodKey];
        const hasAllData = existingMonthData && driveMonth.states.every((stateData: any) => {
          const indianState = DRIVE_STATE_MAP[stateData.code];
          if (!indianState) return true;
          const data = existingMonthData.uploadData[indianState];
          return data?.salesParsed || data?.journalParsed || data?.purchaseParsed || data?.balanceSheetParsed;
        });

        if (hasAllData) {
          // Already have data for this month, skip
          processedMonths++;
          continue;
        }

        // Initialize month data
        const period: MISPeriod = { month: driveMonth.month, year: driveMonth.year };
        const existingMIS = allMISData.find(m => m.periodKey === periodKey);
        let monthUploadData: Record<IndianState, StateUploadData | undefined> =
          existingMonthData?.uploadData ? { ...existingMonthData.uploadData } : {} as Record<IndianState, StateUploadData | undefined>;

        // Process all states and files for this month in parallel
        const statePromises = driveMonth.states.map(async (stateData: any) => {
          const indianState = DRIVE_STATE_MAP[stateData.code];
          if (!indianState || !INDIAN_STATES.some(s => s.code === indianState)) return null;

          // Check if this state already has data
          const existingStateData = monthUploadData[indianState];
          if (existingStateData?.salesParsed || existingStateData?.journalParsed ||
              existingStateData?.purchaseParsed || existingStateData?.balanceSheetParsed) {
            return { indianState, stateUpload: existingStateData };
          }

          let stateUpload = createEmptyStateUploadData(indianState);

          // Fetch all files for this state in parallel
          const fileResults = await Promise.all(
            stateData.files.map((fileInfo: any) => fetchAndParseFile(fileInfo, indianState))
          );

          // Apply results
          for (const result of fileResults) {
            if (!result) continue;
            switch (result.type) {
              case 'sales_register':
                stateUpload.salesRegisterFile = result.result.file;
                stateUpload.salesData = result.result.salesData;
                stateUpload.salesParsed = true;
                break;
              case 'journal_register':
                stateUpload.journalFile = result.result.file;
                stateUpload.journalTransactions = result.result.transactions;
                stateUpload.journalParsed = true;
                break;
              case 'purchase_register':
                stateUpload.purchaseRegisterFile = result.result.file;
                stateUpload.purchaseTotal = result.result.totalPurchases;
                stateUpload.purchaseParsed = true;
                break;
              case 'balance_sheet':
                stateUpload.balanceSheetFile = result.result.file;
                stateUpload.balanceSheetData = result.result.data;
                stateUpload.balanceSheetParsed = true;
                break;
            }
          }

          return { indianState, stateUpload };
        });

        // Wait for all states in this month
        const stateResults = await Promise.all(statePromises);

        // Apply results to monthUploadData
        for (const result of stateResults) {
          if (result && result.indianState) {
            const state = result.indianState as IndianState;
            monthUploadData[state] = result.stateUpload;
          }
        }

        // Update state immediately for this month (progressive update)
        setMonthsData(prev => ({
          ...prev,
          [periodKey]: {
            period,
            periodKey,
            uploadData: monthUploadData,
            hasData: !!existingMIS,
            mis: existingMIS || null,
            isExpanded: false
          }
        }));

        processedMonths++;
      }

      setFetchProgress(null);

    } catch (err) {
      console.error('Error auto-fetching from Drive:', err);
      setError(err instanceof Error ? err.message : 'Failed to auto-fetch from Drive');
    } finally {
      setIsAutoFetching(false);
    }
  };

  // Generate MIS for all months that have data
  const handleGenerateAllMIS = async () => {
    setGeneratingAll(true);
    setError(null);

    try {
      const monthsToGenerate = Object.values(monthsData).filter(md => {
        // Only generate for months that have data but no MIS yet, or have updated data
        const hasAnyData = selectedStates.some(state => {
          const data = md.uploadData[state];
          return data?.salesParsed || data?.journalParsed || data?.purchaseParsed || data?.balanceSheetParsed;
        });
        return hasAnyData;
      });

      for (const monthData of monthsToGenerate) {
        try {
          const mis = await calculateMIS(monthData.period, monthData.uploadData, selectedStates);
          await saveMISRecord(mis);
        } catch (err) {
          console.error(`Error generating MIS for ${monthData.periodKey}:`, err);
        }
      }

      // Reload all data
      await loadSavedData();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate MIS');
    } finally {
      setGeneratingAll(false);
    }
  };

  // Count months ready for MIS generation
  const monthsReadyCount = useMemo(() => {
    return Object.values(monthsData).filter(md => {
      const hasAnyData = selectedStates.some(state => {
        const data = md.uploadData[state];
        return data?.salesParsed || data?.journalParsed || data?.purchaseParsed || data?.balanceSheetParsed;
      });
      return hasAnyData && !md.hasData;
    }).length;
  }, [monthsData, selectedStates]);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">MIS Reporting</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-slate-400 text-sm">Upload documents for each month, generate P&L, and view trends</p>
            {/* Drive Status Indicator */}
            {driveStatus && (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
                isAutoFetching
                  ? 'bg-blue-500/20 text-blue-400'
                  : driveStatus.connected
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {isAutoFetching ? (
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full ${driveStatus.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                )}
                {isAutoFetching && fetchProgress
                  ? `${fetchProgress.currentMonth} (${fetchProgress.current}/${fetchProgress.total})`
                  : isDriveLoading ? 'Syncing...'
                  : driveStatus.connected ? 'Drive Connected' : 'Drive Offline'}
              </div>
            )}
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex bg-slate-800 rounded-lg p-1">
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
                  ? 'bg-slate-700 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
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
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-400">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
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
          <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-400">Year:</label>
              <div className="flex gap-1">
                {years.map(year => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`
                      px-3 py-1.5 rounded-md text-sm font-medium transition-all
                      ${selectedYear === year
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                      }
                    `}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Complete
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> Ready
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Partial
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-600"></span> Empty
              </span>
            </div>
          </div>

          {/* Generate All MIS Button */}
          {(monthsReadyCount > 0 || Object.values(monthsData).some(m => m.hasData)) && (
            <div className="flex justify-end">
              <button
                onClick={handleGenerateAllMIS}
                disabled={generatingAll || isAutoFetching || monthsReadyCount === 0}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${generatingAll || isAutoFetching || monthsReadyCount === 0
                    ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                  }
                `}
              >
                {generatingAll ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating All MIS...
                  </>
                ) : isAutoFetching ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading from Drive...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generate All MIS ({monthsReadyCount} months)
                  </>
                )}
              </button>
            </div>
          )}

          {/* Month Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {months.map((monthName, index) => {
              const period: MISPeriod = { month: index + 1, year: selectedYear };
              const periodKey = periodToKey(period);
              const status = getMonthCompletionStatus(periodKey);
              const monthData = monthsData[periodKey];
              const isExpanded = expandedMonth === periodKey;
              const isFuture = new Date(selectedYear, index) > new Date();
              const driveData = getDriveMonthData(selectedYear, index + 1);
              const hasDriveData = !!driveData;

              return (
                <div key={periodKey} className="relative">
                  <button
                    onClick={() => setExpandedMonth(isExpanded ? null : periodKey)}
                    disabled={isFuture}
                    className={`
                      w-full p-3 rounded-lg border transition-all text-left
                      ${isFuture
                        ? 'bg-slate-800/30 border-slate-700/50 opacity-40 cursor-not-allowed'
                        : isExpanded
                        ? 'bg-blue-500/15 border-blue-500/50'
                        : status === 'complete'
                        ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50'
                        : status === 'ready'
                        ? 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50'
                        : status === 'partial'
                        ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50'
                        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-200 text-sm">{monthName}</span>
                        {/* Drive indicator */}
                        {hasDriveData && (
                          <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M7.71 3.5L1.15 15l3.43 6h15.84l3.43-6L17.29 3.5H7.71zM15 14h-4v-2h4v2zm0-4h-4V8h4v2z"/>
                          </svg>
                        )}
                      </div>
                      <span className={`
                        w-2 h-2 rounded-full
                        ${status === 'complete' ? 'bg-emerald-500' :
                          status === 'ready' ? 'bg-blue-500' :
                          status === 'partial' ? 'bg-amber-500' : 'bg-slate-600'}
                      `} />
                    </div>

                    {status === 'complete' && monthData?.mis && (
                      <div className="text-xs text-slate-400 space-y-0.5">
                        <div className="truncate">{formatCurrency(monthData.mis.revenue.netRevenue)}</div>
                        <div className={monthData.mis.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {formatPercent(monthData.mis.ebitdaPercent)}
                        </div>
                      </div>
                    )}

                    {status !== 'complete' && !isFuture && (
                      <div className="text-xs text-slate-500">
                        {hasDriveData
                          ? `${driveData.states.length} state${driveData.states.length > 1 ? 's' : ''} in Drive`
                          : status === 'ready' ? 'Ready' :
                            status === 'partial' ? 'Pending' : 'Upload'}
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
              // Drive integration props
              driveData={getDriveMonthData(monthsData[expandedMonth].period.year, monthsData[expandedMonth].period.month)}
              onFetchFromDrive={() => handleFetchFromDrive(
                expandedMonth,
                monthsData[expandedMonth].period.year,
                monthsData[expandedMonth].period.month
              )}
              isFetchingFromDrive={fetchingFromDrive === expandedMonth}
            />
          )}

          {/* Quick Stats - Show if we have any data */}
          {allMISData.length > 0 && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">Overview for {selectedYear}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Months"
                  value={`${allMISData.filter(m => m.period.year === selectedYear).length}/12`}
                  color="blue"
                />
                <StatCard
                  label="Avg Revenue"
                  value={formatCurrency(
                    allMISData
                      .filter(m => m.period.year === selectedYear)
                      .reduce((sum, m) => sum + m.revenue.netRevenue, 0) /
                    Math.max(1, allMISData.filter(m => m.period.year === selectedYear).length)
                  )}
                  color="emerald"
                />
                <StatCard
                  label="Avg Margin"
                  value={formatPercent(
                    allMISData
                      .filter(m => m.period.year === selectedYear)
                      .reduce((sum, m) => sum + m.grossMarginPercent, 0) /
                    Math.max(1, allMISData.filter(m => m.period.year === selectedYear).length)
                  )}
                  color="violet"
                />
                <StatCard
                  label="Avg EBITDA"
                  value={formatPercent(
                    allMISData
                      .filter(m => m.period.year === selectedYear)
                      .reduce((sum, m) => sum + m.ebitdaPercent, 0) /
                    Math.max(1, allMISData.filter(m => m.period.year === selectedYear).length)
                  )}
                  color={allMISData.filter(m => m.period.year === selectedYear).reduce((sum, m) => sum + m.ebitdaPercent, 0) >= 0 ? 'emerald' : 'red'}
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
  // Drive integration
  driveData?: DriveMonthData | null;
  onFetchFromDrive?: () => void;
  isFetchingFromDrive?: boolean;
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
  onClose,
  driveData,
  onFetchFromDrive,
  isFetchingFromDrive
}: MonthDetailPanelProps) {
  const docTypes: { type: 'sales' | 'journal' | 'purchase' | 'balanceSheet'; label: string; required: boolean }[] = [
    { type: 'sales', label: 'Sales Register', required: true },
    { type: 'journal', label: 'Journal', required: false },
    { type: 'purchase', label: 'Purchase Register', required: false },
    { type: 'balanceSheet', label: 'Balance Sheet', required: false }
  ];

  return (
    <div className="bg-slate-800 rounded-xl border border-blue-500/50 overflow-hidden">
      {/* Header */}
      <div className="bg-blue-500/20 border-b border-blue-500/30 p-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-100">{periodToString(monthData.period)}</h3>
          <p className="text-blue-400/70 text-sm">
            {monthData.hasData ? 'MIS Generated' : 'Upload documents to generate MIS'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Fetch from Drive button */}
          {driveData && onFetchFromDrive && (
            <button
              onClick={onFetchFromDrive}
              disabled={isFetchingFromDrive}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${isFetchingFromDrive
                  ? 'bg-blue-500/10 text-blue-400/50 cursor-wait'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                }
              `}
            >
              {isFetchingFromDrive ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Fetching...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7.71 3.5L1.15 15l3.43 6h15.84l3.43-6L17.29 3.5H7.71zM15 14h-4v-2h4v2zm0-4h-4V8h4v2z"/>
                  </svg>
                  Fetch from Drive ({driveData.states.length} state{driveData.states.length > 1 ? 's' : ''})
                </>
              )}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Drive States Preview */}
      {driveData && driveData.states.length > 0 && (
        <div className="px-5 py-3 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7.71 3.5L1.15 15l3.43 6h15.84l3.43-6L17.29 3.5H7.71zM15 14h-4v-2h4v2zm0-4h-4V8h4v2z"/>
            </svg>
            <span>Available in Drive:</span>
            {driveData.states.map((state, idx) => (
              <span key={state.code} className="px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-300">
                {STATE_NAMES[state.code] || state.name}
                <span className="text-blue-400/60 ml-1">
                  ({state.files.length} files)
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {/* Document Upload Grid */}
        <div className="mb-5">
          <h4 className="text-xs font-medium text-slate-400 mb-3">
            Upload Documents
            <span className="text-slate-500 ml-2">(or use Fetch from Drive above)</span>
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Document</th>
                  {selectedStates.map(state => (
                    <th key={state} className="text-center py-2 px-3 text-xs font-medium text-slate-500">
                      {INDIAN_STATES.find(s => s.code === state)?.name || state}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docTypes.map(doc => (
                  <tr key={doc.type} className="border-b border-slate-700/50">
                    <td className="py-2.5 px-3">
                      <span className="text-sm text-slate-300">{doc.label}</span>
                      {doc.required && <span className="text-red-400 ml-1">*</span>}
                    </td>
                    {selectedStates.map(state => (
                      <td key={state} className="py-2.5 px-3 text-center">
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
        <div className="flex items-center gap-3">
          {monthData.hasData ? (
            <>
              <button
                onClick={onViewMIS}
                className="flex-1 px-4 py-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors"
              >
                View Report
              </button>
              <button
                onClick={onGenerate}
                disabled={!canGenerate || isGenerating}
                className={`
                  flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${canGenerate && !isGenerating
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                  }
                `}
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Regenerating...
                  </span>
                ) : (
                  'Regenerate'
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onGenerate}
              disabled={!canGenerate || isGenerating}
              className={`
                w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${canGenerate && !isGenerating
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                  : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                }
              `}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </span>
              ) : canGenerate ? (
                `Generate MIS`
              ) : (
                'Upload files to continue'
              )}
            </button>
          )}
        </div>

        {/* Existing MIS Summary */}
        {monthData.hasData && monthData.mis && (
          <div className="mt-5 p-4 bg-slate-700/30 rounded-lg">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-xs text-slate-500">Revenue</div>
                <div className="text-sm font-medium text-slate-200">{formatCurrency(monthData.mis.revenue.netRevenue)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Margin</div>
                <div className="text-sm font-medium text-emerald-400">{formatPercent(monthData.mis.grossMarginPercent)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">CM1</div>
                <div className="text-sm font-medium text-blue-400">{formatPercent(monthData.mis.cm1Percent)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">EBITDA</div>
                <div className={`text-sm font-medium ${monthData.mis.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
        <svg className="animate-spin h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24">
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
            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
            : status === 'uploaded'
            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
            : 'bg-slate-700/50 text-slate-500 hover:bg-slate-700 hover:text-slate-400'
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
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400'
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

export default MISTrackingNew;
