import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c5 / §S5 / §c16 M3 / §c23 (Snapmint FAQ).
const spec: SopSpec = {
  title: 'Snapmint Settlements (monthly, plugin option 5)',
  description:
    'Snapmint is the EMI/BNPL prepaid option on Shopify. Its settlement report arrives by email, is uploaded to the Tally server, and imported with option 5. The journal clears the Shopify Prepaid Receivable into Snapmint Collection. There are no Snapmint settings on tally-integration.in — its mapping lives inside the TCP.',
  accent: 'brand',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Journal / SnapMint Journal', billSeries: 'bill ref = Snapmint order / loan ref' },
    { name: 'Debit Note', billSeries: 'fee credits (e.g. DN 16, ₹100.10)' },
  ],
  ledgerMapping: [
    { role: 'Collector (clearing)', ledger: 'Snapmint Collection' },
    { role: 'Receivable cleared', ledger: 'Shopify Prepaid Receivable' },
    { role: 'Bank (final)', ledger: 'Cash Credit Limit - [Central Bank]' },
  ],
  steps: [
    { title: 'Request the report', body: 'Snapmint merchant portal → Reports → Download Merchant Settlement Daily Report (Start = 1st, End = last day, UTR blank, accounts email). It arrives by email only after you request it.' },
    { title: 'Name and upload', body: 'Save the emailed file per the Custom Uploads convention, e.g. 2026-05_May_Snapmint_Group_Settlement_Report.csv, and upload to File Manager → Custom Uploads. Do not edit it.' },
    { title: 'Import with option 5', body: 'Option 5 (Courier Partner / COD Reports) → Platform Snapmint, give the folder, exact file name and sheet name (Sheet 1). Snapmint files are the older 27-column CSV with DD-MM-YYYY dates.' },
    { title: 'Reconcile', body: 'Snapmint Collection should hold only the last 1–2 days before the bank receipt. If Snapmint deducts cashback from the payout, confirm the net matches the bank credit.' },
  ],
  examples: [
    {
      title: 'Snapmint settlement clears a prepaid order',
      scenario: 'A Snapmint payout knocks off the Shopify prepaid receivable it financed.',
      voucherType: 'Journal / SnapMint Journal',
      journal: [
        { side: 'Dr', ledger: 'Snapmint Collection', amount: 'net' },
        { side: 'Cr', ledger: 'Shopify Prepaid Receivable', amount: 'net' },
      ],
      note: 'Snapmint fee credits come as Debit Notes (e.g. DN 16, ₹100.10). Snapmint Collection is then cleared by the Central Bank receipt.',
    },
  ],
  clearing:
    'Snapmint Collection holds the settled amount until the bank receipt. Confirm whether the report requested is the Group or the Merchant daily report (open internal query).',
  gotchas: [
    'There are NO Snapmint settings on tally-integration.in — the mapping is inside the TCP. Snapmint posts under two voucher types: Journal and SnapMint Journal.',
    'Option 5 rejects a file if it is not in Custom Uploads, the file name is not retyped exactly, the sheet name is wrong (Sheet 1), or the date format is wrong (27 columns, DD-MM-YYYY). Send a rejected file to Hargun — do not edit it.',
    'Treat the import as one-time — re-importing the same file double-books.',
  ],
  visuals: [
    { key: 'snapmint.download', label: 'Snapmint Merchant Settlement report request' },
    { key: 'snapmint.option5', label: 'Option 5 set to Snapmint' },
  ],
};

export function SnapmintSop() {
  return <SopLayout spec={spec} />;
}
