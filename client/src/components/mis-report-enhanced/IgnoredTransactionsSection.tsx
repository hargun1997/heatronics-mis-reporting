import React, { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, ExclamationTriangleIcon, EyeSlashIcon, QuestionMarkCircleIcon, CheckCircleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { formatCurrencyFull } from '../../utils/misCalculator';
import { TransactionRef, UnclassifiedTransaction, HeadWithTransactions } from '../../types/misTracking';

interface IgnoredTransactionsSectionProps {
  ignoredHead?: HeadWithTransactions;
  excludedHead?: HeadWithTransactions;
  unclassifiedTransactions: UnclassifiedTransaction[];
  totalTransactions: number;
  classifiedCount: number;
  ignoredCount: number;
  excludedCount: number;
  onReclassify?: (transactionId: string) => void;
}

export function IgnoredTransactionsSection({
  ignoredHead,
  excludedHead,
  unclassifiedTransactions,
  totalTransactions,
  classifiedCount,
  ignoredCount,
  excludedCount,
  onReclassify
}: IgnoredTransactionsSectionProps) {
  const [showIgnored, setShowIgnored] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showUnclassified, setShowUnclassified] = useState(true);

  const unclassifiedCount = unclassifiedTransactions.length;
  const allAccountedFor = unclassifiedCount === 0;

  const ignoredTotal = ignoredHead?.total || 0;
  const excludedTotal = excludedHead?.total || 0;
  const unclassifiedTotal = unclassifiedTransactions.reduce((sum, t) => sum + t.amount, 0);

  // Flatten ignored transactions
  const ignoredTransactions = ignoredHead?.subheads.flatMap(s => s.transactions) || [];
  const excludedTransactions = excludedHead?.subheads.flatMap(s => s.transactions) || [];

  return (
    <div className="mt-6 border-t border-slate-700 pt-6">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center gap-3">
          <EyeSlashIcon className="h-5 w-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-slate-200">Transactions Not in P&L Calculations</h3>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
          allAccountedFor
            ? 'bg-green-900/30 text-green-300 border border-green-700'
            : 'bg-amber-900/30 text-amber-300 border border-amber-700'
        }`}>
          {allAccountedFor ? (
            <>
              <CheckCircleIcon className="h-4 w-4" />
              All transactions accounted for
            </>
          ) : (
            <>
              <ExclamationTriangleIcon className="h-4 w-4" />
              {unclassifiedCount} unclassified
            </>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4 px-4">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-slate-200">{totalTransactions}</p>
          <p className="text-xs text-slate-400">Total Transactions</p>
        </div>
        <div className="bg-green-900/20 rounded-lg p-3 text-center border border-green-800/50">
          <p className="text-2xl font-bold text-green-300">{classifiedCount}</p>
          <p className="text-xs text-green-400">Classified to P&L</p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-slate-300">{ignoredCount + excludedCount}</p>
          <p className="text-xs text-slate-400">Ignored/Excluded</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${
          unclassifiedCount > 0
            ? 'bg-amber-900/20 border border-amber-800/50'
            : 'bg-slate-800/50'
        }`}>
          <p className={`text-2xl font-bold ${unclassifiedCount > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
            {unclassifiedCount}
          </p>
          <p className={`text-xs ${unclassifiedCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            Unclassified
          </p>
        </div>
      </div>

      {/* Unclassified Transactions */}
      {unclassifiedCount > 0 && (
        <TransactionSection
          title="Unclassified (Needs Classification)"
          icon={<QuestionMarkCircleIcon className="h-5 w-5" />}
          transactions={unclassifiedTransactions.map(t => ({
            id: t.id,
            date: t.date,
            account: t.account,
            amount: t.amount,
            type: t.type,
            source: t.source
          }))}
          total={unclassifiedTotal}
          count={unclassifiedCount}
          isExpanded={showUnclassified}
          onToggle={() => setShowUnclassified(!showUnclassified)}
          variant="warning"
          onReclassify={onReclassify}
        />
      )}

      {/* Excluded Transactions (X. Exclude) - Always show */}
      <TransactionSection
        title="X. Excluded (Personal Expenses)"
        subtitle="Personal expenses and owner withdrawals"
        icon={<EyeSlashIcon className="h-5 w-5" />}
        transactions={excludedTransactions}
        total={excludedTotal}
        count={excludedTransactions.length}
        isExpanded={showExcluded}
        onToggle={() => setShowExcluded(!showExcluded)}
        variant="default"
        onReclassify={onReclassify}
      />

      {/* Ignored Transactions (Z. Ignore) - Always show */}
      <TransactionSection
        title="Z. Ignored (Non-P&L Items)"
        subtitle="GST Input/Output, TDS, Bank Transfers, Inter-company"
        icon={<EyeSlashIcon className="h-5 w-5" />}
        transactions={ignoredTransactions}
        total={ignoredTotal}
        count={ignoredTransactions.length}
        isExpanded={showIgnored}
        onToggle={() => setShowIgnored(!showIgnored)}
        variant="default"
        onReclassify={onReclassify}
      />
    </div>
  );
}

