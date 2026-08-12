/**
 * MIS Deck — Excel Export
 *
 * Exports everything shown on the live MIS Reporting deck (and the full
 * underlying dataset) into a styled, multi-sheet Excel workbook.
 *
 * Unlike `misExcelExport.ts` (which works off the legacy `MISRecord` upload
 * flow), this exporter works directly off the bundled deck data
 * (`MONTHLY_MIS` + the analytics layer) — i.e. exactly what users see on the
 * MIS Reporting deck. That keeps the export tied to the current source of
 * truth, which is restated/reconciled to the company's provisional accounts.
 */

import XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import {
  MONTHLY_MIS,
  FY_SUMMARY,
  SALES_CHANNELS,
  MIS_SOURCE_FILE,
  MIS_GENERATED_AT,
  D2C_REPEATS,
  AMAZON_REPEATS,
  DISCOUNT_DATA,
  type MonthlyMIS,
} from '../data/misDeck/misDeckData';
import {
  seriesFor,
  seriesForBlended,
  fyBlendedGMRates,
  monthlySeries,
  yearlySeries,
  marginsOf,
  channelMix,
  channelPnl,
  adSpendForPeriod,
  ordersByChannel,
  channelLabel,
  CHANNEL_AOV,
  deckFacts,
  channelPnlAnchored,
  skuChannelMatrix,
  FACTORY_PCT,
  type PeriodMIS,
  type Granularity,
  type ChannelPnlRow,
} from '../data/misDeck/analytics';

// ============================================
// OPTIONS
// ============================================

export interface DeckExportOptions {
  includeSummary: boolean;
  /** P&L cascade sheets, one per chosen granularity. */
  granularities: Granularity[];
  includeChannelRevenue: boolean;
  /** Channel-level P&L per fiscal year (marketing attributed by ad spend). */
  includeChannelPnl: boolean;
  /** Estimated orders per channel per month (net revenue ÷ AOV). */
  includeOrders: boolean;
  /** Repeat-purchase behaviour — Shopify (D2C) & Amazon. */
  includeRepeats: boolean;
  /** Monthly discounts & total sales (storefront). */
  includeDiscounts: boolean;
  includeCogmDetail: boolean;
  /**
   * Blend COGM to each fiscal year's revenue-weighted rate on the P&L cascade
   * sheets (smooths the month-to-month COGM booking-timing noise). The COGM
   * Detail sheet always stays on actual figures.
   */
  blendCogm: boolean;
}

/** Everything on, every granularity — the "Export Everything" preset. */
export const EXPORT_EVERYTHING: DeckExportOptions = {
  includeSummary: true,
  granularities: ['month', 'quarter', 'year'],
  includeChannelRevenue: true,
  includeChannelPnl: true,
  includeOrders: true,
  includeRepeats: true,
  includeDiscounts: true,
  includeCogmDetail: true,
  blendCogm: true,
};

// ============================================
// STYLES
// ============================================

const C = {
  headerBg: '1E3A5F',
  headerText: 'FFFFFF',
  sectionBg: '2C5282',
  grossBg: 'D4EDDA',
  grossText: '155724',
  cm1Bg: 'CCE5FF',
  cm1Text: '004085',
  cm2Bg: 'E2D6F8',
  cm2Text: '4A148C',
  cm3Bg: 'FFE5B4',
  cm3Text: 'E65100',
  ebitdaBg: 'B2EBF2',
  ebitdaText: '006064',
  netBg: 'C8E6C9',
  netText: '1B5E20',
  negText: 'C62828',
  totalBg: 'E9ECEF',
  border: 'DEE2E6',
};

type Style = NonNullable<XLSX.CellObject['s']>;

const NUM_FMT = '#,##0';
const PCT_FMT = '0.0%';

const border = { bottom: { style: 'thin', color: { rgb: C.border } } };

