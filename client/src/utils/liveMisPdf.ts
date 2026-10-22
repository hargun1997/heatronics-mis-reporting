// ----------------------------------------------------------------------------
// Live MIS → PDF. The retired MIS-tracking view's multi-section PDF report
// (trends overview, FY P&L summaries, individual months), rebuilt on the live
// deck. Pure builder (buildLivePdf) + a download wrapper. Lines below a
// period's completeness level print as "—", never 0.
// ----------------------------------------------------------------------------

import { jsPDF } from 'jspdf';
import type { LiveDeckData } from '../data/misDeck/liveDeck';
import { SALES_CHANNELS } from '../data/misDeck/misDeckData';
import { aggregatePeriods, scopeOf, type PeriodAgg } from '../data/misDeck/liveAnalytics';
import { REAL_ROWS, blendLiveMonths, channelName, unifyChannels, aggregateRange, longKey } from '../data/misDeck/liveViews';

export type PdfSection = 'trends' | 'fyPnl' | 'months' | 'channels';

export interface LivePdfOptions {
  sections: PdfSection[];
  /** Fiscal years for the FY P&L section, as aggregatePeriods year keys ("FY25-26"). */
  fyKeys: string[];
  /** Months ("2026-07") for the individual-months section. */
  monthKeys: string[];
  blendCogm: boolean;
  mergeChannels: boolean;
}

