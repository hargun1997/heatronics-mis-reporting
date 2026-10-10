// ----------------------------------------------------------------------------
// The D2C cost stack, plus Flipkart.
//
// platformAdapters.ts answers "what sold where". These answer "what did it cost
// to get there and what came back" — the half of unit economics the deck has
// never had:
//
//   Flipkart     a second marketplace, same shape of problem as Amazon
//   Shiprocket   order-level status, the ONLY file that says which units
//                came back as RTO
//   Easebuzz     payment gateway MDR on D2C checkout
//   Snapmint     EMI subvention — a margin cost that reads as a discount
//   Delhivery    reverse and replacement waybills — warranty freight
//   Conversion   rent, labour and direct manufacturing, which turn COG into
//                COGM and which the old SKU table left out entirely
//
// WHY RTO AND WARRANTY GET THEIR OWN COST KEYS
// --------------------------------------------
// The old SkuRow had one `fees` number. A product bleeding 8% of revenue to RTO
// freight and one bleeding 8% to commission looked identical in it, and they
// need opposite responses — the first is a packaging, address-quality or
// cash-on-delivery problem, the second is a pricing one. So cost arrives broken
// out, and a missing key means "this file does not say", never zero.
//
// CALIBRATION
// -----------
// Everything in this file was written from each platform's documented export
// format. On this codebase that has never once been enough: Amazon prints a
// POSITIVE quantity on refund rows, which overstated July units by 22% and COGS
// with them, and Shiprocket's largest credits are COD moving into the wallet
// rather than income, which read 74% light on freight. Both were found only by
// running the real file. So each adapter here emits `uncalibrated()` on every
// parse until it has been checked against one real month, and the close surfaces
// that as a warning rather than letting the number through quietly.
// ----------------------------------------------------------------------------

import type { SourceAdapter } from './adapters';
import {
  cell,
  colLoose,
  derivedProvenance,
  empty,
  findHeader,
  findHeaderLoose,
  hayFor,
  headerMiss,
  lower,
  num,
  provenanceFor,
  r2,
  sheetRows,
  sniffOn,
  uncalibrated,
} from './adapterPlumbing';
import { totalCosts, type ConversionCost, type CrossCheck, type SkuCosts, type SkuRow } from './schema';

/** Header row, lowercased, for alias lookups. */
const headerOf = (rows: unknown[][], at: number): string[] => (rows[at] ?? []).map(lower);

/**
 * The sheet an adapter should read.
 *
 * Marketplace exports arrive as multi-tab workbooks where the first tab is a
 * summary or a disclaimer. Preferring a tab whose name matches, and only then
 * falling back to the first, stops an adapter parsing a cover page and
 * reporting an empty month.
 */
function pickSheet(names: string[], prefer: RegExp): string {
  return names.find((n) => prefer.test(n)) ?? names[0];
}

// ---- Flipkart: settlement ---------------------------------------------------

/**
 * Flipkart's settlement report, not its sales report.
 *
 * Same trap as Amazon: the "Sales Report" looks like the right file and carries
 * no fees, so it cannot price a month. Only the settlement/commission report has
 * commission, collection and shipping fees on it.
 *
 * Event types matter. A row is a Sale, a Return or a Cancellation, and returns
 * arrive with a negative settlement value but — following the Amazon lesson —
 * are NOT assumed to carry a negative quantity. Units are signed off the money,
 * and returned units are counted separately so the return rate survives.
 */
