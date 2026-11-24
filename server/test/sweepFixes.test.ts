// Fixes from the page sweep (25 Nov 2026): claim keys with supplier names.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.INGEST_STORE = 'local';
const { CLAIM_KEY } = await import('../src/routes/tds.js');

test('claim keys take supplier names with / , @ but not | or control characters', () => {
  assert.ok(CLAIM_KEY.test('amazon|2026-Q2'));
  assert.ok(CLAIM_KEY.test('other:Test Logistics Pvt. Ltd / Unit 2, Noida @ Hub|2026-Q3'));
  assert.equal(CLAIM_KEY.test('other:a|b|2026-Q3'), false);
  assert.equal(CLAIM_KEY.test('other:a\nb|2026-Q3'), false);
  assert.equal(CLAIM_KEY.test('amazon|2026-Q5'), false);
});
