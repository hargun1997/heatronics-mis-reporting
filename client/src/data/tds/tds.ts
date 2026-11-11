// ----------------------------------------------------------------------------
// TDS planning (founder, 9 Nov 2026: "pull from Tally all the invoices and TDS … tell us how much to put in TDS, and steps
// to file"). Pure: no I/O, no React. Input = the stored Tally Day Book vouchers that touch a TDS ledger (GET /api/tds,
// server/src/routes/tds.ts, READ ONLY) + the ledger masters for the ledgers on them. Output = what to deposit for a month
// (per section × challan head), each deductee, flags (rate, PAN, threshold), interest estimates and the quarter's 26Q / 24Q
// working. Tests: server/test/tds.test.ts (synthetic vouchers only — the repo is public).
//
// Rates and thresholds below are the 1961-Act figures as amended by the Finance Act 2025 (FY 2025-26 on). UNVERIFIED for
// FY 2026-27: the Income-tax Act 2025 replaced the 1961 Act from 1 Apr 2026 and renumbers the TDS sections (one table) and
// may rename the return forms. Tally ledger names still carry the old section numbers, so the old numbers are used here;
// the CA confirms the new codes when filing.
// ----------------------------------------------------------------------------

// ---------------------------------------------------------------- input shapes (subset of server TallyVoucher / TallyLedger)

export interface TdsVoucherLine { ledger: string; /** Dr positive, Cr negative (₹). */ amount: number }
export interface TdsVoucher {
  date: string; // YYYY-MM-DD
  type: string;
  number: string;
  party: string;
  reference: string;
  narration: string;
  cancelled?: boolean;
  optional?: boolean;
  lines: TdsVoucherLine[];
}
export interface TdsLedger { name: string; group: string; primary: string; pan: string; taxType: string; tds?: string }

// ---------------------------------------------------------------- sections

export type SectionCode =
  | '192' | '194A' | '194C' | '194H' | '194I' | '194I(a)' | '194I(b)' | '194J' | '194J(a)' | '194J(b)' | '194Q' | '195' | 'Other';

export interface SectionRule {
  label: string;
  /** Standard rates in % (more than one = depends on the deductee / the kind of payment). Empty = no fixed rate (slab / DTAA). */
  rates: { pct: number; when: string }[];
  /** Plain-words threshold note (per deductee). */
  threshold: string;
  /** Annual aggregate threshold in ₹ (per deductee per FY), when one applies. */
  yearLimit?: number;
  /** Single-payment threshold in ₹, when one applies. */
  singleLimit?: number;
  /** Return the section goes into. */
  form: '26Q' | '24Q' | '27Q';
  /** Rate when the deductee has no PAN (206AA): 20 % (5 % for 194Q). */
  noPanPct: number | null;
}

