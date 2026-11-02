// ----------------------------------------------------------------------------
// Tally books — the full read the MIS keeps of Tally (READ ONLY, exports only):
//   • Day Book (every voucher of a month, exploded: ledger lines, inventory lines, party, reference, narration)
//   • Masters: ledgers (group, GSTIN, registration type, state, TDS), groups (parent chain), stock items (HSN)
// Stored by connectors/tally/snapshots.ts whenever Tally is open; read by the Tally health page, "Ask about
// Tally" and the Invoice Booker (how a vendor was booked before). Pure: envelopes + parsers; tests in
// server/test/tallyBooks.test.ts.
//
// Requests are Tally's own reports via "Export Data" (Day Book, List of Accounts) — the same kind of request as
// the P&L, so assertTallyReadOnly passes them and still blocks anything that imports.
// Answer shape: TallyPrime's standard XML export (TALLYMESSAGE › VOUCHER / LEDGER / GROUP / STOCKITEM).
// UNVERIFIED against Heatronics' live Tally until the first pull: the parsers are tolerant (several tag names per
// field, nested *.LIST blocks stripped before reading a field) and a raw sample is stored (tally/raw-books) so the
// shape can be checked.
// ----------------------------------------------------------------------------

import { decode, escapeXml, tallyDates } from '../sources/tally.js';

// ---------------------------------------------------------------- types

export interface VoucherLine { ledger: string; /** Dr positive, Cr negative (₹). */ amount: number }
export interface InventoryLine { item: string; qty: number | null; rate: string | null; amount: number }
export interface TallyVoucher {
  guid: string;
  date: string; // YYYY-MM-DD
  type: string; // voucher type name (Purchase-Expense, Payment, Journal …)
  number: string;
  party: string;
  reference: string; // supplier invoice no.
  referenceDate: string;
  narration: string;
  partyGstin: string;
  cancelled: boolean;
  optional: boolean;
  lines: VoucherLine[];
  inventory: InventoryLine[];
}
export interface TallyLedger {
  name: string;
  group: string;
  primary: string; // top group (Sundry Creditors, Duties & Taxes, Indirect Expenses …)
  gstin: string;
  registration: string; // Regular / Composition / Unregistered / Consumer …
  state: string;
  pan: string;
  opening: number; // Dr positive
  billWise: boolean;
  tds: string; // TDS deductee type / nature, when set
  gstApplicable: string;
  taxType: string; // for Duties & Taxes ledgers: GST / TDS / Others
  dutyHead: string; // IGST / CGST / SGST …
}
export interface TallyGroup { name: string; parent: string; primary: string }
export interface TallyStockItem { name: string; group: string; unit: string; hsn: string; gstRate: string }
export interface TallyMasters { ledgers: TallyLedger[]; groups: TallyGroup[]; stockItems: TallyStockItem[]; warnings: string[] }

// ---------------------------------------------------------------- envelopes (Export only)

const companyVar = (company?: string) => ((company || '').trim() ? `<SVCURRENTCOMPANY>${escapeXml(company!.trim())}</SVCURRENTCOMPANY>` : '');

/** Day Book for [from, to] (YYYYMMDD), exploded so every voucher carries its ledger and inventory lines. */
export function dayBookEnvelope(from: string, to: string, company?: string): string {
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>Day Book</REPORTNAME>
    <STATICVARIABLES>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      <SVFROMDATE>${from}</SVFROMDATE>
      <SVTODATE>${to}</SVTODATE>
      <EXPLODEFLAG>Yes</EXPLODEFLAG>
      ${companyVar(company)}
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}
export const dayBookMonthEnvelope = (period: string, company?: string) => {
  const { from, to } = tallyDates(period);
  return dayBookEnvelope(from, to, company);
};

