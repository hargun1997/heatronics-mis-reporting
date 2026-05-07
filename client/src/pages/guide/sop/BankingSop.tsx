import { NavCard } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';

const ic = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18" />
  </svg>
);

export function BankingSop() {
  const banks = [
    {
      to: '/guide/sop/banking/easebuzz-wire',
      title: 'Easebuzz Wire',
      description:
        'Settlement rail for Shopify prepaid (Easebuzz / Snapmint). Daily Receipt + fee Journal in Tally.',
    },
    {
      to: '/guide/sop/banking/hdfc',
      title: 'HDFC Escrow',
      description:
        'Marketplace payouts (Amazon, Blinkit, Shiprocket COD). Manual Excel import + Settlement Journals in Tally.',
    },
    {
      to: '/guide/sop/banking/icici',
      title: 'ICICI',
      description:
        'Live Tally bank-feed for petty payments / receipts. Operator just reviews and tags counter-parties.',
    },
    {
      to: '/guide/sop/banking/central-cc',
      title: 'Central Bank CC',
      description:
        'Primary operating account — vendor payments, salary, GST / TDS payouts. Manual Excel import in Tally.',
    },
  ];
  return (
    <>
      <PageHeader
        title="Banking SOP (Tally)"
        description="One sub-SOP per bank. Each spells out how that account is fed in Tally, the voucher types used, and the typical journal entries."
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
