// ============================================================================
// ACCOUNTING CALENDAR — Hargun's monthly close, as tasks on the Tasks page.
//
//   Daily     Tranzact → Tally · Shopify orders + Easebuzz payouts
//   Weekly    bank statements (Central, HDFC, ICICI) · contra · platform
//             collection ledgers (after each settlement is imported)
//   1st       Shiprocket COD remittance · Snapmint settlement
//   3rd       Amazon MTR / STR / Settlement · expense invoices · JVs
//   4th       clear all bank statements
//   5th       attendance + salary booking
//   6th       TDS report to the CA
//   8th–9th   GSTR-1 data (discrepancies, e-invoice, e-way bill)
//   10th      reports into the MIS
//   14th      GSTR-2B reconciliation
//   17th      GSTR-3B data and preparation
//
// Applied once per CALENDAR_VERSION: tasks are upserted by id (owners and
// edits the team made are kept), and the older tasks this replaces are
// switched off (not deleted — history stays).
// ============================================================================

import type { WorkTask } from './workStore.js';

export const CALENDAR_VERSION = 1;

const H = (id: string) => `/handbook#${id}`;
const BANKS = [
  { id: 'central', label: 'Central Bank CC', link: H('c9-central-cc') },
  { id: 'hdfc', label: 'HDFC Bank', link: H('c9-hdfc') },
  { id: 'icici', label: 'ICICI Bank CC', link: H('c9-icici') },
];

const base: Partial<WorkTask> = { ownerIds: [], active: true, source: 'calendar', remindDaysBefore: 1 };

