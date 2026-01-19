import React, { useState, useEffect, useCallback } from 'react';
import {
  MISCategory,
  ClassificationRule,
  ClassificationHistoryEntry,
  ClassificationStats,
  ClassificationResult,
  getCategories,
  getRules,
  getHistory,
  getStats,
  addRule,
  updateRule,
  deleteRule,
  classifyEntities,
  learnClassification,
  checkClassificationStatus,
  getHeadsList,
  getSubheadsForHead,
  formatConfidence,
  getSourceDisplayName,
  clearAllCaches
} from '../utils/classificationApi';

// ============================================
// TYPES
// ============================================

type TabType = 'dashboard' | 'rules' | 'categories' | 'history' | 'test' | 'settings';

interface PendingClassification {
  entityName: string;
  entityType: 'ledger' | 'party';
  suggestedHead: string | null;
  suggestedSubhead: string | null;
  selectedHead: string;
  selectedSubhead: string;
  confidence: number;
  source: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function Classifications() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [categories, setCategories] = useState<MISCategory[]>([]);
  const [rules, setRules] = useState<ClassificationRule[]>([]);
  const [history, setHistory] = useState<ClassificationHistoryEntry[]>([]);
  const [stats, setStats] = useState<ClassificationStats | null>(null);

  // Check connection and load initial data
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      setError(null);

      const status = await checkClassificationStatus();
      setIsConnected(status.connected);

      if (status.connected) {
        await loadAllData();
      } else {
        setError(status.error || 'Failed to connect to classification service');
      }

