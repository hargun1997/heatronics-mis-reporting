// Classification API Client
// Communicates with the server-side classification system

const API_BASE = '/api/classification';

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

export interface ClassificationStats {
  totalRules: number;
  rulesBySource: Record<string, number>;
  rulesByHead: Record<string, number>;
  recentClassifications: number;
}

export interface EntityToClassify {
  name: string;
  type: 'ledger' | 'party';
  amount?: number;
  context?: string;
}

export interface UnclassifiedResult {
  total: number;
  unclassified: number;
  classified: number;
  unclassifiedEntities: EntityToClassify[];
  classifiedEntities: (EntityToClassify & { rule: ClassificationRule })[];
}

// ============================================
// API FUNCTIONS
// ============================================

// Check classification service status
export async function checkClassificationStatus(): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/status`);
    return await response.json();
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

// Initialize categories with defaults
export async function initializeCategories(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/categories/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    };
  }
}

// Get all categories
export async function getCategories(): Promise<MISCategory[]> {
  try {
    const response = await fetch(`${API_BASE}/categories`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

// Get categories grouped by head
export async function getCategoriesGroupedByHead(): Promise<Record<string, string[]>> {
  const categories = await getCategories();
  const grouped: Record<string, string[]> = {};

  for (const cat of categories) {
    if (!grouped[cat.head]) {
      grouped[cat.head] = [];
    }
    if (!grouped[cat.head].includes(cat.subhead)) {
      grouped[cat.head].push(cat.subhead);
    }
  }

  return grouped;
}

// Get all rules
export async function getRules(): Promise<ClassificationRule[]> {
  try {
    const response = await fetch(`${API_BASE}/rules`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching rules:', error);
    return [];
  }
}

// Add a single rule
export async function addRule(rule: {
  entityName: string;
  entityType?: 'ledger' | 'party';
  head: string;
  subhead: string;
  keywords?: string;
  confidence?: number;
  source?: 'user' | 'system' | 'gemini';
}): Promise<ClassificationRule | null> {
  try {
    const response = await fetch(`${API_BASE}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error adding rule:', error);
    return null;
  }
}

// Add multiple rules in batch
export async function addRulesBatch(rules: {
  entityName: string;
  entityType?: 'ledger' | 'party';
  head: string;
  subhead: string;
  keywords?: string;
  confidence?: number;
  source?: 'user' | 'system' | 'gemini';
}[]): Promise<{ added: number; rules: ClassificationRule[] }> {
  try {
    const response = await fetch(`${API_BASE}/rules/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error adding rules batch:', error);
    return { added: 0, rules: [] };
  }
}

// Update a rule
export async function updateRule(ruleId: string, updates: Partial<ClassificationRule>): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/rules/${ruleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return response.ok;
  } catch (error) {
    console.error('Error updating rule:', error);
    return false;
  }
}

// Delete a rule
export async function deleteRule(ruleId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/rules/${ruleId}`, {
      method: 'DELETE'
    });
    return response.ok;
  } catch (error) {
    console.error('Error deleting rule:', error);
    return false;
  }
}

// Get classification history
export async function getHistory(limit: number = 100): Promise<ClassificationHistoryEntry[]> {
  try {
    const response = await fetch(`${API_BASE}/history?limit=${limit}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}

// Log a classification to history
export async function logClassification(entry: {
  period?: string;
  state?: string;
  entity: string;
  amount?: number;
  head: string;
  subhead: string;
  classifiedBy?: string;
  ruleId?: string;
}): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    return response.ok;
  } catch (error) {
    console.error('Error logging classification:', error);
    return false;
  }
}

// Get statistics
export async function getStats(): Promise<ClassificationStats | null> {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching stats:', error);
    return null;
  }
}

// Classify entities using AI
export async function classifyEntities(
  entities: EntityToClassify[],
  categories?: MISCategory[]
): Promise<ClassificationResult[]> {
  try {
    const response = await fetch(`${API_BASE}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entities, categories })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error classifying entities:', error);
    return entities.map(e => ({
      entityName: e.name,
      head: null,
      subhead: null,
      confidence: 0,
      source: 'none' as const,
      needsReview: true
    }));
  }
}

