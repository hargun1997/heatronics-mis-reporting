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
import { OwnershipPage } from './pages/mis/OwnershipPage';
import { SendReportPage } from './pages/mis/SendReportPage';
import { ComplianceHome } from './pages/compliance/ComplianceHome';
import { ComplianceCategory } from './pages/compliance/ComplianceCategory';

// Guide
import { GuideHome } from './pages/guide/GuideHome';
import { SystemArchitecture } from './pages/guide/SystemArchitecture';
import { LedgerReference } from './pages/guide/LedgerReference';
import { SopHome } from './pages/guide/sop/SopHome';
import { SalesSop } from './pages/guide/sop/SalesSop';
import { SalesAmazonSop } from './pages/guide/sop/SalesAmazonSop';
import { SalesShopifySop } from './pages/guide/sop/SalesShopifySop';
import { SalesBlinkitSop } from './pages/guide/sop/SalesBlinkitSop';
import { SalesB2BSop } from './pages/guide/sop/SalesB2BSop';
import { PurchaseSop } from './pages/guide/sop/PurchaseSop';
import { ExpenseSop } from './pages/guide/sop/ExpenseSop';
import { BankingSop } from './pages/guide/sop/BankingSop';
import { BankingEasebuzzWireSop } from './pages/guide/sop/BankingEasebuzzWireSop';
import { BankingHdfcSop } from './pages/guide/sop/BankingHdfcSop';
import { BankingIciciSop } from './pages/guide/sop/BankingIciciSop';
import { BankingCentralCcSop } from './pages/guide/sop/BankingCentralCcSop';
import { CapitalGoodsSop } from './pages/guide/sop/CapitalGoodsSop';
import { JobWorkSop } from './pages/guide/sop/JobWorkSop';
import { EasebuzzSop } from './pages/guide/sop/EasebuzzSop';
import { SnapmintSop } from './pages/guide/sop/SnapmintSop';
import { ShiprocketCodSop } from './pages/guide/sop/ShiprocketCodSop';
import { GstSop } from './pages/guide/sop/GstSop';
import { TdsSop } from './pages/guide/sop/TdsSop';
import { MonthCloseSop } from './pages/guide/sop/MonthCloseSop';

// Tools
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
          <Route path="reporting/mis/ownership" element={<OwnershipPage />} />
          <Route path="reporting/mis/send" element={<SendReportPage />} />
          <Route path="compliance" element={<ComplianceHome />} />
          <Route path="compliance/:category" element={<ComplianceCategory />} />

          {/* Accounts Handbook is now folded into the SOPs */}
          <Route path="handbook" element={<Navigate to="/guide/sop" replace />} />
          <Route path="handbook/*" element={<Navigate to="/guide/sop" replace />} />

          {/* Task tracker is now folded into Compliance → Operations */}
          <Route path="task-tracker" element={<Navigate to="/compliance/operations" replace />} />

          {/* Old MIS Reporting view is retired — superseded by the new MIS Reporting deck */}
          <Route path="mis-tracking" element={<Navigate to="/reporting/mis" replace />} />
          <Route path="mis-tracking/*" element={<Navigate to="/reporting/mis" replace />} />

          {/* Guide hub */}
          <Route path="guide" element={<GuideHome />} />
          <Route path="guide/architecture" element={<SystemArchitecture />} />
          <Route path="guide/ledgers" element={<LedgerReference />} />

          {/* SOPs */}
          <Route path="guide/sop" element={<SopHome />} />
          <Route path="guide/sop/sales" element={<SalesSop />} />
          <Route path="guide/sop/sales/amazon" element={<SalesAmazonSop />} />
          <Route path="guide/sop/sales/shopify" element={<SalesShopifySop />} />
          <Route path="guide/sop/sales/blinkit" element={<SalesBlinkitSop />} />
          <Route path="guide/sop/sales/b2b" element={<SalesB2BSop />} />
          <Route path="guide/sop/purchase" element={<PurchaseSop />} />
          <Route path="guide/sop/expense" element={<ExpenseSop />} />
          <Route path="guide/sop/collections/easebuzz" element={<EasebuzzSop />} />
          <Route path="guide/sop/collections/snapmint" element={<SnapmintSop />} />
          <Route path="guide/sop/collections/shiprocket" element={<ShiprocketCodSop />} />
          <Route path="guide/sop/tax/gst" element={<GstSop />} />
          <Route path="guide/sop/tax/tds" element={<TdsSop />} />
          <Route path="guide/sop/close" element={<MonthCloseSop />} />
          <Route path="guide/sop/banking" element={<BankingSop />} />
          <Route path="guide/sop/banking/easebuzz-wire" element={<BankingEasebuzzWireSop />} />
          <Route path="guide/sop/banking/hdfc" element={<BankingHdfcSop />} />
          <Route path="guide/sop/banking/icici" element={<BankingIciciSop />} />
          <Route path="guide/sop/banking/central-cc" element={<BankingCentralCcSop />} />
          <Route path="guide/sop/capital-goods" element={<CapitalGoodsSop />} />
          <Route path="guide/sop/job-work" element={<JobWorkSop />} />

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
          <Route path="tracker" element={<Navigate to="/compliance" replace />} />
          <Route path="tracker/compliance" element={<Navigate to="/compliance" replace />} />
          <Route path="tracker/*" element={<Navigate to="/compliance" replace />} />

          {/* Catch-all → home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