// Finance Act 2025 thresholds (from 1 Apr 2025): 194J ₹50,000, 194H ₹20,000, 194I ₹50,000 a month, 194A (non-bank)
// ₹10,000. 194H rate 2 % from 1 Oct 2024. All UNVERIFIED for FY 2026-27 under the Income-tax Act 2025.
export const SECTIONS: Record<SectionCode, SectionRule> = {
  '192': { label: 'Salary', rates: [], threshold: 'Slab rates on estimated yearly salary — check with the payroll working.', form: '24Q', noPanPct: 20 },
  '194A': { label: 'Interest (other than securities)', rates: [{ pct: 10, when: 'interest' }], threshold: '₹10,000 a year per payee (non-bank payer) — UNVERIFIED', yearLimit: 10_000, form: '26Q', noPanPct: 20 },
  '194C': { label: 'Contractors', rates: [{ pct: 1, when: 'individual / HUF' }, { pct: 2, when: 'company / firm / others' }], threshold: '₹30,000 a single bill, or ₹1,00,000 in the year per contractor', singleLimit: 30_000, yearLimit: 100_000, form: '26Q', noPanPct: 20 },
  '194H': { label: 'Commission / brokerage', rates: [{ pct: 2, when: 'commission' }], threshold: '₹20,000 a year per payee (was ₹15,000 before Apr 2025) — UNVERIFIED', yearLimit: 20_000, form: '26Q', noPanPct: 20 },
  '194I': { label: 'Rent (kind not in the ledger name)', rates: [{ pct: 2, when: 'plant & machinery' }, { pct: 10, when: 'land / building / furniture' }], threshold: '₹50,000 a month per payee (was ₹2,40,000 a year before Apr 2025) — UNVERIFIED', form: '26Q', noPanPct: 20 },
  '194I(a)': { label: 'Rent: plant & machinery', rates: [{ pct: 2, when: 'plant & machinery' }], threshold: '₹50,000 a month per payee — UNVERIFIED', form: '26Q', noPanPct: 20 },
  '194I(b)': { label: 'Rent: land / building / furniture', rates: [{ pct: 10, when: 'land / building / furniture' }], threshold: '₹50,000 a month per payee — UNVERIFIED', form: '26Q', noPanPct: 20 },
  '194J': { label: 'Professional / technical fees (kind not in the ledger name)', rates: [{ pct: 2, when: 'technical services' }, { pct: 10, when: 'professional services' }], threshold: '₹50,000 a year per payee (was ₹30,000 before Apr 2025); director fees have no limit — UNVERIFIED', yearLimit: 50_000, form: '26Q', noPanPct: 20 },
  '194J(a)': { label: 'Technical services', rates: [{ pct: 2, when: 'technical services' }], threshold: '₹50,000 a year per payee — UNVERIFIED', yearLimit: 50_000, form: '26Q', noPanPct: 20 },
  '194J(b)': { label: 'Professional services', rates: [{ pct: 10, when: 'professional services' }], threshold: '₹50,000 a year per payee; director fees have no limit — UNVERIFIED', yearLimit: 50_000, form: '26Q', noPanPct: 20 },
  '194Q': { label: 'Purchase of goods', rates: [{ pct: 0.1, when: 'on purchases above ₹50 lakh in the year from one seller' }], threshold: 'Only on the part above ₹50,00,000 a year per seller (our turnover > ₹10 Cr last year)', form: '26Q', noPanPct: 5 },
  '195': { label: 'Payments to non-residents', rates: [], threshold: 'Rate depends on the income and the tax treaty — ask the CA.', form: '27Q', noPanPct: 20 },
  Other: { label: 'Other / section not in the ledger name', rates: [], threshold: 'Rename the TDS ledger with its section (e.g. "TDS Payable 194C") so it can be checked.', form: '26Q', noPanPct: 20 },
};

const RX = {
  tds: /\bTDS\b|tax\s+deducted/i,
  notPayable: /receivable|recoverable|\b194[\s-]?O\b|\bTCS\b|advance\s+tax|refund/i,
  gst: /\b(I|C|S|U)?GST\b|\bcess\b/i,
  round: /round(ed|ing)?\s*off/i,
  bank: /\bbank\b|\bOD\b|\bCC\b|cash\s*credit/i,
};

/** Is this ledger a TDS PAYABLE ledger (what we deducted and owe the government)? Masters win when present. */
export function isTdsPayable(name: string, ledger?: TdsLedger): boolean {
  if (!RX.tds.test(name) || RX.notPayable.test(name)) return false;
  if (!ledger) return true;
  if (/current assets|loans\s*&?\s*advances/i.test(ledger.primary)) return false;
  return /duties\s*&?\s*taxes|current liabilities|provisions/i.test(ledger.primary) || /tds/i.test(ledger.taxType) || !ledger.primary;
}

