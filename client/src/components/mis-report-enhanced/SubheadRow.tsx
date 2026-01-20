import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, InformationCircleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { formatCurrencyFull } from '../../utils/misCalculator';
import { TransactionRef, MISHead } from '../../types/misTracking';

interface SubheadRowProps {
  subhead: string;
  amount: number;
  percentage?: number;
  transactionCount: number;
  transactions: TransactionRef[];
  source: 'journal' | 'balance_sheet' | 'sales_register' | 'calculated';
  description?: string;
  onInfoClick?: () => void;
  onReclassify?: (transactionId: string) => void;
}

export function SubheadRow({
  subhead,
  amount,
  percentage,
  transactionCount,
  transactions,
  source,
  description,
  onInfoClick,
  onReclassify
}: SubheadRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = () => {
    if (transactions.length > 0) {
      setIsExpanded(!isExpanded);
    }
  };

  const sourceLabels = {
    journal: { text: 'Journal', color: 'bg-slate-600 text-slate-300' },
    balance_sheet: { text: 'BS', color: 'bg-green-700 text-green-100' },
    sales_register: { text: 'Sales', color: 'bg-blue-700 text-blue-100' },
    calculated: { text: 'Calc', color: 'bg-purple-700 text-purple-100' }
  };

  const hasTransactions = transactions.length > 0;

  return (
    <div className="border-b border-slate-800 last:border-b-0">
      {/* Subhead Row */}
      <div
        className={`
          flex items-center justify-between py-2.5 px-4 pl-10
          ${hasTransactions ? 'cursor-pointer hover:bg-slate-800/50' : ''}
          transition-colors duration-150
        `}
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-3">
          {/* Expand/Collapse Icon */}
          {hasTransactions ? (
            <span className="text-slate-500">
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronRightIcon className="h-4 w-4" />
              )}
            </span>
          ) : (
            <span className="w-4" />
          )}

          {/* Subhead Name */}
          <span className="text-slate-300">{subhead}</span>

          {/* Source Badge */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${sourceLabels[source].color}`}>
            {sourceLabels[source].text}
          </span>

          {/* Info Icon */}
          {description && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick?.();
              }}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title={description}
            >
              <InformationCircleIcon className="h-4 w-4" />
            </button>
          )}

          {/* Transaction Count */}
          {transactionCount > 0 && (
            <span className="text-xs text-slate-500">
              [{transactionCount}]
            </span>
          )}
        </div>

        {/* Amount and Percentage */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-slate-300">
            {formatCurrencyFull(amount)}
          </span>
          {percentage !== undefined && (
            <span className="text-sm text-slate-500 w-16 text-right">
              {percentage.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Expanded Transaction List */}
      {isExpanded && hasTransactions && (
        <TransactionList
          transactions={transactions}
          onReclassify={onReclassify}
        />
      )}
    </div>
  );
}

// Transaction List Component
interface TransactionListProps {
  transactions: TransactionRef[];
  onReclassify?: (transactionId: string) => void;
}

function TransactionList({ transactions, onReclassify }: TransactionListProps) {
  return (
    <div className="bg-slate-900/70 border-t border-slate-700">
      {/* Header Row */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-slate-500 border-b border-slate-800 pl-14">
        <div className="col-span-2">Date</div>
        <div className="col-span-5">Account Name</div>
        <div className="col-span-2 text-right">Debit</div>
        <div className="col-span-2 text-right">Credit</div>
        <div className="col-span-1 text-center">Action</div>
      </div>

      {/* Transaction Rows */}
      {transactions.map((txn, index) => {
        // Format account display: "Account - Party" (matching journalParser.ts convention)
        // With State prefix for multi-state context
        const accountParty = txn.partyName && txn.partyName !== txn.account
          ? `${txn.account} - ${txn.partyName}`
          : txn.account;
        const displayAccount = txn.state
          ? `${txn.state} - ${accountParty}`
          : accountParty;

        return (
        <div
          key={txn.id || index}
          className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30 pl-14"
        >
          <div className="col-span-2 text-slate-400">
            {txn.date || '-'}
          </div>
          <div className="col-span-5 text-slate-300 truncate" title={displayAccount}>
            {displayAccount}
          </div>
          <div className="col-span-2 text-right font-mono text-slate-300">
            {txn.type === 'debit' && txn.amount > 0 ? formatCurrencyFull(Math.abs(txn.amount)) : '-'}
          </div>
          <div className="col-span-2 text-right font-mono text-slate-300">
            {txn.type === 'credit' || txn.amount < 0 ? formatCurrencyFull(Math.abs(txn.amount)) : '-'}
          </div>
          <div className="col-span-1 text-center">
            {txn.source === 'journal' && onReclassify && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReclassify(txn.id);
                }}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-700"
                title="Change classification"
              >
                <Cog6ToothIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        );
      })}

      {/* Total Row */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-sm font-semibold bg-slate-800/50 pl-14">
        <div className="col-span-2 text-slate-400">Total</div>
        <div className="col-span-5 text-slate-400">
          {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
        </div>
        <div className="col-span-2 text-right font-mono text-slate-300">
          {formatCurrencyFull(
            transactions
              .filter(t => t.type === 'debit' && t.amount > 0)
              .reduce((sum, t) => sum + Math.abs(t.amount), 0)
          )}
        </div>
        <div className="col-span-2 text-right font-mono text-slate-300">
          {formatCurrencyFull(
            transactions
              .filter(t => t.type === 'credit' || t.amount < 0)
              .reduce((sum, t) => sum + Math.abs(t.amount), 0)
          )}
        </div>
        <div className="col-span-1"></div>
      </div>
    </div>
  );
}
