import { google, sheets_v4 } from 'googleapis';

// ============================================
// TYPES
// ============================================

export interface MISCategory {
  head: string;
  subhead: string;
  type: 'revenue' | 'expense' | 'ignore';
  plLine: string;
  active: boolean;
}

export interface ClassificationRule {
  ruleId: string;
  pattern: string;  // The pattern to match
  matchType: 'exact' | 'contains' | 'regex';
  head: string;
  subhead: string;
  confidence: number;
  source: 'user' | 'system' | 'gemini';
  priority: number;  // 0 = user (highest), 1 = system, 2 = AI
  active: boolean;
  createdDate: string;
  timesUsed: number;
  notes: string;
  // Backward compatibility fields
  entityName?: string;  // Alias for pattern (for backward compatibility)
  entityType?: 'ledger' | 'party';
  keywords?: string;
}

export interface ClassificationHistoryEntry {
  timestamp: string;
  period: string;
  state: string;
  entity: string;
  amount: number;
  head: string;
  subhead: string;
  classifiedBy: string;
  ruleId: string;
}

// ============================================
// SHEET CONFIGURATION
// ============================================

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1CgClltIfhvQMZ9kxQ2MqfcebyZzDoZdg6i2evHAo3JI';

const SHEET_NAMES = {
  CATEGORIES: 'MIS_Categories',
  RULES: 'MIS_Classification_Rules',
  HISTORY: 'MIS_Classification_History',
  CONFIG: 'MIS_Config'
};

// ============================================
// CONFIG TYPES
// ============================================

export interface MISConfig {
  geminiPrompt: string;
  geminiModel: string;
  geminiTemperature: number;
  confidenceAutoAccept: number;
  confidenceNeedsReview: number;
  migrationCompleted: boolean;
  lastMigrationDate: string;
}

// ============================================
// GOOGLE SHEETS SERVICE
// ============================================

class GoogleSheetsService {
  private sheets: sheets_v4.Sheets | null = null;
  private initialized: boolean = false;

  private async getAuth() {
    // Use Application Default Credentials (ADC)
    // Same auth pattern as Google Drive service
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
  }

  async initialize(): Promise<boolean> {
    try {
      const auth = await this.getAuth();
      this.sheets = google.sheets({ version: 'v4', auth });

      // Test connection by reading sheet metadata
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: 'sheets.properties.title'
      });

      const sheetTitles = response.data.sheets?.map(s => s.properties?.title) || [];
      console.log('Google Sheets connected. Available sheets:', sheetTitles);

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Google Sheets:', error);
      return false;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================
  // CATEGORIES OPERATIONS
  // ============================================

