import { MISCategory, ClassificationRule } from './googleSheets.js';
import { claudeCompleteText, isClaudeConfigured, stripJsonFence } from './claudeClient.js';

// ============================================
// TYPES
// ============================================

export interface EntityToClassify {
  name: string;
  type: 'ledger' | 'party';
  amount?: number;
  context?: string;
}

export interface ClassificationResult {
  entityName: string;
  head: string | null;
  subhead: string | null;
  confidence: number;
  source: 'claude' | 'rule' | 'similarity' | 'none';
  ruleId?: string;
  reasoning?: string;
  needsReview?: boolean;
}

export interface ClassifierConfig {
  /** Optional per-call model override, e.g. "claude-opus-5-5". */
  model?: string;
  /** Retained for config-sheet compatibility; current models ignore it. */
  temperature?: number;
  apiKey?: string;
}

// ============================================
// CLAUDE CLASSIFIER SERVICE
// ============================================

class ClaudeClassifierService {
  private model: string | undefined;

  // Set config from Google Sheets MIS_Config. The API key lives in
  // ANTHROPIC_API_KEY on the server; only the model override is honoured here.
  setConfig(config: ClassifierConfig): void {
    if (config.model) {
      let modelName = config.model.trim();
      if (modelName.includes('/')) {
        modelName = modelName.split('/').pop() || modelName;
      }
      this.model = modelName;
    }
    console.log(`Claude classifier config set: model=${this.model ?? 'default'}`);
  }

  getConfig(): ClassifierConfig {
    return { model: this.model };
  }

  private buildPrompt(
    entities: EntityToClassify[],
    categories: MISCategory[],
    existingRules: ClassificationRule[]
  ): string {
    // Build category reference
    const categoryList = categories
      .filter(c => c.active)
      .map(c => `  - Head: "${c.head}", Subhead: "${c.subhead}" (${c.type})`)
      .join('\n');

    // Build example rules for context
    const ruleExamples = existingRules
      .slice(0, 20)
      .map(r => `  - "${r.entityName || r.pattern}" -> Head: "${r.head}", Subhead: "${r.subhead}"`)
      .join('\n');

    // Build entities to classify
    const entityList = entities
      .map((e, i) => `${i + 1}. "${e.name}" (${e.type}${e.amount ? `, amount: ${e.amount}` : ''}${e.context ? `, context: ${e.context}` : ''})`)
      .join('\n');

    return `You are a financial transaction classifier for a D2C consumer electronics company (Heatronics).
Your task is to classify ledger accounts and party names into the appropriate MIS (Management Information System) categories.

## Available Categories (Head -> Subhead):
${categoryList}

## Category Guidelines:
- **A. Revenue**: Sales revenue by channel (Website/Amazon/Blinkit/Offline)
- **B. Returns**: Product returns by channel
- **C. Discounts**: Sales discounts by channel
- **D. Taxes**: Sales taxes by channel (GST on sales)
- **E. COGM**: Cost of Goods Manufactured - raw materials, manufacturing costs, factory expenses
- **F. Channel & Fulfillment**: Marketplace fees, shipping costs, fulfillment charges
- **G. Sales & Marketing**: Advertising, marketing agency fees
- **H. Platform Costs**: SaaS subscriptions (Shopify, Wati, etc.)
- **I. Operating Expenses**: Salaries, office rent, utilities, legal/accounting
- **J. Non-Operating**: Interest, depreciation, taxes
- **X. Exclude**: Personal expenses, owner withdrawals (not business related)
- **Z. Ignore**: GST adjustments, TDS, bank transfers, inter-company transactions

## Example Classifications from Existing Rules:
${ruleExamples || '  (No existing rules yet)'}

## Entities to Classify:
${entityList}

## Response Format:
Respond with a JSON array where each object has:
{
  "entityName": "exact entity name",
  "head": "selected head (e.g., 'E. COGM')",
  "subhead": "selected subhead (e.g., 'Raw Materials & Inventory')",
  "confidence": number between 0-100,
  "reasoning": "brief explanation"
}

IMPORTANT:
- Only use heads and subheads from the Available Categories list above
- If unsure, set confidence below 70 and explain in reasoning
- For party names, consider what type of business they are (supplier, customer, service provider)
- Common patterns:
  * "...Pvt Ltd" with purchases = likely supplier (COGM or Operating Expense)
  * "Meta/Facebook/Google" = Advertising
  * "Amazon/Flipkart" payments = Channel fees or Revenue
  * Bank interest = J. Non-Operating
  * "GST/TDS/Tax" adjustments = Z. Ignore

Respond ONLY with the JSON array, no other text.`;
  }

