import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Banking — HDFC Escrow',
  description:
    'HDFC Bank Escrow A/c receives marketplace payouts (Amazon, Blinkit, Shiprocket COD). Booked in Tally only via manual Excel import; settlement Journals knock off the marketplace clearing ledgers.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Receipt', billSeries: 'marketplace payout' },
    { name: 'Journal', billSeries: 'settlement breakup' },
    { name: 'Contra', billSeries: 'sweep to Central Bank' },
  ],
  ledgerMapping: [
    { role: 'Bank ledger', ledger: 'HDFC Bank — Escrow A/c' },
    { role: 'Amazon settlement', ledger: 'Amazon Unsettled Receivable' },
    { role: 'Blinkit settlement', ledger: 'Blinkit Receivable' },
    { role: 'Shiprocket COD settlement', ledger: 'Shiprocket COD Remittance' },
  ],
  steps: [
    {
      title: 'Import HDFC escrow statement',
      body: 'Download the daily / weekly Excel from HDFC NetBanking and import into Tally using the bank statement utility.',
    },
    {
      title: 'Match payout to marketplace clearing ledger',
      body: 'For each credit, identify whether it’s an Amazon STR, Blinkit settlement or Shiprocket COD remittance. Use the gross amount on the corresponding clearing ledger.',
    },
    {
      title: 'Post Settlement Journal',
      body: 'Dr HDFC Escrow for the net received. Dr commission / fees / TDS for the deductions. Cr the marketplace clearing ledger for the gross.',
    },
    {
      title: 'Sweep to Central Bank (Contra)',
      body: 'Periodically the escrow balance is swept to Central Bank for operational use. Book this as a Contra: Dr Central Bank, Cr HDFC Escrow.',
    },
    {
      title: 'BRS at month-end',
      body: 'Run Tally BRS for HDFC. Resolve uncleared cheques and timing differences before GSTR filing.',
    },
  ],
  examples: [
    {
      title: 'Amazon weekly STR',
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
      title: 'HDFC → Central sweep',
      scenario: 'Sweep ₹2,00,000 from HDFC Escrow to Central Bank to fund vendor payments.',
      voucherType: 'Contra',
      journal: [
        { side: 'Dr', ledger: 'Central Bank of India — Current A/c', amount: '₹2,00,000.00' },
        { side: 'Cr', ledger: 'HDFC Bank — Escrow A/c', amount: '₹2,00,000.00' },
      ],
    },
  ],
  clearing:
    'HDFC Escrow only ever pays/receives via marketplace clearing ledgers (Amazon Unsettled, Blinkit Receivable, Shiprocket COD Remittance) or via Contra to Central. Direct sales / direct vendor payments must NOT hit HDFC.',
  gotchas: [
    'For HDFC, manual import must be done before month-end close, else GSTR filings will lag.',
    'TCS and Section-194-O TDS deductions must be posted to the right receivables — they’re refundable in the IT return.',
    'Never net the Settlement Journal against the wrong clearing ledger; reconciliation will silently break.',
  ],
  visuals: [
    { key: 'banking.hdfc.statement-import', label: 'HDFC escrow statement import screen in Tally' },
    { key: 'banking.hdfc.settlement-journal', label: 'Posted Amazon Settlement Journal' },
  ],
};

export function BankingHdfcSop() {
  return <SopLayout spec={spec} />;
}
