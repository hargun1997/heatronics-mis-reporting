import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c4 (Tranzact B2B/offline/purchases) +
// §S1 (Chrome plugin) + §c14 D1 (daily push). Tranzact raises these invoices;
// the TranZact Chrome plugin pushes approved documents into Tally.
const spec: SopSpec = {
  title: 'Sales — B2B, OEM & Offline (Tranzact)',
  description:
    'Everything Heatronics invoices itself — OEM, GT (Dealer / Retailer / CNF), MT, Physio, B2C offline, Blinkit and internal transfers — is raised in Tranzact. The TranZact Chrome plugin pushes approved documents into Tally as vouchers. Tranzact decides the sales ledger by document series.',
  accent: 'brand',
  operateIn: 'Tranzact',
  voucherTypes: [
    { name: 'Sales / Credit Note / Debit Note', billSeries: 'by Tranzact document series' },
    { name: 'Journal (TDS split)', billSeries: 'service bills' },
  ],
  ledgerMapping: [
    { role: 'OEM', ledger: 'OEM Sales' },
    { role: 'GT channel', ledger: 'GT - Dealer / Retailer / CNF Sales' },
    { role: 'MT / Physio / B2C offline', ledger: 'MT Sales · Physio Channel Sales · B2C Offline Sales' },
    { role: 'Internal transfer', ledger: 'Internal Transfer Sales' },
    { role: 'Receivable', ledger: 'Party ledger (Sundry Debtor)' },
    { role: 'GST output (UP)', ledger: 'IGST/CGST/SGST Output - 5% (also 12% / 18%)' },
  ],
  steps: [
    {
      title: 'Daily (D1): split TDS on every service bill',
      body: 'Tranzact → Payments → Ledger (Consolidated), filter Document Type = Counter-party, Status = Payable. For each service bill, Actions → split icon → Split Options = TDS → enter TDS % (job work = 2% on the pre-GST value; the field starts at 0, so never save at 0). This creates a journal.',
    },
    {
      title: 'Approve everything pending',
      body: 'Document Approval → Status = Pending → approve each (or Bulk). Journal Entry → approve the TDS journals. Rejected? Fix it in Tranzact and approve again — never type it into Tally by hand.',
    },
    {
      title: 'Open Tally, then the Chrome plugin',
      body: 'Log in to Tally On Cloud and open the company (the plugin only works while Tally is open). Chrome → TranZact – Tally Integration → status must read Connected (Tally 3.0 ticked).',
    },
    {
      title: 'Push all five voucher types, one at a time',
      body: 'Send Voucher Data → Direct Integration, then Sales → Purchase → Credit Note → Debit Note → Journal. With "Check TDL & Duplicate Vouchers" = Yes. For each: Refresh, select all, Send to Tally, Update TZ Status. (PV / RV / SM are not used.)',
    },
    {
      title: 'Check',
      body: 'Back in Tranzact, Pending = 0 and Approved = 0 on both Document Approval and Journal Entry. Monthly, tie the Tranzact Sales / Purchase registers (series-wise) to the Tally ledgers.',
    },
  ],
  examples: [
    {
      title: 'GT Dealer sale',
      scenario: 'A GT Dealer Series invoice — Tranzact picks the sales ledger from the series prefix.',
      voucherType: 'Sales',
      journal: [
        { side: 'Dr', ledger: 'Dealer (party)', amount: 'gross' },
        { side: 'Cr', ledger: 'GT - Dealer Sales', amount: 'taxable' },
        { side: 'Cr', ledger: 'CGST/SGST or IGST Output - 2.5/5%', amount: 'GST' },
      ],
      note: 'The sales ledger is chosen by document series: OEM → OEM Sales, GT → GT - … Sales, MT → MT Sales, Physio → Physio Channel Sales, B2C → B2C Offline Sales, Blinkit → Blinkit Sales, Internal Transfer → Internal Transfer Sales.',
    },
    {
      title: 'Service bill + TDS split (Ravi Teleinfomatics)',
      scenario: 'A job-work / service bill of ₹1,01,374.27 with 2% TDS u/s 194C split in Tranzact.',
      voucherType: 'Purchase + Journal',
      journal: [
        { side: 'Dr', ledger: 'Job Work Charges + GST Input', amount: '₹1,01,374.27' },
        { side: 'Cr', ledger: 'Ravi Teleinfomatics', amount: '₹1,01,374.27' },
        { side: 'Dr', ledger: 'Ravi Teleinfomatics', amount: '₹1,718.21' },
        { side: 'Cr', ledger: 'TDS Payable - 194C (Contractors), 2% on pre-GST value', amount: '₹1,718.21' },
      ],
    },
  ],
  clearing:
    'No channel clearing ledger — the receivable sits on the party ledger (Sundry Debtor) and is knocked off by the bank receipt via Bill Ref. Supplier bills sit on the party ledger and are cleared by payment from the bank statement (never via Tranzact "Mark Paid", which points to a non-existent ledger).',
  gotchas: [
    'Only 194C is set in Tranzact. Professional fees (194J), rent (194I) and goods above the 194Q threshold need a different section — check every TDS journal before you push it.',
    'Every service bill posts to Job Work Charges (software, consultancy included). Re-code non-job-work services in Tally until the rule is split.',
    '"Mark Paid" posts to "Central Bank of India - Operating A/C", which does not exist in Tally — book payments from the bank statement instead.',
    'No series rule exists for Supernode (Amazon 3P), whose debtor is ₹2.93 L — flag to Hargun.',
  ],
  visuals: [
    { key: 'sales.b2b.party-master', label: 'Document Approval counts in Tranzact (your daily checklist)' },
    { key: 'sales.b2b.receipt-bill-ref', label: 'TDS split on the Consolidated ledger' },
  ],
};

export function SalesB2BSop() {
  return <SopLayout spec={spec} />;
}
