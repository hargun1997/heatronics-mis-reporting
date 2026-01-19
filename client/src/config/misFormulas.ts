// MIS Formula Definitions
// Provides formula explanations for each margin/calculation in the MIS report

export interface FormulaComponent {
  label: string;
  field: string;
  sign: '+' | '-';
  source: 'calculated' | 'journal' | 'sales_register' | 'balance_sheet';
}

export interface FormulaDefinition {
  name: string;
  description: string;
  formula: string;
  components: FormulaComponent[];
}

export type MarginType =
  | 'GROSS_REVENUE'
  | 'NET_REVENUE'
  | 'GROSS_MARGIN'
  | 'CM1'
  | 'CM2'
  | 'CM3'
  | 'EBITDA'
  | 'EBT'
  | 'NET_INCOME';

export const MIS_FORMULAS: Record<MarginType, FormulaDefinition> = {
  GROSS_REVENUE: {
    name: 'Gross Revenue',
    description: 'Total revenue from all sales channels before any deductions.',
    formula: 'Sum of all channel sales (Amazon + Website + Blinkit + Offline/OEM)',
    components: [
      { label: 'Amazon Sales', field: 'revenue.grossRevenue.Amazon', sign: '+', source: 'sales_register' },
      { label: 'Website Sales', field: 'revenue.grossRevenue.Website', sign: '+', source: 'sales_register' },
      { label: 'Blinkit Sales', field: 'revenue.grossRevenue.Blinkit', sign: '+', source: 'sales_register' },
      { label: 'Offline & OEM', field: 'revenue.grossRevenue.Offline & OEM', sign: '+', source: 'sales_register' },
    ],
  },
  NET_REVENUE: {
    name: 'Net Revenue',
    description: 'Revenue after deducting returns, discounts, and taxes. This is the actual revenue recognized.',
    formula: 'Gross Revenue - Returns - Discounts - Taxes',
    components: [
      { label: 'Gross Revenue', field: 'revenue.totalGrossRevenue', sign: '+', source: 'sales_register' },
      { label: 'Returns', field: 'revenue.totalReturns', sign: '-', source: 'sales_register' },
      { label: 'Discounts', field: 'revenue.totalDiscounts', sign: '-', source: 'sales_register' },
      { label: 'Taxes (GST)', field: 'revenue.totalTaxes', sign: '-', source: 'sales_register' },
    ],
  },
  GROSS_MARGIN: {
    name: 'Gross Margin',
    description: 'Profit after deducting direct manufacturing costs (COGM). Also called Gross Profit. Indicates production efficiency.',
    formula: 'Net Revenue - Cost of Goods Manufactured (COGM)',
    components: [
      { label: 'Net Revenue', field: 'revenue.netRevenue', sign: '+', source: 'calculated' },
      { label: 'COGM', field: 'cogm.totalCOGM', sign: '-', source: 'journal' },
    ],
  },
  CM1: {
    name: 'Contribution Margin 1 (CM1)',
    description: 'Margin after accounting for marketplace fees, shipping, and fulfillment costs. Shows profitability of channel operations.',
    formula: 'Gross Margin - Channel & Fulfillment Costs',
    components: [
      { label: 'Gross Margin', field: 'grossMargin', sign: '+', source: 'calculated' },
      { label: 'Amazon Fees', field: 'channelFulfillment.amazonFees', sign: '-', source: 'journal' },
      { label: 'Blinkit Fees', field: 'channelFulfillment.blinkitFees', sign: '-', source: 'journal' },
      { label: 'D2C Fees', field: 'channelFulfillment.d2cFees', sign: '-', source: 'journal' },
    ],
  },
  CM2: {
    name: 'Contribution Margin 2 (CM2)',
    description: 'Margin after advertising and marketing spend. Shows profitability of customer acquisition efforts.',
    formula: 'CM1 - Sales & Marketing Costs',
    components: [
      { label: 'CM1', field: 'cm1', sign: '+', source: 'calculated' },
      { label: 'Facebook Ads', field: 'salesMarketing.facebookAds', sign: '-', source: 'journal' },
      { label: 'Google Ads', field: 'salesMarketing.googleAds', sign: '-', source: 'journal' },
      { label: 'Amazon Ads', field: 'salesMarketing.amazonAds', sign: '-', source: 'journal' },
      { label: 'Blinkit Ads', field: 'salesMarketing.blinkitAds', sign: '-', source: 'journal' },
      { label: 'Agency Fees', field: 'salesMarketing.agencyFees', sign: '-', source: 'journal' },
    ],
  },
  CM3: {
    name: 'Contribution Margin 3 (CM3)',
    description: 'Margin after SaaS/platform subscriptions (Shopify, CRM, etc.). Shows true product contribution.',
    formula: 'CM2 - Platform Costs',
    components: [
      { label: 'CM2', field: 'cm2', sign: '+', source: 'calculated' },
      { label: 'Shopify Subscription', field: 'platformCosts.shopifySubscription', sign: '-', source: 'journal' },
      { label: 'Wati Subscription', field: 'platformCosts.watiSubscription', sign: '-', source: 'journal' },
      { label: 'Shopflo Subscription', field: 'platformCosts.shopfloSubscription', sign: '-', source: 'journal' },
    ],
  },
  EBITDA: {
    name: 'EBITDA',
    description: 'Earnings Before Interest, Taxes, Depreciation & Amortization. Core operational profitability measure.',
    formula: 'CM3 - Operating Expenses',
    components: [
      { label: 'CM3', field: 'cm3', sign: '+', source: 'calculated' },
      { label: 'Salaries (Admin)', field: 'operatingExpenses.salariesAdminMgmt', sign: '-', source: 'journal' },
      { label: 'Miscellaneous', field: 'operatingExpenses.miscellaneous', sign: '-', source: 'journal' },
      { label: 'Legal & CA', field: 'operatingExpenses.legalCaExpenses', sign: '-', source: 'journal' },
      { label: 'Platform Costs (CRM)', field: 'operatingExpenses.platformCostsCRM', sign: '-', source: 'journal' },
      { label: 'Admin Expenses', field: 'operatingExpenses.administrativeExpenses', sign: '-', source: 'journal' },
    ],
  },
  EBT: {
    name: 'Earnings Before Tax (EBT)',
    description: 'Profit before income tax, after all non-cash expenses like depreciation and interest.',
    formula: 'EBITDA - Interest - Depreciation - Amortization',
    components: [
      { label: 'EBITDA', field: 'ebitda', sign: '+', source: 'calculated' },
      { label: 'Interest Expense', field: 'nonOperating.interestExpense', sign: '-', source: 'journal' },
      { label: 'Depreciation', field: 'nonOperating.depreciation', sign: '-', source: 'journal' },
      { label: 'Amortization', field: 'nonOperating.amortization', sign: '-', source: 'journal' },
    ],
  },
  NET_INCOME: {
    name: 'Net Income',
    description: 'Final bottom-line profit after all expenses and taxes. The actual earnings of the business.',
    formula: 'EBT - Income Tax',
    components: [
      { label: 'EBT', field: 'ebt', sign: '+', source: 'calculated' },
      { label: 'Income Tax', field: 'nonOperating.incomeTax', sign: '-', source: 'journal' },
    ],
  },
};

