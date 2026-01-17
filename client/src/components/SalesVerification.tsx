import React, { useState, useMemo } from 'react';
import { SalesLineItem, IndianState, INDIAN_STATES } from '../types';

const CHANNELS = ['Amazon', 'Blinkit', 'Website', 'Offline/OEM', 'Inter-Company'];

interface SalesVerificationProps {
  lineItems: SalesLineItem[];
  onUpdateItem: (id: string, newChannel: string) => void;
  onClose: () => void;
  stateName?: string;
}

type TabType = 'sales' | 'returns' | 'inter-company';

export function SalesVerification({
  lineItems,
  onUpdateItem,
  onClose,
  stateName
}: SalesVerificationProps) {
  const [activeTab, setActiveTab] = useState<TabType>('sales');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Separate items by type
  const { salesItems, returnItems, interCompanyItems } = useMemo(() => {
    return {
      salesItems: lineItems.filter(item => !item.isReturn && !item.isInterCompany),
      returnItems: lineItems.filter(item => item.isReturn),
      interCompanyItems: lineItems.filter(item => item.isInterCompany)
    };
  }, [lineItems]);

  // Get current items based on active tab
  const currentItems = useMemo(() => {
    let items: SalesLineItem[] = [];
    switch (activeTab) {
      case 'sales':
        items = salesItems;
        break;
      case 'returns':
        items = returnItems;
        break;
      case 'inter-company':
        items = interCompanyItems;
        break;
    }

    // Apply filters
    if (filterChannel !== 'all') {
      items = items.filter(item => item.channel === filterChannel);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => item.partyName.toLowerCase().includes(query));
    }

    return items;
  }, [activeTab, salesItems, returnItems, interCompanyItems, filterChannel, searchQuery]);

  // Calculate totals by channel
  const channelTotals = useMemo(() => {
    const totals: { [key: string]: number } = {};
    const items = activeTab === 'sales' ? salesItems : activeTab === 'returns' ? returnItems : interCompanyItems;

    items.forEach(item => {
      totals[item.channel] = (totals[item.channel] || 0) + item.amount;
    });

    return totals;
  }, [activeTab, salesItems, returnItems, interCompanyItems]);

  // Count modified items
  const modifiedCount = useMemo(() => {
    return lineItems.filter(item => item.channel !== item.originalChannel).length;
  }, [lineItems]);

  const formatCurrency = (amount: number) => {
    return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getTabCount = (tab: TabType) => {
    switch (tab) {
      case 'sales':
        return salesItems.length;
      case 'returns':
        return returnItems.length;
      case 'inter-company':
        return interCompanyItems.length;
    }
  };

  const getTabTotal = (tab: TabType) => {
    switch (tab) {
      case 'sales':
        return salesItems.reduce((sum, item) => sum + item.amount, 0);
      case 'returns':
        return returnItems.reduce((sum, item) => sum + item.amount, 0);
      case 'inter-company':
        return interCompanyItems.reduce((sum, item) => sum + item.amount, 0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Sales Verification
              {stateName && <span className="text-blue-600 ml-2">({stateName})</span>}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Review and correct channel assignments for sales and returns
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex -mb-px space-x-6">
            {[
              { id: 'sales' as TabType, label: 'Sales', color: 'green' },
              { id: 'returns' as TabType, label: 'Returns', color: 'red' },
              { id: 'inter-company' as TabType, label: 'Inter-Company', color: 'orange' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                  activeTab === tab.id
                    ? `border-${tab.color}-500 text-${tab.color}-600`
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id
                    ? `bg-${tab.color}-100 text-${tab.color}-700`
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {getTabCount(tab.id)}
                </span>
                <span className="text-xs text-gray-400">
                  ({formatCurrency(getTabTotal(tab.id))})
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Filters and Summary */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between gap-4">
            {/* Search */}
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by party name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Channel Filter */}
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Channels</option>
              {CHANNELS.map(channel => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>

            {/* Modified Count */}
            {modifiedCount > 0 && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                {modifiedCount} modified
              </span>
            )}
          </div>

          {/* Channel Totals */}
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(channelTotals).map(([channel, total]) => (
              <div
                key={channel}
                className={`px-3 py-1 rounded-lg text-sm ${
                  filterChannel === channel
                    ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                    : 'bg-white border border-gray-200 text-gray-700'
                }`}
              >
                <span className="font-medium">{channel}:</span>
                <span className="ml-1">{formatCurrency(total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {currentItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No items found matching your filters
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Party Name
                  </th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                    Amount
                  </th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                    Channel
                  </th>
                  {activeTab === 'inter-company' && (
                    <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                      To State
                    </th>
                  )}
                  <th className="text-center py-3 px-2 text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentItems.map(item => {
                  const isModified = item.channel !== item.originalChannel;
                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 ${isModified ? 'bg-yellow-50' : ''}`}
                    >
                      <td className="py-2 px-2">
                        <span className="text-sm text-gray-900">{item.partyName}</span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`text-sm font-medium ${
                          item.isReturn ? 'text-red-600' : 'text-gray-900'
                        }`}>
                          {item.isReturn ? '-' : ''}{formatCurrency(item.amount)}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={item.channel}
                          onChange={(e) => onUpdateItem(item.id, e.target.value)}
                          className={`w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 ${
                            isModified
                              ? 'border-yellow-400 bg-yellow-50'
                              : 'border-gray-300'
                          }`}
                        >
                          {CHANNELS.map(channel => (
                            <option key={channel} value={channel}>{channel}</option>
                          ))}
                        </select>
                      </td>
                      {activeTab === 'inter-company' && (
                        <td className="py-2 px-2">
                          <span className="text-sm text-gray-600">
                            {item.toState ? INDIAN_STATES.find(s => s.code === item.toState)?.name : '-'}
                          </span>
                        </td>
                      )}
                      <td className="py-2 px-2 text-center">
                        {isModified ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Modified
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            Auto
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {currentItems.length} of {
              activeTab === 'sales' ? salesItems.length :
              activeTab === 'returns' ? returnItems.length :
              interCompanyItems.length
            } items
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
