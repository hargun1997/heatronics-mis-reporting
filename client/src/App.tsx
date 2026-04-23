import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';

// Top-level pages
import { Home } from './pages/Home';
import { Reporting } from './pages/Reporting';
import { ComplianceHome } from './pages/compliance/ComplianceHome';
import { ComplianceCategory } from './pages/compliance/ComplianceCategory';

// Legacy feature pages (kept alive under new routes)
import { MISTrackingNew } from './pages/MISTrackingNew';
import { TaskTracker } from './pages/TaskTracker';

// Guides (was Guide & Tools)
import { GuidesHome } from './pages/guides/GuidesHome';
import { SystemArchitecture } from './pages/guide/SystemArchitecture';
import { LedgerReference } from './pages/guide/LedgerReference';
import { SopHome } from './pages/guide/sop/SopHome';
import { SalesSop } from './pages/guide/sop/SalesSop';
import { PurchaseSop } from './pages/guide/sop/PurchaseSop';
import { ExpenseSop } from './pages/guide/sop/ExpenseSop';
import { BankingSop } from './pages/guide/sop/BankingSop';
import { CapitalGoodsSop } from './pages/guide/sop/CapitalGoodsSop';
import { JobWorkSop } from './pages/guide/sop/JobWorkSop';

// Tools (top-level)
import { ToolsHome } from './pages/tools/ToolsHome';
import { InvoiceBookingSuggester } from './pages/guide/tools/InvoiceBookingSuggester';
import { AmazonToTranzactTool } from './pages/guide/tools/AmazonToTranzactTool';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          {/* Home */}
          <Route index element={<Home />} />

          {/* ─── Reporting ─── */}
          <Route path="reporting" element={<Reporting />} />
          <Route path="mis-tracking" element={<MISTrackingNew />} />

          {/* ─── Calendar ─── */}
          <Route path="calendar" element={<ComplianceHome />} />
          <Route path="calendar/:category" element={<ComplianceCategory />} />

          {/* ─── Tools ─── */}
          <Route path="tools" element={<ToolsHome />} />
          <Route path="tools/invoice-booking" element={<InvoiceBookingSuggester />} />
          <Route path="tools/amazon-to-tranzact" element={<AmazonToTranzactTool />} />

          {/* ─── Guides ─── */}
          <Route path="guides" element={<GuidesHome />} />
          <Route path="guides/architecture" element={<SystemArchitecture />} />
          <Route path="guides/ledgers" element={<LedgerReference />} />
          <Route path="guides/sop" element={<SopHome />} />
          <Route path="guides/sop/sales" element={<SalesSop />} />
          <Route path="guides/sop/purchase" element={<PurchaseSop />} />
          <Route path="guides/sop/expense" element={<ExpenseSop />} />
          <Route path="guides/sop/banking" element={<BankingSop />} />
          <Route path="guides/sop/capital-goods" element={<CapitalGoodsSop />} />
          <Route path="guides/sop/job-work" element={<JobWorkSop />} />

          {/* Legacy route kept alive */}
          <Route path="task-tracker" element={<TaskTracker />} />

          {/* ─── Back-compat redirects ─── */}
          <Route path="compliance" element={<Navigate to="/calendar" replace />} />
          <Route path="compliance/:category" element={<Navigate to="/calendar" replace />} />
          <Route path="guide" element={<Navigate to="/guides" replace />} />
          <Route path="guide/architecture" element={<Navigate to="/guides/architecture" replace />} />
          <Route path="guide/ledgers" element={<Navigate to="/guides/ledgers" replace />} />
          <Route path="guide/sop" element={<Navigate to="/guides/sop" replace />} />
          <Route path="guide/sop/*" element={<Navigate to="/guides/sop" replace />} />
          <Route path="guide/tools" element={<Navigate to="/tools" replace />} />
          <Route path="guide/tools/*" element={<Navigate to="/tools" replace />} />
          <Route path="business-guide" element={<Navigate to="/guides" replace />} />
          <Route path="tracker" element={<Navigate to="/calendar" replace />} />
          <Route path="tracker/*" element={<Navigate to="/calendar" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