const flipkartSettlement: SourceAdapter = {
  kind: 'flipkartSettlement',
  label: 'Flipkart settlement',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [
      /flipkart/,
      /order item id/,
      /final settlement amount/,
      /commission/,
      /event ?sub ?type/,
    ]),
  parse: ({ sourceId, file, workbook }) => {
    const sheet = pickSheet(workbook.SheetNames, /settle|order|commission/i);
    const rows = sheetRows(workbook, sheet);

    let at = findHeader(rows, ['sku']);
    if (at < 0) at = findHeaderLoose(rows, ['sku'], 40);
    if (at < 0) at = findHeaderLoose(rows, ['order item id'], 40);
    if (at < 0) {
      return empty([
        'Flipkart: no header row with a SKU or Order Item ID column in the first 40 rows. ' +
          'This is usually the Sales Report rather than the settlement report — the Sales Report ' +
          'carries no fees and cannot price a month.',
      ]);
    }

    const h = headerOf(rows, at);
    const iSku = colLoose(h, 'sku', 'seller sku', 'fsn');
    const iTitle = colLoose(h, 'product title', 'product', 'title', 'description');
    const iQty = colLoose(h, 'quantity', 'qty', 'item quantity');
    const iNet = colLoose(
      h,
      'final settlement amount',
      'settlement value',
      'settlement amount',
      'net settlement',
    );
    const iGross = colLoose(h, 'order item value', 'item value', 'gross amount', 'sale amount');
    const iEvent = colLoose(h, 'event sub type', 'event type', 'transaction type');
    const iComm = colLoose(h, 'commission', 'marketplace fee');
    const iShip = colLoose(h, 'shipping fee', 'forward shipping', 'logistics fee');
    const iRevShip = colLoose(h, 'reverse shipping fee', 'return shipping', 'reverse logistics fee');
    const iFixed = colLoose(h, 'collection fee', 'fixed fee', 'payment collection fee');
    const iOffer = colLoose(h, 'total offer amount', 'seller share', 'offer amount');

    const missing: string[] = [];
    if (iSku < 0) missing.push('SKU');
    if (iQty < 0) missing.push('quantity');
    if (iNet < 0 && iGross < 0) missing.push('settlement or item value');
    if (missing.length > 0) return headerMiss('Flipkart', missing, h);

    const skuRows: SkuRow[] = [];
    const warnings: string[] = [uncalibrated('Flipkart')];
    let gross = 0;
    let returnedUnits = 0;

    for (const raw of rows.slice(at + 1)) {
      const key = cell(raw[iSku]) || (iTitle >= 0 ? cell(raw[iTitle]) : '');
      if (!key) continue;

      const revenue = r2(iNet >= 0 ? num(raw[iNet]) : num(raw[iGross]));
      const qty = Math.abs(num(raw[iQty]));
      const event = iEvent >= 0 ? lower(raw[iEvent]) : '';
      const isReturn = /return|refund|cancel|rto/.test(event) || revenue < 0;

      // Units signed off the money, never off the quantity column. Flipkart, like
      // Amazon, prints quantity as a positive magnitude on a return.
      const units = revenue === 0 && !isReturn ? qty : isReturn ? -qty : qty;
      if (isReturn) returnedUnits += qty;

      const costs: SkuCosts = {};
      if (iComm >= 0) costs.commission = r2(Math.abs(num(raw[iComm])));
      if (iShip >= 0) costs.shippingForward = r2(Math.abs(num(raw[iShip])));
      if (iRevShip >= 0) costs.shippingReturn = r2(Math.abs(num(raw[iRevShip])));
      if (iFixed >= 0) costs.paymentGateway = r2(Math.abs(num(raw[iFixed])));
      if (iOffer >= 0) costs.discount = r2(Math.abs(num(raw[iOffer])));
      for (const k of Object.keys(costs) as (keyof SkuCosts)[]) {
        if (!costs[k]) delete costs[k];
      }

      gross += revenue;
      skuRows.push({
        platform: 'flipkart',
        key,
        keyKind: cell(raw[iSku]) ? 'sku' : 'title',
        name: iTitle >= 0 ? cell(raw[iTitle]) || undefined : undefined,
        revenue,
        units,
        fees: totalCosts(costs),
        costs,
        returnUnits: isReturn ? qty : undefined,
        provenance: provenanceFor(sourceId, file.name, `Flipkart settlement row, sheet "${sheet}"`),
      });
    }

    if (skuRows.length === 0) warnings.push('Flipkart: header found but no priced rows under it.');
    if (returnedUnits > 0) {
      warnings.push(
        `Flipkart: ${returnedUnits} unit(s) on return/cancellation rows. Units are signed off the ` +
          'settlement amount, not the quantity column.',
      );
    }

    const crossChecks: CrossCheck[] = [
      {
        label: 'Flipkart net settlement',
        amount: r2(gross),
        against: 'Ecommerce Sales (Flipkart)',
        note: 'Net of returns and fees as Flipkart settles it. Hold beside Tally; do not add to it.',
      },
    ];

    return { nodes: [], skuRows, bomCosts: [], crossChecks, warnings };
  },
};

