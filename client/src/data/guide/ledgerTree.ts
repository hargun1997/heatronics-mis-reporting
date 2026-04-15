/**
 * Ledger & Voucher Type tree for Heatronics.
 *
 * Structure follows Tally conventions:
 *   Primary Group -> Sub-Group -> Ledger -> voucher types that typically post to it.
 *
 * The tree is intentionally written as plain data so it can be rendered as
 * an expandable hierarchy in the Guide, and extended as new masters are added.
 */

export interface LedgerExample {
  scenario: string;
  voucherType: string;
  dr: string;
  cr: string;
  note?: string;
}

export interface LedgerNode {
  name: string;
  // Where the ledger is typically maintained (Tally vs Tranzact)
  source?: 'Tally' | 'Tranzact' | 'Both';
  gst?: 'Taxable' | 'Exempt' | 'Nil-Rated' | 'Out of Scope' | 'RCM' | 'Mixed';
  voucherTypes?: string[];
  purpose?: string;
  examples?: LedgerExample[];
}

export interface LedgerSubGroup {
  name: string;
  description?: string;
  ledgers: LedgerNode[];
}

export interface LedgerGroup {
  name: string;
  description?: string;
  subGroups: LedgerSubGroup[];
}

export const LEDGER_TREE: LedgerGroup[] = [
  {
    name: 'Sales Accounts',
    description:
      'Channel-wise sales ledgers. Different bill series in Tranzact / Tally plugin map to different sales ledgers so GST and commission treatment can be applied consistently.',
    subGroups: [
      {
        name: 'B2C Sales',
        ledgers: [
          {
            name: 'Sales — Amazon B2C',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Sales (Amazon-B2C Series)'],
            purpose: 'Amazon MTR B2C invoices synced via plugin. Bill series: AMZ-B2C-YYYYMM-####',
            examples: [
              {
                scenario: 'Amazon B2C sale (intra-state) ₹1,180 incl. 18% GST',
                voucherType: 'Sales (Amazon-B2C)',
                dr: 'Amazon Unsettled Receivable ₹1,180',
                cr: 'Sales — Amazon B2C ₹1,000 · CGST ₹90 · SGST ₹90',
                note: 'Settlement offsets Unsettled Receivable when STR is received.',
              },
            ],
          },
          {
            name: 'Sales — Shopify (Prepaid)',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Sales (Shopify-Prepaid Series)'],
            purpose: 'Shopify prepaid orders (Easebuzz / Snapmint captured) booked against Easebuzz/Snapmint receivable.',
          },
          {
            name: 'Sales — Shopify (COD)',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Sales (Shopify-COD Series)'],
            purpose: 'Shopify COD orders — receivable parked against Shiprocket COD Remittance until payout.',
          },
        ],
      },
      {
        name: 'B2B Sales',
        ledgers: [
          {
            name: 'Sales — Blinkit',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Sales (Blinkit Series)'],
            purpose: 'B2B sales to Blinkit. Invoices originate in Tranzact and push to Tally via plugin.',
          },
          {
            name: 'Sales — B2B Distributors',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Sales (B2B-GEN Series)'],
            purpose: 'Direct distributor and retailer sales raised from Tranzact.',
          },
        ],
      },
    ],
  },
  {
    name: 'Purchase Accounts',
    description:
      'Raw material, packaging and job-work purchases. Entered in Tranzact and pushed to Tally via UPSERT using the plugin.',
    subGroups: [
      {
        name: 'Raw Materials',
        ledgers: [
          {
            name: 'Purchase — Raw Material (GST Input)',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Purchase (RM Series)'],
            examples: [
              {
                scenario: 'RM purchase ₹11,800 incl. 18% GST (intra-state)',
                voucherType: 'Purchase (RM)',
                dr: 'Purchase — RM ₹10,000 · Input CGST ₹900 · Input SGST ₹900',
                cr: 'Sundry Creditors — RM Vendor ₹11,800',
              },
            ],
          },
          {
            name: 'Purchase — Packing Material',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Purchase (PKG Series)'],
          },
        ],
      },
      {
        name: 'Job Work',
        ledgers: [
          {
            name: 'Job Work Charges (Inward)',
            source: 'Tranzact',
            gst: 'Taxable',
            voucherTypes: ['Job Work (JW Series)'],
            purpose: 'Processing charges billed by job workers. Stock movement tracked via Material Out / Material In in Tranzact.',
          },
        ],
      },
    ],
  },
  {
    name: 'Indirect Expenses',
    description: 'Operating expenses booked directly in Tally (not routed through Tranzact).',
    subGroups: [
      {
        name: 'Sales & Marketing',
        ledgers: [
          {
            name: 'Amazon Commission',
            source: 'Tally',
            gst: 'Taxable',
            voucherTypes: ['Journal (Amazon Settlement)'],
            purpose: 'Commission deducted by Amazon in settlement statements.',
          },
          {
            name: 'Shiprocket — Freight Charges',
            source: 'Tally',
            gst: 'Taxable',
            voucherTypes: ['Purchase (Services)'],
          },
          {
            name: 'Digital Advertising',
            source: 'Tally',
            gst: 'Taxable',
            voucherTypes: ['Purchase (Services)'],
          },
        ],
      },
      {
        name: 'Admin & Office',
        ledgers: [
          {
            name: 'Rent',
            source: 'Tally',
            gst: 'Taxable',
            voucherTypes: ['Journal'],
            purpose: 'Monthly rent, TDS u/s 194-I deducted on payment.',
          },
          {
            name: 'Electricity Charges',
            source: 'Tally',
            gst: 'Exempt',
            voucherTypes: ['Payment', 'Journal'],
          },
          {
            name: 'Internet & Telephone',
            source: 'Tally',
            gst: 'Taxable',
            voucherTypes: ['Purchase (Services)'],
          },
        ],
      },
    ],
  },
  {
    name: 'Bank Accounts',
    description: 'Bank ledgers. Different banks have different integration modes with Tally.',
    subGroups: [
      {
        name: 'Current Accounts',
        ledgers: [
          {
            name: 'ICICI Bank — Current A/c',
            source: 'Tally',
            voucherTypes: ['Receipt', 'Payment', 'Contra'],
            purpose: 'Direct Tally integration (live bank feed). Used for petty / day-to-day transactions.',
          },
          {
            name: 'Central Bank of India — Current A/c',
            source: 'Tally',
            voucherTypes: ['Receipt', 'Payment', 'Contra'],
            purpose: 'Daily transaction account. Statements imported manually via Excel in Tally.',
          },
          {
            name: 'HDFC Bank — Escrow A/c',
            source: 'Tally',
            voucherTypes: ['Receipt', 'Payment'],
            purpose: 'Escrow account for marketplace settlements. Manual statement import.',
          },
        ],
      },
    ],
  },
  {
    name: 'Loans & Advances (Asset)',
    description: 'Receivables from marketplaces and payment gateways sitting between sale and settlement.',
    subGroups: [
      {
        name: 'Channel Clearing / Unsettled',
        ledgers: [
          {
            name: 'Amazon Unsettled Receivable',
            source: 'Both',
            voucherTypes: ['Sales', 'Journal (Settlement)'],
            purpose:
              'Holds sale value until Amazon STR / settlement is received. Netted against commission, fees and settlement credit.',
          },
          {
            name: 'Easebuzz Clearing',
            source: 'Both',
            voucherTypes: ['Sales', 'Receipt'],
            purpose: 'Prepaid Shopify payments sitting with Easebuzz until T+2 payout to Central Bank.',
          },
          {
            name: 'Snapmint Clearing',
            source: 'Both',
            voucherTypes: ['Sales', 'Receipt'],
            purpose: 'EMI / BNPL captures — cleared on Snapmint payout.',
          },
          {
            name: 'Shiprocket COD Remittance',
            source: 'Both',
            voucherTypes: ['Sales', 'Receipt'],
            purpose: 'COD collected by Shiprocket for Shopify & D2C; remitted weekly to Central Bank.',
          },
        ],
      },
    ],
  },
  {
    name: 'Duties & Taxes',
    subGroups: [
      {
        name: 'GST',
        ledgers: [
          { name: 'Output CGST', source: 'Tally', gst: 'Taxable', voucherTypes: ['Sales'] },
          { name: 'Output SGST', source: 'Tally', gst: 'Taxable', voucherTypes: ['Sales'] },
          { name: 'Output IGST', source: 'Tally', gst: 'Taxable', voucherTypes: ['Sales'] },
          { name: 'Input CGST', source: 'Tally', gst: 'Taxable', voucherTypes: ['Purchase'] },
          { name: 'Input SGST', source: 'Tally', gst: 'Taxable', voucherTypes: ['Purchase'] },
          { name: 'Input IGST', source: 'Tally', gst: 'Taxable', voucherTypes: ['Purchase'] },
        ],
      },
      {
        name: 'TDS',
        ledgers: [
          {
            name: 'TDS Payable — 194C',
            source: 'Tally',
            voucherTypes: ['Journal', 'Payment'],
            purpose: 'Contractor payments (Shiprocket job work, transport).',
          },
          {
            name: 'TDS Payable — 194J',
            source: 'Tally',
            voucherTypes: ['Journal'],
            purpose: 'Professional fees, consultancy.',
          },
          {
            name: 'TDS Payable — 194-I',
            source: 'Tally',
            voucherTypes: ['Journal'],
            purpose: 'Rent.',
          },
        ],
      },
    ],
  },
  {
    name: 'Fixed Assets',
    description: 'Capital goods — plant & machinery, furniture, computers. Depreciation booked monthly via journal.',
    subGroups: [
      {
        name: 'Plant & Machinery',
        ledgers: [
          {
            name: 'Plant & Machinery',
            source: 'Tally',
            gst: 'Taxable',
            voucherTypes: ['Purchase (CapGoods)'],
            purpose: 'ITC on capital goods eligible subject to Rule 43.',
          },
          {
            name: 'Accumulated Depreciation — P&M',
            source: 'Tally',
            voucherTypes: ['Journal (Depreciation)'],
          },
        ],
      },
      {
        name: 'Office Equipment',
        ledgers: [
          { name: 'Computers & Laptops', source: 'Tally', voucherTypes: ['Purchase (CapGoods)'] },
          { name: 'Furniture & Fixtures', source: 'Tally', voucherTypes: ['Purchase (CapGoods)'] },
        ],
      },
    ],
  },
];

