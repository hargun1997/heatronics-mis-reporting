// ----------------------------------------------------------------------------
// Shiprocket shipment charges → the "Shiprocket · Wallet passbook" slot output.
// Pure; tests in server/test/slots.test.ts.
//
// Shiprocket's wallet statement API (GET /account/details/statement) is not the
// shipment-charge passbook: for October 2026 it answered one money-in line and
// no debits. So the pull COMPUTES the passbook debits from the orders list
// (GET /orders, the call Ops' D2C sync makes live), reading the same charge
// fields Ops stores in sr_shipments (lib/d2c/shiprocketMap.ts mapSrOrder):
//   awb_data.charges.freight_charges (else applied_weight_amount, else the
//     shipment's freight_charges)                            → forward freight
//   awb_data.charges.cod_charges                             → COD charge
//   awb_data.charges.charged_weight_amount_rto (else rto_charges /
//     applied_weight_amount_rto)                             → RTO freight
// Dating (passbook debit day, best guess): forward freight + COD on the AWB
// assign day (else pickup, else order created); RTO freight on the RTO
// initiated day (else the AWB day). Cancelled shipments that never got picked
// up cost nothing (Shiprocket refunds them). Whether these amounts include the
// 18 % GST the passbook debits carry is UNVERIFIED — compare one month.
//
// Output = the passbook parser's facts (parseShiprocketPassbook in
// client/src/data/liveMis/uploadParsers.ts): source 'shiprocket', channel from
// the Channel Order Id suffix, ₹ per IST day × channel in `fees`.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../../facts.js';
import type { SlotPull } from '../types.js';
import { inr, isoDay, num, r2, shiprocketChannel, str } from './common.js';

const pick = (o: any, ...keys: string[]): unknown => {
  for (const k of keys) {
    const v = k.split('.').reduce((a: any, p) => (a == null ? a : a[p]), o);
    if (v != null && v !== '') return v;
  }
  return null;
};

