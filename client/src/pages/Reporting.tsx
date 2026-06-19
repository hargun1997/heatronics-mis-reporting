import { NavCard } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';

const iconMIS = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10" />
  </svg>
);
const iconTrends = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);
const iconBS = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

export function Reporting() {
  return (
    <>
      <PageHeader title="Reporting" accent="brand" icon={iconMIS} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavCard
            to="/reporting/mis"
            title="MIS Reporting"
            description="Investor-grade deck — channel mix, growth (MoM / QoQ / YoY / CAGR) and margin trends across month, quarter and fiscal year."
            icon={iconMIS}
            accent="brand"
            badge="New"
          />
          <NavCard
            to="/reporting/mis"
            title="Channel Mix & Trends"
            description="How D2C, Amazon, Blinkit, OEM and Offline revenue shares shift month-wise, quarterly and yearly."
            icon={iconTrends}
            accent="sky"
          />
          <NavCard
            to="/reporting/mis"
            title="Profitability & P&L"
            description="Gross margin → CM1/CM2/CM3 → EBITDA → Net income, with a net-revenue-to-net-income bridge."
            icon={iconBS}
            accent="violet"
          />
        </div>
      </div>
    </>
  );
}
