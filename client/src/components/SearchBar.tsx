import React from 'react';
import { FilterState, Heads } from '../types';
import { HEAD_ORDER } from '../data/defaultHeads';

// Channel options for Revenue and Returns heads
const CHANNEL_OPTIONS = ['Amazon', 'Website', 'Blinkit', 'Offline/OEM'];

interface SearchBarProps {
  filter: FilterState;
  onFilterChange: (filter: FilterState) => void;
  totalCount: number;
  filteredCount: number;
  heads: Heads;
}

export function SearchBar({
  filter,
  onFilterChange,
  totalCount,
  filteredCount,
  heads
}: SearchBarProps) {
  // Check if current head is Revenue or Returns (show channel filter)
  const showChannelFilter = filter.head === 'A. Revenue' || filter.head === 'B. Returns';

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search input */}
        <div className="flex-1 min-w-[200px]">
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

        {/* Head filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Head:</label>
          <select
            value={filter.head || ''}
            onChange={(e) => onFilterChange({ ...filter, head: e.target.value || null, subhead: null })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Heads</option>
            {HEAD_ORDER.filter(h => heads[h] && h !== 'Z. Ignore (Non-P&L)').map(head => (
              <option key={head} value={head}>{head}</option>
            ))}
          </select>
        </div>

        {/* Channel filter - only for Revenue and Returns */}
        {showChannelFilter && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Channel:</label>
            <select
              value={filter.subhead || ''}
              onChange={(e) => onFilterChange({ ...filter, subhead: e.target.value || null })}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Channels</option>
              {CHANNEL_OPTIONS.map(channel => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
          </div>
        )}

        {/* Item count */}
        <div className="flex items-center gap-2 ml-auto text-sm text-gray-600">
          <span>
            Showing <span className="font-semibold">{filteredCount}</span> of <span className="font-semibold">{totalCount}</span> items
          </span>
        </div>
      </div>
    </div>
  );
}
