import React, { useState, useEffect, useMemo } from 'react';
import { FileUploadSection } from '../components/FileUpload';
import { TransactionTable } from '../components/TransactionTable';
import { HeadsPanel } from '../components/HeadsPanel';
import { SearchBar } from '../components/SearchBar';
import { BulkActions } from '../components/BulkActions';
import { MISPreview } from '../components/MISPreview';
import { ExportButton } from '../components/ExportButton';
import { StateSelector, StateFileSummary } from '../components/StateSelector';
import { SalesVerification } from '../components/SalesVerification';
import { useFileParser } from '../hooks/useFileParser';
import { useClassifications } from '../hooks/useClassifications';
import { generateMISReport } from '../utils/misGenerator';
import { IndianState, INDIAN_STATES, SalesLineItem } from '../types';

export function MISCalculator() {
  // File parsing state
  const {
    journalFile,
    balanceSheetFile,
    purchaseFile,
    salesFile,
    journalParsed,
    balanceSheetParsed,
    purchaseParsed,
    salesParsed,
    loading,
    error,
    balanceSheetData,
    cogsData,
    purchaseTotal,
    salesData,
    parseJournal,
    parseBalanceSheet,
    parsePurchase,
    parseSales,
    clearError,
    resetAll,
    setCOGSManually,
    setNetSalesManually,
    // Multi-state
    multiState,
    toggleState,
    setActiveState,
    parseJournalForState,
    parseBalanceSheetForState,
    parsePurchaseForState,
    parseSalesForState,
    getAggregatedData,
    getStateFileStatus,
    // Sales verification
    updateSalesLineItem,
    getSalesLineItems
  } = useFileParser();

  // Classification state
  const {
    transactions,
    filteredTransactions,
    heads,
    selectedIds,
    filter,
    progress,
    stats,
    undoStack,
    setFilter,
    setSelectedIds,
    importTransactions,
    classifyTransaction,
    classifyMultiple,
    applySuggestion,
    applyToSimilar,
    addHead,
    addSubhead,
    saveToStorage,
    undo
  } = useClassifications();

  // UI state
  const [activeHead, setActiveHead] = useState<string | null>(null);
  const [showMISReport, setShowMISReport] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSalesVerification, setShowSalesVerification] = useState<IndianState | null>(null);

  // Check if we're in multi-state mode
  const isMultiStateMode = multiState.selectedStates.length > 0;

  // Import transactions when journal is parsed (single mode)
  useEffect(() => {
    if (journalParsed && transactions.length === 0) {
      // Transactions will be imported by the hook
    }
  }, [journalParsed, transactions.length]);

  // Import transactions from multi-state mode
  useEffect(() => {
    if (isMultiStateMode) {
      const aggregated = getAggregatedData();
      if (aggregated.transactions.length > 0 && transactions.length === 0) {
        importTransactions(aggregated.transactions);
      }
    }
  }, [isMultiStateMode, multiState.stateData, getAggregatedData, importTransactions, transactions.length]);

  // Handle journal file upload (single mode)
  const handleJournalUpload = async (file: File) => {
    try {
      const parsedTransactions = await parseJournal(file);
      importTransactions(parsedTransactions);
    } catch (error) {
      console.error('Failed to parse journal:', error);
    }
  };

  // Handle balance sheet upload (single mode)
  const handleBalanceSheetUpload = async (file: File) => {
    try {
      await parseBalanceSheet(file);
    } catch (error) {
      console.error('Failed to parse balance sheet:', error);
    }
  };

  // Handle purchase ledger upload (single mode)
  const handlePurchaseUpload = async (file: File) => {
    try {
      await parsePurchase(file);
    } catch (error) {
      console.error('Failed to parse purchase ledger:', error);
    }
  };

  // Handle sales register upload (single mode)
  const handleSalesUpload = async (file: File) => {
    try {
      await parseSales(file);
    } catch (error) {
      console.error('Failed to parse sales register:', error);
    }
  };

  // Multi-state file upload handlers
  const handleStateJournalUpload = async (file: File) => {
    if (!multiState.activeState) return;
    try {
      const parsedTransactions = await parseJournalForState(file, multiState.activeState);
      // Aggregate and import all transactions
      const aggregated = getAggregatedData();
      importTransactions(aggregated.transactions);
    } catch (error) {
      console.error('Failed to parse journal for state:', error);
    }
  };

  const handleStateBalanceSheetUpload = async (file: File) => {
    if (!multiState.activeState) return;
    try {
      await parseBalanceSheetForState(file, multiState.activeState);
    } catch (error) {
      console.error('Failed to parse balance sheet for state:', error);
    }
  };

  const handleStatePurchaseUpload = async (file: File) => {
    if (!multiState.activeState) return;
    try {
      await parsePurchaseForState(file, multiState.activeState);
    } catch (error) {
      console.error('Failed to parse purchase ledger for state:', error);
    }
  };

  const handleStateSalesUpload = async (file: File) => {
    if (!multiState.activeState) return;
    try {
      await parseSalesForState(file, multiState.activeState);
    } catch (error) {
      console.error('Failed to parse sales register for state:', error);
    }
  };

  // Get current state data for file upload section
  const getCurrentStateData = () => {
    if (!multiState.activeState) return null;
    return multiState.stateData[multiState.activeState];
  };

  const currentStateData = getCurrentStateData();
  const activeStateName = multiState.activeState
    ? INDIAN_STATES.find(s => s.code === multiState.activeState)?.name
    : undefined;

  // Generate MIS report
  const misReport = useMemo(() => {
    // In multi-state mode, use aggregated sales revenue data
    const salesRevenueData = isMultiStateMode ? getAggregatedData().revenueData : null;
    return generateMISReport(transactions, heads, balanceSheetData, purchaseTotal, salesRevenueData);
  }, [transactions, heads, balanceSheetData, purchaseTotal, isMultiStateMode, getAggregatedData]);

  // Filter by head when panel is clicked
  useEffect(() => {
    if (activeHead) {
      setFilter(prev => ({ ...prev, head: activeHead }));
    } else {
      setFilter(prev => ({ ...prev, head: null }));
    }
  }, [activeHead, setFilter]);

  // Check if any selected transactions have suggestions
  const hasSelectedWithSuggestions = useMemo(() => {
    return filteredTransactions.some(
      t => selectedIds.includes(t.id) && t.suggestedHead && t.suggestedSubhead
    );
  }, [filteredTransactions, selectedIds]);

  // Apply all suggestions to selected transactions
  const applyAllSuggestions = () => {
    const toApply = filteredTransactions.filter(
      t => selectedIds.includes(t.id) && t.suggestedHead && t.suggestedSubhead
    );
    toApply.forEach(t => applySuggestion(t.id));
    setSelectedIds([]);
  };

  // Reset everything
  const handleReset = () => {
    resetAll();
    window.location.reload();
  };

  // Save periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (transactions.length > 0) {
        saveToStorage();
      }
    }, 30000); // Save every 30 seconds

    return () => clearInterval(interval);
  }, [transactions, saveToStorage]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveToStorage();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, saveToStorage]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MIS Calculator</h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload files, classify transactions, and generate P&L MIS reports
            </p>
          </div>
          <div className="flex items-center gap-3">
            {undoStack.length > 0 && (
              <button
                onClick={undo}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                title="Undo (Ctrl+Z)"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Undo
              </button>
            )}
            <button
              onClick={() => saveToStorage()}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              title="Save (Ctrl+S)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save
            </button>
            {/* View MIS Report Button */}
            <button
              onClick={() => setShowMISReport(true)}
              disabled={transactions.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                transactions.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View MIS Report
            </button>
            <ExportButton
              transactions={transactions}
              misReport={misReport}
              heads={heads}
              disabled={transactions.length === 0}
            />
            <button
              onClick={handleReset}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
            >
              Reset All
            </button>
          </div>
        </div>

        {/* State Selection */}
        <div className="mb-4">
          <StateSelector
            selectedStates={multiState.selectedStates}
            onStateToggle={toggleState}
            activeState={multiState.activeState}
            onActiveStateChange={setActiveState}
          />
        </div>

        {/* State File Summary (when states are selected) */}
        {isMultiStateMode && (
          <StateFileSummary
            selectedStates={multiState.selectedStates}
            getStateFileStatus={getStateFileStatus}
          />
        )}

        {/* File Upload Section */}
        <div className="mt-4">
          {isMultiStateMode && multiState.activeState ? (
            // Multi-state mode - show file uploads for active state
            <FileUploadSection
              onJournalUpload={handleStateJournalUpload}
              onBalanceSheetUpload={handleStateBalanceSheetUpload}
              onPurchaseUpload={handleStatePurchaseUpload}
              onSalesUpload={handleStateSalesUpload}
              journalParsed={currentStateData?.journalParsed || false}
              balanceSheetParsed={currentStateData?.balanceSheetParsed || false}
              purchaseParsed={currentStateData?.purchaseParsed || false}
              salesParsed={currentStateData?.salesParsed || false}
              loading={multiState.loading}
              journalFile={currentStateData?.journalFile}
              balanceSheetFile={currentStateData?.balanceSheetFile}
              purchaseFile={currentStateData?.purchaseFile}
              salesFile={currentStateData?.salesFile}
              stateLabel={activeStateName}
            />
          ) : !isMultiStateMode ? (
            // Single mode - show regular file uploads
            <FileUploadSection
              onJournalUpload={handleJournalUpload}
              onBalanceSheetUpload={handleBalanceSheetUpload}
              onPurchaseUpload={handlePurchaseUpload}
              onSalesUpload={handleSalesUpload}
              journalParsed={journalParsed}
              balanceSheetParsed={balanceSheetParsed}
              purchaseParsed={purchaseParsed}
              salesParsed={salesParsed}
              loading={loading}
              journalFile={journalFile}
              balanceSheetFile={balanceSheetFile}
              purchaseFile={purchaseFile}
              salesFile={salesFile}
            />
          ) : (
            // Multi-state mode but no active state selected
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              Select a state tab above to upload files for that state.
            </div>
          )}
        </div>

        {/* Error display */}
        {(error || multiState.error) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <span className="text-red-700">{error || multiState.error}</span>
            <button onClick={clearError} className="text-red-500 hover:text-red-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}


      </div>

      {/* Main Content Area */}
      {transactions.length > 0 ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Transaction Table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search and Filter Bar */}
            <SearchBar
              filter={filter}
              onFilterChange={setFilter}
              progress={progress}
              stats={stats}
              heads={heads}
            />

            {/* Bulk Actions Bar */}
            <BulkActions
              selectedCount={selectedIds.length}
              onClassify={(head, subhead) => classifyMultiple(selectedIds, head, subhead)}
              onClearSelection={() => setSelectedIds([])}
              onApplyAllSuggestions={applyAllSuggestions}
              heads={heads}
              hasSelectedWithSuggestions={hasSelectedWithSuggestions}
            />

            {/* Transaction Table */}
            <TransactionTable
              transactions={filteredTransactions}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onClassify={classifyTransaction}
              onApplySuggestion={applySuggestion}
              onApplyToSimilar={applyToSimilar}
              heads={heads}
            />
          </div>

          {/* Right: Heads Panel */}
          {showSidebar && (
            <div className="w-80 flex flex-col border-l border-gray-200 bg-white">
              {/* Heads Panel */}
              <div className="flex-1 overflow-hidden">
                <HeadsPanel
                  heads={heads}
                  transactions={transactions}
                  onAddHead={addHead}
                  onAddSubhead={addSubhead}
                  onHeadClick={setActiveHead}
                  activeHead={activeHead}
                />
              </div>

              {/* Mini Summary - always visible */}
              <div className="p-4 border-t border-gray-200 bg-gradient-to-b from-gray-50 to-white">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  P&L Summary
                  {balanceSheetData && balanceSheetData.netSales > 0 && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">BS Data</span>
                  )}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Net Revenue</span>
                    <span className="font-mono font-medium text-green-600">
                      ₹{misReport.netRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">COGS</span>
                    <span className="font-mono font-medium text-red-600">
                      ₹{misReport.cogm.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Gross Margin</span>
                    <span className="font-mono font-medium text-blue-600">
                      ₹{misReport.grossMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">EBITDA</span>
                    <span className={`font-mono font-medium ${misReport.ebitda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₹{misReport.ebitda.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-700 font-medium">Net Income</span>
                    <span className={`font-mono font-semibold ${misReport.netIncome >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      ₹{misReport.netIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="absolute right-0 top-1/2 transform translate-x-0 -translate-y-1/2 bg-white border border-gray-200 rounded-l-lg p-1 shadow-md z-10"
            style={{ right: showSidebar ? '320px' : '0' }}
          >
            <svg
              className={`h-4 w-4 text-gray-500 transform transition-transform ${showSidebar ? '' : 'rotate-180'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No transactions loaded</h3>
            <p className="mt-2 text-sm text-gray-500">
              Upload a Journal Vouchers Excel file to get started. You can also upload a Balance Sheet PDF
              for Net Sales & COGS calculation, a Purchase Ledger for validation, and a Sales Register for sales data.
            </p>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg text-left">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Workflow:</h4>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>Optionally select states for multi-state reporting</li>
                <li>Upload Balance Sheet PDF (for authoritative Revenue & COGS)</li>
                <li>Upload Journal Vouchers Excel (for expense classification)</li>
                <li>Optionally upload Purchase Ledger (for validation)</li>
                <li>Optionally upload Sales Register (for sales data)</li>
                <li>Classify transactions using the heads panel</li>
                <li>Review and export your MIS report</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* MIS Preview Modal */}
      <MISPreview
        report={misReport}
        isVisible={showMISReport}
        onClose={() => setShowMISReport(false)}
      />

      {/* Sales Verification Modal */}
      {showSalesVerification && (
        <SalesVerification
          lineItems={getSalesLineItems(showSalesVerification)}
          onUpdateItem={(itemId, newChannel) => updateSalesLineItem(showSalesVerification, itemId, newChannel)}
          onClose={() => setShowSalesVerification(null)}
          stateName={INDIAN_STATES.find(s => s.code === showSalesVerification)?.name}
        />
      )}

      {/* MIS Report Modal */}
      {showMISReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <h2 className="text-xl font-bold text-blue-900">MIS Report</h2>
                  <p className="text-sm text-blue-700">Review line items and reassign classifications</p>
                </div>
              </div>
              <button
                onClick={() => setShowMISReport(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <MISReportTable
                transactions={transactions}
                heads={heads}
                report={misReport}
                activeHead={activeHead}
                onReassignTransactions={(txnIds, head, subhead) => classifyMultiple(txnIds, head, subhead)}
                revenueData={isMultiStateMode ? getAggregatedData().revenueData : undefined}
                salesByChannel={isMultiStateMode ? getAggregatedData().salesByChannel : undefined}
                onStateClick={(state) => setShowSalesVerification(state)}
                getSalesLineItemsCount={(state) => getSalesLineItems(state).length}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
