import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c5 / §S5 / §c16 M2 / §c23 (Shiprocket FAQ).
const spec: SopSpec = {
  title: 'Shiprocket COD Remittance (monthly, plugin option 5)',
  description:
    'Shiprocket collects COD for Shopify orders and remits it monthly. The COD remittance report is uploaded to the Tally server and imported with option 5; the journal clears the Shopify COD Receivable into ShipRocket Collection. Every Shiprocket freight invoice (COD and prepaid) is then booked as Purchase-Expense against the same collection ledger, and must tie to Total Deductions from COD.',
  accent: 'brand',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Journal (Shiprocket COD)', billSeries: 'bill ref = Shiprocket id ↔ HTR-<order>-D2C' },
    { name: 'Purchase-Expense', billSeries: 'freight invoices' },
  ],
  ledgerMapping: [
    { role: 'Collector (clearing)', ledger: 'ShipRocket Collection' },
    { role: 'Receivable cleared', ledger: 'Shopify COD Receivable' },
    { role: 'Freight', ledger: 'Freight Charges (Shiprocket) / Forward Delivery + Input GST' },
    { role: 'Bank (final)', ledger: 'Cash Credit Limit - [Central Bank]' },
  ],
  steps: [
    { title: 'Download the COD remittance report', body: 'Shiprocket → COD Remittance (and Instant Reports). Save it as downloaded, renamed YYYY-MM_Mon_Shiprocket_COD_AWB.xls. Do not edit its contents.' },
    { title: 'Upload to Custom Uploads', body: 'Tally On Cloud portal → File Manager → Custom Uploads → upload.' },
    { title: 'Import with option 5', body: 'Option 5 → Platform Shiprocket; give the folder, exact file name and sheet name (AWB level report). Shiprocket files are .xls with DD-Mon-YY dates. The journal clears Shopify COD Receivable (HTR-<order>-D2C) into ShipRocket Collection (bill ref = Shiprocket id).' },
    { title: 'Book freight invoices and tie out', body: 'Book every Shiprocket GST invoice — COD and prepaid freight alike — as Dr freight + GST, Cr ShipRocket Collection. The month’s total booked should equal Total Deductions from COD on the COD Remittance page.' },
  ],
  examples: [
    {
      title: 'Shiprocket COD remittance (Apr-26)',
      scenario: 'Real April-26 Journal 1 — Shiprocket remits COD for several orders.',
      voucherType: 'Journal (Shiprocket COD)',
      journal: [
        { side: 'Dr', ledger: 'ShipRocket Collection', amount: '₹24,176.20' },
        { side: 'Cr', ledger: 'Shopify COD Receivable', amount: '₹24,176.20', note: 'Against HTR-18836-D2C, HTR-18841-D2C …' },
      ],
    },
    {
      title: 'Shiprocket freight invoice',
      scenario: 'A Shiprocket GST invoice for freight, COD and prepaid alike.',
      voucherType: 'Purchase-Expense',
      journal: [
        { side: 'Dr', ledger: 'Freight Charges (Shiprocket) / Forward Delivery', amount: 'base' },
        { side: 'Dr', ledger: 'IGST/CGST/SGST Input', amount: 'GST' },
        { side: 'Cr', ledger: 'ShipRocket Collection', amount: 'invoice' },
      ],
      note: 'It is material: on 17-Oct-26 the dashboard showed Total COD Remitted ₹98.76 L and deductions ₹49.95 L.',
    },
  ],
  clearing:
    'ShipRocket Collection should net to ≈ 0: COD remitted in, bank receipts + all freight invoices out. The TB shows it ₹3.96 L Cr — check for wallet recharges paid from bank and invoices booked to the wrong ledger.',
  gotchas: [
    'Three near-duplicate Shiprocket creditors exist (ShipRocket, Shiprocket Limited, SHIPROCKET PRIVATE LIMITED) and three freight heads — use the right ones; do not create more.',
    'Option 5 rejects the file unless it is in Custom Uploads, the name is retyped exactly, the sheet name is exact (AWB level report), and dates are DD-Mon-YY. Send rejects to Hargun.',
    'How Shiprocket wallet recharges are booked is an open internal query.',
  ],
  visuals: [
    { key: 'shiprocket.cod', label: 'Shiprocket COD Remittance page' },
    { key: 'shiprocket.option5', label: 'Option 5 set to Shiprocket' },
  ],
};

export function ShiprocketCodSop() {
  return <SopLayout spec={spec} />;
}
