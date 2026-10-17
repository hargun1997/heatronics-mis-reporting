import { NavCard } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';

// Source of truth: Accounts Handbook §S6 / §c9 (Banks).
const ic = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18" />
  </svg>
);

export function BankingSop() {
  const banks = [
    {
      to: '/guide/sop/banking/central-cc',
      title: 'Central Bank CC (operating)',
      description:
        'Cash Credit Limit - [Central Bank] — the operating OD account. Every channel payout (Amazon, Easebuzz, Snapmint, Shiprocket) lands here. File needs headings on row 14.',
    },
    {
      to: '/guide/sop/banking/icici',
      title: 'ICICI Bank A/C - CC',
      description:
        'Payments account, net credits ₹1.22 Cr — likely overdrawn, so it should be regrouped to Bank OD. Imported and reconciled monthly.',
    },
    {
      to: '/guide/sop/banking/hdfc',
      title: 'HDFC Bank A/C',
      description:
        'Payments account. Imported and reconciled monthly like the others.',
    },
    {
      to: '/guide/sop/banking/easebuzz-wire',
      title: 'Easebuzz Wire A/C',
      description:
        'A low-use wire bank account (≈ ₹0.10 L) — distinct from the Easebuzz Collection A/c clearing ledger.',
    },
  ];
  return (
    <>
      <PageHeader
        title="Banking SOP (Tally)"
        description="Bank statements are imported at month end (File Manager → Bank Statement New → Tally Banking) and reconciled. Each line matches an existing voucher or creates a Receipt / Payment. Credits route: Easebuzz / Snapmint / Shiprocket → their Collection ledger; Amazon → Amazon Bank; suppliers → the supplier. Anything unknown is named to Hargun — never parked in Suspense."
        accent="sky"
        icon={ic}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banks.map((b) => (
            <NavCard key={b.to} to={b.to} title={b.title} description={b.description} icon={ic} accent="sky" />
          ))}
        </div>
      </div>
    </>
  );
}
