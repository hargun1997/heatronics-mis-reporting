// ----------------------------------------------------------------------------
// Amazon SP-API Finances v0 (listFinancialEvents) → the facts the "Unified
// Transaction (settlement)" upload gives (client parseAmazonSettlement).
//
// The unified transaction report is generated from these same events, so the
// columns line up one to one:
//   product sales        ← ItemCharge Principal
//   shipping credits     ← ItemCharge ShippingCharge
//   gift wrap credits    ← ItemCharge GiftWrap
//   promotional rebates  ← PromotionList (signed, negative)
//   selling / FBA / other transaction fees ← every ItemFee (signed, negative on a sale)
//   tax columns (GST, TCS, TDS)            ← not read by the parser, not read here
// Rows with a SKU aggregate per day × base MSKU (FBA + FBM merged); rows with no
// SKU are channel-level: advertising → spend, storage / removals / coupons /
// reimbursements → fees, bank transfers / loans → excluded (money movement).
// Dates: the posted date's UTC day, as the report prints "1 Jul 2026 … UTC".
// Pure — tests in server/test/slots.test.ts.
// ----------------------------------------------------------------------------

import type { DailyFact } from '../../facts.js';
import type { SlotPull } from '../types.js';
import { amazonBaseSku, inr, r2 } from './common.js';

/** One listFinancialEvents window: its FinancialEvents (all pages merged) and the day to file undated events on. */
export interface FinWindow {
  events: Record<string, unknown>;
  /** 'YYYY-MM-DD' — service fees carry no PostedDate; they land on the window's last day. */
  fallbackDate: string;
}

