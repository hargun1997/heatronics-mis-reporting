import React, { useState, useEffect } from 'react';
import {
  MISCategory,
  ClassificationResult,
  getCategoriesCached,
  getRulesCached,
  classifyEntities,
  batchLearnClassifications,
  getHeadsList,
  getSubheadsForHead,
  formatConfidence,
  getSourceDisplayName
} from '../../utils/classificationApi';

interface EntityForClassification {
  name: string;
  type: 'ledger' | 'party';
  amount?: number;
  state?: string;
}

interface QuickClassifyModalProps {
  entities: EntityForClassification[];
  periodLabel: string;
  onClose: () => void;
  onComplete: () => void;
}

interface ClassificationItem {
  entity: EntityForClassification;
  result: ClassificationResult | null;
  selectedHead: string;
  selectedSubhead: string;
  isLoading: boolean;
}

export function QuickClassifyModal({
  entities,
  periodLabel,
  onClose,
  onComplete
}: QuickClassifyModalProps) {
  const [categories, setCategories] = useState<MISCategory[]>([]);
  const [items, setItems] = useState<ClassificationItem[]>([]);
  const [isClassifying, setIsClassifying] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unclassified' | 'ai-suggested'>('unclassified');

  const heads = getHeadsList(categories);

  // Load categories and classify entities on mount
  useEffect(() => {
    async function init() {
      // Load categories
      const cats = await getCategoriesCached();
      setCategories(cats);

      // Initialize items
      const initialItems: ClassificationItem[] = entities.map(entity => ({
        entity,
        result: null,
        selectedHead: '',
        selectedSubhead: '',
        isLoading: true
      }));
      setItems(initialItems);

      // Classify using API
      setIsClassifying(true);
      try {
        const results = await classifyEntities(
          entities.map(e => ({
            name: e.name,
            type: e.type,
            amount: e.amount
          }))
        );

        // Update items with results
        setItems(prev => prev.map((item, index) => {
          const result = results[index];
          return {
            ...item,
            result,
            selectedHead: result?.head || '',
            selectedSubhead: result?.subhead || '',
            isLoading: false
          };
        }));
      } catch (error) {
        console.error('Error classifying entities:', error);
        setItems(prev => prev.map(item => ({ ...item, isLoading: false })));
      }
      setIsClassifying(false);
    }

    init();
  }, [entities]);

  // Handle head selection change
  const handleHeadChange = (index: number, head: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        const subheads = getSubheadsForHead(categories, head);
        return {
          ...item,
          selectedHead: head,
          selectedSubhead: subheads[0] || ''
        };
      }
      return item;
    }));
  };

  // Handle subhead selection change
  const handleSubheadChange = (index: number, subhead: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        return { ...item, selectedSubhead: subhead };
      }
      return item;
    }));
  };

  // Save all classifications
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // Filter items that have valid classifications
      const validClassifications = items
        .filter(item => item.selectedHead && item.selectedSubhead)
        .map(item => ({
          entityName: item.entity.name,
          entityType: item.entity.type,
          head: item.selectedHead,
          subhead: item.selectedSubhead,
          amount: item.entity.amount
        }));

      if (validClassifications.length > 0) {
        await batchLearnClassifications(validClassifications, periodLabel);
      }

      onComplete();
    } catch (error) {
      console.error('Error saving classifications:', error);
    }
    setIsSaving(false);
  };

  // Calculate stats
  const unclassifiedCount = items.filter(i => !i.selectedHead || !i.selectedSubhead).length;
  const classifiedCount = items.filter(i => i.selectedHead && i.selectedSubhead).length;
  const aiSuggestedCount = items.filter(i => i.result?.source === 'gemini' || i.result?.source === 'similarity').length;

  // Filter items
  const filteredItems = items.filter(item => {
    if (filter === 'unclassified') {
      return !item.selectedHead || !item.selectedSubhead;
    }
    if (filter === 'ai-suggested') {
      return item.result?.source === 'gemini' || item.result?.source === 'similarity';
    }
    return true;
  });

  const canSave = classifiedCount > 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Quick Classify</h2>
              <p className="text-slate-400 mt-1">
                Classify transactions for {periodLabel}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Stats & Filters */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-3">
              <span className="px-3 py-1 bg-emerald-900/30 text-emerald-400 rounded-lg text-sm">
                Classified: {classifiedCount}
              </span>
              <span className="px-3 py-1 bg-amber-900/30 text-amber-400 rounded-lg text-sm">
                Unclassified: {unclassifiedCount}
              </span>
              {aiSuggestedCount > 0 && (
                <span className="px-3 py-1 bg-purple-900/30 text-purple-400 rounded-lg text-sm">
                  AI Suggested: {aiSuggestedCount}
                </span>
              )}
            </div>

            <select
              value={filter}
              onChange={e => setFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm"
            >
              <option value="all">All ({items.length})</option>
              <option value="unclassified">Unclassified ({unclassifiedCount})</option>
              <option value="ai-suggested">AI Suggested ({aiSuggestedCount})</option>
            </select>
          </div>
        </div>

        {/* Loading State */}
        {isClassifying && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
              <p className="text-slate-400">AI is analyzing transactions...</p>
            </div>
          </div>
        )}

        {/* Items List */}
        {!isClassifying && (
          <div className="flex-1 overflow-auto p-6">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {filter === 'unclassified'
                  ? 'All transactions are classified!'
                  : 'No transactions match this filter'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item, index) => {
                  const actualIndex = items.indexOf(item);
                  const subheads = item.selectedHead
                    ? getSubheadsForHead(categories, item.selectedHead)
                    : [];

                  return (
                    <div
                      key={`${item.entity.name}-${index}`}
                      className={`p-4 rounded-lg border ${
                        item.selectedHead && item.selectedSubhead
                          ? 'bg-slate-700/30 border-slate-600'
                          : 'bg-amber-900/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Entity Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-200 truncate">
                            {item.entity.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm">
                            <span className="text-slate-500">{item.entity.type}</span>
                            {item.entity.amount && (
                              <span className="text-slate-400">
                                {item.entity.amount.toLocaleString('en-IN')}
                              </span>
                            )}
                            {item.entity.state && (
                              <span className="text-slate-500">({item.entity.state})</span>
                            )}
                          </div>
                          {/* AI Result Info */}
                          {item.result && (item.result.source === 'gemini' || item.result.source === 'similarity') && (
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <span className={`px-2 py-0.5 rounded ${
                                item.result.source === 'gemini'
                                  ? 'bg-purple-900/30 text-purple-400'
                                  : 'bg-cyan-900/30 text-cyan-400'
                              }`}>
                                {getSourceDisplayName(item.result.source)}
                              </span>
                              <span className="text-slate-500">
                                {formatConfidence(item.result.confidence)} confidence
                              </span>
                              {item.result.reasoning && (
                                <span className="text-slate-500 truncate">
                                  - {item.result.reasoning}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Classification Selectors */}
                        <div className="flex items-center gap-2">
                          <select
                            value={item.selectedHead}
                            onChange={e => handleHeadChange(actualIndex, e.target.value)}
                            className="w-40 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm"
                          >
                            <option value="">Select Head...</option>
                            {heads.map(head => (
                              <option key={head} value={head}>{head}</option>
                            ))}
                          </select>
                          <select
                            value={item.selectedSubhead}
                            onChange={e => handleSubheadChange(actualIndex, e.target.value)}
                            disabled={!item.selectedHead}
                            className="w-48 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm disabled:opacity-50"
                          >
                            <option value="">Select Subhead...</option>
                            {subheads.map(subhead => (
                              <option key={subhead} value={subhead}>{subhead}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Classifications will be saved as rules for future use
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-slate-200"
            >
              Skip for now
            </button>
            <button
              onClick={handleSaveAll}
              disabled={!canSave || isSaving}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                canSave && !isSaving
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isSaving ? 'Saving...' : `Save ${classifiedCount} Classification${classifiedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuickClassifyModal;
