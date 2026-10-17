import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c5 (Shopify D2C) + §S3/§c3 (plugin voucher
// catalogue) + §c21 (control-account map). Shopify sales are created by the
// eCom2Tally plugin (option 3, daily API pull), NOT by Tranzact.
const spec: SopSpec = {
  title: 'Sales — Shopify (D2C)',
  description:
    'Shopify orders are pulled into Tally by the eCom2Tally plugin (option 3, daily). One sale opens one of two receivables — Shopify Prepaid Receivable (Easebuzz / Snapmint) or Shopify COD Receivable (Shiprocket) — which the matching payout later clears by bill reference. GST is 5% (device HSN 90211000), prices GST-inclusive, UP GSTIN.',
  accent: 'brand',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Shopify Sales', billSeries: 'prepaid: pg: tag · COD: HTR-<order_number>-D2C' },
    { name: 'Shopify Credit Note', billSeries: 'refunds / RTO / cancellations (automatic)' },
  ],
  ledgerMapping: [
    { role: 'Prepaid receivable', ledger: 'Shopify Prepaid Receivable' },
    { role: 'COD receivable', ledger: 'Shopify COD Receivable' },
    { role: 'Prepaid collectors', ledger: 'Easebuzz Collection A/c · Snapmint Collection' },
    { role: 'COD collector', ledger: 'ShipRocket Collection' },
    { role: 'GST output (UP)', ledger: 'IGST 5.00% · CGST 2.500% · SGST 2.500%' },
    { role: 'Bank (final)', ledger: 'Cash Credit Limit - [Central Bank]' },
  ],
  steps: [
    {
      title: 'Daily: pull Shopify orders (option 3)',
      body: 'Gateway of Tally → tally-integRation.in → 3 : E-Store, Pay Gateways & Courier. Platform Type Online-Store, Platform Shopify-Orders, Status any, From/To = yesterday. The plugin creates Shopify Sales (and Credit Notes for refunds / RTO / cancellations — never book these by hand).',
    },
    {
      title: 'How the receivable is chosen',
      body: 'Prepaid orders book Dr Shopify Prepaid Receivable under the value after "pg:" in the order tags. COD orders book Dr Shopify COD Receivable under bill ref HTR-<order_number>-D2C. GST is read price-inclusive at 5%.',
    },
    {
      title: 'Then pull Easebuzz (same dates)',
      body: 'Easebuzz always runs second — a payout can only clear an order already in Tally. See the Easebuzz Payouts SOP. Snapmint and Shiprocket clear monthly via option 5.',
    },
    {
      title: 'Clearing by bill reference',
      body: 'Prepaid: the Shopify "pg:" value must equal the Easebuzz bank_transaction_id to knock the bill off. COD: the Shopify HTR-<order>-D2C must equal the Shiprocket id. If the references differ the sale stays open (Dr) and an unmatched credit appears — the ledger total can look right while ageing is wrong.',
    },
    {
      title: 'Reconcile',
      body: 'Shopify Admin → Analytics → Sales (gross less discounts) should equal Tally Shopify Sales. Prepaid/COD Receivable should hold only the last few days of open orders.',
    },
  ],
  examples: [
    {
      title: 'Easebuzz payout clears a prepaid order (Apr-26)',
      scenario: 'Real April-26 journal PTGHF6MZ1B — Easebuzz settles a prepaid Shopify order, less its gateway fee.',
      voucherType: 'Journal (Easebuzz)',
      journal: [
        { side: 'Dr', ledger: 'Easebuzz Collection A/c', amount: '₹10,030.43' },
        { side: 'Dr', ledger: 'PG Transaction Fee - Easebuzz', amount: '₹114.02' },
        { side: 'Cr', ledger: 'Shopify Prepaid Receivable', amount: '₹10,144.44' },
      ],
      note: 'The Shopify Sales voucher earlier opened Shopify Prepaid Receivable (Dr) under the pg: tag; this payout knocks it off. Easebuzz Collection is later cleared at bank import: Dr Cash Credit Limit - [Central Bank], Cr Easebuzz Collection A/c.',
    },
    {
      title: 'Shiprocket COD remittance clears COD orders (Apr-26)',
      scenario: 'Real April-26 Journal 1 — Shiprocket remits COD collected for several D2C orders.',
      voucherType: 'Journal (Shiprocket COD)',
      journal: [
        { side: 'Dr', ledger: 'ShipRocket Collection', amount: '₹24,176.20' },
        { side: 'Cr', ledger: 'Shopify COD Receivable', amount: '₹24,176.20', note: 'Against HTR-18836-D2C, HTR-18841-D2C …' },
      ],
      note: 'ShipRocket Collection is then cleared by the bank receipt and by the Shiprocket freight invoices (booked as Purchase-Expense). See the Shiprocket COD SOP.',
    },
  ],
  clearing:
    'Prepaid orders sit in Shopify Prepaid Receivable until the Easebuzz / Snapmint journal clears them; COD orders sit in Shopify COD Receivable until the Shiprocket COD journal clears them. The collectors (Easebuzz / Snapmint / ShipRocket Collection) then empty to the Central Bank CC on bank import. Never clear a Shopify sale directly against the bank — always through its receivable and collector.',
  gotchas: [
    'Reference mismatch is the real failure mode: if the pg: tag ≠ Easebuzz bank_transaction_id (or HTR-<order>-D2C ≠ Shiprocket id), the sale stays open and an unmatched credit appears.',
    'Do NOT book Shopify returns/RTO/cancellations by hand — the plugin adjusts them from Shopify data. A COD order older than 30 days in Shopify COD Receivable usually means a missed RTO or a reference mismatch.',
    'GST is 5% on the device (HSN 90211000), not 18% — prices are GST-inclusive.',
    'Treat every import as one-time: re-running the same dates can double-book. Check the Day Book before re-fetching.',
  ],
  visuals: [
    { key: 'sales.shopify.payment-mode', label: 'Option 3 form set to Shopify-Orders' },
    { key: 'sales.shopify.tally-result', label: 'Shopify Sales voucher in Tally after the plugin pull' },
  ],
};

export function SalesShopifySop() {
  return <SopLayout spec={spec} />;
}