// ---- Shiprocket: orders (the RTO file) --------------------------------------

/**
 * Shiprocket's order export — the RTO half of D2C unit economics.
 *
 * The passbook adapter already reads the wallet, which is the right source for
 * total freight. It cannot say WHICH product came back, because the passbook
 * carries no SKU. This file does, so it is the only one that can put an RTO cost
 * on a product rather than on the channel.
 *
 * An RTO costs twice: the forward leg that was already paid, and the return leg.
 * Both are freight. On top of that a unit that comes back unsellable is a COGS
 * write-off, which is `rtoLoss` — left out unless the export marks damage,
 * because guessing a recovery rate would invent the number that matters most.
 */
const shiprocketOrders: SourceAdapter = {
  kind: 'shiprocketOrders',
  label: 'Shiprocket orders (RTO)',
  sniff: (wb, fileName) => {
    const hay = hayFor(wb, fileName);
    // The passbook must not lose to this one: it has no status column.
    if (/bank referenceno|freight charges deducted against cod/.test(hay)) return 0.02;
    return sniffOn(hay, [/shiprocket/, /awb/, /\brto\b/, /status/, /channel order id/]);
  },
  parse: ({ sourceId, file, workbook }) => {
    const sheet = pickSheet(workbook.SheetNames, /order|shipment/i);
    const rows = sheetRows(workbook, sheet);

    let at = findHeaderLoose(rows, ['status'], 30);
    if (at < 0) at = findHeaderLoose(rows, ['awb'], 30);
    if (at < 0) return empty(['Shiprocket orders: no header row with a status or AWB column found.']);

    const h = headerOf(rows, at);
    const iStatus = colLoose(h, 'status', 'shipment status', 'order status');
    const iSku = colLoose(h, 'sku', 'product sku', 'master sku');
    const iTitle = colLoose(h, 'product name', 'product', 'item name');
    const iQty = colLoose(h, 'quantity', 'qty', 'product quantity');
    const iFreight = colLoose(h, 'freight charges', 'freight total', 'shipping charges', 'freight');
    const iCod = colLoose(h, 'cod charges', 'cod fee');
    const iValue = colLoose(h, 'order total', 'total amount', 'product price', 'order value');

    const missing: string[] = [];
    if (iStatus < 0) missing.push('status');
    if (iSku < 0 && iTitle < 0) missing.push('SKU or product name');
    if (missing.length > 0) return headerMiss('Shiprocket orders', missing, h);

    const skuRows: SkuRow[] = [];
    const warnings: string[] = [uncalibrated('Shiprocket orders')];
    let shipped = 0;
    let rtoCount = 0;
    let rtoFreight = 0;

    for (const raw of rows.slice(at + 1)) {
      const key = (iSku >= 0 ? cell(raw[iSku]) : '') || (iTitle >= 0 ? cell(raw[iTitle]) : '');
      if (!key) continue;

      const status = lower(raw[iStatus]);
      if (!status) continue;
      const qty = Math.abs(num(iQty >= 0 ? raw[iQty] : 1)) || 1;
      shipped += qty;

      // "RTO Initiated", "RTO In Transit", "RTO Delivered" are all the same event
      // for costing: the unit is coming back and the freight is spent.
      const isRto = /\brto\b|return to origin/.test(status);
      const freight = iFreight >= 0 ? Math.abs(num(raw[iFreight])) : 0;
      const cod = iCod >= 0 ? Math.abs(num(raw[iCod])) : 0;

      const costs: SkuCosts = {};
      if (freight > 0) {
        // On an RTO the forward leg is already sunk and the return leg is charged
        // again, so the same freight figure lands on both sides of the trip.
        if (isRto) {
          costs.shippingForward = r2(freight);
          costs.shippingReturn = r2(freight);
        } else {
          costs.shippingForward = r2(freight);
        }
      }
      if (cod > 0) costs.paymentGateway = r2(cod);

      if (isRto) {
        rtoCount += qty;
        rtoFreight += freight * 2;
      }

      skuRows.push({
        platform: 'shiprocket',
        key,
        keyKind: iSku >= 0 && cell(raw[iSku]) ? 'sku' : 'title',
        name: iTitle >= 0 ? cell(raw[iTitle]) || undefined : undefined,
        // Revenue stays zero: Shopify is the authority for D2C revenue, and
        // adding the shipment's order value on top would double count it.
        revenue: 0,
        units: 0,
        fees: totalCosts(costs),
        costs,
        returnUnits: isRto ? qty : undefined,
        provenance: derivedProvenance(
          sourceId,
          file.name,
          `Shiprocket shipment, status "${cell(raw[iStatus])}"${isRto ? ' — counted as RTO' : ''}`,
        ),
      });
    }

    if (iValue >= 0) {
      warnings.push(
        'Shiprocket orders: an order-value column is present but ignored. Shopify is the authority ' +
          'for D2C revenue; taking it from here too would double count the month.',
      );
    }
    if (iFreight < 0) {
      warnings.push(
        'Shiprocket orders: no freight column, so RTO units are counted but not costed. The wallet ' +
          'passbook still carries total freight — this file only splits it by product.',
      );
    }

    const rtoRate = shipped > 0 ? r2((rtoCount / shipped) * 100) : 0;
    const crossChecks: CrossCheck[] = [
      {
        label: 'RTO rate',
        amount: rtoRate,
        note:
          `${rtoCount} of ${shipped} units shipped came back (${rtoRate}%). A percentage, not rupees ` +
          '— the single most useful D2C number this file produces.',
      },
      {
        label: 'RTO freight (both legs)',
        amount: r2(rtoFreight),
        against: 'Freight Outward',
        note: 'Forward leg plus return leg on RTO shipments. Part of the passbook total, not extra to it.',
      },
    ];

    return { nodes: [], skuRows, bomCosts: [], crossChecks, warnings };
  },
};

