import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Sales SOP',
  description:
    'Everything about booking sales — across Amazon (MTR/STR), Shopify (prepaid via Easebuzz/Snapmint and COD via Shiprocket), Blinkit and direct B2B distributors.',
  accent: 'brand',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Sales (Amazon-B2C)', billSeries: 'AMZ-B2C-YYYYMM-####' },
    { name: 'Sales (Amazon-B2B)', billSeries: 'AMZ-B2B-YYYYMM-####' },
    { name: 'Sales (Shopify-Prepaid)', billSeries: 'SHO-PRE-YYYYMM-####' },
    { name: 'Sales (Shopify-COD)', billSeries: 'SHO-COD-YYYYMM-####' },
    { name: 'Sales (Blinkit)', billSeries: 'BLK-YYYYMM-####' },
    { name: 'Sales (B2B Distributor)', billSeries: 'B2B-YYYYMM-####' },
  ],
  ledgerMapping: [
    { role: 'Master sales ledger', ledger: 'Channel-wise Sales ledger' },
    { role: 'Clearing (marketplace)', ledger: 'Amazon Unsettled / Shiprocket COD / Easebuzz / Snapmint' },
    { role: 'GST (intra-state)', ledger: 'Output CGST + Output SGST' },
    { role: 'GST (inter-state)', ledger: 'Output IGST' },
    { role: 'B2B receivable', ledger: 'Party Ledger (Sundry Debtors)' },
  ],
  steps: [
    { title: 'Pick the right bill series in Tranzact', body: 'The bill series determines the voucher type and GST mapping that the plugin will push to Tally. Never mix series across channels.' },
    { title: 'Create / pick the party', body: 'For B2C, Amazon and Shopify templates are preset. For B2B use the distributor/Blinkit master — GSTIN must be populated for valid B2B invoices.' },
    { title: 'Add HSN and tax class', body: 'HSN is auto-filled from the item master. Cross-check GST rate for promotional SKUs.' },
    { title: 'Save & sync', body: 'On Save, the Tally Plugin picks up the invoice on its next run and UPSERTs it into Tally against the mapped sales ledger + clearing ledger.' },
    { title: 'Watch the clearing ledger', body: 'Until settlement, the receivable sits in the clearing ledger. The settlement journal (weekly/bi-weekly) knocks it off.' },
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
      note: 'On Amazon STR: Dr HDFC Escrow (net), Dr Amazon Commission, Dr Input GST on commission, Cr Amazon Unsettled Receivable.',
    },
    {
      title: 'Shopify COD · Intra-state · ₹1,770 @ 18% GST',
      scenario: 'COD order shipped via Shiprocket. Cash collected from buyer by courier.',
      voucherType: 'Sales (Shopify-COD)',
      journal: [
        { side: 'Dr', ledger: 'Shiprocket COD Remittance', amount: '₹1,770.00' },
        { side: 'Cr', ledger: 'Sales — Shopify (COD)', amount: '₹1,500.00' },
        { side: 'Cr', ledger: 'Output CGST', amount: '₹135.00' },
        { side: 'Cr', ledger: 'Output SGST', amount: '₹135.00' },
      ],
      note: 'On Shiprocket payout: Dr Central Bank, Dr Shiprocket Freight (+ Input GST), Cr Shiprocket COD Remittance.',
    },
    {
      title: 'Shopify Prepaid (Easebuzz) · ₹2,360 @ 18% GST',
      scenario: 'Order paid on Shopify via Easebuzz UPI. Payout lands in Central Bank on T+2.',
      voucherType: 'Sales (Shopify-Prepaid)',
      journal: [
        { side: 'Dr', ledger: 'Easebuzz Clearing', amount: '₹2,360.00' },
        { side: 'Cr', ledger: 'Sales — Shopify (Prepaid)', amount: '₹2,000.00' },
        { side: 'Cr', ledger: 'Output CGST', amount: '₹180.00' },
        { side: 'Cr', ledger: 'Output SGST', amount: '₹180.00' },
      ],
      note: 'On Easebuzz settlement: Dr Central Bank (net), Dr Payment Gateway Fees (+ Input GST), Cr Easebuzz Clearing.',
    },
    {
      title: 'Blinkit · Inter-state · ₹23,600 @ 18% GST',
      scenario: 'B2B order to Blinkit Gurugram warehouse from Maharashtra principal place of business.',
      voucherType: 'Sales (Blinkit)',
      journal: [
        { side: 'Dr', ledger: 'Blinkit Receivable', amount: '₹23,600.00' },
        { side: 'Cr', ledger: 'Sales — Blinkit', amount: '₹20,000.00' },
        { side: 'Cr', ledger: 'Output IGST', amount: '₹3,600.00' },
      ],
      note: 'Settles to Central Bank on agreed credit terms. Blinkit PO & GRN must match invoice for acceptance.',
    },
  ],
  clearing:
    'Every sale routed through a marketplace first lands in a clearing (receivable) ledger. The settlement journal — raised when the channel payout statement arrives — knocks off the clearing ledger, books commission / payment-gateway fees / TDS u/s 194-O / reserves, and remits the net to the correct bank. For Amazon the net lands in HDFC Escrow; for Shopify (Easebuzz/Snapmint/Shiprocket) it lands in Central Bank.',
  gotchas: [
    'Never directly credit Sales against a Bank ledger — always go via the clearing ledger, else month-end reconciliation breaks.',
    'B2B invoices (including to Amazon Business) must carry buyer GSTIN so the invoice flows correctly in GSTR-1.',
    'For inter-state sales check that the Output IGST ledger is mapped — intra-state uses CGST + SGST.',
  ],
};

export function SalesSop() {
  return <SopLayout spec={spec} />;
}
