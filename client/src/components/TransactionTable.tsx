import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Transaction, Heads, Classification } from '../types';
import { formatCurrency } from '../utils/cogsCalculator';
import { HEAD_COLORS, HEAD_ORDER } from '../data/defaultHeads';

interface ClassificationDropdownProps {
  value: Classification | null;
  suggestion: Classification | null;
  heads: Heads;
  onChange: (classification: Classification) => void;
  onApplySuggestion?: () => void;
}

function ClassificationDropdown({
  value,
  suggestion,
  heads,
  onChange,
  onApplySuggestion
}: ClassificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build flat list of all options
  const allOptions = useMemo(() => {
    const options: { head: string; subhead: string; display: string }[] = [];
    HEAD_ORDER.forEach(head => {
      if (heads[head]) {
        heads[head].subheads.forEach(subhead => {
          options.push({
            head,
            subhead,
            display: `${head} > ${subhead}`
          });
        });
      }
    });
    return options;
  }, [heads]);

  // Filter options based on search
  const filteredOptions = useMemo(() => {
    if (!search) return allOptions;
    const searchLower = search.toLowerCase();
    return allOptions.filter(opt =>
      opt.display.toLowerCase().includes(searchLower)
    );
  }, [allOptions, search]);

  const handleSelect = (head: string, subhead: string) => {
    onChange({ head, subhead });
    setIsOpen(false);
    setSearch('');
  };

  const displayValue = value
    ? `${value.head} > ${value.subhead}`
    : suggestion
      ? `[Suggested] ${suggestion.head} > ${suggestion.subhead}`
      : 'Select classification...';

  const colorClass = value
    ? HEAD_COLORS[value.head] || 'bg-gray-100 text-gray-800'
    : suggestion
      ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
      : 'bg-white text-gray-500';

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`
          px-2 py-1 rounded border cursor-pointer text-xs truncate max-w-[250px]
          ${colorClass}
          ${isOpen ? 'ring-2 ring-blue-500' : ''}
        `}
      >
        {displayValue}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type to search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredOptions.length > 0) {
                  handleSelect(filteredOptions[0].head, filteredOptions[0].subhead);
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                }
              }}
            />
          </div>

          {suggestion && !value && (
            <div
              onClick={() => {
                if (onApplySuggestion) onApplySuggestion();
                setIsOpen(false);
              }}
              className="px-3 py-2 bg-yellow-50 border-b border-yellow-100 cursor-pointer hover:bg-yellow-100"
            >
              <div className="text-xs text-yellow-600 font-medium">Apply suggestion:</div>
              <div className="text-sm text-yellow-800">{suggestion.head} &gt; {suggestion.subhead}</div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.map((opt, idx) => (
              <div
                key={`${opt.head}-${opt.subhead}`}
                onClick={() => handleSelect(opt.head, opt.subhead)}
                className={`
                  px-3 py-2 cursor-pointer text-sm hover:bg-blue-50
                  ${idx > 0 && filteredOptions[idx - 1].head !== opt.head ? 'border-t border-gray-100' : ''}
                `}
              >
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-2 ${HEAD_COLORS[opt.head] || 'bg-gray-100'}`}>
                  {opt.head.split('.')[0]}
                </span>
                <span className="text-gray-700">{opt.subhead}</span>
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                No matching options
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TransactionTableProps {
  transactions: Transaction[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onClassify: (id: string, head: string, subhead: string) => void;
  onApplySuggestion: (id: string) => void;
  onApplyToSimilar: (account: string, head: string, subhead: string) => void;
  heads: Heads;
}

export function TransactionTable({
  transactions,
  selectedIds,
  onSelectionChange,
  onClassify,
  onApplySuggestion,
  onApplyToSimilar,
  heads
}: TransactionTableProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    transaction: Transaction;
  } | null>(null);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.length === transactions.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(transactions.map(t => t.id));
    }
  }, [selectedIds, transactions, onSelectionChange]);

  const handleRowSelect = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey && selectedIds.length > 0) {
      // Range selection
      const lastSelected = selectedIds[selectedIds.length - 1];
      const lastIdx = transactions.findIndex(t => t.id === lastSelected);
      const currentIdx = transactions.findIndex(t => t.id === id);
      const start = Math.min(lastIdx, currentIdx);
      const end = Math.max(lastIdx, currentIdx);
      const rangeIds = transactions.slice(start, end + 1).map(t => t.id);
      onSelectionChange(Array.from(new Set([...selectedIds, ...rangeIds])));
    } else if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }, [selectedIds, transactions, onSelectionChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent, transaction: Transaction) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      transaction
    });
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const getRowClass = (status: Transaction['status']) => {
    switch (status) {
      case 'classified': return 'status-classified';
      case 'suggested': return 'status-suggested';
      default: return 'status-unclassified';
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-2">No transactions to display</p>
          <p className="text-sm">Upload a journal file to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="w-10 px-3 py-3">
              <input
                type="checkbox"
                checked={selectedIds.length === transactions.length && transactions.length > 0}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
              Date
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
              State
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Account
            </th>
            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
              Debit
            </th>
            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
              Credit
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-72">
              Classification
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {transactions.map((txn) => (
            <tr
              key={txn.id}
              className={`transaction-row ${getRowClass(txn.status)} ${selectedIds.includes(txn.id) ? 'bg-blue-50' : ''}`}
              onContextMenu={(e) => handleContextMenu(e, txn)}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(txn.id)}
                  onChange={(e) => handleRowSelect(txn.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </td>
              <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
                {txn.date}
              </td>
              <td className="px-3 py-2 text-xs">
                {txn.state && (
                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">
                    {txn.state}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-sm text-gray-900">
                <div className="truncate max-w-md" title={txn.account}>
                  {txn.account}
                </div>
                {txn.notes && (
                  <div className="text-xs text-gray-500 truncate" title={txn.notes}>
                    {txn.notes}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-sm text-right font-mono">
                {txn.debit > 0 && (
                  <span className="text-red-600">{formatCurrency(txn.debit)}</span>
                )}
              </td>
              <td className="px-3 py-2 text-sm text-right font-mono">
                {txn.credit > 0 && (
                  <span className="text-green-600">{formatCurrency(txn.credit)}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <ClassificationDropdown
                  value={txn.head && txn.subhead ? { head: txn.head, subhead: txn.subhead } : null}
                  suggestion={txn.suggestedHead && txn.suggestedSubhead
                    ? { head: txn.suggestedHead, subhead: txn.suggestedSubhead }
                    : null
                  }
                  heads={heads}
                  onChange={({ head, subhead }) => onClassify(txn.id, head, subhead)}
                  onApplySuggestion={() => onApplySuggestion(txn.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              if (contextMenu.transaction.head && contextMenu.transaction.subhead) {
                // Create a pattern from the account name (escape special chars)
                const pattern = contextMenu.transaction.account
                  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  .substring(0, 30);
                onApplyToSimilar(pattern, contextMenu.transaction.head, contextMenu.transaction.subhead);
              }
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
            disabled={!contextMenu.transaction.head || !contextMenu.transaction.subhead}
          >
            Apply to all similar accounts
          </button>
          {contextMenu.transaction.suggestedHead && (
            <button
              onClick={() => {
                onApplySuggestion(contextMenu.transaction.id);
                setContextMenu(null);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
            >
              Accept suggestion
            </button>
          )}
        </div>
      )}
    </div>
  );
}
