import { useState, useCallback } from 'react';
import { Transaction, BalanceSheetData, COGSData } from '../types';
import { parseJournalExcel, parsePurchaseExcel, parseBalanceSheetExcel } from '../utils/excelParser';
import { parseBalanceSheetPDF } from '../utils/pdfParser';
import { calculateCOGS } from '../utils/cogsCalculator';

export interface FileParseState {
  journalFile: File | null;
  balanceSheetFile: File | null;
  purchaseFile: File | null;
  journalParsed: boolean;
  balanceSheetParsed: boolean;
  purchaseParsed: boolean;
  loading: boolean;
  error: string | null;
}

export function useFileParser() {
  const [state, setState] = useState<FileParseState>({
    journalFile: null,
    balanceSheetFile: null,
    purchaseFile: null,
    journalParsed: false,
    balanceSheetParsed: false,
    purchaseParsed: false,
    loading: false,
    error: null
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetData | null>(null);
  const [cogsData, setCOGSData] = useState<COGSData | null>(null);
  const [purchaseTotal, setPurchaseTotal] = useState<number>(0);

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

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const resetAll = useCallback(() => {
    setState({
      journalFile: null,
      balanceSheetFile: null,
      purchaseFile: null,
      journalParsed: false,
      balanceSheetParsed: false,
      purchaseParsed: false,
      loading: false,
      error: null
    });
    setTransactions([]);
    setBalanceSheetData(null);
    setCOGSData(null);
    setPurchaseTotal(0);
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

  return {
    ...state,
    transactions,
    balanceSheetData,
    cogsData,
    purchaseTotal,
    parseJournal,
    parseBalanceSheet,
    parsePurchase,
    clearError,
    resetAll,
    setCOGSManually,
    setNetSalesManually
  };
}
