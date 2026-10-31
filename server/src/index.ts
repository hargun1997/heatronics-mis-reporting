import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import dictionaryRoutes from './routes/dictionary.js';
import checklistRoutes from './routes/checklist.js';
import misRoutes from './routes/mis.js';
import driveRoutes from './routes/drive.js';
import expenseBookingRoutes from './routes/expenseBooking.js';
import sopVisualsRoutes from './routes/sopVisuals.js';
import monthCloseRoutes from './routes/monthClose.js';
import connectorRoutes from './routes/connectors.js';
import ingestRoutes from './routes/ingest.js';
import chatRoutes from './routes/chat.js';
import usageRoutes from './routes/usage.js';
import issuesRoutes from './routes/issues.js';
import ownershipRoutes from './routes/ownership.js';
import workRoutes from './routes/work.js';
import reportRoutes from './routes/report.js';
import bookingAssistantRoutes from './routes/bookingAssistant.js';
import priceFloorsRoutes from './routes/priceFloors.js';
import expensesRoutes from './routes/expenses.js';
import { refreshMailConfig } from './services/mailer.js';
import { htxGate } from './htxGate.js';
import { portalManifest } from './portalManifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for development with React
}));
// Public API list for the portal's Systems map — before the login gate on purpose (static, no data).
app.get('/.well-known/portal.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60').json(portalManifest);
});
// Heatronics login: every page and API needs a portal.heatronics.in login (see htxGate.ts).
app.use(htxGate({
  portal: 'mis',
  host: 'mis.heatronics.in',
  openPaths: [
    '/api/work/reminders/run',      // hourly GitHub Actions cron (.github/workflows/task-reminders.yml)
    '/api/ownership/reminders/run', // reminder scheduler
    '/api/expenses',                // read by production.heatronics.in; checks EXPENSES_API_TOKEN when set
  ],
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/dictionary', dictionaryRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/mis', misRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/expense-booking', expenseBookingRoutes);
app.use('/api/sop-visuals', sopVisualsRoutes);
app.use('/api/month-close', monthCloseRoutes);
app.use('/api/connectors', connectorRoutes);
app.use('/api/ingest', ingestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/ownership', ownershipRoutes);
app.use('/api/work', workRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/booking-assistant', bookingAssistantRoutes);
app.use('/api/price-floors', priceFloorsRoutes);
app.use('/api/expenses', expensesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  // In Docker, the path is relative to the app root
  // In local development with npm run build, it's relative to server/dist
  const clientBuildPath = process.env.CLIENT_BUILD_PATH
    || path.join(__dirname, '../../client/dist');

  console.log(`Serving static files from: ${clientBuildPath}`);
  app.use(express.static(clientBuildPath));

  // Handle React routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  void refreshMailConfig();
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         Heatronics Accounting Dashboard Server                ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT.toString().padEnd(38)}║
║  API endpoints:                                               ║
║    - /api/dictionary      - Accounting Dictionary             ║
║    - /api/checklist       - Accounts Checklist                ║
║    - /api/mis             - MIS Calculator                    ║
║    - /api/drive           - Google Drive Integration          ║
║    - /api/expense-booking - AI Expense Booking Advisor        ║
║    - /api/sop-visuals     - SOP Visuals Registry              ║
║    - /api/health          - Health check                      ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