/** IST calendar day of a Shiprocket timestamp ('' when unreadable). IST wall-clock strings keep their date. */
export function srDay(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return '';
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 10);
  }
  const s = str(v);
  if (!s || /^(na|n\/a|null|0000-00-00.*|-)$/i.test(s)) return '';
  if (/\d{4}-\d{2}-\d{2}T.*([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? '' : new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
  }
  return isoDay(s);
}

export type SrChargeKind = 'freight' | 'cod' | 'rto';

/** One computed passbook debit. */
export interface SrChargeLine {
  date: string;
  channelOrderId: string;
  awb: string;
  kind: SrChargeKind;
  amount: number;
}

/** The passbook's wording for each kind (used by the equivalence test and the trace). */
export const SR_KIND_LABEL: Record<SrChargeKind, string> = {
  freight: 'Freight charges applied',
  cod: 'COD charges applied',
  rto: 'RTO freight charges applied',
};

/** Shiprocket shipment status codes for a cancelled shipment (Ops lib/shiprocket.ts SR_STATUS.CANCELLED). */
const CANCELLED = new Set([8, 16]);

export interface SrChargeCounts {
  orders: number;
  shipments: number;
  noAwb: number;
  cancelled: number;
  noCharges: number;
  undated: number;
  rtoOnAwbDay: number;
}

/**
 * GET /orders items → one debit line per charge. Order-level charges
 * (awb_data.charges) are booked once per order, on its first shipment with an
 * AWB (Ops copies them onto every shipment; summing that would double count).
 */
export function shiprocketChargeLines(orders: any[]): { lines: SrChargeLine[]; counts: SrChargeCounts } {
  const lines: SrChargeLine[] = [];
  const counts: SrChargeCounts = { orders: 0, shipments: 0, noAwb: 0, cancelled: 0, noCharges: 0, undated: 0, rtoOnAwbDay: 0 };
  const seen = new Set<string>();
  for (const o of orders) {
    if (!o || typeof o !== 'object') continue;
    const oid = str(pick(o, 'id', 'order_id'));
    if (oid && seen.has(oid)) continue; // a page boundary can repeat an order
    if (oid) seen.add(oid);
    counts.orders += 1;
    const charges: any = pick(o, 'awb_data.charges') || {};
    const ships: any[] = Array.isArray(o.shipments) ? o.shipments : o.shipments ? [o.shipments] : [{}];
    const channelOrderId = str(pick(o, 'channel_order_id'));
    let orderChargesUsed = false;
    for (const s of ships) {
      counts.shipments += 1;
      const awb = str(pick(s, 'awb', 'awb_code')) || str(pick(o, 'awb_data.awb'));
      if (!awb) { counts.noAwb += 1; continue; }
      const status = num(pick(s, 'status_code', 'shipment_status_id') ?? pick(o, 'status_code'));
      const pickedUp = srDay(pick(s, 'pickedup_timestamp', 'pickup_date', 'picked_up_date'));
      if (CANCELLED.has(status) && !pickedUp) { counts.cancelled += 1; continue; }
      const own = pick(s, 'freight_charges');
      const useOrder = !orderChargesUsed;
      const fwd = useOrder ? num(pick(charges, 'freight_charges', 'applied_weight_amount') ?? own) : num(own);
      const cod = useOrder ? num(pick(charges, 'cod_charges')) : 0;
      const rto = useOrder ? num(pick(charges, 'charged_weight_amount_rto', 'rto_charges', 'applied_weight_amount_rto')) : 0;
      if (useOrder) orderChargesUsed = true;
      if (!(fwd > 0) && !(cod > 0) && !(rto > 0)) { counts.noCharges += 1; continue; }
      const awbDay = srDay(pick(s, 'awb_assign_date', 'awb_assigned_date')) || pickedUp
        || srDay(pick(o, 'created_at', 'channel_created_at', 'order_date'));
      if (!awbDay) { counts.undated += 1; continue; }
      const base = { channelOrderId, awb };
      if (fwd > 0) lines.push({ ...base, date: awbDay, kind: 'freight', amount: r2(fwd) });
      if (cod > 0) lines.push({ ...base, date: awbDay, kind: 'cod', amount: r2(cod) });
      if (rto > 0) {
        const rtoDay = srDay(pick(s, 'rto_initiated_date', 'rto_initiated_at')) || srDay(pick(s, 'rto_delivered_date', 'rto_delivered_at'));
        if (!rtoDay) counts.rtoOnAwbDay += 1;
        lines.push({ ...base, date: rtoDay || awbDay, kind: 'rto', amount: r2(rto) });
      }
    }
  }
  return { lines, counts };
}

/** Debit lines → the passbook parser's facts (₹ per day × channel). */
export function shiprocketChargeFacts(lines: SrChargeLine[], periodKey: string, counts?: SrChargeCounts): SlotPull {
  const byKey = new Map<string, number>();
  const byKind: Record<SrChargeKind, number> = { freight: 0, cod: 0, rto: 0 };
  let outside = 0, used = 0;
  for (const l of lines) {
    if (!(l.amount > 0) || !l.date) continue;
    if (l.date.slice(0, 7) !== periodKey) { outside += 1; continue; }
    const k = `${l.date}|${shiprocketChannel(l.channelOrderId)}`;
    byKey.set(k, (byKey.get(k) ?? 0) + l.amount);
    byKind[l.kind] += l.amount;
    used += 1;
  }
  const facts: DailyFact[] = [...byKey.entries()].sort().map(([k, fees]) => {
    const [date, channel] = k.split('|');
    return { source: 'shiprocket', channel, date, revenue: 0, units: 0, orders: 0, fees: r2(fees) };
  });
  const total = facts.reduce((s, f) => s + f.fees, 0);
  const trace: string[] = [];
  if (counts) {
    trace.push(`${counts.orders} order(s), ${counts.shipments} shipment(s): ${counts.noAwb} without an AWB, ${counts.cancelled} cancelled before pickup (no freight), ${counts.noCharges} with no charges yet`);
  }
  trace.push(
    `${used} charge line(s) dated ${periodKey} (${outside} from other months left out): freight ${inr(byKind.freight)} + COD ${inr(byKind.cod)} + RTO ${inr(byKind.rto)}`,
    `By day × channel → ${facts.length} facts, total ${inr(total)}`,
  );
  const warnings: string[] = [];
  if (counts?.undated) warnings.push(`${counts.undated} shipment(s) had charges but no readable AWB / pickup / order date and were skipped.`);
  if (counts?.rtoOnAwbDay) warnings.push(`${counts.rtoOnAwbDay} RTO charge(s) had no RTO date and were dated on the AWB day.`);
  return { facts, rowCount: counts?.orders ?? lines.length, trace, warnings, emptyOk: facts.length === 0 };
}
