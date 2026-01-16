import React, { useState } from 'react';
import { MISReport } from '../types';
import { formatCurrencyFull, formatPercentage } from '../utils/cogsCalculator';

interface MISPreviewProps {
  report: MISReport;
  isVisible: boolean;
  onClose: () => void;
}

// VC Metrics Card Component
function MetricCard({ label, value, percentage, trend, color, size = 'normal' }: {
  label: string;
  value: number;
  percentage: string;
  trend?: 'positive' | 'negative' | 'neutral';
  color: string;
  size?: 'normal' | 'large';
}) {
  const trendColors = {
    positive: 'text-green-600',
    negative: 'text-red-600',
    neutral: 'text-gray-600'
  };

  return (
    <div className={`bg-white rounded-lg border ${color} p-4 ${size === 'large' ? 'col-span-2' : ''}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`font-bold ${size === 'large' ? 'text-2xl' : 'text-xl'} ${trend ? trendColors[trend] : 'text-gray-900'}`}>
        {formatCurrencyFull(value)}
      </div>
      <div className="text-sm text-gray-600 mt-1">{percentage}</div>
    </div>
  );
}

// Progress/Margin Bar
function MarginBar({ label, percentage, color }: { label: string; percentage: number; color: string }) {
  const isNegative = percentage < 0;
  const displayPct = Math.min(Math.abs(percentage), 100);

  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className={`font-semibold ${isNegative ? 'text-red-600' : 'text-gray-900'}`}>
          {isNegative ? '-' : ''}{displayPct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${isNegative ? 'bg-red-500' : color} rounded-full transition-all duration-500`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
    </div>
  );
}

interface LineItemProps {
  label: string;
  amount: number;
  percentage?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  indent?: number;
  isNegative?: boolean;
  source?: 'bs' | 'journal' | 'pr';  // bs = Balance Sheet, journal = Journal, pr = Purchase Register
}

function LineItem({ label, amount, percentage, isSubtotal, isTotal, indent = 0, isNegative, source }: LineItemProps) {
  const paddingLeft = indent * 20;

  const sourceColors = {
    bs: 'bg-green-50 border-l-2 border-green-400',
    journal: '',
    pr: 'bg-purple-50 border-l-2 border-purple-400'
  };

  return (
    <div
      className={`
        flex items-center justify-between py-1.5 px-3
        ${isTotal ? 'bg-blue-50 font-bold border-t-2 border-blue-300' : ''}
        ${isSubtotal ? 'bg-gray-50 font-semibold border-t border-gray-200' : ''}
        ${source && !isTotal && !isSubtotal ? sourceColors[source] : ''}
      `}
      style={{ paddingLeft: paddingLeft + 12 }}
    >
      <span className={`${isTotal ? 'text-blue-900' : isSubtotal ? 'text-gray-800' : 'text-gray-600'} flex items-center gap-2`}>
        {label}
        {source === 'bs' && !isTotal && !isSubtotal && (
          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">BS</span>
        )}
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

function SectionHeader({ title, source }: { title: string; source?: 'bs' | 'journal' }) {
  return (
    <div className={`px-3 py-2 font-semibold border-t border-b border-gray-200 flex items-center justify-between ${
      source === 'bs' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
    }`}>
      <span>{title}</span>
      {source === 'bs' && (
        <span className="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded">From Balance Sheet</span>
      )}
      {source === 'journal' && (
        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">From Journal</span>
      )}
    </div>
  );
}

function VarianceIndicator({ variance, label }: { variance: number; label: string }) {
  const isMatch = Math.abs(variance) < 1;
  const isPositive = variance > 0;

  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-gray-600">{label}:</span>
      <span className={`font-mono font-medium ${
        isMatch ? 'text-green-600' : isPositive ? 'text-amber-600' : 'text-red-600'
      }`}>
        {isPositive ? '+' : ''}{formatCurrencyFull(variance)}
        {isMatch && ' ✓'}
      </span>
    </div>
  );
}

export function MISPreview({ report, isVisible, onClose }: MISPreviewProps) {
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');

  if (!isVisible) return null;

  const netRevenue = report.netRevenue || 1;
  const hasBSData = report.bsNetSales > 0 || report.bsCOGS > 0;
  const hasPurchaseRegister = report.purchaseRegisterTotal > 0;

  // Calculate margin percentages
  const grossMarginPct = (report.grossMargin / netRevenue) * 100;
  const cm1Pct = (report.cm1 / netRevenue) * 100;
  const cm2Pct = (report.cm2 / netRevenue) * 100;
  const ebitdaPct = (report.ebitda / netRevenue) * 100;
  const netIncomePct = (report.netIncome / netRevenue) * 100;
  const cogsPct = (report.cogm / netRevenue) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800">P&L MIS Report</h2>
            <p className="text-sm text-gray-500 mt-1">
              {hasBSData ? 'Revenue & COGS from Balance Sheet' : 'All data from Journal classification'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('summary')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'summary'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                VC Summary
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'detailed'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Detailed View
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" id="mis-report-content">
          {/* VC Summary View */}
          {viewMode === 'summary' && (
            <div className="p-6 space-y-6">
              {/* Key Metrics Cards */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Key Financial Metrics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard
                    label="Net Revenue"
                    value={report.netRevenue}
                    percentage="100% of Revenue"
                    color="border-blue-200"
                    size="large"
                  />
                  <MetricCard
                    label="Gross Margin"
                    value={report.grossMargin}
                    percentage={`${grossMarginPct.toFixed(1)}% Margin`}
                    trend={grossMarginPct >= 30 ? 'positive' : grossMarginPct >= 15 ? 'neutral' : 'negative'}
                    color="border-green-200"
                  />
                  <MetricCard
                    label="EBITDA"
                    value={report.ebitda}
                    percentage={`${ebitdaPct.toFixed(1)}% Margin`}
                    trend={ebitdaPct >= 10 ? 'positive' : ebitdaPct >= 0 ? 'neutral' : 'negative'}
                    color="border-purple-200"
                  />
                  <MetricCard
                    label="Net Income"
                    value={report.netIncome}
                    percentage={`${netIncomePct.toFixed(1)}% Margin`}
                    trend={report.netIncome >= 0 ? 'positive' : 'negative'}
                    color="border-indigo-200"
                  />
                </div>
              </div>

              {/* Margin Waterfall */}
              <div className="bg-gray-50 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Margin Waterfall</h3>
                <div className="space-y-1">
                  <MarginBar label="Gross Margin" percentage={grossMarginPct} color="bg-green-500" />
                  <MarginBar label="CM1 (After Channel Costs)" percentage={cm1Pct} color="bg-blue-500" />
                  <MarginBar label="CM2 (After Marketing)" percentage={cm2Pct} color="bg-indigo-500" />
                  <MarginBar label="EBITDA" percentage={ebitdaPct} color="bg-purple-500" />
                  <MarginBar label="Net Income" percentage={netIncomePct} color="bg-violet-500" />
                </div>
              </div>

              {/* Unit Economics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cost Structure */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    Cost Structure (% of Revenue)
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">COGS</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(cogsPct, 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-12 text-right">{cogsPct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Channel & Fulfillment</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min((report.channelCosts / netRevenue) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-12 text-right">{((report.channelCosts / netRevenue) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Marketing</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${Math.min((report.marketing / netRevenue) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-12 text-right">{((report.marketing / netRevenue) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Platform</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((report.platform / netRevenue) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-12 text-right">{((report.platform / netRevenue) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Operating</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min((report.operating / netRevenue) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold w-12 text-right">{((report.operating / netRevenue) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* P&L Summary Table */}
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    P&L Summary
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-600">Net Revenue</span>
                      <span className="font-semibold">{formatCurrencyFull(report.netRevenue)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-600">(-) COGS</span>
                      <span className="font-semibold text-red-600">{formatCurrencyFull(report.cogm)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100 bg-green-50 -mx-2 px-2">
                      <span className="font-semibold text-green-800">= Gross Margin</span>
                      <span className="font-bold text-green-800">{formatCurrencyFull(report.grossMargin)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-600">(-) Channel Costs</span>
                      <span className="font-semibold text-red-600">{formatCurrencyFull(report.channelCosts)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-600">(-) Marketing</span>
                      <span className="font-semibold text-red-600">{formatCurrencyFull(report.marketing)}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-600">(-) Platform & Operating</span>
                      <span className="font-semibold text-red-600">{formatCurrencyFull(report.platform + report.operating)}</span>
                    </div>
                    <div className="flex justify-between py-2 bg-blue-50 -mx-2 px-2 rounded">
                      <span className="font-bold text-blue-800">= EBITDA</span>
                      <span className="font-bold text-blue-800">{formatCurrencyFull(report.ebitda)}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-gray-600">(-) Non-Operating</span>
                      <span className="font-semibold text-red-600">{formatCurrencyFull(report.nonOperating)}</span>
                    </div>
                    <div className={`flex justify-between py-2 -mx-2 px-2 rounded ${report.netIncome >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                      <span className={`font-bold ${report.netIncome >= 0 ? 'text-green-800' : 'text-red-800'}`}>= Net Income</span>
                      <span className={`font-bold ${report.netIncome >= 0 ? 'text-green-800' : 'text-red-800'}`}>{formatCurrencyFull(report.netIncome)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Channel Breakdown if data exists */}
              {Object.values(report.channelCostsBreakdown).some(v => v > 0) && (
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Channel & Fulfillment Breakdown</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(report.channelCostsBreakdown)
                      .filter(([, v]) => v > 0)
                      .sort(([, a], [, b]) => b - a)
                      .map(([item, amount]) => (
                        <div key={item} className="text-center p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-500 truncate mb-1">{item}</div>
                          <div className="font-semibold text-gray-800">{formatCurrencyFull(amount)}</div>
                          <div className="text-xs text-gray-500">{((amount / netRevenue) * 100).toFixed(1)}%</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Data Source Indicator */}
              <div className="text-xs text-gray-500 text-center py-2">
                {hasBSData ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                    Revenue & COGS from Balance Sheet (Authoritative)
                  </span>
                ) : (
                  <span>All data from Journal classification</span>
                )}
              </div>
            </div>
          )}

          {/* Detailed View */}
          {viewMode === 'detailed' && (
          <div className="mis-report">
            {/* Balance Sheet Source Indicator */}
            {hasBSData && (
              <div className="p-3 bg-green-50 border-b border-green-200 text-sm text-green-800 flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <strong>Balance Sheet data loaded.</strong> Revenue (Net Sales) and COGS are taken from the Balance Sheet as the authoritative source.
                </span>
              </div>
            )}

            {/* Revenue Section - FROM BALANCE SHEET */}
            <SectionHeader title="A. NET REVENUE" source={hasBSData ? 'bs' : undefined} />
            <LineItem
              label="Net Sales (Net of Discounts & GST)"
              amount={report.netRevenue}
              percentage="100.0%"
              source={hasBSData ? 'bs' : undefined}
            />
            {report.bsGrossSales > 0 && report.bsGrossSales !== report.bsNetSales && (
              <div className="text-xs text-gray-500 px-4 py-1 bg-gray-50">
                Gross Sales: {formatCurrencyFull(report.bsGrossSales)} (before discounts & GST)
              </div>
            )}
            <LineItem
              label="NET REVENUE"
              amount={report.netRevenue}
              percentage="100.0%"
              isTotal
            />

            {/* COGS Section - FROM BALANCE SHEET */}
            <SectionHeader title="B. COST OF GOODS SOLD (COGS)" source={hasBSData ? 'bs' : undefined} />
            {hasBSData && (
              <>
                <LineItem
                  label="Opening Stock"
                  amount={report.bsOpeningStock}
                  indent={1}
                  source="bs"
                />
                <LineItem
                  label="Add: Purchases"
                  amount={report.bsPurchases}
                  indent={1}
                  source="bs"
                />
                <LineItem
                  label="Less: Closing Stock"
                  amount={report.bsClosingStock}
                  indent={1}
                  isNegative
                  source="bs"
                />
              </>
            )}
            <LineItem
              label="TOTAL COGS"
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

            {/* Purchase Register Validation */}
            {hasPurchaseRegister && report.bsPurchases > 0 && (
              <div className="p-3 bg-purple-50 border-t border-purple-200">
                <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Purchase Register Validation
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-purple-700">Balance Sheet Purchases:</span>
                    <span className="font-mono text-purple-900">{formatCurrencyFull(report.bsPurchases)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-700">Purchase Register Total:</span>
                    <span className="font-mono text-purple-900">{formatCurrencyFull(report.purchaseRegisterTotal)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-purple-200">
                    <span className="text-purple-800 font-medium">Variance:</span>
                    <span className={`font-mono font-bold ${
                      Math.abs(report.purchaseVariance) < 1 ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      {report.purchaseVariance > 0 ? '+' : ''}{formatCurrencyFull(report.purchaseVariance)}
                      {Math.abs(report.purchaseVariance) < 1 && ' ✓'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Channel Costs - FROM JOURNAL */}
            <SectionHeader title="C. CHANNEL & FULFILLMENT COSTS" source="journal" />
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

            {/* Marketing - FROM JOURNAL */}
            <SectionHeader title="D. SALES & MARKETING" source="journal" />
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

            {/* Platform Costs - FROM JOURNAL */}
            <SectionHeader title="E. PLATFORM COSTS" source="journal" />
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

            {/* Operating Expenses - FROM JOURNAL */}
            <SectionHeader title="F. OPERATING EXPENSES" source="journal" />
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
            <SectionHeader title="G. NON-OPERATING" source="journal" />
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

            {/* Validation Section */}
            {hasBSData && (report.journalRevenue > 0 || report.journalCOGM > 0) && (
              <div className="p-4 bg-amber-50 border-t-2 border-amber-300">
                <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  JOURNAL VALIDATION
                </h3>
                <p className="text-xs text-amber-700 mb-3">
                  Revenue and COGS classified in Journal (for reference - Balance Sheet is authoritative)
                </p>
                <div className="space-y-2 text-sm">
                  {report.journalRevenue > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-amber-700">Journal Gross Revenue:</span>
                        <span className="font-mono text-amber-900">{formatCurrencyFull(report.journalRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-700">Journal Net Revenue:</span>
                        <span className="font-mono text-amber-900">{formatCurrencyFull(report.journalNetRevenue)}</span>
                      </div>
                      <VarianceIndicator
                        variance={report.revenueVariance}
                        label="Revenue Variance (BS - Journal)"
                      />
                    </>
                  )}
                  {report.journalCOGM > 0 && (
                    <>
                      <div className="flex justify-between pt-2 border-t border-amber-200">
                        <span className="text-amber-700">Journal COGM:</span>
                        <span className="font-mono text-amber-900">{formatCurrencyFull(report.journalCOGM)}</span>
                      </div>
                      <VarianceIndicator
                        variance={report.cogsVariance}
                        label="COGS Variance (BS - Journal)"
                      />
                    </>
                  )}
                  {report.bsNetProfit !== 0 && (
                    <>
                      <div className="flex justify-between pt-2 border-t border-amber-200">
                        <span className="text-amber-700">BS Net Profit:</span>
                        <span className="font-mono text-amber-900">{formatCurrencyFull(report.bsNetProfit)}</span>
                      </div>
                      <VarianceIndicator
                        variance={report.profitVariance}
                        label="Profit Variance (BS - Calculated)"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

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

            {/* Data Sources Legend */}
            <div className="p-4 bg-gray-100 border-t border-gray-200">
              <h3 className="text-xs font-semibold text-gray-500 mb-2">DATA SOURCES:</h3>
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-400 rounded"></span>
                  <span className="text-gray-600">Balance Sheet (Authoritative)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-gray-300 rounded"></span>
                  <span className="text-gray-600">Journal (Expenses)</span>
                </div>
                {hasPurchaseRegister && (
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-purple-400 rounded"></span>
                    <span className="text-gray-600">Purchase Register (Validation)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
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
  const hasBSData = report.bsNetSales > 0;

  const items = [
    { label: 'Net Revenue', value: report.netRevenue, color: 'text-green-700', source: hasBSData ? '(BS)' : '' },
    { label: 'COGS', value: report.cogm, color: 'text-red-600', source: hasBSData ? '(BS)' : '' },
    { label: 'Gross Margin', value: report.grossMargin, color: 'text-blue-600', source: '' },
    { label: 'CM1', value: report.cm1, color: 'text-blue-600', source: '' },
    { label: 'CM2', value: report.cm2, color: 'text-blue-600', source: '' },
    { label: 'EBITDA', value: report.ebitda, color: report.ebitda >= 0 ? 'text-green-600' : 'text-red-600', source: '' },
    { label: 'Net Income', value: report.netIncome, color: report.netIncome >= 0 ? 'text-green-700' : 'text-red-600', source: '' },
  ];

  return (
    <div className="bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        P&L Preview
        {hasBSData && (
          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">BS Data</span>
        )}
      </h3>
      <div className="space-y-2">
        {items.map(({ label, value, color, source }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-gray-600">
              {label}
              {source && <span className="text-[10px] text-green-600 ml-1">{source}</span>}
            </span>
            <span className={`font-mono font-medium ${color}`}>
              {formatCurrencyFull(value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Gross Margin %</span>
          <span className="font-medium">{formatPercentage(report.grossMargin, netRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>EBITDA %</span>
          <span className="font-medium">{formatPercentage(report.ebitda, netRevenue)}</span>
        </div>
      </div>
    </div>
  );
}
