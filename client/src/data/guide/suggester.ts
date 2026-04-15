/**
 * Rules engine for the Invoice Booking Suggester.
 *
 * Given: transaction type, mode (B2B/B2C), channel, party name, HSN / service
 * Returns: recommended voucher type, ledger postings, bill series, clearing flow.
 */

export type TxnType = 'Sales' | 'Purchase' | 'Expense' | 'Banking' | 'Capital Goods' | 'Job Work';
export type Mode = 'B2B' | 'B2C' | 'N/A';

export interface Channel {
  id: string;
  name: string;
  supports: TxnType[];
  modes: Mode[];
  system: 'Tranzact' | 'Tally' | 'Both';
}

export const CHANNELS: Channel[] = [
  { id: 'amazon',     name: 'Amazon',            supports: ['Sales'],                 modes: ['B2B', 'B2C'], system: 'Tranzact' },
  { id: 'shopify',    name: 'Shopify (D2C)',     supports: ['Sales'],                 modes: ['B2C'],        system: 'Tranzact' },
  { id: 'blinkit',    name: 'Blinkit',           supports: ['Sales'],                 modes: ['B2B'],        system: 'Tranzact' },
  { id: 'b2b-direct', name: 'B2B Distributor',   supports: ['Sales'],                 modes: ['B2B'],        system: 'Tranzact' },
  { id: 'rm',         name: 'Raw Material',      supports: ['Purchase'],              modes: ['B2B'],        system: 'Tranzact' },
  { id: 'pkg',        name: 'Packing Material',  supports: ['Purchase'],              modes: ['B2B'],        system: 'Tranzact' },
  { id: 'jobwork',    name: 'Job Worker',        supports: ['Job Work'],              modes: ['B2B'],        system: 'Tranzact' },
  { id: 'capgoods',   name: 'Capital Goods',     supports: ['Capital Goods'],         modes: ['B2B'],        system: 'Tally' },
  { id: 'expense',    name: 'Expense Vendor',    supports: ['Expense'],               modes: ['B2B', 'N/A'], system: 'Tally' },
  { id: 'icici',      name: 'ICICI Bank',        supports: ['Banking'],               modes: ['N/A'],        system: 'Tally' },
  { id: 'central',    name: 'Central Bank',      supports: ['Banking'],               modes: ['N/A'],        system: 'Tally' },
  { id: 'hdfc',       name: 'HDFC Escrow',       supports: ['Banking'],               modes: ['N/A'],        system: 'Tally' },
];

export type PaymentMode = 'Prepaid' | 'COD' | 'Credit' | 'On Account' | 'N/A';

export interface SuggesterInput {
  txnType: TxnType;
  mode: Mode;
  channelId: string;
  paymentMode?: PaymentMode;
  party?: string;
  hsn?: string;
  gstRate?: number; // percentage
  amount?: number;  // incl-tax amount
  intraState?: boolean;
}

export interface JournalLine {
  side: 'Dr' | 'Cr';
  ledger: string;
  amount?: string;
  note?: string;
}

export interface SuggesterOutput {
  system: 'Tally' | 'Tranzact';
  voucherType: string;
  billSeries?: string;
  masterLedger: string; // Sales / Purchase / Expense ledger
  counterParty?: string;
  gstLedgers: string[];
  clearingExplanation?: string;
  journal: JournalLine[];
  notes: string[];
  bank?: string;
}

function computeGstBreakup(amountIncl: number | undefined, rate: number | undefined, intraState: boolean | undefined) {
  if (!amountIncl || !rate || rate <= 0) {
    return { base: undefined as number | undefined, cgst: undefined as number | undefined, sgst: undefined as number | undefined, igst: undefined as number | undefined };
  }
  const base = +(amountIncl / (1 + rate / 100)).toFixed(2);
  const tax = +(amountIncl - base).toFixed(2);
  if (intraState ?? true) {
    const half = +(tax / 2).toFixed(2);
    return { base, cgst: half, sgst: half, igst: undefined };
  }
  return { base, cgst: undefined, sgst: undefined, igst: tax };
}

