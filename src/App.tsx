import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { FileUploadSection } from './components/FileUpload';
import { COGSDisplay } from './components/COGSDisplay';
import { SearchBar } from './components/SearchBar';
import { TransactionTable } from './components/TransactionTable';
import { HeadsPanel } from './components/HeadsPanel';
import { MISPreview, MISMiniPreview } from './components/MISPreview';
import { ExportButton } from './components/ExportButton';
import { BulkActions } from './components/BulkActions';
import { useFileParser } from './hooks/useFileParser';
import { useClassifications } from './hooks/useClassifications';
import { generateMISReport } from './utils/misGenerator';

function App() {
  const fileParser = useFileParser();
  const classifications = useClassifications();
  const [showMISPreview, setShowMISPreview] = useState(false);

  // Import transactions when journal is parsed
  useEffect(() => {
    if (fileParser.transactions.length > 0) {
      classifications.importTransactions(fileParser.transactions);
    }
  }, [fileParser.transactions]);

  // Generate MIS report from classified transactions
  const misReport = useMemo(() => {
    return generateMISReport(classifications.transactions, classifications.heads);
  }, [classifications.transactions, classifications.heads]);

  // Handle bulk apply suggestions
  const handleApplyAllSuggestions = useCallback(() => {
    const selectedWithSuggestions = classifications.filteredTransactions
      .filter(t => classifications.selectedIds.includes(t.id) && t.suggestedHead && t.suggestedSubhead);

    selectedWithSuggestions.forEach(t => {
      classifications.applySuggestion(t.id);
    });
  }, [classifications]);

  // Check if any selected transactions have suggestions
  const hasSelectedWithSuggestions = useMemo(() => {
    return classifications.filteredTransactions.some(
      t => classifications.selectedIds.includes(t.id) && t.suggestedHead && t.suggestedSubhead
    );
  }, [classifications.filteredTransactions, classifications.selectedIds]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        classifications.saveToStorage();
      }
      // Ctrl+Z to undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        classifications.undo();
      }
      // Escape to clear selection
      if (e.key === 'Escape') {
        classifications.setSelectedIds([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [classifications]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">MIS Classification Tool</h1>
              <p className="text-sm text-gray-500">Classify journal entries for P&L reporting</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Action buttons */}
              <button
                onClick={() => setShowMISPreview(true)}
                disabled={classifications.transactions.length === 0}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2
                  ${classifications.transactions.length === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                  }
                `}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View MIS Report
              </button>

              <ExportButton
                transactions={classifications.transactions}
                misReport={misReport}
                heads={classifications.heads}
                disabled={classifications.transactions.length === 0}
              />

              <button
                onClick={classifications.saveToStorage}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save
              </button>

              {classifications.undoStack.length > 0 && (
                <button
                  onClick={classifications.undo}
                  className="px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                  title="Undo (Ctrl+Z)"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* File Upload Section */}
          <div className="mt-4 flex items-start gap-6">
            <FileUploadSection
              onJournalUpload={fileParser.parseJournal}
              onBalanceSheetUpload={fileParser.parseBalanceSheet}
              onPurchaseUpload={fileParser.parsePurchase}
              journalParsed={fileParser.journalParsed}
              balanceSheetParsed={fileParser.balanceSheetParsed}
              purchaseParsed={fileParser.purchaseParsed}
              loading={fileParser.loading}
              journalFile={fileParser.journalFile}
              balanceSheetFile={fileParser.balanceSheetFile}
              purchaseFile={fileParser.purchaseFile}
            />

            <div className="flex-1">
              <COGSDisplay
                cogsData={fileParser.cogsData}
                onManualUpdate={fileParser.setCOGSManually}
              />
            </div>
          </div>

          {/* Error display */}
          {fileParser.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">{fileParser.error}</span>
              </div>
              <button
                onClick={fileParser.clearError}
                className="text-red-500 hover:text-red-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search and filters */}
        {classifications.transactions.length > 0 && (
          <SearchBar
            filter={classifications.filter}
            onFilterChange={classifications.setFilter}
            progress={classifications.progress}
            stats={classifications.stats}
            heads={classifications.heads}
          />
        )}

        {/* Bulk actions bar */}
        {classifications.selectedIds.length > 0 && (
          <BulkActions
            selectedCount={classifications.selectedIds.length}
            onClassify={(head, subhead) => classifications.classifyMultiple(classifications.selectedIds, head, subhead)}
            onClearSelection={() => classifications.setSelectedIds([])}
            onApplyAllSuggestions={handleApplyAllSuggestions}
            heads={classifications.heads}
            hasSelectedWithSuggestions={hasSelectedWithSuggestions}
          />
        )}

        {/* Main split view */}
        <div className="flex-1 flex overflow-hidden">
          {/* Transaction table (left 70%) */}
          <div className="flex-1 flex flex-col overflow-hidden" style={{ flex: '0 0 70%' }}>
            <TransactionTable
              transactions={classifications.filteredTransactions}
              selectedIds={classifications.selectedIds}
              onSelectionChange={classifications.setSelectedIds}
              onClassify={classifications.classifyTransaction}
              onApplySuggestion={classifications.applySuggestion}
              onApplyToSimilar={classifications.applyToSimilar}
              heads={classifications.heads}
            />
          </div>

          {/* Heads panel (right 30%) */}
          <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
            <HeadsPanel
              heads={classifications.heads}
              transactions={classifications.transactions}
              onAddHead={classifications.addHead}
              onAddSubhead={classifications.addSubhead}
              onHeadClick={(head) => classifications.setFilter({ ...classifications.filter, head })}
              activeHead={classifications.filter.head}
            />

            {/* Mini P&L preview */}
            {classifications.transactions.length > 0 && classifications.progress > 0 && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <MISMiniPreview report={misReport} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MIS Preview Modal */}
      <MISPreview
        report={misReport}
        isVisible={showMISPreview}
        onClose={() => setShowMISPreview(false)}
      />

      {/* Keyboard shortcuts hint */}
      <div className="fixed bottom-4 left-4 text-xs text-gray-400">
        <span>Ctrl+S: Save</span>
        <span className="mx-2">|</span>
        <span>Ctrl+Z: Undo</span>
        <span className="mx-2">|</span>
        <span>Esc: Clear selection</span>
      </div>
    </div>
  );
}

export default App;
