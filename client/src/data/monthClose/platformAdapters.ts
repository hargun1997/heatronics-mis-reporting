// ----------------------------------------------------------------------------
// Platform adapters — Amazon, Shopify, Blinkit, Shiprocket, Tranzact BOMs.
//
// These were first written against documented column names, because Heatronics'
// real exports were not available. They are now written against the real July
// 2026 files, and the shapes turned out to be structurally different from the
// guess — not just differently spelled:
//
//   Amazon      1,700 transaction rows under a 14-line preamble, many rows per
//               SKU, with advertising and bank transfers mixed in among them.
//               Not one row per SKU.
//   Shopify     one row per variant, but 30% of July's revenue sits on rows
//               whose variant SKU is blank.
//   Blinkit     a ZIP of six workbooks; the item detail is on a named sheet
//               inside one of them, under a title row.
//   Shiprocket  a wallet passbook with no SKU column at all, where the largest
//               positive lines are COD transfers into the wallet rather than
//               income.
//
// WHAT THESE FILES ARE FOR
// ------------------------
// They feed the SKU layer and they cross-check Tally. They do NOT feed the
// cascade. Tally is the authority for the P&L; adding a platform's own fee
// total on top of the ledger that already records it would double count. So
// each adapter emits SkuRow[] for the product layer and CrossCheck[] to hold
// beside the books — which is exactly how the July Amazon file earned trust,
// landing within 0.18% of Tally's Ecommerce Sales.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { toAmount, type AdapterResult, type SourceAdapter } from './adapters';
import type { BomCost, CrossCheck, Provenance, SkuPlatform, SkuRow, SourceKind } from './schema';

// ---- Shared plumbing -------------------------------------------------------

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][];
}

const cell = (v: unknown) => String(v ?? '').trim();
const lower = (v: unknown) => cell(v).toLowerCase();
const num = (v: unknown) => toAmount(v) ?? 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** First row within `limit` whose cells contain every needle. Headers move; row numbers do not survive. */
function findHeader(rows: unknown[][], needles: string[], limit = 30): number {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    const cells = (rows[i] ?? []).map(lower);
    if (needles.every((n) => cells.some((c) => c === n))) return i;
  }
  return -1;
}

