// ----------------------------------------------------------------------------
// Report-slot catalog — for each connector, the report(s) it receives, with the
// exact export steps and how each is read. A connector can own several slots
// (Amazon, Tally). Where a parser is wired (parserId) the file is extracted to
// daily facts; Tally slots go through the vision model; the rest show their
// steps and are filled in as each parser is built.
// ----------------------------------------------------------------------------

import type { ReportSlot } from './types';

const SLOTS: ReportSlot[] = [
  // ---- Book of record ----
  {
    connectorId: 'tally', slotId: 'pnl', label: 'Profit & Loss A/c', required: true,
    accept: '.png,.jpg,.jpeg,.webp', kind: 'vision',
    exportSteps: [
      'Tally Prime → Gateway of Tally → Profit & Loss A/c',
      'Set the period (F2) to the month you are ingesting',
      'Press F12 → show all ledgers / method = Detailed (expand every level)',
      'Screenshot the full screen. If it scrolls, take one screenshot per screen.',
    ],
    note: 'Claude reads every ledger and its hierarchy from the screenshot and reconciles to the Nett Profit.',
  },
  {
    connectorId: 'tally', slotId: 'trial-balance', label: 'Trial Balance (optional)', required: false,
    accept: '.png,.jpg,.jpeg,.webp', kind: 'vision',
    exportSteps: [
      'Tally Prime → Gateway → Trial Balance',
      'Set period, F12 → Detailed',
      'Screenshot the screen (one per screen if it scrolls)',
    ],
  },
  {
    connectorId: 'tranzact', slotId: 'bom', label: 'BOM pricing', required: true,
    accept: '.xlsx,.xls', kind: 'bom',
    exportSteps: [
      'Tranzact → Production → Bill of Materials (link below)',
      'Actions ▸ Download All BOMs → Pricing Type = Default Price → Download All BOMs',
      'The file is emailed to you — download it from the email, then upload it here',
    ],
    exportUrl: {
      label: 'Open Tranzact Bill of Materials',
      url: 'https://app.letstranzact.com/v3/production?section=bom',
    },
    note: 'Standard cost per finished good — the "Total FG Cost" on each FG-#### row (SFG/RM sub-rows ignored) is the per-unit COGS behind SKU margin. Emailed as an Excel (Summary sheet); upload that file.',
  },

  // ---- Marketplaces ----
  {
    connectorId: 'amazon', slotId: 'unified-transaction', label: 'Unified Transaction (settlement)', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx', parserId: 'amazon',
    exportSteps: [
      'Payment reports → Reports Repository tab (link below)',
      'Report Type = Transaction, Account Type = All (Unified Reports), pick the Month (or a custom range)',
      'Request Report → wait until Status = Ready → Download CSV, then upload here',
    ],
    exportUrl: {
      label: 'Open Amazon Reports Repository',
      url: 'https://sellercentral.amazon.in/payments/reports-repository?ref_=xx_rrepo_ttab_dash',
    },
    note: 'Revenue, units, fees and ad spend — the fee-accurate money view.',
  },
  {
    connectorId: 'amazon', slotId: 'business-report', label: 'Business Report (traffic, optional)', required: false,
    accept: '.csv', kind: 'xlsx',
    exportSteps: [
      'Business Reports → Detail Page Sales & Traffic By Child Item (link below)',
      'Set the date range to the month → Download (.csv), then upload here',
    ],
    exportUrl: {
      label: 'Open Amazon Business Reports (by child item)',
      url: 'https://sellercentral.amazon.in/business-reports/ref=xx_sitemetric_dnav_xx#/report?id=102%3ADetailSalesTrafficByChildItem&chartCols=&columns=0%2F1%2F2%2F3%2F8%2F9%2F14%2F15%2F20%2F21%2F26%2F27%2F28%2F29%2F30%2F31%2F32%2F33%2F34%2F35%2F36%2F37',
    },
    note: 'Sessions / units by SKU. Gross of refunds, no fees — use for conversion, not the P&L.',
  },
  {
    connectorId: 'flipkart', slotId: 'settlement', label: 'Settlement / commission', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Flipkart Seller Hub → Reports Center → Settlement report → download'],
  },
  {
    connectorId: 'blinkit', slotId: 'order-charges', label: 'Payout — order-level charges', required: true,
    accept: '.xlsx,.xls', kind: 'xlsx', parserId: 'blinkit',
    exportSteps: [
      'Blinkit Seller → Billing → Payout Details (link below)',
      'Click "Download monthly SoA" → pick the month → Download the ZIP',
      'Open the ZIP, then upload the single file "A&B. Order_level_charges.xlsx" here',
    ],
    exportUrl: {
      label: 'Open Blinkit Payout Details',
      url: 'https://seller.blinkit.com/dashboard/billing?billing=payout_details',
    },
    note: 'Blinkit channel: per-item gross bill → net revenue; commission + commission GST + shipping + shipping GST → channel fees. TCS/TDS are tax withheld (recoverable), not a cost.',
  },

  // ---- D2C (live) ----
  {
    connectorId: 'shopify', slotId: 'variant-sales', label: 'Sales by variant (manual fallback)', required: false,
    accept: '.csv', kind: 'xlsx',
    exportSteps: [
      'Shopify is pulled live by API — no upload needed normally.',
      'Fallback: Analytics → Reports → Sales by product variant → export CSV',
    ],
    note: 'Only needed if the live pull is unavailable.',
  },

  // ---- Marketing ----
  {
    connectorId: 'meta', slotId: 'ad-spend', label: 'Ad spend — campaign × ad set × product', required: true,
    accept: '.csv,.xlsx', kind: 'xlsx', parserId: 'meta',
    exportSteps: [
      'Open the saved "MIS Reporting" report (link below) — grouped Campaign → Ad set → Product ID with Amount spent',
      'Set the date range to the SINGLE month you are ingesting (whole month, all campaigns)',
      'Export → download the CSV/XLSX, then upload it here',
    ],
    exportUrl: {
      label: 'Open MIS Reporting in Meta Ads Manager',
      url: 'https://adsmanager.facebook.com/adsmanager/reporting/view?act=2294012640954204&ads_manager_write_regions=true&business_id=488618164122715&event_source=CLICK_CREATE_REPORT&selected_report_id=120255530074250155',
    },
    note: 'Meta spend → Sales & Marketing. Grand total = true spend; Product ID rows give measured per-product spend; the unattributed residual is allocated across D2C products by revenue. Product ids map to finished goods.',
  },
  {
    connectorId: 'googleads', slotId: 'ad-spend', label: 'Campaign report (total spend)', required: true,
    accept: '.csv,.xlsx', kind: 'xlsx', parserId: 'googleads',
    exportSteps: [
      'Google Ads → Campaigns (link below) → set the date range to the month',
      'Click the Download icon (top-right of the table) → Excel or CSV',
      'Upload it here',
    ],
    exportUrl: {
      label: 'Open Google Ads Campaigns',
      url: 'https://ads.google.com/aw/campaigns?ocid=1525533322',
    },
    note: 'Total Google spend (the "Total: Account" row) → D2C Sales & Marketing, spread across D2C products by revenue. Per-product Shopping/PMax detail is the optional report below.',
  },
  {
    connectorId: 'googleads', slotId: 'shopping-products', label: 'Shopping products (per-item cost, optional)', required: false,
    accept: '.csv,.xlsx', kind: 'xlsx', parserId: 'googleadsproducts',
    exportSteps: [
      'Google Ads → Reports → Predefined → Shopping → "Shopping - Products" (link below)',
      'Set the same month, keep Item ID + Cost → Download',
    ],
    exportUrl: {
      label: 'Open Google Ads Shopping products report',
      url: 'https://ads.google.com/aw/reporteditor/view?ocid=1525533322&predefinedReportId=128',
    },
    note: 'Optional precision: per-product Google spend for Shopping / Performance Max. Without it, all Google spend allocates across D2C products by revenue.',
  },
  {
    connectorId: 'amazonads', slotId: 'ad-spend', label: 'Advertised Product report', required: true,
    accept: '.csv,.xlsx', kind: 'xlsx', parserId: 'amazonads',
    exportSteps: [
      'Amazon Ads → Create report, template "Advertised product" (link below)',
      'Date range = the same month as the settlement; Report period / Date range = that month',
      'Submit → download the CSV, then upload it here',
    ],
    exportUrl: {
      label: 'Open Amazon Ads — Advertised product report',
      url: 'https://advertising.amazon.in/reporting/new?entityId=ENTITY6HS1BPYC5VNY&templateId=advertised_product',
    },
    note: 'Per-SKU ad spend — splits Amazon marketing across products for true per-SKU CM2.',
  },

  // ---- Logistics ----
  {
    connectorId: 'shiprocket', slotId: 'passbook', label: 'Wallet passbook', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx', parserId: 'shiprocket',
    exportSteps: [
      'Shiprocket → Wallet Transactions → Passbook tab (link below)',
      'Set the date range to the month → Export / Download',
    ],
    exportUrl: {
      label: 'Open Shiprocket Passbook',
      url: 'https://app.shiprocket.in/seller/wallet-transactions/passbook',
    },
    note: 'Daily D2C freight & charges (debit rows; wallet recharges / COD transfers excluded).',
  },
  {
    connectorId: 'delhivery', slotId: 'freight', label: 'Freight / billing', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Delhivery One → Billing → remittance / freight export'],
  },

  // ---- Payments & checkout ----
  {
    connectorId: 'easebuzz', slotId: 'settlement', label: 'Settlement / MDR', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx', parserId: 'easebuzz',
    exportSteps: [
      'Easebuzz dashboard → Settlements → Settlement History (link below)',
      'Set the date range to the month → click Download',
    ],
    exportUrl: {
      label: 'Open Easebuzz Settlements',
      url: 'https://dashboard.easebuzz.in/payouts/history',
    },
    note: 'D2C payment-gateway cost: service charge + GST + express fees → Platform & Payment (not channel fees). Revenue is counted via Shopify, so only the fee is taken.',
  },
  {
    connectorId: 'shopflo', slotId: 'settlement', label: 'Checkout settlement', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Shopflo → Settlements → export'],
  },
  {
    connectorId: 'snapmint', slotId: 'settlement', label: 'Settlement / subvention', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx', parserId: 'snapmint',
    exportSteps: [
      'Snapmint → Reports → Download Group Settlement Daily Report (link below)',
      'Set Start/End date to the month → Submit (the report is emailed to you)',
      'Download it from the email, then upload it here',
    ],
    exportUrl: {
      label: 'Open Snapmint merchant dashboard',
      url: 'https://emis.snapmint.com/merchants/dashboard?app_tab=authorized',
    },
    note: 'D2C BNPL (EMI) cost: subvention + merchant fees + GST → Platform & Payment (a finance cost, not a discount). Revenue is counted via Shopify, so only the cost is taken. TCS/TDS excluded.',
  },
];

export function slotsFor(connectorId: string): ReportSlot[] {
  return SLOTS.filter((s) => s.connectorId === connectorId);
}

export const ALL_SLOTS = SLOTS;
