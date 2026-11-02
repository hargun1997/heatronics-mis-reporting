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
import { easebuzzHashInput, easebuzzPayoutFacts, shiprocketStatementFacts, tranzactSheetForMonth } from '../src/connectors/slots/map/feeds.js';
import { isoDay, rangeEnd } from '../src/connectors/slots/map/common.js';
import { SLOT_SOURCES } from '../src/connectors/slots/catalog.js';
import { assertShiprocketReadOnly } from '../src/connectors/sources/shiprocket.js';
import { assertEasebuzzReadOnly } from '../src/connectors/sources/easebuzz.js';
import { assertSheetsReadOnly } from '../src/connectors/sources/sheets.js';

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

// ---- Shiprocket statement ≡ passbook upload ---------------------------------------

test('Shiprocket wallet statement ≡ passbook upload', () => {
  const api = shiprocketStatementFacts([
    { created_at: '2026-10-03 10:00:00', channel_order_id: '1001-D2C', description: 'Freight charges applied', debit_amount: '85.50', credit_amount: '0' },
    { created_at: '2026-10-03 11:00:00', channel_order_id: '1002', description: 'COD charges applied', debit_amount: '35', credit_amount: '0' },
    { created_at: '2026-10-04 09:00:00', channel_order_id: '1003-AMZ', description: 'Freight charges applied', debit_amount: '60', credit_amount: '0' },
    { created_at: '2026-10-05 09:00:00', channel_order_id: '', description: 'Wallet recharge', debit_amount: '0', credit_amount: '5000' },
    { created_at: '2026-10-05 09:00:00', channel_order_id: '1004', description: 'Freight Charges deducted against COD', debit_amount: '100', credit_amount: '0' },
    { created_at: '2026-09-30 23:00:00', channel_order_id: '999', description: 'Freight charges applied', debit_amount: '10', credit_amount: '0' },
  ], '2026-10');
  const file = parse('shiprocket', { Sheet1: [
    ['Created At', 'Channel Order Id', 'AWB Code', 'Amount', 'Description'],
    ['03-Oct-2026 10:00:00', '1001-D2C', 'A1', -85.5, 'Freight charges applied'],
    ['03-Oct-2026 11:00:00', '1002', 'A2', -35, 'COD charges applied'],
    ['04-Oct-2026 09:00:00', '1003-AMZ', 'A3', -60, 'Freight charges applied'],
    ['05-Oct-2026 09:00:00', '', '', 5000, 'Wallet recharge'],
    ['05-Oct-2026 09:00:00', '1004', 'A4', -100, 'Freight Charges deducted against COD'],
  ] });
  assert.deepEqual(norm(api.facts!), norm(file.facts));
  assert.equal(api.facts!.find((f) => f.date === '2026-10-03')!.fees, 120.5);
  assert.match(api.warnings.join(' '), /outside 2026-10/);
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
  assert.equal(easebuzzHashInput(['KEY', 'a@b.in', '02-10-2026'], 'SALT'), 'KEY|a@b.in|02-10-2026|SALT');
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
  assert.doesNotThrow(() => assertShiprocketReadOnly('GET', 'https://apiv2.shiprocket.in/v1/external/account/details/statement?page=1'));
  assert.throws(() => assertShiprocketReadOnly('POST', 'https://apiv2.shiprocket.in/v1/external/orders/cancel'));
  assert.throws(() => assertShiprocketReadOnly('GET', 'https://evil.example/v1/external/orders'));
  assert.doesNotThrow(() => assertEasebuzzReadOnly('POST', 'https://dashboard.easebuzz.in/payout/v1/retrieve'));
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
  for (const c of ['tally', 'flipkart', 'flipkartads', 'blinkit', 'snapmint', 'shopflo', 'delhivery']) assert.ok(manual.includes(c), `${c} stays manual`);
});
