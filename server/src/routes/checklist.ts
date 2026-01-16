import { Router } from 'express';

const router = Router();

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  dueDay?: number; // Day of month for monthly tasks
  responsible: string;
  steps: string[];
  tags: string[];
}

interface ChecklistCompletion {
  id: string;
  checklistId: string;
  completedAt: string;
  completedBy: string;
  period: string; // e.g., "2024-01" for January 2024
  notes?: string;
}

// In-memory storage
let checklists: ChecklistItem[] = getDefaultChecklists();
let completions: ChecklistCompletion[] = [];

// Get all checklists
router.get('/', (req, res) => {
  const { category, frequency } = req.query;

  let filtered = [...checklists];

  if (category && typeof category === 'string') {
    filtered = filtered.filter(c => c.category.toLowerCase() === category.toLowerCase());
  }

  if (frequency && typeof frequency === 'string') {
    filtered = filtered.filter(c => c.frequency === frequency);
  }

  res.json(filtered);
});

// Get checklist categories
router.get('/categories', (req, res) => {
  const categories = [...new Set(checklists.map(c => c.category))];
  res.json(categories);
});

// Get single checklist
router.get('/:id', (req, res) => {
  const checklist = checklists.find(c => c.id === req.params.id);
  if (!checklist) {
    return res.status(404).json({ error: 'Checklist not found' });
  }
  res.json(checklist);
});

// Get completion status for a period
router.get('/status/:period', (req, res) => {
  const period = req.params.period;
  const periodCompletions = completions.filter(c => c.period === period);

  const status = checklists.map(checklist => {
    const completion = periodCompletions.find(c => c.checklistId === checklist.id);
    return {
      ...checklist,
      isCompleted: !!completion,
      completedAt: completion?.completedAt,
      completedBy: completion?.completedBy,
      notes: completion?.notes
    };
  });

  res.json(status);
});

// Mark checklist as complete
router.post('/:id/complete', (req, res) => {
  const { period, completedBy, notes } = req.body;

  const checklist = checklists.find(c => c.id === req.params.id);
  if (!checklist) {
    return res.status(404).json({ error: 'Checklist not found' });
  }

  // Check if already completed
  const existing = completions.find(
    c => c.checklistId === req.params.id && c.period === period
  );

  if (existing) {
    return res.status(400).json({ error: 'Already completed for this period' });
  }

  const completion: ChecklistCompletion = {
    id: `comp-${Date.now()}`,
    checklistId: req.params.id,
    completedAt: new Date().toISOString(),
    completedBy,
    period,
    notes
  };

  completions.push(completion);
  res.status(201).json(completion);
});

// Undo completion
router.delete('/:id/complete/:period', (req, res) => {
  const index = completions.findIndex(
    c => c.checklistId === req.params.id && c.period === req.params.period
  );

  if (index === -1) {
    return res.status(404).json({ error: 'Completion not found' });
  }

  completions.splice(index, 1);
  res.status(204).send();
});

// Create new checklist
router.post('/', (req, res) => {
  const newChecklist: ChecklistItem = {
    ...req.body,
    id: `check-${Date.now()}`
  };
  checklists.push(newChecklist);
  res.status(201).json(newChecklist);
});

