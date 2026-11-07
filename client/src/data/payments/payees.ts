// Payees for the Bulk payments tool (pure): read the ICICI CIB "Manage Bene" export, validate new payees, build the
// Bulk Payee Registration rows. Account numbers are always text (leading zeros kept) and shown masked.

import { BENE_REG_COLUMNS, NICK_MAX } from './iciciFormats';

export interface Payee {
  id: string;
  name: string;
  shortName: string;
  bankType: string;
  account: string;
  /** null when CIB shows "Not Available" (ICICI-to-ICICI payees). */
  ifsc: string | null;
  status: string;
  activatedAt: string;
}
export interface PayeeList {
  payees: Payee[];
  savedAt: string;
  fileName: string;
  by?: string;
}
export interface ParseResult {
  payees: Payee[];
  /** Data rows that had a name or account but could not be used, with why. */
  skipped: { row: number; reason: string }[];
  warnings: string[];
  headerRow: number;
}

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_RE = /^\d{6,20}$/;
/** Accounts CIB already holds: some banks use letters too (seen in the live export, 7 Nov 2026). */
export const SAVED_ACCOUNT_RE = /^[A-Z0-9]{6,20}$/;
export const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const maskAccount = (a: string) => (a ? `••••${a.slice(-4)}` : '—');
export const isActive = (p: Pick<Payee, 'status'>) => p.status.trim().toLowerCase() === 'active';
export const isIciciPayee = (p: { ifsc: string | null; bankType?: string }) =>
  (p.ifsc ?? '').startsWith('ICIC') || /icici/i.test(p.bankType ?? '');

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const HEADERS: Record<keyof Omit<Payee, never>, string[]> = {
  id: ['bene id'],
  name: ['bene name'],
  shortName: ['bene short name', 'bene nick name'],
  bankType: ['bene type'],
  account: ['account number'],
  ifsc: ['ifsc'],
  status: ['status'],
  activatedAt: ['beneficiary activation time'],
};

/** A cell as text. Numbers (a re-saved sheet) are written without exponent; the caller warns. */
export function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(Math.round(v)).toString() : String(v);
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Rows of the export (array of arrays, as sheet_to_json header:1 gives) → payees. Header found by text. */
export function parsePayeeRows(rows: unknown[][]): ParseResult {
  const headerRow = rows.findIndex((r) => {
    const t = (r ?? []).map(norm);
    return t.includes('bene name') && t.includes('account number');
  });
  if (headerRow < 0) return { payees: [], skipped: [], warnings: ['This is not the ICICI payee list: no "Bene Name" / "Account Number" header found.'], headerRow };
  const head = rows[headerRow].map(norm);
  const col = {} as Record<keyof Payee, number>;
  for (const [k, names] of Object.entries(HEADERS) as [keyof Payee, string[]][]) col[k] = head.findIndex((h) => names.includes(h));
  const get = (r: unknown[], k: keyof Payee) => (col[k] >= 0 ? cellText(r[col[k]]) : '');

  const payees: Payee[] = [];
  const skipped: ParseResult['skipped'] = [];
  const warnings: string[] = [];
  let numericAccounts = 0;
  const seen = new Set<string>();
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = get(r, 'name');
    const rawAcc = col.account >= 0 ? r[col.account] : '';
    const account = cellText(rawAcc).replace(/\s/g, '').toUpperCase();
    if (!name && !account) continue; // blank row or page footer
    if (!name) { skipped.push({ row: i + 1, reason: 'no name' }); continue; }
    if (!SAVED_ACCOUNT_RE.test(account)) { skipped.push({ row: i + 1, reason: 'account number missing or not 6–20 letters / digits' }); continue; }
    if (typeof rawAcc === 'number') numericAccounts++;
    const ifscText = get(r, 'ifsc').toUpperCase();
    const ifsc = IFSC_RE.test(ifscText) ? ifscText : null;
    const key = `${account}|${ifsc ?? ''}`;
    if (seen.has(key)) { skipped.push({ row: i + 1, reason: 'same account twice' }); continue; }
    seen.add(key);
    payees.push({
      id: get(r, 'id') || key,
      name,
      shortName: get(r, 'shortName'),
      bankType: get(r, 'bankType'),
      account,
      ifsc,
      status: get(r, 'status') || 'Unknown',
      activatedAt: get(r, 'activatedAt'),
    });
  }
  if (numericAccounts) warnings.push(`${numericAccounts} account number(s) were stored as numbers in the file. Check the last digits against CIB.`);
  const noIfsc = payees.filter((p) => !p.ifsc && !isIciciPayee(p)).length;
  if (noIfsc) warnings.push(`${noIfsc} payee(s) of other banks have no valid IFSC.`);
  return { payees, skipped, warnings, headerRow };
}

