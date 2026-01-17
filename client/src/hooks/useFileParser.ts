import { useState, useCallback } from 'react';
import { Transaction, BalanceSheetData, COGSData, SalesRegisterData, IndianState, StateFileData, createEmptyStateFileData, AggregatedRevenueData, SalesLineItem } from '../types';
import { parseJournalExcel, parsePurchaseExcel, parseBalanceSheetExcel, parseSalesExcel } from '../utils/excelParser';
import { parseBalanceSheetPDF } from '../utils/pdfParser';
import { calculateCOGS } from '../utils/cogsCalculator';

// Generate unique ID for transactions
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Convert a SalesLineItem to a Transaction
function salesLineItemToTransaction(item: SalesLineItem, stateCode: IndianState): Transaction {
  const isReturn = item.isReturn;
  const isInterCompany = item.isInterCompany;

  // Determine head based on type
  let head: string;
  let subhead: string;

  if (isInterCompany) {
    head = 'B. Stock Transfer';
    subhead = item.toState || 'Other';
  } else if (isReturn) {
    head = 'C. Returns';
    subhead = item.channel;
  } else {
    head = 'A. Revenue';
    subhead = item.channel;
  }

  return {
    id: `sales-${item.id}`,
    date: '', // Sales register may not have dates per line
    vchBillNo: '',
    gstNature: '',
    account: item.partyName,
    debit: (isReturn || isInterCompany) ? item.amount : 0, // Returns and Stock Transfers are debits
    credit: (isReturn || isInterCompany) ? 0 : item.amount, // Only Revenue is credit
    notes: isInterCompany ? `Inter-company transfer to ${item.toState || 'other entity'}` : '',
    head,
    subhead,
    status: 'classified',
    state: stateCode
  };
}

export interface FileParseState {
  journalFile: File | null;
  balanceSheetFile: File | null;
  purchaseFile: File | null;
  salesFile: File | null;
  journalParsed: boolean;
  balanceSheetParsed: boolean;
  purchaseParsed: boolean;
  salesParsed: boolean;
  loading: boolean;
  error: string | null;
}

export interface MultiStateFileParseState {
  selectedStates: IndianState[];
  activeState: IndianState | null;
  stateData: { [key in IndianState]?: StateFileData };
  loading: boolean;
  error: string | null;
}

