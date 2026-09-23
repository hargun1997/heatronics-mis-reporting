// ----------------------------------------------------------------------------
// Acceptance test for the month close.
//
// Four sections, each pinning something that has already cost a round of
// rework:
//
//   1. the committed Jul-2026 cascade, replayed from its ledgers
//   2. the real Jul-2026 Tally workbook, parsed end to end
//   3. emit, compared field by field against what is published
//   4. the platform exports, against redacted cuts of the real July files
//
//   npx tsx scripts/verify-month-close.ts
//
// If this fails, the engine has drifted from a month that has already been
// published — fix the engine, not the fixture.
// ----------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { ADAPTERS, claimAdapter } from '../client/src/data/monthClose/adapterRegistry';
import type { AdapterResult } from '../client/src/data/monthClose/adapters';
import { computeClose } from '../client/src/data/monthClose/compute';
import { emitClose } from '../client/src/data/monthClose/emit';
import { MONTHLY_MIS } from '../client/src/data/misDeck/misDeckData';
import { buildCostBook, costFor } from '../client/src/data/monthClose/skuRollup';
import { lookupSku, platformKey } from '../client/src/data/monthClose/skuMap';
import {
  emptySession,
  type LedgerNode,
  type MonthCloseSession,
  type Provenance,
  type UploadedSource,
} from '../client/src/data/monthClose/schema';

const P: Provenance = {
  sourceId: 'fixture',
  sourceLabel: 'Jul-2026 Tally P&L (fixture)',
  method: 'xlsx',
  confidence: 'exact',
  verified: true,
};

/** depth, name, amount — mirrors the Tally tree as the workbook prints it. */
type Row = [number, string, number];

function tree(rows: Row[]): LedgerNode[] {
  const stack: string[] = [];
  return rows.map(([depth, name, amount], i) => {
    stack.length = depth;
    const path = [...stack];
    stack[depth] = name;
    const next = rows[i + 1];
    return {
      name,
      depth,
      path,
      amount,
      isLeaf: !next || next[0] <= depth,
      provenance: P,
    };
  });
}

// ---- The July close, as Tally printed it after both corrections ------------
// (closing stock re-valued to 1,40,12,391; employee cost taken as the debit
// total of 2,19,204 once the credit was fixed at source)

const JULY_LEDGERS = tree([
  [0, 'Sales Accounts', 5256799.51],
  [1, 'D2C Sales', 1316297.46],
  [1, 'Ecommerce Sales', 1196831.31],
  [1, 'OEM Sales', 1895500],
  [1, 'Offline Sales', 471081.26],
  [1, 'Quick Commerce Sales', -2666.66],
  [1, 'Stock Transfers (internal)', 379756.14],

  [0, 'Opening Stock', 14457824],
  [0, 'Closing Stock', 14012391],

  [0, 'Purchase Accounts', 1667727.63],
  [1, 'Raw Material Purchases', 1286280.79],
  [1, 'Stock Transfer (inward)', 381446.84],

  [0, 'Direct Expenses', 1094491.03],
  [1, 'Factory Overheads', 395615],
  [1, 'Inward Freight', 36584],
  [1, 'Manufacturing Costs', 662292.03],
  [2, 'Additional Charges - Purchase', 5788],
  [2, 'Job Work Charges', 296823.03],
  [2, 'Manufacturing Wages', 359681],

  [0, 'Indirect Expenses', 2405697.23],
  [1, 'Channel Fees & Commissions', 474617.87],
  [2, 'Amazon Channel Fees', 269731.13],
  [2, 'Blinkit Channel Fees', 8223.93],
  [2, 'D2C Fees', 44101.78],
  [2, 'Freight Charges (Shiprocket)', 152561.03],
  [1, 'Shipping Charges', 5119],
  [1, 'Freight Outward Exp. - Porter/Transport', 3800],
  [1, 'Sales & Marketing', 1622149.83],
  [2, 'D2C Marketing', 1008859.7],
  [2, 'Ecommerce Marketing', 613290.13],
  [1, 'Employee Cost - Indirect', 219204],
  [1, 'Professional Fees', 36000],
  [1, 'Admin & General Expenses', 22276.42],
  [1, 'After-Sales & Warranty', 10589.32],
  [1, 'Staff Welfare', 9370],
  [1, 'Bank Charges', 2575],
  [1, 'Financial Adjustments (net)', -4.21],

  [0, 'Indirect Incomes', 5221.53],
]);

