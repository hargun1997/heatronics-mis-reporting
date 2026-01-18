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

  if (!currentMIS) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-700 mb-2">No MIS Data</h3>
        <p className="text-gray-500 mb-4">
          {savedPeriods.length > 0
            ? 'Select a period from the dropdown or upload new data'
            : 'Upload documents in the Upload tab to generate MIS'
          }
        </p>

        {savedPeriods.length > 0 && (
          <select
            onChange={(e) => onPeriodChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
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
          <h3 className="text-lg font-semibold text-gray-800">
            MIS for {periodToString(currentMIS.period)}
          </h3>

          {savedPeriods.length > 1 && (
            <select
              value={currentMIS.periodKey}
              onChange={(e) => onPeriodChange(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              {savedPeriods.map(p => (
                <option key={p.periodKey} value={p.periodKey}>
                  {periodToString(p.period)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showChannelBreakdown}
              onChange={(e) => setShowChannelBreakdown(e.target.checked)}
              className="mr-2"
            />
            Show channel breakdown
          </label>

          <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Export
          </button>
        </div>
      </div>

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
          color="green"
        />
        <MetricCard
          label="CM1"
          value={formatPercent(currentMIS.cm1Percent)}
          subValue={formatCurrency(currentMIS.cm1)}
          color="purple"
        />
        <MetricCard
          label="EBITDA"
          value={formatPercent(currentMIS.ebitdaPercent)}
          subValue={formatCurrency(currentMIS.ebitda)}
          color={currentMIS.ebitda >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* P&L Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">P&L</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount (₹)</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">% of Net Rev</th>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <th key={channel} className="text-right py-3 px-4 font-semibold text-gray-700 text-sm">
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
                <tr className="bg-purple-50">
                  <td colSpan={showChannelBreakdown ? 3 + SALES_CHANNELS.length : 3} className="py-2 px-4">
                    <span className="font-medium text-purple-700">Stock Transfers (Excluded)</span>
                    <span className="ml-4 text-purple-600">{formatCurrencyFull(revenue.totalStockTransfers)}</span>
                    <span className="ml-4 text-sm text-purple-500">
                      {revenue.stockTransfers.map(t => `${t.fromState}→${t.toState}: ${formatCurrency(t.amount)}`).join(' | ')}
                    </span>
                  </td>
                </tr>
              </>
            )}

            {/* Total Revenue Line */}
            <tr className="bg-gray-100 font-semibold">
              <td className="py-3 px-4 text-gray-800">
                <span className="mr-2">7</span>
                Total Revenue
              </td>
              <td className="py-3 px-4 text-right text-gray-800">{formatCurrencyFull(revenue.totalRevenue)}</td>
              <td className="py-3 px-4 text-right text-gray-600">-</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-3 px-4 text-right text-gray-600 text-sm">-</td>
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
            <tr className="bg-orange-100 font-bold">
              <td className="py-4 px-4 text-orange-800">NET REVENUE</td>
              <td className="py-4 px-4 text-right text-orange-800">{formatCurrencyFull(netRevenue)}</td>
              <td className="py-4 px-4 text-right text-orange-700">100%</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-orange-700 text-sm">-</td>
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
            <tr className="bg-green-100 font-bold">
              <td className="py-4 px-4 text-green-800">GROSS MARGIN (NET REVENUE - COGS)</td>
              <td className="py-4 px-4 text-right text-green-800">{formatCurrencyFull(currentMIS.grossMargin)}</td>
              <td className="py-4 px-4 text-right text-green-700">{formatPercent(currentMIS.grossMarginPercent)}</td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-green-700 text-sm">-</td>
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
            <tr className={`font-bold ${currentMIS.ebitda >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <td className={`py-4 px-4 ${currentMIS.ebitda >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                OPERATING PROFIT (EBITDA) (CM3 - Operating Expenses)
              </td>
              <td className={`py-4 px-4 text-right ${currentMIS.ebitda >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                {formatCurrencyFull(currentMIS.ebitda)}
              </td>
              <td className={`py-4 px-4 text-right ${currentMIS.ebitda >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatPercent(currentMIS.ebitdaPercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-gray-500 text-sm">-</td>
              ))}
            </tr>

            {/* J. Non-Operating */}
            <SectionHeader label="J" title="NON-OPERATING" />
            <LineItem number={1} label="Less: Interest Expense" amount={nonOperating.interestExpense} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={2} label="Less: Depreciation" amount={nonOperating.depreciation} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <LineItem number={3} label="Less: Amortization" amount={nonOperating.amortization} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />
            <SubtotalRow number={4} label="Total I,D&A" amount={nonOperating.totalIDA} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} highlight="gray" />

            {/* EBT */}
            <tr className={`font-bold ${currentMIS.ebt >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
              <td className={`py-4 px-4 ${currentMIS.ebt >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
                NET INCOME Before Tax (EBT)
              </td>
              <td className={`py-4 px-4 text-right ${currentMIS.ebt >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
                {formatCurrencyFull(currentMIS.ebt)}
              </td>
              <td className={`py-4 px-4 text-right ${currentMIS.ebt >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {formatPercent(currentMIS.ebtPercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-gray-500 text-sm">-</td>
              ))}
            </tr>

            {/* Income Tax */}
            <LineItem number={4} label="Less: Income Tax" amount={nonOperating.incomeTax} netRevenue={netRevenue} showChannelBreakdown={showChannelBreakdown} />

            {/* NET INCOME */}
            <tr className={`font-bold ${currentMIS.netIncome >= 0 ? 'bg-green-200' : 'bg-red-200'}`}>
              <td className={`py-4 px-4 ${currentMIS.netIncome >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                NET INCOME (PROFIT / LOSS)
              </td>
              <td className={`py-4 px-4 text-right ${currentMIS.netIncome >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                {formatCurrencyFull(currentMIS.netIncome)}
              </td>
              <td className={`py-4 px-4 text-right ${currentMIS.netIncome >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                {formatPercent(currentMIS.netIncomePercent)}
              </td>
              {showChannelBreakdown && SALES_CHANNELS.map(channel => (
                <td key={channel} className="py-4 px-4 text-right text-gray-500 text-sm">-</td>
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
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    red: 'bg-red-50 border-red-200',
    orange: 'bg-orange-50 border-orange-200'
  };

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-bold text-gray-800 mt-1">{value}</div>
      {subValue && <div className="text-sm text-gray-500 mt-1">{subValue}</div>}
    </div>
  );
}

function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle?: string }) {
  return (
    <tr className="bg-amber-50">
      <td colSpan={100} className="py-3 px-4">
        <span className="font-bold text-amber-800">{label}</span>
        <span className="ml-3 font-semibold text-amber-800">{title}</span>
        {subtitle && <span className="ml-2 text-sm text-amber-600">{subtitle}</span>}
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
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-2 px-4 text-gray-700">
        <span className="text-gray-400 mr-2">{number}</span>
        {label}
        {note && <span className="ml-2 text-xs text-gray-400">{note}</span>}
      </td>
      <td className="py-2 px-4 text-right text-gray-700">{formatCurrencyFull(amount)}</td>
      <td className="py-2 px-4 text-right text-gray-500">{amount > 0 ? formatPercent(percent) : '-'}</td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-2 px-4 text-right text-gray-500 text-sm">
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
    orange: 'bg-orange-50',
    purple: 'bg-purple-50',
    blue: 'bg-blue-50',
    indigo: 'bg-indigo-50',
    pink: 'bg-pink-50',
    cyan: 'bg-cyan-50',
    yellow: 'bg-yellow-50',
    gray: 'bg-gray-100'
  };

  return (
    <tr className={`font-semibold ${highlight ? bgClasses[highlight] : 'bg-gray-50'}`}>
      <td className="py-3 px-4 text-gray-800">
        <span className="text-gray-400 mr-2">{number}</span>
        {label}
      </td>
      <td className="py-3 px-4 text-right text-gray-800">{formatCurrencyFull(amount)}</td>
      <td className="py-3 px-4 text-right text-gray-600">{formatPercent(percent)}</td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-3 px-4 text-right text-gray-500 text-sm">-</td>
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
    <tr className={isPositive ? 'bg-emerald-50' : 'bg-red-50'}>
      <td className={`py-3 px-4 font-semibold ${isPositive ? 'text-emerald-800' : 'text-red-800'}`}>
        {label}
        <div className="text-xs font-normal text-gray-500">{sublabel}</div>
      </td>
      <td className={`py-3 px-4 text-right font-semibold ${isPositive ? 'text-emerald-800' : 'text-red-800'}`}>
        {formatCurrencyFull(amount)}
      </td>
      <td className={`py-3 px-4 text-right font-semibold ${isPositive ? 'text-emerald-700' : 'text-red-700'}`}>
        {formatPercent(percent)}
      </td>
      {showChannelBreakdown && SALES_CHANNELS.map(channel => (
        <td key={channel} className="py-3 px-4 text-right text-gray-500 text-sm">-</td>
      ))}
    </tr>
  );
}
