// TDS to claim back (TDS page → "Claim back"): data from GET /api/tds/claims (server services/tdsClaims.ts) and the claim
// playbook per platform: where to claim, the steps, the message to send and the files to attach. Researched 23 Nov 2026:
//  - Meta: Meta Business Help Centre form "TDS refund" (ad account ID, GSTIN, PAN, TAN, certificate, transaction date); refund = ad
//    credits, up to about 2 months (taxguru / e-startupindia guides).
//  - Google Ads: email tds.certificates@google.com with the certificate, Google Ads invoices, billing / customer ID, invoice + TDS
//    summary in Excel; refund = ad credits (taxguru, caclubindia). UNVERIFIED against Google's own page (support.google.com/google-ads/
//    answer/2375370): check it before the first claim.
//  - Amazon: Seller Central → Help → Get support → case "TDS reimbursement" (Amazon's forum moderator), with the certificate; refund to
//    the seller account.
//  - Porter: at the end of each quarter share the certificate with Porter (Enterprise dashboard → Help & Support, or the account manager);
//    Porter checks it against Form 26AS and credits the Enterprise wallet (Porter help centre).
//  - Shiprocket / Flipkart / others: no public process found: raise a ticket / email accounts with the same message. UNVERIFIED.
// Income-tax Act 2025 (from 1 Apr 2026): the TDS certificate is Form No. 131 (old Form 16A); the quarter return is Form No. 140 (old 26Q).
import { useCallback, useEffect, useState } from 'react';

