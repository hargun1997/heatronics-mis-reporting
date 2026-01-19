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
    // Try to save to API first
    const apiSuccess = await savePatternToAPI(pattern);
    if (apiSuccess) {
      // Clear cache to force refresh on next fetch
      localStorage.removeItem(API_RULES_CACHE_KEY);
      localStorage.removeItem(API_RULES_CACHE_TIMESTAMP_KEY);
      return true;
    }

    // Fallback to localStorage
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

// Save pattern to API
async function savePatternToAPI(pattern: LearnedPattern): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/classification/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ruleId: pattern.id,
        pattern: pattern.pattern,
        matchType: pattern.matchType || 'contains',
        head: pattern.head,
        subhead: pattern.subhead,
        confidence: pattern.confidence ?? 100,
        source: pattern.source || 'user',
        priority: pattern.priority ?? 0, // User rules get highest priority
        active: pattern.active ?? true,
        createdDate: pattern.createdAt,
        notes: pattern.notes || ''
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Error saving pattern to API:', error);
    return false;
  }
}

// Delete pattern from API
export async function deletePatternFromAPI(patternId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/classification/rules/${patternId}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      // Clear cache
      localStorage.removeItem(API_RULES_CACHE_KEY);
      localStorage.removeItem(API_RULES_CACHE_TIMESTAMP_KEY);
    }
    return response.ok;
  } catch (error) {
    console.error('Error deleting pattern from API:', error);
    return false;
  }
}

// Update pattern in API
export async function updatePatternInAPI(pattern: LearnedPattern): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/classification/rules/${pattern.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ruleId: pattern.id,
        pattern: pattern.pattern,
        matchType: pattern.matchType || 'contains',
        head: pattern.head,
        subhead: pattern.subhead,
        confidence: pattern.confidence ?? 100,
        source: pattern.source || 'user',
        priority: pattern.priority ?? 0,
        active: pattern.active ?? true,
        createdDate: pattern.createdAt,
        notes: pattern.notes || ''
      })
    });
    if (response.ok) {
      // Clear cache
      localStorage.removeItem(API_RULES_CACHE_KEY);
      localStorage.removeItem(API_RULES_CACHE_TIMESTAMP_KEY);
    }
    return response.ok;
  } catch (error) {
    console.error('Error updating pattern in API:', error);
    return false;
  }
}

export async function deleteLearnedPattern(patternId: string): Promise<boolean> {
  try {
    // Try to delete from API first
    const apiSuccess = await deletePatternFromAPI(patternId);
    if (apiSuccess) {
      return true;
    }

    // Fallback to localStorage
    const data = await loadMISData();
    data.learnedPatterns = data.learnedPatterns.filter(p => p.id !== patternId);
    return await saveMISData(data);
  } catch (error) {
    console.error('Error deleting learned pattern:', error);
    return false;
  }
}

// Cache key for API rules
const API_RULES_CACHE_KEY = 'heatronics_api_rules_cache';
const API_RULES_CACHE_TIMESTAMP_KEY = 'heatronics_api_rules_timestamp';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// API base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function getLearnedPatterns(): Promise<LearnedPattern[]> {
  try {
    // Try to fetch from API first
    const apiPatterns = await fetchRulesFromAPI();
    if (apiPatterns && apiPatterns.length > 0) {
      return apiPatterns;
    }

    // Fallback to cached API rules
    const cached = getCachedRules();
    if (cached && cached.length > 0) {
      return cached;
    }

    // Last fallback to localStorage data
    const data = await loadMISData();
    if (data.learnedPatterns && data.learnedPatterns.length > 0) {
      return data.learnedPatterns;
    }

    // Ultimate fallback to hardcoded (should be removed after migration)
    return getDefaultPatterns();
  } catch (error) {
    console.error('Error getting learned patterns:', error);

    // Try cache on error
    const cached = getCachedRules();
    if (cached && cached.length > 0) {
      return cached;
    }

    return getDefaultPatterns();
  }
}

