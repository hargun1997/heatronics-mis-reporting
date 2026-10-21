// PDF report for the Amazon price floors tool, for the products the user picks.
// Page 1: summary (where each rupee of the lowest price goes). Then two products
// per page (where the money goes + lowest price by ad spend). Last: inputs used.
// jsPDF's built-in fonts have no ₹ sign, so amounts are written "Rs".

import { jsPDF } from 'jspdf';
import {
  COLS, TACOS, groupLines, marginOf, returnRate, solve,
  type CostsSnapshot, type FloorSettings, type FloorSku, type Groups, type ProductCost,
} from './priceFloors';

export interface ExportInput {
  skus: FloorSku[];
  settings: FloorSettings;
  products: ProductCost[];
  costs: CostsSnapshot | null;
  feeReport: { fileName: string; uploadedAt: string } | null;
  tacos: number;
}

type RGB = [number, number, number];
const INK: RGB = [30, 41, 59];
const MUTED: RGB = [100, 116, 139];
const BRAND: RGB = [186, 47, 6];
const SOFT: RGB = [255, 243, 237];
const BAD: RGB = [185, 28, 28];
const BAD_BG: RGB = [254, 226, 226];
const GOOD: RGB = [4, 120, 87];
const LINE: RGB = [226, 232, 240];
const HEAD_BG: RGB = [241, 245, 249];

const W = 297;
const H = 210;
const M = 12;

const rs = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '-' : `Rs ${Math.round(v).toLocaleString('en-IN')}`);
const num = (v: number) => (!Number.isFinite(v) ? '-' : Math.round(v) ? Math.round(v).toLocaleString('en-IN') : '-');
const pc = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '-' : `${Math.round(v * 1000) / 10}%`);

interface Col { w: number; align?: 'left' | 'right' }
interface CellStyle { bold?: boolean; color?: RGB; fill?: RGB }
type Cell = string | { t: string; s?: CellStyle };

/** Draws a simple table; returns the y after it. */
function table(doc: jsPDF, x: number, y: number, cols: Col[], head: string[], rows: Cell[][], rowH = 6.2, rowStyle?: (i: number) => CellStyle | undefined) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  const pad = 1.8;
  const draw = (cells: Cell[], yy: number, base: CellStyle, h: number) => {
    let xx = x;
    cells.forEach((cell, i) => {
      const c = cols[i];
      const t = typeof cell === 'string' ? cell : cell.t;
      const st = { ...base, ...(typeof cell === 'string' ? {} : cell.s) };
      if (st.fill) { doc.setFillColor(...st.fill); doc.rect(xx, yy, c.w, h, 'F'); }
      doc.setFont('helvetica', st.bold ? 'bold' : 'normal');
      doc.setTextColor(...(st.color || INK));
      const lines = doc.splitTextToSize(t, c.w - pad * 2) as string[];
      const ty = yy + h / 2 + (1 - lines.length) * 1.6 + 1.1;
      if (c.align === 'right') doc.text(lines, xx + c.w - pad, ty, { align: 'right' });
      else doc.text(lines, xx + pad, ty);
      xx += c.w;
    });
  };
  doc.setFontSize(8);
  const headH = head.some((h, i) => doc.getTextWidth(h) > cols[i].w - 3.6) ? 9 : rowH;
  draw(head, y, { bold: true, color: MUTED, fill: HEAD_BG }, headH);
  y += headH;
  doc.setFontSize(8.5);
  rows.forEach((r, i) => {
    draw(r, y, rowStyle?.(i) || {}, rowH);
    y += rowH;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(x, y, x + total, y);
  });
  return y;
}

