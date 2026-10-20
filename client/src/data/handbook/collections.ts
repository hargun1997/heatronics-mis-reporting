// ----------------------------------------------------------------------------
// Accounts Handbook — information architecture.
//
// The handbook content lives only in handbook.html. This file decides how the
// accountant navigates it, help-center style:
//
//   Home  →  Collection (a card)  →  Article (one focused page)
//
// Each article points at a chapter in handbook.html. Long chapters are split
// (`split: true`) so every sub-task is its own page: the chapter's intro
// becomes an overview article and every h3 block becomes its own article.
// Any chapter not listed here is still published (under "More"), so nothing
// in the handbook can go missing from the app.
// ----------------------------------------------------------------------------

export type CollectionAccent = 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose';

export interface ArticleDef {
  /** Chapter id in handbook.html (e.g. "c6", "s3"). */
  chapter: string;
  /** Override the chapter title. */
  title?: string;
  /** One line under the title on cards and lists. Defaults to the chapter lede. */
  summary?: string;
  /** Split the chapter: intro → overview article, each h3 block → an article. */
  split?: boolean;
  /** Title for the overview article of a split chapter (omit to fold the intro into the first section). */
  overviewTitle?: string;
  /**
   * Per-section overrides for split chapters, keyed by the h3 id or h3 text:
   * a clearer title, the one-line summary, or a different collection to file
   * the section under.
   */
  sections?: Record<string, { title?: string; summary?: string; collection?: string }>;
}

export interface CollectionDef {
  slug: string;
  title: string;
  description: string;
  accent: CollectionAccent;
  /** 24×24 outline icon path(s). */
  icon: string[];
  articles: ArticleDef[];
}

