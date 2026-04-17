import React, { useEffect, useMemo, useState } from 'react';
import {
  WarrantyCase,
  WarrantyStatus,
  WARRANTY_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  computeTicketAge,
  formatDate,
} from '../types/warranty';
import {
  loadWarrantyData,
  deleteWarrantyCase,
} from '../utils/warrantyStorage';
import {
  findAllDuplicateGroups,
} from '../utils/warrantyDuplicateDetector';
import { CaseModal } from '../components/warranty/CaseModal';

type ChartView = 'active' | 'closed' | 'both';

export function WarrantyManagement() {
  const [cases, setCases] = useState<WarrantyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<WarrantyStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [chartView, setChartView] = useState<ChartView>('active');
  const [showDuplicatePanel, setShowDuplicatePanel] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [creatingCase, setCreatingCase] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    const data = await loadWarrantyData();
    setCases(data.cases);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const counts: Record<WarrantyStatus, number> = {
      'new': 0, 'in-progress': 0, 'approved': 0, 'rejected': 0, 'completed': 0, 'shipped': 0
    };
    for (const c of cases) counts[c.status]++;
    const active = counts['new'] + counts['in-progress'] + counts['approved'];
    const closed = counts['completed'] + counts['rejected'];
    return { counts, active, closed, shipped: counts['shipped'], rejected: counts['rejected'], completed: counts['completed'], total: cases.length };
  }, [cases]);

  const duplicateGroups = useMemo(() => findAllDuplicateGroups(cases), [cases]);
  const duplicateCaseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of duplicateGroups) for (const c of g.cases) ids.add(c.id);
    return ids;
  }, [duplicateGroups]);

  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom).getTime() : 0;
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;

    return cases.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (duplicatesOnly && !duplicateCaseIds.has(c.id)) return false;
      const created = new Date(c.createdAt).getTime();
      if (created < from || created > to) return false;
      if (q) {
        const hay = `${c.customerName} ${c.customerPhone} ${c.customerEmail || ''} ${c.productName} ${c.serialNumber || ''} ${c.issueDescription}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cases, statusFilter, searchQuery, dateFrom, dateTo, duplicatesOnly, duplicateCaseIds]);

  async function handleDelete(caseId: string) {
    if (!confirm('Delete this case permanently?')) return;
    await deleteWarrantyCase(caseId);
    await refresh();
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Warranty Management</h1>
          <p className="mt-1 text-slate-400 text-sm">
            Track warranty cases, manage duplicates, and monitor shipments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDuplicatePanel(v => !v)}
            className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              duplicateGroups.length > 0
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {duplicateGroups.length > 0
              ? `⚠ ${duplicateGroups.length} Duplicate ${duplicateGroups.length === 1 ? 'Group' : 'Groups'}`
              : 'No Duplicates'}
          </button>
          <button
            onClick={() => setCreatingCase(true)}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            + New Case
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} accent="slate" />
        <StatCard label="Active" value={stats.active} accent="blue" />
        <StatCard label="Shipped" value={stats.shipped} accent="violet" />
        <StatCard label="Completed" value={stats.completed} accent="emerald" />
        <StatCard label="Rejected" value={stats.rejected} accent="red" />
        <StatCard label="Duplicates" value={duplicateCaseIds.size} accent="amber" />
      </div>

      {/* Status Distribution Chart — FIX #3: split active vs closed */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">Status Distribution</h2>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1">
            {(['active', 'closed', 'both'] as ChartView[]).map(v => (
              <button
                key={v}
                onClick={() => setChartView(v)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
                  chartView === v ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {(chartView === 'active' || chartView === 'both') && (
          <StatusBar
            label="Active"
            statuses={['new', 'in-progress', 'approved', 'shipped']}
            counts={stats.counts}
          />
        )}
        {(chartView === 'closed' || chartView === 'both') && (
          <StatusBar
            label="Closed"
            statuses={['completed', 'rejected']}
            counts={stats.counts}
          />
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as WarrantyStatus | 'all')}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              {WARRANTY_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Name, phone, product, serial..."
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={duplicatesOnly}
              onChange={e => setDuplicatesOnly(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            Show duplicates only
          </label>
          {(searchQuery || statusFilter !== 'all' || dateFrom || dateTo || duplicatesOnly) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setDateFrom('');
                setDateTo('');
                setDuplicatesOnly(false);
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Case List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      ) : filteredCases.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/30 border border-slate-700 border-dashed rounded-xl">
          <p className="text-slate-400 text-sm">
            {cases.length === 0 ? 'No warranty cases yet. Click "New Case" to add one.' : 'No cases match your filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCases.map(c => (
            <CaseCard
              key={c.id}
              case_={c}
              isDuplicate={duplicateCaseIds.has(c.id)}
              onEdit={() => setEditingCaseId(c.id)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </div>
      )}

      {/* Case create/edit modal */}
      {creatingCase && (
        <CaseModal
          mode="create"
          allCases={cases}
          onClose={() => setCreatingCase(false)}
          onSaved={refresh}
        />
      )}
      {editingCaseId && (() => {
        const target = cases.find(c => c.id === editingCaseId);
        if (!target) return null;
        return (
          <CaseModal
            mode="edit"
            existingCase={target}
            allCases={cases}
            onClose={() => setEditingCaseId(null)}
            onSaved={refresh}
          />
        );
      })()}
      {showDuplicatePanel && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setShowDuplicatePanel(false)}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-slate-300">
            Duplicate management panel coming in Part 2.
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

const accentClasses: Record<string, { bg: string; text: string; border: string }> = {
  slate: { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  red: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  const c = accentClasses[accent] || accentClasses.slate;
  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-3`}>
      <div className={`text-xs font-medium ${c.text} uppercase tracking-wide`}>{label}</div>
      <div className="text-2xl font-semibold text-slate-100 mt-1">{value}</div>
    </div>
  );
}

