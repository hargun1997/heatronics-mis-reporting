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
    description: 'Start here. See how the systems connect and when each job runs.',
    accent: 'brand',
    icon: ['M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'],
    articles: [
      { chapter: 's0', title: 'How the setup works (one diagram)', summary: 'Each system, how its data goes to Tally, and the ledger it posts to.' },
      { chapter: 'c13', title: 'What to do when: the operating calendar', summary: 'All daily, weekly and monthly tasks, with the due day of each.' },
      { chapter: 'c1', title: 'Company, GST registrations and systems', summary: '1 company in Tally Prime, 5 GST registrations, 4 systems that send data to it.' },
      { chapter: 's4', title: 'How a payout clears its order (bill references)', summary: 'The rule that matches each D2C and Amazon receipt to its order. How to find a failed match.' },
    ],
  },
  {
    slug: 'daily-work',
    title: 'Daily work',
    description: 'The 2 jobs for each day, and the check for each Monday.',
    accent: 'emerald',
    icon: ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'],
    articles: [
      {
        chapter: 'c14',
        split: true,
        sections: {
          'Tranzact → Tally': { title: 'D1 · Push Tranzact documents to Tally', summary: 'Split the TDS. Approve the pending documents. Send the 5 voucher types with the TranZact Chrome plugin.' },
          'Shopify orders, then Easebuzz payouts': { title: 'D2 · Import Shopify orders and Easebuzz payouts', summary: 'Use plugin option 3. Import the Shopify orders of yesterday first. Then import the Easebuzz payouts for the same dates.' },
        },
      },
      { chapter: 'c15', title: 'Weekly · Check the control ledgers', summary: 'A 15 min check on Monday. See the correct balance of each clearing ledger and what to follow up.' },
    ],
  },
  {
    slug: 'month-end',
    title: 'Month-end work',
    description: 'Imports, invoices, banks and the close, in the order you do them.',
    accent: 'violet',
    icon: ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
    articles: [
      {
        chapter: 'c16',
        split: true,
        sections: {
          'Amazon: four reports': { title: 'M1 · Import Amazon reports (MTR, STR, Settlement)', summary: 'Download the 4 reports. Upload them on the plugin site. Import them with option 2.' },
          'Shiprocket COD remittances': { title: 'M2 · Import Shiprocket COD remittances', summary: 'Upload the COD file in Custom Uploads and import with option 5. Then book the freight invoices to ShipRocket Collection.' },
          'Snapmint settlements': { title: 'M3 · Import Snapmint settlements', summary: 'Ask for the report by email. Upload it in Custom Uploads. Import it with option 5.' },
          'Platform invoices and the Amazon expense JV': { title: 'M4 · Book platform invoices and the Amazon expense JV', summary: 'Book each platform GST invoice as Purchase-Expense. Book the monthly Amazon JV. Then match to GSTR-2B.' },
          'Banks, statutory dates, close': { title: 'M5 · Banks, statutory dates and close', summary: 'Import and reconcile the 3 banks. File the returns on time. Check each clearing ledger.' },
        },
      },
      { chapter: 'c28', title: 'Keep the Live MIS clean: Fix list and uploads', summary: 'The MIS fills itself. Clear the Fix list, upload the reports that have no API, then lock the month.' },
      { chapter: 'c10', title: 'Month-end close checklist and reconciliations', summary: 'The checks that must agree before you close the month and send the MIS.' },
      { chapter: 'c17', title: 'Quarterly tasks and fixing errors', summary: 'Quarterly returns. What to do when an import or a ledger is wrong.' },
    ],
  },
  {
    slug: 'expense-booking',
    title: 'Expense booking',
    description: 'Vendor bills you book by hand on the 3rd. Where to get each bill, and its ledger, voucher, GST and TDS.',
    accent: 'amber',
    icon: ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'],
    articles: [
      {
        chapter: 'c27',
        split: true,
        sections: {
          'c27-overview': { title: 'Expense run on the 3rd: overview', summary: 'Get all invoices. See the Purchase-Expense entry and the 14 vendors with their download links.' },
          'c27-shopflo': { title: 'Expense · Shopflo (checkout)', summary: 'Dr Checkout Fee - Shopflo, Cr SHOPFLO TECHNOLOGIES PVT LTD. The CA sets the TDS section.' },
          'c27-shiprocket': { title: 'Expense · Shiprocket (freight)', summary: 'Invoices, debit notes and credit notes from Bills. TDS 194C. Cr ShipRocket Collection.' },
          'c27-easebuzz': { title: 'Expense · Easebuzz (payment gateway)', summary: 'Book the PG fee invoice to Easebuzz Collection A/c. Do not count the fees from the daily journals 2 times.' },
          'c27-snapmint': { title: 'Expense · Snapmint (BNPL)', summary: 'Dr BNPL Processing Fee + IGST. TDS 194H. Cr Snapmint Collection.' },
          'c27-amazon': { title: 'Expense · Amazon (fees, ads, TDS and TCS)', summary: 'Book Seller Fee Invoices by type to the fee ledgers, for each GSTIN. Cr Amazon Expenses (Creditors). TDS, TCS and the monthly JV.' },
          'c27-blinkit': { title: 'Expense · Blinkit (marketplace fees)', summary: 'Book the Commission, Storage and Shipping Fee invoices of each state to Blinkit Channel Fees. Cr Blink Commerce Private Limited (state).' },
          'c27-flipkart': { title: 'Expense · Flipkart (marketplace fees)', summary: 'Get the Commission Invoice from the Report centre. Book it to Flipkart Channel Fees. Cr Flipkart Seller Account.' },
          'c27-facebook': { title: 'Expense · Facebook (Meta ads)', summary: 'Dr Meta Ads (Direct), Cr Facebook India Online Services. Domestic GST. The CA sets the TDS section.' },
          'c27-google': { title: 'Expense · Google Ads', summary: 'Dr Google Ads (Direct), Cr Google India Pvt Ltd. Domestic GST. The CA sets the TDS section.' },
          'c27-bitespeed': { title: 'Expense · Bitespeed (Actartly)', summary: 'Dr Bitespeed Communication Charges, Cr Actartly Technology Pvt. Ltd. (Bite Speed). TDS 194J.' },
          'c27-digistex': { title: 'Expense · Digistex', summary: 'Media buying agency. Dr Media Buying Agency - Google/FB + GST, Cr Digistex4u. Deduct TDS.' },
          'c27-shopify': { title: 'Expense · Shopify (store and apps)', summary: 'Do not book for now. Hargun decides later.' },
          'c27-claude': { title: 'Expense · Claude (Anthropic)', summary: 'Do not book for now. Hargun decides later.' },
          'c27-gcloud': { title: 'Expense · Google Cloud', summary: 'No ledger yet. The billing entity sets the GST. Create the ledger.' },
        },
      },
    ],
  },
  {
    slug: 'sales-channels',
    title: 'Sales channels',
    description: 'How you book the sales of each channel in Tally, and how they clear.',
    accent: 'brand',
    icon: ['M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'],
    articles: [
      { chapter: 'c6', title: 'Amazon: how sales and settlements are booked', summary: 'MTR sales, the chain Seller A/c to Settlement to Bank, fees, ads and the monthly JV.' },
      { chapter: 'c5', title: 'Shopify D2C: prepaid, COD and their collectors', summary: '1 sale, 2 receivables (prepaid, COD), 3 collectors (Easebuzz, Snapmint, Shiprocket).' },
      { chapter: 'c25', title: 'Blinkit: quick-commerce invoicing and payment', summary: 'Invoice from Tranzact (Blinkit series). Blinkit pays on credit terms into the Central Bank CC.' },
      {
        chapter: 'c4',
        split: true,
        overviewTitle: 'B2B, OEM and offline sales (Tranzact)',
        summary: 'Sales we invoice ourselves. The Tranzact series sets the sales ledger.',
        sections: {
          'Purchases (goods)': { title: 'Purchases of goods (raw material)', summary: 'Goods bills in Tranzact post to RM Purchases with input GST. Match them to GSTR-2B.', collection: 'purchases-assets' },
          'Job work and service bills': { title: 'Job work and service bills (2% TDS)', summary: 'Service bills post to Job Work Charges. Split the TDS in Tranzact before you push.', collection: 'purchases-assets' },
        },
      },
    ],
  },
  {
    slug: 'banking',
    title: 'Banks & payouts',
    description: 'The bank for each payout. How to import and reconcile the statements.',
    accent: 'sky',
    icon: ['M3 10h18M5 10V20m4-10v10m6-10v10m4-10v10M3 20h18M12 3l9 5H3l9-5z'],
    articles: [
      {
        chapter: 'c9',
        split: true,
        overviewTitle: 'Banks overview: which payout lands where',
        summary: 'All banks on 1 page. The rule that sends each credit to the correct ledger.',
        sections: {
          'Central Bank CC (operating)': { title: 'Central Bank CC: operating account', summary: 'All channel payouts come here. How to book receipts, payments and CC interest.' },
          'ICICI Bank A/C - CC': { title: 'ICICI CC: payments account', summary: 'Import and match the monthly statement. The regroup to Bank OD is not done yet.' },
          'HDFC Bank A/C': { title: 'HDFC: payments account', summary: 'Import the monthly statement. Supplier payments and BRS.' },
          'Easebuzz Wire A/C': { title: 'Easebuzz Wire: low-use account', summary: 'This is not the Easebuzz clearing ledger. What posts here, and what does not.' },
        },
      },
      { chapter: 's6', title: 'How to import a bank statement in Tally', summary: 'Upload the file to File Manager. Import it in Banking. Match each line or create the voucher.' },
    ],
  },
  {
    slug: 'purchases-assets',
    title: 'Purchases & assets',
    description: 'Goods and service bills, TDS on job work, capital goods and depreciation.',
    accent: 'emerald',
    icon: ['M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'],
    articles: [{ chapter: 'c26', title: 'Capital goods and depreciation', summary: 'Book an asset with ITC. Book the monthly depreciation journal in Tally.' }],
  },
  {
    slug: 'tax',
    title: 'GST & TDS',
    description: 'GST registrations and the monthly cycle. TDS splits, TCS, 26Q and refunds.',
    accent: 'amber',
    icon: ['M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z'],
    articles: [
      { chapter: 'c7', title: 'GST: registrations, ledgers and monthly cycle', summary: '5 GSTINs, 3 ledger groups, GSTR-1, 3B, 2B and set-off.' },
      { chapter: 'c8', title: 'TDS and TCS: splits, 26Q and refunds', summary: '194C on job work, Amazon 194-O and TCS, the quarterly 26Q, and the refund of TDS on ads.' },
    ],
  },
  {
    slug: 'systems-tools',
    title: 'Systems & tools',
    description: 'What each tool does, its setup, and where to click.',
    accent: 'rose',
    icon: ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
    articles: [
      { chapter: 's1', title: 'Tranzact and the TranZact Chrome plugin: how they work', summary: 'How Tranzact selects ledgers, why you must approve, and how the plugin sends data to Tally.' },
      { chapter: 's2', title: 'tally-integration.in: the plugin website and its mappings', summary: 'Where the API keys, mapping rules and Amazon uploads are. The accountant can only read them.' },
      { chapter: 's3', title: 'eCom2Tally in Tally: menu options 2, 3 and 5', summary: 'What each import option reads, what it makes, and what you type.' },
      { chapter: 's5', title: 'File Manager: getting files onto Tally On Cloud', summary: 'The folder for each file, so option 5 and the bank import can read it.' },
      { chapter: 's7', title: 'Entries no plugin makes (manual layer)', summary: 'Platform invoices, the Amazon JV, payroll and adjustments that you book by hand.' },
      { chapter: 'c18', title: 'Menus and screens: quick reference', summary: 'Where the menu of each tool is, with screenshots.' },
      { chapter: 'c19', title: 'Plugin settings: reference only, do not change', summary: 'The mapping rules on tally-integration.in. Use them to compare.' },
    ],
  },
  {
    slug: 'reference',
    title: 'Reference',
    description: 'Ledgers, voucher types, control accounts, links and terms.',
    accent: 'sky',
    icon: ['M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'],
    articles: [
      { chapter: 'c2', title: 'Chart of accounts: every group, sub-group and hanging ledger', summary: 'The group of each ledger, all sub-groups, and where to move hanging ledgers (live in Tally health).' },
      { chapter: 'c3', title: 'Voucher types and what posts them', summary: 'Each voucher type we use, the system that makes it, and its standard entry.' },
      { chapter: 'c21', title: 'Control ledgers: what clears each one', summary: 'Each clearing ledger: what debits it, what credits it, and its correct balance.' },
      { chapter: 'c20', title: 'Links: portals and report downloads', summary: 'All logins and report pages in this handbook.' },
      { chapter: 'c22', title: 'Glossary', summary: 'The terms in this handbook, in plain words.' },
    ],
  },
  {
    slug: 'faq',
    title: 'FAQ',
    description: 'Short answers to the most frequent questions.',
    accent: 'amber',
    icon: ['M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
    articles: [
      {
        chapter: 'c23',
        split: true,
        sections: {
          Amazon: { title: 'FAQ · Amazon', summary: 'Ads counted 2 times, the monthly JV, reports, import order, TDS refunds.' },
          'Shopify, Easebuzz, Snapmint, Shiprocket': { title: 'FAQ · Shopify and its collectors', summary: 'Returns, getting Easebuzz again, freight, rejected files.' },
          Tranzact: { title: 'FAQ · Tranzact', summary: 'The “Connecting…” message, rejected documents, the TDS split, Mark Paid.' },
          'Tally, banks and access': { title: 'FAQ · Tally, banks and access', summary: 'Tally date, duplicate ledgers, bank import, who can change what.' },
        },
      },
    ],
  },
  {
    slug: 'health-check',
    title: 'Health check & open items',
    description: 'What the books review found, what waits for the CA, and the evidence.',
    accent: 'rose',
    icon: ['M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'],
    articles: [
      { chapter: 'c11', title: 'Findings and proposed fixes', summary: 'Each problem in the books, its amount, and the adjustment we propose.' },
      { chapter: 'c12', title: 'Open questions for the CA', summary: 'Decisions that wait for the CA or the team.' },
      { chapter: 'c24', title: 'Evidence: figures and source files', summary: 'The balances, source exports and other files behind the findings.' },
    ],
  },
];

/** Task shortcuts on the handbook home ("Regular jobs"). */
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
