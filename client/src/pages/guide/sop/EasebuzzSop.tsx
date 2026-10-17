import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

// Source of truth: Accounts Handbook §c5 / §c14 D2 / §c23 (Easebuzz FAQ).
const spec: SopSpec = {
  title: 'Easebuzz Payouts (daily, plugin option 3)',
  description:
    'Easebuzz is the prepaid gateway for Shopify. Each day, after Shopify orders are pulled, the plugin (option 3) fetches Easebuzz payouts. A payout journal debits the Easebuzz Collection A/c and the gateway fee and clears the Shopify Prepaid Receivable by bill reference.',
  accent: 'brand',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Journal (Easebuzz)', billSeries: 'bill ref = bank_transaction_id' },
  ],
  ledgerMapping: [
    { role: 'Collector (clearing)', ledger: 'Easebuzz Collection A/c' },
    { role: 'Gateway fee', ledger: 'PG Transaction Fee - Easebuzz' },
    { role: 'Receivable cleared', ledger: 'Shopify Prepaid Receivable' },
    { role: 'Bank (final)', ledger: 'Cash Credit Limit - [Central Bank]' },
  ],
  steps: [
    { title: 'Run Shopify first, then Easebuzz (same dates)', body: 'Option 3 → Platform Type Payment-Gateway, Platform Easebuzz, Status any, From/To = same as the Shopify pull. Easebuzz runs second because a payout can only clear an order already in Tally.' },
    { title: 'The payout journal', body: 'The plugin books Dr Easebuzz Collection A/c + Dr PG Transaction Fee - Easebuzz, Cr Shopify Prepaid Receivable, matched by bill reference (the Shopify "pg:" tag value must equal the Easebuzz bank_transaction_id).' },
    { title: 'Bank leg', body: 'When the settlement lands, the bank import books Dr Cash Credit Limit - [Central Bank], Cr Easebuzz Collection A/c — emptying the collection ledger.' },
    { title: 'Weekly check (W1)', body: 'Count last week’s Easebuzz journals against the Easebuzz dashboard → Settlements: same count, same amounts, no repeats.' },
  ],
  examples: [
    {
      title: 'Easebuzz payout (Apr-26)',
      scenario: 'Real April-26 journal PTGHF6MZ1B.',
      voucherType: 'Journal (Easebuzz)',
      journal: [
        { side: 'Dr', ledger: 'Easebuzz Collection A/c', amount: '₹10,030.43' },
        { side: 'Dr', ledger: 'PG Transaction Fee - Easebuzz', amount: '₹114.02' },
        { side: 'Cr', ledger: 'Shopify Prepaid Receivable', amount: '₹10,144.44' },
      ],
    },
  ],
  clearing:
    'Easebuzz Collection A/c holds the settled amount between the payout journal and the bank receipt — it should hold only 1–2 days. The TB shows it ₹40.24 L Dr (overstated), the likely cause being duplicate payout imports.',
  gotchas: [
    'NEVER fetch the same Easebuzz dates twice — a second fetch double-books the payouts. There is also a confirmed pagination bug that brings payouts in only partly, which invites re-fetches.',
    'If a day looks short, check the Day Book (voucher type Journal, that date) and the Easebuzz dashboard first; re-fetch only the missing day in a small range.',
    'Duplicate journals (same bank_transaction_id) are the suspected cause of the Shopify Prepaid credit / Easebuzz overstatement — the fix is Dr Shopify Prepaid, Cr Easebuzz Collection to reverse the duplicate.',
  ],
  visuals: [
    { key: 'easebuzz.option3', label: 'Option 3 set to Easebuzz' },
    { key: 'easebuzz.daybook', label: 'Day Book check before a re-fetch' },
  ],
};

export function EasebuzzSop() {
  return <SopLayout spec={spec} />;
}
