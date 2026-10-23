// ----------------------------------------------------------------------------
// Export the Live MIS to Excel — the live twin of the legacy deck export
// (deckExcelExport.ts), same styled sheet set and options, built on the live
// deck. Rows / cells below a period's completeness level are BLANK, never 0.
//
//   Summary · Monthly / Quarterly / FY P&L · Channel Revenue · Channel P&L ·
//   SKU x Channel · Channel Orders · Repeats · Discounts · COGM Detail
//   + Live extras: OpEx Detail · Marketing by Platform · Units · SKU Cells
//
// buildLiveWorkbook() is pure (no download) so it can be verified in a script.
// ----------------------------------------------------------------------------

import XLSX from 'xlsx-js-style';
import type { LiveDeckData } from '../data/misDeck/liveDeck';
import { SALES_CHANNELS, type MonthlyMIS, type SalesChannel } from '../data/misDeck/misDeckData';
import {
  aggregatePeriods, FACTORY_PCT, monthLabel, scopeOf, CHANNEL_FOLD, type Granularity, type PeriodAgg,
} from '../data/misDeck/liveAnalytics';
import {
  REAL_ROWS, anchoredChannelPnl, blendLiveMonths, blendRatesNote, channelName, liveFiscalYears,
  liveMisPoint, liveSkuChannelMatrix, toPeriodMIS, unifyChannels, aggregateRange,
} from '../data/misDeck/liveViews';
import { channelMix, CHANNEL_AOV, topChannel, cagr } from '../data/misDeck/analytics';
import {
  S, MARGIN, cell, round2, setCols, signed, generateLineDetailSheet, generateRepeatsSheet, generateDiscountSheet,
  type Style,
} from './deckExcelExport';
import type { MisFormatSource } from './misFormatExport';

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
  /** Blend COGM to each FY's revenue-weighted rate on the P&L sheets. */
  blendCogm: boolean;
  /** Continuous channel taxonomy (OEM→B2B, Offline→GT). */
  mergeChannels: boolean;
}

export const LIVE_EXPORT_EVERYTHING: LiveExportOptions = {
  includeSummary: true, granularities: ['month', 'quarter', 'year'], includeChannelRevenue: true, includeChannelPnl: true,
  includeOrders: true, includeRepeats: true, includeDiscounts: true, includeCogmDetail: true,
  includeOpexDetail: true, includeMarketing: true, includeUnits: true, includeSkuCells: true,
  blendCogm: false, mergeChannels: true,
};

export function liveSheetCount(o: LiveExportOptions): number {
  return (o.includeSummary ? 1 : 0) + o.granularities.length + (o.includeChannelRevenue ? 1 : 0) + (o.includeChannelPnl ? 2 : 0)
    + (o.includeOrders ? 1 : 0) + (o.includeRepeats ? 1 : 0) + (o.includeDiscounts ? 1 : 0) + (o.includeCogmDetail ? 1 : 0)
    + (o.includeOpexDetail ? 1 : 0) + (o.includeMarketing ? 1 : 0) + (o.includeUnits ? 1 : 0) + (o.includeSkuCells ? 1 : 0);
}

// ---- Helpers ---------------------------------------------------------------

const real = (p: PeriodAgg, row: string) => REAL_ROWS[p.level].has(row);
const fyStartOf = (k: string) => { const [y, m] = k.split('-').map(Number); return m >= 4 ? y : y - 1; };
const LEVEL_TXT = (p: PeriodAgg) => (p.level === 'full' ? (p.locked ? 'Locked' : p.published ? 'Published' : 'Full close') : p.level === 'contribution' ? 'To CM2' : 'Top line');
const pct3 = (n: number) => round2(n * 1000) / 1000;
const BLANK: Style = { ...S.num };

/** "FY25-26" → "FY 2025-26"; "Q1 FY26-27" kept; month "Jul 26" → "Jul 2026". */
function longLabel(p: PeriodAgg, gran: Granularity): string {
  if (gran === 'year') return p.label.replace(/^FY(\d\d)-(\d\d)$/, 'FY 20$1-$2');
  if (gran === 'month') return toPeriodMIS(p).longLabel;
  return p.label;
}

