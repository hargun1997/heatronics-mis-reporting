// GST refund: ITC accumulated due to an inverted duty structure (section 54(3)(ii), Rule 89(5)), one month at a time, from
// the STORED Tally Day Books (READ ONLY). Pure: no store, no network (tests: server/test/gstRefund.test.ts).
//
// Law used (Notification 05/2026-Central Tax, 26 Oct 2026, in force 1 Nov 2026):
//   Maximum refund = (Turnover of inverted rated supply × Net ITC ÷ Adjusted total turnover) − Tax payable on that supply.
//   Net ITC = ITC on inputs + ITC on "eligible input services" (ITC availed on or after 1 Nov 2026). Capital goods enter only
//   for ITC availed on or after 1 Apr 2027 (60-month spread) — not built yet; capital goods are left out with that reason.
//   Inversion is still tested on goods: an output rate is inverted when inputs (goods) carry a higher rate.
//   Blocked credits (section 17(5)), reverse charge and unregistered suppliers carry no refundable ITC.
//
// One Tally company holds several GSTINs: a voucher type or GST ledger that ends in "-<STATE>" belongs to that state's GSTIN
// (Sales-Amazon-HARYANA, Purchase-STR-UTTAR PRADESH, CGST Output-KARNATAKA). No state = the home GSTIN (the factory, UP).
// Stock moved in from our own branches (Purchase-STR-<home>) is the same goods we sell: left out (Circular 135/05/2020).
//
// Each bill is sorted by signals, strongest first: a saved rule (this bill / party / ledger) → stock item lines or a ledger
// under Purchase Accounts / Fixed Assets → a goods word in an expense ledger or a Tranzact PO in the narration → the voucher
// type. When signals disagree the bill goes to "Check" with the fix. A scanner checks every row the way the portal does.
import type { TallyLedger, TallyVoucher } from '../connectors/tally/books.js';

export const SERVICES_FROM = '2026-11-01'; // eligible input services: ITC availed on / after this day
export const CAPITAL_FROM = '2027-04-01';
export const B2CL_LIMIT = 100_000; // inter-state B2C invoice above this = B2C-Large (since 1 Aug 2024)

export type InwardClass = 'input' | 'service' | 'capital' | 'blocked' | 'rcm' | 'unregistered' | 'stock-transfer' | 'no-gst';
export type Severity = 'error' | 'warn' | 'info';

export interface RefundRules {
  /** voucher guid → class (this bill only) */
  bills: Record<string, InwardClass>;
  /** lower-case party name → class */
  parties: Record<string, InwardClass>;
  /** lower-case ledger name → class */
  ledgers: Record<string, InwardClass>;
}
export const EMPTY_RULES: RefundRules = { bills: {}, parties: {}, ledgers: {} };

export interface RefundSettings { homeState: string; gstin: string; }
// The company's own UP registration (factory, principal place of business on GST REG-06; printed on every invoice: not party data).
// Not the Karnataka or Haryana registrations (warehouse / Amazon-state GSTINs). Settings on the page can override it.
export const DEFAULT_SETTINGS: RefundSettings = { homeState: 'UTTAR PRADESH', gstin: '09AAGCH6109J1ZE' };

export interface TwoBRow { gstin: string; invoice: string; date: string; taxable: number; igst: number; cgst: number; sgst: number; type?: string }
export interface StoredTwoB { month: string; rows: TwoBRow[]; uploadedAt: string; by: string | null; file: string }

export interface Issue { key: string; severity: Severity; code: string; text: string; fix: string }

