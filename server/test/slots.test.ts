// Slot mappers: API answer → the facts the upload parser gives. No network.
// Where possible each mapper is checked against the REAL client parser run over
// an upload-shaped sheet built from the same synthetic data (equivalence), so
// the close maths can't drift between an API pull and a file.
// Run: npm test (node --test via tsx).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { UPLOAD_PARSERS } from '../../client/src/data/liveMis/uploadParsers.ts';
import type { DailyFact } from '../src/connectors/facts.js';
import { financesToFacts } from '../src/connectors/slots/map/amazonFinances.js';
import { amazonAdsProductFacts, googleCampaignFacts, googleProductFacts, metaProductFacts } from '../src/connectors/slots/map/ads.js';
import { easebuzzHashInput, easebuzzPayoutFacts, tranzactSheetForMonth } from '../src/connectors/slots/map/feeds.js';
import { SR_KIND_LABEL, shiprocketChargeFacts, shiprocketChargeLines, srDay } from '../src/connectors/slots/map/shiprocket.js';
import { isoDay, rangeEnd } from '../src/connectors/slots/map/common.js';
import { SLOT_SOURCES } from '../src/connectors/slots/catalog.js';
import { productionBomCosts, salesTrafficRows } from '../src/connectors/slots/map/costs.js';
import { assertProductionReadOnly, costsUrl } from '../src/connectors/sources/production.js';
import { assertSpapiPostAllowed } from '../src/connectors/sources/amazon.js';
import { assertShiprocketReadOnly } from '../src/connectors/sources/shiprocket.js';
import { assertEasebuzzReadOnly } from '../src/connectors/sources/easebuzz.js';
import { assertSheetsReadOnly } from '../src/connectors/sources/sheets.js';
import { assertDelhiveryReadOnly, computedFreight, feedOrigin, retryAfterMs } from '../src/connectors/sources/delhivery.js';
import { chargeAmount, chargePlan, delhiveryFreightFacts, gramsOf, istDay, trackSummary, type WarrantyFeedRow } from '../src/connectors/slots/map/delhivery.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Run a client upload parser over an array-of-arrays sheet (or several named sheets). */
function parse(parserId: string, sheets: Record<string, unknown[][]>) {
  const p = UPLOAD_PARSERS.find((x) => x.sourceId === parserId);
  assert.ok(p, `parser ${parserId}`);
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return p!.parse(wb);
}

/** Facts in a stable order with inert all-zero facts dropped. */
const norm = (fs: DailyFact[]) =>
  fs
    .filter((f) => f.revenue || f.fees || f.units || f.orders || f.spend)
    .map((f) => ({ ...f }))
    .sort((a, b) => `${a.date}|${a.channel}|${a.sku ?? ''}`.localeCompare(`${b.date}|${b.channel}|${b.sku ?? ''}`));

// ---- Amazon Finances ≡ Unified Transaction parser -----------------------------

const money = (n: number) => ({ CurrencyCode: 'INR', CurrencyAmount: n });

const FIN_EVENTS = {
  ShipmentEventList: [
    { AmazonOrderId: '402-1', PostedDate: '2026-10-05T10:00:00Z', ShipmentItemList: [{
      SellerSKU: 'AB-1234-5678 Neck Pad', QuantityShipped: 2,
      ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(2000) }, { ChargeType: 'Tax', ChargeAmount: money(360) }, { ChargeType: 'ShippingCharge', ChargeAmount: money(50) }],
      ItemFeeList: [{ FeeType: 'Commission', FeeAmount: money(-200) }, { FeeType: 'FixedClosingFee', FeeAmount: money(-40) }, { FeeType: 'FBAPerUnitFulfillmentFee', FeeAmount: money(-80) }],
      ItemTaxWithheldList: [{ TaxesWithheld: [{ ChargeType: 'TCS-IGST', ChargeAmount: money(-20) }] }],
      PromotionList: [{ PromotionType: 'PromotionMetaDataDefinitionValue', PromotionAmount: money(-100) }],
    }] },
    { AmazonOrderId: '402-2', PostedDate: '2026-10-05T12:00:00Z', ShipmentItemList: [{
      SellerSKU: 'AB-1234-5678-FBM', QuantityShipped: 1,
      ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(1000) }],
      ItemFeeList: [{ FeeType: 'Commission', FeeAmount: money(-120) }],
    }] },
  ],
  RefundEventList: [
    { AmazonOrderId: '402-1', PostedDate: '2026-10-07T08:00:00Z', ShipmentItemAdjustmentList: [{
      SellerSKU: 'AB-1234-5678 Neck Pad', QuantityShipped: 1,
      ItemChargeAdjustmentList: [{ ChargeType: 'Principal', ChargeAmount: money(-1000) }],
      ItemFeeAdjustmentList: [{ FeeType: 'Commission', FeeAmount: money(100) }],
    }] },
  ],
  ServiceFeeEventList: [{ FeeDescription: 'FBA storage fee', FeeList: [{ FeeType: 'FBAStorageFee', FeeAmount: money(-500) }] }],
  ProductAdsPaymentEventList: [{ postedDate: '2026-10-10T00:00:00Z', transactionType: 'Charge', transactionValue: money(-3000) }],
  AdhocDisbursementEventList: [{ PostedDate: '2026-10-12T00:00:00Z', TransactionType: 'Disbursed', TransactionAmount: money(-50000) }],
  AdjustmentEventList: [{ PostedDate: '2026-10-08T00:00:00Z', AdjustmentType: 'WAREHOUSE_DAMAGE', AdjustmentItemList: [{ SellerSKU: 'AB-1234-5678', Quantity: 1, TotalAmount: money(500) }] }],
};

