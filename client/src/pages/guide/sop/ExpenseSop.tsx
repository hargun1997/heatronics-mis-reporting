import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §S7 (manual layer) + §c16 M4 (platform
// invoices & Amazon expense JV) + §c5/§c23 (Shiprocket / Easebuzz invoices).
const spec: SopSpec = {
  title: 'Expense SOP (platform invoices, Tally)',
  description:
    'The manual layer the plugins do not book: platform fee / ad invoices (Amazon, Shiprocket, Easebuzz, Snapmint), the monthly Amazon expense JV, GST set-off and payroll. Platform invoices are booked as Purchase-Expense against each platform’s control ledger.',
  accent: 'amber',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Purchase-Expense', billSeries: 'fee / ad invoices + GST' },
    { name: 'Journal', billSeries: 'expense JV, provisions, set-off' },
  ],
  ledgerMapping: [
    { role: 'Amazon', ledger: 'Amazon Ads / fee ledgers → Amazon Expenses (Creditors)' },
    { role: 'Shiprocket', ledger: 'Freight Charges / Forward Delivery (Shiprocket) → ShipRocket Collection' },
    { role: 'Easebuzz', ledger: 'PG Transaction Fee - Easebuzz → Easebuzz Collection A/c' },
    { role: 'Input GST', ledger: 'IGST/CGST/SGST Input - 18%' },
    { role: 'TDS (ads)', ledger: 'TDS Payable - 194C / TDS (Amazon) recoverable' },
  ],
  steps: [
    { title: 'Download the invoices (M4, by Day 15)', body: 'Amazon fees from the Tax Document Library, Amazon ads from Advertising Invoice History; Shiprocket, Easebuzz and Snapmint from their portals.' },
    { title: 'Book each as Purchase-Expense', body: 'Base amount to the fee / ad ledger, GST to Input GST, credit the platform’s control ledger (Amazon Expenses (Creditors), ShipRocket Collection, Easebuzz Collection A/c). Amazon ads also carry the TDS lines.' },
    { title: 'Pass the monthly Amazon expense JV', body: 'Dr Amazon Expenses (Creditors), Cr Cost of Advertising + FBA Inbound Pickup + settlement part of FBA storage. See the Amazon SOP for the full template (Journal 53).' },
    { title: 'Match to GSTR-2B', body: 'Tick every invoice against the month’s GSTR-2B; a missing invoice means no ITC — tell Hargun.' },
  ],
  examples: [
    {
      title: 'Amazon ads invoice · Purchase-Expense (Apr-26)',
      scenario: 'The GST invoice for Amazon ads, with recoverable TDS. Amazon was paid gross at source.',
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
      title: 'Shiprocket freight invoice (COD & prepaid)',
      scenario: 'Every Shiprocket GST invoice — COD and prepaid freight alike — credits the collection ledger.',
      voucherType: 'Purchase-Expense',
      journal: [
        { side: 'Dr', ledger: 'Freight Charges (Shiprocket) / Forward Delivery', amount: 'base' },
        { side: 'Dr', ledger: 'IGST/CGST/SGST Input', amount: 'GST' },
        { side: 'Cr', ledger: 'ShipRocket Collection', amount: 'invoice' },
      ],
      note: 'The month’s total freight booked should equal Total Deductions from COD on the Shiprocket COD Remittance page.',
    },
    {
      title: 'Easebuzz monthly fee invoice',
      scenario: 'The monthly Easebuzz invoice (April: Purchase-Expense 162, ₹8,052.18).',
      voucherType: 'Purchase-Expense',
      journal: [
        { side: 'Dr', ledger: 'PG Transaction Fee - Easebuzz', amount: 'base' },
        { side: 'Dr', ledger: 'IGST/CGST/SGST Input', amount: 'GST' },
        { side: 'Cr', ledger: 'Easebuzz Collection A/c', amount: 'invoice' },
      ],
      note: 'Open question for the CA: the payout journal already debits PG Transaction Fee - Easebuzz, so confirm whether the invoice should carry only the GST to avoid double-counting the fee.',
    },
  ],
  clearing:
    'Platform fee invoices credit the same control ledger the payouts debit, so each platform’s collection/creditor ledger nets out: Amazon Expenses (Creditors) ≈ 0 after the JV; ShipRocket Collection ≈ 0 when freight booked = Total Deductions from COD; Easebuzz Collection cleared by bank + invoice.',
  gotchas: [
    'Book platform invoices against the platform’s control ledger, NOT a plain expense + bank — that is how the clearing ledgers reconcile.',
    'Facebook India (₹20.0 L) and Google India (₹4.9 L) show as payables — confirm with Hargun whether open or unbooked.',
    'GST ITC is not available on some categories (motor-car, F&B, employee welfare) — mark "Ineligible ITC" in the narration.',
  ],
  visuals: [
    { key: 'expense.purchase-services', label: 'Purchase-Expense voucher booking a platform invoice' },
    { key: 'expense.tds-line', label: 'TDS line on an Amazon ads invoice' },
  ],
};

export function ExpenseSop() {
  return <SopLayout spec={spec} />;
}
