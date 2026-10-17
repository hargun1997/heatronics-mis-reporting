import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c4 (Tranzact purchases) + §c8 (TDS) +
// §c16 M4 (GSTR-2B match).
const spec: SopSpec = {
  title: 'Purchase SOP (Tranzact)',
  description:
    'Supplier bills are raised/received in Tranzact and pushed to Tally by the Chrome plugin. Tranzact’s rule sends goods to RM Purchases and every service bill to Job Work Charges. TDS is split in Tranzact on service bills; input GST is matched to GSTR-2B monthly.',
  accent: 'emerald',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Purchase', billSeries: 'goods → RM Purchases' },
    { name: 'Purchase', billSeries: 'service → Job Work Charges' },
    { name: 'Journal (TDS split)', billSeries: 'service bills, 194C' },
  ],
  ledgerMapping: [
    { role: 'Goods', ledger: 'RM Purchases' },
    { role: 'Services', ledger: 'Job Work Charges' },
    { role: 'Input GST', ledger: 'IGST/CGST/SGST Input - 18% (also 5% / 12%)' },
    { role: 'TDS', ledger: 'TDS Payable - 194C (Contractors)' },
    { role: 'Counter-party', ledger: 'Supplier (Sundry Creditor)' },
  ],
  steps: [
    { title: 'Receive the bill in Tranzact', body: 'Goods bills (Is Service = false) map to RM Purchases; service bills (Is Service = true) map to Job Work Charges. GST input ledgers attach by rate.' },
    { title: 'Split TDS on service bills (D1)', body: 'Payments → Ledger (Consolidated) → split icon → TDS → %, on the pre-GST value (job work 2% u/s 194C). The field starts at 0 — never save at 0. This creates a journal: Dr Supplier, Cr TDS Payable - 194C.' },
    { title: 'Approve + push', body: 'Approve the Purchase and the TDS Journal, then push both in the daily D1 run (Purchase and Journal voucher types).' },
    { title: 'Match to GSTR-2B (M4, by Day 14/15)', body: 'Tick every invoice against the month’s GSTR-2B. ITC is only available for invoices appearing in 2B (Section 16(2)(aa)). If one is missing, there is no input credit — tell Hargun.' },
  ],
  examples: [
    {
      title: 'Service / job-work bill + TDS (Ravi Teleinfomatics)',
      scenario: 'Real example — a ₹1,01,374.27 service bill with 2% TDS split in Tranzact.',
      voucherType: 'Purchase + Journal',
      journal: [
        { side: 'Dr', ledger: 'Job Work Charges + GST Input', amount: '₹1,01,374.27' },
        { side: 'Cr', ledger: 'Ravi Teleinfomatics', amount: '₹1,01,374.27' },
        { side: 'Dr', ledger: 'Ravi Teleinfomatics', amount: '₹1,718.21' },
        { side: 'Cr', ledger: 'TDS Payable - 194C (Contractors)', amount: '₹1,718.21' },
      ],
    },
    {
      title: 'Goods purchase (RM)',
      scenario: 'A raw-material bill — maps to RM Purchases with input GST.',
      voucherType: 'Purchase',
      journal: [
        { side: 'Dr', ledger: 'RM Purchases', amount: 'taxable' },
        { side: 'Dr', ledger: 'IGST/CGST/SGST Input', amount: 'GST' },
        { side: 'Cr', ledger: 'Supplier (Sundry Creditor)', amount: 'gross' },
      ],
    },
  ],
  clearing:
    'The supplier balance sits on the party ledger and is cleared by payment from the bank statement (never via Tranzact "Mark Paid"). Input GST accumulates — the business is inverted-duty (5% output vs 18% inputs), so credit builds up (see the GST SOP).',
  gotchas: [
    'Every service bill goes to Job Work Charges, even software / consultancy — re-code non-job-work services in Tally until the Tranzact rule is split.',
    'Only 194C is set in Tranzact — professional (194J), rent (194I) and goods above the 194Q threshold need the right section; check each TDS journal before pushing.',
    'ITC only for invoices in GSTR-2B. Purchase discounts hit "Discount Received (from Supplier)"; repairs come as a purchase additional charge to "Repairs & Maintenance".',
  ],
  visuals: [
    { key: 'purchase.grn', label: 'Service vs goods bill in Tranzact (Is Service flag)' },
    { key: 'purchase.gstr2b-match', label: 'GSTR-2B match for the month' },
  ],
};

export function PurchaseSop() {
  return <SopLayout spec={spec} />;
}
