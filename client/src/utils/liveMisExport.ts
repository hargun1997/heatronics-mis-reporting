// ----------------------------------------------------------------------------
// Export the Live MIS to Excel — the live twin of the legacy deck export.
//
// Three sheets, built straight from the live deck output (no re-derivation):
//   P&L               cascade lines × months (Net Revenue → Net Income)
//   Revenue by channel  net revenue per channel × months
//   SKU cells           the raw per-product-per-channel rows
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import type { LiveDeckData } from '../data/misDeck/liveDeck';
import { SALES_CHANNELS } from '../data/misDeck/misDeckData';

/** Cascade rows for the P&L sheet, in display order (cost lines negative). */
const PNL_LINES: { label: string; get: (m: LiveDeckData['months'][number]) => number }[] = [
  { label: 'Net Revenue', get: (m) => m.netRevenue },
  { label: 'COGM', get: (m) => -m.cogm },
  { label: 'Gross Margin', get: (m) => m.grossMargin },
  { label: 'Channel & Fulfilment', get: (m) => -m.channelFulfillment },
  { label: 'CM1', get: (m) => m.cm1 },
  { label: 'Sales & Marketing', get: (m) => -m.salesMarketing },
  { label: 'CM2', get: (m) => m.cm2 },
  { label: 'Platform & Payment', get: (m) => -m.platformCosts },
  { label: 'CM3', get: (m) => m.cm3 },
  { label: 'Operating Expenses', get: (m) => -m.opex },
  { label: 'EBITDA', get: (m) => m.ebitda },
  { label: 'Non-Operating + Fundraising', get: (m) => -(m.nonOperating + (m.costOfFundraising ?? 0)) },
  { label: 'Net Income', get: (m) => m.netIncome },
];

export function exportLiveMis(deck: LiveDeckData): void {
  const months = [...deck.months].sort((a, b) => a.key.localeCompare(b.key));
  const wb = XLSX.utils.book_new();

  // ---- P&L sheet ----------------------------------------------------------
  const pnlHead = ['Line', ...months.map((m) => m.label)];
  const pnlStatus = ['Completeness', ...months.map((m) => deck.completeness[m.key]?.locked ? 'Locked' : deck.completeness[m.key]?.level ?? '')];
  const pnlBody = PNL_LINES.map((row) => [row.label, ...months.map((m) => round(row.get(m)))]);
  const pnl = XLSX.utils.aoa_to_sheet([pnlHead, pnlStatus, ...pnlBody]);
  XLSX.utils.book_append_sheet(wb, pnl, 'P&L');

  // ---- Revenue by channel -------------------------------------------------
  const chans = SALES_CHANNELS.filter((ch) => months.some((m) => (m.netByChannel[ch] ?? 0) !== 0));
  const chHead = ['Channel', ...months.map((m) => m.label)];
  const chBody = chans.map((ch) => [ch, ...months.map((m) => round(m.netByChannel[ch] ?? 0))]);
  const chTotal = ['Total', ...months.map((m) => round(m.netRevenue))];
  const ch = XLSX.utils.aoa_to_sheet([chHead, ...chBody, chTotal]);
  XLSX.utils.book_append_sheet(wb, ch, 'Revenue by channel');

  // ---- SKU cells ----------------------------------------------------------
  const skuHead = ['Month', 'Channel', 'Product', 'Revenue', 'COGS', 'Fees', 'Ad', 'Contribution', 'Units'];
  const skuBody = [...deck.skuCells]
    .sort((a, b) => a.m.localeCompare(b.m) || a.ch.localeCompare(b.ch) || b.rev - a.rev)
    .map((c) => [c.m, c.ch, c.p, round(c.rev), round(c.cogs), round(c.oth), round(c.ad ?? 0), round(c.con), c.u]);
  const sku = XLSX.utils.aoa_to_sheet([skuHead, ...skuBody]);
  XLSX.utils.book_append_sheet(wb, sku, 'SKU cells');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Heatronics_Live_MIS_${today}.xlsx`);
}

const round = (n: number) => Math.round(n * 100) / 100;