// Note: the built-in PDF fonts are WinAnsi — no ₹ or arrows; amounts print in Rs lakh.
const LAKH = (v: number) => (Math.round(v / 1e3) / 100 || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = (v: number | null) => (v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(1)}%`);

const PNL: { label: string; row: string; get: (p: PeriodAgg) => number; bold?: boolean }[] = [
  { label: 'Net Revenue', row: 'net_revenue', get: (p) => p.netRevenue, bold: true },
  { label: '  Less: COGM', row: 'cogm', get: (p) => -p.cogm },
  { label: 'Gross Margin', row: 'gross_margin', get: (p) => p.grossMargin, bold: true },
  { label: '  Less: Channel & Fulfilment', row: 'channel_fulfilment', get: (p) => -p.channelFulfillment },
  { label: 'CM1', row: 'cm1', get: (p) => p.cm1, bold: true },
  { label: '  Less: Sales & Marketing', row: 'sales_marketing', get: (p) => -p.salesMarketing },
  { label: 'CM2', row: 'cm2', get: (p) => p.cm2, bold: true },
  { label: '  Less: Brand Inv. / Platform', row: 'platform_payment', get: (p) => -p.platformCosts },
  { label: 'CM3', row: 'cm3', get: (p) => p.cm3, bold: true },
  { label: '  Less: Operating Expenses', row: 'opex', get: (p) => -p.opex },
  { label: 'EBITDA', row: 'ebitda', get: (p) => p.ebitda, bold: true },
  { label: '  Less: Cost of Fundraising', row: 'cost_of_fundraising', get: (p) => -p.costOfFundraising },
  { label: '  Less: Non-Operating', row: 'non_operating', get: (p) => -p.nonOperating },
  { label: 'Net Income', row: 'net_income', get: (p) => p.netIncome, bold: true },
];

const W = 297, H = 210, M = 12;
const BRAND: [number, number, number] = [254, 71, 5];
const SLATE: [number, number, number] = [71, 85, 105];

function header(doc: jsPDF, title: string, sub: string) {
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, W, 16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(title, M, 10.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(sub, W - M, 10.5, { align: 'right' });
  doc.setTextColor(0, 0, 0);
}

/** A simple table that breaks across pages. Returns the y after the table. */
function table(doc: jsPDF, y: number, head: string[], rows: { cells: string[]; bold?: boolean }[], firstW: number, title?: string): number {
  const colW = (W - 2 * M - firstW) / Math.max(1, head.length - 1);
  const rowH = 5.2;
  const drawHead = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y - 3.8, W - 2 * M, rowH, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...SLATE);
    head.forEach((h, i) => (i === 0 ? doc.text(h, M + 1, y) : doc.text(h, M + firstW + colW * i - 1, y, { align: 'right' })));
    doc.setTextColor(0, 0, 0);
    y += rowH;
  };
  if (title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(title, M, y); y += 6; }
  drawHead();
  for (const r of rows) {
    if (y > H - M) { doc.addPage(); header(doc, 'Heatronics — Live MIS', '(continued)'); y = 24; drawHead(); }
    doc.setFont('helvetica', r.bold ? 'bold' : 'normal'); doc.setFontSize(7);
    r.cells.forEach((c, i) => (i === 0 ? doc.text(c, M + 1, y) : doc.text(c, M + firstW + colW * i - 1, y, { align: 'right' })));
    doc.setDrawColor(241, 245, 249); doc.line(M, y + 1.4, W - M, y + 1.4);
    y += rowH;
  }
  return y + 3;
}

function pnlRows(cols: PeriodAgg[]): { cells: string[]; bold?: boolean }[] {
  const rows = PNL.map((l) => ({
    bold: l.bold,
    cells: [l.label, ...cols.map((p) => (REAL_ROWS[p.level].has(l.row) ? LAKH(l.get(p)) : '—'))],
  }));
  for (const [label, row, f] of [['GM %', 'gross_margin', (p: PeriodAgg) => p.grossMargin], ['EBITDA %', 'ebitda', (p: PeriodAgg) => p.ebitda], ['Net margin %', 'net_income', (p: PeriodAgg) => p.netIncome]] as const) {
    rows.push({ bold: false, cells: [label, ...cols.map((p) => (REAL_ROWS[p.level].has(row) && p.netRevenue ? PCT(f(p) / p.netRevenue) : '—'))] });
  }
  return rows;
}

/** Bars (net revenue) + line (EBITDA) for the monthly trend, drawn with jsPDF primitives. */
function trendChart(doc: jsPDF, y: number, months: PeriodAgg[]): number {
  const x0 = M + 10, w = W - 2 * M - 14, h = 62;
  const vals = months.map((p) => p.netRevenue);
  const ebs = months.map((p) => (REAL_ROWS[p.level].has('ebitda') ? p.ebitda : null));
  const max = Math.max(1, ...vals, ...ebs.filter((v): v is number => v !== null));
  const min = Math.min(0, ...ebs.filter((v): v is number => v !== null));
  const yOf = (v: number) => y + h - ((v - min) / (max - min)) * h;
  doc.setDrawColor(203, 213, 225); doc.line(x0, yOf(0), x0 + w, yOf(0));
  doc.setFontSize(6); doc.setTextColor(...SLATE);
  doc.text(`Rs ${(max / 1e5).toFixed(0)} L`, x0 - 1, y + 2, { align: 'right' });
  const band = w / Math.max(1, months.length);
  months.forEach((p, i) => {
    const bx = x0 + band * i + band * 0.15;
    doc.setFillColor(...BRAND);
    doc.rect(bx, yOf(p.netRevenue), band * 0.7, yOf(0) - yOf(p.netRevenue), 'F');
    if (months.length <= 18 || i % 3 === 0) doc.text(p.label, bx + band * 0.35, y + h + 4, { align: 'center' });
  });
  doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.5);
  let prev: [number, number] | null = null;
  ebs.forEach((v, i) => {
    if (v === null) { prev = null; return; }
    const pt: [number, number] = [x0 + band * i + band / 2, yOf(v)];
    if (prev) doc.line(prev[0], prev[1], pt[0], pt[1]);
    prev = pt;
  });
  doc.setLineWidth(0.2);
  doc.setFillColor(...BRAND); doc.rect(x0, y + h + 7, 3, 2, 'F'); doc.text('Net revenue', x0 + 4, y + h + 8.6);
  doc.setFillColor(37, 99, 235); doc.rect(x0 + 26, y + h + 7, 3, 2, 'F'); doc.text('EBITDA (full-close months)', x0 + 30, y + h + 8.6);
  doc.setTextColor(0, 0, 0);
  return y + h + 14;
}

export function buildLivePdf(rawDeck: LiveDeckData, o: LivePdfOptions): jsPDF {
  const deck = o.mergeChannels ? unifyChannels(rawDeck) : rawDeck;
  const months = o.blendCogm ? blendLiveMonths(deck.months, deck.completeness).months : deck.months;
  const monthly = aggregatePeriods(months, deck.completeness, 'month');
  const yearly = aggregatePeriods(months, deck.completeness, 'year');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const stamp = `${new Date().toISOString().slice(0, 10)} · ${o.blendCogm ? 'blended COGM' : 'actual COGM'} · Rs Lakh`;
  let first = true;
  const page = (title: string) => { if (!first) doc.addPage(); first = false; header(doc, title, stamp); return 24; };

  if (o.sections.includes('trends')) {
    let y = page('Heatronics — Live MIS · Trends overview');
    const fys = yearly.filter((p) => o.fyKeys.length === 0 || o.fyKeys.includes(p.key));
    const scopeMonths = fys.length ? monthly.filter((m) => fys.some((f) => f.members.includes(m.key))) : monthly;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(`Net revenue & EBITDA · ${scopeMonths[0]?.label ?? ''} to ${scopeMonths[scopeMonths.length - 1]?.label ?? ''}`, M, y);
    y = trendChart(doc, y + 4, scopeMonths);
    y = table(doc, y + 2, ['Fiscal year', 'Months', 'Net revenue (L)', 'GM %', 'CM2 %', 'EBITDA %', 'Net %'], fys.map((p) => ({
      cells: [p.label, scopeOf(p), LAKH(p.netRevenue),
        ...([['gross_margin', p.grossMargin], ['cm2', p.cm2], ['ebitda', p.ebitda], ['net_income', p.netIncome]] as const)
          .map(([row, v]) => (REAL_ROWS[p.level].has(row) && p.netRevenue ? PCT(v / p.netRevenue) : '—'))],
    })), 34, 'Fiscal-year summary');
    doc.setFontSize(7); doc.setTextColor(...SLATE);
    doc.text(`Fully closed through ${deck.completeThrough ? longKey(deck.completeThrough) : '—'}. "—" = not real yet for that period (below its completeness level).`, M, Math.min(y, H - 6));
    doc.setTextColor(0, 0, 0);
  }

  if (o.sections.includes('fyPnl')) {
    for (const fy of yearly.filter((p) => o.fyKeys.length === 0 || o.fyKeys.includes(p.key))) {
      const y = page(`Heatronics — Live MIS · ${fy.label} P&L`);
      const cols = [...monthly.filter((m) => fy.members.includes(m.key)), { ...fy, label: `${fy.label} Total` }];
      table(doc, y, ['Particulars (Rs L)', ...cols.map((c) => c.label)], pnlRows(cols), 44, `${fy.label} P&L summary · ${scopeOf(fy)}`);
    }
  }

  if (o.sections.includes('months') && o.monthKeys.length) {
    const sel = monthly.filter((m) => o.monthKeys.includes(m.key));
    const range = aggregateRange(months, deck.completeness, sel.map((m) => m.key), 'Selected');
    const cols = [...sel, ...(range && sel.length > 1 ? [{ ...range, label: 'Selected total' }] : [])];
    for (let i = 0; i < cols.length; i += 12) {
      const y = page('Heatronics — Live MIS · Selected months');
      table(doc, y, ['Particulars (Rs L)', ...cols.slice(i, i + 12).map((c) => c.label)], pnlRows(cols.slice(i, i + 12)), 44, 'Individual months P&L');
    }
  }

  if (o.sections.includes('channels')) {
    const y = page('Heatronics — Live MIS · Channel mix');
    const fys = yearly.filter((p) => o.fyKeys.length === 0 || o.fyKeys.includes(p.key));
    const chans = SALES_CHANNELS.filter((c) => fys.some((p) => (p.netByChannel[c] ?? 0) !== 0));
    table(doc, y, ['Fiscal year', 'Net revenue (L)', ...chans.map((c) => channelName(c, o.mergeChannels))], fys.map((p) => {
      const pos = chans.reduce((s, c) => s + Math.max(0, p.netByChannel[c] ?? 0), 0) || 1;
      return { cells: [p.label, LAKH(p.netRevenue), ...chans.map((c) => PCT(Math.max(0, p.netByChannel[c] ?? 0) / pos))] };
    }), 30, 'Channel mix by fiscal year (% of net revenue)');
  }

  if (first) { header(doc, 'Heatronics — Live MIS', stamp); doc.text('No sections selected.', M, 30); }
  return doc;
}

export function downloadLivePdf(deck: LiveDeckData, o: LivePdfOptions): void {
  buildLivePdf(deck, o).save(`Heatronics_Live_MIS_${new Date().toISOString().slice(0, 10)}.pdf`);
}