const session: MonthCloseSession = {
  ...emptySession('2026-07', 'Jul 2026'),
  sources: [
    {
      id: 'fixture',
      label: 'Jul-2026 Tally P&L (fixture)',
      kind: 'tallyPnl',
      method: 'xlsx',
      addedAt: new Date(0).toISOString(),
      nodes: JULY_LEDGERS,
      skuRows: [],
      bomCosts: [],
      crossChecks: [],
      warnings: [],
    },
  ],
  anchor: { nettProfit: { value: -351328, provenance: P } },
};

// ---- Expected, lifted from the committed misDeckData.ts entry --------------

const EXPECTED: Record<string, number> = {
  netRevenue: 4877043.37,
  cogm: 2826204.82,
  grossMargin: 2050838.55,
  channelFulfillment: 483536.87,
  cm1: 1567301.68,
  salesMarketing: 1622149.83,
  cm2: -54848.15,
  cm3: -54848.15,
  opex: 294789,
  ebitda: -349637.15,
  netIncome: -349637.15,
  stockMovement: 445433,
};

const EXPECTED_CHANNELS: Record<string, number> = {
  D2C: 1316297.46,
  Amazon: 1196831.31,
  OEM: 1895500,
  Offline: 471081.26,
  Blinkit: -2666.66,
};

const c = computeClose(session);

let failures = 0;
const check = (label: string, got: number, want: number, tol = 0.01) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  const mark = ok ? '  ok' : 'FAIL';
  console.log(`${mark}  ${label.padEnd(22)} got ${fmt(got).padStart(16)}   want ${fmt(want).padStart(16)}`);
};

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

console.log('\nJul-2026 cascade\n');
for (const [k, want] of Object.entries(EXPECTED)) {
  check(k, (c as unknown as Record<string, number>)[k], want);
}

console.log('\nChannel split\n');
for (const [ch, want] of Object.entries(EXPECTED_CHANNELS)) {
  check(ch, c.netByChannel[ch as keyof typeof c.netByChannel] ?? NaN, want);
}

console.log('\nReconciliation to Tally\n');
check('tally nett', c.reconciliation.tallyNett ?? NaN, -351328);
check('difference', c.reconciliation.difference ?? NaN, 1690.85);
check('STR asymmetry', c.reconciliation.items[0]?.amount ?? NaN, 1690.7);
check('residual', c.reconciliation.residual ?? NaN, 0.15);

if (!c.reconciliation.ok) {
  failures++;
  console.log('FAIL  reconciliation did not tie within tolerance');
} else {
  console.log('  ok  reconciliation ties within ±₹1');
}

console.log('\nLedger map coverage\n');
if (c.unmapped.length === 0) {
  console.log('  ok  every ledger in the fixture resolved to a line');
} else {
  failures++;
  console.log(`FAIL  ${c.unmapped.length} unmapped: ${c.unmapped.map((n) => n.name).join(', ')}`);
}

const blocking = c.blockers.filter((b) => !b.advisory);
if (blocking.length === 0) {
  console.log('  ok  no blockers on a complete, verified month');
} else {
  failures++;
  console.log(`FAIL  ${blocking.length} blocker(s): ${blocking.map((b) => b.message).join(' | ')}`);
}

for (const b of c.blockers.filter((x) => x.advisory)) console.log(`  --  advisory: ${b.message}`);

// ---------------------------------------------------------------------------
// End-to-end: the real Jul-2026 workbook through the adapter.
//
// Heatronics_PnL_Jul2026.xlsx is the FIRST-pass close — flat closing stock and
// the un-fixed net payroll credit — so it should reproduce that workbook's own
// stated Nett Profit of 3,39,196.15, not the final published loss. Tying to it
// exercises the parser, the indent walk, contra handling and both sign flips.
// ---------------------------------------------------------------------------

console.log('\nEnd-to-end: Heatronics_PnL_Jul2026.xlsx through the tallyPnl adapter\n');

const workbook = XLSX.readFile(new URL('../Heatronics_PnL_Jul2026.xlsx', import.meta.url).pathname);
const adapter = ADAPTERS.find((a) => a.kind === 'tallyPnl')!;
const parsed = adapter.parse({
  workbook,
  sourceId: 'wb',
  file: { name: 'Heatronics_PnL_Jul2026.xlsx' } as File,
});

console.log(`  --  parsed ${parsed.nodes.length} ledger rows`);
for (const w of parsed.warnings) console.log(`  --  warning: ${w}`);