  async getCategories(): Promise<MISCategory[]> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.CATEGORIES}!A:F`,
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return [];

      // Skip header row
      return rows.slice(1).map(row => ({
        head: row[0] || '',
        subhead: row[1] || '',
        type: (row[2] || 'expense') as 'revenue' | 'expense' | 'ignore',
        plLine: row[3] || '',
        active: row[4]?.toUpperCase() !== 'FALSE'
      })).filter(cat => cat.head && cat.subhead);
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  async initializeCategories(categories: MISCategory[]): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      // Clear existing data (except header)
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.CATEGORIES}!A2:F1000`,
      });

      // Write header
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.CATEGORIES}!A1:F1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Head', 'Subhead', 'Type', 'P&L Line', 'Active', 'Notes']]
        }
      });

      // Write categories
      if (categories.length > 0) {
        const values = categories.map(cat => [
          cat.head,
          cat.subhead,
          cat.type,
          cat.plLine,
          cat.active ? 'TRUE' : 'FALSE',
          ''
        ]);

        await this.sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAMES.CATEGORIES}!A:F`,
          valueInputOption: 'RAW',
          requestBody: { values }
        });
      }

      console.log(`Initialized ${categories.length} categories`);
      return true;
    } catch (error) {
      console.error('Error initializing categories:', error);
      return false;
    }
  }

  // ============================================
  // RULES OPERATIONS
  // ============================================

  async getRules(): Promise<ClassificationRule[]> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A:L`,
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return [];

      // Skip header row
      // Columns: Rule_ID, Pattern, Match_Type, Head, Subhead, Confidence, Source, Priority, Active, Created_Date, Times_Used, Notes
      return rows.slice(1).map(row => {
        const pattern = row[1] || '';
        return {
          ruleId: row[0] || '',
          pattern,
          matchType: (row[2] || 'contains') as 'exact' | 'contains' | 'regex',
          head: row[3] || '',
          subhead: row[4] || '',
          confidence: parseFloat(row[5]) || 100,
          source: (row[6] || 'system') as 'user' | 'system' | 'gemini',
          priority: parseInt(row[7]) || 1,
          active: row[8]?.toUpperCase() !== 'FALSE',
          createdDate: row[9] || new Date().toISOString(),
          timesUsed: parseInt(row[10]) || 0,
          notes: row[11] || '',
          // Backward compatibility
          entityName: pattern,
          entityType: 'ledger' as const,
          keywords: pattern
        };
      }).filter(rule => rule.pattern && rule.head);
    } catch (error) {
      console.error('Error fetching rules:', error);
      return [];
    }
  }

  async addRule(rule: Omit<ClassificationRule, 'ruleId' | 'createdDate' | 'timesUsed'>): Promise<ClassificationRule | null> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      // Handle both pattern and entityName (backward compatibility)
      const actualPattern = rule.pattern || rule.entityName || '';
      const newRule: ClassificationRule = {
        ...rule,
        pattern: actualPattern,
        entityName: actualPattern,
        keywords: rule.keywords || actualPattern,
        ruleId: `R${Date.now()}`,
        createdDate: new Date().toISOString(),
        timesUsed: 0
      };

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A:L`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            newRule.ruleId,
            newRule.pattern,
            newRule.matchType,
            newRule.head,
            newRule.subhead,
            newRule.confidence,
            newRule.source,
            newRule.priority,
            newRule.active ? 'TRUE' : 'FALSE',
            newRule.createdDate,
            newRule.timesUsed,
            newRule.notes
          ]]
        }
      });

      console.log(`Added rule: ${newRule.ruleId} for "${newRule.pattern}"`);
      return newRule;
    } catch (error) {
      console.error('Error adding rule:', error);
      return null;
    }
  }

  async addRulesBatch(rules: Omit<ClassificationRule, 'ruleId' | 'createdDate' | 'timesUsed'>[]): Promise<ClassificationRule[]> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      const newRules: ClassificationRule[] = rules.map((rule, index) => ({
        ...rule,
        ruleId: `R${Date.now()}_${index}`,
        createdDate: new Date().toISOString(),
        timesUsed: 0
      }));

      const values = newRules.map(rule => [
        rule.ruleId,
        rule.pattern,
        rule.matchType,
        rule.head,
        rule.subhead,
        rule.confidence,
        rule.source,
        rule.priority,
        rule.active ? 'TRUE' : 'FALSE',
        rule.createdDate,
        rule.timesUsed,
        rule.notes
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A:L`,
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      console.log(`Added ${newRules.length} rules in batch`);
      return newRules;
    } catch (error) {
      console.error('Error adding rules batch:', error);
      return [];
    }
  }

  async updateRule(ruleId: string, updates: Partial<ClassificationRule>): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      // First, find the row with this ruleId
      const rules = await this.getRules();
      const rowIndex = rules.findIndex(r => r.ruleId === ruleId);

      if (rowIndex === -1) {
        console.error(`Rule not found: ${ruleId}`);
        return false;
      }

      const existingRule = rules[rowIndex];
      const updatedRule = { ...existingRule, ...updates };

      // Update the row (rowIndex + 2 because of header and 0-indexing)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A${rowIndex + 2}:L${rowIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            updatedRule.ruleId,
            updatedRule.pattern,
            updatedRule.matchType,
            updatedRule.head,
            updatedRule.subhead,
            updatedRule.confidence,
            updatedRule.source,
            updatedRule.priority,
            updatedRule.active ? 'TRUE' : 'FALSE',
            updatedRule.createdDate,
            updatedRule.timesUsed,
            updatedRule.notes
          ]]
        }
      });

      console.log(`Updated rule: ${ruleId}`);
      return true;
    } catch (error) {
      console.error('Error updating rule:', error);
      return false;
    }
  }

  async deleteRule(ruleId: string): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      // Get all rules to find the row
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A:A`,
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === ruleId);

      if (rowIndex === -1 || rowIndex === 0) {
        console.error(`Rule not found: ${ruleId}`);
        return false;
      }

      // Get sheet ID for the rules sheet
      const sheetMetadata = await this.sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
        fields: 'sheets.properties'
      });

      const rulesSheet = sheetMetadata.data.sheets?.find(
        s => s.properties?.title === SHEET_NAMES.RULES
      );

      if (!rulesSheet?.properties?.sheetId) {
        console.error('Rules sheet not found');
        return false;
      }

      // Delete the row
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: rulesSheet.properties.sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1
              }
            }
          }]
        }
      });

      console.log(`Deleted rule: ${ruleId}`);
      return true;
    } catch (error) {
      console.error('Error deleting rule:', error);
      return false;
    }
  }

  async incrementRuleUsage(ruleId: string): Promise<void> {
    const rules = await this.getRules();
    const rule = rules.find(r => r.ruleId === ruleId);
    if (rule) {
      await this.updateRule(ruleId, { timesUsed: rule.timesUsed + 1 });
    }
  }

  async initializeRulesHeader(): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Rule_ID', 'Pattern', 'Match_Type', 'Head', 'Subhead', 'Confidence', 'Source', 'Priority', 'Active', 'Created_Date', 'Times_Used', 'Notes']]
        }
      });
      return true;
    } catch (error) {
      console.error('Error initializing rules header:', error);
      return false;
    }
  }

  async clearAllRules(): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      // Clear all data except header
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A2:L10000`,
      });
      console.log('Cleared all rules');
      return true;
    } catch (error) {
      console.error('Error clearing rules:', error);
      return false;
    }
  }

  // ============================================
  // CONFIG OPERATIONS
  // ============================================

  async getConfig(): Promise<MISConfig> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    const defaultConfig: MISConfig = {
      geminiPrompt: this.getDefaultGeminiPrompt(),
      geminiModel: 'gemini-3-flash-preview',  // Latest Gemini model
      geminiTemperature: 0.2,
      confidenceAutoAccept: 85,
      confidenceNeedsReview: 70,
      migrationCompleted: false,
      lastMigrationDate: ''
    };

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.CONFIG}!A:B`,
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return defaultConfig;

      // Parse key-value pairs
      const config = { ...defaultConfig };
      for (const row of rows.slice(1)) {
        const key = row[0];
        const value = row[1];
        if (!key) continue;

        switch (key) {
          case 'gemini_prompt':
            config.geminiPrompt = value || defaultConfig.geminiPrompt;
            break;
          case 'gemini_model':
            config.geminiModel = value || defaultConfig.geminiModel;
            break;
          case 'gemini_temperature':
            config.geminiTemperature = parseFloat(value) || defaultConfig.geminiTemperature;
            break;
          case 'confidence_auto_accept':
            config.confidenceAutoAccept = parseInt(value) || defaultConfig.confidenceAutoAccept;
            break;
          case 'confidence_needs_review':
            config.confidenceNeedsReview = parseInt(value) || defaultConfig.confidenceNeedsReview;
            break;
          case 'migration_completed':
            config.migrationCompleted = value?.toUpperCase() === 'TRUE';
            break;
          case 'last_migration_date':
            config.lastMigrationDate = value || '';
            break;
        }
      }

      return config;
    } catch (error) {
      console.error('Error fetching config:', error);
      return defaultConfig;
    }
  }

  async saveConfig(config: Partial<MISConfig>): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      // Get existing config
      const existingConfig = await this.getConfig();
      const mergedConfig = { ...existingConfig, ...config };

      // Convert to key-value rows
      const values = [
        ['Key', 'Value'],
        ['gemini_prompt', mergedConfig.geminiPrompt],
        ['gemini_model', mergedConfig.geminiModel],
        ['gemini_temperature', mergedConfig.geminiTemperature.toString()],
        ['confidence_auto_accept', mergedConfig.confidenceAutoAccept.toString()],
        ['confidence_needs_review', mergedConfig.confidenceNeedsReview.toString()],
        ['migration_completed', mergedConfig.migrationCompleted ? 'TRUE' : 'FALSE'],
        ['last_migration_date', mergedConfig.lastMigrationDate]
      ];

      // Clear and write
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.CONFIG}!A:B`,
      });

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.CONFIG}!A1:B${values.length}`,
        valueInputOption: 'RAW',
        requestBody: { values }
      });

      console.log('Config saved successfully');
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      return false;
    }
  }

  async initializeConfigSheet(): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      const defaultConfig: MISConfig = {
        geminiPrompt: this.getDefaultGeminiPrompt(),
        geminiModel: 'gemini-3-flash-preview',  // Latest Gemini model
        geminiTemperature: 0.2,
        confidenceAutoAccept: 85,
        confidenceNeedsReview: 70,
        migrationCompleted: false,
        lastMigrationDate: ''
      };

      await this.saveConfig(defaultConfig);
      console.log('Config sheet initialized');
      return true;
    } catch (error) {
      console.error('Error initializing config sheet:', error);
      return false;
    }
  }

  private getDefaultGeminiPrompt(): string {
    return `You are a financial transaction classifier for Heatronics, a D2C consumer electronics company in India.

