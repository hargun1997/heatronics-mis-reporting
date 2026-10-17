import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c8 (TDS and TCS) + §c17 (quarterly) + §c23.
const spec: SopSpec = {
  title: 'TDS & TCS',
  description:
    'TDS we deduct on service / job-work bills (194C, split in Tranzact at 2%), TDS Amazon deducts on our sales (194-O), the TDS we deduct on Amazon ads (recoverable from Amazon), and the GST TCS Amazon collects (sec 52). Deposited by the 7th; 26Q filed quarterly.',
  accent: 'violet',
  operateIn: 'Both',
  voucherTypes: [
    { name: 'Journal (TDS split)', billSeries: 'Tranzact, 194C 2%' },
    { name: 'Amazon TDS-TCS', billSeries: 'from the settlement import' },
    { name: '26Q', billSeries: '31 Jul / Oct / Jan / May' },
  ],
  ledgerMapping: [
    { role: 'We deduct (job work)', ledger: 'TDS Payable - 194C (Contractors)' },
    { role: 'Professional / rent / commission', ledger: 'TDS Payable - 194J / 194I / 194H' },
    { role: 'Amazon deducts on sales (194-O)', ledger: 'TDS (Amazon)' },
    { role: 'Ads TDS recoverable', ledger: 'TDS Receivable - 194C (Ads)' },
    { role: 'Amazon GST TCS (sec 52)', ledger: 'TCS-IGST/CGST/SGST (Amazon)' },
  ],
  steps: [
    { title: 'Deduct on service bills (194C)', body: 'Split TDS in Tranzact at 2% on the pre-GST value; the journal books Dr supplier, Cr TDS Payable - 194C. Other sections (194J professional, 194I rent, 194H commission) are manual — use the right section.' },
    { title: 'Amazon ads TDS', body: 'The ads invoice carries Dr TDS (Amazon) recoverable and Cr TDS Payable - 194C. Amazon was already paid gross, so this TDS is recoverable — book the ads part to TDS Receivable - 194C (Ads) so it reconciles separately from the 194-O credit.' },
    { title: 'Deposit by the 7th', body: 'Pay all TDS Payable by section for the prior month by the 7th; challans should equal the TDS Payable ledgers (includes TDS on Amazon invoices).' },
    { title: 'File 26Q quarterly', body: 'By 31 Jul / 31 Oct / 31 Jan / 31 May. Late filing means Amazon won’t refund the ads TDS.' },
    { title: 'Reclaim ads TDS from Amazon', body: 'After 26Q is filed and TRACES reflects it, upload Form 16A on Seller Central. Amazon credits the refund in a later settlement → clear TDS Receivable - 194C (Ads). Older than 6 months → raise a Seller Central case.' },
  ],
  examples: [
    {
      title: 'TDS split on a service bill (194C, 2%)',
      scenario: 'Ravi Teleinfomatics — ₹1,01,374.27 bill, ₹1,718.21 TDS.',
      voucherType: 'Journal (TDS split)',
      journal: [
        { side: 'Dr', ledger: 'Ravi Teleinfomatics', amount: '₹1,718.21' },
        { side: 'Cr', ledger: 'TDS Payable - 194C (Contractors)', amount: '₹1,718.21' },
      ],
    },
    {
      title: 'Amazon ads TDS (recoverable)',
      scenario: 'From the ads invoice — the TDS we deduct is also a receivable from Amazon.',
      voucherType: 'Purchase-Expense (ads)',
      journal: [
        { side: 'Dr', ledger: 'TDS (Amazon) / TDS Receivable - 194C (Ads)', amount: '₹9,085.21' },
        { side: 'Cr', ledger: 'TDS Payable - 194C (Contractors)', amount: '₹9,085.21' },
      ],
    },
  ],
  clearing:
    'TDS Payable ledgers clear when the challans are deposited by the 7th. TDS Receivable - 194C (Ads) clears when Amazon credits the refund; TDS (Amazon) 194-O credit is claimed via 26AS.',
  gotchas: [
    'TDS (Amazon) (₹77,802) mixes the 194-O credit and the ads TDS recoverable — split the ads part into TDS Receivable - 194C (Ads) (finding #9).',
    'Tranzact only sets 194C — check every TDS journal for the right section before pushing.',
    'The correct TDS section on Amazon ads vs seller fees (194C / 194H / 194-O interplay) is an open query for the CA.',
    'Tranzact’s TCS Credit / TCS Credit Receivable ledgers do not exist in Tally — the Tally ledgers are TCS Receivable and TCS-*GST (Amazon).',
  ],
  visuals: [
    { key: 'tds.split', label: 'TDS split in Tranzact' },
    { key: 'tds.26q', label: '26Q / Form 16A on Seller Central' },
  ],
};

export function TdsSop() {
  return <SopLayout spec={spec} />;
}