const UT_HEADER = ['date/time', 'settlement id', 'type', 'order id', 'sku', 'description', 'quantity', 'product sales', 'shipping credits', 'gift wrap credits', 'promotional rebates', 'selling fees', 'fba fees', 'other transaction fees', 'other', 'total'];
const UT_ROWS: unknown[][] = [
  ['Includes Amazon Marketplace, Fulfillment by Amazon (FBA), and Amazon Webstore transactions'],
  [],
  UT_HEADER,
  ['5 Oct 2026 10:00:00 am UTC', '1', 'Order', '402-1', 'AB-1234-5678 Neck Pad', 'Neck pad', 2, 2000, 50, 0, -100, -240, -80, 0, 0, 1630],
  ['5 Oct 2026 12:00:00 pm UTC', '1', 'Order', '402-2', 'AB-1234-5678-FBM', 'Neck pad', 1, 1000, 0, 0, 0, -120, 0, 0, 0, 880],
  ['7 Oct 2026 8:00:00 am UTC', '1', 'Refund', '402-1', 'AB-1234-5678 Neck Pad', 'Neck pad', 1, -1000, 0, 0, 0, 100, 0, 0, 0, -900],
  ['7 Oct 2026 11:59:00 pm UTC', '1', 'Service Fee', '', '', 'FBA storage fee', '', 0, 0, 0, 0, 0, 0, 0, 0, -500],
  ['8 Oct 2026 12:00:00 am UTC', '1', 'Adjustment', '', 'AB-1234-5678', 'FBA Inventory Reimbursement', 1, 0, 0, 0, 0, 0, 0, 0, 500, 500],
  ['10 Oct 2026 12:00:00 am UTC', '1', 'Service Fee', '', '', 'Cost of Advertising', '', 0, 0, 0, 0, 0, 0, 0, 0, -3000],
  ['12 Oct 2026 12:00:00 am UTC', '1', 'Transfer', '', '', 'To account ending with: 123', '', 0, 0, 0, 0, 0, 0, 0, 0, -50000],
];

test('Amazon Finances events ≡ Unified Transaction upload', () => {
  const api = financesToFacts([{ events: FIN_EVENTS, fallbackDate: '2026-10-07' }], '2026-10');
  const file = parse('amazon', { Sheet1: UT_ROWS });
  assert.deepEqual(norm(api.facts!), norm(file.facts));
  const sku = api.facts!.filter((f) => f.sku === 'AB-1234-5678');
  assert.equal(sku.find((f) => f.date === '2026-10-05')!.revenue, 2950); // 2000 + 50 − 100 + 1000 (FBA + FBM merged)
  assert.equal(sku.find((f) => f.date === '2026-10-05')!.units, 3);
  assert.equal(sku.find((f) => f.date === '2026-10-05')!.orders, 2);
  assert.equal(api.facts!.find((f) => f.date === '2026-10-10')!.spend, 3000);
  assert.ok(!api.facts!.some((f) => f.date === '2026-10-12'), 'transfer excluded');
});

test('Amazon Finances: events outside the month are left out with a warning; empty month is ok', () => {
  const r = financesToFacts([{ events: { ShipmentEventList: [{ PostedDate: '2026-11-01T00:00:00Z', ShipmentItemList: [{ SellerSKU: 'X', ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money(1) }] }] }] }, fallbackDate: '2026-10-31' }], '2026-10');
  assert.equal(r.facts!.length, 0);
  assert.match(r.warnings[0], /outside 2026-10/);
  assert.equal(financesToFacts([{ events: {}, fallbackDate: '2026-10-31' }], '2026-10').emptyOk, true);
});

// ---- Amazon Ads ≡ Advertised Product report --------------------------------------

test('Amazon Ads spAdvertisedProduct ≡ Advertised Product upload', () => {
  const api = amazonAdsProductFacts(
    [
      { date: '2026-10-01', advertisedSku: 'AB-1234-5678 Neck Pad', cost: 120.5 },
      { date: '2026-10-02', advertisedSku: 'AB-1234-5678-FBM', cost: 79.5 },
      { date: '2026-10-02', advertisedSku: 'CD-0000-1111', cost: 0 },
      { date: '2026-10-03', advertisedSku: 'EF-2222-3333', cost: 50 },
    ],
    { SB: 300, SD: 25 },
    '2026-10',
  );
  const file = parse('amazonads', { Sheet1: [
    ['Month', 'Date range', 'Campaign name', 'Advertised product SKU', 'Total cost'],
    ['2026-10', 'Oct 1, 2026 - Oct 31, 2026', 'SP auto', 'AB-1234-5678 Neck Pad', 120.5],
    ['2026-10', 'Oct 1, 2026 - Oct 31, 2026', 'SP auto', 'AB-1234-5678-FBM', 79.5],
    ['2026-10', 'Oct 1, 2026 - Oct 31, 2026', 'SP manual', 'EF-2222-3333', 50],
    ['2026-10', 'Oct 1, 2026 - Oct 31, 2026', 'SB brand', '', 300],
    ['2026-10', 'Oct 1, 2026 - Oct 31, 2026', 'SD retarget', '', 25],
  ] });
  assert.deepEqual(norm(api.facts!), norm(file.facts));
  assert.equal(api.facts!.find((f) => f.sku === 'AB-1234-5678')!.spend, 200);
});

