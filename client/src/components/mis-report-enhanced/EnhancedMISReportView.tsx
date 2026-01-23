import React, { useState, useMemo, useCallback } from 'react';
import { MISRecord, MISHead, TransactionRef, periodToString, LearnedPattern } from '../../types/misTracking';
import { formatCurrencyFull } from '../../utils/misCalculator';
import { CollapsibleSection, MarginRow } from './CollapsibleSection';
import { SubheadRow } from './SubheadRow';
import { FormulaInfoModal, InfoTooltip } from './FormulaInfoModal';
import { ReclassifyModal } from './ReclassifyModal';
import { IgnoredTransactionsSection } from './IgnoredTransactionsSection';
import { MIS_FORMULAS, MarginType, SUBHEAD_DESCRIPTIONS, HEAD_DESCRIPTIONS } from '../../config/misFormulas';
import { saveLearnedPattern } from '../../utils/googleSheetsStorage';
import { ArrowsPointingOutIcon, ArrowsPointingInIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface EnhancedMISReportViewProps {
  misRecord: MISRecord;
  onRecalculate?: () => Promise<void>;
}

export function EnhancedMISReportView({ misRecord, onRecalculate }: EnhancedMISReportViewProps) {
  // State for modals
  const [formulaModalOpen, setFormulaModalOpen] = useState(false);
  const [selectedFormula, setSelectedFormula] = useState<MarginType | null>(null);
  const [infoTooltipOpen, setInfoTooltipOpen] = useState(false);
  const [infoTooltipContent, setInfoTooltipContent] = useState({ title: '', description: '' });

  // State for reclassification
  const [reclassifyModalOpen, setReclassifyModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRef | null>(null);
  const [selectedTxnHead, setSelectedTxnHead] = useState<MISHead>('Z. Ignore');
  const [selectedTxnSubhead, setSelectedTxnSubhead] = useState<string>('');

  // Expand/Collapse all state
  const [allExpanded, setAllExpanded] = useState(true);

  const netRevenue = misRecord.revenue.netRevenue || 1;
  const transactionsByHead = misRecord.transactionsByHead || {};

  // Calculate percentage helper
  const pct = (value: number) => (value / netRevenue) * 100;

  // Open formula modal
  const openFormulaModal = useCallback((marginType: MarginType) => {
    setSelectedFormula(marginType);
    setFormulaModalOpen(true);
  }, []);

  // Open info tooltip
  const openInfoTooltip = useCallback((title: string, description: string) => {
    setInfoTooltipContent({ title, description });
    setInfoTooltipOpen(true);
  }, []);

  // Handle reclassify button click
  const handleReclassifyClick = useCallback((transactionId: string, head: MISHead, subhead: string) => {
    // Find the transaction in transactionsByHead
    let foundTxn: TransactionRef | null = null;

    for (const headData of Object.values(transactionsByHead)) {
      for (const subheadData of headData.subheads) {
        const txn = subheadData.transactions.find(t => t.id === transactionId);
        if (txn) {
          foundTxn = txn;
          setSelectedTxnHead(head);
          setSelectedTxnSubhead(subhead);
          break;
        }
      }
      if (foundTxn) break;
    }

    // Also check unclassified
    if (!foundTxn && misRecord.unclassifiedTransactions) {
      const unclassifiedTxn = misRecord.unclassifiedTransactions.find(t => t.id === transactionId);
      if (unclassifiedTxn) {
        foundTxn = {
          ...unclassifiedTxn,
          source: 'journal'
        };
        setSelectedTxnHead('Z. Ignore'); // Default for unclassified
        setSelectedTxnSubhead('');
      }
    }

    if (foundTxn) {
      setSelectedTransaction(foundTxn);
      setReclassifyModalOpen(true);
    }
  }, [transactionsByHead, misRecord.unclassifiedTransactions]);

  // Handle reclassification
  const handleReclassify = useCallback(async (
    transactionId: string,
    newHead: MISHead,
    newSubhead: string,
    createRule: boolean,
    pattern?: string,
    matchType?: 'exact' | 'contains' | 'regex'
  ) => {
    if (createRule && pattern) {
      // Create a new rule
      const newPattern: LearnedPattern = {
        id: `user_${Date.now()}`,
        pattern: pattern,
        matchType: matchType || 'contains',
        head: newHead,
        subhead: newSubhead,
        confidence: 1.0,
        priority: 0, // User rules have highest priority
        active: true,
        createdAt: new Date().toISOString(),
        source: 'user',
        notes: `Created from reclassification of: ${selectedTransaction?.account}`
      };

      await saveLearnedPattern(newPattern);
    }

    // Trigger recalculation if available
    if (onRecalculate) {
      await onRecalculate();
    }
  }, [selectedTransaction, onRecalculate]);

  // Get subheads for a head with their transactions
  const getSubheadsForHead = (headKey: string) => {
    return transactionsByHead[headKey]?.subheads || [];
  };

  // Count transactions for ignored/excluded sections
  const classifiedCount = misRecord.classifiedTransactions.filter(
    t => t.misHead !== 'Z. Ignore' && t.misHead !== 'X. Exclude'
  ).length;
  const ignoredCount = transactionsByHead['Z. Ignore']?.transactionCount || 0;
  const excludedCount = transactionsByHead['X. Exclude']?.transactionCount || 0;
  const totalTransactions = misRecord.classifiedTransactions.length + (misRecord.unclassifiedTransactions?.length || 0);

  return (
    <div className="bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              P&L MIS Report - {periodToString(misRecord.period)}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {misRecord.states.join(', ')} | {totalTransactions} transactions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Expand/Collapse All */}
            <button
              onClick={() => setAllExpanded(!allExpanded)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              {allExpanded ? (
                <>
                  <ArrowsPointingInIcon className="h-4 w-4" />
                  Collapse All
                </>
              ) : (
                <>
                  <ArrowsPointingOutIcon className="h-4 w-4" />
                  Expand All
                </>
              )}
            </button>
            {/* Export */}
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
              <ArrowDownTrayIcon className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-6xl mx-auto py-6">
        {/* ========== REVENUE SECTION ========== */}
        <CollapsibleSection
          title="A. GROSS REVENUE"
          total={misRecord.revenue.totalGrossRevenue}
          percentage={pct(misRecord.revenue.totalGrossRevenue)}
          transactionCount={transactionsByHead['A. Revenue']?.transactionCount}
          defaultExpanded={allExpanded}
          source="sales_register"
          infoTooltip={HEAD_DESCRIPTIONS['A. Revenue']}
          onInfoClick={() => openInfoTooltip('A. Revenue', HEAD_DESCRIPTIONS['A. Revenue'])}
        >
          {/* Revenue by Channel */}
          {(['Amazon', 'Website', 'Blinkit', 'Offline & OEM'] as const).map(channel => {
            const amount = misRecord.revenue.grossRevenue[channel];
            if (amount === 0) return null;
            return (
              <SubheadRow
                key={channel}
                subhead={channel}
                amount={amount}
                percentage={pct(amount)}
                transactionCount={0}
                transactions={[]}
                source="sales_register"
                description={`Revenue from ${channel} channel`}
              />
            );
          })}
        </CollapsibleSection>

        {/* Returns */}
        {misRecord.revenue.totalReturns > 0 && (
          <CollapsibleSection
            title="B. RETURNS"
            total={-misRecord.revenue.totalReturns}
            percentage={-pct(misRecord.revenue.totalReturns)}
            defaultExpanded={false}
            source="sales_register"
          >
            {(['Amazon', 'Website', 'Blinkit', 'Offline & OEM'] as const).map(channel => {
              const amount = misRecord.revenue.returns[channel];
              if (amount === 0) return null;
              return (
                <SubheadRow
                  key={channel}
                  subhead={channel}
                  amount={-amount}
                  percentage={-pct(amount)}
                  transactionCount={0}
                  transactions={[]}
                  source="sales_register"
                />
              );
            })}
          </CollapsibleSection>
        )}

        {/* Taxes */}
        {misRecord.revenue.totalTaxes > 0 && (
          <CollapsibleSection
            title="D. TAXES (GST)"
            total={-misRecord.revenue.totalTaxes}
            percentage={-pct(misRecord.revenue.totalTaxes)}
            defaultExpanded={false}
            source="sales_register"
          >
            {(['Amazon', 'Website', 'Blinkit', 'Offline & OEM'] as const).map(channel => {
              const amount = misRecord.revenue.taxes[channel];
              if (amount === 0) return null;
              return (
                <SubheadRow
                  key={channel}
                  subhead={channel}
                  amount={-amount}
                  percentage={-pct(amount)}
                  transactionCount={0}
                  transactions={[]}
                  source="sales_register"
                />
              );
            })}
          </CollapsibleSection>
        )}

        {/* NET REVENUE */}
        <MarginRow
          label="NET REVENUE"
          amount={misRecord.revenue.netRevenue}
          percentage={100}
          formulaInfo={MIS_FORMULAS.NET_REVENUE}
          onInfoClick={() => openFormulaModal('NET_REVENUE')}
          variant="highlight"
        />

        {/* ========== COGM SECTION ========== */}
        {/* COGM uses misRecord.cogm.totalCOGM directly because Raw Materials is calculated
            from Balance Sheet (Opening + Purchases - Closing) and added separately */}
        <CollapsibleSection
          title="E. COST OF GOODS MANUFACTURED (COGM)"
          total={misRecord.cogm.totalCOGM}
          percentage={pct(misRecord.cogm.totalCOGM)}
          transactionCount={transactionsByHead['E. COGM']?.transactionCount}
          defaultExpanded={allExpanded}
          infoTooltip={HEAD_DESCRIPTIONS['E. COGM']}
          onInfoClick={() => openInfoTooltip('E. COGM', HEAD_DESCRIPTIONS['E. COGM'])}
          highlightColor="blue"
        >
          {getSubheadsForHead('E. COGM').map(subhead => (
            <SubheadRow
              key={subhead.subhead}
              subhead={subhead.subhead}
              amount={subhead.amount}
              percentage={pct(subhead.amount)}
              transactionCount={subhead.transactionCount}
              transactions={subhead.transactions}
              source={subhead.source}
              description={SUBHEAD_DESCRIPTIONS[subhead.subhead]}
              onInfoClick={() => openInfoTooltip(subhead.subhead, SUBHEAD_DESCRIPTIONS[subhead.subhead] || '')}
              onReclassify={(txnId) => handleReclassifyClick(txnId, 'E. COGM', subhead.subhead)}
            />
          ))}
        </CollapsibleSection>

        {/* GROSS MARGIN */}
        <MarginRow
          label="GROSS MARGIN (Net Revenue - COGM)"
          amount={misRecord.grossMargin}
          percentage={misRecord.grossMarginPercent}
          formulaInfo={MIS_FORMULAS.GROSS_MARGIN}
          onInfoClick={() => openFormulaModal('GROSS_MARGIN')}
          variant="positive"
        />

        {/* ========== CHANNEL & FULFILLMENT ========== */}
        <CollapsibleSection
          title="F. CHANNEL & FULFILLMENT"
          total={transactionsByHead['F. Channel & Fulfillment']?.total || misRecord.channelFulfillment.total}
          percentage={pct(transactionsByHead['F. Channel & Fulfillment']?.total || misRecord.channelFulfillment.total)}
          transactionCount={transactionsByHead['F. Channel & Fulfillment']?.transactionCount}
          defaultExpanded={allExpanded}
          infoTooltip={HEAD_DESCRIPTIONS['F. Channel & Fulfillment']}
        >
          {getSubheadsForHead('F. Channel & Fulfillment').map(subhead => (
            <SubheadRow
              key={subhead.subhead}
              subhead={subhead.subhead}
              amount={subhead.amount}
              percentage={pct(subhead.amount)}
              transactionCount={subhead.transactionCount}
              transactions={subhead.transactions}
              source={subhead.source}
              description={SUBHEAD_DESCRIPTIONS[subhead.subhead]}
              onReclassify={(txnId) => handleReclassifyClick(txnId, 'F. Channel & Fulfillment', subhead.subhead)}
            />
          ))}
        </CollapsibleSection>

        {/* CM1 */}
        <MarginRow
          label="CM1 (Contribution Margin 1)"
          amount={misRecord.cm1}
          percentage={misRecord.cm1Percent}
          formulaInfo={MIS_FORMULAS.CM1}
          onInfoClick={() => openFormulaModal('CM1')}
          variant="highlight"
        />

        {/* ========== SALES & MARKETING ========== */}
        <CollapsibleSection
          title="G. SALES & MARKETING"
          total={transactionsByHead['G. Sales & Marketing']?.total || misRecord.salesMarketing.total}
          percentage={pct(transactionsByHead['G. Sales & Marketing']?.total || misRecord.salesMarketing.total)}
          transactionCount={transactionsByHead['G. Sales & Marketing']?.transactionCount}
          defaultExpanded={allExpanded}
          infoTooltip={HEAD_DESCRIPTIONS['G. Sales & Marketing']}
        >
          {getSubheadsForHead('G. Sales & Marketing').map(subhead => (
            <SubheadRow
              key={subhead.subhead}
              subhead={subhead.subhead}
              amount={subhead.amount}
              percentage={pct(subhead.amount)}
              transactionCount={subhead.transactionCount}
              transactions={subhead.transactions}
              source={subhead.source}
              description={SUBHEAD_DESCRIPTIONS[subhead.subhead]}
              onReclassify={(txnId) => handleReclassifyClick(txnId, 'G. Sales & Marketing', subhead.subhead)}
            />
          ))}
        </CollapsibleSection>

        {/* CM2 */}
        <MarginRow
          label="CM2 (After Marketing)"
          amount={misRecord.cm2}
          percentage={misRecord.cm2Percent}
          formulaInfo={MIS_FORMULAS.CM2}
          onInfoClick={() => openFormulaModal('CM2')}
          variant="highlight"
        />

        {/* ========== PLATFORM COSTS ========== */}
        <CollapsibleSection
          title="H. PLATFORM COSTS"
          total={transactionsByHead['H. Platform Costs']?.total || misRecord.platformCosts.total}
          percentage={pct(transactionsByHead['H. Platform Costs']?.total || misRecord.platformCosts.total)}
          transactionCount={transactionsByHead['H. Platform Costs']?.transactionCount}
          defaultExpanded={allExpanded}
          infoTooltip={HEAD_DESCRIPTIONS['H. Platform Costs']}
        >
          {getSubheadsForHead('H. Platform Costs').map(subhead => (
            <SubheadRow
              key={subhead.subhead}
              subhead={subhead.subhead}
              amount={subhead.amount}
              percentage={pct(subhead.amount)}
              transactionCount={subhead.transactionCount}
              transactions={subhead.transactions}
              source={subhead.source}
              description={SUBHEAD_DESCRIPTIONS[subhead.subhead]}
              onReclassify={(txnId) => handleReclassifyClick(txnId, 'H. Platform Costs', subhead.subhead)}
            />
          ))}
        </CollapsibleSection>

        {/* CM3 */}
        <MarginRow
          label="CM3 (After Platform)"
          amount={misRecord.cm3}
          percentage={misRecord.cm3Percent}
          formulaInfo={MIS_FORMULAS.CM3}
          onInfoClick={() => openFormulaModal('CM3')}
          variant="highlight"
        />

        {/* ========== OPERATING EXPENSES ========== */}
        <CollapsibleSection
          title="I. OPERATING EXPENSES"
          total={transactionsByHead['I. Operating Expenses']?.total || misRecord.operatingExpenses.total}
          percentage={pct(transactionsByHead['I. Operating Expenses']?.total || misRecord.operatingExpenses.total)}
          transactionCount={transactionsByHead['I. Operating Expenses']?.transactionCount}
          defaultExpanded={allExpanded}
          infoTooltip={HEAD_DESCRIPTIONS['I. Operating Expenses']}
        >
          {getSubheadsForHead('I. Operating Expenses').map(subhead => (
            <SubheadRow
              key={subhead.subhead}
              subhead={subhead.subhead}
              amount={subhead.amount}
              percentage={pct(subhead.amount)}
              transactionCount={subhead.transactionCount}
              transactions={subhead.transactions}
              source={subhead.source}
              description={SUBHEAD_DESCRIPTIONS[subhead.subhead]}
              onReclassify={(txnId) => handleReclassifyClick(txnId, 'I. Operating Expenses', subhead.subhead)}
            />
          ))}
        </CollapsibleSection>

        {/* EBITDA */}
        <MarginRow
          label="EBITDA"
          amount={misRecord.ebitda}
          percentage={misRecord.ebitdaPercent}
          formulaInfo={MIS_FORMULAS.EBITDA}
          onInfoClick={() => openFormulaModal('EBITDA')}
          variant="highlight"
        />

        {/* ========== NON-OPERATING ========== */}
        <CollapsibleSection
          title="J. NON-OPERATING"
          total={transactionsByHead['J. Non-Operating']?.total || (misRecord.nonOperating.totalIDA + misRecord.nonOperating.incomeTax)}
          percentage={pct(transactionsByHead['J. Non-Operating']?.total || (misRecord.nonOperating.totalIDA + misRecord.nonOperating.incomeTax))}
          transactionCount={transactionsByHead['J. Non-Operating']?.transactionCount}
          defaultExpanded={allExpanded}
          infoTooltip={HEAD_DESCRIPTIONS['J. Non-Operating']}
        >
          {getSubheadsForHead('J. Non-Operating').map(subhead => (
            <SubheadRow
              key={subhead.subhead}
              subhead={subhead.subhead}
              amount={subhead.amount}
              percentage={pct(subhead.amount)}
              transactionCount={subhead.transactionCount}
              transactions={subhead.transactions}
              source={subhead.source}
              description={SUBHEAD_DESCRIPTIONS[subhead.subhead]}
              onReclassify={(txnId) => handleReclassifyClick(txnId, 'J. Non-Operating', subhead.subhead)}
            />
          ))}
        </CollapsibleSection>

        {/* EBT */}
        <MarginRow
          label="EBT (Earnings Before Tax)"
          amount={misRecord.ebt}
          percentage={misRecord.ebtPercent}
          formulaInfo={MIS_FORMULAS.EBT}
          onInfoClick={() => openFormulaModal('EBT')}
          variant="highlight"
        />

        {/* NET INCOME */}
        <MarginRow
          label="NET INCOME"
          amount={misRecord.netIncome}
          percentage={misRecord.netIncomePercent}
          formulaInfo={MIS_FORMULAS.NET_INCOME}
          onInfoClick={() => openFormulaModal('NET_INCOME')}
          variant={misRecord.netIncome >= 0 ? 'positive' : 'negative'}
        />

        {/* ========== BALANCE SHEET RECONCILIATION ========== */}
        {misRecord.balanceSheet && (
          <div className="mt-6 mx-4 bg-green-900/20 rounded-lg border border-green-700/50 p-4">
            <h3 className="text-sm font-semibold text-green-300 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              Balance Sheet Data
            </h3>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-green-400 text-xs">Opening Stock</p>
                <p className="font-mono text-green-200">{formatCurrencyFull(misRecord.balanceSheet.openingStock)}</p>
              </div>
              <div>
                <p className="text-green-400 text-xs">Purchases</p>
                <p className="font-mono text-green-200">{formatCurrencyFull(misRecord.balanceSheet.purchases)}</p>
              </div>
              <div>
                <p className="text-green-400 text-xs">Closing Stock</p>
                <p className="font-mono text-green-200">{formatCurrencyFull(misRecord.balanceSheet.closingStock)}</p>
              </div>
              <div>
                <p className="text-green-400 text-xs">Calculated COGS</p>
                <p className="font-mono text-green-200">{formatCurrencyFull(misRecord.balanceSheet.calculatedCOGS)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ========== IGNORED/EXCLUDED/UNCLASSIFIED SECTION ========== */}
        <IgnoredTransactionsSection
          ignoredHead={transactionsByHead['Z. Ignore']}
          excludedHead={transactionsByHead['X. Exclude']}
          unclassifiedTransactions={misRecord.unclassifiedTransactions || []}
          totalTransactions={totalTransactions}
          classifiedCount={classifiedCount}
          ignoredCount={ignoredCount}
          excludedCount={excludedCount}
          onReclassify={(txnId) => {
            // For unclassified, we don't have a current head/subhead
            handleReclassifyClick(txnId, 'Z. Ignore', '');
          }}
        />
      </div>

      {/* Modals */}
      {selectedFormula && (
        <FormulaInfoModal
          isOpen={formulaModalOpen}
          onClose={() => setFormulaModalOpen(false)}
          formula={MIS_FORMULAS[selectedFormula]}
          misRecord={misRecord}
          resultValue={getMarginValue(misRecord, selectedFormula)}
        />
      )}

      <InfoTooltip
        title={infoTooltipContent.title}
        description={infoTooltipContent.description}
        isOpen={infoTooltipOpen}
        onClose={() => setInfoTooltipOpen(false)}
      />

      <ReclassifyModal
        isOpen={reclassifyModalOpen}
        onClose={() => setReclassifyModalOpen(false)}
        transaction={selectedTransaction}
        currentHead={selectedTxnHead}
        currentSubhead={selectedTxnSubhead}
        onReclassify={handleReclassify}
      />
    </div>
  );
}

// Helper to get margin value from MISRecord
function getMarginValue(record: MISRecord, marginType: MarginType): number {
  switch (marginType) {
    case 'GROSS_REVENUE':
      return record.revenue.totalGrossRevenue;
    case 'NET_REVENUE':
      return record.revenue.netRevenue;
    case 'GROSS_MARGIN':
      return record.grossMargin;
    case 'CM1':
      return record.cm1;
    case 'CM2':
      return record.cm2;
    case 'CM3':
      return record.cm3;
    case 'EBITDA':
      return record.ebitda;
    case 'EBT':
      return record.ebt;
    case 'NET_INCOME':
      return record.netIncome;
    default:
      return 0;
  }
}

export default EnhancedMISReportView;