// ---- Easebuzz: payment gateway ----------------------------------------------

/**
 * Easebuzz settlement — D2C checkout cost.
 *
 * No SKU, and it should not pretend otherwise: a gateway charges on a basket,
 * not on a product. So this emits cross-checks rather than product rows, and the
 * MDR lands on the channel. Pushing it down to SKUs would need an order-to-SKU
 * join this file cannot supply.
 */
const easebuzzSettlement: SourceAdapter = {
  kind: 'easebuzzSettlement',
  label: 'Easebuzz settlement',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [/easebuzz/, /txnid/, /service charge/, /settlement/, /payment mode/]),
  parse: ({ workbook }) => {
    const sheet = pickSheet(workbook.SheetNames, /settle|transaction|txn/i);
    const rows = sheetRows(workbook, sheet);

    const at = findHeaderLoose(rows, ['amount'], 30);
    if (at < 0) return empty(['Easebuzz: no header row with an amount column found.']);

    const h = headerOf(rows, at);
    const iAmt = colLoose(h, 'amount', 'transaction amount', 'gross amount');
    const iNet = colLoose(h, 'net amount', 'settlement amount', 'settled amount', 'payout');
    const iFee = colLoose(h, 'service charge', 'easebuzz fee', 'gateway fee', 'mdr', 'commission');
    const iGst = colLoose(h, 'service tax', 'gst', 'tax');
    const iStatus = colLoose(h, 'status', 'transaction status');
    const iMode = colLoose(h, 'payment mode', 'mode', 'payment method');

    if (iAmt < 0) return headerMiss('Easebuzz', ['amount'], h);

    const warnings: string[] = [uncalibrated('Easebuzz')];
    let gross = 0;
    let mdr = 0;
    let cod = 0;
    let prepaid = 0;
    let rejected = 0;

    for (const raw of rows.slice(at + 1)) {
      const status = iStatus >= 0 ? lower(raw[iStatus]) : 'success';
      const amount = num(raw[iAmt]);
      if (!amount && !status) continue;

      // Failed and pending attempts carry no money and no fee. Counting them
      // would inflate GMV with transactions that never happened.
      if (iStatus >= 0 && !/success|captured|settled|credit/.test(status)) {
        rejected += 1;
        continue;
      }

      gross += amount;
      const fee = iFee >= 0 ? Math.abs(num(raw[iFee])) : 0;
      const gst = iGst >= 0 ? Math.abs(num(raw[iGst])) : 0;
      if (fee || gst) {
        mdr += fee + gst;
      } else if (iNet >= 0) {
        // No explicit fee column: infer it from what was actually settled.
        mdr += Math.max(0, amount - num(raw[iNet]));
      }

      const mode = iMode >= 0 ? lower(raw[iMode]) : '';
      if (/cod|cash/.test(mode)) cod += amount;
      else prepaid += amount;
    }

    if (iFee < 0 && iNet < 0) {
      warnings.push(
        'Easebuzz: neither a fee column nor a net settlement column, so MDR could not be derived. ' +
          'Re-export with the settlement amount included.',
      );
    }
    if (rejected > 0) {
      warnings.push(`Easebuzz: ${rejected} non-successful transaction(s) excluded from GMV and MDR.`);
    }

    const crossChecks: CrossCheck[] = [
      {
        label: 'Easebuzz GMV',
        amount: r2(gross),
        against: 'D2C Sales',
        note: 'Successful transactions only. Gateway GMV is gross of discounts, so it reads above net D2C.',
      },
      {
        label: 'Easebuzz MDR',
        amount: r2(mdr),
        against: 'D2C Checkout / Bank Charges',
        note: `${gross > 0 ? r2((mdr / gross) * 100) : 0}% of GMV. A channel cost — no SKU split is possible from this file.`,
      },
      {
        label: 'COD share of D2C GMV',
        amount: gross > 0 ? r2((cod / gross) * 100) : 0,
        note: `COD ₹${r2(cod)} vs prepaid ₹${r2(prepaid)}. COD is what drives the RTO rate, so this is the number to watch beside it.`,
      },
    ];

    return { nodes: [], skuRows: [], bomCosts: [], crossChecks, warnings };
  },
};

