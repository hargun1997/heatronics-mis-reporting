// Section-Aware Account to MIS Head/Subhead Mapping
//
// KEY PRINCIPLE:
// - Trading Account (Direct/Mfg) expenses → ALL go to COGM (E.)
// - P&L Account (Indirect/Admin) expenses → Classified to F/G/H/I/J based on keywords
//
// This ensures MIS matches the Balance Sheet structure exactly.

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

// ============================================
// COGM SUBHEAD CLASSIFICATION (for Trading Account)
// ============================================

type COGMSubhead =
  | 'Raw Materials & Inventory'
  | 'Consumables'
  | 'Manufacturing Wages'
  | 'Contract Wages (Mfg)'
  | 'Inbound Transport'
  | 'Factory Rent'
  | 'Factory Electricity'
  | 'Factory Maintenance'
  | 'Job work'
  | 'Quality Testing'
  | 'Other Direct Expenses';

function classifyTradingExpense(accountName: string): COGMSubhead {
  const lower = accountName.toLowerCase();

  // Job Work
  if (/job\s*work/i.test(lower)) {
    return 'Job work';
  }

  // Consumables
  if (/consumable/i.test(lower)) {
    return 'Consumables';
  }

  // Wages/Labour
  if (/labour|labor|wages/i.test(lower) && !/contract/i.test(lower)) {
    return 'Manufacturing Wages';
  }
  if (/contract.*wages/i.test(lower)) {
    return 'Contract Wages (Mfg)';
  }

  // Transport/Freight (in Trading = inbound)
  if (/freight|transport|transpotation/i.test(lower)) {
    return 'Inbound Transport';
  }

  // Factory Rent
  if (/factory.*rent|godown.*rent/i.test(lower)) {
    return 'Factory Rent';
  }

  // Electricity & Power
  if (/electric|power|water/i.test(lower)) {
    return 'Factory Maintenance';
  }

  // Maintenance
  if (/maintenance|maitenance|repair/i.test(lower)) {
    return 'Factory Maintenance';
  }

  // Quality/Testing/Lab
  if (/lab|testing|calibration|quality/i.test(lower)) {
    return 'Quality Testing';
  }

  // Purchase/Stock related
  if (/purchase|stancil|sample|modification/i.test(lower)) {
    return 'Raw Materials & Inventory';
  }

  // Default for unclassified Trading Account items
  return 'Other Direct Expenses';
}

// ============================================
// P&L EXPENSE CLASSIFICATION (for Indirect Expenses)
// ============================================

interface PLMapping {
  head: MISHead;
  subhead: string;
}

