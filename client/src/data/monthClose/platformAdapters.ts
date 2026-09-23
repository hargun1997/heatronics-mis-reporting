// ----------------------------------------------------------------------------
// Platform adapters — Amazon, Shopify, Blinkit, Shiprocket.
//
// Each declares the columns it needs as a set of header aliases rather than
// fixed positions, because these exports move columns around between versions
// far more often than Tally does.
//
// HONESTY NOTE: the alias lists below were written from the documented and
// commonly-seen column names for each platform, NOT from Heatronics' actual
// exports, which were not available when this was built. They are a starting
// point. When one fails it reports every header it actually saw, so correcting
// it against a real file is a one-line edit to the alias list — that diagnostic
// is the point of the design, not a nicety.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { toAmount, type AdapterInput, type AdapterResult, type SourceAdapter } from './adapters';
import type { Platform } from './skuMap';
import type { Provenance, SkuRow, SourceKind } from './schema';

type Field = 'sku' | 'name' | 'revenue' | 'units' | 'fees';

interface ColumnSpec {
  field: Field;
  aliases: RegExp[];
  required: boolean;
}

interface PlatformSpec {
  kind: SourceKind;
  platform: Platform;
  label: string;
  /** Header or filename words that identify this export. */
  sniff: RegExp[];
  columns: ColumnSpec[];
  /** Fees are a cost; some exports print them negative, some positive. */
  feesArePositiveCost?: boolean;
}

const SPECS: PlatformSpec[] = [
  {
    kind: 'amazonSales',
    platform: 'amazon',
    label: 'Amazon (sales / settlement)',
    sniff: [/\basin\b/, /ordered product sales/, /amazon/, /\bfba\b/, /settlement-id/],
    columns: [
      { field: 'sku', aliases: [/^sku$/, /seller.?sku/, /merchant.?sku/, /\basin\b/], required: true },
      { field: 'name', aliases: [/product.?name/, /title/, /item.?name/], required: false },
      {
        field: 'revenue',
        aliases: [/ordered product sales/, /product.?sales/, /item.?price/, /principal/, /net.?sales/],
        required: true,
      },
      { field: 'units', aliases: [/units.?ordered/, /quantity.?purchased/, /^quantity$/, /^units$/], required: false },
      { field: 'fees', aliases: [/fee.?amount/, /selling.?fees/, /fba.?fees/, /total.?fees/], required: false },
    ],
  },
  {
    kind: 'shopifySales',
    platform: 'shopify',
    label: 'Shopify / D2C (sales by product)',
    sniff: [/shopify/, /product variant/, /net sales/, /product title/],
    columns: [
      {
        field: 'sku',
        aliases: [/variant.?sku/, /product.?variant.?sku/, /^sku$/, /variant.?id/],
        required: true,
      },
      { field: 'name', aliases: [/product.?title/, /product.?name/, /variant.?title/], required: false },
      { field: 'revenue', aliases: [/net.?sales/, /total.?sales/, /gross.?sales/], required: true },
      { field: 'units', aliases: [/net.?quantity/, /quantity.?ordered/, /^quantity$/, /units/], required: false },
      { field: 'fees', aliases: [/^fees$/, /transaction.?fees/], required: false },
    ],
  },
  {
    kind: 'blinkitSettlement',
    platform: 'blinkit',
    label: 'Blinkit (settlement)',
    sniff: [/blinkit/, /grofers/, /settlement/],
    columns: [
      { field: 'sku', aliases: [/item.?code/, /^sku$/, /product.?id/, /item.?id/], required: true },
      { field: 'name', aliases: [/item.?name/, /product.?name/], required: false },
      { field: 'revenue', aliases: [/settlement.?value/, /net.?settlement/, /net.?amount/, /sales/], required: true },
      { field: 'units', aliases: [/^qty$/, /quantity/, /units/], required: false },
      { field: 'fees', aliases: [/commission/, /marketplace.?fee/, /total.?deduction/], required: false },
    ],
  },
  {
    kind: 'shiprocketFreight',
    platform: 'shiprocket',
    label: 'Shiprocket (freight)',
    sniff: [/shiprocket/, /\bawb\b/, /freight.?charge/, /courier/],
    columns: [
      { field: 'sku', aliases: [/^sku$/, /product.?sku/, /item.?sku/], required: true },
      { field: 'name', aliases: [/product.?name/, /item.?name/], required: false },
      // Shiprocket is a cost file: there is no revenue, so freight lands in fees
      // and revenue stays nil. `fees` is the required column here.
      { field: 'revenue', aliases: [/order.?value/, /product.?value/], required: false },
      { field: 'units', aliases: [/^qty$/, /quantity/, /units/], required: false },
      { field: 'fees', aliases: [/freight.?(total|charge)/, /shipping.?charge/, /^charges?$/, /total.?charge/], required: true },
    ],
  },
];

