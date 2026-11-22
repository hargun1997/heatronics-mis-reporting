// ----------------------------------------------------------------------------
// Book an invoice: the evidence for ONE question (pure; 23 Nov 2026).
//
// Before, the assistant saw only the expense map, the handbook, a client-side ledger list and an optional uploaded Day
// Book. It never saw the MIS's own stored Tally Day Books, so a photo of a Shiprocket bill could not find how Shiprocket
// was booked last month. Now, for each question:
//   1. the invoice is read first (vendor, GSTIN, amounts) when one is attached (bookingInvoice.ts),
//   2. the party ledger is found in the Tally masters: GSTIN first (exact), then the name,
//   3. that party's last vouchers come from the stored Day Books (12 months), plus vouchers whose narration / ledgers
//      match the question, and the party's total this FY (for the TDS limits),
//   4. after the answer, every ledger in its voucher tables is checked against the masters (`checkLedgers`).
// ----------------------------------------------------------------------------

import type { TallyLedger, TallyMasters, TallyVoucher } from '../connectors/tally/books.js';
import { findVouchers, voucherLine } from '../connectors/tally/books.js';

/** What the invoice reader found. Every field may be missing. */
export interface InvoiceFacts {
  docType?: string; // tax invoice, credit note, debit note, receipt, bill of supply, foreign invoice
  vendor?: string;
  vendorGstin?: string;
  vendorState?: string;
  buyerGstin?: string;
  invoiceNo?: string;
  invoiceDate?: string; // YYYY-MM-DD
  period?: string;
  placeOfSupply?: string;
  currency?: string;
  nature?: string; // one line: what was bought
  lines?: { description: string; hsn?: string; qty?: number | null; rate?: number | null; amount?: number | null; gstRate?: number | null }[];
  taxable?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  cess?: number | null;
  tcs?: number | null;
  roundOff?: number | null;
  total?: number | null;
  reverseCharge?: boolean | null;
  notes?: string; // anything unclear (blurred, cut off, handwritten)
}

