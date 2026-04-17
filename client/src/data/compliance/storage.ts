import {
  ComplianceCategory,
  ComplianceCategoryKey,
  ComplianceItem,
  PeriodKey,
  ProgressEntry,
  ProgressMap,
  YearMonth,
} from './types';
import { CATEGORY_SOURCES } from './sources';

/**
 * Compliance data is loaded live from a per-category Drive URL (see sources.ts)
 * with a silent fallback to the bundled template at /public/data/compliance/<cat>.json.
 * Users can edit items in the UI \u2014 edits are persisted to localStorage as an
 * "override" layer on top of the fetched source.
 *
 * Progress check-marks are stored in localStorage, keyed by itemId and a
 * PeriodKey string:
 *   Monthly   "YYYY-MM"              e.g. "2026-04"
 *   Weekly    "YYYY-MM-W<1-5>"      e.g. "2026-04-W2"
 *   Daily     "YYYY-MM-DD"           e.g. "2026-04-15"
 * Different granularities co-exist \u2014 a daily item can be ticked for each date,
 * a monthly item for each month, etc.
 */

const OVERRIDE_KEY = (cat: ComplianceCategoryKey) => `compliance:override:${cat}`;
const PROGRESS_KEY = 'compliance:progress';

/**
 * Fetch a category's compliance JSON.
 * Tries the configured Drive URL first (with cache-busting), falls back to
 * the bundled template on any error, then merges any local override.
 */
export async function loadCategory(cat: ComplianceCategoryKey): Promise<ComplianceCategory> {
  const template = await fetchCategorySource(cat);

  const override = readOverride(cat);
  if (!override) return template;

  return {
    ...template,
    items: override.items,
    version: override.version ?? template.version,
    updatedAt: override.updatedAt ?? template.updatedAt,
  };
}

async function fetchCategorySource(cat: ComplianceCategoryKey): Promise<ComplianceCategory> {
  const driveUrl = CATEGORY_SOURCES[cat]?.driveUrl;
  const bust = `t=${Date.now()}`;

  if (driveUrl) {
    const url = driveUrl + (driveUrl.includes('?') ? '&' : '?') + bust;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const body = (await res.json()) as ComplianceCategory;
        if (body && Array.isArray(body.items)) return body;
      }
    } catch {
      // Network / CORS / JSON error \u2014 fall through to bundled template.
    }
  }

  const res = await fetch(`/data/compliance/${cat}.json?${bust}`, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Unable to load compliance template for ${cat} (status ${res.status})`);
  }
  return (await res.json()) as ComplianceCategory;
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

export function getProgress(itemId: string, period: PeriodKey): ProgressEntry | undefined {
  const p = readProgress();
  return p[itemId]?.[period];
}

export function getAllProgress(): ProgressMap {
  return readProgress();
}

export function setProgress(itemId: string, period: PeriodKey, entry: ProgressEntry): void {
  const p = readProgress();
  if (!p[itemId]) p[itemId] = {};
  p[itemId][period] = entry;
  writeProgress(p);
}

export function clearProgress(itemId: string, period: PeriodKey): void {
  const p = readProgress();
  if (p[itemId]) {
    delete p[itemId][period];
    if (Object.keys(p[itemId]).length === 0) delete p[itemId];
    writeProgress(p);
  }
}

// ---------- Period-key helpers ----------

/** Current month as "YYYY-MM" \u2014 retained for backwards compatibility. */
export function currentYearMonth(): YearMonth {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

/** "YYYY-MM" month key. */
export function monthKey(year: number, month: number): PeriodKey {
  return `${year}-${pad2(month)}`;
}

/** Legacy alias. */
export function yearMonth(year: number, month: number): YearMonth {
  return monthKey(year, month);
}

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m };
}

/** "YYYY-MM-DD" day key. */
export function dayKey(year: number, month: number, day: number): PeriodKey {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Map a day-of-month to a week bucket (1..5).
 * Week 1 = days 1-7, Week 2 = 8-14, Week 3 = 15-21, Week 4 = 22-28, Week 5 = 29-31.
 */
export function weekBucket(day: number): number {
  return Math.min(5, Math.floor((day - 1) / 7) + 1);
}

/** "YYYY-MM-W<1-5>" week key. */
export function weekKey(year: number, month: number, week: number): PeriodKey {
  return `${year}-${pad2(month)}-W${week}`;
}

/** Number of days in the given (year, month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ---------- Due-ness helpers ----------

/** Is this compliance item relevant in the given (year, month)? */
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
      // Always shown so it can be checked off whenever completed.
      return true;
    default:
      return false;
  }
}

/** Is this item meant to be tracked on a specific date (daily view)? */
export function isDueOnDate(
  item: Pick<ComplianceItem, 'frequency' | 'dueDay' | 'dueMonth' | 'months'>,
  year: number,
  month: number,
  day: number
): boolean {
  if (item.frequency === 'daily') return true;
  if (!isDueInMonth(item, year, month)) return false;
  if (item.frequency === 'weekly') return false; // weekly items live under the week bucket, not a specific date
  if (item.dueDay) return item.dueDay === day;
  // If an item has no dueDay, surface it on the 1st of the month so it isn't lost.
  return day === 1;
}

/** Is this item relevant in the given week bucket of the month? */
export function isDueInWeek(
  item: Pick<ComplianceItem, 'frequency' | 'dueDay' | 'dueMonth' | 'months'>,
  year: number,
  month: number,
  week: number
): boolean {
  if (item.frequency === 'weekly') return true;
  if (item.frequency === 'daily') return true;
  if (!isDueInMonth(item, year, month)) return false;
  if (item.dueDay) return weekBucket(item.dueDay) === week;
  return week === 1;
}

export function formatDueDate(
  item: Pick<ComplianceItem, 'frequency' | 'dueDay' | 'dueMonth' | 'months'>,
  year: number,
  month: number
): string {
  if (!isDueInMonth(item, year, month)) return '\u2014';
  if (item.frequency === 'daily') return 'Every day';
  if (item.frequency === 'weekly') return 'Every week';
  const day = item.dueDay ? pad2(item.dueDay) : '\u2014';
  const mm = pad2(month);
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
