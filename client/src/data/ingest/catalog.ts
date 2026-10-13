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
      'Tranzact → Bill of Materials',
      'Export the BOM list WITH pricing (needs "FG Item ID" and "Total FG Cost" columns)',
    ],
    note: 'Standard cost per finished good — the per-unit COGS behind SKU margin.',
  },

  // ---- Marketplaces ----
  {
    connectorId: 'amazon', slotId: 'unified-transaction', label: 'Unified Transaction (settlement)', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx', parserId: 'amazon',
    exportSteps: [
      'Seller Central (Heatronics / amazon.in) → Reports → Payments',
      'Transaction View → set the date range → Download (flat file / unified transaction)',
    ],
    note: 'Revenue, units, fees and ad spend — the fee-accurate money view.',
  },
  {
    connectorId: 'amazon', slotId: 'business-report', label: 'Business Report (traffic, optional)', required: false,
    accept: '.csv', kind: 'xlsx',
    exportSteps: [
      'Seller Central → Reports → Business Reports',
      'Detail Page Sales & Traffic by Child Item → download CSV',
    ],
    note: 'Sessions / units by SKU. Gross of refunds, no fees — use for conversion, not the P&L.',
  },
  {
    connectorId: 'flipkart', slotId: 'settlement', label: 'Settlement / commission', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Flipkart Seller Hub → Reports Center → Settlement report → download'],
  },
  {
    connectorId: 'blinkit', slotId: 'order-charges', label: 'Payout — order-level charges', required: true,
    accept: '.xlsx,.xls', kind: 'xlsx',
    exportSteps: [
      'Blinkit brand portal → Payments → download the payout ZIP',
      'Open "A&B. Order_level_charges.xlsx" from the ZIP and upload that single workbook',
    ],
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
    connectorId: 'meta', slotId: 'ad-spend', label: 'Ad spend — day × campaign × product', required: true,
    accept: '.csv,.xlsx', kind: 'xlsx',
    exportSteps: [
      'Meta Ads Manager → set the date range to the month you are ingesting',
      'Columns: include "Amount spent" (INR) and "Campaign name"',
      'Breakdown → By Day AND By Product, then Export (Reports or the ads table)',
      'The Product column fills only for the catalog (dynamic product) campaign — that is expected',
    ],
    note: 'Meta spend → Sales & Marketing. The catalog campaign breaks down to real per-product spend; the rest (brand/creative/prospecting campaigns carry no product) is allocated across D2C products by revenue share, flagged as modeled.',
  },
  {
    connectorId: 'googleads', slotId: 'ad-spend', label: 'Ad spend — day × campaign', required: true,
    accept: '.csv,.xlsx', kind: 'xlsx',
    exportSteps: [
      'Google Ads → Campaigns → set the date range to the month you are ingesting',
      'Segment by Day, keep Cost (and Campaign) columns → Download',
    ],
    note: 'Google spend → Sales & Marketing. Account/campaign spend by day; per-product comes from the Shopping products report below where Shopping/PMax is run.',
  },
  {
    connectorId: 'googleads', slotId: 'shopping-products', label: 'Shopping products (per-item cost, optional)', required: false,
    accept: '.csv,.xlsx', kind: 'xlsx',
    exportSteps: [
      'Google Ads → Reports → Predefined → Shopping → "Shopping - Products"',
      'Set the same date range, keep Item ID + Cost → download',
    ],
    note: 'Per-product Google spend for Shopping / Performance Max. Search spend has no product and is allocated by revenue share.',
  },
  {
    connectorId: 'amazonads', slotId: 'ad-spend', label: 'Advertised Product report', required: true,
    accept: '.csv,.xlsx', kind: 'xlsx', parserId: 'amazonads',
    exportSteps: [
      'Amazon Ads console → Measurement and Reporting → Sponsored Ads Reports → Create Report',
      'Report type "Advertised Product", date range = the same month as the Amazon settlement → download CSV',
    ],
    note: 'Per-SKU ad spend — splits Amazon marketing across products for true per-SKU CM2.',
  },

  // ---- Logistics ----
  {
    connectorId: 'shiprocket', slotId: 'passbook', label: 'Wallet passbook', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx', parserId: 'shiprocket',
    exportSteps: ['Shiprocket → Billing → Wallet / Passbook → export'],
    note: 'Daily freight & charges (wallet/COD transfers are excluded).',
  },
  {
    connectorId: 'delhivery', slotId: 'freight', label: 'Freight / billing', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Delhivery One → Billing → remittance / freight export'],
  },

  // ---- Payments & checkout ----
  {
    connectorId: 'easebuzz', slotId: 'settlement', label: 'Settlement / MDR', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Easebuzz dashboard → Settlements → export'],
  },
  {
    connectorId: 'shopflo', slotId: 'settlement', label: 'Checkout settlement', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Shopflo → Settlements → export'],
  },
  {
    connectorId: 'snapmint', slotId: 'settlement', label: 'Settlement / subvention', required: true,
    accept: '.xlsx,.xls,.csv', kind: 'xlsx',
    exportSteps: ['Snapmint merchant dashboard → Settlement report → download'],
  },
];

export function slotsFor(connectorId: string): ReportSlot[] {
  return SLOTS.filter((s) => s.connectorId === connectorId);
}

export const ALL_SLOTS = SLOTS;
