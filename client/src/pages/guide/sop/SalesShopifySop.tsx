import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Sales — Shopify',
  description:
    'Shopify D2C orders — prepaid via Easebuzz / Snapmint, COD via Shiprocket. Booked in Tranzact; settlement lands in Central Bank (or Easebuzz Wire) via the channel’s clearing ledger.',
  accent: 'brand',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Sales (Shopify-Prepaid)', billSeries: 'SHO-PRE-YYYYMM-####' },
    { name: 'Sales (Shopify-COD)', billSeries: 'SHO-COD-YYYYMM-####' },
  ],
  ledgerMapping: [
    { role: 'Prepaid sales ledger', ledger: 'Sales — Shopify (Prepaid)' },
    { role: 'COD sales ledger', ledger: 'Sales — Shopify (COD)' },
    { role: 'Prepaid clearing', ledger: 'Easebuzz Clearing / Snapmint Clearing' },
    { role: 'COD clearing', ledger: 'Shiprocket COD Remittance' },
    { role: 'GST (intra-state)', ledger: 'Output CGST + Output SGST' },
    { role: 'GST (inter-state)', ledger: 'Output IGST' },
  ],
  steps: [
    {
      title: 'Identify payment mode',
      body: 'Shopify orders carry payment_gateway in the export. Prepaid → Easebuzz/Snapmint series. COD → Shiprocket series.',
    },
    {
      title: 'Pick the matching bill series in Tranzact',
      body: 'SHO-PRE-YYYYMM-#### for prepaid; SHO-COD-YYYYMM-#### for COD. Each maps to its own sales + clearing ledger.',
    },
    {
      title: 'Buyer details',
      body: 'D2C sales are typically B2C — no GSTIN. If a buyer requests a tax invoice, mark as B2B and capture GSTIN before saving.',
    },
    {
      title: 'Save & sync',
      body: 'On Save the Tally plugin UPSERTs the invoice into Tally against Sales — Shopify (Prepaid/COD) + the matching clearing ledger.',
    },
    {
      title: 'Settlement',
      body: 'Easebuzz daily wire is booked in the Easebuzz Wire SOP. Snapmint settlement and Shiprocket COD remittance land in Central Bank — both knock off their respective clearing ledgers.',
    },
  ],
  examples: [
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
      note: 'On Easebuzz daily wire (Easebuzz Wire SOP): Dr Central Bank (net), Dr Easebuzz Gateway Fee + Input GST, Cr Easebuzz Clearing.',
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
      title: 'Shopify Prepaid (Snapmint EMI) · ₹4,720 @ 18% GST',
      scenario: 'Buyer pays in 3-month EMI via Snapmint. Snapmint pays Heatronics upfront, less their fee.',
      voucherType: 'Sales (Shopify-Prepaid)',
      journal: [
        { side: 'Dr', ledger: 'Snapmint Clearing', amount: '₹4,720.00' },
        { side: 'Cr', ledger: 'Sales — Shopify (Prepaid)', amount: '₹4,000.00' },
        { side: 'Cr', ledger: 'Output CGST', amount: '₹360.00' },
        { side: 'Cr', ledger: 'Output SGST', amount: '₹360.00' },
      ],
      note: 'On Snapmint settlement: Dr Central Bank (net), Dr Snapmint Gateway Fee + Input GST, Cr Snapmint Clearing.',
    },
  ],
  clearing:
    'Prepaid Shopify orders sit in Easebuzz Clearing or Snapmint Clearing until daily / weekly settlement. COD orders sit in Shiprocket COD Remittance until the courier remits. None should ever be cleared directly against the bank — always via the clearing ledger.',
  gotchas: [
    'Never credit Sales — Shopify directly against Central Bank. Always via the matching clearing ledger.',
    'COD orders that fail (RTO) need a Credit Note that knocks the receivable off Shiprocket COD Remittance.',
    'Watch for Shopify combo / discount orders — the GST base may need a manual adjustment before save.',
  ],
  visuals: [
    { key: 'sales.shopify.payment-mode', label: 'Identifying COD vs Prepaid in the Shopify export' },
    { key: 'sales.shopify.tally-result', label: 'Voucher in Tally after plugin sync' },
  ],
};

export function SalesShopifySop() {
  return <SopLayout spec={spec} />;
}