/** Section from a TDS ledger name ("TDS Payable 194C", "TDS on Professional", "TDS - Rent (Building)" …). */
export function sectionOf(name: string): SectionCode {
  const n = name.toLowerCase().replace(/\s+/g, ' ');
  const code = /\b(19[2-5][a-z]{0,2})\s*(\(?([ab12])\)?)?/i.exec(n.replace(/-/g, ''));
  if (code) {
    const c = code[1].toUpperCase();
    const sub = (code[3] || '').toLowerCase();
    if (c === '192' || c === '192A') return '192';
    if (c === '194C') return '194C';
    if (c === '194H') return '194H';
    if (c === '194A') return '194A';
    if (c === '194Q') return '194Q';
    if (c === '195') return '195';
    if (c === '194I' || c === '194IA' || c === '194IB') {
      const s = c.length === 5 ? c[4].toLowerCase() : sub;
      if (s === 'a' || /plant|machin/.test(n)) return '194I(a)';
      if (s === 'b' || /build|land|furnit|office|premis|godown|warehouse/.test(n)) return '194I(b)';
      return '194I';
    }
    if (c === '194J' || c === '194JA' || c === '194JB') {
      const s = c.length === 5 ? c[4].toLowerCase() : sub;
      if (s === 'a' || /technical|royalty|call cent/.test(n)) return '194J(a)';
      if (s === 'b' || /profession|director|legal|audit|consult/.test(n)) return '194J(b)';
      return '194J';
    }
  }
  if (/salar|wage/.test(n)) return '192';
  if (/contract|freight|transport|job ?work|labou?r|advertis|printing|courier|logistic/.test(n)) return '194C';
  if (/technical|royalty/.test(n)) return '194J(a)';
  if (/profession|legal|audit|consult|director/.test(n)) return '194J(b)';
  if (/commission|brokerage/.test(n)) return '194H';
  if (/rent/.test(n)) return /plant|machin|equipment/.test(n) ? '194I(a)' : /build|office|premis|godown|warehouse|land/.test(n) ? '194I(b)' : '194I';
  if (/interest/.test(n)) return '194A';
  if (/purchase|goods/.test(n)) return '194Q';
  if (/non[- ]?resident|foreign|\bnri\b/.test(n)) return '195';
  return 'Other';
}

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');
export function addMonths(p: string, n: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (p: string) => `${MON[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
export const dateLabel = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** Deposit due date for TDS deducted in `month`: 7th of the next month; March → 30 April. */
export function depositDueDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (m === 3) return `${y}-04-30`;
  return `${addMonths(month, 1)}-07`;
}

/** FY start year of a month (Apr–Mar). */
export const fyStartYear = (month: string) => { const [y, m] = month.split('-').map(Number); return m >= 4 ? y : y - 1; };
export const fyLabel = (month: string) => { const s = fyStartYear(month); return `FY ${s}-${String((s + 1) % 100).padStart(2, '0')}`; };
/** Months of the FY from April up to and including `month`. */
export function fyMonthsTo(month: string): string[] {
  const out: string[] = [];
  for (let p = `${fyStartYear(month)}-04`; p <= month; p = addMonths(p, 1)) out.push(p);
  return out;
}

export interface QuarterInfo { q: 1 | 2 | 3 | 4; label: string; months: string[]; dueDate: string }
/** TDS quarter of a month; return due 31 Jul / 31 Oct / 31 Jan / 31 May. */
export function quarterOf(month: string): QuarterInfo {
  const s = fyStartYear(month);
  const m = Number(month.slice(5, 7));
  const q = (m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4) as 1 | 2 | 3 | 4;
  const first = q === 4 ? `${s + 1}-01` : `${s}-${pad(1 + q * 3)}`;
  const months = [first, addMonths(first, 1), addMonths(first, 2)];
  const dueDate = q === 1 ? `${s}-07-31` : q === 2 ? `${s}-10-31` : q === 3 ? `${s + 1}-01-31` : `${s + 1}-05-31`;
  return { q, label: `Q${q} ${fyLabel(month)}`, months, dueDate };
}

/** Months for interest: every month or part of a month from `from` to `to` (TRACES counts both end months). 0 if to < from. */
export function monthsOrPart(from: string, to: string): number {
  if (to < from) return 0;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}
/** 201(1A): 1.5 % a month (or part) from deduction to payment, on TDS deducted but paid late. */
export const lateDepositInterest = (amount: number, deductedOn: string, paidOn: string) => Math.round(amount * 0.015 * monthsOrPart(deductedOn, paidOn));
/** 201(1A): 1 % a month (or part) from when it should have been deducted to when it was deducted. */
export const lateDeductionInterest = (amount: number, deductibleOn: string, deductedOn: string) => Math.round(amount * 0.01 * monthsOrPart(deductibleOn, deductedOn));
/** 234E: ₹200 a day from the day after the due date until filed, capped at the TDS in the return. */
export function lateFee234E(dueDate: string, filedOn: string, tdsInReturn: number): number {
  const days = Math.round((Date.parse(filedOn) - Date.parse(dueDate)) / 86_400_000);
  return days > 0 ? Math.min(days * 200, Math.max(0, Math.round(tdsInReturn))) : 0;
}

// ---------------------------------------------------------------- PAN

const PAN_RX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const validPan = (pan: string) => PAN_RX.test((pan || '').trim().toUpperCase());
/** Company deductee (4th PAN letter C) → challan major head 0020; others 0021; deductee code 01 / 02 in 26Q. */
export const isCompanyPan = (pan: string) => validPan(pan) && pan.trim().toUpperCase()[3] === 'C';
const isPersonPan = (pan: string) => validPan(pan) && /[PH]/.test(pan.trim().toUpperCase()[3]);

// ---------------------------------------------------------------- engine

export type FlagKind = 'rate' | 'pan' | 'threshold' | 'multi' | 'reversal' | 'unknown' | 'late';
export interface TdsFlag { kind: FlagKind; severity: 'high' | 'medium' | 'low'; text: string; section?: SectionCode; party?: string; voucher?: string }

/** One deduction (a TDS ledger credit on a voucher). */
export interface TdsEntry {
  date: string;
  month: string;
  voucher: string; // "<type> <number>"
  reference: string;
  section: SectionCode;
  tdsLedger: string;
  party: string;
  pan: string;
  gross: number; // amount paid / credited (ex-GST)
  tds: number;
  ratePct: number | null;
  grossEstimated: boolean;
}
/** One challan / payment (a TDS ledger debit with a bank line), or a reversal (debit without a bank). */
export interface TdsPayment { date: string; month: string; voucher: string; section: SectionCode; tdsLedger: string; amount: number; kind: 'challan' | 'reversal'; bsr: string; challanNo: string }

export interface PayRow { section: SectionCode; label: string; head: '0020' | '0021'; headLabel: string; deducted: number; paid: number; balance: number; interest: number }
export interface SectionRow { section: SectionCode; label: string; gross: number; deducted: number; paid: number; balance: number; interest: number; deductees: number; entries: number }
export interface DeducteeRow { section: SectionCode; party: string; pan: string; gross: number; tds: number; ratePct: number | null; fyGross: number; entries: number; flags: string[] }
export interface QuarterRow {
  pan: string; name: string; code: '01' | '02'; section: SectionCode; paidOn: string; amount: number; tds: number; deductedOn: string; ratePct: number | null;
  bsr: string; challanDate: string; challanNo: string; reason: string;
}

export interface TdsReport {
  month: string;
  monthLabel: string;
  fy: string;
  dueDate: string;
  /** Day Book stored for the month / for the next month (challans for this month are usually booked there). */
  haveMonth: boolean;
  haveNextMonth: boolean;
  today: string;
  overdue: boolean;
  totals: { gross: number; deducted: number; paid: number; balance: number; interest: number };
  pay: PayRow[];
  sections: SectionRow[];
  deductees: DeducteeRow[];
  entries: TdsEntry[];
  payments: TdsPayment[];
  flags: TdsFlag[];
  quarter: QuarterInfo & { haveMonths: string[]; missingMonths: string[]; q26: QuarterRow[]; q24: QuarterRow[]; q27: QuarterRow[]; tds26: number; tds24: number; tds27: number; lateFeeCap: number };
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const vname = (v: TdsVoucher) => `${v.type} ${v.number}`.trim();

interface Parsed { entries: TdsEntry[]; payments: TdsPayment[]; flags: TdsFlag[] }

/** Every deduction and payment in the vouchers given. */
export function parseTds(vouchers: TdsVoucher[], ledgers: TdsLedger[]): Parsed {
  const L = new Map(ledgers.map((l) => [l.name, l]));
  const entries: TdsEntry[] = [];
  const payments: TdsPayment[] = [];
  const flags: TdsFlag[] = [];
  const isTax = (name: string) => {
    const l = L.get(name);
    if (RX.gst.test(name) || RX.round.test(name) || RX.tds.test(name) || /\bTCS\b/i.test(name)) return true;
    return !!l && /duties\s*&?\s*taxes/i.test(l.primary);
  };
  const isBank = (name: string) => {
    const l = L.get(name);
    if (l) return /bank|cash/i.test(l.primary) || /bank/i.test(l.group);
    return RX.bank.test(name);
  };

  for (const v of vouchers) {
    if (v.cancelled || v.optional) continue;
    const tdsLines = v.lines.filter((l) => isTdsPayable(l.ledger, L.get(l.ledger)));
    if (!tdsLines.length) continue;
    const month = v.date.slice(0, 7);
    const credits = tdsLines.filter((l) => l.amount < 0);
    const debits = tdsLines.filter((l) => l.amount > 0);

    // Deductions.
    if (credits.length) {
      const others = v.lines.filter((l) => !tdsLines.includes(l));
      const base = others.filter((l) => l.amount > 0 && !isTax(l.ledger) && !isBank(l.ledger)).reduce((a, l) => a + l.amount, 0);
      const partyLine = others.filter((l) => l.amount < 0 && !isTax(l.ledger) && !isBank(l.ledger)).sort((a, b) => a.amount - b.amount)[0];
      const party = (v.party || partyLine?.ledger || '').trim() || '(no party)';
      const pan = (L.get(party)?.pan || '').trim().toUpperCase();
      const multi = credits.length > 1;
      if (multi) flags.push({ kind: 'multi', severity: 'low', text: `${vname(v)} (${dateLabel(v.date)}) has ${credits.length} TDS lines: the amount paid per section is estimated from the standard rate.`, party, voucher: vname(v) });
      for (const c of credits) {
        const section = sectionOf(c.ledger);
        const tds = r2(-c.amount);
        const rule = SECTIONS[section];
        let gross = base;
        let grossEstimated = false;
        if (multi || gross <= 0) {
          const std = rule.rates.length ? rule.rates[rule.rates.length - 1].pct : 0;
          gross = std ? r2((tds * 100) / std) : 0;
          grossEstimated = true;
        }
        const ratePct = gross > 0 ? r2((tds / gross) * 100) : null;
        entries.push({ date: v.date, month, voucher: vname(v), reference: v.reference, section, tdsLedger: c.ledger, party, pan, gross: r2(gross), tds, ratePct, grossEstimated });
      }
    }

    // Payments / reversals.
    if (debits.length) {
      const bank = v.lines.some((l) => l.amount < 0 && isBank(l.ledger)) || /payment|challan/i.test(v.type);
      const text = `${v.narration} ${v.reference}`;
      const bsr = /\bBSR\D{0,12}(\d{7})\b/i.exec(text)?.[1] ?? '';
      const challanNo = /\b(?:challan|serial|chln|sr\.?\s*no)\D{0,12}(\d{5})\b/i.exec(text)?.[1] ?? '';
      for (const d of debits) {
        const section = sectionOf(d.ledger);
        payments.push({ date: v.date, month, voucher: vname(v), section, tdsLedger: d.ledger, amount: r2(d.amount), kind: bank ? 'challan' : 'reversal', bsr, challanNo });
        if (!bank) flags.push({ kind: 'reversal', severity: 'medium', text: `${vname(v)} (${dateLabel(v.date)}) debits ${d.ledger} without a bank line: treated as a reversal of TDS, not a payment. Check it.`, section, voucher: vname(v) });
      }
    }
  }
  return { entries, payments, flags };
}

/** Does `tds` match `gross` × one of the section's rates (₹1 rounding, Tally rounds TDS to the rupee)? */
function rateMatches(rule: SectionRule, gross: number, tds: number, pan: string): { ok: boolean; expected: number[] } {
  let rates = rule.rates.map((r) => r.pct);
  if (rule === SECTIONS['194C'] && validPan(pan)) rates = [isPersonPan(pan) ? 1 : 2];
  if (!validPan(pan) && rule.noPanPct != null) rates = [...rates, rule.noPanPct];
  return { ok: rates.some((p) => Math.abs((gross * p) / 100 - tds) <= 1.01), expected: rates };
}

export interface BuildInput {
  month: string;
  vouchers: TdsVoucher[]; // every TDS-touching voucher stored for the FY to date + the next month (+ the rest of the quarter)
  ledgers: TdsLedger[];
  storedMonths: string[]; // months whose Day Book is stored
  today: string; // YYYY-MM-DD (IST)
}

export function buildTds(inp: BuildInput): TdsReport {
  const { month, today } = inp;
  const next = addMonths(month, 1);
  const dueDate = depositDueDate(month);
  const have = new Set(inp.storedMonths);
  const { entries: all, payments: allPay, flags: parseFlags } = parseTds(inp.vouchers, inp.ledgers);
  const fyStart = `${fyStartYear(month)}-04`;

  const entries = all.filter((e) => e.month === month).sort((a, b) => a.date.localeCompare(b.date) || a.voucher.localeCompare(b.voucher));
  // A month's TDS is deposited in the next month (by the 7th; March by 30 April): challans booked in `next` pay it.
  // UNVERIFIED assumption — a challan for an older month booked then is counted here too.
  const payments = allPay.filter((p) => p.month === next).sort((a, b) => a.date.localeCompare(b.date));
  const challans = payments.filter((p) => p.kind === 'challan');
  const reversals = allPay.filter((p) => p.month === month && p.kind === 'reversal');
  const flags: TdsFlag[] = parseFlags.filter((f) => !f.voucher || entries.some((e) => e.voucher === f.voucher) || payments.some((p) => p.voucher === f.voucher) || reversals.some((p) => p.voucher === f.voucher));

  // FY-to-date gross per section × party (thresholds).
  const fyGross = new Map<string, number>();
  for (const e of all) if (e.month >= fyStart && e.month <= month) fyGross.set(`${e.section}|${e.party}`, (fyGross.get(`${e.section}|${e.party}`) || 0) + e.gross);

  // Deductees.
  const dmap = new Map<string, DeducteeRow>();
  for (const e of entries) {
    const k = `${e.section}|${e.party}`;
    const d = dmap.get(k) ?? { section: e.section, party: e.party, pan: e.pan, gross: 0, tds: 0, ratePct: null, fyGross: r2(fyGross.get(k) || 0), entries: 0, flags: [] };
    d.gross = r2(d.gross + e.gross); d.tds = r2(d.tds + e.tds); d.entries++;
    dmap.set(k, d);
  }
  for (const d of dmap.values()) {
    const rule = SECTIONS[d.section];
    d.ratePct = d.gross > 0 ? r2((d.tds / d.gross) * 100) : null;
    if (d.section === 'Other') {
      d.flags.push('Section not in the TDS ledger name');
      flags.push({ kind: 'unknown', severity: 'medium', text: `TDS for ${d.party} sits on a ledger with no section in its name. Rename the TDS ledger (e.g. "TDS Payable 194C") so the rate can be checked.`, section: d.section, party: d.party });
    }
    if (!validPan(d.pan)) {
      d.flags.push('No PAN in Tally');
      const at20 = d.ratePct != null && rule.noPanPct != null && Math.abs(d.ratePct - rule.noPanPct) < 0.5;
      flags.push({ kind: 'pan', severity: at20 ? 'low' : 'high', section: d.section, party: d.party,
        text: at20 ? `${d.party}: no PAN in Tally, TDS deducted at ${rule.noPanPct}% (206AA). Add the PAN to the ledger if they have one.`
          : `${d.party}: no PAN in the Tally ledger. Without a PAN the rate is ${rule.noPanPct ?? 20}% (206AA) and the 26Q line fails. Add the PAN to the ledger (Alter ledger → Statutory details).` });
    }
    if (rule.rates.length && d.section !== 'Other') {
      const bad = entries.filter((e) => e.section === d.section && e.party === d.party && !e.grossEstimated && !rateMatches(rule, e.gross, e.tds, e.pan).ok);
      if (bad.length) {
        const exp = rateMatches(rule, bad[0].gross, bad[0].tds, d.pan).expected;
        d.flags.push(`Rate ${d.ratePct ?? '?'}% vs ${exp.join(' / ')}%`);
        const std = Math.min(...exp);
        const short = bad.reduce((a, e) => a + Math.max(0, (e.gross * std) / 100 - e.tds), 0);
        flags.push({ kind: 'rate', severity: 'high', section: d.section, party: d.party,
          text: `${d.party} (${d.section}): TDS is ${d.ratePct ?? '?'}% of ₹${Math.round(d.gross).toLocaleString('en-IN')}. The standard rate is ${exp.join(' or ')}%. ${short > 1 ? `Short by about ₹${Math.round(short).toLocaleString('en-IN')} (interest 1% a month until deducted). ` : ''}Check the bill, or a lower-deduction certificate (197).` });
      }
    }
    if (rule.yearLimit && d.fyGross < rule.yearLimit && !(rule.singleLimit && entries.some((e) => e.section === d.section && e.party === d.party && e.gross > rule.singleLimit!))) {
      d.flags.push('Below the yearly limit so far');
      flags.push({ kind: 'threshold', severity: 'low', section: d.section, party: d.party,
        text: `${d.party} (${d.section}): ₹${Math.round(d.fyGross).toLocaleString('en-IN')} this FY is under the ${rule.threshold.split(' —')[0]} limit. Deducting is still fine if the year will cross it.` });
    }
  }
  const deductees = [...dmap.values()].sort((a, b) => b.tds - a.tds);

  // Allocate challans FIFO to the month's deductions per section → late-deposit interest (estimate).
  const interestBy = new Map<SectionCode, number>();
  const paidBy = new Map<SectionCode, number>();
  const bySec = new Map<SectionCode, TdsEntry[]>();
  for (const e of entries) bySec.set(e.section, [...(bySec.get(e.section) ?? []), e]);
  for (const [sec, list] of bySec) {
    const pays = challans.filter((p) => p.section === sec).map((p) => ({ ...p, left: p.amount }));
    let interest = 0;
    let paid = 0;
    for (const e of list) {
      let owe = e.tds;
      for (const p of pays) {
        if (owe <= 0.005) break;
        const take = Math.min(owe, p.left);
        if (take <= 0) continue;
        p.left -= take; owe -= take; paid += take;
        if (p.date > dueDate) interest += lateDepositInterest(take, e.date, p.date);
      }
      if (owe > 0.005 && today > dueDate) interest += lateDepositInterest(owe, e.date, today);
    }
    interestBy.set(sec, interest);
    paidBy.set(sec, r2(paid));
    const late = pays.filter((p) => p.date > dueDate);
    if (late.length) flags.push({ kind: 'late', severity: 'medium', section: sec, text: `${sec}: challan paid on ${dateLabel(late[0].date)}, after the due date ${dateLabel(dueDate)}. Interest 1.5% a month is due (estimate below).` });
    const extra = pays.reduce((a, p) => a + p.left, 0);
    if (extra > 1) flags.push({ kind: 'late', severity: 'low', section: sec, text: `${sec}: ₹${Math.round(extra).toLocaleString('en-IN')} of challans booked in ${monthLabel(next)} is more than ${monthLabel(month)}'s TDS. Probably an older month's dues.` });
  }
  for (const sec of new Set(challans.filter((p) => !bySec.has(p.section)).map((p) => p.section))) {
    flags.push({ kind: 'late', severity: 'low', section: sec, text: `${sec}: a challan booked in ${monthLabel(next)} has no ${monthLabel(month)} deduction in that section. Probably an older month's dues.` });
  }

  // Pay rows: section × challan head (0020 company deductees, 0021 others).
  const pmap = new Map<string, PayRow>();
  for (const e of entries) {
    const head: '0020' | '0021' = isCompanyPan(e.pan) ? '0020' : '0021';
    const k = `${e.section}|${head}`;
    const row = pmap.get(k) ?? { section: e.section, label: SECTIONS[e.section].label, head, headLabel: head === '0020' ? 'Company deductees' : 'Non-company deductees', deducted: 0, paid: 0, balance: 0, interest: 0 };
    row.deducted = r2(row.deducted + e.tds);
    pmap.set(k, row);
  }
  const sections: SectionRow[] = [];
  for (const [sec, list] of bySec) {
    const deducted = r2(list.reduce((a, e) => a + e.tds, 0));
    const paid = Math.min(deducted, paidBy.get(sec) || 0);
    const rows = [...pmap.values()].filter((r) => r.section === sec);
    let left = paid;
    for (const r of rows.sort((a, b) => a.head.localeCompare(b.head))) { const t = Math.min(left, r.deducted); r.paid = r2(t); left -= t; r.balance = r2(r.deducted - r.paid); r.interest = deducted ? Math.round((interestBy.get(sec) || 0) * (r.deducted / deducted)) : 0; }
    sections.push({ section: sec, label: SECTIONS[sec].label, gross: r2(list.reduce((a, e) => a + e.gross, 0)), deducted, paid: r2(paid), balance: r2(deducted - paid), interest: interestBy.get(sec) || 0, deductees: new Set(list.map((e) => e.party)).size, entries: list.length });
  }
  sections.sort((a, b) => b.deducted - a.deducted);
  const pay = [...pmap.values()].sort((a, b) => b.deducted - a.deducted);
  const totals = {
    gross: r2(sections.reduce((a, s) => a + s.gross, 0)),
    deducted: r2(sections.reduce((a, s) => a + s.deducted, 0)),
    paid: r2(sections.reduce((a, s) => a + s.paid, 0)),
    balance: r2(sections.reduce((a, s) => a + s.balance, 0)),
    interest: sections.reduce((a, s) => a + s.interest, 0),
  };

  // Quarter working (26Q / 24Q / 27Q), deductee-wise, with challan details where the challan's narration carries them.
  const qi = quarterOf(month);
  const qEntries = all.filter((e) => qi.months.includes(e.month)).sort((a, b) => a.date.localeCompare(b.date));
  const qChallans = allPay.filter((p) => p.kind === 'challan' && p.month >= qi.months[0] && p.month <= addMonths(qi.months[2], 1));
  const challanFor = (e: TdsEntry) => qChallans.find((p) => p.section === e.section && p.month === addMonths(e.month, 1)) ?? null;
  const toRow = (e: TdsEntry): QuarterRow => {
    const c = challanFor(e);
    const rule = SECTIONS[e.section];
    return {
      pan: validPan(e.pan) ? e.pan : 'PANNOTAVBL', name: e.party, code: isCompanyPan(e.pan) ? '01' : '02', section: e.section, paidOn: e.date, amount: e.gross, tds: e.tds,
      deductedOn: e.date, ratePct: e.ratePct, bsr: c?.bsr ?? '', challanDate: c?.date ?? '', challanNo: c?.challanNo ?? '',
      reason: !validPan(e.pan) && rule.noPanPct != null ? 'C' : '',
    };
  };
  const q26 = qEntries.filter((e) => SECTIONS[e.section].form === '26Q').map(toRow);
  const q24 = qEntries.filter((e) => SECTIONS[e.section].form === '24Q').map(toRow);
  const q27 = qEntries.filter((e) => SECTIONS[e.section].form === '27Q').map(toRow);
  const sum = (rows: QuarterRow[]) => r2(rows.reduce((a, r) => a + r.tds, 0));

  if (entries.some((e) => e.grossEstimated)) flags.push({ kind: 'multi', severity: 'low', text: 'Some amounts paid are estimated from the TDS and the standard rate (the voucher had no expense line, or several TDS lines).' });
  const order = { high: 0, medium: 1, low: 2 } as const;
  flags.sort((a, b) => order[a.severity] - order[b.severity]);

  const notes = [
    'Rates and limits are the Income-tax Act 1961 figures after the Finance Act 2025. From 1 Apr 2026 the Income-tax Act 2025 renumbers the TDS sections and may rename the forms (UNVERIFIED), confirm with the CA.',
    `Challans booked in ${monthLabel(next)} are counted as paying ${monthLabel(month)}'s TDS.`,
    'Interest and late fees are estimates (1.5% a month or part from deduction to payment; ₹200 a day for a late return, capped at the TDS).',
    'Amount paid = the expense lines of the voucher before GST (CBDT circular 23/2017).',
  ];
  if (!have.has(next)) notes.unshift(`${monthLabel(next)}'s Day Book is not copied yet, so challans paid in ${monthLabel(next)} are not seen. "Paid" may read 0.`);

  return {
    month, monthLabel: monthLabel(month), fy: fyLabel(month), dueDate, haveMonth: have.has(month), haveNextMonth: have.has(next), today,
    overdue: today > dueDate && totals.balance > 0.5,
    totals, pay, sections, deductees, entries, payments: [...payments, ...reversals], flags,
    quarter: { ...qi, haveMonths: qi.months.filter((m) => have.has(m)), missingMonths: qi.months.filter((m) => !have.has(m) && m <= today.slice(0, 7)), q26, q24, q27, tds26: sum(q26), tds24: sum(q24), tds27: sum(q27), lateFeeCap: sum([...q26, ...q24, ...q27]) },
    notes,
  };
}
