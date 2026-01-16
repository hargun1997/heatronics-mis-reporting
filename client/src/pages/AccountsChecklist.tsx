import { useState, useEffect } from 'react';

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  dueDay?: number;
  responsible: string;
  steps: string[];
  tags: string[];
}

interface ChecklistStatus {
  checklistId: string;
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

// Default checklists
const defaultChecklists: ChecklistItem[] = [
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
    id: 'monthly-mis',
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

const frequencyColors = {
  daily: 'bg-blue-100 text-blue-700',
  weekly: 'bg-purple-100 text-purple-700',
  monthly: 'bg-green-100 text-green-700',
  quarterly: 'bg-orange-100 text-orange-700',
  yearly: 'bg-red-100 text-red-700'
};

export function AccountsChecklist() {
  const [checklists, setChecklists] = useState<ChecklistItem[]>(defaultChecklists);
  const [completions, setCompletions] = useState<Record<string, ChecklistStatus>>({});
  const [selectedFrequency, setSelectedFrequency] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Load completions from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`checklist-completions-${currentPeriod}`);
    if (saved) {
      setCompletions(JSON.parse(saved));
    }
  }, [currentPeriod]);

  // Save completions to localStorage
  const saveCompletions = (newCompletions: Record<string, ChecklistStatus>) => {
    setCompletions(newCompletions);
    localStorage.setItem(`checklist-completions-${currentPeriod}`, JSON.stringify(newCompletions));
  };

  // Toggle completion
  const toggleCompletion = (checklistId: string) => {
    const isCurrentlyComplete = completions[checklistId]?.isCompleted;
    const newCompletions = {
      ...completions,
      [checklistId]: {
        checklistId,
        isCompleted: !isCurrentlyComplete,
        completedAt: !isCurrentlyComplete ? new Date().toISOString() : undefined,
        completedBy: 'User'
      }
    };
    saveCompletions(newCompletions);
  };

  // Get categories and frequencies
  const categories = ['all', ...new Set(checklists.map(c => c.category))];
  const frequencies = ['all', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

  // Filter checklists
  const filteredChecklists = checklists.filter(checklist => {
    const matchesFrequency = selectedFrequency === 'all' || checklist.frequency === selectedFrequency;
    const matchesCategory = selectedCategory === 'all' || checklist.category === selectedCategory;
    return matchesFrequency && matchesCategory;
  });

  // Group by category
  const groupedChecklists = filteredChecklists.reduce((acc, checklist) => {
    if (!acc[checklist.category]) {
      acc[checklist.category] = [];
    }
    acc[checklist.category].push(checklist);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  // Calculate stats
  const totalTasks = filteredChecklists.length;
  const completedTasks = filteredChecklists.filter(c => completions[c.id]?.isCompleted).length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Progress Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Period: {currentPeriod}</h3>
            <p className="text-sm text-gray-500">{completedTasks} of {totalTasks} tasks completed</p>
          </div>
          <div className="text-3xl font-bold text-blue-600">{progress}%</div>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Frequency Filter */}
        <div className="flex gap-2 flex-wrap">
          {frequencies.map(freq => (
            <button
              key={freq}
              onClick={() => setSelectedFrequency(freq)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedFrequency === freq
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {freq === 'all' ? 'All Frequencies' : freq.charAt(0).toUpperCase() + freq.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'All Categories' : cat}
          </button>
        ))}
      </div>

      {/* Checklists */}
      <div className="space-y-6">
        {Object.entries(groupedChecklists).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {category}
            </h3>
            <div className="space-y-3">
              {items.map(checklist => {
                const isCompleted = completions[checklist.id]?.isCompleted;
                const isExpanded = expandedId === checklist.id;

                return (
                  <div
                    key={checklist.id}
                    className={`bg-white rounded-lg border transition-all ${
                      isCompleted ? 'border-green-200 bg-green-50' : 'border-gray-200'
                    }`}
                  >
                    {/* Header */}
                    <div className="p-4 flex items-center gap-4">
                      <button
                        onClick={() => toggleCompletion(checklist.id)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isCompleted
                            ? 'border-green-500 bg-green-500 text-white'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {isCompleted && (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`font-medium ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                            {checklist.title}
                          </h4>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${frequencyColors[checklist.frequency]}`}>
                            {checklist.frequency}
                          </span>
                          {checklist.dueDay && (
                            <span className="text-xs text-gray-400">
                              Due: {checklist.dueDay}th
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{checklist.description}</p>
                      </div>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : checklist.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <svg
                          className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>

                    {/* Expanded Steps */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                        <div className="mt-4">
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Steps:</h5>
                          <ol className="space-y-2">
                            {checklist.steps.map((step, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>

                        <div className="mt-4 flex items-center justify-between text-sm">
                          <span className="text-gray-500">
                            Responsible: <span className="font-medium text-gray-700">{checklist.responsible}</span>
                          </span>
                          {isCompleted && completions[checklist.id]?.completedAt && (
                            <span className="text-green-600">
                              Completed: {new Date(completions[checklist.id].completedAt!).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredChecklists.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No tasks found matching your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
