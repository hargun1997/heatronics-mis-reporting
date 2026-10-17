import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §S6 / §c9 (Banks) + §c23 (bank FAQ).
const spec: SopSpec = {
  title: 'Banking — Central Bank CC (operating)',
  description:
    'Cash Credit Limit - [Central Bank] is the operating OD account. Every channel payout — Amazon, Easebuzz, Snapmint, Shiprocket — lands here, and supplier payments go out from here. Imported at month end from an Excel statement via Tally Banking.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Receipt', billSeries: 'clears collection ledgers / Amazon Bank' },
    { name: 'Payment', billSeries: 'suppliers, salary, statutory' },
  ],
  ledgerMapping: [
    { role: 'Bank ledger', ledger: 'Cash Credit Limit - [Central Bank] (Bank OD)' },
    { role: 'Channel credits', ledger: 'Easebuzz / Snapmint / ShipRocket Collection · Amazon Bank' },
    { role: 'Supplier payments', ledger: 'Supplier (Sundry Creditor)' },
    { role: 'Statutory', ledger: 'TDS Payable / GST Payable' },
  ],
  steps: [
    { title: 'Download the statement', body: 'Export the Central Bank Excel. The column headings must be on row 14, or the import fails.' },
    { title: 'Upload + import', body: 'File Manager → Bank Statement New → upload. Tally → Banking → Import Bank Statement, then reconcile line by line.' },
    { title: 'Route each credit', body: 'Easebuzz / Snapmint / Shiprocket credits → their Collection ledger; Amazon credits → Amazon Bank; direct B2B receipts → the party ledger. This is what empties the clearing ledgers.' },
    { title: 'Route each payment', body: 'Supplier payments against a Bill Ref; salary; GST / TDS challans (reference the period in the narration).' },
    { title: 'Anything unknown → Hargun', body: 'Do NOT park unknown entries in Suspense — it already holds ₹12.65 L. Name them to Hargun.' },
  ],
  examples: [
    {
      title: 'Easebuzz wire clears the collection ledger',
      scenario: 'The daily Easebuzz settlement credit lands in the Central Bank CC.',
      voucherType: 'Receipt',
      journal: [
        { side: 'Dr', ledger: 'Cash Credit Limit - [Central Bank]', amount: 'net' },
        { side: 'Cr', ledger: 'Easebuzz Collection A/c', amount: 'net' },
      ],
    },
    {
      title: 'Amazon payout clears Amazon Bank',
      scenario: 'Amazon’s net payout, already moved to Amazon Bank by the settlement chain, hits the bank.',
      voucherType: 'Receipt',
      journal: [
        { side: 'Dr', ledger: 'Cash Credit Limit - [Central Bank]', amount: '₹44,942.53' },
        { side: 'Cr', ledger: 'Amazon Bank', amount: '₹44,942.53' },
      ],
    },
  ],
  clearing:
    'The bank is the last link in every chain: receipts here empty the collection ledgers and Amazon Bank; payments here clear suppliers. Marketplace payouts must land here (not a notional escrow).',
  gotchas: [
    'Central Bank Excel: headings on row 14 — otherwise the import rejects the file.',
    'Import monthly and reconcile; letting it pile up makes the BRS painful.',
    'CC interest debits are an expense (Bank Charges / Finance Costs), not a transfer.',
  ],
  visuals: [
    { key: 'banking.central.statement-import', label: 'Bank Statement New upload in File Manager' },
    { key: 'banking.central.vendor-payment', label: 'Reconciling a channel payout against the collection ledger' },
  ],
};

export function BankingCentralCcSop() {
  return <SopLayout spec={spec} />;
}
