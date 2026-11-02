// ----------------------------------------------------------------------------
// Easebuzz connector — settlements (payouts) for the D2C gateway cost (MDR).
//
// Payout API: POST https://dashboard.easebuzz.in/payout/v1/retrieve, form body
// merchant_key, merchant_email, payout_date (DD-MM-YYYY), hash =
// SHA-512("merchant_key|merchant_email|payout_date|salt"). One call per
// settlement day. This is Easebuzz's published payout (settlement) enquiry as
// used by their server kits; the path, the hash order and the answer's field
// names are UNVERIFIED against a live answer — the mapper reads several key
// names and the Settlement History upload stays as the fallback.
//
// Credentials: merchant key + salt (+ the merchant's login email), from the
// shared secrets easebuzz-merchant-key / easebuzz-salt / easebuzz-merchant-email
// or the Connectors page. Missing = "Not connected" (not an error).
//
// READ ONLY: the payout enquiry is the only call (asserted before each request).
// ----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import type { ConnectorDef, Credentials, FetchResult, TestResult } from '../types.js';
import type { ConnectorSource } from '../schema.js';
import { addDays, istToday, monthDays } from '../slots/map/common.js';
import { easebuzzHashInput, easebuzzPayoutFacts } from '../slots/map/feeds.js';

const PAYOUT_URL = 'https://dashboard.easebuzz.in/payout/v1/retrieve';

export function assertEasebuzzReadOnly(method: string, url: string): void {
  if (method === 'POST' && url === PAYOUT_URL) return;
  throw new Error(`Blocked: Easebuzz ${method} ${url.split('?')[0]} is not the read-only payout enquiry.`);
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** The first array of objects in an answer (Easebuzz wraps payouts as `payouts_history_data` / `data`). */
function payoutList(j: any): Record<string, unknown>[] {
  for (const k of ['payouts_history_data', 'payout_history_data', 'data', 'payouts', 'msg']) {
    const v = j?.[k];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = payoutList(v);
      if (inner.length) return inner;
    }
  }
  return [];
}

export async function payoutsOn(creds: Credentials, isoDay: string): Promise<Record<string, unknown>[]> {
  const key = (creds.merchantKey || '').trim();
  const salt = (creds.salt || '').trim();
  const email = (creds.merchantEmail || '').trim();
  if (!key || !salt) throw new Error('Not connected — add the Easebuzz merchant key + salt.');
  const payoutDate = ddmmyyyy(isoDay);
  const hash = createHash('sha512').update(easebuzzHashInput([key, email, payoutDate], salt)).digest('hex');
  assertEasebuzzReadOnly('POST', PAYOUT_URL);
  const res = await fetch(PAYOUT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ merchant_key: key, merchant_email: email, payout_date: payoutDate, hash }),
  });
  const text = await res.text();
  let j: any = {};
  try { j = text ? JSON.parse(text) : {}; } catch { throw new Error(`Easebuzz answered non-JSON (${res.status}).`); }
  if (!res.ok) throw new Error(`Easebuzz ${res.status}: ${String(j?.message ?? j?.error ?? text).slice(0, 200)}`);
  const ok = j?.status === true || j?.status === 1 || j?.status === '1' || j?.status === 'success';
  const list = payoutList(j);
  if (!ok && list.length === 0) {
    const why = String(j?.message ?? j?.msg ?? j?.error_desc ?? '');
    // "no payout" for a day is an empty day, not an error.
    if (/no\s+(payout|record|data|settlement)/i.test(why)) return [];
    throw new Error(`Easebuzz refused the payout enquiry${why ? `: ${why.slice(0, 200)}` : ''}.`);
  }
  return list;
}

/** Every payout settled in the month (one enquiry per day, 3 at a time). */
export async function payoutsForMonth(creds: Credentials, periodKey: string, deadline: number): Promise<{ payouts: Record<string, unknown>[]; days: number }> {
  const { first, last } = monthDays(periodKey);
  const end = last < istToday() ? last : istToday();
  const days: string[] = [];
  for (let d = first; d <= end; d = addDays(d, 1)) days.push(d);
  const payouts: Record<string, unknown>[] = [];
  for (let i = 0; i < days.length; i += 3) {
    if (Date.now() > deadline) throw new Error('Easebuzz enquiry ran out of time — Pull again.');
    const got = await Promise.all(days.slice(i, i + 3).map((d) => payoutsOn(creds, d)));
    for (const g of got) payouts.push(...g);
  }
  return { payouts, days: days.length };
}

const easebuzz: ConnectorDef = {
  id: 'easebuzz',
  label: 'Easebuzz',
  group: 'payments',
  fetchMode: 'api',
  mode: 'manual-upload',
  implemented: true,
  credentialFields: [
    { key: 'merchantKey', label: 'Merchant key', type: 'text', help: 'Shared secret easebuzz-merchant-key when blank.' },
    { key: 'salt', label: 'Salt', type: 'password', help: 'Shared secret easebuzz-salt when blank.' },
    { key: 'merchantEmail', label: 'Merchant login email', type: 'text', optional: true, help: 'The email on the Easebuzz merchant account (part of the payout hash). Shared secret easebuzz-merchant-email.' },
  ],
  note: 'Settlements (payout API) → D2C payment-gateway cost: service charge + GST + express → Platform & Payment. Read only. Payout API fields unverified — the Settlement History upload stays as fallback.',

  async test(creds: Credentials): Promise<TestResult> {
    const list = await payoutsOn(creds, addDays(istToday(), -1));
    return { ok: true, detail: `Payout enquiry answered (${list.length} payout(s) yesterday).` };
  },

  async fetchPeriod(creds: Credentials, periodKey: string): Promise<FetchResult> {
    const { payouts } = await payoutsForMonth(creds, periodKey, Date.now() + 60_000);
    const out = easebuzzPayoutFacts(payouts, periodKey);
    const fee = out.facts?.reduce((s, f) => s + f.fees, 0) ?? 0;
    const source: ConnectorSource = {
      label: `Easebuzz gateway cost ${periodKey}`,
      kind: 'channelRevenue',
      method: 'connector',
      nodes: [], skuRows: [], bomCosts: [],
      crossChecks: [{ label: 'Easebuzz MDR (service charge + GST + express)', amount: Math.round(fee * 100) / 100 }],
      warnings: out.warnings,
    };
    return { sources: [source], warnings: out.warnings };
  },
};

export default easebuzz;