/** Masters: "List of Accounts" with ACCOUNTTYPE = Ledgers / Groups / Stock Items. */
export function mastersEnvelope(kind: 'Ledgers' | 'Groups' | 'Stock Items', company?: string): string {
  return `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>List of Accounts</REPORTNAME>
    <STATICVARIABLES>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      <ACCOUNTTYPE>${kind}</ACCOUNTTYPE>
      ${companyVar(company)}
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}

// ---------------------------------------------------------------- tolerant XML helpers

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every <TAG …>inner</TAG> (the tag must not nest inside itself — true for the Tally objects read here). */
export function blocks(xml: string, tag: string): { attrs: string; inner: string }[] {
  const re = new RegExp(`<${esc(tag)}(\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, 'g');
  const out: { attrs: string; inner: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ attrs: m[1] || '', inner: m[2] });
  return out;
}
export function attr(attrs: string, name: string): string {
  const m = new RegExp(`\\b${esc(name)}="([^"]*)"`, 'i').exec(attrs);
  return m ? decode(m[1]) : '';
}
/** Removes every nested *.LIST block (innermost first), so a field read sees only this object's own tags. */
export function stripLists(inner: string): string {
  let s = inner;
  for (let i = 0; i < 12; i++) {
    const next = s.replace(/<([A-Z0-9_]+(?:\.[A-Z0-9_]+)*\.LIST)\b[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>/g, '');
    if (next === s) break;
    s = next;
  }
  return s;
}
/** First <TAG>value</TAG> among the tags given (empty / self-closed → ''). */
export function field(inner: string, ...tags: string[]): string {
  for (const t of tags) {
    const m = new RegExp(`<${esc(t)}(?:\\s[^>]*)?>([^<]*)</${esc(t)}>`).exec(inner);
    if (m && m[1].trim()) return decode(m[1]);
  }
  return '';
}
const yes = (v: string) => /^yes$/i.test(v.trim());
/** Tally number: "-1,234.50", "1234.50 Dr", "(12)" → signed; Cr / brackets negative. */
export function tnum(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  let sign = 1;
  if (/^\(.*\)$/.test(s) || /\bcr\b/i.test(s)) sign = -1;
  s = s.replace(/[(),₹\s]/g, '').replace(/(dr|cr)$/i, '');
  const first = /-?\d+(\.\d+)?/.exec(s); // "450.00/nos" → 450
  const n = first ? parseFloat(first[0]) : NaN;
  return Number.isFinite(n) ? sign * n : 0;
}
const ymd = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);

// ---------------------------------------------------------------- vouchers

function ledgerLine(inner: string): VoucherLine | null {
  const own = stripLists(inner);
  const ledger = field(own, 'LEDGERNAME');
  if (!ledger) return null;
  const raw = tnum(field(own, 'AMOUNT'));
  const deemed = field(own, 'ISDEEMEDPOSITIVE');
  // Tally exports debits as negative amounts with ISDEEMEDPOSITIVE = Yes.
  const amount = deemed ? (yes(deemed) ? Math.abs(raw) : -Math.abs(raw)) : -raw;
  return { ledger, amount: Math.round(amount * 100) / 100 };
}

export function parseDayBook(xml: string): TallyVoucher[] {
  const out: TallyVoucher[] = [];
  for (const v of blocks(xml, 'VOUCHER')) {
    const own = stripLists(v.inner);
    const lines: VoucherLine[] = [];
    for (const tag of ['ALLLEDGERENTRIES.LIST', 'LEDGERENTRIES.LIST']) for (const b of blocks(v.inner, tag)) { const l = ledgerLine(b.inner); if (l) lines.push(l); }
    const inventory: InventoryLine[] = [];
    for (const tag of ['ALLINVENTORYENTRIES.LIST', 'INVENTORYENTRIES.LIST']) {
      for (const b of blocks(v.inner, tag)) {
        const io = stripLists(b.inner);
        const item = field(io, 'STOCKITEMNAME');
        if (!item) continue;
        const qtyRaw = field(io, 'BILLEDQTY', 'ACTUALQTY');
        inventory.push({ item, qty: qtyRaw ? Math.abs(tnum(qtyRaw)) : null, rate: field(io, 'RATE') || null, amount: Math.abs(tnum(field(io, 'AMOUNT'))) });
        // Invoice-mode vouchers carry the purchase / sales ledger inside the inventory line.
        for (const a of blocks(b.inner, 'ACCOUNTINGALLOCATIONS.LIST')) { const l = ledgerLine(a.inner); if (l) lines.push(l); }
      }
    }
    out.push({
      guid: field(own, 'GUID') || attr(v.attrs, 'REMOTEID'),
      date: ymd(field(own, 'DATE')),
      type: field(own, 'VOUCHERTYPENAME') || attr(v.attrs, 'VCHTYPE'),
      number: field(own, 'VOUCHERNUMBER'),
      party: field(own, 'PARTYLEDGERNAME', 'PARTYNAME'),
      reference: field(own, 'REFERENCE', 'SUPPLIERINVOICENO'),
      referenceDate: ymd(field(own, 'REFERENCEDATE')),
      narration: field(own, 'NARRATION').slice(0, 300),
      partyGstin: field(own, 'PARTYGSTIN', 'GSTIN').toUpperCase(),
      cancelled: yes(field(own, 'ISCANCELLED')),
      optional: yes(field(own, 'ISOPTIONAL')),
      lines,
      inventory,
    });
  }
  return out;
}

