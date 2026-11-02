// ----------------------------------------------------------------------------
// Delhivery computed freight → the "Delhivery · Wallet report" slot output.
// Pure; tests in server/test/slots.test.ts.
//
// Delhivery publishes no wallet / ledger API, so the pull COMPUTES the freight
// of every Delhivery AWB the Warranty Manager created in the month:
//   warranty feed (AWB, direction, created, pins, payment mode, weight)
//   → tracking (status, charged weight, pickup) → charge calculator per AWB.
// The result is booked exactly like the wallet upload (parseDelhivery in
// client/src/data/liveMis/uploadParsers.ts): source 'delhivery', channel D2C,
// net ₹ per day in `fees`. It is an estimate of the wallet, not the wallet:
// weight disputes, re-attempts and adhoc debits / credits only show in the
// wallet report — compare one month with its upload before relying on it.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../../facts.js';
import type { SlotPull } from '../types.js';
import { inr, num, r2, str } from './common.js';

/** One row of GET warranty.heatronics.in/api/feeds/delhivery-shipments (non-PII by contract). */
export interface WarrantyFeedRow {
  awb: string;
  direction: 'forward' | 'reverse';
  createdAt: string;
  orderId?: string;
  sheetRow?: number | null;
  originPin: string | null;
  destinationPin: string | null;
  paymentMode?: string;
  declaredWeightG?: number | null;
}

/** The only tracking fields the MIS keeps (whitelisted at the boundary — no consignee name / address / phone). */
export interface TrackSummary {
  awb: string;
  status: string;
  statusType: string;
  /** Grams; null when Delhivery hasn't weighed it. */
  chargedWeightG: number | null;
  pickedUp: boolean;
  /** Consignee pincode only (fallback for a forward shipment's destination). */
  consigneePin: string | null;
}

const pin6 = (v: unknown): string | null => {
  const d = str(v).replace(/\D/g, '');
  return d.length === 6 ? d : null;
};

/** Delhivery `ChargedWeight` is grams; a value ≤ 30 can only be kg (30 kg is the B2C cap) → ×1000. */
export function gramsOf(v: unknown): number | null {
  const n = num(v);
  if (!(n > 0)) return null;
  return Math.round(n <= 30 ? n * 1000 : n);
}

/** ShipmentData[i] of GET /api/v1/packages/json/ → the whitelisted summary. */
export function trackSummary(entry: any): TrackSummary | null {
  const s = entry?.Shipment ?? entry;
  const awb = str(s?.AWB ?? s?.Waybill ?? s?.waybill);
  if (!awb) return null;
  const st = s?.Status ?? {};
  const status = str(st.Status ?? s?.status);
  const statusType = str(st.StatusType).toUpperCase();
  const scans: any[] = Array.isArray(s?.Scans) ? s.Scans : [];
  const pickedUp = Boolean(str(s?.PickUpDate) || str(s?.PickedupDate))
    || ['UD', 'DL', 'RT'].includes(statusType) && !/manifest|not picked|pending/i.test(status)
    || scans.some((x) => /picked up|in transit/i.test(str(x?.ScanDetail?.Scan)));
  return {
    awb,
    status,
    statusType,
    chargedWeightG: gramsOf(s?.ChargedWeight),
    pickedUp,
    consigneePin: pin6(s?.Consignee?.PinCode),
  };
}

export interface ChargeQuery {
  md: 'S' | 'E';
  ss: 'Delivered' | 'RTO' | 'DTO';
  o_pin: string;
  d_pin: string;
  cgm: number;
  pt: 'Pre-paid' | 'COD';
}

export type ChargePlan =
  | { charge: true; query: ChargeQuery; estimated: string[] }
  | { charge: false; reason: 'cancelled' | 'not_picked_up' | 'no_pincode' | 'not_tracked' };

const CANCELLED = /cancel|^closed$/i;

/**
 * Which charge-calculator call prices this AWB, or why it costs nothing.
 *   cancelled / never picked up → no freight (Delhivery refunds a cancelled
 *     manifest; it isn't debited until picked up — unverified).
 *   forward: RTO → ss=RTO, else ss=Delivered (in transit = priced as delivered, flagged).
 *   reverse pickup → ss=DTO, customer pin → warehouse pin.
 * Weight: charged weight from tracking, else the feed's product-map weight, else 500 g.
 */
