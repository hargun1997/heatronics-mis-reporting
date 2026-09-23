// ----------------------------------------------------------------------------
// Acceptance test for the month-close cascade.
//
// Replays the committed Jul-2026 close from its ledgers and asserts the engine
// reproduces every figure in misDeckData.ts, plus the ₹1,691 stock-transfer
// reconciling item named in July-2026-PnL.md.
//
//   npx tsx scripts/verify-month-close.ts
//
// If this fails, the cascade has drifted from a month that has already been
// published — fix the engine, not the fixture.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { ADAPTERS } from '../client/src/data/monthClose/adapters';
import { computeClose } from '../client/src/data/monthClose/compute';
import {
  emptySession,
  type LedgerNode,
  type MonthCloseSession,
  type Provenance,
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
      warnings: parsed.warnings,
    },
  ],
  // The first-pass workbook has no stock movement, so opening/closing are equal.
  manual: {
    cogm_open: { value: 14457824, provenance: P },
    cogm_close: { value: 14457824, provenance: P },
  },
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

console.log(failures === 0 ? '\nPASS — Jul-2026 reproduced exactly.\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
