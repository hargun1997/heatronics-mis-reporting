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
      <PageHeader
        title="Reporting"
        description="Generate monthly MIS, compare trends across months, and export clean decks for management review."
        accent="brand"
        icon={iconMIS}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavCard
            to="/mis-tracking"
            title="MIS Reporting"
            description="Upload sales register, balance sheet, P&L and purchase data — generate a classified monthly MIS."
            icon={iconMIS}
            accent="brand"
            badge="Core"
          />
          <NavCard
            to="/mis-tracking?view=trends"
            title="Monthly Trends"
            description="Compare month-over-month movement across revenue, COGS, expenses and cash flow."
            icon={iconTrends}
            accent="sky"
          />
          <NavCard
            to="/mis-tracking?view=fy"
            title="Financial Year View"
            description="Full-year aggregated P&L with drill-down into channel and state splits."
            icon={iconBS}
            accent="violet"
          />
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">What goes into the MIS?</h3>
          <p className="mt-1 text-xs text-slate-500">
            The monthly report pulls together transactions from Tally + Tranzact and classifies them into heads defined by the finance team.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
              <span><span className="font-medium">Sales register</span> — channel-wise sales from Amazon, Shopify, Blinkit, B2B.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span><span className="font-medium">Purchase / Job Work</span> — RM purchases and job work entries from Tranzact.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
              <span><span className="font-medium">Balance Sheet</span> — opening/closing inventory, debtors, creditors and cash balances.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              <span><span className="font-medium">P&L</span> — direct and indirect expenses booked in Tally.</span>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