export interface InwardDoc {
  key: string; guid: string; date: string; vType: string; number: string; party: string; gstin: string;
  invoice: string; invoiceDate: string; docType: 'Invoice/Bill of Entry' | 'Debit Note';
  supplyType: 'Inward Supply from Registered Person' | 'Inward supplies liable to reverse charge' | 'Import of Goods/Supplies from SEZ to DTA' | 'Import of Services/Supplies from SEZ to DTA';
  taxable: number; igst: number; cgst: number; sgst: number; rate: number | null;
  cls: InwardClass; why: string; sure: boolean; ruled: boolean; eligible: boolean; leftOut: string;
  ledgers: string; narration: string; items: number; in2b: boolean | null;
}
export interface OutwardDoc {
  key: string; date: string; vType: string; number: string; party: string; gstin: string;
  supplyType: 'B2B' | 'B2C-Large' | 'B2C-Small'; docType: 'Invoice/Bill of Entry' | 'Credit Note' | 'Debit Note';
  taxable: number; igst: number; cgst: number; sgst: number; rate: number | null; value: number;
}
export interface Calc {
  netItc: number; itcInputs: number; itcServices: number; servicesLeftOut: number;
  invertedTurnover: number; adjustedTurnover: number; taxPayable: number; maxRefund: number;
  invertedRates: number[]; outputRates: { rate: number; taxable: number; tax: number; inverted: boolean }[];
  topInputRate: number | null; ecl: number | null; claim: number;
}
export interface Tie { label: string; tally: number; refund: number; diff: number; ok: boolean; note: string }
export interface RefundMonth {
  month: string; homeState: string; gstin: string; from: string; to: string;
  inward: InwardDoc[]; outward: OutwardDoc[]; issues: Issue[]; calc: Calc; ties: Tie[];
  counts: { vouchers: number; otherGstins: number; inward: number; eligible: number; outward: number; errors: number; warns: number; checks: number };
  twoB: { uploaded: boolean; rows: number; matched: number; notInTally: TwoBRow[] } ;
  ready: boolean; notReady: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const lc = (s: string) => s.trim().toLowerCase();
const live = (v: TallyVoucher) => !v.cancelled && !v.optional;

// ------------------------------------------------------------------ GSTIN
export const STATE_CODES: Record<string, string> = {
  '01': 'JAMMU AND KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB', '04': 'CHANDIGARH', '05': 'UTTARAKHAND', '06': 'HARYANA',
  '07': 'DELHI', '08': 'RAJASTHAN', '09': 'UTTAR PRADESH', '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH', '13': 'NAGALAND',
  '14': 'MANIPUR', '15': 'MIZORAM', '16': 'TRIPURA', '17': 'MEGHALAYA', '18': 'ASSAM', '19': 'WEST BENGAL', '20': 'JHARKHAND',
  '21': 'ODISHA', '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH', '24': 'GUJARAT', '26': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  '27': 'MAHARASHTRA', '29': 'KARNATAKA', '30': 'GOA', '31': 'LAKSHADWEEP', '32': 'KERALA', '33': 'TAMIL NADU', '34': 'PUDUCHERRY',
  '35': 'ANDAMAN AND NICOBAR ISLANDS', '36': 'TELANGANA', '37': 'ANDHRA PRADESH', '38': 'LADAKH', '97': 'OTHER TERRITORY',
};
const STATE_NAMES = Object.values(STATE_CODES).sort((a, b) => b.length - a.length);
export const stateCodeOf = (state: string) => Object.entries(STATE_CODES).find(([, n]) => n === state.toUpperCase())?.[0] ?? '';

/** GSTIN shape + check digit (mod 36, as the portal checks it). */
export function gstinValid(g: string): boolean {
  const s = g.trim().toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = chars.indexOf(s[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return chars[(36 - (sum % 36)) % 36] === s[14];
}

/** The state a voucher belongs to, from a "-<STATE>" ending on its type or a GST ledger; '' = home. */
export function ownerState(v: TallyVoucher): string {
  const ends = (s: string) => STATE_NAMES.find((n) => new RegExp(`[-–]\\s*${n.replace(/ /g, '\\s+')}\\s*$`, 'i').test(s)) ?? '';
  return ends(v.type) || v.lines.map((l) => (GST(l.ledger) ? ends(l.ledger) : '')).find(Boolean) || '';
}

// ------------------------------------------------------------------ ledgers
const GST = (n: string) => /\b(igst|cgst|sgst|utgst)\b/i.test(n);
const CESS = (n: string) => /\bcess\b/i.test(n);
const TDS = (n: string) => /\btds\b|\btcs\b/i.test(n);
const ROUND = (n: string) => /round/i.test(n);
const RCM = (n: string) => /\brcm\b|reverse\s*charge/i.test(n);
/** Rate printed in a GST ledger name ("IGST Input - 18%", "CGST 2.500%") as the full GST rate. */
export function ledgerRate(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const r = Number(m[1]);
  return /\b(cgst|sgst|utgst)\b/i.test(name) ? r * 2 : r;
}
const STD_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

const GOODS_WORDS = /packing|packag|carton|corrugat|box|label|sticker|tape|poly|thread|fabric|cloth|velvet|fur|zip|button|wire|cable|connector|pcb|component|electronic|plastic|mould(?!ing\s*charge)|moulded|raw\s*material|consumable|stores|spares|stationery|printing\s*material|chemical|adhesive|glue|foam|cotton|filler|gel|bead|hardware|screw|battery|adapter|charger|material/i;
const BLOCKED_WORDS = /food|canteen|refreshment|tea\s*&|tea\s*and|snack|catering|staff\s*welfare|club|membership|health\s*insurance|life\s*insurance|medical\s*insurance|motor\s*car|car\s*hire|rent\s*a\s*cab|cab\s*hire|vehicle\s*(?:repair|insurance|maint)|leave\s*travel|holiday|gift|free\s*sample|beauty|personal|construction\s+of|building\s+repair|civil\s*work/i;
const CAPITAL_WORDS = /machine|machinery|equipment|computer|laptop|printer|furniture|fixture|air\s*condition|\bac\b|tool(?:ing)?\b|die\b|mould\s*(?:making|cost)|capital/i;

interface Signal { cls: InwardClass; why: string; strong: boolean }

function signals(v: TallyVoucher, byName: Map<string, TallyLedger>, rules: RefundRules): { pick: Signal; sure: boolean; ruled: boolean; all: Signal[] } {
  const party = v.party;
  const other = v.lines.filter((l) => l.ledger !== party && !GST(l.ledger) && !CESS(l.ledger) && !TDS(l.ledger) && !ROUND(l.ledger));
  const ruleOf = (): Signal | null => {
    const b = rules.bills[v.guid]; if (b) return { cls: b, why: 'saved rule for this bill', strong: true };
    const p = rules.parties[lc(party)]; if (p) return { cls: p, why: `saved rule for ${party}`, strong: true };
    for (const l of other) { const x = rules.ledgers[lc(l.ledger)]; if (x) return { cls: x, why: `saved rule for ledger ${l.ledger}`, strong: true }; }
    return null;
  };
  const rule = ruleOf();
  const all: Signal[] = [];
  if (v.inventory.length) all.push({ cls: 'input', why: `${v.inventory.length} stock item line(s)`, strong: true });
  for (const l of other) {
    const m = byName.get(lc(l.ledger));
    const grp = `${m?.primary ?? ''} ${m?.group ?? ''}`.toLowerCase();
    const text = `${l.ledger} ${m?.group ?? ''}`;
    if (/fixed asset|busy carryover/.test(grp)) all.push({ cls: 'capital', why: `ledger ${l.ledger} is under Fixed Assets`, strong: true });
    else if (/purchase/.test(grp)) all.push({ cls: 'input', why: `ledger ${l.ledger} is under Purchase Accounts`, strong: true });
    else if (BLOCKED_WORDS.test(text)) all.push({ cls: 'blocked', why: `ledger ${l.ledger} looks like a blocked credit (section 17(5))`, strong: false });
    else if (/expense/.test(grp) && GOODS_WORDS.test(text)) all.push({ cls: 'input', why: `expense ledger ${l.ledger} names goods`, strong: false });
    else if (/expense/.test(grp) && CAPITAL_WORDS.test(text)) all.push({ cls: 'capital', why: `expense ledger ${l.ledger} names an asset`, strong: false });
    else if (/expense/.test(grp)) all.push({ cls: 'service', why: `ledger ${l.ledger} is under ${m?.primary || 'Expenses'}`, strong: true });
  }
  if (/\bPo No:\s*PO\d+/i.test(v.narration)) all.push({ cls: 'input', why: 'Tranzact PO in the narration', strong: false });
  if (BLOCKED_WORDS.test(v.narration)) all.push({ cls: 'blocked', why: 'narration names a blocked credit (section 17(5))', strong: false });
  const t = v.type;
  if (/asset|capital/i.test(t)) all.push({ cls: 'capital', why: `voucher type ${t}`, strong: false });
  else if (/service|expense/i.test(t)) all.push({ cls: 'service', why: `voucher type ${t}`, strong: false });
  else if (/\brm\b|purchase$|debit note/i.test(t)) all.push({ cls: 'input', why: `voucher type ${t}`, strong: false });

  if (rule) return { pick: rule, sure: true, ruled: true, all };
  if (!all.length) return { pick: { cls: 'service', why: 'no ledger under Purchase, Expenses or Fixed Assets', strong: false }, sure: false, ruled: false, all };
  const strong = all.filter((s) => s.strong);
  const kinds = new Set((strong.length ? strong : all).map((s) => s.cls));
  // capital and blocked win when seen at all (they take ITC out of the claim: the safe side); else the strongest signal.
  const pickCls: InwardClass = kinds.has('capital') ? 'capital' : kinds.has('blocked') ? 'blocked' : (strong[0] ?? all[0]).cls;
  const pick = all.find((s) => s.cls === pickCls) ?? all[0];
  const disagree = new Set(all.map((s) => s.cls)).size > 1;
  // goods vs service both count from November: only a doubt that moves ITC in or out of the claim needs a check.
  const mixGoodsService = [...new Set(all.map((s) => s.cls))].every((c) => c === 'input' || c === 'service');
  const sure = !!strong.length && (!disagree || mixGoodsService) && pickCls !== 'blocked';
  return { pick, sure, ruled: false, all };
}

// ------------------------------------------------------------------ documents
const isPurchase = (t: string) => /purchase|debit note/i.test(t);
const isSales = (t: string) => /sales|credit note/i.test(t);
const taxSplit = (v: TallyVoucher, sign: 1 | -1) => {
  // sign = +1 for Dr-side tax (purchases), -1 for Cr-side tax (sales); a credit / debit note flips it.
  let igst = 0, cgst = 0, sgst = 0;
  const rates = new Set<number>();
  for (const l of v.lines) {
    if (!GST(l.ledger)) continue;
    const a = l.amount * sign;
    if (/\bigst\b/i.test(l.ledger)) igst += a; else if (/\bcgst\b/i.test(l.ledger)) cgst += a; else sgst += a;
    const r = ledgerRate(l.ledger); if (r != null) rates.add(r);
  }
  return { igst, cgst, sgst, rates: [...rates] };
};

export function docKey(gstin: string, invoice: string) { return `${gstin.trim().toUpperCase()}|${invoice.replace(/[\s/\\-]/g, '').toUpperCase()}`; }
const ddmmyyyy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
export { ddmmyyyy };

function inwardOf(v: TallyVoucher, byName: Map<string, TallyLedger>, rules: RefundRules): InwardDoc {
  const note = /debit note/i.test(v.type);
  const t = taxSplit(v, note ? -1 : 1);
  const party = v.party;
  const gstin = (v.partyGstin || byName.get(lc(party))?.gstin || '').toUpperCase().trim();
  const partyLine = v.lines.find((l) => l.ledger === party);
  const tds = v.lines.filter((l) => TDS(l.ledger)).reduce((s, l) => s + Math.abs(l.amount), 0);
  const tax = t.igst + t.cgst + t.sgst;
  const cess = v.lines.filter((l) => CESS(l.ledger)).reduce((s, l) => s + Math.abs(l.amount), 0);
  const total = partyLine ? Math.abs(partyLine.amount) + tds : v.lines.filter((l) => (note ? l.amount < 0 : l.amount > 0)).reduce((s, l) => s + Math.abs(l.amount), 0);
  const taxable = Math.max(0, total - Math.abs(tax) - cess);
  const sig = signals(v, byName, rules);
  const rcm = v.lines.some((l) => RCM(l.ledger)) || /reverse\s*charge|\brcm\b/i.test(v.narration);
  let cls: InwardClass = sig.pick.cls, why = sig.pick.why, sure = sig.sure;
  if (!sig.ruled) {
    if (/purchase-str/i.test(v.type) || /stock\s*transfer/i.test(party)) { cls = 'stock-transfer'; why = 'stock moved in from our own branch (same goods we sell)'; sure = true; }
    else if (rcm) { cls = 'rcm'; why = 'reverse charge: tax paid in cash, not refundable ITC'; sure = true; }
    else if (!gstin && Math.abs(tax) < 0.5) { cls = 'unregistered'; why = 'no GSTIN and no GST on the bill'; sure = true; }
    else if (Math.abs(tax) < 0.5) { cls = 'no-gst'; why = 'no GST on the bill (exempt / nil rated)'; sure = true; }
  }
  const sezImport = /^(?:96|97)/.test(gstin) || /\bimport|bill of entry|\bboe\b/i.test(`${v.type} ${v.narration}`);
  const rates = t.rates.length ? t.rates : [];
  const rate = rates.length === 1 ? rates[0] : rates.length ? Math.max(...rates) : (taxable > 0 ? Math.round((Math.abs(tax) / taxable) * 1000) / 10 : null);
  const s = note ? -1 : 1;
  const leftOut =
    cls === 'capital' ? (v.date >= CAPITAL_FROM ? 'capital goods: 60-month spread not built yet' : 'capital goods: refundable only for ITC availed from 1 Apr 2027')
      : cls === 'blocked' ? 'blocked credit (section 17(5))'
        : cls === 'rcm' ? 'reverse charge'
          : cls === 'unregistered' ? 'unregistered supplier: no ITC'
            : cls === 'no-gst' ? 'no GST charged'
              : cls === 'stock-transfer' ? 'own stock transfer (same goods as output, Circular 135/05/2020)'
                : cls === 'service' && v.date < SERVICES_FROM ? 'input service before 1 Nov 2026'
                  : '';
  return {
    key: gstin && v.reference ? docKey(gstin, v.reference) : `guid:${v.guid}`,
    guid: v.guid, date: v.date, vType: v.type, number: v.number, party, gstin,
    invoice: v.reference || '', invoiceDate: v.referenceDate || '',
    docType: note ? 'Debit Note' : 'Invoice/Bill of Entry',
    supplyType: rcm ? 'Inward supplies liable to reverse charge' : sezImport ? (cls === 'service' ? 'Import of Services/Supplies from SEZ to DTA' : 'Import of Goods/Supplies from SEZ to DTA') : 'Inward Supply from Registered Person',
    taxable: r2(s * taxable), igst: r2(t.igst), cgst: r2(t.cgst), sgst: r2(t.sgst), rate,
    cls, why, sure, ruled: sig.ruled, eligible: !leftOut, leftOut,
    ledgers: v.lines.filter((l) => l.ledger !== party && !GST(l.ledger)).map((l) => l.ledger).slice(0, 4).join(', '),
    narration: v.narration.slice(0, 200), items: v.inventory.length, in2b: null,
  };
}

function outwardOf(v: TallyVoucher, byName: Map<string, TallyLedger>, homeCode: string): OutwardDoc {
  const credit = /credit note/i.test(v.type);
  const debit = /debit note/i.test(v.type);
  const t = taxSplit(v, credit ? 1 : -1);
  const party = v.party;
  const gstin = (v.partyGstin || byName.get(lc(party))?.gstin || '').toUpperCase().trim();
  const partyLine = v.lines.find((l) => l.ledger === party);
  const value = partyLine ? Math.abs(partyLine.amount) : v.lines.filter((l) => (credit ? l.amount < 0 : l.amount > 0)).reduce((s, l) => s + Math.abs(l.amount), 0);
  const tax = t.igst + t.cgst + t.sgst;
  const cess = v.lines.filter((l) => CESS(l.ledger)).reduce((s, l) => s + Math.abs(l.amount), 0);
  const taxable = Math.max(0, value - Math.abs(tax) - cess);
  const inter = Math.abs(t.igst) > 0.004 || (!!gstin && gstin.slice(0, 2) !== homeCode);
  const supplyType = gstin ? 'B2B' : inter && value > B2CL_LIMIT ? 'B2C-Large' : 'B2C-Small';
  const s = credit ? -1 : 1;
  const rate = t.rates.length === 1 ? t.rates[0] : t.rates.length ? Math.max(...t.rates) : (taxable > 0 ? Math.round((Math.abs(tax) / taxable) * 1000) / 10 : 0);
  return {
    key: `${v.type}|${v.number}`, date: v.date, vType: v.type, number: v.number, party, gstin, supplyType,
    docType: credit ? 'Credit Note' : debit ? 'Debit Note' : 'Invoice/Bill of Entry',
    taxable: r2(s * taxable), igst: r2(t.igst), cgst: r2(t.cgst), sgst: r2(t.sgst), rate, value: r2(s * value),
  };
}

// ------------------------------------------------------------------ scanner
function scanInward(d: InwardDoc, homeCode: string, monthEnd: string, today: string): Issue[] {
  const out: Issue[] = [];
  const at = `${d.vType} ${d.number} (${d.party})`;
  const add = (severity: Severity, code: string, text: string, fix: string) => out.push({ key: d.key, severity, code, text, fix });
  if (d.in2b === false) add('error', 'not-in-2b', `${at}: not in GSTR-2B. This ITC is left out of the claim.`, 'Ask the supplier to file the bill in GSTR-1. Check the GSTIN and the invoice no. against the bill.');
  if (d.leftOut && d.leftOut !== 'not in GSTR-2B' && d.cls !== 'service') {
    if (d.cls === 'blocked' && !d.ruled) add('warn', 'blocked', `${at}: looks like a blocked credit. ₹${Math.abs(d.igst + d.cgst + d.sgst).toFixed(0)} GST left out.`, 'If it is not food, a car, a club, insurance or a gift, set it to Input or Service.');
    if (d.cls === 'capital' && !d.ruled && !d.sure) add('warn', 'capital', `${at}: may be a machine or other asset. Left out of the claim.`, 'If it is used up in production, set it to Input.');
    return out;
  }
  if (d.cls === 'service' && d.leftOut && d.leftOut !== 'not in GSTR-2B') return out;
  if (!d.gstin) add('error', 'no-gstin', `${at}: GST charged but no supplier GSTIN.`, 'In TallyPrime, open the party ledger. Enter the GSTIN from the bill.');
  else if (!gstinValid(d.gstin)) add('error', 'bad-gstin', `${at}: GSTIN ${d.gstin} is not valid (check digit).`, 'Compare the GSTIN with the bill. Correct the party ledger in TallyPrime.');
  if (!d.invoice) add('error', 'no-invoice', `${at}: no supplier invoice number.`, 'In TallyPrime, open the voucher. Enter the supplier invoice no. in "Supplier Invoice No.".');
  if (!d.invoiceDate) add('warn', 'no-invoice-date', `${at}: no supplier invoice date. The voucher date is used.`, 'In TallyPrime, enter the supplier invoice date.');
  const inv = d.invoiceDate || d.date;
  if (inv > today) add('error', 'future-date', `${at}: invoice date ${ddmmyyyy(inv)} is in the future.`, 'Correct the invoice date in TallyPrime.');
  else if (inv > monthEnd) add('warn', 'date-after-month', `${at}: invoice date ${ddmmyyyy(inv)} is after the month.`, 'Check the invoice date. Move the voucher to the correct month.');
  const tax = Math.abs(d.igst + d.cgst + d.sgst);
  if (tax >= Math.abs(d.taxable) && tax > 0) add('error', 'tax-over-value', `${at}: tax ₹${tax.toFixed(0)} is not less than the taxable value. The portal refuses this row.`, 'Check the GST and the amount lines on the voucher.');
  if (d.gstin && gstinValid(d.gstin)) {
    const intra = d.gstin.slice(0, 2) === homeCode;
    if (intra && Math.abs(d.igst) > 0.5) add('error', 'wrong-tax-type', `${at}: supplier is in our state but IGST is booked.`, 'Book CGST + SGST for a supplier in the same state. Ask for a correct bill if the bill shows IGST.');
    if (!intra && Math.abs(d.cgst + d.sgst) > 0.5) add('error', 'wrong-tax-type', `${at}: supplier is in another state but CGST + SGST is booked.`, 'Book IGST for a supplier in another state. Ask for a correct bill if the bill shows CGST + SGST.');
  }
  if (d.taxable && tax) {
    const eff = Math.round((tax / Math.abs(d.taxable)) * 1000) / 10;
    if (d.rate != null && Math.abs(eff - d.rate) > 0.6) add('warn', 'rate-mismatch', `${at}: tax is ${eff}% of the taxable value, the ledger says ${d.rate}%.`, 'Check the GST ledger and the amount lines. A freight or round-off line booked without GST can cause this.');
    else if (d.rate != null && !STD_RATES.includes(d.rate)) add('warn', 'odd-rate', `${at}: ${d.rate}% is not a GST rate.`, 'Check the GST ledger used on the voucher.');
  }
  if (!d.sure && !d.ruled) add('info', 'check-class', `${at}: goods, service or asset is not clear (${d.why}).`, 'Select the correct class. The choice is saved for next month.');
  return out;
}

function scanOutward(d: OutwardDoc): Issue[] {
  const out: Issue[] = [];
  const at = `${d.vType} ${d.number}`;
  const tax = Math.abs(d.igst + d.cgst + d.sgst);
  if (tax >= Math.abs(d.taxable) && tax > 0) out.push({ key: d.key, severity: 'error', code: 'tax-over-value', text: `${at}: tax is not less than the taxable value.`, fix: 'Check the sales voucher lines in TallyPrime.' });
  if (d.gstin && !gstinValid(d.gstin)) out.push({ key: d.key, severity: 'error', code: 'bad-gstin', text: `${at}: buyer GSTIN ${d.gstin} is not valid.`, fix: 'Correct the buyer GSTIN in the party ledger.' });
  if (Math.abs(d.taxable) > 0 && tax < 0.5) out.push({ key: d.key, severity: 'warn', code: 'no-output-tax', text: `${at}: sale with no GST. It is left out of the turnover.`, fix: 'If the item is taxable, add the GST ledger to the voucher.' });
  if (d.rate && !STD_RATES.includes(d.rate)) out.push({ key: d.key, severity: 'warn', code: 'odd-rate', text: `${at}: ${d.rate}% is not a GST rate.`, fix: 'Check the GST ledger used on the voucher.' });
  return out;
}

// ------------------------------------------------------------------ month
export function monthEndOf(month: string) { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }

export function buildRefundMonth(input: {
  month: string; vouchers: TallyVoucher[]; ledgers: TallyLedger[]; rules?: RefundRules; settings?: RefundSettings;
  twoB?: StoredTwoB | null; ecl?: number | null; today?: string; booksAsOf?: string | null;
}): RefundMonth {
  const { month } = input;
  const rules = input.rules ?? EMPTY_RULES;
  const settings = { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) };
  const home = settings.homeState.toUpperCase();
  const homeCode = stateCodeOf(home) || '09';
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const monthEnd = monthEndOf(month);
  const byName = new Map(input.ledgers.map((l) => [lc(l.name), l]));
  const all = input.vouchers.filter(live).filter((v) => v.date.slice(0, 7) === month);
  const mine = all.filter((v) => { const s = ownerState(v); return !s || s === home; });
  const otherGstins = all.length - mine.length;

  const inward = mine.filter((v) => isPurchase(v.type)).map((v) => inwardOf(v, byName, rules)).sort((a, b) => a.date.localeCompare(b.date));
  const outward = mine.filter((v) => isSales(v.type) && !/purchase/i.test(v.type)).map((v) => outwardOf(v, byName, homeCode)).sort((a, b) => a.date.localeCompare(b.date));

  // GSTR-2B match: a bill counts only when it is in 2B (when a 2B is uploaded)
  const twoB = input.twoB?.month === month ? input.twoB : null;
  const byKey = new Map<string, TwoBRow>();
  for (const r of twoB?.rows ?? []) byKey.set(docKey(r.gstin, r.invoice), r);
  const used = new Set<string>();
  const issues: Issue[] = [];
  if (twoB) {
    for (const d of inward) {
      if (d.leftOut || !d.gstin || Math.abs(d.igst + d.cgst + d.sgst) < 0.5) continue;
      const hit = byKey.get(d.key);
      d.in2b = !!hit;
      if (hit) {
        used.add(d.key);
        const diff = Math.abs(hit.igst + hit.cgst + hit.sgst) - Math.abs(d.igst + d.cgst + d.sgst);
        if (Math.abs(diff) > 1) issues.push({ key: d.key, severity: 'warn', code: '2b-differs', text: `${d.vType} ${d.number} (${d.party}): GST in 2B differs from Tally by ₹${diff.toFixed(0)}.`, fix: 'Compare the bill with the supplier. The lower amount is claimed.' });
      } else { d.eligible = false; d.leftOut = 'not in GSTR-2B'; }
    }
  }
  const notInTally = (twoB?.rows ?? []).filter((r) => !used.has(docKey(r.gstin, r.invoice)) && !inward.some((d) => d.key === docKey(r.gstin, r.invoice)));
  for (const r of notInTally) issues.push({ key: docKey(r.gstin, r.invoice), severity: 'warn', code: '2b-not-booked', text: `In GSTR-2B, not in Tally: ${r.gstin} bill ${r.invoice} (₹${(r.igst + r.cgst + r.sgst).toFixed(0)} GST).`, fix: 'Find the bill. Book it in TallyPrime if it is ours, or tell the supplier it is wrong.' });

  // duplicates (same supplier GSTIN + invoice no. twice)
  const seen = new Map<string, InwardDoc>();
  for (const d of inward) {
    if (!d.key.startsWith('guid:') && d.docType === 'Invoice/Bill of Entry') {
      const first = seen.get(d.key);
      if (first) issues.push({ key: d.key, severity: 'error', code: 'duplicate', text: `${d.party} bill ${d.invoice} is booked twice (${first.vType} ${first.number} and ${d.vType} ${d.number}).`, fix: 'Cancel the second voucher in TallyPrime.' });
      else seen.set(d.key, d);
    }
  }
  for (const d of inward) issues.push(...scanInward(d, homeCode, monthEnd, today));
  for (const d of outward) issues.push(...scanOutward(d));

  // eligibility after 2B and errors: a row with an error stays in the list but out of the claim
  const errKeys = new Set(issues.filter((i) => i.severity === 'error' && i.code !== '2b-not-booked').map((i) => i.key));
  for (const d of inward) if (d.eligible && errKeys.has(d.key)) { d.eligible = false; d.leftOut = d.leftOut || 'fix the error first'; }

  // calculation (Rule 89(5) as substituted by Notification 05/2026-CT)
  const itc = (d: InwardDoc) => d.igst + d.cgst + d.sgst;
  const goods = inward.filter((d) => d.eligible && d.cls === 'input');
  const services = inward.filter((d) => d.eligible && d.cls === 'service');
  const servicesLeftOut = inward.filter((d) => d.cls === 'service' && d.leftOut === 'input service before 1 Nov 2026').reduce((s, d) => s + itc(d), 0);
  const itcInputs = goods.reduce((s, d) => s + itc(d), 0);
  const itcServices = services.reduce((s, d) => s + itc(d), 0);
  const netItc = itcInputs + itcServices;
  const goodsRates = goods.filter((d) => itc(d) > 0 && d.rate != null).map((d) => d.rate as number);
  const topInputRate = goodsRates.length ? Math.max(...goodsRates) : null;
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const d of outward) {
    const k = d.rate ?? 0;
    const b = byRate.get(k) ?? { taxable: 0, tax: 0 };
    b.taxable += d.taxable; b.tax += d.igst + d.cgst + d.sgst; byRate.set(k, b);
  }
  const outputRates = [...byRate.entries()].map(([rate, b]) => ({ rate, taxable: r2(b.taxable), tax: r2(b.tax), inverted: rate > 0 && topInputRate != null && topInputRate > rate })).sort((a, b) => b.taxable - a.taxable);
  const invertedTurnover = outputRates.filter((x) => x.inverted).reduce((s, x) => s + x.taxable, 0);
  const adjustedTurnover = outputRates.filter((x) => x.rate > 0).reduce((s, x) => s + x.taxable, 0);
  const taxPayable = outputRates.filter((x) => x.inverted).reduce((s, x) => s + x.tax, 0);
  const maxRefund = adjustedTurnover > 0 ? Math.max(0, (invertedTurnover * netItc) / adjustedTurnover - taxPayable) : 0;
  const ecl = input.ecl ?? null;
  const calc: Calc = {
    netItc: r2(netItc), itcInputs: r2(itcInputs), itcServices: r2(itcServices), servicesLeftOut: r2(servicesLeftOut),
    invertedTurnover: r2(invertedTurnover), adjustedTurnover: r2(adjustedTurnover), taxPayable: r2(taxPayable), maxRefund: r2(maxRefund),
    invertedRates: outputRates.filter((x) => x.inverted).map((x) => x.rate), outputRates, topInputRate, ecl,
    claim: r2(ecl != null ? Math.min(maxRefund, Math.max(0, ecl)) : maxRefund),
  };

  // ties: every rupee of input / output GST in the home GSTIN's books is in a row (in or left out)
  const sumLines = (vs: TallyVoucher[], test: (n: string) => boolean) => vs.reduce((s, v) => s + v.lines.filter((l) => GST(l.ledger) && test(l.ledger)).reduce((a, l) => a + l.amount, 0), 0);
  const isInput = (n: string) => /input/i.test(n) || /gst input/i.test(byName.get(lc(n))?.group ?? '');
  const isOutput = (n: string) => /output/i.test(n) || /gst output/i.test(byName.get(lc(n))?.group ?? '');
  const tallyIn = sumLines(mine, isInput);
  const rowsIn = inward.reduce((s, d) => s + itc(d), 0);
  const tallyOut = -sumLines(mine, isOutput);
  const rowsOut = outward.reduce((s, d) => s + d.igst + d.cgst + d.sgst, 0);
  const otherIn = mine.filter((v) => !isPurchase(v.type) && v.lines.some((l) => GST(l.ledger) && isInput(l.ledger)));
  const ties: Tie[] = [
    { label: 'Input GST', tally: r2(tallyIn), refund: r2(rowsIn), diff: r2(tallyIn - rowsIn), ok: Math.abs(tallyIn - rowsIn) <= 1,
      note: otherIn.length ? `Input GST in ${otherIn.length} other voucher(s): ${otherIn.slice(0, 3).map((v) => `${v.type} ${v.number}`).join(', ')}` : 'GST Input ledgers vs the inward rows' },
    { label: 'Output GST', tally: r2(tallyOut), refund: r2(rowsOut), diff: r2(tallyOut - rowsOut), ok: Math.abs(tallyOut - rowsOut) <= 1, note: 'GST Output ledgers vs the outward rows' },
  ];
  for (const v of otherIn) issues.push({ key: `guid:${v.guid}`, severity: 'warn', code: 'itc-outside-purchase', text: `${v.type} ${v.number}: input GST booked outside a purchase voucher. It is not in the statement.`, fix: 'Book supplier bills as Purchase or Debit Note vouchers so the bill details reach the statement.' });

  const errors = issues.filter((i) => i.severity === 'error').length;
  const notReady: string[] = [];
  if (month < '2026-11') notReady.push('Input services count only from November 2026.');
  if (input.booksAsOf && input.booksAsOf.slice(0, 10) <= monthEnd) notReady.push(`Tally books copied ${input.booksAsOf.slice(0, 10)}, before the month ended.`);
  if (!twoB) notReady.push('Upload GSTR-2B for the month.');
  if (errors) notReady.push(`${errors} error(s) to fix.`);
  if (ties.some((t) => !t.ok)) notReady.push('GST in Tally does not tie with the rows.');
  if (!calc.invertedRates.length) notReady.push('No output rate is below the input rate: no inverted duty refund.');
  if (calc.claim <= 0) notReady.push('The refund works out to ₹0.');

  return {
    month, homeState: home, gstin: settings.gstin, from: month.slice(5, 7) + month.slice(0, 4), to: month.slice(5, 7) + month.slice(0, 4),
    inward, outward, issues, calc, ties,
    counts: {
      vouchers: all.length, otherGstins, inward: inward.length, eligible: inward.filter((d) => d.eligible).length, outward: outward.length,
      errors, warns: issues.filter((i) => i.severity === 'warn').length, checks: issues.filter((i) => i.severity === 'info').length,
    },
    twoB: { uploaded: !!twoB, rows: twoB?.rows.length ?? 0, matched: used.size, notInTally },
    ready: !notReady.length, notReady,
  };
}

// ------------------------------------------------------------------ store sanitizers
const CLASSES: InwardClass[] = ['input', 'service', 'capital', 'blocked', 'rcm', 'unregistered', 'stock-transfer', 'no-gst'];
export function sanitizeRules(body: unknown): RefundRules {
  const b = (body ?? {}) as Partial<Record<keyof RefundRules, Record<string, unknown>>>;
  const pick = (o: Record<string, unknown> | undefined, low: boolean) => Object.fromEntries(Object.entries(o ?? {})
    .filter(([k, v]) => typeof k === 'string' && k.length <= 200 && CLASSES.includes(v as InwardClass)).slice(0, 5000)
    .map(([k, v]) => [low ? lc(k) : k, v as InwardClass]));
  return { bills: pick(b.bills, false), parties: pick(b.parties, true), ledgers: pick(b.ledgers, true) };
}
export function sanitizeTwoB(body: unknown, month: string, by: string | null, at: string): StoredTwoB | { error: string } {
  const b = (body ?? {}) as { rows?: unknown[]; file?: unknown };
  if (!Array.isArray(b.rows)) return { error: 'rows[] needed' };
  if (b.rows.length > 20000) return { error: 'Too many rows (max 20,000).' };
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) / 100 : 0);
  const str = (x: unknown, n: number) => (typeof x === 'string' ? x.trim().slice(0, n) : '');
  const rows = b.rows.map((r) => r as Record<string, unknown>).map((r) => ({
    gstin: str(r.gstin, 15).toUpperCase(), invoice: str(r.invoice, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) ? String(r.date) : '',
    taxable: num(r.taxable), igst: num(r.igst), cgst: num(r.cgst), sgst: num(r.sgst), type: str(r.type, 20),
  })).filter((r) => r.gstin && r.invoice);
  if (!rows.length) return { error: 'No bill rows found in the file.' };
  return { month, rows, uploadedAt: at, by, file: str(b.file, 120) };
}

// ------------------------------------------------------------------ filed months
export interface FiledClaim { arn: string; filedOn: string; amount: number; by: string | null; at: string; snapshot: { netItc: number; maxRefund: number; inward: Record<string, number>; outward: number } }
export interface MonthRecord { ecl: number | null; filed: FiledClaim | null }

/** What moved in Tally after the month was filed. */
export function drift(r: RefundMonth, filed: FiledClaim | null) {
  if (!filed) return null;
  const now = new Map(r.inward.filter((d) => d.eligible).map((d) => [d.key, d.igst + d.cgst + d.sgst]));
  const added = [...now.keys()].filter((k) => !(k in filed.snapshot.inward));
  const removed = Object.keys(filed.snapshot.inward).filter((k) => !now.has(k));
  const changed = [...now.entries()].filter(([k, v]) => k in filed.snapshot.inward && Math.abs(v - filed.snapshot.inward[k]) > 1).map(([k]) => k);
  return { added, removed, changed, netItcNow: r.calc.netItc, netItcFiled: filed.snapshot.netItc, diff: Math.round((r.calc.netItc - filed.snapshot.netItc) * 100) / 100 };
}

