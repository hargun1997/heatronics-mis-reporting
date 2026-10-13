// ----------------------------------------------------------------------------
// Acceptance test for the recon + tagging engine.
//
//   npx tsx scripts/verify-recon-tagging.ts
//
// Four sections:
//   1. the real Sep-2026 Tally cascade, replayed through the LIVE path
//      (ledger rows → computeClose), proving the headline stays byte-for-byte
//      pure Tally and that the new tallyLines carry Tally's own totals.
//   2. expense tagging over deterministic synthetic facts — the per-line,
//      per-channel split, the double-count guards, the warranty pro-rata, and
//      the "blended is unclamped" rule.
//   3. the channel reconciliation identities (revenue residue, COGM variance).
//   4. the period fold — monthly tallyLines/recon merged into quarter and year.
//
// If section 1 drifts, the engine has moved a published month; fix the engine.
// ----------------------------------------------------------------------------

import { computeClose } from '../client/src/data/monthClose/compute';
import {
  accumulateTags,
  buildChannelRecon,
  tagTallyLines,
} from '../client/src/data/misDeck/expenseTagging';
import { aggregatePeriods, slicePnl, FACTORY_PCT, type PeriodAgg, type PnlColumn } from '../client/src/data/misDeck/liveAnalytics';
import type { DailyFact } from '../client/src/data/liveMis/facts';
import type { MonthlyMIS, SalesChannel } from '../client/src/data/misDeck/misDeckData';
import type { SkuCell } from '../client/src/data/misDeck/skuChannelPnl';
import type { PeriodCompleteness } from '../client/src/data/misDeck/liveDeck';
import {
  BUCKET_CASCADE,
  emptySession,
  type CascadeLine,
  type LedgerNode,
  type MonthCloseSession,
  type Provenance,
  type TallyBucketLine,
} from '../client/src/data/monthClose/schema';

const P: Provenance = {
  sourceId: 'fixture',
  sourceLabel: 'Sep-2026 Tally P&L (fixture)',
  method: 'xlsx',
  confidence: 'exact',
  verified: true,
};

let failures = 0;
const check = (label: string, got: number, want: number, tol = 0.01) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? '  ok' : 'FAIL'}  ${label.padEnd(30)} got ${fmt(got).padStart(16)}   want ${fmt(want).padStart(16)}`);
};
const assert = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok' : 'FAIL'}  ${label}`);
};
function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// 1. The real Sep-2026 close, through the live path.
//
// These rows are the Sep column of the real Tally P&L A/c multi-month export,
// exactly as the live reader hands them to the cascade (flat, depth-tagged,
// path=[], leaf). Sep is the clean, fully-reconciled month.
// ---------------------------------------------------------------------------

const SEP_LEDGERS: [number, string, number][] = [
  [1, 'D2C Sales', 210105.16],
  [1, 'Ecommerce Sales', 718780.6],
  [1, 'OEM Sales', 4824512],
  [1, 'Offline Sales', 519556.5],
  [1, 'Quick Commerce Sales', -1980.96],
  [1, 'Stock Transfers', 1026693.87],
  [1, 'Other Income', -1715],
  [1, 'Opening Stock', 14815505],
  [1, 'Stock Transfer', 1026693.87],
  [1, 'Raw Material Purchases', 2843564.7199999997],
  [1, 'Closing Stock', 14815505],
  [1, 'Direct Expenses', 795089.9],
  [1, 'Factory Overheads', 397888],
  [1, 'Inward Freight', 32219],
  [1, 'Manufacturing Costs', 364982.9],
  [1, 'Other Income', 4522],
  [1, 'Other Income', 187.62],
  [1, 'Other Income', 206.67],
  [1, 'Other Income', 76.19],
  [1, 'Admin & General Expenses', 20636],
  [1, 'After-Sales & Warranty', 12982.44],
  [1, 'Channel Fees & Commissions', 158210.62],
  [1, 'Employee Cost - Indirect', 205000],
  [1, 'Finance Costs', 59735],
  [1, 'Financial Adjustments', 0.69],
  [1, 'Professional Fees', 16000],
  [1, 'Sales & Marketing', 912750.82],
  [1, 'Staff Welfare', 3560],
  [1, 'Admin Expenses', 672],
  [1, 'Freight Outward Exp.- Porter/ Transport', 2160],
  [1, 'Machine Repair & Maint', 10410],
  [1, 'Miscellanous Expenses', 2798],
  [1, 'Other Expenses', 4726.85],
];
const SEP_NETT = 1225953.74;

