import React, { useState } from 'react';
import { MISRecord, MISPeriod, periodToString, SalesChannel, SALES_CHANNELS } from '../../types/misTracking';
import { formatCurrency, formatCurrencyFull, formatPercent } from '../../utils/misCalculator';

interface MISMonthlyViewProps {
  currentMIS: MISRecord | null;
  savedPeriods: { periodKey: string; period: MISPeriod }[];
  onPeriodChange: (periodKey: string) => void;
}

export function MISMonthlyView({ currentMIS, savedPeriods, onPeriodChange }: MISMonthlyViewProps) {
  const [showChannelBreakdown, setShowChannelBreakdown] = useState(true);
  const [showAlgorithmGuide, setShowAlgorithmGuide] = useState(false);

  if (!currentMIS) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-600 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-300 mb-2">No MIS Data</h3>
        <p className="text-slate-500 mb-4">
          {savedPeriods.length > 0
            ? 'Select a period from the dropdown or upload new data'
            : 'Upload documents in the Upload tab to generate MIS'
          }
        </p>

        {savedPeriods.length > 0 && (
          <select
            onChange={(e) => onPeriodChange(e.target.value)}
            className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-200"
          >
            <option value="">Select a period...</option>
            {savedPeriods.map(p => (
              <option key={p.periodKey} value={p.periodKey}>
                {periodToString(p.period)}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  const { revenue, cogm, channelFulfillment, salesMarketing, platformCosts, operatingExpenses, nonOperating } = currentMIS;
  const netRevenue = revenue.netRevenue;

  return (
    <div className="space-y-6">
      {/* Period Selector & Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-semibold text-slate-200">
            MIS for {periodToString(currentMIS.period)}
          </h3>

          {savedPeriods.length > 1 && (
            <select
              value={currentMIS.periodKey}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200"
            >
              {savedPeriods.map(p => (
                <option key={p.periodKey} value={p.periodKey}>
                  {periodToString(p.period)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center text-sm text-slate-400">
            <input
              type="checkbox"
              checked={showChannelBreakdown}
              onChange={(e) => setShowChannelBreakdown(e.target.checked)}
              className="mr-2 rounded bg-slate-700 border-slate-600"
            />
            Show channel breakdown
          </label>

          <button
            onClick={() => setShowAlgorithmGuide(true)}
            className="px-4 py-2 text-sm text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors"
          >
            Algorithm Guide
          </button>

          <button className="px-4 py-2 text-sm text-slate-400 border border-slate-600 rounded-lg hover:bg-slate-700/50 hover:text-slate-300 transition-colors">
            Export
          </button>
        </div>
      </div>

      {/* Algorithm Guide Modal */}
      {showAlgorithmGuide && (
        <AlgorithmGuideModal onClose={() => setShowAlgorithmGuide(false)} />
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Net Revenue"
          value={formatCurrency(netRevenue)}
          color="blue"
        />
        <MetricCard
          label="Gross Margin"
          value={formatPercent(currentMIS.grossMarginPercent)}
          subValue={formatCurrency(currentMIS.grossMargin)}
          color="emerald"
        />
        <MetricCard
          label="CM1"
          value={formatPercent(currentMIS.cm1Percent)}
          subValue={formatCurrency(currentMIS.cm1)}
          color="violet"
        />
        <MetricCard
          label="EBITDA"
          value={formatPercent(currentMIS.ebitdaPercent)}
          subValue={formatCurrency(currentMIS.ebitda)}
          color={currentMIS.ebitda >= 0 ? 'emerald' : 'red'}
        />
      </div>

      {/* P&L Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/50 border-b border-slate-700">
              <th className="text-left py-3 px-4 font-medium text-slate-300 text-sm">P&L</th>
              <th className="text-right py-3 px-4 font-medium text-slate-300 text-sm">Amount</th>
              <th className="text-right py-3 px-4 font-medium text-slate-300 text-sm">% of Net Rev</th>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <th key={channel} className="text-right py-3 px-4 font-medium text-slate-400 text-xs">
                  {channel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* A. Total Revenue (With GST) */}
            <SectionHeader label="A" title="Total Revenue (With GST)" />
            {SALES_CHANNELS.map((channel, idx) => (
              <LineItem
                key={channel}
                number={idx + 1}
                label={channel}
                amount={revenue.grossRevenue[channel]}
                netRevenue={netRevenue}
                showChannelBreakdown={showChannelBreakdown}
                channelValues={{ [channel]: revenue.grossRevenue[channel] }}
              />
            ))}
            <SubtotalRow
              number={6}
              label="Gross Revenue"
              amount={revenue.totalGrossRevenue}
              netRevenue={netRevenue}
              showChannelBreakdown={showChannelBreakdown}
            />

            {/* B. Less: Returns */}
            <SectionHeader label="B" title="Less: RETURNS" subtitle="(Enter as positive numbers)" />
            {SALES_CHANNELS.map((channel, idx) => (
              <LineItem
                key={channel}
                number={idx + 1}
                label={channel}
                amount={revenue.returns[channel]}
                netRevenue={netRevenue}
                showChannelBreakdown={showChannelBreakdown}
                channelValues={{ [channel]: revenue.returns[channel] }}
              />
            ))}
            <SubtotalRow
              number={6}
              label="Total Returns"
              amount={revenue.totalReturns}
              netRevenue={netRevenue}
              showChannelBreakdown={showChannelBreakdown}
              highlight="orange"
            />

            {/* Stock Transfers (if any) */}
            {revenue.totalStockTransfers > 0 && (
              <>
                <tr className="bg-purple-500/10">
                  <td colSpan={showChannelBreakdown ? 3 + SALES_CHANNELS.length : 3} className="py-2 px-4">
                    <span className="font-medium text-purple-400">Stock Transfers (Excluded)</span>
                    <span className="ml-4 text-purple-400">{formatCurrencyFull(revenue.totalStockTransfers)}</span>
                    <span className="ml-4 text-sm text-purple-400/70">
                      {revenue.stockTransfers.map(t => `${t.fromState}→${t.toState}: ${formatCurrency(t.amount)}`).join(' | ')}
                    </span>
                  </td>
                </tr>
              </>
            )}

            {/* Total Revenue Line */}
            <tr className="bg-slate-700/30 font-semibold">
              <td className="py-3 px-4 text-slate-200 text-sm">
                <span className="mr-2 text-slate-500">7</span>
                Total Revenue
              </td>
              <td className="py-3 px-4 text-right text-slate-200 text-sm">{formatCurrencyFull(revenue.totalRevenue)}</td>
              <td className="py-3 px-4 text-right text-slate-400 text-sm">-</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-3 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>

            {/* D. Less: Taxes */}
            <SectionHeader label="D" title="Less: Taxes (GST)" subtitle="(Enter as positive numbers)" />
            {SALES_CHANNELS.map((channel, idx) => (
              <LineItem
                key={channel}
                number={idx + 1}
                label={channel}
                amount={revenue.taxes[channel]}
                netRevenue={netRevenue}
                showChannelBreakdown={showChannelBreakdown}
                channelValues={{ [channel]: revenue.taxes[channel] }}
              />
            ))}
            <SubtotalRow
              number={6}
              label="Total Taxes"
              amount={revenue.totalTaxes}
              netRevenue={netRevenue}
              showChannelBreakdown={showChannelBreakdown}
              highlight="purple"
            />

            {/* NET REVENUE */}
            <tr className="bg-orange-500/20 font-bold">
              <td className="py-4 px-4 text-orange-400 text-sm">NET REVENUE</td>
              <td className="py-4 px-4 text-right text-orange-400 text-sm">{formatCurrencyFull(netRevenue)}</td>
              <td className="py-4 px-4 text-right text-orange-400/80 text-sm">100%</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-orange-400/50 text-xs">-</td>
              ))}
            </tr>

            {/* E. COGM */}
            <SectionHeader label="E" title="COST OF GOODS MANUFACTURED (COGM)" />
            <LineItem number={1} label="Raw Materials & Inventory" amount={cogm.rawMaterialsInventory} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Manufacturing Wages" amount={cogm.manufacturingWages} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Contract Wages (Mfg)" amount={cogm.contractWagesMfg} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={4} label="Inbound Transport" amount={cogm.inboundTransport} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={5} label="Factory Rent" amount={cogm.factoryRent} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS@10%" />
            <LineItem number={6} label="Factory Electricity" amount={cogm.factoryElectricity} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={7} label="Factory Maintainence" amount={cogm.factoryMaintenance} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="Power Backup" />
            <LineItem number={8} label="Job work" amount={cogm.jobWork} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={9} label="Total COGM" amount={cogm.totalCOGM} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="blue" />

            {/* GROSS MARGIN */}
            <tr className="bg-emerald-500/20 font-bold">
              <td className="py-4 px-4 text-emerald-400 text-sm">GROSS MARGIN (NET REVENUE - COGS)</td>
              <td className="py-4 px-4 text-right text-emerald-400 text-sm">{formatCurrencyFull(currentMIS.grossMargin)}</td>
              <td className="py-4 px-4 text-right text-emerald-400/80 text-sm">{formatPercent(currentMIS.grossMarginPercent)}</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-emerald-400/50 text-xs">-</td>
              ))}
            </tr>

            {/* F. Channel & Fulfillment */}
            <SectionHeader label="F" title="CHANNEL & FULFILLMENT" />
            <LineItem number={1} label="Amazon Fees" amount={channelFulfillment.amazonFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Blinkit Fees" amount={channelFulfillment.blinkitFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="D2C Fees" amount={channelFulfillment.d2cFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={7} label="Total Channel & Fulfillment" amount={channelFulfillment.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="indigo" />

            {/* CM1 */}
            <MarginRow label="CM1 (CONTRIBUTION MARGIN)" sublabel="(NET REVENUE - (COGS + CHANNEL&FULFILLMENT COSTS))" amount={currentMIS.cm1} percent={currentMIS.cm1Percent} showChannelBreakdown={showChannelBreakdown} />

            {/* G. Sales & Marketing */}
            <SectionHeader label="G" title="SALES & MARKETING (S&M)" />
            <LineItem number={1} label="Facebook Ads" amount={salesMarketing.facebookAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={2} label="Google Ads" amount={salesMarketing.googleAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={3} label="Amazon Ads" amount={salesMarketing.amazonAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={4} label="Blinkit Ads" amount={salesMarketing.blinkitAds} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Refund @2%" />
            <LineItem number={5} label="Agency Fees" amount={salesMarketing.agencyFees} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="TDS Deduct @10%" />
            <SubtotalRow number={7} label="Total S&M" amount={salesMarketing.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="pink" />

            {/* CM2 */}
            <MarginRow label="CM2 (AFTER MARKETING)" sublabel="(CM1 - MARKETING EXPENSES)" amount={currentMIS.cm2} percent={currentMIS.cm2Percent} showChannelBreakdown={showChannelBreakdown} />

            {/* H. Platform Costs */}
            <SectionHeader label="H" title="CHANNEL/PLATFORM OPERATION COSTS" />
            <LineItem number={1} label="Shopify Subscription" amount={platformCosts.shopifySubscription} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Wati Subscription" amount={platformCosts.watiSubscription} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Shopflo subscription" amount={platformCosts.shopfloSubscription} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={7} label="Total Channel and Platform Costs" amount={platformCosts.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="cyan" />

            {/* CM3 */}
            <MarginRow label="CM3 (AFTER CHANNEL OPERATIONS)" sublabel="(CM2 - CHANNEL OPERATIONS)" amount={currentMIS.cm3} percent={currentMIS.cm3Percent} showChannelBreakdown={showChannelBreakdown} />

            {/* I. Operating Expenses */}
            <SectionHeader label="I" title="OPERATING EXPENSES" />
            <LineItem number={1} label="Salaries (Admin, Mgmt)" amount={operatingExpenses.salariesAdminMgmt} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Miscellaneous (Travel, insurance)" amount={operatingExpenses.miscellaneous} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Legal & CA expenses" amount={operatingExpenses.legalCaExpenses} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={4} label="Platform Costs (CRM, inventory softwares)" amount={operatingExpenses.platformCostsCRM} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} note="Capex" />
            <LineItem number={5} label="Administrative Expenses (Office Rent, utilities, admin supplies)" amount={operatingExpenses.administrativeExpenses} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={6} label="Total Operating Expense" amount={operatingExpenses.total} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="yellow" />

            {/* EBITDA */}
            <tr className={`font-bold ${currentMIS.ebitda >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              <td className={`py-4 px-4 text-sm ${currentMIS.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                OPERATING PROFIT (EBITDA) (CM3 - Operating Expenses)
              </td>
              <td className={`py-4 px-4 text-right text-sm ${currentMIS.ebitda >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrencyFull(currentMIS.ebitda)}
              </td>
              <td className={`py-4 px-4 text-right text-sm ${currentMIS.ebitda >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                {formatPercent(currentMIS.ebitdaPercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>

            {/* J. Non-Operating */}
            <SectionHeader label="J" title="NON-OPERATING" />
            <LineItem number={1} label="Less: Interest Expense" amount={nonOperating.interestExpense} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Less: Depreciation" amount={nonOperating.depreciation} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Less: Amortization" amount={nonOperating.amortization} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={4} label="Total I,D&A" amount={nonOperating.totalIDA} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="gray" />

            {/* EBT */}
            <tr className={`font-bold ${currentMIS.ebt >= 0 ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
              <td className={`py-4 px-4 text-sm ${currentMIS.ebt >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                NET INCOME Before Tax (EBT)
              </td>
              <td className={`py-4 px-4 text-right text-sm ${currentMIS.ebt >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {formatCurrencyFull(currentMIS.ebt)}
              </td>
              <td className={`py-4 px-4 text-right text-sm ${currentMIS.ebt >= 0 ? 'text-blue-400/80' : 'text-red-400/80'}`}>
                {formatPercent(currentMIS.ebtPercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>

            {/* Income Tax */}
            <LineItem number={4} label="Less: Income Tax" amount={nonOperating.incomeTax} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />

            {/* NET INCOME */}
            <tr className={`font-bold ${currentMIS.netIncome >= 0 ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
              <td className={`py-4 px-4 text-sm ${currentMIS.netIncome >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                NET INCOME (PROFIT / LOSS)
              </td>
              <td className={`py-4 px-4 text-right text-sm ${currentMIS.netIncome >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatCurrencyFull(currentMIS.netIncome)}
              </td>
              <td className={`py-4 px-4 text-right text-sm ${currentMIS.netIncome >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                {formatPercent(currentMIS.netIncomePercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-slate-500 text-xs">-</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function MetricCard({ label, value, subValue, color }: { label: string; value: string; subValue?: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400'
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
    </div>
  );
}

function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <tr className="bg-amber-500/15">
      <td colSpan={100} className="py-3 px-4">
        <span className="font-bold text-amber-400">{label}</span>
        <span className="ml-3 font-semibold text-amber-400">{title}</span>
        {subtitle && <span className="ml-2 text-sm text-amber-400/70">{subtitle}</span>}
      </td>
    </tr>
  );
}

function LineItem({
  number,
  label,
  amount,
  netRevenue,
  showChannelBreakdown,
  channelValues,
  note
}: {
  number: number;
  label: string;
  amount: number;
  netRevenue: number;
  showChannelBreakdown: boolean;
  channelValues?: Partial<Record<SalesChannel, number>>;
  note?: string;
}) {
  const percent = netRevenue > 0 ? (amount / netRevenue) * 100 : 0;

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-700/20">
      <td className="py-2 px-4 text-slate-300 text-sm">
        <span className="text-slate-500 mr-2">{number}</span>
        {label}
        {note && <span className="ml-2 text-xs text-slate-500">{note}</span>}
      </td>
      <td className="py-2 px-4 text-right text-slate-300 text-sm">{formatCurrencyFull(amount)}</td>
      <td className="py-2 px-4 text-right text-slate-500 text-sm">{amount > 0 ? formatPercent(percent) : '-'}</td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-2 px-4 text-right text-slate-500 text-xs">
          {channelValues?.[channel] ? formatCurrency(channelValues[channel]!) : '-'}
        </td>
      ))}
    </tr>
  );
}

function SubtotalRow({
  number,
  label,
  amount,
  netRevenue,
  showChannelBreakdown,
  highlight
}: {
  number: number;
  label: string;
  amount: number;
  netRevenue: number;
  showChannelBreakdown: boolean;
  highlight?: string;
}) {
  const percent = netRevenue > 0 ? (amount / netRevenue) * 100 : 0;

  const bgClasses: Record<string, string> = {
    orange: 'bg-orange-500/10',
    purple: 'bg-purple-500/10',
    blue: 'bg-blue-500/10',
    indigo: 'bg-indigo-500/10',
    pink: 'bg-pink-500/10',
    cyan: 'bg-cyan-500/10',
    yellow: 'bg-yellow-500/10',
    gray: 'bg-slate-700/30'
  };

  return (
    <tr className={`font-semibold ${highlight ? bgClasses[highlight] : 'bg-slate-700/20'}`}>
      <td className="py-3 px-4 text-slate-200 text-sm">
        <span className="text-slate-500 mr-2">{number}</span>
        {label}
      </td>
      <td className="py-3 px-4 text-right text-slate-200 text-sm">{formatCurrencyFull(amount)}</td>
      <td className="py-3 px-4 text-right text-slate-400 text-sm">{formatPercent(percent)}</td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-3 px-4 text-right text-slate-500 text-xs">-</td>
      ))}
    </tr>
  );
}

function MarginRow({
  label,
  sublabel,
  amount,
  percent,
  showChannelBreakdown
}: {
  label: string;
  sublabel: string;
  amount: number;
  percent: number;
  showChannelBreakdown: boolean;
}) {
  const isPositive = amount >= 0;

  return (
    <tr className={isPositive ? 'bg-emerald-500/15' : 'bg-red-500/15'}>
      <td className={`py-3 px-4 font-semibold text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {label}
        <div className="text-xs font-normal text-slate-500">{sublabel}</div>
      </td>
      <td className={`py-3 px-4 text-right font-semibold text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
        {formatCurrencyFull(amount)}
      </td>
      <td className={`py-3 px-4 text-right font-semibold text-sm ${isPositive ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
        {formatPercent(percent)}
      </td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-3 px-4 text-right text-slate-500 text-xs">-</td>
      ))}
    </tr>
  );
}

// ============================================
// ALGORITHM GUIDE MODAL
// ============================================

function AlgorithmGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-slate-700/50 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">MIS Calculation Algorithm Guide</h2>
            <p className="text-sm text-slate-400">How data flows from source files to the P&L report</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-600/50 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)] space-y-6 text-sm">
          {/* Data Sources */}
          <Section title="1. Data Sources & Fetching" color="blue">
            <p className="text-slate-400 mb-3">The system fetches 4 types of files from Google Drive for each state:</p>
            <ul className="space-y-2 text-slate-300">
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">BS.pdf</span>
                <span className="text-slate-500">→</span>
                <span><strong>Balance Sheet</strong> - Authoritative source for Opening Stock, Closing Stock, Purchases, Net Sales</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">SR.xlsx</span>
                <span className="text-slate-500">→</span>
                <span><strong>Sales Register</strong> - Line-by-line sales with party names, amounts, GST (for channel classification)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">PR.xlsx</span>
                <span className="text-slate-500">→</span>
                <span><strong>Purchase Register</strong> - Purchase details (used for validation against BS)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 font-mono">JR.xlsx</span>
                <span className="text-slate-500">→</span>
                <span><strong>Journal Register</strong> - All expense transactions for classification into cost heads</span>
              </li>
            </ul>
            <div className="mt-3 p-3 bg-slate-700/30 rounded-lg text-slate-400">
              <strong className="text-slate-300">Note:</strong> All 4 files are optional. MIS can be generated with whatever files are available.
            </div>
          </Section>

          {/* Revenue Calculation */}
          <Section title="2. Revenue Calculation (from Sales Register)" color="emerald">
            <div className="space-y-3">
              <div className="p-3 bg-slate-700/30 rounded-lg">
                <div className="font-mono text-emerald-400 mb-2">Net Revenue = Gross Sales - Returns - Stock Transfers - GST</div>
              </div>
              <p className="text-slate-400">Sales are classified into channels based on party name patterns:</p>
              <ul className="space-y-1 text-slate-300 ml-4">
                <li>• <strong>Amazon</strong>: "Amazon", "AMZN", "AMZ"</li>
                <li>• <strong>Blinkit</strong>: "Blinkit", "Grofers"</li>
                <li>• <strong>Website</strong>: "Shopify", "Website", direct D2C orders</li>
                <li>• <strong>Offline/OEM</strong>: Distributors, B2B orders</li>
                <li>• <strong>Other</strong>: Unclassified sales</li>
              </ul>
              <p className="text-slate-400 mt-2">
                <strong>Stock Transfers</strong> (inter-company between states like UP→KA) are identified and excluded from net revenue.
              </p>
            </div>
          </Section>

          {/* COGS Calculation */}
          <Section title="3. COGS (Cost of Goods Sold)" color="orange">
            <div className="p-3 bg-slate-700/30 rounded-lg font-mono text-orange-400">
              COGS = Opening Stock + Purchases - Closing Stock
            </div>
            <p className="text-slate-400 mt-3">
              All values are sourced from the <strong>Balance Sheet (BS.pdf)</strong> which is considered the authoritative source.
              The Purchase Register is used for validation to ensure purchases match.
            </p>
            <div className="mt-3 p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
              <div className="font-mono text-orange-400">Gross Margin = Net Revenue - COGS</div>
              <div className="text-slate-400 text-xs mt-1">Gross Margin % = (Gross Margin / Net Revenue) × 100</div>
            </div>
          </Section>

          {/* Expense Classification */}
          <Section title="4. Expense Classification (from Journal Register)" color="violet">
            <p className="text-slate-400 mb-3">
              Journal transactions are classified into expense heads based on account name patterns:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <ExpenseCategory
                title="Channel & Fulfillment"
                color="blue"
                items={["Shipping & Freight", "Packaging Materials", "Marketplace Fees", "Payment Gateway Charges", "Warehousing"]}
              />
              <ExpenseCategory
                title="Sales & Marketing"
                color="pink"
                items={["Advertising (Amazon, FB, Google)", "Influencer Marketing", "Promotions & Discounts", "Brand Building"]}
              />
              <ExpenseCategory
                title="Platform Costs"
                color="cyan"
                items={["Software Subscriptions", "IT Infrastructure", "ERP/Accounting Tools", "Hosting & Domains"]}
              />
              <ExpenseCategory
                title="Operating Expenses"
                color="yellow"
                items={["Salaries & Wages", "Rent & Utilities", "Legal & Professional", "Travel & Conveyance", "Office Expenses"]}
              />
            </div>
            <div className="mt-3 p-3 bg-slate-700/30 rounded-lg text-slate-400">
              <strong className="text-slate-300">Unclassified:</strong> Transactions that don't match any pattern are flagged for manual review.
              You can teach the system by classifying them - patterns are learned for future use.
            </div>
          </Section>

          {/* Contribution Margins */}
          <Section title="5. Contribution Margins (CM1, CM2, CM3)" color="indigo">
            <div className="space-y-3">
              <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="font-mono text-emerald-400">CM1 = Gross Margin - Channel & Fulfillment Costs</div>
                <div className="text-slate-400 text-xs mt-1">
                  Shows profitability after direct selling costs. Should be positive for viable unit economics.
                </div>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="font-mono text-blue-400">CM2 = CM1 - Sales & Marketing Costs</div>
                <div className="text-slate-400 text-xs mt-1">
                  Shows profitability after customer acquisition costs. Key metric for marketing efficiency.
                </div>
              </div>
              <div className="p-3 bg-violet-500/10 rounded-lg border border-violet-500/20">
                <div className="font-mono text-violet-400">CM3 = CM2 - Platform Costs</div>
                <div className="text-slate-400 text-xs mt-1">
                  Shows contribution before operating overhead. Useful for scaling decisions.
                </div>
              </div>
            </div>
          </Section>

          {/* EBITDA */}
          <Section title="6. EBITDA Calculation" color="emerald">
            <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <div className="font-mono text-emerald-400">EBITDA = CM3 - Operating Expenses</div>
              <div className="text-slate-400 text-xs mt-1">
                Earnings Before Interest, Taxes, Depreciation & Amortization
              </div>
            </div>
            <p className="text-slate-400 mt-3">
              EBITDA represents the operational profitability of the business, excluding financing and accounting decisions.
              A positive EBITDA indicates the core business operations are profitable.
            </p>
          </Section>

          {/* P&L Formula Summary */}
          <Section title="7. Complete P&L Flow" color="slate">
            <div className="font-mono text-xs bg-slate-900 p-4 rounded-lg space-y-1 text-slate-300">
              <div><span className="text-blue-400">Gross Sales</span> (by channel from Sales Register)</div>
              <div className="text-slate-500">  - Returns</div>
              <div className="text-slate-500">  - Stock Transfers (inter-company)</div>
              <div className="text-slate-500">  - GST on Sales</div>
              <div>= <span className="text-emerald-400">Net Revenue</span></div>
              <div className="text-slate-500">  - COGS (from Balance Sheet)</div>
              <div>= <span className="text-emerald-400">Gross Margin</span></div>
              <div className="text-slate-500">  - Channel & Fulfillment (from Journal)</div>
              <div>= <span className="text-blue-400">CM1</span></div>
              <div className="text-slate-500">  - Sales & Marketing (from Journal)</div>
              <div>= <span className="text-blue-400">CM2</span></div>
              <div className="text-slate-500">  - Platform Costs (from Journal)</div>
              <div>= <span className="text-violet-400">CM3</span></div>
              <div className="text-slate-500">  - Operating Expenses (from Journal)</div>
              <div>= <span className="text-emerald-400 font-bold">EBITDA</span></div>
            </div>
          </Section>

          {/* Multi-State Aggregation */}
          <Section title="8. Multi-State Aggregation" color="purple">
            <p className="text-slate-400">
              When multiple states are selected (UP, Maharashtra, Karnataka, etc.), the system:
            </p>
            <ul className="mt-2 space-y-1 text-slate-300 ml-4">
              <li>• Aggregates revenue from all states</li>
              <li>• Sums COGS across all states (each state has its own opening/closing stock)</li>
              <li>• Combines journal expenses from all states</li>
              <li>• Removes inter-company stock transfers (e.g., UP→KA) from revenue</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const borderColors: Record<string, string> = {
    blue: 'border-l-blue-500',
    emerald: 'border-l-emerald-500',
    orange: 'border-l-orange-500',
    violet: 'border-l-violet-500',
    indigo: 'border-l-indigo-500',
    purple: 'border-l-purple-500',
    slate: 'border-l-slate-500'
  };

  return (
    <div className={`border-l-2 ${borderColors[color] || borderColors.slate} pl-4`}>
      <h3 className="text-base font-semibold text-slate-200 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ExpenseCategory({ title, color, items }: { title: string; color: string; items: string[] }) {
  const bgColors: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/20',
    pink: 'bg-pink-500/10 border-pink-500/20',
    cyan: 'bg-cyan-500/10 border-cyan-500/20',
    yellow: 'bg-yellow-500/10 border-yellow-500/20'
  };

  return (
    <div className={`p-3 rounded-lg border ${bgColors[color] || bgColors.blue}`}>
      <div className="font-medium text-slate-200 mb-2">{title}</div>
      <ul className="text-xs text-slate-400 space-y-0.5">
        {items.map((item, idx) => (
          <li key={idx}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