// Subhead descriptions for info icons
export const SUBHEAD_DESCRIPTIONS: Record<string, string> = {
  // COGM
  'Raw Materials & Inventory': 'Cost of raw materials used in manufacturing. Calculated from Balance Sheet as: Opening Stock + Purchases - Closing Stock.',
  'Manufacturing Wages': 'Wages paid to factory workers directly involved in manufacturing products.',
  'Contract Wages (Mfg)': 'Payments to contract workers for manufacturing tasks.',
  'Inbound Transport': 'Freight and logistics costs for bringing raw materials to the factory.',
  'Factory Rent': 'Monthly rent for manufacturing facility. TDS @10% may apply.',
  'Factory Electricity': 'Power costs for running manufacturing equipment.',
  'Factory Maintainence': 'Maintenance and repair costs for factory equipment and premises. Includes power backup costs.',
  'Job work': 'Outsourced manufacturing or processing work done by third parties.',

  // Channel & Fulfillment
  'Amazon Fees': 'Commission, FBA fees, and other Amazon marketplace charges.',
  'Blinkit Fees': 'Commission and fulfillment fees for Blinkit quick commerce.',
  'D2C Fees': 'Shiprocket shipping, payment gateway fees, and other D2C fulfillment costs.',

  // Sales & Marketing
  'Facebook Ads': 'Meta/Facebook advertising spend for brand and product promotion.',
  'Google Ads': 'Google search, display, and shopping advertising costs.',
  'Amazon Ads': 'Sponsored products and brand advertising on Amazon platform.',
  'Blinkit Ads': 'Advertising spend on Blinkit platform.',
  'Agency Fees': 'Fees paid to marketing/creative agencies.',

  // Platform Costs
  'Shopify Subscription': 'Monthly Shopify e-commerce platform subscription.',
  'Wati Subscription': 'WhatsApp Business API platform subscription.',
  'Shopflo subscription': 'Checkout and payment optimization tool subscription.',

  // Operating Expenses
  'Salaries (Admin, Mgmt)': 'Salaries for administrative staff, management, and non-manufacturing employees.',
  'Miscellaneous (Travel, insurance)': 'Travel expenses, insurance premiums, and other miscellaneous operating costs.',
  'Legal & CA expenses': 'Legal counsel fees, chartered accountant fees, and compliance costs.',
  'Platform Costs (CRM, inventory softwares)': 'Software subscriptions for CRM, inventory management, and other business tools.',
  'Administrative Expenses (Office Rent, utilities, admin supplies)': 'Office rent, utilities, office supplies, and general administrative costs.',

  // Non-Operating
  'Less: Interest Expense': 'Interest paid on loans and credit facilities.',
  'Less: Depreciation': 'Non-cash expense for wear and tear of fixed assets.',
  'Less: Amortization': 'Non-cash expense for intangible asset value reduction.',
  'Less: Income Tax': 'Corporate income tax expense for the period.',
};

// Head-level descriptions
export const HEAD_DESCRIPTIONS: Record<string, string> = {
  'A. Revenue': 'Sales revenue from all channels before any deductions.',
  'B. Returns': 'Products returned by customers, reducing total revenue.',
  'C. Discounts': 'Price reductions and promotional discounts given to customers.',
  'D. Taxes': 'GST and other taxes collected on sales (passed through to government).',
  'E. COGM': 'Cost of Goods Manufactured - all direct costs to produce goods sold.',
  'F. Channel & Fulfillment': 'Marketplace commissions, shipping, and fulfillment costs.',
  'G. Sales & Marketing': 'Advertising and marketing expenses to acquire customers.',
  'H. Platform Costs': 'SaaS subscriptions for e-commerce and business operations.',
  'I. Operating Expenses': 'Day-to-day business expenses not directly tied to production.',
  'J. Non-Operating': 'Financial expenses and non-cash charges (interest, depreciation, taxes).',
  'X. Exclude': 'Personal expenses and owner withdrawals - not part of business P&L.',
  'Z. Ignore': 'Non-P&L items like GST input/output, TDS, and inter-company transfers.',
};
