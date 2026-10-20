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
  /** The Dr expense / fee ledger(s). "To confirm" when Hargun has not decided. */
  ledger: string;
  /** The Cr ledger — the platform collection ledger or the vendor's party ledger. */
  party?: string;
  /** What the books show — a real example voucher from Tally. */
  evidence?: string;
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

// The first seed (PR #314, written before the Tally data was analysed). Kept
// only so a stored map that still equals it can be upgraded to SEED.
const OLD_SEED: ExpenseMapRow[] = [
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

// The seed, built from Hargun's books (List of Ledgers + Trial Balance Oct-26,
// the Tally master JSON and the Apr-26 ledger vouchers). Ledger names verbatim.
const PLATFORM = 'Purchase-Expense';
const SEED: ExpenseMapRow[] = [
  {
    id: 'shiprocket',
    vendor: 'Shiprocket',
    keywords: ['shiprocket', 'bigfoot retail'],
    ledger:
      'Freight Charges (Shiprocket) · Forward Delivery - Shiprocket · RTO Charge - Shiprocket · Weight Discrepancy - Shiprocket · COD Handling Charge - Shiprocket · Early COD Remittance Fee - Shiprocket · Brand Boost - Shiprocket · Delivery Boost - Shiprocket · Shiprocket Generic Fee · Shipping Expenses (ShipRocket)',
    party: 'ShipRocket Collection',
    voucherType: PLATFORM,
    gst: 'IGST Input - 18%',
    tds: 'TDS Payable - 194C (Contractors)',
    notes: 'Dr each fee line to its Shiprocket ledger + IGST Input - 18%; Cr TDS Payable - 194C; Cr ShipRocket Collection for the net.',
    anchor: 'c27-shiprocket',
    status: 'confirmed',
    evidence:
      'Vch 65 (3-Apr-26, Purchase-Expense): Dr Brand Boost - Shiprocket 4,744.56 · Dr Delivery Boost - Shiprocket 6,390.36 · Dr IGST Input - 18% 2,004.28 · Cr TDS Payable - 194C (Contractors) 222.70 · Cr ShipRocket Collection 12,916.50',
  },
  {
    id: 'snapmint',
    vendor: 'Snapmint',
    keywords: ['snapmint'],
    ledger: 'BNPL Processing Fee - Snapmint',
    party: 'Snapmint Collection',
    voucherType: PLATFORM,
    gst: 'IGST Input - 18%',
    tds: 'TDS Payable - 194H (Commission)',
    notes: 'Narration used in the books: "BEING SNAPMINT SERVICES FEES BOOKED".',
    anchor: 'c27-snapmint',
    status: 'confirmed',
    evidence:
      'Vch 69 (30-Apr-26, Purchase-Expense): Dr BNPL Processing Fee - Snapmint 3,897.00 · Dr IGST Input - 18% 701.46 · Cr TDS Payable - 194H (Commission) 78.00 · Cr Snapmint Collection 4,520.46',
  },
  {
    id: 'easebuzz',
    vendor: 'Easebuzz',
    keywords: ['easebuzz'],
    ledger: 'PG Transaction Fee - Easebuzz · Refund Processing Fee - Easebuzz',
    party: 'Easebuzz Collection A/c',
    voucherType: PLATFORM,
    gst: 'IGST Input - 18%',
    tds: 'No TDS (ledger is set to no-TDS in the master)',
    notes:
      'WARNING: the daily settlement Journals (plugin) already book PG Transaction Fee per payout. The monthly invoice (Purchase-Expense) must not double-count — check what the daily Journals booked first.',
    anchor: 'c27-easebuzz',
    status: 'confirmed',
    evidence: 'Daily plugin Journals book PG Transaction Fee - Easebuzz per payout against Easebuzz Collection A/c.',
  },
  {
    id: 'amazon',
    vendor: 'Amazon (seller fees)',
    keywords: ['amazon', 'amazon seller services', 'asspl', 'fba fees'],
    ledger:
      'Amazon Channel Fees · Fixed Closing Fee - Amazon · Listing Fees - Amazon · Pick and Pack Fees - Amazon · FBA Weight Handling Fee - Amazon · FBA storage fee - Amazon · Inbound Transportation Fee- Amazon · Refund Processig Fee- Amazon · Removal Fee- Amazon · Shipping Charge Back Fee- Amazon · GIftwrap Fee- Amazon · Amazon Fees (Generic)',
    party: 'Amazon Expenses (Creditors)',
    voucherType: 'Purchase-Expense (fee invoices); also Amazon Commission, Debit Note, monthly Journal',
    gst: 'IGST Input - 18% — record all GST lines on the fee invoice',
    tds: 'TDS by Amazon → TDS (Amazon) (TDS Receivable - 194C (Ads) also exists); TCS → TCS-CGST (Amazon) / TCS-SGST (Amazon) / TCS-IGST (Amazon)',
    notes: 'Hargun: record all GSTs, plus the TDS and TCS entries. Ledger names are verbatim, typos included ("Refund Processig Fee- Amazon", "GIftwrap Fee- Amazon").',
    anchor: 'c27-amazon',
    status: 'confirmed',
    evidence: 'Vch 172 (6-Apr-26, Purchase-Expense): Dr Amazon Fees (Generic) 196.25 · Dr IGST Input - 18% 35.33 · Cr Amazon Expenses (Creditors) 231.58',
  },
  {
    id: 'shopflo',
    vendor: 'Shopflo',
    keywords: ['shopflo'],
    ledger: 'Checkout Fee - Shopflo',
    party: 'SHOPFLO TECHNOLOGIES PVT LTD',
    voucherType: PLATFORM,
    gst: 'GST input as per the invoice',
    tds: 'TDS Payable - 194J (Professional) — master setting; confirm with CA',
    notes: 'Checkout Fee - Shopflo is in use; Shopflo Annual Plan exists but is unused.',
    anchor: 'c27-shopflo',
    status: 'confirmed',
    evidence: 'Checkout Fee - Shopflo carries balances in the Oct-26 Trial Balance; master TDS category 194J.',
  },
  {
    id: 'meta',
    vendor: 'Facebook / Meta Ads',
    keywords: ['facebook', 'meta', 'fb ads', 'facebook india online services'],
    ledger: 'Meta Ads (Direct)',
    party: 'Facebook India Online Services Private Limited',
    voucherType: PLATFORM,
    gst: 'Domestic GST input (Indian entity — not RCM)',
    tds: 'TDS Payable - 194J (Professional) — master setting; ads are usually 194C, confirm with CA',
    notes: 'Agency-routed spend goes to Media Buying Agency - Google/FB.',
    anchor: 'c27-facebook',
    status: 'confirmed',
    evidence: 'Party Facebook India Online Services Private Limited in the List of Ledgers; Meta Ads (Direct) in use.',
  },
  {
    id: 'google-ads',
    vendor: 'Google Ads',
    keywords: ['google ads', 'google india', 'adwords'],
    ledger: 'Google Ads (Direct)',
    party: 'Google India Pvt Ltd',
    voucherType: PLATFORM,
    gst: 'Domestic GST input (Indian entity — not RCM)',
    tds: 'TDS Payable - 194J (Professional) — master setting; ads are usually 194C, confirm with CA',
    notes: 'Agency-routed spend goes to Media Buying Agency - Google/FB.',
    anchor: 'c27-google',
    status: 'confirmed',
    evidence: 'Party Google India Pvt Ltd in the List of Ledgers; Google Ads (Direct) in use.',
  },
  {
    id: 'bitespeed',
    vendor: 'Bitespeed (billed by Actartly)',
    keywords: ['bitespeed', 'bite speed', 'actartly'],
    ledger: 'Bitespeed Communication Charges',
    party: 'Actartly Technology Pvt. Ltd. (Bite Speed)',
    voucherType: PLATFORM,
    gst: 'GST input as per the invoice',
    tds: 'TDS Payable - 194J (Professional) — master setting; confirm with CA',
    notes: 'Bitespeed Communication Charges is in use; Bitespeed Subscription exists but is unused.',
    anchor: 'c27-bitespeed',
    status: 'confirmed',
    evidence: 'Bitespeed Communication Charges carries balances in the Oct-26 Trial Balance; party Actartly Technology Pvt. Ltd. (Bite Speed).',
  },
  {
    id: 'digistex',
    vendor: 'Digistex',
    keywords: ['digistex'],
    ledger: TO_CONFIRM,
    party: 'Digistex4u',
    voucherType: PLATFORM,
    gst: 'As per the invoice',
    tds: 'TDS on — party is Individual/HUF resident (section to confirm)',
    notes: 'The expense ledger is Hargun’s call.',
    anchor: 'c27-digistex',
    status: 'needs-info',
    suggestion: 'Media Buying Agency - Google/FB',
    evidence: 'Party Digistex4u (Individual/HUF, resident, TDS applicable) in the master.',
  },
  {
    id: 'shopify',
    vendor: 'Shopify',
    keywords: ['shopify'],
    ledger: 'Shopify Subscription',
    voucherType: PLATFORM,
    gst: 'Foreign vendor → RCM: Dr Input Igst RCM; the RCM payable ledger was not found',
    tds: 'To confirm with CA (foreign vendor)',
    notes: 'Shopify Subscription exists but nothing is booked to it yet. Input Igst RCM exists (₹8,398.92 used). Needs Hargun/CA: RCM payable ledger and party ledger.',
    anchor: 'c27-shopify',
    status: 'needs-info',
  },
  {
    id: 'claude',
    vendor: 'AI tools (Claude / Anthropic)',
    keywords: ['anthropic', 'claude', 'openai', 'chatgpt'],
    ledger: 'AI Tools - Anthropic & Others',
    voucherType: PLATFORM,
    gst: 'Foreign vendor → RCM (Input Igst RCM); RCM payable ledger to confirm',
    tds: 'To confirm with CA (foreign vendor)',
    notes: 'AI Tools - Anthropic & Others exists but is unused. Party ledger and RCM payable ledger to confirm.',
    anchor: 'c27-claude',
    status: 'needs-info',
  },
  {
    id: 'gcloud',
    vendor: 'Google Cloud',
    keywords: ['google cloud', 'gcp', 'cloud run', 'google workspace'],
    ledger: TO_CONFIRM,
    voucherType: PLATFORM,
    gst: 'To confirm (billing entity decides domestic GST vs RCM)',
    tds: 'To confirm',
    notes: 'No Google Cloud ledger exists in the books.',
    anchor: 'c27-gcloud',
    status: 'needs-info',
    suggestion: 'Create "Google Cloud" under Operations Platform Subscriptions',
  },
];

/**
 * The booking pattern and real example vouchers from the books — bundled so
 * the assistant has voucher-level history before anyone uploads a Day Book.
 */
export const BUNDLED_HISTORY = `## Booking pattern from Hargun's books (Tally, Apr–Oct 2026) — bundled with the app
Platform fee invoices (Shiprocket, Snapmint, Easebuzz, Amazon fees, …): voucher **Purchase-Expense**; Dr the fee ledger(s) + IGST Input - 18%; Cr the TDS payable ledger (where TDS applies); Cr the platform COLLECTION ledger for the net (not a separate creditor).

Example vouchers:
- Shiprocket — Vch 65, 3-Apr-26, Purchase-Expense: Dr Brand Boost - Shiprocket 4,744.56; Dr Delivery Boost - Shiprocket 6,390.36; Dr IGST Input - 18% 2,004.28; Cr TDS Payable - 194C (Contractors) 222.70; Cr ShipRocket Collection 12,916.50.
- Snapmint — Vch 69, 30-Apr-26, Purchase-Expense: Dr BNPL Processing Fee - Snapmint 3,897.00; Dr IGST Input - 18% 701.46; Cr TDS Payable - 194H (Commission) 78.00; Cr Snapmint Collection 4,520.46. Narration "BEING SNAPMINT SERVICES FEES BOOKED".
- Amazon — Vch 172, 6-Apr-26, Purchase-Expense: Dr Amazon Fees (Generic) 196.25; Dr IGST Input - 18% 35.33; Cr Amazon Expenses (Creditors) 231.58. Other voucher types on Amazon Expenses (Creditors): Amazon Commission, Debit Note, monthly Journal. TCS ledgers: TCS-CGST (Amazon), TCS-SGST (Amazon), TCS-IGST (Amazon); TDS deducted by Amazon: TDS (Amazon) (TDS Receivable - 194C (Ads) also exists).
- Easebuzz — no TDS (ledger set no-TDS). The daily settlement Journals from the plugin already book PG Transaction Fee - Easebuzz per payout; the monthly invoice (Purchase-Expense against Easebuzz Collection A/c) must not double-count it.

Vendor party ledgers (verbatim): SHOPFLO TECHNOLOGIES PVT LTD (Dr Checkout Fee - Shopflo); Facebook India Online Services Private Limited (Dr Meta Ads (Direct); Indian entity → domestic GST, not RCM); Google India Pvt Ltd (Dr Google Ads (Direct); domestic GST); Actartly Technology Pvt. Ltd. (Bite Speed) (Dr Bitespeed Communication Charges); Digistex4u (Individual/HUF resident, TDS on; expense ledger open — likely Media Buying Agency - Google/FB, needs Hargun). Foreign SaaS (Shopify → Shopify Subscription, Anthropic → AI Tools - Anthropic & Others): RCM via Input Igst RCM; no RCM payable ledger was found — say "to confirm with Hargun/CA". Google Cloud has no ledger yet.

CA flag: the master sets TDS 194J on the Google, Meta, Bitespeed and Shopflo ledgers. Advertising is usually 194C. Answer with the master's setting (194J) but always add "confirm with CA" on the TDS line for these.`;

const str =(v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

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
    const ledger = str(r.ledger, 600) || TO_CONFIRM;
    // A row without a decided ledger always needs Hargun; otherwise keep the flag the editor set.
    const status: MapRowStatus = ledger === TO_CONFIRM || r.status === 'needs-info' ? 'needs-info' : 'confirmed';
    const anchor = str(r.anchor, 80).replace(/^\/?handbook#/, '').replace(/^#/, '');
    const suggestion = str(r.suggestion, 300);
    const party = str(r.party, 160);
    const evidence = str(r.evidence, 600);
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
      ...(party ? { party } : {}),
      ...(evidence ? { evidence } : {}),
    });
  }
  return out;
}