/** Column index by exact lowercased header, trying each alias in order. */
function col(header: string[], ...aliases: string[]): number {
  for (const a of aliases) {
    const i = header.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

function provenanceFor(sourceId: string, label: string, note: string): Provenance {
  return { sourceId, sourceLabel: label, method: 'xlsx', confidence: 'exact', verified: true, note };
}

/** What every adapter says when it cannot find its columns: what it actually saw. */
function headerMiss(label: string, missing: string[], header: string[]): AdapterResult {
  return {
    nodes: [],
    skuRows: [],
    bomCosts: [],
    crossChecks: [],
    warnings: [
      `${label}: could not find ${missing.map((m) => `a "${m}" column`).join(' and ')}. ` +
        `Headers actually present: ${header.filter(Boolean).join(' | ') || '(none)'}. ` +
        'If the export has been renamed upstream, add the new name to the alias list in platformAdapters.ts.',
    ],
  };
}

const empty = (warnings: string[] = []): AdapterResult => ({
  nodes: [],
  skuRows: [],
  bomCosts: [],
  crossChecks: [],
  warnings,
});

function sniffOn(hay: string, patterns: RegExp[], floor = 0.05): number {
  const hits = patterns.filter((re) => re.test(hay)).length;
  return hits === 0 ? floor : Math.min(0.55 + hits * 0.15, 1);
}

function hayFor(wb: XLSX.WorkBook, fileName: string): string {
  const first = sheetRows(wb, wb.SheetNames[0]).slice(0, 20);
  return `${wb.SheetNames.join(' ')} ${fileName} ${first.flat().map(cell).join(' ')}`.toLowerCase();
}

// ---- Amazon: unified transaction (the settlement file) ---------------------

/**
 * Rows Amazon reports that are not product sales. Advertising and bank
 * transfers are the two that matter: advertising is a real cost that belongs
 * against Sales & Marketing, and a Transfer is money moving to the bank, which
 * is not a cost at all and would otherwise read as one.
 */
const AMAZON_AD = /cost of advertising/i;

const amazonSettlement: SourceAdapter = {
  kind: 'amazonSettlement',
  label: 'Amazon unified transaction',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [
      /unifiedtransaction/,
      /settlement id/,
      /other transaction fees/,
      /promotional rebates/,
      /fba fees/,
    ]),
  parse: ({ workbook, sourceId, file }): AdapterResult => {
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    // Amazon puts ~14 lines of definitions above the header.
    const hi = findHeader(rows, ['date/time', 'type', 'total']);
    if (hi < 0) return empty(['Amazon: no "date/time / type / total" header row found in the first 30 rows.']);

    const header = (rows[hi] ?? []).map(lower);
    const ix = {
      date: col(header, 'date/time'),
      type: col(header, 'type'),
      sku: col(header, 'sku'),
      desc: col(header, 'description'),
      qty: col(header, 'quantity'),
      sales: col(header, 'product sales'),
      shipping: col(header, 'shipping credits'),
      giftWrap: col(header, 'gift wrap credits'),
      rebates: col(header, 'promotional rebates'),
      selling: col(header, 'selling fees'),
      fba: col(header, 'fba fees'),
      otherTxn: col(header, 'other transaction fees'),
      other: col(header, 'other'),
      total: col(header, 'total'),
    };

    const missing = (['sku', 'product sales', 'selling fees', 'total'] as const).filter(
      (h) => col(header, h) < 0,
    );
    if (missing.length > 0) return headerMiss('Amazon', [...missing], header);

    const p = provenanceFor(sourceId, file.name, 'Amazon unified transaction');
    const skuRows: SkuRow[] = [];
    const months = new Set<string>();

    let adSpend = 0;
    let transfers = 0;
    let unallocatedFees = 0;
    let revenue = 0;
    let fees = 0;

    for (const row of rows.slice(hi + 1)) {
      const type = cell(row[ix.type]);
      if (!type) continue;

      const stamp = cell(row[ix.date]).match(/\d{1,2}\s+([A-Za-z]{3})\s+(\d{4})/);
      if (stamp) months.add(`${stamp[1]} ${stamp[2]}`);

      const sku = ix.sku >= 0 ? cell(row[ix.sku]) : '';

      if (!sku) {
        // A bank payout, not a cost. Counting it would overstate the month by
        // the whole settlement.
        if (/^transfer$/i.test(type)) {
          transfers += num(row[ix.total]);
          continue;
        }
        if (AMAZON_AD.test(cell(row[ix.desc]))) {
          adSpend += -num(row[ix.total]);
          continue;
        }
        // Storage, removals, easy-ship handling, reimbursements: real channel
        // cost, but Amazon does not attribute it to a SKU and neither will we.
        unallocatedFees += -num(row[ix.total]);
        continue;
      }

      const rowRevenue =
        num(row[ix.sales]) + num(row[ix.shipping]) + num(row[ix.giftWrap]) + num(row[ix.rebates]);
      // Fees print negative on a sale and positive on a refund, so negating
      // turns both into a cost that nets correctly across the month.
      const rowFees = -(num(row[ix.selling]) + num(row[ix.fba]) + num(row[ix.otherTxn]));
      const qty = num(row[ix.qty]);

      if (rowRevenue === 0 && rowFees === 0 && qty === 0) continue;

      // Amazon prints quantity POSITIVE on a refund, even though product sales
      // is negative. Taking it at face value overstated July's Amazon units by
      // 22% — and since COGS is units times standard cost, it overstated COGS
      // by 22% with it. An Adjustment row (an FBA reimbursement) has a quantity
      // and no sale at all: inventory written off, not a unit sold.
      const units = rowRevenue === 0 ? 0 : rowRevenue < 0 ? -Math.abs(qty) : qty;

      revenue += rowRevenue;
      fees += rowFees;
      skuRows.push({
        platform: 'amazon',
        key: sku,
        keyKind: 'sku',
        name: cell(row[ix.desc]) || undefined,
        revenue: r2(rowRevenue),
        units,
        fees: r2(rowFees),
        provenance: p,
      });
    }

    const warnings: string[] = [];
    if (skuRows.length === 0) warnings.push('Amazon: the header matched but no rows carried a SKU.');
    if (months.size > 1) {
      warnings.push(
        `Amazon: rows span ${[...months].join(', ')}. Settlement windows straddle month ends — ` +
          'check this is the window you meant to close.',
      );
    }

    const crossChecks: CrossCheck[] = [
      {
        label: 'Amazon net revenue (product sales + shipping + rebates)',
        amount: r2(revenue),
        against: 'rev_amazon',
        note: 'Hold against Tally Ecommerce Sales. July 2026 agreed to 0.18%.',
      },
      {
        label: 'Amazon fees (selling, FBA, other transaction)',
        amount: r2(fees),
        against: 'ff_channel_fees',
        note: 'Per-SKU portion only.',
      },
      {
        label: 'Amazon fees not attributed to a SKU (storage, removals, easy-ship)',
        amount: r2(unallocatedFees),
        against: 'ff_channel_fees',
      },
      {
        label: 'Amazon advertising',
        amount: r2(adSpend),
        against: 'sm_total',
        note: 'Reported as a service fee, not as marketing — it is invisible unless split out like this.',
      },
      {
        label: 'Bank transfers out (not a cost)',
        amount: r2(transfers),
        note: 'Settlement moving to the bank. Listed so it is visibly excluded rather than silently dropped.',
      },
    ];

    return { nodes: [], skuRows, bomCosts: [], crossChecks, warnings };
  },
};

// ---- Amazon: business report (traffic) -------------------------------------

const amazonBusinessReport: SourceAdapter = {
  kind: 'amazonSales',
  label: 'Amazon business report',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [/businessreport/, /ordered product sales/, /unit session percentage/, /\(child\) asin/]),
  parse: ({ workbook, sourceId, file }): AdapterResult => {
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    const hi = findHeader(rows, ['sku', 'units ordered']);
    if (hi < 0) return empty(['Amazon business report: no "SKU / Units Ordered" header row found.']);

    const header = (rows[hi] ?? []).map(lower);
    const ix = {
      sku: col(header, 'sku'),
      title: col(header, 'title'),
      units: col(header, 'units ordered'),
      sales: col(header, 'ordered product sales'),
    };
    if (ix.sales < 0) return headerMiss('Amazon business report', ['ordered product sales'], header);

    const p = provenanceFor(sourceId, file.name, 'Amazon business report');
    const skuRows: SkuRow[] = [];
    let revenue = 0;

    for (const row of rows.slice(hi + 1)) {
      const sku = cell(row[ix.sku]);
      if (!sku) continue;
      const rev = num(row[ix.sales]);
      const units = num(row[ix.units]);
      if (rev === 0 && units === 0) continue;
      revenue += rev;
      skuRows.push({
        platform: 'amazon',
        key: sku,
        keyKind: 'sku',
        name: cell(row[ix.title]) || undefined,
        revenue: r2(rev),
        units,
        fees: 0,
        provenance: p,
      });
    }

    return {
      nodes: [],
      skuRows,
      bomCosts: [],
      crossChecks: [{ label: 'Amazon ordered product sales (gross)', amount: r2(revenue), against: 'rev_amazon' }],
      warnings: [
        'Amazon business report carries no fees and is gross of refunds, so it cannot price a month on its own. ' +
          'Use the unified transaction file for revenue and margin; this one is for sessions and conversion.',
      ],
    };
  },
};

