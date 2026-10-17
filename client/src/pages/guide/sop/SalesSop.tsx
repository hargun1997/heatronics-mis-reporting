import { NavCard } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';

const ic = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

export function SalesSop() {
  const channels = [
    {
      to: '/guide/sop/sales/amazon',
      title: 'Amazon',
      description:
        'Amazon issues the invoices (MTR). The plugin (option 2) imports the four monthly reports and posts the Seller A/c → Settlement → Bank chain, per GSTIN.',
    },
    {
      to: '/guide/sop/sales/shopify',
      title: 'Shopify (D2C)',
      description:
        'Plugin pulls orders daily (option 3). One sale → Shopify Prepaid or COD Receivable, cleared by the matching payout. GST 5%, price-inclusive.',
    },
    {
      to: '/guide/sop/sales/blinkit',
      title: 'Blinkit',
      description:
        'Quick-commerce B2B. Raised in Tranzact under the Blinkit Sales Series and pushed with the Chrome plugin.',
    },
    {
      to: '/guide/sop/sales/b2b',
      title: 'B2B, OEM & Offline',
      description:
        'Everything Heatronics invoices itself (OEM, GT, MT, Physio, B2C offline, internal transfer) — raised in Tranzact, ledger chosen by document series.',
    },
  ];
  return (
    <>
      <PageHeader
        title="Sales SOPs"
        description="Two routes into Tally: Amazon and Shopify are created by the eCom2Tally plugin from reports / API; B2B, OEM, offline and Blinkit are raised in Tranzact and pushed by the Chrome plugin. The collection & settlement SOPs cover how each payout clears its receivable."
        accent="brand"
        icon={ic}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {channels.map((c) => (
            <NavCard key={c.to} to={c.to} title={c.title} description={c.description} icon={ic} accent="brand" />
          ))}
        </div>
      </div>
    </>
  );
}
