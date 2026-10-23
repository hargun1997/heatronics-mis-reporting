// ----------------------------------------------------------------------------
// Acceptance test for multi-file / multi-month ingestion.
//
//   npx tsx scripts/verify-ingest-split.ts
//
// Proves the two halves of "drop a range, each month lands where it belongs":
//   1. monthBreakdown() splits a staged upload into one commit per month —
//      dated facts bucket by their own date, a Tally export splits by its own
//      month columns, and a dateless upload (BOM) stays one slice on the
//      override month.
//   2. buildLiveDeck() routes every committed fact to the month its date falls
//      in, so a single multi-month fact report populates each month correctly
//      AND a per-month re-upload overwrites only that month.
//
// No network, no browser — pure functions over synthetic inputs.
// ----------------------------------------------------------------------------

import { monthBreakdown } from '../client/src/data/ingest/ingestClient';
import type { Extracted, StagedUpload } from '../client/src/data/ingest/types';
import { buildLiveDeck } from '../client/src/data/misDeck/liveDeck';
import type { DailyFact } from '../client/src/data/liveMis/facts';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) { console.log(`  ✓ ${msg}`); } else { failures += 1; console.error(`  ✗ ${msg}`); }
};
const r0 = (n: number) => Math.round(n);

function staged(extracted: Extracted, periodKey = '2026-09'): StagedUpload {
  return {
    checks: { items: [], overall: 'pass' },
    extracted,
    fileName: 'test.xlsx',
    mimeType: 'application/octet-stream',
    rawFiles: [{ base64: 'x', name: 'test.xlsx', mimeType: 'application/octet-stream' }],
    periodKey,
  };
}

const fact = (date: string, revenue: number, source = 'amazon', channel = 'Amazon'): DailyFact =>
  ({ source, channel, date, revenue, units: 1, orders: 1, fees: 0 });

// ---- 1. monthBreakdown ------------------------------------------------------

console.log('\n1. monthBreakdown — split a staged upload by month');

{
  // Dated facts spanning Jul/Aug/Sep → three slices, each with only its rows.
  const facts = [
    fact('2026-07-10', 100), fact('2026-07-20', 50),
    fact('2026-08-05', 200),
    fact('2026-09-01', 300), fact('2026-09-30', 70),
  ];
  const ex: Extracted = { facts, rowCount: facts.length, through: '2026-09-30' };
  const mc = monthBreakdown(staged(ex), '2026-09');
  ok(mc.length === 3, `dated facts → 3 month slices (got ${mc.length})`);
  ok(mc.every((m) => m.basis === 'facts'), 'each slice basis = "facts"');
  ok(mc.map((m) => m.periodKey).join(',') === '2026-07,2026-08,2026-09', 'slices sorted Jul,Aug,Sep');
  const jul = mc.find((m) => m.periodKey === '2026-07')!;
  ok(jul.facts.length === 2 && r0(jul.facts.reduce((s, f) => s + f.revenue, 0)) === 150, 'Jul slice holds only its 2 rows (₹150)');
  const sep = mc.find((m) => m.periodKey === '2026-09')!;
  ok(sep.through === '2026-09-30', 'Sep slice "through" = its latest date');
}

{
  // A Tally export carrying three months → one slice per month, all ingested.
  const tallyMonths = [
    { period: '2026-04', periodLabel: 'Apr 2026', ledgerRows: [{ name: 'Sales', depth: 0, amount: 1000, confidence: 1 }], nettProfit: 100 },
    { period: '2026-05', periodLabel: 'May 2026', ledgerRows: [{ name: 'Sales', depth: 0, amount: 2000, confidence: 1 }], nettProfit: 200 },
    { period: '2026-06', periodLabel: 'Jun 2026', ledgerRows: [{ name: 'Sales', depth: 0, amount: 3000, confidence: 1 }], nettProfit: 300 },
  ];
  const ex: Extracted = { facts: [], rowCount: 0, through: null, ledgerRows: tallyMonths[2].ledgerRows, nettProfit: 300, tallyMonths };
  const mc = monthBreakdown(staged(ex, '2026-06'), '2026-06');
  ok(mc.length === 3, `Tally export → 3 month slices (got ${mc.length})`);
  ok(mc.every((m) => m.basis === 'tally'), 'each slice basis = "tally"');
  ok(mc.find((m) => m.periodKey === '2026-05')!.nettProfit === 200, 'May slice carries its own Nett Profit (₹200)');
  ok((mc.find((m) => m.periodKey === '2026-04')!.ledgerRows?.[0].amount) === 1000, 'Apr slice carries its own ledger rows');
}

{
  // Dateless BOM → a single slice on the override month.
  const ex: Extracted = { facts: [], rowCount: 1, through: null, bomCosts: [{ fgId: 'FG-1', bomNumber: 'B1', bomName: 'x', costPerUnit: 42 }] };
  const mc = monthBreakdown(staged(ex, '2026-09'), '2026-09');
  ok(mc.length === 1 && mc[0].basis === 'single' && mc[0].periodKey === '2026-09', 'dateless BOM → single slice on override month');
}

// ---- 2. buildLiveDeck routes facts by their own date ------------------------

console.log('\n2. buildLiveDeck — a multi-month report populates each month');

