// ----------------------------------------------------------------------------
// Production portal (production.heatronics.in) — finished-good unit costs for
// the close's "BOM pricing" slot.
//
// GET https://production.heatronics.in/api/costs?month=YYYY-MM (machine endpoint,
// open in its login gate; Bearer = the optional shared secret
// production-costs-token = Production's COSTS_API_TOKEN, the same one Ops sends).
// Each finished good with a BOM: `material` = the BOM rolled up with every part at
// its latest purchase invoice on or before the month end (Tranzact files Production
// already reads every day), ex-GST. That is the per-unit COGS the BOM pricing
// upload carried ("Total FG Cost" at default price), from real invoices instead of
// Tranzact's default prices. Conversion (factory overheads) is NOT added: Tally's
// P&L already holds those costs.
//
// READ ONLY: one GET to exactly that path.
// ----------------------------------------------------------------------------

import type { Credentials } from '../types.js';

const DEFAULT_BASE = 'https://production.heatronics.in';

export interface ProductionCost {
  item: string;
  name: string;
  bom: string | null;
  material: number | null;
  /** Conversion (overheads) per unit, when Production serves it. */
  conversion?: number | null;
}

export interface ProductionCosts {
  month: string;
  products: ProductionCost[];
}

export function costsUrl(creds: Credentials, month: string | null): string {
  const base = ((creds.productionUrl || process.env.PRODUCTION_URL || DEFAULT_BASE).trim()).replace(/\/+$/, '');
  return `${base}/api/costs${month ? `?month=${encodeURIComponent(month)}` : ''}`;
}

export function assertProductionReadOnly(method: string, url: string): void {
  const u = new URL(url);
  if (method === 'GET' && u.pathname === '/api/costs' && [...u.searchParams.keys()].every((k) => k === 'month')) return;
  throw new Error(`Blocked: Production ${method} ${u.pathname} is not the read-only costs endpoint.`);
}

async function get(creds: Credentials, month: string | null): Promise<{ status: number; body: any }> {
  const url = costsUrl(creds, month);
  assertProductionReadOnly('GET', url);
  const token = (creds.costsToken || '').trim();
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text.slice(0, 200) }; }
  return { status: res.status, body };
}

/** The month's costs; when that month has none yet, the newest month Production has (flagged by `month`). */
export async function productionCosts(creds: Credentials, month: string): Promise<ProductionCosts> {
  let r = await get(creds, month);
  if (r.status === 404) r = await get(creds, null);
  if (r.status === 401) throw new Error('Production refused the costs request (401) — create the shared secret production-costs-token = Production\'s COSTS_API_TOKEN.');
  if (r.status === 404) throw new Error('Production has no product costs yet — add the Tranzact files on Production → Monthly cleanup.');
  if (r.status !== 200) throw new Error(`Production ${r.status}: ${String(r.body?.error ?? '').slice(0, 200)}`);
  const products = Array.isArray(r.body?.products) ? r.body.products : [];
  return {
    month: String(r.body?.month ?? month),
    products: products.map((p: any) => ({
      item: String(p?.item ?? ''),
      name: String(p?.name ?? ''),
      bom: p?.bom == null ? null : String(p.bom),
      material: typeof p?.material === 'number' ? p.material : null,
      conversion: typeof p?.conversion === 'number' ? p.conversion : null,
    })),
  };
}
