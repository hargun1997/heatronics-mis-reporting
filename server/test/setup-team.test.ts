// Setup → Team & hiring (client/src/data/planning/setup/team.ts): the collapsed summary, the counts behind it, the default
// hire row, the "Grows with" encoding and the people-added feedback line.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan, type Hire, type Plan } from '../../client/src/data/planning/engine.ts';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr, emptyGrowth, ensureGrowthGroups } from '../../client/src/data/planning/growth.ts';
import { applyScaleKey, defaultEvery, hireOn, newHire, peopleAddedByFy, scaleKey, summary, teamCounts, teamOf } from '../../client/src/data/planning/setup/team.ts';

const withGrowth = (fn: (p: Plan) => void = () => {}) => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true };
  ensureGrowthGroups(p);
  fn(p);
  return p;
};
const hire = (over: Partial<Hire> = {}): Hire => ({ id: 'h' + Math.random().toString(36).slice(2, 6), role: 'x', dept: 'corporate', count: 1, month: 3, end: null, monthlyCtc: 1e5, ...over });

test('team summary: a plan with no growth layer shows the defaults ensureGrowth would create', () => {
  const p = basePlan();
  assert.equal(p.growth, undefined);
  const s = summary(p);
  assert.equal(s, '0 roles · 0 grow with the business · benefits 12% · increment 10%/yr');
  assert.ok(s.length > 0 && s.length <= 90);
  assert.deepEqual(teamCounts(p), { roles: 0, scaled: 0 });
  assert.deepEqual(teamOf(p).hires, []);
});

test('team summary: counts roles on and the ones that grow with the business, benefits / increment from the plan', () => {
  const p = withGrowth((x) => {
    const g = x.growth!;
    g.benefitsPct = 0.15; g.incrementPct = 0.08;
    g.hires.push(
      hire({ role: 'fixed' }),
      hire({ role: 'scaled', scale: { by: 'revenue', every: 5 } }),
      hire({ role: 'off scaled', on: false, scale: { by: 'units', every: 100 } }),
      hire({ role: 'off', on: false }),
      hire({ role: 'on explicit', on: true, scale: { by: 'outlets', every: 600, type: 'gt' } }),
    );
  });
  assert.deepEqual(teamCounts(p), { roles: 3, scaled: 2 });
  assert.equal(summary(p), '3 roles · 2 grow with the business · benefits 15% · increment 8%/yr');
  assert.equal(hireOn(hire()), true);
  assert.equal(hireOn(hire({ on: false })), false);
});

test('team summary: the ₹500 Cr growth plan', () => {
  const p = build500Cr(basePlan());
  const g = p.growth!;
  const on = g.hires.filter((h) => h.on !== false);
  const { roles, scaled } = teamCounts(p);
  assert.equal(roles, on.length);
  assert.equal(scaled, on.filter((h) => h.scale).length);
  assert.ok(scaled >= 6, 'the scenario has six roles that grow with the business');
  const s = summary(p);
  assert.equal(s, `${roles} roles · ${scaled} grow with the business · benefits 12% · increment 10%/yr`);
  assert.ok(s.length <= 90);
});

test('newHire: the row "Add a role" appends', () => {
  const h = newHire('h-abc');
  assert.deepEqual(h, { id: 'h-abc', role: 'New role', dept: 'corporate', count: 1, month: 7, end: null, monthlyCtc: 1e5, on: true });
  assert.equal(newHire('h2', 12).month, 12);
  // the engine books it: one person from month 7 on Corporate Salaries
  const p = withGrowth((x) => { x.growth!.hires.push(newHire('h-abc')); });
  const r = runPlan(p);
  assert.equal(r.months[5].growthHeadcount, 0);
  assert.equal(r.months[6].growthHeadcount, 1);
});

test('scaleKey / applyScaleKey: the "Grows with" select round-trips and keeps a typed step', () => {
  const h = hire();
  assert.equal(scaleKey(h), 'fixed');
  applyScaleKey(h, 'revenue');
  assert.deepEqual(h.scale, { by: 'revenue', every: 5 });
  assert.equal(scaleKey(h), 'revenue');
  h.scale!.every = 12;
  applyScaleKey(h, 'units');
  assert.deepEqual(h.scale, { by: 'units', every: 12 }, 'a step typed earlier is kept when the metric changes');
  applyScaleKey(h, 'outlets:gt');
  assert.deepEqual(h.scale, { by: 'outlets', every: 12, type: 'gt' });
  assert.equal(scaleKey(h), 'outlets:gt');
  applyScaleKey(h, 'outlets:');
  assert.deepEqual(h.scale, { by: 'outlets', every: 12 }, 'all outlets = no type');
  assert.equal(scaleKey(h), 'outlets:');
  applyScaleKey(h, 'fixed');
  assert.equal(h.scale, undefined);
  assert.equal(scaleKey(h), 'fixed');
  // fresh defaults per metric
  const f = hire(); applyScaleKey(f, 'units'); assert.equal(f.scale!.every, 5000);
  const o = hire(); applyScaleKey(o, 'outlets:mt'); assert.equal(o.scale!.every, 500);
  assert.deepEqual([defaultEvery('revenue'), defaultEvery('units'), defaultEvery('outlets')], [5, 5000, 500]);
});

test('peopleAddedByFy: the growth headcount in the last month of each FY', () => {
  const p = withGrowth((x) => { x.growth!.hires.push(hire({ count: 4, month: 2 }), hire({ count: 3, month: 20, end: 30 })); });
  const r = runPlan(p);
  const rows = peopleAddedByFy(r);
  assert.deepEqual(rows.map((x) => x.fy), r.years.map((y) => y.fy));
  for (const y of r.years) {
    const ms = r.months.filter((m) => m.fy === y.fy);
    assert.equal(rows.find((x) => x.fy === y.fy)!.people, ms[ms.length - 1].growthHeadcount);
  }
  assert.equal(rows[0].people, 4, 'the first FY ends with the 4 from month 2');
  assert.ok(rows.some((x) => x.people === 7), 'a FY with both roles live shows 7');
  assert.equal(rows[rows.length - 1].people, 4, 'the second role has left by the end');
  // no growth layer: every FY shows 0, never throws
  assert.ok(peopleAddedByFy(runPlan(basePlan())).every((x) => x.people === 0));
});
