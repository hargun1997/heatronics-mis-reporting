/**
 * Hook for managing MIS data on a per-month basis
 *
 * This hook integrates with the MISDataStore to properly store
 * and retrieve data for each month, preventing data mixing.
 */

import { useState, useCallback, useMemo } from 'react';
import { misDataStore } from '../services/misDataStore';
import {
  MonthlyMISRecord,
  MonthlyBSData,
  AggregatedMISRecord,
  ParsedJournalEntry,
  getMonthKey,
  getMonthRange,
} from '../types/monthlyMIS';
import { parseBalanceSheetPDF } from '../utils/pdfParser';
import { parseJournalRegister } from '../utils/journalParser';
import * as XLSX from 'xlsx';

interface UseMISMonthlyDataState {
  currentMonth: string;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

interface BSUploadResult {
  month: string;
  state: string;
  data: MonthlyBSData;
}

export function useMISMonthlyData(initialMonth?: string) {
  const [state, setState] = useState<UseMISMonthlyDataState>({
    currentMonth: initialMonth || getMonthKey(new Date()),
    isLoading: false,
    error: null,
    lastUpdated: null,
  });

  // Get current month's data
  const currentMonthData = useMemo(() => {
    return misDataStore.getMonth(state.currentMonth);
  }, [state.currentMonth, state.lastUpdated]);

  // Set current month
  const setCurrentMonth = useCallback((month: string) => {
    setState(prev => ({ ...prev, currentMonth: month }));
  }, []);

  // Upload Balance Sheet for a specific month and state
  const uploadBalanceSheet = useCallback(async (
    file: File,
    month: string,
    stateCode: string
  ): Promise<BSUploadResult> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Parse PDF
      const pdfResult = await parseBalanceSheetPDF(file);

      // Create BSData object
      const bsData: Omit<MonthlyBSData, 'month' | 'state'> = {
        openingStock: pdfResult.openingStock,
        purchases: pdfResult.purchases,
        closingStock: pdfResult.closingStock,
        grossSales: pdfResult.grossSales,
        directExpenses: 0, // TODO: Parse from Trading Account
        grossProfit: pdfResult.grossProfit,
        netProfit: pdfResult.netProfit,
        netLoss: pdfResult.netLoss,
        parsedAt: new Date(),
        sourceFile: file.name,
        extractedLines: pdfResult.extractedLines,
      };

      // Store in data store
      misDataStore.storeBSData(month, stateCode, bsData);

      // Update state to trigger re-render
      setState(prev => ({
        ...prev,
        isLoading: false,
        lastUpdated: new Date(),
      }));

      console.log(`Stored BS data for ${month} / ${stateCode}:`, bsData);

      return {
        month,
        state: stateCode,
        data: { ...bsData, month, state: stateCode },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse balance sheet';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, []);

  // Upload Journal Register (will auto-group by month)
  const uploadJournalRegister = useCallback(async (
    file: File
  ): Promise<{ entriesByMonth: Map<string, ParsedJournalEntry[]>; stats: { total: number; skipped: number } }> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Read Excel file
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];

      // Parse using new journal parser
      const { entriesByMonth, totalVouchers, totalExpenses, skippedVouchers } = parseJournalRegister(data);

      // Store each month's entries
      for (const [month, entries] of entriesByMonth) {
        if (month !== 'unknown') {
          misDataStore.storeJournalEntries(month, entries, file.name);
          console.log(`Stored ${entries.length} journal entries for ${month}`);
        }
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        lastUpdated: new Date(),
      }));

      return {
        entriesByMonth,
        stats: {
          total: totalVouchers,
          skipped: skippedVouchers,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse journal register';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, []);

  // Get data for a single month
  const getMonthData = useCallback((month: string): MonthlyMISRecord | undefined => {
    return misDataStore.getMonth(month);
  }, [state.lastUpdated]);

  // Get aggregated data for a range
  const getAggregatedData = useCallback((startMonth: string, endMonth: string): AggregatedMISRecord => {
    return misDataStore.getAggregated(startMonth, endMonth);
  }, [state.lastUpdated]);

  // Get available months
  const availableMonths = useMemo(() => {
    return misDataStore.getAvailableMonths();
  }, [state.lastUpdated]);

  // Check if month has data
  const hasDataForMonth = useCallback((month: string): boolean => {
    return misDataStore.hasData(month);
  }, [state.lastUpdated]);

  // Get data summary
  const dataSummary = useMemo(() => {
    return misDataStore.getDataSummary();
  }, [state.lastUpdated]);

  // Clear all data
  const clearAll = useCallback(() => {
    misDataStore.clear();
    setState(prev => ({ ...prev, lastUpdated: new Date() }));
  }, []);

  // Clear specific month
  const clearMonth = useCallback((month: string) => {
    misDataStore.clearMonth(month);
    setState(prev => ({ ...prev, lastUpdated: new Date() }));
  }, []);

  // Get BS data for current month and state
  const getBSDataForMonth = useCallback((month: string, stateCode: string): MonthlyBSData | undefined => {
    return misDataStore.getBSData(month, stateCode);
  }, [state.lastUpdated]);

  return {
    // State
    currentMonth: state.currentMonth,
    isLoading: state.isLoading,
    error: state.error,

    // Current month data
    currentMonthData,

    // Actions
    setCurrentMonth,
    uploadBalanceSheet,
    uploadJournalRegister,

    // Data access
    getMonthData,
    getAggregatedData,
    getBSDataForMonth,
    hasDataForMonth,

    // Metadata
    availableMonths,
    dataSummary,

    // Clear
    clearAll,
    clearMonth,
  };
}

/**
 * Helper: Get month string from various date formats
 */
export function parseMonthFromInput(input: string | Date): string {
  if (input instanceof Date) {
    return getMonthKey(input);
  }

  // Try parsing as ISO date
  const date = new Date(input);
  if (!isNaN(date.getTime())) {
    return getMonthKey(date);
  }

  // Try parsing as YYYY-MM
  if (/^\d{4}-\d{2}$/.test(input)) {
    return input;
  }

  // Try parsing as MMM YYYY (e.g., "Dec 2025")
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const match = input.toLowerCase().match(/(\w{3})\s*(\d{4})/);
  if (match) {
    const monthIndex = monthNames.indexOf(match[1]);
    if (monthIndex >= 0) {
      return `${match[2]}-${String(monthIndex + 1).padStart(2, '0')}`;
    }
  }

  return input;
}
