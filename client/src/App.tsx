import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { AccountingDictionary } from './pages/AccountingDictionary';
import { AccountsChecklist } from './pages/AccountsChecklist';
import { MISCalculator } from './pages/MISCalculator';
import { MISTrackingNew } from './pages/MISTrackingNew';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="dictionary" element={<AccountingDictionary />} />
          <Route path="checklist" element={<AccountsChecklist />} />
          <Route path="mis-calculator" element={<MISCalculator />} />
          <Route path="mis-tracking" element={<MISTrackingNew />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