  async classifyEntities(
    entities: EntityToClassify[],
    categories: MISCategory[],
    existingRules: ClassificationRule[]
  ): Promise<ClassificationResult[]> {
    if (entities.length === 0) return [];

    // First, check for exact rule matches
    const results: ClassificationResult[] = [];
    const entitiesToClassify: EntityToClassify[] = [];

    for (const entity of entities) {
      const matchingRule = existingRules.find(r =>
        (r.entityName || r.pattern).toLowerCase() === entity.name.toLowerCase()
      );

      if (matchingRule) {
        results.push({
          entityName: entity.name,
          head: matchingRule.head,
          subhead: matchingRule.subhead,
          confidence: matchingRule.confidence,
          source: 'rule',
          ruleId: matchingRule.ruleId
        });
      } else {
        // Check for similarity match
        const similarRule = this.findSimilarRule(entity.name, existingRules);
        if (similarRule && similarRule.similarity > 0.8) {
          results.push({
            entityName: entity.name,
            head: similarRule.rule.head,
            subhead: similarRule.rule.subhead,
            confidence: Math.round(similarRule.similarity * 100),
            source: 'similarity',
            ruleId: similarRule.rule.ruleId,
            reasoning: `Similar to "${similarRule.rule.entityName || similarRule.rule.pattern}"`
          });
        } else {
          entitiesToClassify.push(entity);
        }
      }
    }

    // If all entities were matched by rules, return early
    if (entitiesToClassify.length === 0) {
      return results;
    }

    // Use Claude for unmatched entities
    try {
      const prompt = this.buildPrompt(entitiesToClassify, categories, existingRules);
      const aiResults = await this.callModel(prompt);

      // Parse and validate model results
      for (const entity of entitiesToClassify) {
        const aiResult = aiResults.find(
          (r: any) => r.entityName?.toLowerCase() === entity.name.toLowerCase()
        );

        if (aiResult && aiResult.head && aiResult.subhead) {
          // Validate that head/subhead exist in categories
          const validCategory = categories.find(
            c => c.head === aiResult.head && c.subhead === aiResult.subhead
          );

          if (validCategory) {
            results.push({
              entityName: entity.name,
              head: aiResult.head,
              subhead: aiResult.subhead,
              confidence: aiResult.confidence || 70,
              source: 'claude',
              reasoning: aiResult.reasoning,
              needsReview: (aiResult.confidence || 70) < 80
            });
          } else {
            // Model returned invalid category, mark for review
            results.push({
              entityName: entity.name,
              head: null,
              subhead: null,
              confidence: 0,
              source: 'none',
              needsReview: true,
              reasoning: `AI suggested invalid category: ${aiResult.head} / ${aiResult.subhead}`
            });
          }
        } else {
          // No model result for this entity
          results.push({
            entityName: entity.name,
            head: null,
            subhead: null,
            confidence: 0,
            source: 'none',
            needsReview: true
          });
        }
      }
    } catch (error) {
      console.error('Claude classifier error:', error);
      // Mark all unclassified entities as needing review
      for (const entity of entitiesToClassify) {
        results.push({
          entityName: entity.name,
          head: null,
          subhead: null,
          confidence: 0,
          source: 'none',
          needsReview: true,
          reasoning: 'AI classification failed'
        });
      }
    }

    return results;
  }

  private async callModel(prompt: string): Promise<any[]> {
    if (!isClaudeConfigured()) {
      throw new Error('ANTHROPIC_API_KEY is not set on the server');
    }

    const text = await claudeCompleteText({
      parts: [{ text: prompt }],
      maxTokens: 4096,
      effort: 'low',
      ...(this.model ? { model: this.model } : {}),
    });

    try {
      const parsed = JSON.parse(stripJsonFence(text));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      console.error('Failed to parse classifier response:', text.slice(0, 300));
      throw new Error('Invalid JSON response from Claude');
    }
  }

  private findSimilarRule(
    entityName: string,
    rules: ClassificationRule[]
  ): { rule: ClassificationRule; similarity: number } | null {
    let bestMatch: { rule: ClassificationRule; similarity: number } | null = null;

    const normalizedName = entityName.toLowerCase().trim();

    for (const rule of rules) {
      const normalizedRuleName = (rule.entityName || rule.pattern || '').toLowerCase().trim();
      if (!normalizedRuleName) continue;

      // Check for substring match
      if (normalizedName.includes(normalizedRuleName) || normalizedRuleName.includes(normalizedName)) {
        const similarity = this.calculateSimilarity(normalizedName, normalizedRuleName);
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { rule, similarity };
        }
      }

      // Check keywords
      const keywords = rule.keywords || rule.pattern || '';
      if (keywords) {
        const keywordList = keywords.toLowerCase().split(',').map((k: string) => k.trim());
        for (const keyword of keywordList) {
          if (keyword && normalizedName.includes(keyword)) {
            const similarity = 0.85; // High confidence for keyword match
            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = { rule, similarity };
            }
          }
        }
      }
    }

    return bestMatch;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple Jaccard similarity on words
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  // Get classification suggestions for a single entity
  async suggestClassification(
    entityName: string,
    entityType: 'ledger' | 'party',
    categories: MISCategory[],
    rules: ClassificationRule[],
    context?: string
  ): Promise<ClassificationResult> {
    const results = await this.classifyEntities(
      [{ name: entityName, type: entityType, context }],
      categories,
      rules
    );

    return results[0] || {
      entityName,
      head: null,
      subhead: null,
      confidence: 0,
      source: 'none',
      needsReview: true
    };
  }

  // Bootstrap classification rules from sample data
  async bootstrapFromSampleData(
    sampleEntities: string[],
    categories: MISCategory[]
  ): Promise<ClassificationResult[]> {
    const entities: EntityToClassify[] = sampleEntities.map(name => ({
      name,
      type: 'ledger' as const
    }));

    return this.classifyEntities(entities, categories, []);
  }
}

// Export singleton
export const claudeClassifier = new ClaudeClassifierService();
