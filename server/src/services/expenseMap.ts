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

/** 'out-of-scope' = not booked at Heatronics for now (not counted as needing Hargun). */
export type MapRowStatus = 'confirmed' | 'needs-info' | 'out-of-scope';

/** A structured sub-rule, e.g. Amazon invoice type → ledgers. */
export interface MapSubRule {
  /** The condition, e.g. 'Invoice type "Merchant VAT Invoice"'. */
  when: string;
  /** What to book, e.g. "Purchase-Expense · Dr Amazon Channel Fees …". */
  then: string;
}

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
  /** Where to download the vendor's invoices (official portal link). */
  link?: string;
  /** What to download there / how to read it. */
  linkNote?: string;
  /** Structured sub-rules (e.g. invoice type → ledger). */
  subRules?: MapSubRule[];
  /** Voucher type in Tally, if fixed (e.g. "Purchase-Services", "Journal"). */
  voucherType: string;
  /** GST treatment — input CGST/SGST/IGST, exempt… */
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
const SEED_V1: ExpenseMapRow[] = [
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

// Second seed (v2) — kept only for the one-time upgrade. Built from Hargun's books (List of Ledgers + Trial Balance Oct-26,
// the Tally master JSON and the Apr-26 ledger vouchers). Ledger names verbatim.
const PLATFORM = 'Purchase-Expense';
const SEED_V2: ExpenseMapRow[] = [
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

// The current seed (v3) — Hargun's books + his Oct-26 instructions:
// no RCM at Heatronics; Shopify and Anthropic out of scope for now; official
// invoice download links; Amazon invoice type → ledger sub-rules.
const SEED: ExpenseMapRow[] = [
  {
    id: 'shiprocket',
    vendor: 'Shiprocket',
    keywords: ['shiprocket', 'bigfoot retail', 'srf', 'srv', 'src'],
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
    link: 'https://app.shiprocket.in/seller/bills/invoices',
    linkNote: 'Every month download Invoices, Debit Notes AND Credit Notes.',
    subRules: [
      { when: 'Invoice series SRF… (Freight)', then: 'Purchase-Expense · Dr the freight / delivery / RTO / weight ledgers + IGST Input - 18% · Cr TDS Payable - 194C · Cr ShipRocket Collection' },
      { when: 'Invoice series SRV… (Value-added services)', then: 'Purchase-Expense · Dr Brand Boost / Delivery Boost / Shiprocket Generic Fee + IGST Input - 18% · Cr TDS Payable - 194C · Cr ShipRocket Collection' },
      { when: 'Invoice series SRC… (COD Remittance Fee)', then: 'Purchase-Expense · Dr Early COD Remittance Fee - Shiprocket / COD Handling Charge - Shiprocket + IGST Input - 18% · Cr TDS Payable - 194C · Cr ShipRocket Collection' },
      { when: 'Shiprocket Debit Note', then: 'Book like an invoice — Purchase-Expense' },
      { when: 'Shiprocket Credit Note', then: 'Debit Note voucher — reverse the fee ledger (and IGST Input - 18%) against ShipRocket Collection' },
    ],
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
    link: 'https://emis.snapmint.com/merchants/monthly_invoices',
    linkNote: 'Download the Invoice PDF and the Working CSV.',
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
    link: 'https://dashboard.easebuzz.in/payouts/invoices',
  },
  {
    id: 'amazon',
    vendor: 'Amazon (seller fees)',
    keywords: ['amazon', 'amazon seller services', 'asspl', 'fba fees', 'merchant vat invoice', 'product ads'],
    ledger:
      'Amazon Channel Fees · Fixed Closing Fee - Amazon · Listing Fees - Amazon · Pick and Pack Fees - Amazon · FBA Weight Handling Fee - Amazon · FBA storage fee - Amazon · Inbound Transportation Fee- Amazon · Refund Processig Fee- Amazon · Removal Fee- Amazon · Shipping Charge Back Fee- Amazon · GIftwrap Fee- Amazon · Amazon Fees (Generic) · Amazon Ads',
    party: 'Amazon Expenses (Creditors)',
    voucherType: 'Purchase-Expense (fee invoices); Debit Note (credit notes); also Amazon Commission and the monthly Journal on this ledger',
    gst: 'IGST Input - 18% — record all GST lines; book under the Heatronics GSTIN on the invoice (Payer Registration 09 UP / 27 MH / 29 KA / 36 TG)',
    tds: 'TDS by Amazon → TDS (Amazon) (TDS Receivable - 194C (Ads) also exists); TCS → TCS-CGST (Amazon) / TCS-SGST (Amazon) / TCS-IGST (Amazon)',
    notes: 'Hargun: record all GSTs, plus the TDS and TCS entries. Ledger names are verbatim, typos included ("Refund Processig Fee- Amazon", "GIftwrap Fee- Amazon").',
    anchor: 'c27-amazon',
    status: 'confirmed',
    evidence: 'Vch 172 (6-Apr-26, Purchase-Expense): Dr Amazon Fees (Generic) 196.25 · Dr IGST Input - 18% 35.33 · Cr Amazon Expenses (Creditors) 231.58',
    link: 'https://sellercentral.amazon.in/tax/seller-fee-invoices',
    linkNote: 'Download all invoices of the month.',
    subRules: [
      { when: '"Merchant VAT Invoice"', then: 'Purchase-Expense · Dr selling-fee ledgers (Amazon Channel Fees, Fixed Closing Fee - Amazon, Listing Fees - Amazon, Refund Processig Fee- Amazon, Shipping Charge Back Fee- Amazon …) + IGST Input - 18% · Cr Amazon Expenses (Creditors)' },
      { when: '"Fulfillment by Amazon Tax Invoice"', then: 'Purchase-Expense · Dr FBA ledgers (Pick and Pack Fees - Amazon, FBA Weight Handling Fee - Amazon, FBA storage fee - Amazon, Inbound Transportation Fee- Amazon, Removal Fee- Amazon …) + IGST Input - 18% · Cr Amazon Expenses (Creditors)' },
      { when: '"Product Ads VAT Invoice"', then: 'Purchase-Expense · Dr Amazon Ads + IGST Input - 18% · Cr Amazon Expenses (Creditors)' },
      { when: '"Merchant VAT Credit Note"', then: 'Debit Note voucher — reverse the fee ledger + IGST Input - 18% against Amazon Expenses (Creditors)' },
      { when: 'Any Amazon invoice', then: 'Book under the Heatronics GSTIN shown as Payer Registration on the invoice: 09 UP / 27 MH / 29 KA / 36 TG' },
    ],
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
    link: 'https://dashboard.shopflo.com/billing#invoices',
  },
  {
    id: 'meta',
    vendor: 'Facebook / Meta Ads',
    keywords: ['facebook', 'meta', 'fb ads', 'facebook india online services'],
    ledger: 'Meta Ads (Direct)',
    party: 'Facebook India Online Services Private Limited',
    voucherType: PLATFORM,
    gst: 'Domestic GST input (Indian entity)',
    tds: 'TDS Payable - 194J (Professional) — master setting; ads are usually 194C, confirm with CA',
    notes: 'Agency-routed spend goes to Media Buying Agency - Google/FB.',
    anchor: 'c27-facebook',
    status: 'confirmed',
    evidence: 'Party Facebook India Online Services Private Limited in the List of Ledgers; Meta Ads (Direct) in use.',
    link: 'https://business.facebook.com/latest/billing_hub/payment_activity?business_id=488618164122715&asset_id=2294012640954204&payment_account_id=2294012640954204',
    linkNote: 'Filter Payment status = Paid and download the VAT invoice "FBADS-605-…" for every paid transaction — several per month.',
  },
  {
    id: 'google-ads',
    vendor: 'Google Ads',
    keywords: ['google ads', 'google india', 'adwords'],
    ledger: 'Google Ads (Direct)',
    party: 'Google India Pvt Ltd',
    voucherType: PLATFORM,
    gst: 'Domestic GST input (Indian entity)',
    tds: 'TDS Payable - 194J (Professional) — master setting; ads are usually 194C, confirm with CA',
    notes: 'Agency-routed spend goes to Media Buying Agency - Google/FB.',
    anchor: 'c27-google',
    status: 'confirmed',
    evidence: 'Party Google India Pvt Ltd in the List of Ledgers; Google Ads (Direct) in use.',
    link: 'https://ads.google.com/aw/billing/documents?ocid=1525533322',
    linkNote: 'Billing → Documents → Invoice — one invoice per month.',
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
    link: 'https://marketing.bitespeed.co/settings',
    linkNote: 'Billing → Payment History. The list shows ₹0 for wallet top-ups — use the Invoice + Billing Breakdown for the real charges.',
  },
  {
    id: 'blinkit',
    vendor: 'Blinkit (seller fees)',
    keywords: ['blinkit', 'blink commerce', 'grofers'],
    ledger:
      'Commission - Blinkit · Storage Fee - Blinkit · Shipping Fee- Blinkit · Logistics / Handling Fee - Blinkit · Returns Processing Fee - Blinkit · Blinkit Advertising · Blinkit Banners & Visibility Fee',
    party: 'Blink Commerce Private Limited (<state of invoice>)',
    voucherType: 'Purchase-Expense (fee invoices); Debit Note (credit notes)',
    gst: 'GST input as per the invoice',
    tds: 'TDS is deducted on Blinkit fees — Cr TDS Payable - 194H (Commission) on commission; section for other fee lines per CA',
    notes: 'Invoices are per state — Cr the Blink Commerce Private Limited ledger for the state on the invoice. Transfer invoices are SALES, already booked from Tranzact — do NOT book them as expenses.',
    anchor: 'c27-blinkit',
    status: 'confirmed',
    link: 'https://seller.blinkit.com/dashboard/billing?billing=invoices',
    linkNote: 'Billing → Invoices, per state.',
    subRules: [
      { when: 'Commission Fee', then: 'Dr Commission - Blinkit' },
      { when: 'Storage Fee', then: 'Dr Storage Fee - Blinkit' },
      { when: 'Shipping Fee', then: 'Dr Shipping Fee- Blinkit' },
      { when: 'Logistics', then: 'Dr Logistics / Handling Fee - Blinkit' },
      { when: 'Returns', then: 'Dr Returns Processing Fee - Blinkit' },
      { when: 'Ads', then: 'Dr Blinkit Advertising' },
      { when: 'Banners', then: 'Dr Blinkit Banners & Visibility Fee' },
      { when: 'Transfer invoice', then: 'Not an expense — it is a sale, already booked from Tranzact. Do not book it here.' },
      { when: 'Blinkit credit note', then: 'Debit Note voucher — reverse the fee ledger + GST against Blink Commerce Private Limited (<state>)' },
    ],
  },
  {
    id: 'flipkart',
    vendor: 'Flipkart (seller fees)',
    keywords: ['flipkart', 'commission invoice'],
    ledger: 'Flipkart -Commision Fees · Fixed Fees-Flipkart · Flipkart Ad Services Fee',
    party: 'Flipkart Seller Account',
    voucherType: PLATFORM,
    gst: 'GST input as per the invoice',
    tds: 'TDS is deducted on Flipkart fees — Cr the TDS Payable ledger (section per CA)',
    notes:
      'Dr one of the three fee ledgers per line (commission / fixed fee / ad services); Cr Flipkart Seller Account. Ledger names verbatim ("Flipkart -Commision Fees"). Download: Seller Hub → Reports → Report centre → Invoices → "Commission Invoice" + "Commission Invoice Transaction Details" (ready around the 8th).',
    anchor: 'c27-flipkart',
    status: 'confirmed',
  },
  {
    id: 'digistex',
    vendor: 'Digistex',
    keywords: ['digistex'],
    ledger: 'Media Buying Agency - Google/FB',
    party: 'Digistex4u',
    voucherType: PLATFORM,
    gst: 'GST input as per the invoice',
    tds: 'TDS is deducted — Cr the TDS Payable ledger per the Digistex4u master setting (Individual/HUF resident)',
    notes: 'Confirmed by Hargun: Dr Media Buying Agency - Google/FB + GST, Cr Digistex4u, deduct TDS.',
    anchor: 'c27-digistex',
    status: 'confirmed',
    evidence: 'Party Digistex4u (Individual/HUF, resident, TDS applicable) in the master.',
  },
  {
    id: 'gcloud',
    vendor: 'Google Cloud',
    keywords: ['google cloud', 'gcp', 'cloud run', 'google workspace'],
    ledger: TO_CONFIRM,
    voucherType: PLATFORM,
    gst: 'As per the invoice',
    tds: 'To confirm',
    notes: 'No Google Cloud ledger exists in the books.',
    anchor: 'c27-gcloud',
    status: 'needs-info',
    suggestion: 'Create "Google Cloud" under Operations Platform Subscriptions',
  },
  {
    id: 'shopify',
    vendor: 'Shopify',
    keywords: ['shopify'],
    ledger: 'Shopify Subscription',
    voucherType: '',
    gst: '',
    tds: '',
    notes: 'Not booked at Heatronics for now (Hargun). If a Shopify bill comes up, ask Hargun before booking.',
    anchor: 'c27-shopify',
    status: 'out-of-scope',
  },
  {
    id: 'claude',
    vendor: 'AI tools (Claude / Anthropic)',
    keywords: ['anthropic', 'claude'],
    ledger: 'AI Tools - Anthropic & Others',
    voucherType: '',
    gst: '',
    tds: '',
    notes: 'Not booked at Heatronics for now (Hargun). If an Anthropic / Claude bill comes up, ask Hargun before booking.',
    anchor: 'c27-claude',
    status: 'out-of-scope',
  },
];

/**
 * The booking pattern, real example vouchers and Hargun's standing rules —
 * bundled so the assistant has voucher-level history before anyone uploads a
 * Day Book.
 */
export const BUNDLED_HISTORY = `## Booking pattern from Hargun's books (Tally, Apr–Oct 2026) — bundled with the app
Platform fee invoices (Shiprocket, Snapmint, Easebuzz, Amazon fees, …): voucher **Purchase-Expense**; Dr the fee ledger(s) + IGST Input - 18%; Cr the TDS payable ledger (where TDS applies); Cr the platform COLLECTION ledger for the net (not a separate creditor).

Example vouchers:
- Shiprocket — Vch 65, 3-Apr-26, Purchase-Expense: Dr Brand Boost - Shiprocket 4,744.56; Dr Delivery Boost - Shiprocket 6,390.36; Dr IGST Input - 18% 2,004.28; Cr TDS Payable - 194C (Contractors) 222.70; Cr ShipRocket Collection 12,916.50.
- Snapmint — Vch 69, 30-Apr-26, Purchase-Expense: Dr BNPL Processing Fee - Snapmint 3,897.00; Dr IGST Input - 18% 701.46; Cr TDS Payable - 194H (Commission) 78.00; Cr Snapmint Collection 4,520.46. Narration "BEING SNAPMINT SERVICES FEES BOOKED".
- Amazon — Vch 172, 6-Apr-26, Purchase-Expense: Dr Amazon Fees (Generic) 196.25; Dr IGST Input - 18% 35.33; Cr Amazon Expenses (Creditors) 231.58. Other voucher types on Amazon Expenses (Creditors): Amazon Commission, Debit Note, monthly Journal. TCS ledgers: TCS-CGST (Amazon), TCS-SGST (Amazon), TCS-IGST (Amazon); TDS deducted by Amazon: TDS (Amazon) (TDS Receivable - 194C (Ads) also exists).
- Easebuzz — no TDS (ledger set no-TDS). The daily settlement Journals from the plugin already book PG Transaction Fee - Easebuzz per payout; the monthly invoice (Purchase-Expense against Easebuzz Collection A/c) must not double-count it.

## Amazon fee invoices — invoice type → ledger (Cr Amazon Expenses (Creditors), Purchase-Expense, IGST Input - 18%)
- "Merchant VAT Invoice" → selling-fee ledgers: Amazon Channel Fees, Fixed Closing Fee - Amazon, Listing Fees - Amazon, Refund Processig Fee- Amazon, Shipping Charge Back Fee- Amazon …
- "Fulfillment by Amazon Tax Invoice" → FBA ledgers: Pick and Pack Fees - Amazon, FBA Weight Handling Fee - Amazon, FBA storage fee - Amazon, Inbound Transportation Fee- Amazon, Removal Fee- Amazon …
- "Product Ads VAT Invoice" → Amazon Ads.
- "Merchant VAT Credit Note" → Debit Note voucher (reverse the fee + IGST against Amazon Expenses (Creditors)).
- Every Amazon invoice is raised on a specific Heatronics GSTIN (Payer Registration: 09 UP / 27 MH / 29 KA / 36 TG) — book it under that GSTIN/registration.
- Download: Seller Central → https://sellercentral.amazon.in/tax/seller-fee-invoices (all invoices of the month).

## Ads invoices
- Meta: one VAT invoice ("FBADS-605-…") per paid transaction — several per month; book each (Purchase-Expense, Dr Meta Ads (Direct) + GST input, Cr Facebook India Online Services Private Limited, TDS per the CA flag). Download from Billing hub → Payment activity, filter Payment status = Paid.
- Google Ads: one invoice per month (Billing → Documents → Invoice); Purchase-Expense, Dr Google Ads (Direct) + GST input, Cr Google India Pvt Ltd.

## Blinkit fee invoices (Purchase-Expense; Cr Blink Commerce Private Limited (<state of invoice>); GST input)
Download per state from https://seller.blinkit.com/dashboard/billing?billing=invoices (Billing → Invoices). Fee → Dr ledger: Commission Fee → Commission - Blinkit; Storage Fee → Storage Fee - Blinkit; Shipping Fee → Shipping Fee- Blinkit; Logistics → Logistics / Handling Fee - Blinkit; Returns → Returns Processing Fee - Blinkit; Ads → Blinkit Advertising; Banners → Blinkit Banners & Visibility Fee. TDS IS deducted on Blinkit fees (TDS Payable - 194H (Commission) on commission; section for other fee lines per CA). Transfer invoices are SALES, already booked from Tranzact — never book them as an expense. Blinkit credit notes → Debit Note voucher.

## Flipkart fee invoices (Purchase-Expense; Cr Flipkart Seller Account; GST input; TDS IS deducted — section per CA)
Dr one of: Flipkart -Commision Fees, Fixed Fees-Flipkart, Flipkart Ad Services Fee. Download: Seller Hub → Reports → Report centre → Invoices → "Commission Invoice" + "Commission Invoice Transaction Details" (ready around the 8th).

## Shiprocket documents
Download Invoices, Debit Notes AND Credit Notes every month from https://app.shiprocket.in/seller/bills/invoices. Invoice series: Freight (SRF…), VAS (SRV…), COD Remittance Fee (SRC…). Shiprocket Debit Notes → Purchase-Expense like invoices. Shiprocket Credit Notes → Debit Note voucher reducing the fee ledger / ShipRocket Collection.

## Standing rules from Hargun
- **Heatronics does not book RCM (reverse charge) currently.** Never propose RCM lines, reverse-charge journals or RCM ledgers. If a bill looks like it would attract RCM, say "Heatronics does not book RCM currently — flag to Hargun" instead of building an RCM entry.
- **Shopify and Claude/Anthropic bills are not booked for now.** If one comes up, say these are not booked currently and ask Hargun before booking.
- Vendor party ledgers (verbatim): SHOPFLO TECHNOLOGIES PVT LTD (Dr Checkout Fee - Shopflo); Facebook India Online Services Private Limited (Dr Meta Ads (Direct), domestic GST); Google India Pvt Ltd (Dr Google Ads (Direct), domestic GST); Actartly Technology Pvt. Ltd. (Bite Speed) (Dr Bitespeed Communication Charges — the Bitespeed payment-history list shows ₹0 for wallet top-ups; use the Invoice + Billing Breakdown); Digistex4u (confirmed by Hargun: Dr Media Buying Agency - Google/FB + GST input, Cr Digistex4u, deduct TDS — Individual/HUF resident). Google Cloud has no ledger yet — needs Hargun.
- Each map row may carry the official invoice download link — mention it when the accountant asks where to get the invoice.

CA flag: the master sets TDS 194J on the Google, Meta, Bitespeed and Shopflo ledgers. Advertising is usually 194C. Answer with the master's setting (194J) but always add "confirm with CA" on the TDS line for these.`;

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
    const ledger = str(r.ledger, 600) || TO_CONFIRM;
    // A row without a decided ledger always needs Hargun; otherwise keep the flag the editor set.
    // "Out of scope" is an explicit choice and wins over a missing ledger.
    const status: MapRowStatus =
      r.status === 'out-of-scope' ? 'out-of-scope' : ledger === TO_CONFIRM || r.status === 'needs-info' ? 'needs-info' : 'confirmed';
    const rawLink = str(r.link, 500);
    const link = /^https?:\/\//i.test(rawLink) ? rawLink : '';
    const linkNote = str(r.linkNote, 400);
    const subRules = Array.isArray(r.subRules)
      ? r.subRules
          .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
          .map((x) => ({ when: str(x.when, 200), then: str(x.then, 500) }))
          .filter((x) => x.when && x.then)
          .slice(0, 20)
      : [];
    const anchor = str(r.anchor, 80).replace(/^\/?handbook#/, '').replace(/^#/, '');
    const suggestion = str(r.suggestion, 300);
    const party = str(r.party, 160);
    const evidence = str(r.evidence, 600);
    out.push({
      id,
      vendor,
      keywords,
      ledger,
      voucherType: str(r.voucherType, 240),
      gst: str(r.gst, 400),
      tds: str(r.tds, 400),
      notes: str(r.notes, 600),
      anchor,
      status,
      ...(suggestion ? { suggestion } : {}),
      ...(party ? { party } : {}),
      ...(evidence ? { evidence } : {}),
      ...(link ? { link } : {}),
      ...(linkNote ? { linkNote } : {}),
      ...(subRules.length ? { subRules } : {}),
    });
  }
  return out;
}

const SEED_VERSION = 'seed-v3';
/** Every earlier seed — a stored map equal to one of these is upgraded to SEED. */
const PREVIOUS_SEEDS: ExpenseMapRow[][] = [SEED_V1, SEED_V2];

/**
 * Compare maps under the field limits earlier versions used (voucherType 80,
 * gst/tds 200 chars), so a seed stored by an older build still matches.
 */
function seedFingerprint(rows: ExpenseMapRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({ ...r, voucherType: r.voucherType.slice(0, 80), gst: r.gst.slice(0, 200), tds: r.tds.slice(0, 200) })),
  );
}

