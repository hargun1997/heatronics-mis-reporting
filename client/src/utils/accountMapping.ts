// Account to MIS Head/Subhead Mapping
// This file maps Busy/Tally account names to MIS categories
// Based on heatronics_mapping provided by the user

import { MISHead } from '../types/misTracking';

export interface AccountMapping {
  head: MISHead;
  subhead: string;
  type: 'revenue' | 'expense' | 'ignore' | 'other_income';
  plLine: string;
}

// Normalize account name for matching
export function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/@\d+%?/g, '')         // Remove @18%, @5% etc
    .replace(/[()]/g, '')           // Remove parentheses
    .replace(/\s*&\s*/g, ' & ')     // Normalize ampersand spacing
    .trim();
}

// Account mapping lookup table
// Key: normalized account name pattern
// Value: MIS mapping
const ACCOUNT_MAPPINGS: Record<string, AccountMapping> = {
  // ============================================
  // A. REVENUE
  // ============================================
  'sales': { head: 'A. Revenue', subhead: 'Website (consolidated)', type: 'revenue', plLine: 'Gross Revenue' },
  'sale': { head: 'A. Revenue', subhead: 'Website (consolidated)', type: 'revenue', plLine: 'Gross Revenue' },

  // ============================================
  // B. RETURNS
  // ============================================
  'return fee': { head: 'B. Returns', subhead: 'Unspecified', type: 'expense', plLine: 'Returns' },
  'return fee telangana': { head: 'B. Returns', subhead: 'Amazon', type: 'expense', plLine: 'Returns' },
  'return fee maharashtra': { head: 'B. Returns', subhead: 'Amazon', type: 'expense', plLine: 'Returns' },
  'return fee karnataka': { head: 'B. Returns', subhead: 'Amazon', type: 'expense', plLine: 'Returns' },
  'return fee haryana': { head: 'B. Returns', subhead: 'Amazon', type: 'expense', plLine: 'Returns' },

  // ============================================
  // C. DISCOUNTS
  // ============================================
  'cash discount': { head: 'C. Discounts', subhead: 'Unspecified', type: 'expense', plLine: 'Discounts' },
  'rate difference': { head: 'C. Discounts', subhead: 'Unspecified', type: 'expense', plLine: 'Discounts' },

  // ============================================
  // E. COGM (Cost of Goods Manufactured)
  // ============================================
  // Raw Materials & Inventory
  'purchase': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'purchase telangana': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'purchase maharashtra': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'purchase karnataka': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'purchase haryana': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'consumable expenses': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'consumables expenses': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'consumables expense basic': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'stancil charges': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'sample & modification expenses': { head: 'E. COGM', subhead: 'FBA/Expenses', type: 'expense', plLine: 'COGS' },
  'lab testing charges': { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' },
  'calibration services exp': { head: 'E. COGM', subhead: 'Quality Testing', type: 'expense', plLine: 'COGS' },

  // Manufacturing Wages
  'labour & wages expenses': { head: 'E. COGM', subhead: 'Manufacturing Wages', type: 'expense', plLine: 'COGS' },

  // Job Work
  'job work': { head: 'E. COGM', subhead: 'Job work', type: 'expense', plLine: 'COGS' },

  // Inbound Transport
  'freight charges trading': { head: 'E. COGM', subhead: 'Inbound Transport', type: 'expense', plLine: 'COGS' },
  'freight charges': { head: 'E. COGM', subhead: 'Inbound Transport', type: 'expense', plLine: 'COGS' },
  'loading & unloading exp': { head: 'E. COGM', subhead: 'Inbound Transport', type: 'expense', plLine: 'COGS' },
  'loading & unloading exp p&l': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },
  'transpotation expenses': { head: 'E. COGM', subhead: 'Inbound Transport', type: 'expense', plLine: 'COGS' },
  'transportation expenses': { head: 'E. COGM', subhead: 'Inbound Transport', type: 'expense', plLine: 'COGS' },
  'logistics exp': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },

  // Factory Maintenance (includes electricity, water, power backup)
  'power backup & maitenance': { head: 'E. COGM', subhead: 'Factory Maintenance', type: 'expense', plLine: 'COGS' },
  'power backup & maintenance': { head: 'E. COGM', subhead: 'Factory Maintenance', type: 'expense', plLine: 'COGS' },
  'electricity & water expenses': { head: 'E. COGM', subhead: 'Factory Maintenance', type: 'expense', plLine: 'COGS' },
  'electricity & water': { head: 'E. COGM', subhead: 'Factory Maintenance', type: 'expense', plLine: 'COGS' },

  // ============================================
  // F. CHANNEL & FULFILLMENT
  // ============================================
  // Amazon Fees
  'amazon logistics exp': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'amazon logistics exp telangana': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'amazon logistics exp maharashtra': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'amazon logistics exp karnataka': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'amazon logistics exp haryana': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'storage fee': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'storage fee telangana': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'storage fee maharashtra': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'storage fee karnataka': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'shipping fee': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'shipping fee telangana': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'shipping fee maharashtra': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'shipping fee karnataka': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'commission fee': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'commission fee telangana': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'commission fee maharashtra': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'commission fee karnataka': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },
  'commission fee haryana': { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' },

  // D2C Fees
  'selling & distribution exp': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },
  'courier & postage expense': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },
  'freight charges p&l': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },
  'freight & forwarding charges': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },
  'porter daily exp': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },
  'installation services charge': { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' },

  // ============================================
  // G. SALES & MARKETING
  // ============================================
  'advertisement & publicity': { head: 'G. Sales & Marketing', subhead: 'Facebook Ads (split-needed)', type: 'expense', plLine: 'Marketing' },
  'advertisement & publicity telangana': { head: 'G. Sales & Marketing', subhead: 'Amazon Ads', type: 'expense', plLine: 'Marketing' },
  'advertisement & publicity maharashtra': { head: 'G. Sales & Marketing', subhead: 'Amazon Ads', type: 'expense', plLine: 'Marketing' },
  'advertisement & publicity karnataka': { head: 'G. Sales & Marketing', subhead: 'Amazon Ads', type: 'expense', plLine: 'Marketing' },
  'social media marketing charges': { head: 'G. Sales & Marketing', subhead: 'Facebook Ads', type: 'expense', plLine: 'Marketing' },
  'marketing charges': { head: 'G. Sales & Marketing', subhead: 'Agency Fees', type: 'expense', plLine: 'Marketing' },
  'business promotion expenses': { head: 'G. Sales & Marketing', subhead: 'Agency Fees', type: 'expense', plLine: 'Marketing' },
  'design expenses': { head: 'G. Sales & Marketing', subhead: 'Agency Fees', type: 'expense', plLine: 'Marketing' },
  'branding & packaging design': { head: 'G. Sales & Marketing', subhead: 'Agency Fees', type: 'expense', plLine: 'Marketing' },

  // ============================================
  // H. PLATFORM COSTS
  // ============================================
  'platform fee': { head: 'H. Platform Costs', subhead: 'Shopify Subscription', type: 'expense', plLine: 'Platform Costs' },
  'software updation exp': { head: 'H. Platform Costs', subhead: 'Wati Subscription', type: 'expense', plLine: 'Platform Costs' },
  'website & developemnt exp': { head: 'H. Platform Costs', subhead: 'Shopify Subscription', type: 'expense', plLine: 'Platform Costs' },

  // ============================================
  // I. OPERATING EXPENSES
  // ============================================
  // Salaries
  'salary expenses': { head: 'I. Operating Expenses', subhead: 'Salaries (Admin Mgmt)', type: 'expense', plLine: 'Operating Expenses' },
  'salary expenses director': { head: 'I. Operating Expenses', subhead: 'Salaries Director', type: 'expense', plLine: 'Operating Expenses' },
  'driver salary expense': { head: 'I. Operating Expenses', subhead: 'Salaries (Admin Mgmt)', type: 'expense', plLine: 'Operating Expenses' },
  'esi employer contribution e': { head: 'I. Operating Expenses', subhead: 'Salaries (Admin Mgmt)', type: 'expense', plLine: 'Operating Expenses' },
  'staff welfare expenses': { head: 'I. Operating Expenses', subhead: 'Staff Welfare & Events', type: 'expense', plLine: 'Operating Expenses' },
  'uniform expenses': { head: 'I. Operating Expenses', subhead: 'Salaries (Admin Mgmt)', type: 'expense', plLine: 'Operating Expenses' },
  'diwali exp': { head: 'I. Operating Expenses', subhead: 'Staff Welfare & Events', type: 'expense', plLine: 'Operating Expenses' },
  'deewapali bonus & gift expen': { head: 'I. Operating Expenses', subhead: 'Staff Welfare & Events', type: 'expense', plLine: 'Operating Expenses' },
  'intertenment & picknick expe': { head: 'I. Operating Expenses', subhead: 'Staff Welfare & Events', type: 'expense', plLine: 'Operating Expenses' },

  // Administrative Expenses
  'office rent': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },
  'office expenses': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },
  'office maintenance expenses': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },
  'printing & stationery': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },
  'printing stationery expenses': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },
  'repaire & maintenance expens': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },
  'house keeping expenses': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },
  'communication exp': { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' },

  // Legal & CA Expenses
  'legal & professional expens': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'legal & professional expense': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'accounting & return filling': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'accounting charges & fee': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'consultancy charges': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'government fee expenses': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'gst registration exp': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'licence registration exp': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },
  'barcode registration exp': { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' },

  // Miscellaneous (Travel, Insurance)
  'travelling expenses': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },
  'tour & travelling expenses': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },
  'hotel expenses': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },
  'conveyance & auto charge': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },
  'conveyance expenses': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },
  'vehical runing maintenance': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },
  'insurance expenses': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },
  'miscellaneous expenses': { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel insurance)', type: 'expense', plLine: 'Operating Expenses' },

  // Banks & Finance Charges
  'bank charges': { head: 'I. Operating Expenses', subhead: 'Banks & Finance Charges', type: 'expense', plLine: 'Operating Expenses' },
  'bank charges expense': { head: 'I. Operating Expenses', subhead: 'Banks & Finance Charges', type: 'expense', plLine: 'Operating Expenses' },
  'processing fee': { head: 'I. Operating Expenses', subhead: 'Banks & Finance Charges', type: 'expense', plLine: 'Operating Expenses' },
  'penalty charges': { head: 'I. Operating Expenses', subhead: 'Banks & Finance Charges', type: 'expense', plLine: 'Operating Expenses' },
  'service charges paid': { head: 'I. Operating Expenses', subhead: 'Banks & Finance Charges', type: 'expense', plLine: 'Operating Expenses' },

  // ============================================
  // J. NON-OPERATING
  // ============================================
  'interest on od limit': { head: 'J. Non-Operating', subhead: 'Less: Interest Expense', type: 'expense', plLine: 'Non-Operating' },
  'interest on car loan expens': { head: 'J. Non-Operating', subhead: 'Less: Interest Expense', type: 'expense', plLine: 'Non-Operating' },
  'interest on tds': { head: 'J. Non-Operating', subhead: 'Less: Interest Expense', type: 'expense', plLine: 'Non-Operating' },
  'depreciation': { head: 'J. Non-Operating', subhead: 'Less: Depreciation', type: 'expense', plLine: 'Non-Operating' },
  'amount written off indirect': { head: 'J. Non-Operating', subhead: 'Write-offs', type: 'expense', plLine: 'Non-Operating' },

  // ============================================
  // X. EXCLUDE (Personal Expenses)
  // ============================================
  'awanish kumar exp a/c': { head: 'X. Exclude', subhead: 'Personal Expenses', type: 'ignore', plLine: 'Excluded' },
  'prabhash exp a/c': { head: 'X. Exclude', subhead: 'Personal Expenses', type: 'ignore', plLine: 'Excluded' },

  // ============================================
  // Z. IGNORE (GST, TDS, Rounding, etc.)
  // ============================================
  'rounded off': { head: 'Z. Ignore', subhead: 'Rounding', type: 'ignore', plLine: 'Ignored' },
  'rounded off telangana': { head: 'Z. Ignore', subhead: 'Rounding', type: 'ignore', plLine: 'Ignored' },
  'rounded off maharashtra': { head: 'Z. Ignore', subhead: 'Rounding', type: 'ignore', plLine: 'Ignored' },
  'rounded off karnataka': { head: 'Z. Ignore', subhead: 'Rounding', type: 'ignore', plLine: 'Ignored' },
  'rounded off haryana': { head: 'Z. Ignore', subhead: 'Rounding', type: 'ignore', plLine: 'Ignored' },
  'cgst input available rcm': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'sgst input available rcm': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'igst input available rcm': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'duties & taxes': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'duties & taxes telangana': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'duties & taxes maharashtra': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'duties & taxes karnataka': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'duties & taxes haryana': { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' },
  'provision for tax': { head: 'Z. Ignore', subhead: 'TDS', type: 'ignore', plLine: 'Ignored' },
  'income tax deposit': { head: 'Z. Ignore', subhead: 'TDS', type: 'ignore', plLine: 'Ignored' },
  'income tax refund': { head: 'Z. Ignore', subhead: 'TDS', type: 'ignore', plLine: 'Ignored' },
  'prior period exp': { head: 'Z. Ignore', subhead: 'Prior Period Adjustment', type: 'ignore', plLine: 'Ignored' },

  // ============================================
  // OTHER INCOME
  // ============================================
  'miscellaneous income': { head: 'A. Revenue', subhead: 'Other Income', type: 'other_income', plLine: 'Other Income' },
  'lost in transit': { head: 'A. Revenue', subhead: 'Other Income', type: 'other_income', plLine: 'Other Income' },
  'commission income': { head: 'A. Revenue', subhead: 'Other Income', type: 'other_income', plLine: 'Other Income' },

  // ============================================
  // FIXED ASSETS (Balance Sheet Only)
  // ============================================
  'battery 9ah 12v exide karnataka': { head: 'Z. Ignore', subhead: 'Fixed Asset', type: 'ignore', plLine: 'Balance Sheet Only' },
};