// ---- Shopify: total sales by product variant -------------------------------

const shopifyVariantSales: SourceAdapter = {
  kind: 'shopifySales',
  label: 'Shopify / D2C sales by variant',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [/product variant sku/, /net items sold/, /sales reversals/, /shopify/]),
  parse: ({ workbook, sourceId, file }): AdapterResult => {
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    const hi = findHeader(rows, ['product title', 'net sales']);
    if (hi < 0) return empty(['Shopify: no "Product title / Net sales" header row found.']);

    const header = (rows[hi] ?? []).map(lower);
    const ix = {
      sku: col(header, 'product variant sku', 'variant sku', 'sku'),
      title: col(header, 'product title'),
      units: col(header, 'net items sold', 'net quantity'),
      net: col(header, 'net sales'),
    };
    if (ix.net < 0 || ix.title < 0) return headerMiss('Shopify', ['net sales', 'product title'], header);

    const p = provenanceFor(sourceId, file.name, 'Shopify sales by product variant');
    const skuRows: SkuRow[] = [];
    let revenue = 0;
    let titleKeyed = 0;
    let titleKeyedRows = 0;

    for (const row of rows.slice(hi + 1)) {
      const title = cell(row[ix.title]);
      const sku = ix.sku >= 0 ? cell(row[ix.sku]) : '';
      if (!title && !sku) continue;

      const rev = num(row[ix.net]);
      const units = num(row[ix.units]);
      if (rev === 0 && units === 0) continue;

      revenue += rev;
      // July's orders were placed against variants that had no SKU set at the
      // time — Shopify reports the SKU as it was, so this cannot be fixed by
      // re-exporting. Dropping the row would lose a third of D2C revenue, so
      // it keys on the title instead and says so.
      const byTitle = !sku;
      if (byTitle) {
        titleKeyed += rev;
        titleKeyedRows += 1;
      }

      skuRows.push({
        platform: 'shopify',
        key: byTitle ? title : sku,
        keyKind: byTitle ? 'title' : 'sku',
        name: title || undefined,
        revenue: r2(rev),
        units,
        fees: 0,
        provenance: p,
      });
    }

    const warnings: string[] = [];
    if (titleKeyedRows > 0) {
      warnings.push(
        `Shopify: ${titleKeyedRows} row${titleKeyedRows === 1 ? '' : 's'} carrying ` +
          `₹${Math.round(titleKeyed).toLocaleString('en-IN')} have a blank variant SKU and are keyed on the ` +
          'product title instead. Re-exporting will not fix it — those orders were placed before the variants ' +
          'had SKUs. Confirm each title mapping before emitting.',
      );
    }

    return {
      nodes: [],
      skuRows,
      bomCosts: [],
      crossChecks: [
        {
          label: 'Shopify net sales',
          amount: r2(revenue),
          against: 'rev_d2c',
          note: 'Tally D2C Sales also carries non-Shopify D2C, so a small gap is expected.',
        },
      ],
      warnings,
    };
  },
};

