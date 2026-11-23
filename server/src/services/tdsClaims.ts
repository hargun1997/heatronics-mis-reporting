// TDS to claim back (TDS page → "Claim back", founder 23 Nov 2026). Pure: no store, no network (test server/test/tdsClaims.test.ts).
//
// Two kinds of money, both from the STORED Tally Day Books (the TDS sync re-reads the whole FY every hour):
//  1. reimburse: platforms that take the FULL bill (prepaid wallet, card auto-charge, deducted from the seller payout) while we deduct
//     TDS and pay it to the government. We get that TDS back from the platform after we give it our TDS certificate (Form No. 131
//     under the Income-tax Act 2025; Form 16A before). Amazon (ads / fees), Meta, Google, Porter, Shiprocket by name; any other party
//     whose payments in the FY cover the bills before TDS (paid in full) shows as "Other platform".
//     Deducted = the TDS on the party's bills (the same bills and amounts as the TDS page: supplierInvoices.invoiceRows).
//     Received = Tally entries that book a TDS refund / reimbursement for the party (narration "TDS" + refund / reimburse, or a credit
//     to a "TDS Reimbursement" ledger), plus what the team marks as received in the tool.
//  2. credit: TDS other people deducted FROM US (Amazon section 194-O on our sales: "Amazon TDS-TCS" vouchers, "TDS (Amazon)"). Not
//     claimed from the platform: it is credit in our income-tax return. Check it against Form 26AS / the platform's certificate.
// Certificates for a quarter come 15 days after the TDS return due date: Q1 15 Aug, Q2 15 Nov, Q3 15 Feb, Q4 15 Jun (UNVERIFIED for
// the 2025 Act's new form numbers; dates unchanged in the CBDT FAQ).
import type { TallyLedger, TallyVoucher } from '../connectors/tally/books.js';
import { invoiceRows, type SupplierInvoice } from './supplierInvoices.js';

export interface PlatformDef { id: string; name: string; match: RegExp }
export const PLATFORMS: PlatformDef[] = [
  { id: 'amazon', name: 'Amazon (ads and seller fees)', match: /amazon/i },
  { id: 'meta', name: 'Meta (Facebook / Instagram ads)', match: /facebook|meta platforms|instagram/i },
  { id: 'google', name: 'Google Ads', match: /google/i },
  { id: 'porter', name: 'Porter', match: /\bporter\b|smartshift/i },
  { id: 'shiprocket', name: 'Shiprocket', match: /shiprocket|bigfoot/i },
  { id: 'flipkart', name: 'Flipkart (ads and fees)', match: /flipkart/i },
];

export type ClaimState = 'wait' | 'ready' | 'claimed' | 'received';
export interface ClaimRecord { status: 'claimed' | 'received'; on: string; ref: string; amount: number | null; by: string | null; at: string }
export type ClaimRecords = Record<string, ClaimRecord>; // key = `${platformId}|${quarter}` e.g. "meta|2026-Q2"

