import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §S6 / §c9 (Banks).
const spec: SopSpec = {
  title: 'Banking — HDFC Bank A/C',
  description:
    'HDFC Bank A/C is a payments account (closing ₹1.81 L on the TB). It is imported from an Excel statement and reconciled month-end like the other banks — it is not a marketplace escrow.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Payment', billSeries: 'supplier / statutory payments' },
    { name: 'Receipt', billSeries: 'occasional credits' },
    { name: 'Contra', billSeries: 'transfers between banks' },
  ],
  ledgerMapping: [
    { role: 'Bank ledger', ledger: 'HDFC Bank  A/C' },
    { role: 'Supplier payments', ledger: 'Supplier (Sundry Creditor)' },
    { role: 'Transfers', ledger: 'Cash Credit Limit - [Central Bank] / ICICI Bank  A/C - CC' },
  ],
  steps: [
    { title: 'Download the HDFC statement', body: 'Export the Excel from HDFC NetBanking for the month.' },
    { title: 'Upload + import', body: 'File Manager → Bank Statement New → upload, then Tally → Banking → Import Bank Statement.' },
    { title: 'Reconcile', body: 'Match each line to an existing voucher, or create a Payment / Receipt against the right ledger. Transfers to/from other banks are Contra.' },
    { title: 'Month-end BRS', body: 'Run Tally BRS for HDFC and resolve uncleared items before the GST filings.' },
  ],
  examples: [
    {
      title: 'Supplier payment from HDFC',
      scenario: 'Pay a supplier bill from HDFC.',
      voucherType: 'Payment',
      journal: [
        { side: 'Dr', ledger: 'Supplier (Sundry Creditor)', amount: 'bill', note: 'against Bill Ref' },
        { side: 'Cr', ledger: 'HDFC Bank  A/C', amount: 'bill' },
      ],
    },
  ],
  gotchas: [
    'Book payments from the bank statement — not from Tranzact "Mark Paid", which points to a non-existent "Central Bank of India - Operating A/C".',
    'Always tag the Bill Ref on supplier payments so creditor ageing stays clean.',
  ],
  visuals: [
    { key: 'banking.hdfc.statement-import', label: 'HDFC statement import in Tally' },
    { key: 'banking.hdfc.settlement-journal', label: 'Reconciled HDFC payment' },
  ],
};

export function BankingHdfcSop() {
  return <SopLayout spec={spec} />;
}