const wbSession: MonthCloseSession = {
  ...emptySession('2026-07', 'Jul 2026'),
  sources: [
    {
      id: 'wb',
      label: 'Heatronics_PnL_Jul2026.xlsx',
      kind: 'tallyPnl',
      method: 'xlsx',
      addedAt: new Date(0).toISOString(),
      nodes: parsed.nodes,
      skuRows: [],
      bomCosts: [],
      crossChecks: [],
      warnings: parsed.warnings,
    },
  ],
  // Deliberately no manual entry: opening and closing stock must come out of
  // the workbook itself. The Trading Account prints closing stock as
  // "Less: Closing Stock" with a negative amount, and getting either the
  // prefix or the sign wrong inflates COGM by the whole stock balance.
  anchor: { nettProfit: { value: 339196.15, provenance: P } },
};

const w = computeClose(wbSession);

check('netRevenue', w.netRevenue, 4877043.37);
check('cogm', w.cogm, 2380771.82);
check('channelFulfillment', w.channelFulfillment, 483536.87);
check('salesMarketing', w.salesMarketing, 1622149.83);
check('opex', w.opex, 49698);
check('ebitda', w.ebitda, 340886.85);
check('residual vs Tally', w.reconciliation.residual ?? NaN, 0);

if (w.unmapped.length === 0) {
  console.log('  ok  no unmapped ledgers in the real workbook');
} else {
  failures++;
  console.log(`FAIL  unmapped: ${w.unmapped.map((n) => `${n.name} (${fmt(n.amount)})`).join(', ')}`);
}

const flatStock = w.blockers.find((b) => b.ref === 'cogm_close');
const payrollFlag = w.blockers.find((b) => b.ref === 'op_payroll');
console.log(flatStock ? '  ok  flat closing stock flagged' : 'FAIL  flat closing stock not flagged');
console.log(payrollFlag ? '  ok  net payroll credit flagged' : 'FAIL  net payroll credit not flagged');
if (!flatStock || !payrollFlag) failures++;

// ---------------------------------------------------------------------------
// Emit: the entry the dashboard produces must equal the one already committed.
// ---------------------------------------------------------------------------

console.log('\nEmit vs the committed MONTHLY_MIS entry\n');

const emitted = emitClose(session, c, 'fixture').entry;
const committed = MONTHLY_MIS.find((m) => m.key === '2026-07');

if (!committed) {
  failures++;
  console.log('FAIL  no 2026-07 entry in MONTHLY_MIS to compare against');
} else {
  const numericFields = [
    'netRevenue', 'grossMargin', 'cm1', 'cm2', 'cm3', 'ebitda', 'netIncome',
    'cogm', 'channelFulfillment', 'salesMarketing', 'platformCosts', 'opex', 'nonOperating',
  ] as const;
  for (const f of numericFields) check(f, emitted[f] as number, committed[f] as number);

  for (const [label, want] of Object.entries(committed.cogmLines)) {
    check(`cogm: ${label.slice(0, 14)}`, emitted.cogmLines[label] ?? NaN, want);
  }
  for (const [label, want] of Object.entries(committed.opexLines)) {
    check(`opex: ${label.slice(0, 14)}`, emitted.opexLines[label] ?? NaN, want);
  }
}

// ---------------------------------------------------------------------------
// Platform exports: the real files, redacted.
//
// scripts/fixtures/ holds a cut of each July 2026 export, with customer-
// identifying columns blanked and enough rows kept to exercise every trap the
// real files sprang. The numbers asserted here are what the FULL files produce
// where a fixture carries the whole thing (Shopify), and what the cut produces
// where it does not. Either way, a platform renaming a column or flipping a
// sign fails here rather than in a published month.
// ---------------------------------------------------------------------------

console.log('\nPlatform adapters against the real exports\n');

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;

function ingest(fileName: string): { source: UploadedSource; result: AdapterResult } {
  const wb = XLSX.read(fs.readFileSync(FIXTURES + fileName), { type: 'buffer' });
  const claim = claimAdapter(wb, fileName);
  if (!claim) throw new Error(`no adapter claimed ${fileName}`);
  const result = claim.adapter.parse({ workbook: wb, sourceId: fileName, file: { name: fileName } as File });
  return {
    result,
    source: {
      id: fileName,
      label: fileName,
      kind: claim.adapter.kind,
      method: 'xlsx',
      addedAt: new Date(0).toISOString(),
      nodes: result.nodes,
      skuRows: result.skuRows ?? [],
      bomCosts: result.bomCosts ?? [],
      crossChecks: result.crossChecks ?? [],
      warnings: result.warnings,
    },
  };
}