// ---- Meta ≡ campaign × ad set × product export -----------------------------------

test('Meta ad × product_id insights ≡ Meta product export (with residual)', () => {
  const api = metaProductFacts(
    [
      { product_id: '48268188418262, Neck Heating Pad', spend: '1000.50' },
      { product_id: '48268188418262, Neck Heating Pad', spend: '499.50' },
      { product_id: '48268187533526, Knee Pad', spend: '700' },
      { product_id: 'unknown', spend: '10' },
    ],
    2600,
    '2026-10',
  );
  const file = parse('meta', { Sheet1: [
    ['Campaign name', 'Ad set name', 'Product ID', 'Amount spent (INR)', 'Reporting starts', 'Reporting ends'],
    ['', '', '', 2600, '2026-10-01', '2026-10-31'],
    ['Catalog', '', '', 2200, '2026-10-01', '2026-10-31'],
    ['Catalog', 'Broad', '48268188418262, Neck Heating Pad', 1500, '2026-10-01', '2026-10-31'],
    ['Catalog', 'Broad', '48268187533526, Knee Pad', 700, '2026-10-01', '2026-10-31'],
  ] });
  assert.deepEqual(norm(api.facts!), norm(file.facts));
  assert.equal(api.facts!.find((f) => !f.sku)!.spend, 400);
});

// ---- Google Ads ≡ campaign + shopping-products exports ----------------------------

test('Google Ads campaign + shopping products ≡ uploads', () => {
  const end = '2026-10-31';
  const camp = googleCampaignFacts([
    { campaign: { name: 'Search' }, metrics: { costMicros: '1500000000' } },
    { campaign: { name: 'PMax' }, metrics: { costMicros: 2500500000 } },
  ], end);
  const campFile = parse('googleads', { Sheet1: [
    ['Campaign report'], ['October 1, 2026 - October 31, 2026'],
    ['Campaign', 'Campaign status', 'Cost'],
    ['Search', 'Enabled', 1500], ['PMax', 'Enabled', 4000.5 - 1500],
    ['Total: Account', '', 4000.5],
  ] });
  assert.deepEqual(norm(camp.facts!), norm(campFile.facts));

  const prod = googleProductFacts([
    { segments: { productItemId: 'shopify_in_9355519066326_48268187533526', productTitle: 'Knee Pad' }, metrics: { costMicros: '300000000' } },
    { segments: { productItemId: 'shopify_in_9355519066326_48268187533526', productTitle: 'Knee Pad' }, metrics: { costMicros: '200000000' } },
    { segments: { productItemId: 'shopify_in_1_2' }, metrics: { costMicros: '0' } },
  ], end);
  assert.deepEqual(prod.facts!.map((f) => [f.source, f.sku, f.spend, f.date]), [['googleadsproducts', '48268187533526', 500, end]]);
});

// ---- Shiprocket shipment charges ≡ passbook upload ---------------------------------

const SR_ORDERS = [
  { id: 1, channel_order_id: '1001-D2C', awb_data: { charges: { freight_charges: '85.50', cod_charges: 35 } },
    shipments: [{ id: 11, awb: 'A1', status_code: 7, awb_assign_date: '2026-10-03 10:00:00', pickedup_timestamp: '2026-10-03 18:00:00' }] },
  { id: 2, channel_order_id: '1003-AMZ', awb_data: { charges: { freight_charges: 60 } },
    shipments: [{ id: 21, awb: 'A3', status_code: 6, awb_assign_date: '04 Oct 2026, 09:00 AM' }] },
  { id: 3, channel_order_id: '1004', awb_data: { charges: { freight_charges: 70, charged_weight_amount_rto: 70 } },
    shipments: [{ id: 31, awb: 'A4', status_code: 10, awb_assign_date: '2026-09-28 12:00:00', rto_initiated_date: '2026-10-06 08:00:00' }] },
  { id: 4, channel_order_id: '1005', awb_data: { charges: { freight_charges: 50 } }, shipments: [{ id: 41, awb: 'A5', status_code: 8 }] },
  { id: 5, channel_order_id: '1006', shipments: [{ id: 51, awb: '' }] },
  { id: 6, channel_order_id: '1007', awb_data: { charges: { freight_charges: 40 } },
    shipments: [{ id: 61, awb: 'A7', status_code: 6, awb_assign_date: '2026-10-31T20:00:00Z' }] },
  { id: 1, channel_order_id: '1001-D2C', awb_data: { charges: { freight_charges: '85.50', cod_charges: 35 } }, shipments: [{ id: 11, awb: 'A1' }] },
];

const pbDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-');
  return `${d}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]}-${y} 10:00:00`;
};