export interface ClaimBill { date: string; quarter: string; party: string; voucher: string; invoiceNo: string; taxable: number; tds: number; tdsLedger: string }
export interface ClaimQuarter { quarter: string; label: string; deducted: number; received: number; pending: number; certFrom: string; state: ClaimState; record: ClaimRecord | null; bills: number }
export interface ClaimPlatform {
  id: string; name: string; kind: 'reimburse' | 'credit'; parties: string[]; why: string;
  deducted: number; received: number; pending: number; readyNow: number;
  quarters: ClaimQuarter[]; bills: ClaimBill[];
}
export interface ClaimsReport {
  fy: number; asOf: string; platforms: ClaimPlatform[];
  totals: { pending: number; readyNow: number; claimed: number; credit: number };
  older: { ledger: string; opening: number }[];
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const lc = (s: string) => s.trim().toLowerCase();
const live = (v: TallyVoucher) => !v.cancelled && !v.optional;

/** "2026-Q2" for a date in Jul–Sep 2026 (Indian FY quarters; Q4 = Jan–Mar of the next calendar year, FY of April). */
export function quarterOf(date: string): string {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  const fy = m >= 4 ? y : y - 1;
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
  return `${fy}-Q${q}`;
}
export function quarterLabel(q: string): string {
  const [fy, n] = [Number(q.slice(0, 4)), Number(q.slice(6))];
  const span = ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'][n - 1];
  return `Q${n} ${span} ${n === 4 ? fy + 1 : fy}`;
}
/** First day the quarter's TDS certificate can be downloaded from TRACES. */
export function certFrom(q: string): string {
  const [fy, n] = [Number(q.slice(0, 4)), Number(q.slice(6))];
  return n === 1 ? `${fy}-08-15` : n === 2 ? `${fy}-11-15` : n === 3 ? `${fy + 1}-02-15` : `${fy + 1}-06-15`;
}

const TDS_NAME = /\btds\b|tax\s+deducted/i;
const REFUND_WORDS = /refund|reimburs/i;
const isReimburseLedger = (n: string) => /tds/i.test(n) && /reimburs|refundable/i.test(n);

function platformOf(party: string): PlatformDef | undefined { return PLATFORMS.find((p) => p.match.test(party)); }

export function buildClaims(input: { fy: number; vouchers: TallyVoucher[]; ledgers: TallyLedger[]; records?: ClaimRecords; today?: string }): ClaimsReport {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const records = input.records ?? {};
  const inFy = (d: string) => quarterOf(d).startsWith(`${input.fy}-`);
  const vouchers = input.vouchers.filter(live).filter((v) => inFy(v.date));
  const bills: SupplierInvoice[] = invoiceRows(vouchers, input.ledgers).filter((b) => b.tds > 0);

  // paid in full? payments to a party in the FY vs its bills before TDS
  const paid = new Map<string, number>(), gross = new Map<string, number>(), tdsBy = new Map<string, number>();
  for (const b of bills) { gross.set(lc(b.supplier), (gross.get(lc(b.supplier)) ?? 0) + b.total); tdsBy.set(lc(b.supplier), (tdsBy.get(lc(b.supplier)) ?? 0) + b.tds); }
  for (const v of vouchers.filter((x) => /payment/i.test(x.type))) {
    for (const l of v.lines) if (l.amount > 0 && gross.has(lc(l.ledger))) paid.set(lc(l.ledger), (paid.get(lc(l.ledger)) ?? 0) + l.amount);
  }
  const paidInFull = (party: string) => {
    const g = gross.get(lc(party)) ?? 0, t = tdsBy.get(lc(party)) ?? 0, p = paid.get(lc(party)) ?? 0;
    return t > 0 && p >= g - t + 0.8 * t;
  };

  // group bills: named platforms + other paid-in-full parties
  const groups = new Map<string, { def: { id: string; name: string }; why: string; bills: SupplierInvoice[] }>();
  for (const b of bills) {
    const def = platformOf(b.supplier);
    let id: string, name: string, why: string;
    if (def) { id = def.id; name = def.name; why = 'Prepaid platform: it takes the full bill, so the TDS we paid comes back after we send the certificate.'; }
    else if (paidInFull(b.supplier)) { id = `other:${lc(b.supplier)}`; name = b.supplier; why = 'Paid in full in Tally although TDS was deducted: ask the party to refund the TDS.'; }
    else continue;
    const g = groups.get(id) ?? { def: { id, name }, why, bills: [] };
    g.bills.push(b); groups.set(id, g);
  }

  // TDS refunds already booked in Tally (receipt / journal with TDS + refund words, or a credit to a TDS reimbursement ledger)
  const receivedBooked = new Map<string, Map<string, number>>(); // platform id → quarter → ₹
  for (const v of vouchers) {
    if (/purchase|sales|tds-tcs/i.test(v.type)) continue;
    const reimb = v.lines.filter((l) => isReimburseLedger(l.ledger) && l.amount < 0).reduce((s, l) => s - l.amount, 0);
    const words = TDS_NAME.test(v.narration) && REFUND_WORDS.test(v.narration);
    if (!reimb && !words) continue;
    const who = [v.party, ...v.lines.map((l) => l.ledger), v.narration].join(' ');
    const id = platformOf(who)?.id ?? [...groups.keys()].find((k) => k.startsWith('other:') && who.toLowerCase().includes(k.slice(6)));
    if (!id) continue;
    const amt = reimb || Math.abs(v.lines.find((l) => l.ledger === v.party)?.amount ?? 0);
    if (!amt) continue;
    const q = quarterOf(v.date);
    const m = receivedBooked.get(id) ?? new Map<string, number>();
    m.set(q, (m.get(q) ?? 0) + amt); receivedBooked.set(id, m);
  }

  const platforms: ClaimPlatform[] = [];
  for (const { def, why, bills: list } of groups.values()) {
    const byQ = new Map<string, SupplierInvoice[]>();
    for (const b of list) { const q = quarterOf(b.date); byQ.set(q, [...(byQ.get(q) ?? []), b]); }
    const quarters: ClaimQuarter[] = [...byQ.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([q, bs]) => {
      const deducted = r2(bs.reduce((s, b) => s + b.tds, 0));
      const rec = records[`${def.id}|${q}`] ?? null;
      const booked = receivedBooked.get(def.id)?.get(q) ?? 0;
      const received = r2(Math.min(deducted, Math.max(booked, rec?.status === 'received' ? (rec.amount ?? deducted) : 0)));
      const pending = r2(Math.max(0, deducted - received));
      const cf = certFrom(q);
      const state: ClaimState = pending <= 0.5 ? 'received' : rec?.status === 'claimed' ? 'claimed' : today >= cf ? 'ready' : 'wait';
      return { quarter: q, label: quarterLabel(q), deducted, received, pending, certFrom: cf, state, record: rec, bills: bs.length };
    });
    const deducted = r2(quarters.reduce((s, q) => s + q.deducted, 0));
    const received = r2(quarters.reduce((s, q) => s + q.received, 0));
    platforms.push({
      id: def.id, name: def.name, kind: 'reimburse', why,
      parties: [...new Set(list.map((b) => b.supplier))],
      deducted, received, pending: r2(deducted - received),
      readyNow: r2(quarters.filter((q) => q.state === 'ready').reduce((s, q) => s + q.pending, 0)),
      quarters,
      bills: list.sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ date: b.date, quarter: quarterOf(b.date), party: b.supplier, voucher: `${b.voucherType} ${b.voucherNo}`.trim(), invoiceNo: b.invoiceNo, taxable: b.taxable, tds: b.tds, tdsLedger: b.tdsLedger })),
    });
  }

  // TDS deducted FROM us (credit in the tax return): debits to a TDS receivable ledger outside purchase vouchers
  const byName = new Map(input.ledgers.map((l) => [lc(l.name), l]));
  const isReceivable = (n: string) => TDS_NAME.test(n) && !isReimburseLedger(n) && (/receivable|\(amazon\)|\(flipkart\)/i.test(n) || /receivable/i.test(byName.get(lc(n))?.group ?? ''));
  const credit = new Map<string, { name: string; q: Map<string, number>; parties: Set<string>; n: Map<string, number> }>();
  for (const v of vouchers) {
    if (/purchase|debit note/i.test(v.type)) continue;
    for (const l of v.lines) {
      if (l.amount <= 0 || !isReceivable(l.ledger)) continue;
      const def = platformOf(`${l.ledger} ${v.party}`);
      const id = `credit:${def?.id ?? lc(l.ledger)}`;
      const g = credit.get(id) ?? { name: def ? `${def.name.split(' (')[0]}: TDS deducted from our sales` : l.ledger, q: new Map(), parties: new Set(), n: new Map() };
      const q = quarterOf(v.date);
      g.q.set(q, (g.q.get(q) ?? 0) + l.amount); g.n.set(q, (g.n.get(q) ?? 0) + 1); g.parties.add(v.party || l.ledger);
      credit.set(id, g);
    }
  }
  for (const [id, g] of credit) {
    const quarters: ClaimQuarter[] = [...g.q.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([q, amt]) => ({
      quarter: q, label: quarterLabel(q), deducted: r2(amt), received: 0, pending: r2(amt), certFrom: certFrom(q),
      state: today >= certFrom(q) ? 'ready' : 'wait', record: records[`${id}|${q}`] ?? null, bills: g.n.get(q) ?? 0,
    }));
    const total = r2(quarters.reduce((s, q) => s + q.deducted, 0));
    platforms.push({ id, name: g.name, kind: 'credit', why: 'Deducted from our payouts (section 194-O). Claim it in the income-tax return, not from the platform.', parties: [...g.parties], deducted: total, received: 0, pending: total, readyNow: r2(quarters.filter((q) => q.state === 'ready').reduce((s, q) => s + q.pending, 0)), quarters, bills: [] });
  }

  platforms.sort((a, b) => (a.kind === b.kind ? b.pending - a.pending : a.kind === 'reimburse' ? -1 : 1));
  const reimb = platforms.filter((p) => p.kind === 'reimburse');
  const older = input.ledgers.filter((l) => /tds/i.test(l.name) && /receivable/i.test(`${l.group} ${l.primary}`) && (isReimburseLedger(l.name) || /\b20\d\d-\d\d\b/.test(l.name)) && Math.abs(l.opening) >= 1)
    .map((l) => ({ ledger: l.name, opening: r2(l.opening) }));
  const notes: string[] = [];
  if (older.length) notes.push('The 1 April balances of the older TDS receivable ledgers are not split by party. Ask the CA which parties they belong to.');
  if (!bills.length) notes.push('No bill with TDS in the stored Day Books of this financial year.');
  return {
    fy: input.fy, asOf: today, platforms,
    totals: {
      pending: r2(reimb.reduce((s, p) => s + p.pending, 0)),
      readyNow: r2(reimb.reduce((s, p) => s + p.readyNow, 0)),
      claimed: r2(reimb.reduce((s, p) => s + p.quarters.filter((q) => q.state === 'claimed').reduce((a, q) => a + q.pending, 0), 0)),
      credit: r2(platforms.filter((p) => p.kind === 'credit').reduce((s, p) => s + p.pending, 0)),
    },
    older, notes,
  };
}

