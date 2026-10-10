// ----------------------------------------------------------------------------
// Dry-run the D2C cost-stack adapters and the COG → COGM model.
//
//   npx tsx scripts/check-d2c-adapters.ts
//
// These adapters were written from documented export formats, not from real
// Heatronics files, so this script does the one thing that can be checked
// without them: that each adapter CLAIMS the right file, finds its columns, and
// gets the arithmetic and the sign conventions right on input shaped like the
// real thing.
//
// It is deliberately not a substitute for a real file. The two worst bugs this
// codebase has had — Amazon printing a positive quantity on refunds (22% too
// many units) and Shiprocket's COD top-ups read as freight (74% too little) —
// were both invisible to synthetic input, because the fixture author and the
// adapter author made the same assumption. What this catches is everything
// below that: header detection, aliasing, bucketing, allocation, reconciliation.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { ADAPTERS, claimAdapter } from '../client/src/data/monthClose/adapterRegistry';
import { buildUnitCostModel, conversionTotal, reconcileToBooks } from '../client/src/data/monthClose/costModel';
import type { AdapterResult } from '../client/src/data/monthClose/adapters';
import type { ConversionCost, SourceKind } from '../client/src/data/monthClose/schema';

let failures = 0;
let checks = 0;

function check(label: string, got: unknown, want: unknown) {
  checks += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures += 1;
    console.log(`   ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else {
    console.log(`   ✓ ${label}: ${JSON.stringify(got)}`);
  }
}

function near(label: string, got: number, want: number, tol = 0.01) {
  checks += 1;
  if (Math.abs(got - want) > tol) {
    failures += 1;
    console.log(`   ✗ ${label}: got ${got}, want ${want} (±${tol})`);
  } else {
    console.log(`   ✓ ${label}: ${got}`);
  }
}

function book(sheetName: string, aoa: unknown[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return wb;
}

/** Run a file through the registry exactly as the dashboard would. */
function run(name: string, wb: XLSX.WorkBook, expectKind: SourceKind): AdapterResult {
  const claim = claimAdapter(wb, name);
  checks += 1;
  if (!claim) {
    failures += 1;
    console.log(`   ✗ nothing claimed "${name}" (expected ${expectKind})`);
    const adapter = ADAPTERS.find((a) => a.kind === expectKind)!;
    return adapter.parse({ file: { name } as File, sourceId: 's', workbook: wb });
  }
  if (claim.adapter.kind !== expectKind) {
    failures += 1;
    console.log(
      `   ✗ "${name}" claimed by ${claim.adapter.kind} @${claim.confidence.toFixed(2)}, expected ${expectKind}`,
    );
  } else {
    console.log(`   ✓ claimed by ${claim.adapter.kind} @${claim.confidence.toFixed(2)}`);
  }
  const adapter = ADAPTERS.find((a) => a.kind === expectKind)!;
  return adapter.parse({ file: { name } as File, sourceId: 's', workbook: wb });
}

const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;

// ---- 1. Flipkart ------------------------------------------------------------

console.log('\n1. Flipkart settlement');
{
  const wb = book('Settlement', [
    ['Flipkart Settlement Report', null, null, null, null, null, null],
    [],
    [
      'Order Item ID',
      'SKU',
      'Product Title',
      'Event Sub Type',
      'Quantity',
      'Final Settlement Amount',
      'Commission',
      'Shipping Fee',
      'Reverse Shipping Fee',
      'Collection Fee',
    ],
    ['OI1', 'HTR-KNEE-01', 'hCore Knee Pad', 'Sale', 2, 2400, -240, -90, 0, -30],
    ['OI2', 'HTR-NECK-01', 'hCore Neck Pad', 'Sale', 1, 1500, -150, -45, 0, -20],
    // A return: Flipkart prints quantity POSITIVE, money negative.
    ['OI3', 'HTR-KNEE-01', 'hCore Knee Pad', 'Return', 1, -1200, 120, 0, -60, 15],
  ]);
  const r = run('flipkart_settlement_jul.xlsx', wb, 'flipkartSettlement');
  const rows = r.skuRows ?? [];
  check('rows', rows.length, 3);
  check('net revenue', sum(rows.map((x) => x.revenue)), 2700);
  // 2 + 1 sold, 1 returned -> net 2. Signed off money, not off the qty column.
  check('net units', sum(rows.map((x) => x.units)), 2);
  check('return units', sum(rows.map((x) => x.returnUnits ?? 0)), 1);
  check('commission is a positive cost', rows[0].costs?.commission, 240);
  check('reverse shipping split out', rows[2].costs?.shippingReturn, 60);
  check('fees = sum of costs', rows[0].fees, sum(Object.values(rows[0].costs ?? {})));
  check('cross-check present', (r.crossChecks ?? []).length, 1);
}

// ---- 2. Shiprocket orders (RTO) --------------------------------------------

console.log('\n2. Shiprocket orders — RTO');
{
  const wb = book('Orders', [
    ['Channel Order Id', 'AWB', 'Status', 'SKU', 'Product Name', 'Quantity', 'Freight Charges', 'COD Charges'],
    ['#1001', 'AWB1', 'Delivered', 'HTR-KNEE-01', 'hCore Knee', 1, 70, 0],
    ['#1002', 'AWB2', 'RTO Delivered', 'HTR-KNEE-01', 'hCore Knee', 1, 70, 0],
    ['#1003', 'AWB3', 'Delivered', 'HTR-NECK-01', 'hCore Neck', 2, 85, 25],
    ['#1004', 'AWB4', 'RTO In Transit', 'HTR-NECK-01', 'hCore Neck', 1, 85, 0],
  ]);
  const r = run('shiprocket_orders_jul.xlsx', wb, 'shiprocketOrders');
  const rows = r.skuRows ?? [];
  check('rows', rows.length, 4);
  check('revenue stays 0 (Shopify owns D2C revenue)', sum(rows.map((x) => x.revenue)), 0);
  check('RTO units', sum(rows.map((x) => x.returnUnits ?? 0)), 2);
  // RTO pays both legs: 70 forward + 70 back.
  check('RTO row charges both legs', rows[1].costs?.shippingForward! + rows[1].costs?.shippingReturn!, 140);
  check('delivered row charges one leg', rows[0].costs?.shippingReturn, undefined);
  const rate = (r.crossChecks ?? []).find((c) => c.label === 'RTO rate');
  // 2 RTO units of 5 shipped.
  near('RTO rate %', rate?.amount ?? 0, 40);
  near('RTO freight both legs', (r.crossChecks ?? []).find((c) => c.label?.includes('RTO freight'))?.amount ?? 0, 310);
}

console.log('\n2b. Shiprocket passbook must still win over the orders adapter');
{
  const wb = book('Passbook', [
    ['Created At', 'Channel Order Id', 'AWB Code', 'Amount', 'Description'],
    ['01-07-2026', '#1001', 'AWB1', -70, 'Freight charges applied'],
    ['02-07-2026', '#1002', '', 1200, 'Freight charges deducted against COD'],
  ]);
  const claim = claimAdapter(wb, 'passbook.csv');
  check('passbook claimed by freight adapter', claim?.adapter.kind, 'shiprocketFreight');
}

// ---- 3. Easebuzz ------------------------------------------------------------

console.log('\n3. Easebuzz settlement');
{
  const wb = book('Transactions', [
    ['txnid', 'Amount', 'Service Charge', 'GST', 'Net Amount', 'Status', 'Payment Mode'],
    ['T1', 2000, 36, 6.48, 1957.52, 'success', 'UPI'],
    ['T2', 1500, 27, 4.86, 1468.14, 'success', 'COD'],
    ['T3', 900, 0, 0, 0, 'failed', 'Card'],
  ]);
  const r = run('easebuzz_settlement_jul.csv', wb, 'easebuzzSettlement');
  const gmv = (r.crossChecks ?? []).find((c) => c.label === 'Easebuzz GMV');
  const mdr = (r.crossChecks ?? []).find((c) => c.label === 'Easebuzz MDR');
  const cod = (r.crossChecks ?? []).find((c) => c.label?.includes('COD share'));
  near('GMV excludes the failed txn', gmv?.amount ?? 0, 3500);
  near('MDR = charges + GST', mdr?.amount ?? 0, 74.34);
  near('COD share %', cod?.amount ?? 0, 42.86, 0.02);
  check('no SKU rows (a gateway charges a basket)', (r.skuRows ?? []).length, 0);
}

// ---- 4. Snapmint -----------------------------------------------------------

console.log('\n4. Snapmint settlement');
{
  const wb = book('Settlement', [
    ['Order ID', 'Product Name', 'Order Amount', 'Subvention Amount', 'Processing Fee', 'Net Payable', 'Status'],
    ['S1', 'hCore Bed Solo', 6000, 540, 60, 5400, 'Confirmed'],
    ['S2', 'hCore X-L', 4000, 360, 40, 3600, 'Confirmed'],
    ['S3', 'hCore Knee', 1200, 0, 0, 0, 'Cancelled'],
  ]);
  const r = run('snapmint_settlement_jul.xlsx', wb, 'snapmintSettlement');
  const rows = r.skuRows ?? [];
  check('rows (cancelled dropped)', rows.length, 2);
  check('subvention is a finance cost', rows[0].costs?.financeCost, 540);
  check('revenue 0 (Shopify booked it)', sum(rows.map((x) => x.revenue)), 0);
  near('GMV', (r.crossChecks ?? []).find((c) => c.label === 'Snapmint GMV')?.amount ?? 0, 10000);
  near('subvention total', (r.crossChecks ?? []).find((c) => c.label === 'Snapmint subvention')?.amount ?? 0, 900);
}

// ---- 5. Delhivery warranty -------------------------------------------------

console.log('\n5. Delhivery warranty');
{
  const wb = book('Waybills', [
    ['Waybill', 'Reference No', 'Shipment Type', 'Status', 'SKU', 'Product', 'Quantity', 'Freight Charges'],
    ['W1', 'R1', 'Reverse', 'Delivered', 'HTR-KNEE-01', 'hCore Knee', 1, 120],
    ['W2', 'R2', 'Replacement', 'In Transit', 'HTR-KNEE-01', 'hCore Knee', 1, 95],
    // A forward sale in the same export must NOT be counted as warranty.
    ['W3', 'R3', 'Forward', 'Delivered', 'HTR-NECK-01', 'hCore Neck', 1, 80],
  ]);
  const r = run('delhivery_waybills_jul.xlsx', wb, 'delhiveryWarranty');
  const rows = r.skuRows ?? [];
  check('only warranty legs become rows', rows.length, 2);
  near('warranty freight', (r.crossChecks ?? [])[0]?.amount ?? 0, 215);
  check('forward leg excluded', rows.every((x) => x.name !== 'hCore Neck'), true);
  check('warranty cost key', rows[0].costs?.warranty, 120);
}

// ---- 6. Conversion cost ----------------------------------------------------

console.log('\n6. Conversion cost (rent / labour / direct mfg)');
{
  const wb = book('Group Summary', [
    ['Factory Overheads', null],
    ['Factory Rent', 180000],
    ['Wages - Production', 240000],
    ['Job Work Charges', 95000],
    ['Power & Fuel', 42000],
    ['Security Charges', 18000],
    ['Total', 575000],
  ]);
  const r = run('tally_factory_overheads_jul.xlsx', wb, 'conversionCost');
  const c = r.conversion!;
  checks += 1;
  if (!c) {
    failures += 1;
    console.log('   ✗ no conversion cost returned');
  } else {
    near('rent', c.rent, 180000);
    near('labour', c.labour, 240000);
    near('direct manufacturing (job work + power)', c.directManufacturing, 137000);
    near('other (security)', c.other, 18000);
    // The grand total must not be added to its own children.
    near('total excludes the Total row', conversionTotal(c), 575000);
  }
}

// ---- 7. The COG → COGM model ----------------------------------------------

console.log('\n7. COG → COGM allocation');
{
  const conversion: ConversionCost = {
    rent: 180000,
    labour: 240000,
    directManufacturing: 137000,
    other: 18000,
    provenance: { sourceId: 's', sourceLabel: 'f', method: 'xlsx', confidence: 'exact', verified: true },
  };
  // 1000 knee at ₹263 material, 200 bed at ₹697 material.
  const cogByFg = { 'FG-KNEE': 263, 'FG-BED': 697 };
  const unitsByFg = { 'FG-KNEE': 1000, 'FG-BED': 200 };

  const m = buildUnitCostModel({ cogByFg, unitsByFg, conversion, basis: 'cogValue' });
  near('conversion allocated in full', m.conversionAllocated, 575000);
  check('units absorbing', m.unitsAbsorbing, 1200);
  // Material value: knee 1000x263 = 263,000, bed 200x697 = 139,400 -> 402,400.
  // Knee share  = 263000/402400 * 575000 = 375,807.65 over 1000 units.
  // Bed share   = 139400/402400 * 575000 = 199,192.35 over 200 units.
  near('knee conversion/unit', m.byFg['FG-KNEE'].conversionPerUnit, 375.81, 0.02);
  near('bed conversion/unit', m.byFg['FG-BED'].conversionPerUnit, 995.96, 0.02);
  near('knee COGM', m.byFg['FG-KNEE'].cogm, 638.81, 0.02);
  // Nothing may be lost or invented in the spread. Per-unit figures are rounded
  // to paise, so re-multiplying drifts a couple of rupees on 5.75 lakh — the
  // tolerance is that rounding, not slack in the allocation.
  near(
    'allocation foots',
    m.byFg['FG-KNEE'].conversionPerUnit * 1000 + m.byFg['FG-BED'].conversionPerUnit * 200,
    575000,
    5,
  );

  const u = buildUnitCostModel({ cogByFg, unitsByFg, conversion, basis: 'unit' });
  near('per-unit basis spreads evenly', u.byFg['FG-KNEE'].conversionPerUnit, 479.17, 0.02);
  check('per-unit basis is flat across products', u.byFg['FG-KNEE'].conversionPerUnit, u.byFg['FG-BED'].conversionPerUnit);

  const none = buildUnitCostModel({ cogByFg, unitsByFg, conversion: null });
  near('no conversion file -> COGM = COG', none.byFg['FG-KNEE'].cogm, 263);
  check('and it says so', none.warnings.some((w) => w.includes('too high')), true);

  const gap = buildUnitCostModel({
    cogByFg: { 'FG-KNEE': 263 },
    unitsByFg: { 'FG-KNEE': 1000, 'FG-MYSTERY': 50 },
    conversion,
  });
  check('uncosted product is flagged', gap.warnings.some((w) => w.includes('FG-MYSTERY')), true);
  near('and absorbs nothing', gap.unitsAbsorbing, 1000);
}

// ---- 8. Reconciliation to the books ---------------------------------------

console.log('\n8. Reconcile to Tally — the Jul-2026 gap');
{
  // The real numbers: SKU layer said 19.92 L of product cost, Tally booked
  // 28.26 L of COGM. 4.45 L of that is stock movement, 3.96 L factory overhead.
  const rec = reconcileToBooks(1992044, 2826000, [
    { label: 'Stock movement (opening − closing)', amount: 445433, note: 'Units sold were not all made this month.' },
    { label: 'Factory overheads now in COGM', amount: 395615, note: 'Rent, labour and direct manufacturing.' },
  ]);
  near('gap', rec.gap, 833956);
  near('gap %', rec.gapPct, 29.51, 0.02);
  check('largest cause first', rec.causes[0].label, 'Stock movement (opening − closing)');
  // 445433 + 395615 = 841048 vs a gap of 833956 -> over-explained by 7092.
  check('residual is surfaced', rec.causes.some((c) => c.label === 'Unexplained'), true);
  near('residual', rec.causes.find((c) => c.label === 'Unexplained')?.amount ?? 0, -7092);
  check('not marked explained while a residual stands', rec.explained, false);

  const clean = reconcileToBooks(1000000, 1100000, [{ label: 'Stock movement', amount: 100000, note: '' }]);
  check('fully attributed reconciles', clean.explained, true);
  check('and carries no Unexplained row', clean.causes.length, 1);
}

// ---- 9. Nothing may steal another adapter's file --------------------------

console.log('\n9. Adapters do not steal each other’s files');
{
  const tally = book('P&L', [
    ['Particulars', 'Amount'],
    ['Sales Accounts', -4877000],
    ['Factory Overheads', 395615],
    ['Nett Loss', 351328],
  ]);
  const claim = claimAdapter(tally, 'tally_pnl_jul.xlsx');
  check('Tally P&L not taken by conversionCost', claim?.adapter.kind !== 'conversionCost', true);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks`);
if (failures > 0) process.exit(1);
