import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipOrder } from '../src/connectors/sources/shopify.js';

test('test, cancelled and outlier orders are skipped', () => {
  assert.equal(shouldSkipOrder({ test: true }), true);
  assert.equal(shouldSkipOrder({ cancelled_at: '2026-06-11T10:00:00Z' }), true);
  assert.equal(shouldSkipOrder({ total_price: '1890000000' }), true);
  assert.equal(shouldSkipOrder({ total_price: '1499.00' }), false);
});