export function sanitizeClaim(body: unknown, by: string | null, at: string): ClaimRecord | null | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.status === null || b.status === 'clear') return null;
  if (b.status !== 'claimed' && b.status !== 'received') return { error: 'status must be claimed, received or clear' };
  const on = typeof b.on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.on) ? b.on : at.slice(0, 10);
  const amount = typeof b.amount === 'number' && Number.isFinite(b.amount) && b.amount >= 0 ? r2(b.amount) : null;
  return { status: b.status, on, ref: typeof b.ref === 'string' ? b.ref.trim().slice(0, 80) : '', amount, by, at };
}

export interface ClaimSettings { tan: string; metaAdAccount: string; googleCustomerId: string; porterAccount: string; contactName: string; contactPhone: string; contactEmail: string }
export const EMPTY_CLAIM_SETTINGS: ClaimSettings = { tan: '', metaAdAccount: '', googleCustomerId: '', porterAccount: '', contactName: '', contactPhone: '', contactEmail: '' };
export function sanitizeClaimSettings(body: unknown): ClaimSettings {
  const b = (body ?? {}) as Record<string, unknown>;
  const s = (k: keyof ClaimSettings, n: number) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, n) : '');
  return { tan: s('tan', 10).toUpperCase(), metaAdAccount: s('metaAdAccount', 30), googleCustomerId: s('googleCustomerId', 20), porterAccount: s('porterAccount', 40), contactName: s('contactName', 60), contactPhone: s('contactPhone', 20), contactEmail: s('contactEmail', 80) };
}
