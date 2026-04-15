import { SopLayout, SopSpec } from '../../../components/ui/SopLayout';

const spec: SopSpec = {
  title: 'Capital Goods SOP',
  description:
    'Booking and depreciating capital assets — plant & machinery, computers, furniture. Handled directly in Tally (not Tranzact). ITC on capital goods follows Rule 43.',
  accent: 'violet',
  operateIn: 'Tally',
  voucherTypes: [
    { name: 'Purchase (CapGoods)', billSeries: 'CAP-YYYYMM-####' },
    { name: 'Journal (Depreciation)' },
  ],
  ledgerMapping: [
    { role: 'Asset ledger', ledger: 'Plant & Machinery / Computers / Furniture & Fixtures' },
    { role: 'Input GST (capitalised)', ledger: 'Input CGST (CapGoods) + Input SGST (CapGoods) OR Input IGST (CapGoods)' },
    { role: 'Depreciation expense', ledger: 'Depreciation Expense (Indirect Expense)' },
    { role: 'Accumulated depreciation', ledger: 'Accumulated Depreciation — [asset class]' },
  ],
  steps: [
    { title: 'Book the purchase invoice in Tally', body: 'Use the CapGoods voucher series. Attach vendor invoice + delivery challan.' },
    { title: 'Claim ITC correctly', body: 'Capital goods ITC is eligible in full in the month of capitalisation. If the asset is used for both taxable & exempt supplies, apply Rule 43 reversal proportion.' },
    { title: 'Capitalise on commissioning', body: 'If the asset takes time to install, park it under Capital Work-in-Progress. On commissioning, journal-transfer from CWIP to the asset ledger.' },
    { title: 'Record in the Fixed Asset Register', body: 'Record asset tag, purchase date, capitalisation date, useful life & depreciation rate.' },
    { title: 'Book monthly depreciation', body: 'Run the depreciation journal at month-end: Dr Depreciation Expense, Cr Accumulated Depreciation.' },
  ],
  examples: [
    {
      title: 'Plant & Machinery · ₹590,000 @ 18% GST',
      scenario: 'New packaging line purchased from a Pune vendor (intra-state).',
      voucherType: 'Purchase (CapGoods)',
      journal: [
        { side: 'Dr', ledger: 'Plant & Machinery', amount: '₹500,000.00' },
        { side: 'Dr', ledger: 'Input CGST (CapGoods)', amount: '₹45,000.00' },
        { side: 'Dr', ledger: 'Input SGST (CapGoods)', amount: '₹45,000.00' },
        { side: 'Cr', ledger: 'XYZ Machines Pvt Ltd', amount: '₹590,000.00' },
      ],
    },
    {
      title: 'Monthly depreciation — SLM, 15-year life',
      scenario: 'Plant & Machinery ₹500,000, salvage ₹50,000, SLM over 15 yrs → monthly dep. ₹2,500.',
      voucherType: 'Journal (Depreciation)',
      journal: [
        { side: 'Dr', ledger: 'Depreciation Expense', amount: '₹2,500.00' },
        { side: 'Cr', ledger: 'Accumulated Depreciation — Plant & Machinery', amount: '₹2,500.00' },
      ],
    },
    {
      title: 'Laptop purchase · ₹59,000 @ 18% IGST (inter-state)',
      scenario: 'MacBook purchased from a Bengaluru vendor.',
      voucherType: 'Purchase (CapGoods)',
      journal: [
        { side: 'Dr', ledger: 'Computers & Laptops', amount: '₹50,000.00' },
        { side: 'Dr', ledger: 'Input IGST (CapGoods)', amount: '₹9,000.00' },
        { side: 'Cr', ledger: 'Apple India Pvt Ltd', amount: '₹59,000.00' },
      ],
    },
  ],
  gotchas: [
    'Do NOT route capital goods through Tranzact — the plugin is not configured to post to Fixed Asset ledgers.',
    'If the asset is used partly for exempt supplies, compute common-credit reversal as per Rule 43 monthly.',
    'Disposals and scrap need a separate journal — not a credit note.',
  ],
};

export function CapitalGoodsSop() {
  return <SopLayout spec={spec} />;
}
