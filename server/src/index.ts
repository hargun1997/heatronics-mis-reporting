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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for development with React
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/dictionary', dictionaryRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/mis', misRoutes);

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
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         Heatronics Accounting Dashboard Server                ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT.toString().padEnd(38)}║
║  API endpoints:                                               ║
║    - /api/dictionary  - Accounting Dictionary                 ║
║    - /api/checklist   - Accounts Checklist                    ║
║    - /api/mis         - MIS Calculator                        ║
║    - /api/health      - Health check                          ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
