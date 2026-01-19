import React, { useState } from 'react';
import { XMarkIcon, ArrowRightIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { MISHead, TransactionRef, LearnedPattern } from '../../types/misTracking';
import { MIS_HEADS_CONFIG } from '../../utils/misClassifier';
import { formatCurrencyFull } from '../../utils/misCalculator';
import { saveLearnedPattern } from '../../utils/googleSheetsStorage';

interface ReclassifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionRef | null;
  currentHead: MISHead;
  currentSubhead: string;
  onReclassify: (transactionId: string, newHead: MISHead, newSubhead: string, createRule: boolean, pattern?: string, matchType?: 'exact' | 'contains' | 'regex') => Promise<void>;
}

type MatchType = 'exact' | 'contains' | 'regex';

export function ReclassifyModal({
  isOpen,
  onClose,
  transaction,
  currentHead,
  currentSubhead,
  onReclassify
}: ReclassifyModalProps) {
  const [selectedHead, setSelectedHead] = useState<MISHead>(currentHead);
  const [selectedSubhead, setSelectedSubhead] = useState<string>(currentSubhead);
  const [createRule, setCreateRule] = useState(true);
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('contains');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens with new transaction
  React.useEffect(() => {
    if (transaction) {
      setSelectedHead(currentHead);
      setSelectedSubhead(currentSubhead);
      setCreateRule(true);
      // Extract a reasonable default pattern from account name
      const defaultPattern = extractDefaultPattern(transaction.account);
      setPattern(defaultPattern);
      setMatchType('contains');
      setError(null);
    }
  }, [transaction, currentHead, currentSubhead]);

  if (!isOpen || !transaction) return null;

  const headOptions = Object.entries(MIS_HEADS_CONFIG).map(([head, config]) => ({
    head: head as MISHead,
    subheads: config.subheads,
    type: config.type
  }));

  const availableSubheads = headOptions.find(h => h.head === selectedHead)?.subheads || [];

  const handleHeadChange = (newHead: MISHead) => {
    setSelectedHead(newHead);
    const headConfig = headOptions.find(h => h.head === newHead);
    if (headConfig && headConfig.subheads.length > 0) {
      setSelectedSubhead(headConfig.subheads[0]);
    } else {
      setSelectedSubhead('');
    }
  };

  const handleSubmit = async () => {
    if (!selectedHead || !selectedSubhead) {
      setError('Please select both a head and subhead');
      return;
    }

    if (createRule && !pattern.trim()) {
      setError('Please enter a pattern for the rule');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onReclassify(
        transaction.id,
        selectedHead,
        selectedSubhead,
        createRule,
        createRule ? pattern.trim() : undefined,
        createRule ? matchType : undefined
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reclassify transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isChanged = selectedHead !== currentHead || selectedSubhead !== currentSubhead;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-xl w-full border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-slate-100">Reclassify Transaction</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-full transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Transaction Info */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Transaction</p>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Account:</span>
                <span className="text-slate-200 font-mono text-sm">{transaction.account}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Amount:</span>
                <span className="text-slate-200 font-mono">{formatCurrencyFull(transaction.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date:</span>
                <span className="text-slate-200">{transaction.date || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Classification Change */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Change Classification</p>

            {/* From -> To Display */}
            <div className="flex items-center gap-3 mb-4 text-sm">
              <div className="flex-1 p-2 bg-red-900/30 rounded border border-red-700">
                <p className="text-red-400 text-xs">From</p>
                <p className="text-slate-200 font-medium">{currentHead}</p>
                <p className="text-slate-400 text-xs">{currentSubhead}</p>
              </div>
              <ArrowRightIcon className="h-5 w-5 text-slate-500 flex-shrink-0" />
              <div className="flex-1 p-2 bg-green-900/30 rounded border border-green-700">
                <p className="text-green-400 text-xs">To</p>
                <p className="text-slate-200 font-medium">{selectedHead}</p>
                <p className="text-slate-400 text-xs">{selectedSubhead || '(select subhead)'}</p>
              </div>
            </div>

            {/* Head Selection */}
            <div className="mb-4">
              <label className="block text-sm text-slate-400 mb-2">Head</label>
              <select
                value={selectedHead}
                onChange={(e) => handleHeadChange(e.target.value as MISHead)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
              >
                {headOptions.map(({ head, type }) => (
                  <option key={head} value={head}>
                    {head} {type === 'ignore' && '(Non-P&L)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Subhead Selection */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">Subhead</label>
              <select
                value={selectedSubhead}
                onChange={(e) => setSelectedSubhead(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="">Select subhead...</option>
                {availableSubheads.map((subhead) => (
                  <option key={subhead} value={subhead}>
                    {subhead}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Create Rule Option */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={createRule}
                onChange={(e) => setCreateRule(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500"
              />
              <span className="text-slate-200">Create rule for similar transactions</span>
            </label>

            {createRule && (
              <div className="space-y-4 pl-7">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Pattern to match</label>
                  <input
                    type="text"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder="Enter pattern..."
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Future transactions matching this pattern will be auto-classified
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Match type</label>
                  <div className="flex gap-3">
                    {(['contains', 'exact', 'regex'] as MatchType[]).map((type) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="matchType"
                          value={type}
                          checked={matchType === type}
                          onChange={() => setMatchType(type)}
                          className="h-4 w-4 border-slate-600 bg-slate-900 text-teal-500 focus:ring-teal-500"
                        />
                        <span className="text-sm text-slate-300 capitalize">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Warning */}
          {createRule && (
            <div className="flex items-start gap-3 p-3 bg-amber-900/20 rounded-lg border border-amber-700/50">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-amber-200 font-medium">This will create a new classification rule</p>
                <p className="text-amber-400/80 text-xs mt-1">
                  The rule will affect future MIS calculations. You can manage rules on the Rules page.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900/30 rounded-lg border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-900/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-slate-100 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isChanged || isSubmitting || !selectedSubhead}
            className={`
              px-4 py-2 rounded-lg flex items-center gap-2 transition-colors
              ${isChanged && selectedSubhead
                ? 'bg-teal-600 hover:bg-teal-500 text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
            `}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin">...</span>
                Processing...
              </>
            ) : (
              <>
                <CheckIcon className="h-4 w-4" />
                {createRule ? 'Apply & Create Rule' : 'Apply Change'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper to extract a reasonable default pattern from account name
function extractDefaultPattern(accountName: string): string {
  // Remove common prefixes/suffixes and get core identifier
  const cleaned = accountName
    .replace(/^(Dr\.|Cr\.|A\/c|Account)\s*/i, '')
    .replace(/\s*(A\/c|Account|Dr\.|Cr\.)$/i, '')
    .trim();

  // If account has a colon (like "Category: Subcategory"), take the last part
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    return parts[parts.length - 1].trim();
  }

  // If account has a dash, take the most specific part (usually last)
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    return parts[parts.length - 1].trim();
  }

  // Otherwise return first 2-3 words as pattern
  const words = cleaned.split(/\s+/);
  if (words.length > 3) {
    return words.slice(0, 3).join(' ');
  }

  return cleaned;
}
