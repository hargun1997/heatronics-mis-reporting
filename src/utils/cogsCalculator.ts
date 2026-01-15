import { COGSData } from '../types';

export function calculateCOGS(
  openingStock: number,
  purchases: number,
  closingStock: number
): COGSData {
  const cogs = openingStock + purchases - closingStock;
  return {
    openingStock,
    purchases,
    closingStock,
    cogs: Math.max(0, cogs) // COGS shouldn't be negative
  };
}

export function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);

  // Indian numbering format
  if (absAmount >= 10000000) {
    // Crores
    return (amount < 0 ? '-' : '') + '₹' + (absAmount / 10000000).toFixed(2) + ' Cr';
  } else if (absAmount >= 100000) {
    // Lakhs
    return (amount < 0 ? '-' : '') + '₹' + (absAmount / 100000).toFixed(2) + ' L';
  } else if (absAmount >= 1000) {
    // Thousands
    return (amount < 0 ? '-' : '') + '₹' + absAmount.toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
  } else {
    return (amount < 0 ? '-' : '') + '₹' + absAmount.toFixed(2);
  }
}

export function formatCurrencyFull(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return sign + '₹' + Math.abs(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

export function formatPercentage(value: number, total: number): string {
  if (total === 0) return '0%';
  const percentage = (value / total) * 100;
  return percentage.toFixed(1) + '%';
}
