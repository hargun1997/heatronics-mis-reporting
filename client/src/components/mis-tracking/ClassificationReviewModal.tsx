import React, { useState } from 'react';
import { ClassifiedTransaction, MISHead, LearnedPattern } from '../../types/misTracking';
import { MIS_HEADS_CONFIG, getHeadOptions } from '../../utils/misClassifier';
import { saveLearnedPattern } from '../../utils/googleSheetsStorage';

interface ClassificationReviewModalProps {
  transactions: ClassifiedTransaction[];
  unclassifiedCount: number;
  onClose: () => void;
  onSave: (transactions: ClassifiedTransaction[]) => Promise<void>;
}

export function ClassificationReviewModal({
  transactions,
  unclassifiedCount,
  onClose,
  onSave
}: ClassificationReviewModalProps) {
  const [localTransactions, setLocalTransactions] = useState(transactions);
  const [filter, setFilter] = useState<'all' | 'unclassified' | 'low-confidence'>('unclassified');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const headOptions = getHeadOptions();

  // Filter transactions
  const filteredTransactions = localTransactions.filter(t => {
    // Search filter
    if (searchTerm && !t.account.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Status filter
    if (filter === 'unclassified' && t.status !== 'unclassified') {
      return false;
    }
    if (filter === 'low-confidence' && t.confidence !== 'low') {
      return false;
    }

    return true;
  });

  // Stats
  const classifiedCount = localTransactions.filter(t => t.status !== 'unclassified').length;
  const lowConfidenceCount = localTransactions.filter(t => t.confidence === 'low').length;

  const handleClassificationChange = (
    transactionId: string,
    head: MISHead,
    subhead: string,
    rememberPattern: boolean
  ) => {
    setLocalTransactions(prev => prev.map(t => {
      if (t.id === transactionId) {
        return {
          ...t,
          misHead: head,
          misSubhead: subhead,
          status: 'classified' as const,
          isAutoClassified: false,
          confidence: 'high' as const
        };
      }
      return t;
    }));

    // Save pattern if requested
    if (rememberPattern) {
      const transaction = localTransactions.find(t => t.id === transactionId);
      if (transaction) {
        const pattern: LearnedPattern = {
          id: `user_${Date.now()}`,
          pattern: extractPattern(transaction.account),
          head,
          subhead,
          createdAt: new Date().toISOString(),
          source: 'user'
        };
        saveLearnedPattern(pattern);
      }
    }
  };

  const extractPattern = (accountName: string): string => {
    // Extract a reasonable pattern from the account name
    // Remove common suffixes and numbers
    return accountName
      .replace(/\d+/g, '')
      .replace(/[()]/g, '')
      .trim()
      .toUpperCase();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localTransactions);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Review Classifications</h2>
              <p className="text-gray-600 mt-1">
                Review and correct auto-classified transactions
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-4">
            <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm">
              Classified: {classifiedCount}
            </div>
            <div className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm">
              Unclassified: {unclassifiedCount}
            </div>
            {lowConfidenceCount > 0 && (
              <div className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-sm">
                Low Confidence: {lowConfidenceCount}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4 mt-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">All Transactions</option>
              <option value="unclassified">Unclassified Only</option>
              <option value="low-confidence">Low Confidence</option>
            </select>

            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-auto p-6">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No transactions match your filter
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.slice(0, 50).map(transaction => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  headOptions={headOptions}
                  onClassificationChange={handleClassificationChange}
                />
              ))}
              {filteredTransactions.length > 50 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  Showing first 50 of {filteredTransactions.length} transactions
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isSaving ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// TRANSACTION ROW COMPONENT
// ============================================

interface TransactionRowProps {
  transaction: ClassifiedTransaction;
  headOptions: { head: MISHead; subheads: string[] }[];
  onClassificationChange: (id: string, head: MISHead, subhead: string, remember: boolean) => void;
}

function TransactionRow({ transaction, headOptions, onClassificationChange }: TransactionRowProps) {
  const [selectedHead, setSelectedHead] = useState<MISHead>(transaction.misHead);
  const [selectedSubhead, setSelectedSubhead] = useState(transaction.misSubhead);
  const [rememberPattern, setRememberPattern] = useState(false);
  const [isEditing, setIsEditing] = useState(transaction.status === 'unclassified');

  const currentHeadConfig = headOptions.find(h => h.head === selectedHead);
  const subheads = currentHeadConfig?.subheads || [];

  const handleHeadChange = (head: MISHead) => {
    setSelectedHead(head);
    const newConfig = headOptions.find(h => h.head === head);
    if (newConfig && newConfig.subheads.length > 0) {
      setSelectedSubhead(newConfig.subheads[0]);
    }
  };

  const handleApply = () => {
    onClassificationChange(transaction.id, selectedHead, selectedSubhead, rememberPattern);
    setIsEditing(false);
  };

  const amount = transaction.debit || transaction.credit || 0;

  return (
    <div className={`
      border rounded-lg p-4 transition-all
      ${transaction.status === 'unclassified'
        ? 'border-yellow-300 bg-yellow-50'
        : transaction.confidence === 'low'
        ? 'border-orange-300 bg-orange-50'
        : 'border-gray-200 bg-white'
      }
    `}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-medium text-gray-800">{transaction.account}</div>
          <div className="text-sm text-gray-500 mt-1">
            {transaction.date} | {transaction.vchBillNo} | {transaction.state}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-gray-800">
            {transaction.debit > 0 ? `₹${amount.toLocaleString('en-IN')} Dr` : `₹${amount.toLocaleString('en-IN')} Cr`}
          </div>
          {!isEditing && (
            <div className={`
              text-sm mt-1 px-2 py-0.5 rounded inline-block
              ${transaction.status === 'classified' ? 'bg-green-100 text-green-700' : ''}
              ${transaction.status === 'suggested' ? 'bg-blue-100 text-blue-700' : ''}
              ${transaction.status === 'unclassified' ? 'bg-yellow-100 text-yellow-700' : ''}
            `}>
              {transaction.misSubhead || 'Unclassified'}
            </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Head</label>
              <select
                value={selectedHead}
                onChange={(e) => handleHeadChange(e.target.value as MISHead)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {headOptions.map(option => (
                  <option key={option.head} value={option.head}>{option.head}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Subhead</label>
              <select
                value={selectedSubhead}
                onChange={(e) => setSelectedSubhead(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {subheads.map(subhead => (
                  <option key={subhead} value={subhead}>{subhead}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={rememberPattern}
                onChange={(e) => setRememberPattern(e.target.checked)}
                className="mr-2"
              />
              Remember this pattern for future
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {transaction.isAutoClassified ? (
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Auto-classified ({transaction.confidence})
              </span>
            ) : (
              <span className="flex items-center">
                <svg className="w-4 h-4 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Manually classified
              </span>
            )}
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
}
