// Pure: audit views over the STORED Tally Day Books + masters, for the books cleanup (Nov 2026):
// ledger statement (bank recon, party review), purchase / sales register with GST split and the purchase class
// (Raw material / Capital goods / Services, GST classification from 1 Nov 2026), and a TDS check per voucher.
// Routes: GET /api/tally/books/ledger-statement | register | tds-check | stock-items. Tests: server/test/tallyAudit.test.ts.
import type { TallyLedger, TallyMasters, TallyVoucher } from './books.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
const live = (v: TallyVoucher) => !v.cancelled && !v.optional;

// ---------------------------------------------------------------- ledger statement
export interface StatementRow { date: string; type: string; number: string; party: string; reference: string; narration: string; against: string; dr: number; cr: number; balance: number }
export interface Statement { ledger: string; group: string; opening: number; rows: StatementRow[]; totalDr: number; totalCr: number; closing: number; found: boolean }

/** Balances are Dr positive. `opening` = the ledger's 1 April opening when `from` is the FY's first month, else pass the carried balance. */
export function ledgerStatement(vouchers: TallyVoucher[], ledger: TallyLedger | undefined, name: string, opening = ledger?.opening ?? 0): Statement {
  const key = (ledger?.name ?? name).toLowerCase();
  let bal = opening, dr = 0, cr = 0;
  const rows: StatementRow[] = [];
  for (const v of [...vouchers].filter(live).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))) {
    const mine = v.lines.filter((l) => l.ledger.toLowerCase() === key);
    if (!mine.length) continue;
    const amt = mine.reduce((s, l) => s + l.amount, 0);
    const against = v.lines.filter((l) => l.ledger.toLowerCase() !== key).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).map((l) => l.ledger).slice(0, 3).join(', ');
    bal += amt;
    if (amt >= 0) dr += amt; else cr += -amt;
    rows.push({ date: v.date, type: v.type, number: v.number, party: v.party, reference: v.reference, narration: v.narration.slice(0, 160), against, dr: amt > 0 ? r2(amt) : 0, cr: amt < 0 ? r2(-amt) : 0, balance: r2(bal) });
  }
  return { ledger: ledger?.name ?? name, group: ledger?.group ?? '', opening: r2(opening), rows, totalDr: r2(dr), totalCr: r2(cr), closing: r2(bal), found: Boolean(ledger) || rows.length > 0 };
}

// ---------------------------------------------------------------- registers
export type PurchaseClass = 'Raw material' | 'Capital goods' | 'Services' | 'Mixed' | 'Unclear';
export interface RegisterRow {
  date: string; type: string; number: string; party: string; gstin: string; reference: string; referenceDate: string;
  taxable: number; igst: number; cgst: number; sgst: number; cess: number; tds: number; total: number;
  ledgers: string; items: number; class: PurchaseClass | ''; why: string;
}
export interface Register { kind: 'purchase' | 'sales'; rows: RegisterRow[]; totals: { taxable: number; igst: number; cgst: number; sgst: number; tds: number; total: number; vouchers: number }; byClass: { class: string; vouchers: number; taxable: number; gst: number }[] }

const isKind = (type: string, kind: 'purchase' | 'sales') => (kind === 'purchase' ? /purchase|debit note/i : /sales|credit note/i).test(type);
const TAX = (n: string) => /\b(igst|cgst|sgst|utgst|cess)\b/i.test(n);
const TDS_LINE = (n: string) => /\btds\b/i.test(n);

export function classify(v: TallyVoucher, byName: Map<string, TallyLedger>, partyName: string): { cls: PurchaseClass; why: string } {
  const other = v.lines.filter((l) => l.ledger !== partyName && !TAX(l.ledger) && !TDS_LINE(l.ledger) && !/round/i.test(l.ledger));
  const prim = (n: string) => (byName.get(n.toLowerCase())?.primary ?? '').toLowerCase();
  const grp = (n: string) => (byName.get(n.toLowerCase())?.group ?? '').toLowerCase();
  const fa = other.filter((l) => prim(l.ledger).includes('fixed asset') || grp(l.ledger).includes('fixed asset') || grp(l.ledger).includes('busy carryover'));
  const exp = other.filter((l) => /expense/.test(prim(l.ledger)) && !/purchase/.test(prim(l.ledger)));
  const pur = other.filter((l) => /purchase/.test(prim(l.ledger)) || /purchase/.test(grp(l.ledger)));
  const kinds = [fa.length && 'Capital goods', (pur.length || v.inventory.length) && 'Raw material', exp.length && 'Services'].filter(Boolean) as PurchaseClass[];
  if (kinds.length > 1) return { cls: 'Mixed', why: `lines in ${kinds.join(' + ')}` };
  if (kinds.length === 1) {
    const src = kinds[0] === 'Capital goods' ? fa : kinds[0] === 'Services' ? exp : pur;
    return { cls: kinds[0], why: src.length ? `ledger ${src[0].ledger} (${byName.get(src[0].ledger.toLowerCase())?.group ?? 'no group'})` : `${v.inventory.length} stock item line(s)` };
  }
  return { cls: 'Unclear', why: other.length ? `ledger ${other[0].ledger} is not under Purchase, Expenses or Fixed Assets` : 'no ledger besides party and tax' };
}