// Default checklists
function getDefaultChecklists(): ChecklistItem[] {
  return [
    // Daily Tasks
    {
      id: 'daily-bank-reconciliation',
      category: 'Daily Tasks',
      title: 'Bank Reconciliation',
      description: 'Match bank transactions with Tally entries',
      frequency: 'daily',
      responsible: 'Accounts Executive',
      steps: [
        'Download bank statement from net banking',
        'Open Tally bank ledger',
        'Match each transaction',
        'Identify unmatched entries',
        'Create entries for missing transactions',
        'Update reconciliation date'
      ],
      tags: ['bank', 'reconciliation', 'daily']
    },
    {
      id: 'daily-sales-entry',
      category: 'Daily Tasks',
      title: 'Marketplace Sales Entry',
      description: 'Book daily sales from all marketplaces',
      frequency: 'daily',
      responsible: 'Accounts Executive',
      steps: [
        'Download Amazon settlement report',
        'Download Flipkart settlement report',
        'Verify order counts match dashboard',
        'Create sales entries in Tally',
        'Book marketplace fees as expenses',
        'Reconcile with payment received'
      ],
      tags: ['sales', 'marketplace', 'entry', 'daily']
    },
    // Weekly Tasks
    {
      id: 'weekly-vendor-payment',
      category: 'Weekly Tasks',
      title: 'Vendor Payment Processing',
      description: 'Process pending vendor payments',
      frequency: 'weekly',
      responsible: 'Accounts Manager',
      steps: [
        'Review pending invoices in Tally',
        'Verify invoice amounts and GST',
        'Check payment terms and due dates',
        'Prepare payment list',
        'Get approval from management',
        'Process payments via NEFT/RTGS',
        'Update payment entries in Tally'
      ],
      tags: ['vendor', 'payment', 'weekly']
    },
    {
      id: 'weekly-inventory-check',
      category: 'Weekly Tasks',
      title: 'Inventory Verification',
      description: 'Verify physical stock matches Tally records',
      frequency: 'weekly',
      responsible: 'Warehouse Manager',
      steps: [
        'Generate stock summary from Tally',
        'Conduct physical count of key SKUs',
        'Note discrepancies',
        'Investigate variances > 5%',
        'Create adjustment entries if needed',
        'Update stock register'
      ],
      tags: ['inventory', 'stock', 'verification', 'weekly']
    },
    // Monthly Tasks
    {
      id: 'monthly-gst-reconciliation',
      category: 'Monthly Compliance',
      title: 'GST Reconciliation (GSTR-2A)',
      description: 'Reconcile purchase register with GSTR-2A',
      frequency: 'monthly',
      dueDay: 10,
      responsible: 'Accounts Manager',
      steps: [
        'Download GSTR-2A from GST portal',
        'Export purchase register from Tally',
        'Match invoices by GSTIN and invoice number',
        'Identify missing invoices in 2A',
        'Follow up with vendors for missing invoices',
        'Prepare reconciliation report'
      ],
      tags: ['gst', 'gstr-2a', 'reconciliation', 'monthly']
    },
    {
      id: 'monthly-gstr1',
      category: 'Monthly Compliance',
      title: 'GSTR-1 Filing',
      description: 'File monthly GSTR-1 return',
      frequency: 'monthly',
      dueDay: 11,
      responsible: 'Accounts Manager',
      steps: [
        'Export sales register from Tally',
        'Segregate B2B and B2C sales',
        'Verify HSN summary',
        'Upload data to GST portal',
        'Verify auto-populated data',
        'File return and save ARN'
      ],
      tags: ['gst', 'gstr-1', 'filing', 'monthly', 'compliance']
    },
    {
      id: 'monthly-gstr3b',
      category: 'Monthly Compliance',
      title: 'GSTR-3B Filing',
      description: 'File monthly GSTR-3B return and pay GST',
      frequency: 'monthly',
      dueDay: 20,
      responsible: 'Accounts Manager',
      steps: [
        'Calculate total output GST',
        'Calculate eligible input GST',
        'Determine GST payable/refundable',
        'Fill GSTR-3B form',
        'Pay GST liability',
        'File return and save ARN'
      ],
      tags: ['gst', 'gstr-3b', 'filing', 'payment', 'monthly', 'compliance']
    },
    {
      id: 'monthly-tds-payment',
      category: 'Monthly Compliance',
      title: 'TDS Payment',
      description: 'Deposit TDS deducted during the month',
      frequency: 'monthly',
      dueDay: 7,
      responsible: 'Accounts Manager',
      steps: [
        'Generate TDS summary from Tally',
        'Verify TDS calculations',
        'Login to TIN-NSDL/e-filing portal',
        'Create challan for each TDS section',
        'Make payment via net banking',
        'Download challans and update Tally'
      ],
      tags: ['tds', 'payment', 'compliance', 'monthly']
    },
    {
      id: 'monthly-mis-preparation',
      category: 'Monthly Reporting',
      title: 'MIS Report Preparation',
      description: 'Prepare monthly P&L MIS report',
      frequency: 'monthly',
      dueDay: 5,
      responsible: 'Accounts Manager',
      steps: [
        'Close previous month in Tally',
        'Export Balance Sheet',
        'Export Journal entries',
        'Use MIS Calculator tool',
        'Classify all expenses',
        'Generate P&L report',
        'Present to management'
      ],
      tags: ['mis', 'reporting', 'p&l', 'monthly']
    },
    // Quarterly Tasks
    {
      id: 'quarterly-tds-return',
      category: 'Quarterly Compliance',
      title: 'TDS Return Filing',
      description: 'File quarterly TDS returns (24Q, 26Q)',
      frequency: 'quarterly',
      responsible: 'Accounts Manager',
      steps: [
        'Generate Form 16/16A data',
        'Verify all TDS challans',
        'Prepare TDS return file',
        'Validate using FVU utility',
        'Upload to TRACES portal',
        'Download acknowledgment',
        'Issue TDS certificates'
      ],
      tags: ['tds', 'return', 'quarterly', 'compliance']
    },
    {
      id: 'quarterly-advance-tax',
      category: 'Quarterly Compliance',
      title: 'Advance Tax Payment',
      description: 'Pay advance income tax installments',
      frequency: 'quarterly',
      responsible: 'CA/Tax Consultant',
      steps: [
        'Estimate annual income',
        'Calculate tax liability',
        'Determine advance tax installment',
        'Pay via challan 280',
        'Update tax payment records'
      ],
      tags: ['income-tax', 'advance-tax', 'quarterly', 'compliance']
    },
    // Yearly Tasks
    {
      id: 'yearly-audit',
      category: 'Yearly Compliance',
      title: 'Annual Audit',
      description: 'Complete statutory audit and finalize accounts',
      frequency: 'yearly',
      responsible: 'CA/Auditor',
      steps: [
        'Prepare trial balance',
        'Finalize all adjustments',
        'Prepare audit schedules',
        'Provide documents to auditor',
        'Address audit queries',
        'Finalize Balance Sheet',
        'Get auditor signature'
      ],
      tags: ['audit', 'yearly', 'compliance', 'financial-statements']
    },
    {
      id: 'yearly-itr',
      category: 'Yearly Compliance',
      title: 'Income Tax Return Filing',
      description: 'File annual income tax return',
      frequency: 'yearly',
      responsible: 'CA/Tax Consultant',
      steps: [
        'Finalize audited accounts',
        'Calculate total income',
        'Claim eligible deductions',
        'Reconcile with Form 26AS',
        'Prepare ITR form',
        'File return before due date',
        'Verify return'
      ],
      tags: ['income-tax', 'itr', 'yearly', 'compliance']
    }
  ];
}

export default router;
