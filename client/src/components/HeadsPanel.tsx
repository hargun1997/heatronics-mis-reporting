import React, { useState, useMemo } from 'react';
import { Heads, Transaction } from '../types';
import { HEAD_ORDER, HEAD_COLORS } from '../data/defaultHeads';
import { formatCurrency } from '../utils/cogsCalculator';

interface HeadsPanelProps {
  heads: Heads;
  transactions: Transaction[];
  onAddHead: (name: string, type: 'credit' | 'debit' | 'calculated' | 'exclude') => void;
  onAddSubhead: (head: string, subhead: string) => void;
  onHeadClick: (head: string | null) => void;
  activeHead: string | null;
}

interface HeadTotals {
  [head: string]: {
    total: number;
    count: number;
    subheads: {
      [subhead: string]: {
        total: number;
        count: number;
      };
    };
  };
}

export function HeadsPanel({
  heads,
  transactions,
  onAddHead,
  onAddSubhead,
  onHeadClick,
  activeHead
}: HeadsPanelProps) {
  const [expandedHeads, setExpandedHeads] = useState<Set<string>>(new Set(HEAD_ORDER.slice(0, 5)));
  const [showAddHead, setShowAddHead] = useState(false);
  const [showAddSubhead, setShowAddSubhead] = useState<string | null>(null);
  const [newHeadName, setNewHeadName] = useState('');
  const [newHeadType, setNewHeadType] = useState<'credit' | 'debit'>('debit');
  const [newSubheadName, setNewSubheadName] = useState('');

  // Calculate totals for each head and subhead
  const totals = useMemo<HeadTotals>(() => {
    const result: HeadTotals = {};

    for (const txn of transactions) {
      if (!txn.head || !txn.subhead) continue;

      if (!result[txn.head]) {
        result[txn.head] = { total: 0, count: 0, subheads: {} };
      }

      if (!result[txn.head].subheads[txn.subhead]) {
        result[txn.head].subheads[txn.subhead] = { total: 0, count: 0 };
      }

      // Determine amount based on head type
      const headConfig = heads[txn.head];
      let amount = 0;
      if (headConfig?.type === 'credit') {
        amount = txn.credit;
      } else {
        amount = txn.debit;
      }

      result[txn.head].total += amount;
      result[txn.head].count += 1;
      result[txn.head].subheads[txn.subhead].total += amount;
      result[txn.head].subheads[txn.subhead].count += 1;
    }

    return result;
  }, [transactions, heads]);

  const toggleHead = (head: string) => {
    setExpandedHeads(prev => {
      const next = new Set(prev);
      if (next.has(head)) {
        next.delete(head);
      } else {
        next.add(head);
      }
      return next;
    });
  };

  const handleAddHead = () => {
    if (newHeadName.trim()) {
      onAddHead(newHeadName.trim(), newHeadType);
      setNewHeadName('');
      setShowAddHead(false);
    }
  };

  const handleAddSubhead = (head: string) => {
    if (newSubheadName.trim()) {
      onAddSubhead(head, newSubheadName.trim());
      setNewSubheadName('');
      setShowAddSubhead(null);
    }
  };

  return (
    <div className="bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Heads</h2>
        <p className="text-xs text-gray-500 mt-1">Click to filter transactions</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {HEAD_ORDER.filter(h => heads[h]).map(head => {
          const isExpanded = expandedHeads.has(head);
          const headTotals = totals[head];
          const colorClass = HEAD_COLORS[head] || 'bg-gray-100 text-gray-800';

          return (
            <div key={head} className="mb-1">
              {/* Head row */}
              <div
                className={`
                  flex items-center gap-2 px-2 py-2 rounded cursor-pointer
                  ${activeHead === head ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'}
                `}
                onClick={() => onHeadClick(activeHead === head ? null : head)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHead(head);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg
                    className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colorClass}`}>
                  {head.split('.')[0]}
                </span>

                <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                  {head.split('. ')[1]}
                </span>

                {headTotals && (
                  <div className="text-right">
                    <div className="text-xs font-semibold text-gray-900">
                      {formatCurrency(headTotals.total)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {headTotals.count} items
                    </div>
                  </div>
                )}
              </div>

              {/* Subheads */}
              {isExpanded && (
                <div className="ml-6 mt-1 space-y-1">
                  {heads[head].subheads.map(subhead => {
                    const subTotals = headTotals?.subheads[subhead];
                    return (
                      <div
                        key={subhead}
                        className="flex items-center justify-between px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded"
                      >
                        <span className="truncate">{subhead}</span>
                        {subTotals && (
                          <span className="text-xs text-gray-500 ml-2">
                            {formatCurrency(subTotals.total)} ({subTotals.count})
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* Add subhead button */}
                  {showAddSubhead === head ? (
                    <div className="flex items-center gap-2 px-2 py-1">
                      <input
                        type="text"
                        placeholder="New subhead name"
                        value={newSubheadName}
                        onChange={(e) => setNewSubheadName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddSubhead(head);
                          if (e.key === 'Escape') setShowAddSubhead(null);
                        }}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleAddSubhead(head)}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddSubhead(head)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add subhead
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add new head */}
        {showAddHead ? (
          <div className="p-2 border border-gray-200 rounded-lg mt-2">
            <input
              type="text"
              placeholder="Head name (e.g., K. New Category)"
              value={newHeadName}
              onChange={(e) => setNewHeadName(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <select
                value={newHeadType}
                onChange={(e) => setNewHeadType(e.target.value as 'credit' | 'debit')}
                className="px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="debit">Debit (Expense)</option>
                <option value="credit">Credit (Revenue)</option>
              </select>
              <button
                onClick={handleAddHead}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddHead(false)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddHead(true)}
            className="flex items-center gap-2 w-full px-3 py-2 mt-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add new head
          </button>
        )}
      </div>

      {/* Summary footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Total Classified:</span>
            <span className="font-medium">
              {transactions.filter(t => t.status === 'classified').length} / {transactions.length}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Pending:</span>
            <span className="font-medium text-yellow-600">
              {transactions.filter(t => t.status !== 'classified').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