// ---- Snapmint: EMI subvention ----------------------------------------------

/**
 * Snapmint settlement — the cost of offering EMI.
 *
 * Subvention is the interest Heatronics pays so the customer sees "no cost EMI".
 * It is a real margin cost that hides well: the books may show it as a discount,
 * and the gateway file shows it as a fee. Given its own cost key for that reason.
 */
const snapmintSettlement: SourceAdapter = {
  kind: 'snapmintSettlement',
  label: 'Snapmint settlement',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [/snapmint/, /subvention/, /emi/, /settlement/, /tenure/]),
  parse: ({ sourceId, file, workbook }) => {
    const sheet = pickSheet(workbook.SheetNames, /settle|order|transaction/i);
    const rows = sheetRows(workbook, sheet);

    let at = findHeaderLoose(rows, ['subvention'], 30);
    if (at < 0) at = findHeaderLoose(rows, ['order'], 30);
    if (at < 0) return empty(['Snapmint: no header row with a subvention or order column found.']);

    const h = headerOf(rows, at);
    const iAmt = colLoose(h, 'order amount', 'order value', 'transaction amount', 'amount');
    const iSub = colLoose(h, 'subvention amount', 'subvention', 'interest borne', 'discount');
    const iFee = colLoose(h, 'processing fee', 'platform fee', 'service charge', 'commission');
    const iNet = colLoose(h, 'net payable', 'settlement amount', 'payout amount', 'net amount');
    const iSku = colLoose(h, 'sku', 'product sku');
    const iTitle = colLoose(h, 'product name', 'product', 'item');
    const iStatus = colLoose(h, 'status', 'order status');

    if (iAmt < 0 && iSub < 0) return headerMiss('Snapmint', ['order amount', 'subvention'], h);

    const skuRows: SkuRow[] = [];
    const warnings: string[] = [uncalibrated('Snapmint')];
    let gmv = 0;
    let subvention = 0;
    let fees = 0;

    for (const raw of rows.slice(at + 1)) {
      const status = iStatus >= 0 ? lower(raw[iStatus]) : '';
      if (status && /cancel|fail|reject/.test(status)) continue;

      const amount = iAmt >= 0 ? num(raw[iAmt]) : 0;
      const sub = iSub >= 0 ? Math.abs(num(raw[iSub])) : 0;
      let fee = iFee >= 0 ? Math.abs(num(raw[iFee])) : 0;
      // No fee column: infer the platform's take from what was actually settled,
      // net of the subvention already accounted for separately.
      if (iFee < 0 && iNet >= 0 && amount) fee = Math.max(0, r2(amount - sub - num(raw[iNet])));
      if (!amount && !sub && !fee) continue;

      gmv += amount;
      subvention += sub;
      fees += fee;

      // Only attach to a product when the file actually names one. EMI is
      // concentrated on high-ticket SKUs, so this split matters when available.
      const key = (iSku >= 0 ? cell(raw[iSku]) : '') || (iTitle >= 0 ? cell(raw[iTitle]) : '');
      if (key && (sub > 0 || fee > 0)) {
        const costs: SkuCosts = {};
        if (sub > 0) costs.financeCost = r2(sub);
        if (fee > 0) costs.paymentGateway = r2(fee);
        skuRows.push({
          platform: 'shopify',
          key,
          keyKind: iSku >= 0 && cell(raw[iSku]) ? 'sku' : 'title',
          name: iTitle >= 0 ? cell(raw[iTitle]) || undefined : undefined,
          // Shopify already booked this order's revenue.
          revenue: 0,
          units: 0,
          fees: totalCosts(costs),
          costs,
          provenance: provenanceFor(sourceId, file.name, 'Snapmint EMI subvention on a D2C order'),
        });
      }
    }

    if (iSub < 0) {
      warnings.push(
        'Snapmint: no subvention column found, so the cost of offering EMI is not in this close. ' +
          'It is usually the largest single Snapmint cost.',
      );
    }
    if (skuRows.length === 0 && subvention > 0) {
      warnings.push(
        'Snapmint: subvention found but no product column, so it lands on the D2C channel rather ' +
          'than on products. EMI concentrates on high-ticket SKUs, so the channel-level number ' +
          'understates how much it costs those products.',
      );
    }

    const crossChecks: CrossCheck[] = [
      { label: 'Snapmint GMV', amount: r2(gmv), against: 'D2C Sales', note: 'EMI orders only.' },
      {
        label: 'Snapmint subvention',
        amount: r2(subvention),
        against: 'Discounts / Finance Cost',
        note: `${gmv > 0 ? r2((subvention / gmv) * 100) : 0}% of EMI GMV. Check which ledger the books put this in — discount and finance cost sit on opposite sides of gross margin.`,
      },
      { label: 'Snapmint fees', amount: r2(fees), against: 'D2C Checkout', note: 'Processing and platform fees.' },
    ];

    return { nodes: [], skuRows, bomCosts: [], crossChecks, warnings };
  },
};

