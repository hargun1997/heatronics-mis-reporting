import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMorningBrief, inrShort, previousDay, withDay, hoursSince, type MorningInput, type MorningSnapshot } from '../src/services/morningBrief.js';
import { portalManifest } from '../src/portalManifest.js';

const balance: any = { period: '2026-10', asOf: null, cash: [], cashBank: 2_000_000, overdraft: 500_000, netCash: 1_500_000, receivables: null, payables: null, inventory: null, loans: null, gstNet: null, fixedAssets: null, workingCapital: 0, fyProfit: 0, totalAssets: 0, tbDiff: 0, warnings: [] };
const months: any[] = [{ period: '2026-09', sales: 10_000_000 }, { period: '2026-10', sales: 12_000_000 }, { period: '2026-11', sales: null }];
const base = (o: Partial<MorningInput> = {}): MorningInput => ({
  today: '2026-11-09', now: '2026-11-09T05:00:00Z', balance, months, watch: [], close: [], fix: [], tasks: [],
  tallyLastOkAt: '2026-11-09T03:00:00Z', prev: null, ...o,
});
const snap = (o: Partial<MorningSnapshot> = {}): MorningSnapshot => ({ day: '2026-11-08', at: '', netCash: 1_000_000, cashBank: 0, overdraft: 0, salesPeriod: '2026-10', sales: 1, openFix: 2, highFix: 0, lateTasks: 1, watchIds: ['cash_runway'], ...o });

test('inrShort formats Cr / L / plain and negatives', () => {
  assert.equal(inrShort(12_500_000), '₹1.25 Cr');
  assert.equal(inrShort(4_530_000), '₹45.3 L');
  assert.equal(inrShort(82_000), '₹82,000');
  assert.equal(inrShort(-250_000), '−₹2.5 L');
});

test('quiet day = ok, with five tiles and first-snapshot note', () => {
  const b = buildMorningBrief(base());
  assert.equal(b.status, 'ok');
  assert.equal(b.statusLine, 'Nothing needs you today');
  assert.deepEqual(b.tiles.map((t) => t.id), ['net_cash', 'runway', 'sales', 'fix', 'late']);
  assert.equal(b.tiles[0].value, 1_500_000);
  assert.equal(b.tiles[2].value, 12_000_000);
  assert.match(b.tiles[2].sub, /▲ 20% vs Sep 2026/);
  assert.equal(b.changed[0].id, 'first');
});

test('high items and a task 3+ days late make the day "act", sorted high first', () => {
  const b = buildMorningBrief(base({
    watch: [{ id: 'cash_runway', severity: 'high', title: 'Cash runway ≈ 2 months', reason: 'r', pct: 2, inr: -700000 }],
    fix: [{ id: 'f1', severity: 'medium', title: 'Ledger X hangs', fix: 'Move it', href: '/tasks?view=fix', area: 'books' }],
    tasks: [{ id: 't:1', title: 'Pay GST', area: 'GST', due: '2026-11-05', late: 4, owners: ['Asha'] }, { id: 't:2', title: 'Upload', area: 'x', due: '2026-11-09', late: 0, owners: [] }],
  }));
  assert.equal(b.status, 'act');
  assert.equal(b.needsYou[0].severity, 'high');
  assert.equal(b.needsYou.filter((n) => n.severity === 'high').length, 2);
  assert.match(b.statusLine, /^2 things need you today/);
  assert.equal(b.tiles[1].value, 2);
  assert.equal(b.tiles[1].tone, 'act');
  const due = b.needsYou.find((n) => n.title === 'Upload')!;
  assert.match(due.why, /due today · nobody assigned/);
});

test('low watch items are skipped and more than 6 needs fold into moreNeeds', () => {
  const fix = Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, severity: 'medium' as const, title: `F${i}`, fix: 'x', href: '/tasks', area: 'a' }));
  const b = buildMorningBrief(base({ fix, watch: [{ id: 'gst', severity: 'low', title: 'meh', reason: 'r' }] }));
  assert.equal(b.needsYou.length, 6);
  assert.equal(b.moreNeeds, 3);
  assert.equal(b.status, 'watch');
});

test('changed vs an earlier day', () => {
  const b = buildMorningBrief(base({
    prev: snap(),
    fix: [1, 2, 3].map((i) => ({ id: `f${i}`, severity: 'medium' as const, title: 't', fix: 'x', href: '/tasks', area: 'a' })),
    watch: [{ id: 'gst_spike', severity: 'medium', title: 'GST payable jumped', reason: 'r' }],
  }));
  const text = b.changed.map((c) => c.text).join(' | ');
  assert.match(text, /Net cash up ₹5 L since 2026-11-08/);
  assert.match(text, /1 new thing to fix \(2 → 3\)/);
  assert.match(text, /1 fewer task late \(1 → 0\)/);
  assert.match(text, /New to watch: GST payable jumped/);
  assert.match(text, /No longer flagged: cash runway/);
  assert.equal(b.tiles[3].delta, 1);
});

test('nothing moved says so', () => {
  const b = buildMorningBrief(base({ prev: snap({ netCash: 1_500_000, openFix: 0, lateTasks: 0, watchIds: [] }) }));
  assert.equal(b.changed.length, 1);
  assert.equal(b.changed[0].direction, 'same');
});

test('stale or missing Tally is flagged; missing balance gives null cash and a note', () => {
  const stale = buildMorningBrief(base({ tallyLastOkAt: '2026-11-05T00:00:00Z' }));
  assert.equal(stale.freshness.stale, true);
  assert.ok(stale.notes.some((n) => /may be old/.test(n)));
  const none = buildMorningBrief(base({ balance: null, tallyLastOkAt: null }));
  assert.equal(none.tiles[0].value, null);
  assert.equal(none.snapshot.netCash, null);
  assert.ok(none.notes.some((n) => /Trial Balance/.test(n)));
});

test('snapshot day helpers', () => {
  assert.equal(previousDay(['2026-11-07', '2026-11-08', '2026-11-09', 'junk'], '2026-11-09'), '2026-11-08');
  assert.equal(previousDay([], '2026-11-09'), null);
  assert.deepEqual(withDay(['2026-11-08'], '2026-11-08'), ['2026-11-08']);
  assert.equal(withDay(Array.from({ length: 50 }, (_, i) => `2026-09-${String((i % 28) + 1).padStart(2, '0')}x`), '2026-11-09', 45).length <= 45, true);
  assert.equal(hoursSince('2026-11-09T03:00:00Z', '2026-11-09T05:00:00Z'), 2);
});

test('manifest exposes the brief as mis_get_morning_brief', () => {
  const e = portalManifest.exposes.find((x) => x.id === 'morning-brief') as any;
  assert.equal(e.mcp.tool, 'mis_get_morning_brief');
  assert.equal(e.mcp.access, 'read');
  assert.equal(e.path, '/api/today');
});