// ---- Blinkit: order-level charges out of the payout ZIP --------------------

const blinkitPayout: SourceAdapter = {
  kind: 'blinkitSettlement',
  label: 'Blinkit payout (order-level charges)',
  sniff: (wb, fileName) =>
    sniffOn(`${hayFor(wb, fileName)} ${wb.SheetNames.join(' ').toLowerCase()}`, [
      /blinkit/,
      /forward & return orders/,
      /payout breakup/,
      /item level payout/,
      /order_level_charges/,
    ]),
  parse: ({ workbook, sourceId, file }): AdapterResult => {
    const orderSheet = workbook.SheetNames.find((n) => /forward\s*&?\s*return\s*orders/i.test(n));
    if (!orderSheet) {
      return empty([
        `Blinkit: no "Forward & Return Orders" sheet in "${file.name}". The payout ZIP holds six workbooks — ` +
          'this adapter wants "A&B. Order_level_charges.xlsx", which is the only one with item detail.',
      ]);
    }

    const rows = sheetRows(workbook, orderSheet);
    const hi = findHeader(rows, ['item id', 'quantity']);
    if (hi < 0) return empty([`Blinkit: no "Item ID / Quantity" header row on sheet "${orderSheet}".`]);

    const header = (rows[hi] ?? []).map(lower);
    const ix = {
      item: col(header, 'item id'),
      name: col(header, 'product name'),
      qty: col(header, 'quantity'),
      gross: col(header, 'total gross bill amount'),
      commission: col(header, 'commission charge (rs)'),
      commissionGst: col(header, 'commission gst (rs)'),
      shipping: col(header, 'shipping charge (rs)'),
      shippingGst: col(header, 'shipping gst (rs)'),
    };
    if (ix.gross < 0) return headerMiss('Blinkit', ['total gross bill amount'], header);

    const p = provenanceFor(sourceId, file.name, `Blinkit ${orderSheet}`);
    const skuRows: SkuRow[] = [];
    let gross = 0;
    let fees = 0;

    for (const row of rows.slice(hi + 1)) {
      const item = cell(row[ix.item]);
      if (!item) continue;
      const rev = num(row[ix.gross]);
      const rowFees =
        num(row[ix.commission]) + num(row[ix.commissionGst]) + num(row[ix.shipping]) + num(row[ix.shippingGst]);
      if (rev === 0 && rowFees === 0) continue;

      gross += rev;
      fees += rowFees;
      skuRows.push({
        platform: 'blinkit',
        key: item,
        keyKind: 'sku',
        name: cell(row[ix.name]) || undefined,
        revenue: r2(rev),
        units: num(row[ix.qty]),
        fees: r2(rowFees),
        provenance: p,
      });
    }

    const crossChecks: CrossCheck[] = [
      {
        label: 'Blinkit gross bill (items)',
        amount: r2(gross),
        against: 'rev_blinkit',
        note: 'Tally Quick Commerce Sales can be net negative when credit notes land in a later month — compare before accepting either.',
      },
      { label: 'Blinkit commission and shipping', amount: r2(fees), against: 'ff_channel_fees' },
    ];

    // The payout summary rides in every workbook in the ZIP; read it if present.
    const payoutSheet = workbook.SheetNames.find((n) => /payout breakup/i.test(n));
    if (payoutSheet) {
      const net = sheetRows(workbook, payoutSheet).find((r) => /net payout in this cycle/i.test(cell(r[1])));
      if (net) {
        const amount = num(net[net.length - 1]);
        if (amount !== 0) {
          crossChecks.push({
            label: 'Blinkit net payout this cycle',
            amount: r2(amount),
            note: 'After commission, shipping, storage and TDS. Cash, not revenue.',
          });
        }
      }
    }

    return { nodes: [], skuRows, bomCosts: [], crossChecks, warnings: [] };
  },
};