function classifyPLExpense(accountName: string): PLMapping {
  const lower = accountName.toLowerCase();

  // ===== Z. IGNORE (Only GST, TDS - truly ignorable items) =====
  if (/^(cgst|sgst|igst|gst)/i.test(lower) || /tds/i.test(lower)) {
    return { head: 'Z. Ignore', subhead: 'GST/TDS' };
  }
  if (/duties\s*&\s*taxes/i.test(lower)) {
    return { head: 'Z. Ignore', subhead: 'GST Input/Output' };
  }
  if (/prior\s*period/i.test(lower)) {
    return { head: 'Z. Ignore', subhead: 'Prior Period Adjustment' };
  }
  if (/provision.*tax|income.*tax/i.test(lower)) {
    return { head: 'Z. Ignore', subhead: 'TDS' };
  }

  // ===== X. EXCLUDE (Personal Expenses) =====
  if (/awanish|prabhash|personal/i.test(lower)) {
    return { head: 'X. Exclude', subhead: 'Personal Expenses' };
  }

  // ===== J. NON-OPERATING =====
  // Interest
  if (/interest/i.test(lower)) {
    return { head: 'J. Non-Operating', subhead: 'Less: Interest Expense' };
  }
  // Depreciation
  if (/depreciation/i.test(lower)) {
    return { head: 'J. Non-Operating', subhead: 'Less: Depreciation' };
  }
  // Write-offs
  if (/written\s*off|write.*off/i.test(lower)) {
    return { head: 'J. Non-Operating', subhead: 'Write-offs' };
  }

  // ===== F. CHANNEL & FULFILLMENT =====
  // Amazon (handles double spaces via \s+)
  if (/amazon/i.test(lower)) {
    return { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees' };
  }
  // Blinkit
  if (/blinkit/i.test(lower)) {
    return { head: 'F. Channel & Fulfillment', subhead: 'Blinkit Fees' };
  }
  // Logistics/Courier/Freight (in P&L = outbound/D2C)
  if (/logist|courier|postage|shiprocket|delhivery|porter|freight|loading.*unloading/i.test(lower)) {
    return { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees' };
  }
  // Storage/Shipping/Commission fees (usually Amazon)
  if (/storage\s*fee|shipping\s*fee|commission\s*fee/i.test(lower)) {
    return { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees' };
  }
  // Selling & Distribution
  if (/selling.*distribution|installation.*service/i.test(lower)) {
    return { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees' };
  }

  // ===== G. SALES & MARKETING =====
  if (/advertis|publicity|marketing|promotion|branding|design\s*exp/i.test(lower)) {
    return { head: 'G. Sales & Marketing', subhead: 'Advertising & Marketing' };
  }
  if (/social\s*media/i.test(lower)) {
    return { head: 'G. Sales & Marketing', subhead: 'Social Media Ads' };
  }

  // ===== H. PLATFORM COSTS =====
  if (/platform\s*fee|shopify/i.test(lower)) {
    return { head: 'H. Platform Costs', subhead: 'Shopify Subscription' };
  }
  if (/software.*updat|wati/i.test(lower)) {
    return { head: 'H. Platform Costs', subhead: 'Wati Subscription' };
  }
  if (/website.*develop/i.test(lower)) {
    return { head: 'H. Platform Costs', subhead: 'Website Development' };
  }

  // ===== I. OPERATING EXPENSES =====
  // Salaries & Staff
  if (/salary|salaries|esi\s*employer|pf\s*employer|gratuity/i.test(lower)) {
    if (/director/i.test(lower)) {
      return { head: 'I. Operating Expenses', subhead: 'Salaries Director' };
    }
    return { head: 'I. Operating Expenses', subhead: 'Salaries (Admin Mgmt)' };
  }
  if (/staff.*welfare|diwali|bonus|picnic|entertainment|uniform/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Staff Welfare & Events' };
  }

  // Legal & Professional
  if (/legal|professional.*exp|accounti|consultancy|government\s*fee|registration|licence|barcode/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses' };
  }

  // Banks & Finance
  if (/bank\s*charg|processing\s*fee|penalty|service\s*charge/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Banks & Finance Charges' };
  }

  // Travel & Miscellaneous
  if (/travel|tour|hotel|conveyance|vehicle|insurance|miscellaneous/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel, insurance)' };
  }

  // Office/Admin
  if (/office|rent|printing|stationery|communication|house\s*keep|repair|maintenance/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Administrative Expenses' };
  }

  // ===== ITEMS MOVED TO OTHER OPERATING EXPENSES =====
  // These were previously in separate categories but user wants them in Other Operating Expenses
  // Rounded Off, Return Fee, Cash Discount, Rate Difference, Commission Income
  if (/round.*off/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Other Operating Expenses' };
  }
  if (/return\s*fee/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Other Operating Expenses' };
  }
  if (/cash\s*discount/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Other Operating Expenses' };
  }
  if (/rate\s*difference/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Other Operating Expenses' };
  }
  if (/commission\s*income/i.test(lower)) {
    return { head: 'I. Operating Expenses', subhead: 'Other Operating Expenses' };
  }

  // Default for unclassified P&L items → Operating Expenses
  return { head: 'I. Operating Expenses', subhead: 'Other Operating Expenses' };
}

// ============================================
// MAIN SECTION-AWARE MAPPING FUNCTION
// ============================================

/**
 * Map an account name to MIS head/subhead based on the section it appears in.
 *
 * @param accountName - The account name from the balance sheet
 * @param section - 'trading' for Trading Account, 'pl' for P&L Account
 * @returns AccountMapping with head, subhead, type, and plLine
 */
export function mapAccountToMISBySection(
  accountName: string,
  section: 'trading' | 'pl'
): AccountMapping {

  // Trading Account → ALL go to COGM (E.)
  if (section === 'trading') {
    const subhead = classifyTradingExpense(accountName);
    return {
      head: 'E. COGM',
      subhead,
      type: 'expense',
      plLine: 'COGS'
    };
  }

  // P&L Account → Classify based on keywords
  const plMapping = classifyPLExpense(accountName);

  // Determine type based on head
  let type: 'revenue' | 'expense' | 'ignore' | 'other_income' = 'expense';
  if (plMapping.head === 'Z. Ignore' || plMapping.head === 'X. Exclude') {
    type = 'ignore';
  } else if (plMapping.subhead === 'Other Income') {
    type = 'other_income';
  }

  // Determine plLine based on head
  let plLine = 'Operating Expenses';
  switch (plMapping.head) {
    case 'A. Revenue':
      plLine = 'Other Income';
      break;
    case 'B. Returns':
      plLine = 'Returns';
      break;
    case 'C. Discounts':
      plLine = 'Discounts';
      break;
    case 'F. Channel & Fulfillment':
      plLine = 'Channel Costs';
      break;
    case 'G. Sales & Marketing':
      plLine = 'Marketing';
      break;
    case 'H. Platform Costs':
      plLine = 'Platform Costs';
      break;
    case 'I. Operating Expenses':
      plLine = 'Operating Expenses';
      break;
    case 'J. Non-Operating':
      plLine = 'Non-Operating';
      break;
    case 'Z. Ignore':
    case 'X. Exclude':
      plLine = 'Ignored';
      break;
  }

  return {
    head: plMapping.head,
    subhead: plMapping.subhead,
    type,
    plLine
  };
}

/**
 * Legacy function for backward compatibility.
 * Maps account without section awareness (defaults to P&L behavior).
 * @deprecated Use mapAccountToMISBySection instead
 */
export function mapAccountToMIS(accountName: string): AccountMapping | null {
  // For backward compatibility, default to P&L classification
  return mapAccountToMISBySection(accountName, 'pl');
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
    'expenses direct',
    'expenses indirect',
    'to expenses',
    'by expenses',
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