export interface Evidence {
  party: { name: string; group: string; gstin: string; state: string; tds: string; how: 'gstin' | 'name' } | null;
  partyVouchers: TallyVoucher[];
  similar: TallyVoucher[];
  fy: { from: string; total: number; count: number } | null;
  tdsLedgersUsed: string[];
  periods: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/\b(pvt|private|ltd|limited|llp|inc|india|the|co|company|services?|technologies|technology|solutions?)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Party ledger for the invoice: GSTIN (exact) first, then the vendor name (all its words in the ledger name, or the reverse). */
export function findParty(masters: Pick<TallyMasters, 'ledgers'> | null, vendor?: string, gstin?: string): Evidence['party'] {
  const ledgers = masters?.ledgers ?? [];
  const g = (gstin ?? '').toUpperCase().replace(/\s/g, '');
  const pick = (l: TallyLedger, how: 'gstin' | 'name') => ({ name: l.name, group: l.group, gstin: l.gstin, state: l.state, tds: l.tds, how });
  if (g.length === 15) {
    const hit = ledgers.find((l) => l.gstin?.toUpperCase() === g);
    if (hit) return pick(hit, 'gstin');
  }
  const v = norm(vendor ?? '');
  if (v.length < 3) return null;
  const vw = v.split(' ').filter((w) => w.length >= 3);
  if (!vw.length) return null;
  const cands = ledgers.filter((l) => /creditor|debtor|supplier|vendor|party/i.test(`${l.group} ${l.primary}`) || l.gstin);
  let best: TallyLedger | null = null, score = 0;
  for (const l of cands) {
    const n = norm(l.name);
    if (!n) continue;
    const nw = n.split(' ');
    const hit = vw.filter((w) => nw.includes(w)).length;
    const s = hit === vw.length ? 2 + hit : n && v.includes(n) ? 1.5 : hit / vw.length >= 0.6 ? hit / vw.length : 0;
    if (s > score) { score = s; best = l; }
  }
  return best && score >= 0.6 ? pick(best, 'name') : null;
}

/** A party ledger named in a typed case ("we paid Xevo Solutions an advance"): its whole name (≥ 2 words or ≥ 6 letters) in the text. */
export function partyInText(masters: Pick<TallyMasters, 'ledgers'> | null, text: string): Evidence['party'] {
  const t = ` ${norm(text)} `;
  if (t.trim().length < 3) return null;
  let best: TallyLedger | null = null;
  let bestLen = 0;
  for (const l of masters?.ledgers ?? []) {
    if (!(/creditor|debtor|supplier|vendor|party/i.test(`${l.group} ${l.primary}`) || l.gstin)) continue;
    const n = norm(l.name);
    if (!n || (n.split(' ').length < 2 && n.length < 6)) continue;
    if (t.includes(` ${n} `) && n.length > bestLen) { best = l; bestLen = n.length; }
  }
  return best ? { name: best.name, group: best.group, gstin: best.gstin, state: best.state, tds: best.tds, how: 'name' } : null;
}

/** Indian FY start for a date (1 April). */
export function fyStart(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

export function buildEvidence(input: {
  vouchers: TallyVoucher[];
  masters: Pick<TallyMasters, 'ledgers'> | null;
  periods: string[];
  question: string;
  invoice?: InvoiceFacts | null;
  today: string;
}): Evidence {
  const live = input.vouchers.filter((v) => !v.cancelled && !v.optional);
  const inv = input.invoice ?? null;
  const party = inv?.vendor || inv?.vendorGstin
    ? findParty(input.masters, inv.vendor, inv.vendorGstin)
    : partyInText(input.masters, input.question);
  const g = (inv?.vendorGstin ?? '').toUpperCase();
  const byParty = live.filter((v) => (party && (v.party === party.name || v.lines.some((l) => l.ledger === party.name))) || (g.length === 15 && v.partyGstin?.toUpperCase() === g));
  byParty.sort((a, b) => b.date.localeCompare(a.date));
  const partyVouchers = byParty.slice(0, 15);
  const seen = new Set(partyVouchers.map((v) => v.guid || `${v.date}|${v.number}`));
  const words = [input.question, inv?.vendor, inv?.nature, ...(inv?.lines ?? []).slice(0, 5).map((l) => l.description)].filter(Boolean).join(' ');
  const similar = findVouchers(live, words, 60).filter((v) => !seen.has(v.guid || `${v.date}|${v.number}`)).slice(0, 25);

  let fy: Evidence['fy'] = null;
  if (party) {
    const from = fyStart(inv?.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.invoiceDate) ? inv.invoiceDate : input.today);
    const inFy = byParty.filter((v) => v.date >= from && !/payment|receipt|contra/i.test(v.type));
    // The party's credit (what we owe for the bills) = sum of its negative lines.
    const total = inFy.reduce((a, v) => a + v.lines.filter((l) => l.ledger === party.name && l.amount < 0).reduce((s, l) => s - l.amount, 0), 0);
    fy = { from, total: Math.round(total * 100) / 100, count: inFy.length };
  }
  const tdsLedgersUsed = [...new Set(byParty.flatMap((v) => v.lines.map((l) => l.ledger)).filter((n) => /\btds\b/i.test(n)))];
  return { party, partyVouchers, similar, fy, tdsLedgersUsed, periods: input.periods };
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The evidence as text for the question's turn (not the cached system prompt: it changes every question). */
export function evidenceText(e: Evidence, inv: InvoiceFacts | null | undefined): string {
  const out: string[] = [];
  if (inv) out.push(`=== INVOICE READ FROM THE ATTACHMENT (check it against the image) ===\n${JSON.stringify(inv, null, 1)}`);
  out.push(`=== EVIDENCE FROM THE STORED TALLY BOOKS (Day Books ${e.periods.length ? `${e.periods[0]} to ${e.periods[e.periods.length - 1]}` : 'none stored'}) ===`);
  if (e.party) {
    out.push(`Party ledger in Tally: "${e.party.name}" (group ${e.party.group}${e.party.gstin ? `, GSTIN ${e.party.gstin}` : ''}${e.party.state ? `, ${e.party.state}` : ''}${e.party.tds ? `, TDS ${e.party.tds}` : ''}) — matched by ${e.party.how === 'gstin' ? 'GSTIN (exact)' : 'name (check it)'}.`);
    if (e.fy) out.push(`This party this FY (from ${e.fy.from}): ${e.fy.count} bills, ${inr(e.fy.total)} credited. Use it for the TDS limits (194C ₹30,000 one bill / ₹1,00,000 a year; 194J ₹50,000 a year from FY 2025-26; check the section).`);
    if (e.tdsLedgersUsed.length) out.push(`TDS ledgers used for this party before: ${e.tdsLedgersUsed.join(', ')}.`);
    out.push(`Last ${e.partyVouchers.length} vouchers of this party (newest first; mirror them unless the map or handbook says otherwise):`);
    out.push(e.partyVouchers.map(voucherLine).join('\n') || 'None stored.');
  } else if (inv?.vendor || inv?.vendorGstin) {
    out.push('Party ledger in Tally: NOT FOUND (no ledger with this GSTIN or name). A new party ledger is needed: propose it (name, Under, GSTIN, state, registration type).');
  } else {
    out.push('No party ledger named in the question. If the case needs a party, ask for it or use a party from the TALLY MASTER list.');
  }
  out.push(`Similar vouchers (narration / ledgers match the question; ${e.similar.length}):`);
  out.push(e.similar.map(voucherLine).join('\n') || 'None.');
  return out.join('\n');
}

/** Short summary for the page (what the answer was based on). */
export function evidenceSummary(e: Evidence) {
  return {
    party: e.party ? { name: e.party.name, how: e.party.how, gstin: e.party.gstin } : null,
    partyVouchers: e.partyVouchers.slice(0, 8).map((v) => ({ date: v.date, type: v.type, number: v.number, line: voucherLine(v) })),
    similar: e.similar.length,
    fy: e.fy,
    periods: e.periods.length ? [e.periods[0], e.periods[e.periods.length - 1]] : [],
  };
}

/**
 * Ledger names in the answer's voucher tables that are not in the Tally masters. A row whose ledger cell says "new" /
 * "create" / "not in Tally" is a proposal, not an error. Table rows look like `| Dr | Ledger | 1,000.00 | note |`.
 */
export function checkLedgers(reply: string, masters: Pick<TallyMasters, 'ledgers'> | null): { missing: string[]; checked: number } {
  const names = new Set((masters?.ledgers ?? []).map((l) => l.name.toLowerCase().replace(/\s+/g, ' ').trim()));
  if (!names.size) return { missing: [], checked: 0 };
  const missing = new Set<string>();
  let checked = 0;
  for (const line of reply.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const side = cells[1]?.replace(/\*/g, '').toLowerCase();
    if (side !== 'dr' && side !== 'cr') continue;
    const raw = cells[2] ?? '';
    // A proposed ledger says so in its own cell or in the note: "(new)", "create", "not in Tally".
    if (/\b(new|create|not in tally)\b/i.test(`${raw} ${cells[cells.length - 2] ?? ''}`)) continue;
    const name = raw.replace(/[*_`]/g, '').replace(/\s*\((?:in tally|existing)\)\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (!name || name === '—' || name === '-') continue;
    checked++;
    if (!names.has(name.toLowerCase())) missing.add(name);
  }
  return { missing: [...missing].slice(0, 12), checked };
}