// ---- Shiprocket: wallet passbook -------------------------------------------

/**
 * Lines that move money INTO the wallet rather than record a cost.
 *
 * These are the largest positive amounts in the file by a wide margin — July's
 * were ₹1.38 L against ₹1.87 L of actual freight — so a parser that sums the
 * Amount column lands roughly 74% light on freight and calls it a rounding
 * difference.
 */
const SHIPROCKET_WALLET = /^(freight charges deducted against cod|bank referenceno)/i;

const shiprocketPassbook: SourceAdapter = {
  kind: 'shiprocketFreight',
  label: 'Shiprocket passbook',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [
      /shiprocket/,
      /available balance/,
      /awb code/,
      /channel order id/,
      /forward charges applied/,
    ]),
  parse: ({ workbook }): AdapterResult => {
    const rows = sheetRows(workbook, workbook.SheetNames[0]);
    const hi = findHeader(rows, ['amount', 'description']);
    if (hi < 0) return empty(['Shiprocket: no "Amount / Description" header row found.']);

    const header = (rows[hi] ?? []).map(lower);
    const ix = {
      date: col(header, 'created at'),
      amount: col(header, 'amount'),
      desc: col(header, 'description'),
    };

    const byFamily = new Map<string, number>();
    const months = new Set<string>();
    let net = 0;
    let wallet = 0;

    for (const row of rows.slice(hi + 1)) {
      const desc = cell(row[ix.desc]);
      if (!desc) continue;
      const amount = num(row[ix.amount]);

      const stamp = cell(row[ix.date]).match(/\d{1,2}-([A-Za-z]{3})-(\d{4})/);
      if (stamp) months.add(`${stamp[1]} ${stamp[2]}`);

      if (SHIPROCKET_WALLET.test(desc)) {
        wallet += amount;
        continue;
      }

      // "Credit note for lost shipment #SF254..." and "CRF_ID : 13158336" carry
      // a per-shipment id; the family is what is worth totalling.
      const family = desc.split('#')[0].split('CRF_ID')[0].trim();
      byFamily.set(family, (byFamily.get(family) ?? 0) + amount);
      net += amount;
    }

    if (byFamily.size === 0) return empty(['Shiprocket: no charge rows found once wallet transfers were excluded.']);

    const crossChecks: CrossCheck[] = [
      {
        label: 'Shiprocket net freight and charges',
        amount: r2(-net),
        against: 'ff_freight_out',
        note: 'A cost, shown positive. The passbook carries no SKU, so this cannot be pushed down to products.',
      },
      {
        label: 'COD and wallet transfers in (not income)',
        amount: r2(wallet),
        note: 'Money moving into the Shiprocket wallet. Excluded — summing the Amount column without this lands ~74% light on freight.',
      },
      ...[...byFamily.entries()]
        .sort((a, b) => a[1] - b[1])
        .slice(0, 8)
        .map(([family, amount]) => ({ label: `  ${family}`, amount: r2(-amount) })),
    ];

    const warnings: string[] = [];
    if (months.size > 1) {
      warnings.push(`Shiprocket: rows span ${[...months].join(', ')} — the passbook window is not a calendar month.`);
    }

    return { nodes: [], skuRows: [], bomCosts: [], crossChecks, warnings };
  },
};

// ---- Tranzact: BOM pricing -------------------------------------------------

