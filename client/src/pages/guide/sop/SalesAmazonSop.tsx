import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c6 (Amazon) + §c3 (voucher catalogue) +
// §c16 M1 (monthly import) + §c23 FAQ. Amazon issues the sales invoices (MTR);
// everything is created by the eCom2Tally plugin (option 2) from uploaded reports.
const spec: SopSpec = {
  title: 'Sales — Amazon',
  description:
    'Amazon issues the sales invoices (MTR). The eCom2Tally plugin (option 2) imports four monthly reports and posts the whole chain: Amazon Seller A/c → Amazon Settlement → Amazon Bank → Central Bank CC. Fees and ads are deducted at source and also invoiced separately, so a monthly expense JV is required. Separate voucher per GSTIN (UP, HR, KA, MH, TS).',
  accent: 'brand',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Sales-Amazon-<STATE> / Credit Note-Amazon-<STATE>', billSeries: 'from MTR-B2C / MTR-B2B' },
    { name: 'Sales-STR / Purchase-STR', billSeries: 'inter-GSTIN stock transfer' },
    { name: 'Amazon Settlement · Amazon Commission · Amazon TDS-TCS · Amazon Bank Transfer', billSeries: 'from the Settlement report' },
  ],
  ledgerMapping: [
    { role: 'Sales receivable', ledger: 'Amazon Seller A/c' },
    { role: 'Settlement net', ledger: 'Amazon Settlement' },
    { role: 'Payout in-transit', ledger: 'Amazon Bank' },
    { role: 'Sales / ads', ledger: 'Amazon Sales · Cost of Advertising (settlement) · Amazon Ads (invoice)' },
    { role: 'Fees creditor', ledger: 'Amazon Expenses (Creditors)' },
    { role: 'GST output', ledger: 'IGST/CGST/SGST Output-<STATE>' },
    { role: 'Taxes at source', ledger: 'TDS (Amazon) · TCS-IGST/CGST/SGST (Amazon)' },
  ],
  steps: [
    {
      title: 'Download the four reports (by Day 5)',
      body: 'MTR-B2C, MTR-B2B and STR from Seller Central → GST Monthly Reports. The Settlement (Transaction) report from Payments → Reports Repository (All Unified → Transaction → month; download once Status = done).',
    },
    {
      title: 'Upload on the plugin site, then import with option 2',
      body: 'Upload all four in Marketplace → Upload Files on tally-integration.in, then in Tally option 2 import ONE file type at a time. Order: MTR → STR → Settlement (sales must exist before the settlement can knock them off). Rows 00001-10000 per pass; split a >10,000-row file into further passes.',
    },
    {
      title: 'Per-GSTIN vouchers',
      body: 'A separate voucher per GSTIN (UP, HR, KA, MH, TS); the voucher type and GST ledger carry the state suffix. Club on POS = False, GSTIN = All.',
    },
    {
      title: 'Book the invoices (Purchase-Expense)',
      body: 'Fees from the Tax Document Library and ads from Advertising Invoice History are booked as Purchase-Expense against Amazon Expenses (Creditors). Ads invoices also carry the TDS lines.',
    },
    {
      title: 'Pass the monthly Amazon expense JV',
      body: 'Ads reach the P&L twice (settlement posts to Cost of Advertising; the GST invoice posts to Amazon Ads). The monthly JV moves the settlement-side expense onto the creditor so the expense stays once. Template: Journal 53, 30-Apr-26.',
    },
    {
      title: 'Reconcile',
      body: 'MTR totals = Amazon Sales by GSTIN. Each settlement closes to ~0. Amazon Bank holds only in-transit (1–2 days). After the JV, Cost of Advertising = 0 and Amazon Expenses (Creditors) ≈ 0.',
    },
  ],
  examples: [
    {
      title: 'MTR sale (Apr-26) · Haryana GSTIN',
      scenario: 'Real April-26 voucher Sales-Amazon-HARYANA DEL5-1.',
      voucherType: 'Sales-Amazon-HARYANA',
      journal: [
        { side: 'Dr', ledger: 'Amazon Seller A/c', amount: '₹1,100.00' },
        { side: 'Cr', ledger: 'Amazon Sales', amount: '₹1,047.62' },
        { side: 'Cr', ledger: 'IGST Output-HARYANA', amount: '₹52.38' },
      ],
    },
    {
      title: 'Settlement with ad deduction (Apr-26)',
      scenario: 'The settlement posts the ad deduction to Cost of Advertising and nets to Amazon Settlement.',
      voucherType: 'Amazon Settlement',
      journal: [
        { side: 'Dr', ledger: 'Cost of Advertising', amount: '₹48,085.79' },
        { side: 'Dr', ledger: 'Amazon Seller A/c', amount: '₹4,268.50' },
        { side: 'Cr', ledger: 'Amazon Settlement', amount: '₹52,354.29' },
      ],
      note: 'Payout: Dr Amazon Bank, Cr Amazon Settlement; then at bank import Dr Cash Credit Limit - [Central Bank], Cr Amazon Bank.',
    },
    {
      title: 'Ads invoice (Apr-26) · Purchase-Expense',
      scenario: 'The GST invoice for the same ad spend, with recoverable TDS. Amazon was already paid gross, so the TDS is a recoverable from Amazon.',
      voucherType: 'Purchase-Expense',
      journal: [
        { side: 'Dr', ledger: 'Amazon Ads', amount: '₹4,54,260.69' },
        { side: 'Dr', ledger: 'IGST Input - 18%', amount: '₹81,766.92' },
        { side: 'Dr', ledger: 'TDS (Amazon), recoverable', amount: '₹9,085.21' },
        { side: 'Cr', ledger: 'TDS Payable - 194C (Contractors)', amount: '₹9,085.21' },
        { side: 'Cr', ledger: 'Amazon Expenses (Creditors)', amount: '₹5,36,027.61' },
      ],
    },
    {
      title: 'Monthly Amazon expense JV (template: Journal 53, 30-Apr-26)',
      scenario: 'Moves the settlement-side expense onto the creditor so ads are expensed once.',
      voucherType: 'Journal',
      journal: [
        { side: 'Dr', ledger: 'Amazon Expenses (Creditors)', amount: '₹5,82,428.14' },
        { side: 'Cr', ledger: 'Cost of Advertising', amount: '₹5,36,027.65' },
        { side: 'Cr', ledger: 'FBA Inbound Pickup Service', amount: '₹33,680.50' },
        { side: 'Cr', ledger: 'FBA storage fee - Amazon (settlement part)', amount: '₹12,719.99' },
      ],
      note: 'After the JV: Cost of Advertising = 0, creditor ≈ 0 (timing only). This JV was passed only for April — it is the single biggest open finding (May–Oct missing → Cost of Advertising ₹34.57 L Dr).',
    },
  ],
  clearing:
    'The whole Amazon chain is a clearing chain: Sales-Amazon-<STATE> fills Amazon Seller A/c; the Settlement, Commission and TDS-TCS vouchers empty it to Amazon Settlement; Amazon Bank Transfer moves it to Amazon Bank; the bank receipt empties Amazon Bank to the Central Bank CC. On top sits Amazon Expenses (Creditors), filled by invoices and emptied by Amazon Commission + the monthly JV.',
  gotchas: [
    'Import order is MTR → STR → Settlement; sales must exist before a settlement can knock them off.',
    'The monthly expense JV is mandatory — without it ads are double-counted (Cost of Advertising AND Amazon Ads). It was missed May–Oct.',
    'TDS (Amazon) mixes the 194-O credit (claimed via 26AS) with the ads TDS Amazon must refund — book the ads part to TDS Receivable - 194C (Ads) so each reconciles.',
    'Check the PAN on the option 2 form (F11 → More Details → PAN/CIN) and that Tally’s date is today before importing.',
  ],
  visuals: [
    { key: 'sales.amazon.bill-series', label: 'Option 2 (E-Com Import) form in Tally' },
    { key: 'sales.amazon.tally-result', label: 'Journal 53 — the monthly Amazon expense JV' },
  ],
};

export function SalesAmazonSop() {
  return <SopLayout spec={spec} />;
}
