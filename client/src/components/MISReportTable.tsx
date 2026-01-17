import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction, Heads, MISReport, AggregatedRevenueData, IndianState, INDIAN_STATES } from '../types';
import { formatCurrency } from '../utils/cogsCalculator';
import { HEAD_COLORS, HEAD_ORDER } from '../data/defaultHeads';

interface MISLineItem {
  id: string;
  label: string;
  head: string;
  subhead: string;
  amount: number;
  type: 'debit' | 'credit';
  transactionIds: string[];
  source: 'journal' | 'bs';  // Balance Sheet or Journal
  isEditable: boolean;
}

interface MISReportTableProps {
  transactions: Transaction[];
  heads: Heads;
  report: MISReport;
  activeHead: string | null;
  onReassignTransactions: (transactionIds: string[], newHead: string, newSubhead: string) => void;
  // Revenue data from sales registers (multi-state)
  revenueData?: AggregatedRevenueData | null;
  salesByChannel?: { [channel: string]: number };
  onStateClick?: (state: IndianState) => void;
  getSalesLineItemsCount?: (state: IndianState) => number;
}

// Classification dropdown for reassigning line items
function ReassignDropdown({
  currentHead,
  currentSubhead,
  heads,
  onReassign,
  disabled
}: {
  currentHead: string;
  currentSubhead: string;
  heads: Heads;
  onReassign: (head: string, subhead: string) => void;
  disabled?: boolean;
}) {
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

  const filteredOptions = useMemo(() => {
    if (!search) return allOptions;
    const searchLower = search.toLowerCase();
    return allOptions.filter(opt =>
      opt.display.toLowerCase().includes(searchLower)
    );
  }, [allOptions, search]);

  const handleSelect = (head: string, subhead: string) => {
    if (head !== currentHead || subhead !== currentSubhead) {
      onReassign(head, subhead);
    }
    setIsOpen(false);
    setSearch('');
  };

  const colorClass = HEAD_COLORS[currentHead] || 'bg-gray-100 text-gray-800';

  if (disabled) {
    return (
      <div className={`px-2 py-1 rounded text-xs ${colorClass} opacity-60`}>
        {currentHead.split('. ')[1]} &gt; {currentSubhead}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`
          px-2 py-1 rounded border cursor-pointer text-xs truncate max-w-[200px]
          ${colorClass}
          ${isOpen ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-gray-300'}
        `}
        title={`${currentHead} > ${currentSubhead}`}
      >
        {currentSubhead}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg right-0">
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
          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.map((opt, idx) => (
              <div
                key={`${opt.head}-${opt.subhead}`}
                onClick={() => handleSelect(opt.head, opt.subhead)}
                className={`
                  px-3 py-2 cursor-pointer text-sm hover:bg-blue-50
                  ${idx > 0 && filteredOptions[idx - 1].head !== opt.head ? 'border-t border-gray-100' : ''}
                  ${opt.head === currentHead && opt.subhead === currentSubhead ? 'bg-blue-50' : ''}
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

export function MISReportTable({
  transactions,
  heads,
  report,
  activeHead,
  onReassignTransactions,
  revenueData,
  salesByChannel,
  onStateClick,
  getSalesLineItemsCount
}: MISReportTableProps) {
  // Build line items from transactions grouped by head/subhead
  const lineItems = useMemo<MISLineItem[]>(() => {
    const items: MISLineItem[] = [];
    const groupedByHeadSubhead = new Map<string, {
      head: string;
      subhead: string;
      transactions: Transaction[];
      debitTotal: number;
      creditTotal: number;
    }>();

    // Group transactions by head/subhead
    for (const txn of transactions) {
      if (!txn.head || !txn.subhead) continue;

      const key = `${txn.head}::${txn.subhead}`;
      if (!groupedByHeadSubhead.has(key)) {
        groupedByHeadSubhead.set(key, {
          head: txn.head,
          subhead: txn.subhead,
          transactions: [],
          debitTotal: 0,
          creditTotal: 0
        });
      }
      const group = groupedByHeadSubhead.get(key)!;
      group.transactions.push(txn);
      group.debitTotal += txn.debit;
      group.creditTotal += txn.credit;
    }

    // Convert to line items
    groupedByHeadSubhead.forEach((group, key) => {
      const headConfig = heads[group.head];
      const isCredit = headConfig?.type === 'credit';
      const amount = isCredit ? group.creditTotal : group.debitTotal;

      if (amount > 0) {
        items.push({
          id: key,
          label: group.subhead,
          head: group.head,
          subhead: group.subhead,
          amount,
          type: isCredit ? 'credit' : 'debit',
          transactionIds: group.transactions.map(t => t.id),
          source: 'journal',
          isEditable: true
        });
      }
    });

    // Add Balance Sheet items (non-editable)
    if (report.bsNetSales > 0) {
      // These are informational - the actual transactions are in the journal
    }

    // Sort by head order, then by subhead
    items.sort((a, b) => {
      const aIdx = HEAD_ORDER.indexOf(a.head);
      const bIdx = HEAD_ORDER.indexOf(b.head);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.subhead.localeCompare(b.subhead);
    });

    return items;
  }, [transactions, heads, report]);

  // Filter by active head
  const filteredItems = useMemo(() => {
    if (!activeHead) return lineItems;
    return lineItems.filter(item => item.head === activeHead);
  }, [lineItems, activeHead]);

  // Group filtered items by head for display
  const groupedItems = useMemo(() => {
    const groups = new Map<string, MISLineItem[]>();
    for (const item of filteredItems) {
      if (!groups.has(item.head)) {
        groups.set(item.head, []);
      }
      groups.get(item.head)!.push(item);
    }
    return groups;
  }, [filteredItems]);

  // Calculate totals per head
  const headTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of filteredItems) {
      totals.set(item.head, (totals.get(item.head) || 0) + item.amount);
    }
    return totals;
  }, [filteredItems]);

  const handleReassign = (item: MISLineItem, newHead: string, newSubhead: string) => {
    onReassignTransactions(item.transactionIds, newHead, newSubhead);
  };

  if (filteredItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-2">No line items to display</p>
          <p className="text-sm">
            {activeHead
              ? `No items classified under ${activeHead.split('. ')[1]}`
              : 'Classify some transactions first'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1" id="mis-report-content">
      {/* Revenue Summary Section (from Sales Registers) */}
      {revenueData && revenueData.totalGrossSales > 0 && (
        <div className="p-4 bg-indigo-50 border-b border-indigo-200">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-indigo-900 font-medium">Revenue Summary (All States)</span>
          </div>

          {/* Main Revenue Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-white p-3 rounded border border-indigo-100">
              <div className="text-xs text-indigo-600">Total Gross Sales</div>
              <div className="text-lg font-semibold text-indigo-900">₹{revenueData.totalGrossSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-white p-3 rounded border border-amber-200">
              <div className="text-xs text-amber-600">Stock Transfer</div>
              <div className="text-lg font-semibold text-amber-700">- ₹{revenueData.totalStockTransfer.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-amber-500 mt-1">Inter-company (UP)</div>
            </div>
            <div className="bg-white p-3 rounded border border-red-200">
              <div className="text-xs text-red-600">Returns</div>
              <div className="text-lg font-semibold text-red-700">- ₹{revenueData.totalReturns.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-white p-3 rounded border border-purple-200">
              <div className="text-xs text-purple-600">Taxes</div>
              <div className="text-lg font-semibold text-purple-700">- ₹{revenueData.totalTaxes.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-purple-400 mt-1">Coming soon</div>
            </div>
            <div className="bg-white p-3 rounded border border-pink-200">
              <div className="text-xs text-pink-600">Discounts</div>
              <div className="text-lg font-semibold text-pink-700">- ₹{revenueData.totalDiscounts.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-pink-400 mt-1">Coming soon</div>
            </div>
            <div className="bg-white p-3 rounded border border-green-300 bg-green-50">
              <div className="text-xs text-green-600 font-medium">NET REVENUE</div>
              <div className="text-lg font-bold text-green-700">₹{revenueData.totalNetRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="text-xs text-green-500 mt-1">Gross - Stock Transfer - Returns - Taxes - Discounts</div>
            </div>
          </div>

          {/* State-wise Breakdown */}
          <div className="border-t border-indigo-200 pt-3">
            <div className="text-xs text-indigo-600 mb-2 font-medium">State-wise Sales (Click to verify)</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(revenueData.salesByState).map(([state, amount]) => {
                const stateCode = state as IndianState;
                const hasLineItems = getSalesLineItemsCount ? getSalesLineItemsCount(stateCode) > 0 : false;
                return (
                  <button
                    key={state}
                    onClick={() => hasLineItems && onStateClick && onStateClick(stateCode)}
                    disabled={!hasLineItems}
                    className={`bg-white px-3 py-2 rounded border text-sm text-left transition-colors ${
                      hasLineItems
                        ? 'border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer'
                        : 'border-gray-100 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span className="text-indigo-700 font-medium">{state}:</span>
                    <span className="text-indigo-900 ml-1">₹{(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {revenueData.returnsByState[stateCode] && revenueData.returnsByState[stateCode]! > 0 && (
                      <span className="text-red-500 ml-2 text-xs">
                        (Returns: ₹{revenueData.returnsByState[stateCode]!.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </span>
                    )}
                    {hasLineItems && (
                      <svg className="inline-block w-3 h-3 ml-2 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channel Breakdown */}
          {salesByChannel && Object.keys(salesByChannel).length > 0 && (
            <div className="border-t border-indigo-200 pt-3 mt-3">
              <div className="text-xs text-indigo-600 mb-2 font-medium">Channel Breakdown</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(salesByChannel).map(([channel, amount]) => (
                  <span key={channel} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                    {channel}: ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
              Head
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Line Item
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
              Amount
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
              Count
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
              Classification
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {HEAD_ORDER.filter(head => groupedItems.has(head)).map(head => {
            const items = groupedItems.get(head)!;
            const headTotal = headTotals.get(head) || 0;
            const headConfig = heads[head];
            const colorClass = HEAD_COLORS[head] || 'bg-gray-100 text-gray-800';
            const isCredit = headConfig?.type === 'credit';

            return (
              <React.Fragment key={head}>
                {/* Head header row */}
                <tr className="bg-gray-100">
                  <td colSpan={2} className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>
                        {head.split('.')[0]}
                      </span>
                      <span className="font-semibold text-gray-800">
                        {head.split('. ')[1]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(headTotal)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-500">
                    {items.reduce((sum, i) => sum + i.transactionIds.length, 0)} txns
                  </td>
                  <td className="px-4 py-2"></td>
                </tr>

                {/* Line items */}
                {items.map(item => (
                  <tr
                    key={item.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${colorClass}`}>
                        {item.head.split('.')[0]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        {item.label}
                        {item.source === 'bs' && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                            BS
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-mono text-sm ${item.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(item.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-gray-500">
                      {item.transactionIds.length}
                    </td>
                    <td className="px-4 py-2">
                      <ReassignDropdown
                        currentHead={item.head}
                        currentSubhead={item.subhead}
                        heads={heads}
                        onReassign={(newHead, newSubhead) => handleReassign(item, newHead, newSubhead)}
                        disabled={!item.isEditable}
                      />
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Summary footer */}
      <div className="sticky bottom-0 bg-blue-50 border-t-2 border-blue-300 px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="text-sm font-semibold text-blue-800">
            MIS Report Summary
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-600">Net Revenue:</span>
              <span className="ml-2 font-mono font-semibold text-green-600">
                {formatCurrency(report.netRevenue)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">COGS:</span>
              <span className="ml-2 font-mono font-semibold text-red-600">
                {formatCurrency(report.cogm)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Gross Margin:</span>
              <span className="ml-2 font-mono font-semibold text-blue-600">
                {formatCurrency(report.grossMargin)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">EBITDA:</span>
              <span className={`ml-2 font-mono font-semibold ${report.ebitda >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(report.ebitda)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Net Income:</span>
              <span className={`ml-2 font-mono font-semibold ${report.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(report.netIncome)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