// ---- New payees (Bulk Payee Registration) ----------------------------------------------------------------

export interface NewPayee { name: string; nick: string; account: string; ifsc: string; email: string; mobile: string }
export const BLANK_NEW_PAYEE: NewPayee = { name: '', nick: '', account: '', ifsc: '', email: '', mobile: '' };

/** Tidy what was typed / pasted (no spaces in numbers, IFSC upper case). */
export function tidyNewPayee(p: NewPayee): NewPayee {
  return {
    name: p.name.replace(/\s+/g, ' ').trim(),
    nick: p.nick.replace(/\s+/g, ' ').trim(),
    account: p.account.replace(/[\s-]/g, ''),
    ifsc: p.ifsc.replace(/\s/g, '').toUpperCase(),
    email: p.email.trim(),
    mobile: p.mobile.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, ''),
  };
}

/** Nick name from the name when left blank: letters and digits, ≤ NICK_MAX. */
export const autoNick = (name: string) => name.replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, NICK_MAX).trim();

export const isBlankNewPayee = (p: NewPayee) => Object.values(p).every((v) => !String(v).trim());

/** Problems with one new payee, in simple words. Empty = OK. */
export function validateNewPayee(raw: NewPayee): string[] {
  const p = tidyNewPayee(raw);
  const e: string[] = [];
  if (!p.name) e.push('Name is missing');
  else if (p.name.length > 70) e.push('Name is too long');
  const nick = p.nick || autoNick(p.name);
  if (nick.length > NICK_MAX) e.push(`Nick name over ${NICK_MAX} letters`);
  if (nick && !/^[A-Za-z0-9 ]+$/.test(nick)) e.push('Nick name: letters and numbers only');
  if (!ACCOUNT_RE.test(p.account)) e.push('Account no must be 6–20 digits');
  if (!IFSC_RE.test(p.ifsc)) e.push('IFSC looks wrong (like ABCD0123456)');
  if (p.email && !EMAIL_RE.test(p.email)) e.push('Email looks wrong');
  if (p.mobile && !MOBILE_RE.test(p.mobile)) e.push('Mobile must be 10 digits');
  return e;
}

/** The saved payee with the same account (and IFSC, when both have one). */
export function findExisting(p: NewPayee, saved: Payee[]): Payee | undefined {
  const t = tidyNewPayee(p);
  if (!t.account) return undefined;
  return saved.find((s) => s.account === t.account && (!s.ifsc || !t.ifsc || s.ifsc === t.ifsc));
}

/** Pasted Excel cells (tab-separated lines) → new payee rows, in grid order. A header line is skipped. */
export function parsePastedPayees(text: string): NewPayee[] {
  const keys: (keyof NewPayee)[] = ['name', 'nick', 'account', 'ifsc', 'email', 'mobile'];
  return text.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split('\t'))
    .filter((cells) => !/^bnf_name$|^name$/i.test((cells[0] ?? '').trim()))
    .map((cells) => {
      const p = { ...BLANK_NEW_PAYEE };
      keys.forEach((k, i) => { p[k] = (cells[i] ?? '').trim(); });
      return p;
    });
}

/** Rows for the Bulk Payee Registration file (header + one row per payee, all text). */
export function buildBeneRows(list: NewPayee[]): string[][] {
  return [
    [...BENE_REG_COLUMNS],
    ...list.map(tidyNewPayee).map((p) => [p.name, p.nick || autoNick(p.name), p.account, p.ifsc, p.email, p.mobile]),
  ];
}
