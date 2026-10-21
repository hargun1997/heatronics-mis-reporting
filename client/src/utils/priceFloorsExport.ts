// Excel report for the Amazon price floors tool, for the products the user picks.
// Sheets: Summary, Floors by ad spend, Cost breakdown, Inputs.

import XLSX from 'xlsx-js-style';
import { COLS, TACOS, returnRate, solve, type CostsSnapshot, type FloorSettings, type FloorSku, type Lines, type ProductCost } from './priceFloors';

type Style = NonNullable<XLSX.CellObject['s']>;
const S: Record<string, Style> = {
  title: { font: { bold: true, sz: 14, color: { rgb: '1F2937' } } },
  sub: { font: { sz: 10, color: { rgb: '64748B' } } },
  head: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'BA2F06' }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
  band: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '334155' }, patternType: 'solid' } },
  label: { font: { sz: 10 } },
  labelBold: { font: { bold: true, sz: 10 } },
  rs: { font: { sz: 10 }, numFmt: '"₹"#,##0', alignment: { horizontal: 'right' } },
  rsBold: { font: { bold: true, sz: 10 }, numFmt: '"₹"#,##0', alignment: { horizontal: 'right' } },
  rsHi: { font: { bold: true, sz: 10 }, numFmt: '"₹"#,##0', fill: { fgColor: { rgb: 'FFF3ED' }, patternType: 'solid' }, alignment: { horizontal: 'right' } },
  rsBad: { font: { sz: 10, color: { rgb: 'B91C1C' } }, numFmt: '"₹"#,##0', fill: { fgColor: { rgb: 'FEE2E2' }, patternType: 'solid' }, alignment: { horizontal: 'right' } },
  rsGood: { font: { bold: true, sz: 10, color: { rgb: '047857' } }, numFmt: '"₹"#,##0;[Red]-"₹"#,##0', alignment: { horizontal: 'right' } },
  pct: { font: { sz: 10 }, numFmt: '0.0%', alignment: { horizontal: 'right' } },
  num: { font: { sz: 10 }, numFmt: '#,##0.00', alignment: { horizontal: 'right' } },
  text: { font: { sz: 10 }, alignment: { horizontal: 'left' } },
};

type Cell = { v: string | number | null; s?: keyof typeof S };
const c = (v: string | number | null | undefined, s: keyof typeof S = 'label'): Cell => ({ v: v ?? null, s });