const claimed = (fileName: string, want: string) => {
  const wb = XLSX.read(fs.readFileSync(FIXTURES + fileName), { type: 'buffer' });
  const claim = claimAdapter(wb, fileName);
  const ok = claim?.adapter.kind === want;
  if (!ok) failures++;
  console.log(
    ok
      ? `  ok  ${fileName.padEnd(34)} claimed by ${want}`
      : `FAIL  ${fileName} claimed by ${claim?.adapter.kind ?? 'nothing'}, wanted ${want}`,
  );
};

claimed('amazon-unified-sample.csv', 'amazonSettlement');
claimed('shopify-variant-july.csv', 'shopifySales');
claimed('blinkit-order-charges-sample.xlsx', 'blinkitSettlement');
claimed('shiprocket-passbook-sample.csv', 'shiprocketFreight');
claimed('tranzact-bom-sample.xlsx', 'tranzactBom');

// ---- Amazon ---------------------------------------------------------------
// Amazon prints quantity POSITIVE on a refund even though product sales is
// negative, and an Adjustment row carries a quantity with no sale at all.
// Taking either at face value overstated July's units by 22%, and with them
// COGS. The fixture holds one of each.
const amazon = ingest('amazon-unified-sample.csv');
const amazonRefund = amazon.source.skuRows.filter((r) => r.revenue < 0);
const amazonAdjustment = amazon.source.skuRows.filter((r) => r.revenue === 0 && r.units !== 0);

console.log(
  amazonRefund.length > 0 && amazonRefund.every((r) => r.units < 0)
    ? '  ok  refund rows carry negative units'
    : 'FAIL  a refund row kept Amazon’s positive quantity',
);
if (amazonRefund.length === 0 || !amazonRefund.every((r) => r.units < 0)) failures++;

console.log(
  amazonAdjustment.length === 0
    ? '  ok  FBA adjustment rows contribute no units'
    : `FAIL  ${amazonAdjustment.length} adjustment row(s) counted as units sold`,
);
if (amazonAdjustment.length > 0) failures++;

const amazonChecks = Object.fromEntries((amazon.result.crossChecks ?? []).map((c) => [c.against ?? c.label, c.amount]));
console.log(
  amazonChecks['sm_total'] > 0
    ? `  ok  advertising split out of service fees (${fmt(amazonChecks['sm_total'])})`
    : 'FAIL  advertising not separated from service fees',
);
if (!(amazonChecks['sm_total'] > 0)) failures++;

// A Transfer is the settlement moving to the bank. It must never reach revenue
// or fees: it is four times the size of the fixture's actual sales.
const transferLeak = amazon.source.skuRows.some((r) => Math.abs(r.revenue) > 50000);
console.log(transferLeak ? 'FAIL  a bank transfer leaked into the SKU rows' : '  ok  bank transfers excluded from SKU rows');
if (transferLeak) failures++;

// ---- Shopify (the whole July file) ----------------------------------------
const shopify = ingest('shopify-variant-july.csv');
const shopifyRevenue = shopify.source.skuRows.reduce((t, r) => t + r.revenue, 0);
const titleKeyed = shopify.source.skuRows.filter((r) => r.keyKind === 'title');

check('shopify net sales', shopifyRevenue, 1248813.69, 0.01);
check('shopify title-keyed rows', titleKeyed.length, 14);
check('shopify title-keyed value', titleKeyed.reduce((t, r) => t + r.revenue, 0), 376298.44, 0.01);

// ---- Shiprocket -----------------------------------------------------------
// The passbook's biggest positive lines are COD moving INTO the wallet, not
// income. Summing the Amount column without excluding them lands ~74% light on
// freight and looks plausible while doing it.
const shiprocket = ingest('shiprocket-passbook-sample.csv');
const wallet = (shiprocket.result.crossChecks ?? []).find((c) => /wallet transfers in/i.test(c.label));
console.log(
  wallet && wallet.amount > 0 && shiprocket.source.skuRows.length === 0
    ? `  ok  wallet transfers excluded (${fmt(wallet.amount)}) and no SKUs invented`
    : 'FAIL  wallet transfers not excluded, or the passbook produced SKU rows',
);
if (!wallet || wallet.amount <= 0 || shiprocket.source.skuRows.length > 0) failures++;