const tranzactBom: SourceAdapter = {
  kind: 'tranzactBom',
  label: 'Tranzact BOM pricing',
  sniff: (wb, fileName) =>
    sniffOn(hayFor(wb, fileName), [/boms_pricing/, /total fg cost/, /fg item id/, /bom number/, /child bom other cost/]),
  parse: ({ workbook, sourceId, file }): AdapterResult => {
    const sheet = workbook.SheetNames.find((n) => /summary/i.test(n)) ?? workbook.SheetNames[0];
    const rows = sheetRows(workbook, sheet);
    const hi = findHeader(rows, ['fg item id', 'total fg cost']);
    if (hi < 0) {
      return empty([
        `Tranzact BOM: no "FG Item ID / Total FG Cost" header row on sheet "${sheet}". ` +
          'Export from Bill of Materials with pricing, not the plain BOM list.',
      ]);
    }

    const header = (rows[hi] ?? []).map(lower);
    const ix = {
      fg: col(header, 'fg item id'),
      bom: col(header, 'bom number'),
      name: col(header, 'bom name'),
      cost: col(header, 'total fg cost'),
    };

    const p = provenanceFor(sourceId, file.name, `Tranzact BOM pricing (${sheet})`);
    const byBom = new Map<string, BomCost>();
    const skippedFg = new Set<string>();

    for (const row of rows.slice(hi + 1)) {
      const fgId = cell(row[ix.fg]).toUpperCase();
      const bomNumber = cell(row[ix.bom]);
      if (!fgId || !bomNumber) continue;
      // Sub-assemblies and raw materials share the sheet; only finished goods
      // have a unit cost worth attaching to a sold SKU.
      if (!/^FG-\d+/.test(fgId)) {
        skippedFg.add(fgId.split('-')[0]);
        continue;
      }
      // The total repeats on the BOM's first RM line only; the rest are blank.
      const raw = row[ix.cost];
      if (raw === null || raw === undefined || cell(raw) === '') continue;
      const costPerUnit = num(raw);
      if (costPerUnit <= 0) continue;
      if (byBom.has(bomNumber)) continue;

      byBom.set(bomNumber, {
        fgId,
        bomNumber,
        bomName: cell(row[ix.name]),
        costPerUnit: r2(costPerUnit),
        provenance: p,
      });
    }

    const bomCosts = [...byBom.values()].sort((a, b) => a.fgId.localeCompare(b.fgId));
    const warnings: string[] = [];

    if (bomCosts.length === 0) {
      warnings.push('Tranzact BOM: the header matched but no finished good carried a Total FG Cost.');
    }

    // An FG with two BOMs is legitimate (an OEM variant of the same finished
    // good), but it has to be chosen rather than picked arbitrarily.
    const perFg = new Map<string, BomCost[]>();
    for (const b of bomCosts) perFg.set(b.fgId, [...(perFg.get(b.fgId) ?? []), b]);
    for (const [fgId, list] of perFg) {
      if (list.length > 1) {
        const primary = [...list].sort((a, b) => a.bomNumber.localeCompare(b.bomNumber))[0];
        warnings.push(
          `${fgId} has ${list.length} BOMs with different costs: ` +
            list.map((b) => `${b.bomNumber} ₹${b.costPerUnit}`).join(', ') +
            `. ${primary.bomNumber} is used as the original BOM for the item — if this channel sells the ` +
            'other variant, say so before emitting.',
        );
      }
    }

    return { nodes: [], skuRows: [], bomCosts, crossChecks: [], warnings };
  },
};

export const PLATFORM_ADAPTERS: SourceAdapter[] = [
  amazonSettlement,
  amazonBusinessReport,
  shopifyVariantSales,
  blinkitPayout,
  shiprocketPassbook,
  tranzactBom,
];

/** Exported for the UI, so the source-type picker lists them with what they are. */
export const PLATFORM_SOURCE_KINDS: { kind: SourceKind; label: string; platform?: SkuPlatform }[] = [
  { kind: 'amazonSettlement', label: 'Amazon unified transaction', platform: 'amazon' },
  { kind: 'amazonSales', label: 'Amazon business report', platform: 'amazon' },
  { kind: 'shopifySales', label: 'Shopify / D2C sales by variant', platform: 'shopify' },
  { kind: 'blinkitSettlement', label: 'Blinkit payout', platform: 'blinkit' },
  { kind: 'shiprocketFreight', label: 'Shiprocket passbook', platform: 'shiprocket' },
  { kind: 'tranzactBom', label: 'Tranzact BOM pricing' },
];
