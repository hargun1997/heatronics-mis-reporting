import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c4 (Blinkit Sales Series via Tranzact).
const spec: SopSpec = {
  title: 'Sales — Blinkit',
  description:
    'Blinkit is a quick-commerce B2B buyer. Invoices are raised in Tranzact under the Blinkit Sales Series and pushed to Tally by the Chrome plugin (same daily D1 flow as the other Tranzact sales). The receivable sits on the Blinkit party ledger until the credit-period payout lands in the Central Bank CC.',
  accent: 'brand',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Sales', billSeries: 'Blinkit Sales Series' },
    { name: 'Credit Note / Debit Note', billSeries: 'deductions / returns' },
  ],
  ledgerMapping: [
    { role: 'Sales ledger', ledger: 'Blinkit Sales' },
    { role: 'Receivable', ledger: 'Blinkit (party / Sundry Debtor)' },
    { role: 'GST output (UP)', ledger: 'IGST/CGST/SGST Output - 5%' },
    { role: 'Bank on settlement', ledger: 'Cash Credit Limit - [Central Bank]' },
  ],
  steps: [
    { title: 'Raise the invoice under the Blinkit Sales Series', body: 'Tranzact maps the Blinkit Sales Series to the Blinkit Sales ledger. Carry the buyer (Blinkit) GSTIN and destination state.' },
    { title: 'Match PO + GRN', body: 'Blinkit pays only against PO + GRN reconciliation. Confirm the PO number and quantity before saving.' },
    { title: 'Approve + push (D1)', body: 'Approve in Document Approval and push with the Chrome plugin in the daily D1 run (Sales voucher type). See the B2B / Tranzact SOP.' },
    { title: 'Settlement', body: 'Blinkit settles on credit terms into the Central Bank CC; book the receipt against the open invoice via Bill Ref. Channel-fee deductions come as Blinkit debit/credit notes.' },
  ],
  examples: [
    {
      title: 'Blinkit sale · inter-state · 5% GST',
      scenario: 'Order to a Blinkit warehouse in another state from the UP principal place of business.',
      voucherType: 'Sales',
      journal: [
        { side: 'Dr', ledger: 'Blinkit (party)', amount: 'gross' },
        { side: 'Cr', ledger: 'Blinkit Sales', amount: 'taxable' },
        { side: 'Cr', ledger: 'IGST Output - 5%', amount: 'GST' },
      ],
      note: 'Inter-state vs intra-state follows the destination warehouse, not Blinkit’s HQ.',
    },
  ],
  clearing:
    'The receivable sits on the Blinkit party ledger (no separate clearing ledger) and is knocked off by the Central Bank CC receipt via Bill Ref. Fee deductions are journalled from the Blinkit debit/credit note.',
  gotchas: [
    'Always carry the buyer GSTIN — Blinkit is B2B and rejects invoices without it.',
    'Disputed POs delay settlement; flag any invoice older than 45 days for AR follow-up.',
  ],
  visuals: [
    { key: 'sales.blinkit.po-grn-match', label: 'Blinkit Sales Series invoice in Tranzact' },
    { key: 'sales.blinkit.tally-result', label: 'Posted invoice in Tally against the Blinkit party ledger' },
  ],
};

export function SalesBlinkitSop() {
  return <SopLayout spec={spec} />;
}
