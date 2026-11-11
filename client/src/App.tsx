import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { HOME } from './nav/config';

// Every page is its own chunk (React.lazy): the shell loads first, a page's code (and xlsx / jspdf / the handbook) only when
// it is opened. MainLayout wraps the <Outlet /> in <Suspense>. `lazyPage` reloads once if a chunk from an older deploy is gone.
import { lazyPage } from './lazyPage';

const ConnectorsPage = lazyPage(() => import('./pages/mis/ConnectorsPage'), 'ConnectorsPage');
const LiveMisPage = lazyPage(() => import('./pages/mis/LiveMisPage'), 'LiveMisPage');
const RulebookPage = lazyPage(() => import('./pages/mis/RulebookPage'), 'RulebookPage');
const MisChatPage = lazyPage(() => import('./pages/mis/MisChatPage'), 'MisChatPage');
const AiInsightsPage = lazyPage(() => import('./pages/mis/AiInsightsPage'), 'AiInsightsPage');
const UploadsRedirect = lazyPage(() => import('./pages/mis/UploadsRedirect'), 'UploadsRedirect');
const TasksPage = lazyPage(() => import('./pages/work/TasksPage'), 'TasksPage');
const TasksSettingsPage = lazyPage(() => import('./pages/work/TasksSettingsPage'), 'TasksSettingsPage');
const SendReportPage = lazyPage(() => import('./pages/mis/SendReportPage'), 'SendReportPage');
const HandbookPage = lazyPage(() => import('./pages/handbook/HandbookPage'), 'HandbookPage');
const HandbookRedirect = lazyPage(() => import('./pages/handbook/HandbookPage'), 'HandbookRedirect');
const InvoiceBookingSuggester = lazyPage(() => import('./pages/guide/tools/InvoiceBookingSuggester'), 'InvoiceBookingSuggester');
const AmazonToTranzactTool = lazyPage(() => import('./pages/guide/tools/AmazonToTranzactTool'), 'AmazonToTranzactTool');
const ExpenseBooking = lazyPage(() => import('./pages/tools/ExpenseBooking'), 'ExpenseBooking');
const BookingAssistantPage = lazyPage(() => import('./pages/booking/BookingAssistantPage'), 'BookingAssistantPage');
const TodayPage = lazyPage(() => import('./pages/today/TodayPage'), 'TodayPage');
const CashRunwayPage = lazyPage(() => import('./pages/cash/CashRunwayPage'), 'CashRunwayPage');
const PriceFloorsPage = lazyPage(() => import('./pages/tools/PriceFloorsPage'), 'PriceFloorsPage');
const BulkPaymentsPage = lazyPage(() => import('./pages/tools/BulkPaymentsPage'), 'BulkPaymentsPage');
const RoundPlannerPage = lazyPage(() => import('./pages/tools/RoundPlannerPage'), 'RoundPlannerPage');
const PlanningPage = lazyPage(() => import('./pages/planning/PlanningPage'), 'PlanningPage');
const TallyPage = lazyPage(() => import('./pages/tally/TallyPage'), 'TallyPage');
const TdsPage = lazyPage(() => import('./pages/accounts/TdsPage'), 'TdsPage');

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          {/* Landing page → Today (the menu lives in nav/config.ts; server/test/nav.test.ts checks it against these routes) */}
          <Route index element={<Navigate to={HOME} replace />} />
          <Route path="home" element={<Navigate to={HOME} replace />} />
          <Route path="reporting" element={<Navigate to={HOME} replace />} />
          <Route path="reporting/mis" element={<Navigate to={HOME} replace />} />
          {/* Old pages: out of the menu, still reachable from ⌘K */}
          {/* The old MIS deck is retired — Live MIS has every one of its reports */}
          <Route path="reporting/mis/deck" element={<Navigate to="/reporting/mis/live" replace />} />
          <Route path="reporting/mis/close" element={<Navigate to="/reporting/mis/connectors" replace />} />
          <Route path="reporting/mis/connectors" element={<ConnectorsPage />} />
          <Route path="reporting/mis/ingest" element={<UploadsRedirect />} />
          <Route path="reporting/mis/rulebook" element={<RulebookPage />} />
          <Route path="reporting/mis/live" element={<LiveMisPage />} />
          <Route path="reporting/mis/insights" element={<AiInsightsPage />} />
          <Route path="reporting/mis/chat" element={<MisChatPage />} />
          <Route path="reporting/mis/issues" element={<Navigate to="/tasks?view=fix" replace />} />
          <Route path="reporting/mis/ownership" element={<Navigate to="/tasks/settings" replace />} />
          <Route path="reporting/mis/send" element={<SendReportPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/settings" element={<TasksSettingsPage />} />
          <Route path="work" element={<Navigate to="/tasks" replace />} />
          <Route path="compliance" element={<Navigate to="/tasks" replace />} />
          <Route path="compliance/*" element={<Navigate to="/tasks" replace />} />

          {/* Accounts Handbook — the single accounting knowledge base (handbook.html) */}
          {/* One route so moving between handbook views never remounts the page */}
          <Route path="handbook/*" element={<HandbookPage />} />
          <Route path="booking-assistant" element={<BookingAssistantPage />} />

          {/* Old task tracker → the unified Tasks page */}
          <Route path="task-tracker" element={<Navigate to="/tasks" replace />} />

          {/* Old MIS Reporting view is retired — superseded by the new MIS Reporting deck */}
          <Route path="mis-tracking" element={<Navigate to={HOME} replace />} />
          <Route path="mis-tracking/*" element={<Navigate to={HOME} replace />} />

          {/* Old Guide / SOP routes → the handbook section that replaced each page */}
          <Route path="guide" element={<HandbookRedirect anchor="c0" />} />
          <Route path="guide/sop" element={<HandbookRedirect anchor="c0" />} />
          <Route path="guide/sop/sales" element={<HandbookRedirect anchor="c3" />} />
          <Route path="guide/sop/sales/amazon" element={<HandbookRedirect anchor="c6" />} />
          <Route path="guide/sop/sales/shopify" element={<HandbookRedirect anchor="c5" />} />
          <Route path="guide/sop/sales/blinkit" element={<HandbookRedirect anchor="c25" />} />
          <Route path="guide/sop/sales/b2b" element={<HandbookRedirect anchor="c4" />} />
          <Route path="guide/sop/purchase" element={<HandbookRedirect anchor="c4-purchases" />} />
          <Route path="guide/sop/expense" element={<HandbookRedirect anchor="c16-m4-platform-invoices" />} />
          <Route path="guide/sop/job-work" element={<HandbookRedirect anchor="c4-job-work" />} />
          <Route path="guide/sop/capital-goods" element={<HandbookRedirect anchor="c26" />} />
          <Route path="guide/sop/collections/easebuzz" element={<HandbookRedirect anchor="c14-d2-shopify-easebuzz" />} />
          <Route path="guide/sop/collections/snapmint" element={<HandbookRedirect anchor="c16-m3-snapmint" />} />
          <Route path="guide/sop/collections/shiprocket" element={<HandbookRedirect anchor="c16-m2-shiprocket" />} />
          <Route path="guide/sop/tax/gst" element={<HandbookRedirect anchor="c7" />} />
          <Route path="guide/sop/tax/tds" element={<HandbookRedirect anchor="c8" />} />
          <Route path="guide/sop/close" element={<HandbookRedirect anchor="c10" />} />
          <Route path="guide/sop/banking" element={<HandbookRedirect anchor="c9" />} />
          <Route path="guide/sop/banking/central-cc" element={<HandbookRedirect anchor="c9-central-cc" />} />
          <Route path="guide/sop/banking/icici" element={<HandbookRedirect anchor="c9-icici" />} />
          <Route path="guide/sop/banking/hdfc" element={<HandbookRedirect anchor="c9-hdfc" />} />
          <Route path="guide/sop/banking/easebuzz-wire" element={<HandbookRedirect anchor="c9-easebuzz-wire" />} />
          <Route path="guide/ledgers" element={<HandbookRedirect anchor="c2" />} />
          <Route path="guide/architecture" element={<HandbookRedirect anchor="s0" />} />
          <Route path="guide/sop/*" element={<Navigate to="/handbook" replace />} />

          {/* Tools (top-level) */}
          <Route path="tools" element={<Navigate to={HOME} replace />} />
          <Route path="tools/invoice-booking" element={<InvoiceBookingSuggester />} />
          <Route path="tools/amazon-to-tranzact" element={<AmazonToTranzactTool />} />
          <Route path="tools/expense-booking" element={<ExpenseBooking />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="accounts/cash-runway" element={<CashRunwayPage />} />
          <Route path="tools/price-floors" element={<PriceFloorsPage />} />
          <Route path="tools/bulk-payments" element={<BulkPaymentsPage />} />
          <Route path="tools/round-planner" element={<RoundPlannerPage />} />
          <Route path="planning" element={<PlanningPage />} />
          {/* Short addresses (11 Nov 2026) */}
          <Route path="live" element={<Navigate to="/reporting/mis/live" replace />} />
          <Route path="cash" element={<Navigate to="/accounts/cash-runway" replace />} />
          <Route path="tds" element={<Navigate to="/accounts/tds" replace />} />
          <Route path="payments" element={<Navigate to="/tools/bulk-payments" replace />} />
          <Route path="booking" element={<Navigate to="/booking-assistant" replace />} />
          <Route path="floors" element={<Navigate to="/tools/price-floors" replace />} />
          <Route path="setup" element={<Navigate to="/reporting/mis/connectors" replace />} />
          <Route path="tally" element={<TallyPage />} />
          <Route path="accounts/tds" element={<TdsPage />} />

          {/* Back-compat redirects from old routes */}
          <Route path="business-guide" element={<Navigate to="/guide" replace />} />
          <Route path="guide/tools" element={<Navigate to="/tools" replace />} />
          <Route path="guide/tools/invoice-booking" element={<Navigate to="/tools/invoice-booking" replace />} />
          <Route path="guide/tools/amazon-to-tranzact" element={<Navigate to="/tools/amazon-to-tranzact" replace />} />
          <Route path="tracker" element={<Navigate to="/tasks" replace />} />
          <Route path="tracker/compliance" element={<Navigate to="/tasks" replace />} />
          <Route path="tracker/*" element={<Navigate to="/tasks" replace />} />

          {/* Catch-all → home */}
          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
