import { useState, useCallback } from 'react';
import { BalanceSheetData, COGSData, SalesRegisterData, IndianState, StateFileData, createEmptyStateFileData, AggregatedRevenueData, SalesLineItem } from '../types';
import { parsePurchaseExcel, parseBalanceSheetExcel, parseSalesExcel } from '../utils/excelParser';
import { parseBalanceSheetPDF } from '../utils/pdfParser';
import { parseBalanceSheetEnhanced } from '../utils/balanceSheetParser';
import { calculateCOGS } from '../utils/cogsCalculator';
import { EnhancedBalanceSheetData } from '../types/balanceSheet';

// Generate unique ID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export interface FileParseState {
  balanceSheetFile: File | null;
  purchaseFile: File | null;
  salesFile: File | null;
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
  // Single-mode state
  const [state, setState] = useState<FileParseState>({
    balanceSheetFile: null,
    purchaseFile: null,
    salesFile: null,
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

      let newActiveState = prev.activeState;
      if (isSelected && prev.activeState === stateCode) {
        newActiveState = newSelectedStates.length > 0 ? newSelectedStates[0] : null;
      } else if (!isSelected && !prev.activeState) {
        newActiveState = stateCode;
      }

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
          netSales: excelResult.sales,
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

      const purchases = result.purchases > 0 ? result.purchases : purchaseTotal;
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
  const parseBalanceSheetForState = useCallback(async (file: File, stateCode: IndianState) => {
    setMultiState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Parse basic balance sheet data (for COGM calculations)
      let basicResult: BalanceSheetData;

      if (file.name.toLowerCase().endsWith('.pdf')) {
        const pdfResult = await parseBalanceSheetPDF(file);
        basicResult = {
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
        basicResult = {
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

      // Parse enhanced balance sheet data (for expense extraction)
      const enhancedResult = await parseBalanceSheetEnhanced(file);
      let enhancedData: EnhancedBalanceSheetData | undefined;

      if (enhancedResult.success && enhancedResult.data) {
        enhancedData = enhancedResult.data;
        console.log(`[${stateCode}] Enhanced BS parsed:`, {
          mappedItems: enhancedData.mappedItems.length,
          unmappedItems: enhancedData.unmappedItems.length,
          totalExpenses: enhancedData.totalExpenses
        });

        // Use enhanced data for key figures if basic parsing missed them
        if (basicResult.openingStock === 0 && enhancedData.tradingAccount.openingStock > 0) {
          basicResult.openingStock = enhancedData.tradingAccount.openingStock;
        }
        if (basicResult.closingStock === 0 && enhancedData.tradingAccount.closingStock > 0) {
          basicResult.closingStock = enhancedData.tradingAccount.closingStock;
        }
        if (basicResult.purchases === 0 && enhancedData.tradingAccount.purchases > 0) {
          basicResult.purchases = enhancedData.tradingAccount.purchases;
        }
        if (basicResult.grossSales === 0 && enhancedData.tradingAccount.sales > 0) {
          basicResult.grossSales = enhancedData.tradingAccount.sales;
          basicResult.netSales = enhancedData.tradingAccount.sales;
        }
        if (basicResult.netProfit === 0 && enhancedData.plAccount.netProfitLoss !== 0) {
          basicResult.netProfit = enhancedData.plAccount.netProfitLoss;
        }
      }

      setMultiState(prev => {
        const stateData = prev.stateData[stateCode] || createEmptyStateFileData();
        const purchases = basicResult.purchases > 0 ? basicResult.purchases : (stateData.purchaseTotal || 0);
        const cogs = purchases > 0 ? calculateCOGS(basicResult.openingStock, purchases, basicResult.closingStock) : null;

        return {
          ...prev,
          loading: false,
          stateData: {
            ...prev.stateData,
            [stateCode]: {
              ...stateData,
              balanceSheetFile: file,
              balanceSheetParsed: true,
              balanceSheetData: basicResult,
              cogsData: cogs,
              enhancedBalanceSheetData: enhancedData
            }
          }
        };
      });

      return basicResult;
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
      const result = await parseSalesExcel(file, stateCode);

      setMultiState(prev => {
        const stateData = prev.stateData[stateCode] || createEmptyStateFileData();

        return {
          ...prev,
          loading: false,
          stateData: {
            ...prev.stateData,
            [stateCode]: {
              ...stateData,
              salesFile: file,
              salesParsed: true,
              salesData: result.salesData
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
    let totalPurchase = 0;
    const salesByChannel: { [key: string]: number } = {};

    let totalGrossSales = 0;
    let totalStockTransfer = 0;
    let totalReturns = 0;
    let totalTaxes = 0;
    let totalDiscounts = 0;
    const salesByState: { [key in IndianState]?: number } = {};
    const returnsByState: { [key in IndianState]?: number } = {};

    Object.entries(multiState.stateData).forEach(([stateCode, stateData]) => {
      if (stateData) {
        totalPurchase += stateData.purchaseTotal || 0;

        if (stateData.salesData) {
          totalGrossSales += stateData.salesData.grossSales || 0;
          totalStockTransfer += stateData.salesData.interCompanyTransfers || 0;
          totalReturns += stateData.salesData.returns || 0;
          totalTaxes += stateData.salesData.totalTaxes || 0;

          salesByState[stateCode as IndianState] = stateData.salesData.netSales || 0;
          returnsByState[stateCode as IndianState] = stateData.salesData.returns || 0;

          if (stateData.salesData.salesByChannel) {
            Object.entries(stateData.salesData.salesByChannel).forEach(([channel, amount]) => {
              salesByChannel[channel] = (salesByChannel[channel] || 0) + amount;
            });
          }
        }
      }
    });

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
      transactions: [], // No more journal transactions
      totalPurchase,
      totalSales: totalNetRevenue,
      salesByChannel,
      revenueData
    };
  }, [multiState.stateData]);

  // Get file status for a specific state
  const getStateFileStatus = useCallback((stateCode: IndianState) => {
    const data = multiState.stateData[stateCode];
    return {
      balanceSheet: data?.balanceSheetParsed || false,
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
      balanceSheetFile: null,
      purchaseFile: null,
      salesFile: null,
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

  // Update a sales line item's channel
  const updateSalesLineItem = useCallback((stateCode: IndianState, itemId: string, newChannel: string) => {
    setMultiState(prev => {
      const stateData = prev.stateData[stateCode];
      if (!stateData || !stateData.salesData || !stateData.salesData.lineItems) {
        return prev;
      }

      const updatedLineItems = stateData.salesData.lineItems.map(item =>
        item.id === itemId ? { ...item, channel: newChannel } : item
      );

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
            salesData: updatedSalesData
          }
        }
      };
    });
  }, []);

  // Get all sales line items for a state
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
    balanceSheetData,
    cogsData,
    purchaseTotal,
    salesData,
    // Single mode functions
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
