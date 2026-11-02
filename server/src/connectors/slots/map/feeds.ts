// ----------------------------------------------------------------------------
// Shiprocket statement, Easebuzz payouts and the Tranzact Sales Invoice sheet →
// the slot outputs their uploads give. Pure; tests in server/test/slots.test.ts.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../../facts.js';
import type { SlotPull } from '../types.js';
import { inr, isoDay, num, r2, shiprocketChannel, str } from './common.js';

// ---- Shiprocket wallet statement (passbook) ---------------------------------

/** GET /v1/external/account/details/statement row (fields per Shiprocket's API spec; read defensively). */
export interface ShiprocketStatementRow {
  channel_order_id?: string;
  order_id?: string | number;
  awb_code?: string;
  description?: string;
  charge?: string;
  action?: string;
  debit_amount?: string | number;
  credit_amount?: string | number;
  created_at?: string;
}

/** COD / wallet money moving — not a cost. Same rule as the passbook parser. */
const SHIPROCKET_WALLET = /^(freight charges deducted against cod|bank referenceno)/i;

/**
 * The passbook parser books every debit (a negative Amount) as freight by day ×
 * channel and skips credits (recharges, COD remittances, refunds) and the
 * wallet / COD transfer lines. The statement API returns the same lines with a
 * debit and a credit column, so a debit here = a negative Amount there.
 */
export function shiprocketStatementFacts(rows: ShiprocketStatementRow[], periodKey: string): SlotPull {
  const byKey = new Map<string, number>();
  let wallet = 0, moneyIn = 0, undated = 0, outside = 0, used = 0;
  for (const r of rows) {
    const desc = str(r.description) || str(r.charge) || str(r.action);
    if (SHIPROCKET_WALLET.test(desc)) { wallet += 1; continue; }
    const debit = num(r.debit_amount);
    if (debit <= 0) { moneyIn += 1; continue; }
    const date = isoDay(r.created_at);
    if (!date) { undated += 1; continue; }
    if (date.slice(0, 7) !== periodKey) { outside += 1; continue; }
    const channel = shiprocketChannel(str(r.channel_order_id));
    const k = `${date}|${channel}`;
    byKey.set(k, (byKey.get(k) ?? 0) + debit);
    used += 1;
  }
  const facts: DailyFact[] = [...byKey.entries()].map(([k, fees]) => {
    const [date, channel] = k.split('|');
    return { source: 'shiprocket', channel, date, revenue: 0, units: 0, orders: 0, fees: r2(fees) };
  });
  const total = facts.reduce((s, f) => s + f.fees, 0);
  const warnings: string[] = [];
  if (undated) warnings.push(`${undated} statement line(s) had no readable date and were skipped.`);
  if (outside) warnings.push(`${outside} line(s) dated outside ${periodKey} were left out.`);
  return {
    facts,
    rowCount: rows.length,
    trace: [
      `Read ${rows.length} wallet statement line(s); excluded ${wallet} wallet/COD transfer(s) + ${moneyIn} money-in line(s) (recharges / remittances / credits)`,
      `${used} debit(s) by day × channel → ${facts.length} facts, total ${inr(total)}`,
    ],
    warnings,
    emptyOk: facts.length === 0,
  };
}

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
      num(pick(p, 'service_charge', 'total_service_charge')) +
      num(pick(p, 'service_tax', 'gst', 'total_service_tax', 'gst_amount')) +
      num(pick(p, 'express_service_charge')) +
      num(pick(p, 'express_service_tax')),
    );
    byDate.set(date, r2((byDate.get(date) ?? 0) + fee));
    n += 1;
  }
  const facts: DailyFact[] = [...byDate.entries()].sort().map(([date, fees]) => ({ source: 'easebuzz', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees }));
  const total = r2(facts.reduce((s, f) => s + f.fees, 0));
  const warnings: string[] = [];
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
  const kept: unknown[][] = [];
  let other = 0, undated = 0;
  for (const r of rows.slice(hi + 1)) {
    if (!Array.isArray(r) || !r.some((c) => str(c) !== '')) continue;
    const d = isoDay(r[dateCol]);
    if (!d) { undated += 1; continue; }
    if (d.slice(0, 7) !== periodKey) { other += 1; continue; }
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
    ],
    warnings: [],
    emptyOk: kept.length === 0,
  };
}
