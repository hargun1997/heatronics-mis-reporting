import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c10 (month-end close) + §c16 M5 + §c21.
const spec: SopSpec = {
  title: 'Month-end Close & Reconciliations',
  description:
    'The close ties out every control / clearing ledger, reconciles the three banks, meets the statutory dates and sends the MIS. The day-by-day cadence is tracked in Tasks & Compliance → Operations; this SOP is the reconciliation standard each step must meet.',
  accent: 'emerald',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Bank import + BRS', billSeries: 'Central CC, ICICI, HDFC' },
    { name: 'Journal', billSeries: 'Amazon expense JV, GST set-off' },
  ],
  ledgerMapping: [
    { role: 'D2C receivables', ledger: 'Shopify Prepaid / COD Receivable → small Dr (open orders)' },
    { role: 'Collectors', ledger: 'Easebuzz / Snapmint Collection → 1–2 days; ShipRocket Collection → ≈ 0' },
    { role: 'Amazon chain', ledger: 'Seller A/c / Settlement → open settlement; Amazon Bank → in-transit' },
    { role: 'Amazon creditor', ledger: 'Amazon Expenses (Creditors) → ≈ 0 after JV' },
    { role: 'Suspense', ledger: 'Suspense → 0' },
  ],
  steps: [
    { title: 'Day 3 — daily caught up', body: 'Tranzact pushed (Pending / Approved = 0); Shopify + Easebuzz caught up to month end. Shopify sales report = Tally Shopify Sales.' },
    { title: 'Day 5 — imports', body: 'Amazon MTR-B2C / MTR-B2B / STR / Settlement, Shiprocket, Snapmint imported. MTR totals = Amazon Sales by GSTIN.' },
    { title: 'Day 7 — TDS deposited', body: 'Challans = TDS Payable by section (includes TDS on Amazon invoices).' },
    { title: 'Day 10 — GSTR-1 data', body: 'Output by GSTIN from the three families to the CA (due 11th). Sales complete from all streams.' },
    { title: 'Day 12 — banks reconciled', body: 'Import HDFC, ICICI, Central Bank (headings on row 14) via File Manager → Bank Statement New; run the BRS for each.' },
    { title: 'Day 15 — platform invoices + Amazon JV', body: 'Book platform invoices, pass the Amazon expense JV (Cost of Advertising → 0; creditor ≈ 0), match GSTR-2B.' },
    { title: 'Day 18–20 — control sheet, GSTR-3B, close', body: 'Review every control account against the expected balance (table below), file GSTR-3B + set-off JV, then close and send the MIS.' },
  ],
  examples: [
    {
      title: 'Control-account tie-out targets',
      scenario: 'What each control ledger should read at close (vs the current TB exceptions).',
      voucherType: 'Review',
      journal: [
        { side: 'Dr', ledger: 'Shopify Prepaid / COD Receivable', amount: 'small Dr', note: 'TB: Prepaid ₹26.68 L Cr — wrong sign' },
        { side: 'Dr', ledger: 'Easebuzz / Snapmint Collection', amount: '1–2 days', note: 'TB: Easebuzz ₹40.24 L Dr — overstated' },
        { side: 'Dr', ledger: 'ShipRocket Collection', amount: '≈ 0', note: 'TB: ₹3.96 L Cr' },
        { side: 'Dr', ledger: 'Amazon Expenses (Creditors)', amount: '≈ 0 after JV', note: 'TB: ₹34.6 L Cr — JV missing May–Oct' },
        { side: 'Dr', ledger: 'Suspense', amount: '0', note: 'TB: ₹12.65 L Dr' },
      ],
      note: 'These are the open findings the close is meant to drive to zero. The Amazon expense JV (May–Oct) is the single biggest fix.',
    },
  ],
  clearing:
    'Reconcile to source: receivables to the plugin order-wise settlement report (option 8); collectors to the gateway settlement lists vs bank; the Amazon chain to the Seller Central statement view; the creditor to invoices vs settlement deductions. Suspense should be 0 — everything in it is to be identified and reclassified.',
  gotchas: [
    'Before ANY import, confirm Tally’s working date is today (it once read 6-Dec-2026, defaulting every form to December). Alt+F2 to fix.',
    'Central Bank statement: column headings on row 14, or the import fails.',
    'Never park unknowns in Suspense (₹12.65 L already). Name them to Hargun.',
    'The ₹7.02 L opening-balance difference and the ~₹1.01 Cr GST Payable carry-over are CA items — reconcile to the audited FY26 balance sheet.',
  ],
  visuals: [
    { key: 'close.control-sheet', label: 'Control-account review sheet' },
    { key: 'close.brs', label: 'Bank reconciliation (BRS) in Tally' },
  ],
};

export function MonthCloseSop() {
  return <SopLayout spec={spec} />;
}