// ---- Delhivery: warranty shipments -----------------------------------------

/**
 * Delhivery waybills, filtered to the warranty ones.
 *
 * Warranty cost has two halves: the replacement unit (a COGS write-off the BOM
 * already prices) and the freight to collect the old one and send the new one.
 * This file is the freight half. Forward sales shipments in the same export are
 * NOT warranty and are excluded — including them would double count the freight
 * Shiprocket already charges.
 */
const delhiveryWarranty: SourceAdapter = {
  kind: 'delhiveryWarranty',
  label: 'Delhivery warranty shipments',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [/delhivery/, /waybill/, /reverse/, /replacement/, /charged weight/]),
  parse: ({ sourceId, file, workbook }) => {
    const sheet = pickSheet(workbook.SheetNames, /waybill|shipment|manifest/i);
    const rows = sheetRows(workbook, sheet);

    let at = findHeaderLoose(rows, ['waybill'], 30);
    if (at < 0) at = findHeaderLoose(rows, ['freight'], 30);
    if (at < 0) return empty(['Delhivery: no header row with a waybill or freight column found.']);

    const h = headerOf(rows, at);
    const iType = colLoose(h, 'shipment type', 'type', 'movement type', 'order type', 'payment mode');
    const iStatus = colLoose(h, 'status', 'current status');
    const iFreight = colLoose(h, 'freight charges', 'total amount', 'charges', 'billed amount', 'freight');
    const iSku = colLoose(h, 'sku', 'product sku');
    const iTitle = colLoose(h, 'product', 'product name', 'item description', 'description');
    const iQty = colLoose(h, 'quantity', 'qty', 'pieces');

    if (iFreight < 0) return headerMiss('Delhivery', ['freight charges'], h);

    const skuRows: SkuRow[] = [];
    const warnings: string[] = [uncalibrated('Delhivery')];
    let warrantyFreight = 0;
    let warrantyUnits = 0;
    let forwardSkipped = 0;
    let unclassified = 0;

    const WARRANTY = /reverse|replacement|rvp|warranty|pickup|return/;

    for (const raw of rows.slice(at + 1)) {
      const freight = Math.abs(num(raw[iFreight]));
      const marker = `${iType >= 0 ? lower(raw[iType]) : ''} ${iStatus >= 0 ? lower(raw[iStatus]) : ''}`.trim();
      if (!marker && freight === 0) continue;

      if (!marker) {
        unclassified += 1;
        continue;
      }
      if (!WARRANTY.test(marker)) {
        forwardSkipped += 1;
        continue;
      }

      const qty = Math.abs(num(iQty >= 0 ? raw[iQty] : 1)) || 1;
      warrantyFreight += freight;
      warrantyUnits += qty;

      const key = (iSku >= 0 ? cell(raw[iSku]) : '') || (iTitle >= 0 ? cell(raw[iTitle]) : '');
      if (key && freight > 0) {
        const costs: SkuCosts = { warranty: r2(freight) };
        skuRows.push({
          platform: 'shopify',
          key,
          keyKind: iSku >= 0 && cell(raw[iSku]) ? 'sku' : 'title',
          name: iTitle >= 0 ? cell(raw[iTitle]) || undefined : undefined,
          revenue: 0,
          units: 0,
          fees: totalCosts(costs),
          costs,
          returnUnits: qty,
          provenance: derivedProvenance(
            sourceId,
            file.name,
            `Delhivery warranty shipment, classified from "${marker}"`,
          ),
        });
      }
    }

    if (iType < 0 && iStatus < 0) {
      warnings.push(
        'Delhivery: no shipment-type or status column, so forward and reverse shipments cannot be ' +
          'told apart. Nothing was counted as warranty — re-export with shipment type included, ' +
          'because counting forward legs here would double the freight Shiprocket already charges.',
      );
    }
    if (unclassified > 0) {
      warnings.push(`Delhivery: ${unclassified} row(s) had no type or status and were skipped.`);
    }
    if (forwardSkipped > 0) {
      warnings.push(
        `Delhivery: ${forwardSkipped} forward shipment(s) excluded — only reverse, replacement and ` +
          'pickup legs count as warranty cost.',
      );
    }
    if (skuRows.length === 0 && warrantyFreight > 0) {
      warnings.push(
        'Delhivery: warranty freight found but no product column, so it lands on the channel rather ' +
          'than on products.',
      );
    }

    const crossChecks: CrossCheck[] = [
      {
        label: 'Warranty freight (Delhivery)',
        amount: r2(warrantyFreight),
        against: 'Freight Outward / Warranty',
        note:
          `${warrantyUnits} reverse or replacement leg(s). Freight only — the replacement UNIT is a ` +
          'COGS write-off on top of this, which the BOM prices and this file cannot see.',
      },
    ];

    return { nodes: [], skuRows, bomCosts: [], crossChecks, warnings };
  },
};

