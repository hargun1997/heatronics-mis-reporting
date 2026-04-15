import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Job Work SOP',
  description:
    'Outsourcing a manufacturing step to a job worker. Material goes out on a delivery challan, comes back after processing, and only the processing fee is booked as an expense. ITC-04 is filed quarterly.',
  accent: 'rose',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Material Out Challan' },
    { name: 'Material In Challan' },
    { name: 'Job Work (JW)', billSeries: 'JW-YYYYMM-####' },
  ],
  ledgerMapping: [
    { role: 'Expense ledger', ledger: 'Job Work Charges (Inward)' },
    { role: 'Input GST', ledger: 'Input CGST + SGST or Input IGST' },
    { role: 'Counter-party', ledger: 'Job Worker (Sundry Creditor)' },
    { role: 'Stock tracking', ledger: 'Tranzact — Material at Job Worker bin' },
  ],
  steps: [
    { title: 'Issue Material Out Challan in Tranzact', body: 'Specify items, quantity, and job worker. Stock moves out of main store into a "Material at Job Worker" virtual bin.' },
    { title: 'Wait for processing', body: 'Track pending job-work quantities from the Tranzact dashboard. Flag anything outstanding >180 days — GST implications kick in.' },
    { title: 'Receive back with Material In Challan', body: 'Reconcile quantity received + scrap/waste. Stock moves back into the main store.' },
    { title: 'Book the Job Work invoice', body: 'Use the JW voucher series. Only the processing fee is booked — never the value of raw material (that stayed on our books throughout).' },
    { title: 'File ITC-04 quarterly', body: 'Consolidate Material Out / Material In for the quarter and file ITC-04.' },
  ],
  examples: [
    {
      title: 'Job worker invoice · ₹11,800 @ 18% GST',
      scenario: 'External processor invoices processing charges for a batch of units.',
      voucherType: 'Job Work (JW)',
      journal: [
        { side: 'Dr', ledger: 'Job Work Charges (Inward)', amount: '₹10,000.00' },
        { side: 'Dr', ledger: 'Input CGST', amount: '₹900.00' },
        { side: 'Dr', ledger: 'Input SGST', amount: '₹900.00' },
        { side: 'Cr', ledger: 'XYZ Processors (Sundry Creditor)', amount: '₹11,800.00' },
      ],
      note: 'Raw material does not move into the job work invoice — it remains as inventory and only transitions between virtual bins in Tranzact.',
    },
  ],
  gotchas: [
    'If material is not received back within 180 days (1 year for capital goods), it is deemed a supply — GST becomes payable.',
    'Scrap generated at the job worker must either come back or be sold by the job worker on behalf of Heatronics with invoice.',
    'Never book the raw material cost inside the job work invoice — it double-counts inventory.',
  ],
};

export function JobWorkSop() {
  return <SopLayout spec={spec} />;
}
