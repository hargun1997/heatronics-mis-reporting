import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Sales — B2B Distributors',
  description:
    'Direct B2B sales to distributors (and OEM / offline dealers). Booked in Tranzact against the distributor’s Sundry Debtor; receipt is posted as a Receipt voucher in Central Bank when the wire / cheque clears.',
  accent: 'brand',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Sales (B2B Distributor)', billSeries: 'B2B-YYYYMM-####' },
  ],
  ledgerMapping: [
    { role: 'Sales ledger', ledger: 'Sales — B2B Distributors' },
    { role: 'Receivable', ledger: 'Distributor / OEM Party (Sundry Debtor)' },
    { role: 'GST (intra-state)', ledger: 'Output CGST + Output SGST' },
    { role: 'GST (inter-state)', ledger: 'Output IGST' },
    { role: 'Bank on receipt', ledger: 'Central Bank of India — Current A/c' },
  ],
  steps: [
    {
      title: 'Create or pick the distributor party',
      body: 'Each distributor / OEM / offline dealer has a Sundry Debtor master in Tranzact with their GSTIN, billing address and credit terms.',
    },
    {
      title: 'Pick B2B-YYYYMM-#### bill series',
      body: 'Direct B2B sales use the B2B series so they don’t mix with marketplace channels in GSTR-1.',
    },
    {
      title: 'Confirm GSTIN + state',
      body: 'Distributor GSTIN drives intra-state vs inter-state GST. Verify before save — corrections post-filing are painful.',
    },
    {
      title: 'Save & sync',
      body: 'On Save the Tally plugin UPSERTs the invoice into Tally against Sales — B2B Distributors + the distributor’s Sundry Debtor.',
    },
    {
      title: 'Receipt on payment',
      body: 'When the wire / cheque clears in Central Bank, post a Receipt voucher knocking off the open invoice via Bill Ref. Booked under the Central Bank CC SOP.',
    },
  ],
  examples: [
    {
      title: 'Distributor sale · Inter-state · ₹47,200 @ 18% GST',
      scenario: 'Sale to a distributor in Maharashtra against open credit terms.',
      voucherType: 'Sales (B2B Distributor)',
      journal: [
        { side: 'Dr', ledger: 'Distributor Co (Sundry Debtor)', amount: '₹47,200.00' },
        { side: 'Cr', ledger: 'Sales — B2B Distributors', amount: '₹40,000.00' },
        { side: 'Cr', ledger: 'Output IGST', amount: '₹7,200.00' },
      ],
      note: 'On receipt: Dr Central Bank, Cr Distributor Co (Sundry Debtor) with Bill Ref against the open invoice.',
    },
    {
      title: 'OEM sale · Intra-state · ₹23,600 @ 18% GST',
      scenario: 'Branded OEM order from a UP buyer on 30-day credit.',
      voucherType: 'Sales (B2B Distributor)',
      journal: [
        { side: 'Dr', ledger: 'OEM Buyer (Sundry Debtor)', amount: '₹23,600.00' },
        { side: 'Cr', ledger: 'Sales — B2B Distributors', amount: '₹20,000.00' },
        { side: 'Cr', ledger: 'Output CGST', amount: '₹1,800.00' },
        { side: 'Cr', ledger: 'Output SGST', amount: '₹1,800.00' },
      ],
    },
  ],
  clearing:
    'No clearing ledger — the receivable sits directly on the distributor’s Sundry Debtor. Receipt knocks it off via Bill Ref in Central Bank.',
  gotchas: [
    'Always tag the buyer GSTIN — without it the buyer loses ITC and may demand a credit note.',
    'Track the credit period; any invoice past due needs an AR follow-up before month-end.',
    'For partial payments, knock off the matching Bill Refs — never lump partials onto a single ref.',
  ],
};

export function SalesB2BSop() {
  return <SopLayout spec={spec} />;
}
