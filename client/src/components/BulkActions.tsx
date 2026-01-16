import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Heads, Classification } from '../types';
import { HEAD_ORDER, HEAD_COLORS } from '../data/defaultHeads';

interface BulkActionsProps {
  selectedCount: number;
  onClassify: (head: string, subhead: string) => void;
  onClearSelection: () => void;
  onApplyAllSuggestions: () => void;
  heads: Heads;
  hasSelectedWithSuggestions: boolean;
}

export function BulkActions({
  selectedCount,
  onClassify,
  onClearSelection,
  onApplyAllSuggestions,
  heads,
  hasSelectedWithSuggestions
}: BulkActionsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showDropdown && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showDropdown]);

  const allOptions = useMemo(() => {
    const options: { head: string; subhead: string; display: string }[] = [];
    HEAD_ORDER.forEach(head => {
      if (heads[head]) {
        heads[head].subheads.forEach(subhead => {
          options.push({
            head,
            subhead,
            display: `${head} > ${subhead}`
          });
        });
      }
    });
    return options;
  }, [heads]);

  const filteredOptions = useMemo(() => {
    if (!search) return allOptions;
    const searchLower = search.toLowerCase();
    return allOptions.filter(opt =>
      opt.display.toLowerCase().includes(searchLower)
    );
  }, [allOptions, search]);

  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="font-medium">{selectedCount} selected</span>
        <button
          onClick={onClearSelection}
          className="text-blue-200 hover:text-white text-sm"
        >
          Clear selection
        </button>
      </div>

      <div className="flex items-center gap-3">
        {hasSelectedWithSuggestions && (
          <button
            onClick={onApplyAllSuggestions}
            className="px-3 py-1.5 bg-yellow-500 text-yellow-900 rounded text-sm font-medium hover:bg-yellow-400"
          >
            Apply all suggestions
          </button>
        )}

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="px-3 py-1.5 bg-white text-blue-600 rounded text-sm font-medium hover:bg-blue-50 flex items-center gap-2"
          >
            Classify as...
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="p-2 border-b border-gray-100">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type to search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredOptions.length > 0) {
                      onClassify(filteredOptions[0].head, filteredOptions[0].subhead);
                      setShowDropdown(false);
                      setSearch('');
                    } else if (e.key === 'Escape') {
                      setShowDropdown(false);
                    }
                  }}
                />
              </div>

              <div className="max-h-64 overflow-y-auto">
                {filteredOptions.map((opt, idx) => (
                  <div
                    key={`${opt.head}-${opt.subhead}`}
                    onClick={() => {
                      onClassify(opt.head, opt.subhead);
                      setShowDropdown(false);
                      setSearch('');
                    }}
                    className={`
                      px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 text-gray-900
                      ${idx > 0 && filteredOptions[idx - 1].head !== opt.head ? 'border-t border-gray-100' : ''}
                    `}
                  >
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-2 ${HEAD_COLORS[opt.head] || 'bg-gray-100'}`}>
                      {opt.head.split('.')[0]}
                    </span>
                    <span>{opt.subhead}</span>
                  </div>
                ))}
                {filteredOptions.length === 0 && (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    No matching options
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