function StatusBar({
  label,
  statuses,
  counts,
}: {
  label: string;
  statuses: WarrantyStatus[];
  counts: Record<WarrantyStatus, number>;
}) {
  const total = statuses.reduce((sum, s) => sum + counts[s], 0);
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        <span className="text-xs text-slate-500">{total} case{total === 1 ? '' : 's'}</span>
      </div>
      {total === 0 ? (
        <div className="h-8 bg-slate-900 rounded-lg flex items-center justify-center">
          <span className="text-xs text-slate-600">No {label.toLowerCase()} cases</span>
        </div>
      ) : (
        <>
          <div className="flex h-8 rounded-lg overflow-hidden bg-slate-900">
            {statuses.map(s => {
              const count = counts[s];
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={s}
                  className={`${STATUS_COLORS[s].dot} flex items-center justify-center transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${STATUS_LABELS[s]}: ${count} (${pct.toFixed(0)}%)`}
                >
                  {pct > 10 && (
                    <span className="text-xs font-semibold text-slate-900">{count}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {statuses.map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[s].dot}`} />
                <span className="text-xs text-slate-400">
                  {STATUS_LABELS[s]}: <span className="text-slate-200 font-medium">{counts[s]}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CaseCard({
  case_,
  isDuplicate,
  onEdit,
  onDelete,
}: {
  case_: WarrantyCase;
  isDuplicate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const statusColor = STATUS_COLORS[case_.status];
  const age = computeTicketAge(case_);
  const isOpen = !['completed', 'rejected'].includes(case_.status);

  return (
    <div className={`bg-slate-800/50 border rounded-lg p-4 hover:bg-slate-800 transition-colors ${
      isDuplicate ? 'border-amber-500/40' : 'border-slate-700'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        {/* Left: info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-slate-100">{case_.customerName}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusColor.bg} ${statusColor.text} ${statusColor.border} border`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`} />
              {STATUS_LABELS[case_.status]}
            </span>
            {isDuplicate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                ⚠ Duplicate
              </span>
            )}
            <span className={`text-xs ${isOpen && age > 14 ? 'text-red-400' : isOpen && age > 7 ? 'text-amber-400' : 'text-slate-500'}`}>
              {age} day{age === 1 ? '' : 's'} {isOpen ? 'old' : ''}
            </span>
          </div>
          <div className="text-sm text-slate-400 truncate">
            {case_.customerPhone} · {case_.productName}
            {case_.serialNumber && <> · SN: {case_.serialNumber}</>}
          </div>
          <div className="text-sm text-slate-300 mt-1 line-clamp-2">{case_.issueDescription}</div>
          {/* Lifecycle timeline */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            <span>Created: <span className="text-slate-300">{formatDate(case_.createdAt)}</span></span>
            {case_.approvedAt && <span>Approved: <span className="text-emerald-400">{formatDate(case_.approvedAt)}</span></span>}
            {case_.rejectedAt && <span>Rejected: <span className="text-red-400">{formatDate(case_.rejectedAt)}</span></span>}
            {case_.shippedAt && <span>Shipped: <span className="text-violet-400">{formatDate(case_.shippedAt)}</span></span>}
            {case_.completedAt && <span>Completed: <span className="text-slate-300">{formatDate(case_.completedAt)}</span></span>}
          </div>
        </div>
        {/* Right: actions */}
        <div className="flex sm:flex-col gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1 text-xs font-medium rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
