// ----------------------------------------------------------------------------
// Easebuzz payouts and the Tranzact Sales Invoice sheet →
// the slot outputs their uploads give. Pure; tests in server/test/slots.test.ts.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../../facts.js';
import type { SlotPull } from '../types.js';
import { inr, isoDay, num, r2, str } from './common.js';

// ---- Easebuzz payouts (settlements) -----------------------------------------

const pick = (o: any, ...keys: string[]) => {
  for (const k of keys) { const v = o?.[k]; if (v != null && v !== '') return v; }
  return null;
};

/**
 * One Easebuzz payout (settlement) → the gateway's cut: service charge + GST +
 * express service charge + express service tax, by settlement date — the same
 * sum the Settlement History parser takes. Field names are read defensively
 * (the payout API's response keys are unverified).
 */
export function easebuzzPayoutFacts(payouts: Record<string, unknown>[], periodKey: string): SlotPull {
  const byDate = new Map<string, number>();
  let n = 0, outside = 0, undated = 0;
  for (const p of payouts) {
    const id = str(pick(p, 'payout_id', 'settlement_id', 'id', 'payout_reference'));
    const date = isoDay(pick(p, 'payout_actual_date', 'settlement_date', 'payout_date', 'date'));
    if (!id && !date) continue;
    if (!date) { undated += 1; continue; }
    if (date.slice(0, 7) !== periodKey) { outside += 1; continue; }
    const fee = r2(
      // Live answer (2 Nov 2026): service_charge_amount, service_tax_amount, express_service_charge_amount,
      // express_service_tax_amount (+ payout_actual_date, payout_id). Older names kept as fallbacks.
      num(pick(p, 'service_charge_amount', 'service_charge', 'total_service_charge')) +
      num(pick(p, 'service_tax_amount', 'service_tax', 'gst', 'total_service_tax', 'gst_amount')) +
      num(pick(p, 'express_service_charge_amount', 'express_service_charge')) +
      num(pick(p, 'express_service_tax_amount', 'express_service_tax')),
    );
    byDate.set(date, r2((byDate.get(date) ?? 0) + fee));
    n += 1;
  }
  const facts: DailyFact[] = [...byDate.entries()].sort().map(([date, fees]) => ({ source: 'easebuzz', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees }));
  const total = r2(facts.reduce((s, f) => s + f.fees, 0));
  const warnings: string[] = [];
  if (n > 0 && total === 0) {
    // Field names only (never values): tells which keys Easebuzz's answer really uses.
    const keys = [...new Set(payouts.slice(0, 3).flatMap((p) => Object.keys(p ?? {})))].slice(0, 40);
    warnings.push(`Easebuzz returned ${n} settlement(s) but no fee field was recognised — fields: ${keys.join(', ')}.`);
  }
  if (undated) warnings.push(`${undated} payout(s) had no readable settlement date and were skipped.`);
  if (outside) warnings.push(`${outside} payout(s) dated outside ${periodKey} were left out.`);
  return {
    facts,
    rowCount: payouts.length,
    trace: [`${n} settlement(s) → ${facts.length} daily facts`, `Easebuzz gateway cost ${inr(total)} (service charge + GST + express)`],
    warnings,
    emptyOk: facts.length === 0,
  };
}

/** Easebuzz request hash: SHA-512 of the pipe-joined fields with the salt last (Easebuzz's documented pattern). */
export function easebuzzHashInput(parts: string[], salt: string): string {
  return [...parts, salt].join('|');
}

// ---- Tranzact Sales Invoice Register (Google Sheet feed) --------------------

const TZ_HEADER = ['invoice number', 'item id', 'invoice quantity'];

/** Same patterns as the client's (uploadParsers.ts, test-checked): charge / service lines are not goods; tooling is kept. */
export const TRANZACT_CHARGE_LINE = /freight|transport|cartage|courier|insurance|forwarding|round.?off|rounding|\b(service|delivery|loading|unloading|installation|labou?r|packing|packaging|shipping|handling)\b[\s\w/&-]{0,20}?\bcharges?\b/i;
export const TRANZACT_TOOLING_LINE = /\bmou?ld\b|mou?ld charge|tooling|development charge|\bnre\b|\bdie charge/i;

/** Same rule as the client's isTranzactCancelled: "Cancelled" status, or 1 / yes / true in a Cancelled column. */
export function tranzactCancelled(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = str(v);
  return /cancel/i.test(s) || /^(1|yes|true)$/i.test(s);
}

