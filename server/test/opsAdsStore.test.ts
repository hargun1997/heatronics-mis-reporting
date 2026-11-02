import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSelectOnly } from '../src/connectors/sources/opsAdsStore.js';

test('Ops ads store: only SELECTs reach BigQuery', () => {
  assert.doesNotThrow(() => assertSelectOnly('SELECT 1 FROM ads_sp_product'));
  assert.doesNotThrow(() => assertSelectOnly('  with x as (select 1) select * from x'));
  for (const q of ['DELETE FROM ads_sp_product WHERE true', 'SELECT 1; DROP TABLE x', 'MERGE t USING s ON true', 'CREATE TABLE x AS SELECT 1', 'INSERT INTO t SELECT 1']) {
    assert.throws(() => assertSelectOnly(q), /only a SELECT/);
  }
});