const S: Record<string, Style> = {
  title: {
    font: { bold: true, sz: 15, color: { rgb: C.headerText }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.headerBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  subtitle: {
    font: { sz: 10, italic: true, color: { rgb: C.headerText }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.sectionBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  },
  header: {
    font: { bold: true, sz: 10, color: { rgb: C.headerText }, name: 'Calibri' },
    fill: { fgColor: { rgb: C.headerBg }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  },
  label: {
    font: { sz: 10, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'center' },
    border,
  },
  num: {
    font: { sz: 10, name: 'Calibri' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border,
    numFmt: NUM_FMT,
  },
  pct: {
    font: { sz: 10, name: 'Calibri' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border,
    numFmt: PCT_FMT,
  },
  total: {
    font: { bold: true, sz: 10, name: 'Calibri' },
    fill: { fgColor: { rgb: C.totalBg }, patternType: 'solid' },
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: NUM_FMT,
  },
  totalLabel: {
    font: { bold: true, sz: 10, name: 'Calibri' },
    fill: { fgColor: { rgb: C.totalBg }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  },
};

// Margin-row style pair (label + number), parameterised by colour.
function marginStyles(bg: string, text: string, sz = 10): { label: Style; num: Style; pct: Style } {
  const base = {
    font: { bold: true, sz, color: { rgb: text }, name: 'Calibri' },
    fill: { fgColor: { rgb: bg }, patternType: 'solid' },
  };
  return {
    label: { ...base, alignment: { horizontal: 'left', vertical: 'center' } },
    num: { ...base, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM_FMT },
    pct: { ...base, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: PCT_FMT },
  };
}

const MARGIN = {
  net: marginStyles(C.grossBg, C.grossText, 11),
  gross: marginStyles(C.grossBg, C.grossText),
  cm1: marginStyles(C.cm1Bg, C.cm1Text),
  cm2: marginStyles(C.cm2Bg, C.cm2Text),
  cm3: marginStyles(C.cm3Bg, C.cm3Text),
  ebitda: marginStyles(C.ebitdaBg, C.ebitdaText),
  netIncome: marginStyles(C.netBg, C.netText, 11),
};

// ============================================
// HELPERS
// ============================================

function cell(v: string | number, s: Style): XLSX.CellObject {
  return { v, t: typeof v === 'number' ? 'n' : 's', s };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function setCols(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map((w) => ({ wch: w }));
}

/** Negative number gets red text; everything else keeps the base style. */
function signed(value: number, base: Style): Style {
  if (value < 0) {
    return { ...base, font: { ...(base.font || {}), color: { rgb: C.negText } } };
  }
  return base;
}

// ============================================
// P&L CASCADE SHEET (period columns)
// ============================================

interface PLLine {
  label: string;
  /** Period value for this line. Expenses are positive magnitudes ("Less:" label conveys the deduction). */
  value: (p: PeriodMIS) => number;
  styles: { label: Style; num: Style };
  /** Margin lines also get a "% of net revenue" row. */
  marginPct?: (p: PeriodMIS) => number;
  pctStyle?: Style;
}

function generatePLSheet(series: PeriodMIS[], title: string, subtitle: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const nCols = series.length + 2; // Particulars + periods + Total
  let row = 0;

  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };

  // Title band
  put(row, 0, title, S.title);
  for (let c = 1; c < nCols; c++) put(row, c, '', S.title);
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
  row++;

  put(row, 0, subtitle, S.subtitle);
  for (let c = 1; c < nCols; c++) put(row, c, '', S.subtitle);
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
  row++;
  row++; // spacer

  // Header row
  put(row, 0, 'Particulars', S.header);
  series.forEach((p, i) => put(row, i + 1, p.longLabel, S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;

  // Expenses are shown as positive magnitudes — the "Less:" row label carries
  // the deduction sense. Margin lines below use real signed values, so genuine
  // losses still render negative (red). Every line (revenue, expenses and
  // margins) also carries a "% of net revenue" row, matching the on-screen P&L.
  const expense = (fn: (p: PeriodMIS) => number) => fn;
  const shareOf = (fn: (p: PeriodMIS) => number) => (p: PeriodMIS) => (p.netRevenue ? fn(p) / p.netRevenue : 0);

  const lines: (PLLine | 'spacer')[] = [
    {
      label: 'NET REVENUE',
      value: (p) => p.netRevenue,
      styles: { label: MARGIN.net.label, num: MARGIN.net.num },
      marginPct: () => 1,
      pctStyle: MARGIN.net.pct,
    },
    {
      label: 'Less: COGM',
      value: expense((p) => p.cogm),
      styles: { label: S.label, num: S.num },
      marginPct: shareOf((p) => p.cogm),
      pctStyle: S.pct,
    },
    {
      label: 'GROSS MARGIN',
      value: (p) => p.grossMargin,
      styles: { label: MARGIN.gross.label, num: MARGIN.gross.num },
      marginPct: (p) => marginsOf(p).grossMarginPct,
      pctStyle: MARGIN.gross.pct,
    },
    'spacer',
    {
      label: 'Less: Channel & Fulfillment',
      value: expense((p) => p.channelFulfillment),
      styles: { label: S.label, num: S.num },
      marginPct: shareOf((p) => p.channelFulfillment),
      pctStyle: S.pct,
    },
    {
      label: 'CM1 (Contribution Margin 1)',
      value: (p) => p.cm1,
      styles: { label: MARGIN.cm1.label, num: MARGIN.cm1.num },
      marginPct: (p) => marginsOf(p).cm1Pct,
      pctStyle: MARGIN.cm1.pct,
    },
    'spacer',
    {
      label: 'Less: Sales & Marketing',
      value: expense((p) => p.salesMarketing),
      styles: { label: S.label, num: S.num },
      marginPct: shareOf((p) => p.salesMarketing),
      pctStyle: S.pct,
    },
    {
      label: 'CM2 (Contribution Margin 2)',
      value: (p) => p.cm2,
      styles: { label: MARGIN.cm2.label, num: MARGIN.cm2.num },
      marginPct: (p) => marginsOf(p).cm2Pct,
      pctStyle: MARGIN.cm2.pct,
    },
    'spacer',
    {
      label: 'Less: Brand Investment',
      value: expense((p) => p.platformCosts),
      styles: { label: S.label, num: S.num },
      marginPct: shareOf((p) => p.platformCosts),
      pctStyle: S.pct,
    },
    {
      label: 'CM3 (Contribution Margin 3)',
      value: (p) => p.cm3,
      styles: { label: MARGIN.cm3.label, num: MARGIN.cm3.num },
      marginPct: (p) => marginsOf(p).cm3Pct,
      pctStyle: MARGIN.cm3.pct,
    },
    'spacer',
    {
      label: 'Less: Operating Expenses',
      value: expense((p) => p.opex),
      styles: { label: S.label, num: S.num },
      marginPct: shareOf((p) => p.opex),
      pctStyle: S.pct,
    },
    {
      label: 'EBITDA',
      value: (p) => p.ebitda,
      styles: { label: MARGIN.ebitda.label, num: MARGIN.ebitda.num },
      marginPct: (p) => marginsOf(p).ebitdaPct,
      pctStyle: MARGIN.ebitda.pct,
    },
    'spacer',
    {
      label: 'Less: Cost of Fundraising',
      value: expense((p) => p.costOfFundraising),
      styles: { label: S.label, num: S.num },
      marginPct: shareOf((p) => p.costOfFundraising),
      pctStyle: S.pct,
    },
    {
      label: 'Less: Non-Operating (Int/Dep/Amort/Tax)',
      value: expense((p) => p.nonOpOther),
      styles: { label: S.label, num: S.num },
      marginPct: shareOf((p) => p.nonOpOther),
      pctStyle: S.pct,
    },
    {
      label: 'NET INCOME',
      value: (p) => p.netIncome,
      styles: { label: MARGIN.netIncome.label, num: MARGIN.netIncome.num },
      marginPct: (p) => marginsOf(p).netIncomePct,
      pctStyle: MARGIN.netIncome.pct,
    },
  ];

  const totalNet = series.reduce((s, p) => s + p.netRevenue, 0) || 1;

  for (const line of lines) {
    if (line === 'spacer') {
      row++;
      continue;
    }
    put(row, 0, line.label, line.styles.label);
    let total = 0;
    series.forEach((p, i) => {
      const v = round2(line.value(p));
      total += v;
      put(row, i + 1, v, signed(v, line.styles.num));
    });
    put(row, nCols - 1, round2(total), signed(total, { ...line.styles.num, fill: S.total.fill, font: { ...(line.styles.num.font || {}), bold: true } }));
    row++;

    if (line.marginPct && line.pctStyle) {
      // Short name for the % row: drop the "Less:" prefix and any parenthetical.
      const shortName = line.label.replace(/^Less:\s*/, '').replace(/\s*\(.*\)$/, '').trim();
      put(row, 0, `   ${shortName} % of Net Revenue`, { ...S.label, font: { ...(S.label.font || {}), italic: true } });
      series.forEach((p, i) => put(row, i + 1, round2(line.marginPct!(p) * 1000) / 1000, line.pctStyle!));
      // Total %: recompute from totals for cascade lines (sum of value / sum of net rev).
      const totalPct = line.label === 'NET REVENUE' ? 1 : total / totalNet;
      put(row, nCols - 1, round2(totalPct * 1000) / 1000, { ...line.pctStyle, font: { ...(line.pctStyle.font || {}), bold: true } });
      row++;
    }
  }

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [34, ...series.map(() => 13), 14]);
  return ws;
}

// ============================================
// CHANNEL REVENUE SHEET
// ============================================

function generateChannelSheet(series: PeriodMIS[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const nCols = series.length + 2;
  let row = 0;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };

  const band = (text: string, s: Style) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
    row++;
  };

  band('CHANNEL-WISE NET REVENUE', S.title);
  band('Net revenue by sales channel (net of returns & GST)', S.subtitle);
  row++;

  // ---- Amounts ----
  put(row, 0, 'Net Revenue (₹)', S.header);
  series.forEach((p, i) => put(row, i + 1, p.longLabel, S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;

  SALES_CHANNELS.forEach((ch) => {
    put(row, 0, ch, S.label);
    let total = 0;
    series.forEach((p, i) => {
      const v = round2(p.netByChannel[ch] || 0);
      total += v;
      put(row, i + 1, v, signed(v, S.num));
    });
    put(row, nCols - 1, round2(total), S.total);
    row++;
  });

  put(row, 0, 'Total Net Revenue', S.totalLabel);
  let grand = 0;
  series.forEach((p, i) => {
    const v = round2(p.netRevenue);
    grand += v;
    put(row, i + 1, v, S.total);
  });
  put(row, nCols - 1, round2(grand), S.total);
  row++;
  row++;

  // ---- Mix % ----
  put(row, 0, 'Channel Mix (% of net revenue)', S.header);
  series.forEach((p, i) => put(row, i + 1, p.longLabel, S.header));
  put(row, nCols - 1, 'Avg', S.header);
  row++;

  SALES_CHANNELS.forEach((ch) => {
    put(row, 0, ch, S.label);
    let sum = 0;
    series.forEach((p, i) => {
      const mix = channelMix(p)[ch] || 0;
      sum += mix;
      put(row, i + 1, round2(mix * 1000) / 1000, S.pct);
    });
    put(row, nCols - 1, series.length ? round2((sum / series.length) * 1000) / 1000 : 0, { ...S.pct, font: { ...(S.pct.font || {}), bold: true } });
    row++;
  });

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [22, ...series.map(() => 13), 14]);
  return ws;
}

// ============================================
// LINE DETAIL SHEET (COGM / OpEx)
// ============================================

function generateLineDetailSheet(
  months: MonthlyMIS[],
  linesKey: 'cogmLines' | 'opexLines',
  title: string,
  subtitleExtra = '',
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const nCols = months.length + 2;
  let row = 0;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };

  // Union of all line-item keys across months, excluding the embedded TOTAL rows
  // (we compute our own total so it always ties to the columns shown).
  const keys: string[] = [];
  for (const m of months) {
    for (const k of Object.keys(m[linesKey] || {})) {
      if (/^total/i.test(k)) continue;
      if (!keys.includes(k)) keys.push(k);
    }
  }

  put(row, 0, title, S.title);
  for (let c = 1; c < nCols; c++) put(row, c, '', S.title);
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
  row++;
  put(row, 0, `Actual line items, positive magnitudes; a negative value denotes a credit/reversal. Months without a line item show blank.${subtitleExtra}`, S.subtitle);
  for (let c = 1; c < nCols; c++) put(row, c, '', S.subtitle);
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
  row++;
  row++;

  put(row, 0, 'Line Item', S.header);
  months.forEach((m, i) => put(row, i + 1, m.label, S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;

  const colTotals = new Array(months.length).fill(0);
  keys.forEach((k) => {
    put(row, 0, k, S.label);
    let rowTotal = 0;
    months.forEach((m, i) => {
      const raw = (m[linesKey] || {})[k];
      if (raw === undefined) {
        put(row, i + 1, '', S.num);
      } else {
        // Source stores expenses as negatives; flip to positive magnitudes so a
        // residual negative correctly flags a credit/reversal.
        const v = round2(-raw);
        rowTotal += v;
        colTotals[i] += v;
        put(row, i + 1, v, signed(v, S.num));
      }
    });
    put(row, nCols - 1, round2(rowTotal), signed(rowTotal, S.total));
    row++;
  });

  put(row, 0, title.replace(/ — .*/, '').includes('COGM') ? 'TOTAL COGM' : 'TOTAL OPERATING EXPENSES', S.totalLabel);
  let grand = 0;
  months.forEach((_, i) => {
    grand += colTotals[i];
    put(row, i + 1, round2(colTotals[i]), S.total);
  });
  put(row, nCols - 1, round2(grand), S.total);
  row++;

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [34, ...months.map(() => 13), 14]);
  return ws;
}

// ============================================
// SUMMARY SHEET
// ============================================

function generateSummarySheet(): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let row = 0;
  const nCols = 6;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };
  const band = (text: string, s: Style) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
    row++;
  };

  band('HEATRONICS — MIS SUMMARY', S.title);
  band(`Source: ${MIS_SOURCE_FILE} · extracted ${MIS_GENERATED_AT} · all values in ₹`, S.subtitle);
  row++;

  const f = deckFacts();
  const kv = (k: string, v: string | number, isNum = false, isPct = false) => {
    put(row, 0, k, S.totalLabel);
    put(row, 1, v, isPct ? S.pct : isNum ? S.num : { ...S.label, alignment: { horizontal: 'left', vertical: 'center' } });
    row++;
  };

  band('Headline', S.header);
  kv('Months of data', f.monthsOfData, true);
  kv('Latest month', f.latest.longLabel);
  kv('Latest net revenue', round2(f.latest.netRevenue), true);
  kv('MoM revenue growth', f.momRevGrowth ?? 0, false, true);
  kv('YoY revenue growth', f.yoyRevGrowth ?? 0, false, true);
  kv('Trailing-12-month revenue', round2(f.ttmRevenue), true);
  kv('TTM growth vs prior 12m', f.ttmGrowth ?? 0, false, true);
  kv('Revenue CAGR (full FYs)', f.revenueCagrFY ?? 0, false, true);
  kv('Latest gross margin %', f.latestMargins.grossMarginPct, false, true);
  kv('Latest EBITDA %', f.latestMargins.ebitdaPct, false, true);
  kv('Latest net income %', f.latestMargins.netIncomePct, false, true);
  kv('Top channel (latest)', `${f.bestChannelLatest.channel} (${(f.bestChannelLatest.share * 100).toFixed(0)}%)`);
  row++;

  // FY summary table
  band('Financial-Year Summary', S.header);
  put(row, 0, 'FY', S.header);
  put(row, 1, 'Net Revenue', S.header);
  put(row, 2, 'Gross Margin %', S.header);
  put(row, 3, 'EBITDA %', S.header);
  put(row, 4, 'Net Income %', S.header);
  put(row, 5, 'Top Channel', S.header);
  row++;

  // Computed live from the monthly data (not a static summary), so it never goes stale.
  yearlySeries().filter((fy) => fy.netRevenue > 0).forEach((fy) => {
    const mix = channelMix(fy);
    const top = SALES_CHANNELS.reduce(
      (best, c) => ((mix[c] || 0) > best.share ? { c, share: mix[c] || 0 } : best),
      { c: SALES_CHANNELS[0] as (typeof SALES_CHANNELS)[number], share: -1 },
    );
    const gmPct = fy.netRevenue ? fy.grossMargin / fy.netRevenue : 0;
    const ebPct = fy.netRevenue ? fy.ebitda / fy.netRevenue : 0;
    const niPct = fy.netRevenue ? fy.netIncome / fy.netRevenue : 0;
    put(row, 0, fy.longLabel, S.label);
    put(row, 1, round2(fy.netRevenue), S.num);
    put(row, 2, round2(gmPct * 1000) / 1000, S.pct);
    put(row, 3, round2(ebPct * 1000) / 1000, signed(ebPct, S.pct));
    put(row, 4, round2(niPct * 1000) / 1000, signed(niPct, S.pct));
    put(row, 5, `${top.c} (${(top.share * 100).toFixed(0)}%)`, S.label);
    row++;
  });

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [28, 18, 16, 14, 14, 20]);
  return ws;
}

// ============================================
// CHANNEL P&L SHEET (channels as columns, per fiscal year)
// ============================================

const MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2025-08" → "Aug '25". */
function keyToLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS3[(m || 1) - 1]} '${String((y || 0) % 100).padStart(2, '0')}`;
}

const CH_PL_LINES: { label: string; key: keyof ChannelPnlRow; kind: 'rev' | 'cost' | 'margin'; m?: keyof typeof MARGIN }[] = [
  { label: 'NET REVENUE', key: 'netRevenue', kind: 'rev', m: 'net' },
  { label: 'Less: COGM', key: 'cogm', kind: 'cost' },
  { label: 'GROSS MARGIN', key: 'grossMargin', kind: 'margin', m: 'gross' },
  { label: 'Less: Channel & Fulfillment', key: 'channelFulfillment', kind: 'cost' },
  { label: 'CM1 (Contribution Margin 1)', key: 'cm1', kind: 'margin', m: 'cm1' },
  { label: 'Less: Sales & Marketing', key: 'salesMarketing', kind: 'cost' },
  { label: 'CM2 (Contribution Margin 2)', key: 'cm2', kind: 'margin', m: 'cm2' },
  { label: 'Less: Brand Investment', key: 'platformCosts', kind: 'cost' },
  { label: 'CM3 (Contribution Margin 3)', key: 'cm3', kind: 'margin', m: 'cm3' },
  { label: 'Less: Operating Expenses', key: 'opex', kind: 'cost' },
  { label: 'EBITDA', key: 'ebitda', kind: 'margin', m: 'ebitda' },
  { label: 'Less: Non-Operating (Int/Dep/Amort/Tax)', key: 'nonOperating', kind: 'cost' },
  { label: 'NET INCOME', key: 'netIncome', kind: 'margin', m: 'netIncome' },
];

function generateChannelPnlSheet(blend: boolean): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const nCols = SALES_CHANNELS.length + 2; // Particulars + channels + Total
  let row = 0;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };
  const band = (text: string, s: Style) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
    row++;
  };

  band('CHANNEL P&L — company totals held, SKU-driven split', S.title);
  band(
    `Company totals (Net Revenue, Gross Margin, CM1/2/3, EBITDA, Net Income) are the MIS book of record and tie to the P&L sheet. Each line is split across channels: revenue by real revenue share, COGM by the real per-unit cost of the actual SKU mix (incl. ${Math.round(FACTORY_PCT * 100)}% factory), all other costs by revenue share. The Total column ties back to the MIS exactly. All in ₹.`,
    S.subtitle,
  );
  row++;

  const anchoredLines: { label: string; get: (r: ReturnType<typeof channelPnlAnchored>[number]) => number; get2: (p: PeriodMIS) => number; margin: boolean }[] = [
    { label: 'NET REVENUE', get: (r) => r.revenue, get2: (p) => p.netRevenue, margin: true },
    { label: 'Less: COGM (real SKU cost + factory)', get: (r) => -r.cogm, get2: (p) => -p.cogm, margin: false },
    { label: 'GROSS MARGIN', get: (r) => r.grossMargin, get2: (p) => p.grossMargin, margin: true },
    { label: 'Less: Channel & Fulfilment', get: (r) => -r.channelFulfillment, get2: (p) => -p.channelFulfillment, margin: false },
    { label: 'CM1', get: (r) => r.cm1, get2: (p) => p.cm1, margin: true },
    { label: 'Less: Sales & Marketing', get: (r) => -r.salesMarketing, get2: (p) => -p.salesMarketing, margin: false },
    { label: 'CM2', get: (r) => r.cm2, get2: (p) => p.cm2, margin: true },
    { label: 'Less: Platform & Payment', get: (r) => -r.platformCosts, get2: (p) => -p.platformCosts, margin: false },
    { label: 'CM3', get: (r) => r.cm3, get2: (p) => p.cm3, margin: true },
    { label: 'Less: Operating expenses', get: (r) => -r.opex, get2: (p) => -p.opex, margin: false },
    { label: 'EBITDA', get: (r) => r.ebitda, get2: (p) => p.ebitda, margin: true },
    { label: 'Less: Non-Operating', get: (r) => -r.nonOperating, get2: (p) => -p.nonOperating, margin: false },
    { label: 'NET INCOME', get: (r) => r.netIncome, get2: (p) => p.netIncome, margin: true },
  ];

  yearlySeries().forEach((p) => {
    const rows = channelPnlAnchored('year', p);
    if (rows.length === 0) return;
    const byCh = new Map(rows.map((r) => [r.channel, r]));
    band(p.longLabel, S.header);
    put(row, 0, 'Particulars', S.header);
    SALES_CHANNELS.forEach((c, i) => put(row, i + 1, channelLabel(c), S.header));
    put(row, nCols - 1, 'Total (MIS)', S.header);
    row++;

    for (const line of anchoredLines) {
      put(row, 0, line.margin ? line.label : `   ${line.label}`, S.label);
      SALES_CHANNELS.forEach((c, i) => {
        const r = byCh.get(c);
        const v = r ? round2(line.get(r)) : 0;
        put(row, i + 1, v, signed(v, S.num));
      });
      // Total = the model's company figure (book of record), not a re-sum.
      const total = round2(line.get2(p));
      put(row, nCols - 1, total, signed(total, { ...S.num, fill: S.total.fill, font: { ...(S.num.font || {}), bold: true } }));
      row++;
    }
    // Net margin % row
    put(row, 0, '   Net margin %', S.label);
    SALES_CHANNELS.forEach((c, i) => {
      const r = byCh.get(c);
      if (r && r.revenue > 0) put(row, i + 1, round2((r.netIncome / r.revenue) * 1000) / 1000, signed(r.netIncome / r.revenue, S.pct));
      else put(row, i + 1, '', S.label);
    });
    const nmTot = p.netRevenue > 0 ? p.netIncome / p.netRevenue : 0;
    put(row, nCols - 1, round2(nmTot * 1000) / 1000, signed(nmTot, S.pct));
    row += 2; // net margin row + spacer
  });

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [34, ...SALES_CHANNELS.map(() => 13), 14]);
  return ws;
}

