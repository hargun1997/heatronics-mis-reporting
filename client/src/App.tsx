import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';

// Top-level pages
import { Home } from './pages/Home';
import { Reporting } from './pages/Reporting';
import { Tracker } from './pages/Tracker';

// Legacy feature pages (kept alive under new routes)
import { MISTrackingNew } from './pages/MISTrackingNew';
import { TaskTracker } from './pages/TaskTracker';

// Guide & Tools
import { GuideHome } from './pages/guide/GuideHome';
import { SystemArchitecture } from './pages/guide/SystemArchitecture';
import { LedgerReference } from './pages/guide/LedgerReference';
import { SopHome } from './pages/guide/sop/SopHome';
import { SalesSop } from './pages/guide/sop/SalesSop';
import { PurchaseSop } from './pages/guide/sop/PurchaseSop';
import { ExpenseSop } from './pages/guide/sop/ExpenseSop';
import { BankingSop } from './pages/guide/sop/BankingSop';
import { CapitalGoodsSop } from './pages/guide/sop/CapitalGoodsSop';
import { JobWorkSop } from './pages/guide/sop/JobWorkSop';
import { ToolsHome } from './pages/guide/tools/ToolsHome';
import { InvoiceBookingSuggester } from './pages/guide/tools/InvoiceBookingSuggester';
import { AmazonToTranzactTool } from './pages/guide/tools/AmazonToTranzactTool';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          {/* Home */}
          <Route index element={<Home />} />

          {/* Top-level sections */}
          <Route path="reporting" element={<Reporting />} />
          <Route path="tracker" element={<Tracker />} />

          {/* Legacy feature routes — still reachable */}
          <Route path="mis-tracking" element={<MISTrackingNew />} />
          <Route path="task-tracker" element={<TaskTracker />} />

          {/* Guide & Tools hub */}
          <Route path="guide" element={<GuideHome />} />
          <Route path="guide/architecture" element={<SystemArchitecture />} />
          <Route path="guide/ledgers" element={<LedgerReference />} />

          {/* SOPs */}
          <Route path="guide/sop" element={<SopHome />} />
          <Route path="guide/sop/sales" element={<SalesSop />} />
          <Route path="guide/sop/purchase" element={<PurchaseSop />} />
          <Route path="guide/sop/expense" element={<ExpenseSop />} />
          <Route path="guide/sop/banking" element={<BankingSop />} />
          <Route path="guide/sop/capital-goods" element={<CapitalGoodsSop />} />
          <Route path="guide/sop/job-work" element={<JobWorkSop />} />

          {/* Tools */}
          <Route path="guide/tools" element={<ToolsHome />} />
          <Route path="guide/tools/invoice-booking" element={<InvoiceBookingSuggester />} />
          <Route path="guide/tools/amazon-to-tranzact" element={<AmazonToTranzactTool />} />

          {/* Back-compat redirects from old routes */}
          <Route path="business-guide" element={<Navigate to="/guide" replace />} />
          <Route path="tools" element={<Navigate to="/guide/tools" replace />} />

          {/* Catch-all → home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
