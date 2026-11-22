// ----------------------------------------------------------------------------
// Supplier invoice register with a memory across months (TDS page → Invoices; founder 22 Nov 2026). READ ONLY.
// Source = the STORED Tally Day Books (connectors/tally/bookStore.ts). Pure: no store, no network; tests
// server/test/supplierInvoices.test.ts.
//
// invoiceRows  every live supplier bill of a month: Purchase / Purchase-Expense / Debit Note vouchers, plus Journal and
//              Payment vouchers that book an expense or fixed asset against a party, or credit a TDS ledger.
// mergeMemory  keeps each bill with firstSeen / lastSeen, a change log (amount, TDS, invoice no. … edited in Tally) and
//              'removed' when a fresh copy of the month no longer has it (deleted or cancelled in Tally). The memory
//              only moves forward from a COMPLETE stored month, so a half-read month never marks bills removed.
// ----------------------------------------------------------------------------

import type { TallyLedger, TallyVoucher } from '../connectors/tally/books.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const TAX = (n: string) => /\b(igst|cgst|sgst|utgst|cess)\b/i.test(n);
const TDS = (n: string) => /\btds\b|tax\s+deducted/i.test(n);
const ROUND = (n: string) => /round/i.test(n);

export interface SupplierInvoice {
  key: string;            // Tally GUID, else type|number|date
  month: string;          // YYYY-MM of the voucher date
  date: string;           // YYYY-MM-DD
  voucherType: string;
  voucherNo: string;
  supplier: string;
  pan: string;
  gstin: string;
  invoiceNo: string;      // supplier invoice no. (Tally reference)
  invoiceDate: string;
  ledgers: string;        // expense / purchase / asset ledgers, up to 4
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  tdsLedger: string;      // first TDS ledger on the voucher ('' = none)
  tds: number;
  total: number;          // bill value incl. GST, before TDS
  payable: number;        // total − TDS
  partyTds: string;       // TDS nature on the party master ('' = not set)
  narration: string;
}

export interface MemoryChange { at: string; field: string; from: string | number; to: string | number }
export interface MemoryRow extends SupplierInvoice { firstSeen: string; lastSeen: string; status: 'active' | 'removed'; removedAt?: string; changes: MemoryChange[] }
export interface InvoiceMemory { month: string; syncedAt: string | null; booksAsOf: string | null; rows: MemoryRow[] }

const live = (v: TallyVoucher) => !v.cancelled && !v.optional;
const SUPPLIER_TYPE = /purchase|debit note/i;
const OTHER_TYPE = /journal|payment/i;

