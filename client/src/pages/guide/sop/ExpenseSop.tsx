import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Expense SOP',
  description:
    'Booking operating expenses directly in Tally — these do not route through Tranzact. Covers rent, utilities, freight, advertising, professional fees and payment-gateway charges.',
  accent: 'amber',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Purchase (Services)' },
    { name: 'Journal', billSeries: 'for provisions & adjustments' },
  ],
  ledgerMapping: [
    { role: 'Expense ledger', ledger: 'Indirect Expense (e.g. Rent, Freight, Advertising)' },
    { role: 'Input GST', ledger: 'Input CGST + SGST or Input IGST' },
    { role: 'TDS (if applicable)', ledger: 'TDS Payable — 194C / 194J / 194-I / 194-O' },
    { role: 'Counter-party', ledger: 'Vendor (Sundry Creditors)' },
  ],
  steps: [
    { title: 'Verify bill completeness', body: 'GSTIN on the bill must match the vendor master; HSN/SAC populated for ITC eligibility.' },
    { title: 'Book in Tally as Purchase (Services)', body: 'Use the correct expense ledger. Never book services via Tranzact — inventory is not involved.' },
    { title: 'Deduct TDS if applicable', body: 'Contractor: 194C · Professional fees: 194J · Rent: 194-I · E-commerce: 194-O. Credit the TDS Payable ledger.' },
    { title: 'Pay through the right bank', body: 'Petty & small payments go from ICICI; larger vendor payments go from Central Bank.' },
  ],
  examples: [
    {
      title: 'Shiprocket freight · ₹11,800 @ 18% GST',
      scenario: 'Monthly freight invoice from Shiprocket for COD & prepaid shipments.',
      voucherType: 'Purchase (Services)',
      journal: [
        { side: 'Dr', ledger: 'Shiprocket — Freight Charges', amount: '₹10,000.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹900.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹900.00' },
        { side: 'Cr', ledger: 'Shiprocket (Sundry Creditor)', amount: '₹11,800.00' },
      ],
      note: 'No TDS on courier aggregators below the 194C threshold; check vendor-wise YTD.',
    },
    {
      title: 'Office rent · ₹50,000 + 18% GST · TDS 194-I',
      scenario: 'Monthly office rent; TDS @ 10% u/s 194-I on base ₹50,000.',
      voucherType: 'Purchase (Services)',
      journal: [
        { side: 'Dr', ledger: 'Rent', amount: '₹50,000.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹4,500.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹4,500.00' },
        { side: 'Cr', ledger: 'Landlord (Sundry Creditor)', amount: '₹54,000.00' },
        { side: 'Cr', ledger: 'TDS Payable — 194-I', amount: '₹5,000.00' },
      ],
    },
    {
      title: 'Digital advertising (Google Ads) · ₹100,000 + 18% GST',
      scenario: 'Direct ad spend via Google Ads India entity.',
      voucherType: 'Purchase (Services)',
      journal: [
        { side: 'Dr', ledger: 'Digital Advertising', amount: '₹100,000.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹9,000.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹9,000.00' },
        { side: 'Cr', ledger: 'Google India Pvt Ltd', amount: '₹118,000.00' },
      ],
    },
  ],
  gotchas: [
    'Expenses booked via Tranzact will NOT appear in the right P&L head — always book directly in Tally.',
    'Personal expenses or owner-paid bills must be routed through a director/owner ledger, never directly into a bank account.',
    'GST ITC is not available on some categories (motor-car, food & beverages, employee welfare) — tag them as "Ineligible ITC" in the narration.',
  ],
};

export function ExpenseSop() {
  return <SopLayout spec={spec} />;
}
