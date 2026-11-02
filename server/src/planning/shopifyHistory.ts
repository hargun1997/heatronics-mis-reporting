// ----------------------------------------------------------------------------
// D2C order history for the 5-year planner — every Shopify order, rolled up into
// monthly new-vs-repeat totals and first-purchase cohorts. READ ONLY (GET
// /orders.json). Customer ids are used in memory to tell a buyer's first order
// from a repeat and are never stored or returned: only counts and ₹ leave here.
//
// Order value = total_price at order time (incl. GST and shipping, before
// returns), the same basis as the planner's revenue. Cancelled and test orders
// are skipped, and so is any single order above OUTLIER_RS (a ₹180 Cr junk order
// was placed and reversed in 2026).
// ----------------------------------------------------------------------------

import type { Credentials } from '../connectors/types.js';
import { base, headers, nextPageInfo, resolveToken } from '../connectors/sources/shopify.js';

export const OUTLIER_RS = 200_000;
const SINCE = '2024-01-01T00:00:00+05:30';
const MAX_PAGES = 600; // 150k orders

export interface RawOrder { id: number | string; created_at?: string; cancelled_at?: string | null; test?: boolean; total_price?: string; customer?: { id?: number | string } | null }

export interface HistoryMonth { month: string; newCustomers: number; repeatOrders: number; newSales: number; repeatSales: number }
export interface Cohort { month: string; size: number; repeats: number[] }
export interface D2CHistory {
  source: string; asOf: string; orders: number; customers: number; skipped: { cancelled: number; test: number; outlier: number };
  history: HistoryMonth[]; cohorts: Cohort[];
}

const monthIdx = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const ymOf = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/** Pure: orders → monthly totals and cohorts. created_at carries the store's offset (IST), so its first 7 characters are the store month. */
export function aggregateOrders(orders: RawOrder[], asOf: string, source = 'Shopify orders'): D2CHistory {
  const skipped = { cancelled: 0, test: 0, outlier: 0 };
  const kept = [] as { cust: string; ym: string; at: string; value: number }[];
  for (const o of orders) {
    if (!o.created_at) continue;
    if (o.test) { skipped.test++; continue; }
    if (o.cancelled_at) { skipped.cancelled++; continue; }
    const value = Number(o.total_price ?? 0) || 0;
    if (value > OUTLIER_RS) { skipped.outlier++; continue; }
    const cust = o.customer?.id != null ? `c${o.customer.id}` : `o${o.id}`;
    kept.push({ cust, ym: o.created_at.slice(0, 7), at: o.created_at, value });
  }
  kept.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const first = new Map<string, string>();
  const months = new Map<string, HistoryMonth>();
  const cohorts = new Map<string, Cohort>();
  const row = (ym: string) => {
    let r = months.get(ym);
    if (!r) { r = { month: ym, newCustomers: 0, repeatOrders: 0, newSales: 0, repeatSales: 0 }; months.set(ym, r); }
    return r;
  };
  for (const o of kept) {
    const f = first.get(o.cust);
    const r = row(o.ym);
    if (!f) {
      first.set(o.cust, o.ym);
      r.newCustomers++; r.newSales += o.value;
      const c = cohorts.get(o.ym) ?? { month: o.ym, size: 0, repeats: [] };
      c.size++; cohorts.set(o.ym, c);
    } else {
      r.repeatOrders++; r.repeatSales += o.value;
      const c = cohorts.get(f)!;
      const k = monthIdx(o.ym) - monthIdx(f);
      while (c.repeats.length <= k) c.repeats.push(0);
      c.repeats[k]++;
    }
  }
  // continuous months (zeros included), ending at the last full month before asOf
  const lastFull = monthIdx(asOf.slice(0, 7)) - 1;
  const keys = [...months.keys()].map(monthIdx);
  const history: HistoryMonth[] = [];
  if (keys.length) for (let i = Math.min(...keys); i <= lastFull; i++) {
    const ym = ymOf(i);
    const r = months.get(ym) ?? { month: ym, newCustomers: 0, repeatOrders: 0, newSales: 0, repeatSales: 0 };
    history.push({ ...r, newSales: Math.round(r.newSales), repeatSales: Math.round(r.repeatSales) });
  }
  const cohortList = [...cohorts.values()]
    .filter((c) => monthIdx(c.month) <= lastFull)
    .sort((a, b) => (a.month < b.month ? -1 : 1))
    .map((c) => ({ ...c, repeats: c.repeats.slice(0, lastFull - monthIdx(c.month) + 1) }));
  return { source, asOf, orders: kept.length, customers: first.size, skipped, history, cohorts: cohortList };
}

/** Page every order since SINCE (read only). */
export async function pullShopifyHistory(creds: Credentials, deadline: number): Promise<D2CHistory> {
  const token = await resolveToken(creds);
  const orders: RawOrder[] = [];
  let pageInfo: string | null = null;
  let pages = 0;
  do {
    if (Date.now() > deadline) throw new Error(`Stopped after ${orders.length.toLocaleString('en-IN')} orders — Shopify paging took too long. Refresh again.`);
    const url = new URL(`${base(creds)}/orders.json`);
    url.searchParams.set('limit', '250');
    if (pageInfo) url.searchParams.set('page_info', pageInfo);
    else {
      url.searchParams.set('status', 'any');
      url.searchParams.set('created_at_min', SINCE);
      url.searchParams.set('fields', 'id,created_at,cancelled_at,test,total_price,customer');
    }
    const res = await fetch(url, { headers: headers(token) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (!res.ok) throw new Error(`Shopify orders request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { orders?: RawOrder[] };
    for (const o of body.orders ?? []) orders.push({ id: o.id, created_at: o.created_at, cancelled_at: o.cancelled_at, test: o.test, total_price: o.total_price, customer: o.customer?.id != null ? { id: o.customer.id } : null });
    pageInfo = nextPageInfo(res.headers.get('link'));
    pages++;
    await new Promise((r) => setTimeout(r, 250)); // stay under Shopify's 2 calls / s
  } while (pageInfo && pages < MAX_PAGES);
  const now = new Date();
  const asOf = new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return aggregateOrders(orders, asOf, `Shopify orders — every order since Jan 2024 (${orders.length.toLocaleString('en-IN')} pulled)`);
}
