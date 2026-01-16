import { Router } from 'express';

const router = Router();

interface MISSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  period: string; // e.g., "Oct 2024"
  status: 'draft' | 'completed';
  data: {
    balanceSheetData?: unknown;
    journalData?: unknown;
    purchaseData?: unknown;
    classifications?: unknown;
    report?: unknown;
  };
}

// In-memory storage for MIS sessions
let misSessions: MISSession[] = [];

// Get all MIS sessions
router.get('/sessions', (req, res) => {
  const sessions = misSessions.map(s => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    period: s.period,
    status: s.status
  }));
  res.json(sessions);
});

// Get single session
router.get('/sessions/:id', (req, res) => {
  const session = misSessions.find(s => s.id === req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

// Create new session
router.post('/sessions', (req, res) => {
  const { name, period } = req.body;

  const session: MISSession = {
    id: `mis-${Date.now()}`,
    name: name || `MIS Report - ${period || new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    period: period || new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
    status: 'draft',
    data: {}
  };

  misSessions.push(session);
  res.status(201).json(session);
});

// Update session
router.put('/sessions/:id', (req, res) => {
  const index = misSessions.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Session not found' });
  }

  misSessions[index] = {
    ...misSessions[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  res.json(misSessions[index]);
});

// Save session data (partial update)
router.patch('/sessions/:id/data', (req, res) => {
  const index = misSessions.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Session not found' });
  }

  misSessions[index] = {
    ...misSessions[index],
    data: {
      ...misSessions[index].data,
      ...req.body
    },
    updatedAt: new Date().toISOString()
  };

  res.json(misSessions[index]);
});

// Delete session
router.delete('/sessions/:id', (req, res) => {
  const index = misSessions.findIndex(s => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Session not found' });
  }

  misSessions.splice(index, 1);
  res.status(204).send();
});

// Get ignore patterns (configurable)
router.get('/ignore-patterns', (req, res) => {
  res.json(getDefaultIgnorePatterns());
});

// Get classification patterns
router.get('/classification-patterns', (req, res) => {
  res.json(getDefaultClassificationPatterns());
});

function getDefaultIgnorePatterns() {
  return [
    { pattern: "AMAZON SALE.*CASH SALE", reason: "Amazon Cash Sale Adjustment" },
    { pattern: "AMAZON CASH SALE", reason: "Amazon Cash Sale Adjustment" },
    { pattern: "CGST Input", reason: "GST Input Credit" },
    { pattern: "SGST Input", reason: "GST Input Credit" },
    { pattern: "IGST Input", reason: "GST Input Credit" },
    { pattern: "CGST Output", reason: "GST Output Liability" },
    { pattern: "SGST Output", reason: "GST Output Liability" },
    { pattern: "IGST Output", reason: "GST Output Liability" },
    { pattern: "TDS.*", reason: "TDS Entry" },
    { pattern: "HDFC BANK", reason: "Bank Account" },
    { pattern: "ICICI BANK", reason: "Bank Account" },
    { pattern: "^Cash$", reason: "Cash Account" }
  ];
}

function getDefaultClassificationPatterns() {
  return [
    // Revenue patterns
    { pattern: "AMAZON", head: "A. Revenue", subhead: "Amazon" },
    { pattern: "FLIPKART", head: "A. Revenue", subhead: "Flipkart" },
    { pattern: "MEESHO", head: "A. Revenue", subhead: "Meesho" },
    { pattern: "WEBSITE.*SALE", head: "A. Revenue", subhead: "Website" },
    // Expense patterns
    { pattern: "FREIGHT", head: "F. Channel & Fulfillment", subhead: "Shipping" },
    { pattern: "COURIER", head: "F. Channel & Fulfillment", subhead: "Shipping" },
    { pattern: "COMMISSION", head: "F. Channel & Fulfillment", subhead: "Marketplace Commission" },
    { pattern: "ADVERTISING", head: "G. Sales & Marketing", subhead: "Digital Ads" },
    { pattern: "META.*ADS", head: "G. Sales & Marketing", subhead: "Meta Ads" },
    { pattern: "GOOGLE.*ADS", head: "G. Sales & Marketing", subhead: "Google Ads" },
    { pattern: "RENT", head: "I. Operating Expenses", subhead: "Rent" },
    { pattern: "SALARY", head: "I. Operating Expenses", subhead: "Salaries" },
    { pattern: "ELECTRICITY", head: "I. Operating Expenses", subhead: "Utilities" }
  ];
}

export default router;
