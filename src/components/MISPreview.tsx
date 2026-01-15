import React from 'react';
import { MISReport } from '../types';
import { formatCurrencyFull, formatPercentage } from '../utils/cogsCalculator';

interface MISPreviewProps {
  report: MISReport;
  isVisible: boolean;
  onClose: () => void;
}

interface LineItemProps {
  label: string;
  amount: number;
  percentage?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  indent?: number;
  isNegative?: boolean;
}

function LineItem({ label, amount, percentage, isSubtotal, isTotal, indent = 0, isNegative }: LineItemProps) {
  const paddingLeft = indent * 20;

  return (
    <div
      className={`
        flex items-center justify-between py-1.5 px-3
        ${isTotal ? 'bg-blue-50 font-bold border-t-2 border-blue-300' : ''}
        ${isSubtotal ? 'bg-gray-50 font-semibold border-t border-gray-200' : ''}
      `}
      style={{ paddingLeft: paddingLeft + 12 }}
    >
      <span className={`${isTotal ? 'text-blue-900' : isSubtotal ? 'text-gray-800' : 'text-gray-600'}`}>
        {label}
      </span>
      <div className="flex items-center gap-4">
        <span
          className={`
            font-mono text-right min-w-[120px]
            ${isTotal ? 'text-blue-900' : isSubtotal ? 'text-gray-800' : 'text-gray-700'}
            ${isNegative && amount !== 0 ? 'text-red-600' : ''}
          `}
        >
          {isNegative && amount > 0 ? '(' : ''}{formatCurrencyFull(Math.abs(amount))}{isNegative && amount > 0 ? ')' : ''}
        </span>
        {percentage && (
          <span className="text-xs text-gray-500 min-w-[50px] text-right">{percentage}</span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="bg-gray-100 px-3 py-2 font-semibold text-gray-700 border-t border-b border-gray-200">
      {title}
    </div>
  );
}

export function MISPreview({ report, isVisible, onClose }: MISPreviewProps) {
  if (!isVisible) return null;

  const netRevenue = report.netRevenue || 1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">P&L MIS Report</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" id="mis-report-content">
          <div className="mis-report">
            {/* Revenue Section */}
            <SectionHeader title="A. TOTAL REVENUE (With GST)" />
            {Object.entries(report.revenueByChannel)
              .filter(([, v]) => v > 0)
              .map(([channel, amount]) => (
                <LineItem
                  key={channel}
                  label={channel}
                  amount={amount}
                  percentage={formatPercentage(amount, report.grossRevenue)}
                  indent={1}
                />
              ))}
            <LineItem
              label="GROSS REVENUE"
              amount={report.grossRevenue}
              isSubtotal
            />

            {/* Deductions */}
            <SectionHeader title="DEDUCTIONS FROM REVENUE" />
            <LineItem label="B. Less: Returns" amount={report.returns} isNegative />
            <LineItem label="C. Less: Discounts" amount={report.discounts} isNegative />
            <LineItem label="D. Less: Taxes (GST)" amount={report.taxes} isNegative />
            <LineItem
              label="NET REVENUE"
              amount={report.netRevenue}
              percentage="100.0%"
              isTotal
            />

            {/* COGM Section */}
            <SectionHeader title="E. COST OF GOODS MANUFACTURED (COGM)" />
            {Object.entries(report.cogmBreakdown)
              .filter(([, v]) => v > 0)
              .map(([item, amount]) => (
                <LineItem
                  key={item}
                  label={item}
                  amount={amount}
                  percentage={formatPercentage(amount, netRevenue)}
                  indent={1}
                />
              ))}
            <LineItem
              label="TOTAL COGM"
              amount={report.cogm}
              percentage={formatPercentage(report.cogm, netRevenue)}
              isSubtotal
              isNegative
            />
            <LineItem
              label="GROSS MARGIN"
              amount={report.grossMargin}
              percentage={formatPercentage(report.grossMargin, netRevenue)}
              isTotal
            />

            {/* Channel Costs */}
            <SectionHeader title="F. CHANNEL & FULFILLMENT COSTS" />
            {Object.entries(report.channelCostsBreakdown)
              .filter(([, v]) => v > 0)
              .map(([item, amount]) => (
                <LineItem
                  key={item}
                  label={item}
                  amount={amount}
                  percentage={formatPercentage(amount, netRevenue)}
                  indent={1}
                />
              ))}
            <LineItem
              label="Total Channel Costs"
              amount={report.channelCosts}
              percentage={formatPercentage(report.channelCosts, netRevenue)}
              isSubtotal
              isNegative
            />
            <LineItem
              label="CM1 (Contribution Margin 1)"
              amount={report.cm1}
              percentage={formatPercentage(report.cm1, netRevenue)}
              isTotal
            />

            {/* Marketing */}
            <SectionHeader title="G. SALES & MARKETING" />
            {Object.entries(report.marketingBreakdown)
              .filter(([, v]) => v > 0)
              .map(([item, amount]) => (
                <LineItem
                  key={item}
                  label={item}
                  amount={amount}
                  percentage={formatPercentage(amount, netRevenue)}
                  indent={1}
                />
              ))}
            <LineItem
              label="Total Marketing"
              amount={report.marketing}
              percentage={formatPercentage(report.marketing, netRevenue)}
              isSubtotal
              isNegative
            />
            <LineItem
              label="CM2 (After Marketing)"
              amount={report.cm2}
              percentage={formatPercentage(report.cm2, netRevenue)}
              isTotal
            />

            {/* Platform Costs */}
            <SectionHeader title="H. PLATFORM COSTS" />
            {Object.entries(report.platformBreakdown)
              .filter(([, v]) => v > 0)
              .map(([item, amount]) => (
                <LineItem
                  key={item}
                  label={item}
                  amount={amount}
                  percentage={formatPercentage(amount, netRevenue)}
                  indent={1}
                />
              ))}
            <LineItem
              label="Total Platform Costs"
              amount={report.platform}
              percentage={formatPercentage(report.platform, netRevenue)}
              isSubtotal
              isNegative
            />
            <LineItem
              label="CM3 (After Platform)"
              amount={report.cm3}
              percentage={formatPercentage(report.cm3, netRevenue)}
              isTotal
            />

            {/* Operating Expenses */}
            <SectionHeader title="I. OPERATING EXPENSES" />
            {Object.entries(report.operatingBreakdown)
              .filter(([, v]) => v > 0)
              .map(([item, amount]) => (
                <LineItem
                  key={item}
                  label={item}
                  amount={amount}
                  percentage={formatPercentage(amount, netRevenue)}
                  indent={1}
                />
              ))}
            <LineItem
              label="Total Operating Expenses"
              amount={report.operating}
              percentage={formatPercentage(report.operating, netRevenue)}
              isSubtotal
              isNegative
            />
            <LineItem
              label="EBITDA"
              amount={report.ebitda}
              percentage={formatPercentage(report.ebitda, netRevenue)}
              isTotal
            />

            {/* Non-Operating & Net Income */}
            <SectionHeader title="J. NON-OPERATING" />
            <LineItem
              label="Non-Operating Items"
              amount={report.nonOperating}
              percentage={formatPercentage(report.nonOperating, netRevenue)}
              isNegative
            />
            <div className="bg-blue-100 border-t-2 border-b-2 border-blue-400">
              <LineItem
                label="NET INCOME"
                amount={report.netIncome}
                percentage={formatPercentage(report.netIncome, netRevenue)}
                isTotal
              />
            </div>

            {/* Memo Items */}
            <div className="p-4 bg-gray-50 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-600 mb-2">MEMO:</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Excluded (Personal):</span>
                  <span className="font-mono">{formatCurrencyFull(report.excluded)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ignored (Non-P&L):</span>
                  <span className="font-mono">{formatCurrencyFull(report.ignored)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Compact version for sidebar preview
export function MISMiniPreview({ report }: { report: MISReport }) {
  const netRevenue = report.netRevenue || 1;

  const items = [
    { label: 'Gross Revenue', value: report.grossRevenue, color: 'text-green-600' },
    { label: 'Net Revenue', value: report.netRevenue, color: 'text-green-700' },
    { label: 'Gross Margin', value: report.grossMargin, color: 'text-blue-600' },
    { label: 'CM1', value: report.cm1, color: 'text-blue-600' },
    { label: 'CM2', value: report.cm2, color: 'text-blue-600' },
    { label: 'EBITDA', value: report.ebitda, color: report.ebitda >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'Net Income', value: report.netIncome, color: report.netIncome >= 0 ? 'text-green-700' : 'text-red-600' },
  ];

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">P&L Preview</h3>
      <div className="space-y-2">
        {items.map(({ label, value, color }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-gray-600">{label}</span>
            <span className={`font-mono font-medium ${color}`}>
              {formatCurrencyFull(value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="flex justify-between text-xs text-gray-500">
          <span>EBITDA Margin</span>
          <span className="font-medium">{formatPercentage(report.ebitda, netRevenue)}</span>
        </div>
      </div>
    </div>
  );
}