      setIsLoading(false);
    }

    init();
  }, []);

  const loadAllData = async () => {
    clearAllCaches();
    const [cats, rls, hist, sts] = await Promise.all([
      getCategories(),
      getRules(),
      getHistory(100),
      getStats()
    ]);
    setCategories(cats);
    setRules(rls);
    setHistory(hist);
    setStats(sts);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadAllData();
    setIsLoading(false);
  };

  // Tab content renderers
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab stats={stats} rules={rules} onRefresh={handleRefresh} />;
      case 'rules':
        return <RulesTab rules={rules} categories={categories} onRulesChange={loadAllData} />;
      case 'categories':
        return <CategoriesTab categories={categories} />;
      case 'history':
        return <HistoryTab history={history} />;
      case 'test':
        return <TestClassifierTab categories={categories} rules={rules} />;
      case 'settings':
        return <SettingsTab onRulesChange={loadAllData} />;
      default:
        return null;
    }
  };

  if (isLoading && isConnected === null) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Connecting to classification service...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Classification Manager</h1>
              <p className="text-slate-400 mt-1">Manage transaction classification rules and categories</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                isConnected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex gap-1 border-b border-slate-700">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'rules', label: 'Rules' },
              { id: 'categories', label: 'Categories' },
              { id: 'history', label: 'History' },
              { id: 'test', label: 'Test Classifier' },
              { id: 'settings', label: 'Settings' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'text-blue-400 border-blue-400'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-slate-800 rounded-xl p-6">
          {isConnected ? renderTabContent() : (
            <div className="text-center py-12">
              <p className="text-slate-400">Classification service is not connected</p>
              <button
                onClick={handleRefresh}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
              >
                Retry Connection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// DASHBOARD TAB
// ============================================

function DashboardTab({
  stats,
  rules,
  onRefresh
}: {
  stats: ClassificationStats | null;
  rules: ClassificationRule[];
  onRefresh: () => void;
}) {
  if (!stats) {
    return <div className="text-slate-400 text-center py-8">Loading statistics...</div>;
  }

  const topHeads = Object.entries(stats.rulesByHead)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const recentRules = [...rules]
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{stats.totalRules}</div>
          <div className="text-sm text-slate-400">Total Rules</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-400">{stats.rulesBySource.user || 0}</div>
          <div className="text-sm text-slate-400">Manual Rules</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-400">{stats.rulesBySource.gemini || 0}</div>
          <div className="text-sm text-slate-400">AI-Generated Rules</div>
        </div>
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{stats.recentClassifications}</div>
          <div className="text-sm text-slate-400">Classifications (30d)</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories */}
        <div className="bg-slate-700/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Top Categories</h3>
          {topHeads.length === 0 ? (
            <p className="text-slate-400 text-sm">No rules yet</p>
          ) : (
            <div className="space-y-3">
              {topHeads.map(([head, count]) => (
                <div key={head} className="flex items-center justify-between">
                  <span className="text-slate-300">{head}</span>
                  <span className="text-slate-400">{count} rules</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Rules */}
        <div className="bg-slate-700/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Rules</h3>
          {recentRules.length === 0 ? (
            <p className="text-slate-400 text-sm">No rules yet</p>
          ) : (
            <div className="space-y-3">
              {recentRules.map(rule => (
                <div key={rule.ruleId} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="text-slate-200">{rule.entityName}</div>
                    <div className="text-slate-500">{rule.head} / {rule.subhead}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    rule.source === 'user' ? 'bg-blue-900/30 text-blue-400' :
                    rule.source === 'gemini' ? 'bg-purple-900/30 text-purple-400' :
                    'bg-slate-600 text-slate-400'
                  }`}>
                    {getSourceDisplayName(rule.source)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-slate-700/30 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm"
          >
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// RULES TAB
// ============================================

function RulesTab({
  rules,
  categories,
  onRulesChange
}: {
  rules: ClassificationRule[];
  categories: MISCategory[];
  onRulesChange: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterHead, setFilterHead] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRule, setEditingRule] = useState<ClassificationRule | null>(null);

  const heads = getHeadsList(categories);

  const filteredRules = rules.filter(rule => {
    if (searchTerm && !rule.entityName.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filterHead && rule.head !== filterHead) {
      return false;
    }
    if (filterSource && rule.source !== filterSource) {
      return false;
    }
    return true;
  });

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    await deleteRule(ruleId);
    onRulesChange();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search entities..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-blue-500 flex-1 min-w-[200px]"
        />
        <select
          value={filterHead}
          onChange={e => setFilterHead(e.target.value)}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Heads</option>
          {heads.map(head => (
            <option key={head} value={head}>{head}</option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Sources</option>
          <option value="user">Manual</option>
          <option value="gemini">AI</option>
          <option value="system">System</option>
        </select>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
        >
          + Add Rule
        </button>
      </div>

      {/* Rules Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-3 pr-4">Entity Name</th>
              <th className="pb-3 pr-4">Head</th>
              <th className="pb-3 pr-4">Subhead</th>
              <th className="pb-3 pr-4 text-center">Source</th>
              <th className="pb-3 pr-4 text-center">Confidence</th>
              <th className="pb-3 pr-4 text-center">Used</th>
              <th className="pb-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No rules found
                </td>
              </tr>
            ) : (
              filteredRules.map(rule => (
                <tr key={rule.ruleId} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-3 pr-4 text-slate-200">{rule.entityName}</td>
                  <td className="py-3 pr-4 text-slate-300">{rule.head}</td>
                  <td className="py-3 pr-4 text-slate-400">{rule.subhead}</td>
                  <td className="py-3 pr-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      rule.source === 'user' ? 'bg-blue-900/30 text-blue-400' :
                      rule.source === 'gemini' ? 'bg-purple-900/30 text-purple-400' :
                      'bg-slate-600 text-slate-400'
                    }`}>
                      {getSourceDisplayName(rule.source)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-center text-slate-400">{formatConfidence(rule.confidence)}</td>
                  <td className="py-3 pr-4 text-center text-slate-400">{rule.timesUsed}</td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="text-blue-400 hover:text-blue-300 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.ruleId)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingRule) && (
        <RuleModal
          rule={editingRule}
          categories={categories}
          onClose={() => {
            setShowAddModal(false);
            setEditingRule(null);
          }}
          onSave={onRulesChange}
        />
      )}
    </div>
  );
}

// ============================================
// RULE MODAL
// ============================================

function RuleModal({
  rule,
  categories,
  onClose,
  onSave
}: {
  rule: ClassificationRule | null;
  categories: MISCategory[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [entityName, setEntityName] = useState(rule?.entityName || '');
  const [entityType, setEntityType] = useState<'ledger' | 'party'>(rule?.entityType || 'ledger');
  const [head, setHead] = useState(rule?.head || '');
  const [subhead, setSubhead] = useState(rule?.subhead || '');
  const [keywords, setKeywords] = useState(rule?.keywords || '');
  const [isSaving, setIsSaving] = useState(false);

  const heads = getHeadsList(categories);
  const subheads = head ? getSubheadsForHead(categories, head) : [];

  const handleSave = async () => {
    if (!entityName || !head || !subhead) return;

    setIsSaving(true);

    let success = false;
    if (rule) {
      success = await updateRule(rule.ruleId, { entityName, entityType, head, subhead, keywords });
      if (success) {
        alert('Rule updated successfully!');
      } else {
        alert('Failed to update rule. Please try again.');
      }
    } else {
      const result = await addRule({ entityName, entityType, head, subhead, keywords, source: 'user' });
      success = !!result;
      if (success) {
        alert('Rule added successfully!');
      } else {
        alert('Failed to add rule. Please try again.');
      }
    }

    setIsSaving(false);
    if (success) {
      onSave();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">
          {rule ? 'Edit Rule' : 'Add Rule'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Entity Name</label>
            <input
              type="text"
              value={entityName}
              onChange={e => setEntityName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
              placeholder="e.g., Meta Platforms India"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value as 'ledger' | 'party')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ledger">Ledger</option>
              <option value="party">Party</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Head</label>
            <select
              value={head}
              onChange={e => {
                setHead(e.target.value);
                setSubhead('');
              }}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">Select Head...</option>
              {heads.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Subhead</label>
            <select
              value={subhead}
              onChange={e => setSubhead(e.target.value)}
              disabled={!head}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">Select Subhead...</option>
              {subheads.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Keywords (comma-separated)</label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
              placeholder="e.g., facebook, meta, ads"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!entityName || !head || !subhead || isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CATEGORIES TAB
// ============================================

function CategoriesTab({ categories }: { categories: MISCategory[] }) {
  const [expandedHeads, setExpandedHeads] = useState<Set<string>>(new Set());

  const groupedCategories: Record<string, MISCategory[]> = {};
  for (const cat of categories) {
    if (!groupedCategories[cat.head]) {
      groupedCategories[cat.head] = [];
    }
    groupedCategories[cat.head].push(cat);
  }

  const toggleHead = (head: string) => {
    setExpandedHeads(prev => {
      const next = new Set(prev);
      if (next.has(head)) {
        next.delete(head);
      } else {
        next.add(head);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {Object.entries(groupedCategories).map(([head, subheads]) => (
        <div key={head} className="bg-slate-700/30 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleHead(head)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-700/50"
          >
            <div className="flex items-center gap-3">
              <span className="text-slate-200 font-medium">{head}</span>
              <span className={`px-2 py-0.5 rounded text-xs ${
                subheads[0].type === 'revenue' ? 'bg-green-900/30 text-green-400' :
                subheads[0].type === 'ignore' ? 'bg-slate-600 text-slate-400' :
                'bg-red-900/30 text-red-400'
              }`}>
                {subheads[0].type}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-sm">{subheads.length} subheads</span>
              <svg
                className={`w-5 h-5 text-slate-400 transition-transform ${expandedHeads.has(head) ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {expandedHeads.has(head) && (
            <div className="px-4 pb-3 border-t border-slate-700">
              <div className="pt-3 space-y-2">
                {subheads.map(cat => (
                  <div key={`${cat.head}-${cat.subhead}`} className="flex items-center justify-between py-1 px-3 bg-slate-700/50 rounded">
                    <span className="text-slate-300">{cat.subhead}</span>
                    <span className="text-slate-500 text-sm">{cat.plLine}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================
// HISTORY TAB
// ============================================

function HistoryTab({ history }: { history: ClassificationHistoryEntry[] }) {
  const [filterPeriod, setFilterPeriod] = useState<string>('');

  const periods = [...new Set(history.map(h => h.period).filter(Boolean))];

  const filteredHistory = filterPeriod
    ? history.filter(h => h.period === filterPeriod)
    : history;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterPeriod}
          onChange={e => setFilterPeriod(e.target.value)}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">All Periods</option>
          {periods.map(period => (
            <option key={period} value={period}>{period}</option>
          ))}
        </select>
      </div>

      {/* History Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-3 pr-4">Timestamp</th>
              <th className="pb-3 pr-4">Entity</th>
              <th className="pb-3 pr-4">Head</th>
              <th className="pb-3 pr-4">Subhead</th>
              <th className="pb-3 pr-4 text-right">Amount</th>
              <th className="pb-3 pr-4">Classified By</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No classification history
                </td>
              </tr>
            ) : (
              filteredHistory.map((entry, index) => (
                <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-3 pr-4 text-slate-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-slate-200">{entry.entity}</td>
                  <td className="py-3 pr-4 text-slate-300">{entry.head}</td>
                  <td className="py-3 pr-4 text-slate-400">{entry.subhead}</td>
                  <td className="py-3 pr-4 text-right text-slate-300">
                    {entry.amount ? entry.amount.toLocaleString('en-IN') : '-'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      entry.classifiedBy === 'user' ? 'bg-blue-900/30 text-blue-400' :
                      entry.classifiedBy === 'gemini' ? 'bg-purple-900/30 text-purple-400' :
                      'bg-slate-600 text-slate-400'
                    }`}>
                      {getSourceDisplayName(entry.classifiedBy)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// TEST CLASSIFIER TAB
// ============================================

function TestClassifierTab({
  categories,
  rules
}: {
  categories: MISCategory[];
  rules: ClassificationRule[];
}) {
  const [testInput, setTestInput] = useState('');
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);

  const handleClassify = async () => {
    if (!testInput.trim()) return;

    setIsClassifying(true);

    // Parse input - one entity per line
    const entities = testInput
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(name => ({ name, type: 'ledger' as const }));

    const classificationResults = await classifyEntities(entities);
    setResults(classificationResults);

    setIsClassifying(false);
  };

  const handleLearn = async (result: ClassificationResult, head: string, subhead: string) => {
    await learnClassification({
      entityName: result.entityName,
      entityType: 'ledger',
      head,
      subhead
    });

    // Update result in list
    setResults(prev => prev.map(r =>
      r.entityName === result.entityName
        ? { ...r, head, subhead, confidence: 100, source: 'rule' as const }
        : r
    ));
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm text-slate-400 mb-2">
          Enter entity names to classify (one per line)
        </label>
        <textarea
          value={testInput}
          onChange={e => setTestInput(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 font-mono text-sm"
          placeholder="Meta Platforms India Pvt Ltd&#10;Google India Pvt Ltd&#10;Shopify Subscription&#10;Amazon Seller Services"
        />
        <button
          onClick={handleClassify}
          disabled={isClassifying || !testInput.trim()}
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50"
        >
          {isClassifying ? 'Classifying...' : 'Classify'}
        </button>
      </div>

      {results.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Results</h3>
          <div className="space-y-3">
            {results.map((result, index) => (
              <TestResultItem
                key={index}
                result={result}
                categories={categories}
                onLearn={handleLearn}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TestResultItem({
  result,
  categories,
  onLearn
}: {
  result: ClassificationResult;
  categories: MISCategory[];
  onLearn: (result: ClassificationResult, head: string, subhead: string) => void;
}) {
  const [selectedHead, setSelectedHead] = useState(result.head || '');
  const [selectedSubhead, setSelectedSubhead] = useState(result.subhead || '');
  const [isLearning, setIsLearning] = useState(false);

  const heads = getHeadsList(categories);
  const subheads = selectedHead ? getSubheadsForHead(categories, selectedHead) : [];

  const handleSave = async () => {
    if (!selectedHead || !selectedSubhead) return;
    setIsLearning(true);
    await onLearn(result, selectedHead, selectedSubhead);
    setIsLearning(false);
  };

  const needsSelection = !result.head || !result.subhead || result.needsReview;

  return (
    <div className={`p-4 rounded-lg ${
      needsSelection ? 'bg-yellow-900/20 border border-yellow-800' : 'bg-slate-700/30'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-medium text-slate-200">{result.entityName}</div>
          {result.head && result.subhead && (
            <div className="text-sm text-slate-400 mt-1">
              {result.head} / {result.subhead}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2 py-0.5 rounded text-xs ${
              result.source === 'rule' ? 'bg-blue-900/30 text-blue-400' :
              result.source === 'gemini' ? 'bg-purple-900/30 text-purple-400' :
              result.source === 'similarity' ? 'bg-cyan-900/30 text-cyan-400' :
              'bg-slate-600 text-slate-400'
            }`}>
              {getSourceDisplayName(result.source)}
            </span>
            <span className="text-slate-500 text-xs">
              {formatConfidence(result.confidence)} confidence
            </span>
          </div>
          {result.reasoning && (
            <div className="text-xs text-slate-500 mt-1">{result.reasoning}</div>
          )}
        </div>

        {needsSelection && (
          <div className="flex items-center gap-2">
            <select
              value={selectedHead}
              onChange={e => {
                setSelectedHead(e.target.value);
                setSelectedSubhead('');
              }}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm"
            >
              <option value="">Head...</option>
              {heads.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <select
              value={selectedSubhead}
              onChange={e => setSelectedSubhead(e.target.value)}
              disabled={!selectedHead}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm disabled:opacity-50"
            >
              <option value="">Subhead...</option>
              {subheads.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={!selectedHead || !selectedSubhead || isLearning}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-sm disabled:opacity-50"
            >
              {isLearning ? '...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// SETTINGS TAB
// ============================================

interface MigrationStatus {
  migrationCompleted: boolean;
  lastMigrationDate: string;
  currentRulesCount: number;
  migrationRulesCount: number;
}

interface ClassificationConfig {
  geminiPrompt: string;
  geminiModel: string;
  geminiTemperature: number;
  confidenceAutoAccept: number;
  confidenceNeedsReview: number;
}

function SettingsTab({ onRulesChange }: { onRulesChange: () => void }) {
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [config, setConfig] = useState<ClassificationConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editable config fields
  const [editedPrompt, setEditedPrompt] = useState('');
  const [editedModel, setEditedModel] = useState('');
  const [editedTemperature, setEditedTemperature] = useState(0);
  const [editedAutoAccept, setEditedAutoAccept] = useState(80);
  const [editedNeedsReview, setEditedNeedsReview] = useState(50);

  const API_BASE_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      // Fetch migration status
      const statusRes = await fetch(`${API_BASE_URL}/api/classification/migration/status`);
      if (statusRes.ok) {
        const status = await statusRes.json();
        setMigrationStatus(status);
      }

      // Fetch config
      const configRes = await fetch(`${API_BASE_URL}/api/classification/config`);
      if (configRes.ok) {
        const cfg = await configRes.json();
        setConfig(cfg);
        setEditedPrompt(cfg.geminiPrompt || '');
        setEditedModel(cfg.geminiModel || 'gemini-1.5-flash');
        setEditedTemperature(cfg.geminiTemperature ?? 0.3);
        setEditedAutoAccept(cfg.confidenceAutoAccept ?? 80);
        setEditedNeedsReview(cfg.confidenceNeedsReview ?? 50);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    setIsLoading(false);
  };

  const handleRunMigration = async (force: boolean = false) => {
    setIsMigrating(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/classification/migration/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force })
      });

      const result = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: result.message || `Successfully migrated ${result.rulesAdded} rules!` });
        await loadSettings();
        onRulesChange();
      } else {
        setMessage({ type: 'error', text: result.error || 'Migration failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to run migration' });
    }

    setIsMigrating(false);
  };

  const handleResetMigration = async () => {
    if (!confirm('Are you sure you want to reset the migration? This will clear ALL rules from Google Sheets.')) {
      return;
    }

    setIsMigrating(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/classification/migration/reset`, {
        method: 'POST'
      });

      const result = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: result.message || 'Migration reset successfully' });
        await loadSettings();
        onRulesChange();
      } else {
        setMessage({ type: 'error', text: result.error || 'Reset failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset migration' });
    }

    setIsMigrating(false);
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/classification/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiPrompt: editedPrompt,
          geminiModel: editedModel,
          geminiTemperature: editedTemperature,
          confidenceAutoAccept: editedAutoAccept,
          confidenceNeedsReview: editedNeedsReview
        })
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuration saved successfully!' });
        await loadSettings();
      } else {
        setMessage({ type: 'error', text: 'Failed to save configuration' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    }

    setIsSavingConfig(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-900/30 border border-green-800 text-green-400' :
          'bg-red-900/30 border border-red-800 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Migration Section */}
      <div className="bg-slate-700/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Rules Migration</h3>
        <p className="text-slate-400 text-sm mb-4">
          Migrate hardcoded classification rules from the codebase to Google Sheets.
          This allows you to view, edit, and manage all rules directly in Sheets.
        </p>

        {/* Migration Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xl font-bold text-white">{migrationStatus?.currentRulesCount || 0}</div>
            <div className="text-xs text-slate-400">Rules in Sheets</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xl font-bold text-blue-400">{migrationStatus?.migrationRulesCount || 0}</div>
            <div className="text-xs text-slate-400">Rules to Migrate</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className={`text-xl font-bold ${migrationStatus?.migrationCompleted ? 'text-green-400' : 'text-yellow-400'}`}>
              {migrationStatus?.migrationCompleted ? 'Yes' : 'No'}
            </div>
            <div className="text-xs text-slate-400">Migration Done</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-sm font-medium text-slate-300 truncate">
              {migrationStatus?.lastMigrationDate
                ? new Date(migrationStatus.lastMigrationDate).toLocaleDateString()
                : 'Never'}
            </div>
            <div className="text-xs text-slate-400">Last Migration</div>
          </div>
        </div>

        {/* Migration Actions */}
        <div className="flex flex-wrap gap-3">
          {!migrationStatus?.migrationCompleted ? (
            <button
              onClick={() => handleRunMigration(false)}
              disabled={isMigrating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50"
            >
              {isMigrating ? 'Migrating...' : 'Run Migration'}
            </button>
          ) : (
            <button
              onClick={() => handleRunMigration(true)}
              disabled={isMigrating}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg disabled:opacity-50"
            >
              {isMigrating ? 'Migrating...' : 'Re-run Migration (Force)'}
            </button>
          )}
          <button
            onClick={handleResetMigration}
            disabled={isMigrating}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-50"
          >
            Reset Migration
          </button>
        </div>
      </div>

      {/* AI Configuration Section */}
      <div className="bg-slate-700/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">AI Configuration</h3>
        <p className="text-slate-400 text-sm mb-4">
          Configure Gemini AI settings for automatic classification.
          The prompt and parameters below control how the AI classifies transactions.
        </p>

        <div className="space-y-4">
          {/* Model Selection */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Gemini Model</label>
            <select
              value={editedModel}
              onChange={e => setEditedModel(e.target.value)}
              className="w-full md:w-auto px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="gemini-3-flash-preview">gemini-3-flash-preview (Recommended)</option>
              <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Temperature: {editedTemperature.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={editedTemperature}
              onChange={e => setEditedTemperature(parseFloat(e.target.value))}
              className="w-full md:w-64"
            />
            <div className="text-xs text-slate-500 mt-1">
              Lower = more consistent, Higher = more creative
            </div>
          </div>

          {/* Confidence Thresholds */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Auto-Accept Threshold: {editedAutoAccept}%
              </label>
              <input
                type="range"
                min="50"
                max="100"
                step="5"
                value={editedAutoAccept}
                onChange={e => setEditedAutoAccept(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-slate-500 mt-1">
                Classifications above this are auto-accepted
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Needs Review Threshold: {editedNeedsReview}%
              </label>
              <input
                type="range"
                min="0"
                max="80"
                step="5"
                value={editedNeedsReview}
                onChange={e => setEditedNeedsReview(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="text-xs text-slate-500 mt-1">
                Classifications below this need manual review
              </div>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">Classification Prompt</label>
            <textarea
              value={editedPrompt}
              onChange={e => setEditedPrompt(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 font-mono text-sm focus:outline-none focus:border-blue-500"
              placeholder="Enter the prompt for Gemini AI classification..."
            />
            <div className="text-xs text-slate-500 mt-1">
              This prompt is sent to Gemini when classifying unknown transactions.
              Leave empty to use the default prompt.
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50"
            >
              {isSavingConfig ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* Google Sheets Link */}
      <div className="bg-slate-700/30 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Google Sheets</h3>
        <p className="text-slate-400 text-sm mb-4">
          Access your classification data directly in Google Sheets. You can view and edit rules,
          categories, and configuration from the spreadsheet.
        </p>
        <a
          href="https://docs.google.com/spreadsheets/d/1CgClltIfhvQMZ9kxQ2MqfcebyZzDoZdg6i2evHAo3JI/edit"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" stroke="currentColor" strokeWidth="2" fill="none"/>
            <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" fill="none"/>
            <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="2"/>
            <line x1="8" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Open Google Sheets
        </a>
      </div>
    </div>
  );
}
