import test from 'node:test';
import assert from 'node:assert/strict';
import { EASEBUZZ_PAGE, payoutsSplit } from '../src/connectors/sources/easebuzz.js';

test('Easebuzz: a full page (20) is split until every range answers under the limit; deduped by payout id', async () => {
  // 3 settlements a day for 31 days = 93; the fake API cuts every answer to 20, like the live one.
  const all = Array.from({ length: 31 * 3 }, (_, i) => ({ payout_id: `P${i}`, day: `2026-10-${String(Math.floor(i / 3) + 1).padStart(2, '0')}` }));
  const asked: string[] = [];
  const fake = async (f: string, t: string) => { asked.push(`${f}..${t}`); return all.filter((p) => p.day >= f && p.day <= t).slice(0, EASEBUZZ_PAGE); };
  const r = await payoutsSplit(fake, '2026-10-01', '2026-10-31', Date.now() + 60_000);
  assert.equal(r.payouts.length, 93);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.calls > 1 && r.calls < 20, `calls ${r.calls}`);
  // A single day at the limit can't be split → warned, rows kept.
  const busy = Array.from({ length: 25 }, (_, i) => ({ payout_id: `B${i}`, day: '2026-10-05' }));
  const r2 = await payoutsSplit(async (f, t) => busy.filter((p) => p.day >= f && p.day <= t).slice(0, EASEBUZZ_PAGE), '2026-10-01', '2026-10-31', Date.now() + 60_000);
  assert.equal(r2.payouts.length, 20);
  assert.match(r2.warnings[0], /2026-10-05/);
});
