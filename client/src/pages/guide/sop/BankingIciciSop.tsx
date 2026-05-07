import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Banking — ICICI',
  description:
    'ICICI Bank Current A/c is the petty / live-feed bank in Tally. The Tally bank-feed plugin fetches entries automatically; the operator only reviews, tags counter-parties and saves.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Payment', billSeries: 'petty expenses, UPI' },
    { name: 'Receipt', billSeries: 'petty receipts' },
    { name: 'Contra', billSeries: 'transfers' },
  ],
  ledgerMapping: [
    { role: 'Bank ledger', ledger: 'ICICI Bank — Current A/c' },
    { role: 'Petty expenses', ledger: '[Expense ledger — Office Supplies, Repairs, etc.]' },
    { role: 'Counter-party', ledger: 'Vendor / Customer / Clearing' },
  ],
  steps: [
    {
      title: 'Open Tally — auto-fetch ICICI feed',
      body: 'The Tally bank-feed plugin pulls entries every few minutes. Operator opens the bank statement screen for ICICI.',
    },
    {
      title: 'Review each pending entry',
      body: 'For credits, choose the counter-party (typically a clearing ledger or customer). For debits, choose the expense ledger or vendor.',
    },
    {
      title: 'Save as Receipt or Payment',
      body: 'Tally auto-creates the voucher type based on direction. Confirm narration and save.',
    },
    {
      title: 'GST input on petty purchases',
      body: 'For petty B2B purchases (with GSTIN on the invoice), split the gross into base + Input CGST + Input SGST so the ITC flows to GSTR-3B.',
    },
    {
      title: 'Inter-account transfers',
      body: 'Sweeps from / to ICICI (rare — usually petty top-ups from Central) are booked as Contra, not as Payment / Receipt.',
    },
  ],
  examples: [
    {
      title: 'Petty purchase — stationery via UPI',
      scenario: 'Stationery bill ₹590 paid via UPI from ICICI (intra-state, GST included).',
      voucherType: 'Payment',
      journal: [
        { side: 'Dr', ledger: 'Office Supplies', amount: '₹500.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹45.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹45.00' },
        { side: 'Cr', ledger: 'ICICI Bank — Current A/c', amount: '₹590.00' },
      ],
    },
    {
      title: 'Petty top-up from Central',
      scenario: 'Move ₹50,000 from Central Bank to ICICI to fund petty payments.',
      voucherType: 'Contra',
      journal: [
        { side: 'Dr', ledger: 'ICICI Bank — Current A/c', amount: '₹50,000.00' },
        { side: 'Cr', ledger: 'Central Bank of India — Current A/c', amount: '₹50,000.00' },
      ],
    },
  ],
  clearing:
    'ICICI is operational, not a settlement rail. Counter-parties are always either a clearing ledger, a vendor, an expense or another bank. Anything unidentified parks in a Suspense ledger and is resolved in the weekly review.',
  gotchas: [
    'Tally BRS for ICICI still needs human review — the feed occasionally labels counter-parties wrong.',
    'High-value entries should NOT be routed through ICICI; that bank is for petty only. Use Central for vendor payments.',
  ],
  visuals: [
    { key: 'banking.icici.bank-feed', label: 'ICICI bank-feed screen in Tally with pending entries' },
    { key: 'banking.icici.review-tag', label: 'Tagging the counter-party ledger before save' },
  ],
};

export function BankingIciciSop() {
  return <SopLayout spec={spec} />;
}