// ---- Blinkit and the BOMs -------------------------------------------------
const blinkit = ingest('blinkit-order-charges-sample.xlsx');
console.log(
  blinkit.source.skuRows.length > 0 && blinkit.source.skuRows.every((r) => r.fees > 0)
    ? '  ok  blinkit items carry commission and shipping'
    : 'FAIL  blinkit items lost their deductions',
);
if (blinkit.source.skuRows.length === 0 || !blinkit.source.skuRows.every((r) => r.fees > 0)) failures++;

const bom = ingest('tranzact-bom-sample.xlsx');
console.log(
  bom.source.bomCosts.length >= 25
    ? `  ok  ${bom.source.bomCosts.length} finished goods priced from the BOM export`
    : `FAIL  only ${bom.source.bomCosts.length} BOM costs read`,
);
if (bom.source.bomCosts.length < 25) failures++;

// FG-0001 has two BOMs. The original (FG-BOM00010, ₹262.42) must win over the
// cheaper OEM variant (FG-BOM00063, ₹252.87), or every Amazon X-L Lite unit is
// priced as a Medikart one.
const book = buildCostBook([bom.source]);
check('FG-0001 unit cost', costFor(book, 'FG-0001')?.costPerUnit ?? NaN, 262.42);
console.log(
  book.ambiguous.includes('FG-0001')
    ? '  ok  FG-0001 flagged as priced by more than one BOM'
    : 'FAIL  a multi-BOM finished good was priced silently',
);
if (!book.ambiguous.includes('FG-0001')) failures++;

// ---------------------------------------------------------------------------
// SKU layer: identity resolution, and the gates that guard it.
// ---------------------------------------------------------------------------

console.log('\nSKU layer\n');

// Amazon decorates one listing four ways. Matching the whole string would treat
// them as four products and drop whichever was not in the map.
const AMAZON_FORMS = [
  'HB-QQ6J-D6E0',
  'HB-QQ6J-D6E0-FBM',
  'HB-QQ6J-D6E0-hcore X-L lite',
  'HB-QQ6J-D6E0-hcore X-L lite-FBM',
];
const collapsed = new Set(AMAZON_FORMS.map((k) => platformKey('amazon', k)));
console.log(
  collapsed.size === 1
    ? `  ok  ${AMAZON_FORMS.length} Amazon SKU forms collapse to one identity`
    : `FAIL  Amazon SKU forms gave ${collapsed.size} identities: ${[...collapsed].join(', ')}`,
);
if (collapsed.size !== 1) failures++;

// ...but the merchant token is what identifies it, not a loose prefix match.
console.log(
  platformKey('amazon', 'HB-QQ6J-D6E1') !== platformKey('amazon', 'HB-QQ6J-D6E0')
    ? '  ok  a different merchant token is a different product'
    : 'FAIL  two different Amazon listings collapsed together',
);
if (platformKey('amazon', 'HB-QQ6J-D6E1') === platformKey('amazon', 'HB-QQ6J-D6E0')) failures++;

// Shopify rows with no variant SKU key on the product title, and must be
// marked as the weaker match they are.
const byTitle = lookupSku('shopify', 'Cervical Heating Pad for Stiff Neck & Frozen Shoulder – Digital by Heatronics');
console.log(
  byTitle?.byTitle && byTitle.fgId === 'FG-0008'
    ? '  ok  Shopify product title resolves, flagged as a title match'
    : `FAIL  title lookup gave ${byTitle?.fgId ?? 'nothing'} (byTitle=${byTitle?.byTitle})`,
);
if (!byTitle?.byTitle || byTitle.fgId !== 'FG-0008') failures++;

// The two ambiguous July titles span both the Lite and the full product, so
// they must NOT resolve — guessing either moves ₹1.77 L between products.
for (const title of ['Heating Pad for Back Pain', 'Heating Pad for Period Pain']) {
  const hit = lookupSku('shopify', title);
  console.log(
    hit === null
      ? `  ok  "${title}" left unmapped rather than guessed`
      : `FAIL  "${title}" resolved to ${hit.fgId} despite spanning two products`,
  );
  if (hit !== null) failures++;
}

// The cost basis shifts which FG prices a unit, never which product it is.
const legacy = lookupSku('amazon', 'VW-H1GL-KTOZ- hcore Knee', {}, undefined, 'legacy');
const hcore = lookupSku('amazon', 'VW-H1GL-KTOZ- hcore Knee', {}, undefined, 'hcore');
console.log(
  legacy?.fgId === 'FG-0006' && hcore?.fgId === 'FG-0040' && legacy.product.deckName === hcore?.product.deckName
    ? '  ok  cost basis moves the FG (FG-0006 ↔ FG-0040), not the product'
    : `FAIL  basis switch gave ${legacy?.fgId}/${hcore?.fgId} and ${legacy?.product.deckName}/${hcore?.product.deckName}`,
);
if (legacy?.fgId !== 'FG-0006' || hcore?.fgId !== 'FG-0040') failures++;