function sheetWriter() {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let maxC = 0;
  const put = (r: number, c: number, v: string | number, s: Style) => {
    ws[XLSX.utils.encode_cell({ r, c })] = cell(v, s);
    if (c > maxC) maxC = c;
  };
  const band = (row: number, text: string, s: Style, nCols: number) => {
    put(row, 0, text, s);
    for (let c = 1; c < nCols; c++) put(row, c, '', s);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: nCols - 1 } });
  };
  const finish = (rows: number, widths: number[]) => {
    ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: Math.max(0, rows), c: Math.max(maxC, widths.length - 1) })}`;
    ws['!merges'] = merges;
    setCols(ws, widths);
    return ws;
  };
  return { ws, put, band, finish };
}

// ---- P&L sheet (periods as columns) ----------------------------------------

interface Line { label: string; row: string; value: (p: PeriodAgg) => number; styles: { label: Style; num: Style }; pct: Style; margin?: boolean }

const PL_LINES: (Line | 'spacer')[] = [
  { label: 'NET REVENUE', row: 'net_revenue', value: (p) => p.netRevenue, styles: { label: MARGIN.net.label, num: MARGIN.net.num }, pct: MARGIN.net.pct },
  { label: 'Less: COGM', row: 'cogm', value: (p) => p.cogm, styles: { label: S.label, num: S.num }, pct: S.pct },
  { label: 'GROSS MARGIN', row: 'gross_margin', value: (p) => p.grossMargin, styles: { label: MARGIN.gross.label, num: MARGIN.gross.num }, pct: MARGIN.gross.pct, margin: true },
  'spacer',
  { label: 'Less: Channel & Fulfillment', row: 'channel_fulfilment', value: (p) => p.channelFulfillment, styles: { label: S.label, num: S.num }, pct: S.pct },
  { label: 'CM1 (Contribution Margin 1)', row: 'cm1', value: (p) => p.cm1, styles: { label: MARGIN.cm1.label, num: MARGIN.cm1.num }, pct: MARGIN.cm1.pct, margin: true },
  'spacer',
  { label: 'Less: Sales & Marketing', row: 'sales_marketing', value: (p) => p.salesMarketing, styles: { label: S.label, num: S.num }, pct: S.pct },
  { label: 'CM2 (Contribution Margin 2)', row: 'cm2', value: (p) => p.cm2, styles: { label: MARGIN.cm2.label, num: MARGIN.cm2.num }, pct: MARGIN.cm2.pct, margin: true },
  'spacer',
  { label: 'Less: Brand Investment (Platform & Payment)', row: 'platform_payment', value: (p) => p.platformCosts, styles: { label: S.label, num: S.num }, pct: S.pct },
  { label: 'CM3 (Contribution Margin 3)', row: 'cm3', value: (p) => p.cm3, styles: { label: MARGIN.cm3.label, num: MARGIN.cm3.num }, pct: MARGIN.cm3.pct, margin: true },
  'spacer',
  { label: 'Less: Operating Expenses', row: 'opex', value: (p) => p.opex, styles: { label: S.label, num: S.num }, pct: S.pct },
  { label: 'EBITDA', row: 'ebitda', value: (p) => p.ebitda, styles: { label: MARGIN.ebitda.label, num: MARGIN.ebitda.num }, pct: MARGIN.ebitda.pct, margin: true },
  'spacer',
  { label: 'Less: Cost of Fundraising', row: 'cost_of_fundraising', value: (p) => p.costOfFundraising, styles: { label: S.label, num: S.num }, pct: S.pct },
  { label: 'Less: Non-Operating (Int/Dep/Amort/Tax)', row: 'non_operating', value: (p) => p.nonOperating, styles: { label: S.label, num: S.num }, pct: S.pct },
  { label: 'NET INCOME', row: 'net_income', value: (p) => p.netIncome, styles: { label: MARGIN.netIncome.label, num: MARGIN.netIncome.num }, pct: MARGIN.netIncome.pct, margin: true },
];

/** Short title-case name for a "% of Net Revenue" row ("Net Income", "COGM", "CM1" …). */
function pctName(label: string): string {
  const s = label.replace(/^Less:\s*/, '').replace(/\s*\(.*\)$/, '').trim();
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bCm(\d)\b/, 'CM$1').replace(/\bEbitda\b/, 'EBITDA').replace(/\bCogm\b/, 'COGM') : s;
}

function plSheet(series: PeriodAgg[], gran: Granularity, title: string, subtitle: string): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const nCols = series.length + 2;
  let row = 0;
  band(row++, title, S.title, nCols);
  band(row++, subtitle, S.subtitle, nCols);
  row++;
  put(row, 0, 'Particulars', S.header);
  series.forEach((p, i) => put(row, i + 1, longLabel(p, gran), S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;
  if (gran !== 'month') {
    put(row, 0, 'Scope', { ...S.label, font: { ...(S.label.font || {}), italic: true } });
    series.forEach((p, i) => {
      const full = gran === 'quarter' ? 3 : 12;
      put(row, i + 1, `${scopeOf(p)}${p.members.length < full ? ' (partial)' : ''}`, { ...S.label, alignment: { horizontal: 'center' } });
    });
    put(row, nCols - 1, '', S.label);
    row++;
  }
  put(row, 0, 'Completeness', { ...S.label, font: { ...(S.label.font || {}), italic: true } });
  series.forEach((p, i) => put(row, i + 1, LEVEL_TXT(p), { ...S.label, alignment: { horizontal: 'center' } }));
  put(row, nCols - 1, '', S.label);
  row += 2;

  const totalNet = series.reduce((s, p) => s + p.netRevenue, 0) || 1;
  for (const line of PL_LINES) {
    if (line === 'spacer') { row++; continue; }
    put(row, 0, line.label, line.styles.label);
    const allReal = series.every((p) => real(p, line.row));
    let total = 0;
    series.forEach((p, i) => {
      if (!real(p, line.row)) { put(row, i + 1, '', BLANK); return; }
      const v = round2(line.value(p));
      total += v;
      put(row, i + 1, v, signed(v, line.styles.num));
    });
    if (allReal) put(row, nCols - 1, round2(total), signed(total, { ...line.styles.num, fill: S.total.fill, font: { ...(line.styles.num.font || {}), bold: true } }));
    else put(row, nCols - 1, '', S.total);
    row++;
    put(row, 0, `   ${pctName(line.label)} % of Net Revenue`, { ...S.label, font: { ...(S.label.font || {}), italic: true } });
    series.forEach((p, i) => {
      if (!real(p, line.row) || !p.netRevenue) { put(row, i + 1, '', BLANK); return; }
      put(row, i + 1, line.row === 'net_revenue' ? 1 : pct3(line.value(p) / p.netRevenue), line.pct);
    });
    if (allReal) put(row, nCols - 1, line.row === 'net_revenue' ? 1 : pct3(total / totalNet), { ...line.pct, font: { ...(line.pct.font || {}), bold: true } });
    else put(row, nCols - 1, '', S.total);
    row++;
  }
  return finish(row, [40, ...series.map(() => 14), 15]);
}

// ---- Summary ---------------------------------------------------------------

function summarySheet(deck: LiveDeckData, monthly: PeriodAgg[], yearly: PeriodAgg[], merged: boolean): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const nCols = 7;
  let row = 0;
  band(row++, 'HEATRONICS — LIVE MIS SUMMARY', S.title, nCols);
  band(row++, `Live MIS export · ${new Date().toISOString().slice(0, 10)} · locked history + published / live months · all values in ₹`, S.subtitle, nCols);
  row++;
  const kv = (k: string, v: string | number, kind: 'num' | 'pct' | 'text' = 'text') => {
    put(row, 0, k, S.totalLabel);
    if (v === '') put(row, 1, '', S.label);
    else put(row, 1, v, kind === 'pct' ? S.pct : kind === 'num' ? S.num : { ...S.label, alignment: { horizontal: 'left' } });
    row++;
  };
  const latest = monthly[monthly.length - 1];
  const closed = deck.completeThrough ? monthly.find((p) => p.key === deck.completeThrough) ?? null : null;
  const prev = latest ? monthly[monthly.length - 2] : null;
  const yAgo = latest ? monthly.find((p) => p.key === `${Number(latest.key.slice(0, 4)) - 1}${latest.key.slice(4)}`) : null;
  const ttm = monthly.slice(-12).reduce((s, p) => s + p.netRevenue, 0);
  const ttmPrior = monthly.slice(-24, -12).reduce((s, p) => s + p.netRevenue, 0);
  band(row++, 'Headline', S.header, nCols);
  // Same headline rows (and labels) as the legacy deck's Summary, on the live months.
  const fullYears = yearly.filter((y) => y.members.length >= 12);
  const fyFirst = fullYears[0] ?? yearly[0], fyLast = fullYears[fullYears.length - 1] ?? yearly[yearly.length - 1];
  const sk = (y: PeriodAgg) => fyStartOf(y.members[0]);
  const cagrFY = fyFirst && fyLast ? cagr(fyFirst.netRevenue, fyLast.netRevenue, Math.max(1, sk(fyLast) - sk(fyFirst))) : null;
  const pctOfLatest = (row: string, v: (p: PeriodAgg) => number) => (latest && real(latest, row) && latest.netRevenue ? v(latest) / latest.netRevenue : '');
  kv('Months of data', monthly.length, 'num');
  kv('Latest month', latest ? toPeriodMIS(latest).longLabel : '—');
  kv('Latest net revenue', latest ? round2(latest.netRevenue) : '', 'num');
  kv('MoM revenue growth', latest && prev?.netRevenue ? (latest.netRevenue - prev.netRevenue) / Math.abs(prev.netRevenue) : '', 'pct');
  kv('YoY revenue growth', latest && yAgo?.netRevenue ? (latest.netRevenue - yAgo.netRevenue) / Math.abs(yAgo.netRevenue) : '', 'pct');
  kv('Trailing-12-month revenue', round2(ttm), 'num');
  kv('TTM growth vs prior 12m', ttmPrior ? (ttm - ttmPrior) / Math.abs(ttmPrior) : '', 'pct');
  kv('Revenue CAGR (full FYs)', cagrFY ?? '', 'pct');
  kv('Latest gross margin %', pctOfLatest('gross_margin', (p) => p.grossMargin), 'pct');
  kv('Latest EBITDA %', pctOfLatest('ebitda', (p) => p.ebitda), 'pct');
  kv('Latest net income %', pctOfLatest('net_income', (p) => p.netIncome), 'pct');
  if (latest) { const t = topChannel(toPeriodMIS(latest)); kv('Top channel (latest)', `${channelName(t.channel, merged)} (${(t.share * 100).toFixed(0)}%)`); }
  // Live extras
  kv('Latest month completeness', latest ? LEVEL_TXT(latest) : '—');
  kv('Fully closed through', deck.completeThrough ? toPeriodMIS(monthly.find((p) => p.key === deck.completeThrough)!).longLabel : '—');
  if (closed && closed !== latest) {
    kv(`Gross margin % (${closed.label}, last full close)`, closed.netRevenue ? closed.grossMargin / closed.netRevenue : '', 'pct');
    kv(`EBITDA % (${closed.label}, last full close)`, closed.netRevenue ? closed.ebitda / closed.netRevenue : '', 'pct');
  }
  row++;
  band(row++, 'Financial-Year Summary', S.header, nCols);
  ['FY', 'Months', 'Net Revenue', 'Gross Margin %', 'EBITDA %', 'Net Income %', 'Top Channel'].forEach((h, i) => put(row, i, h, S.header));
  row++;
  for (const fy of yearly.filter((y) => y.netRevenue > 0)) {
    const t = topChannel(toPeriodMIS(fy));
    put(row, 0, longLabel(fy, 'year'), S.label);
    put(row, 1, fy.members.length, S.num);
    put(row, 2, round2(fy.netRevenue), S.num);
    const r = (k: string, v: number) => (real(fy, k) && fy.netRevenue ? pct3(v / fy.netRevenue) : '');
    const gm = r('gross_margin', fy.grossMargin), eb = r('ebitda', fy.ebitda), ni = r('net_income', fy.netIncome);
    put(row, 3, gm, gm === '' ? BLANK : S.pct);
    put(row, 4, eb, eb === '' ? BLANK : signed(eb as number, S.pct));
    put(row, 5, ni, ni === '' ? BLANK : signed(ni as number, S.pct));
    put(row, 6, `${channelName(t.channel, merged)} (${(t.share * 100).toFixed(0)}%)`, S.label);
    row++;
  }
  return finish(row, [30, 22, 16, 14, 14, 14, 20]);
}

// ---- Channel revenue -------------------------------------------------------

function channelRevenueSheet(monthly: PeriodAgg[], merged: boolean): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const nCols = monthly.length + 2;
  const chans = SALES_CHANNELS.filter((c) => monthly.some((p) => (p.netByChannel[c] ?? 0) !== 0));
  let row = 0;
  band(row++, 'CHANNEL-WISE NET REVENUE', S.title, nCols);
  band(row++, `Net revenue by sales channel (net of returns & GST)${merged ? ' · continuous taxonomy: B2B (OEM), GT (Offline)' : ''}`, S.subtitle, nCols);
  row++;
  put(row, 0, 'Net Revenue (₹)', S.header);
  monthly.forEach((p, i) => put(row, i + 1, toPeriodMIS(p).longLabel, S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;
  for (const ch of chans) {
    put(row, 0, channelName(ch, merged), S.label);
    let t = 0;
    monthly.forEach((p, i) => { const v = round2(p.netByChannel[ch] ?? 0); t += v; put(row, i + 1, v, signed(v, S.num)); });
    put(row, nCols - 1, round2(t), S.total);
    row++;
  }
  put(row, 0, 'Total Net Revenue', S.totalLabel);
  let g = 0;
  monthly.forEach((p, i) => { g += p.netRevenue; put(row, i + 1, round2(p.netRevenue), S.total); });
  put(row, nCols - 1, round2(g), S.total);
  row += 2;
  put(row, 0, 'Channel Mix (% of net revenue)', S.header);
  monthly.forEach((p, i) => put(row, i + 1, toPeriodMIS(p).longLabel, S.header));
  put(row, nCols - 1, 'Avg', S.header);
  row++;
  for (const ch of chans) {
    put(row, 0, channelName(ch, merged), S.label);
    let sum = 0;
    monthly.forEach((p, i) => { const m = channelMix(toPeriodMIS(p))[ch] || 0; sum += m; put(row, i + 1, pct3(m), S.pct); });
    put(row, nCols - 1, monthly.length ? pct3(sum / monthly.length) : 0, { ...S.pct, font: { ...(S.pct.font || {}), bold: true } });
    row++;
  }
  return finish(row, [24, ...monthly.map(() => 13), 14]);
}

// ---- Channel P&L (MIS-anchored, per FY) ------------------------------------

function channelPnlSheet(deck: LiveDeckData, yearly: PeriodAgg[], merged: boolean): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const chans = SALES_CHANNELS.filter((c) => deck.skuCells.some((x) => x.ch === c));
  const nCols = chans.length + 2;
  let row = 0;
  band(row++, 'CHANNEL P&L — company totals held, data-driven split (MIS-anchored)', S.title, nCols);
  band(row++, `Company totals are the MIS book of record and tie to the P&L sheets. Revenue split by real revenue share, COGM by the real SKU-mix COGS (incl. ${Math.round(FACTORY_PCT * 100)}% factory), Sales & Marketing by real ad spend, all other lines by revenue share. Rows below a fiscal year's completeness level are blank. All in ₹.`, S.subtitle, nCols);
  row++;
  type K = 'revenue' | 'cogm' | 'grossMargin' | 'channelFulfillment' | 'cm1' | 'salesMarketing' | 'cm2' | 'platformCosts' | 'cm3' | 'opex' | 'ebitda' | 'nonOperating' | 'netIncome';
  const LINES: { label: string; k: K; row: string; cost: boolean; tot: (p: PeriodAgg) => number }[] = [
    { label: 'NET REVENUE', k: 'revenue', row: 'net_revenue', cost: false, tot: (p) => p.netRevenue },
    { label: 'Less: COGM (real SKU cost + factory)', k: 'cogm', row: 'cogm', cost: true, tot: (p) => p.cogm },
    { label: 'GROSS MARGIN', k: 'grossMargin', row: 'gross_margin', cost: false, tot: (p) => p.grossMargin },
    { label: 'Less: Channel & Fulfilment', k: 'channelFulfillment', row: 'channel_fulfilment', cost: true, tot: (p) => p.channelFulfillment },
    { label: 'CM1', k: 'cm1', row: 'cm1', cost: false, tot: (p) => p.cm1 },
    { label: 'Less: Sales & Marketing', k: 'salesMarketing', row: 'sales_marketing', cost: true, tot: (p) => p.salesMarketing },
    { label: 'CM2', k: 'cm2', row: 'cm2', cost: false, tot: (p) => p.cm2 },
    { label: 'Less: Brand Investment / Platform', k: 'platformCosts', row: 'platform_payment', cost: true, tot: (p) => p.platformCosts },
    { label: 'CM3', k: 'cm3', row: 'cm3', cost: false, tot: (p) => p.cm3 },
    { label: 'Less: Operating expenses', k: 'opex', row: 'opex', cost: true, tot: (p) => p.opex },
    { label: 'EBITDA', k: 'ebitda', row: 'ebitda', cost: false, tot: (p) => p.ebitda },
    { label: 'Less: Non-Operating + Fundraising', k: 'nonOperating', row: 'non_operating', cost: true, tot: (p) => p.nonOperating + p.costOfFundraising },
    { label: 'NET INCOME', k: 'netIncome', row: 'net_income', cost: false, tot: (p) => p.netIncome },
  ];
  for (const p of yearly) {
    const rows = anchoredChannelPnl(p, deck.skuCells, deck.completeness);
    if (!rows.length) continue;
    const by = new Map(rows.map((r) => [r.channel, r]));
    band(row++, `${longLabel(p, 'year')} · ${scopeOf(p)} · ${LEVEL_TXT(p)}`, S.header, nCols);
    put(row, 0, 'Particulars', S.header);
    chans.forEach((c, i) => put(row, i + 1, channelName(c, merged), S.header));
    put(row, nCols - 1, 'Total (MIS)', S.header);
    row++;
    for (const l of LINES) {
      put(row, 0, l.cost ? `   ${l.label}` : l.label, S.label);
      const ok = real(p, l.row);
      chans.forEach((c, i) => {
        const r = by.get(c);
        if (!ok || !r) { put(row, i + 1, '', BLANK); return; }
        const raw = l.k === 'nonOperating' ? r.nonOperating + r.costOfFundraising : r[l.k];
        const v = round2(l.cost ? -raw : raw);
        put(row, i + 1, v, signed(v, S.num));
      });
      if (ok) { const t = round2(l.cost ? -l.tot(p) : l.tot(p)); put(row, nCols - 1, t, signed(t, { ...S.num, fill: S.total.fill, font: { ...(S.num.font || {}), bold: true } })); }
      else put(row, nCols - 1, '', S.total);
      row++;
    }
    put(row, 0, '   Net margin %', S.label);
    const ok = real(p, 'net_income');
    chans.forEach((c, i) => {
      const r = by.get(c);
      if (ok && r && r.revenue > 0) put(row, i + 1, pct3(r.netIncome / r.revenue), signed(r.netIncome / r.revenue, S.pct));
      else put(row, i + 1, '', BLANK);
    });
    if (ok && p.netRevenue) put(row, nCols - 1, pct3(p.netIncome / p.netRevenue), signed(p.netIncome / p.netRevenue, S.pct));
    row += 2;
  }
  return finish(row, [38, ...chans.map(() => 14), 15]);
}