// ---------------------------------------------------------------- masters

function nameOf(b: { attrs: string; inner: string }): string {
  return attr(b.attrs, 'NAME') || (blocks(b.inner, 'NAME.LIST')[0] ? field(blocks(b.inner, 'NAME.LIST')[0].inner, 'NAME') : '');
}

export function parseGroups(xml: string): TallyGroup[] {
  const raw = blocks(xml, 'GROUP').map((b) => ({ name: nameOf(b), parent: field(stripLists(b.inner), 'PARENT') })).filter((g) => g.name);
  const parentOf = new Map(raw.map((g) => [g.name, g.parent]));
  const primary = (n: string) => {
    let cur = n;
    for (let i = 0; i < 20; i++) { const p = parentOf.get(cur); if (!p) return cur; cur = p; }
    return cur;
  };
  return raw.map((g) => ({ ...g, primary: primary(g.name) }));
}

export function parseLedgers(xml: string, groups: TallyGroup[] = []): TallyLedger[] {
  const prim = new Map(groups.map((g) => [g.name, g.primary]));
  return blocks(xml, 'LEDGER').map((b) => {
    const own = stripLists(b.inner);
    const all = b.inner; // GST / mailing details sit in nested lists on TallyPrime 3+
    const group = field(own, 'PARENT');
    return {
      name: nameOf(b),
      group,
      primary: prim.get(group) || group,
      gstin: (field(own, 'PARTYGSTIN') || field(all, 'GSTIN', 'PARTYGSTIN')).toUpperCase(),
      registration: field(own, 'GSTREGISTRATIONTYPE') || field(all, 'GSTREGISTRATIONTYPE'),
      state: field(own, 'LEDSTATENAME', 'STATENAME') || field(all, 'STATE', 'LEDSTATENAME', 'STATENAME'),
      pan: (field(own, 'INCOMETAXNUMBER') || field(all, 'INCOMETAXNUMBER', 'PANNUMBER')).toUpperCase(),
      opening: -tnum(field(own, 'OPENINGBALANCE')), // Tally: debit balances negative
      billWise: yes(field(own, 'ISBILLWISEON')),
      tds: field(own, 'TDSDEDUCTEETYPE') || field(all, 'TDSDEDUCTEETYPE', 'NATUREOFPAYMENT') || (yes(field(own, 'ISTDSAPPLICABLE', 'TDSAPPLICABLE')) ? 'Yes' : ''),
      gstApplicable: field(own, 'GSTAPPLICABLE'),
      taxType: field(own, 'TAXTYPE'),
      dutyHead: field(own, 'GSTDUTYHEAD'),
    };
  }).filter((l) => l.name);
}

export function parseStockItems(xml: string): TallyStockItem[] {
  return blocks(xml, 'STOCKITEM').map((b) => {
    const own = stripLists(b.inner);
    const gst = blocks(b.inner, 'GSTDETAILS.LIST');
    const lastGst = gst.length ? gst[gst.length - 1].inner : '';
    return {
      name: nameOf(b),
      group: field(own, 'PARENT'),
      unit: field(own, 'BASEUNITS'),
      hsn: field(lastGst, 'HSNCODE') || field(b.inner, 'HSNCODE', 'HSN'),
      gstRate: field(lastGst, 'GSTRATE') || field(b.inner, 'GSTRATE', 'RATE'),
    };
  }).filter((s) => s.name);
}

// ---------------------------------------------------------------- health

export type Severity = 'error' | 'warn' | 'info';
export interface HealthSample { date?: string; type?: string; number?: string; party?: string; ledger?: string; amount?: number; detail: string }
export interface HealthIssue {
  id: string;
  severity: Severity;
  title: string;
  /** Why it matters. */
  why: string;
  /** How to fix it in Tally (menu path / steps). */
  fix: string;
  count: number;
  samples: HealthSample[];
}
export interface HealthReport { periods: string[]; vouchers: number; ledgers: number; issues: HealthIssue[] }

