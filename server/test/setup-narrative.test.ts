// Setup → Business plan text (client/src/data/planning/setup/narrative.ts): renaming a milestone re-tags the cost lines that
// carried the old name, re-theming moves their theme, and the collapsed summary counts what the plan holds.

import test from 'node:test';
import assert from 'node:assert/strict';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr } from '../../client/src/data/planning/growth.ts';
import type { Plan } from '../../client/src/data/planning/engine.ts';
import {
  addAssumption, addMilestone, addRisk, renameMilestone, rethemeMilestone, summary, taggedLines, themesOf,
} from '../../client/src/data/planning/setup/narrative.ts';

/** A plan with two milestones in two themes and three cost lines: two tagged with the first, one with the second. */
function fixture(): Plan {
  const p = basePlan();
  p.business.themes = [
    { id: 'm1', theme: 'Brand', milestone: 'Launch topicals', month: 3 },
    { id: 'm2', theme: 'Capacity', milestone: 'Second line', month: 9 },
  ];
  for (const l of p.lines) { l.milestone = null; l.theme = null; }
  p.lines[0].milestone = 'Launch topicals'; p.lines[0].theme = 'Brand';
  p.lines[1].milestone = 'Launch topicals'; p.lines[1].theme = 'Brand';
  p.lines[2].milestone = 'Second line'; p.lines[2].theme = 'Capacity';
  return p;
}

test('narrative: renaming a milestone re-tags the cost lines that carried the old name, and only those', () => {
  const p = fixture();
  assert.equal(taggedLines(p, 'Launch topicals'), 2);
  renameMilestone(p, 0, 'Launch creams');
  assert.equal(p.business.themes[0].milestone, 'Launch creams');
  assert.equal(taggedLines(p, 'Launch creams'), 2);
  assert.equal(taggedLines(p, 'Launch topicals'), 0);
  assert.equal(p.lines[0].milestone, 'Launch creams');
  assert.equal(p.lines[1].milestone, 'Launch creams');
  assert.equal(p.lines[2].milestone, 'Second line', 'the other milestone keeps its lines');
  assert.equal(p.lines[3].milestone, null, 'untagged lines stay untagged');
  assert.equal(p.lines[0].theme, 'Brand', 'a rename never changes the theme');
});

test('narrative: renaming letter by letter (as typing does) keeps the lines attached at every step', () => {
  const p = fixture();
  for (const name of ['Launch', 'Launch c', 'Launch cr', 'Launch creams']) renameMilestone(p, 0, name);
  assert.equal(taggedLines(p, 'Launch creams'), 2);
  assert.equal(p.lines.filter((l) => l.milestone === 'Launch topicals' || l.milestone === 'Launch').length, 0);
});

test('narrative: re-theming a milestone moves its cost lines to the new theme', () => {
  const p = fixture();
  rethemeMilestone(p, 0, 'Products');
  assert.equal(p.business.themes[0].theme, 'Products');
  assert.equal(p.lines[0].theme, 'Products');
  assert.equal(p.lines[1].theme, 'Products');
  assert.equal(p.lines[2].theme, 'Capacity', 'lines of another milestone are untouched');
  assert.equal(p.lines[0].milestone, 'Launch topicals', 'a retheme never renames');
  assert.deepEqual(themesOf(p), ['Products', 'Capacity']);
});

test('narrative: rename / retheme on a row that does not exist is a no-op', () => {
  const p = fixture();
  const before = JSON.stringify(p);
  renameMilestone(p, 7, 'x');
  rethemeMilestone(p, 7, 'y');
  assert.equal(JSON.stringify(p), before);
});

test('narrative: summary counts assumptions, risks, milestones and distinct themes', () => {
  const p = fixture();
  p.business.assumptions = [
    { id: 'a1', assumption: 'Oct–Jan is peak', value: '55%', basis: 'last year' },
    { id: 'a2', assumption: 'Amazon fees', value: '28%', basis: 'fee report' },
    { id: 'a3', assumption: 'GST refund lag', value: '3 mo', basis: 'FY26' },
  ];
  p.business.risks = [{ id: 'r1', risk: 'Winter miss', mitigation: 'Topicals' }];
  assert.equal(summary(p), '3 assumptions · 1 risk · 2 milestones in 2 themes');

  addAssumption(p); addRisk(p); addMilestone(p);
  assert.equal(p.business.assumptions.length, 4);
  assert.equal(p.business.risks.length, 2);
  assert.equal(p.business.themes.length, 3);
  assert.equal(p.business.themes[2].theme, 'Brand', 'a new milestone joins the first theme');
  assert.equal(summary(p), '4 assumptions · 2 risks · 3 milestones in 2 themes');

  p.business.themes.push({ id: 'm4', theme: 'Team', milestone: 'Head of sales', month: 2 });
  assert.equal(summary(p), '4 assumptions · 2 risks · 4 milestones in 3 themes');
});

test('narrative: summary is a non-empty string for the base plan and the ₹500 Cr growth plan', () => {
  for (const p of [basePlan(), build500Cr(basePlan())]) {
    const s = summary(p);
    assert.ok(s.length > 0 && s.length <= 90, s);
    assert.match(s, /^\d+ assumptions? · \d+ risks? · \d+ milestones? in \d+ themes?$/);
  }
  const empty = basePlan();
  empty.business.assumptions = []; empty.business.risks = []; empty.business.themes = [];
  assert.equal(summary(empty), '0 assumptions · 0 risks · 0 milestones in 0 themes');
});
