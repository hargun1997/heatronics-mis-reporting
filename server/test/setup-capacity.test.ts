// Setup → "Capacity, sites & capex" (docs/planning/ONE-SETUP.md §2.7): the summary line, the one peak-use feedback line,
// the capex groups and the row factories (client/src/data/planning/setup/capacity.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from '../../client/src/data/planning/engine.ts';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr, emptyGrowth, ensureGrowthGroups } from '../../client/src/data/planning/growth.ts';
import {
  CAPEX_GROUPS, baseCapacityOf, newBlock, newCapex, newExpense, newSite, overheadGroups, peakUse, peakUseLine, plannedCapacity, summary,
} from '../../client/src/data/planning/setup/capacity.ts';

const CR = 1e7;

test('capacity summary: no growth layer = what ensureGrowth would create, nothing planned', () => {
  const p = basePlan();
  assert.equal(p.growth, undefined);
  assert.equal(baseCapacityOf(p), emptyGrowth().baseCapacity);
  assert.equal(summary(p), '13,000 → 13,000 units/mo · 0 blocks · 0 sites · 0 running costs · 0 capex items');
});

test('capacity summary: counts only what is on; Σ on blocks is added to capacity today', () => {
  const p = basePlan();
  p.growth = { ...emptyGrowth(), on: true, baseCapacity: 12_000 };
  ensureGrowthGroups(p);
  const g = p.growth;
  g.capacity.push(newBlock('c1', 13), { ...newBlock('c2', 20), unitsPerMonth: 5_000 }, { ...newBlock('c3', 30), on: false, unitsPerMonth: 99_999 });
  g.overheads = [newSite('o1', 13), { ...newSite('o2', 20), on: false }, newExpense('o3', 7), { ...newExpense('o4', 7), kind: 'pct', amount: 0.01 }];
  g.capex.push(newCapex('x1', 13), { ...newCapex('x2', 14), on: false });
  assert.equal(plannedCapacity(p), 27_000);
  assert.equal(summary(p), '12,000 → 27,000 units/mo · 2 blocks · 1 sites · 2 running costs · 1 capex items');
  assert.ok(summary(p).length <= 90);
});

test('capacity summary: the ₹500 Cr scenario gives a non-empty line under 90 chars', () => {
  const s = summary(build500Cr(basePlan()));
  assert.ok(s.length > 0 && s.length <= 90, s);
  assert.match(s, /^[\d,]+ → [\d,]+ units\/mo · \d+ blocks · \d+ sites · \d+ running costs · \d+ capex items$/);
});

test('peak use: the highest month, how many are over 100 %, null without capacity', () => {
  const months = [
    { label: 'Oct-26', utilisation: 0.4 }, { label: 'Nov-26', utilisation: 1.12 }, { label: 'Dec-26', utilisation: 1.05 }, { label: 'Jan-27', utilisation: 0.9 },
  ];
  assert.deepEqual(peakUse(months), { utilisation: 1.12, label: 'Nov-26', overMonths: 2 });
  assert.equal(peakUseLine(months), 'Peak use 112% in Nov-26; over 100% in 2 months');
  assert.equal(peakUseLine([{ label: 'Oct-26', utilisation: 0.6 }, { label: 'Nov-26', utilisation: 1.5 }]), 'Peak use 150% in Nov-26; over 100% in 1 month');
  assert.equal(peakUseLine([{ label: 'Oct-26', utilisation: 0.6 }]), 'Peak use 60% in Oct-26; never over 100%');
  assert.equal(peakUse([{ label: 'Oct-26', utilisation: 0 }]), null);
  assert.equal(peakUse([]), null);
  assert.equal(peakUseLine([]), 'No capacity set: utilisation is not tracked.');
});

test('peak use: reads the engine result of the ₹500 Cr scenario (first month wins a tie)', () => {
  const r = runPlan(build500Cr(basePlan()));
  const p = peakUse(r.months);
  assert.ok(p, 'the scenario sets a capacity');
  const max = Math.max(...r.months.map((m) => m.utilisation));
  assert.equal(p.utilisation, max);
  assert.equal(p.label, r.months.find((m) => m.utilisation === max)?.label);
  assert.equal(p.overMonths, r.months.filter((m) => m.utilisation > 1).length);
});

test('capex groups + overhead group options', () => {
  assert.deepEqual([...CAPEX_GROUPS], ['Plant & Machinery', 'Testing & Certification Equipment', 'New Product Tooling & Moulds', 'Brand & Creative Build', 'Technology & Infrastructure', 'Intangibles & Deposits', 'Store Fit-out']);
  const p = basePlan();
  const opts = overheadGroups(p, 'Something unknown');
  assert.equal(opts[0], 'Something unknown');
  assert.ok(opts.includes('Office & Administration'));
  for (const g of p.groups) {
    if (g.section === 'capex' || g.section === 'finex') assert.ok(!opts.includes(g.name), g.name);
    else assert.ok(opts.includes(g.name), g.name);
  }
  assert.equal(new Set(opts).size, opts.length);
});

test('row factories: the old Growth builder defaults, with the id and month given', () => {
  assert.deepEqual(newSite('o1', 13), { id: 'o1', name: 'New warehouse', on: true, kind: 'site', group: 'Rent & Facilities', month: 13, end: null, amount: 0, growthPct: 0.05, sqft: 10_000, rentPerSqft: 25, runningPerMonth: 50_000, depositMonths: 6, fitout: 10e5 });
  assert.deepEqual(newExpense('o2', 7), { id: 'o2', name: 'New expense', on: true, kind: 'fixed', group: 'Office & Administration', month: 7, end: null, amount: 50_000, growthPct: 0.1 });
  assert.deepEqual(newBlock('c1', 13), { id: 'c1', name: 'New line', on: true, month: 13, leadMonths: 3, unitsPerMonth: 10_000, capex: 1 * CR, monthlyOpex: 2e5 });
  assert.deepEqual(newCapex('x1', 13), { id: 'x1', name: 'New capex', on: true, group: 'Plant & Machinery', month: 13, amount: 50e5 });
});