export const CALENDAR_TASKS: Partial<WorkTask>[] = [
  // --- Daily -----------------------------------------------------------------
  {
    ...base,
    id: 'cal-d-tranzact',
    title: 'Daily · Tranzact → Tally (sales and purchases)',
    area: 'Daily books',
    roleLabel: 'Accountant',
    cadence: 'daily',
    howTo: 'c14-d1-tranzact',
    description: 'Push every approved Tranzact document (sales invoices, purchases, job work) to Tally; Pending and Approved should both read 0.',
    remindDaysBefore: 0,
  },
  {
    ...base,
    id: 'cal-d-shopify',
    title: 'Daily · Shopify orders and Easebuzz payouts',
    area: 'Daily books',
    roleLabel: 'Accountant',
    cadence: 'daily',
    howTo: 'c14-d2-shopify-easebuzz',
    description: 'Import yesterday’s Shopify orders, then the Easebuzz payouts, so each payout matches its orders in Easebuzz Collection.',
    remindDaysBefore: 0,
  },

  // --- Weekly ----------------------------------------------------------------
  {
    ...base,
    id: 'cal-w-banks',
    title: 'Weekly · Bank statements → reconcile with books',
    area: 'Weekly reconciliation',
    roleLabel: 'Accountant',
    cadence: 'weekly',
    dueWeekday: 1,
    howTo: 'c9',
    description: 'Download last week’s statement for each bank and reconcile it with the bank ledger in Tally. Every line should be matched or explained.',
    checklist: BANKS.map((b) => ({ ...b, hint: 'Statement downloaded and reconciled' })),
  },
  {
    ...base,
    id: 'cal-w-contra',
    title: 'Weekly · Reconcile contra (bank-to-bank) entries',
    area: 'Weekly reconciliation',
    roleLabel: 'Accountant',
    cadence: 'weekly',
    dueWeekday: 1,
    howTo: 'c9',
    description:
      'A transfer between our own banks is booked once: a payment or receipt voucher in one bank, so it shows in the other. Check every transfer appears in both bank ledgers, none is booked twice and none is missing.',
    dependsOn: ['cal-w-banks'],
  },
  {
    ...base,
    id: 'cal-w-platforms',
    title: 'Weekly · Reconcile platform collection ledgers',
    area: 'Weekly reconciliation',
    roleLabel: 'Accountant',
    cadence: 'weekly',
    dueWeekday: 2,
    howTo: 'c21',
    description: 'Only after each platform’s own settlement has been imported. Compare the platform report with its collection ledger; the difference should be only payouts still in transit.',
    dependsOn: ['cal-d-shopify', 'cal-m01-cod', 'cal-m01-snapmint', 'cal-m03-amazon'],
    checklist: [
      { id: 'easebuzz', label: 'Easebuzz ↔ Easebuzz Collection', hint: 'After the daily Shopify + Easebuzz import', link: H('c14-d2-shopify-easebuzz') },
      { id: 'snapmint', label: 'Snapmint ↔ Snapmint Collection', hint: 'After the Snapmint settlement (1st)', link: H('c16-m3-snapmint') },
      { id: 'shiprocket', label: 'Shiprocket ↔ Shiprocket Collection', hint: 'After the COD remittance settlement (1st)', link: H('c16-m2-shiprocket') },
      { id: 'amazon', label: 'Amazon ↔ Amazon Bank', hint: 'After the Amazon settlement report (3rd)', link: H('c16-m1-amazon') },
    ],
  },

  // --- Monthly ---------------------------------------------------------------
  {
    ...base,
    id: 'cal-m01-cod',
    title: '1st · Shiprocket COD remittance settlement',
    area: 'Month-end close',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 1,
    arrears: true,
    howTo: 'c16-m2-shiprocket',
    links: [{ label: 'Upload data', url: '/reporting/mis/ingest' }],
  },
  {
    ...base,
    id: 'cal-m01-snapmint',
    title: '1st · Snapmint settlement (Group Daily Merchant Report)',
    area: 'Month-end close',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 1,
    arrears: true,
    howTo: 'c16-m3-snapmint',
  },
  {
    ...base,
    id: 'cal-m03-amazon',
    title: '3rd · Amazon MTR, STR and Settlement report',
    area: 'Month-end close',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 3,
    arrears: true,
    howTo: 'c16-m1-amazon',
    checklist: [
      { id: 'mtr', label: 'MTR (B2B + B2C) imported' },
      { id: 'str', label: 'STR (stock transfers) imported' },
      { id: 'settlement', label: 'Settlement report imported' },
    ],
  },
  {
    ...base,
    id: 'cal-m03-expenses',
    title: '3rd · Book all expense invoices',
    area: 'Month-end close',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 3,
    arrears: true,
    howTo: 'c27-overview',
    description: 'Collect every expense invoice for last month and book it in the right ledger. Ask the Booking assistant if unsure.',
    links: [
      { label: 'Amazon fee invoices', url: 'https://sellercentral.amazon.in/tax/seller-fee-invoices' },
      { label: 'Shiprocket bills', url: 'https://app.shiprocket.in/seller/bills/invoices' },
      { label: 'Easebuzz invoices', url: 'https://dashboard.easebuzz.in/payouts/invoices' },
      { label: 'Snapmint invoices', url: 'https://emis.snapmint.com/merchants/monthly_invoices' },
      { label: 'Shopflo invoices', url: 'https://dashboard.shopflo.com/billing#invoices' },
      { label: 'Bitespeed billing', url: 'https://marketing.bitespeed.co/settings' },
      {
        label: 'Meta paid invoices',
        url: 'https://business.facebook.com/latest/billing_hub/payment_activity?business_id=488618164122715&asset_id=2294012640954204&payment_account_id=2294012640954204',
      },
      { label: 'Google Ads invoices', url: 'https://ads.google.com/aw/billing/documents?ocid=1525533322' },
      { label: 'Blinkit invoices', url: 'https://seller.blinkit.com/dashboard/billing?billing=invoices' },
      { label: 'Flipkart report centre (Invoices)', url: 'https://seller.flipkart.com/index.html#dashboard/metrics/report-centre' },
      { label: 'Booking assistant', url: '/booking-assistant' },
    ],
    checklist: [
      { id: 'shopflo', label: 'Shopflo', hint: 'Dr Checkout Fee - Shopflo · Cr SHOPFLO TECHNOLOGIES PVT LTD · TDS', link: H('c27-shopflo') },
      { id: 'shiprocket', label: 'Shiprocket', hint: 'Download Invoices, Debit Notes AND Credit Notes · Purchase-Expense: Dr freight/RTO/fee ledgers + IGST Input - 18%, Cr ShipRocket Collection, TDS 194C · credit notes → Debit Note', link: H('c27-shiprocket') },
      { id: 'easebuzz', label: 'Easebuzz', hint: 'Purchase-Expense · Dr PG Transaction Fee - Easebuzz + IGST · Cr Easebuzz Collection A/c · no TDS (don’t double-count daily fees)', link: H('c27-easebuzz') },
      { id: 'snapmint', label: 'Snapmint', hint: 'Invoice PDF + Working CSV · Purchase-Expense: Dr BNPL Processing Fee - Snapmint + IGST, Cr Snapmint Collection, TDS 194H', link: H('c27-snapmint') },
      { id: 'amazon', label: 'Amazon — all GSTs, TDS and TCS entries', hint: 'Download ALL seller fee invoices · Merchant VAT → selling-fee ledgers, FBA Tax Invoice → FBA ledgers, Product Ads → Amazon Ads, Credit Note → Debit Note · Cr Amazon Expenses (Creditors) · book on the GSTIN shown', link: H('c27-amazon') },
      { id: 'facebook', label: 'Facebook (Meta ads)', hint: 'Billing hub → Payment activity, status Paid → download every FBADS VAT invoice · Dr Meta Ads (Direct) · Cr Facebook India Online Services Private Limited · GST · TDS', link: H('c27-facebook') },
      { id: 'google', label: 'Google (Ads)', hint: 'Billing → Documents → one invoice per month · Dr Google Ads (Direct) · Cr Google India Pvt Ltd · GST · TDS', link: H('c27-google') },
      { id: 'bitespeed', label: 'Bitespeed (Actartly)', hint: 'Invoice + Billing Breakdown (list shows ₹0 for top-ups) · Dr Bitespeed Communication Charges · Cr Actartly Technology Pvt. Ltd. (Bite Speed) · TDS', link: H('c27-bitespeed') },
      { id: 'blinkit', label: 'Blinkit (all states)', hint: 'Billing → Invoices, every state · Purchase-Expense: Dr Commission / Storage Fee / Shipping Fee / Logistics / Returns - Blinkit (or Blinkit Advertising) + GST · Cr Blink Commerce Private Limited (<state>) · TDS · credit notes → Debit Note', link: H('c27-blinkit') },
      { id: 'flipkart', label: 'Flipkart', hint: 'Report centre → Invoices → Commission Invoice + Transaction Details (ready ~8th — tick when booked) · Dr Flipkart -Commision Fees / Fixed Fees-Flipkart / Flipkart Ad Services Fee + GST · Cr Flipkart Seller Account · TDS', link: H('c27-flipkart') },
      { id: 'digistex', label: 'Digistex', hint: 'Cr Digistex4u · Dr likely Media Buying Agency - Google/FB (to confirm) · TDS', link: H('c27-digistex') },
      { id: 'gcloud', label: 'Google Cloud', hint: 'No ledger yet — to confirm (create “Google Cloud” under Operations Platform Subscriptions?)', link: H('c27-gcloud') },
    ],
  },
  {
    ...base,
    id: 'cal-m03-jv',
    title: '3rd · Pass JVs: Amazon settlement, bank and other ledgers',
    area: 'Month-end close',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 3,
    arrears: true,
    howTo: 'c6-monthly-jv',
    description: 'The monthly Amazon expense JV, plus special-case JVs on bank and other ledgers.',
    dependsOn: ['cal-m03-amazon'],
    links: [{ label: 'Platform invoices', url: H('c16-m4-platform-invoices') }],
  },
  {
    ...base,
    id: 'cal-m04-banks',
    title: '4th · Clear all bank statements',
    area: 'Month-end close',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 4,
    arrears: true,
    howTo: 'c16-m5-close',
    description: 'Every line of last month’s statements is booked and reconciled; nothing left in Suspense.',
    checklist: BANKS.map((b) => ({ ...b, hint: 'All lines booked, closing balance matches' })),
  },
  {
    ...base,
    id: 'cal-m05-salary',
    title: '5th · Attendance sharing and salary expense booking',
    area: 'Month-end close',
    roleLabel: 'Accountant / HR',
    cadence: 'monthly',
    dueDay: 5,
    arrears: true,
    checklist: [
      { id: 'attendance', label: 'Attendance shared' },
      { id: 'salary', label: 'Salary expense booked' },
    ],
  },
  {
    ...base,
    id: 'cal-m06-tds',
    title: '6th · Share TDS report with the CA (all clearances)',
    area: 'GST & TDS',
    roleLabel: 'Accountant / CA',
    cadence: 'monthly',
    dueDay: 6,
    arrears: true,
    howTo: 'c8',
  },
  {
    ...base,
    id: 'cal-m09-gstr1',
    title: '8th–9th · GSTR-1: resolve discrepancies, e-invoice and e-way bill check, share data',
    area: 'GST & TDS',
    roleLabel: 'Accountant / CA',
    cadence: 'monthly',
    startDay: 8,
    dueDay: 9,
    arrears: true,
    howTo: 'c7-monthly-cycle',
    checklist: [
      { id: 'discrepancies', label: 'All discrepancies resolved' },
      { id: 'einvoice', label: 'E-invoices checked' },
      { id: 'ewaybill', label: 'E-way bills checked' },
      { id: 'shared', label: 'Data shared with the CA' },
    ],
  },
  {
    ...base,
    id: 'cal-m10-mis',
    title: '10th · Update all reports into the MIS portal',
    area: 'Month-end close',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 10,
    arrears: true,
    howTo: 'c28-upload',
    links: [
      { label: 'Upload data', url: '/reporting/mis/ingest' },
      { label: 'Live MIS', url: '/reporting/mis/live' },
    ],
  },
  {
    ...base,
    id: 'cal-m14-2b',
    title: '14th · GSTR-2B reconciliation',
    area: 'GST & TDS',
    roleLabel: 'Accountant',
    cadence: 'monthly',
    dueDay: 14,
    arrears: true,
    howTo: 'c7-monthly-cycle',
  },
  {
    ...base,
    id: 'cal-m17-3b',
    title: '17th · GSTR-3B data sharing and preparation',
    area: 'GST & TDS',
    roleLabel: 'Accountant / CA',
    cadence: 'monthly',
    dueDay: 17,
    arrears: true,
    howTo: 'c7-monthly-cycle',
    dependsOn: ['cal-m14-2b'],
  },
];

/** Older tasks the calendar replaces — switched off, not deleted. */
export const REPLACED_TASK_IDS = [
  'cmp-operations-ops-d1-tranzact-to-tally',
  'cmp-operations-ops-d2-shopify-easebuzz',
  'cmp-operations-ops-w1-weekly-checks',
  'cmp-operations-ops-m1-amazon-reports',
  'cmp-operations-ops-m2-shiprocket-cod',
  'cmp-operations-ops-m3-snapmint',
  'cmp-operations-ops-m4-platform-invoices-jv',
  'cmp-operations-ops-m5-banks-statutory-close',
  'cmp-accounts-acc-mis-close',
  'cmp-accounts-acc-gstr2b-recon',
];
