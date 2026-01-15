import React, { useState } from 'react';
import { COGSData } from '../types';
import { formatCurrency, formatCurrencyFull } from '../utils/cogsCalculator';

interface COGSDisplayProps {
  cogsData: COGSData | null;
  onManualUpdate?: (openingStock: number, purchases: number, closingStock: number) => void;
}

export function COGSDisplay({ cogsData, onManualUpdate }: COGSDisplayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState({
    openingStock: cogsData?.openingStock || 0,
    purchases: cogsData?.purchases || 0,
    closingStock: cogsData?.closingStock || 0
  });

  const handleSave = () => {
    if (onManualUpdate) {
      onManualUpdate(editValues.openingStock, editValues.purchases, editValues.closingStock);
    }
    setIsEditing(false);
  };

  if (!cogsData && !isEditing) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="text-gray-500">
            <span className="font-medium">COGS:</span> Upload files to calculate
          </div>
          {onManualUpdate && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Enter manually
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="grid grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Opening Stock</label>
            <input
              type="number"
              value={editValues.openingStock}
              onChange={(e) => setEditValues(prev => ({ ...prev, openingStock: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">+ Purchases</label>
            <input
              type="number"
              value={editValues.purchases}
              onChange={(e) => setEditValues(prev => ({ ...prev, purchases: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">- Closing Stock</label>
            <input
              type="number"
              value={editValues.closingStock}
              onChange={(e) => setEditValues(prev => ({ ...prev, closingStock: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="mt-3 text-right">
          <span className="font-medium text-blue-800">
            = COGS: {formatCurrencyFull(editValues.openingStock + editValues.purchases - editValues.closingStock)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Opening Stock</div>
            <div className="font-semibold text-gray-900">{formatCurrency(cogsData!.openingStock)}</div>
          </div>

          <div className="text-xl text-gray-400">+</div>

          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Purchases</div>
            <div className="font-semibold text-gray-900">{formatCurrency(cogsData!.purchases)}</div>
          </div>

          <div className="text-xl text-gray-400">-</div>

          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Closing Stock</div>
            <div className="font-semibold text-gray-900">{formatCurrency(cogsData!.closingStock)}</div>
          </div>

          <div className="text-xl text-gray-400">=</div>

          <div className="text-center px-4 py-2 bg-blue-600 rounded-lg">
            <div className="text-xs text-blue-100 uppercase tracking-wide">COGS</div>
            <div className="font-bold text-white text-lg">{formatCurrency(cogsData!.cogs)}</div>
          </div>
        </div>

        {onManualUpdate && (
          <button
            onClick={() => {
              setEditValues({
                openingStock: cogsData!.openingStock,
                purchases: cogsData!.purchases,
                closingStock: cogsData!.closingStock
              });
              setIsEditing(true);
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
