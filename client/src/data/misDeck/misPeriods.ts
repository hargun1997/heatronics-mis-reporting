// ----------------------------------------------------------------------------
// MIS sheet + period helpers (pure, 10 Nov 2026 audit round 7 #4 #6 #13):
//   • opexSplit       Payroll / Professional fee / Other income out of a month's OpEx lines, legacy names included
//                     (Salaries (Admin Mgmt), Salaries Director, Legal & CA expenses …); null when no line matches.
//   • isCompleteMonth a month whose books are done (closed / published / a full close of a finished month).
//   • anchorMonth     the month range presets and the export summary end on: the newest COMPLETE month, never the
//                     partial newest one.
//   • fyToDateLabel   "FY26-27 to date".
//   • cashOverMonths  a period's cash rows over the months that have them (label "Oct–Nov" when not all do).
// ----------------------------------------------------------------------------

import type { PeriodCompleteness } from './liveDeck';

// ---- OpEx split --------------------------------------------------------------

const PAYROLL_RE = /^(payroll\b|salar(y|ies)\b)/i;
const PROF_RE = /^(professional fees?\b|legal\s*(&|and)\s*(ca|professional)\b)/i;
const OTHER_INCOME_RE = /^other income\b/i;
const TOTAL_RE = /^total\b/i;

export interface OpexSplit { payroll: number | null; profFee: number | null; otherIncome: number | null }

/**
 * Split a month's effect-signed OpEx lines (costs negative, income positive — compute.ts / the legacy workbook) into
 * the MIS sheet's Payroll, Professional fee and Other income (costs and income shown positive). A line kind with no
 * matching line is null ("no data"), never 0.
 */
export function opexSplit(lines: Record<string, number> | null | undefined): OpexSplit {
  let payroll: number | null = null, profFee: number | null = null, otherIncome: number | null = null;
  for (const [name, v] of Object.entries(lines ?? {})) {
    const n = name.trim();
    if (!Number.isFinite(v) || TOTAL_RE.test(n)) continue;
    if (PAYROLL_RE.test(n)) payroll = (payroll ?? 0) - v;
    else if (PROF_RE.test(n)) profFee = (profFee ?? 0) - v;
    else if (OTHER_INCOME_RE.test(n)) otherIncome = (otherIncome ?? 0) + v;
  }
  return { payroll, profFee, otherIncome };
}

// ---- Complete months + the range anchor ----------------------------------------

type Comp = Pick<PeriodCompleteness, 'level'> & Partial<Pick<PeriodCompleteness, 'closed' | 'locked' | 'published' | 'closeBlockers'>>;

/**
 * Books done for the month: closed (locked history / Close & lock), published, or a full Tally close of a month that is
 * over. "Full" already needs every selling channel booked in Tally (monthCompleteness tallyGaps), so a half-booked
 * month is not complete; a full month still waiting on a soft check or its closing stock counts (its revenue is in).
 */
export function isCompleteMonth(c: Comp | null | undefined): boolean {
  if (!c) return false;
  if (c.closed || c.locked || c.published) return true;
  return c.level === 'full' && !(c.closeBlockers ?? []).some((b) => b.kind === 'running');
}

/**
 * The month a range preset ("Last 12 months", "FY to date") and the export summary end on: the newest complete month
 * (or `completeThrough`, whichever is later). With no completeness at all, the newest month. A running / half-booked
 * newest month is never the anchor.
 */
export function anchorMonth(keys: string[], completeness?: Record<string, Comp> | null, completeThrough?: string | null): string | null {
  const sorted = [...keys].sort();
  if (!sorted.length) return null;
  if (!completeness || !Object.keys(completeness).length) return sorted[sorted.length - 1];
  let best: string | null = completeThrough && sorted.includes(completeThrough) ? completeThrough : null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (isCompleteMonth(completeness[sorted[i]])) { if (!best || sorted[i] > best) best = sorted[i]; break; }
  }
  return best ?? sorted[sorted.length - 1];
}

export const fyStartOfKey = (k: string): number => { const [y, m] = k.split('-').map(Number); return m >= 4 ? y : y - 1; };
const fyShort = (s: number) => `FY${String(s % 100).padStart(2, '0')}-${String((s + 1) % 100).padStart(2, '0')}`;

/** "FY26-27 to date" for an anchor month in FY 2026-27. */
export const fyToDateLabel = (anchor: string): string => `${fyShort(fyStartOfKey(anchor))} to date`;
export const fyShortLabel = (anchor: string): string => fyShort(fyStartOfKey(anchor));

/** The 12 calendar months ending at `anchor` (oldest first). */
export function trailingKeys(anchor: string, n: number): string[] {
  const [y, m] = anchor.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const abs = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(abs / 12)}-${String((abs % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

// ---- Cash rows over the months that have them -------------------------------------

export interface CashRow { openingCash: number; closingCash: number; funding: number; cashBurn: number; runway: number | null }
export interface CashOver extends CashRow { months: string[]; partial: boolean; label: string | null }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mon = (k: string) => MON[Number(k.slice(5, 7)) - 1];

/**
 * A period's cash rows from the months that have a stored cash flow: opening = the first such month's, closing and
 * runway = the last one's, funding / burn = summed. `label` ("Oct–Nov") is set when some months of the period have
 * no cash flow, so the total is never read as the whole period. null = no month has one.
 */
export function cashOverMonths(keys: string[], rowOf: (k: string) => CashRow | null): CashOver | null {
  const have = [...keys].sort().map((k) => [k, rowOf(k)] as const).filter((x): x is readonly [string, CashRow] => !!x[1]);
  if (!have.length) return null;
  const first = have[0][1], last = have[have.length - 1][1];
  const partial = have.length < keys.length;
  const ks = have.map(([k]) => k);
  return {
    openingCash: first.openingCash, closingCash: last.closingCash,
    funding: have.reduce((s, [, r]) => s + r.funding, 0), cashBurn: have.reduce((s, [, r]) => s + r.cashBurn, 0),
    runway: last.runway, months: ks, partial,
    label: partial ? (ks.length === 1 ? mon(ks[0]) : `${mon(ks[0])}–${mon(ks[ks.length - 1])}`) : null,
  };
}
