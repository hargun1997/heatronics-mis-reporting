import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunway, hasTwentieth } from '../src/services/cashRunway.js';
import { portalManifest } from '../src/portalManifest.js';

const L = 100_000;
const inp = (o = {}) => ({ today: '2026-11-09', netCash: 20 * L, balancePeriod: '2026-10', flows: [{ period: '2026-08', netChange: -5 * L }, { period: '2026-09', netChange: -10 * L }, { period: '2026-10', netChange: -3 * L }], gstPayable: null, odLimit: null, ...o });

test('13 weeks, three cases, newest 3 months used', () => {
  const r = buildRunway(inp({ flows: [{ period: '2026-06', netChange: 99 * L }, ...inp().flows] }));
  assert.equal(r.weeks.length, 13);
  assert.deepEqual(r.flowMonths, ['2026-08', '2026-09', '2026-10']);
  const [b, h, e] = r.cases;
  assert.equal(b.perMonth, -6 * L);     // average of -5, -10, -3
  assert.equal(h.perMonth, -10 * L);    // worst
  assert.equal(e.perMonth, -3 * L);     // best
  assert.ok(r.weeks[12].hard < r.weeks[12].base && r.weeks[12].base < r.weeks[12].easy);
});

test('goes below zero in the worst case only → watch', () => {
  const r = buildRunway(inp());
  // hard burns 10L/month ≈ 2.3L/week: 20L lasts ~8.7 weeks; base 6L/month lasts ~14.4 weeks (past 13)
  assert.equal(r.cases[0].zeroOn, null);
  assert.ok(r.cases[1].zeroOn);
  assert.equal(r.status, 'watch');
  assert.match(r.line, /worst month repeats net cash goes below zero/);
});

test('usual pace crossing the overdraft limit → act, with the date', () => {
  const r = buildRunway(inp({ netCash: 5 * L, odLimit: 8 * L }));
  assert.equal(r.status, 'act');
  assert.ok(r.cases[0].limitOn);
  assert.match(r.line, /reach the overdraft limit the week of 20/);
});

test('positive flows stay ok; GST lump lands once per 20th and only when payable', () => {
  const ok = buildRunway(inp({ flows: [{ period: '2026-10', netChange: 2 * L }] }));
  assert.equal(ok.status, 'ok');
  const g = buildRunway(inp({ flows: [{ period: '2026-10', netChange: 0 }], gstPayable: 4 * L }));
  assert.equal(g.weeks[12].base, 20 * L - 4 * L * 3);  // 20 Nov, 20 Dec, 20 Jan fall inside 13 weeks from 9 Nov (to 7 Feb)
  const neg = buildRunway(inp({ flows: [{ period: '2026-10', netChange: 0 }], gstPayable: -4 * L }));
  assert.equal(neg.weeks[12].base, 20 * L);            // GST refundable is not counted as cash in
  assert.equal(hasTwentieth('2026-11-16'), true);
  assert.equal(hasTwentieth('2026-11-21'), false);
});

test('no books → unknown with a note, never a made-up number', () => {
  const r = buildRunway(inp({ netCash: null }));
  assert.equal(r.status, 'unknown');
  assert.equal(r.weeks.length, 0);
  assert.ok(r.notes.length);
  assert.equal(buildRunway(inp({ flows: [] })).status, 'unknown');
});

test('manifest exposes mis_get_cash_runway', () => {
  const e = portalManifest.exposes.find((x) => x.id === 'cash-runway') as any;
  assert.equal(e.mcp.tool, 'mis_get_cash_runway');
  assert.equal(e.path, '/api/cash/runway');
});
