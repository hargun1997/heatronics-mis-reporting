// Pricing guide PDF for the team, for the products the user picks.
// Page 1: one row per product (don't go below, price at each ad spend, action).
// Page 2 on: a short waterfall per product, six to a page.
// jsPDF's built-in fonts have no ₹ sign, so amounts are written "Rs".

import { jsPDF } from 'jspdf';
import {
  assumptionsLine, costIn, waterfallRows, groupLines, solve,
  type CostsSnapshot, type FloorSettings, type FloorSku, type ProductCost,
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
/** v as a whole-number share of the price. */
const sh = (v: number, price: number) => (price > 0 && Number.isFinite(price) && Number.isFinite(v) ? `${Math.round((v / price) * 100)}%` : '-');
const pc = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '-' : `${Math.round(v * 1000) / 10}%`);

interface Col { w: number; align?: 'left' | 'right' }
interface CellStyle { bold?: boolean; color?: RGB; fill?: RGB }
type Cell = string | { t: string; s?: CellStyle };

/** Draws a simple table; returns the y after it. */
function table(doc: jsPDF, x: number, y: number, cols: Col[], head: string[], rows: Cell[][], rowH = 6.2, size = 8.5) {
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
  doc.setFontSize(size);
  rows.forEach((r) => {
    draw(r, y, {}, rowH);
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

const LEVELS = [0.05, 0.1, 0.15];

export function downloadFloorsReport(input: ExportInput) {
  const doc = buildFloorsPdf(input);
  if (doc.written) doc.pdf.save(doc.fileName);
  return doc;
}

/** Builds the PDF without saving it (used by the download and by tests). */
export function buildFloorsPdf({ skus, settings, products, costs, feeReport, tacos }: ExportInput) {
  const now = new Date();
  const stamp = now.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const costOf = (x: FloorSku) => products.find((p) => p.item === x.item) || null;
  const rows = skus.map((x) => ({ x, c: costIn(costOf(x)) })).filter((r) => r.c) as { x: FloorSku; c: NonNullable<ReturnType<typeof costIn>> }[];
  const missing = skus.length - rows.length;
  const t = tacos;
  const ads = (v: number) => `${Math.round(v * 100)}% ads`;
  const source = `Costs ${costs?.month || '-'} (production)  |  Amazon fees: ${feeReport ? feeReport.fileName : '14 Oct report'}  |  ${stamp}`;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const fileName = `Amazon_pricing_guide_${now.toISOString().slice(0, 10)}.pdf`;
  if (!rows.length) return { pdf, fileName, written: 0, missing };

  // ---------- Page 1: pricing guide ----------
  let y = header(pdf, 'Amazon pricing guide', source);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...INK);
  pdf.text(`Prices include GST and ${assumptionsLine(settings)} (shares of net sales). Never sell below "Don't go below". Action is for ${ads(t)}.`, M, y);
  y += 4;
  const cols: Col[] = [{ w: 62 }, { w: 32, align: 'right' }, { w: 34, align: 'right' }, ...LEVELS.map(() => ({ w: 34, align: 'right' as const })), { w: 41, align: 'right' }];
  const body: Cell[][] = rows.map(({ x, c }) => {
    const be = solve(x, settings, c, 0, t, 0).price;
    const need = solve(x, settings, c, 0, t).price;
    const ok = Number.isFinite(need) && need <= x.asp;
    return [
      { t: x.name, s: { bold: true } },
      rs(x.asp),
      rs(be),
      ...LEVELS.map((lv) => {
        const p = solve(x, settings, c, 0, lv).price;
        const on = Math.abs(lv - t) < 1e-9;
        return { t: rs(p), s: p > x.asp ? { color: BAD, fill: BAD_BG, bold: on } : on ? { bold: true, fill: SOFT } : {} };
      }),
      { t: !Number.isFinite(need) ? '-' : ok ? `OK, can drop ${sh(x.asp - need, x.asp)}` : `Raise to ${rs(need)}`, s: { bold: true, color: ok ? GOOD : BAD } },
    ];
  });
  y = table(pdf, M, y, cols, ['Product', 'Selling at today', "Don't go below", ...LEVELS.map((lv) => `At ${ads(lv)}`), 'Action'], body, 8.5, 9);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  pdf.text([
    "Don't go below = break-even (zero margin). Red = needs more than today's price. Waterfalls for each product from page 2.",
    ...(missing ? [`${missing} product${missing > 1 ? 's' : ''} left out: no product cost yet.`] : []),
  ], M, y + 6);

  // ---------- Page 2 on: waterfalls, 3 across × 2 down ----------
  const gap = 8;
  const bw = (W - M * 2 - gap * 2) / 3;
  const wcols: Col[] = [{ w: bw - 48 }, { w: 24, align: 'right' }, { w: 24, align: 'right' }];
  rows.forEach(({ x, c }, i) => {
    const slot = i % 6;
    if (slot === 0) { pdf.addPage(); header(pdf, `Waterfall per unit at ${ads(t)}`, source); }
    const bx = M + (slot % 3) * (bw + gap);
    let by = M + 16 + Math.floor(slot / 3) * 90;
    const res = solve(x, settings, c, 0, t);
    const g = groupLines(res.lines, res.price);
    pdf.setFillColor(...BRAND);
    pdf.rect(bx, by, bw, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(x.name, bx + 2, by + 4.8);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`today ${rs(x.asp)}`, bx + bw - 2, by + 4.8, { align: 'right' });
    by += 7;
    const wrows: Cell[][] = waterfallRows(settings).map(({ k, label, sign }) => {
      const total = sign === '=' || k === 'price';
      const st = total ? { bold: true, fill: k === 'margin' || k === 'price' ? SOFT : undefined } : {};
      return [
        { t: `${sign ? `${sign === '−' ? '-' : sign} ` : ''}${label}${k === 'saleGst' ? ` ${pc(settings.global.gst)}` : ''}`, s: st },
        { t: rs(g[k]), s: st },
        { t: k === 'price' || k === 'saleGst' ? '' : sh(g[k], g.net), s: { ...st, color: total ? INK : MUTED } },
      ];
    });
    table(pdf, bx, by, wcols, ['', 'Rs', '% of net'], wrows, 6.1, 8.5);
  });
  pdf.setFont('helvetica', 'normal');

  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setTextColor(...MUTED);
    if (i > 1 && settings.global.stuckOn !== false) pdf.text(`Costs before GST. GST stuck = ${pc(settings.global.buyGst ?? 0.18)} GST paid on materials, Amazon fees and ads minus the ${pc(settings.global.gst)} GST on the sale; it cannot be used, so it is a cost.`, M, H - 6);
    pdf.text(`Heatronics  |  page ${i} of ${n}`, W - M, H - 6, { align: 'right' });
  }
  return { pdf, fileName, written: rows.length, missing };
}