test('Shiprocket shipment charges ≡ passbook upload', () => {
  const { lines, counts } = shiprocketChargeLines(SR_ORDERS);
  assert.equal(counts.orders, 6, 'repeated order on a page boundary is counted once');
  assert.equal(counts.cancelled, 1);
  assert.equal(counts.noAwb, 1);
  const api = shiprocketChargeFacts(lines, '2026-10', counts);
  // The passbook export of October holds the same debits as negative Amounts, plus money-in lines.
  const file = parse('shiprocket', { Sheet1: [
    ['Created At', 'Channel Order Id', 'AWB Code', 'Amount', 'Description'],
    ...lines.filter((l) => l.date.startsWith('2026-10')).map((l) => [pbDate(l.date), l.channelOrderId, l.awb, -l.amount, SR_KIND_LABEL[l.kind]]),
    ['05-Oct-2026 09:00:00', '', '', 5000, 'Wallet recharge'],
    ['05-Oct-2026 09:00:00', '1004', 'A4', -100, 'Freight Charges deducted against COD'],
  ] });
  assert.deepEqual(norm(api.facts!), norm(file.facts));
  assert.equal(api.facts!.find((f) => f.date === '2026-10-03')!.fees, 120.5);
  assert.equal(api.facts!.find((f) => f.date === '2026-10-04')!.channel, 'Amazon');
  assert.equal(api.facts!.find((f) => f.date === '2026-10-06')!.fees, 70, 'RTO freight on the RTO day; its forward freight was September');
  assert.ok(!api.facts!.some((f) => f.date === '2026-11-01' || f.date.startsWith('2026-09')));
  assert.match(api.trace.join(' '), /1 cancelled before pickup/);
  assert.match(api.trace.join(' '), /other months left out/);
  assert.equal(shiprocketChargeFacts([], '2026-10').emptyOk, true);
  assert.equal(srDay('2026-10-31T20:00:00Z'), '2026-11-01');
  assert.equal(srDay('2026-10-31 23:30:00'), '2026-10-31');
  assert.equal(srDay('03 Oct 2026, 02:22 PM'), '2026-10-03');
  assert.equal(srDay('0000-00-00 00:00:00'), '');
});

// ---- Easebuzz payouts ≡ Settlement History upload ----------------------------------

test('Easebuzz payouts ≡ Settlement History upload; hash input order', () => {
  const api = easebuzzPayoutFacts([
    { payout_id: 'P1', payout_actual_date: '2026-10-02 10:00:00', service_charge: '120.00', service_tax: '21.60', settlement_amount: '9858.40' },
    { payout_id: 'P2', payout_actual_date: '2026-10-02 18:00:00', service_charge: 30, service_tax: 5.4, express_service_charge: 10, express_service_tax: 1.8 },
    { payout_id: 'P3', payout_actual_date: '05-10-2026', service_charge: 50, service_tax: 9 },
  ], '2026-10');
  const file = parse('easebuzz', { Sheet1: [
    ['Settlement Id', 'Settlement Date', 'Total Amount', 'Service Charge', 'GST', 'Express Service Charge', 'Express Service Tax'],
    ['P1', '2026-10-02', 10000, 120, 21.6, 0, 0],
    ['P2', '2026-10-02', 1000, 30, 5.4, 10, 1.8],
    ['P3', '2026-10-05', 1000, 50, 9, 0, 0],
    ['Total Settlements', '', 12000, '', '', '', ''],
  ] });
  assert.deepEqual(norm(api.facts!), norm(file.facts));
  assert.equal(easebuzzHashInput(['KEY', '01-10-2026', '31-10-2026'], 'SALT'), 'KEY|01-10-2026|31-10-2026|SALT');
});

// ---- Tranzact daily sheet → the Tranzact parser ------------------------------------

const TZ_HEADER = ['Invoice Number', 'Document Date', 'Customer Name', 'Item ID', 'Item Description', 'Invoice Quantity', 'Item Value - Before Tax (INR)', 'Item Value - After Tax (INR)'];
const serial = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

test('Tranzact sheet: empty sheet says "No data in the sheet yet"', () => {
  const r = tranzactSheetForMonth([], '2026-10');
  assert.equal(r.rowCount, 0);
  assert.equal(r.emptyOk, undefined);
  assert.match(r.warnings[0], /No data in the sheet yet/);
  assert.match(tranzactSheetForMonth([[''], []], '2026-10').warnings[0], /No data in the sheet yet/);
  assert.match(tranzactSheetForMonth([['Something else'], ['a', 'b']], '2026-10').warnings[0], /does not look like/);
});

