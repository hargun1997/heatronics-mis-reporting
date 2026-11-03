// Every Setup section's collapsed summary is a short non-empty line for the Base and for the ₹500 Cr growth plan (ONE-SETUP.md §6.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basePlan } from '../../client/src/data/planning/basePlan.ts';
import { build500Cr } from '../../client/src/data/planning/growth.ts';
import { summary as start } from '../../client/src/data/planning/setup/mode.ts';
import { summary as assumptions } from '../../client/src/data/planning/setup/assumptions.ts';
import { summary as products } from '../../client/src/data/planning/setup/products.ts';
import { summary as customers } from '../../client/src/data/planning/setup/customers.ts';
import { summary as retail } from '../../client/src/data/planning/setup/retail.ts';
import { summary as team } from '../../client/src/data/planning/setup/team.ts';
import { summary as capacity } from '../../client/src/data/planning/setup/capacity.ts';
import { summary as funding } from '../../client/src/data/planning/setup/funding.ts';
import { summary as targets } from '../../client/src/data/planning/setup/targets.ts';
import { summary as narrative } from '../../client/src/data/planning/setup/narrative.ts';
import { summary as sheet } from '../../client/src/data/planning/setup/sheet.ts';

const ALL = { start, assumptions, products, customers, retail, team, capacity, funding, targets, narrative, sheet };

test('every Setup section summarises the Base and the growth plan in one short line', () => {
  const plans = { base: basePlan(), growth: build500Cr(basePlan()) };
  for (const [pn, p] of Object.entries(plans)) for (const [sn, f] of Object.entries(ALL)) {
    const s = f(p);
    assert.ok(typeof s === 'string' && s.trim().length > 0, `${sn} summary empty for ${pn}`);
    assert.ok(s.length <= 100, `${sn} summary too long for ${pn}: ${s}`);
  }
});
