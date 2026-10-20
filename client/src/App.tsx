import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';

// Top-level pages
import { Home } from './pages/Home';
import { Reporting } from './pages/Reporting';
import { MISDeck } from './pages/mis/MISDeck';
import { MonthClosePage } from './pages/mis/MonthClosePage';
import { ConnectorsPage } from './pages/mis/ConnectorsPage';
import { LiveMisPage } from './pages/mis/LiveMisPage';
import { IngestPage } from './pages/mis/IngestPage';
import { RulebookPage } from './pages/mis/RulebookPage';
import { MisChatPage } from './pages/mis/MisChatPage';
import { AiInsightsPage } from './pages/mis/AiInsightsPage';
import { IssuesPage } from './pages/mis/IssuesPage';
import { TasksPage } from './pages/work/TasksPage';
import { TasksSettingsPage } from './pages/work/TasksSettingsPage';
import { SendReportPage } from './pages/mis/SendReportPage';

// Guide

// Tools
import { HandbookPage, HandbookRedirect } from './pages/handbook/HandbookPage';
import { ToolsHome } from './pages/guide/tools/ToolsHome';
import { InvoiceBookingSuggester } from './pages/guide/tools/InvoiceBookingSuggester';
import { AmazonToTranzactTool } from './pages/guide/tools/AmazonToTranzactTool';
import { ExpenseBooking } from './pages/tools/ExpenseBooking';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          {/* Landing page → MIS Reporting deck */}
          <Route index element={<Navigate to="/reporting/mis" replace />} />
          {/* Original home dashboard, still reachable directly */}
          <Route path="home" element={<Home />} />

          {/* Top-level sections */}
          <Route path="reporting" element={<Reporting />} />
          <Route path="reporting/mis" element={<MISDeck />} />
          <Route path="reporting/mis/close" element={<MonthClosePage />} />
          <Route path="reporting/mis/connectors" element={<ConnectorsPage />} />
          <Route path="reporting/mis/ingest" element={<IngestPage />} />
          <Route path="reporting/mis/rulebook" element={<RulebookPage />} />
          <Route path="reporting/mis/live" element={<LiveMisPage />} />
          <Route path="reporting/mis/insights" element={<AiInsightsPage />} />
          <Route path="reporting/mis/chat" element={<MisChatPage />} />
          <Route path="reporting/mis/issues" element={<IssuesPage />} />
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

          {/* Old task tracker → the unified Tasks page */}
          <Route path="task-tracker" element={<Navigate to="/tasks" replace />} />

          {/* Old MIS Reporting view is retired — superseded by the new MIS Reporting deck */}
          <Route path="mis-tracking" element={<Navigate to="/reporting/mis" replace />} />
          <Route path="mis-tracking/*" element={<Navigate to="/reporting/mis" replace />} />

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
          <Route path="tools" element={<ToolsHome />} />
          <Route path="tools/invoice-booking" element={<InvoiceBookingSuggester />} />
          <Route path="tools/amazon-to-tranzact" element={<AmazonToTranzactTool />} />
          <Route path="tools/expense-booking" element={<ExpenseBooking />} />

          {/* Back-compat redirects from old routes */}
          <Route path="business-guide" element={<Navigate to="/guide" replace />} />
          <Route path="guide/tools" element={<Navigate to="/tools" replace />} />
          <Route path="guide/tools/invoice-booking" element={<Navigate to="/tools/invoice-booking" replace />} />
          <Route path="guide/tools/amazon-to-tranzact" element={<Navigate to="/tools/amazon-to-tranzact" replace />} />
          <Route path="tracker" element={<Navigate to="/tasks" replace />} />
          <Route path="tracker/compliance" element={<Navigate to="/tasks" replace />} />
          <Route path="tracker/*" element={<Navigate to="/tasks" replace />} />

          {/* Catch-all → home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