// Fetch rules from server API
async function fetchRulesFromAPI(): Promise<LearnedPattern[] | null> {
  try {
    // Check if cache is still valid
    const cacheTimestamp = localStorage.getItem(API_RULES_CACHE_TIMESTAMP_KEY);
    if (cacheTimestamp) {
      const timestamp = parseInt(cacheTimestamp);
      if (Date.now() - timestamp < CACHE_DURATION_MS) {
        // Cache still valid, use cached data
        const cached = getCachedRules();
        if (cached && cached.length > 0) {
          return cached;
        }
      }
    }

    // Fetch from API
    const response = await fetch(`${API_BASE_URL}/api/classification/rules`);
    if (!response.ok) {
      console.warn('Failed to fetch rules from API:', response.status);
      return null;
    }

    const rules = await response.json();
    if (!Array.isArray(rules) || rules.length === 0) {
      return null;
    }

    // Transform API rules to LearnedPattern format
    const patterns: LearnedPattern[] = rules
      .filter((rule: any) => rule.active !== false) // Only active rules
      .sort((a: any, b: any) => (a.priority || 1) - (b.priority || 1)) // Sort by priority
      .map((rule: any) => ({
        id: rule.ruleId || `api_${Date.now()}_${Math.random()}`,
        pattern: rule.pattern,
        matchType: rule.matchType || 'regex',
        head: rule.head,
        subhead: rule.subhead,
        confidence: rule.confidence || 100,
        priority: rule.priority || 1,
        active: rule.active !== false,
        createdAt: rule.createdDate || new Date().toISOString(),
        source: rule.source || 'system',
        notes: rule.notes || ''
      }));

    // Cache the results
    localStorage.setItem(API_RULES_CACHE_KEY, JSON.stringify(patterns));
    localStorage.setItem(API_RULES_CACHE_TIMESTAMP_KEY, Date.now().toString());

    console.log(`Loaded ${patterns.length} classification rules from API`);
    return patterns;
  } catch (error) {
    console.error('Error fetching rules from API:', error);
    return null;
  }
}

// Get cached rules
function getCachedRules(): LearnedPattern[] | null {
  try {
    const cached = localStorage.getItem(API_RULES_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch {
    return null;
  }
}

// Force refresh rules from API (clear cache and fetch)
export async function refreshRulesFromAPI(): Promise<LearnedPattern[]> {
  // Clear cache
  localStorage.removeItem(API_RULES_CACHE_KEY);
  localStorage.removeItem(API_RULES_CACHE_TIMESTAMP_KEY);

  // Fetch fresh
  const patterns = await fetchRulesFromAPI();
  return patterns || getDefaultPatterns();
}

// Get migration status
export async function getMigrationStatus(): Promise<{
  migrationCompleted: boolean;
  lastMigrationDate: string;
  currentRulesCount: number;
  migrationRulesCount: number;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/classification/migration/status`);
    if (!response.ok) {
      throw new Error(`Failed to fetch migration status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching migration status:', error);
    return {
      migrationCompleted: false,
      lastMigrationDate: '',
      currentRulesCount: 0,
      migrationRulesCount: 0
    };
  }
}

// Run migration
export async function runMigration(force: boolean = false): Promise<{
  success: boolean;
  rulesAdded?: number;
  message: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/classification/migration/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.error || 'Migration failed'
      };
    }

    // Clear cache to force refresh
    localStorage.removeItem(API_RULES_CACHE_KEY);
    localStorage.removeItem(API_RULES_CACHE_TIMESTAMP_KEY);

    return {
      success: true,
      rulesAdded: result.rulesAdded,
      message: result.message
    };
  } catch (error) {
    console.error('Error running migration:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Migration failed'
    };
  }
}

