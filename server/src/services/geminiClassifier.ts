import { MISCategory, ClassificationRule } from './googleSheets.js';

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
  source: 'gemini' | 'rule' | 'similarity' | 'none';
  ruleId?: string;
  reasoning?: string;
  needsReview?: boolean;
}

// ============================================
// GEMINI API CONFIGURATION
// ============================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAmUF52yuqjrY4HFzmwy59ejQMafXS17GY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ============================================
// GEMINI CLASSIFIER SERVICE
// ============================================

class GeminiClassifierService {
  private apiKey: string;

  constructor() {
    this.apiKey = GEMINI_API_KEY;
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
      .map(r => `  - "${r.entityName}" -> Head: "${r.head}", Subhead: "${r.subhead}"`)
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
        r.entityName.toLowerCase() === entity.name.toLowerCase()
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
            reasoning: `Similar to "${similarRule.rule.entityName}"`
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

    // Use Gemini for unmatched entities
    try {
      const prompt = this.buildPrompt(entitiesToClassify, categories, existingRules);
      const geminiResults = await this.callGeminiAPI(prompt);

      // Parse and validate Gemini results
      for (const entity of entitiesToClassify) {
        const geminiResult = geminiResults.find(
          (r: any) => r.entityName?.toLowerCase() === entity.name.toLowerCase()
        );

        if (geminiResult && geminiResult.head && geminiResult.subhead) {
          // Validate that head/subhead exist in categories
          const validCategory = categories.find(
            c => c.head === geminiResult.head && c.subhead === geminiResult.subhead
          );

          if (validCategory) {
            results.push({
              entityName: entity.name,
              head: geminiResult.head,
              subhead: geminiResult.subhead,
              confidence: geminiResult.confidence || 70,
              source: 'gemini',
              reasoning: geminiResult.reasoning,
              needsReview: (geminiResult.confidence || 70) < 80
            });
          } else {
            // Gemini returned invalid category, mark for review
            results.push({
              entityName: entity.name,
              head: null,
              subhead: null,
              confidence: 0,
              source: 'none',
              needsReview: true,
              reasoning: `AI suggested invalid category: ${geminiResult.head} / ${geminiResult.subhead}`
            });
          }
        } else {
          // No Gemini result for this entity
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
      console.error('Gemini API error:', error);
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

  private async callGeminiAPI(prompt: string): Promise<any[]> {
    const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 4096,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    // Parse JSON from response (may include markdown code blocks)
    let jsonText = text;
    if (text.includes('```json')) {
      jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (text.includes('```')) {
      jsonText = text.replace(/```\n?/g, '');
    }

    try {
      return JSON.parse(jsonText.trim());
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text);
      throw new Error('Invalid JSON response from Gemini');
    }
  }

  private findSimilarRule(
    entityName: string,
    rules: ClassificationRule[]
  ): { rule: ClassificationRule; similarity: number } | null {
    let bestMatch: { rule: ClassificationRule; similarity: number } | null = null;

    const normalizedName = entityName.toLowerCase().trim();

    for (const rule of rules) {
      const normalizedRuleName = rule.entityName.toLowerCase().trim();

      // Check for substring match
      if (normalizedName.includes(normalizedRuleName) || normalizedRuleName.includes(normalizedName)) {
        const similarity = this.calculateSimilarity(normalizedName, normalizedRuleName);
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { rule, similarity };
        }
      }

      // Check keywords
      if (rule.keywords) {
        const keywords = rule.keywords.toLowerCase().split(',').map(k => k.trim());
        for (const keyword of keywords) {
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
export const geminiClassifier = new GeminiClassifierService();