/** Every supplier bill of the given vouchers (any months; each row carries its month). */
export function invoiceRows(vouchers: TallyVoucher[], ledgers: TallyLedger[]): SupplierInvoice[] {
  const byName = new Map(ledgers.map((l) => [l.name.toLowerCase(), l]));
  const prim = (n: string) => (byName.get(n.toLowerCase())?.primary ?? '').toLowerCase();
  const isCost = (n: string) => /expense|purchase|fixed asset/.test(prim(n));
  const out: SupplierInvoice[] = [];
  for (const v of vouchers.filter(live)) {
    const supplierType = SUPPLIER_TYPE.test(v.type) && !/sales|credit note/i.test(v.type);
    if (!supplierType && !OTHER_TYPE.test(v.type)) continue;
    const tdsLines = v.lines.filter((l) => TDS(l.ledger));
    const cost = v.lines.filter((l) => l.amount > 0 && !TAX(l.ledger) && !TDS(l.ledger) && !ROUND(l.ledger) && isCost(l.ledger));
    if (!supplierType && !cost.length && !tdsLines.some((l) => l.amount < 0)) continue;
    const party = v.party || v.lines.find((l) => l.amount < 0 && /creditor|liabilit/.test(prim(l.ledger)))?.ledger || '';
    if (!party) continue;
    if (!supplierType && /bank|cash/.test(prim(party))) continue; // a payment from the bank is not a bill
    const sum = (re: RegExp) => v.lines.filter((l) => re.test(l.ledger)).reduce((s, l) => s + Math.abs(l.amount), 0);
    const igst = sum(/\bigst\b/i), cgst = sum(/\bcgst\b/i), sgst = sum(/\b(sgst|utgst)\b/i), cess = sum(/\bcess\b/i);
    const tds = tdsLines.reduce((s, l) => s + Math.abs(l.amount), 0);
    const partyLine = v.lines.find((l) => l.ledger === party);
    const total = partyLine ? Math.abs(partyLine.amount) + tds : cost.reduce((s, l) => s + l.amount, 0) + igst + cgst + sgst + cess;
    const m = byName.get(party.toLowerCase());
    out.push({
      key: v.guid || `${v.type}|${v.number}|${v.date}`,
      month: v.date.slice(0, 7), date: v.date, voucherType: v.type, voucherNo: v.number,
      supplier: party, pan: (m?.pan ?? '').toUpperCase(), gstin: v.partyGstin || m?.gstin || '',
      invoiceNo: v.reference, invoiceDate: v.referenceDate,
      ledgers: (cost.length ? cost : v.lines.filter((l) => l.ledger !== party && !TAX(l.ledger) && !TDS(l.ledger) && !ROUND(l.ledger))).map((l) => l.ledger).slice(0, 4).join(', '),
      taxable: r2(Math.max(0, total - igst - cgst - sgst - cess)), igst: r2(igst), cgst: r2(cgst), sgst: r2(sgst), cess: r2(cess),
      tdsLedger: tdsLines[0]?.ledger ?? '', tds: r2(tds), total: r2(total), payable: r2(total - tds),
      partyTds: m?.tds ?? '', narration: v.narration.slice(0, 200),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.voucherNo.localeCompare(b.voucherNo, undefined, { numeric: true }));
}

/** Fields whose edit in Tally is logged. */
const TRACKED: (keyof SupplierInvoice)[] = ['date', 'voucherNo', 'supplier', 'invoiceNo', 'invoiceDate', 'taxable', 'igst', 'cgst', 'sgst', 'tdsLedger', 'tds', 'total'];
const MAX_CHANGES = 20;

/**
 * Moves a month's memory forward with a fresh, COMPLETE read of that month. New bills are added, edited bills keep
 * their history, bills missing from the fresh read are marked removed (kept, never deleted). Same input twice = same
 * memory (only lastSeen / syncedAt move).
 */
export function mergeMemory(prev: InvoiceMemory | null, month: string, fresh: SupplierInvoice[], at: string, booksAsOf: string | null): InvoiceMemory {
  const old = new Map((prev?.rows ?? []).map((r) => [r.key, r]));
  const seen = new Set<string>();
  const rows: MemoryRow[] = [];
  for (const f of fresh.filter((r) => r.month === month)) {
    seen.add(f.key);
    const o = old.get(f.key);
    if (!o) { rows.push({ ...f, firstSeen: at, lastSeen: at, status: 'active', changes: [] }); continue; }
    const changes = [...o.changes];
    for (const k of TRACKED) if (o[k] !== f[k]) changes.push({ at, field: k, from: o[k] as string | number, to: f[k] as string | number });
    if (o.status === 'removed') changes.push({ at, field: 'status', from: 'removed', to: 'active' });
    rows.push({ ...f, firstSeen: o.firstSeen, lastSeen: at, status: 'active', changes: changes.slice(-MAX_CHANGES) });
  }
  for (const o of old.values()) {
    if (seen.has(o.key)) continue;
    rows.push(o.status === 'removed' ? o : { ...o, status: 'removed', removedAt: at, changes: [...o.changes, { at, field: 'status', from: 'active', to: 'removed' }].slice(-MAX_CHANGES) });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.voucherNo.localeCompare(b.voucherNo, undefined, { numeric: true }));
  return { month, syncedAt: at, booksAsOf, rows };
}

/** True when the stored books copy is newer than what the memory last saw (so the memory must be moved forward). */
export const memoryStale = (mem: InvoiceMemory | null, booksAsOf: string | null) =>
  !!booksAsOf && (!mem?.booksAsOf || Date.parse(booksAsOf) > Date.parse(mem.booksAsOf));

/** Counts for a month's memory (page tiles + machine answers). */
export function memorySummary(mem: InvoiceMemory | null) {
  const rows = mem?.rows ?? [];
  const act = rows.filter((r) => r.status === 'active');
  return {
    bills: act.length,
    suppliers: new Set(act.map((r) => r.supplier)).size,
    taxable: r2(act.reduce((s, r) => s + r.taxable, 0)),
    tds: r2(act.reduce((s, r) => s + r.tds, 0)),
    withTds: act.filter((r) => r.tds > 0).length,
    edited: act.filter((r) => r.changes.some((c) => c.field !== 'status')).length,
    removed: rows.length - act.length,
  };
}

/** Same supplier + same supplier invoice no. booked more than once (live rows), e.g. a bill entered twice. */
export function duplicateBills(rows: SupplierInvoice[]): { supplier: string; invoiceNo: string; voucherNos: string[]; total: number }[] {
  const g = new Map<string, SupplierInvoice[]>();
  for (const r of rows) {
    if (!r.invoiceNo.trim() || /debit note/i.test(r.voucherType)) continue;
    const k = `${r.supplier.toLowerCase()}|${r.invoiceNo.trim().toLowerCase()}`;
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  return [...g.values()].filter((x) => x.length > 1).map((x) => ({ supplier: x[0].supplier, invoiceNo: x[0].invoiceNo, voucherNos: x.map((r) => `${r.voucherType} ${r.voucherNo}`), total: r2(x.reduce((s, r) => s + r.total, 0)) }));
}

// ---------------------------------------------------------------- schedule

export interface TdsSyncState {
  lastTryAt: string | null;
  lastOkAt: string | null;
  lastOkDay: string | null;   // IST day of the last good daily sync
  lastError: string | null;
  finalFor: Record<string, string>; // month → time of the month-end sync taken on or after the 5th of the next month
  lastRun?: { at: string; trigger: 'schedule' | 'button' | 'books'; months: string[]; bills: number; error: string | null };
}
export const EMPTY_SYNC: TdsSyncState = { lastTryAt: null, lastOkAt: null, lastOkDay: null, lastError: null, finalFor: {} };

const H = 3_600_000;
const ist = (now: number) => new Date(now + 5.5 * H);
export const istDay = (now: number) => ist(now).toISOString().slice(0, 10);
export function addMonth(p: string, n: number): string {
  const [y, m] = p.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export const RETRY_MS = 50 * 60_000;

/**
 * When the scheduled call should sync (the caller fires hourly, 06:37–22:37 IST). Tally answers only while TallyPrime is
 * open on the host machine, so every kind of sync keeps retrying until Tally answers:
 *  - Month end: from the 5th, until last month has a sync taken on/after the 5th → re-read last month in full.
 *  - Daily: once a day (bills booked that day); a day Tally stayed closed is caught up by the next good sync (syncMonths).
 *  - A failed try (Tally closed) waits 50 min, then tries again, on any day, until it works.
 */
export function syncDue(now: number, s: TdsSyncState): { due: boolean; monthEnd: boolean; why: string } {
  const d = ist(now);
  const hour = d.getUTCHours();
  if (hour < 6 || hour >= 23) return { due: false, monthEnd: false, why: 'Outside 06:00–23:00 IST.' };
  const since = s.lastTryAt ? now - Date.parse(s.lastTryAt) : Infinity;
  const tooSoon = since < RETRY_MS;
  const cur = d.toISOString().slice(0, 7);
  const last = addMonth(cur, -1);
  const fifth = Date.parse(`${cur}-05T00:00:00+05:30`);
  const monthEnd = d.getUTCDate() >= 5 && !(s.finalFor[last] && Date.parse(s.finalFor[last]) >= fifth);
  if (monthEnd) return tooSoon ? { due: false, monthEnd, why: 'Tried less than 50 min ago.' } : { due: true, monthEnd, why: `Month-end sync of ${last} (from the 5th).` };
  if (s.lastOkDay === istDay(now)) return { due: false, monthEnd: false, why: 'Already synced today.' };
  return tooSoon ? { due: false, monthEnd: false, why: 'Tried less than 50 min ago.' } : { due: true, monthEnd: false, why: 'Daily sync.' };
}

/**
 * Months a sync reads from Tally: month-end = last month first; daily = this month (+ last month up to the 8th).
 * Catch-up: every month since the last good sync is read too (Tally closed for days across a month end), oldest
 * first after the month-end month, at most 3 months back.
 */
export function syncMonths(now: number, monthEnd: boolean, lastOkAt: string | null = null): string[] {
  const d = ist(now);
  const cur = d.toISOString().slice(0, 7), last = addMonth(cur, -1);
  const base = monthEnd ? [last, cur] : d.getUTCDate() <= 8 ? [cur, last] : [cur];
  if (!lastOkAt) return base;
  const from = ist(Date.parse(lastOkAt)).toISOString().slice(0, 7);
  const gap: string[] = [];
  for (let p = from < addMonth(cur, -3) ? addMonth(cur, -3) : from; p < cur; p = addMonth(p, 1)) if (!base.includes(p)) gap.push(p);
  return monthEnd ? [base[0], ...gap, cur] : [...gap, ...base].sort((a, b) => (a === cur ? -1 : b === cur ? 1 : a.localeCompare(b)));
}

/** Tally offline = the newest try failed (no good sync since). The page shows the last synced data with its date. */
export const tallyOffline = (s: TdsSyncState) => !!s.lastTryAt && !!s.lastError && (!s.lastOkAt || Date.parse(s.lastTryAt) > Date.parse(s.lastOkAt));

/** What is still waiting for Tally (page line): the month-end sync of last month, and the daily sync. */
export function waitingFor(now: number, s: TdsSyncState): string[] {
  const d = ist(now);
  const cur = d.toISOString().slice(0, 7), last = addMonth(cur, -1);
  const fifth = Date.parse(`${cur}-05T00:00:00+05:30`);
  const out: string[] = [];
  if (d.getUTCDate() >= 5 && !(s.finalFor[last] && Date.parse(s.finalFor[last]) >= fifth)) out.push(`month-end sync of ${last}`);
  if (s.lastOkDay !== istDay(now)) out.push("today's sync");
  return out;
}