// ============================================
// SKU × CHANNEL SHEET (product × channel contribution, all-time)
// ============================================

function generateSkuChannelSheet(): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  // Use the full history: aggregate the SKU matrix over the last fiscal year that
  // spans the whole feed is not enough, so build an all-time matrix by unioning years.
  const years = yearlySeries();
  const lastFy = years[years.length - 1];
  const mx = skuChannelMatrix('year', lastFy); // channels/products for column/row shape
  // For an all-time view we sum every FY's matrix.
  const products = new Set<string>();
  const channels = new Set<string>();
  type Agg = { rev: number; con: number };
  const cellMap = new Map<string, Agg>();
  const prodTot = new Map<string, Agg>();
  const chanTot = new Map<string, Agg>();
  let grand: Agg = { rev: 0, con: 0 };
  const add = (m: Map<string, Agg>, k: string, rev: number, con: number) => {
    const a = m.get(k) ?? { rev: 0, con: 0 }; a.rev += rev; a.con += con; m.set(k, a);
  };
  years.forEach((fy) => {
    const m = skuChannelMatrix('year', fy);
    m.products.forEach((p) => {
      products.add(p);
      m.channels.forEach((c) => {
        const a = m.cell(p, c);
        if (!a) return;
        channels.add(c);
        add(cellMap, `${p}||${c}`, a.rev, a.con);
        add(prodTot, p, a.rev, a.con);
        add(chanTot, c, a.rev, a.con);
        grand.rev += a.rev; grand.con += a.con;
      });
    });
  });
  const chans = SALES_CHANNELS.filter((c) => channels.has(c));
  const prods = [...products].sort((a, b) => {
    const ax = a.startsWith('Accessory') ? 1 : 0, bx = b.startsWith('Accessory') ? 1 : 0;
    if (ax !== bx) return ax - bx;
    return (prodTot.get(b)?.rev ?? 0) - (prodTot.get(a)?.rev ?? 0);
  });
  const nCols = chans.length + 2;
  let row = 0;
  const put = (r: number, c: number, v: string | number, s: Style) => { ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s); };
  const band = (text: string, s: Style) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
    row++;
  };
  band('SKU × CHANNEL — CONTRIBUTION (all-time)', S.title);
  band(`Contribution ₹ per product per channel. Real per-SKU COGS + ${Math.round(FACTORY_PCT * 100)}% factory. Amazon & D2C measured; Blinkit/Offline/OEM single-SKU (COGS via ASP). Covers ${mx.monthsInPeriod.length ? SKU_FEED_NOTE : ''}`, S.subtitle);
  row++;
  put(row, 0, 'Product', S.header);
  chans.forEach((c, i) => put(row, i + 1, channelLabel(c), S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;
  prods.forEach((p) => {
    put(row, 0, p, S.label);
    chans.forEach((c, i) => {
      const a = cellMap.get(`${p}||${c}`);
      put(row, i + 1, a ? round2(a.con) : '', a ? signed(a.con, S.num) : S.label);
    });
    const pt = prodTot.get(p);
    put(row, nCols - 1, pt ? round2(pt.con) : 0, signed(pt ? round2(pt.con) : 0, { ...S.num, font: { ...(S.num.font || {}), bold: true } }));
    row++;
  });
  put(row, 0, 'TOTAL', S.header);
  chans.forEach((c, i) => { const a = chanTot.get(c); put(row, i + 1, a ? round2(a.con) : 0, signed(a ? round2(a.con) : 0, { ...S.header })); });
  put(row, nCols - 1, round2(grand.con), signed(round2(grand.con), { ...S.header }));
  row++;

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [30, ...chans.map(() => 13), 14]);
  return ws;
}

