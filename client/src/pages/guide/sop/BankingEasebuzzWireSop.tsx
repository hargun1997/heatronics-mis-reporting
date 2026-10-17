import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c9 (Banks). Note the distinction between
// the Easebuzz WIRE bank account and the Easebuzz Collection A/c clearing ledger.
const spec: SopSpec = {
  title: 'Banking — Easebuzz Wire A/C',
  description:
    'Easebuzz Wire A/C is a low-use bank account (≈ ₹0.10 L on the TB). It is NOT the Easebuzz clearing ledger — that is "Easebuzz Collection A/c" (a Sundry Debtor), cleared when the daily settlement lands in the Central Bank CC. This page is only the bank account itself.',
  accent: 'sky',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Receipt / Payment', billSeries: 'rare' },
    { name: 'Contra', billSeries: 'transfers' },
  ],
  ledgerMapping: [
    { role: 'Bank ledger', ledger: 'Easebuzz Wire A/C' },
    { role: 'Clearing ledger (not this page)', ledger: 'Easebuzz Collection A/c → see Shopify / Easebuzz SOPs' },
  ],
  steps: [
    { title: 'Import if there is activity', body: 'If the account moved in the month, import its statement via File Manager → Bank Statement New and reconcile. Otherwise confirm it is flat.' },
    { title: 'Do not confuse it with the clearing ledger', body: 'Easebuzz prepaid settlements clear the Easebuzz Collection A/c and land in the Central Bank CC (see the Easebuzz Payouts SOP), not here.' },
  ],
  examples: [
    {
      title: 'Where Easebuzz actually settles',
      scenario: 'For reference — the Easebuzz payout clears the collection ledger and lands in the operating bank, not the wire account.',
      voucherType: 'Receipt (Central Bank)',
      journal: [
        { side: 'Dr', ledger: 'Cash Credit Limit - [Central Bank]', amount: 'net' },
        { side: 'Cr', ledger: 'Easebuzz Collection A/c', amount: 'net' },
      ],
    },
  ],
  gotchas: [
    'Easebuzz Wire A/C (bank) vs Easebuzz Collection A/c (clearing ledger) are different ledgers — do not post settlements to the bank account.',
  ],
  visuals: [
    { key: 'banking.easebuzz.payout-csv', label: 'Easebuzz dashboard → Settlements' },
    { key: 'banking.easebuzz.voucher-pair', label: 'Easebuzz Collection A/c in the ledger' },
  ],
};

export function BankingEasebuzzWireSop() {
  return <SopLayout spec={spec} />;
}
