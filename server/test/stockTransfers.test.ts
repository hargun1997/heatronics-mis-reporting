// Tranzact invoices in the ITF / transfer series (and Amazon-bound ones) are stock transfers, not sales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { UPLOAD_PARSERS, isTranzactStockTransfer } from '../../client/src/data/liveMis/uploadParsers.ts';

const parser = UPLOAD_PARSERS.find((p) => p.sourceId === 'tranzact')!;
const header = ['Invoice Number', 'Customer Name', 'Document Date', 'Item ID', 'Item Description', 'Invoice Quantity', 'Item Value - Before Tax(₹)'];

test('ITF / transfer series and Amazon customers are classified as stock transfers', () => {
  assert.equal(isTranzactStockTransfer('ITF/26-27/0001'), true);
  assert.equal(isTranzactStockTransfer('Ecom/26-27/0007'), true);
  assert.equal(isTranzactStockTransfer('ITF/CN/26-27/001'), false); // credit note, not a transfer invoice
  assert.equal(isTranzactStockTransfer('MT/26-27/0001'), false);
  assert.equal(isTranzactStockTransfer('itf/26-27/0001'), true);
  // A9-6 (10 Nov 2026): the series wins — a GTD invoice to Amazon is a GT sale, as Tally books it.
  assert.equal(isTranzactStockTransfer('GTD/26-27/0102', 'AMAZON SELLER SERVICES PVT LTD'), false);
  assert.equal(isTranzactStockTransfer('INV-0102', 'AMAZON SELLER SERVICES PVT LTD'), true);
  assert.equal(isTranzactStockTransfer('GTD/26-27/0102', 'SCIENTIFIC SURGICAL EMPORIUM'), false);
  assert.equal(isTranzactStockTransfer('OEM/26-27/0047', 'MEDIKART'), false);
});

test('transfers are kept out of revenue and reported in the trace', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    header,
    ['GTD/26-27/0102', 'SCIENTIFIC SURGICAL EMPORIUM', '2026-10-31', 'FG-0011', 'A', 4, 4240],
    ['OEM/26-27/0047', 'MEDIKART', '2026-11-02', 'FG-0115', 'B', 150, 64359],
    ['ITF/26-27/0003', 'HEATRONICS WAREHOUSE', '2026-10-31', 'FG-0011', 'A', 100, 100000],
    ['BLK/26-27/00007', 'BLINK COMMERCE', '2026-10-31', 'FG-0102', 'D', 190, 47500],
    ['GTD/26-27/0103', 'Amazon Seller Services Pvt Ltd', '2026-10-31', 'FG-0001', 'C', 50, 50000],
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = parser.parse(wb) as { facts: { revenue: number }[]; trace?: string[] };
  assert.equal(out.facts.reduce((a, f) => a + f.revenue, 0), 4240 + 64359 + 50000);
  assert.ok(out.trace!.some((t) => /BLK \(Blinkit\).*47,500/.test(t)));
  assert.ok(out.trace!.some((t) => /1 internal stock-transfer invoice/.test(t) && /1,00,000/.test(t)));
});