// Fuzzy matching patterns for accounts that may have variations
const FUZZY_PATTERNS: { pattern: RegExp; mapping: AccountMapping }[] = [
  // Sales variations
  { pattern: /^sales?\s*(account)?$/i, mapping: { head: 'A. Revenue', subhead: 'Website (consolidated)', type: 'revenue', plLine: 'Gross Revenue' } },

  // Purchase variations
  { pattern: /^purchase\s*(account)?$/i, mapping: { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' } },

  // State-specific patterns - Telangana
  { pattern: /telangana|hyderabad/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },

  // State-specific patterns - Maharashtra
  { pattern: /maharashtra|mumbai|pune/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },

  // State-specific patterns - Karnataka
  { pattern: /karnataka|bangalore|bengaluru/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },

  // State-specific patterns - Haryana
  { pattern: /haryana|gurugram|gurgaon/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },

  // GST/Tax patterns
  { pattern: /^(cgst|sgst|igst|gst)/i, mapping: { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored' } },
  { pattern: /tds/i, mapping: { head: 'Z. Ignore', subhead: 'TDS', type: 'ignore', plLine: 'Ignored' } },

  // Freight patterns
  { pattern: /freight.*charg/i, mapping: { head: 'E. COGM', subhead: 'Inbound Transport', type: 'expense', plLine: 'COGS' } },

  // Amazon patterns
  { pattern: /amazon.*logist/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },
  { pattern: /storage\s*fee/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },
  { pattern: /shipping\s*fee/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },
  { pattern: /commission\s*fee/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs' } },

  // Salary patterns
  { pattern: /salary|salaries/i, mapping: { head: 'I. Operating Expenses', subhead: 'Salaries (Admin Mgmt)', type: 'expense', plLine: 'Operating Expenses' } },

  // Marketing patterns
  { pattern: /advertis|publicity|marketing/i, mapping: { head: 'G. Sales & Marketing', subhead: 'Facebook Ads (split-needed)', type: 'expense', plLine: 'Marketing' } },

  // Office patterns
  { pattern: /office\s*(rent|expense)/i, mapping: { head: 'I. Operating Expenses', subhead: 'Administrative Expenses', type: 'expense', plLine: 'Operating Expenses' } },

  // Interest patterns
  { pattern: /interest/i, mapping: { head: 'J. Non-Operating', subhead: 'Less: Interest Expense', type: 'expense', plLine: 'Non-Operating' } },

  // Bank patterns
  { pattern: /bank\s*charg/i, mapping: { head: 'I. Operating Expenses', subhead: 'Banks & Finance Charges', type: 'expense', plLine: 'Operating Expenses' } },

  // Rounded off
  { pattern: /round.*off/i, mapping: { head: 'Z. Ignore', subhead: 'Rounding', type: 'ignore', plLine: 'Ignored' } },

  // Personal/Exclude patterns
  { pattern: /awanish|prabhash|personal/i, mapping: { head: 'X. Exclude', subhead: 'Personal Expenses', type: 'ignore', plLine: 'Excluded' } },

  // Job work
  { pattern: /job\s*work/i, mapping: { head: 'E. COGM', subhead: 'Job work', type: 'expense', plLine: 'COGS' } },

  // Consumable
  { pattern: /consumable/i, mapping: { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS' } },

  // Legal patterns
  { pattern: /legal|professional.*exp/i, mapping: { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses' } },

  // Platform patterns
  { pattern: /platform\s*fee/i, mapping: { head: 'H. Platform Costs', subhead: 'Shopify Subscription', type: 'expense', plLine: 'Platform Costs' } },
  { pattern: /software.*updat/i, mapping: { head: 'H. Platform Costs', subhead: 'Wati Subscription', type: 'expense', plLine: 'Platform Costs' } },

  // Staff welfare
  { pattern: /staff.*welfare|diwali|bonus/i, mapping: { head: 'I. Operating Expenses', subhead: 'Staff Welfare & Events', type: 'expense', plLine: 'Operating Expenses' } },

  // Courier/Logistics
  { pattern: /courier|postage|shiprocket|delhivery/i, mapping: { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs' } },

  // Return fee
  { pattern: /return\s*fee/i, mapping: { head: 'B. Returns', subhead: 'Unspecified', type: 'expense', plLine: 'Returns' } },

  // Depreciation
  { pattern: /depreciation/i, mapping: { head: 'J. Non-Operating', subhead: 'Less: Depreciation', type: 'expense', plLine: 'Non-Operating' } },
];

/**
 * Map an account name to MIS head/subhead
 * Returns null if no mapping found
 */
export function mapAccountToMIS(accountName: string): AccountMapping | null {
  const normalized = normalizeAccountName(accountName);

  // First, try exact match
  if (ACCOUNT_MAPPINGS[normalized]) {
    return ACCOUNT_MAPPINGS[normalized];
  }

  // Try fuzzy matching with patterns
  for (const { pattern, mapping } of FUZZY_PATTERNS) {
    if (pattern.test(accountName)) {
      return mapping;
    }
  }

  // No match found
  return null;
}

/**
 * Check if an account should be skipped (Opening Stock, Closing Stock, Gross Profit, etc.)
 * These are used for calculations but not mapped directly
 */
export function isSpecialAccount(accountName: string): boolean {
  const normalized = normalizeAccountName(accountName);
  const specialAccounts = [
    'opening stock',
    'closing stock',
    'gross profit',
    'net profit',
    'net loss',
    'nett loss',
    'nett profit',
    'total',
    'grand total',
  ];

  return specialAccounts.some(special => normalized.includes(special));
}

/**
 * Check if this is a line item that should be treated as COGM raw materials
 * (used for the Opening Stock + Purchases - Closing Stock calculation)
 */
export function isCOGMRawMaterialItem(accountName: string): boolean {
  const normalized = normalizeAccountName(accountName);
  return normalized.includes('opening stock') ||
         normalized.includes('closing stock') ||
         normalized.includes('purchase');
}