export function chargePlan(row: WarrantyFeedRow, t: TrackSummary | null, mode: 'S' | 'E' = 'S'): ChargePlan {
  if (!t) return { charge: false, reason: 'not_tracked' };
  if (t.statusType === 'CN' || CANCELLED.test(t.status)) return { charge: false, reason: 'cancelled' };
  if (!t.pickedUp) return { charge: false, reason: 'not_picked_up' };
  const estimated: string[] = [];
  const o = pin6(row.originPin);
  const d = pin6(row.destinationPin) ?? (row.direction === 'forward' ? t.consigneePin : null);
  if (!o || !d) return { charge: false, reason: 'no_pincode' };
  let ss: ChargeQuery['ss'];
  if (row.direction === 'reverse') ss = 'DTO';
  else if (t.statusType === 'RT' || /rto|returned/i.test(t.status)) ss = 'RTO';
  else {
    ss = 'Delivered';
    if (t.statusType !== 'DL') estimated.push('in transit, priced as delivered');
  }
  let cgm = t.chargedWeightG;
  if (!cgm) {
    cgm = num(row.declaredWeightG) > 0 ? Math.round(num(row.declaredWeightG)) : 500;
    estimated.push('weight not charged yet, product weight used');
  }
  return { charge: true, query: { md: mode, ss, o_pin: o, d_pin: d, cgm, pt: 'Pre-paid' }, estimated };
}

/** Answer of GET /api/kinko/v1/invoice/charges/.json → ₹ (total_amount, GST included; else gross_amount). */
export function chargeAmount(answer: unknown): number | null {
  const a: any = Array.isArray(answer) ? answer[0] : answer;
  if (!a || typeof a !== 'object') return null;
  for (const k of ['total_amount', 'gross_amount']) {
    const v = a[k];
    if (v != null && v !== '' && Number.isFinite(num(v))) return num(v);
  }
  return null;
}

/** IST day of an ISO timestamp. */
export const istDay = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t + 5.5 * 3_600_000).toISOString().slice(0, 10);
};

export interface PricedAwb {
  awb: string;
  /** IST day the label was created (= the wallet debit day, best guess). */
  date: string;
  amount: number;
}

/**
 * Priced AWBs → the wallet parser's facts: net ₹ per day, channel D2C, source
 * 'delhivery', fees rounded per running sum like the parser.
 */
export function delhiveryFreightFacts(lines: PricedAwb[], periodKey: string, counts: Partial<Record<string, number>> = {}): SlotPull {
  const byDate = new Map<string, number>();
  let outside = 0, used = 0, sum = 0;
  for (const l of lines) {
    if (!(l.amount > 0) || !l.date) continue;
    if (l.date.slice(0, 7) !== periodKey) { outside += 1; continue; }
    byDate.set(l.date, r2((byDate.get(l.date) ?? 0) + l.amount));
    used += 1;
    sum += l.amount;
  }
  const facts: DailyFact[] = [...byDate.entries()].sort().map(([date, fees]) => ({
    source: 'delhivery', channel: 'D2C', date, revenue: 0, units: 0, orders: 0, fees: r2(fees),
  }));
  const warnings: string[] = [];
  if (outside) warnings.push(`${outside} AWB(s) dated outside ${periodKey} were left out.`);
  if (counts.no_pincode) warnings.push(`${counts.no_pincode} AWB(s) had no usable pincode in the warranty sheet and were not priced.`);
  if (counts.not_tracked) warnings.push(`${counts.not_tracked} AWB(s) were not found by Delhivery tracking and were not priced.`);
  if (counts.no_price) warnings.push(`${counts.no_price} AWB(s) got no price from the charge calculator.`);
  if (counts.estimated) warnings.push(`${counts.estimated} AWB(s) are estimates (in transit, or weight not charged yet) — pull again after month end.`);
  const trace = [
    `Priced ${used} AWB(s) → net ${inr(sum)} → ${facts.length} D2C facts by day → Platform & Payment (below CM2)`,
  ];
  const skipped = [['cancelled', 'cancelled'], ['not_picked_up', 'not picked up']]
    .filter(([k]) => counts[k]).map(([k, w]) => `${counts[k]} ${w}`);
  if (skipped.length) trace.push(`No freight for ${skipped.join(', ')} (Delhivery debits on pickup)`);
  return { facts, rowCount: lines.length, trace, warnings, emptyOk: facts.length === 0 };
}
