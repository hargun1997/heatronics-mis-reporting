// Setup → D2C customers & seasonality (docs/planning/ONE-SETUP.md §2.4): the collapsed summary line and the pure
// plan mutations / selectors the section uses. No React here — server/test/setup-customers.test.ts imports this file.

import type { D2CModel, Plan } from '../engine';
import { d2cModelFrom, fitD2C, type Cohort, type FitResult } from '../history';
import { learnSkuSeason } from '../basePlan';
import { int, pct } from '../../../components/planning/fmt';

/** What GET /api/planning/history answers (the MIS's Shopify refresh; aggregates only, no customers). */
export interface StoredHistory {
  source: string;
  asOf: string;
  orders: number;
  customers: number;
  skipped: { cancelled: number; test: number; outlier: number };
  history: D2CModel['history'];
  cohorts: Cohort[];
}
export type HistoryJob = { status: 'running' | 'done' | 'failed'; startedAt: string; error?: string } | null;

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Oct first, the way the business sees the year (indices into a Jan..Dec array). */
export const SEASON_ORDER = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8];

// ---- summary -------------------------------------------------------------------------------------------------------

/** "Shopify analytics — new vs returning … (pulled …)" → "Shopify"; "Shopify orders" stays. Short enough for the 90-char line. */
export function shortSource(source: string): string {
  const clause = source.split(/\s+[—–-]\s+|\s*\(/)[0].trim();
  const s = clause.length > 14 ? clause.split(/\s+/)[0] : clause;
  return (s.length > 14 ? s.slice(0, 13) + '…' : s) || 'history';
}

/** Collapsed section line: pure, cheap (no runPlan), ≤ 90 chars. */
export function summary(plan: Plan): string {
  const d = plan.d2c;
  const disc = plan.fx?.d2cDiscount;
  const discounts = disc?.on ? pct(disc.pct, 0) : 'off';
  const boost = Number.isFinite(d.repeatBoost) ? +d.repeatBoost.toFixed(2) : 1;
  return `${d.mode === 'cohorts' ? 'Customers' : 'Units'} model · AOV ₹${int(d.aovNew)} · repeats ${boost}× · discounts ${discounts} · learned ${shortSource(d.source)} ${d.asOf}`;
}

// ---- D2C model mutations (all on the draft plan `update` hands over) ----------------------------------------------

/** Set one learned rate / AOV by hand; the fit note is tagged "(edited)" once. */
export function setD2CField<K extends keyof D2CModel>(p: Plan, k: K, v: D2CModel[K]): void {
  p.d2c[k] = v;
  p.d2c.fit = { ...p.d2c.fit, note: p.d2c.fit.note.replace(/ \(edited\)$/, '') + ' (edited)' };
}

/** True when the stored Shopify history is newer than what the plan learned from. */
export function isNewerHistory(stored: StoredHistory | null, d: Pick<D2CModel, 'asOf'>): boolean {
  return !!stored && stored.asOf > d.asOf;
}

export function learnFromStored(stored: StoredHistory): FitResult {
  return fitD2C(stored.history, stored.cohorts);
}

/** "Use Shopify cohorts": replace the model with the stored history's fit, keeping the chosen mode and repeat boost. */
export function applyStoredHistory(p: Plan, stored: StoredHistory, learned: FitResult = learnFromStored(stored)): void {
  const keep = { mode: p.d2c.mode, repeatBoost: p.d2c.repeatBoost };
  p.d2c = { ...d2cModelFrom(stored.history, learned, stored.source, stored.asOf), ...keep };
}

/** "Reset to learned": re-fit from the stored history when there is one, else from the plan's own history; boost back to 1×. */
export function resetToLearned(p: Plan, stored: StoredHistory | null): void {
  const h = stored ? stored.history : p.d2c.history;
  const f = stored ? learnFromStored(stored) : fitD2C(p.d2c.history);
  const keep = { mode: p.d2c.mode, repeatBoost: 1 };
  p.d2c = { ...d2cModelFrom(h, f, stored ? stored.source : p.d2c.source, stored ? stored.asOf : p.d2c.asOf), ...keep };
}

/** A repeat rate per month × 12 ≈ share of buyers over a year (the season averages to 1). */
export const avgYear = (rate: number) => rate * 12;

// ---- D2C discounts (plan.fx.d2cDiscount) ---------------------------------------------------------------------------

/** Typed by hand → source 'manual'. Needs `p.fx` (the section calls ensureFx first). */
export function setDiscountPct(fx: NonNullable<Plan['fx']>, v: number): void {
  fx.d2cDiscount.pct = Math.max(0, Math.min(0.5, v));
  fx.d2cDiscount.source = 'manual';
}

/** "Use Shopify's": the discount share the history measured. False when the history has none. */
export function useShopifyDiscount(p: Plan): boolean {
  const v = p.d2c.discountPct;
  if (v == null || !p.fx) return false;
  p.fx.d2cDiscount.pct = v;
  p.fx.d2cDiscount.source = 'shopify';
  p.fx.d2cDiscount.asOf = p.d2c.asOf;
  return true;
}

// ---- seasonality ---------------------------------------------------------------------------------------------------

export interface SeasonRow { id: string; name: string; v: number[]; kind: 'sku' | 'd2c' }

/** One row per sheet SKU (Jan..Dec index, flat when unlearned) and the D2C new-buyer row last. */
export function seasonRows(plan: Pick<Plan, 'skus' | 'skuSeason' | 'd2c'>): SeasonRow[] {
  return [
    ...plan.skus.map((s) => ({ id: s.id, name: s.name, v: plan.skuSeason[s.id] ?? Array(12).fill(1), kind: 'sku' as const })),
    { id: 'd2c', name: 'D2C new buyers (Shopify)', v: plan.d2c.season, kind: 'd2c' as const },
  ];
}

/** Calendar month index (0 = Jan) with the highest value; ties go to the earlier month in Oct-first order. */
export function peakMonth(v: number[]): number {
  return SEASON_ORDER.reduce((a, i) => ((v[i] ?? 0) > (v[a] ?? 0) ? i : a), SEASON_ORDER[0]);
}

/** Share of the year's volume in the top 3 months (0.25 = a flat year). */
export function top3Share(v: number[]): number {
  const total = v.reduce((a, x) => a + (x ?? 0), 0);
  if (total <= 0) return 0;
  const top = [...v].map((x) => x ?? 0).sort((a, b) => b - a).slice(0, 3).reduce((a, x) => a + x, 0);
  return top / total;
}

/** Cell tint strength for the heatmap: 0 at 0, 0.85 at 4× a normal month (never fully opaque). */
export function seasonTint(x: number): number {
  return Math.min(0.85, Math.max(0, x / 4));
}

/** A valid typed cell: finite, ≥ 0 and different from what is stored. */
export function seasonEdit(text: string, current: number): number | null {
  const x = Number(text);
  if (!Number.isFinite(x) || x < 0 || text.trim() === '') return null;
  return Math.abs(x - current) > 1e-6 ? x : null;
}

export function setSeason(p: Plan, row: Pick<SeasonRow, 'id' | 'kind'>, i: number, x: number): void {
  if (row.kind === 'd2c') { p.d2c.season[i] = x; return; }
  (p.skuSeason[row.id] ??= Array(12).fill(1))[i] = x;
}

/** "Reset products": every SKU's curve back to last year's actual units (the sheet's "Units : Last Year" rows). */
export function resetSkuSeason(p: Plan): void {
  p.skuSeason = learnSkuSeason(p);
}
