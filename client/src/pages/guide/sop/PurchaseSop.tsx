import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Purchase SOP',
  description:
    'Booking inventory-related purchases — raw material and packing material — via Tranzact, with input GST tracked correctly for the monthly GSTR-2B match.',
  accent: 'emerald',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Purchase (RM)', billSeries: 'PUR-RM-YYYYMM-####' },
    { name: 'Purchase (Packing Material)', billSeries: 'PUR-PKG-YYYYMM-####' },
  ],
  ledgerMapping: [
    { role: 'Master purchase ledger', ledger: 'Purchase — Raw Material / Purchase — Packing Material' },
    { role: 'GST (intra-state)', ledger: 'Input CGST + Input SGST' },
    { role: 'GST (inter-state)', ledger: 'Input IGST' },
    { role: 'Counter-party', ledger: 'Vendor (Sundry Creditors)' },
  ],
  steps: [
    { title: 'Create the vendor master in Tranzact', body: 'Populate GSTIN, PAN, and default place of supply. These drive the intra/inter-state tax classification.' },
    { title: 'Raise a Goods Received Note (GRN)', body: 'Link the GRN to the PO; post-GRN the Purchase Invoice uses the received quantity & rate.' },
    { title: 'Book the Purchase Invoice', body: 'Pick the correct bill series (RM vs Packing). Check HSN & GST rate. Attach vendor invoice PDF.' },
    { title: 'Sync to Tally', body: 'The plugin UPSERTs the purchase voucher in Tally with Dr Purchase + Dr Input GST and Cr Vendor Ledger.' },
    { title: 'Match to GSTR-2B', body: 'On 14th of the next month, match the booked ITC against GSTR-2B. Flag any mismatch as a reconciliation item in the Tracker.' },
  ],
  examples: [
    {
      title: 'RM from Gujarat vendor · Intra-state in MH? No → IGST',
      scenario: 'Raw material invoice ₹11,800 incl. 18% IGST (vendor in Gujarat, Heatronics in Maharashtra).',
      voucherType: 'Purchase (RM)',
      journal: [
        { side: 'Dr', ledger: 'Purchase — Raw Material', amount: '₹10,000.00' },
        { side: 'Dr', ledger: 'Input IGST', amount: '₹1,800.00' },
        { side: 'Cr', ledger: 'ABC Materials Pvt Ltd (Sundry Creditor)', amount: '₹11,800.00' },
      ],
    },
    {
      title: 'Packing material · Intra-state · ₹5,900 @ 18% GST',
      scenario: 'Corrugated boxes from a local Maharashtra vendor.',
      voucherType: 'Purchase (Packing Material)',
      journal: [
        { side: 'Dr', ledger: 'Purchase — Packing Material', amount: '₹5,000.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹450.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹450.00' },
        { side: 'Cr', ledger: 'Box Co (Sundry Creditor)', amount: '₹5,900.00' },
      ],
    },
  ],
  gotchas: [
    'Purchases of services (freight, professional fees) do NOT come here — they are booked directly in Tally. See Expense SOP.',
    'If the vendor raises a debit/credit note later, post it as a separate voucher — never edit the original invoice after sync.',
    'Capital goods are handled in the Capital Goods SOP, not here — different voucher and ITC treatment.',
  ],
};

export function PurchaseSop() {
  return <SopLayout spec={spec} />;
}
