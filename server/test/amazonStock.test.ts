// Amazon stock valuation for the closing-stock task: month-end vs nearest earlier day, sellable + unsellable + in transit,
// SKUs folded per FG, valued at material + conversion, unmapped SKUs flagged, opening = previous month end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValuation, monthEnd, pickDate, prevMonth } from '../../client/src/data/stock/amazonStock.js';
import { CALENDAR_TASKS, CALENDAR_VERSION } from '../src/services/closeCalendar.js';

const r = (date: string, msku: string, disposition: string, units: number, inTransit = 0) => ({ date, msku, asin: 'B0', disposition, units, inTransit });

test('closing on the month end, opening on the previous month end; per FG at cost', () => {
  const rows = [
    r('2026-09-30', 'SKU-A', 'SELLABLE', 100), r('2026-10-31', 'SKU-A', 'SELLABLE', 80), r('2026-10-31', 'SKU-A2', 'SELLABLE', 20),
    r('2026-10-31', 'SKU-A', 'CUSTOMER_DAMAGED', 5, 3), r('2026-10-30', 'SKU-A', 'SELLABLE', 999), r('2026-10-31', 'SKU-X', 'SELLABLE', 7),
  ];
  const v = buildValuation('2026-10', rows, { 'SKU-A': 'FG-1', 'sku-a2': 'FG-1' }, [{ item: 'FG-1', name: 'Pad', material: 300, conversion: 50 }], '2026-10');
  assert.equal(v.closing.date, '2026-10-31');
  assert.equal(v.opening.date, '2026-09-30');
  const pad = v.closing.lines.find((l) => l.fg === 'FG-1')!;
  assert.equal(pad.sellable, 100);
  assert.equal(pad.unsellable, 5);
  assert.equal(pad.inTransit, 3);
  assert.equal(pad.units, 108);
  assert.equal(pad.unitCost, 350);
  assert.equal(pad.value, 108 * 350);
  assert.equal(v.closing.unvalued, 7, 'SKU-X has no FG');
  assert.equal(v.opening.value, 100 * 350);
  assert.ok(v.warnings.some((w) => /no cost/.test(w)));
});

test('a missing month-end day falls back to the newest earlier day of that month, warned', () => {
  assert.equal(pickDate(['2026-10-29', '2026-10-30', '2026-11-01'], '2026-10-31'), '2026-10-30');
  assert.equal(pickDate(['2026-11-01'], '2026-10-31'), null);
  const v = buildValuation('2026-10', [r('2026-10-30', 'S', 'SELLABLE', 1)], {}, [], null);
  assert.equal(v.closing.exact, false);
  assert.ok(v.warnings.some((w) => /Closing uses 2026-10-30/.test(w)));
  assert.ok(v.warnings.some((w) => /opening is blank/.test(w)));
  assert.equal(monthEnd('2026-02'), '2026-02-28');
  assert.equal(prevMonth('2026-01'), '2025-12');
});

test('calendar v2: closing-stock task carries the live panel; the 10th task is the no-API uploads + lock', () => {
  assert.ok(CALENDAR_VERSION >= 2);
  const stock = CALENDAR_TASKS.find((t) => t.id === 'cal-m02-stock')!;
  assert.equal(stock.live, 'amazon-stock');
  assert.equal(stock.arrears, true);
  const mis = CALENDAR_TASKS.find((t) => t.id === 'cal-m10-mis')!;
  assert.ok(mis.checklist!.some((c) => c.id === 'lock'));
  assert.ok(!/Update all reports/.test(mis.title!));
});

test('Tranzact reconciliation rows: SELLABLE per FG at the master default price; suffixed MSKUs still map', async () => {
  const { tranzactRows } = await import('../../client/src/data/stock/amazonStock.js');
  const v = buildValuation('2026-10', [r('2026-10-31', 'VW-H1GL-KTOZ- hcore Knee', 'SELLABLE', 12), r('2026-10-31', 'VW-H1GL-KTOZ', 'DEFECTIVE', 2), r('2026-10-31', 'ZZ-0000-0000', 'SELLABLE', 1)],
    { 'VW-H1GL-KTOZ': 'FG-0006' }, [], null);
  const t = tranzactRows(v.closing, { 'FG-0006': { itemName: 'Knee', unit: 'PCS', defaultPrice: 410 } });
  assert.deepEqual(t.rows.map((x) => [x.itemId, x.physicalStock, x.price]), [['FG-0006', 12, 410]]);
  assert.deepEqual(t.missing, ['ZZ-0000-0000']);
});