// ---- Conversion cost: what makes COG into COGM ------------------------------

/**
 * Rent, labour and direct manufacturing for the month.
 *
 * This is the file whose absence broke the old SKU table. It priced units at
 * bill-of-materials cost and called the result gross margin, while Tally charged
 * raw material PLUS factory overheads, job work, wages and stock movement. In
 * Jul-2026 that was a 16.7 percentage-point gap — the SKU tab said 58.8% gross
 * margin, the books said 42.1%.
 *
 * Shape is deliberately forgiving: a label column and an amount column, which is
 * what a Tally group summary export already looks like. Rows are bucketed by
 * keyword, and anything unrecognised goes to `other` rather than being dropped —
 * a misfiled cost still belongs in COGM; a dropped one silently lifts margin.
 */
const CONVERSION_BUCKETS: { re: RegExp; bucket: keyof Omit<ConversionCost, 'provenance'> }[] = [
  { re: /rent|lease|premises|factory building/i, bucket: 'rent' },
  { re: /wage|salary|salaries|labour|labor|staff|worker|contract ?labour|pf|esic|bonus/i, bucket: 'labour' },
  {
    re: /job ?work|power|electricity|fuel|consumable|packing|packaging|tool|die|machin|repair|maintenance|freight inward|carriage inward/i,
    bucket: 'directManufacturing',
  },
];