// Get config from API
export async function getClassificationConfig(): Promise<{
  geminiPrompt: string;
  geminiModel: string;
  geminiTemperature: number;
  confidenceAutoAccept: number;
  confidenceNeedsReview: number;
} | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/classification/config`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching config:', error);
    return null;
  }
}

// Update config
export async function updateClassificationConfig(config: {
  geminiPrompt?: string;
  geminiModel?: string;
  geminiTemperature?: number;
  confidenceAutoAccept?: number;
  confidenceNeedsReview?: number;
}): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/classification/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return response.ok;
  } catch (error) {
    console.error('Error updating config:', error);
    return false;
  }
}

// ============================================
// DEFAULT PATTERNS
// ============================================

function getDefaultPatterns(): LearnedPattern[] {
  const now = new Date().toISOString();

  // Helper to create pattern with all required fields
  const createPattern = (
    id: string,
    pattern: string,
    head: LearnedPattern['head'],
    subhead: string
  ): LearnedPattern => ({
    id,
    pattern,
    matchType: 'regex',
    head,
    subhead,
    confidence: 0.8,
    priority: 1, // system priority
    active: true,
    createdAt: now,
    source: 'system'
  });

  return [
    // Channel & Fulfillment
    createPattern('p1', 'AMAZON.*LOGISTICS', 'F. Channel & Fulfillment', 'Amazon Fees'),
    createPattern('p2', 'AMAZON SELLER SERVICES', 'F. Channel & Fulfillment', 'Amazon Fees'),
    createPattern('p3', 'Storage Fee|SHIPPING FEE|Return Fee|Commission', 'F. Channel & Fulfillment', 'Amazon Fees'),
    createPattern('p4', 'PLATFORM FEE', 'F. Channel & Fulfillment', 'Amazon Fees'),
    createPattern('p5', 'BLINKIT.*FEE|BLINK COMMERCE.*FEE', 'F. Channel & Fulfillment', 'Blinkit Fees'),
    createPattern('p6', 'SHIPROCKET', 'F. Channel & Fulfillment', 'D2C Fees'),
    createPattern('p7', 'EASEBUZZ|RAZORPAY|PAYU|PAYMENT GATEWAY', 'F. Channel & Fulfillment', 'D2C Fees'),

    // Sales & Marketing
    createPattern('p10', 'FACEBOOK|META PLATFORMS', 'G. Sales & Marketing', 'Facebook Ads'),
    createPattern('p11', 'GOOGLE INDIA|GOOGLE ADS|ADWORDS', 'G. Sales & Marketing', 'Google Ads'),
    createPattern('p12', 'AMAZON.*ADS|AMAZON.*ADVERTISING|Advertisement.*Publicity', 'G. Sales & Marketing', 'Amazon Ads'),
    createPattern('p13', 'BLINKIT.*ADS|BLINKIT.*ADVERTISING', 'G. Sales & Marketing', 'Blinkit Ads'),
    createPattern('p14', 'SOCIAL MEDIA MARKETING|QUANTSCALE|AGENCY|Branding.*Packaging', 'G. Sales & Marketing', 'Agency Fees'),

    // COGM (Cost of Goods Manufactured)
    createPattern('p20', 'RAW MATERIAL|INVENTORY|STOCK', 'E. COGM', 'Raw Materials & Inventory'),
    createPattern('p21', 'PAWAN SHARMA|OM PAL SINGH|RAGHUVEER|Ram Nivash|Ram Jatan|HIMANSHU PANDEY|RENU DEVI|PRITEE DEVI', 'E. COGM', 'Manufacturing Wages'),
    createPattern('p22', 'JOB WORK|D\\.N\\. LED|KIRTI LIGHT', 'E. COGM', 'Job work'),
    createPattern('p23', 'FREIGHT|JAGDAMBA|NITCO|PORTER|INBOUND.*TRANSPORT', 'E. COGM', 'Inbound Transport'),
    createPattern('p24', 'FACTORY.*RENT|Office Rent.*FACTORY|NEXIA', 'E. COGM', 'Factory Rent'),
    createPattern('p25', 'FACTORY.*ELECTRICITY|ELECTRICITY.*FACTORY|WATER.*ELECTRICITY', 'E. COGM', 'Factory Electricity'),
    createPattern('p26', 'POWER BACKUP|FACTORY.*MAINTENANCE|MAINTENANCE.*FACTORY|CONSUMABLE', 'E. COGM', 'Factory Maintainence'),
    createPattern('p27', 'CONTRACT.*WAGES|CONTRACT.*WORK.*MFG', 'E. COGM', 'Contract Wages (Mfg)'),

    // Platform Costs
    createPattern('p30', 'SHOPIFY', 'H. Platform Costs', 'Shopify Subscription'),
    createPattern('p31', 'WATI', 'H. Platform Costs', 'Wati Subscription'),
    createPattern('p32', 'SHOPFLO', 'H. Platform Costs', 'Shopflo subscription'),

    // Operating Expenses
    createPattern('p40', 'SALARY|ESI.*EMPLOYER|SHAILABH KUMAR|Satendra kumar|AVANISH KUMAR(?!.*EXP)|PRABHASH CHANDRA|VIVEKA NAND|ASHISH KUMAR QC|SHUBHI GUPTA|DANIYAL', 'I. Operating Expenses', 'Salaries (Admin, Mgmt)'),
    createPattern('p41', 'TRAVEL|TRAVELLING|INSURANCE|MISCELLANEOUS|STAFF WELFARE|AVANISH KUMAR.*EXP', 'I. Operating Expenses', 'Miscellaneous (Travel, insurance)'),
    createPattern('p42', 'LEGAL|PROFESSIONAL|ACCOUNTING|CA SAURABH|JITIN|Sahas', 'I. Operating Expenses', 'Legal & CA expenses'),
    createPattern('p43', 'CRM|ZOHO|INVENTORY SOFTWARE|LEARNYM', 'I. Operating Expenses', 'Platform Costs (CRM, inventory softwares)'),
    createPattern('p44', 'OFFICE.*EXPENSE|OFFICE.*RENT|UTILITIES|ADMIN|Printing.*Stationery|Bank Charge|COMMUNICATION|COURIER', 'I. Operating Expenses', 'Administrative Expenses (Office Rent, utilities, admin supplies)'),

    // Non-Operating
    createPattern('p50', 'INTEREST.*EXPENSE|INTEREST.*PAID|BANK.*INTEREST', 'J. Non-Operating', 'Less: Interest Expense'),
    createPattern('p51', 'DEPRECIATION', 'J. Non-Operating', 'Less: Depreciation'),
    createPattern('p52', 'AMORTIZATION', 'J. Non-Operating', 'Less: Amortization'),
    createPattern('p53', 'INCOME TAX(?!.*TDS)|TAX.*PROVISION', 'J. Non-Operating', 'Less: Income Tax'),

    // Ignore (Non-P&L)
    createPattern('p60', 'GST.*INPUT|GST.*OUTPUT|CGST|SGST|IGST|TCS|DEFERRED', 'Z. Ignore', 'GST Input/Output'),
    createPattern('p61', 'TDS(?!.*REFUND)', 'Z. Ignore', 'TDS'),
    createPattern('p62', 'CENTRAL BANK|HDFC BANK|AXIS BANK|^Cash$|BANK TRANSFER', 'Z. Ignore', 'Bank Transfers'),
    createPattern('p63', 'DIRECTOR LOAN|HARLEEN CHAWLA|INTER.*COMPANY', 'Z. Ignore', 'Inter-company'),

    // Exclude (Personal)
    createPattern('p70', 'DIWALI EXP|MLG SONS|PERSONAL', 'X. Exclude', 'Personal Expenses'),
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
