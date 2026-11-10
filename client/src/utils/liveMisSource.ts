// ----------------------------------------------------------------------------
// The Live MIS export options + the MIS-format source of the live months: everything the Live MIS page needs
// without the Excel / PDF libraries (liveMisExport.ts / liveMisPdf.ts import xlsx-js-style / jspdf and are
// loaded only when a download is asked for). liveMisExport.ts re-exports these names.
// ----------------------------------------------------------------------------

import type { LiveDeckData } from '../data/misDeck/liveDeck';
import { SALES_CHANNELS, type SalesChannel } from '../data/misDeck/misDeckData';
import type { Granularity, PeriodAgg } from '../data/misDeck/liveAnalytics';
import { channelName, liveFiscalYears, liveMisPoint, aggregateRange } from '../data/misDeck/liveViews';
import type { MisFormatSource } from './misFormatExport';
import { misCashRows, type BalanceSheet, type CashFlow } from '../data/statements/statements';
import type { MisPoint } from '../data/misDeck/misSheet';
import { cashOverMonths } from '../data/misDeck/misPeriods';

// ---- Options ---------------------------------------------------------------

export interface LiveExportOptions {
  includeSummary: boolean;
  granularities: Granularity[];
  includeChannelRevenue: boolean;
  /** Channel P&L per FY (MIS-anchored) + SKU x Channel. */
  includeChannelPnl: boolean;
  includeOrders: boolean;
  includeRepeats: boolean;
  includeDiscounts: boolean;
  includeCogmDetail: boolean;
  includeOpexDetail: boolean;
  includeMarketing: boolean;
  includeUnits: boolean;
  includeSkuCells: boolean;
  /** From Tally's stored month-end Trial Balances (Live MIS tabs of the same names). */
  includeBalanceSheet: boolean;
  includeCashFlow: boolean;
  /** The standard MIS Sheet (company, ₹ Lac) with the Tally cash rows filled in. */
  includeMisSheet: boolean;
  /**
   * Normalised COGM on the P&L and MIS sheets: BOM cost of the units sold + factory overhead, Tally's purchase-timing
   * difference as the "Stock build / drawdown" memo line (months with no BOM costing stay as booked, noted).
   */
  normaliseCogm: boolean;
  /** Continuous channel taxonomy (OEM→B2B, Offline→GT). */
  mergeChannels: boolean;
}

export const LIVE_EXPORT_EVERYTHING: LiveExportOptions = {
  includeSummary: true, granularities: ['month', 'quarter', 'year'], includeChannelRevenue: true, includeChannelPnl: true,
  includeOrders: true, includeRepeats: true, includeDiscounts: true, includeCogmDetail: true,
  includeOpexDetail: true, includeMarketing: true, includeUnits: true, includeSkuCells: true,
  includeBalanceSheet: true, includeCashFlow: true, includeMisSheet: true,
  normaliseCogm: false, mergeChannels: true,
};

export function liveSheetCount(o: LiveExportOptions): number {
  return (o.includeSummary ? 1 : 0) + o.granularities.length + (o.includeChannelRevenue ? 1 : 0) + (o.includeChannelPnl ? 2 : 0)
    + (o.includeOrders ? 1 : 0) + (o.includeRepeats ? 1 : 0) + (o.includeDiscounts ? 1 : 0) + (o.includeCogmDetail ? 1 : 0)
    + (o.includeOpexDetail ? 1 : 0) + (o.includeMarketing ? 1 : 0) + (o.includeUnits ? 1 : 0) + (o.includeSkuCells ? 1 : 0)
    + (o.includeBalanceSheet ? 1 : 0) + (o.includeCashFlow ? 1 : 0) + (o.includeMisSheet ? 1 : 0);
}

// ---- Statements + cash rows ------------------------------------------------

export interface LiveStatements { sheets: BalanceSheet[]; flows: CashFlow[] }


/**
 * A MIS-format source whose company cash rows (opening / closing / funding / burn / runway) come from the Cash Flow.
 * A multi-month total uses the months that have a stored cash flow (misPeriods.cashOverMonths) and names them in
 * `cashMonths` ("Oct–Nov") when not every month has one, instead of going blank.
 */
export function misSourceWithCash(src: MisFormatSource, flows: CashFlow[]): MisFormatSource {
  return {
    ...src,
    point: (keys, entity) => {
      const p = src.point(keys, entity);
      if (entity !== 'company') return p;
      const c = cashOverMonths(keys, (k) => misCashRows(flows, k));
      if (!c) return p;
      return { ...p, openingCash: c.openingCash, closingCash: c.closingCash, funding: c.funding, cashBurn: c.cashBurn, runway: c.runway, cashMonths: c.label } as MisPoint;
    },
  };
}

// ---- MIS-format (standard MIS Sheet) source for the Live months ------------

/** The live months as a MisFormatSource — feeds both the MIS Sheet tab and its download. */
export function liveMisFormatSource(deck: LiveDeckData, merged: boolean): MisFormatSource {
  const chans = SALES_CHANNELS.filter((c) => deck.months.some((m) => (m.netByChannel[c] ?? 0) !== 0));
  const cache = new Map<string, PeriodAgg | null>();
  const aggOf = (keys: string[]) => {
    const id = keys.join(',');
    if (!cache.has(id)) cache.set(id, aggregateRange(deck.months, deck.completeness, keys, ''));
    return cache.get(id)!;
  };
  return {
    fiscalYears: liveFiscalYears(deck.months),
    point: (keys, entity) => {
      const p = aggOf(keys);
      if (!p) return liveMisPointEmpty();
      return liveMisPoint(p, entity, deck.skuCells, deck.completeness);
    },
    channels: chans as SalesChannel[],
    label: (e) => (e === 'company' ? 'Company' : channelName(e, merged)),
    title: 'HEATRONICS LIVE MIS · Company P&L (₹ Lac)',
    fileName: `Heatronics_Live_MIS_Sheet_${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}

function liveMisPointEmpty() {
  return {
    qty: null, grossRevenue: null, channelMargin: null, returns: null, gst: null, ssClaim: null, discounts: null, netRevenue: null,
    cogs: null, grossMargin: null, stockVariance: null, logistics: null, cm1: null, marketing: null, cm2: null, branding: null, cm3: null, payroll: null,
    profFee: null, otherExpense: null, otherIncome: null, ebitda: null, openingCash: null, funding: null, closingCash: null,
    cashBurn: null, ebitdaBurn: null, runway: null,
  };
}