// Classify a single entity
export async function classifySingleEntity(
  entityName: string,
  entityType: 'ledger' | 'party' = 'ledger',
  amount?: number,
  context?: string
): Promise<ClassificationResult> {
  try {
    const response = await fetch(`${API_BASE}/classify-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityName, entityType, amount, context })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error classifying entity:', error);
    return {
      entityName,
      head: null,
      subhead: null,
      confidence: 0,
      source: 'none',
      needsReview: true
    };
  }
}

// Learn from user classification (save as rule)
export async function learnClassification(data: {
  entityName: string;
  entityType?: 'ledger' | 'party';
  head: string;
  subhead: string;
  period?: string;
  state?: string;
  amount?: number;
}): Promise<{ success: boolean; ruleId?: string }> {
  try {
    const response = await fetch(`${API_BASE}/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error learning classification:', error);
    return { success: false };
  }
}

// Batch learn from multiple classifications
export async function batchLearnClassifications(
  classifications: {
    entityName: string;
    entityType?: 'ledger' | 'party';
    head: string;
    subhead: string;
    amount?: number;
  }[],
  period?: string,
  state?: string
): Promise<{ success: boolean; processed: number; newRules: number }> {
  try {
    const response = await fetch(`${API_BASE}/learn/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classifications, period, state })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error batch learning:', error);
    return { success: false, processed: 0, newRules: 0 };
  }
}

// Find unclassified entities
export async function findUnclassifiedEntities(
  entities: (string | EntityToClassify)[]
): Promise<UnclassifiedResult> {
  try {
    const response = await fetch(`${API_BASE}/find-unclassified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entities })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error finding unclassified:', error);
    return {
      total: entities.length,
      unclassified: entities.length,
      classified: 0,
      unclassifiedEntities: entities.map(e => ({
        name: typeof e === 'string' ? e : e.name,
        type: 'ledger' as const
      })),
      classifiedEntities: []
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get heads list from categories
export function getHeadsList(categories: MISCategory[]): string[] {
  const heads = new Set<string>();
  for (const cat of categories) {
    heads.add(cat.head);
  }
  return Array.from(heads).sort();
}

// Get subheads for a specific head
export function getSubheadsForHead(categories: MISCategory[], head: string): string[] {
  return categories
    .filter(c => c.head === head)
    .map(c => c.subhead);
}

// Get category type (revenue/expense/ignore)
export function getCategoryType(categories: MISCategory[], head: string): 'revenue' | 'expense' | 'ignore' {
  const cat = categories.find(c => c.head === head);
  return cat?.type || 'expense';
}

// Format confidence as percentage
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence)}%`;
}

// Get source display name
export function getSourceDisplayName(source: string): string {
  switch (source) {
    case 'user': return 'Manual';
    case 'gemini': return 'AI';
    case 'system': return 'System';
    case 'rule': return 'Rule';
    case 'similarity': return 'Similar';
    default: return source;
  }
}

// Check if an entity needs review
export function needsReview(result: ClassificationResult): boolean {
  return result.needsReview || !result.head || !result.subhead || result.confidence < 70;
}

// Local cache for categories (to reduce API calls)
let cachedCategories: MISCategory[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCategoriesCached(): Promise<MISCategory[]> {
  const now = Date.now();
  if (cachedCategories && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedCategories;
  }

  cachedCategories = await getCategories();
  cacheTimestamp = now;
  return cachedCategories;
}

export function clearCategoriesCache(): void {
  cachedCategories = null;
  cacheTimestamp = 0;
}

// Local cache for rules
let cachedRules: ClassificationRule[] | null = null;
let rulesCacheTimestamp = 0;

export async function getRulesCached(): Promise<ClassificationRule[]> {
  const now = Date.now();
  if (cachedRules && (now - rulesCacheTimestamp) < CACHE_TTL) {
    return cachedRules;
  }

  cachedRules = await getRules();
  rulesCacheTimestamp = now;
  return cachedRules;
}

export function clearRulesCache(): void {
  cachedRules = null;
  rulesCacheTimestamp = 0;
}

// Clear all caches
export function clearAllCaches(): void {
  clearCategoriesCache();
  clearRulesCache();
}
