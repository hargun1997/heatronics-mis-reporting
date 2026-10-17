import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c7 (GST) + §c1 (registrations) + §c16 (close).
const spec: SopSpec = {
  title: 'GST (GSTR-1 / 3B / 2B)',
  description:
    'Five GST registrations (UP principal; HR, KA, MH, TS for Amazon FBA). The device sells at 5% (HSN 90211000) while most inputs and services are 18%, so the business is inverted-duty and input credit accumulates. Output GST comes from three families — Tranzact, Shopify and Amazon MTR — plus state-wise stock-transfer GST.',
  accent: 'amber',
  operateIn: 'Both',
  voucherTypes: [
    { name: 'GSTR-1', billSeries: 'by 10th to CA (due 11th)' },
    { name: 'GSTR-3B', billSeries: 'by 20th' },
    { name: 'GSTR-2B match', billSeries: 'by 14th' },
  ],
  ledgerMapping: [
    { role: 'Tranzact output', ledger: 'IGST/CGST/SGST Output - 5% (also 12% / 18%)' },
    { role: 'Shopify output', ledger: 'IGST 5.00% · CGST 2.500% · SGST 2.500%' },
    { role: 'Amazon output', ledger: 'IGST/CGST/SGST Output-<STATE>' },
    { role: 'Stock transfer', ledger: 'GST Stock Transfer (state-wise)' },
    { role: 'Input', ledger: 'GST Input (≈ ₹63.7 L accumulated)' },
    { role: 'Amazon TCS (sec 52)', ledger: 'TCS-IGST/CGST/SGST (Amazon)' },
  ],
  steps: [
    { title: 'GSTR-1 data (by Day 10, due 11th)', body: 'Pull output by GSTIN from the three families: Tranzact sales register (UP), Shopify sales in Tally (UP), Amazon MTR-B2C / B2B per GSTIN (UP, HR, KA, MH, TS). STR feeds the GST Stock Transfer group. Send to the CA.' },
    { title: 'GSTR-2B match (by Day 14)', body: 'Match booked ITC against GSTR-2B. ITC is only claimable for invoices in 2B (Section 16(2)(aa)). Missing invoice → no ITC → tell Hargun.' },
    { title: 'Amazon TCS claim (sec 52)', body: 'Claim the TCS-IGST/CGST/SGST (Amazon) (≈ ₹43,544) in the electronic cash ledger per GSTIN.' },
    { title: 'GSTR-3B + set-off (by Day 20)', body: 'File 3B and pass the monthly set-off / payment journals. Note: no set-off/payment journals currently appear in the books, and GST Payable (<state>) shows ~₹1.01 Cr with no movement — confirm with the CA.' },
    { title: 'Inverted-duty refund', body: 'With 5% output vs 18% inputs, ITC accumulates (GST Input ≈ ₹63.7 L; a GST Refund ledger exists). Whether to file an inverted-duty refund is an open question for the CA.' },
  ],
  examples: [
    {
      title: 'Shopify output GST (UP, 5%, price-inclusive)',
      scenario: 'Shopify prepaid sale — output GST split 2.5% + 2.5% (intra-state).',
      voucherType: 'Shopify Sales',
      journal: [
        { side: 'Dr', ledger: 'Shopify Prepaid Receivable', amount: 'gross (incl. GST)' },
        { side: 'Cr', ledger: 'Shopify Sales', amount: 'taxable' },
        { side: 'Cr', ledger: 'CGST 2.500% + SGST 2.500%', amount: 'GST' },
      ],
    },
    {
      title: 'Amazon output GST (per GSTIN)',
      scenario: 'MTR sale booked against the state GSTIN, inter-state at 5%.',
      voucherType: 'Sales-Amazon-<STATE>',
      journal: [
        { side: 'Dr', ledger: 'Amazon Seller A/c', amount: 'gross' },
        { side: 'Cr', ledger: 'Amazon Sales', amount: 'taxable' },
        { side: 'Cr', ledger: 'IGST Output-<STATE>', amount: 'GST' },
      ],
    },
  ],
  clearing:
    'Output − input = net payable per GSTIN, settled monthly through the set-off JV and the challan payment. Because the business is inverted-duty, most months accumulate credit rather than pay cash.',
  gotchas: [
    'Monthly set-off / payment journals are currently missing — GST Payable (<state>) carries ~₹1.01 Cr with no movement (finding #7, for the CA).',
    'Unexpected states exist: IGST Output-DELHI / -GUJARAT and Purchase-STR-DELHI/GUJARAT with no registration there — query for the CA.',
    'Near-duplicate GST ledgers (e.g. IGST 5.00% vs IGST Output - 5%) come from the plugin and Tranzact using different names — merge under CA guidance, don’t create more.',
  ],
  visuals: [
    { key: 'gst.gstr1', label: 'Output-by-GSTIN working for GSTR-1' },
    { key: 'gst.gstr2b', label: 'GSTR-2B match' },
  ],
};

export function GstSop() {
  return <SopLayout spec={spec} />;
}
