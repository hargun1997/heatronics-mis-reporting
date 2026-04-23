import { NavCard } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

const iconArch = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);
const iconSop = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);
const iconLedger = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
  </svg>
);

export function GuidesHome() {
  return (
    <>
      <PageHeader
        title="Guides"
        description="How Heatronics accounting systems work — architecture, standard operating procedures, and ledger references."
        accent="violet"
        icon={iconSop}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NavCard
            to="/guides/architecture"
            title="System Architecture"
            description="How Tranzact, Tally, channels, and banks connect."
            icon={iconArch}
            accent="brand"
          />
          <NavCard
            to="/guides/sop"
            title="Accounting SOPs"
            description="Sales, Purchase, Expense, Banking, Capital Goods, Job Work."
            icon={iconSop}
            accent="violet"
          />
          <NavCard
            to="/guides/ledgers"
            title="Ledger & Voucher Tree"
            description="Full hierarchy of ledgers with voucher types and examples."
            icon={iconLedger}
            accent="emerald"
          />
        </div>
      </div>
    </>
  );
}
