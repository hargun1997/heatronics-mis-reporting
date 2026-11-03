// Setup → "Sheet lines (advanced)" helpers (client/src/data/planning/setup/sheet.ts): the collapsed summary line and the
// pure grid / line helpers the section uses, checked on the Base plan.

import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from '../../client/src/data/planning/engine.ts';
import { basePlan, setSheetParity } from '../../client/src/data/planning/basePlan.ts';
import {
  SHEET_SECTIONS, UNIT_PARTS, addLine, cellUnits, groupTotal, lineTotalsByFy, linesOf, monthUnits, setCellPart, summary, tagMilestone,
} from '../../client/src/data/planning/setup/sheet.ts';

test('summary counts SKUs, months and cost lines on the Base plan', () => {
  const p = basePlan();
  const s = summary(p);
  assert.equal(s, `${p.skus.length} SKUs × ${p.units.length} months · ${p.lines.length} cost lines (0 off, ${p.lines.filter((l) => l.milestone).length} tagged with a milestone)`);
  assert.ok(p.skus.length >= 10 && p.units.length === 18 && p.lines.length > 100, s);
  assert.ok(s.length <= 90, `summary too long (${s.length}): ${s}`);
});

test('summary follows off / tagged changes', () => {
  const p = basePlan();
  const before = p.lines.filter((l) => l.milestone).length;
  p.lines[0].off = true;
  const untagged = p.lines.find((l) => !l.milestone)!;
  tagMilestone(p, untagged, p.business.themes[0].milestone);
  assert.equal(untagged.theme, p.business.themes[0].theme);
  assert.match(summary(p), new RegExp(`\\(1 off, ${before + 1} tagged with a milestone\\)$`));
  tagMilestone(p, untagged, '');
  assert.equal(untagged.milestone, null);
  assert.equal(untagged.theme, null);
});

test('unit grid helpers: cell = sum of its three parts, setCellPart writes whole non-negative units', () => {
  const p = basePlan();
  const [m, sku, ch] = [0, 0, 0];
  const parts = p.units[m][sku][ch];
  assert.equal(parts.length, 3);
  assert.equal(cellUnits(p, m, sku, ch), parts[0] + parts[1] + parts[2]);
  assert.equal(monthUnits(p, m, sku), p.units[m][sku].reduce((a, c) => a + c[0] + c[1] + c[2], 0));
  setCellPart(p, m, sku, ch, 2, 12.6);
  assert.equal(p.units[m][sku][ch][2], 13);
  setCellPart(p, m, sku, ch, 1, -5);
  assert.equal(p.units[m][sku][ch][1], 0);
  assert.deepEqual(UNIT_PARTS.map((x) => x.id), ['0', '1', '2', 'total']);
  assert.deepEqual(SHEET_SECTIONS.map((x) => x.id), ['revex', 'opex', 'capex', 'finex']);
});

test('line totals per FY add up to the group total per FY (sheet parity: groups hold lines only)', () => {
  const p = basePlan();
  setSheetParity(p, true); // with the founder decisions on, the engine adds product materials / D2C discounts to groups without a line
  const r = runPlan(p);
  const totals = lineTotalsByFy(r);
  for (const g of p.groups) {
    const ls = linesOf(p, g.name, '');
    for (const y of r.years) {
      const fromLines = ls.reduce((a, l) => a + (totals[l.id]?.[y.fy] ?? 0), 0);
      const fromGroup = groupTotal(r, g.name, y.fy);
      assert.ok(Math.abs(fromLines - fromGroup) <= Math.max(1, Math.abs(fromGroup) * 1e-9), `${g.name} ${y.fy}: lines ${fromLines} vs group ${fromGroup}`);
    }
  }
});

test('linesOf finds by name (case-insensitive); addLine sits right after the group’s last line', () => {
  const p = basePlan();
  const g = p.groups.find((x) => x.section === 'opex')!;
  const all = linesOf(p, g.name, '');
  assert.ok(all.length > 0);
  const word = all[0].name.split(' ')[0];
  assert.ok(linesOf(p, g.name, word.toUpperCase()).some((l) => l.id === all[0].id));
  assert.equal(linesOf(p, g.name, 'zzz-no-such-line').length, 0);

  const n = p.lines.length;
  const lastIdx = p.lines.map((x) => x.group).lastIndexOf(g.name);
  const l = addLine(p, 'opex', g.name, 'n-test');
  assert.equal(p.lines.length, n + 1);
  assert.equal(p.lines[lastIdx + 1].id, 'n-test');
  assert.deepEqual({ ...l }, { id: 'n-test', name: 'New line', section: 'opex', group: g.name, type: 'Monthly', amount: 0, start: 1, end: null, theme: null, milestone: null, repeat: true });
  // a group with no lines yet goes first (lastIndexOf = −1 → index 0), as the old Costs tab did
  addLine(p, 'opex', 'A brand-new group', 'n-test-2');
  assert.equal(p.lines[0].id, 'n-test-2');
  assert.doesNotThrow(() => runPlan(p));
});
