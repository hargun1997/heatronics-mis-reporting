import { Router } from 'express';
import { googleSheetsService, MISCategory, ClassificationRule, MISConfig } from '../services/googleSheets.js';
import { geminiClassifier } from '../services/geminiClassifier.js';

// ============================================
// DEFAULT RULES FOR MIGRATION
// ============================================

// These are the hardcoded patterns from accountPatterns.ts and ignorePatterns.ts
// that will be migrated to Google Sheets

const MIGRATION_RULES: Omit<ClassificationRule, 'ruleId' | 'createdDate' | 'timesUsed'>[] = [
  // === REVENUE PATTERNS ===
  { pattern: 'SHIPROCKET.*CASH SALE', matchType: 'regex', head: 'A. Revenue', subhead: 'Website', confidence: 95, source: 'system', priority: 1, active: true, notes: 'D2C sales via Shiprocket' },
  { pattern: 'AMAZON SALE.*CASH SALE', matchType: 'regex', head: 'A. Revenue', subhead: 'Amazon', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Amazon marketplace sales' },
  { pattern: 'BLINKIT|BLINK COMMERCE', matchType: 'regex', head: 'A. Revenue', subhead: 'Blinkit', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Blinkit quick commerce sales' },
  { pattern: 'HEATRONICS MEDICAL DEVICES', matchType: 'contains', head: 'A. Revenue', subhead: 'Offline & OEM', confidence: 95, source: 'system', priority: 1, active: true, notes: 'OEM/B2B sales' },

  // === CHANNEL & FULFILLMENT ===
  { pattern: 'AMAZON.*LOGISTICS', matchType: 'regex', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Amazon FBA logistics' },
  { pattern: 'Storage Fee|SHIPPING FEE|Return Fee|Commission Income', matchType: 'regex', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Amazon platform fees' },
  { pattern: 'PLATFORM FEE', matchType: 'contains', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Platform fees' },
  { pattern: 'AMAZON SELLER SERVICES', matchType: 'contains', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Amazon seller services' },
  { pattern: 'SHIPROCKET PRIVATE LIMITED', matchType: 'contains', head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Shiprocket shipping' },
  { pattern: 'EASEBUZZ', matchType: 'contains', head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Payment gateway' },
  { pattern: 'RAZORPAY', matchType: 'contains', head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Payment gateway' },
  { pattern: 'PAYU', matchType: 'contains', head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Payment gateway' },

  // === SALES & MARKETING ===
  { pattern: 'FACEBOOK|META PLATFORMS', matchType: 'regex', head: 'G. Sales & Marketing', subhead: 'Facebook Ads', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Facebook/Meta advertising' },
  { pattern: 'GOOGLE INDIA|GOOGLE ADS|ADWORDS', matchType: 'regex', head: 'G. Sales & Marketing', subhead: 'Google Ads', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Google advertising' },
  { pattern: 'Advertisement.*Publicity', matchType: 'regex', head: 'G. Sales & Marketing', subhead: 'Amazon Ads', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Advertising expenses' },
  { pattern: 'AMAZON.*ADS|AMAZON.*ADVERTISING', matchType: 'regex', head: 'G. Sales & Marketing', subhead: 'Amazon Ads', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Amazon advertising' },
  { pattern: 'BLINKIT.*ADS|BLINKIT.*ADVERTISING', matchType: 'regex', head: 'G. Sales & Marketing', subhead: 'Blinkit Ads', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Blinkit advertising' },
  { pattern: 'SOCIAL MEDIA MARKETING|QUANTSCALE', matchType: 'regex', head: 'G. Sales & Marketing', subhead: 'Agency Fees', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Marketing agency' },
  { pattern: 'Branding.*Packaging|STUDIO SIX|LEMON.*COMPANY', matchType: 'regex', head: 'G. Sales & Marketing', subhead: 'Agency Fees', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Branding/packaging agency' },

  // === COGM (Cost of Goods Manufactured) ===
  { pattern: 'JOB WORK', matchType: 'contains', head: 'E. COGM', subhead: 'Job work', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Job work expenses' },
  { pattern: 'D.N. LED|KIRTI LIGHT', matchType: 'regex', head: 'E. COGM', subhead: 'Job work', confidence: 95, source: 'system', priority: 1, active: true, notes: 'LED job work vendors' },
  { pattern: 'FREIGHT|JAGDAMBA|NITCO|PORTER', matchType: 'regex', head: 'E. COGM', subhead: 'Inbound Transport', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Freight/transport vendors' },
  { pattern: 'Office Rent.*FACTORY|NEXIA', matchType: 'regex', head: 'E. COGM', subhead: 'Factory Rent', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Factory rent' },
  { pattern: 'Electricity|WATER.*ELECTRICITY', matchType: 'regex', head: 'E. COGM', subhead: 'Factory Electricity', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Factory utilities' },
  { pattern: 'POWER BACKUP|MAINTENANCE|CONSUMABLE', matchType: 'regex', head: 'E. COGM', subhead: 'Factory Maintainence', confidence: 85, source: 'system', priority: 1, active: true, notes: 'Factory maintenance' },
  { pattern: 'RAW MATERIAL|INVENTORY', matchType: 'regex', head: 'E. COGM', subhead: 'Raw Materials & Inventory', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Raw materials' },

  // === MANUFACTURING WAGES (Specific Employees) ===
  { pattern: 'PAWAN SHARMA', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },
  { pattern: 'OM PAL SINGH', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },
  { pattern: 'RAGHUVEER', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },
  { pattern: 'Ram Nivash', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },
  { pattern: 'Ram Jatan', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },
  { pattern: 'HIMANSHU PANDEY', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },
  { pattern: 'RENU DEVI', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },
  { pattern: 'PRITEE DEVI', matchType: 'contains', head: 'E. COGM', subhead: 'Manufacturing Wages', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Manufacturing employee' },

  // === OPERATING EXPENSES ===
  { pattern: 'Salary|ESI.*EMPLOYER', matchType: 'regex', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Salaries' },
  { pattern: 'SHAILABH KUMAR', matchType: 'contains', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Admin employee' },
  { pattern: 'Satendra kumar', matchType: 'contains', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Admin employee' },
  { pattern: 'PRABHASH CHANDRA', matchType: 'contains', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Admin employee' },
  { pattern: 'VIVEKA NAND', matchType: 'contains', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Admin employee' },
  { pattern: 'ASHISH KUMAR QC', matchType: 'contains', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 100, source: 'system', priority: 1, active: true, notes: 'QC employee' },
  { pattern: 'SHUBHI GUPTA', matchType: 'contains', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Admin employee' },
  { pattern: 'DANIYAL', matchType: 'contains', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Admin employee' },
  { pattern: 'Travelling|Miscellaneous|STAFF WELFARE', matchType: 'regex', head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel, insurance)', confidence: 85, source: 'system', priority: 1, active: true, notes: 'Misc expenses' },
  { pattern: 'AVANISH KUMAR.*EXP', matchType: 'regex', head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel, insurance)', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Employee expenses' },
  { pattern: 'LEGAL.*PROFESSIONAL|ACCOUNTING.*RETURN|JITIN|CA SAURABH|Sahas', matchType: 'regex', head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Legal/CA expenses' },
  { pattern: 'OFFICE EXPENSE|Printing.*Stationery|Bank Charge|COMMUNICATION|COURIER', matchType: 'regex', head: 'I. Operating Expenses', subhead: 'Administrative Expenses (Office Rent, utilities, admin supplies)', confidence: 85, source: 'system', priority: 1, active: true, notes: 'Admin expenses' },

  // === PLATFORM COSTS ===
  { pattern: 'SHOPIFY', matchType: 'contains', head: 'H. Platform Costs', subhead: 'Shopify Subscription', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Shopify' },
  { pattern: 'WATI', matchType: 'contains', head: 'H. Platform Costs', subhead: 'Wati Subscription', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Wati WhatsApp' },
  { pattern: 'SHOPFLO|LEARNYM', matchType: 'regex', head: 'H. Platform Costs', subhead: 'Shopflo subscription', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Other SaaS' },
  { pattern: 'ZOHO|CRM', matchType: 'regex', head: 'I. Operating Expenses', subhead: 'Platform Costs (CRM, inventory softwares)', confidence: 90, source: 'system', priority: 1, active: true, notes: 'CRM software' },

  // === NON-OPERATING ===
  { pattern: 'INTEREST.*EXPENSE|INTEREST.*PAID|BANK.*INTEREST', matchType: 'regex', head: 'J. Non-Operating', subhead: 'Less: Interest Expense', confidence: 90, source: 'system', priority: 1, active: true, notes: 'Interest expenses' },
  { pattern: 'DEPRECIATION', matchType: 'contains', head: 'J. Non-Operating', subhead: 'Less: Depreciation', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Depreciation' },
  { pattern: 'AMORTIZATION', matchType: 'contains', head: 'J. Non-Operating', subhead: 'Less: Amortization', confidence: 95, source: 'system', priority: 1, active: true, notes: 'Amortization' },

  // === IGNORE PATTERNS (Non-P&L) ===
  // GST Entries
  { pattern: 'CGST Input|SGST Input|IGST Input', matchType: 'regex', head: 'Z. Ignore', subhead: 'GST Input/Output', confidence: 100, source: 'system', priority: 1, active: true, notes: 'GST input credit' },
  { pattern: 'CGST Output|SGST Output|IGST Output', matchType: 'regex', head: 'Z. Ignore', subhead: 'GST Input/Output', confidence: 100, source: 'system', priority: 1, active: true, notes: 'GST output liability' },
  { pattern: 'DEFERRED INPUT', matchType: 'contains', head: 'Z. Ignore', subhead: 'GST Input/Output', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Deferred GST' },
  { pattern: 'GST PAYABLE', matchType: 'contains', head: 'Z. Ignore', subhead: 'GST Input/Output', confidence: 100, source: 'system', priority: 1, active: true, notes: 'GST payable' },
  { pattern: 'TCS.*CGST|TCS.*SGST|TCS.*IGST', matchType: 'regex', head: 'Z. Ignore', subhead: 'GST Input/Output', confidence: 100, source: 'system', priority: 1, active: true, notes: 'TCS on GST' },

  // TDS Entries
  { pattern: 'TDS.*Professionals|TDS.*Rent|TDS.*Contracts|TDS.*Commission|TDS.*Interest', matchType: 'regex', head: 'Z. Ignore', subhead: 'TDS', confidence: 100, source: 'system', priority: 1, active: true, notes: 'TDS deducted' },

  // Bank and Cash Entries
  { pattern: '^Cash$', matchType: 'regex', head: 'Z. Ignore', subhead: 'Bank Transfers', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Cash account' },
  { pattern: 'CENTRAL BANK|HDFC BANK|AXIS BANK|ICICI BANK|STATE BANK|KOTAK.*BANK|YES BANK', matchType: 'regex', head: 'Z. Ignore', subhead: 'Bank Transfers', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Bank accounts' },

  // Inter-company and Loans
  { pattern: 'DIRECTOR LOAN|HARLEEN CHAWLA', matchType: 'regex', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Director/promoter loan' },
  { pattern: 'UNSECURED LOAN', matchType: 'contains', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Loan account' },

  // Capital and Fixed Assets (Balance Sheet items)
  { pattern: 'SHARE CAPITAL|CAPITAL ACCOUNT|RESERVE.*SURPLUS', matchType: 'regex', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Capital/reserves' },
  { pattern: 'PLANT.*MACHINERY|FURNITURE.*FIXTURE|COMPUTER.*EQUIPMENT|OFFICE EQUIPMENT', matchType: 'regex', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Fixed assets' },
  { pattern: 'ACCUMULATED DEPRECIATION', matchType: 'contains', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Accumulated depreciation' },

  // Stock and Inventory (handled via COGS)
  { pattern: 'STOCK.*TRADE|INVENTORY', matchType: 'regex', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Stock accounts' },
  { pattern: 'OPENING BALANCE|CLOSING BALANCE', matchType: 'regex', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Balance entries' },
  { pattern: 'SUSPENSE|CLEARING', matchType: 'regex', head: 'Z. Ignore', subhead: 'Inter-company', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Suspense/clearing' },

  // === EXCLUDE PATTERNS (Personal) ===
  { pattern: 'DIWALI EXP|MLG SONS', matchType: 'regex', head: 'X. Exclude', subhead: 'Personal Expenses', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Personal expenses' },
  { pattern: 'PERSONAL', matchType: 'contains', head: 'X. Exclude', subhead: 'Personal Expenses', confidence: 100, source: 'system', priority: 1, active: true, notes: 'Personal expenses' },
];

const router = Router();

// ============================================
// DEFAULT CATEGORIES (from MIS_HEADS_CONFIG)
// ============================================

const DEFAULT_CATEGORIES: MISCategory[] = [
  // A. Revenue
  { head: 'A. Revenue', subhead: 'Website', type: 'revenue', plLine: 'Gross Revenue', active: true },
  { head: 'A. Revenue', subhead: 'Amazon', type: 'revenue', plLine: 'Gross Revenue', active: true },
  { head: 'A. Revenue', subhead: 'Blinkit', type: 'revenue', plLine: 'Gross Revenue', active: true },
  { head: 'A. Revenue', subhead: 'Offline & OEM', type: 'revenue', plLine: 'Gross Revenue', active: true },

  // B. Returns
  { head: 'B. Returns', subhead: 'Website', type: 'expense', plLine: 'Returns', active: true },
  { head: 'B. Returns', subhead: 'Amazon', type: 'expense', plLine: 'Returns', active: true },
  { head: 'B. Returns', subhead: 'Blinkit', type: 'expense', plLine: 'Returns', active: true },
  { head: 'B. Returns', subhead: 'Offline & OEM', type: 'expense', plLine: 'Returns', active: true },

  // C. Discounts
  { head: 'C. Discounts', subhead: 'Website', type: 'expense', plLine: 'Discounts', active: true },
  { head: 'C. Discounts', subhead: 'Amazon', type: 'expense', plLine: 'Discounts', active: true },
  { head: 'C. Discounts', subhead: 'Blinkit', type: 'expense', plLine: 'Discounts', active: true },
  { head: 'C. Discounts', subhead: 'Offline & OEM', type: 'expense', plLine: 'Discounts', active: true },

  // D. Taxes
  { head: 'D. Taxes', subhead: 'Website', type: 'expense', plLine: 'Taxes on Revenue', active: true },
  { head: 'D. Taxes', subhead: 'Amazon', type: 'expense', plLine: 'Taxes on Revenue', active: true },
  { head: 'D. Taxes', subhead: 'Blinkit', type: 'expense', plLine: 'Taxes on Revenue', active: true },
  { head: 'D. Taxes', subhead: 'Offline & OEM', type: 'expense', plLine: 'Taxes on Revenue', active: true },

  // E. COGM (Cost of Goods Manufactured)
  { head: 'E. COGM', subhead: 'Raw Materials & Inventory', type: 'expense', plLine: 'COGS', active: true },
  { head: 'E. COGM', subhead: 'Manufacturing Wages', type: 'expense', plLine: 'COGS', active: true },
  { head: 'E. COGM', subhead: 'Contract Wages (Mfg)', type: 'expense', plLine: 'COGS', active: true },
  { head: 'E. COGM', subhead: 'Inbound Transport', type: 'expense', plLine: 'COGS', active: true },
  { head: 'E. COGM', subhead: 'Factory Rent', type: 'expense', plLine: 'COGS', active: true },
  { head: 'E. COGM', subhead: 'Factory Electricity', type: 'expense', plLine: 'COGS', active: true },
  { head: 'E. COGM', subhead: 'Factory Maintainence', type: 'expense', plLine: 'COGS', active: true },
  { head: 'E. COGM', subhead: 'Job work', type: 'expense', plLine: 'COGS', active: true },

  // F. Channel & Fulfillment
  { head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', type: 'expense', plLine: 'Channel Costs', active: true },
  { head: 'F. Channel & Fulfillment', subhead: 'Blinkit Fees', type: 'expense', plLine: 'Channel Costs', active: true },
  { head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', type: 'expense', plLine: 'Channel Costs', active: true },

  // G. Sales & Marketing
  { head: 'G. Sales & Marketing', subhead: 'Facebook Ads', type: 'expense', plLine: 'Marketing', active: true },
  { head: 'G. Sales & Marketing', subhead: 'Google Ads', type: 'expense', plLine: 'Marketing', active: true },
  { head: 'G. Sales & Marketing', subhead: 'Amazon Ads', type: 'expense', plLine: 'Marketing', active: true },
  { head: 'G. Sales & Marketing', subhead: 'Blinkit Ads', type: 'expense', plLine: 'Marketing', active: true },
  { head: 'G. Sales & Marketing', subhead: 'Agency Fees', type: 'expense', plLine: 'Marketing', active: true },

  // H. Platform Costs
  { head: 'H. Platform Costs', subhead: 'Shopify Subscription', type: 'expense', plLine: 'Platform Costs', active: true },
  { head: 'H. Platform Costs', subhead: 'Wati Subscription', type: 'expense', plLine: 'Platform Costs', active: true },
  { head: 'H. Platform Costs', subhead: 'Shopflo subscription', type: 'expense', plLine: 'Platform Costs', active: true },

  // I. Operating Expenses
  { head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', type: 'expense', plLine: 'Operating Expenses', active: true },
  { head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel, insurance)', type: 'expense', plLine: 'Operating Expenses', active: true },
  { head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', type: 'expense', plLine: 'Operating Expenses', active: true },
  { head: 'I. Operating Expenses', subhead: 'Platform Costs (CRM, inventory softwares)', type: 'expense', plLine: 'Operating Expenses', active: true },
  { head: 'I. Operating Expenses', subhead: 'Administrative Expenses (Office Rent, utilities, admin supplies)', type: 'expense', plLine: 'Operating Expenses', active: true },

  // J. Non-Operating
  { head: 'J. Non-Operating', subhead: 'Less: Interest Expense', type: 'expense', plLine: 'Non-Operating', active: true },
  { head: 'J. Non-Operating', subhead: 'Less: Depreciation', type: 'expense', plLine: 'Non-Operating', active: true },
  { head: 'J. Non-Operating', subhead: 'Less: Amortization', type: 'expense', plLine: 'Non-Operating', active: true },
  { head: 'J. Non-Operating', subhead: 'Less: Income Tax', type: 'expense', plLine: 'Non-Operating', active: true },

  // X. Exclude
  { head: 'X. Exclude', subhead: 'Personal Expenses', type: 'ignore', plLine: 'Excluded', active: true },
  { head: 'X. Exclude', subhead: 'Owner Withdrawals', type: 'ignore', plLine: 'Excluded', active: true },

  // Z. Ignore
  { head: 'Z. Ignore', subhead: 'GST Input/Output', type: 'ignore', plLine: 'Ignored', active: true },
  { head: 'Z. Ignore', subhead: 'TDS', type: 'ignore', plLine: 'Ignored', active: true },
  { head: 'Z. Ignore', subhead: 'Bank Transfers', type: 'ignore', plLine: 'Ignored', active: true },
  { head: 'Z. Ignore', subhead: 'Inter-company', type: 'ignore', plLine: 'Ignored', active: true },
];

// ============================================
// SHEETS INITIALIZATION & STATUS
// ============================================

// Initialize Google Sheets connection
router.get('/status', async (req, res) => {
  try {
    const initialized = googleSheetsService.isInitialized();
    if (!initialized) {
      const success = await googleSheetsService.initialize();
      if (!success) {
        return res.json({ connected: false, error: 'Failed to initialize Google Sheets' });
      }
    }
    res.json({ connected: true });
  } catch (error) {
    res.json({
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Initialize/reset categories with default values
router.post('/categories/initialize', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const success = await googleSheetsService.initializeCategories(DEFAULT_CATEGORIES);
    if (success) {
      res.json({ success: true, count: DEFAULT_CATEGORIES.length });
    } else {
      res.status(500).json({ error: 'Failed to initialize categories' });
    }
  } catch (error) {
    console.error('Error initializing categories:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to initialize categories'
    });
  }
});

// ============================================
// CATEGORIES CRUD
// ============================================

router.get('/categories', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const categories = await googleSheetsService.getCategories();

    // If no categories exist, initialize with defaults
    if (categories.length === 0) {
      await googleSheetsService.initializeCategories(DEFAULT_CATEGORIES);
      res.json(DEFAULT_CATEGORIES);
    } else {
      res.json(categories);
    }
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch categories'
    });
  }
});

// ============================================
// RULES CRUD
// ============================================

router.get('/rules', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const rules = await googleSheetsService.getRules();
    res.json(rules);
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch rules'
    });
  }
});

router.post('/rules', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const {
      // New format (from client)
      ruleId, pattern, matchType, head, subhead, confidence, source, priority, active, createdDate, notes,
      // Legacy format
      entityName, entityType, keywords
    } = req.body;

    // Handle both old and new formats
    const actualPattern = pattern || entityName;
    const actualMatchType = matchType || 'contains';

    if (!actualPattern || !head || !subhead) {
      return res.status(400).json({ error: 'pattern (or entityName), head, and subhead are required' });
    }

    const rule = await googleSheetsService.addRule({
      entityName: actualPattern, // Use pattern as entityName for backward compatibility
      entityType: entityType || 'ledger',
      head,
      subhead,
      keywords: keywords || actualPattern,
      confidence: confidence ?? 100,
      source: source || 'user',
      // New fields
      pattern: actualPattern,
      matchType: actualMatchType,
      priority: priority ?? 0,
      active: active ?? true,
      notes: notes || ''
    });

    if (rule) {
      res.json(rule);
    } else {
      res.status(500).json({ error: 'Failed to add rule' });
    }
  } catch (error) {
    console.error('Error adding rule:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to add rule'
    });
  }
});

router.post('/rules/batch', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { rules } = req.body;

    if (!Array.isArray(rules) || rules.length === 0) {
      return res.status(400).json({ error: 'rules array is required' });
    }

    const addedRules = await googleSheetsService.addRulesBatch(rules);
    res.json({ added: addedRules.length, rules: addedRules });
  } catch (error) {
    console.error('Error adding rules batch:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to add rules batch'
    });
  }
});

router.put('/rules/:ruleId', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { ruleId } = req.params;
    const updates = { ...req.body };

    console.log(`Updating rule ${ruleId} with:`, JSON.stringify(req.body));

    // Map old field names to new field names for backward compatibility
    // The Edit modal may send entityName/keywords but Sheet uses pattern
    if (updates.entityName && !updates.pattern) {
      updates.pattern = updates.entityName;
      delete updates.entityName;
    }
    // Keywords can be appended to notes or pattern depending on use case
    if (updates.keywords) {
      // Add keywords to notes for reference
      if (updates.notes) {
        updates.notes = `${updates.notes} | Keywords: ${updates.keywords}`;
      } else {
        updates.notes = `Keywords: ${updates.keywords}`;
      }
      delete updates.keywords;
    }
    // Map entityType to notes if present
    if (updates.entityType) {
      const entityTypeNote = `Type: ${updates.entityType}`;
      updates.notes = updates.notes ? `${updates.notes} | ${entityTypeNote}` : entityTypeNote;
      delete updates.entityType;
    }

    console.log(`Mapped updates for ${ruleId}:`, JSON.stringify(updates));

    const success = await googleSheetsService.updateRule(ruleId, updates);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Rule not found' });
    }
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update rule'
    });
  }
});

router.delete('/rules/:ruleId', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { ruleId } = req.params;
    const success = await googleSheetsService.deleteRule(ruleId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Rule not found' });
    }
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete rule'
    });
  }
});

// ============================================
// CLASSIFICATION HISTORY
// ============================================

router.get('/history', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const history = await googleSheetsService.getHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch history'
    });
  }
});

router.post('/history', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { period, state, entity, amount, head, subhead, classifiedBy, ruleId } = req.body;

    if (!entity || !head || !subhead) {
      return res.status(400).json({ error: 'entity, head, and subhead are required' });
    }

    const success = await googleSheetsService.logClassification({
      period: period || '',
      state: state || '',
      entity,
      amount: amount || 0,
      head,
      subhead,
      classifiedBy: classifiedBy || 'user',
      ruleId: ruleId || ''
    });

    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to log classification' });
    }
  } catch (error) {
    console.error('Error logging classification:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to log classification'
    });
  }
});

// ============================================
// STATISTICS
// ============================================

router.get('/stats', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const stats = await googleSheetsService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch stats'
    });
  }
});

// ============================================
// AI CLASSIFICATION (Gemini)
// ============================================

router.post('/classify', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { entities, categories } = req.body;

    if (!Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json({ error: 'entities array is required' });
    }

    // Get categories if not provided
    let cats = categories;
    if (!cats) {
      cats = await googleSheetsService.getCategories();
    }

    // Get existing rules for context
    const existingRules = await googleSheetsService.getRules();

    // Load Gemini config from Google Sheets
    const misConfig = await googleSheetsService.getConfig();
    geminiClassifier.setConfig({
      model: misConfig.geminiModel,
      temperature: misConfig.geminiTemperature
    });

    // Classify using Gemini
    const classifications = await geminiClassifier.classifyEntities(entities, cats, existingRules);

    res.json(classifications);
  } catch (error) {
    console.error('Error classifying entities:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to classify entities'
    });
  }
});

// Classify a single entity
router.post('/classify-single', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { entityName, entityType, amount, context } = req.body;

    if (!entityName) {
      return res.status(400).json({ error: 'entityName is required' });
    }

    // Get categories and rules
    const categories = await googleSheetsService.getCategories();
    const existingRules = await googleSheetsService.getRules();

    // Check if we have an existing rule
    const existingRule = existingRules.find(r =>
      (r.entityName || r.pattern).toLowerCase() === entityName.toLowerCase()
    );

    if (existingRule) {
      // Use existing rule
      await googleSheetsService.incrementRuleUsage(existingRule.ruleId);
      return res.json({
        entityName,
        head: existingRule.head,
        subhead: existingRule.subhead,
        confidence: existingRule.confidence,
        source: 'rule',
        ruleId: existingRule.ruleId
      });
    }

    // No existing rule, use Gemini
    // Load Gemini config from Google Sheets
    const misConfig = await googleSheetsService.getConfig();
    geminiClassifier.setConfig({
      model: misConfig.geminiModel,
      temperature: misConfig.geminiTemperature
    });

    const classifications = await geminiClassifier.classifyEntities(
      [{ name: entityName, type: entityType || 'ledger', amount, context }],
      categories,
      existingRules
    );

    if (classifications.length > 0) {
      res.json(classifications[0]);
    } else {
      res.json({
        entityName,
        head: null,
        subhead: null,
        confidence: 0,
        source: 'none',
        needsReview: true
      });
    }
  } catch (error) {
    console.error('Error classifying entity:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to classify entity'
    });
  }
});

// Learn from user classification (save as rule)
router.post('/learn', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { entityName, entityType, head, subhead, period, state, amount } = req.body;

    if (!entityName || !head || !subhead) {
      return res.status(400).json({ error: 'entityName, head, and subhead are required' });
    }

    // Check if rule already exists
    const existingRules = await googleSheetsService.getRules();
    const existingRule = existingRules.find(r =>
      (r.entityName || r.pattern).toLowerCase() === entityName.toLowerCase()
    );

    let ruleId: string;

    if (existingRule) {
      // Update existing rule if classification changed
      if (existingRule.head !== head || existingRule.subhead !== subhead) {
        await googleSheetsService.updateRule(existingRule.ruleId, {
          head,
          subhead,
          timesUsed: existingRule.timesUsed + 1
        });
      } else {
        await googleSheetsService.incrementRuleUsage(existingRule.ruleId);
      }
      ruleId = existingRule.ruleId;
    } else {
      // Create new rule
      const newRule = await googleSheetsService.addRule({
        pattern: entityName,
        matchType: 'contains',
        head,
        subhead,
        confidence: 100,
        source: 'user',
        priority: 0, // User rules have highest priority
        active: true,
        notes: '',
        entityName,
        entityType: entityType || 'ledger',
        keywords: entityName
      });
      ruleId = newRule?.ruleId || '';
    }

    // Log to history
    await googleSheetsService.logClassification({
      period: period || '',
      state: state || '',
      entity: entityName,
      amount: amount || 0,
      head,
      subhead,
      classifiedBy: 'user',
      ruleId
    });

    res.json({ success: true, ruleId });
  } catch (error) {
    console.error('Error learning classification:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to learn classification'
    });
  }
});

// Batch learn from multiple classifications
router.post('/learn/batch', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { classifications, period, state } = req.body;

    if (!Array.isArray(classifications) || classifications.length === 0) {
      return res.status(400).json({ error: 'classifications array is required' });
    }

    const existingRules = await googleSheetsService.getRules();
    const newRules: any[] = [];
    const results: any[] = [];

    for (const classification of classifications) {
      const { entityName, entityType, head, subhead, amount } = classification;

      if (!entityName || !head || !subhead) continue;

      // Check if rule already exists
      const existingRule = existingRules.find(r =>
        (r.entityName || r.pattern).toLowerCase() === entityName.toLowerCase()
      );

      if (!existingRule) {
        newRules.push({
          pattern: entityName,
          matchType: 'contains' as const,
          head,
          subhead,
          confidence: 100,
          source: 'user' as const,
          priority: 0,
          active: true,
          notes: '',
          entityName,
          entityType: entityType || 'ledger',
          keywords: entityName
        });
      }

      results.push({
        entityName,
        head,
        subhead,
        isNew: !existingRule
      });
    }

    // Batch add new rules
    if (newRules.length > 0) {
      await googleSheetsService.addRulesBatch(newRules);
    }

    res.json({
      success: true,
      processed: classifications.length,
      newRules: newRules.length,
      results
    });
  } catch (error) {
    console.error('Error batch learning:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to batch learn'
    });
  }
});

// Find unclassified entities (entities without rules)
router.post('/find-unclassified', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { entities } = req.body;

    if (!Array.isArray(entities)) {
      return res.status(400).json({ error: 'entities array is required' });
    }

    const rules = await googleSheetsService.getRules();
    const ruleEntityNames = new Set(rules.map(r => (r.entityName || r.pattern).toLowerCase()));

    const unclassified = entities.filter(entity => {
      const name = typeof entity === 'string' ? entity : entity.name;
      return !ruleEntityNames.has(name.toLowerCase());
    });

    const classified = entities.filter(entity => {
      const name = typeof entity === 'string' ? entity : entity.name;
      return ruleEntityNames.has(name.toLowerCase());
    });

    res.json({
      total: entities.length,
      unclassified: unclassified.length,
      classified: classified.length,
      unclassifiedEntities: unclassified,
      classifiedEntities: classified.map(entity => {
        const name = typeof entity === 'string' ? entity : entity.name;
        const rule = rules.find(r => (r.entityName || r.pattern).toLowerCase() === name.toLowerCase());
        return {
          ...entity,
          rule
        };
      })
    });
  } catch (error) {
    console.error('Error finding unclassified:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to find unclassified entities'
    });
  }
});

// ============================================
// CONFIG ENDPOINTS
// ============================================

// Get current config
router.get('/config', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const config = await googleSheetsService.getConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch config'
    });
  }
});

