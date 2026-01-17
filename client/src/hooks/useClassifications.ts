import { useState, useCallback, useEffect } from 'react';
import { Transaction, Heads, FilterState, AccountPattern, IgnorePattern } from '../types';
import { DEFAULT_HEADS } from '../data/defaultHeads';
import { DEFAULT_PATTERNS, getRecommendation } from '../data/accountPatterns';
import { DEFAULT_IGNORE_PATTERNS, shouldAutoIgnore, isAmazonCashSale } from '../data/ignorePatterns';

const STORAGE_KEY = 'mis-classifications';
const HEADS_STORAGE_KEY = 'mis-heads';
const PATTERNS_STORAGE_KEY = 'mis-patterns';
const IGNORE_STORAGE_KEY = 'mis-ignore-patterns';
const SESSION_KEY = 'mis-session-id';

interface StoredState {
  transactions: Transaction[];
  timestamp: number;
  sessionId?: string;
}

// Generate a unique session ID for each file upload
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useClassifications() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [heads, setHeads] = useState<Heads>(DEFAULT_HEADS);
  const [customPatterns, setCustomPatterns] = useState<AccountPattern[]>([]);
  const [ignorePatterns, setIgnorePatterns] = useState<IgnorePattern[]>(DEFAULT_IGNORE_PATTERNS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
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
      const storedSession = localStorage.getItem(SESSION_KEY);
      const storedData = localStorage.getItem(STORAGE_KEY);

      if (storedData && storedSession) {
        const parsed: StoredState = JSON.parse(storedData);
        // Only restore if session matches and data is valid
        if (parsed.transactions && Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
          setTransactions(parsed.transactions);
          setSessionId(storedSession);
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
    setIsLoaded(true);
  }, []);

  // Save to localStorage when transactions change
  const saveToStorage = useCallback(() => {
    try {
      if (!sessionId) return; // Don't save if no session

      const state: StoredState = {
        transactions,
        timestamp: Date.now(),
        sessionId
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(SESSION_KEY, sessionId);
      localStorage.setItem(HEADS_STORAGE_KEY, JSON.stringify(heads));
      localStorage.setItem(PATTERNS_STORAGE_KEY, JSON.stringify(customPatterns));
      localStorage.setItem(IGNORE_STORAGE_KEY, JSON.stringify(ignorePatterns));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [transactions, heads, customPatterns, ignorePatterns, sessionId]);

  // Clear all stored data
  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SESSION_KEY);
      // Keep heads, patterns, and ignore patterns as they are user preferences
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }, []);

  // Import new transactions
  const importTransactions = useCallback((newTransactions: Transaction[]) => {
    // Generate new session ID for this upload - this ensures new uploads always replace old data
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);

    // Clear old session data immediately
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(SESSION_KEY, newSessionId);

    // Apply auto-recommendations and auto-ignore to new transactions
    const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns];
    const allIgnorePatterns = [...DEFAULT_IGNORE_PATTERNS, ...ignorePatterns.filter(p =>
      !DEFAULT_IGNORE_PATTERNS.some(dp => dp.pattern === p.pattern)
    )];

    // === STEP 1: Detect Amazon Cash Sale entries and their offsets ===
    // Amazon Cash Sale entries are internal adjustments that should be ignored along with their matching B2B entries
    const amazonCashSaleIds = new Set<string>();
    const offsetEntryIds = new Set<string>();

    // Find all Amazon Cash Sale entries (typically credits)
    const amazonEntries = newTransactions.filter(txn => isAmazonCashSale(txn.account));

    // For each Amazon entry, find a matching offset entry (same date, same amount, opposite side)
    for (const amazonEntry of amazonEntries) {
      amazonCashSaleIds.add(amazonEntry.id);
      const amazonAmount = amazonEntry.credit > 0 ? amazonEntry.credit : amazonEntry.debit;

      // Find matching offset entry: same date, same amount, opposite side (debit if Amazon is credit)
      const offsetEntry = newTransactions.find(txn => {
        if (txn.id === amazonEntry.id) return false;
        if (txn.date !== amazonEntry.date) return false;

        // Check for matching amount on opposite side
        const txnAmount = amazonEntry.credit > 0 ? txn.debit : txn.credit;
        if (Math.abs(txnAmount - amazonAmount) > 0.01) return false;

        // Don't match if it's another Amazon entry or already a known ignore pattern
        if (isAmazonCashSale(txn.account)) return false;
        if (shouldAutoIgnore(txn.account, allIgnorePatterns).ignore) return false;

        return true;
      });

      if (offsetEntry) {
        offsetEntryIds.add(offsetEntry.id);
      }
    }

    // === STEP 2: Process all transactions ===
    const processedTransactions = newTransactions.map(txn => {
      // If transaction is already classified (e.g., sales transactions), preserve it
      if (txn.status === 'classified' && txn.head && txn.subhead) {
        return txn;
      }

      // Check if this is an Amazon Cash Sale entry
      if (amazonCashSaleIds.has(txn.id)) {
        return {
          ...txn,
          status: 'ignored' as const,
          isAutoIgnored: true,
          head: 'Z. Ignore (Non-P&L)',
          subhead: 'Amazon Cash Sale Adjustment'
        };
      }

      // Check if this is an offset entry for Amazon Cash Sale
      if (offsetEntryIds.has(txn.id)) {
        return {
          ...txn,
          status: 'ignored' as const,
          isAutoIgnored: true,
          head: 'Z. Ignore (Non-P&L)',
          subhead: 'Amazon Cash Sale Offset (B2B Adjustment)'
        };
      }

      // Check if should be auto-ignored based on patterns
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

    // Immediately save to localStorage so reloads preserve the new data
    try {
      const state: StoredState = {
        transactions: processedTransactions,
        timestamp: Date.now(),
        sessionId: newSessionId
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to auto-save after import:', error);
    }
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
    sessionId,
    isLoaded,
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
    clearStorage,
    undo
  };
}
