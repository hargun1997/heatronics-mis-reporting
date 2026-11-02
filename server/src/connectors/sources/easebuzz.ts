// ----------------------------------------------------------------------------
// Easebuzz connector — settlements (payouts) for the D2C gateway cost (MDR).
//
// Settlements API (Easebuzz's own PHP kit, easebuzz/paywitheasebuzz-php-lib payout.php):
// POST https://dashboard.easebuzz.in/settlements/v1/retrieve, JSON body
// { merchant_key, hash, payout_date: { start_date, end_date } (DD-MM-YYYY), merchant_email? },
// hash = SHA-512("merchant_key|start_date|end_date|salt") — merchant_email is NOT in the hash.
// One call for the whole month. The answer's field names are still unverified against a live
// answer — the mapper reads several key names and the Settlement History upload stays as fallback.
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

const PAYOUT_URL = 'https://dashboard.easebuzz.in/settlements/v1/retrieve';

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

/** Every settlement between two IST days (inclusive), one enquiry. */
export async function payoutsBetween(creds: Credentials, fromIso: string, toIso: string): Promise<Record<string, unknown>[]> {
  const key = (creds.merchantKey || '').trim();
  const salt = (creds.salt || '').trim();
  const email = (creds.merchantEmail || '').trim();
  if (!key || !salt) throw new Error('Not connected — add the Easebuzz merchant key + salt.');
  const start = ddmmyyyy(fromIso);
  const end = ddmmyyyy(toIso);
  const hash = createHash('sha512').update(easebuzzHashInput([key, start, end], salt)).digest('hex');
  const body: Record<string, unknown> = { merchant_key: key, hash, payout_date: { start_date: start, end_date: end } };
  if (email) body.merchant_email = email;
  assertEasebuzzReadOnly('POST', PAYOUT_URL);
  const res = await fetch(PAYOUT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let j: any = {};
  try { j = text ? JSON.parse(text) : {}; } catch { throw new Error(`Easebuzz answered non-JSON (${res.status}).`); }
  if (!res.ok) throw new Error(`Easebuzz ${res.status}: ${String(j?.message ?? j?.error ?? text).slice(0, 200)}`);
  const ok = j?.status === true || j?.status === 1 || j?.status === '1' || j?.status === 'success';
  const list = payoutList(j);
  if (!ok && list.length === 0) {
    const why = String(j?.message ?? j?.msg ?? j?.error_desc ?? j?.data ?? '');
    // "no settlement" in the range is an empty range, not an error.
    if (/no\s+(payout|record|data|settlement)/i.test(why)) return [];
    throw new Error(`Easebuzz refused the settlement enquiry${why ? `: ${why.slice(0, 200)}` : ''}.`);
  }
  return list;
}

/** Every settlement paid out in the month (one enquiry; the month so far for the running month). */
export async function payoutsForMonth(creds: Credentials, periodKey: string, deadline: number): Promise<{ payouts: Record<string, unknown>[]; days: number }> {
  const { first, last } = monthDays(periodKey);
  const end = last < istToday() ? last : istToday();
  if (Date.now() > deadline) throw new Error('Easebuzz enquiry ran out of time — Pull again.');
  const payouts = await payoutsBetween(creds, first, end);
  const days = Math.round((Date.parse(end) - Date.parse(first)) / 86_400_000) + 1;
  return { payouts, days };
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
    { key: 'merchantEmail', label: 'Merchant login email', type: 'text', optional: true, help: 'Optional: the email on the Easebuzz merchant account (sent with the request, not hashed). Shared secret easebuzz-merchant-email.' },
  ],
  note: 'Settlements (payout API) → D2C payment-gateway cost: service charge + GST + express → Platform & Payment. Read only. Settlements API answer fields unverified — the Settlement History upload stays as fallback.',

  async test(creds: Credentials): Promise<TestResult> {
    const y = addDays(istToday(), -1);
    const list = await payoutsBetween(creds, addDays(y, -6), y);
    return { ok: true, detail: `Settlement enquiry answered (${list.length} settlement(s) in the last 7 days).` };
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