function headerRow(rows: unknown[][]): { idx: number; header: string[] } {
  // The header is the first row with two or more non-empty text cells.
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map((c) => String(c ?? '').trim().toLowerCase());
    if (cells.filter(Boolean).length >= 2) return { idx: i, header: cells };
  }
  return { idx: -1, header: [] };
}

function resolveColumns(
  header: string[],
  columns: ColumnSpec[],
): { resolved: Partial<Record<Field, number>>; missing: Field[] } {
  const resolved: Partial<Record<Field, number>> = {};
  const missing: Field[] = [];

  for (const spec of columns) {
    const idx = header.findIndex((h) => h && spec.aliases.some((re) => re.test(h)));
    if (idx >= 0) resolved[spec.field] = idx;
    else if (spec.required) missing.push(spec.field);
  }
  return { resolved, missing };
}

function makeAdapter(spec: PlatformSpec): SourceAdapter {
  return {
    kind: spec.kind,
    label: spec.label,
    sniff: (wb, fileName) => {
      const hay = `${wb.SheetNames.join(' ')} ${fileName} ${firstRowsText(wb)}`.toLowerCase();
      const hits = spec.sniff.filter((re) => re.test(hay)).length;
      if (hits === 0) return 0.05;
      return Math.min(0.55 + hits * 0.15, 1);
    },
    parse: (input: AdapterInput): AdapterResult => parsePlatform(spec, input),
  };
}

function firstRowsText(wb: XLSX.WorkBook): string {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return '';
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
  return rows.slice(0, 6).flat().map((c) => String(c ?? '')).join(' ');
}

function parsePlatform(spec: PlatformSpec, { workbook, sourceId, file }: AdapterInput): AdapterResult {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = ws
    ? (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as unknown[][])
    : [];

  const warnings: string[] = [];
  const { idx, header } = headerRow(rows);

  if (idx < 0) {
    return { nodes: [], skuRows: [], warnings: [`${spec.label}: no header row found in "${file.name}".`] };
  }

  const { resolved, missing } = resolveColumns(header, spec.columns);

  if (missing.length > 0) {
    // The diagnostic that makes this correctable without guessing twice.
    return {
      nodes: [],
      skuRows: [],
      warnings: [
        `${spec.label}: could not find ${missing.map((m) => `a ${m} column`).join(' and ')}. ` +
          `Headers actually present: ${header.filter(Boolean).join(' | ') || '(none)'}. ` +
          'Add the real header name to the alias list in platformAdapters.ts.',
      ],
    };
  }

  const provenance: Provenance = {
    sourceId,
    sourceLabel: file.name,
    method: 'xlsx',
    confidence: 'exact',
    verified: true,
    note: spec.label,
  };

  const skuRows: SkuRow[] = [];
  let skipped = 0;

  for (const row of rows.slice(idx + 1)) {
    const key = String(row[resolved.sku!] ?? '').trim();
    if (!key) {
      skipped++;
      continue;
    }

    const revenue = resolved.revenue !== undefined ? toAmount(row[resolved.revenue]) ?? 0 : 0;
    const units = resolved.units !== undefined ? toAmount(row[resolved.units]) ?? 0 : 0;
    const feesRaw = resolved.fees !== undefined ? toAmount(row[resolved.fees]) ?? 0 : 0;
    // Normalise fees to a positive cost whichever way the export signs them.
    const fees = Math.abs(feesRaw);

    if (revenue === 0 && units === 0 && fees === 0) {
      skipped++;
      continue;
    }

    skuRows.push({
      platform: spec.platform,
      key,
      name: resolved.name !== undefined ? String(row[resolved.name] ?? '').trim() || undefined : undefined,
      revenue,
      units,
      fees,
      provenance,
    });
  }

  if (skuRows.length === 0) {
    warnings.push(`${spec.label}: header matched but no rows carried a SKU and a value.`);
  }
  if (skipped > 0) {
    warnings.push(`${spec.label}: skipped ${skipped} row${skipped === 1 ? '' : 's'} with no SKU or all-zero values.`);
  }

  // These exports carry no ledger tree — they feed the SKU layer only.
  return { nodes: [], skuRows, warnings };
}

export const PLATFORM_ADAPTERS: SourceAdapter[] = SPECS.map(makeAdapter);

/** Exported for the UI, so the source-type picker lists them with what they are. */
export const PLATFORM_SOURCE_KINDS = SPECS.map((s) => ({
  kind: s.kind,
  label: s.label,
  platform: s.platform,
}));