test('Tranzact sheet rows (Excel-export shape) → month filter → the real Tranzact parser', () => {
  const rows: unknown[][] = [
    ['Sales Invoice Register (Item-wise)'],
    ['Generated on 02-11-2026'],
    TZ_HEADER,
    ['OEM/26-27/001', serial('2026-10-03'), 'Frido', 'FG-0001', 'Heating pad', 10, 5000, 5900],
    ['GTD/26-27/014', '15-10-2026', 'Dealer A', 'FG-0002', 'Knee warmer', 2, 1800, 2124],
    ['GTD/26-27/014', '15-10-2026', 'Dealer A', 'FREIGHT', 'Freight', 1, 100, 118],
    ['PHY/26-27/003', '2026-10-20', 'Physio B', 'FG-0002', 'Knee warmer', 1, 900, 1062],
    ['OEM/26-27/000', serial('2026-09-28'), 'Frido', 'FG-0001', 'Heating pad', 5, 2500, 2950],
    ['Report Ends'],
  ];
  const r = tranzactSheetForMonth(rows, '2026-10');
  assert.equal(r.rowCount, 4);
  assert.deepEqual(r.rows![0], TZ_HEADER);
  assert.equal(r.rows![1][1], '2026-10-03');
  assert.equal(r.rows![2][1], '2026-10-15', 'DD-MM-YYYY read day-first');

  const out = parse('tranzact', { Sheet1: r.rows! });
  const b2b = out.facts.filter((f) => f.channel === 'B2B');
  const gt = out.facts.filter((f) => f.channel === 'GT');
  assert.deepEqual(b2b.map((f) => [f.date, f.sku, f.revenue, f.units]), [['2026-10-03', 'FG-0001', 5000, 10]]);
  assert.deepEqual(gt.map((f) => [f.date, f.sku, f.revenue]).sort(), [['2026-10-15', 'FG-0002', 1800], ['2026-10-20', 'FG-0002', 900]]);
  assert.ok(!out.facts.some((f) => f.date.startsWith('2026-09')));
});

test('isoDay handles serials, ISO, DD-MM-YYYY and named months', () => {
  assert.equal(isoDay(serial('2026-10-03')), '2026-10-03');
  assert.equal(isoDay('2026-10-03 14:33:00'), '2026-10-03');
  assert.equal(isoDay('03/10/2026'), '2026-10-03');
  assert.equal(isoDay('3 Oct 2026'), '2026-10-03');
  assert.equal(isoDay(''), '');
  assert.equal(rangeEnd('2026-09', Date.parse('2026-11-02T00:00:00Z')), '2026-09-30');
  assert.equal(rangeEnd('2026-11', Date.parse('2026-11-02T06:00:00Z')), '2026-11-02');
});

// ---- Read-only guards ------------------------------------------------------------

test('read-only guards refuse writes', () => {
  assert.doesNotThrow(() => assertShiprocketReadOnly('POST', 'https://apiv2.shiprocket.in/v1/external/auth/login'));
  assert.doesNotThrow(() => assertShiprocketReadOnly('GET', 'https://apiv2.shiprocket.in/v1/external/orders?page=1&per_page=100&from=2026-09-11&to=2026-10-31'));
  assert.throws(() => assertShiprocketReadOnly('POST', 'https://apiv2.shiprocket.in/v1/external/orders/cancel'));
  assert.throws(() => assertShiprocketReadOnly('GET', 'https://evil.example/v1/external/orders'));
  assert.doesNotThrow(() => assertEasebuzzReadOnly('POST', 'https://dashboard.easebuzz.in/settlements/v1/retrieve'));
  assert.throws(() => assertEasebuzzReadOnly('POST', 'https://dashboard.easebuzz.in/transaction/v1/refund'));
  assert.doesNotThrow(() => assertSheetsReadOnly('GET', 'https://sheets.googleapis.com/v4/spreadsheets/abc_1/values/A%3AZZ'));
  assert.throws(() => assertSheetsReadOnly('POST', 'https://sheets.googleapis.com/v4/spreadsheets/abc/values/A1:append'));
});

// ---- Catalog covers every close slot ----------------------------------------------

test('every client report slot has exactly one source; api/sheet slots can pull, uploads say why', () => {
  const src = fs.readFileSync(path.join(here, '../../client/src/data/ingest/catalog.ts'), 'utf8');
  const clientSlots = [...src.matchAll(/connectorId:\s*'([^']+)',\s*slotId:\s*'([^']+)'/g)].map((m) => `${m[1]}|${m[2]}`);
  assert.ok(clientSlots.length >= 18, `found ${clientSlots.length} client slots`);
  const server = SLOT_SOURCES.map((s) => `${s.connectorId}|${s.slotId}`);
  assert.deepEqual([...new Set(server)].length, server.length, 'no duplicate slot entries');
  assert.deepEqual([...clientSlots].sort(), [...server].sort());
  for (const s of SLOT_SOURCES) {
    if (s.source === 'api' || s.source === 'sheet') assert.ok(s.pull, `${s.connectorId}|${s.slotId} must pull`);
    else assert.ok(!s.pull && s.line.length > 10, `${s.connectorId}|${s.slotId} needs a reason`);
    if (s.source === 'claude_task') assert.ok(s.claudeTask);
  }
  const manual = SLOT_SOURCES.filter((s) => s.source === 'upload').map((s) => s.connectorId);
  for (const c of ['tally', 'flipkart', 'flipkartads', 'blinkit', 'snapmint', 'shopflo']) assert.ok(manual.includes(c), `${c} stays manual`);
  const dl = SLOT_SOURCES.find((x) => x.connectorId === 'delhivery' && x.slotId === 'wallet')!;
  assert.equal(dl.source, 'api');
  assert.match(dl.line, /^Computed freight \(Delhivery tracking \+ charge calculator\), not the wallet ledger/);
  assert.match(dl.connectHint!, /create secret delhivery-api-token/);
  const sr = SLOT_SOURCES.find((x) => x.connectorId === 'shiprocket' && x.slotId === 'passbook')!;
  assert.equal(sr.source, 'api');
  assert.match(sr.line, /^Computed from shipment charges \(freight \+ COD \+ RTO\), not the wallet statement — compare with the passbook once/);
});