Given a transaction entity name (ledger account or party name), classify it into the appropriate MIS Head and Subhead.

Available Categories:
- A. Revenue: Website, Amazon, Blinkit, Offline & OEM
- B. Returns: Website, Amazon, Blinkit, Offline & OEM
- C. Discounts: Website, Amazon, Blinkit, Offline & OEM
- D. Taxes: Website, Amazon, Blinkit, Offline & OEM
- E. COGM: Raw Materials & Inventory, Manufacturing Wages, Contract Wages (Mfg), Inbound Transport, Factory Rent, Factory Electricity, Factory Maintainence, Job work
- F. Channel & Fulfillment: Amazon Fees, Blinkit Fees, D2C Fees
- G. Sales & Marketing: Facebook Ads, Google Ads, Amazon Ads, Blinkit Ads, Agency Fees
- H. Platform Costs: Shopify Subscription, Wati Subscription, Shopflo subscription
- I. Operating Expenses: Salaries (Admin, Mgmt), Miscellaneous (Travel, insurance), Legal & CA expenses, Platform Costs (CRM, inventory softwares), Administrative Expenses (Office Rent, utilities, admin supplies)
- J. Non-Operating: Less: Interest Expense, Less: Depreciation, Less: Amortization, Less: Income Tax
- X. Exclude: Personal Expenses, Owner Withdrawals
- Z. Ignore: GST Input/Output, TDS, Bank Transfers, Inter-company

