import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c4 + §c8 (TDS) + §c23 (Tranzact FAQ).
// In these books "Job Work Charges" is the ledger every service bill lands in,
// with 2% TDS u/s 194C split in Tranzact.
const spec: SopSpec = {
  title: 'Job Work & Service Bills (Tranzact)',
  description:
    'Job-work and service bills are booked in Tranzact (Is Service = true → Job Work Charges) and pushed to Tally. TDS is split in Tranzact at 2% u/s 194C on the pre-GST value, creating a journal that is approved and pushed alongside the purchase.',
  accent: 'rose',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Purchase', billSeries: 'service → Job Work Charges' },
    { name: 'Journal (TDS split)', billSeries: '194C, 2%' },
  ],
  ledgerMapping: [
    { role: 'Expense ledger', ledger: 'Job Work Charges' },
    { role: 'Input GST', ledger: 'IGST/CGST/SGST Input - 18%' },
    { role: 'TDS', ledger: 'TDS Payable - 194C (Contractors)' },
    { role: 'Counter-party', ledger: 'Job worker / contractor (Sundry Creditor)' },
  ],
  steps: [
    { title: 'Book the service bill in Tranzact', body: 'Service bills (Is Service = true) map to Job Work Charges with input GST.' },
    { title: 'Split TDS (D1)', body: 'Payments → Ledger (Consolidated) → split icon → TDS → 2% on the pre-GST value. The field starts at 0 — never save at 0. A journal is created: Dr supplier, Cr TDS Payable - 194C.' },
    { title: 'Approve + push', body: 'Approve the Purchase and the TDS Journal, then push both in the daily D1 run.' },
    { title: 'Deposit TDS', body: 'TDS Payable - 194C is deposited by the 7th of the next month; the 26Q return is filed quarterly (see the TDS & TCS SOP).' },
  ],
  examples: [
    {
      title: 'Job-work / service bill + 2% TDS (Ravi Teleinfomatics)',
      scenario: 'A ₹1,01,374.27 service bill with 2% TDS u/s 194C split in Tranzact (₹1,718.21).',
      voucherType: 'Purchase + Journal',
      journal: [
        { side: 'Dr', ledger: 'Job Work Charges + GST Input', amount: '₹1,01,374.27' },
        { side: 'Cr', ledger: 'Ravi Teleinfomatics', amount: '₹1,01,374.27' },
        { side: 'Dr', ledger: 'Ravi Teleinfomatics', amount: '₹1,718.21' },
        { side: 'Cr', ledger: 'TDS Payable - 194C (Contractors)', amount: '₹1,718.21' },
      ],
    },
  ],
  gotchas: [
    'Tranzact’s purchase rule sends EVERY service bill to Job Work Charges — software and consultancy included. Re-code genuinely non-job-work services in Tally until the rule is split.',
    'Only 194C is configured. Professional fees (194J), rent (194I) need the correct section — check each TDS journal before pushing.',
    'The TDS % field starts at 0; saving at 0 silently books no TDS.',
  ],
  visuals: [
    { key: 'jobwork.material-out', label: 'Consolidated ledger filtered to one supplier' },
    { key: 'jobwork.material-in', label: 'TDS split dialog (Split Options → TDS → %)' },
  ],
};

export function JobWorkSop() {
  return <SopLayout spec={spec} />;
}