// ---- Delhivery computed freight ≡ wallet report upload ------------------------------

const dlTrack = (awb: string, status: string, statusType: string, extra: Record<string, unknown> = {}) => ({
  Shipment: { AWB: awb, Status: { Status: status, StatusType: statusType }, Consignee: { Name: 'Asha', Address1: ['12 MG Road'], PinCode: 411001, Telephone1: '98' }, ...extra },
});

test('Delhivery tracking is whitelisted; charge plan per status / direction', () => {
  const t = trackSummary(dlTrack('3096001', 'Delivered', 'DL', { ChargedWeight: 760, PickUpDate: '2026-10-03T10:00:00' }))!;
  assert.deepEqual(Object.keys(t).sort(), ['awb', 'chargedWeightG', 'consigneePin', 'pickedUp', 'status', 'statusType']);
  assert.ok(!JSON.stringify(t).includes('Asha') && !JSON.stringify(t).includes('MG Road'));
  assert.equal(t.consigneePin, '411001');
  assert.equal(gramsOf(1.2), 1200);
  assert.equal(gramsOf('500.0'), 500);
  assert.equal(gramsOf(null), null);

  const fwd: WarrantyFeedRow = { awb: '3096001', direction: 'forward', createdAt: '2026-10-02T20:00:00Z', originPin: '201301', destinationPin: null, declaredWeightG: 760 };
  const p = chargePlan(fwd, t);
  assert.ok(p.charge);
  if (p.charge) assert.deepEqual(p.query, { md: 'S', ss: 'Delivered', o_pin: '201301', d_pin: '411001', cgm: 760, pt: 'Pre-paid' });

  const rev: WarrantyFeedRow = { awb: '3096002', direction: 'reverse', createdAt: '2026-10-05T05:00:00Z', originPin: '560001', destinationPin: '201304', declaredWeightG: 1500 };
  const rp = chargePlan(rev, trackSummary(dlTrack('3096002', 'In Transit', 'UD', { PickUpDate: '2026-10-06' }))!);
  assert.ok(rp.charge);
  if (rp.charge) { assert.equal(rp.query.ss, 'DTO'); assert.equal(rp.query.cgm, 1500); assert.equal(rp.query.o_pin, '560001'); assert.ok(rp.estimated.length); }

  const rto = chargePlan(fwd, trackSummary(dlTrack('3096001', 'RTO', 'RT', { PickUpDate: '2026-10-03' }))!);
  assert.ok(rto.charge && rto.query.ss === 'RTO');
  assert.deepEqual(chargePlan(fwd, trackSummary(dlTrack('3096001', 'Canceled', 'CN'))!), { charge: false, reason: 'cancelled' });
  assert.deepEqual(chargePlan(fwd, trackSummary(dlTrack('3096001', 'Manifested', 'UD'))!), { charge: false, reason: 'not_picked_up' });
  assert.deepEqual(chargePlan({ ...rev, originPin: null }, trackSummary(dlTrack('3096002', 'DTO', 'DL', { PickUpDate: 'x' }))!), { charge: false, reason: 'no_pincode' });
  assert.deepEqual(chargePlan(fwd, null), { charge: false, reason: 'not_tracked' });

  assert.equal(chargeAmount([{ gross_amount: 148, total_amount: 174.64 }]), 174.64);
  assert.equal(chargeAmount({ gross_amount: '148' }), 148);
  assert.equal(chargeAmount([]), null);
  assert.equal(istDay('2026-10-31T20:00:00Z'), '2026-11-01');
});

test('Delhivery computed freight ≡ wallet report upload (Deductions sheet)', () => {
  const priced = [
    { awb: '3096001', date: '2026-10-03', amount: 174.64 },
    { awb: '3096002', date: '2026-10-03', amount: 98.1 },
    { awb: '3096003', date: '2026-10-11', amount: 210 },
    { awb: '3096004', date: '2026-11-01', amount: 50 },
  ];
  const api = delhiveryFreightFacts(priced, '2026-10', { cancelled: 2, estimated: 1 });
  const file = parse('delhivery', {
    Deductions: [
      ['AWB', 'Date & Time', 'Miles', 'Description'],
      ['3096001', '2026-10-03 10:00:00', 174.64, 'Forward freight'],
      ['3096002', '2026-10-03 18:00:00', 98.1, 'Reverse freight'],
      ['3096003', '2026-10-11 09:00:00', 210, 'Forward freight'],
    ],
    Refunds: [['AWB', 'Date & Time', 'Miles']],
  });
  assert.deepEqual(norm(api.facts!), norm(file.facts));
  assert.equal(api.facts!.find((f) => f.date === '2026-10-03')!.fees, 272.74);
  assert.match(api.warnings.join(' '), /outside 2026-10/);
  assert.match(api.warnings.join(' '), /estimates/);
  assert.match(api.trace.join(' '), /2 cancelled/);
  assert.equal(delhiveryFreightFacts([], '2026-10').emptyOk, true);
});