export function register(vouchers: TallyVoucher[], masters: TallyMasters | null, kind: 'purchase' | 'sales', cls?: string): Register {
  const byName = new Map((masters?.ledgers ?? []).map((l) => [l.name.toLowerCase(), l]));
  const rows: RegisterRow[] = [];
  for (const v of vouchers.filter(live).filter((x) => isKind(x.type, kind)).sort((a, b) => a.date.localeCompare(b.date))) {
    const party = v.party || '';
    const sum = (re: RegExp) => v.lines.filter((l) => re.test(l.ledger)).reduce((s, l) => s + Math.abs(l.amount), 0);
    const igst = sum(/\bigst\b/i), cgst = sum(/\bcgst\b/i), sgst = sum(/\b(sgst|utgst)\b/i), cess = sum(/\bcess\b/i), tds = sum(/\btds\b/i);
    const partyLine = v.lines.find((l) => l.ledger === party);
    const total = partyLine ? Math.abs(partyLine.amount) + tds : v.lines.filter((l) => (kind === 'purchase' ? l.amount > 0 : l.amount < 0)).reduce((s, l) => s + Math.abs(l.amount), 0);
    const taxable = Math.max(0, total - igst - cgst - sgst - cess);
    const c = kind === 'purchase' ? classify(v, byName, party) : { cls: '' as const, why: '' };
    rows.push({
      date: v.date, type: v.type, number: v.number, party, gstin: v.partyGstin || byName.get(party.toLowerCase())?.gstin || '', reference: v.reference, referenceDate: v.referenceDate,
      taxable: r2(taxable), igst: r2(igst), cgst: r2(cgst), sgst: r2(sgst), cess: r2(cess), tds: r2(tds), total: r2(total),
      ledgers: v.lines.filter((l) => l.ledger !== party && !TAX(l.ledger)).map((l) => l.ledger).slice(0, 4).join(', '), items: v.inventory.length, class: c.cls, why: c.why,
    });
  }
  const out = cls ? rows.filter((r) => r.class.toLowerCase() === cls.toLowerCase()) : rows;
  const byClass = new Map<string, { vouchers: number; taxable: number; gst: number }>();
  for (const r of out) { const b = byClass.get(r.class || 'all') ?? { vouchers: 0, taxable: 0, gst: 0 }; b.vouchers++; b.taxable += r.taxable; b.gst += r.igst + r.cgst + r.sgst; byClass.set(r.class || 'all', b); }
  const t = out.reduce((a, r) => ({ taxable: a.taxable + r.taxable, igst: a.igst + r.igst, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, tds: a.tds + r.tds, total: a.total + r.total }), { taxable: 0, igst: 0, cgst: 0, sgst: 0, tds: 0, total: 0 });
  return {
    kind, rows: out,
    totals: { taxable: r2(t.taxable), igst: r2(t.igst), cgst: r2(t.cgst), sgst: r2(t.sgst), tds: r2(t.tds), total: r2(t.total), vouchers: out.length },
    byClass: [...byClass.entries()].map(([k, b]) => ({ class: k, vouchers: b.vouchers, taxable: r2(b.taxable), gst: r2(b.gst) })).sort((a, b) => b.taxable - a.taxable),
  };
}

// ---------------------------------------------------------------- TDS check
export interface TdsRow { date: string; type: string; number: string; party: string; partyTds: string; expense: number; tdsBooked: number; ratePct: number | null; ledgers: string; flag: 'no TDS booked' | 'TDS booked' | 'party has no TDS nature' }
/**
 * Every live voucher that books an expense (or fixed asset) against a party: the party's TDS nature from its ledger master,
 * the expense, the TDS line on the voucher and the implied rate. It does not decide thresholds (194C 30k / 1L, 194J 30k …):
 * it lists, the reviewer judges. `minAmount` drops small bills (default 0).
 */
export function tdsCheck(vouchers: TallyVoucher[], masters: TallyMasters | null, minAmount = 0): { rows: TdsRow[]; summary: { vouchers: number; noTds: number; noTdsAmount: number; booked: number; tdsAmount: number } } {
  const byName = new Map((masters?.ledgers ?? []).map((l) => [l.name.toLowerCase(), l]));
  const rows: TdsRow[] = [];
  for (const v of vouchers.filter(live)) {
    if (!/purchase|journal|payment/i.test(v.type)) continue;
    const prim = (n: string) => (byName.get(n.toLowerCase())?.primary ?? '').toLowerCase();
    const exp = v.lines.filter((l) => l.amount > 0 && (/expense/.test(prim(l.ledger)) || /fixed asset/.test(prim(l.ledger))) && !TAX(l.ledger));
    if (!exp.length) continue;
    const party = v.party || v.lines.find((l) => l.amount < 0 && /creditor|liabilit/.test(prim(l.ledger)))?.ledger || '';
    if (!party) continue;
    const expense = exp.reduce((s, l) => s + l.amount, 0);
    if (expense < minAmount) continue;
    const tdsBooked = v.lines.filter((l) => TDS_LINE(l.ledger)).reduce((s, l) => s + Math.abs(l.amount), 0);
    const pt = byName.get(party.toLowerCase())?.tds ?? '';
    rows.push({ date: v.date, type: v.type, number: v.number, party, partyTds: pt, expense: r2(expense), tdsBooked: r2(tdsBooked), ratePct: expense ? r2((tdsBooked / expense) * 100) : null, ledgers: exp.map((l) => l.ledger).slice(0, 3).join(', '), flag: tdsBooked > 0 ? 'TDS booked' : pt ? 'no TDS booked' : 'party has no TDS nature' });
  }
  rows.sort((a, b) => (a.flag === 'TDS booked' ? 1 : 0) - (b.flag === 'TDS booked' ? 1 : 0) || b.expense - a.expense);
  const no = rows.filter((r) => r.flag !== 'TDS booked');
  return { rows, summary: { vouchers: rows.length, noTds: no.length, noTdsAmount: r2(no.reduce((s, r) => s + r.expense, 0)), booked: rows.length - no.length, tdsAmount: r2(rows.reduce((s, r) => s + r.tdsBooked, 0)) } };
}

/** YYYY-MM months from `from` to `to` inclusive (max 13). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 13) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