const sepNodes: LedgerNode[] = SEP_LEDGERS.map(([depth, name, amount]) => ({
  name,
  depth: Math.max(0, Math.floor(depth)),
  path: [],
  amount,
  isLeaf: true,
  provenance: P,
}));

const sepSession: MonthCloseSession = {
  ...emptySession('2026-09', 'Sep 2026'),
  sources: [
    {
      id: 'fixture',
      label: 'Sep-2026 Tally P&L (fixture)',
      kind: 'tallyPnl',
      method: 'xlsx',
      addedAt: new Date(0).toISOString(),
      nodes: sepNodes,
      skuRows: [],
      bomCosts: [],
      crossChecks: [],
      warnings: [],
    },
  ],
  anchor: { nettProfit: { value: SEP_NETT, provenance: P } },
};

const c = computeClose(sepSession);

console.log('\nSep-2026 headline — unchanged, pure Tally\n');
check('netRevenue', c.netRevenue, 6270973.3);
check('cogm', c.cogm, 3638654.62);
check('grossMargin', c.grossMargin, 2632318.68);
check('channelFulfillment', c.channelFulfillment, 160370.62);
check('cm1', c.cm1, 2471948.06);
check('salesMarketing', c.salesMarketing, 912750.82);
check('cm2', c.cm2, 1559197.24);
check('platformCosts', c.platformCosts, 0);
check('cm3', c.cm3, 1559197.24);
check('opex', c.opex, 273508.5);
check('ebitda', c.ebitda, 1285688.74);
check('nonOperating', c.nonOperating, 59735);
check('netIncome', c.netIncome, SEP_NETT);
check('reconcile residual', c.reconciliation.residual ?? NaN, 0);

console.log('\nSep-2026 channel split\n');
const SEP_CHANNELS: Record<string, number> = {
  D2C: 210105.16, Amazon: 718780.6, B2B: 4824512, GT: 519556.5, Blinkit: -1980.96,
};
for (const [ch, want] of Object.entries(SEP_CHANNELS)) {
  check(ch, c.netByChannel[ch as SalesChannel] ?? NaN, want);
}

// ---------------------------------------------------------------------------
// Tally buckets retained: each cascade block's lines sum back to its aggregate,
// and (pre-tagging) every line is wholly blended.
// ---------------------------------------------------------------------------

console.log('\nTally buckets tie to the cascade aggregates\n');
const AGG_BY_CASCADE: Record<CascadeLine, number> = {
  channel_fulfilment: c.channelFulfillment,
  sales_marketing: c.salesMarketing,
  platform_payment: c.platformCosts,
  non_operating: c.nonOperating,
  cost_of_fundraising: c.costOfFundraising,
};
for (const cascade of Object.keys(AGG_BY_CASCADE) as CascadeLine[]) {
  const sum = c.tallyLines.filter((l) => l.cascadeLine === cascade).reduce((s, l) => s + l.total, 0);
  // `total` is a signed cost (negative); the aggregate is a positive magnitude.
  check(`Σ ${cascade}`, r2(-sum), AGG_BY_CASCADE[cascade]);
}

assert(
  'every bucket maps its Bucket → the right cascade line',
  c.tallyLines.every((l) => BUCKET_CASCADE[l.bucket] === l.cascadeLine),
);
assert(
  'pre-tagging: every line is wholly blended (byChannel empty, blended = total)',
  c.tallyLines.every((l) => Object.keys(l.byChannel).length === 0 && l.blended === l.total),
);
assert(
  'no COGM / OPEX bucket leaked into tallyLines',
  c.tallyLines.every((l) => l.bucket !== 'cogm' && l.bucket !== 'opex' && l.bucket !== 'otherIncome'),
);

// ---------------------------------------------------------------------------
// 2. Expense tagging over synthetic facts.
// ---------------------------------------------------------------------------

console.log('\nExpense tagging — per-channel split + guards\n');

const fact = (o: Partial<DailyFact> & { source: string }): DailyFact => ({
  channel: 'd2c', date: '2026-09-15', revenue: 0, units: 0, orders: 0, fees: 0, ...o,
});

const facts: DailyFact[] = [
  // CM1 channel fees
  fact({ source: 'amazon', channel: 'amazon', fees: 100000, spend: 999 /* lumped ad — must be ignored */ }),
  fact({ source: 'blinkit', channel: 'blinkit', fees: 8000 }),
  fact({ source: 'shiprocket', channel: 'd2c', fees: 50000 }),
  // CM2 advertising
  fact({ source: 'meta', channel: 'd2c', spend: 200000 }),
  fact({ source: 'googleads', channel: 'd2c', spend: 300000 }),
  fact({ source: 'googleadsproducts', channel: 'd2c', sku: 'X', spend: 250000 /* breakdown — must be ignored */ }),
  fact({ source: 'amazonads', channel: 'amazon', sku: 'Y', spend: 150000 }),
];

