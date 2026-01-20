// Google Sheets Storage Utility for MIS Tracking
// Uses the public Google Sheets API (requires sheet to be "Anyone with link can edit")

import { MISRecord, MISStorageData, LearnedPattern, periodToKey } from '../types/misTracking';
import { misDataStore } from '../services/misDataStore';
import { MonthlyBSData } from '../types/monthlyMIS';

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

      // === SYNC TO MIS DATA STORE ===
      // Populate misDataStore from loaded data for proper per-month handling
      syncAllRecordsToMISDataStore(data.periods);

      return data;
    }

    // Return empty data structure - patterns should come from Google Sheets API
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      periods: [],
      learnedPatterns: []  // No hardcoded defaults - use Google Sheets only
    };
  } catch (error) {
    console.error('Error loading MIS data:', error);
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      periods: [],
      learnedPatterns: []  // No hardcoded defaults - use Google Sheets only
    };
  }
}

/**
 * Sync all loaded records to misDataStore
 * Called on app startup when loading from localStorage
 */
function syncAllRecordsToMISDataStore(records: MISRecord[]): void {
  console.log(`[MIS Sync] Syncing ${records.length} records to MIS data store...`);
  for (const record of records) {
    syncRecordToMISDataStore(record);
  }
  console.log('[MIS Sync] Sync complete. Data store summary:', misDataStore.getDataSummary());
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

    // === SYNC WITH MIS DATA STORE ===
    // Store balance sheet data per month for proper aggregation
    syncRecordToMISDataStore(record);

    return await saveMISData(data);
  } catch (error) {
    console.error('Error saving MIS record:', error);
    return false;
  }
}

/**
 * Sync MISRecord to the monthly MIS data store
 * This ensures proper per-month storage for correct aggregation
 */
function syncRecordToMISDataStore(record: MISRecord): void {
  try {
    // Convert periodKey to month format (e.g., "2025-12")
    const monthKey = record.periodKey; // Assuming periodKey is already in YYYY-MM format

    // Sync balance sheet data if present
    if (record.balanceSheet) {
      // Determine state from record (default to 'UP' as primary)
      const primaryState = record.states?.[0] || 'UP';

      const bsData: Omit<MonthlyBSData, 'month' | 'state'> = {
        openingStock: record.balanceSheet.openingStock || 0,
        purchases: record.balanceSheet.purchases || 0,
        closingStock: record.balanceSheet.closingStock || 0,
        grossSales: record.balanceSheet.grossSales || 0,
        directExpenses: 0,
        grossProfit: record.balanceSheet.grossProfit || 0,
        netProfit: record.balanceSheet.netProfitLoss > 0 ? record.balanceSheet.netProfitLoss : 0,
        netLoss: record.balanceSheet.netProfitLoss < 0 ? Math.abs(record.balanceSheet.netProfitLoss) : 0,
        parsedAt: new Date(),
        sourceFile: 'synced-from-localStorage',
        extractedLines: [],
      };

      misDataStore.storeBSData(monthKey, primaryState, bsData);
      console.log(`[MIS Sync] Stored BS data for ${monthKey}/${primaryState}:`, {
        openingStock: bsData.openingStock,
        purchases: bsData.purchases,
        closingStock: bsData.closingStock,
      });
    }

    // Note: Journal entries are already classified and stored in record.classifiedTransactions
    // We could also sync those, but for now focusing on BS data which was the main issue
  } catch (error) {
    console.error('Error syncing to MIS data store:', error);
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

    // No hardcoded defaults - return empty array (rules should be in Google Sheets)
    console.warn('No rules found - please check Google Sheets MIS_Classification_Rules');
    return [];
  } catch (error) {
    console.error('Error getting learned patterns:', error);

    // Try cache on error
    const cached = getCachedRules();
    if (cached && cached.length > 0) {
      return cached;
    }

    // No hardcoded defaults - return empty array
    return [];
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

  // Fetch fresh - no hardcoded fallback
  const patterns = await fetchRulesFromAPI();
  return patterns || [];
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