const SKU_FEED_NOTE = 'the SKU feeds (Amazon Oct-24+, D2C/Blinkit/Offline/OEM per their coverage).';

// ============================================
// CHANNEL ORDERS SHEET (estimated orders per channel per month)
// ============================================

function generateOrdersSheet(months: PeriodMIS[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const nCols = months.length + 3; // Channel + AOV + months + Total
  let row = 0;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };
  const band = (text: string, s: Style) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
    row++;
  };

  band('CHANNEL ORDERS (estimated)', S.title);
  band('Order volume = each channel’s net revenue ÷ its assumed average order value (AOV). D2C = Shopify.', S.subtitle);
  row++;

  put(row, 0, 'Channel', S.header);
  put(row, 1, 'AOV (₹)', S.header);
  months.forEach((p, i) => put(row, i + 2, p.label, S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;

  const orders = months.map((p) => ordersByChannel(p));
  const colTotals = new Array(months.length).fill(0);
  SALES_CHANNELS.forEach((c) => {
    put(row, 0, channelLabel(c), S.label);
    put(row, 1, CHANNEL_AOV[c], S.num);
    let rowTotal = 0;
    months.forEach((_, i) => {
      const v = Math.round(orders[i][c]);
      rowTotal += v;
      colTotals[i] += v;
      put(row, i + 2, v, S.num);
    });
    put(row, nCols - 1, rowTotal, S.total);
    row++;
  });

  put(row, 0, 'Total orders', S.totalLabel);
  put(row, 1, '', S.total);
  let grand = 0;
  months.forEach((_, i) => {
    grand += colTotals[i];
    put(row, i + 2, colTotals[i], S.total);
  });
  put(row, nCols - 1, grand, S.total);
  row++;

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [22, 10, ...months.map(() => 10), 12]);
  return ws;
}

