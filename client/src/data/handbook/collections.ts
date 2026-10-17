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
  /** Per-section summaries for split chapters, keyed by the h3 id or h3 text. */
  sectionSummaries?: Record<string, string>;
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
    description: 'How the whole setup fits together, what runs when, and quick answers.',
    accent: 'brand',
    icon: ['M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7'],
    articles: [
      { chapter: 's0', title: 'How everything is wired', summary: 'One picture: where data starts, how it reaches Tally, and which ledger it lands in.' },
      { chapter: 'c13', title: 'Operating calendar', summary: 'What happens daily, weekly and monthly, and by which day.' },
      { chapter: 'c1', title: 'Entity, registrations and systems' },
      { chapter: 's4', title: 'Bill-wise matching: how a payout clears its order' },
    ],
  },
  {
    slug: 'daily-work',
    title: 'Daily work',
    description: 'The two things that move every day: Tranzact documents and Shopify/Easebuzz.',
    accent: 'emerald',
    icon: ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'],
    articles: [
      {
        chapter: 'c14',
        split: true,
        sectionSummaries: {
          'Tranzact → Tally': 'D1 · Approve documents and push all five voucher types with the TranZact Chrome plugin.',
          'Shopify orders, then Easebuzz payouts': 'D2 · Pull yesterday’s Shopify orders, then Easebuzz payouts, with plugin option 3.',
        },
      },
      { chapter: 'c15', title: 'Weekly checks', summary: 'A short Monday review of the control ledgers (recommended).' },
    ],
  },
  {
    slug: 'month-end',
    title: 'Month-end work',
    description: 'Amazon, Shiprocket, Snapmint, platform invoices, banks and the close — step by step.',
    accent: 'violet',
    icon: ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
    articles: [
      {
        chapter: 'c16',
        split: true,
        sectionSummaries: {
          'Amazon: four reports': 'M1 · Download MTR-B2C, MTR-B2B, STR and Settlement; upload; import with option 2.',
          'Shiprocket COD remittances': 'M2 · COD remittance file → Custom Uploads → option 5; book freight invoices.',
          'Snapmint settlements': 'M3 · Request the settlement report by email → Custom Uploads → option 5.',
          'Platform invoices and the Amazon expense JV': 'M4 · Book every platform GST invoice and pass the monthly Amazon JV.',
          'Banks, statutory dates, close': 'M5 · Import bank statements, reconcile, statutory dates, close.',
        },
      },
      { chapter: 'c10', title: 'Month-end close and reconciliations' },
      { chapter: 'c17', title: 'Quarterly tasks and fixes' },
    ],
  },
  {
    slug: 'sales-channels',
    title: 'Sales channels',
    description: 'How each channel’s sales reach Tally, the journals they post and how they clear.',
    accent: 'brand',
    icon: ['M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'],
    articles: [
      { chapter: 'c6', title: 'Amazon' },
      { chapter: 'c5', title: 'Shopify D2C (Easebuzz, Snapmint, Shiprocket)' },
      { chapter: 'c25', title: 'Blinkit (quick commerce)' },
      {
        chapter: 'c4',
        split: true,
        overviewTitle: 'B2B, OEM and offline sales (Tranzact)',
      },
    ],
  },
  {
    slug: 'banking',
    title: 'Banks & payouts',
    description: 'Where every payout lands, how statements are imported and reconciled.',
    accent: 'sky',
    icon: ['M3 10h18M5 10V20m4-10v10m6-10v10m4-10v10M3 20h18M12 3l9 5H3l9-5z'],
    articles: [
      { chapter: 'c9', split: true, overviewTitle: 'Banks — overview' },
      { chapter: 's6', title: 'Importing statements in Tally Banking' },
    ],
  },
  {
    slug: 'purchases-assets',
    title: 'Purchases & assets',
    description: 'Capital goods, depreciation and the purchase-side rules.',
    accent: 'emerald',
    icon: ['M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'],
    articles: [{ chapter: 'c26', title: 'Capital goods and depreciation' }],
  },
  {
    slug: 'tax',
    title: 'GST & TDS',
    description: 'Registrations, monthly GST cycle, TDS splits, TCS and refunds.',
    accent: 'amber',
    icon: ['M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z'],
    articles: [
      { chapter: 'c7', title: 'GST' },
      { chapter: 'c8', title: 'TDS and TCS' },
    ],
  },
  {
    slug: 'systems-tools',
    title: 'Systems & tools',
    description: 'Tranzact, the eCom2Tally plugin, Tally On Cloud — concept, settings and menus.',
    accent: 'rose',
    icon: ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
    articles: [
      { chapter: 's1', title: 'Tranzact and the TranZact Chrome plugin' },
      { chapter: 's2', title: 'tally-integration.in (plugin website)' },
      { chapter: 's3', title: 'eCom2Tally plugin inside Tally' },
      { chapter: 's5', title: 'Tally On Cloud File Manager' },
      { chapter: 's7', title: 'The manual layer' },
      { chapter: 'c18', title: 'Tools and menus' },
      { chapter: 'c19', title: 'Plugin settings (reference — do not change)' },
    ],
  },
  {
    slug: 'reference',
    title: 'Reference',
    description: 'Chart of accounts, voucher types, control ledgers, links and terms.',
    accent: 'sky',
    icon: ['M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'],
    articles: [
      { chapter: 'c2', title: 'Chart of accounts' },
      { chapter: 'c3', title: 'Voucher type catalogue' },
      { chapter: 'c21', title: 'Control account map' },
      { chapter: 'c20', title: 'Links' },
      { chapter: 'c22', title: 'Terms' },
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
        sectionSummaries: {
          Amazon: 'Ads double-count, the monthly JV, reports, import order, TDS.',
          'Shopify, Easebuzz, Snapmint, Shiprocket': 'Returns, re-fetching, freight, rejected files.',
          Tranzact: 'Connecting, rejected documents, TDS split, Mark Paid.',
          'Tally, banks and access': 'Tally date, duplicate ledgers, bank import, access rules.',
        },
      },
    ],
  },
  {
    slug: 'health-check',
    title: 'Health check & open items',
    description: 'Findings from the books review, questions for the CA, and the evidence behind them.',
    accent: 'rose',
    icon: ['M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'],
    articles: [
      { chapter: 'c11', title: 'Findings and proposed adjustments' },
      { chapter: 'c12', title: 'Queries for the CA' },
      { chapter: 'c24', title: 'Evidence, figures and working files' },
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
];