// ---- The gates -------------------------------------------------------------

const skuSession: MonthCloseSession = {
  ...emptySession('2026-07', 'Jul 2026'),
  sources: [amazon.source, shopify.source, bom.source],
};
const s1 = computeClose(skuSession);

// SKU problems must never hold up the P&L close.
const closeBlockers = s1.blockers.filter((b) => !b.advisory && b.scope !== 'sku');
const skuBlockers = s1.blockers.filter((b) => !b.advisory && b.scope === 'sku');
console.log(
  skuBlockers.length > 0 && closeBlockers.every((b) => b.scope !== 'sku')
    ? `  ok  ${skuBlockers.length} sku-scoped blockers, none leaking into the P&L gate`
    : 'FAIL  sku blockers missing, or one leaked into the close gate',
);
if (skuBlockers.length === 0) failures++;

// The two ambiguous Shopify titles must be among them.
const unmappedTitles = s1.sku.unmapped.filter((r) => r.keyKind === 'title');
check('unmapped title rows', unmappedTitles.length, 2);
check('unmapped title value', unmappedTitles.reduce((t, r) => t + r.revenue, 0), 177012.52, 0.5);

// Unmapped SKUs block first.
const blockedEmit = emitClose(skuSession, s1);
console.log(
  blockedEmit.skuCellsTs === null && /not in the map/i.test(blockedEmit.skuBlockedReason ?? '')
    ? '  ok  SKU cells withheld while SKUs are unmapped'
    : `FAIL  expected an unmapped block, got: ${blockedEmit.skuBlockedReason ?? 'cells emitted'}`,
);
if (blockedEmit.skuCellsTs !== null) failures++;

// With the map complete but no basis chosen, the cost fork is what holds it.
const mappedSession: MonthCloseSession = {
  ...skuSession,
  skuOverrides: {
    'shopify:HEATINGPADFORBACKPAIN': 'FG-0002',
    'shopify:HEATINGPADFORPERIODPAIN': 'FG-0003',
    ...Object.fromEntries(s1.sku.unconfirmed.map((a) => [a.baseFgId, a.baseFgId])),
  },
};
const mapped = computeClose(mappedSession);
const basisBlocked = emitClose(mappedSession, mapped);
console.log(
  basisBlocked.skuCellsTs === null && /cost basis/i.test(basisBlocked.skuBlockedReason ?? '')
    ? '  ok  SKU cells withheld until a cost basis is chosen'
    : `FAIL  expected a cost-basis block, got: ${basisBlocked.skuBlockedReason ?? 'cells emitted'}`,
);
if (basisBlocked.skuCellsTs !== null) failures++;

// ---- Cleared ---------------------------------------------------------------
// Assign the two ambiguous titles, confirm the inferred products, pick a basis.
const clearedSession: MonthCloseSession = { ...mappedSession, costBasis: 'legacy' };
const s2 = computeClose(clearedSession);
const cleared = emitClose(clearedSession, s2);

check('cleared unmapped', s2.sku.unmapped.length, 0);

if (cleared.skuCellsTs === null) {
  failures++;
  console.log(`FAIL  SKU cells still withheld: ${cleared.skuBlockedReason}`);
} else {
  console.log('  ok  SKU cells emitted once every gate is cleared');
  // Cost must be units times the BOM's own figure, not a percentage of revenue.
  const xlLite = s2.sku.aggregates.find((a) => a.fgId === 'FG-0001' && a.units > 0);
  if (!xlLite) {
    failures++;
    console.log('FAIL  no priced FG-0001 aggregate to check the unit cost against');
  } else {
    check('FG-0001 cost/unit', (xlLite.cogs ?? 0) / xlLite.units, 262.42, 0.01);
  }
  console.log(
    cleared.skuCellsTs.includes('Total FG Cost')
      ? '  ok  emitted cells name their cost basis'
      : 'FAIL  emitted cells do not say where COGS came from',
  );
  if (!cleared.skuCellsTs.includes('Total FG Cost')) failures++;
}

console.log(failures === 0 ? '\nPASS — Jul-2026 reproduced exactly.\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
