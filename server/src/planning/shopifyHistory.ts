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

// Bulk query (the fast path): one read-only GraphQL bulk operation returns every order since SINCE as a JSONL file —
// no paging. REST paging needed ~10 s a page (the customer object is large) and stopped at 9,000 orders on 2 Nov 2026.
// bulkOperationRunQuery only RUNS A QUERY (Shopify's bulk export); nothing in the store changes.
const BULK_QUERY = `{
  orders(query: "created_at:>=2024-01-01") {
    edges { node { id createdAt cancelledAt test totalPriceSet { shopMoney { amount } } customer { id } } }
  }
}`;
const RUN = `mutation($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id status } userErrors { field message } } }`;
const CURRENT = `{ currentBulkOperation(type: QUERY) { id status errorCode objectCount url } }`;

type Gql = (query: string, variables?: Record<string, unknown>) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** gid://shopify/Order/123 → "123" */
const gidTail = (g: unknown) => (typeof g === 'string' ? g.slice(g.lastIndexOf('/') + 1) : g == null ? undefined : String(g));

/** One JSONL line of the bulk file → the same RawOrder the REST path builds (pure, tested). */
export function bulkLineToOrder(line: string): RawOrder | null {
  if (!line.trim()) return null;
  let o: { id?: string; createdAt?: string; cancelledAt?: string | null; test?: boolean; totalPriceSet?: { shopMoney?: { amount?: string } }; customer?: { id?: string } | null; __parentId?: string };
  try { o = JSON.parse(line); } catch { return null; }
  if (!o.id || o.__parentId || !String(o.id).includes('/Order/')) return null;
  const cid = gidTail(o.customer?.id);
  return { id: gidTail(o.id)!, created_at: o.createdAt, cancelled_at: o.cancelledAt ?? null, test: !!o.test, total_price: o.totalPriceSet?.shopMoney?.amount, customer: cid ? { id: cid } : null };
}

async function pullShopifyHistoryBulk(gql: Gql, download: (url: string) => Promise<string>, deadline: number, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<RawOrder[]> {
  const run = await gql(RUN, { q: BULK_QUERY });
  const errs: { message: string }[] = run?.data?.bulkOperationRunQuery?.userErrors ?? [];
  // "already in progress" = an earlier refresh's export is still running: wait for that one.
  if (errs.length && !errs.some((e) => /in progress/i.test(e.message))) throw new Error(`Shopify bulk export refused: ${errs.map((e) => e.message).join('; ')}`);
  if (run?.errors?.length) throw new Error(`Shopify bulk export failed: ${run.errors.map((e: { message: string }) => e.message).join('; ')}`);
  for (;;) {
    if (Date.now() > deadline) throw new Error('Shopify is still preparing the order export — refresh again in a few minutes (it carries on).');
    await sleep(4000);
    const cur = (await gql(CURRENT))?.data?.currentBulkOperation;
    if (!cur) continue;
    if (cur.status === 'COMPLETED') {
      if (!cur.url) return []; // no orders
      const text = await download(cur.url);
      return text.split('\n').map(bulkLineToOrder).filter((x): x is RawOrder => !!x);
    }
    if (['FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED'].includes(cur.status)) throw new Error(`Shopify bulk export ${cur.status.toLowerCase()}${cur.errorCode ? ` (${cur.errorCode})` : ''}`);
  }
}

/** Every order since SINCE (read only): bulk export first, REST paging if the bulk API is not allowed. */
export async function pullShopifyHistory(creds: Credentials, deadline: number): Promise<D2CHistory> {
  const token = await resolveToken(creds);
  const gql: Gql = async (query, variables) => {
    const res = await fetch(`${base(creds)}/graphql.json`, { method: 'POST', headers: { ...headers(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };
  const download = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Shopify export download failed (${res.status})`);
    return res.text();
  };
  let orders: RawOrder[];
  try {
    orders = await pullShopifyHistoryBulk(gql, download, deadline);
  } catch (e) {
    if (/still preparing/.test((e as Error).message)) throw e;
    return pullShopifyHistoryRest(creds, deadline); // bulk API not allowed for this app / failed: the slow path
  }
  const asOf = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return aggregateOrders(orders, asOf, `Shopify orders — every order since Jan 2024 (${orders.length.toLocaleString('en-IN')}, bulk export)`);
}

export const __test = { pullShopifyHistoryBulk };

/** Fallback: page every order since SINCE over REST (read only; slow — ~10 s a page with the customer field). */
async function pullShopifyHistoryRest(creds: Credentials, deadline: number): Promise<D2CHistory> {
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