/** The map; seeds Hargun's starting rules the first time (store empty). */
export async function readExpenseMap(): Promise<ExpenseMapDoc> {
  const doc = await readJson<ExpenseMapDoc | null>(DOC, null);
  if (doc && Array.isArray(doc.rows)) {
    const rows = normaliseRows(doc.rows);
    // One-time upgrade: a stored map nobody has edited (still exactly equal to
    // ANY earlier seed version) is replaced by the current seed. Any user edit
    // makes it differ, so edited maps are never touched.
    const stored = seedFingerprint(rows);
    if (PREVIOUS_SEEDS.some((old) => seedFingerprint(normaliseRows(old)) === stored)) {
      const upgraded: ExpenseMapDoc = { rows: normaliseRows(SEED), updatedAt: new Date().toISOString(), updatedBy: SEED_VERSION };
      try {
        await writeJson(DOC, upgraded);
      } catch (err) {
        console.error('expense-map seed upgrade failed:', err);
      }
      return upgraded;
    }
    return { rows, updatedAt: doc.updatedAt ?? null, updatedBy: doc.updatedBy };
  }
  const seeded: ExpenseMapDoc = { rows: normaliseRows(SEED), updatedAt: new Date().toISOString(), updatedBy: SEED_VERSION };
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
    '| Vendor / category | Match keywords | Dr ledger(s) | Cr / party ledger | Voucher type | GST | TDS | Notes | Evidence from the books | Invoice download | Handbook | Status | Closest Tally ledger (unconfirmed) |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const statusText = (r: ExpenseMapRow) =>
    r.status === 'out-of-scope'
      ? 'NOT IN SCOPE — not booked for now; ask Hargun'
      : r.status === 'needs-info'
        ? 'NEEDS HARGUN'
        : r.evidence
          ? 'Confirmed (from books)'
          : 'Confirmed by Hargun';
  const body = rows
    .map((r) =>
      `| ${esc(r.vendor)} | ${esc(r.keywords.join(', '))} | ${esc(r.ledger)} | ${esc(r.party ?? '')} | ${esc(r.voucherType)} | ${esc(r.gst)} | ${esc(r.tds)} | ${esc(r.notes)} | ${esc(r.evidence ?? '')} | ${esc([r.link, r.linkNote].filter(Boolean).join(' — '))} | ${r.anchor ? `/handbook#${r.anchor}` : '—'} | ${statusText(r)} | ${esc(r.suggestion ?? '')} |`,
    )
    .join('\n');
  // Sub-rules (e.g. Amazon invoice type → ledger) as a list under the table.
  const subs = rows
    .filter((r) => r.subRules?.length)
    .map((r) => `### ${r.vendor} — sub-rules\n` + r.subRules!.map((s) => `- When ${s.when}: ${s.then}`).join('\n'))
    .join('\n\n');
  return `${head}\n${body}${subs ? `\n\n${subs}` : ''}`;
}
