// Tranzact Sales Invoice Register: cancelled lines, non-FG sales, day-first dates, bracketed negatives,
// series-first transfers (round 9 audit A9-1 / 3 / 4 / 6 / 7) and the per-series Tally ledgers (B5). Synthetic data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { UPLOAD_PARSERS, isTranzactCancelled, TRANZACT_CHARGE_LINE, TRANZACT_TOOLING_LINE } from '../../client/src/data/liveMis/uploadParsers.ts';
import { lookupLedger } from '../../client/src/data/monthClose/ledgerMap.ts';
import { tranzactSheetForMonth, TRANZACT_CHARGE_LINE as SERVER_CHARGE, TRANZACT_TOOLING_LINE as SERVER_TOOLING } from '../src/connectors/slots/map/feeds.js';
import { isoDay } from '../src/connectors/slots/map/common.js';
import { channelOfLedger } from '../src/connectors/tally/ceoSummaryV2.js';

const parser = UPLOAD_PARSERS.find((p) => p.sourceId === 'tranzact')!;
const H = ['Invoice Number', 'Customer Name', 'Document Date', 'Document Status', 'Item ID', 'Item Description', 'Invoice Quantity', 'Item Value - Before Tax(₹)'];
type Fact = { channel: string; date: string; sku?: string; revenue: number; units: number };
function run(rows: unknown[][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return parser.parse(wb) as { facts: Fact[]; trace: string[] };
}
const sum = (fs: Fact[], ch: string, k: 'revenue' | 'units') => fs.filter((f) => f.channel === ch).reduce((a, f) => a + f[k], 0);

test('cancelled invoices are skipped and reported with ₹', () => {
  const out = run([H,
    ['GTD/26-27/0101', 'Alpha', '2026-06-05', 'Sent', 'FG-0003', 'Pad', 10, 9000],
    ['GTD/26-27/0102', 'Beta', '2026-06-06', 'Cancelled', 'FG-0003', 'Pad', 20, 18000],
    ['OEM/26-27/0050', 'OEM Co', '2026-06-07', 'Cancelled', 'FG-0037', 'Pad', 500, 250000],
    ['3 (530)', '', '', '', '', '', 530, 277000],
  ]);
  assert.equal(sum(out.facts, 'GT', 'revenue'), 9000);
  assert.equal(sum(out.facts, 'GT', 'units'), 10);
  assert.equal(sum(out.facts, 'B2B', 'revenue'), 0);
  assert.ok(out.trace.some((t) => /2 cancelled line\(s\) on 2 invoice\(s\) ₹2,68,000 skipped/.test(t)), out.trace.join('\n'));
  assert.ok(!out.trace.some((t) => /unrecognised invoice prefix/.test(t)), 'totals row is not an unknown prefix');
});

test('Cancelled column (Tally-sync export shape) also counts', () => {
  assert.equal(isTranzactCancelled('Cancelled'), true);
  assert.equal(isTranzactCancelled('Yes'), true);
  assert.equal(isTranzactCancelled(1), true);
  assert.equal(isTranzactCancelled('Sent'), false);
  assert.equal(isTranzactCancelled(''), false);
  assert.equal(isTranzactCancelled('No'), false);
});

test('no status column says so in the trace', () => {
  const out = run([H.filter((h) => h !== 'Document Status'), ['GTD/26-27/0101', 'Alpha', '2026-06-05', 'FG-0003', 'Pad', 1, 900]]);
  assert.equal(sum(out.facts, 'GT', 'revenue'), 900);
  assert.ok(out.trace.some((t) => /No "Document Status" column/.test(t)));
});

test('non-FG sale lines count (unmapped); freight / round-off dropped with ₹ shown', () => {
  const out = run([H,
    ['OEM/26-27/0070', 'OEM Co', '2026-06-10', 'Sent', 'SFG-0012', 'Heating element', 1000, 300000],
    ['OEM/26-27/0070', 'OEM Co', '2026-06-10', 'Sent', 'RM-0456', 'Controller', 500, 40000],
    ['OEM/26-27/0070', 'OEM Co', '2026-06-10', 'Sent', 'FG 0037', 'Pad (code with a space)', 10, 5000],
    ['OEM/26-27/0070', 'OEM Co', '2026-06-10', 'Sent', 'FREIGHT', 'Freight', 1, 1200],
    ['GTD/26-27/0111', 'Alpha', '2026-06-12', 'Sent', '', 'Round Off', 0, 0.4],
  ]);
  assert.equal(sum(out.facts, 'B2B', 'revenue'), 345000);
  assert.ok(out.facts.some((f) => f.sku === 'FG-0037' && f.revenue === 5000), 'FG 0037 normalised');
  assert.ok(out.facts.some((f) => f.sku === 'SFG-0012' && f.revenue === 300000));
  assert.ok(out.trace.some((t) => /2 non-FG sale line\(s\) ₹3,40,000 counted as unmapped products \(SFG-0012, RM-0456\)/.test(t)), out.trace.join('\n'));
  assert.ok(out.trace.some((t) => /2 charge \/ service line\(s\).*₹1,200 dropped/.test(t)), out.trace.join('\n'));
});

test('text dates are read day-first (no month flip, no IST shift); undated lines are counted', () => {
  const out = run([H,
    ['OEM/26-27/0060', 'OEM Co', '05/06/2026', 'Sent', 'FG-0037', 'Pad', 100, 50000],  // 5 Jun, would flip to 6 May
    ['OEM/26-27/0061', 'OEM Co', '15/06/2026', 'Sent', 'FG-0037', 'Pad', 200, 100000],
    ['GTD/26-27/0110', 'Alpha', '30-06-2026', 'Sent', 'FG-0003', 'Pad', 3, 2700],
    ['GTD/26-27/0112', 'Alpha', 'not a date', 'Sent', 'FG-0003', 'Pad', 1, 900],
  ]);
  assert.deepEqual(out.facts.map((f) => f.date).sort(), ['2026-06-05', '2026-06-15', '2026-06-30']);
  assert.equal(sum(out.facts, 'B2B', 'revenue'), 150000);
  assert.ok(out.trace.some((t) => /1 line\(s\) ₹900 with no readable Document Date skipped/.test(t)));
});

test('bracketed values are negative; a GT invoice to an Amazon entity stays GT', () => {
  const out = run([H,
    ['OEM/26-27/0071', 'OEM Co', '2026-06-11', 'Sent', 'FG-0037', 'Pad', 100, 60000],
    ['OEM/26-27/0072', 'OEM Co', '2026-06-11', 'Sent', 'FG-0037', 'Pad', -10, '(5,000)'],
    ['GTD/26-27/0113', 'Amazon Seller Services Pvt Ltd', '2026-06-12', 'Sent', 'FG-0003', 'Pad', 5, 4500],
  ]);
  assert.equal(sum(out.facts, 'B2B', 'revenue'), 55000);
  assert.equal(sum(out.facts, 'GT', 'revenue'), 4500);
});

test('sheet pull leaves out cancelled lines and reports them', () => {
  const rows = [H,
    ['GTD/26-27/0120', 'A', '07/06/2026', 'Sent', 'FG-0003', 'Pad', 1, 900],
    ['GTD/26-27/0122', 'A', '2026-06-30', 'Cancelled', 'FG-0003', 'Pad', 2, 1800],
    ['GTD/26-27/0123', 'A', '2026-07-01', 'Cancelled', 'FG-0003', 'Pad', 2, 1800],
    ['2 (5)', '', '', '', '', '', 5, 4500],
  ];
  const r = tranzactSheetForMonth(rows, '2026-06');
  assert.equal(r.rowCount, 1);
  assert.equal(r.rows![1][2], '2026-06-07');
  assert.ok(r.trace.some((t) => /1 cancelled line\(s\) ₹1,800 skipped/.test(t)), r.trace.join('\n'));
});

test('Tranzact per-series sales ledgers map (GT) and Internal Transfer Sales is a stock transfer', () => {
  const line = (name: string) => lookupLedger({ name, path: ['Sales Accounts'], amount: 1, depth: 1, isLeaf: true } as never, {}).lineKey;
  for (const n of ['GT - Dealer Sales', 'GT - Retailer Sales', 'GT - CNF Sales', 'Physio Channel Sales', 'MT Sales', 'B2C Offline Sales']) {
    assert.equal(line(n), 'rev_gt', n);
    assert.equal(channelOfLedger(n), 'GT', n);
  }
  assert.equal(line('Internal Transfer Sales'), 'rev_str');
  assert.equal(channelOfLedger('Internal Transfer Sales'), null);
  assert.equal(line('OEM Sales'), 'rev_b2b');
});

test('charge / service lines are dropped (one per term); tooling counts as B2B revenue with no product', () => {
  const terms = ['Freight', 'Transportation', 'Transportation charges', 'Cartage', 'Courier', 'Insurance', 'Round Off', 'Delivery charges',
    'Loading charges', 'Packing charges', 'Packaging charges', 'Installation / service charges', 'Service Charge', 'Labour charges', 'Shipping charges'];
  const out = run([H,
    ['OEM/26-27/0080', 'OEM Co', '2026-06-10', 'Sent', 'FG-0037', 'Pad', 10, 5000],
    ...terms.map((t, i) => ['OEM/26-27/0080', 'OEM Co', '2026-06-10', 'Sent', `CHG-${i}`, t, 1, 100]),
    ['OEM/26-27/0081', 'OEM Co', '2026-06-11', 'Sent', 'TOOL-01', 'Tooling / development charges', 1, 75000],
  ]);
  for (const t of terms) {
    assert.ok(TRANZACT_CHARGE_LINE.test(t), t);
    assert.ok(!out.facts.some((f) => f.sku?.startsWith('CHG-')), t);
  }
  assert.ok(out.trace.some((x) => new RegExp(`${terms.length} charge / service line\\(s\\).*₹1,500 dropped`).test(x)), out.trace.join('\n'));
  assert.equal(sum(out.facts, 'B2B', 'revenue'), 80000);
  assert.equal(sum(out.facts, 'B2B', 'units'), 10, 'tooling adds no units');
  const tool = out.facts.find((f) => f.revenue === 75000)!;
  assert.equal(tool.sku, undefined, 'tooling has no product');
  assert.ok(out.trace.some((x) => /1 tooling \/ development line\(s\) ₹75,000 counted as channel revenue/.test(x)));
  assert.ok(!out.trace.some((x) => /non-FG sale line/.test(x)), 'nothing left for Products to fix');
});

test('server sheet pull uses the same charge / tooling patterns as the file reader', () => {
  assert.equal(SERVER_CHARGE.source, TRANZACT_CHARGE_LINE.source);
  assert.equal(SERVER_TOOLING.source, TRANZACT_TOOLING_LINE.source);
  const rows = [H,
    ['OEM/26-27/0090', 'OEM Co', '2026-06-10', 'Sent', 'FG-0037', 'Pad', 10, 5000],
    ['OEM/26-27/0090', 'OEM Co', '2026-06-10', 'Sent', 'X1', 'Transportation charges', 1, 400],
    ['OEM/26-27/0091', 'OEM Co', '2026-06-10', 'Sent', 'TOOL-01', 'Mould development', 1, 9000],
  ];
  const r = tranzactSheetForMonth(rows, '2026-06');
  assert.equal(r.rowCount, 2);
  assert.ok(r.trace.some((t) => /1 charge \/ service line\(s\).*₹400 dropped/.test(t)));
});

test('server isoDay reads YYYY/MM/DD as that day', () => {
  assert.equal(isoDay('2026/06/06'), '2026-06-06');
  assert.equal(isoDay('2026.6.7'), '2026-06-07');
});

test('bracket negatives are Tranzact-only: other parsers keep their sign rules', () => {
  // The shared num() still strips brackets (unchanged behaviour for every other report); only the Tranzact reader negates.
  const out = run([H, ['OEM/26-27/0092', 'OEM Co', '2026-06-11', 'Sent', 'FG-0037', 'Pad', -1, '(500)']]);
  assert.equal(sum(out.facts, 'B2B', 'revenue'), -500);
});

test('products whose names contain service / delivery / loading / mould words stay products', () => {
  const products = ['Service kit', 'Delivery bag', 'Spare controller for service', 'Loading tray', 'Moulded housing', 'Packaging sleeve', 'Installation bracket'];
  for (const n of products) {
    assert.ok(!TRANZACT_CHARGE_LINE.test(n), `${n} is not a charge`);
    assert.ok(!TRANZACT_TOOLING_LINE.test(n), `${n} is not tooling`);
  }
  const out = run([H, ...products.map((n, i) => ['OEM/26-27/0095', 'OEM Co', '2026-06-10', 'Sent', `SP-${i}`, n, 2, 1000])]);
  assert.equal(sum(out.facts, 'B2B', 'revenue'), products.length * 1000);
  assert.equal(sum(out.facts, 'B2B', 'units'), products.length * 2);
  for (const t of ['Mould development', 'Mould charges', 'Tooling', 'Development charges']) assert.ok(TRANZACT_TOOLING_LINE.test(t), t);
});
