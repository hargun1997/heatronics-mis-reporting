import app from './app.js';
import { refreshMailConfig } from './services/mailer.js';

const PORT = process.env.PORT || 3001;

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