const tags = accumulateTags(facts);
const tagged = tagTallyLines(c.tallyLines, tags, c.netByChannel);
const byKey = Object.fromEntries(tagged.map((l) => [l.lineKey, l]));

const ffc = byKey['ff_channel_fees'];
check('ff_channel_fees Amazon', ffc.byChannel.Amazon ?? NaN, -100000);
check('ff_channel_fees Blinkit', ffc.byChannel.Blinkit ?? NaN, -8000);
check('ff_channel_fees D2C (shiprocket)', ffc.byChannel.D2C ?? NaN, -50000);
check('ff_channel_fees blended', ffc.blended, r2(-158210.62 - (-158000)));

const sm = byKey['sm_total'];
check('sm_total D2C (meta+google)', sm.byChannel.D2C ?? NaN, -500000);
check('sm_total Amazon (amazonads)', sm.byChannel.Amazon ?? NaN, -150000);
assert('googleadsproducts excluded (no extra D2C spend)', (sm.byChannel.D2C ?? 0) === -500000);
assert('amazon settlement lumped ad never tagged to S&M', !tagged.some((l) => l.lineKey === 'sm_total' && (l.byChannel.Amazon ?? 0) !== -150000));

console.log('\nInvariant: Σ byChannel + blended === total, every line\n');
for (const l of tagged) {
  const sum = Object.values(l.byChannel).reduce((s, v) => s + (v ?? 0), 0);
  check(`${l.lineKey}`, r2(sum + l.blended), l.total);
}
assert('lines with no evidence stay identical', byKey['ff_freight_out'].blended === -2160 && byKey['nl_nonoperating'].blended === -59735);

// Warranty pro-rata + unclamped blended, on a constructed platform line.
console.log('\nWarranty pro-rata + unclamped blended\n');
const synthLines: TallyBucketLine[] = [
  { lineKey: 'pf_platform', label: 'Platform', bucket: 'platform', cascadeLine: 'platform_payment', total: -100000, byChannel: {}, blended: -100000 },
];
const warrantyFacts: DailyFact[] = [
  fact({ source: 'delhivery', channel: 'all', fees: 40000 }), // bySales
  fact({ source: 'shopflo', channel: 'd2c', fees: 10000 }), // D2C fixed
];
const warrantyNet: Partial<Record<SalesChannel, number>> = { D2C: 100, Amazon: 300 };
const warrantyTagged = tagTallyLines(synthLines, accumulateTags(warrantyFacts), warrantyNet);
const pf = warrantyTagged[0];
// Delhivery 40000 pro-rata by {D2C 100, Amazon 300} = D2C 10000, Amazon 30000; + shopflo D2C 10000.
check('pf_platform D2C (shopflo + warranty share)', pf.byChannel.D2C ?? NaN, -20000);
check('pf_platform Amazon (warranty share)', pf.byChannel.Amazon ?? NaN, -30000);
check('pf_platform blended', pf.blended, -50000);
check('pf_platform invariant', r2((pf.byChannel.D2C ?? 0) + (pf.byChannel.Amazon ?? 0) + pf.blended), -100000);

const overLine: TallyBucketLine[] = [
  { lineKey: 'pf_platform', label: 'Platform', bucket: 'platform', cascadeLine: 'platform_payment', total: -100, byChannel: {}, blended: -100 },
];
const over = tagTallyLines(overLine, accumulateTags([fact({ source: 'shopflo', channel: 'd2c', fees: 500 })]), {})[0];
assert('blended flips positive when evidence exceeds total (unclamped)', over.blended === 400);
check('over-attributed invariant', r2((over.byChannel.D2C ?? 0) + over.blended), -100);

// ---------------------------------------------------------------------------
// 3. Channel reconciliation identities.
// ---------------------------------------------------------------------------

console.log('\nChannel reconciliation\n');
const skuCells: SkuCell[] = [
  { m: '2026-09', ch: 'D2C', p: 'A', rev: 200000, cogs: 50000, oth: 0, con: 0, u: 10 },
  { m: '2026-09', ch: 'Amazon', p: 'B', rev: 700000, cogs: 200000, oth: 0, con: 0, u: 20 },
];
const recon = buildChannelRecon(c.netByChannel, skuCells, c.cogm, c.netRevenue, FACTORY_PCT);
check('residue D2C', recon.revenueResidue.D2C ?? NaN, r2(210105.16 - 200000));
check('residue Amazon', recon.revenueResidue.Amazon ?? NaN, r2(718780.6 - 700000));
check('residue B2B (no connector SkuCell)', recon.revenueResidue.B2B ?? NaN, 4824512);