/** GSTIN: 2-digit state, 10-char PAN, entity, Z, check char — with the official mod-36 check digit. */
export function gstinValid(g: string): boolean {
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  const cs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = cs.indexOf(g[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return cs[(36 - (sum % 36)) % 36] === g[14];
}

const PARTY_GROUPS = /sundry (creditors|debtors)/i;
const normName = (s: string) => s.toLowerCase()
  .replace(/\b(private|pvt|limited|ltd|llp|india|the|co|company|a\/c|ac)\b\.?/g, '')
  .replace(/[^a-z0-9]+/g, '');
const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const MAX_SAMPLES = 25;

/**
 * Checks over the stored books (pure). Each rule: what is wrong, why it matters, how to fix it in TallyPrime.
 * Heatronics rules baked in: no RCM bookings (Hargun), platform fee vouchers are Purchase-Expense with GST input.
 */
export function tallyHealth(vouchers: TallyVoucher[], masters: TallyMasters | null, periods: string[], today = new Date().toISOString().slice(0, 10)): HealthReport {
  const issues: HealthIssue[] = [];
  const ledgers = masters?.ledgers ?? [];
  const byName = new Map(ledgers.map((l) => [l.name, l]));
  const live = vouchers.filter((v) => !v.cancelled && !v.optional);
  const add = (i: Omit<HealthIssue, 'count' | 'samples'>, samples: HealthSample[]) => {
    if (samples.length) issues.push({ ...i, count: samples.length, samples: samples.slice(0, MAX_SAMPLES) });
  };
  const vs = (v: TallyVoucher, detail: string, amount?: number): HealthSample => ({ date: v.date, type: v.type, number: v.number, party: v.party, amount, detail });
  const total = (v: TallyVoucher) => v.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);

  // 1. Unbalanced vouchers
  add({ id: 'unbalanced', severity: 'error', title: 'Vouchers where debits ≠ credits',
    why: 'An unbalanced voucher means a ledger line is missing or an amount was typed wrong; the trial balance and P&L are off by the difference.',
    fix: 'Alt+G (Go To) › Day Book › F2 to the voucher date › select the voucher and press Enter to alter › correct the amounts so Dr = Cr › Ctrl+A to save. If it came from an import (Shopify / Easebuzz plugin), fix the source and re-import.' },
  live.filter((v) => v.lines.length && Math.abs(v.lines.reduce((a, l) => a + l.amount, 0)) > 1)
    .map((v) => vs(v, `Off by ${money(v.lines.reduce((a, l) => a + l.amount, 0))}`, total(v))));

  // 2. Future-dated / outside the pulled months
  add({ id: 'future', severity: 'warn', title: 'Vouchers dated in the future',
    why: 'A future date pushes the entry into a month that is not closed yet, so this month is understated.',
    fix: 'Alt+G › Day Book › F2 to that date › open the voucher (Enter) › F2 inside the voucher to change its date to the real document date › Ctrl+A.' },
  live.filter((v) => v.date > today).map((v) => vs(v, `Dated ${v.date}`, total(v))));

  // 3. RCM lines — Heatronics does not book RCM
  add({ id: 'rcm', severity: 'warn', title: 'Reverse-charge (RCM) entries',
    why: 'Heatronics does not book RCM currently (Hargun). An RCM line creates a GST liability and input that will not match the returns.',
    fix: 'Check with Hargun before changing. If it should not be RCM: open the voucher, remove the RCM / reverse-charge ledger lines (or set "Is reverse charge applicable" = No in the GST details), Ctrl+A.' },
  live.flatMap((v) => v.lines.filter((l) => /\brcm\b|reverse\s*charge/i.test(l.ledger)).map((l) => ({ ...vs(v, `Ledger ${l.ledger}`, Math.abs(l.amount)), ledger: l.ledger }))));

  // 4. Purchases from a GST-registered party with no GST input line
  const isPurchase = (v: TallyVoucher) => /purchase/i.test(v.type) && !/order|debit\s*note/i.test(v.type);
  const hasInput = (v: TallyVoucher) => v.lines.some((l) => /input|itc|[cis]gst|igst/i.test(l.ledger) && l.amount > 0);
  add({ id: 'no-itc', severity: 'warn', title: 'Purchases from a GST-registered party without GST input',
    why: 'If the bill carries GST and no input ledger is debited, the input tax credit is lost (or the expense is overstated by the GST).',
    fix: 'Open the voucher › add the GST input ledger(s) (e.g. IGST Input - 18%, or CGST + SGST Input for the same state) for the tax on the bill, reduce the expense line by the same amount, Ctrl+A. If the bill truly has no GST (exempt / nil-rated), ignore.' },
  live.filter((v) => isPurchase(v) && !hasInput(v)).filter((v) => {
    const g = v.partyGstin || byName.get(v.party)?.gstin || '';
    return g && !/composition/i.test(byName.get(v.party)?.registration || '');
  }).map((v) => vs(v, `Party GSTIN ${v.partyGstin || byName.get(v.party)?.gstin}`, total(v))));

  // 5. Purchases with no supplier invoice number
  add({ id: 'no-ref', severity: 'warn', title: 'Purchases without the supplier invoice number',
    why: 'GSTR-2B matching and duplicate checks need the supplier invoice number and date on every purchase.',
    fix: 'Open the voucher › fill "Supplier Invoice No." and "Date" (from the bill) › Ctrl+A. Turn it on for the voucher type if the field is hidden: F12 / voucher configuration › "Provide supplier invoice details".' },
  live.filter((v) => isPurchase(v) && !v.reference.trim()).map((v) => vs(v, 'No supplier invoice no.', total(v))));

  // 6. Same supplier invoice booked twice
  const seen = new Map<string, TallyVoucher>();
  const dups: HealthSample[] = [];
  for (const v of live.filter(isPurchase)) {
    if (!v.reference.trim() || !v.party) continue;
    const k = `${v.party.toLowerCase()}|${v.reference.trim().toLowerCase()}`;
    const first = seen.get(k);
    if (first) dups.push(vs(v, `Same supplier invoice "${v.reference}" as ${first.type} ${first.number} on ${first.date}`, total(v)));
    else seen.set(k, v);
  }
  add({ id: 'dup-invoice', severity: 'error', title: 'The same supplier invoice booked twice',
    why: 'A bill booked twice doubles the expense and the GST input claimed.',
    fix: 'Open both vouchers from the Day Book; keep the right one. Delete the duplicate only after checking with Hargun (Alt+D) — or mark it Optional/Cancel (Alt+X) so the audit trail stays.' }, dups);

  // 7. Cash payments above ₹10,000 (Income-tax s.40A(3))
  add({ id: 'cash-10k', severity: 'warn', title: 'Cash payments above ₹10,000 in a day',
    why: 'Expenses paid in cash above ₹10,000 to one person in a day are disallowed for income tax (s.40A(3)).',
    fix: 'Pay such bills by bank. If it was actually a bank payment, open the voucher and change the Cr line from Cash to the bank ledger, Ctrl+A.' },
  live.filter((v) => /payment/i.test(v.type)).flatMap((v) => v.lines.filter((l) => /^cash\b|cash[- ]in[- ]hand|petty cash/i.test(l.ledger) && -l.amount > 10_000).map((l) => vs(v, `Cash ${money(-l.amount)}`, -l.amount))));

  // 8. Suspense
  add({ id: 'suspense', severity: 'warn', title: 'Entries posted to Suspense',
    why: 'Suspense is a parking place; anything left there at month end is unexplained in the P&L / balance sheet.',
    fix: 'Find out what the entry is (bank statement, invoice) and alter the voucher to the right ledger. Alt+G › Ledger Vouchers › Suspense lists them all.' },
  live.flatMap((v) => v.lines.filter((l) => /suspense/i.test(l.ledger) || /suspense/i.test(byName.get(l.ledger)?.group || '')).map((l) => ({ ...vs(v, `${l.ledger} ${money(Math.abs(l.amount))}`, Math.abs(l.amount)), ledger: l.ledger }))));

  // 9. Ledgers used in vouchers that are not in the master (renamed / deleted)
  if (ledgers.length) {
    const missing = new Map<string, TallyVoucher>();
    for (const v of live) for (const l of v.lines) if (!byName.has(l.ledger) && !missing.has(l.ledger)) missing.set(l.ledger, v);
    add({ id: 'unknown-ledger', severity: 'info', title: 'Ledgers in vouchers that are not in the ledger list',
      why: 'Usually a ledger renamed after the pull, or masters pulled from a different company.',
      fix: 'Pull Tally again (masters + Day Book together). If it persists, look the name up in Gateway › Chart of Accounts › Ledgers.' },
    [...missing].map(([ledger, v]) => ({ ...vs(v, `Ledger "${ledger}"`), ledger })));
  }

  // 10. Party ledgers: invalid GSTIN / no GSTIN for a Regular registration / no state
  // A party = any ledger under Sundry Creditors / Debtors, however deep (sub-groups like "Logistics Vendors").
  const parentOf = new Map((masters?.groups ?? []).map((g) => [g.name, g.parent]));
  const underParty = (group: string) => { let g = group; for (let i = 0; i < 20 && g; i++) { if (PARTY_GROUPS.test(g)) return true; g = parentOf.get(g) || ''; } return false; };
  const parties = ledgers.filter((l) => underParty(l.group));
  add({ id: 'bad-gstin', severity: 'error', title: 'Party ledgers with an invalid GSTIN',
    why: 'A wrong GSTIN puts the purchase / sale on the wrong party in GSTR-1 / 2B, and the input credit will not match.',
    fix: 'Gateway › Alter › Ledger › the party › GST registration details › correct the GSTIN/UIN (15 characters, check digit must match) › Ctrl+A.' },
  parties.filter((l) => l.gstin && !gstinValid(l.gstin)).map((l) => ({ ledger: l.name, detail: `GSTIN "${l.gstin}" (${l.group})` })));
  add({ id: 'regular-no-gstin', severity: 'warn', title: 'Parties marked "Regular" with no GSTIN',
    why: 'A Regular-registered party needs its GSTIN for the returns and for GST input on its bills.',
    fix: 'Alter the ledger › GST registration details › enter the GSTIN (from the bill) or change the registration type to Unregistered if they are not registered.' },
  parties.filter((l) => /regular/i.test(l.registration) && !l.gstin).map((l) => ({ ledger: l.name, detail: l.group })));
  add({ id: 'gstin-state', severity: 'warn', title: 'GSTIN state code ≠ ledger state',
    why: 'Tally picks IGST vs CGST+SGST from the party state; a mismatch with the GSTIN state books the wrong tax type.',
    fix: 'Alter the ledger › set State to the state of the GSTIN (first 2 digits) › Ctrl+A. Then re-check vouchers booked with the wrong tax type.' },
  parties.filter((l) => l.gstin && gstinValid(l.gstin) && l.state && STATE_CODE[l.state.toLowerCase()] && STATE_CODE[l.state.toLowerCase()] !== l.gstin.slice(0, 2))
    .map((l) => ({ ledger: l.name, detail: `GSTIN ${l.gstin} is state ${l.gstin.slice(0, 2)}, ledger says ${l.state}` })));

  // 11. Duplicate party ledgers (same GSTIN or same name once "Pvt Ltd" etc. is ignored)
  const dupLed: HealthSample[] = [];
  const byG = new Map<string, string>(); const byN = new Map<string, string>();
  for (const l of parties) {
    if (l.gstin) { const o = byG.get(l.gstin); if (o) dupLed.push({ ledger: l.name, detail: `Same GSTIN ${l.gstin} as "${o}"` }); else byG.set(l.gstin, l.name); }
    const n = normName(l.name);
    if (n.length >= 4) { const o = byN.get(n); if (o && !(l.gstin && byG.get(l.gstin) === o)) dupLed.push({ ledger: l.name, detail: `Looks like "${o}"` }); else if (!o) byN.set(n, l.name); }
  }
  add({ id: 'dup-ledger', severity: 'warn', title: 'Possible duplicate party ledgers',
    why: 'Two ledgers for one vendor split their balance and bills, so payables and TDS per party are wrong. (Several GSTINs of one company — e.g. Blinkit per state — are fine.)',
    fix: 'Ask Hargun first. Pick the ledger to keep; open the spare one in Alt+G › Ledger Vouchers, alter each voucher to the kept ledger, then delete the spare ledger (Gateway › Alter › Ledger › Alt+D) once it has no entries.' }, dupLed);

  // 12. GST / TDS ledgers outside Duties & Taxes
  add({ id: 'tax-group', severity: 'warn', title: 'GST / TDS ledgers not under Duties & Taxes',
    why: 'Tax ledgers outside Duties & Taxes are not picked up by GST / TDS reports and returns.',
    fix: 'Alter the ledger › Under: Duties & Taxes › Type of duty/tax: GST (or TDS) › set the tax type / head › Ctrl+A.' },
  ledgers.filter((l) => /(\b[cis]gst\b|\bigst\b|gst input|gst output|tds payable|\btcs\b)/i.test(l.name) && !/duties\s*&?\s*taxes/i.test(l.primary) && !/duties\s*&?\s*taxes/i.test(l.group) && !/receivable|current assets|loans & advances/i.test(l.primary))
    .map((l) => ({ ledger: l.name, detail: `Under ${l.group}` })));

  // 13. Vouchers with no narration (info)
  add({ id: 'no-narration', severity: 'info', title: 'Journals / payments without a narration',
    why: 'A narration is the audit trail: what the entry is and the document it comes from.',
    fix: 'Open the voucher › type a one-line narration (what, which invoice / UTR) › Ctrl+A. Set "Use common narration" in the voucher type so it is asked every time.' },
  live.filter((v) => /journal|payment|receipt|contra/i.test(v.type) && !v.narration.trim()).map((v) => vs(v, 'No narration', total(v))));

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
  return { periods, vouchers: live.length, ledgers: ledgers.length, issues };
}

/** State name → GST state code (the ones a ledger's State field carries). */
const STATE_CODE: Record<string, string> = Object.fromEntries(Object.entries({
  'Jammu & Kashmir': '01', 'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', Punjab: '03', Chandigarh: '04', Uttarakhand: '05', Haryana: '06', Delhi: '07',
  Rajasthan: '08', 'Uttar Pradesh': '09', Bihar: '10', Sikkim: '11', 'Arunachal Pradesh': '12', Nagaland: '13', Manipur: '14', Mizoram: '15', Tripura: '16',
  Meghalaya: '17', Assam: '18', 'West Bengal': '19', Jharkhand: '20', Odisha: '21', Chhattisgarh: '22', 'Madhya Pradesh': '23', Gujarat: '24',
  'Dadra & Nagar Haveli and Daman & Diu': '26', Maharashtra: '27', Karnataka: '29', Goa: '30', Lakshadweep: '31', Kerala: '32', 'Tamil Nadu': '33',
  Puducherry: '34', 'Andaman & Nicobar Islands': '35', Telangana: '36', 'Andhra Pradesh': '37', Ladakh: '38',
}).map(([k, v]) => [k.toLowerCase(), v]));

// ---------------------------------------------------------------- context for Claude (Ask about Tally / Invoice Booker)

/** Vouchers whose party / ledgers / narration / reference contain any of the words (longest words first). */
export function findVouchers(vouchers: TallyVoucher[], query: string, limit = 80): TallyVoucher[] {
  const words = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))].sort((a, b) => b.length - a.length).slice(0, 8);
  if (!words.length) return [];
  const scored = vouchers.map((v) => {
    const hay = `${v.party} ${v.reference} ${v.narration} ${v.lines.map((l) => l.ledger).join(' ')} ${v.inventory.map((i) => i.item).join(' ')}`.toLowerCase();
    return { v, s: words.reduce((a, w) => a + (hay.includes(w) ? w.length : 0), 0) };
  }).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s || b.v.date.localeCompare(a.v.date));
  return scored.slice(0, limit).map((x) => x.v);
}
const STOP = new Set(['what', 'which', 'where', 'when', 'should', 'would', 'could', 'this', 'that', 'with', 'from', 'have', 'booked', 'book', 'ledger', 'voucher', 'tally', 'entry', 'about', 'there', 'their', 'invoice', 'month', 'please', 'how', 'into', 'been', 'does', 'they']);

export const voucherLine = (v: TallyVoucher) =>
  `${v.date} ${v.type} ${v.number}${v.party ? ` | party ${v.party}` : ''}${v.reference ? ` | ref ${v.reference}` : ''}: ` +
  v.lines.map((l) => `${l.amount >= 0 ? 'Dr' : 'Cr'} ${l.ledger} ${Math.abs(l.amount).toFixed(2)}`).join('; ') +
  (v.inventory.length ? ` | items ${v.inventory.slice(0, 6).map((i) => `${i.item}${i.qty != null ? ` × ${i.qty}` : ''}`).join(', ')}` : '') +
  (v.narration ? ` | "${v.narration.slice(0, 120)}"` : '');

export const ledgerListText = (m: TallyMasters | null, max = 1500) =>
  (m?.ledgers ?? []).slice(0, max).map((l) => [l.name, l.group, l.gstin, l.registration, l.state, l.tds && `TDS ${l.tds}`, l.taxType && `${l.taxType} ${l.dutyHead}`.trim()].filter(Boolean).join(' | ')).join('\n');
