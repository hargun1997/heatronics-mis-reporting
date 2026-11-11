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
    why: 'A ledger line is missing or an amount is wrong. The Trial Balance and P&L are wrong by the difference.',
    fix: '1. Alt+G › Day Book › F2 to the voucher date. 2. Select the voucher and press Enter. 3. Correct the amounts until Dr = Cr. 4. Press Ctrl+A. 5. If an import made it (Shopify or Easebuzz plugin), fix the source and import again.' },
  live.filter((v) => v.lines.length && Math.abs(v.lines.reduce((a, l) => a + l.amount, 0)) > 1)
    .map((v) => vs(v, `Off by ${money(v.lines.reduce((a, l) => a + l.amount, 0))}`, total(v))));

  // 2. Future-dated / outside the pulled months
  add({ id: 'future', severity: 'warn', title: 'Vouchers dated in the future',
    why: 'A future date moves the entry into a later month. This month shows too little.',
    fix: '1. Alt+G › Day Book › F2 to that date. 2. Open the voucher (Enter). 3. Press F2 and set the date of the bill. 4. Press Ctrl+A.' },
  live.filter((v) => v.date > today).map((v) => vs(v, `Dated ${v.date}`, total(v))));

  // 3. RCM lines — Heatronics does not book RCM
  add({ id: 'rcm', severity: 'warn', title: 'Reverse-charge (RCM) entries',
    why: 'Heatronics does not use RCM now (Hargun). An RCM line adds GST payable and input that do not match the returns.',
    fix: '1. Ask Hargun before you change it. 2. If it is not RCM, open the voucher. 3. Remove the RCM lines, or set "Is reverse charge applicable" = No. 4. Press Ctrl+A.' },
  live.flatMap((v) => v.lines.filter((l) => /\brcm\b|reverse\s*charge/i.test(l.ledger)).map((l) => ({ ...vs(v, `Ledger ${l.ledger}`, Math.abs(l.amount)), ledger: l.ledger }))));

  // 4. Purchases from a GST-registered party with no GST input line
  const isPurchase = (v: TallyVoucher) => /purchase/i.test(v.type) && !/order|debit\s*note/i.test(v.type);
  const hasInput = (v: TallyVoucher) => v.lines.some((l) => /input|itc|[cis]gst|igst/i.test(l.ledger) && l.amount > 0);
  add({ id: 'no-itc', severity: 'warn', title: 'GST-registered purchases with no GST input',
    why: 'The bill has GST but no input ledger is debited. You lose the input credit, or the expense includes the GST.',
    fix: '1. Open the voucher. 2. Add the GST input ledger for the tax on the bill (IGST, or CGST + SGST). 3. Reduce the expense line by the same amount. 4. Press Ctrl+A. 5. If the bill has no GST (exempt or nil-rated), mark this Done.' },
  live.filter((v) => isPurchase(v) && !hasInput(v)).filter((v) => {
    const g = v.partyGstin || byName.get(v.party)?.gstin || '';
    return g && !/composition/i.test(byName.get(v.party)?.registration || '');
  }).map((v) => vs(v, `Party GSTIN ${v.partyGstin || byName.get(v.party)?.gstin}`, total(v))));

  // 5. Purchases with no supplier invoice number
  add({ id: 'no-ref', severity: 'warn', title: 'Purchases with no supplier invoice number',
    why: 'GSTR-2B matching and the duplicate check need the supplier invoice number and date on each purchase.',
    fix: '1. Open the voucher. 2. Enter "Supplier Invoice No." and "Date" from the bill. 3. Press Ctrl+A. 4. If the field is not shown, press F12 and set "Provide supplier invoice details" = Yes.' },
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
  add({ id: 'dup-invoice', severity: 'error', title: 'Same supplier invoice in the books twice',
    why: 'The expense and the GST input claim are double.',
    fix: '1. Open both vouchers from the Day Book. 2. Find the correct one. 3. Ask Hargun before you delete the other one (Alt+D). 4. To keep the audit trail, mark it Optional or Cancel (Alt+X) instead.' }, dups);

  // 7. Cash payments above ₹10,000 (Income-tax s.40A(3))
  add({ id: 'cash-10k', severity: 'warn', title: 'Cash payments above ₹10,000 in a day',
    why: 'Income tax does not allow a cash expense above ₹10,000 to one person in one day (s.40A(3)).',
    fix: '1. Pay these bills by bank. 2. If it was a bank payment, open the voucher. 3. Change the Cr line from Cash to the bank ledger. 4. Press Ctrl+A.' },
  live.filter((v) => /payment/i.test(v.type)).flatMap((v) => v.lines.filter((l) => /^cash\b|cash[- ]in[- ]hand|petty cash/i.test(l.ledger) && -l.amount > 10_000).map((l) => vs(v, `Cash ${money(-l.amount)}`, -l.amount))));

  // 8. Suspense
  add({ id: 'suspense', severity: 'warn', title: 'Entries in Suspense',
    why: 'Suspense is a temporary ledger. An entry left there at month end has no explanation in the P&L or balance sheet.',
    fix: '1. Alt+G › Ledger Vouchers › Suspense shows all entries. 2. Use the bank statement or invoice to find each entry. 3. Change the voucher to the correct ledger. 4. Press Ctrl+A.' },
  live.flatMap((v) => v.lines.filter((l) => /suspense/i.test(l.ledger) || /suspense/i.test(byName.get(l.ledger)?.group || '')).map((l) => ({ ...vs(v, `${l.ledger} ${money(Math.abs(l.amount))}`, Math.abs(l.amount)), ledger: l.ledger }))));

  // 9. Ledgers used in vouchers that are not in the master (renamed / deleted)
  if (ledgers.length) {
    const missing = new Map<string, TallyVoucher>();
    for (const v of live) for (const l of v.lines) if (!byName.has(l.ledger) && !missing.has(l.ledger)) missing.set(l.ledger, v);
    add({ id: 'unknown-ledger', severity: 'info', title: 'Voucher ledgers missing from the ledger list',
      why: 'A ledger got a new name after the last pull, or the masters came from a different company.',
      fix: '1. Pull Tally again (masters and Day Book together). 2. If the item stays, find the name in Gateway › Chart of Accounts › Ledgers.' },
    [...missing].map(([ledger, v]) => ({ ...vs(v, `Ledger "${ledger}"`), ledger })));
  }

  // 10. Party ledgers: invalid GSTIN / no GSTIN for a Regular registration / no state
  // A party = any ledger under Sundry Creditors / Debtors, however deep (sub-groups like "Logistics Vendors").
  const parentOf = new Map((masters?.groups ?? []).map((g) => [g.name, g.parent]));
  const underParty = (group: string) => { let g = group; for (let i = 0; i < 20 && g; i++) { if (PARTY_GROUPS.test(g)) return true; g = parentOf.get(g) || ''; } return false; };
  const parties = ledgers.filter((l) => underParty(l.group));
  add({ id: 'bad-gstin', severity: 'error', title: 'Party ledgers with an incorrect GSTIN',
    why: 'A wrong GSTIN puts the sale or purchase on the wrong party in GSTR-1 / 2B. The input credit does not match.',
    fix: '1. Gateway › Alter › Ledger › select the party. 2. Open GST registration details. 3. Correct the GSTIN (15 characters, the check digit must match). 4. Press Ctrl+A.' },
  parties.filter((l) => l.gstin && !gstinValid(l.gstin)).map((l) => ({ ledger: l.name, detail: `GSTIN "${l.gstin}" (${l.group})` })));
  add({ id: 'regular-no-gstin', severity: 'warn', title: '"Regular" parties with no GSTIN',
    why: 'A Regular party needs its GSTIN for the returns and for GST input on its bills.',
    fix: '1. Alter the ledger › GST registration details. 2. Enter the GSTIN from the bill. 3. If the party is not registered, set the type to Unregistered. 4. Press Ctrl+A.' },
  parties.filter((l) => /regular/i.test(l.registration) && !l.gstin).map((l) => ({ ledger: l.name, detail: l.group })));
  add({ id: 'gstin-state', severity: 'warn', title: 'GSTIN state code ≠ ledger state',
    why: 'Tally selects IGST or CGST + SGST from the party state. A wrong state gives the wrong tax type.',
    fix: '1. Alter the ledger. 2. Set State to the state of the GSTIN (first 2 digits). 3. Press Ctrl+A. 4. Check the vouchers that have the wrong tax type.' },
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
    why: 'Two ledgers for one vendor split the balance and bills. Payables and TDS per party are wrong. Several GSTINs of one company (for example Blinkit per state) are correct.',
    fix: '1. Ask Hargun first. 2. Select the ledger to keep. 3. Open the other one in Alt+G › Ledger Vouchers. 4. Change each voucher to the kept ledger. 5. Delete the empty ledger (Gateway › Alter › Ledger › Alt+D).' }, dupLed);

  // 12. GST / TDS ledgers outside Duties & Taxes
  add({ id: 'tax-group', severity: 'warn', title: 'GST / TDS ledgers outside Duties & Taxes',
    why: 'GST and TDS reports and returns do not see tax ledgers outside Duties & Taxes.',
    fix: '1. Alter the ledger. 2. Set Under = Duties & Taxes. 3. Set Type of duty/tax = GST (or TDS) and the tax head. 4. Press Ctrl+A.' },
  ledgers.filter((l) => /(\b[cis]gst\b|\bigst\b|gst input|gst output|tds payable|\btcs\b)/i.test(l.name) && !/duties\s*&?\s*taxes/i.test(l.primary) && !/duties\s*&?\s*taxes/i.test(l.group) && !/receivable|current assets|loans & advances/i.test(l.primary))
    .map((l) => ({ ledger: l.name, detail: `Under ${l.group}` })));

  // 13. Vouchers with no narration (info)
  add({ id: 'no-narration', severity: 'info', title: 'Journals and payments with no narration',
    why: 'The narration is the audit trail. It tells what the entry is and which document it comes from.',
    fix: '1. Open the voucher. 2. Type one line: what it is and the invoice number or UTR. 3. Press Ctrl+A. 4. In the voucher type, set "Use common narration" = Yes.' },
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