// Reconstruction: Σ SkuCell(ch).rev + residue === Tally netByChannel(ch).
const skuRevByCh: Partial<Record<SalesChannel, number>> = {};
for (const s of skuCells) skuRevByCh[s.ch] = r2((skuRevByCh[s.ch] ?? 0) + s.rev);
for (const ch of Object.keys(c.netByChannel) as SalesChannel[]) {
  check(`recon rev ${ch}`, r2((skuRevByCh[ch] ?? 0) + (recon.revenueResidue[ch] ?? 0)), c.netByChannel[ch] ?? NaN);
}
// COGM: Σ SkuCell.cogs + factory·netRevenue + cogmVariance === Tally COGM.
const skuCogs = skuCells.reduce((s, x) => s + x.cogs, 0);
check('COGM reconstruction', r2(skuCogs + FACTORY_PCT * c.netRevenue + recon.cogmVariance), c.cogm);

// ---------------------------------------------------------------------------
// 4. Period fold — monthly tallyLines/recon merged into quarter and year.
// ---------------------------------------------------------------------------

console.log('\nPeriod fold (quarter / year)\n');
function month(key: string): MonthlyMIS {
  return {
    key, label: key, month: Number(key.split('-')[1]), year: Number(key.split('-')[0]),
    netByChannel: { Amazon: 1000 }, grossByChannel: {}, returnsByChannel: {},
    totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0, netRevenue: 1000, interBranch: 0, turnover: 0,
    grossMargin: 0, cm1: 0, cm2: 0, cm3: 0, ebitda: 0, netIncome: 0, cogm: 0,
    channelFulfillment: 100, salesMarketing: 0, platformCosts: 0, opex: 0, nonOperating: 0, costOfFundraising: 0,
    cogmLines: {}, opexLines: {},
    tallyLines: [
      { lineKey: 'ff_channel_fees', label: 'Channel Fees', bucket: 'fulfillment', cascadeLine: 'channel_fulfilment', total: -100, byChannel: { Amazon: -60 }, blended: -40 },
    ],
    channelRecon: { revenueResidue: { Amazon: 5 }, cogmVariance: 10 },
  };
}
const months = ['2026-07', '2026-08', '2026-09'].map(month);
const comp: Record<string, PeriodCompleteness> = Object.fromEntries(
  months.map((m) => [m.key, { periodKey: m.key, hasTally: true, cogmReal: true, level: 'full' as const, sources: [], through: null, reconcileResidual: 0 }]),
);

for (const gran of ['quarter', 'year'] as const) {
  const aggs = aggregatePeriods(months, comp, gran);
  assert(`${gran}: single bucket`, aggs.length === 1);
  const a = aggs[0];
  const line = a.tallyLines.find((l) => l.lineKey === 'ff_channel_fees');
  assert(`${gran}: tallyLines merged by key`, a.tallyLines.length === 1 && !!line);
  if (line) {
    check(`${gran}: line total`, line.total, -300);
    check(`${gran}: line byChannel Amazon`, line.byChannel.Amazon ?? NaN, -180);
    check(`${gran}: line blended`, line.blended, -120);
    check(`${gran}: line invariant`, r2((line.byChannel.Amazon ?? 0) + line.blended), line.total);
  }
  check(`${gran}: recon residue Amazon`, a.channelRecon.revenueResidue.Amazon ?? NaN, 15);
  check(`${gran}: recon cogmVariance`, a.channelRecon.cogmVariance, 30);
}

// ---------------------------------------------------------------------------
// 5. Bifurcated full P&L (slicePnl): whole-company slices tie to Tally on every
//    cascade line; CM1/CM2 are channel-specific (bottoms-up); a filtered slice
//    foots to its own total; below-CM2 is pro-rata by sales.
// ---------------------------------------------------------------------------

console.log('\nBifurcated full P&L\n');

// Connector SkuCells with real per-cell fees (oth) and ad so CM1/CM2 are exercised.
const bifurCells: SkuCell[] = [
  { m: '2026-09', ch: 'D2C', p: 'A', rev: 180000, cogs: 45000, oth: 5000, ad: 30000, con: 0, u: 10 },
  { m: '2026-09', ch: 'Amazon', p: 'B', rev: 680000, cogs: 190000, oth: 50000, ad: 20000, con: 0, u: 20 },
  { m: '2026-09', ch: 'B2B', p: 'C', rev: 4000000, cogs: 1200000, oth: 10000, con: 0, u: 300 },
  { m: '2026-09', ch: 'GT', p: 'D', rev: 500000, cogs: 150000, oth: 0, con: 0, u: 40 },
  { m: '2026-09', ch: 'Blinkit', p: 'E', rev: -2000, cogs: 0, oth: 0, con: 0, u: -1 },
];