const amt = (c: any): number => {
  const n = Number(c?.CurrencyAmount ?? c?.Amount ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const day = (posted: unknown, fallback: string): string => {
  const s = String(posted ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : fallback;
};

const REVENUE_CHARGES = new Set(['principal', 'shippingcharge', 'giftwrap']);

/** Lists that are money moving, not profit (bank transfers, loans, tax withheld / GST adjustments). */
const EXCLUDED_LISTS = new Set([
  'AdhocDisbursementEventList', 'FailedAdhocDisbursementEventList', 'LoanServicingEventList', 'DebtRecoveryEventList',
  'TaxWithholdingEventList', 'TDSReimbursementEventList', 'RetrochargeEventList', 'PayWithAmazonEventList',
]);
const SHIPMENT_LISTS: Record<string, 'order' | 'refund'> = {
  ShipmentEventList: 'order', RefundEventList: 'refund', ChargebackEventList: 'refund', GuaranteeClaimEventList: 'refund',
};

/** The single money figure of a channel-level event of any other list (keeps unknown lists, like Ops). */
function eventMoney(e: any): number {
  if (Array.isArray(e?.FeeList)) return e.FeeList.reduce((s: number, f: any) => s + amt(f?.FeeAmount), 0);
  const m = e?.TotalAmount ?? e?.totalAmount ?? e?.TransactionAmount ?? e?.transactionValue ?? e?.AdjustmentAmount
    ?? e?.ReimbursedAmount ?? e?.TotalExpense ?? e?.Amount ?? e?.FeeComponent?.FeeAmount ?? null;
  return m ? amt(m) : 0;
}

export function financesToFacts(windows: FinWindow[], periodKey: string): SlotPull {
  interface Agg { revenue: number; units: number; orders: number; fees: number; name: string }
  const skuDay = new Map<string, Agg>();
  const chanDay = new Map<string, { fees: number; spend: number }>();
  const chan = (d: string) => chanDay.get(d) ?? chanDay.set(d, { fees: 0, spend: 0 }).get(d)!;
  let events = 0;
  let transfers = 0;
  let outside = 0;
  const lists = new Set<string>();

  const addSku = (date: string, sku: string, revenue: number, fees: number, qty: number, isOrder: boolean) => {
    if (revenue === 0 && fees === 0) return;
    const units = revenue === 0 ? 0 : revenue < 0 ? -Math.abs(qty) : qty;
    const { base, name } = amazonBaseSku(sku);
    const k = `${date}|${base}`;
    const a = skuDay.get(k) ?? { revenue: 0, units: 0, orders: 0, fees: 0, name };
    a.revenue += revenue; a.fees += fees; a.units += units;
    if (!a.name && name) a.name = name;
    if (isOrder && revenue > 0) a.orders += 1;
    skuDay.set(k, a);
  };
  const inMonth = (d: string) => d.slice(0, 7) === periodKey;

  for (const w of windows) {
    for (const [list, raw] of Object.entries(w.events || {})) {
      if (!Array.isArray(raw) || raw.length === 0) continue;
      lists.add(list);
      events += raw.length;
      if (EXCLUDED_LISTS.has(list)) { for (const e of raw) transfers += eventMoney(e); continue; }

      const kind = SHIPMENT_LISTS[list];
      if (kind) {
        for (const e of raw as any[]) {
          const date = day(e?.PostedDate, w.fallbackDate);
          if (!inMonth(date)) { outside += 1; continue; }
          const items = kind === 'refund' ? e?.ShipmentItemAdjustmentList ?? e?.ShipmentItemList ?? [] : e?.ShipmentItemList ?? [];
          for (const it of items) {
            const sku = String(it?.SellerSKU ?? '').trim();
            let revenue = 0;
            for (const c of [...(it?.ItemChargeList ?? []), ...(it?.ItemChargeAdjustmentList ?? [])]) {
              if (REVENUE_CHARGES.has(String(c?.ChargeType ?? '').toLowerCase())) revenue += amt(c?.ChargeAmount);
            }
            for (const p of [...(it?.PromotionList ?? []), ...(it?.PromotionAdjustmentList ?? [])]) revenue += amt(p?.PromotionAmount);
            let fees = 0;
            for (const f of [...(it?.ItemFeeList ?? []), ...(it?.ItemFeeAdjustmentList ?? [])]) fees -= amt(f?.FeeAmount);
            const qty = Math.abs(Number(it?.QuantityShipped) || 0);
            if (sku) addSku(date, sku, revenue, fees, qty, kind === 'order');
            else chan(date).fees += fees;
          }
          // Order / shipment-level fees with no item → channel fees.
          for (const f of [...(e?.ShipmentFeeList ?? []), ...(e?.ShipmentFeeAdjustmentList ?? []), ...(e?.OrderFeeList ?? []), ...(e?.OrderFeeAdjustmentList ?? [])]) {
            chan(date).fees -= amt(f?.FeeAmount);
          }
        }
        continue;
      }

      for (const e of raw as any[]) {
        const date = day(e?.PostedDate ?? e?.postedDate, w.fallbackDate);
        if (!inMonth(date)) { outside += 1; continue; }
        if (list === 'ProductAdsPaymentEventList') { chan(date).spend += -amt(e?.transactionValue); continue; }
        if (list === 'ServiceFeeEventList' && String(e?.SellerSKU ?? '').trim()) {
          // A SKU-tagged service fee is an "other transaction fee" on that SKU's row.
          const fees = -(e?.FeeList ?? []).reduce((s: number, f: any) => s + amt(f?.FeeAmount), 0);
          const { base, name } = amazonBaseSku(String(e.SellerSKU));
          const k = `${date}|${base}`;
          const a = skuDay.get(k) ?? { revenue: 0, units: 0, orders: 0, fees: 0, name };
          a.fees += fees; skuDay.set(k, a);
          continue;
        }
        if (list === 'AdjustmentEventList' && (e?.AdjustmentItemList ?? []).some((i: any) => String(i?.SellerSKU ?? '').trim())) {
          // SKU-tagged adjustments (FBA inventory reimbursements) carry no sales and no
          // fees in the report — the parser skips them; so do we.
          continue;
        }
        // Storage, removals, coupons, deals, SAFE-T, liquidations, other account fees.
        chan(date).fees += -eventMoney(e);
      }
    }
  }

  const facts: DailyFact[] = [];
  for (const [k, a] of skuDay) {
    const [date, base] = k.split('|');
    facts.push({ source: 'amazon', channel: 'Amazon', date, sku: base, skuName: a.name || base, skuKind: 'sku', revenue: r2(a.revenue), units: a.units, orders: a.orders, fees: r2(a.fees) });
  }
  for (const [date, c] of chanDay) {
    if (r2(c.fees) === 0 && r2(c.spend) === 0) continue;
    facts.push({ source: 'amazon', channel: 'Amazon', date, revenue: 0, units: 0, orders: 0, fees: r2(c.fees), spend: r2(c.spend) });
  }
  facts.sort((x, y) => x.date.localeCompare(y.date));

  const rev = facts.reduce((s, f) => s + f.revenue, 0);
  const fees = facts.reduce((s, f) => s + f.fees, 0);
  const spend = facts.reduce((s, f) => s + (f.spend ?? 0), 0);
  const skus = new Set([...skuDay.keys()].map((k) => k.split('|')[1])).size;
  return {
    facts,
    rowCount: events,
    trace: [
      `Read ${events} financial event(s) posted in ${periodKey} across ${windows.length} window(s) (${[...lists].sort().join(', ') || 'none'})`,
      `Excluded transfers / loans / tax withheld of ${inr(Math.abs(transfers))} (money movement, not a cost)`,
      `Per-SKU by day across ${skus} products (FBA + FBM merged on base MSKU) → ${facts.length} facts: revenue ${inr(rev)}, fees ${inr(fees)}, ad spend ${inr(spend)}`,
    ],
    warnings: outside > 0 ? [`${outside} event(s) dated outside ${periodKey} were left out.`] : [],
    emptyOk: events === 0,
    note: 'From SP-API Finances (posted events), the same events the Unified Transaction report is built from. Amazon may hold back the last ~48 h; pull after the 3rd of the next month for a closed month.',
  };
}
