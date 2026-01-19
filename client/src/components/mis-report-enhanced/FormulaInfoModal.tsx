import React from 'react';
import { XMarkIcon, CalculatorIcon } from '@heroicons/react/24/outline';
import { formatCurrencyFull } from '../../utils/misCalculator';
import { FormulaDefinition, FormulaComponent } from '../../config/misFormulas';
import { MISRecord } from '../../types/misTracking';

interface FormulaInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  formula: FormulaDefinition;
  misRecord: MISRecord;
  resultValue: number;
}

// Helper to get nested value from object using dot notation
function getNestedValue(obj: Record<string, unknown>, path: string): number {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return 0;
    }
  }
  return typeof current === 'number' ? current : 0;
}

export function FormulaInfoModal({
  isOpen,
  onClose,
  formula,
  misRecord,
  resultValue
}: FormulaInfoModalProps) {
  if (!isOpen) return null;

  const sourceColors: Record<string, string> = {
    calculated: 'bg-purple-700/30 text-purple-300 border-purple-500',
    journal: 'bg-slate-700/50 text-slate-300 border-slate-500',
    sales_register: 'bg-blue-700/30 text-blue-300 border-blue-500',
    balance_sheet: 'bg-green-700/30 text-green-300 border-green-500'
  };

  const sourceLabels: Record<string, string> = {
    calculated: 'Calculated',
    journal: 'Journal',
    sales_register: 'Sales Register',
    balance_sheet: 'Balance Sheet'
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-lg w-full border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-900/50 rounded-lg">
              <CalculatorIcon className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">{formula.name}</h2>
              <p className="text-xs text-slate-400">Formula Breakdown</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-full transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Description */}
          <div>
            <p className="text-sm text-slate-300 leading-relaxed">{formula.description}</p>
          </div>

          {/* Formula Box */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Formula</p>
            <p className="font-mono text-teal-300">{formula.formula}</p>
          </div>

          {/* Components Breakdown */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Components</p>
            <div className="space-y-2">
              {formula.components.map((component, index) => {
                const value = getNestedValue(misRecord as unknown as Record<string, unknown>, component.field);
                return (
                  <div
                    key={index}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg border ${sourceColors[component.source]}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold ${component.sign === '+' ? 'text-green-400' : 'text-red-400'}`}>
                        {component.sign}
                      </span>
                      <div>
                        <span className="text-slate-200">{component.label}</span>
                        <span className="text-xs text-slate-500 ml-2">
                          [{sourceLabels[component.source]}]
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-slate-200">
                      {formatCurrencyFull(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result */}
          <div className="bg-teal-900/30 rounded-lg p-4 border border-teal-600">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-300">= {formula.name}</span>
              <span className={`font-mono font-bold text-lg ${resultValue < 0 ? 'text-red-400' : 'text-teal-300'}`}>
                {formatCurrencyFull(resultValue)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/30">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Simpler tooltip-style info popover for subhead descriptions
interface InfoTooltipProps {
  title: string;
  description: string;
  isOpen: boolean;
  onClose: () => void;
}

export function InfoTooltip({ title, description, isOpen, onClose }: InfoTooltipProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-lg shadow-xl max-w-sm w-full border border-slate-700 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-slate-200">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
