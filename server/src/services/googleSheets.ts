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
  entityName: string;
  entityType: 'ledger' | 'party';
  head: string;
  subhead: string;
  keywords: string;
  confidence: number;
  source: 'user' | 'system' | 'gemini';
  createdDate: string;
  timesUsed: number;
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
  HISTORY: 'MIS_Classification_History'
};

// ============================================
// GOOGLE SHEETS SERVICE
// ============================================

class GoogleSheetsService {
  private sheets: sheets_v4.Sheets | null = null;
  private initialized: boolean = false;
  private initError: string | null = null;

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

      // Check if required sheets exist, create them if not
      const requiredSheets = [SHEET_NAMES.CATEGORIES, SHEET_NAMES.RULES, SHEET_NAMES.HISTORY];
      const missingSheets = requiredSheets.filter(name => !sheetTitles.includes(name));

      if (missingSheets.length > 0) {
        console.log('Creating missing sheets:', missingSheets);
        await this.createMissingSheets(missingSheets);
      }

      this.initialized = true;
      this.initError = null;
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to initialize Google Sheets:', errorMessage);
      this.initError = errorMessage;
      return false;
    }
  }

  private async createMissingSheets(sheetNames: string[]): Promise<void> {
    if (!this.sheets) return;

    try {
      // Create each missing sheet
      const requests = sheetNames.map(title => ({
        addSheet: {
          properties: { title }
        }
      }));

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests }
      });

      // Initialize headers for each sheet
      for (const sheetName of sheetNames) {
        await this.initializeSheetHeaders(sheetName);
      }

      console.log('Created sheets:', sheetNames);
    } catch (error) {
      console.error('Error creating sheets:', error);
      // Don't throw - sheets might already exist
    }
  }

  private async initializeSheetHeaders(sheetName: string): Promise<void> {
    if (!this.sheets) return;

    let headers: string[] = [];
    switch (sheetName) {
      case SHEET_NAMES.CATEGORIES:
        headers = ['Head', 'Subhead', 'Type', 'P&L Line', 'Active', 'Notes'];
        break;
      case SHEET_NAMES.RULES:
        headers = ['Rule ID', 'Entity Name', 'Entity Type', 'Head', 'Subhead', 'Keywords', 'Confidence', 'Source', 'Created Date', 'Times Used'];
        break;
      case SHEET_NAMES.HISTORY:
        headers = ['Timestamp', 'Period', 'State', 'Entity', 'Amount', 'Head', 'Subhead', 'Classified By', 'Rule ID'];
        break;
    }

    if (headers.length > 0) {
      try {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${sheetName}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [headers] }
        });
      } catch (error) {
        console.error(`Error initializing headers for ${sheetName}:`, error);
      }
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getInitError(): string | null {
    return this.initError;
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
        range: `${SHEET_NAMES.RULES}!A:J`,
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) return [];

      // Skip header row
      return rows.slice(1).map(row => ({
        ruleId: row[0] || '',
        entityName: row[1] || '',
        entityType: (row[2] || 'ledger') as 'ledger' | 'party',
        head: row[3] || '',
        subhead: row[4] || '',
        keywords: row[5] || '',
        confidence: parseFloat(row[6]) || 100,
        source: (row[7] || 'user') as 'user' | 'system' | 'gemini',
        createdDate: row[8] || new Date().toISOString(),
        timesUsed: parseInt(row[9]) || 0
      })).filter(rule => rule.entityName && rule.head);
    } catch (error) {
      console.error('Error fetching rules:', error);
      return [];
    }
  }

  async addRule(rule: Omit<ClassificationRule, 'ruleId' | 'createdDate' | 'timesUsed'>): Promise<ClassificationRule | null> {
    if (!this.sheets) throw new Error('Sheets not initialized');

    try {
      const newRule: ClassificationRule = {
        ...rule,
        ruleId: `R${Date.now()}`,
        createdDate: new Date().toISOString(),
        timesUsed: 0
      };

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A:J`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            newRule.ruleId,
            newRule.entityName,
            newRule.entityType,
            newRule.head,
            newRule.subhead,
            newRule.keywords,
            newRule.confidence,
            newRule.source,
            newRule.createdDate,
            newRule.timesUsed
          ]]
        }
      });

      console.log(`Added rule: ${newRule.ruleId} for "${newRule.entityName}"`);
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
        rule.entityName,
        rule.entityType,
        rule.head,
        rule.subhead,
        rule.keywords,
        rule.confidence,
        rule.source,
        rule.createdDate,
        rule.timesUsed
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.RULES}!A:J`,
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
        range: `${SHEET_NAMES.RULES}!A${rowIndex + 2}:J${rowIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            updatedRule.ruleId,
            updatedRule.entityName,
            updatedRule.entityType,
            updatedRule.head,
            updatedRule.subhead,
            updatedRule.keywords,
            updatedRule.confidence,
            updatedRule.source,
            updatedRule.createdDate,
            updatedRule.timesUsed
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
        range: `${SHEET_NAMES.RULES}!A1:J1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Rule_ID', 'Entity_Name', 'Entity_Type', 'Head', 'Subhead', 'Keywords', 'Confidence', 'Source', 'Created_Date', 'Times_Used']]
        }
      });
      return true;
    } catch (error) {
      console.error('Error initializing rules header:', error);
      return false;
    }
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
