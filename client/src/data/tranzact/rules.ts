// Tranzact document series + accounting rules, read from Tranzact itself on 3 Nov 2026
// (Settings → Documents → Document Number Format; Accounting Integration → Accounting Rules / Ledger Settings).
// ONE table: the register parser, checks and docs/knowledge/tranzact-rules.md all follow it.
// Tranzact picks the Tally SALES ledger from the invoice's document series (no item / tax / address rules set).

export type SeriesTreatment = 'sale' | 'transfer' | 'own-feed';

export interface TranzactSeries {
  name: string;           // series name in Tranzact
  prefix: string;         // invoice-number prefix (UPPER); template PREFIX/YY-YY/NNNN, resets each FY
  ledger: string;         // Tally sales ledger the accounting rule posts to ('' = no rule yet)
  treatment: SeriesTreatment;
  channel?: string;       // MIS channel when treatment = 'sale'
  source?: string;        // fact source when treatment = 'sale'
  note?: string;
}

export const TRANZACT_SERIES: TranzactSeries[] = [
  { name: 'OEM Sales Series', prefix: 'OEM', ledger: 'OEM Sales', treatment: 'sale', channel: 'B2B', source: 'tranzactb2b' },
  { name: 'GT Dealer Series', prefix: 'GTD', ledger: 'GT - Dealer Sales', treatment: 'sale', channel: 'GT', source: 'tranzactgt' },
  { name: 'GT Retailer Series', prefix: 'GTR', ledger: 'GT - Retailer Sales', treatment: 'sale', channel: 'GT', source: 'tranzactgt' },
  { name: 'GT CNF Series', prefix: 'GTC', ledger: 'GT - CNF Sales', treatment: 'sale', channel: 'GT', source: 'tranzactgt' },
  { name: 'Physio Channel Series', prefix: 'PHY', ledger: 'Physio Channel Sales', treatment: 'sale', channel: 'GT', source: 'tranzactgt' },
  { name: 'MT Sales Series', prefix: 'MT', ledger: 'MT Sales', treatment: 'sale', channel: 'GT', source: 'tranzactgt', note: 'Modern trade — rolled into GT until the MIS has its own channel.' },
  { name: 'B2C Series', prefix: 'B2C', ledger: 'B2C Offline Sales', treatment: 'sale', channel: 'GT', source: 'tranzactgt', note: 'Offline B2C — rolled into GT until the MIS has its own channel.' },
  { name: 'Blinkit Sales Series', prefix: 'BLK', ledger: 'Blinkit Sales', treatment: 'own-feed', note: 'Blinkit revenue + fees come from the Blinkit payout slot; shown in the Tranzact trace only.' },
  { name: 'Internal Transfer Series', prefix: 'ITF', ledger: 'Internal Transfer Sales', treatment: 'transfer', note: "= Tally 'Stock Transfers'. Not revenue." },
  { name: 'Ecommerce 3P', prefix: 'ECOM', ledger: 'Internal Transfer Sales', treatment: 'transfer', note: 'Amazon 3P stock to Supernode. Ledger rule added 3 Nov 2026 (founder: not revenue; Amazon Sales stays = MTR). Still no VOUCHER rule.' },
];

/** Credit-note series use PREFIX/CN/… (BLK, GTR, GTD, GTC, MT, PHY, OEM, ITF) plus plain CN. */
export const TRANZACT_CREDIT_NOTE_MARKER = 'CN';

export const TRANZACT_PURCHASE_LEDGERS = { goods: 'RM Purchases', services: 'Job Work Charges (service bills; 2% TDS split before pushing)' };

export function tranzactSeriesFor(invoice: string): TranzactSeries | undefined {
  const parts = invoice.split('/').map((s) => s.trim().toUpperCase());
  if (parts[1] === TRANZACT_CREDIT_NOTE_MARKER) return undefined; // credit note, not an invoice
  return TRANZACT_SERIES.find((s) => s.prefix === parts[0]);
}
