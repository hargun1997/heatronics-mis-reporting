// Team-uploaded screenshots (SOP visuals registry, /api/sop-visuals).
// These upload slots used to live on the individual SOP pages; the keys are
// kept unchanged so anything already uploaded keeps showing, now under the
// handbook chapter that covers the same procedure.

export interface TeamVisualSlot {
  key: string;
  label: string;
}

export const TEAM_VISUALS: Record<string, TeamVisualSlot[]> = {
  c4: [
    { key: 'sales.b2b.party-master', label: 'Document Approval counts in Tranzact (your daily checklist)' },
    { key: 'sales.b2b.receipt-bill-ref', label: 'TDS split on the Consolidated ledger' },
    { key: 'purchase.grn', label: 'Service vs goods bill in Tranzact (Is Service flag)' },
    { key: 'purchase.gstr2b-match', label: 'GSTR-2B match for the month' },
    { key: 'jobwork.material-out', label: 'Consolidated ledger filtered to one supplier' },
    { key: 'jobwork.material-in', label: 'TDS split dialog (Split Options → TDS → %)' },
  ],
  c25: [
    { key: 'sales.blinkit.po-grn-match', label: 'Blinkit Sales Series invoice in Tranzact' },
    { key: 'sales.blinkit.tally-result', label: 'Posted invoice in Tally against the Blinkit party ledger' },
  ],
  c5: [
    { key: 'sales.shopify.payment-mode', label: 'Option 3 form set to Shopify-Orders' },
    { key: 'sales.shopify.tally-result', label: 'Shopify Sales voucher in Tally after the plugin pull' },
  ],
  c6: [
    { key: 'sales.amazon.bill-series', label: 'Option 2 (E-Com Import) form in Tally' },
    { key: 'sales.amazon.tally-result', label: 'Journal 53 — the monthly Amazon expense JV' },
  ],
  c7: [
    { key: 'gst.gstr1', label: 'Output-by-GSTIN working for GSTR-1' },
    { key: 'gst.gstr2b', label: 'GSTR-2B match' },
  ],
  c9: [
    { key: 'banking.central.statement-import', label: 'Bank Statement New upload in File Manager' },
    { key: 'banking.central.vendor-payment', label: 'Reconciling a channel payout against the collection ledger' },
    { key: 'banking.icici.bank-feed', label: 'ICICI statement import in Tally' },
    { key: 'banking.icici.review-tag', label: 'Tagging the counter-party before save' },
    { key: 'banking.hdfc.statement-import', label: 'HDFC statement import in Tally' },
    { key: 'banking.hdfc.settlement-journal', label: 'Reconciled HDFC payment' },
    { key: 'banking.easebuzz.payout-csv', label: 'Easebuzz dashboard → Settlements' },
    { key: 'banking.easebuzz.voucher-pair', label: 'Easebuzz Collection A/c in the ledger' },
  ],
  c26: [
    { key: 'capgoods.purchase-voucher', label: 'Purchase-Capital voucher in Tally with Fixed Asset Dr line' },
    { key: 'capgoods.depreciation-journal', label: 'Monthly depreciation Journal' },
  ],
  c14: [
    { key: 'easebuzz.option3', label: 'Option 3 set to Easebuzz' },
    { key: 'easebuzz.daybook', label: 'Day Book check before a re-fetch' },
  ],
  c16: [
    { key: 'expense.purchase-services', label: 'Purchase-Expense voucher booking a platform invoice' },
    { key: 'expense.tds-line', label: 'TDS line on an Amazon ads invoice' },
  ],
  c10: [
    { key: 'close.control-sheet', label: 'Control-account review sheet' },
    { key: 'close.brs', label: 'Bank reconciliation (BRS) in Tally' },
  ],
};