const conversionCost: SourceAdapter = {
  kind: 'conversionCost',
  label: 'Conversion cost (rent, labour, mfg)',
  sniff: (wb, fileName) => {
    const hay = hayFor(wb, fileName);
    // Must not steal the Tally P&L: that has a Nett Profit line and this does not.
    if (/nett profit|nett loss|trading account/.test(hay)) return 0.02;
    return sniffOn(hay, [/factory overhead/, /conversion/, /manufacturing cost/, /job work/, /rent/]);
  },
  parse: ({ sourceId, file, workbook }) => {
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    const warnings: string[] = [];

    // Find the first column pair that looks like (label, number).
    let labelCol = -1;
    let amountCol = -1;
    for (const raw of rows.slice(0, 40)) {
      const cells = raw ?? [];
      for (let c = 0; c < cells.length; c++) {
        if (!cell(cells[c])) continue;
        const asNum = num(cells[c]);
        if (asNum !== 0 && labelCol >= 0) {
          amountCol = c;
          break;
        }
        if (asNum === 0 && /[a-z]/i.test(cell(cells[c])) && labelCol < 0) labelCol = c;
      }
      if (labelCol >= 0 && amountCol >= 0) break;
    }

    if (labelCol < 0 || amountCol < 0) {
      return empty([
        'Conversion cost: could not find a label column and an amount column. The file should be ' +
          'two columns — the cost name and the rupees — which is what a Tally group summary export ' +
          'already looks like.',
      ]);
    }

    const totals = { rent: 0, labour: 0, directManufacturing: 0, other: 0 };
    const unmatched: string[] = [];
    let seen = 0;

    for (const raw of rows) {
      const label = cell(raw?.[labelCol]);
      const amount = Math.abs(num(raw?.[amountCol]));
      if (!label || amount === 0) continue;
      // Tally prints a grand total; adding it to its own children doubles everything.
      if (/^(total|grand total|closing balance)/i.test(label)) continue;

      seen += 1;
      const hit = CONVERSION_BUCKETS.find((b) => b.re.test(label));
      if (hit) {
        totals[hit.bucket] += amount;
      } else {
        totals.other += amount;
        unmatched.push(label);
      }
    }

    if (seen === 0) {
      return empty(['Conversion cost: found the columns but no rows with both a name and an amount.']);
    }

    const conversion: ConversionCost = {
      ...totals,
      rent: r2(totals.rent),
      labour: r2(totals.labour),
      directManufacturing: r2(totals.directManufacturing),
      other: r2(totals.other),
      provenance: provenanceFor(
        sourceId,
        file.name,
        `Conversion cost from ${seen} row(s): rent, labour and direct manufacturing`,
      ),
    };

    if (unmatched.length > 0) {
      warnings.push(
        `Conversion cost: ${unmatched.length} row(s) did not match rent, labour or manufacturing and ` +
          `went to "other" — ${unmatched.slice(0, 6).join(', ')}${unmatched.length > 6 ? ', …' : ''}. ` +
          'They are still in COGM; check they belong there and not below gross margin.',
      );
    }

    const total = r2(totals.rent + totals.labour + totals.directManufacturing + totals.other);
    const crossChecks: CrossCheck[] = [
      {
        label: 'Conversion cost (into COGM)',
        amount: total,
        against: 'Factory Overheads + Manufacturing Costs',
        note:
          `Rent ₹${r2(totals.rent)} · labour ₹${r2(totals.labour)} · direct mfg ` +
          `₹${r2(totals.directManufacturing)} · other ₹${r2(totals.other)}. This is what raw COG is ` +
          'missing, and leaving it out is what made the SKU tab read 16.7 points above the books.',
      },
    ];

    return { nodes: [], skuRows: [], bomCosts: [], crossChecks, conversion, warnings };
  },
};

export const D2C_ADAPTERS: SourceAdapter[] = [
  flipkartSettlement,
  shiprocketOrders,
  easebuzzSettlement,
  snapmintSettlement,
  delhiveryWarranty,
  conversionCost,
];
