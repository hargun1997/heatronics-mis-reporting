import { Link } from 'react-router-dom';
import { NavCard, Pill } from '../components/ui/Card';

const iconReporting = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const iconTracker = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const iconGuide = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

export function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Welcome */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-3 border border-brand-100">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
          Heatronics · Finance & Accounting
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Your accounting command center
        </h1>
        <p className="mt-2 text-slate-600 text-sm max-w-xl mx-auto">
          Report the numbers, track your monthly close, and follow clear SOPs for every booking — all in one place.
        </p>
      </div>

      {/* Three Primary Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <NavCard
          to="/reporting"
          title="Reporting"
          description="Generate monthly MIS, compare trends, and produce P&L and balance sheet snapshots."
          icon={iconReporting}
          accent="brand"
        />
        <NavCard
          to="/tracker"
          title="Tracker"
          description="Stay on top of daily, weekly and monthly accounting tasks, filings, and reconciliations."
          icon={iconTracker}
          accent="emerald"
        />
        <NavCard
          to="/guide"
          title="Guide & Tools"
          description="System architecture, SOPs, ledger trees, and booking assistants for Tally & Tranzact."
          icon={iconGuide}
          accent="violet"
        />
      </div>

      {/* Quick shortcuts */}
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLink to="/guide/architecture" label="System Architecture" tag="Guide" />
        <QuickLink to="/guide/sop" label="Accounting SOPs" tag="Guide" />
        <QuickLink to="/guide/tools/invoice-booking" label="Invoice Booking Suggester" tag="Tool" />
        <QuickLink to="/guide/ledgers" label="Ledger & Voucher Tree" tag="Reference" />
      </div>

      {/* Footer info row */}
      <div className="mt-10 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Pill color="brand">Tranzact — B2B &amp; Inventory</Pill>
          <Pill color="emerald">Tally — Books of Account</Pill>
          <Pill color="violet">Tally Plugin — UPSERT</Pill>
          <Pill color="amber">Channels — Amazon, Shopify, Easebuzz, Snapmint, Shiprocket, Blinkit</Pill>
          <Pill color="sky">Banks — ICICI, Central, HDFC</Pill>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Ledger and voucher mappings are controlled centrally. See the{' '}
          <Link to="/guide/architecture" className="text-brand-600 hover:text-brand-700 underline underline-offset-2">
            system architecture
          </Link>{' '}
          and{' '}
          <Link to="/guide/ledgers" className="text-brand-600 hover:text-brand-700 underline underline-offset-2">
            ledger reference
          </Link>{' '}
          for how each transaction flows.
        </p>
      </div>
    </div>
  );
}

function QuickLink({ to, label, tag }: { to: string; label: string; tag: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50 transition-colors"
    >
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">{tag}</div>
      </div>
      <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