// Update config
router.put('/config', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const updates = req.body;
    const success = await googleSheetsService.saveConfig(updates);

    if (success) {
      const newConfig = await googleSheetsService.getConfig();
      res.json({ success: true, config: newConfig });
    } else {
      res.status(500).json({ error: 'Failed to save config' });
    }
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to save config'
    });
  }
});

// ============================================
// MIGRATION ENDPOINTS
// ============================================

// Check migration status
router.get('/migration/status', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const config = await googleSheetsService.getConfig();
    const rules = await googleSheetsService.getRules();

    res.json({
      migrationCompleted: config.migrationCompleted,
      lastMigrationDate: config.lastMigrationDate,
      currentRulesCount: rules.length,
      migrationRulesCount: MIGRATION_RULES.length
    });
  } catch (error) {
    console.error('Error checking migration status:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to check migration status'
    });
  }
});

// Run migration
router.post('/migration/run', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    const { force } = req.body;

    // Check if migration already completed
    const config = await googleSheetsService.getConfig();
    if (config.migrationCompleted && !force) {
      return res.status(400).json({
        error: 'Migration already completed. Use force=true to re-run.',
        lastMigrationDate: config.lastMigrationDate
      });
    }

    // Initialize rules header
    await googleSheetsService.initializeRulesHeader();

    // Clear existing system rules if forcing re-migration
    if (force) {
      await googleSheetsService.clearAllRules();
    }

    // Add migration rules
    const addedRules = await googleSheetsService.addRulesBatch(MIGRATION_RULES);

    // Update config
    await googleSheetsService.saveConfig({
      migrationCompleted: true,
      lastMigrationDate: new Date().toISOString()
    });

    // Initialize config sheet with defaults if not done
    const newConfig = await googleSheetsService.getConfig();

    res.json({
      success: true,
      rulesAdded: addedRules.length,
      migrationDate: newConfig.lastMigrationDate,
      message: `Successfully migrated ${addedRules.length} classification rules to Google Sheets`
    });
  } catch (error) {
    console.error('Error running migration:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to run migration'
    });
  }
});

// Reset migration (clear all rules and re-migrate)
router.post('/migration/reset', async (req, res) => {
  try {
    if (!googleSheetsService.isInitialized()) {
      await googleSheetsService.initialize();
    }

    // Clear all rules
    await googleSheetsService.clearAllRules();

    // Reset migration status
    await googleSheetsService.saveConfig({
      migrationCompleted: false,
      lastMigrationDate: ''
    });

    res.json({
      success: true,
      message: 'Migration reset. Rules cleared. Run migration again to re-populate.'
    });
  } catch (error) {
    console.error('Error resetting migration:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to reset migration'
    });
  }
});

export default router;