function header(doc: jsPDF, title: string, source: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(title, M, M + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(source, M, M + 9.5);
  return M + 15;
}

const GROUPS: [keyof Groups, string][] = [
  ['cost', 'Product cost'],
  ['amazon', 'Amazon fees'],
  ['returns', 'Returns'],
  ['ads', 'Ads'],
  ['gst', 'GST on the sale'],
  ['margin', 'Margin'],
];

export function downloadFloorsReport({ skus, settings, products, costs, feeReport, tacos }: ExportInput) {
  const doc = buildFloorsPdf({ skus, settings, products, costs, feeReport, tacos });
  if (!doc.written) return doc;
  doc.pdf.save(doc.fileName);
  return doc;
}

/** Builds the PDF without saving it (used by the download and by tests). */
export function buildFloorsPdf({ skus, settings, products, costs, feeReport, tacos }: ExportInput) {
  const now = new Date();
  const stamp = now.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const costOf = (x: FloorSku) => products.find((p) => p.item === x.item) || null;
  const rows = skus.map((x) => ({ x, p: costOf(x) })).filter((r) => r.p?.cost != null) as { x: FloorSku; p: ProductCost }[];
  const missing = skus.filter((x) => costOf(x)?.cost == null);
  const m = marginOf(settings);
  const t = tacos;
  const g = settings.global;
  const source = `Product costs: ${costs?.month || '-'} from production.heatronics.in  |  Amazon fees: ${feeReport ? feeReport.fileName : 'starting values (14 Oct report)'}  |  Generated ${stamp}`;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const fileName = `Price_floors_${rows.length === 1 ? rows[0].x.name.replace(/[^\w]+/g, '_') : `${rows.length}_products`}_${now.toISOString().slice(0, 10)}.pdf`;
  if (!rows.length) return { pdf, fileName, written: 0, missing: missing.length };

  // ---------- Summary ----------
  let y = header(pdf, 'Amazon lowest prices', source);
  pdf.setFontSize(10);
  pdf.setTextColor(...INK);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Target margin ${pc(m)}  |  Ad spend ${Math.round(t * 100)}% of sales  |  Returns at each product's own rate, all resellable`, M, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  pdf.text('Lowest price = the GST-inclusive price that still leaves the target margin after every cost. Break-even = the same with zero margin.', M, y + 5);
  y += 9;
  const sumCols: Col[] = [{ w: 46 }, ...Array.from({ length: 10 }, () => ({ w: 22.7, align: 'right' as const }))];
  const sumRows: Cell[][] = rows.map(({ x, p }) => {
    const res = solve(x, settings, p.cost!, 0, t);
    const be = solve(x, settings, p.cost!, 0, t, 0).price;
    const gl = groupLines(res.lines);
    const room = Number.isFinite(res.price) ? x.asp - res.price : null;
    return [
      { t: x.name, s: { bold: true } },
      rs(x.asp), rs(gl.cost), rs(gl.amazon), rs(gl.returns), rs(gl.ads), rs(gl.gst), rs(gl.margin),
      { t: rs(res.price), s: { bold: true, fill: SOFT } },
      rs(be),
      room == null ? '-' : { t: room < 0 ? `${rs(-room)} short` : `+${rs(room)}`, s: { bold: true, color: room < 0 ? BAD : GOOD } },
    ];
  });
  y = table(pdf, M, y, sumCols, ['Product', 'Selling at', 'Product cost', 'Amazon fees', 'Returns', `Ads ${Math.round(t * 100)}%`, 'GST', `Margin ${pc(m)}`, 'Lowest price', 'Break-even', 'Room'], sumRows, 7);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  const notes = [
    'Product cost = materials + conversion (overheads per unit) from production. Amazon fees = FBA, inbound, storage, referral and closing, including the 18% GST Amazon charges (a cost to us).',
    'Returns = the FBA and refund admin fees wasted on returned units, spread over the units that stay sold. Room = today\'s average selling price minus the lowest price.',
  ];
  if (missing.length) notes.push(`No product cost for: ${missing.map((x) => `${x.name} (${x.item || 'not linked'})`).join(', ')}.`);
  pdf.text(notes.flatMap((n) => pdf.splitTextToSize(n, W - M * 2) as string[]), M, y);

  // ---------- Per product, two per page ----------
  const half = (W - M * 2 - 8) / 2;
  const colsHalf: Col[] = [{ w: half - 5 * 18.5 }, ...COLS.map(() => ({ w: 18.5, align: 'right' as const }))];
  rows.forEach(({ x, p }, i) => {
    if (i % 2 === 0) { pdf.addPage(); y = header(pdf, 'By product', source); } else y += 8;
    const res = COLS.map((c) => solve(x, settings, p.cost!, c.u, t));
    // band
    pdf.setFillColor(...BRAND);
    pdf.rect(M, y, W - M * 2, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.text(x.name, M + 2.5, y + 5.4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(`Selling at ${rs(x.asp)}  |  cost ${rs(p.cost)} (${x.item})  |  returns ${pc(returnRate(x, settings))}${x.sold < g.minSample ? ' (average)' : ''}  |  actual ads ${pc(x.tacos)}  |  ASIN ${x.asin}`, W - M - 2.5, y + 5.4, { align: 'right' });
    y += 11;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...INK);
    pdf.text(`Where the money goes (Rs per unit, ${Math.round(t * 100)}% ads, ${pc(m)} margin)`, M, y + 3);
    pdf.text(`Lowest price by ad spend (${pc(m)} margin)`, M + half + 8, y + 3);
    const ty = y + 5;
    const gRows: Cell[][] = [
      ...GROUPS.map(([k, label]) => [k === 'margin' ? `${label} (${pc(m)})` : label, ...res.map((r) => num(groupLines(r.lines)[k]))] as Cell[]),
      [{ t: 'Lowest price, incl. GST', s: { bold: true } }, ...res.map((r) => ({ t: rs(r.price), s: { bold: true, fill: SOFT } }))],
    ];
    const y1 = table(pdf, M, ty, colsHalf, ['', ...COLS.map((c) => c.label)], gRows);
    const tRows: Cell[][] = TACOS.map((tt) => [
      { t: `${Math.round(tt * 100)}% ads`, s: Math.abs(tt - t) < 1e-9 ? { bold: true } : {} },
      ...COLS.map((c) => {
        const pr = solve(x, settings, p.cost!, c.u, tt).price;
        const over = pr > x.asp;
        return { t: rs(pr), s: over ? { color: BAD, fill: BAD_BG } : Math.abs(tt - t) < 1e-9 ? { bold: true, fill: SOFT } : {} };
      }),
    ]);
    const y2 = table(pdf, M + half + 8, ty, colsHalf, ['', ...COLS.map((c) => c.label)], tRows);
    y = Math.max(y1, y2) + 3;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    pdf.text(`Red = above today's price of ${rs(x.asp)}. Unsellable columns also lose the unit, its inbound and the removal fee.`, M, y + 2);
    y += 4;
  });

  // ---------- Inputs ----------
  pdf.addPage();
  y = header(pdf, 'Inputs used', source);
  const gl: Cell[][] = [
    ['Target margin', pc(m)],
    ['GST on the sale', pc(g.gst)],
    ['Referral and higher closing fee start at', rs(g.band)],
    ['Closing fee below / above that price', `Rs ${g.closeLo.toFixed(2)} / Rs ${g.closeHi.toFixed(2)}`],
    ['Inbound per unit (when a product has none of its own)', `Rs ${(g.placement + g.transport).toFixed(2)}`],
    ['Storage per unit sold', `Rs ${g.storage.toFixed(2)}`],
    ['Removal fee per unsellable return', `Rs ${g.removal.toFixed(2)}`],
    ['Average return rate used below', `${g.minSample} units sold`],
  ];
  if (costs?.conversion) gl.push(['Conversion (from production)', `${rs(costs.conversion.total)} overheads over ${costs.conversion.units ? Math.round(costs.conversion.units).toLocaleString('en-IN') : '-'} units (${costs.conversion.basis})`]);
  y = table(pdf, M, y, [{ w: 90 }, { w: 110 }], ['Fee rates and settings', 'Value'], gl) + 6;
  const inCols: Col[] = [{ w: 44 }, { w: 26 }, { w: 20 }, ...Array.from({ length: 9 }, () => ({ w: 20.3, align: 'right' as const }))];
  table(pdf, M, y, inCols,
    ['Product', 'ASIN', 'Item', 'Product cost', 'Avg price', 'Units sold', 'Returned', 'FBA fee', 'Refund admin', 'Referral %', 'Inbound', 'Actual ads'],
    skus.map((x) => {
      const pp = costOf(x);
      return [
        { t: x.name, s: { bold: true } }, x.asin, x.item || '-', rs(pp?.cost), rs(x.asp), String(x.sold), String(x.returned),
        x.fba.toFixed(2), x.admin.toFixed(2), pc(x.refPct), (x.inbound ?? g.placement + g.transport).toFixed(2), pc(x.tacos),
      ];
    }));

  // page numbers
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    pdf.text(`Heatronics  |  Amazon price floors  |  page ${i} of ${n}`, W - M, H - 6, { align: 'right' });
  }
  return { pdf, fileName, written: rows.length, missing: missing.length };
}
