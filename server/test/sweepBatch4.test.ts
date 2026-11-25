// Next-fixes batch 4 (25 Nov 2026): the booking page names its handbook by a stable hash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { textHash } from '../../client/src/data/bookingAssistant/bookingClient.js';

test('same text = same hash; any change = new hash; shape fits the server check', () => {
  const a = textHash('# Handbook\n## TDS (open: /handbook#c1)\nDeduct 1 %.');
  assert.equal(a, textHash('# Handbook\n## TDS (open: /handbook#c1)\nDeduct 1 %.'));
  assert.notEqual(a, textHash('# Handbook\n## TDS (open: /handbook#c1)\nDeduct 2 %.'));
  assert.match(a, /^[0-9a-f]{8,20}$/);
  assert.match(textHash('x'.repeat(400_000)), /^[0-9a-f]{8,20}$/);
});
