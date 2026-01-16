import React, { useState, useEffect, useMemo } from 'react';
import { FileUploadSection } from '../components/FileUpload';
import { TransactionTable } from '../components/TransactionTable';
import { HeadsPanel } from '../components/HeadsPanel';
import { SearchBar } from '../components/SearchBar';
import { BulkActions } from '../components/BulkActions';
import { MISPreview, MISMiniPreview } from '../components/MISPreview';
import { COGSDisplay } from '../components/COGSDisplay';
import { ExportButton } from '../components/ExportButton';
import { useFileParser } from '../hooks/useFileParser';
import { useClassifications } from '../hooks/useClassifications';
import { generateMISReport } from '../utils/misGenerator';

export function MISCalculator() {
  // File parsing state
  const {
    journalFile,
    balanceSheetFile,
    purchaseFile,
    journalParsed,
    balanceSheetParsed,
    purchaseParsed,
    loading,
    error,
    balanceSheetData,
    cogsData,
    purchaseTotal,
    parseJournal,
    parseBalanceSheet,
    parsePurchase,
    clearError,
    resetAll,
    setCOGSManually,
    setNetSalesManually
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
  const [showMISPreview, setShowMISPreview] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Import transactions when journal is parsed
  useEffect(() => {
    if (journalParsed && transactions.length === 0) {
      // Transactions will be imported by the hook
    }
  }, [journalParsed, transactions.length]);

  // Handle journal file upload
  const handleJournalUpload = async (file: File) => {
    try {
      const parsedTransactions = await parseJournal(file);
      importTransactions(parsedTransactions);
    } catch (error) {
      console.error('Failed to parse journal:', error);
    }
  };

  // Handle balance sheet upload
  const handleBalanceSheetUpload = async (file: File) => {
    try {
      await parseBalanceSheet(file);
    } catch (error) {
      console.error('Failed to parse balance sheet:', error);
    }
  };

  // Handle purchase ledger upload
  const handlePurchaseUpload = async (file: File) => {
    try {
      await parsePurchase(file);
    } catch (error) {
      console.error('Failed to parse purchase ledger:', error);
    }
  };

  // Generate MIS report
  const misReport = useMemo(() => {
    return generateMISReport(transactions, heads, balanceSheetData, purchaseTotal);
  }, [transactions, heads, balanceSheetData, purchaseTotal]);

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
            <button
              onClick={() => setShowMISPreview(true)}
              disabled={transactions.length === 0}
              className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium ${
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

        {/* File Upload Section */}
        <FileUploadSection
          onJournalUpload={handleJournalUpload}
          onBalanceSheetUpload={handleBalanceSheetUpload}
          onPurchaseUpload={handlePurchaseUpload}
          journalParsed={journalParsed}
          balanceSheetParsed={balanceSheetParsed}
          purchaseParsed={purchaseParsed}
          loading={loading}
          journalFile={journalFile}
          balanceSheetFile={balanceSheetFile}
          purchaseFile={purchaseFile}
        />

        {/* Error display */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <span className="text-red-700">{error}</span>
            <button onClick={clearError} className="text-red-500 hover:text-red-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* COGS Display */}
        {(balanceSheetParsed || cogsData) && (
          <div className="mt-4">
            <COGSDisplay
              cogsData={cogsData}
              onManualUpdate={setCOGSManually}
            />
          </div>
        )}

        {/* Balance Sheet Net Sales indicator */}
        {balanceSheetData && balanceSheetData.netSales > 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-800">
              <strong>Net Sales from Balance Sheet:</strong> ₹{balanceSheetData.netSales.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </span>
            <button
              onClick={() => {
                const value = prompt('Enter Net Sales manually:', balanceSheetData.netSales.toString());
                if (value) setNetSalesManually(parseFloat(value));
              }}
              className="ml-auto text-sm text-green-600 hover:text-green-800"
            >
              Edit
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

          {/* Right: Heads Panel & MIS Preview */}
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

              {/* Mini MIS Preview */}
              <div className="p-4 border-t border-gray-200">
                <MISMiniPreview report={misReport} />
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
              for Net Sales & COGS calculation, and a Purchase Ledger for validation.
            </p>
            <div className="mt-6 p-4 bg-blue-50 rounded-lg text-left">
              <h4 className="text-sm font-medium text-blue-900 mb-2">Workflow:</h4>
              <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                <li>Upload Balance Sheet PDF (for authoritative Revenue & COGS)</li>
                <li>Upload Journal Vouchers Excel (for expense classification)</li>
                <li>Optionally upload Purchase Ledger (for validation)</li>
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
        isVisible={showMISPreview}
        onClose={() => setShowMISPreview(false)}
      />
    </div>
  );
}
