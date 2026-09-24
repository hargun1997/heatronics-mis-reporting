// ----------------------------------------------------------------------------
// The month's input catalogue: what to pull, from where, and what reads it.
//
// This used to live inside MISDeck.tsx as static documentation on its own tab,
// which meant the instructions were in a different place from the drop zone
// that needs them. It now backs both: the close page lists these as a live
// checklist that ticks off as files land, and each row names the adapter that
// claims it so "where does this come from" is answered where you are standing.
//
// Several rows were corrected when the adapters were written against the real
// July 2026 exports. They pointed at plausible reports that turn out not to
// carry what the tool needs — the Amazon Business Report being the worst of
// them, since it looks right and cannot price a month.
// ----------------------------------------------------------------------------

import type { SourceKind } from '../monthClose/schema';

export interface FeedRow {
  /** The report or file to pull. */
  export: string;
  /** Source system and the path through it. */
  where: string;
  /** Columns or fields that must be present. */
  fields: string;
  /** Which part of the dashboard it drives. */
  feeds: string;
  /** The reconciliation self-check. */
  check: string;
  /**
   * The ingest adapter that claims this file, when one does.
   *
   * Rows without a kind are still real inputs — they just reach the deck by
   * another route (a costing decision, a figure typed in) rather than by being
   * dropped on the close page.
   */
  kind?: SourceKind;
  /** Set when a row is a trap worth naming before someone exports the wrong thing. */
  caution?: string;
  /**
   * True when the month closes fine without this file.
   *
   * Separate from `tier`, because an essential SOURCE can have an optional
   * report: the Amazon business report sits under an essential system but
   * carries no fees, so nothing breaks if it never arrives.
   */
  optional?: boolean;
}

export interface FeedSource {
  name: string;
  tier: 'book' | 'essential' | 'enhancement';
  cadence: string;
  rows: FeedRow[];
}