// Reusable Transaction Section Component
interface TransactionSectionProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  transactions: TransactionRef[];
  total: number;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  variant: 'default' | 'warning';
  onReclassify?: (transactionId: string) => void;
}

function TransactionSection({
  title,
  subtitle,
  icon,
  transactions,
  total,
  count,
  isExpanded,
  onToggle,
  variant,
  onReclassify
}: TransactionSectionProps) {
  const variantStyles = {
    default: {
      header: 'bg-slate-800 hover:bg-slate-700',
      headerText: 'text-slate-300',
      badge: 'bg-slate-700 text-slate-300'
    },
    warning: {
      header: 'bg-amber-900/30 hover:bg-amber-900/40 border-l-4 border-amber-500',
      headerText: 'text-amber-200',
      badge: 'bg-amber-800/50 text-amber-200'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="mb-2 mx-4">
      {/* Header */}
      <div
        className={`flex items-center justify-between py-3 px-4 cursor-pointer rounded-t-lg ${styles.header} transition-colors`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={styles.headerText}>
            {isExpanded ? (
              <ChevronDownIcon className="h-5 w-5" />
            ) : (
              <ChevronRightIcon className="h-5 w-5" />
            )}
          </span>
          <span className={styles.headerText}>{icon}</span>
          <div>
            <span className={`font-semibold ${styles.headerText}`}>{title}</span>
            {subtitle && (
              <p className="text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${styles.badge}`}>
            {count} transactions
          </span>
        </div>
        <span className={`font-mono ${styles.headerText}`}>
          {formatCurrencyFull(total)}
        </span>
      </div>

      {/* Transaction List */}
      {isExpanded && (
        <div className="bg-slate-900/70 border-t border-slate-700 rounded-b-lg">
          {/* Header Row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-slate-500 border-b border-slate-800">
            <div className="col-span-2">Date</div>
            <div className="col-span-6">Account Name</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-2 text-center">Action</div>
          </div>

          {/* Transaction Rows */}
          {transactions.map((txn, index) => {
            // Format: State - Account - Party (same as other sections)
            const displayName = [
              txn.state,
              txn.account,
              txn.partyName
            ].filter(Boolean).join(' - ');

            return (
              <div
                key={txn.id || index}
                className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/30"
              >
                <div className="col-span-2 text-slate-400">
                  {txn.date || '-'}
                </div>
                <div className="col-span-6 text-slate-300 truncate" title={displayName}>
                  {displayName}
                </div>
                <div className="col-span-2 text-right font-mono text-slate-300">
                  {formatCurrencyFull(txn.amount)}
                </div>
                <div className="col-span-2 text-center">
                  {onReclassify && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReclassify(txn.id);
                      }}
                      className="text-teal-400 hover:text-teal-300 transition-colors text-xs px-2 py-1 rounded hover:bg-slate-700"
                    >
                      Classify
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