test('Delhivery guard: only GET tracking, charges and the warranty feed', () => {
  assert.doesNotThrow(() => assertDelhiveryReadOnly('GET', 'https://track.delhivery.com/api/v1/packages/json/?waybill=1,2&token=x'));
  assert.doesNotThrow(() => assertDelhiveryReadOnly('GET', 'https://track.delhivery.com/api/kinko/v1/invoice/charges/.json?md=S&ss=DTO'));
  assert.doesNotThrow(() => assertDelhiveryReadOnly('GET', 'https://warranty.heatronics.in/api/feeds/delhivery-shipments?month=2026-10'));
  for (const [m, u] of [
    ['POST', 'https://track.delhivery.com/api/cmu/create.json'],
    ['GET', 'https://track.delhivery.com/api/cmu/create.json'],
    ['POST', 'https://track.delhivery.com/api/p/edit'],
    ['GET', 'https://track.delhivery.com/api/p/edit?waybill=1&cancellation=true'],
    ['POST', 'https://track.delhivery.com/fm/request/new/'],
    ['GET', 'https://track.delhivery.com/waybill/api/bulk/json/?count=5'],
    ['POST', 'https://track.delhivery.com/api/kinko/v1/invoice/charges/.json'],
    ['GET', 'https://staging-express.delhivery.com/api/v1/packages/json/'],
    ['GET', 'https://warranty.heatronics.in/api/requests'],
    ['GET', 'https://evil.example/api/feeds/delhivery-shipments'],
  ]) assert.throws(() => assertDelhiveryReadOnly(m, u), /Blocked/, `${m} ${u}`);
  assert.equal(feedOrigin({}), 'https://warranty.heatronics.in');
  assert.throws(() => feedOrigin({ feedUrl: 'http://warranty.heatronics.in' }), /https/);
});

// ---- Delhivery: 429 retry + budget fallback (injected fetch, fake clock) -----------

function fakeDelhivery(opts: { throttleFirst?: number; deadlineMs?: number }) {
  let t = 0;
  const calls: string[] = [];
  let throttled = 0;
  const feedRows = [
    { awb: '3096001', direction: 'forward', createdAt: '2026-10-05T05:00:00Z', originPin: '201301', destinationPin: '411001', declaredWeightG: 500 },
    { awb: '3096002', direction: 'reverse', createdAt: '2026-10-06T05:00:00Z', originPin: '560001', destinationPin: '201304', declaredWeightG: 500 },
    { awb: '3096003', direction: 'forward', createdAt: '2026-10-07T05:00:00Z', originPin: '201301', destinationPin: '110001', declaredWeightG: 500 },
    { awb: '3096004', direction: 'forward', createdAt: '2026-10-08T05:00:00Z', originPin: '201301', destinationPin: '700001', declaredWeightG: 500 },
  ];
  const price: Record<string, number> = { '411001': 100, '201304': 80, '110001': 90, '700001': 130 };
  const fetchMock = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    calls.push(u.pathname);
    if (u.pathname === '/api/feeds/delhivery-shipments') return new Response(JSON.stringify({ ok: true, rows: feedRows }), { status: 200 });
    if (u.pathname === '/api/v1/packages/json/') {
      const awbs = (u.searchParams.get('waybill') || '').split(',');
      return new Response(JSON.stringify({ ShipmentData: awbs.map((a) => ({ Shipment: { AWB: a, Status: { Status: 'Delivered', StatusType: 'DL' }, PickUpDate: '2026-10-05', ChargedWeight: 500 } })) }), { status: 200 });
    }
    if (u.pathname === '/api/kinko/v1/invoice/charges/.json') {
      if (throttled < (opts.throttleFirst ?? 0)) {
        throttled += 1;
        return new Response('{"detail":"Request was throttled. Expected available in 6 seconds."}', { status: 429 });
      }
      return new Response(JSON.stringify([{ total_amount: price[u.searchParams.get('d_pin')!] }]), { status: 200 });
    }
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  const deps = { fetch: fetchMock, now: () => t, sleep: async (ms: number) => { t += ms; } };
  return { deps, calls, clock: () => t, deadline: opts.deadlineMs ?? 270_000 };
}

const DL_CREDS = { apiToken: 'tok', feedToken: 'feed' };

test('Delhivery 429: waits "available in N seconds", slows down, retries and prices everything', async () => {
  const f = fakeDelhivery({ throttleFirst: 2 });
  const out = await computedFreight(DL_CREDS, '2026-10', f.deadline, f.deps);
  assert.equal(out.facts!.reduce((s, x) => s + x.fees, 0), 400);
  assert.equal(f.calls.filter((p) => p.includes('kinko')).length, 4 + 2, '4 distinct queries + 2 retries');
  assert.ok(f.clock() >= 12_000, `waited for the throttle (${f.clock()} ms)`);
  assert.match(out.trace.join(' '), /2 throttled \(429\)/);
  assert.ok(!out.warnings.some((w) => /ran out of time/.test(w)));

  assert.equal(retryAfterMs(null, 'Request was throttled. Expected available in 6 seconds.'), 6_250);
  assert.equal(retryAfterMs('3', ''), 3_250);
  assert.equal(retryAfterMs(null, 'busy'), 5_000);
});

test('Delhivery 429: gives up after 4 retries with a clear error', async () => {
  const f = fakeDelhivery({ throttleFirst: 99 });
  await assert.rejects(computedFreight(DL_CREDS, '2026-10', f.deadline, f.deps), /still throttled after 4 retries/);
});

