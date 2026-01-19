import React, { useState, ReactNode } from 'react';
import { ChevronDownIcon, ChevronRightIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { formatCurrencyFull } from '../../utils/misCalculator';

interface CollapsibleSectionProps {
  title: string;
  total: number;
  percentage?: number;
  transactionCount?: number;
  isHighlight?: boolean;
  highlightColor?: 'green' | 'yellow' | 'blue' | 'red' | 'teal';
  children: ReactNode;
  defaultExpanded?: boolean;
  infoTooltip?: string;
  onInfoClick?: () => void;
  source?: 'journal' | 'balance_sheet' | 'sales_register' | 'calculated';
}

const highlightColors = {
  green: 'bg-teal-900/50 border-teal-500',
  yellow: 'bg-yellow-900/30 border-yellow-500',
  blue: 'bg-blue-900/30 border-blue-500',
  red: 'bg-red-900/30 border-red-500',
  teal: 'bg-teal-900/50 border-teal-400'
};

const headerColors = {
  green: 'text-teal-300',
  yellow: 'text-yellow-300',
  blue: 'text-blue-300',
  red: 'text-red-300',
  teal: 'text-teal-300'
};

export function CollapsibleSection({
  title,
  total,
  percentage,
  transactionCount,
  isHighlight = false,
  highlightColor = 'teal',
  children,
  defaultExpanded = true,
  infoTooltip,
  onInfoClick,
  source
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpand = () => setIsExpanded(!isExpanded);

  const sourceLabels = {
    journal: { text: 'Journal', color: 'bg-slate-600 text-slate-200' },
    balance_sheet: { text: 'BS', color: 'bg-green-700 text-green-100' },
    sales_register: { text: 'Sales', color: 'bg-blue-700 text-blue-100' },
    calculated: { text: 'Calc', color: 'bg-purple-700 text-purple-100' }
  };

  return (
    <div className={`mb-1 ${isHighlight ? `border-l-4 ${highlightColors[highlightColor]}` : ''}`}>
      {/* Section Header */}
      <div
        className={`
          flex items-center justify-between py-3 px-4 cursor-pointer
          ${isHighlight
            ? `${highlightColors[highlightColor]} hover:bg-opacity-70`
            : 'bg-slate-800 hover:bg-slate-700'}
          transition-colors duration-150
        `}
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-3">
          {/* Expand/Collapse Icon */}
          <span className="text-slate-400">
            {isExpanded ? (
              <ChevronDownIcon className="h-5 w-5" />
            ) : (
              <ChevronRightIcon className="h-5 w-5" />
            )}
          </span>

          {/* Title */}
          <span className={`font-semibold ${isHighlight ? headerColors[highlightColor] : 'text-slate-200'}`}>
            {title}
          </span>

          {/* Source Badge */}
          {source && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${sourceLabels[source].color}`}>
              {sourceLabels[source].text}
            </span>
          )}

          {/* Info Icon */}
          {(infoTooltip || onInfoClick) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick?.();
              }}
              className="text-slate-400 hover:text-slate-200 transition-colors"
              title={infoTooltip}
            >
              <InformationCircleIcon className="h-4 w-4" />
            </button>
          )}

          {/* Transaction Count */}
          {transactionCount !== undefined && transactionCount > 0 && (
            <span className="text-xs text-slate-500">
              ({transactionCount} transactions)
            </span>
          )}
        </div>

        {/* Amount and Percentage */}
        <div className="flex items-center gap-4">
          <span className={`font-mono font-semibold ${
            isHighlight ? headerColors[highlightColor] : 'text-slate-200'
          }`}>
            {formatCurrencyFull(total)}
          </span>
          {percentage !== undefined && (
            <span className="text-sm text-slate-400 w-16 text-right">
              {percentage.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="bg-slate-900/50">
          {children}
        </div>
      )}
    </div>
  );
}

// Margin Row Component for displaying calculated margins (CM1, CM2, etc.)
interface MarginRowProps {
  label: string;
  amount: number;
  percentage?: number;
  formulaInfo?: {
    name: string;
    description: string;
    formula: string;
  };
  onInfoClick?: () => void;
  variant?: 'default' | 'positive' | 'negative' | 'highlight';
}

export function MarginRow({
  label,
  amount,
  percentage,
  formulaInfo,
  onInfoClick,
  variant = 'default'
}: MarginRowProps) {
  const variantStyles = {
    default: 'bg-slate-700 text-slate-200',
    positive: 'bg-green-900/50 text-green-300 border-l-4 border-green-500',
    negative: 'bg-red-900/50 text-red-300 border-l-4 border-red-500',
    highlight: 'bg-teal-900/60 text-teal-200 border-l-4 border-teal-400'
  };

  const actualVariant = amount < 0 ? 'negative' : variant;

  return (
    <div className={`flex items-center justify-between py-3 px-4 ${variantStyles[actualVariant]}`}>
      <div className="flex items-center gap-3">
        <span className="font-bold">{label}</span>
        {formulaInfo && (
          <button
            onClick={onInfoClick}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title={formulaInfo.description}
          >
            <InformationCircleIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className={`font-mono font-bold ${amount < 0 ? 'text-red-400' : ''}`}>
          {formatCurrencyFull(amount)}
        </span>
        {percentage !== undefined && (
          <span className={`text-sm w-16 text-right ${amount < 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {percentage.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}
