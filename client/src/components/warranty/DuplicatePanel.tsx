import React, { useState } from 'react';
import {
  WarrantyCase,
  STATUS_LABELS,
  STATUS_COLORS,
  computeTicketAge,
  formatDate,
} from '../../types/warranty';
import {
  deleteWarrantyCases,
  updateWarrantyCase,
} from '../../utils/warrantyStorage';
import { DuplicateGroup } from '../../utils/warrantyDuplicateDetector';

interface DuplicatePanelProps {
  groups: DuplicateGroup[];
  onClose: () => void;
  onChanged: () => void;
}

export function DuplicatePanel({ groups, onClose, onChanged }: DuplicatePanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleGroups = groups.filter(g => !dismissed.has(g.key));

  async function handleKeep(group: DuplicateGroup, keepId: string) {
    const toDelete = group.cases.filter(c => c.id !== keepId).map(c => c.id);
    if (!confirm(`Delete ${toDelete.length} duplicate(s) and keep the selected case?`)) return;
    await deleteWarrantyCases(toDelete);
    onChanged();
  }

  async function handleMerge(group: DuplicateGroup) {
    if (group.cases.length < 2) return;
    const [primary, ...rest] = group.cases;
    const mergedNotes = group.cases
      .filter(c => c.notes)
      .map(c => `[${formatDate(c.createdAt)}] ${c.notes}`)
      .join('\n');
    const mergedIssue = group.cases
      .map(c => c.issueDescription)
      .filter((desc, i, arr) => arr.indexOf(desc) === i)
      .join(' | ');

    await updateWarrantyCase(primary.id, {
      notes: mergedNotes || primary.notes,
      issueDescription: mergedIssue || primary.issueDescription,
    });
    const toDelete = rest.map(c => c.id);
    await deleteWarrantyCases(toDelete);
    onChanged();
  }

  function handleDismiss(groupKey: string) {
    setDismissed(prev => new Set(prev).add(groupKey));
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-start justify-center p-4 z-50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Duplicate Management</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {visibleGroups.length} group{visibleGroups.length === 1 ? '' : 's'} of potential duplicates
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
          {visibleGroups.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No duplicate groups remaining.
            </div>
          ) : (
            visibleGroups.map(group => (
              <GroupCard
                key={group.key}
                group={group}
                onKeep={(keepId) => handleKeep(group, keepId)}
                onMerge={() => handleMerge(group)}
                onDismiss={() => handleDismiss(group.key)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  onKeep,
  onMerge,
  onDismiss,
}: {
  group: DuplicateGroup;
  onKeep: (keepId: string) => void;
  onMerge: () => void;
  onDismiss: () => void;
}) {
  const [selectedKeep, setSelectedKeep] = useState<string>(group.cases[0]?.id || '');

  return (
    <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl overflow-hidden">
      {/* Group header */}
      <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
        <div className="text-sm font-medium text-amber-200">
          {group.cases[0]?.customerPhone} · {group.cases[0]?.productName}
          <span className="ml-2 text-xs text-amber-400/70">{group.cases.length} cases</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-700"
        >
          Not duplicates
        </button>
      </div>

      {/* Side-by-side comparison */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-700">
              <th className="px-3 py-2 font-medium w-8">Keep</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Issue</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {group.cases.map(c => {
              const sc = STATUS_COLORS[c.status];
              const age = computeTicketAge(c);
              return (
                <tr
                  key={c.id}
                  className={`border-b border-slate-700/50 ${
                    selectedKeep === c.id ? 'bg-emerald-500/5' : 'hover:bg-slate-800/50'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name={`keep-${group.key}`}
                      checked={selectedKeep === c.id}
                      onChange={() => setSelectedKeep(c.id)}
                      className="accent-emerald-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-200">{c.customerName}</div>
                    <div className="text-slate-500">{c.customerPhone}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-300 max-w-xs truncate">
                    {c.issueDescription}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>
                      <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{formatDate(c.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-400">{age}d</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-slate-900/30 border-t border-slate-700 flex flex-wrap gap-2">
        <button
          onClick={() => onKeep(selectedKeep)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          Keep selected, delete others
        </button>
        <button
          onClick={onMerge}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
        >
          Merge all into oldest
        </button>
      </div>
    </div>
  );
}
