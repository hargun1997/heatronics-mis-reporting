import { NavCard } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';

const ic = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

export function SopHome() {
  const sops = [
    {
      to: '/guide/sop/sales',
      title: 'Sales SOP',
      description: 'Amazon, Shopify, Blinkit and B2B distributor flows — voucher types, clearing ledgers and settlement journals.',
      accent: 'brand' as const,
    },
    {
      to: '/guide/sop/purchase',
      title: 'Purchase SOP',
      description: 'Raw material and packing purchases in Tranzact, with ITC treatment and party master setup.',
      accent: 'emerald' as const,
    },
    {
      to: '/guide/sop/expense',
      title: 'Expense SOP',
      description: 'Booking operating expenses directly in Tally — rent, utilities, freight, advertising, professional fees.',
      accent: 'amber' as const,
    },
    {
      to: '/guide/sop/banking',
      title: 'Banking SOP',
      description: 'Daily bank entries across ICICI, Central and HDFC — live feed vs manual import — plus BRS workflow.',
      accent: 'sky' as const,
    },
    {
      to: '/guide/sop/capital-goods',
      title: 'Capital Goods SOP',
      description: 'Capitalisation of plant, computers and furniture — ITC rules and monthly depreciation journal.',
      accent: 'violet' as const,
    },
    {
      to: '/guide/sop/job-work',
      title: 'Job Work SOP',
      description: 'Material Out / Material In challans, processing charge booking, and ITC-04 tracking.',
      accent: 'rose' as const,
    },
  ];
  return (
    <>
      <PageHeader title="Accounting SOPs" accent="violet" icon={ic} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sops.map((s) => (
            <NavCard key={s.to} to={s.to} title={s.title} description={s.description} icon={ic} accent={s.accent} />
          ))}
        </div>
      </div>
    </>
  );
}