test('Delhivery budget runs out: priced AWBs kept, the rest booked at the same-direction average with a warning', async () => {
  // Calculator paced 1 per 2 s, 3 s reserve: with a 6 s budget only calls at t=0 and t=2 s fit.
  const f = fakeDelhivery({ deadlineMs: 6_000 });
  const out = await computedFreight(DL_CREDS, '2026-10', f.deadline, f.deps);
  assert.equal(f.calls.filter((p) => p.includes('kinko')).length, 2);
  // priced: 3096001 forward 100, 3096002 reverse 80; left: 3096003 + 3096004 (forward) → forward average 100 each
  assert.equal(out.facts!.reduce((s, x) => s + x.fees, 0), 380);
  assert.equal(out.facts!.find((x) => x.date === '2026-10-08')!.fees, 100);
  const w = out.warnings.join(' ');
  assert.match(w, /ran out of time: 2 AWB\(s\) were left unpriced; 2 of them are booked at the average priced charge \(forward ₹100\)/);
  assert.match(w, /ESTIMATE/);
  assert.match(out.note!, /average/);
});

// ---- Production costs → BOM pricing ------------------------------------------------

test('Production costs map to the BOM upload rows (FG only, material cost, newest-month warning)', () => {
  const out = productionBomCosts([
    { item: 'FG-0012', name: 'hCore Bed Warmer Single', bom: 'BOM-0040', material: 812.456 },
    { item: 'fg-0003', name: 'hCore Knee', bom: null, material: 450 },
    { item: 'SFG-0101', name: 'Controller PCB', bom: 'BOM-0101', material: 120 },
    { item: 'FG-0099', name: 'No cost yet', bom: 'BOM-0099', material: null },
  ], '2026-10', '2026-11');
  assert.deepEqual(out.bomCosts, [
    { fgId: 'FG-0003', bomNumber: 'FG-0003', bomName: 'hCore Knee', costPerUnit: 450 },
    { fgId: 'FG-0012', bomNumber: 'BOM-0040', bomName: 'hCore Bed Warmer Single', costPerUnit: 812.46 },
  ]);
  assert.equal(out.facts, undefined);
  assert.ok(out.warnings.some((w) => w.includes('2026-10 costs')));
  assert.ok(out.warnings.some((w) => w.includes('FG-0099')));
});

test('Production guard: GET /api/costs only', () => {
  assert.doesNotThrow(() => assertProductionReadOnly('GET', 'https://production.heatronics.in/api/costs?month=2026-10'));
  assert.throws(() => assertProductionReadOnly('POST', 'https://production.heatronics.in/api/costs'));
  assert.throws(() => assertProductionReadOnly('GET', 'https://production.heatronics.in/api/tranzact/overheads'));
  assert.equal(costsUrl({}, '2026-10'), 'https://production.heatronics.in/api/costs?month=2026-10');
});

// ---- Amazon Sales & Traffic report → Business Report reader -------------------------

test('Sales & Traffic report rows run through the Business Report reader like the upload', () => {
  const report = {
    reportSpecification: { reportType: 'GET_SALES_AND_TRAFFIC_REPORT' },
    salesAndTrafficByAsin: [
      { parentAsin: 'B0P', childAsin: 'B0C1', sku: 'HC-BW-S', salesByAsin: { unitsOrdered: 12, orderedProductSales: { amount: 23988, currencyCode: 'INR' } }, trafficByAsin: { sessions: 400, pageViews: 610 } },
      { parentAsin: 'B0P', childAsin: 'B0C2', sku: 'HC-KN', salesByAsin: { unitsOrdered: 0 }, trafficByAsin: { browserSessions: 30, mobileAppSessions: 20, browserPageViews: 40, mobileAppPageViews: 25 } },
      { parentAsin: 'B0P', childAsin: 'B0C3', sku: 'HC-OLD', salesByAsin: { unitsOrdered: 0 }, trafficByAsin: { sessions: 0, pageViews: 0 } },
    ],
  };
  const out = salesTrafficRows(report, '2026-10');
  const viaPull = parse('amazonbiz', { Sheet1: out.rows! });
  const upload = parse('amazonbiz', { Sheet1: [
    ['(Parent) ASIN', '(Child) ASIN', 'Title', 'SKU', 'Sessions - Total', 'Page Views - Total', 'Units Ordered'],
    ['B0P', 'B0C1', '', 'HC-BW-S', 400, 610, 12],
    ['B0P', 'B0C2', '', 'HC-KN', 50, 65, 0],
  ] });
  assert.deepEqual(viaPull.facts, upload.facts);
  assert.equal(viaPull.facts.length, 2);
  assert.equal(viaPull.facts[0].sessions, 400);
  assert.equal(salesTrafficRows({ salesAndTrafficByAsin: [] }, '2026-10').emptyOk, true);
});

test('SP-API: the only POST the MIS may make is createReport', () => {
  assert.doesNotThrow(() => assertSpapiPostAllowed('/reports/2021-06-30/reports'));
  assert.throws(() => assertSpapiPostAllowed('/solicitations/v1/orders/1/solicitations/productReviewAndSellerFeedback'));
  assert.throws(() => assertSpapiPostAllowed('/listings/2021-08-01/items/X/SKU'));
});
