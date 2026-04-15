import { NavCard } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';

const iconTasks = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const iconRecon = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const iconCalendar = (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

export function Tracker() {
  return (
    <>
      <PageHeader
        title="Tracker"
        description="Stay on top of recurring accounting tasks, filings, and reconciliations so nothing slips through."
        accent="emerald"
        icon={iconTasks}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <NavCard
            to="/task-tracker"
            title="Task Tracker"
            description="Daily, weekly, monthly, and ad-hoc tasks — GST filings, TDS, payroll and more."
            icon={iconTasks}
            accent="emerald"
            badge="Live"
          />
          <NavCard
            to="/tracker/reconciliations"
            title="Reconciliations"
            description="Bank, channel-settlement and GSTR-2B reconciliations. Coming soon."
            icon={iconRecon}
            accent="sky"
          />
          <NavCard
            to="/tracker/compliance"
            title="Compliance Calendar"
            description="Upcoming statutory due dates for GST, TDS, ROC and income tax."
            icon={iconCalendar}
            accent="amber"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">Why use the Tracker?</h3>
            <p className="mt-1 text-xs text-slate-500">
              Replace scattered spreadsheets and WhatsApp reminders with a single source of truth for month-end close.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Tasks recur automatically — you only see what's due for the current period.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500" />
                <span>Category tags (GST, TDS, Payroll…) make it easy to filter for the right owner.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
                <span>Completion history is persisted so you can audit what got done when.</span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">Typical month-end flow</h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-700 list-decimal list-inside">
              <li>Close all sales &amp; purchase books in Tally / Tranzact.</li>
              <li>Run bank &amp; channel-settlement reconciliations.</li>
              <li>Book provisions, depreciation and accruals.</li>
              <li>File GSTR-1 and GSTR-3B.</li>
              <li>Generate monthly MIS under Reporting.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
