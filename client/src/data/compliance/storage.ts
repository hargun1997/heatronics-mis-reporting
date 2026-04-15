import {
  ComplianceCategory,
  ComplianceCategoryKey,
  ComplianceItem,
  ProgressEntry,
  ProgressMap,
  YearMonth,
} from './types';

/**
 * Compliance data is loaded from static JSON templates in /public/data/compliance/*.json.
 * Users can edit items in the UI — edits are persisted to localStorage as an "override"
 * layer on top of the template. This keeps templates as the canonical seed while letting
 * teams iterate quickly before backend wiring.
 *
 * Progress check-marks (per item × year-month) are also stored in localStorage.
 *
 * When the backend is ready, replace load/save functions with authenticated fetches to
 * the Drive-backed store — the shape of the payload matches ComplianceCategory.
 */

const OVERRIDE_KEY = (cat: ComplianceCategoryKey) => `compliance:override:${cat}`;
const PROGRESS_KEY = 'compliance:progress';

/** Fetch a category's template JSON from /public/data/compliance and merge overrides. */
export async function loadCategory(cat: ComplianceCategoryKey): Promise<ComplianceCategory> {
  const res = await fetch(`/data/compliance/${cat}.json`, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Unable to load compliance template for ${cat} (status ${res.status})`);
  }
  const template = (await res.json()) as ComplianceCategory;

  const override = readOverride(cat);
  if (!override) return template;

  return {
    ...template,
    // If the user has saved an override, it wins over the template.
    items: override.items,
    version: override.version ?? template.version,
    updatedAt: override.updatedAt ?? template.updatedAt,
  };
}

interface OverridePayload {
  items: ComplianceItem[];
  version?: number;
  updatedAt?: string;
}

function readOverride(cat: ComplianceCategoryKey): OverridePayload | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY(cat));
    if (!raw) return null;
    return JSON.parse(raw) as OverridePayload;
  } catch {
    return null;
  }
}

export function saveOverride(cat: ComplianceCategoryKey, items: ComplianceItem[]): void {
  const payload: OverridePayload = {
    items,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  localStorage.setItem(OVERRIDE_KEY(cat), JSON.stringify(payload));
}

export function clearOverride(cat: ComplianceCategoryKey): void {
  localStorage.removeItem(OVERRIDE_KEY(cat));
}

export function hasOverride(cat: ComplianceCategoryKey): boolean {
  return localStorage.getItem(OVERRIDE_KEY(cat)) != null;
}

// ---------- Progress ----------

function readProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

function writeProgress(p: ProgressMap): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}

export function getProgress(itemId: string, ym: YearMonth): ProgressEntry | undefined {
  const p = readProgress();
  return p[itemId]?.[ym];
}

export function getAllProgress(): ProgressMap {
  return readProgress();
}

export function setProgress(itemId: string, ym: YearMonth, entry: ProgressEntry): void {
  const p = readProgress();
  if (!p[itemId]) p[itemId] = {};
  p[itemId][ym] = entry;
  writeProgress(p);
}

export function clearProgress(itemId: string, ym: YearMonth): void {
  const p = readProgress();
  if (p[itemId]) {
    delete p[itemId][ym];
    if (Object.keys(p[itemId]).length === 0) delete p[itemId];
    writeProgress(p);
  }
}

// ---------- Date helpers ----------

export function currentYearMonth(): YearMonth {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function yearMonth(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m };
}

/** Is this compliance item due in the given (year, month)? */
export function isDueInMonth(
  item: Pick<ComplianceItem, 'frequency' | 'months' | 'dueMonth'>,
  year: number,
  month: number
): boolean {
  switch (item.frequency) {
    case 'daily':
    case 'weekly':
    case 'monthly':
      return true;
    case 'quarterly':
    case 'half-yearly':
      return (item.months ?? []).includes(month);
    case 'yearly':
      return item.dueMonth === month;
    case 'one-time':
      // One-time items are always shown so the user can check them whenever completed.
      return true;
    default:
      return false;
  }
}

export function formatDueDate(
  item: Pick<ComplianceItem, 'frequency' | 'dueDay' | 'dueMonth' | 'months'>,
  year: number,
  month: number
): string {
  if (!isDueInMonth(item, year, month)) return '—';
  if (item.frequency === 'daily') return 'Every day';
  if (item.frequency === 'weekly') return 'Every week';
  const day = item.dueDay ? String(item.dueDay).padStart(2, '0') : '—';
  const mm = String(month).padStart(2, '0');
  return `${day}/${mm}/${year}`;
}

export function frequencyLabel(f: ComplianceItem['frequency']): string {
  switch (f) {
    case 'half-yearly':
      return 'Half-yearly';
    case 'one-time':
      return 'One-time';
    default:
      return f.charAt(0).toUpperCase() + f.slice(1);
  }
}
