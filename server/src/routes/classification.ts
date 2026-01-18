import { Router } from 'express';
import { googleSheetsService, MISCategory, ClassificationRule } from '../services/googleSheets.js';
import { geminiClassifier } from '../services/geminiClassifier.js';

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

    const { entityName, entityType, head, subhead, keywords, confidence, source } = req.body;

    if (!entityName || !head || !subhead) {
      return res.status(400).json({ error: 'entityName, head, and subhead are required' });
    }

    const rule = await googleSheetsService.addRule({
      entityName,
      entityType: entityType || 'ledger',
      head,
      subhead,
      keywords: keywords || '',
      confidence: confidence || 100,
      source: source || 'user'
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
    const updates = req.body;

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
      r.entityName.toLowerCase() === entityName.toLowerCase()
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
      r.entityName.toLowerCase() === entityName.toLowerCase()
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
        entityName,
        entityType: entityType || 'ledger',
        head,
        subhead,
        keywords: entityName,
        confidence: 100,
        source: 'user'
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
        r.entityName.toLowerCase() === entityName.toLowerCase()
      );

      if (!existingRule) {
        newRules.push({
          entityName,
          entityType: entityType || 'ledger',
          head,
          subhead,
          keywords: entityName,
          confidence: 100,
          source: 'user'
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
    const ruleEntityNames = new Set(rules.map(r => r.entityName.toLowerCase()));

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
        const rule = rules.find(r => r.entityName.toLowerCase() === name.toLowerCase());
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

export default router;