/**
 * The daily Tranzact sheet holds every date. Find the header the way the file
 * parser does (first 30 rows, all three columns), keep the close month's rows
 * and write their Document Date as ISO (the parser reads an ISO date first, so
 * no DD-MM / MM-DD guessing happens in the browser). The result goes through the
 * client's parseTranzactSales unchanged.
 */
export function tranzactSheetForMonth(rows: unknown[][], periodKey: string): SlotPull {
  const nonEmpty = rows.filter((r) => Array.isArray(r) && r.some((c) => str(c) !== ''));
  if (nonEmpty.length === 0) {
    return { rows: [], rowCount: 0, trace: ['The Tranzact sheet is empty'], warnings: ['No data in the sheet yet — Tranzact writes it on its daily run. Upload the register by hand until then.'] };
  }
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map((c) => str(c).toLowerCase());
    if (TZ_HEADER.every((n) => cells.includes(n))) { hi = i; break; }
  }
  if (hi < 0) {
    return { rows: [], rowCount: 0, trace: [`${nonEmpty.length} row(s) but no "Invoice Number / Item ID / Invoice Quantity" header`], warnings: ['The sheet does not look like the Sales Invoice Register (Item-wise) — check the Tranzact recurring report.'] };
  }
  const header = (rows[hi] ?? []).map((c) => str(c).toLowerCase());
  const dateCol = header.indexOf('document date');
  if (dateCol < 0) {
    return { rows: [], rowCount: 0, trace: ['Header found but no "Document Date" column'], warnings: ['No "Document Date" column in the sheet — cannot pick the month.'] };
  }
  // Same aliases as the file parser / Ops: cancelled invoices are left out here (A9-1, 10 Nov 2026).
  const statusCol = ['document status', 'cancelled', 'is cancelled', 'status'].map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const valCol = header.findIndex((h) => h.startsWith('item value - before tax'));
  const invCol = header.indexOf('invoice number');
  const itemCol = header.indexOf('item id');
  const descCol = header.indexOf('item description');
  const kept: unknown[][] = [];
  let other = 0, undated = 0, cancelled = 0, cancelledVal = 0, charges = 0, chargeVal = 0;
  for (const r of rows.slice(hi + 1)) {
    if (!Array.isArray(r) || !r.some((c) => str(c) !== '')) continue;
    const inv = invCol >= 0 ? str(r[invCol]) : '';
    if (/report ends|^total/i.test(inv) || /^\d+\s*\(\d+\)$/.test(inv)) continue; // footer / totals row
    const d = isoDay(r[dateCol]);
    if (!d) { undated += 1; continue; }
    if (d.slice(0, 7) !== periodKey) { other += 1; continue; }
    if (statusCol >= 0 && tranzactCancelled(r[statusCol])) {
      cancelled += 1; cancelledVal += valCol >= 0 ? num(r[valCol]) : 0; continue;
    }
    // Charge / service lines (non-FG): left out here, as the file reader drops them (same pattern).
    const item = itemCol >= 0 ? str(r[itemCol]) : '';
    const text = `${item} ${descCol >= 0 ? str(r[descCol]) : ''}`;
    if (!/^FG[-\s]?\d+/i.test(item) && !TRANZACT_TOOLING_LINE.test(text) && TRANZACT_CHARGE_LINE.test(text)) {
      charges += 1; chargeVal += valCol >= 0 ? num(r[valCol]) : 0; continue;
    }
    const copy = [...r];
    copy[dateCol] = d;
    kept.push(copy);
  }
  return {
    rows: [rows[hi], ...kept],
    rowCount: kept.length,
    trace: [
      `Sheet header at row ${hi + 1}; ${kept.length} invoice line(s) dated ${periodKey} kept, ${other} from other months left out`,
      ...(undated ? [`${undated} line(s) with no readable Document Date skipped`] : []),
      ...(cancelled ? [`${cancelled} cancelled line(s) ${inr(cancelledVal)} skipped — not sales`] : []),
      ...(charges ? [`${charges} charge / service line(s) (freight, transport, packaging, insurance, installation …) ${inr(chargeVal)} dropped — not goods`] : []),
      ...(statusCol < 0 ? ['No "Document Status" column in the sheet — cancelled invoices cannot be told apart; add it to the Tranzact recurring report'] : []),
    ],
    warnings: [],
    emptyOk: kept.length === 0,
  };
}
