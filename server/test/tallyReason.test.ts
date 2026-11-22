// Live MIS tiles say WHY EBITDA / net income / costs are not read (PR 4, 22 Nov 2026). Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthTallyReason, tallyReason } from '../../client/src/data/misDeck/tallyReason.ts';

const c = (o: Record<string, unknown>) => ({ periodKey: '2026-11', hasTally: false, level: 'contribution', ...o }) as never;

test('one month: the reason, by what is missing', () => {
  assert.equal(monthTallyReason(c({ level: 'full', hasTally: true }), '2026-11'), null);
  assert.equal(monthTallyReason(c({ tallyIgnored: 'x' }), '2026-11'), 'Tally copy for Nov 26 has no sales yet');
  assert.equal(monthTallyReason(c({}), '2026-11'), 'No Tally P&L for Nov 26');
  assert.equal(monthTallyReason(c({ hasTally: true, tallyGaps: [{ channel: 'Flipkart' }, { channel: 'Blinkit' }, { channel: 'GT' }] }), '2026-11'), 'Tally misses Flipkart, Blinkit +1 sales for Nov 26');
  assert.equal(monthTallyReason(c({ hasTally: true }), '2026-11'), 'Tally has no sales for Nov 26');
  assert.equal(monthTallyReason(undefined, '2026-11'), 'No data for Nov 26');
});

test('period: one month gives its reason; several give a count; all full falls back', () => {
  const comp = { '2026-10': c({ periodKey: '2026-10', level: 'full', hasTally: true }), '2026-11': c({}) } as never;
  assert.equal(tallyReason(['2026-11'], comp), 'No Tally P&L for Nov 26');
  assert.equal(tallyReason(['2026-10', '2026-11'], comp), '1 of 2 months not in Tally');
  assert.equal(tallyReason(['2026-10'], comp), 'needs Tally');
});
