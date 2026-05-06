import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Banking — Easebuzz Wire',
  description:
    'Easebuzz Wire is the bank-grade settlement rail used to route prepaid Shopify collections (Easebuzz / Snapmint) into the company current account. Flows are booked in Tally only; Tranzact does not touch this rail.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Receipt', billSeries: 'gateway settlement' },
    { name: 'Journal', billSeries: 'gateway fee + TDS' },
    { name: 'Contra', billSeries: 'wire to operating account' },
  ],
  ledgerMapping: [
    { role: 'Settlement clearing', ledger: 'Easebuzz Clearing' },
    { role: 'Gateway fee', ledger: 'Easebuzz Gateway Fee' },
    { role: 'TDS u/s 194-O (if applicable)', ledger: 'TDS Receivable — 194-O' },
    { role: 'Counter-party', ledger: 'Central Bank of India — Current A/c' },
  ],
  steps: [
    {
      title: 'Wait for Easebuzz daily payout report',
      body: 'Each business day Easebuzz sends a payout email. Download the CSV — it shows gross, gateway fee, GST on fee and net wired to Central Bank.',
    },
    {
      title: 'Receipt voucher in Tally',
      body: 'Dr Central Bank for the net amount. Cr Easebuzz Clearing for the gross amount. The difference is fee + GST.',
    },
    {
      title: 'Journal the gateway fee',
      body: 'Dr Easebuzz Gateway Fee + Input CGST + Input SGST. Cr Easebuzz Clearing for the same total. The clearing ledger should now zero out for that day’s payout.',
    },
    {
      title: 'TDS u/s 194-O (only if Heatronics is the deductee)',
      body: 'If the gateway has deducted TDS, post a Journal: Dr TDS Receivable — 194-O, Cr Easebuzz Clearing.',
    },
    {
      title: 'Reconcile against Shopify orders',
      body: 'Tie the gross to the Shopify (Prepaid) clearing report. Any unmatched orders need investigation before month-end close.',
    },
  ],
  examples: [
    {
      title: 'Easebuzz daily wire',
      scenario: 'Gross collected ₹50,000; gateway fee ₹500 + GST ₹90; net wired to Central Bank ₹49,410.',
      voucherType: 'Receipt + Journal',
      journal: [
        { side: 'Dr', ledger: 'Central Bank of India — Current A/c', amount: '₹49,410.00' },
        { side: 'Dr', ledger: 'Easebuzz Gateway Fee', amount: '₹500.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹45.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹45.00' },
        { side: 'Cr', ledger: 'Easebuzz Clearing', amount: '₹50,000.00' },
      ],
      note: 'Two vouchers in Tally — Receipt for the wire, Journal for the fee — but they share the same Easebuzz Clearing line that should net to zero.',
    },
  ],
  clearing:
    'Easebuzz Clearing is a non-bank suspense ledger. Each day the Receipt + Journal pair must zero it out. If a balance carries over, an order failed to wire and needs to be chased.',
  gotchas: [
    'Never post Shopify sales directly to Central Bank — they always route via Easebuzz Clearing first.',
    'Daily reconciliation is mandatory; weekly batches lose visibility into individual gateway disputes.',
  ],
};

export function BankingEasebuzzWireSop() {
  return <SopLayout spec={spec} />;
}
