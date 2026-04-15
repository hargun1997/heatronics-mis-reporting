import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Banking SOP',
  description:
    'How to work with each of our three bank accounts: ICICI (live Tally feed, petty), Central Bank (manual import, daily transactions), and HDFC (manual import, escrow for marketplace settlements).',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Receipt' },
    { name: 'Payment' },
    { name: 'Contra', billSeries: 'bank transfers' },
    { name: 'Journal', billSeries: 'settlements' },
  ],
  ledgerMapping: [
    { role: 'Live feed', ledger: 'ICICI Bank — Current A/c' },
    { role: 'Daily transactions', ledger: 'Central Bank of India — Current A/c' },
    { role: 'Marketplace escrow', ledger: 'HDFC Bank — Escrow A/c' },
    { role: 'Counter-party', ledger: 'Clearing ledger / Vendor / Customer' },
  ],
  steps: [
    { title: 'ICICI — Reconcile against bank feed', body: 'Tally auto-fetches entries; operator reviews, tags the counter-party ledger, and saves. Used only for petty payments.' },
    { title: 'Central Bank — Download daily statement', body: 'Export Excel from Central Bank portal, import into Tally using the bank statement utility. Classify each entry against clearing ledgers or vendors.' },
    { title: 'HDFC — Import escrow statement', body: 'HDFC escrow receives marketplace payouts. After import, post Settlement Journals knocking off Amazon / Shopify / Shiprocket clearing ledgers.' },
    { title: 'Run BRS monthly', body: 'Use Tally BRS to match booked vs bank. Resolve uncleared cheques and timing differences before closing the period.' },
    { title: 'Contra for transfers', body: 'Any inter-account sweep (HDFC → Central, Central → ICICI) is booked as Contra.' },
  ],
  examples: [
    {
      title: 'Central Bank — Blinkit payment received',
      scenario: 'Blinkit clears an invoice of ₹23,600.',
      voucherType: 'Receipt',
      journal: [
        { side: 'Dr', ledger: 'Central Bank of India — Current A/c', amount: '₹23,600.00' },
        { side: 'Cr', ledger: 'Blinkit Receivable', amount: '₹23,600.00' },
      ],
    },
    {
      title: 'HDFC — Amazon settlement (weekly)',
      scenario: 'Amazon STR for the week: gross ₹100,000; commission ₹12,000 + GST ₹2,160; TCS ₹500; net ₹85,340.',
      voucherType: 'Journal (Settlement)',
      journal: [
        { side: 'Dr', ledger: 'HDFC Bank — Escrow A/c', amount: '₹85,340.00' },
        { side: 'Dr', ledger: 'Amazon Commission', amount: '₹12,000.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹1,080.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹1,080.00' },
        { side: 'Dr', ledger: 'TCS Receivable — Amazon', amount: '₹500.00' },
        { side: 'Cr', ledger: 'Amazon Unsettled Receivable', amount: '₹100,000.00' },
      ],
      note: 'A sweep from HDFC to Central Bank is booked later as a separate Contra.',
    },
    {
      title: 'ICICI — Petty purchase (stationery)',
      scenario: 'Stationery bill ₹590 paid via UPI from ICICI.',
      voucherType: 'Payment',
      journal: [
        { side: 'Dr', ledger: 'Office Supplies', amount: '₹500.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹45.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹45.00' },
        { side: 'Cr', ledger: 'ICICI Bank — Current A/c', amount: '₹590.00' },
      ],
    },
  ],
  clearing:
    'Bank ledgers only receive/pay via their counter-parties — usually a clearing ledger (for marketplaces) or a vendor/customer ledger. If a bank entry has no matching business event (e.g. unknown receipt), park it in a Suspense ledger and resolve in the weekly reconciliation review.',
  gotchas: [
    'Never post sales directly into a bank — always via a clearing ledger.',
    'For Central & HDFC, manual imports must be done before month-end close, else GSTR filings will lag.',
    'Tally BRS for ICICI still needs a human review — the feed occasionally labels counter-parties wrong.',
  ],
};

export function BankingSop() {
  return <SopLayout spec={spec} />;
}