const sepPeriod: PeriodAgg = {
  key: '2026-09', label: 'Sep 2026', members: ['2026-09'],
  netByChannel: c.netByChannel, netRevenue: c.netRevenue, cogm: c.cogm, grossMargin: c.grossMargin,
  channelFulfillment: c.channelFulfillment, cm1: c.cm1, salesMarketing: c.salesMarketing, cm2: c.cm2,
  platformCosts: c.platformCosts, cm3: c.cm3, opex: c.opex, ebitda: c.ebitda,
  nonOperating: c.nonOperating, costOfFundraising: c.costOfFundraising, netIncome: c.netIncome,
  tallyLines: tagged,
  channelRecon: buildChannelRecon(c.netByChannel, bifurCells, c.cogm, c.netRevenue, FACTORY_PCT),
  level: 'full', hasTally: true,
};
const bifurPeriodKeys = new Set(['2026-09']);

const PNL_FIELDS: (keyof PnlColumn)[] = ['rev', 'cogm', 'gm', 'fulfilment', 'cm1', 'marketing', 'cm2', 'platform', 'cm3', 'opex', 'ebitda', 'nonOperating', 'netIncome'];

// Whole-company slices (channel / vertical / sku) tie to the Tally cascade.
for (const by of ['channel', 'vertical', 'sku'] as const) {
  const s = slicePnl(sepPeriod, bifurCells, bifurPeriodKeys, by);
  assert(`${by}: whole-company slice is tied to Tally (has recon column)`, s.tied && !!s.recon);
  for (const f of PNL_FIELDS) {
    const sum = r2(s.columns.reduce((acc, col) => acc + (col[f] as number), 0) + ((s.recon?.[f] as number) ?? 0));
    check(`${by}: Σcols+recon ${f}`, sum, s.total[f] as number);
  }
  check(`${by}: Total Net Revenue == Tally`, s.total.rev, c.netRevenue);
  check(`${by}: Total Net Income == Tally`, s.total.netIncome, c.netIncome);
}

// CM1/CM2 are channel-specific: the Amazon column carries Amazon's own fees/ad.
const byCh = slicePnl(sepPeriod, bifurCells, bifurPeriodKeys, 'channel');
const amazonCol = byCh.columns.find((col) => col.key === 'Amazon')!;
check('Amazon column fulfilment = its own fees', amazonCol.fulfilment, 50000);
check('Amazon column marketing = its own ad', amazonCol.marketing, 20000);
check('Amazon CM1 = GM − its fees', amazonCol.cm1, r2(amazonCol.gm - 50000));
check('Amazon CM2 = CM1 − its ad', amazonCol.cm2, r2(amazonCol.cm1 - 20000));
// Below CM2 is pro-rata by sales: Amazon's platform share of the company total.
check('Amazon platform = pro-rata share', amazonCol.platform, r2(c.platformCosts * (amazonCol.rev / c.netRevenue)));
check('Amazon opex = pro-rata share', amazonCol.opex, r2(c.opex * (amazonCol.rev / c.netRevenue)));

// A filtered slice (one channel → its SKUs) foots to its own total, not Tally.
const b2bSkus = slicePnl(sepPeriod, bifurCells, bifurPeriodKeys, 'sku', { channel: 'B2B' });
assert('filtered slice is not tied to Tally (no recon column)', !b2bSkus.tied && b2bSkus.recon === null);
for (const f of PNL_FIELDS) {
  const sum = r2(b2bSkus.columns.reduce((acc, col) => acc + (col[f] as number), 0));
  check(`B2B→SKU: Σcols ${f}`, sum, b2bSkus.total[f] as number);
}
check('B2B→SKU total revenue = B2B cell revenue', b2bSkus.total.rev, 4000000);

// A month with no Tally close is NOT tied: no recon column, no claimed Tally total.
const noTally = slicePnl({ ...sepPeriod, hasTally: false }, bifurCells, bifurPeriodKeys, 'channel');
assert('no-Tally month: whole-company slice is not tied (no recon column)', !noTally.tied && noTally.recon === null);

console.log(failures === 0 ? '\nPASS — recon + tagging reproduced exactly.\n' : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