{
  // One committed Amazon report (filed under 2026-09) whose facts span three
  // live months. Each month must appear with its own revenue.
  const facts = [
    fact('2026-06-10', 1000), fact('2026-07-10', 2000), fact('2026-09-10', 3000),
  ];
  const reports = [{ connectorId: 'amazon', slotId: 'unified-transaction', periodKey: '2026-09', payload: { facts } }];
  // prefer 'live': Jun/Jul 2026 also exist in the published static MIS, which the
  // deck shows by default over a facts-only partial (G5). This guard is about
  // fact routing, so it asks for the live builds.
  const deck = buildLiveDeck(reports, [], { prefer: 'live' });
  const byKey = new Map(deck.months.map((m) => [m.key, m]));
  ok(byKey.has('2026-06') && byKey.has('2026-07') && byKey.has('2026-09'), 'all three live months built from one report');
  ok(r0(byKey.get('2026-06')!.netByChannel.Amazon ?? 0) === 1000, 'Jun Amazon net = ₹1000 (routed by fact date)');
  ok(r0(byKey.get('2026-07')!.netByChannel.Amazon ?? 0) === 2000, 'Jul Amazon net = ₹2000');
  ok(r0(byKey.get('2026-09')!.netByChannel.Amazon ?? 0) === 3000, 'Sep Amazon net = ₹3000');
  ok(byKey.get('2026-08') === undefined, 'Aug absent (no rows that month)');
}

{
  // Per-month commits (the month-split result) are equivalent: re-committing
  // only Sep overwrites Sep without disturbing Jun/Jul.
  const jun = [{ connectorId: 'amazon', slotId: 'unified-transaction', periodKey: '2026-06', payload: { facts: [fact('2026-06-10', 1000)] } }];
  const jul = [{ connectorId: 'amazon', slotId: 'unified-transaction', periodKey: '2026-07', payload: { facts: [fact('2026-07-10', 2000)] } }];
  const sep = [{ connectorId: 'amazon', slotId: 'unified-transaction', periodKey: '2026-09', payload: { facts: [fact('2026-09-10', 9999)] } }];
  const deck = buildLiveDeck([...jun, ...jul, ...sep], [], { prefer: 'live' });
  const byKey = new Map(deck.months.map((m) => [m.key, m]));
  ok(r0(byKey.get('2026-06')!.netByChannel.Amazon ?? 0) === 1000, 'per-month commits: Jun intact (₹1000)');
  ok(r0(byKey.get('2026-09')!.netByChannel.Amazon ?? 0) === 9999, 'per-month commits: Sep overwritten to ₹9999');
}

// ---- 3. Marketing bifurcation foots to the S&M line -------------------------

console.log('\n3. buildLiveDeck — marketing splits by ad platform and foots to S&M');

{
  // A facts-only month with spend across every ad platform. Each platform fact
  // carries spend; revenue keeps the month on the topline. Google File 2
  // (googleadsproducts) must NOT add on top of the googleads grand total.
  const spendFact = (source: string, spend: number, channel = 'Amazon'): DailyFact =>
    ({ source, channel, date: '2026-09-15', revenue: 0, units: 0, orders: 0, fees: 0, spend });
  const facts: DailyFact[] = [
    fact('2026-09-10', 5000, 'amazon', 'Amazon'),   // revenue, keeps month alive
    spendFact('amazonads', 300, 'Amazon'),
    spendFact('flipkartads', 200, 'Flipkart'),
    spendFact('meta', 150, 'D2C'),
    spendFact('googleads', 100, 'D2C'),              // grand total
    spendFact('googleadsproducts', 60, 'D2C'),       // breakdown — must not double-count
  ];
  const reports = [{ connectorId: 'amazon', slotId: 'unified-transaction', periodKey: '2026-09', payload: { facts } }];
  const deck = buildLiveDeck(reports, []);
  const m = deck.months.find((x) => x.key === '2026-09')!;
  const mbp = m.marketingByPlatform ?? {};
  ok(r0(m.salesMarketing) === 750, `S&M total = ₹750 (amazonads 300 + flipkart 200 + meta 150 + googleads 100; products excluded) — got ₹${r0(m.salesMarketing)}`);
  ok(r0(mbp['Amazon Ads'] ?? 0) === 300, `Amazon Ads = ₹300 (got ₹${r0(mbp['Amazon Ads'] ?? 0)})`);
  ok(r0(mbp['Flipkart Ads'] ?? 0) === 200, `Flipkart Ads = ₹200 (got ₹${r0(mbp['Flipkart Ads'] ?? 0)})`);
  ok(r0(mbp['Meta (FB / Instagram)'] ?? 0) === 150, `Meta = ₹150 (got ₹${r0(mbp['Meta (FB / Instagram)'] ?? 0)})`);
  ok(r0(mbp['Google Ads'] ?? 0) === 100, `Google Ads = ₹100, products not double-counted (got ₹${r0(mbp['Google Ads'] ?? 0)})`);
  const sumParts = Object.values(mbp).reduce((s, v) => s + v, 0);
  ok(r0(sumParts) === r0(m.salesMarketing), `platform split foots to S&M line (parts ₹${r0(sumParts)} = S&M ₹${r0(m.salesMarketing)})`);
}

// ---- Result -----------------------------------------------------------------

if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\n✓ All ingestion-split assertions passed.');