/** Voucher-type master — maps bill series and usage across Tranzact & Tally. */
export interface VoucherType {
  name: string;
  system: 'Tally' | 'Tranzact';
  billSeries?: string;
  usage: string;
  mappedLedgers: string[];
}

export const VOUCHER_TYPES: VoucherType[] = [
  {
    name: 'Sales (Amazon-B2C)',
    system: 'Tranzact',
    billSeries: 'AMZ-B2C-YYYYMM-####',
    usage: 'Amazon B2C MTR sales synced from plugin.',
    mappedLedgers: ['Sales — Amazon B2C', 'Amazon Unsettled Receivable', 'Output CGST/SGST/IGST'],
  },
  {
    name: 'Sales (Amazon-B2B)',
    system: 'Tranzact',
    billSeries: 'AMZ-B2B-YYYYMM-####',
    usage: 'Amazon Business B2B invoices.',
    mappedLedgers: ['Sales — Amazon B2B', 'Amazon Unsettled Receivable', 'Output CGST/SGST/IGST'],
  },
  {
    name: 'Sales (Shopify-Prepaid)',
    system: 'Tranzact',
    billSeries: 'SHO-PRE-YYYYMM-####',
    usage: 'Shopify prepaid orders (Easebuzz/Snapmint captured).',
    mappedLedgers: ['Sales — Shopify (Prepaid)', 'Easebuzz Clearing', 'Snapmint Clearing'],
  },
  {
    name: 'Sales (Shopify-COD)',
    system: 'Tranzact',
    billSeries: 'SHO-COD-YYYYMM-####',
    usage: 'Shopify COD orders dispatched via Shiprocket.',
    mappedLedgers: ['Sales — Shopify (COD)', 'Shiprocket COD Remittance'],
  },
  {
    name: 'Sales (Blinkit)',
    system: 'Tranzact',
    billSeries: 'BLK-YYYYMM-####',
    usage: 'B2B sales to Blinkit.',
    mappedLedgers: ['Sales — Blinkit', 'Blinkit Receivable'],
  },
  {
    name: 'Purchase (RM)',
    system: 'Tranzact',
    billSeries: 'PUR-RM-YYYYMM-####',
    usage: 'Raw material purchases.',
    mappedLedgers: ['Purchase — Raw Material', 'Input CGST/SGST/IGST', 'Sundry Creditors'],
  },
  {
    name: 'Job Work (JW)',
    system: 'Tranzact',
    billSeries: 'JW-YYYYMM-####',
    usage: 'Job-work charges billed by processors.',
    mappedLedgers: ['Job Work Charges', 'Input CGST/SGST/IGST'],
  },
  {
    name: 'Purchase (CapGoods)',
    system: 'Tally',
    billSeries: 'CAP-YYYYMM-####',
    usage: 'Capital goods purchases.',
    mappedLedgers: ['Fixed Assets', 'Input CGST/SGST/IGST (CapGoods)'],
  },
  {
    name: 'Journal (Settlement)',
    system: 'Tally',
    usage: 'Marketplace settlement journal: commission, fees, TCS/TDS, reserves.',
    mappedLedgers: [
      'Amazon Unsettled Receivable',
      'Amazon Commission',
      'Shiprocket — Freight Charges',
      'Output/Input GST adjustments',
      'HDFC/Central Bank',
    ],
  },
  {
    name: 'Journal (Depreciation)',
    system: 'Tally',
    usage: 'Monthly depreciation provision.',
    mappedLedgers: ['Depreciation Expense', 'Accumulated Depreciation'],
  },
  {
    name: 'Payment',
    system: 'Tally',
    usage: 'Bank payments — ICICI feed is live; Central & HDFC via manual import.',
    mappedLedgers: ['Bank accounts', 'Expense / Creditor ledgers'],
  },
  {
    name: 'Receipt',
    system: 'Tally',
    usage: 'Channel payouts and customer receipts.',
    mappedLedgers: ['Bank accounts', 'Channel clearing ledgers'],
  },
  {
    name: 'Contra',
    system: 'Tally',
    usage: 'Inter-bank / cash transfers.',
    mappedLedgers: ['ICICI', 'Central Bank', 'HDFC', 'Cash'],
  },
];
