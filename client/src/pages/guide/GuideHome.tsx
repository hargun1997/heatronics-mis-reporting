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
const iconBook = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);

export function GuideHome() {
  return (
    <>
      <PageHeader
        title="Guide"
        description="The Accounting SOPs are the full operating handbook as step-by-step procedures; the reference pages below give the ledger tree and the system architecture behind them."
        accent="violet"
        icon={iconSop}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {/* The SOPs are the single home for how the books are built & operated. */}
        <NavCard
          to="/guide/sop"
          title="Accounting SOPs"
          description="The complete handbook as SOPs: every channel, collection, tax and close procedure — the journal each posts, the control ledger it lands in, and how it reconciles. Includes a chat to ask clarifications."
          icon={iconBook}
          accent="brand"
          badge="Start here"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavCard
            to="/guide/sop"
            title="All SOPs"
            description="Sales, collections & settlements, purchases & expenses, banking, GST & TDS, and the month-end close."
            icon={iconSop}
            accent="violet"
          />
          <NavCard
            to="/guide/ledgers"
            title="Ledger & Voucher Tree"
            description="Hierarchy of ledgers and the voucher types / bill series that post to each one."
            icon={iconLedger}
            accent="brand"
          />
          <NavCard
            to="/guide/architecture"
            title="System Architecture"
            description="How Tranzact, Tally, the Tally Plugin, channels and banks connect."
            icon={iconArch}
            accent="brand"
          />
        </div>
      </div>
    </>
  );
}