export const COLLECTIONS: CollectionDef[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'Start here: how the whole setup fits together and what runs when.',
    accent: 'brand',
    icon: ['M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'],
    articles: [
      { chapter: 's0', title: 'How the setup works (one diagram)', summary: 'Every system, how its data reaches Tally, and the ledger it lands in.' },
      { chapter: 'c13', title: 'What to do when: the operating calendar', summary: 'Every daily, weekly and monthly task, with the day it is due.' },
      { chapter: 'c1', title: 'Company, GST registrations and systems', summary: 'One company in Tally Prime, five GST registrations, four systems feeding it.' },
      { chapter: 's4', title: 'How a payout clears its order (bill references)', summary: 'The matching rule behind every D2C and Amazon receipt, and how to spot when it fails.' },
    ],
  },
  {
    slug: 'daily-work',
    title: 'Daily work',
    description: 'The two jobs done every day, plus the Monday check.',
    accent: 'emerald',
    icon: ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'],
    articles: [
      {
        chapter: 'c14',
        split: true,
        sections: {
          'Tranzact → Tally': { title: 'D1 · Push Tranzact documents to Tally', summary: 'Split TDS, approve pending documents, then send all five voucher types with the TranZact Chrome plugin.' },
          'Shopify orders, then Easebuzz payouts': { title: 'D2 · Import Shopify orders and Easebuzz payouts', summary: 'Plugin option 3: yesterday’s Shopify orders first, then Easebuzz payouts for the same dates.' },
        },
      },
      { chapter: 'c15', title: 'Weekly · Check the control ledgers', summary: 'A 15-minute Monday review: what each clearing ledger should show and what to chase.' },
    ],
  },
  {
    slug: 'month-end',
    title: 'Month-end work',
    description: 'Imports, invoices, banks and the close — in the order they are done.',
    accent: 'violet',
    icon: ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
    articles: [
      {
        chapter: 'c16',
        split: true,
        sections: {
          'Amazon: four reports': { title: 'M1 · Import Amazon reports (MTR, STR, Settlement)', summary: 'Download the four reports, upload them on the plugin site, import with option 2.' },
          'Shiprocket COD remittances': { title: 'M2 · Import Shiprocket COD remittances', summary: 'COD file → Custom Uploads → option 5, then book freight invoices to ShipRocket Collection.' },
          'Snapmint settlements': { title: 'M3 · Import Snapmint settlements', summary: 'Request the report by email → Custom Uploads → option 5.' },
          'Platform invoices and the Amazon expense JV': { title: 'M4 · Book platform invoices and the Amazon expense JV', summary: 'Every platform GST invoice as Purchase-Expense, then the monthly Amazon JV, then match GSTR-2B.' },
          'Banks, statutory dates, close': { title: 'M5 · Banks, statutory dates and close', summary: 'Import and reconcile the three banks, file on time, check every clearing ledger.' },
        },
      },
      { chapter: 'c28', title: 'Fill the Live MIS (10th)', summary: 'Upload each source’s report on Upload data, check every month chip is green, then read the Live MIS.' },
      { chapter: 'c10', title: 'Month-end close checklist and reconciliations', summary: 'The tie-outs that must hold before the month is closed and the MIS sent.' },
      { chapter: 'c17', title: 'Quarterly tasks and fixing errors', summary: 'Quarterly returns, plus what to do when an import or a ledger goes wrong.' },
    ],
  },
  {
    slug: 'expense-booking',
    title: 'Expense booking',
    description: 'Every vendor bill booked by hand on the 3rd: where to get it, its ledger, voucher, GST and TDS.',
    accent: 'amber',
    icon: ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'],
    articles: [
      {
        chapter: 'c27',
        split: true,
        sections: {
          'c27-overview': { title: 'Expense run on the 3rd: overview', summary: 'Collect every invoice, the Purchase-Expense pattern in the books, and all 12 vendors at a glance with download links.' },
          'c27-shopflo': { title: 'Expense · Shopflo (checkout)', summary: 'Checkout Fee - Shopflo, Cr SHOPFLO TECHNOLOGIES PVT LTD; TDS section for the CA.' },
          'c27-shiprocket': { title: 'Expense · Shiprocket (freight)', summary: 'Invoices, debit notes and credit notes from Bills; TDS 194C, Cr ShipRocket Collection.' },
          'c27-easebuzz': { title: 'Expense · Easebuzz (payment gateway)', summary: 'PG fee invoice → Easebuzz Collection A/c; don’t double-count fees from the daily journals.' },
          'c27-snapmint': { title: 'Expense · Snapmint (BNPL)', summary: 'BNPL Processing Fee + IGST, TDS 194H, Cr Snapmint Collection.' },
          'c27-amazon': { title: 'Expense · Amazon (fees, ads, TDS and TCS)', summary: 'Seller Fee Invoices by type → fee ledgers, per GSTIN; Cr Amazon Expenses (Creditors); TDS/TCS; monthly JV.' },
          'c27-facebook': { title: 'Expense · Facebook (Meta ads)', summary: 'Meta Ads (Direct), Cr Facebook India Online Services; domestic GST; TDS section for the CA.' },
          'c27-google': { title: 'Expense · Google Ads', summary: 'Google Ads (Direct), Cr Google India Pvt Ltd; domestic GST; TDS section for the CA.' },
          'c27-bitespeed': { title: 'Expense · Bitespeed (Actartly)', summary: 'Bitespeed Communication Charges, Cr Actartly Technology Pvt. Ltd. (Bite Speed); TDS 194J.' },
          'c27-digistex': { title: 'Expense · Digistex', summary: 'Media buying agency; Cr Digistex4u; expense ledger likely Media Buying Agency - Google/FB.' },
          'c27-shopify': { title: 'Expense · Shopify (store and apps)', summary: 'Not booked for now — Hargun to decide later.' },
          'c27-claude': { title: 'Expense · Claude (Anthropic)', summary: 'Not booked for now — Hargun to decide later.' },
          'c27-gcloud': { title: 'Expense · Google Cloud', summary: 'No ledger yet; billing entity decides GST. Ledger to create.' },
        },
      },
    ],
  },
  {
    slug: 'sales-channels',
    title: 'Sales channels',
    description: 'How each channel’s sales are booked in Tally and how they clear.',
    accent: 'brand',
    icon: ['M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'],
    articles: [
      { chapter: 'c6', title: 'Amazon: how sales and settlements are booked', summary: 'MTR sales, the Seller A/c → Settlement → Bank chain, fees, ads and the monthly JV.' },
      { chapter: 'c5', title: 'Shopify D2C: prepaid, COD and their collectors', summary: 'One sale, two receivables (prepaid / COD), three collectors (Easebuzz, Snapmint, Shiprocket).' },
      { chapter: 'c25', title: 'Blinkit: quick-commerce invoicing and payment', summary: 'Invoiced from Tranzact (Blinkit series), paid on credit terms into the Central Bank CC.' },
      {
        chapter: 'c4',
        split: true,
        overviewTitle: 'B2B, OEM and offline sales (Tranzact)',
        summary: 'Everything we invoice ourselves: how the Tranzact series decides the sales ledger.',
        sections: {
          'Purchases (goods)': { title: 'Purchases of goods (raw material)', summary: 'Goods bills in Tranzact post to RM Purchases with input GST; match to GSTR-2B.', collection: 'purchases-assets' },
          'Job work and service bills': { title: 'Job work and service bills (2% TDS)', summary: 'Service bills post to Job Work Charges; split TDS in Tranzact before pushing.', collection: 'purchases-assets' },
        },
      },
    ],
  },
  {
    slug: 'banking',
    title: 'Banks & payouts',
    description: 'Which payout lands in which bank, and how statements are imported and reconciled.',
    accent: 'sky',
    icon: ['M3 10h18M5 10V20m4-10v10m6-10v10m4-10v10M3 20h18M12 3l9 5H3l9-5z'],
    articles: [
      {
        chapter: 'c9',
        split: true,
        overviewTitle: 'Banks overview: which payout lands where',
        summary: 'All banks at a glance, and the rule for routing every credit to the right ledger.',
        sections: {
          'Central Bank CC (operating)': { title: 'Central Bank CC — operating account', summary: 'Every channel payout lands here; how to book receipts, payments and CC interest.' },
          'ICICI Bank A/C - CC': { title: 'ICICI CC — payments account', summary: 'Monthly statement import and matching; regroup to Bank OD pending.' },
          'HDFC Bank A/C': { title: 'HDFC — payments account', summary: 'Monthly statement import, supplier payments and BRS.' },
          'Easebuzz Wire A/C': { title: 'Easebuzz Wire — low-use account', summary: 'Not the Easebuzz clearing ledger; what does and doesn’t post here.' },
        },
      },
      { chapter: 's6', title: 'How to import a bank statement in Tally', summary: 'Upload to File Manager, import in Banking, match each line or create the voucher.' },
    ],
  },
  {
    slug: 'purchases-assets',
    title: 'Purchases & assets',
    description: 'Goods and service bills, TDS on job work, capital goods and depreciation.',
    accent: 'emerald',
    icon: ['M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'],
    articles: [{ chapter: 'c26', title: 'Capital goods and depreciation', summary: 'Booking an asset with ITC, and the monthly depreciation journal (booked in Tally).' }],
  },
  {
    slug: 'tax',
    title: 'GST & TDS',
    description: 'GST registrations and monthly cycle; TDS splits, TCS, 26Q and refunds.',
    accent: 'amber',
    icon: ['M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z'],
    articles: [
      { chapter: 'c7', title: 'GST: registrations, ledgers and monthly cycle', summary: 'Five GSTINs, three ledger families, GSTR-1 / 3B / 2B and set-off.' },
      { chapter: 'c8', title: 'TDS and TCS: splits, 26Q and refunds', summary: '194C on job work, Amazon 194-O and TCS, quarterly 26Q, getting ads TDS refunded.' },
    ],
  },
  {
    slug: 'systems-tools',
    title: 'Systems & tools',
    description: 'What each tool does, how it is set up, and where to click.',
    accent: 'rose',
    icon: ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
    articles: [
      { chapter: 's1', title: 'Tranzact and the TranZact Chrome plugin: how they work', summary: 'How Tranzact picks ledgers, why approval matters, and how the plugin pushes to Tally.' },
      { chapter: 's2', title: 'tally-integration.in: the plugin website and its mappings', summary: 'Where API keys, mapping rules and Amazon uploads live — read-only for the accountant.' },
      { chapter: 's3', title: 'eCom2Tally in Tally: menu options 2, 3 and 5', summary: 'What each import option reads, what it creates, and what you enter.' },
      { chapter: 's5', title: 'File Manager: getting files onto Tally On Cloud', summary: 'Which folder each file goes in so option 5 and bank import can read it.' },
      { chapter: 's7', title: 'Entries no plugin makes (manual layer)', summary: 'Platform invoices, the Amazon JV, payroll and adjustments booked by hand.' },
      { chapter: 'c18', title: 'Menus and screens: quick reference', summary: 'Where each tool’s menu is, with screenshots.' },
      { chapter: 'c19', title: 'Plugin settings — reference, do not change', summary: 'The exact mapping rules on tally-integration.in, to compare against.' },
    ],
  },
  {
    slug: 'reference',
    title: 'Reference',
    description: 'Ledgers, voucher types, control accounts, links and terms.',
    accent: 'sky',
    icon: ['M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'],
    articles: [
      { chapter: 'c2', title: 'Chart of accounts: the groups that matter', summary: 'Where each control ledger sits and which ledgers need regrouping.' },
      { chapter: 'c3', title: 'Voucher types and what posts them', summary: 'Every voucher type in use, which system creates it, and its standard entry.' },
      { chapter: 'c21', title: 'Control ledgers: what clears each one', summary: 'Each clearing ledger, what debits it, what credits it, and its expected balance.' },
      { chapter: 'c20', title: 'Links: portals and report downloads', summary: 'Every login and report page used in this handbook.' },
      { chapter: 'c22', title: 'Glossary', summary: 'The terms used in this handbook, in plain words.' },
    ],
  },
  {
    slug: 'faq',
    title: 'FAQ',
    description: 'Short answers to the questions that come up most.',
    accent: 'amber',
    icon: ['M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
    articles: [
      {
        chapter: 'c23',
        split: true,
        sections: {
          Amazon: { title: 'FAQ · Amazon', summary: 'Ads counted twice, the monthly JV, reports, import order, TDS refunds.' },
          'Shopify, Easebuzz, Snapmint, Shiprocket': { title: 'FAQ · Shopify and its collectors', summary: 'Returns, re-fetching Easebuzz, freight, rejected files.' },
          Tranzact: { title: 'FAQ · Tranzact', summary: '“Connecting…”, rejected documents, the TDS split, Mark Paid.' },
          'Tally, banks and access': { title: 'FAQ · Tally, banks and access', summary: 'Tally date, duplicate ledgers, bank import, who may change what.' },
        },
      },
    ],
  },
  {
    slug: 'health-check',
    title: 'Health check & open items',
    description: 'What the books review found, what is pending with the CA, and the evidence.',
    accent: 'rose',
    icon: ['M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'],
    articles: [
      { chapter: 'c11', title: 'Findings and proposed fixes', summary: 'Each problem found in the books, the exact amount, and the adjustment proposed.' },
      { chapter: 'c12', title: 'Open questions for the CA', summary: 'Decisions waiting on the CA or the team.' },
      { chapter: 'c24', title: 'Evidence: figures and source files', summary: 'Exact balances, source exports and companion files behind the findings.' },
    ],
  },
];

/** Task shortcuts shown on the home page ("What are you doing today?"). */
export const QUICK_TASKS: { label: string; code: string; anchor: string }[] = [
  { code: 'D1', label: 'Tranzact → Tally', anchor: 'c14-d1-tranzact' },
  { code: 'D2', label: 'Shopify + Easebuzz', anchor: 'c14-d2-shopify-easebuzz' },
  { code: 'M1', label: 'Amazon reports', anchor: 'c16-m1-amazon' },
  { code: 'M2', label: 'Shiprocket COD', anchor: 'c16-m2-shiprocket' },
  { code: 'M3', label: 'Snapmint', anchor: 'c16-m3-snapmint' },
  { code: 'M4', label: 'Invoices + Amazon JV', anchor: 'c16-m4-platform-invoices' },
  { code: 'M5', label: 'Banks & close', anchor: 'c16-m5-close' },
  { code: 'M6', label: 'Expense invoices', anchor: 'c27-overview' },
  { code: 'M7', label: 'Fill the MIS', anchor: 'c28-overview' },
];
