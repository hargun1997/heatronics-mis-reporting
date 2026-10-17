import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §S6 / §c9 (Banks) + finding #8.
const spec: SopSpec = {
  title: 'Banking — ICICI Bank A/C - CC',
  description:
    'ICICI Bank  A/C - CC is a payments account. On the TB it shows ₹1.22 Cr net credit, so it is probably overdrawn and should be regrouped to Bank OD A/c (open finding #8, for the CA). Imported from Excel and reconciled month-end.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Payment', billSeries: 'supplier / expense payments' },
    { name: 'Receipt', billSeries: 'credits' },
    { name: 'Contra', billSeries: 'transfers between banks' },
  ],
  ledgerMapping: [
    { role: 'Bank ledger', ledger: 'ICICI Bank  A/C - CC' },
    { role: 'Counter-party', ledger: 'Supplier / expense / another bank' },
  ],
  steps: [
    { title: 'Download the ICICI statement', body: 'Export the Excel from ICICI NetBanking for the month.' },
    { title: 'Upload + import', body: 'File Manager → Bank Statement New → upload, then Tally → Banking → Import Bank Statement.' },
    { title: 'Reconcile', body: 'Match each line or create a Payment / Receipt; inter-bank transfers are Contra. Unknown entries → name to Hargun, not Suspense.' },
    { title: 'Flag the grouping', body: 'With ₹1.22 Cr net credit, ICICI likely belongs under Bank OD A/c rather than Bank Accounts — raise with the CA.' },
  ],
  examples: [
    {
      title: 'Inter-bank transfer',
      scenario: 'Move funds between ICICI and the Central Bank CC.',
      voucherType: 'Contra',
      journal: [
        { side: 'Dr', ledger: 'ICICI Bank  A/C - CC', amount: 'amount' },
        { side: 'Cr', ledger: 'Cash Credit Limit - [Central Bank]', amount: 'amount' },
      ],
    },
  ],
  gotchas: [
    'ICICI classified under Bank Accounts but net-credit ₹1.22 Cr → regroup to Bank OD (finding #8).',
    'Tally BRS still needs human review — the feed can mislabel counter-parties.',
  ],
  visuals: [
    { key: 'banking.icici.bank-feed', label: 'ICICI statement import in Tally' },
    { key: 'banking.icici.review-tag', label: 'Tagging the counter-party before save' },
  ],
};

export function BankingIciciSop() {
  return <SopLayout spec={spec} />;
}