/** The map; seeds Hargun's starting rules the first time (store empty). */
export async function readExpenseMap(): Promise<ExpenseMapDoc> {
  const doc = await readJson<ExpenseMapDoc | null>(DOC, null);
  if (doc && Array.isArray(doc.rows)) {
    const rows = normaliseRows(doc.rows);
    // One-time upgrade: a stored map nobody has edited (still exactly the first
    // seed) is replaced by the books-based seed. Any user edit blocks this.
    if (JSON.stringify(rows) === JSON.stringify(normaliseRows(OLD_SEED))) {
      const upgraded: ExpenseMapDoc = { rows: SEED, updatedAt: new Date().toISOString(), updatedBy: 'seed-v2' };
      try {
        await writeJson(DOC, upgraded);
      } catch (err) {
        console.error('expense-map seed upgrade failed:', err);
      }
      return upgraded;
    }
    return { rows, updatedAt: doc.updatedAt ?? null, updatedBy: doc.updatedBy };
  }
  const seeded: ExpenseMapDoc = { rows: SEED, updatedAt: new Date().toISOString(), updatedBy: 'seed-v2' };
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
    '| Vendor / category | Match keywords | Dr ledger(s) | Cr / party ledger | Voucher type | GST | TDS | Notes | Evidence from the books | Handbook | Status | Closest Tally ledger (unconfirmed) |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows
    .map((r) =>
      `| ${esc(r.vendor)} | ${esc(r.keywords.join(', '))} | ${esc(r.ledger)} | ${esc(r.party ?? '')} | ${esc(r.voucherType)} | ${esc(r.gst)} | ${esc(r.tds)} | ${esc(r.notes)} | ${esc(r.evidence ?? '')} | ${r.anchor ? `/handbook#${r.anchor}` : '—'} | ${r.status === 'confirmed' ? (r.evidence ? 'Confirmed (from books)' : 'Confirmed by Hargun') : 'NEEDS HARGUN'} | ${esc(r.suggestion ?? '')} |`,
    )
    .join('\n');
  return `${head}\n${body}`;
}
