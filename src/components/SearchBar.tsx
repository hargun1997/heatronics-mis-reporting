import React from 'react';
import { FilterState, Heads } from '../types';
import { HEAD_ORDER } from '../data/defaultHeads';

interface SearchBarProps {
  filter: FilterState;
  onFilterChange: (filter: FilterState) => void;
  progress: number;
  stats: {
    total: number;
    classified: number;
    suggested: number;
    unclassified: number;
  };
  heads: Heads;
}

export function SearchBar({
  filter,
  onFilterChange,
  progress,
  stats,
  heads
}: SearchBarProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search input */}
        <div className="flex-1 min-w-[250px]">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search accounts, dates, notes..."
              value={filter.search}
              onChange={(e) => onFilterChange({ ...filter, search: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {filter.search && (
              <button
                onClick={() => onFilterChange({ ...filter, search: '' })}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Status:</label>
          <select
            value={filter.status}
            onChange={(e) => onFilterChange({ ...filter, status: e.target.value as FilterState['status'] })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All ({stats.total})</option>
            <option value="unclassified">Unclassified ({stats.unclassified})</option>
            <option value="suggested">Suggested ({stats.suggested})</option>
            <option value="classified">Classified ({stats.classified})</option>
          </select>
        </div>

        {/* Head filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Head:</label>
          <select
            value={filter.head || ''}
            onChange={(e) => onFilterChange({ ...filter, head: e.target.value || null })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Heads</option>
            {HEAD_ORDER.filter(h => heads[h]).map(head => (
              <option key={head} value={head}>{head}</option>
            ))}
          </select>
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Type:</label>
          <select
            value={filter.type}
            onChange={(e) => onFilterChange({ ...filter, type: e.target.value as FilterState['type'] })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="debit">Debits Only</option>
            <option value="credit">Credits Only</option>
          </select>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="text-sm text-gray-600">
            Progress: <span className="font-semibold">{progress}%</span>
          </div>
          <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
