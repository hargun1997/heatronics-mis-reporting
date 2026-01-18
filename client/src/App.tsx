import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { AccountingDictionary } from './pages/AccountingDictionary';
import { MISTrackingNew } from './pages/MISTrackingNew';
import { TaskTracker } from './pages/TaskTracker';
import { BusinessGuide } from './pages/BusinessGuide';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="mis-tracking" element={<MISTrackingNew />} />
          <Route path="task-tracker" element={<TaskTracker />} />
          <Route path="business-guide" element={<BusinessGuide />} />
          <Route path="dictionary" element={<AccountingDictionary />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