Guidelines:
- Amazon/Blinkit platform fees and logistics → F. Channel & Fulfillment
- Shiprocket, payment gateways → F. Channel & Fulfillment > D2C Fees
- Facebook/Meta, Google ads → G. Sales & Marketing
- Manufacturing employee names → E. COGM > Manufacturing Wages
- Admin employee names → I. Operating Expenses > Salaries
- GST entries (CGST, SGST, IGST) → Z. Ignore
- Bank accounts, cash → Z. Ignore
- TDS entries → Z. Ignore
- Personal expenses → X. Exclude

Return JSON format:
{
  "head": "selected head",
  "subhead": "selected subhead",
  "confidence": 0-100,
  "reasoning": "brief explanation"
}

If unsure, set confidence below 70.`;
  }

  // ============================================
  // HISTORY OPERATIONS
  // ============================================

  async logClassification(entry: Omit<ClassificationHistoryEntry, 'timestamp'>): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      const fullEntry: ClassificationHistoryEntry = {
        ...entry,
        timestamp: new Date().toISOString()
      };

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.HISTORY}!A:I`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            fullEntry.timestamp,
            fullEntry.period,
            fullEntry.state,
            fullEntry.entity,
            fullEntry.amount,
            fullEntry.head,
            fullEntry.subhead,
            fullEntry.classifiedBy,
            fullEntry.ruleId
          ]]
        }
      });

      return true;
    } catch (error) {
      console.error('Error logging classification:', error);
      return false;
    }
  }

  async getHistory(limit: number = 100): Promise<ClassificationHistoryEntry[]> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.HISTORY}!A:I`,
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return [];

      // Skip header, get last 'limit' entries
      const dataRows = rows.slice(1).slice(-limit);

      return dataRows.map(row => ({
        timestamp: row[0] || '',
        period: row[1] || '',
        state: row[2] || '',
        entity: row[3] || '',
        amount: parseFloat(row[4]) || 0,
        head: row[5] || '',
        subhead: row[6] || '',
        classifiedBy: row[7] || '',
        ruleId: row[8] || ''
      })).reverse(); // Most recent first
    } catch (error) {
      console.error('Error fetching history:', error);
      return [];
    }
  }

  async initializeHistoryHeader(): Promise<boolean> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.HISTORY}!A1:I1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Timestamp', 'Period', 'State', 'Entity', 'Amount', 'Head', 'Subhead', 'Classified_By', 'Rule_ID']]
        }
      });
      return true;
    } catch (error) {
      console.error('Error initializing history header:', error);
      return false;
    }
  }

  // ============================================
  // STATISTICS
  // ============================================

  async getStats(): Promise<{
    totalRules: number;
    rulesBySource: Record<string, number>;
    rulesByHead: Record<string, number>;
    recentClassifications: number;
  }> {
    const rules = await this.getRules();
    const history = await this.getHistory(1000);

    const rulesBySource: Record<string, number> = {};
    const rulesByHead: Record<string, number> = {};

    for (const rule of rules) {
      rulesBySource[rule.source] = (rulesBySource[rule.source] || 0) + 1;
      rulesByHead[rule.head] = (rulesByHead[rule.head] || 0) + 1;
    }

    // Count classifications in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentClassifications = history.filter(h =>
      new Date(h.timestamp) > thirtyDaysAgo
    ).length;

    return {
      totalRules: rules.length,
      rulesBySource,
      rulesByHead,
      recentClassifications
    };
  }
}

// Export singleton instance
export const googleSheetsService = new GoogleSheetsService();