export type ClaimState = 'wait' | 'ready' | 'claimed' | 'received';
export interface ClaimRecord { status: 'claimed' | 'received'; on: string; ref: string; amount: number | null; by: string | null; at: string }
export interface ClaimQuarter { quarter: string; label: string; deducted: number; received: number; pending: number; certFrom: string; state: ClaimState; record: ClaimRecord | null; bills: number }
export interface ClaimBill { date: string; quarter: string; party: string; voucher: string; invoiceNo: string; taxable: number; tds: number; tdsLedger: string }
export interface ClaimPlatform { id: string; name: string; kind: 'reimburse' | 'credit'; parties: string[]; why: string; deducted: number; received: number; pending: number; readyNow: number; quarters: ClaimQuarter[]; bills: ClaimBill[] }
export interface ClaimSettings { tan: string; metaAdAccount: string; googleCustomerId: string; porterAccount: string; contactName: string; contactPhone: string; contactEmail: string }
export interface ClaimsApi {
  fy: number; asOf: string; platforms: ClaimPlatform[];
  totals: { pending: number; readyNow: number; claimed: number; credit: number };
  older: { ledger: string; opening: number }[]; notes: string[];
  settings: ClaimSettings; company: { name: string; pan: string; gstin: string };
  stored: string[]; missing: string[]; reachedAt: string | null;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'include', ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Could not load (${r.status})`);
  return j as T;
}
const put = <T,>(url: string, body: unknown) => getJson<T>(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function useClaims(on: boolean) {
  const [api, setApi] = useState<ClaimsApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!on) return;
    let live = true;
    getJson<ClaimsApi>('/api/tds/claims').then((j) => { if (live) { setApi(j); setError(null); } }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [on, tick]);
  return { api, error, reload };
}
export const markClaim = (platform: string, quarter: string, body: { status: 'claimed' | 'received' | 'clear'; ref?: string; amount?: number; on?: string }) =>
  put<{ ok: boolean }>(`/api/tds/claims/${encodeURIComponent(`${platform}|${quarter}`)}`, body);
export const saveClaimSettings = (s: ClaimSettings) => put<{ ok: boolean }>('/api/tds/claims-settings', s);

// ------------------------------------------------------------------ playbook
export interface Playbook {
  where: string; link?: string; channel: 'portal' | 'email' | 'ticket' | 'return';
  to?: string; refundAs: string; time: string; steps: string[]; attach: string[]; check?: string;
}
const PAY_FIRST = [
  'Pay the TDS by the 7th of the next month.',
  'File the quarter TDS return (Form No. 140, old 26Q). Use the PAN on the platform invoice.',
  'After the certificate date, download the TDS certificate (Form No. 131, old 16A) from TRACES.',
];
export function playbookFor(id: string): Playbook {
  const key = id.startsWith('other:') ? 'other' : id.startsWith('credit:') ? 'credit' : id;
  switch (key) {
    case 'meta': return {
      where: 'Meta Business Help Centre: TDS refund form', link: 'https://www.facebook.com/business/help', channel: 'portal', refundAs: 'Ad credits in the ad account', time: 'Up to 2 months',
      steps: [...PAY_FIRST, 'Open Meta Business Help Centre. Search "TDS refund". Open the TDS refund form.', 'Enter the ad account ID, GSTIN, PAN and TAN. Select the transaction dates.', 'Upload the certificate. Paste the message in the description. Select Send.', 'Write the case number in the tool. Select Mark as claimed.'],
      attach: ['TDS certificate (Form No. 131) for the quarter, PDF', 'Bill list from this tool (Excel), if the form asks for details'],
    };
    case 'google': return {
      where: 'Email to Google India', to: 'tds.certificates@google.com', link: 'https://support.google.com/google-ads/answer/2375370', channel: 'email', refundAs: 'Ad credits in the Google Ads account', time: '1 to 3 weeks',
      steps: [...PAY_FIRST, 'Copy the email below. Send it to the address shown.', 'Attach the certificate, the Google Ads invoices and the bill list.', 'Write the case number from Google\'s reply in the tool. Select Mark as claimed.'],
      attach: ['TDS certificate (Form No. 131) for the quarter, PDF', 'Google Ads invoices of the quarter (Billing → Documents), PDF', 'Bill list from this tool (Excel: invoice no., date, amount, TDS)'],
      check: 'Check the address on the Google Ads help page "Taxes in your country" before the first claim.',
    };
    case 'amazon': return {
      where: 'Seller Central: case "TDS reimbursement"', link: 'https://sellercentral.amazon.in/help/hub/support', channel: 'ticket', refundAs: 'Credit to the seller account', time: '2 to 4 weeks',
      steps: [...PAY_FIRST, 'Open Seller Central. Select Help, then Get support.', 'Open a case with the subject "TDS reimbursement".', 'Paste the message. Attach the certificate and the bill list. Submit.', 'Write the case ID in the tool. Select Mark as claimed.'],
      attach: ['TDS certificate (Form No. 131) for the quarter, PDF', 'Bill list from this tool (Excel: Amazon invoice no., date, amount, TDS)'],
    };
    case 'porter': return {
      where: 'Porter Enterprise dashboard: Help & Support, or the account manager', channel: 'ticket', refundAs: 'Credit to the Porter Enterprise wallet', time: 'After Porter checks Form 26AS',
      steps: [...PAY_FIRST, 'Open the Porter Enterprise dashboard. Select Help & Support. Or write to the Porter account manager.', 'Paste the message. Attach the certificate and the bill list.', 'Write the ticket number in the tool. Select Mark as claimed.'],
      attach: ['TDS certificate (Form No. 131) for the quarter, PDF', 'Bill list from this tool (Excel)'],
    };
    case 'credit': return {
      where: 'Income-tax return (no claim to the platform)', channel: 'return', refundAs: 'Credit against our income tax', time: 'At the yearly return',
      steps: ['Download the platform\'s TDS certificate. Amazon: Seller Central → Reports → Tax Document Library.', 'Compare it with Form 26AS / AIS on the income-tax portal.', 'Send the certificates and the difference list to the CA for the return.'],
      attach: ['Platform TDS certificates of the quarter', 'Form 26AS / AIS print of the quarter'],
    };
    default: return {
      where: key === 'shiprocket' ? 'Shiprocket panel: Help → raise a ticket' : key === 'flipkart' ? 'Flipkart Seller Hub: Help → raise a ticket' : 'Email to the party\'s accounts team',
      channel: key === 'other' ? 'email' : 'ticket', refundAs: 'Refund or credit note', time: 'Ask the party',
      steps: [...PAY_FIRST, 'Send the message below with the certificate and the bill list.', 'Ask for the refund to our bank account or a credit to our account.', 'Write the reference in the tool. Select Mark as claimed.'],
      attach: ['TDS certificate (Form No. 131) for the quarter, PDF', 'Bill list from this tool (Excel)'],
      check: 'No public process found for this party. Confirm the address with them first.',
    };
  }
}

const money = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** The message to send for the selected quarters (pending ones). Plain text, ready to copy. */
export function claimMessage(p: ClaimPlatform, quarters: ClaimQuarter[], company: ClaimsApi['company'], s: ClaimSettings): { subject: string; body: string } {
  const qs = quarters.filter((q) => q.pending > 0.5);
  const total = qs.reduce((a, q) => a + q.pending, 0);
  const qBills = p.bills.filter((b) => qs.some((q) => q.quarter === b.quarter));
  const span = qs.map((q) => q.label).join(', ');
  const acct = p.id === 'meta' ? s.metaAdAccount && `Ad account ID: ${s.metaAdAccount}` : p.id === 'google' ? s.googleCustomerId && `Google Ads customer ID: ${s.googleCustomerId}` : p.id === 'porter' ? s.porterAccount && `Porter account: ${s.porterAccount}` : '';
  const lines = [
    `Dear ${p.id === 'other' || p.id.startsWith('other:') ? p.name : `${p.name.split(' (')[0]} team`},`,
    '',
    `We deducted TDS (contractor payments, old section 194C) on your invoices to us and paid it to the government. You charged us the full invoice amount. We request the refund of this TDS.`,
    '',
    `Company: ${company.name}`,
    `PAN: ${company.pan}`,
    `GSTIN: ${company.gstin}`,
    `TAN: ${s.tan || '<enter TAN in Settings>'}`,
    ...(acct ? [acct] : []),
    `Period: ${span}`,
    `Invoices: ${qBills.length}, taxable value ${money(qBills.reduce((a, b) => a + b.taxable, 0))}`,
    `TDS to refund: ${money(total)}`,
    '',
    'Attached:',
    '1. TDS certificate (Form No. 131, earlier Form 16A) for the period.',
    '2. List of invoices with the TDS on each.',
    ...(p.id === 'google' ? ['3. Google Ads invoices of the period.'] : []),
    '',
    'Please credit this amount to our account and confirm by reply.',
    '',
    'Regards,',
    s.contactName || '<name>',
    company.name,
    [s.contactPhone, s.contactEmail].filter(Boolean).join(' · ') || '<phone · email>',
  ];
  return { subject: `TDS refund request: ${company.name}, PAN ${company.pan}, ${span}, ${money(total)}`, body: lines.join('\n') };
}

export function billListRows(p: ClaimPlatform, quarters: string[]): (string | number)[][] {
  const rows = p.bills.filter((b) => quarters.includes(b.quarter));
  return [
    ['Date', 'Party', 'Invoice no.', 'Taxable value (Rs)', 'TDS (Rs)', 'TDS ledger', 'Tally voucher'],
    ...rows.map((b) => [`${b.date.slice(8, 10)}-${b.date.slice(5, 7)}-${b.date.slice(0, 4)}`, b.party, b.invoiceNo, b.taxable, b.tds, b.tdsLedger, b.voucher]),
    ['Total', '', `${rows.length} invoices`, Math.round(rows.reduce((a, b) => a + b.taxable, 0) * 100) / 100, Math.round(rows.reduce((a, b) => a + b.tds, 0) * 100) / 100, '', ''],
  ];
}