// ============================================
// REPEATS SHEET (Shopify D2C + Amazon)
// ============================================

function generateRepeatsSheet(): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const nCols = 9;
  let row = 0;
  const num2: Style = { ...S.num, numFmt: '0.00' };
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };
  const band = (text: string, s: Style) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
    row++;
  };
  const headerRow = (cols: string[]) => {
    cols.forEach((h, i) => put(row, i, h, S.header));
    for (let c = cols.length; c < nCols; c++) put(row, c, '', S.header);
    row++;
  };

  band('REPEAT PURCHASES', S.title);
  band('Shopify (D2C) and Amazon each from their own repeat-purchase feed. Shares are fractions of customers/sales. * = partial month.', S.subtitle);
  row++;

  band('Shopify (D2C) — cohort repeat behaviour', S.header);
  headerRow(['Month', 'Buyers', 'Orders', 'AOV (₹)', 'Freq', 'Repeat %', 'Hist LTV (₹)', 'Avg products', 'Avg units']);
  D2C_REPEATS.forEach((r) => {
    put(row, 0, keyToLabel(r.key) + (r.partial ? ' *' : ''), S.label);
    put(row, 1, r.buyers, S.num);
    put(row, 2, r.orders, S.num);
    put(row, 3, r.aov, S.num);
    put(row, 4, round2(r.freq), num2);
    put(row, 5, round2(r.repeatRate * 1000) / 1000, S.pct);
    put(row, 6, r.histLtv, S.num);
    put(row, 7, round2(r.avgProducts), num2);
    put(row, 8, round2(r.avgUnits), num2);
    row++;
  });
  row++;

  band('Amazon — repeat-purchase behaviour', S.header);
  headerRow(['Month', 'Orders', 'Customers', 'Repeat cust.', 'Repeat cust. %', 'Repeat sales (₹)', 'Repeat sales %', '', '']);
  AMAZON_REPEATS.forEach((r) => {
    put(row, 0, keyToLabel(r.key) + (r.partial ? ' *' : ''), S.label);
    put(row, 1, r.orders, S.num);
    put(row, 2, r.customers, S.num);
    put(row, 3, r.repeatCustomers, S.num);
    put(row, 4, round2(r.repeatCustomerShare * 1000) / 1000, S.pct);
    put(row, 5, round2(r.repeatSales), S.num);
    put(row, 6, round2(r.repeatSalesShare * 1000) / 1000, S.pct);
    row++;
  });

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [12, 12, 12, 14, 14, 16, 14, 14, 12]);
  return ws;
}

