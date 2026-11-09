// Saved "Why it moved" bridge (POST/GET /api/mis/bridge, MCP mis_get_margin_bridge). Made-up figures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBridgeBody, hashOf, planWrites, readAnswer, MAX_BODY_CHARS, type StoredBridge } from '../src/services/bridgeSnapshot.js';
import { portalManifest } from '../src/portalManifest.js';
import { buildBridge } from '../../client/src/data/misDeck/bridge.ts';
import { aggregatePeriods } from '../../client/src/data/misDeck/liveAnalytics.ts';
import type { MonthlyMIS } from '../../client/src/data/misDeck/misDeckData.ts';

function month(key: string, rev: number, mk: number): MonthlyMIS {
  const [year, m] = key.split('-').map(Number);
  const cogm = rev * 0.4, gm = rev - cogm, cm1 = gm - 1e5, cm2 = cm1 - mk, cm3 = cm2 - 5e4, e = cm3 - 3e5;
  return { key, label: key, month: m, year, netByChannel: { D2C: rev }, grossByChannel: {}, returnsByChannel: {}, totalGrossRevenue: 0, totalReturns: 0, totalTaxes: 0, netRevenue: rev, interBranch: 0, turnover: 0, grossMargin: gm, cm1, cm2, cm3, ebitda: e, netIncome: e, cogm, channelFulfillment: 1e5, salesMarketing: mk, platformCosts: 5e4, opex: 3e5, nonOperating: 0, costOfFundraising: 0, cogmLines: {}, opexLines: {}, marketingByPlatform: { 'Amazon Ads': mk } };
}
const comp = (k: string): any => ({ periodKey: k, hasTally: true, cogmReal: true, level: 'full', sources: [], through: null, reconcileResidual: null });
function real() {
  const ms = [month('2026-09', 2e6, 2e5), month('2026-10', 2.4e6, 6e5)];
  const p = aggregatePeriods(ms, { '2026-09': comp('2026-09'), '2026-10': comp('2026-10') }, 'month');
  const r = buildBridge({ base: p[0], cur: p[1] });
  const { bars: _b, ...slim } = r as any; // eslint-disable-line @typescript-eslint/no-unused-vars
  return slim;
}

test('a real bridge (without bars) passes validation and keeps its numbers', () => {
  const doc = cleanBridgeBody({ month: '2026-10', previous: real(), lastYear: null });
  assert.equal(doc.month, '2026-10');
  assert.equal(doc.lastYear, null);
  assert.equal((doc.previous as any).steps.length, real().steps.length);
  assert.equal((doc.previous as any).delta, real().delta);
});

test('bad bodies are refused: month, text where a number belongs, unknown step, too big', () => {
  assert.throws(() => cleanBridgeBody({ month: 'Oct', previous: null }));
  const r = real();
  assert.throws(() => cleanBridgeBody({ month: '2026-10', previous: { ...r, delta: '5' } }));
  assert.throws(() => cleanBridgeBody({ month: '2026-10', previous: { ...r, steps: [{ ...r.steps[0], id: 'hack' }] } }));
  assert.throws(() => cleanBridgeBody({ month: '2026-10', previous: { ...r, delta: Infinity } }));
  assert.throws(() => cleanBridgeBody({ month: '2026-10', previous: { ...r, notes: ['x'.repeat(MAX_BODY_CHARS)] } }), /large/);
});

test('extra fields are dropped (only the whitelist is stored)', () => {
  const r = real();
  const doc = cleanBridgeBody({ month: '2026-10', rows: [{ secret: 1 }], previous: { ...r, rawRows: [1, 2], steps: r.steps.map((s: any) => ({ ...s, junk: 'x' })) } });
  assert.ok(!('rows' in doc));
  assert.ok(!('rawRows' in (doc.previous as object)));
  assert.ok(!('junk' in (doc.previous as any).steps[0]));
});

test('writes: once per content change; latest only moves to the same or a newer month', () => {
  const a = cleanBridgeBody({ month: '2026-10', previous: real() });
  const st = (d: typeof a): StoredBridge => ({ ...d, asOf: 'x', hash: hashOf(d) });
  assert.deepEqual(planWrites(a, null, null), { month: true, latest: true, hash: hashOf(a) });
  const same = planWrites(a, st(a), st(a));
  assert.equal(same.month, false);
  assert.equal(same.latest, false);
  const older = cleanBridgeBody({ month: '2026-09', previous: null });
  const o = planWrites(older, null, st(a));
  assert.equal(o.month, true);
  assert.equal(o.latest, false);
});

test('read answer: nothing saved = nulls with a note, never zeros', () => {
  const none = readAnswer(null);
  assert.equal(none.asOf, null);
  assert.equal(none.previous, null);
  const a = cleanBridgeBody({ month: '2026-10', previous: real() });
  assert.equal(readAnswer({ ...a, asOf: '2026-11-09T10:00:00.000Z', hash: hashOf(a) }).asOf, '2026-11-09T10:00:00.000Z');
});

test('manifest lists mis_get_margin_bridge as a session-auth read tool', () => {
  const e = portalManifest.exposes.find((x) => x.id === 'margin-bridge') as any;
  assert.ok(e);
  assert.equal(e.auth, 'session');
  assert.equal(e.method, 'GET');
  assert.equal(e.mcp.tool, 'mis_get_margin_bridge');
  assert.equal(e.mcp.access, 'read');
  assert.ok(e.path.startsWith('/api/mis/bridge'));
});