export function useFileParser() {
  // Single-mode state (backward compatible)
  const [state, setState] = useState<FileParseState>({
    journalFile: null,
    balanceSheetFile: null,
    purchaseFile: null,
    salesFile: null,
    journalParsed: false,
    balanceSheetParsed: false,
    purchaseParsed: false,
    salesParsed: false,
    loading: false,
    error: null
  });

  // Multi-state mode state
  const [multiState, setMultiState] = useState<MultiStateFileParseState>({
    selectedStates: [],
    activeState: null,
    stateData: {},
    loading: false,
    error: null
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetData | null>(null);
  const [cogsData, setCOGSData] = useState<COGSData | null>(null);
  const [purchaseTotal, setPurchaseTotal] = useState<number>(0);
  const [salesData, setSalesData] = useState<SalesRegisterData | null>(null);

  // State management functions
  const toggleState = useCallback((stateCode: IndianState) => {
    setMultiState(prev => {
      const isSelected = prev.selectedStates.includes(stateCode);
      const newSelectedStates = isSelected
        ? prev.selectedStates.filter(s => s !== stateCode)
        : [...prev.selectedStates, stateCode];

      // Update active state if needed
      let newActiveState = prev.activeState;
      if (isSelected && prev.activeState === stateCode) {
        newActiveState = newSelectedStates.length > 0 ? newSelectedStates[0] : null;
      } else if (!isSelected && !prev.activeState) {
        newActiveState = stateCode;
      }

      // Initialize state data if newly selected
      const newStateData = { ...prev.stateData };
      if (!isSelected) {
        newStateData[stateCode] = createEmptyStateFileData();
      } else {
        delete newStateData[stateCode];
      }

      return {
        ...prev,
        selectedStates: newSelectedStates,
        activeState: newActiveState,
        stateData: newStateData
      };
    });
  }, []);

  const setActiveState = useCallback((stateCode: IndianState | null) => {
    setMultiState(prev => ({ ...prev, activeState: stateCode }));
  }, []);

  // Single-mode parsing functions
  const parseJournal = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, journalFile: file, loading: true, error: null }));

    try {
      const result = await parseJournalExcel(file);
      setTransactions(result.transactions);
      setState(prev => ({
        ...prev,
        journalParsed: true,
        loading: false
      }));

      if (result.errors.length > 0) {
        console.warn('Journal parse warnings:', result.errors);
      }

      return result.transactions;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse journal file';
      setState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, []);

  const parseBalanceSheet = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, balanceSheetFile: file, loading: true, error: null }));

    try {
      let result: BalanceSheetData;

      if (file.name.toLowerCase().endsWith('.pdf')) {
        const pdfResult = await parseBalanceSheetPDF(file);
        result = {
          openingStock: pdfResult.openingStock,
          closingStock: pdfResult.closingStock,
          grossSales: pdfResult.grossSales,
          netSales: pdfResult.netSales,
          revenueDiscounts: pdfResult.revenueDiscounts,
          gstOnSales: pdfResult.gstOnSales,
          netProfit: pdfResult.netProfit,
          purchases: pdfResult.purchases,
          extractedLines: pdfResult.extractedLines
        };
      } else {
        const excelResult = await parseBalanceSheetExcel(file);
        result = {
          openingStock: excelResult.openingStock,
          closingStock: excelResult.closingStock,
          grossSales: excelResult.sales,
          netSales: excelResult.sales, // Excel parser doesn't separate gross/net
          revenueDiscounts: 0,
          gstOnSales: 0,
          netProfit: excelResult.netProfit,
          purchases: 0
        };
      }

      setBalanceSheetData(result);
      setState(prev => ({
        ...prev,
        balanceSheetParsed: true,
        loading: false
      }));

      // Use purchases from PDF if available
      const purchases = result.purchases > 0 ? result.purchases : purchaseTotal;

      // Recalculate COGS
      if (purchases > 0 || purchaseTotal > 0) {
        const cogs = calculateCOGS(result.openingStock, purchases || purchaseTotal, result.closingStock);
        setCOGSData(cogs);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse balance sheet';
      setState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, [purchaseTotal]);

  const parsePurchase = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, purchaseFile: file, loading: true, error: null }));

    try {
      const result = await parsePurchaseExcel(file);
      setPurchaseTotal(result.totalPurchases);
      setState(prev => ({
        ...prev,
        purchaseParsed: true,
        loading: false
      }));

      // Recalculate COGS if we have balance sheet data
      if (balanceSheetData) {
        const cogs = calculateCOGS(
          balanceSheetData.openingStock,
          result.totalPurchases,
          balanceSheetData.closingStock
        );
        setCOGSData(cogs);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse purchase file';
      setState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, [balanceSheetData]);

  const parseSales = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, salesFile: file, loading: true, error: null }));

    try {
      const result = await parseSalesExcel(file);
      setSalesData(result.salesData);
      setState(prev => ({
        ...prev,
        salesParsed: true,
        loading: false
      }));

      if (result.errors.length > 0) {
        console.warn('Sales parse warnings:', result.errors);
      }

      return result.salesData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse sales file';
      setState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, []);

  // Multi-state parsing functions
  const parseJournalForState = useCallback(async (file: File, stateCode: IndianState) => {
    setMultiState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await parseJournalExcel(file);
      // TODO: Journal transactions will be added to table in future
      // For now, just mark file as parsed but don't add to transactions

      setMultiState(prev => {
        const stateData = prev.stateData[stateCode] || createEmptyStateFileData();
        return {
          ...prev,
          loading: false,
          stateData: {
            ...prev.stateData,
            [stateCode]: {
              ...stateData,
              journalFile: file,
              journalParsed: true
              // Not adding journal transactions to table for now
            }
          }
        };
      });

      return result.transactions;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse journal file';
      setMultiState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, []);

  const parseBalanceSheetForState = useCallback(async (file: File, stateCode: IndianState) => {
    setMultiState(prev => ({ ...prev, loading: true, error: null }));

    try {
      let result: BalanceSheetData;

      if (file.name.toLowerCase().endsWith('.pdf')) {
        const pdfResult = await parseBalanceSheetPDF(file);
        result = {
          openingStock: pdfResult.openingStock,
          closingStock: pdfResult.closingStock,
          grossSales: pdfResult.grossSales,
          netSales: pdfResult.netSales,
          revenueDiscounts: pdfResult.revenueDiscounts,
          gstOnSales: pdfResult.gstOnSales,
          netProfit: pdfResult.netProfit,
          purchases: pdfResult.purchases,
          extractedLines: pdfResult.extractedLines
        };
      } else {
        const excelResult = await parseBalanceSheetExcel(file);
        result = {
          openingStock: excelResult.openingStock,
          closingStock: excelResult.closingStock,
          grossSales: excelResult.sales,
          netSales: excelResult.sales,
          revenueDiscounts: 0,
          gstOnSales: 0,
          netProfit: excelResult.netProfit,
          purchases: 0
        };
      }

      setMultiState(prev => {
        const stateData = prev.stateData[stateCode] || createEmptyStateFileData();
        const purchases = result.purchases > 0 ? result.purchases : (stateData.purchaseTotal || 0);
        const cogs = purchases > 0 ? calculateCOGS(result.openingStock, purchases, result.closingStock) : null;

        return {
          ...prev,
          loading: false,
          stateData: {
            ...prev.stateData,
            [stateCode]: {
              ...stateData,
              balanceSheetFile: file,
              balanceSheetParsed: true,
              balanceSheetData: result,
              cogsData: cogs
            }
          }
        };
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse balance sheet';
      setMultiState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, []);

  const parsePurchaseForState = useCallback(async (file: File, stateCode: IndianState) => {
    setMultiState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await parsePurchaseExcel(file);

      setMultiState(prev => {
        const stateData = prev.stateData[stateCode] || createEmptyStateFileData();
        const bs = stateData.balanceSheetData;
        const cogs = bs ? calculateCOGS(bs.openingStock, result.totalPurchases, bs.closingStock) : null;

        return {
          ...prev,
          loading: false,
          stateData: {
            ...prev.stateData,
            [stateCode]: {
              ...stateData,
              purchaseFile: file,
              purchaseParsed: true,
              purchaseTotal: result.totalPurchases,
              cogsData: cogs || stateData.cogsData
            }
          }
        };
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse purchase file';
      setMultiState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, []);

  const parseSalesForState = useCallback(async (file: File, stateCode: IndianState) => {
    setMultiState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Pass state code to detect inter-company transfers (especially for UP)
      const result = await parseSalesExcel(file, stateCode);

      // Convert sales line items to transactions (including inter-company as Stock Transfer)
      const salesTransactions: Transaction[] = [];
      if (result.salesData.lineItems) {
        for (const item of result.salesData.lineItems) {
          salesTransactions.push(salesLineItemToTransaction(item, stateCode));
        }
      }

      setMultiState(prev => {
        const stateData = prev.stateData[stateCode] || createEmptyStateFileData();
        // Merge sales transactions with existing journal transactions
        // Remove any existing sales transactions first (to allow re-upload)
        const existingNonSalesTransactions = stateData.transactions.filter(
          t => !t.id.startsWith('sales-')
        );
        const mergedTransactions = [...existingNonSalesTransactions, ...salesTransactions];

        return {
          ...prev,
          loading: false,
          stateData: {
            ...prev.stateData,
            [stateCode]: {
              ...stateData,
              salesFile: file,
              salesParsed: true,
              salesData: result.salesData,
              transactions: mergedTransactions
            }
          }
        };
      });

      return result.salesData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse sales file';
      setMultiState(prev => ({ ...prev, loading: false, error: message }));
      throw error;
    }
  }, []);

  // Get aggregated data from all states
  const getAggregatedData = useCallback(() => {
    const allTransactions: Transaction[] = [];
    let totalPurchase = 0;
    const salesByChannel: { [key: string]: number } = {};

    // Revenue calculation variables
    let totalGrossSales = 0;
    let totalStockTransfer = 0;
    let totalReturns = 0;
    let totalTaxes = 0;       // Placeholder for future implementation
    let totalDiscounts = 0;   // Placeholder for future implementation
    const salesByState: { [key in IndianState]?: number } = {};
    const returnsByState: { [key in IndianState]?: number } = {};

    Object.entries(multiState.stateData).forEach(([stateCode, stateData]) => {
      if (stateData) {
        allTransactions.push(...stateData.transactions);
        totalPurchase += stateData.purchaseTotal || 0;

        if (stateData.salesData) {
          // Add gross sales (includes all positive amounts including stock transfers)
          totalGrossSales += stateData.salesData.grossSales || 0;

          // Track stock transfers (inter-company transfers, only from UP state)
          if (stateCode === 'UP') {
            totalStockTransfer += stateData.salesData.interCompanyTransfers || 0;
          }

          // Collect returns separately (all negative sales)
          totalReturns += stateData.salesData.returns || 0;

          // Track by state
          salesByState[stateCode as IndianState] = stateData.salesData.netSales || 0;
          returnsByState[stateCode as IndianState] = stateData.salesData.returns || 0;

          // Aggregate channel breakdown
          if (stateData.salesData.salesByChannel) {
            Object.entries(stateData.salesData.salesByChannel).forEach(([channel, amount]) => {
              salesByChannel[channel] = (salesByChannel[channel] || 0) + amount;
            });
          }
        }
      }
    });

    // Net Revenue = Total Gross Sales - Stock Transfer - Returns - Taxes - Discounts
    const totalNetRevenue = totalGrossSales - totalStockTransfer - totalReturns - totalTaxes - totalDiscounts;

    const revenueData: AggregatedRevenueData = {
      totalGrossSales,
      totalStockTransfer,
      totalReturns,
      totalTaxes,
      totalDiscounts,
      totalNetRevenue,
      salesByState,
      returnsByState
    };

    return {
      transactions: allTransactions,
      totalPurchase,
      totalSales: totalNetRevenue,  // Backward compatible
      salesByChannel,
      revenueData
    };
  }, [multiState.stateData]);

  // Get file status for a specific state
  const getStateFileStatus = useCallback((stateCode: IndianState) => {
    const data = multiState.stateData[stateCode];
    return {
      balanceSheet: data?.balanceSheetParsed || false,
      journal: data?.journalParsed || false,
      purchase: data?.purchaseParsed || false,
      sales: data?.salesParsed || false
    };
  }, [multiState.stateData]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
    setMultiState(prev => ({ ...prev, error: null }));
  }, []);

  const resetAll = useCallback(() => {
    setState({
      journalFile: null,
      balanceSheetFile: null,
      purchaseFile: null,
      salesFile: null,
      journalParsed: false,
      balanceSheetParsed: false,
      purchaseParsed: false,
      salesParsed: false,
      loading: false,
      error: null
    });
    setMultiState({
      selectedStates: [],
      activeState: null,
      stateData: {},
      loading: false,
      error: null
    });
    setTransactions([]);
    setBalanceSheetData(null);
    setCOGSData(null);
    setPurchaseTotal(0);
    setSalesData(null);
  }, []);

  // Manual COGS override
  const setCOGSManually = useCallback((openingStock: number, purchases: number, closingStock: number) => {
    const cogs = calculateCOGS(openingStock, purchases, closingStock);
    setCOGSData(cogs);
    setBalanceSheetData(prev => prev ? {
      ...prev,
      openingStock,
      closingStock
    } : {
      openingStock,
      closingStock,
      grossSales: 0,
      netSales: 0,
      revenueDiscounts: 0,
      gstOnSales: 0,
      netProfit: 0,
      purchases: purchases
    });
    setPurchaseTotal(purchases);
  }, []);

  // Manual Net Sales override
  const setNetSalesManually = useCallback((netSales: number) => {
    setBalanceSheetData(prev => prev ? {
      ...prev,
      netSales
    } : {
      openingStock: 0,
      closingStock: 0,
      grossSales: netSales,
      netSales,
      revenueDiscounts: 0,
      gstOnSales: 0,
      netProfit: 0,
      purchases: 0
    });
  }, []);

  // Update a sales line item's channel and recalculate totals
  const updateSalesLineItem = useCallback((stateCode: IndianState, itemId: string, newChannel: string) => {
    setMultiState(prev => {
      const stateData = prev.stateData[stateCode];
      if (!stateData || !stateData.salesData || !stateData.salesData.lineItems) {
        return prev;
      }

      // Update the line item
      const updatedLineItems = stateData.salesData.lineItems.map(item =>
        item.id === itemId ? { ...item, channel: newChannel } : item
      );

      // Also update the corresponding transaction's subhead
      const updatedTransactions = stateData.transactions.map(txn => {
        if (txn.id === `sales-${itemId}`) {
          return { ...txn, subhead: newChannel };
        }
        return txn;
      });

      // Recalculate totals based on updated line items
      let grossSales = 0;
      let returns = 0;
      let interCompanyTransfers = 0;
      const salesByChannel: { [key: string]: number } = {};

      updatedLineItems.forEach(item => {
        if (item.isReturn) {
          returns += item.amount;
        } else if (item.isInterCompany) {
          interCompanyTransfers += item.amount;
        } else {
          grossSales += item.amount;
          salesByChannel[item.channel] = (salesByChannel[item.channel] || 0) + item.amount;
        }
      });

      const updatedSalesData = {
        ...stateData.salesData,
        grossSales,
        returns,
        interCompanyTransfers,
        netSales: grossSales,
        salesByChannel: Object.keys(salesByChannel).length > 0 ? salesByChannel : undefined,
        lineItems: updatedLineItems
      };

      return {
        ...prev,
        stateData: {
          ...prev.stateData,
          [stateCode]: {
            ...stateData,
            salesData: updatedSalesData,
            transactions: updatedTransactions
          }
        }
      };
    });
  }, []);

  // Get all sales line items for a state (for verification)
  const getSalesLineItems = useCallback((stateCode: IndianState) => {
    const stateData = multiState.stateData[stateCode];
    return stateData?.salesData?.lineItems || [];
  }, [multiState.stateData]);

  // Get all sales line items across all states
  const getAllSalesLineItems = useCallback(() => {
    const allItems: { stateCode: IndianState; items: SalesRegisterData['lineItems'] }[] = [];

    Object.entries(multiState.stateData).forEach(([stateCode, stateData]) => {
      if (stateData?.salesData?.lineItems) {
        allItems.push({
          stateCode: stateCode as IndianState,
          items: stateData.salesData.lineItems
        });
      }
    });

    return allItems;
  }, [multiState.stateData]);

  return {
    // Single mode state
    ...state,
    transactions,
    balanceSheetData,
    cogsData,
    purchaseTotal,
    salesData,
    // Single mode functions
    parseJournal,
    parseBalanceSheet,
    parsePurchase,
    parseSales,
    clearError,
    resetAll,
    setCOGSManually,
    setNetSalesManually,
    // Multi-state mode
    multiState,
    toggleState,
    setActiveState,
    parseJournalForState,
    parseBalanceSheetForState,
    parsePurchaseForState,
    parseSalesForState,
    getAggregatedData,
    getStateFileStatus,
    // Sales verification
    updateSalesLineItem,
    getSalesLineItems,
    getAllSalesLineItems
  };
}
