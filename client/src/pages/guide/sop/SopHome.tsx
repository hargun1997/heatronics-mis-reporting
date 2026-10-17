import { NavCard } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';

const ic = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

type Accent = 'brand' | 'emerald' | 'violet' | 'amber' | 'sky' | 'rose';
interface SopItem { to: string; title: string; description: string; accent: Accent }
interface SopGroup { heading: string; items: SopItem[] }

const GROUPS: SopGroup[] = [
  {
    heading: 'Sales channels',
    items: [
      { to: '/guide/sop/sales', title: 'Sales — overview', description: 'How each channel reaches Tally: plugin (Amazon, Shopify) vs Tranzact (B2B, Blinkit).', accent: 'brand' },
      { to: '/guide/sop/sales/amazon', title: 'Amazon', description: 'MTR invoices + the Seller A/c → Settlement → Bank chain + the monthly expense JV.', accent: 'brand' },
      { to: '/guide/sop/sales/shopify', title: 'Shopify (D2C)', description: 'Daily plugin pull; prepaid vs COD receivable cleared by bill reference.', accent: 'brand' },
      { to: '/guide/sop/sales/blinkit', title: 'Blinkit', description: 'Quick-commerce B2B via the Blinkit Sales Series in Tranzact.', accent: 'brand' },
      { to: '/guide/sop/sales/b2b', title: 'B2B, OEM & Offline', description: 'Everything invoiced in Tranzact; ledger by document series + TDS split.', accent: 'brand' },
    ],
  },
  {
    heading: 'Collections & settlements',
    items: [
      { to: '/guide/sop/collections/easebuzz', title: 'Easebuzz payouts', description: 'Daily option 3 — clears Shopify Prepaid Receivable by bank_transaction_id.', accent: 'sky' },
      { to: '/guide/sop/collections/snapmint', title: 'Snapmint settlements', description: 'Monthly option 5 — EMI/BNPL prepaid; report by email.', accent: 'sky' },
      { to: '/guide/sop/collections/shiprocket', title: 'Shiprocket COD', description: 'Monthly option 5 — COD remittance + freight invoices, tied to Total Deductions.', accent: 'sky' },
    ],
  },
  {
    heading: 'Purchases & expenses',
    items: [
      { to: '/guide/sop/purchase', title: 'Purchases (Tranzact)', description: 'RM Purchases / Job Work Charges, input GST, GSTR-2B match.', accent: 'emerald' },
      { to: '/guide/sop/expense', title: 'Platform invoices (Tally)', description: 'Fee & ad invoices as Purchase-Expense against each platform’s control ledger.', accent: 'amber' },
      { to: '/guide/sop/job-work', title: 'Job work & service bills', description: 'Service bills → Job Work Charges with 2% TDS split in Tranzact.', accent: 'rose' },
      { to: '/guide/sop/capital-goods', title: 'Capital goods', description: 'Capitalisation, ITC and monthly depreciation in Tally.', accent: 'violet' },
    ],
  },
  {
    heading: 'Banking',
    items: [
      { to: '/guide/sop/banking', title: 'Banking — overview', description: 'Month-end import + reconcile; how credits route to the collection ledgers.', accent: 'sky' },
      { to: '/guide/sop/banking/central-cc', title: 'Central Bank CC', description: 'The operating OD account — every channel payout lands here.', accent: 'sky' },
      { to: '/guide/sop/banking/icici', title: 'ICICI (CC)', description: 'Payments account; likely OD, regroup pending.', accent: 'sky' },
      { to: '/guide/sop/banking/hdfc', title: 'HDFC', description: 'Payments account; monthly import + BRS.', accent: 'sky' },
      { to: '/guide/sop/banking/easebuzz-wire', title: 'Easebuzz Wire', description: 'Low-use wire account — not the clearing ledger.', accent: 'sky' },
    ],
  },
  {
    heading: 'Tax — GST & TDS',
    items: [
      { to: '/guide/sop/tax/gst', title: 'GST (GSTR-1 / 3B / 2B)', description: 'Five registrations, inverted duty, output families, set-off.', accent: 'amber' },
      { to: '/guide/sop/tax/tds', title: 'TDS & TCS', description: '194C split, Amazon 194-O / TCS, 26Q, ads-TDS refund.', accent: 'violet' },
    ],
  },
  {
    heading: 'Close',
    items: [
      { to: '/guide/sop/close', title: 'Month-end close', description: 'Control-ledger tie-outs, bank BRS, statutory dates, send the MIS.', accent: 'emerald' },
    ],
  },
  {
    heading: 'Reference',
    items: [
      { to: '/guide/ledgers', title: 'Ledger & Voucher Tree', description: 'The chart of accounts: control ledgers and the voucher types / bill series that post to each one.', accent: 'brand' },
      { to: '/guide/architecture', title: 'System Architecture', description: 'How Tranzact, Tally, the Tally plugin, the channels and the banks connect.', accent: 'brand' },
    ],
  },
];

export function SopHome() {
  return (
    <>
      <PageHeader
        title="Accounting SOPs"
        description="The full operating handbook, as step-by-step SOPs: how each system creates an entry, the journal it posts, the control ledger it lands in, and how it reconciles. Use the chat (bottom-right) to ask for clarifications."
        accent="violet"
        icon={ic}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {GROUPS.map((g) => (
          <div key={g.heading}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{g.heading}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {g.items.map((s) => (
                <NavCard key={s.to} to={s.to} title={s.title} description={s.description} icon={ic} accent={s.accent} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
