// Google Sheets Storage Utility for MIS Tracking
// Uses the public Google Sheets API (requires sheet to be "Anyone with link can edit")

import { MISRecord, MISStorageData, LearnedPattern, periodToKey } from '../types/misTracking';

// Google Sheet ID from the URL
const SHEET_ID = '1CgClltIfhvQMZ9kxQ2MqfcebyZzDoZdg6i2evHAo3JI';

// Sheet names
const MIS_DATA_SHEET = 'MIS_Data';
const PATTERNS_SHEET = 'Learned_Patterns';
const CONFIG_SHEET = 'Config';

// Helper to convert sheet data to JSON
function sheetsRowToObject<T>(headers: string[], row: unknown[]): T {
  const obj: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    const value = row[index];
    // Try to parse JSON strings
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        obj[header] = JSON.parse(value);
      } catch {
        obj[header] = value;
      }
    } else {
      obj[header] = value;
    }
  });
  return obj as T;
}

// ============================================
// LOCAL STORAGE FALLBACK
// ============================================
// Using localStorage as primary storage for now
// Google Sheets integration can be added later with proper API setup

const STORAGE_KEY = 'heatronics_mis_tracking';
const PATTERNS_KEY = 'heatronics_mis_patterns';

export async function loadMISData(): Promise<MISStorageData> {
  try {
    // Try localStorage first
    const stored = localStorage.getItem(STORAGE_KEY);
    const patterns = localStorage.getItem(PATTERNS_KEY);

    if (stored) {
      const data = JSON.parse(stored) as MISStorageData;
      // Merge patterns if stored separately
      if (patterns) {
        data.learnedPatterns = JSON.parse(patterns);
      }
      return data;
    }

    // Return empty data structure
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      periods: [],
      learnedPatterns: getDefaultPatterns()
    };
  } catch (error) {
    console.error('Error loading MIS data:', error);
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      periods: [],
      learnedPatterns: getDefaultPatterns()
    };
  }
}

export async function saveMISData(data: MISStorageData): Promise<boolean> {
  try {
    data.lastUpdated = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(PATTERNS_KEY, JSON.stringify(data.learnedPatterns));
    return true;
  } catch (error) {
    console.error('Error saving MIS data:', error);
    return false;
  }
}

export async function saveMISRecord(record: MISRecord): Promise<boolean> {
  try {
    const data = await loadMISData();

    // Find and update existing record or add new one
    const existingIndex = data.periods.findIndex(
      p => p.periodKey === record.periodKey
    );

    if (existingIndex >= 0) {
      data.periods[existingIndex] = record;
    } else {
      data.periods.push(record);
    }

    // Sort by period (newest first)
    data.periods.sort((a, b) => {
      if (a.period.year !== b.period.year) {
        return b.period.year - a.period.year;
      }
      return b.period.month - a.period.month;
    });

    return await saveMISData(data);
  } catch (error) {
    console.error('Error saving MIS record:', error);
    return false;
  }
}

export async function getMISRecord(periodKey: string): Promise<MISRecord | null> {
  try {
    const data = await loadMISData();
    return data.periods.find(p => p.periodKey === periodKey) || null;
  } catch (error) {
    console.error('Error getting MIS record:', error);
    return null;
  }
}

export async function getAllPeriods(): Promise<{ periodKey: string; period: { month: number; year: number } }[]> {
  try {
    const data = await loadMISData();
    return data.periods.map(p => ({
      periodKey: p.periodKey,
      period: p.period
    }));
  } catch (error) {
    console.error('Error getting periods:', error);
    return [];
  }
}

export async function deleteMISRecord(periodKey: string): Promise<boolean> {
  try {
    const data = await loadMISData();
    data.periods = data.periods.filter(p => p.periodKey !== periodKey);
    return await saveMISData(data);
  } catch (error) {
    console.error('Error deleting MIS record:', error);
    return false;
  }
}

// ============================================
// LEARNED PATTERNS
// ============================================

export async function saveLearnedPattern(pattern: LearnedPattern): Promise<boolean> {
  try {
    const data = await loadMISData();

    // Check if pattern already exists
    const existingIndex = data.learnedPatterns.findIndex(
      p => p.pattern.toLowerCase() === pattern.pattern.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Update existing
      data.learnedPatterns[existingIndex] = pattern;
    } else {
      // Add new
      data.learnedPatterns.push(pattern);
    }

    return await saveMISData(data);
  } catch (error) {
    console.error('Error saving learned pattern:', error);
    return false;
  }
}

export async function deleteLearnedPattern(patternId: string): Promise<boolean> {
  try {
    const data = await loadMISData();
    data.learnedPatterns = data.learnedPatterns.filter(p => p.id !== patternId);
    return await saveMISData(data);
  } catch (error) {
    console.error('Error deleting learned pattern:', error);
    return false;
  }
}

