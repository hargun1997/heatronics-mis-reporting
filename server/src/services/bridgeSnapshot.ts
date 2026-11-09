// ----------------------------------------------------------------------------
// Snapshot of the Live MIS "Why it moved" bridge. The deck is built in the browser, so the page POSTs the pure
// bridge.ts output (₹ steps, top reasons, months — no raw rows) and the MIS keeps the newest copy in its own
// objectStore: `mis/bridge-latest` and `mis/bridge-<YYYY-MM>`. GET reads it back (MCP tool mis_get_margin_bridge).
// Pure helpers here: whitelist + clean the body (numbers only, size cap), content hash, store decision.
// ----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

export const MAX_BODY_CHARS = 60000;
const MONTH = /^\d{4}-\d{2}$/;
const STEP_IDS = new Set(['volume', 'price_mix', 'channel_mix', 'returns', 'revenue_other', 'revenue', 'bom_cost', 'stock_timing', 'cogm', 'factory', 'channel_fees', 'marketing', 'platform', 'opex', 'other']);

export interface SnapStep { id: string; label: string; value: number; lakh: number; group: 'revenue' | 'cost'; parts?: { label: string; value: number; lakh: number }[] }
export interface SnapBridge {
  status: 'ok';
  baseKey: string; curKey: string; baseLabel: string; curLabel: string;
  endRow: 'ebitda' | 'cm2'; endLabel: string;
  start: number; end: number; delta: number; startLakh: number; endLakh: number; deltaLakh: number;
  netRevenue: { base: number; cur: number; delta: number; deltaLakh: number; deltaPct: number | null };
  steps: SnapStep[];
  reasons: { text: string; stepId: string; lakh: number }[];
  notes: string[];
}
export type SnapResult = SnapBridge | { status: 'not_enough_data'; reason: string } | null;
export interface BridgeDoc { month: string; previous: SnapResult; lastYear: SnapResult }
export interface StoredBridge extends BridgeDoc { asOf: string; hash: string }

const text = (v: unknown, max: number): string => {
  if (typeof v !== 'string') throw new Error('Expected text.');
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
};
const num = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e12) throw new Error('Expected a number.');
  return v;
};
const month = (v: unknown): string => {
  if (typeof v !== 'string' || !MONTH.test(v)) throw new Error('Expected a month like 2026-10.');
  return v;
};

function cleanResult(raw: unknown): SnapResult {
  if (raw === null || raw === undefined) return null;
  const r = raw as Record<string, unknown>;
  if (r.status === 'not_enough_data') return { status: 'not_enough_data', reason: text(r.reason, 200) };
  if (r.status !== 'ok') throw new Error('Unknown bridge status.');
  const nr = (r.netRevenue ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.steps) || r.steps.length > 20) throw new Error('steps must be a short list.');
  if (!Array.isArray(r.reasons) || r.reasons.length > 5) throw new Error('reasons must be a short list.');
  const notes = Array.isArray(r.notes) ? r.notes.slice(0, 8).map((n) => text(n, 240)) : [];
  const endRow = r.endRow === 'cm2' ? 'cm2' : r.endRow === 'ebitda' ? 'ebitda' : null;
  if (!endRow) throw new Error('endRow must be ebitda or cm2.');
  return {
    status: 'ok',
    baseKey: month(r.baseKey), curKey: month(r.curKey), baseLabel: text(r.baseLabel, 20), curLabel: text(r.curLabel, 20),
    endRow, endLabel: text(r.endLabel, 40),
    start: num(r.start), end: num(r.end), delta: num(r.delta), startLakh: num(r.startLakh), endLakh: num(r.endLakh), deltaLakh: num(r.deltaLakh),
    netRevenue: { base: num(nr.base), cur: num(nr.cur), delta: num(nr.delta), deltaLakh: num(nr.deltaLakh), deltaPct: nr.deltaPct === null ? null : num(nr.deltaPct) },
    steps: (r.steps as Record<string, unknown>[]).map((s) => {
      const id = text(s.id, 30);
      if (!STEP_IDS.has(id)) throw new Error('Unknown step.');
      const parts = Array.isArray(s.parts) ? (s.parts as Record<string, unknown>[]).slice(0, 12).map((p) => ({ label: text(p.label, 60), value: num(p.value), lakh: num(p.lakh) })) : undefined;
      return { id, label: text(s.label, 80), value: num(s.value), lakh: num(s.lakh), group: s.group === 'revenue' ? 'revenue' as const : 'cost' as const, ...(parts ? { parts } : {}) };
    }),
    reasons: (r.reasons as Record<string, unknown>[]).map((x) => ({ text: text(x.text, 120), stepId: text(x.stepId, 30), lakh: num(x.lakh) })),
    notes,
  };
}

/** Validate and clean a POST body. Throws a plain message; never echoes the body. */
export function cleanBridgeBody(body: unknown): BridgeDoc {
  if (JSON.stringify(body ?? null).length > MAX_BODY_CHARS) throw new Error('Body too large.');
  const b = (body ?? {}) as Record<string, unknown>;
  return { month: month(b.month), previous: cleanResult(b.previous), lastYear: cleanResult(b.lastYear) };
}

/** Same content = same hash (asOf and hash itself are not part of it). */
export function hashOf(d: BridgeDoc): string {
  return createHash('sha256').update(JSON.stringify([d.month, d.previous, d.lastYear])).digest('hex').slice(0, 16);
}

/** Which keys to write: the month copy when its content changed; `latest` when this month is the newest seen (or the same) and changed. */
export function planWrites(doc: BridgeDoc, monthCopy: StoredBridge | null, latest: StoredBridge | null): { month: boolean; latest: boolean; hash: string } {
  const hash = hashOf(doc);
  const monthChanged = !monthCopy || monthCopy.hash !== hash;
  const newest = !latest || doc.month >= latest.month;
  const latestChanged = !latest || latest.month !== doc.month || latest.hash !== hash;
  return { month: monthChanged, latest: newest && latestChanged, hash };
}

/** GET answer: the stored copy with its asOf, or nulls (never zeros) when none. */
export function readAnswer(stored: StoredBridge | null) {
  if (!stored) return { month: null, asOf: null, previous: null, lastYear: null, note: 'No bridge saved yet. Open Live MIS > Overview once.' };
  return { month: stored.month, asOf: stored.asOf, previous: stored.previous, lastYear: stored.lastYear };
}

export const isMonth = (v: unknown): v is string => typeof v === 'string' && MONTH.test(v);