// ============================================
// DISCOUNTS SHEET (monthly discounts & total sales)
// ============================================

function generateDiscountSheet(): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const nCols = 4;
  let row = 0;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
  };
  const band = (text: string, s: Style) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
    row++;
  };

  band('DISCOUNT OVER TIME', S.title);
  band('Monthly discounts (shown negative) and total sales from the storefront report. * = partial month.', S.subtitle);
  row++;

  put(row, 0, 'Month', S.header);
  put(row, 1, 'Discount (₹)', S.header);
  put(row, 2, 'Total Sales (₹)', S.header);
  put(row, 3, '% of Sales', S.header);
  row++;

  let totDisc = 0;
  let totSales = 0;
  DISCOUNT_DATA.forEach((d) => {
    totDisc += d.discount;
    totSales += d.totalSales;
    const rate = d.totalSales > 0 ? d.discount / d.totalSales : 0;
    put(row, 0, d.label + (d.partial ? ' *' : ''), S.label);
    put(row, 1, round2(-d.discount), signed(-d.discount, S.num));
    put(row, 2, round2(d.totalSales), S.num);
    put(row, 3, round2(rate * 1000) / 1000, S.pct);
    row++;
  });

  put(row, 0, 'Total', S.totalLabel);
  put(row, 1, round2(-totDisc), signed(-totDisc, S.total));
  put(row, 2, round2(totSales), S.total);
  put(row, 3, round2((totSales > 0 ? totDisc / totSales : 0) * 1000) / 1000, { ...S.pct, ...S.total, numFmt: PCT_FMT });
  row++;

  ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: row, c: nCols - 1 })}`;
  ws['!merges'] = merges;
  setCols(ws, [12, 16, 16, 12]);
  return ws;
}

// ============================================
// MAIN EXPORT
// ============================================

const GRAN_TITLE: Record<Granularity, { sheet: string; title: string }> = {
  month: { sheet: 'Monthly P&L', title: 'MONTHLY P&L' },
  quarter: { sheet: 'Quarterly P&L', title: 'QUARTERLY P&L (Fiscal)' },
  year: { sheet: 'FY P&L', title: 'FINANCIAL-YEAR P&L' },
};

const PL_SUBTITLE =
  'Net Revenue → COGM → Gross Margin → CM1 → CM2 → CM3 → EBITDA → Net Income · all values in ₹';

function blendedFyNote(): string {
  const rates = Array.from(fyBlendedGMRates().entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fy, r]) => `${fy.replace('FY ', 'FY')} ${Math.round(r * 100)}%`)
    .join(' · ');
  return `COGM blended to each fiscal year's revenue-weighted rate (GM% by FY: ${rates}) · all values in ₹`;
}