// ---- SKU × Channel (all-time, costed months only) --------------------------

function skuChannelSheet(deck: LiveDeckData, merged: boolean): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const costed = new Set(deck.periods.filter((k) => (deck.completeness[k]?.level ?? 'topline') !== 'topline'));
  const mx = liveSkuChannelMatrix(deck.skuCells, costed);
  const chans = mx.channels;
  const nCols = chans.length + 2;
  let row = 0;
  band(row++, 'SKU × CHANNEL — CONTRIBUTION (CM2) + per-channel cascade (all-time)', S.title, Math.max(nCols, 8));
  band(row++, `CM2 ₹ per product per channel over every costed month (top-line-only months excluded: their COGS isn't in yet). Real per-SKU COGS + ${Math.round(FACTORY_PCT * 100)}% factory; ad spend measured per product.`, S.subtitle, Math.max(nCols, 8));
  row++;
  put(row, 0, 'Product', S.header);
  chans.forEach((c, i) => put(row, i + 1, channelName(c, merged), S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;
  for (const p of mx.products) {
    put(row, 0, p, p.startsWith('Accessory') ? { ...S.label, font: { ...(S.label.font || {}), italic: true } } : S.label);
    chans.forEach((c, i) => { const a = mx.cell(p, c); put(row, i + 1, a ? round2(a.con) : '', a ? signed(a.con, S.num) : S.label); });
    const t = mx.productTotal(p);
    put(row, nCols - 1, round2(t.con), signed(t.con, { ...S.num, font: { ...(S.num.font || {}), bold: true } }));
    row++;
  }
  put(row, 0, 'TOTAL', S.header);
  chans.forEach((c, i) => put(row, i + 1, round2(mx.channelTotal(c).con), S.header));
  put(row, nCols - 1, round2(mx.grand.con), S.header);
  row++;
  const CAS: { label: string; get: (a: { rev: number; cogs: number; fac: number; cf: number; sm: number; con: number }) => number; margin: boolean }[] = [
    { label: 'NET REVENUE', get: (a) => a.rev, margin: true },
    { label: 'Less: COGM (cost + factory)', get: (a) => -(a.cogs + a.fac), margin: false },
    { label: 'GROSS MARGIN', get: (a) => a.rev - a.cogs - a.fac, margin: true },
    { label: 'Less: Channel & Fulfilment', get: (a) => -a.cf, margin: false },
    { label: 'CM1', get: (a) => a.rev - a.cogs - a.fac - a.cf, margin: true },
    { label: 'Less: Sales & Marketing (ads)', get: (a) => -a.sm, margin: false },
    { label: 'CM2', get: (a) => a.con, margin: true },
  ];
  for (const c of chans) {
    row++;
    const skus = mx.products.filter((p) => { const a = mx.cell(p, c); return a && (a.rev !== 0 || a.con !== 0); });
    const w = skus.length + 2;
    band(row++, `${channelName(c, merged)} — P&L at SKU level (to CM2)`, S.header, Math.max(w, nCols));
    put(row, 0, 'Particulars', S.header);
    skus.forEach((p, i) => put(row, i + 1, p, S.header));
    put(row, w - 1, `${channelName(c, merged)} total`, S.header);
    row++;
    const ct = mx.channelTotal(c);
    for (const l of CAS) {
      put(row, 0, l.margin ? l.label : `   ${l.label}`, S.label);
      skus.forEach((p, i) => { const a = mx.cell(p, c)!; const v = round2(l.get(a)); put(row, i + 1, v, signed(v, S.num)); });
      const tv = round2(l.get(ct));
      put(row, w - 1, tv, signed(tv, { ...S.num, font: { ...(S.num.font || {}), bold: true } }));
      row++;
    }
    put(row, 0, '   CM2 %', S.label);
    skus.forEach((p, i) => { const a = mx.cell(p, c)!; if (a.rev > 0) put(row, i + 1, pct3(a.con / a.rev), signed(a.con / a.rev, S.pct)); else put(row, i + 1, '', S.label); });
    put(row, w - 1, ct.rev > 0 ? pct3(ct.con / ct.rev) : '', ct.rev > 0 ? signed(ct.con / ct.rev, S.pct) : S.label);
    row++;
  }
  return finish(row, [34, ...chans.map(() => 13), 14]);
}

// ---- Orders ------------------------------------------------------------------

function ordersSheet(monthly: PeriodAgg[], merged: boolean): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const chans = SALES_CHANNELS.filter((c) => monthly.some((p) => (p.netByChannel[c] ?? 0) > 0 || (p.ordersByChannel[c] ?? 0) > 0));
  const nCols = monthly.length + 3;
  let row = 0;
  band(row++, 'CHANNEL ORDERS', S.title, nCols);
  band(row++, 'Actual connector order counts where the month reports them ("actual" row); otherwise estimated as net revenue ÷ the assumed AOV. D2C = Shopify.', S.subtitle, nCols);
  row++;
  put(row, 0, 'Channel', S.header); put(row, 1, 'AOV (₹)', S.header);
  monthly.forEach((p, i) => put(row, i + 2, p.label, S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;
  put(row, 0, 'Basis', { ...S.label, font: { ...(S.label.font || {}), italic: true } }); put(row, 1, '', S.label);
  const actual = monthly.map((p) => p.ordersMonths === p.members.length && p.ordersMonths > 0);
  monthly.forEach((_, i) => put(row, i + 2, actual[i] ? 'actual' : 'est.', { ...S.label, alignment: { horizontal: 'center' } }));
  row++;
  // Estimates priced per SOURCE channel (OEM ₹325 even inside B2B (OEM)) — the fold is a pure rename.
  const est = monthly.map((p) => p.estOrdersByChannel);
  const colTot = new Array(monthly.length).fill(0);
  for (const c of chans) {
    put(row, 0, channelName(c, merged), S.label);
    const src = Object.entries(CHANNEL_FOLD).find(([, to]) => to === c)?.[0] as SalesChannel | undefined;
    // A folded row priced at its source AOV in some months (OEM history inside B2B (OEM)).
    const folded = merged && src && monthly.some((p) => Math.abs((p.estOrdersByChannel[c] ?? 0) - Math.max(0, p.netByChannel[c] ?? 0) / CHANNEL_AOV[c]) > 0.5);
    if (folded && src) put(row, 1, `${src} ${CHANNEL_AOV[src]} / ${c} ${CHANNEL_AOV[c]}`, S.label);
    else put(row, 1, CHANNEL_AOV[c], S.num);
    let t = 0;
    monthly.forEach((p, i) => { const v = Math.round(actual[i] ? (p.ordersByChannel[c] ?? 0) : (est[i][c] ?? 0)); t += v; colTot[i] += v; put(row, i + 2, v, S.num); });
    put(row, nCols - 1, t, S.total);
    row++;
  }
  put(row, 0, 'Total orders', S.totalLabel); put(row, 1, '', S.total);
  monthly.forEach((_, i) => put(row, i + 2, colTot[i], S.total));
  put(row, nCols - 1, colTot.reduce((a, b) => a + b, 0), S.total);
  row++;
  return finish(row, [22, 10, ...monthly.map(() => 10), 12]);
}

// ---- Live extras: marketing by platform, units, raw cells ------------------

function marketingSheet(months: MonthlyMIS[]): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const ms = months.filter((m) => m.marketingByPlatform && Object.keys(m.marketingByPlatform).length);
  const labels = [...new Set(ms.flatMap((m) => Object.keys(m.marketingByPlatform!)))];
  const nCols = ms.length + 2;
  let row = 0;
  band(row++, 'SALES & MARKETING BY AD PLATFORM', S.title, Math.max(nCols, 4));
  band(row++, 'Live months: S&M rebuilt from the connector ad facts, with a blended "Other" bucket that foots to the P&L line. Locked/published months carry no split.', S.subtitle, Math.max(nCols, 4));
  row++;
  put(row, 0, 'Platform', S.header);
  ms.forEach((m, i) => put(row, i + 1, monthLabel(m.key), S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;
  for (const l of labels) {
    put(row, 0, l, S.label);
    let t = 0;
    ms.forEach((m, i) => { const v = round2(m.marketingByPlatform![l] ?? 0); t += v; put(row, i + 1, v, S.num); });
    put(row, nCols - 1, round2(t), S.total);
    row++;
  }
  put(row, 0, 'Total Sales & Marketing', S.totalLabel);
  ms.forEach((m, i) => put(row, i + 1, round2(m.salesMarketing), S.total));
  put(row, nCols - 1, round2(ms.reduce((s, m) => s + m.salesMarketing, 0)), S.total);
  row++;
  if (!ms.length) put(row++, 0, 'No live month with an ad-platform split yet.', S.label);
  return finish(row, [26, ...ms.map(() => 13), 14]);
}

function unitsSheet(deck: LiveDeckData): XLSX.WorkSheet {
  const { put, band, finish } = sheetWriter();
  const months = deck.periods;
  const prods = [...new Set(deck.skuCells.map((c) => c.p))];
  const u = new Map<string, number>();
  for (const c of deck.skuCells) u.set(`${c.p}|${c.m}`, (u.get(`${c.p}|${c.m}`) ?? 0) + c.u);
  const tot = (p: string) => months.reduce((s, m) => s + (u.get(`${p}|${m}`) ?? 0), 0);
  prods.sort((a, b) => tot(b) - tot(a));
  const nCols = months.length + 2;
  let row = 0;
  band(row++, 'UNITS SOLD BY PRODUCT', S.title, nCols);
  band(row++, 'Quantity per product per month, all channels (net of returns where the channel reports them).', S.subtitle, nCols);
  row++;
  put(row, 0, 'Product', S.header);
  months.forEach((m, i) => put(row, i + 1, monthLabel(m), S.header));
  put(row, nCols - 1, 'Total', S.header);
  row++;
  for (const p of prods) {
    put(row, 0, p, S.label);
    months.forEach((m, i) => { const v = u.get(`${p}|${m}`); put(row, i + 1, v ? Math.round(v) : '', S.num); });
    put(row, nCols - 1, Math.round(tot(p)), S.total);
    row++;
  }
  return finish(row, [26, ...months.map(() => 10), 12]);
}

function skuCellsSheet(deck: LiveDeckData, merged: boolean): XLSX.WorkSheet {
  const head = ['Month', 'Channel', 'Product', 'Revenue', 'COGS', 'Channel & fulfilment', 'Ad spend', 'Contribution (pre-factory)', 'Units', 'Completeness'];
  const body = [...deck.skuCells]
    .sort((a, b) => a.m.localeCompare(b.m) || a.ch.localeCompare(b.ch) || b.rev - a.rev)
    .map((c) => [c.m, channelName(c.ch, merged), c.p, round2(c.rev), round2(c.cogs), round2(c.oth), round2(c.ad ?? 0), round2(c.con), c.u,
      deck.completeness[c.m]?.locked ? 'Locked' : deck.completeness[c.m]?.published ? 'Published' : deck.completeness[c.m]?.level ?? '']);
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  setCols(ws, [9, 12, 26, 12, 12, 14, 12, 14, 9, 12]);
  return ws;
}

// ---- Workbook ----------------------------------------------------------------

const GRAN_META: Record<Granularity, { sheet: string; title: string }> = {
  month: { sheet: 'Monthly P&L', title: 'MONTHLY P&L' },
  quarter: { sheet: 'Quarterly P&L', title: 'QUARTERLY P&L (Fiscal)' },
  year: { sheet: 'FY P&L', title: 'FINANCIAL-YEAR P&L' },
};

/** Build the Live MIS workbook (pure — no download). */
export function buildLiveWorkbook(rawDeck: LiveDeckData, o: LiveExportOptions): XLSX.WorkBook {
  const deck = o.mergeChannels ? unifyChannels(rawDeck) : rawDeck;
  const wb = XLSX.utils.book_new();
  const blend = blendLiveMonths(deck.months, deck.completeness);
  const plMonths = o.blendCogm ? blend.months : deck.months;
  const actualMonthly = aggregatePeriods(deck.months, deck.completeness, 'month');
  const actualYearly = aggregatePeriods(deck.months, deck.completeness, 'year');
  const sub = o.blendCogm
    ? `COGM blended to each FY's revenue-weighted rate (cogm-real months only; GM% by FY: ${blendRatesNote(blend.rates)}) · blanks = below that period's completeness · ₹`
    : 'Net Revenue → COGM → Gross Margin → CM1 → CM2 → CM3 → EBITDA → Net Income · actual COGM · blanks = below that period\'s completeness · ₹';

  if (o.includeSummary) XLSX.utils.book_append_sheet(wb, summarySheet(deck, actualMonthly, actualYearly, o.mergeChannels), 'Summary');
  for (const g of o.granularities) {
    const series = aggregatePeriods(plMonths, deck.completeness, g);
    if (series.length) XLSX.utils.book_append_sheet(wb, plSheet(series, g, GRAN_META[g].title, sub), GRAN_META[g].sheet);
  }
  if (o.includeChannelRevenue) XLSX.utils.book_append_sheet(wb, channelRevenueSheet(actualMonthly, o.mergeChannels), 'Channel Revenue');
  if (o.includeChannelPnl) {
    // Channel P&L stays on actual COGM (as the legacy sheet does, blend or not).
    XLSX.utils.book_append_sheet(wb, channelPnlSheet(deck, actualYearly, o.mergeChannels), 'Channel P&L');
    XLSX.utils.book_append_sheet(wb, skuChannelSheet(deck, o.mergeChannels), 'SKU x Channel');
  }
  if (o.includeOrders) XLSX.utils.book_append_sheet(wb, ordersSheet(actualMonthly, o.mergeChannels), 'Channel Orders');
  if (o.includeRepeats) XLSX.utils.book_append_sheet(wb, generateRepeatsSheet(), 'Repeats');
  if (o.includeDiscounts) XLSX.utils.book_append_sheet(wb, generateDiscountSheet(), 'Discounts');
  const ordered = [...deck.months].sort((a, b) => a.key.localeCompare(b.key));
  if (o.includeCogmDetail) {
    const extra = o.blendCogm ? ' NOTE: the P&L sheets use FY-blended COGM, so these actual line totals will not tie to the P&L COGM month by month.' : '';
    XLSX.utils.book_append_sheet(wb, generateLineDetailSheet(ordered, 'cogmLines', 'COGM DETAIL — Cost of Goods Manufactured', extra), 'COGM Detail');
  }
  if (o.includeOpexDetail) XLSX.utils.book_append_sheet(wb, generateLineDetailSheet(ordered, 'opexLines', 'OPEX DETAIL — Operating Expenses'), 'OpEx Detail');
  if (o.includeMarketing) XLSX.utils.book_append_sheet(wb, marketingSheet(ordered), 'Marketing by Platform');
  if (o.includeUnits) XLSX.utils.book_append_sheet(wb, unitsSheet(deck), 'Units');
  if (o.includeSkuCells) XLSX.utils.book_append_sheet(wb, skuCellsSheet(deck, o.mergeChannels), 'SKU Cells');
  if (wb.SheetNames.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No sheets selected for export']]), 'Info');
  return wb;
}

export async function exportLiveMis(deck: LiveDeckData, o: LiveExportOptions = LIVE_EXPORT_EVERYTHING): Promise<void> {
  const wb = buildLiveWorkbook(deck, o);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const { saveAs } = await import('file-saver');
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Heatronics_Live_MIS_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    cogs: null, grossMargin: null, logistics: null, cm1: null, marketing: null, cm2: null, branding: null, cm3: null, payroll: null,
    profFee: null, otherExpense: null, otherIncome: null, ebitda: null, openingCash: null, funding: null, closingCash: null,
    cashBurn: null, ebitdaBurn: null, runway: null,
  };
}
