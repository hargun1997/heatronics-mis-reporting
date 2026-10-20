// ----------------------------------------------------------------------------
// Expense → ledger map — the maintained "which ledger does this vendor go to"
// table the Booking assistant reasons from. Stored as one JSON document in the
// config store (GCS in prod, local file in dev) and edited from the UI.
//
// The map is seeded ONCE (when the store has no document) with Hargun's rules.
// Rows Hargun has not decided yet carry status "needs-info" and ledger
// "To confirm" — the assistant is told to say so rather than invent a ledger.
// `suggestion` holds the closest ledger(s) already present in the Tally master,
// as a starting point for Hargun to confirm; it is NOT a decision.
// ----------------------------------------------------------------------------

import { readJson, writeJson } from '../ingest/objectStore.js';

export type MapRowStatus = 'confirmed' | 'needs-info';

export interface ExpenseMapRow {
  id: string;
  /** Vendor or expense category, e.g. "Shiprocket", "Google Ads". */
  vendor: string;
  /** Words on an invoice / bank line that identify this vendor. */
  keywords: string[];
  /** The ledger to book to. "To confirm" when Hargun has not decided. */
  ledger: string;
  /** Voucher type in Tally, if fixed (e.g. "Purchase-Services", "Journal"). */
  voucherType: string;
  /** GST treatment — input CGST/SGST/IGST, RCM, exempt… */
  gst: string;
  /** TDS section and note, e.g. "194J @ 10%". */
  tds: string;
  notes: string;
  /** Handbook anchor id, e.g. "c27-shopflo" (linked as /handbook#c27-shopflo). */
  anchor: string;
  status: MapRowStatus;
  /** Closest existing Tally ledgers, for Hargun to confirm. Not a decision. */
  suggestion?: string;
}

export interface ExpenseMapDoc {
  rows: ExpenseMapRow[];
  updatedAt: string | null;
  updatedBy?: string;
}

const DOC = 'expense-map';
export const TO_CONFIRM = 'To confirm';