export async function exportDeckToExcel(options: DeckExportOptions): Promise<void> {
  const wb = XLSX.utils.book_new();
  const monthsAsc = [...MONTHLY_MIS].sort((a, b) => a.year - b.year || a.month - b.month);
  const plSubtitle = options.blendCogm ? blendedFyNote() : PL_SUBTITLE;

  if (options.includeSummary) {
    XLSX.utils.book_append_sheet(wb, generateSummarySheet(), 'Summary');
  }

  for (const g of options.granularities) {
    const series = options.blendCogm ? seriesForBlended(g) : seriesFor(g);
    if (series.length === 0) continue;
    const meta = GRAN_TITLE[g];
    XLSX.utils.book_append_sheet(wb, generatePLSheet(series, meta.title, plSubtitle), meta.sheet);
  }

  if (options.includeChannelRevenue) {
    XLSX.utils.book_append_sheet(wb, generateChannelSheet(monthlySeries()), 'Channel Revenue');
  }

  if (options.includeChannelPnl) {
    XLSX.utils.book_append_sheet(wb, generateChannelPnlSheet(options.blendCogm), 'Channel P&L');
    XLSX.utils.book_append_sheet(wb, generateSkuChannelSheet(), 'SKU x Channel');
  }

  if (options.includeOrders) {
    XLSX.utils.book_append_sheet(wb, generateOrdersSheet(monthlySeries()), 'Channel Orders');
  }

  if (options.includeRepeats) {
    XLSX.utils.book_append_sheet(wb, generateRepeatsSheet(), 'Repeats');
  }

  if (options.includeDiscounts) {
    XLSX.utils.book_append_sheet(wb, generateDiscountSheet(), 'Discounts');
  }

  if (options.includeCogmDetail) {
    const extra = options.blendCogm
      ? ' NOTE: the P&L sheets use FY-blended COGM, so these actual line-item totals will not tie to the P&L COGM month by month.'
      : '';
    XLSX.utils.book_append_sheet(
      wb,
      generateLineDetailSheet(monthsAsc, 'cogmLines', 'COGM DETAIL — Cost of Goods Manufactured', extra),
      'COGM Detail',
    );
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No sheets selected for export']]), 'Info');
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `Heatronics_MIS_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/** One-click: export the entire dataset and every view. */
export async function exportEverythingToExcel(): Promise<void> {
  return exportDeckToExcel(EXPORT_EVERYTHING);
}
