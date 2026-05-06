import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Sales — Amazon',
  description:
    'Amazon Pan-India store — B2C and B2B (with buyer GSTIN). Booked in Tranzact; the Tally plugin UPSERTs to the Amazon sales ledger and the Amazon Unsettled Receivable clearing ledger. Settlement happens via the Amazon STR landing in HDFC Escrow.',
  accent: 'brand',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Sales (Amazon-B2C)', billSeries: 'AMZ-B2C-YYYYMM-####' },
    { name: 'Sales (Amazon-B2B)', billSeries: 'AMZ-B2B-YYYYMM-####' },
  ],
  ledgerMapping: [
    { role: 'B2C sales ledger', ledger: 'Sales — Amazon B2C' },
    { role: 'B2B sales ledger', ledger: 'Sales — Amazon B2B' },
    { role: 'Clearing', ledger: 'Amazon Unsettled Receivable' },
    { role: 'GST (intra-state)', ledger: 'Output CGST + Output SGST' },
    { role: 'GST (inter-state)', ledger: 'Output IGST' },
    { role: 'Bank on settlement', ledger: 'HDFC Bank — Escrow A/c' },
  ],
  steps: [
    {
      title: 'Pick the right Amazon bill series',
      body: 'AMZ-B2C-YYYYMM-#### for direct-to-consumer; AMZ-B2B-YYYYMM-#### only when the buyer has supplied a GSTIN. Mixing breaks GSTR-1.',
    },
    {
      title: 'Confirm party + buyer GSTIN (B2B)',
      body: 'Amazon Business orders carry the buyer GSTIN in the order details; copy it into the Tranzact party master before saving.',
    },
    {
      title: 'HSN and tax class',
      body: 'HSN auto-fills from the SKU master. Cross-check the GST rate (especially for promotional / bundled SKUs).',
    },
    {
      title: 'Save in Tranzact',
      body: 'On Save the Tally plugin UPSERTs the invoice into Tally on its next run, against Sales — Amazon B2C/B2B + Amazon Unsettled Receivable.',
    },
    {
      title: 'Settlement (STR / MTR)',
      body: 'Each Amazon Settlement Report knocks the Amazon Unsettled Receivable down. The Settlement Journal is booked under the HDFC Escrow SOP.',
    },
  ],
  examples: [
    {
      title: 'Amazon B2C · Intra-state · ₹1,180 @ 18% GST',
      scenario: 'Direct-to-consumer order dispatched from Amazon Pan-India store.',
      voucherType: 'Sales (Amazon-B2C)',
      journal: [
        { side: 'Dr', ledger: 'Amazon Unsettled Receivable', amount: '₹1,180.00', note: 'Incl. GST' },
        { side: 'Cr', ledger: 'Sales — Amazon B2C', amount: '₹1,000.00' },
        { side: 'Cr', ledger: 'Output CGST', amount: '₹90.00' },
        { side: 'Cr', ledger: 'Output SGST', amount: '₹90.00' },
      ],
      note: 'On Amazon STR (HDFC SOP): Dr HDFC Escrow (net), Dr Amazon Commission, Dr Input GST on commission, Cr Amazon Unsettled Receivable.',
    },
    {
      title: 'Amazon B2B · Inter-state · ₹11,800 @ 18% IGST',
      scenario: 'Amazon Business order dispatched to a Karnataka buyer (with GSTIN).',
      voucherType: 'Sales (Amazon-B2B)',
      journal: [
        { side: 'Dr', ledger: 'Amazon Unsettled Receivable', amount: '₹11,800.00' },
        { side: 'Cr', ledger: 'Sales — Amazon B2B', amount: '₹10,000.00' },
        { side: 'Cr', ledger: 'Output IGST', amount: '₹1,800.00' },
      ],
      note: 'Buyer GSTIN must be on the invoice — without it the order falls back into B2C and the buyer loses ITC.',
    },
  ],
  clearing:
    'All Amazon sales park in Amazon Unsettled Receivable. The Settlement Journal — booked when the STR arrives — knocks the receivable off, books commission / fees / Input GST / TCS, and credits HDFC Escrow with the net.',
  gotchas: [
    'Never credit Sales — Amazon directly against HDFC Escrow; always go via Amazon Unsettled Receivable.',
    'B2B vs B2C series mismatch is the #1 cause of GSTR-1 corrections — always verify before save.',
    'Watch promotional SKUs — the GST rate may be different from the master rate.',
  ],
};

export function SalesAmazonSop() {
  return <SopLayout spec={spec} />;
}
