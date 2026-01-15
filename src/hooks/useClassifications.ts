import { useState, useCallback, useEffect } from 'react';
import { Transaction, Heads, FilterState, AccountPattern } from '../types';
import { DEFAULT_HEADS } from '../data/defaultHeads';
import { DEFAULT_PATTERNS, getRecommendation } from '../data/accountPatterns';

const STORAGE_KEY = 'mis-classifications';
const HEADS_STORAGE_KEY = 'mis-heads';
const PATTERNS_STORAGE_KEY = 'mis-patterns';

interface StoredState {
  transactions: Transaction[];
  timestamp: number;
}

export function useClassifications() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [heads, setHeads] = useState<Heads>(DEFAULT_HEADS);
  const [customPatterns, setCustomPatterns] = useState<AccountPattern[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterState>({
    search: '',
    status: 'all',
    head: null,
    type: 'all'
  });
  const [undoStack, setUndoStack] = useState<Transaction[][]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedData = localStorage.getItem(STORAGE_KEY);
      if (storedData) {
        const parsed: StoredState = JSON.parse(storedData);
        if (parsed.transactions && Array.isArray(parsed.transactions)) {
          setTransactions(parsed.transactions);
        }
      }

      const storedHeads = localStorage.getItem(HEADS_STORAGE_KEY);
      if (storedHeads) {
        setHeads(JSON.parse(storedHeads));
      }

      const storedPatterns = localStorage.getItem(PATTERNS_STORAGE_KEY);
      if (storedPatterns) {
        setCustomPatterns(JSON.parse(storedPatterns));
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
    }
  }, []);

  // Save to localStorage when transactions change
  const saveToStorage = useCallback(() => {
    try {
      const state: StoredState = {
        transactions,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(HEADS_STORAGE_KEY, JSON.stringify(heads));
      localStorage.setItem(PATTERNS_STORAGE_KEY, JSON.stringify(customPatterns));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [transactions, heads, customPatterns]);

  // Import new transactions
  const importTransactions = useCallback((newTransactions: Transaction[]) => {
    // Apply auto-recommendations to new transactions
    const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns];

    const processedTransactions = newTransactions.map(txn => {
      const recommendation = getRecommendation(txn.account, allPatterns);
      if (recommendation) {
        return {
          ...txn,
          suggestedHead: recommendation.head,
          suggestedSubhead: recommendation.subhead,
          status: 'suggested' as const
        };
      }
      return txn;
    });

    setTransactions(processedTransactions);
    setUndoStack([]);
  }, [customPatterns]);

  // Classify a single transaction
  const classifyTransaction = useCallback((id: string, head: string, subhead: string) => {
    setUndoStack(prev => [...prev, transactions]);

    setTransactions(prev => prev.map(txn => {
      if (txn.id === id) {
        return {
          ...txn,
          head,
          subhead,
          status: 'classified' as const
        };
      }
      return txn;
    }));
  }, [transactions]);

  // Classify multiple transactions
  const classifyMultiple = useCallback((ids: string[], head: string, subhead: string) => {
    setUndoStack(prev => [...prev, transactions]);

    setTransactions(prev => prev.map(txn => {
      if (ids.includes(txn.id)) {
        return {
          ...txn,
          head,
          subhead,
          status: 'classified' as const
        };
      }
      return txn;
    }));

    setSelectedIds([]);
  }, [transactions]);

  // Apply suggestion to a transaction
  const applySuggestion = useCallback((id: string) => {
    setUndoStack(prev => [...prev, transactions]);

    setTransactions(prev => prev.map(txn => {
      if (txn.id === id && txn.suggestedHead && txn.suggestedSubhead) {
        return {
          ...txn,
          head: txn.suggestedHead,
          subhead: txn.suggestedSubhead,
          status: 'classified' as const
        };
      }
      return txn;
    }));
  }, [transactions]);

  // Apply pattern to all similar accounts
  const applyToSimilar = useCallback((accountPattern: string, head: string, subhead: string) => {
    setUndoStack(prev => [...prev, transactions]);

    try {
      const regex = new RegExp(accountPattern, 'i');

      setTransactions(prev => prev.map(txn => {
        if (regex.test(txn.account)) {
          return {
            ...txn,
            head,
            subhead,
            status: 'classified' as const
          };
        }
        return txn;
      }));

      // Add to custom patterns
      const newPattern: AccountPattern = { pattern: accountPattern, head, subhead };
      setCustomPatterns(prev => [...prev, newPattern]);
    } catch {
      console.error('Invalid regex pattern');
    }
  }, [transactions]);

  // Undo last action
  const undo = useCallback(() => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setTransactions(previousState);
      setUndoStack(prev => prev.slice(0, -1));
    }
  }, [undoStack]);

  // Clear classification for a transaction
  const clearClassification = useCallback((id: string) => {
    setUndoStack(prev => [...prev, transactions]);

    setTransactions(prev => prev.map(txn => {
      if (txn.id === id) {
        const recommendation = getRecommendation(txn.account, [...DEFAULT_PATTERNS, ...customPatterns]);
        return {
          ...txn,
          head: undefined,
          subhead: undefined,
          status: recommendation ? 'suggested' as const : 'unclassified' as const,
          suggestedHead: recommendation?.head,
          suggestedSubhead: recommendation?.subhead
        };
      }
      return txn;
    }));
  }, [transactions, customPatterns]);

  // Add a new head
  const addHead = useCallback((name: string, type: 'credit' | 'debit' | 'calculated' | 'exclude' | 'ignore') => {
    setHeads(prev => ({
      ...prev,
      [name]: { subheads: [], type }
    }));
  }, []);

  // Add a new subhead
  const addSubhead = useCallback((headName: string, subheadName: string) => {
    setHeads(prev => {
      if (!prev[headName]) return prev;
      return {
        ...prev,
        [headName]: {
          ...prev[headName],
          subheads: [...prev[headName].subheads, subheadName]
        }
      };
    });
  }, []);

  // Filter transactions
  const filteredTransactions = transactions.filter(txn => {
    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      const matchesSearch =
        txn.account.toLowerCase().includes(searchLower) ||
        txn.notes.toLowerCase().includes(searchLower) ||
        txn.vchBillNo.toLowerCase().includes(searchLower) ||
        txn.date.includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (filter.status !== 'all' && txn.status !== filter.status) {
      return false;
    }

    // Head filter
    if (filter.head && txn.head !== filter.head) {
      return false;
    }

    // Type filter
    if (filter.type === 'debit' && txn.debit === 0) return false;
    if (filter.type === 'credit' && txn.credit === 0) return false;

    return true;
  });

  // Calculate progress
  const progress = transactions.length > 0
    ? Math.round((transactions.filter(t => t.status === 'classified').length / transactions.length) * 100)
    : 0;

  // Stats
  const stats = {
    total: transactions.length,
    classified: transactions.filter(t => t.status === 'classified').length,
    suggested: transactions.filter(t => t.status === 'suggested').length,
    unclassified: transactions.filter(t => t.status === 'unclassified').length
  };

  return {
    transactions,
    filteredTransactions,
    heads,
    selectedIds,
    filter,
    progress,
    stats,
    undoStack,
    customPatterns,
    setFilter,
    setSelectedIds,
    importTransactions,
    classifyTransaction,
    classifyMultiple,
    applySuggestion,
    applyToSimilar,
    clearClassification,
    addHead,
    addSubhead,
    saveToStorage,
    undo
  };
}