function money(n?: number) {
  if (n === undefined || n === null) return '';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function suggest(input: SuggesterInput): SuggesterOutput {
  const { txnType, mode, channelId, paymentMode, party, gstRate, amount, intraState, hsn } = input;
  const g = computeGstBreakup(amount, gstRate, intraState);
  const notes: string[] = [];
  if (hsn) notes.push(`HSN/SAC: ${hsn}`);
  if (party) notes.push(`Party: ${party}`);

  // ────────────── SALES ──────────────
  if (txnType === 'Sales') {
    if (channelId === 'amazon' && mode === 'B2C') {
      return {
        system: 'Tranzact',
        voucherType: 'Sales (Amazon-B2C)',
        billSeries: 'AMZ-B2C-YYYYMM-####',
        masterLedger: 'Sales — Amazon B2C',
        counterParty: 'Amazon Unsettled Receivable',
        gstLedgers: intraState === false ? ['Output IGST'] : ['Output CGST', 'Output SGST'],
        clearingExplanation:
          'Sale is parked against Amazon Unsettled Receivable. When Amazon STR / settlement is received, a Journal reverses the receivable and posts commission, fees and TCS to the settlement ledgers, with the net amount credited to HDFC Escrow.',
        journal: [
          { side: 'Dr', ledger: 'Amazon Unsettled Receivable', amount: money(amount), note: 'Invoice incl. tax' },
          { side: 'Cr', ledger: 'Sales — Amazon B2C', amount: money(g.base) },
          ...(intraState === false
            ? [{ side: 'Cr' as const, ledger: 'Output IGST', amount: money(g.igst) }]
            : [
                { side: 'Cr' as const, ledger: 'Output CGST', amount: money(g.cgst) },
                { side: 'Cr' as const, ledger: 'Output SGST', amount: money(g.sgst) },
              ]),
        ],
        notes: [...notes, 'Stock reduces from Amazon (Pan-India) store in Tranzact.'],
        bank: 'HDFC Escrow (on settlement)',
      };
    }
    if (channelId === 'amazon' && mode === 'B2B') {
      return {
        system: 'Tranzact',
        voucherType: 'Sales (Amazon-B2B)',
        billSeries: 'AMZ-B2B-YYYYMM-####',
        masterLedger: 'Sales — Amazon B2B',
        counterParty: 'Amazon Unsettled Receivable',
        gstLedgers: intraState === false ? ['Output IGST'] : ['Output CGST', 'Output SGST'],
        clearingExplanation:
          'Same clearing flow as B2C — sale parked against Amazon Unsettled Receivable until STR settles. B2B GSTIN is captured on the invoice for buyer ITC.',
        journal: [
          { side: 'Dr', ledger: 'Amazon Unsettled Receivable', amount: money(amount) },
          { side: 'Cr', ledger: 'Sales — Amazon B2B', amount: money(g.base) },
          ...(intraState === false
            ? [{ side: 'Cr' as const, ledger: 'Output IGST', amount: money(g.igst) }]
            : [
                { side: 'Cr' as const, ledger: 'Output CGST', amount: money(g.cgst) },
                { side: 'Cr' as const, ledger: 'Output SGST', amount: money(g.sgst) },
              ]),
        ],
        notes,
        bank: 'HDFC Escrow (on settlement)',
      };
    }
    if (channelId === 'shopify') {
      if (paymentMode === 'COD') {
        return {
          system: 'Tranzact',
          voucherType: 'Sales (Shopify-COD)',
          billSeries: 'SHO-COD-YYYYMM-####',
          masterLedger: 'Sales — Shopify (COD)',
          counterParty: 'Shiprocket COD Remittance',
          gstLedgers: intraState === false ? ['Output IGST'] : ['Output CGST', 'Output SGST'],
          clearingExplanation:
            'COD is collected by Shiprocket from the buyer. The receivable sits in Shiprocket COD Remittance until the weekly payout hits Central Bank. Shiprocket freight + COD fees are booked as a separate purchase/journal when the payout statement arrives.',
          journal: [
            { side: 'Dr', ledger: 'Shiprocket COD Remittance', amount: money(amount) },
            { side: 'Cr', ledger: 'Sales — Shopify (COD)', amount: money(g.base) },
            ...(intraState === false
              ? [{ side: 'Cr' as const, ledger: 'Output IGST', amount: money(g.igst) }]
              : [
                  { side: 'Cr' as const, ledger: 'Output CGST', amount: money(g.cgst) },
                  { side: 'Cr' as const, ledger: 'Output SGST', amount: money(g.sgst) },
                ]),
          ],
          notes: [...notes, 'On Shiprocket payout: Dr Central Bank, Dr Shiprocket Freight (+ Input GST), Cr Shiprocket COD Remittance.'],
          bank: 'Central Bank (on payout)',
        };
      }
      // Prepaid via Easebuzz or Snapmint
      const gateway = paymentMode === 'Credit' ? 'Snapmint Clearing' : 'Easebuzz Clearing';
      return {
        system: 'Tranzact',
        voucherType: 'Sales (Shopify-Prepaid)',
        billSeries: 'SHO-PRE-YYYYMM-####',
        masterLedger: 'Sales — Shopify (Prepaid)',
        counterParty: gateway,
        gstLedgers: intraState === false ? ['Output IGST'] : ['Output CGST', 'Output SGST'],
        clearingExplanation: `Prepaid capture sits in ${gateway} until the gateway payout reaches Central Bank. Gateway fee + TDS u/s 194-O (if applicable) is journalised on payout.`,
        journal: [
          { side: 'Dr', ledger: gateway, amount: money(amount) },
          { side: 'Cr', ledger: 'Sales — Shopify (Prepaid)', amount: money(g.base) },
          ...(intraState === false
            ? [{ side: 'Cr' as const, ledger: 'Output IGST', amount: money(g.igst) }]
            : [
                { side: 'Cr' as const, ledger: 'Output CGST', amount: money(g.cgst) },
                { side: 'Cr' as const, ledger: 'Output SGST', amount: money(g.sgst) },
              ]),
        ],
        notes,
        bank: 'Central Bank (on payout)',
      };
    }
    if (channelId === 'blinkit') {
      return {
        system: 'Tranzact',
        voucherType: 'Sales (Blinkit)',
        billSeries: 'BLK-YYYYMM-####',
        masterLedger: 'Sales — Blinkit',
        counterParty: 'Blinkit Receivable',
        gstLedgers: intraState === false ? ['Output IGST'] : ['Output CGST', 'Output SGST'],
        clearingExplanation:
          'Blinkit is a B2B buyer. Invoice raised in Tranzact, posted to Tally via plugin. Settlement is on agreed credit terms (typically 15–30 days) into Central Bank.',
        journal: [
          { side: 'Dr', ledger: 'Blinkit Receivable', amount: money(amount) },
          { side: 'Cr', ledger: 'Sales — Blinkit', amount: money(g.base) },
          ...(intraState === false
            ? [{ side: 'Cr' as const, ledger: 'Output IGST', amount: money(g.igst) }]
            : [
                { side: 'Cr' as const, ledger: 'Output CGST', amount: money(g.cgst) },
                { side: 'Cr' as const, ledger: 'Output SGST', amount: money(g.sgst) },
              ]),
        ],
        notes,
        bank: 'Central Bank',
      };
    }
    if (channelId === 'b2b-direct') {
      return {
        system: 'Tranzact',
        voucherType: 'Sales (B2B Distributor)',
        billSeries: 'B2B-YYYYMM-####',
        masterLedger: 'Sales — B2B Distributors',
        counterParty: party ? `${party} (Sundry Debtor)` : 'Sundry Debtor',
        gstLedgers: intraState === false ? ['Output IGST'] : ['Output CGST', 'Output SGST'],
        clearingExplanation:
          'Direct B2B sale against credit terms. Receipt is posted as a Receipt voucher in Tally when the payment hits Central Bank.',
        journal: [
          { side: 'Dr', ledger: party ? `${party} (Sundry Debtor)` : 'Sundry Debtor', amount: money(amount) },
          { side: 'Cr', ledger: 'Sales — B2B Distributors', amount: money(g.base) },
          ...(intraState === false
            ? [{ side: 'Cr' as const, ledger: 'Output IGST', amount: money(g.igst) }]
            : [
                { side: 'Cr' as const, ledger: 'Output CGST', amount: money(g.cgst) },
                { side: 'Cr' as const, ledger: 'Output SGST', amount: money(g.sgst) },
              ]),
        ],
        notes,
        bank: 'Central Bank',
      };
    }
  }

  // ────────────── PURCHASE ──────────────
  if (txnType === 'Purchase') {
    if (channelId === 'rm' || channelId === 'pkg') {
      const isPkg = channelId === 'pkg';
      return {
        system: 'Tranzact',
        voucherType: isPkg ? 'Purchase (Packing Material)' : 'Purchase (RM)',
        billSeries: isPkg ? 'PUR-PKG-YYYYMM-####' : 'PUR-RM-YYYYMM-####',
        masterLedger: isPkg ? 'Purchase — Packing Material' : 'Purchase — Raw Material',
        counterParty: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor',
        gstLedgers: intraState === false ? ['Input IGST'] : ['Input CGST', 'Input SGST'],
        journal: [
          { side: 'Dr', ledger: isPkg ? 'Purchase — Packing Material' : 'Purchase — Raw Material', amount: money(g.base) },
          ...(intraState === false
            ? [{ side: 'Dr' as const, ledger: 'Input IGST', amount: money(g.igst) }]
            : [
                { side: 'Dr' as const, ledger: 'Input CGST', amount: money(g.cgst) },
                { side: 'Dr' as const, ledger: 'Input SGST', amount: money(g.sgst) },
              ]),
          { side: 'Cr', ledger: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor', amount: money(amount) },
        ],
        notes: [...notes, 'Entered in Tranzact → pushed to Tally via plugin UPSERT.'],
      };
    }
  }

  // ────────────── JOB WORK ──────────────
  if (txnType === 'Job Work') {
    return {
      system: 'Tranzact',
      voucherType: 'Job Work (JW)',
      billSeries: 'JW-YYYYMM-####',
      masterLedger: 'Job Work Charges (Inward)',
      counterParty: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor',
      gstLedgers: intraState === false ? ['Input IGST'] : ['Input CGST', 'Input SGST'],
      clearingExplanation:
        'Stock goes out on a Material Out challan and comes back on Material In when processing is complete. Only the processing charge is booked as an expense here — raw material stays on books.',
      journal: [
        { side: 'Dr', ledger: 'Job Work Charges (Inward)', amount: money(g.base) },
        ...(intraState === false
          ? [{ side: 'Dr' as const, ledger: 'Input IGST', amount: money(g.igst) }]
          : [
              { side: 'Dr' as const, ledger: 'Input CGST', amount: money(g.cgst) },
              { side: 'Dr' as const, ledger: 'Input SGST', amount: money(g.sgst) },
            ]),
        { side: 'Cr', ledger: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor', amount: money(amount) },
      ],
      notes: [...notes, 'Track Material Out / Material In challans in Tranzact for stock reconciliation.'],
    };
  }

  // ────────────── CAPITAL GOODS ──────────────
  if (txnType === 'Capital Goods') {
    return {
      system: 'Tally',
      voucherType: 'Purchase (CapGoods)',
      billSeries: 'CAP-YYYYMM-####',
      masterLedger: 'Plant & Machinery / Office Equipment',
      counterParty: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor',
      gstLedgers: intraState === false ? ['Input IGST (CapGoods)'] : ['Input CGST (CapGoods)', 'Input SGST (CapGoods)'],
      clearingExplanation:
        'Capital goods are booked directly in Tally — Tranzact is not involved. ITC on capital goods is claimed in the month of capitalisation and tracked separately in the Rule 43 schedule.',
      journal: [
        { side: 'Dr', ledger: 'Plant & Machinery', amount: money(g.base) },
        ...(intraState === false
          ? [{ side: 'Dr' as const, ledger: 'Input IGST (CapGoods)', amount: money(g.igst) }]
          : [
              { side: 'Dr' as const, ledger: 'Input CGST (CapGoods)', amount: money(g.cgst) },
              { side: 'Dr' as const, ledger: 'Input SGST (CapGoods)', amount: money(g.sgst) },
            ]),
        { side: 'Cr', ledger: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor', amount: money(amount) },
      ],
      notes: [...notes, 'Start depreciation from the month of capitalisation.'],
    };
  }

  // ────────────── EXPENSE ──────────────
  if (txnType === 'Expense') {
    return {
      system: 'Tally',
      voucherType: 'Purchase (Services) / Journal',
      masterLedger: '[Expense ledger — e.g. Rent, Freight, Advertising]',
      counterParty: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor',
      gstLedgers: intraState === false ? ['Input IGST'] : ['Input CGST', 'Input SGST'],
      clearingExplanation:
        'Expenses are booked directly in Tally (not routed via Tranzact). If TDS is applicable, add a TDS credit line for the appropriate section (194C / 194J / 194-I).',
      journal: [
        { side: 'Dr', ledger: '[Expense ledger]', amount: money(g.base) },
        ...(intraState === false
          ? [{ side: 'Dr' as const, ledger: 'Input IGST', amount: money(g.igst) }]
          : [
              { side: 'Dr' as const, ledger: 'Input CGST', amount: money(g.cgst) },
              { side: 'Dr' as const, ledger: 'Input SGST', amount: money(g.sgst) },
            ]),
        { side: 'Cr', ledger: 'TDS Payable — [Section]', note: 'if applicable' },
        { side: 'Cr', ledger: party ? `${party} (Sundry Creditor)` : 'Sundry Creditor', amount: money(amount) },
      ],
      notes,
    };
  }

  // ────────────── BANKING ──────────────
  if (txnType === 'Banking') {
    const bankMap: Record<string, { ledger: string; integration: string }> = {
      icici:   { ledger: 'ICICI Bank — Current A/c',          integration: 'Live Tally integration (bank feed). Used for petty transactions.' },
      central: { ledger: 'Central Bank of India — Current A/c', integration: 'Manual Excel statement import into Tally. Daily transaction account.' },
      hdfc:    { ledger: 'HDFC Bank — Escrow A/c',            integration: 'Manual Excel statement import into Tally. Escrow for marketplace settlements.' },
    };
    const bank = bankMap[channelId];
    return {
      system: 'Tally',
      voucherType: 'Receipt / Payment / Contra',
      masterLedger: bank?.ledger || 'Bank Account',
      counterParty: party,
      gstLedgers: [],
      clearingExplanation: bank?.integration,
      journal: [
        { side: 'Dr', ledger: bank?.ledger || 'Bank', note: 'for inflow; flip for outflow' },
        { side: 'Cr', ledger: party ? `${party} / Clearing` : '[Counter party / Clearing]' },
      ],
      notes,
      bank: bank?.ledger,
    };
  }

  // Fallback
  return {
    system: 'Tally',
    voucherType: 'Journal',
    masterLedger: '[Select a channel]',
    gstLedgers: [],
    journal: [],
    notes: ['No specific rule matched — please review manually or extend the rules.'],
  };
}