function sheet(rows: Cell[][], widths: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxC = 0;
  rows.forEach((r, ri) => {
    maxC = Math.max(maxC, r.length);
    r.forEach((cell, ci) => {
      if (cell.v === null || cell.v === '') return;
      const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
      ws[ref] = { v: cell.v, t: typeof cell.v === 'number' ? 'n' : 's', s: cell.s ? S[cell.s] : undefined } as XLSX.CellObject;
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: Math.max(maxC - 1, 0) } });
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  return ws;
}

const LINE_ROWS: [keyof Lines, string][] = [
  ['cost', 'Product cost (materials + conversion)'],
  ['fba', 'FBA fulfilment fee'],
  ['placement', 'Inbound placement'],
  ['transport', 'Inbound transport'],
  ['storage', 'Storage'],
  ['referral', 'Referral fee'],
  ['closing', 'Closing fee'],
  ['returns', 'Returns: wasted FBA fee + refund admin'],
  ['unsellable', 'Unsellable returns: lost unit, inbound, removal'],
  ['gst', 'GST on the sale'],
];

export interface ExportInput {
  skus: FloorSku[];
  settings: FloorSettings;
  products: ProductCost[];
  costs: CostsSnapshot | null;
  feeReport: { fileName: string; uploadedAt: string } | null;
}

export function downloadFloorsReport({ skus, settings, products, costs, feeReport }: ExportInput) {
  const now = new Date();
  const stamp = now.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const costOf = (x: FloorSku) => products.find((p) => p.item === x.item) || null;
  const rows = skus.map((x) => ({ x, p: costOf(x) })).filter((r) => r.p?.cost != null) as { x: FloorSku; p: ProductCost }[];
  const missing = skus.filter((x) => costOf(x)?.cost == null);
  const source = `Product costs: ${costs?.month || '—'} from production.heatronics.in · Amazon fees: ${feeReport ? feeReport.fileName : 'starting values (14 Oct report)'} · Generated ${stamp}`;

  // ---------- Summary ----------
  const sum: Cell[][] = [
    [c('Amazon price floors', 'title')],
    [c(source, 'sub')],
    [c('Lowest GST-inclusive price with zero profit. Returns at each product\'s own rate, all resellable.', 'sub')],
    [],
    ['Product', 'ASIN', 'Tranzact item', 'Selling at', 'Materials', 'Conversion', 'Full cost', 'Return rate', 'Actual ads', ...TACOS.slice(0, 5).map((t) => `Floor at ${Math.round(t * 100)}% ads`), 'Room at 10% ads'].map((h) => c(h, 'head')),
  ];
  for (const { x, p } of rows) {
    const floors = TACOS.slice(0, 5).map((t) => solve(x, settings, p.cost!, 0, t).price);
    const f10 = floors[2];
    sum.push([
      c(x.name, 'labelBold'), c(x.asin, 'text'), c(x.item, 'text'), c(x.asp, 'rs'), c(p.material, 'rs'), c(p.conversion, 'rs'), c(p.cost, 'rsBold'),
      c(returnRate(x, settings), 'pct'), c(x.tacos, 'pct'),
      ...floors.map((f, i) => c(Math.round(f), i === 2 ? 'rsHi' : f > x.asp ? 'rsBad' : 'rs')),
      c(Math.round(x.asp - f10), 'rsGood'),
    ]);
  }
  if (missing.length) {
    sum.push([]);
    sum.push([c(`No product cost for: ${missing.map((m) => `${m.name} (${m.item || 'not linked'})`).join(', ')}`, 'sub')]);
  }

  // ---------- Floors by ad spend ----------
  const grid: Cell[][] = [[c('Floors by ad spend and unsellable returns', 'title')], [c(source, 'sub')], []];
  for (const { x, p } of rows) {
    grid.push([c(`${x.name} · selling at ₹${Math.round(x.asp).toLocaleString('en-IN')} · cost ₹${Math.round(p.cost!).toLocaleString('en-IN')} · returns ${(returnRate(x, settings) * 100).toFixed(1)}%`, 'band'), ...COLS.map(() => c('', 'band'))]);
    grid.push([c('Ad spend', 'head'), ...COLS.map((col) => c(col.label, 'head'))]);
    for (const t of TACOS) {
      grid.push([
        c(`${Math.round(t * 100)}%`, t === 0.1 ? 'labelBold' : 'label'),
        ...COLS.map((col) => {
          const f = solve(x, settings, p.cost!, col.u, t).price;
          return c(Math.round(f), f > x.asp ? 'rsBad' : t === 0.1 ? 'rsHi' : 'rs');
        }),
      ]);
    }
    grid.push([]);
  }

  // ---------- Cost breakdown ----------
  const bd: Cell[][] = [[c('Cost breakdown per unit sold, no ads', 'title')], [c(source, 'sub')], []];
  for (const { x, p } of rows) {
    const res = COLS.map((col) => solve(x, settings, p.cost!, col.u, 0));
    bd.push([c(x.name, 'band'), ...COLS.map(() => c('', 'band'))]);
    bd.push([c('₹ per unit sold', 'head'), ...COLS.map((col) => c(col.label, 'head'))]);
    for (const [k, label] of LINE_ROWS) bd.push([c(label), ...res.map((r) => c(Math.round(r.lines[k]), 'rs'))]);
    bd.push([c('Lowest price, incl. GST', 'labelBold'), ...res.map((r) => c(Math.round(r.price), 'rsHi'))]);
    bd.push([]);
  }

  // ---------- Inputs ----------
  const g = settings.global;
  const inp: Cell[][] = [
    [c('Inputs used', 'title')], [c(source, 'sub')], [],
    [c('Fee rates', 'head'), c('Value', 'head')],
    [c('GST on the sale'), c(g.gst, 'pct')],
    [c('Referral and higher closing fee start at'), c(g.band, 'rs')],
    [c('Closing fee below / above that price'), c(`₹${g.closeLo} / ₹${g.closeHi}`, 'text')],
    [c('Inbound per unit (when a product has none of its own)'), c(g.placement + g.transport, 'num')],
    [c('Storage per unit sold'), c(g.storage, 'num')],
    [c('Removal fee per unsellable return'), c(g.removal, 'num')],
    [c('Average return rate used below'), c(`${g.minSample} units sold`, 'text')],
    [],
    ['Product', 'ASIN', 'SKU', 'Tranzact item', 'Avg price', 'Units sold', 'Returned', 'FBA fee', 'Refund admin', 'Referral %', 'Inbound / unit', 'Actual ads'].map((h) => c(h, 'head')),
    ...skus.map((x) => [
      c(x.name, 'labelBold'), c(x.asin, 'text'), c(x.sku, 'text'), c(x.item, 'text'), c(x.asp, 'rs'), c(x.sold, 'num'), c(x.returned, 'num'),
      c(x.fba, 'num'), c(x.admin, 'num'), c(x.refPct, 'pct'), c(x.inbound ?? g.placement + g.transport, 'num'), c(x.tacos, 'pct'),
    ]),
    [],
    [c('Amazon fees include the 18% GST Amazon charges on them, counted as a cost (inverted duty). Referral applies only from the price band up. Every return wastes the FBA fee and the refund admin fee; an unsellable one also loses the unit, inbound, storage and removal.', 'sub')],
  ];
  if (costs?.conversion) inp.splice(11, 0, [c('Conversion (from production)'), c(`₹${Math.round(costs.conversion.total).toLocaleString('en-IN')} overheads over ${costs.conversion.units ? Math.round(costs.conversion.units).toLocaleString('en-IN') : '—'} units (${costs.conversion.basis})`, 'text')]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(sum, [26, 13, 12, 11, 11, 11, 11, 11, 10, 13, 13, 13, 13, 13, 14]), 'Summary');
  XLSX.utils.book_append_sheet(wb, sheet(grid, [16, 14, 14, 15, 15, 15]), 'Floors by ad spend');
  XLSX.utils.book_append_sheet(wb, sheet(bd, [44, 14, 14, 15, 15, 15]), 'Cost breakdown');
  XLSX.utils.book_append_sheet(wb, sheet(inp, [44, 22, 14, 12, 11, 10, 10, 10, 12, 10, 13, 11]), 'Inputs');
  const name = rows.length === 1 ? rows[0].x.name.replace(/[^\w]+/g, '_') : `${rows.length}_products`;
  XLSX.writeFile(wb, `Price_floors_${name}_${now.toISOString().slice(0, 10)}.xlsx`);
  return { written: rows.length, missing: missing.length };
}