export const FEED_SOURCES: FeedSource[] = [
  {
    name: 'Accounting / Tally',
    tier: 'book',
    cadence: 'Monthly (once books close)',
    rows: [
      {
        export: 'Profit & Loss A/c for the month',
        where: 'Tally → Display → Profit & Loss A/c, with Detailed view on. Export to Excel, or screenshot each section.',
        fields:
          'The full ledger tree: Sales Accounts by channel, Purchase Accounts, Direct Expenses, Indirect Expenses and Incomes, plus Opening and Closing Stock',
        feeds: 'Everything. This is the book of record — every company total ties to it.',
        check: 'The cascade must reproduce Tally’s own Nett Profit / Loss within ₹1.',
        kind: 'tallyPnl',
        caution:
          'The Trading Account prints closing stock as “Less: Closing Stock” with a negative amount. Keep that row — dropping it overstates COGM by the whole stock balance.',
      },
      {
        export: 'Group summary for any group you need split',
        where: 'Tally → Display → Account Books → Group Summary, drilled into the group',
        fields: 'Ledger-level detail under the group',
        feeds: 'Splitting a lump — Employee Cost, Channel Fees, Factory Overheads',
        check: 'Children sum to the parent shown on the P&L.',
        kind: 'tallyGroupSummary',
        // Pulled when a lump needs splitting, not every month — marking it
        // required would leave the counter permanently short and teach people
        // to ignore it.
        optional: true,
        caution:
          'Factory Overheads comes through the P&L as a single leaf, so whether factory rent sits inside gross margin cannot be read off it. Drill that group if the answer matters.',
      },
    ],
  },
  {
    name: 'Amazon Seller Central',
    tier: 'essential',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Custom unified transaction report',
        where: 'Seller Central → Payments → Date range reports → Generate report → Transaction, for the calendar month',
        fields:
          'date/time, type, SKU, quantity, product sales, shipping credits, promotional rebates, selling fees, FBA fees, other transaction fees, total',
        feeds:
          'Amazon per-SKU revenue, units and fees; advertising split out of service fees; the cross-check against Tally’s Ecommerce Sales',
        check: 'Net revenue should land within ~0.2% of Tally’s Ecommerce Sales. July 2026 agreed to 0.18%.',
        kind: 'amazonSettlement',
        caution:
          'This is the Amazon file that matters. Quantity prints positive on refunds and bank Transfer rows sit among the sales — the adapter handles both, but a hand-built sheet from this export will not.',
      },
      {
        export: 'Business report — sales and traffic (optional)',
        where: 'Seller Central → Reports → Business Reports → Detail Page Sales & Traffic by Child ASIN',
        fields: 'Sessions, page views, units ordered, ordered product sales',
        feeds: 'Sessions and conversion only',
        check: 'Ordered product sales is gross of refunds, so it will read high against the books.',
        kind: 'amazonSales',
        optional: true,
        caution:
          'Carries no fees and does not net refunds, so it cannot price a month. Skip it unless you want traffic.',
      },
    ],
  },
  {
    name: 'Shopify (D2C)',
    tier: 'essential',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Total sales by product variant',
        where: 'Shopify admin → Analytics → Reports → Total sales by product variant, for the calendar month',
        fields: 'Product title, product variant SKU, net items sold, net sales',
        feeds: 'D2C per-product revenue and units; the cross-check against Tally’s D2C Sales',
        check: 'Tally D2C also carries non-Shopify D2C, so a few percent of gap is expected.',
        kind: 'shopifySales',
        caution:
          'Orders placed before a variant had its SKU set report with a blank SKU, and re-exporting will not fill it in. Those rows fall back to the product title and are flagged as the weaker match.',
      },
    ],
  },
  {
    name: 'Blinkit',
    tier: 'essential',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Payout sheet for the month',
        where: 'Blinkit seller panel → Payments → Payout sheet. Downloads as a ZIP — unzip it first.',
        fields: 'Item ID, product name, quantity, total gross bill amount, commission, shipping, item level payout',
        feeds: 'Blinkit per-item revenue and deductions',
        check: 'Item gross should reconcile to Quick Commerce Sales, which can be net negative when credit notes land late.',
        kind: 'blinkitSettlement',
        caution: 'Drop “A&B. Order_level_charges.xlsx” from inside the ZIP — it is the only one with item detail.',
      },
    ],
  },
  {
    name: 'D2C fulfilment & payments',
    tier: 'essential',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Shiprocket wallet passbook',
        where: 'Shiprocket → Billing → Passbook, exported for the month',
        fields: 'Created At, Channel Order Id, AWB Code, Amount, Description',
        feeds: 'Net outbound freight, RTO and COD charges, held against freight outward',
        check: 'Forward + RTO + COD + boost charges, less reversals, is the month’s freight.',
        kind: 'shiprocketFreight',
        caution:
          'The largest positive lines are COD moving into the wallet, not income. Summing the Amount column without excluding them lands ~74% light on freight.',
      },
      {
        export: 'Shopflo checkout billing (optional)',
        where: 'Shopflo monthly tax invoice',
        fields: 'Checkout charges COD and online, add-ons',
        feeds: 'Confirms D2C Checkout in the books; the COD vs prepaid GMV split',
        check: 'Charges run at ~0.5% of GMV. Immaterial to margin — the split is the useful part.',
        optional: true,
      },
    ],
  },
  {
    name: 'Tranzact — product cost',
    tier: 'essential',
    cadence: 'When BOMs or purchase prices change',
    rows: [
      {
        export: 'BOM pricing export',
        where: 'Tranzact → Production → Bill of Materials → select the BOMs → export with latest purchase price',
        fields: 'FG Item ID, BOM Number, BOM Name, Total FG Cost',
        feeds: 'Per-SKU COGS — units times the finished good’s standard cost',
        check: 'Every product that sold in the month needs a BOM, or its margin reads as 100%.',
        kind: 'tranzactBom',
        caution:
          'Exports only the BOMs you select. A partial selection drops finished goods silently — the first July export was missing six, including the two best sellers.',
      },
    ],
  },
  {
    name: 'Offline & OEM sales',
    tier: 'essential',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Monthly sales figure (₹) per channel',
        where: 'Sales / billing register (wholesale & offline)',
        fields: 'Month, channel, net sales (₹)',
        feeds: 'Offline and OEM revenue and SKU rows',
        check: 'Ties to Offline / OEM net sales in the books.',
      },
    ],
  },
  {
    name: 'Meta Ads',
    tier: 'enhancement',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Spend × campaign / ad set, broken down by month',
        where: 'Ads Manager → Reports (or Ads table) → export. Include ALL ad accounts, remove filters and the row limit.',
        fields: 'Month, Campaign name, Ad set name, Website URL, Amount spent (INR)',
        feeds: 'Per-SKU ad split for D2C (Meta half)',
        check:
          'Line rows (not the total row) must sum to the full booked Meta spend — if it only sums to ~10–15%, the export is capped; re-export per-account or per-year',
        kind: 'adSpend',
      },
    ],
  },
  {
    name: 'Google Ads',
    tier: 'enhancement',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Spend × campaign × product title, by month',
        where: 'Google Ads → Reports → include ALL campaign types (Shopping, Performance Max, Search, Demand Gen)',
        fields: 'Year, Month, Campaign, Product Title, Cost',
        feeds: 'Per-SKU ad split for D2C (Google half)',
        check:
          'Cost column sums to the full booked Google spend — Shopping-only export lands ~35%, so include PMax & the rest',
        kind: 'adSpend',
      },
    ],
  },
  {
    name: 'Repeat-purchase (optional)',
    tier: 'enhancement',
    cadence: 'Monthly',
    rows: [
      {
        export: 'Repeat / cohort report — Shopify & Amazon',
        where: 'Shopify customer cohorts · Amazon repeat-customer report',
        fields: 'Month, repeat rate / repeat-customer share, frequency',
        feeds: 'Repeats tab',
        check: 'Definitions differ by source (cohort vs active) — compare trends, not levels',
      },
    ],
  },
];

export const TIER_BADGE: Record<FeedSource['tier'], { label: string; cls: string }> = {
  book: { label: 'Book of record', cls: 'bg-brand-100 text-brand-700' },
  essential: { label: 'Essential', cls: 'bg-emerald-100 text-emerald-700' },
  enhancement: { label: 'Enhancement', cls: 'bg-amber-100 text-amber-700' },
};

/** Every row the close page can receive as a file, flattened. */
export const INGESTABLE_ROWS: (FeedRow & { source: string; tier: FeedSource['tier'] })[] =
  FEED_SOURCES.flatMap((s) =>
    s.rows.filter((r) => r.kind).map((r) => ({ ...r, source: s.name, tier: s.tier })),
  );
