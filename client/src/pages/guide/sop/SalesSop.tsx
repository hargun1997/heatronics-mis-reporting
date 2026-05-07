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
        'Pan-India store — B2C and B2B (with buyer GSTIN). Settles to HDFC Escrow via Amazon Unsettled Receivable.',
    },
    {
      to: '/guide/sop/sales/shopify',
      title: 'Shopify',
      description:
        'D2C orders — prepaid via Easebuzz / Snapmint, COD via Shiprocket. Settles to Central Bank or Easebuzz Wire.',
    },
    {
      to: '/guide/sop/sales/blinkit',
      title: 'Blinkit',
      description:
        'B2B quick-commerce buyer. PO + GRN matched, then 15–30 day payout into Central Bank.',
    },
    {
      to: '/guide/sop/sales/b2b',
      title: 'B2B Distributors',
      description:
        'Direct distributors, OEM and offline dealers. Sale on Sundry Debtor; Receipt in Central Bank on wire / cheque.',
    },
  ];
  return (
    <>
      <PageHeader
        title="Sales SOP (Tranzact)"
        description="One sub-SOP per sales channel. All four run on Tranzact and push to Tally via the plugin — the channel-specific bits are the bill series, sales ledger, clearing ledger and settlement bank."
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