const SEED: ExpenseMapRow[] = [
  {
    id: 'shiprocket',
    vendor: 'Shiprocket',
    keywords: ['shiprocket', 'bigfoot retail'],
    ledger: 'Shiprocket Collection',
    voucherType: '',
    gst: 'Input GST as per the invoice',
    tds: '',
    notes: 'Hargun: book Shiprocket bills against the Shiprocket Collection ledger.',
    anchor: 'c27-shiprocket',
    status: 'confirmed',
  },
  {
    id: 'easebuzz',
    vendor: 'Easebuzz',
    keywords: ['easebuzz'],
    ledger: 'Easebuzz Collection',
    voucherType: '',
    gst: 'Input GST as per the invoice',
    tds: '',
    notes: 'Hargun: book Easebuzz charges against the Easebuzz Collection ledger.',
    anchor: 'c27-easebuzz',
    status: 'confirmed',
  },
  {
    id: 'snapmint',
    vendor: 'Snapmint',
    keywords: ['snapmint'],
    ledger: 'Snapmint Collection',
    voucherType: '',
    gst: 'Input GST as per the invoice',
    tds: '',
    notes: 'Hargun: book Snapmint charges against the Snapmint Collection ledger.',
    anchor: 'c27-snapmint',
    status: 'confirmed',
  },
  {
    id: 'amazon',
    vendor: 'Amazon (seller fees)',
    keywords: ['amazon', 'amazon seller services', 'asspl', 'fba fees'],
    ledger: 'Amazon Expenses (Creditors)',
    voucherType: '',
    gst: 'Record ALL GST lines on the fee invoice',
    tds: 'Record the TDS entry, and the TCS entry',
    notes: 'Monthly fee invoice: record all GSTs, plus the TDS and TCS entries.',
    anchor: 'c27-amazon',
    status: 'confirmed',
  },
  {
    id: 'shopflo',
    vendor: 'Shopflo',
    keywords: ['shopflo'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: 'Checkout fees + annual plan.',
    anchor: 'c27-shopflo',
    status: 'needs-info',
    suggestion: 'Checkout Fee - Shopflo / Shopflo Annual Plan · party SHOPFLO TECHNOLOGIES PVT LTD',
  },
  {
    id: 'meta',
    vendor: 'Facebook / Meta Ads',
    keywords: ['facebook', 'meta', 'meta platforms', 'fb ads'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: 'Billing entity (Meta Ireland vs an Indian entity) decides RCM vs regular input — confirm.',
    anchor: 'c27-facebook',
    status: 'needs-info',
    suggestion: 'Meta Ads (Direct)',
  },
  {
    id: 'google-ads',
    vendor: 'Google Ads',
    keywords: ['google ads', 'google india', 'adwords'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: '',
    anchor: 'c27-google',
    status: 'needs-info',
    suggestion: 'Google Ads (Direct)',
  },
  {
    id: 'bitespeed',
    vendor: 'Bitespeed (billed by Actartly)',
    keywords: ['bitespeed', 'actartly'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: 'Invoices come from Actartly Technology Private Limited.',
    anchor: 'c27-bitespeed',
    status: 'needs-info',
    suggestion: 'Bitespeed Subscription / Bitespeed Communication Charges · party Actartly Technology Private Limited',
  },
  {
    id: 'digistex',
    vendor: 'Digistex',
    keywords: ['digistex'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: '',
    anchor: 'c27-digistex',
    status: 'needs-info',
    suggestion: 'party Digistex4u (Service Creditors)',
  },
  {
    id: 'shopify',
    vendor: 'Shopify',
    keywords: ['shopify'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: 'Shopify bills in USD from abroad — import of service, likely RCM; confirm with CA.',
    anchor: 'c27-shopify',
    status: 'needs-info',
    suggestion: 'Shopify Subscription',
  },
  {
    id: 'claude',
    vendor: 'AI tools (Claude / Anthropic)',
    keywords: ['anthropic', 'claude', 'openai', 'chatgpt'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: 'Foreign vendor billed in USD — import of service, likely RCM; confirm with CA.',
    anchor: 'c27-claude',
    status: 'needs-info',
    suggestion: 'AI Tools - Anthropic & Others',
  },
  {
    id: 'gcloud',
    vendor: 'Google Cloud',
    keywords: ['google cloud', 'gcp', 'cloud run', 'google workspace'],
    ledger: TO_CONFIRM,
    voucherType: '',
    gst: '',
    tds: '',
    notes: '',
    anchor: 'c27-gcloud',
    status: 'needs-info',
  },
];

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Treat any client payload as untrusted: coerce every field, drop empty rows. */
export function normaliseRows(input: unknown): ExpenseMapRow[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ExpenseMapRow[] = [];
  for (const raw of input.slice(0, 500)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const vendor = str(r.vendor, 120);
    if (!vendor) continue;
    let id = str(r.id, 80) || vendor.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    while (seen.has(id)) id += '-2';
    seen.add(id);
    const keywords = Array.isArray(r.keywords)
      ? r.keywords.map((k) => str(k, 60).toLowerCase()).filter(Boolean).slice(0, 20)
      : str(r.keywords).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    const ledger = str(r.ledger, 160) || TO_CONFIRM;
    // A row without a decided ledger always needs Hargun; otherwise keep the flag the editor set.
    const status: MapRowStatus = ledger === TO_CONFIRM || r.status === 'needs-info' ? 'needs-info' : 'confirmed';
    const anchor = str(r.anchor, 80).replace(/^\/?handbook#/, '').replace(/^#/, '');
    const suggestion = str(r.suggestion, 300);
    out.push({
      id,
      vendor,
      keywords,
      ledger,
      voucherType: str(r.voucherType, 80),
      gst: str(r.gst, 200),
      tds: str(r.tds, 200),
      notes: str(r.notes, 600),
      anchor,
      status,
      ...(suggestion ? { suggestion } : {}),
    });
  }
  return out;
}

/** The map; seeds Hargun's starting rules the first time (store empty). */
export async function readExpenseMap(): Promise<ExpenseMapDoc> {
  const doc = await readJson<ExpenseMapDoc | null>(DOC, null);
  if (doc && Array.isArray(doc.rows)) return { rows: normaliseRows(doc.rows), updatedAt: doc.updatedAt ?? null, updatedBy: doc.updatedBy };
  const seeded: ExpenseMapDoc = { rows: SEED, updatedAt: new Date().toISOString(), updatedBy: 'seed' };
  try {
    await writeJson(DOC, seeded);
  } catch (err) {
    console.error('expense-map seed write failed:', err);
  }
  return seeded;
}

export async function writeExpenseMap(rows: unknown, updatedBy?: string): Promise<ExpenseMapDoc> {
  const doc: ExpenseMapDoc = {
    rows: normaliseRows(rows),
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy: str(updatedBy, 80) } : {}),
  };
  await writeJson(DOC, doc);
  return doc;
}

/** The map as a compact markdown table for the system prompt. */
export function expenseMapForPrompt(rows: ExpenseMapRow[]): string {
  const esc = (s: string) => (s || '—').replace(/\|/g, '/').replace(/\n/g, ' ');
  const head =
    '| Vendor / category | Match keywords | Ledger | Voucher type | GST | TDS | Notes | Handbook | Status | Closest Tally ledger (unconfirmed) |\n' +
    '|---|---|---|---|---|---|---|---|---|---|';
  const body = rows
    .map((r) =>
      `| ${esc(r.vendor)} | ${esc(r.keywords.join(', '))} | ${esc(r.ledger)} | ${esc(r.voucherType)} | ${esc(r.gst)} | ${esc(r.tds)} | ${esc(r.notes)} | ${r.anchor ? `/handbook#${r.anchor}` : '—'} | ${r.status === 'confirmed' ? 'Confirmed by Hargun' : 'NEEDS HARGUN'} | ${esc(r.suggestion ?? '')} |`,
    )
    .join('\n');
  return `${head}\n${body}`;
}
