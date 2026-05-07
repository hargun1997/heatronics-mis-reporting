import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Sales — Blinkit',
  description:
    'Blinkit is a B2B buyer (quick-commerce). Sale is raised in Tranzact against the Blinkit GSTIN; receivable sits in Blinkit Receivable until the credit-period payout lands in Central Bank.',
  accent: 'brand',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Sales (Blinkit)', billSeries: 'BLK-YYYYMM-####' },
  ],
  ledgerMapping: [
    { role: 'Sales ledger', ledger: 'Sales — Blinkit' },
    { role: 'Clearing', ledger: 'Blinkit Receivable' },
    { role: 'GST (intra-state)', ledger: 'Output CGST + Output SGST' },
    { role: 'GST (inter-state)', ledger: 'Output IGST' },
    { role: 'Bank on settlement', ledger: 'Central Bank of India — Current A/c' },
  ],
  steps: [
    {
      title: 'Pick BLK-YYYYMM-#### bill series',
      body: 'Each Blinkit invoice goes against the Blinkit-only series so the plugin maps to Sales — Blinkit + Blinkit Receivable.',
    },
    {
      title: 'Verify Blinkit warehouse GSTIN + state',
      body: 'Blinkit operates from multiple states. The destination-state GSTIN drives intra/inter-state GST.',
    },
    {
      title: 'PO + GRN match',
      body: 'Blinkit pays only against PO + GRN reconciliation. Confirm the PO number and quantity match before saving the invoice.',
    },
    {
      title: 'Save & sync',
      body: 'On Save the Tally plugin UPSERTs the invoice into Tally against Sales — Blinkit + Blinkit Receivable.',
    },
    {
      title: 'Settlement on credit terms',
      body: 'Blinkit settles 15–30 days after invoice. Settlement lands in Central Bank and is booked in the Central Bank CC SOP, knocking off Blinkit Receivable.',
    },
  ],
  examples: [
    {
      title: 'Blinkit · Inter-state · ₹23,600 @ 18% GST',
      scenario: 'Order to Blinkit Gurugram warehouse from UP principal place of business.',
      voucherType: 'Sales (Blinkit)',
      journal: [
        { side: 'Dr', ledger: 'Blinkit Receivable', amount: '₹23,600.00' },
        { side: 'Cr', ledger: 'Sales — Blinkit', amount: '₹20,000.00' },
        { side: 'Cr', ledger: 'Output IGST', amount: '₹3,600.00' },
      ],
      note: 'Blinkit PO & GRN must match invoice for acceptance.',
    },
    {
      title: 'Blinkit · Intra-state · ₹11,800 @ 18% GST',
      scenario: 'Order to Blinkit Noida warehouse from UP principal place of business.',
      voucherType: 'Sales (Blinkit)',
      journal: [
        { side: 'Dr', ledger: 'Blinkit Receivable', amount: '₹11,800.00' },
        { side: 'Cr', ledger: 'Sales — Blinkit', amount: '₹10,000.00' },
        { side: 'Cr', ledger: 'Output CGST', amount: '₹900.00' },
        { side: 'Cr', ledger: 'Output SGST', amount: '₹900.00' },
      ],
    },
  ],
  clearing:
    'Blinkit Receivable holds the gross until the settlement payout (typically 15–30 days). Settlement is a simple Receipt voucher in Central Bank: Dr Central Bank, Cr Blinkit Receivable. Channel-fee deductions (if any) are journalled separately when Blinkit issues a debit note.',
  gotchas: [
    'Always carry the buyer GSTIN — Blinkit is a B2B buyer and rejects invoices without it.',
    'Inter-state vs intra-state depends on destination warehouse, not Blinkit’s HQ.',
    'Disputed POs delay settlement; flag any invoice older than 45 days for AR follow-up.',
  ],
  visuals: [
    { key: 'sales.blinkit.po-grn-match', label: 'PO + GRN match screen in Tranzact before invoice save' },
    { key: 'sales.blinkit.tally-result', label: 'Posted invoice in Tally with Blinkit Receivable' },
  ],
};

export function SalesBlinkitSop() {
  return <SopLayout spec={spec} />;
}
