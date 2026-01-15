import { useState, useCallback, useEffect } from 'react';
import { Transaction, Heads, FilterState, AccountPattern, IgnorePattern } from '../types';
import { DEFAULT_HEADS } from '../data/defaultHeads';
import { DEFAULT_PATTERNS, getRecommendation } from '../data/accountPatterns';
import { DEFAULT_IGNORE_PATTERNS, shouldAutoIgnore } from '../data/ignorePatterns';

const STORAGE_KEY = 'mis-classifications';
const HEADS_STORAGE_KEY = 'mis-heads';
const PATTERNS_STORAGE_KEY = 'mis-patterns';
const IGNORE_STORAGE_KEY = 'mis-ignore-patterns';

interface StoredState {
  transactions: Transaction[];
  timestamp: number;
}

export function useClassifications() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [heads, setHeads] = useState<Heads>(DEFAULT_HEADS);
  const [customPatterns, setCustomPatterns] = useState<AccountPattern[]>([]);
  const [ignorePatterns, setIgnorePatterns] = useState<IgnorePattern[]>(DEFAULT_IGNORE_PATTERNS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterState>({
    search: '',
    status: 'all',
    head: null,
    type: 'all',
    showIgnored: false
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

      const storedIgnore = localStorage.getItem(IGNORE_STORAGE_KEY);
      if (storedIgnore) {
        setIgnorePatterns(JSON.parse(storedIgnore));
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
      localStorage.setItem(IGNORE_STORAGE_KEY, JSON.stringify(ignorePatterns));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [transactions, heads, customPatterns, ignorePatterns]);

  // Import new transactions
  const importTransactions = useCallback((newTransactions: Transaction[]) => {
    // Apply auto-recommendations and auto-ignore to new transactions
    const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns];
    const allIgnorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...ignorePatterns.filter(p =>
      !DEFAULT_IGNORE_PATTERNS.some(dp => dp.pattern === p.pattern)
    )];

    const processedTransactions = newTransactions.map(txn => {
      // Check if should be auto-ignored first
      const ignoreResult = shouldAutoIgnore(txn.account, allIgnorePatterns);
      if (ignoreResult.ignore) {
        return {
          ...txn,
          status: 'ignored' as const,
          isAutoIgnored: true,
          head: 'Z. Ignore (Non-P&L)',
          subhead: ignoreResult.reason
        };
      }

      // Check for classification recommendation
      const recommendation = getRecommendation(txn.account, allPatterns);
      if (recommendation) {
        // If recommendation is to Z. Ignore, mark as ignored
        if (recommendation.head === 'Z. Ignore (Non-P&L)') {
          return {
            ...txn,
            status: 'ignored' as const,
            isAutoIgnored: true,
            head: recommendation.head,
            subhead: recommendation.subhead
          };
        }
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
  }, [customPatterns, ignorePatterns]);

  // Classify a single transaction
  const classifyTransaction = useCallback((id: string, head: string, subhead: string) => {
    setUndoStack(prev => [...prev, transactions]);

    setTransactions(prev => prev.map(txn => {
      if (txn.id === id) {
        const isIgnore = head === 'Z. Ignore (Non-P&L)';
        return {
          ...txn,
          head,
          subhead,
          status: isIgnore ? 'ignored' as const : 'classified' as const,
          isAutoIgnored: false
        };
      }
      return txn;
    }));
  }, [transactions]);

  // Classify multiple transactions
  const classifyMultiple = useCallback((ids: string[], head: string, subhead: string) => {
    setUndoStack(prev => [...prev, transactions]);

    const isIgnore = head === 'Z. Ignore (Non-P&L)';

    setTransactions(prev => prev.map(txn => {
      if (ids.includes(txn.id)) {
        return {
          ...txn,
          head,
          subhead,
          status: isIgnore ? 'ignored' as const : 'classified' as const,
          isAutoIgnored: false
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
        const isIgnore = txn.suggestedHead === 'Z. Ignore (Non-P&L)';
        return {
          ...txn,
          head: txn.suggestedHead,
          subhead: txn.suggestedSubhead,
          status: isIgnore ? 'ignored' as const : 'classified' as const
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
      const isIgnore = head === 'Z. Ignore (Non-P&L)';

      setTransactions(prev => prev.map(txn => {
        if (regex.test(txn.account)) {
          return {
            ...txn,
            head,
            subhead,
            status: isIgnore ? 'ignored' as const : 'classified' as const,
            isAutoIgnored: false
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

  // Ignore a transaction
  const ignoreTransaction = useCallback((id: string, reason: string = 'Manually Ignored') => {
    setUndoStack(prev => [...prev, transactions]);

    setTransactions(prev => prev.map(txn => {
      if (txn.id === id) {
        return {
          ...txn,
          head: 'Z. Ignore (Non-P&L)',
          subhead: reason,
          status: 'ignored' as const,
          isAutoIgnored: false
        };
      }
      return txn;
    }));
  }, [transactions]);

  // Ignore multiple transactions
  const ignoreMultiple = useCallback((ids: string[], reason: string = 'Manually Ignored') => {
    setUndoStack(prev => [...prev, transactions]);

    setTransactions(prev => prev.map(txn => {
      if (ids.includes(txn.id)) {
        return {
          ...txn,
          head: 'Z. Ignore (Non-P&L)',
          subhead: reason,
          status: 'ignored' as const,
          isAutoIgnored: false
        };
      }
      return txn;
    }));

    setSelectedIds([]);
  }, [transactions]);

  // Add ignore pattern
  const addIgnorePattern = useCallback((pattern: string, reason: string) => {
    setIgnorePatterns(prev => [...prev, { pattern, reason }]);
  }, []);

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
        const ignoreResult = shouldAutoIgnore(txn.account, ignorePatterns);

        if (ignoreResult.ignore) {
          return {
            ...txn,
            head: 'Z. Ignore (Non-P&L)',
            subhead: ignoreResult.reason,
            status: 'ignored' as const,
            isAutoIgnored: true
          };
        }

        return {
          ...txn,
          head: undefined,
          subhead: undefined,
          status: recommendation ? 'suggested' as const : 'unclassified' as const,
          suggestedHead: recommendation?.head,
          suggestedSubhead: recommendation?.subhead,
          isAutoIgnored: false
        };
      }
      return txn;
    }));
  }, [transactions, customPatterns, ignorePatterns]);

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
    // Hide ignored unless showIgnored is true
    if (!filter.showIgnored && txn.status === 'ignored') {
      return false;
    }

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
    if (filter.status !== 'all') {
      if (filter.status === 'ignored') {
        if (txn.status !== 'ignored') return false;
      } else if (txn.status !== filter.status) {
        return false;
      }
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

  // Calculate progress (excluding ignored from total)
  const nonIgnoredTransactions = transactions.filter(t => t.status !== 'ignored');
  const progress = nonIgnoredTransactions.length > 0
    ? Math.round((nonIgnoredTransactions.filter(t => t.status === 'classified').length / nonIgnoredTransactions.length) * 100)
    : 0;

  // Stats
  const stats = {
    total: transactions.length,
    classified: transactions.filter(t => t.status === 'classified').length,
    suggested: transactions.filter(t => t.status === 'suggested').length,
    unclassified: transactions.filter(t => t.status === 'unclassified').length,
    ignored: transactions.filter(t => t.status === 'ignored').length,
    toClassify: nonIgnoredTransactions.length
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
    ignorePatterns,
    setFilter,
    setSelectedIds,
    importTransactions,
    classifyTransaction,
    classifyMultiple,
    applySuggestion,
    applyToSimilar,
    clearClassification,
    ignoreTransaction,
    ignoreMultiple,
    addIgnorePattern,
    addHead,
    addSubhead,
    saveToStorage,
    undo
  };
}