export async function getLearnedPatterns(): Promise<LearnedPattern[]> {
  try {
    const data = await loadMISData();
    return data.learnedPatterns;
  } catch (error) {
    console.error('Error getting learned patterns:', error);
    return getDefaultPatterns();
  }
}

// ============================================
// DEFAULT PATTERNS
// ============================================

function getDefaultPatterns(): LearnedPattern[] {
  const now = new Date().toISOString();

  return [
    // Channel & Fulfillment
    { id: 'p1', pattern: 'AMAZON.*LOGISTICS', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', createdAt: now, source: 'system' },
    { id: 'p2', pattern: 'AMAZON SELLER SERVICES', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', createdAt: now, source: 'system' },
    { id: 'p3', pattern: 'Storage Fee|SHIPPING FEE|Return Fee|Commission', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', createdAt: now, source: 'system' },
    { id: 'p4', pattern: 'PLATFORM FEE', head: 'F. Channel & Fulfillment', subhead: 'Amazon Fees', createdAt: now, source: 'system' },
    { id: 'p5', pattern: 'BLINKIT.*FEE|BLINK COMMERCE.*FEE', head: 'F. Channel & Fulfillment', subhead: 'Blinkit Fees', createdAt: now, source: 'system' },
    { id: 'p6', pattern: 'SHIPROCKET', head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', createdAt: now, source: 'system' },
    { id: 'p7', pattern: 'EASEBUZZ|RAZORPAY|PAYU|PAYMENT GATEWAY', head: 'F. Channel & Fulfillment', subhead: 'D2C Fees', createdAt: now, source: 'system' },

    // Sales & Marketing
    { id: 'p10', pattern: 'FACEBOOK|META PLATFORMS', head: 'G. Sales & Marketing', subhead: 'Facebook Ads', createdAt: now, source: 'system' },
    { id: 'p11', pattern: 'GOOGLE INDIA|GOOGLE ADS|ADWORDS', head: 'G. Sales & Marketing', subhead: 'Google Ads', createdAt: now, source: 'system' },
    { id: 'p12', pattern: 'AMAZON.*ADS|AMAZON.*ADVERTISING|Advertisement.*Publicity', head: 'G. Sales & Marketing', subhead: 'Amazon Ads', createdAt: now, source: 'system' },
    { id: 'p13', pattern: 'BLINKIT.*ADS|BLINKIT.*ADVERTISING', head: 'G. Sales & Marketing', subhead: 'Blinkit Ads', createdAt: now, source: 'system' },
    { id: 'p14', pattern: 'SOCIAL MEDIA MARKETING|QUANTSCALE|AGENCY|Branding.*Packaging', head: 'G. Sales & Marketing', subhead: 'Agency Fees', createdAt: now, source: 'system' },

    // COGM (Cost of Goods Manufactured)
    { id: 'p20', pattern: 'RAW MATERIAL|INVENTORY|STOCK', head: 'E. COGM', subhead: 'Raw Materials & Inventory', createdAt: now, source: 'system' },
    { id: 'p21', pattern: 'PAWAN SHARMA|OM PAL SINGH|RAGHUVEER|Ram Nivash|Ram Jatan|HIMANSHU PANDEY|RENU DEVI|PRITEE DEVI', head: 'E. COGM', subhead: 'Manufacturing Wages', createdAt: now, source: 'system' },
    { id: 'p22', pattern: 'JOB WORK|D\\.N\\. LED|KIRTI LIGHT', head: 'E. COGM', subhead: 'Job work', createdAt: now, source: 'system' },
    { id: 'p23', pattern: 'FREIGHT|JAGDAMBA|NITCO|PORTER|INBOUND.*TRANSPORT', head: 'E. COGM', subhead: 'Inbound Transport', createdAt: now, source: 'system' },
    { id: 'p24', pattern: 'FACTORY.*RENT|Office Rent.*FACTORY|NEXIA', head: 'E. COGM', subhead: 'Factory Rent', createdAt: now, source: 'system' },
    { id: 'p25', pattern: 'FACTORY.*ELECTRICITY|ELECTRICITY.*FACTORY|WATER.*ELECTRICITY', head: 'E. COGM', subhead: 'Factory Electricity', createdAt: now, source: 'system' },
    { id: 'p26', pattern: 'POWER BACKUP|FACTORY.*MAINTENANCE|MAINTENANCE.*FACTORY|CONSUMABLE', head: 'E. COGM', subhead: 'Factory Maintainence', createdAt: now, source: 'system' },
    { id: 'p27', pattern: 'CONTRACT.*WAGES|CONTRACT.*WORK.*MFG', head: 'E. COGM', subhead: 'Contract Wages (Mfg)', createdAt: now, source: 'system' },

    // Platform Costs
    { id: 'p30', pattern: 'SHOPIFY', head: 'H. Platform Costs', subhead: 'Shopify Subscription', createdAt: now, source: 'system' },
    { id: 'p31', pattern: 'WATI', head: 'H. Platform Costs', subhead: 'Wati Subscription', createdAt: now, source: 'system' },
    { id: 'p32', pattern: 'SHOPFLO', head: 'H. Platform Costs', subhead: 'Shopflo subscription', createdAt: now, source: 'system' },

    // Operating Expenses
    { id: 'p40', pattern: 'SALARY|ESI.*EMPLOYER|SHAILABH KUMAR|Satendra kumar|AVANISH KUMAR(?!.*EXP)|PRABHASH CHANDRA|VIVEKA NAND|ASHISH KUMAR QC|SHUBHI GUPTA|DANIYAL', head: 'I. Operating Expenses', subhead: 'Salaries (Admin, Mgmt)', createdAt: now, source: 'system' },
    { id: 'p41', pattern: 'TRAVEL|TRAVELLING|INSURANCE|MISCELLANEOUS|STAFF WELFARE|AVANISH KUMAR.*EXP', head: 'I. Operating Expenses', subhead: 'Miscellaneous (Travel, insurance)', createdAt: now, source: 'system' },
    { id: 'p42', pattern: 'LEGAL|PROFESSIONAL|ACCOUNTING|CA SAURABH|JITIN|Sahas', head: 'I. Operating Expenses', subhead: 'Legal & CA expenses', createdAt: now, source: 'system' },
    { id: 'p43', pattern: 'CRM|ZOHO|INVENTORY SOFTWARE|LEARNYM', head: 'I. Operating Expenses', subhead: 'Platform Costs (CRM, inventory softwares)', createdAt: now, source: 'system' },
    { id: 'p44', pattern: 'OFFICE.*EXPENSE|OFFICE.*RENT|UTILITIES|ADMIN|Printing.*Stationery|Bank Charge|COMMUNICATION|COURIER', head: 'I. Operating Expenses', subhead: 'Administrative Expenses (Office Rent, utilities, admin supplies)', createdAt: now, source: 'system' },

    // Non-Operating
    { id: 'p50', pattern: 'INTEREST.*EXPENSE|INTEREST.*PAID|BANK.*INTEREST', head: 'J. Non-Operating', subhead: 'Less: Interest Expense', createdAt: now, source: 'system' },
    { id: 'p51', pattern: 'DEPRECIATION', head: 'J. Non-Operating', subhead: 'Less: Depreciation', createdAt: now, source: 'system' },
    { id: 'p52', pattern: 'AMORTIZATION', head: 'J. Non-Operating', subhead: 'Less: Amortization', createdAt: now, source: 'system' },
    { id: 'p53', pattern: 'INCOME TAX(?!.*TDS)|TAX.*PROVISION', head: 'J. Non-Operating', subhead: 'Less: Income Tax', createdAt: now, source: 'system' },

    // Ignore (Non-P&L)
    { id: 'p60', pattern: 'GST.*INPUT|GST.*OUTPUT|CGST|SGST|IGST|TCS|DEFERRED', head: 'Z. Ignore', subhead: 'GST Input/Output', createdAt: now, source: 'system' },
    { id: 'p61', pattern: 'TDS(?!.*REFUND)', head: 'Z. Ignore', subhead: 'TDS', createdAt: now, source: 'system' },
    { id: 'p62', pattern: 'CENTRAL BANK|HDFC BANK|AXIS BANK|^Cash$|BANK TRANSFER', head: 'Z. Ignore', subhead: 'Bank Transfers', createdAt: now, source: 'system' },
    { id: 'p63', pattern: 'DIRECTOR LOAN|HARLEEN CHAWLA|INTER.*COMPANY', head: 'Z. Ignore', subhead: 'Inter-company', createdAt: now, source: 'system' },

    // Exclude (Personal)
    { id: 'p70', pattern: 'DIWALI EXP|MLG SONS|PERSONAL', head: 'X. Exclude', subhead: 'Personal Expenses', createdAt: now, source: 'system' },
  ];
}

// ============================================
// EXPORT TO GOOGLE SHEETS (Future)
// ============================================

export async function exportToGoogleSheets(): Promise<{ success: boolean; message: string }> {
  // This would require Google Sheets API authentication
  // For now, return instructions
  return {
    success: false,
    message: 'Google Sheets export requires API setup. For now, use the Excel export feature.'
  };
}

// ============================================
// IMPORT FROM GOOGLE SHEETS (Future)
// ============================================

export async function importFromGoogleSheets(): Promise<{ success: boolean; message: string; data?: MISStorageData }> {
  // This would require Google Sheets API authentication
  return {
    success: false,
    message: 'Google Sheets import requires API setup. Data is stored in browser localStorage.'
  };
}
