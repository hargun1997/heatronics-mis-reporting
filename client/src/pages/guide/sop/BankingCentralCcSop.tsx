import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Banking — Central Bank CC',
  description:
    'Central Bank of India Cash Credit (CC) is the primary operating account — most vendor payments, salary, GST and TDS payouts flow through here. Booked in Tally via manual Excel statement import.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Receipt', billSeries: 'customer receipts, sweeps in' },
    { name: 'Payment', billSeries: 'vendor payments, salary, statutory' },
    { name: 'Contra', billSeries: 'sweep to / from HDFC, ICICI' },
  ],
  ledgerMapping: [
    { role: 'Bank ledger', ledger: 'Central Bank of India — Current A/c' },
    { role: 'Vendor payments', ledger: '[Vendor name] (Sundry Creditor)' },
    { role: 'Statutory payments', ledger: 'GST Payable / TDS Payable / EPF / ESI' },
    { role: 'Counter-bank for sweeps', ledger: 'HDFC Escrow / ICICI Current' },
  ],
  steps: [
    {
      title: 'Download Central Bank statement',
      body: 'Export the daily Excel from the Central Bank portal (or upload the camera-screenshot via the import workflow if the portal is down).',
    },
    {
      title: 'Import into Tally',
      body: 'Use Tally’s bank statement utility to import. Ensure column mapping matches (date, narration, debit, credit).',
    },
    {
      title: 'Tag each entry',
      body: 'For credits — customer receipts, sweeps from HDFC/ICICI, refunds. For debits — vendor payments (against a Bill Ref), salary, GST/TDS, utilities.',
    },
    {
      title: 'Statutory payouts',
      body: 'Booking GST, TDS and EPF payments here. Always reference the period (e.g. GST-Apr2026, TDS-Q1-FY27) in the narration.',
    },
    {
      title: 'Run BRS monthly',
      body: 'Use Tally BRS to match booked vs Central Bank statement. Resolve uncleared cheques and timing differences before closing the period.',
    },
  ],
  examples: [
    {
      title: 'Vendor payment — Raw Material',
      scenario: 'Pay ₹2,36,000 to a raw-material vendor (Sundry Creditor) against bill RM-2026-0012.',
      voucherType: 'Payment',
      journal: [
        { side: 'Dr', ledger: 'Acme Steel Pvt Ltd (Sundry Creditor)', amount: '₹2,36,000.00' },
        { side: 'Cr', ledger: 'Central Bank of India — Current A/c', amount: '₹2,36,000.00' },
      ],
      note: 'Bill reference = RM-2026-0012 to knock-off the open invoice.',
    },
    {
      title: 'GST payment',
      scenario: 'Net GST payable for April-2026: ₹1,20,000.',
      voucherType: 'Payment',
      journal: [
        { side: 'Dr', ledger: 'GST Payable', amount: '₹1,20,000.00' },
        { side: 'Cr', ledger: 'Central Bank of India — Current A/c', amount: '₹1,20,000.00' },
      ],
    },
    {
      title: 'Customer receipt — direct B2B',
      scenario: 'B2B distributor wires ₹47,200 against invoice B2B-2026-04-0007.',
      voucherType: 'Receipt',
      journal: [
        { side: 'Dr', ledger: 'Central Bank of India — Current A/c', amount: '₹47,200.00' },
        { side: 'Cr', ledger: 'Distributor Co (Sundry Debtor)', amount: '₹47,200.00' },
      ],
    },
  ],
  clearing:
    'Central is the catch-all operating bank. Marketplace payouts must NOT come here directly — they always route via HDFC Escrow first, then sweep across as a Contra. Direct-B2B receipts and Easebuzz wires are the only marketplace flows that land here directly.',
  gotchas: [
    'Manual import must be done daily — letting it pile up makes BRS at month-end painful.',
    'Always tag the correct Bill Ref on vendor payments so creditor outstanding stays clean.',
    'CC interest debits (monthly) are an expense — book to Bank Charges / Finance Costs, not as a sweep.',
  ],
};

export function BankingCentralCcSop() {
  return <SopLayout spec={spec} />;
}
