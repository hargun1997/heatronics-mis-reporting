// Top-level topic boxes on the Accounts Handbook home — the quick way in,
// grouped by what the reader is trying to do (same groups the old SOP index
// used). Each box deep-links to a handbook chapter or section by its id in
// handbook.html, so the boxes never carry content of their own.

export type TopicAccent = 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose';

export interface Topic {
  anchor: string; // chapter or section id in handbook.html
  title: string;
  description: string;
}

export interface TopicGroup {
  heading: string;
  accent: TopicAccent;
  icon: string[]; // svg path(s), 24×24 outline
  topics: Topic[];
}

export const TOPIC_GROUPS: TopicGroup[] = [
  {
    heading: 'Start here',
    accent: 'brand',
    icon: ['M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'],
    topics: [
      { anchor: 's0', title: 'How everything is wired', description: 'One diagram: sources → bridges → Tally vouchers → control ledgers → bank.' },
      { anchor: 'c13', title: 'Operating calendar', description: 'What happens daily, weekly and monthly, and by which day.' },
      { anchor: 'c23', title: 'FAQ', description: 'Quick answers: ₹34.6 L ads, duplicate ledgers, re-fetching, rejected files.' },
    ],
  },
  {
    heading: 'Sales channels',
    accent: 'brand',
    icon: ['M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'],
    topics: [
      { anchor: 'c6', title: 'Amazon', description: 'MTR invoices, Seller A/c → Settlement → Bank chain, and the monthly expense JV.' },
      { anchor: 'c5', title: 'Shopify (D2C)', description: 'Daily plugin pull; prepaid vs COD receivable cleared by bill reference.' },
      { anchor: 'c25', title: 'Blinkit', description: 'Quick-commerce B2B via the Blinkit Sales Series in Tranzact.' },
      { anchor: 'c4', title: 'B2B, OEM & Offline', description: 'Everything invoiced in Tranzact; ledger by document series.' },
    ],
  },
  {
    heading: 'Collections & settlements',
    accent: 'sky',
    icon: ['M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z'],
    topics: [
      { anchor: 'c14-d2-shopify-easebuzz', title: 'Easebuzz payouts', description: 'Daily option 3 — clears Shopify Prepaid Receivable by bank_transaction_id.' },
      { anchor: 'c16-m3-snapmint', title: 'Snapmint settlements', description: 'Monthly option 5 — EMI/BNPL prepaid; report by email.' },
      { anchor: 'c16-m2-shiprocket', title: 'Shiprocket COD', description: 'Monthly option 5 — COD remittance + freight invoices = Total Deductions.' },
      { anchor: 's4', title: 'Bill-wise matching', description: 'How a payout finds and clears exactly its order.' },
    ],
  },
  {
    heading: 'Purchases & expenses',
    accent: 'emerald',
    icon: ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'],
    topics: [
      { anchor: 'c4-purchases', title: 'Purchases (Tranzact)', description: 'RM Purchases / Job Work Charges, input GST, GSTR-2B match.' },
      { anchor: 'c16-m4-platform-invoices', title: 'Platform invoices', description: 'Fee & ad invoices as Purchase-Expense against each platform’s control ledger.' },
      { anchor: 'c4-job-work', title: 'Job work & service bills', description: 'Service bills → Job Work Charges with the 2% TDS split.' },
      { anchor: 'c26', title: 'Capital goods', description: 'Capitalisation, ITC and monthly depreciation in Tally.' },
    ],
  },
  {
    heading: 'Banking',
    accent: 'sky',
    icon: ['M3 10h18M5 10V20m4-10v10m6-10v10m4-10v10M3 20h18M12 3l9 5H3l9-5z'],
    topics: [
      { anchor: 'c9', title: 'Banks — overview', description: 'Month-end import + reconcile; how credits route to collection ledgers.' },
      { anchor: 'c9-central-cc', title: 'Central Bank CC', description: 'The operating OD account — every channel payout lands here.' },
      { anchor: 'c9-icici', title: 'ICICI (CC)', description: 'Payments account; regroup to Bank OD pending.' },
      { anchor: 'c9-hdfc', title: 'HDFC', description: 'Payments account; monthly import + BRS.' },
      { anchor: 'c9-easebuzz-wire', title: 'Easebuzz Wire', description: 'Low-use wire account — not the clearing ledger.' },
    ],
  },
  {
    heading: 'Tax — GST & TDS',
    accent: 'amber',
    icon: ['M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z'],
    topics: [
      { anchor: 'c7', title: 'GST (GSTR-1 / 3B / 2B)', description: 'Five registrations, output families, monthly cycle and set-off.' },
      { anchor: 'c8', title: 'TDS & TCS', description: '194C split, Amazon 194-O / TCS, 26Q, ads-TDS refund.' },
    ],
  },
  {
    heading: 'Tasks & close',
    accent: 'violet',
    icon: ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
    topics: [
      { anchor: 'c14', title: 'Daily tasks', description: 'D1 Tranzact → Tally push; D2 Shopify orders then Easebuzz payouts.' },
      { anchor: 'c16', title: 'Monthly tasks', description: 'M1 Amazon · M2 Shiprocket · M3 Snapmint · M4 invoices · M5 banks & close.' },
      { anchor: 'c10', title: 'Month-end close', description: 'Control-ledger tie-outs, bank BRS, statutory dates, send the MIS.' },
      { anchor: 'c17', title: 'Quarterly & fixes', description: 'Quarterly returns and what to do when things break.' },
    ],
  },
  {
    heading: 'Tools, findings & reference',
    accent: 'rose',
    icon: ['M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'],
    topics: [
      { anchor: 's3', title: 'eCom2Tally plugin', description: 'Menu options 2 / 3 / 5: what each reads, creates and needs.' },
      { anchor: 'c19', title: 'Plugin settings', description: 'Exact mapping rules on tally-integration.in (reference, do not change).' },
      { anchor: 'c2', title: 'Chart of accounts', description: 'The ledger groups and control ledgers that matter.' },
      { anchor: 'c11', title: 'Findings & adjustments', description: 'Health-check results with exact amounts and proposed fixes.' },
      { anchor: 'c12', title: 'Queries for the CA', description: 'Open questions waiting on the CA or the team.' },
      { anchor: 'c20', title: 'Links', description: 'Every portal and report download link in one place.' },
    ],
  },
];
