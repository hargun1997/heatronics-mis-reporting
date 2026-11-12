// Security regressions: every registered route sits behind the login gate (only the documented machine endpoints
// skip it), the gate can't be skipped with a forged Host / X-Forwarded-Host, open paths are exact, store keys can't
// walk out of their folder, and the SSRF / read-only guards refuse what they must. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

process.env.K_SERVICE = 'heatronics-mis-test'; // behave as on Cloud Run
delete process.env.HTX_GATE;

const { default: app } = await import('../src/app.js');
const { htxGate } = await import('../src/htxGate.js');
const { expensesAllowed } = await import('../src/routes/expenses.js');
const { localPath } = await import('../src/ingest/objectStore.js');
const { isInternalHost, assertSafeTallyUrl, isAllowedFeedHost } = await import('../src/connectors/safeUrl.js');
const { endpoint: tallyEndpoint } = await import('../src/connectors/sources/tally.js');
const { feedOrigin } = await import('../src/connectors/sources/delhivery.js');
const { assertMetaReadOnly } = await import('../src/connectors/sources/meta.js');
const { assertGoogleAdsReadOnly } = await import('../src/connectors/sources/googleAds.js');
const { assertReadOnly: assertAmazonAdsReadOnly } = await import('../src/connectors/sources/amazonAds.js');
const { assertReadOnly: assertFlipkartReadOnly } = await import('../src/connectors/sources/flipkart.js');

/** The documented open paths (CLAUDE.md "Login") + health. Anything else must need a login. */
const OPEN = new Set(['/api/work/reminders/run', '/api/ownership/reminders/run', '/api/expenses', '/api/tally/poll', '/api/connectors/auto-pull/run', '/api/health', '/.well-known/portal.json']);

type Layer = { route?: { path: string; methods: Record<string, boolean> }; name: string; handle: { stack?: Layer[] }; regexp: RegExp };

/** Mount path of a router layer from its regexp (Express 4: /^\/api\/tally\/?(?=\/|$)/i). */
function mountOf(l: Layer): string {
  const src = l.regexp.source;
  if (src === '^\\/?(?=\\/|$)' || src === '^\\/?$') return '';
  return src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
}

function routes(stack: Layer[], base = ''): { method: string; path: string }[] {
  const out: { method: string; path: string }[] = [];
  for (const l of stack) {
    if (l.route) {
      for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: base + l.route.path });
    } else if (l.name === 'router' && l.handle.stack) {
      out.push(...routes(l.handle.stack, base + mountOf(l)));
    }
  }
  return out;
}

function request(port: number, method: string, p: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: 'mis.heatronics.in', ...headers } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

const concrete = (p: string) => p.replace(/:[A-Za-z]+/g, 'x').replace(/\*/g, 'x').replace(/(.)\/$/, '$1');

test('every registered route needs a login (only the documented machine endpoints are open)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = routes((app as any)._router.stack as Layer[]);
  assert.ok(all.length > 100, `found ${all.length} routes`);
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const leaks: string[] = [];
    for (const r of all) {
      const p = concrete(r.path);
      if (OPEN.has(p) || p === 'x') continue; // open on purpose; '*' = the SPA fallback (only in production)
      for (const headers of [{}, { 'x-forwarded-host': 'localhost' }, { host: 'localhost' }]) {
        const status = await request(port, r.method, p, headers);
        if (status !== 401) leaks.push(`${r.method} ${r.path} ${JSON.stringify(headers)} → ${status}`);
      }
    }
    assert.deepEqual(leaks, []);
    // The open routes registered are exactly the documented ones.
    const open = [...new Set(all.map((r) => concrete(r.path)).filter((p) => OPEN.has(p)))].sort();
    assert.deepEqual(open, ['/.well-known/portal.json', '/api/connectors/auto-pull/run', '/api/expenses', '/api/health', '/api/ownership/reminders/run', '/api/tally/poll', '/api/work/reminders/run']);
  } finally {
    server.close();
  }
});

test('open paths are exact: nothing under them or reached through dot segments skips the login', async () => {
  const gate = htxGate({ portal: 'mis', host: 'mis.heatronics.in', openPaths: ['/api/tally/poll', '/api/expenses'] });
  const run = async (url: string, headers: Record<string, string> = {}) => {
    let passed = false;
    let status = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = { status(s: number) { status = s; return res; }, json() { return res; }, redirect(s: number) { status = s; return res; }, type() { return res; }, send() { return res; } };
    await gate({ originalUrl: url, headers: { host: 'mis.heatronics.in', ...headers } }, res, () => { passed = true; });
    return passed ? 'next' : status;
  };
  assert.equal(await run('/api/tally/poll'), 'next');
  assert.equal(await run('/api/tally/poll/'), 'next');
  assert.equal(await run('/api/expenses?month=2026-10'), 'next');
  assert.equal(await run('/api/tally/poll/../status'), 401);
  assert.equal(await run('/api/tally/poll/x'), 401);
  assert.equal(await run('/api/expenses/%2e%2e/payments/payees'), 401);
  assert.equal(await run('/api/expenses//x'), 401);
  assert.equal(await run('/api/payments/payees', { 'x-forwarded-host': 'localhost' }), 401);
  assert.equal(await run('/api/payments/payees', { host: '127.0.0.1' }), 401);
  process.env.HTX_GATE = 'off'; // ignored on Cloud Run
  try { assert.equal(await run('/api/payments/payees'), 401); } finally { delete process.env.HTX_GATE; }
});

test('local dev bypass still works off Cloud Run', async () => {
  const k = process.env.K_SERVICE;
  delete process.env.K_SERVICE;
  try {
    const gate = htxGate({ portal: 'mis', host: 'mis.heatronics.in' });
    let passed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { originalUrl: '/api/payments/payees', headers: { host: 'localhost:3001' } };
    await gate(req, {}, () => { passed = true; });
    assert.ok(passed);
    assert.equal(req.htxAuthed, true);
  } finally {
    process.env.K_SERVICE = k;
  }
});

test('/api/expenses: token or sign-in on Cloud Run, never open without a token there', () => {
  const env = { K_SERVICE: 'x', EXPENSES_API_TOKEN: 'secret-1' } as NodeJS.ProcessEnv;
  assert.equal(expensesAllowed({ headers: {} }, env), false);
  assert.equal(expensesAllowed({ headers: { authorization: 'Bearer wrong' } }, env), false);
  assert.equal(expensesAllowed({ headers: { authorization: 'Bearer secret-1' } }, env), true);
  assert.equal(expensesAllowed({ headers: {}, htxAuthed: true }, env), true);
  assert.equal(expensesAllowed({ headers: {} }, { K_SERVICE: 'x' } as NodeJS.ProcessEnv), false);
  assert.equal(expensesAllowed({ headers: {} }, {} as NodeJS.ProcessEnv), true); // local dev, no token
  // shared secret mis-expenses-token (no env token): same rules
  const cr = { K_SERVICE: 'x' } as NodeJS.ProcessEnv;
  assert.equal(expensesAllowed({ headers: { authorization: 'Bearer shared-1' } }, cr, 'shared-1'), true);
  assert.equal(expensesAllowed({ headers: { authorization: 'Bearer wrong' } }, cr, 'shared-1'), false);
  assert.equal(expensesAllowed({ headers: {} }, cr, 'shared-1'), false);
});

test('local object store keys cannot leave the store folder', () => {
  const root = path.join(os.tmpdir(), 'store-test');
  assert.equal(localPath(root, 'config/a.json'), path.join(root, 'config', 'a.json'));
  assert.throws(() => localPath(root, 'ingest/../../etc/passwd'), /Bad store key/);
  assert.throws(() => localPath(root, '../x'), /Bad store key/);
});

test('ingest commit / delete refuse connector or slot ids that are not short slugs', async () => {
  const { SAFE_ID } = await import('../src/ingest/objectStore.js');
  for (const ok of ['tally', 'trial-balance', 'amazonads', 'unified-transaction']) assert.ok(SAFE_ID.test(ok), ok);
  for (const bad of ['..', '../config', 'a/b', '', 'a b', '.hidden']) assert.ok(!SAFE_ID.test(bad), bad);
});

test('SSRF: Tally host never internal on Cloud Run; warranty feed only on heatronics.in', () => {
  for (const h of ['169.254.169.254', 'metadata.google.internal', '127.0.0.1', 'localhost', '10.0.0.5', '192.168.1.2', '172.20.0.1', '[::1]', '0.0.0.0', '2130706433', '[::ffff:127.0.0.1]']) {
    assert.ok(isInternalHost(h), h);
  }
  for (const h of ['tally.thakurhardsoft.com', '203.0.113.7', 'heatronics.example.in']) assert.ok(!isInternalHost(h), h);
  assert.throws(() => assertSafeTallyUrl('http://169.254.169.254:80'), /internal/);
  assert.throws(() => assertSafeTallyUrl('file:///etc/passwd'));
  assert.throws(() => tallyEndpoint({ host: 'metadata.google.internal', port: '80' }), /internal/);
  assert.equal(tallyEndpoint({ host: '203.0.113.7', port: '9000' }), 'http://203.0.113.7:9000');
  assert.ok(isAllowedFeedHost('warranty.heatronics.in'));
  assert.ok(!isAllowedFeedHost('heatronics.in.evil.com'));
  assert.equal(feedOrigin({}), 'https://warranty.heatronics.in');
  assert.throws(() => feedOrigin({ feedUrl: 'https://evil.example' }), /heatronics\.in/);
  assert.throws(() => feedOrigin({ feedUrl: 'http://warranty.heatronics.in' }), /https/);
});

test('read-only guards: Meta, Google Ads, Amazon Ads, Flipkart refuse writes', () => {
  assert.doesNotThrow(() => assertMetaReadOnly('https://graph.facebook.com/v25.0/act_123/insights?fields=spend&access_token=x'));
  assert.doesNotThrow(() => assertMetaReadOnly('https://graph.facebook.com/v25.0/act_123?fields=account_id'));
  assert.throws(() => assertMetaReadOnly('https://graph.facebook.com/v25.0/act_123/insights?method=post'), /read only/);
  assert.throws(() => assertMetaReadOnly('https://graph.facebook.com/v25.0/act_123/ads?fields=x'), /read only/);
  assert.throws(() => assertMetaReadOnly('https://evil.example/v25.0/act_123/insights'), /read only/);
  assert.doesNotThrow(() => assertGoogleAdsReadOnly('https://googleads.googleapis.com/v25/customers/4927002413/googleAds:searchStream'));
  assert.throws(() => assertGoogleAdsReadOnly('https://googleads.googleapis.com/v25/customers/4927002413/campaigns:mutate'), /read only/);
  assert.throws(() => assertGoogleAdsReadOnly('https://googleads.googleapis.com/v25/customers/4927002413/googleAds:mutate'), /read only/);
  assert.doesNotThrow(() => assertAmazonAdsReadOnly('GET', 'https://advertising-api-eu.amazon.com/v2/profiles'));
  assert.doesNotThrow(() => assertAmazonAdsReadOnly('POST', 'https://advertising-api-eu.amazon.com/reporting/reports'));
  assert.throws(() => assertAmazonAdsReadOnly('POST', 'https://advertising-api-eu.amazon.com/sp/campaigns'), /Blocked/);
  assert.throws(() => assertAmazonAdsReadOnly('PUT', 'https://advertising-api-eu.amazon.com/sp/keywords'), /Blocked/);
  assert.throws(() => assertAmazonAdsReadOnly('DELETE', 'https://advertising-api-eu.amazon.com/reporting/reports/1'), /Blocked/);
  assert.doesNotThrow(() => assertFlipkartReadOnly('POST', 'https://api.flipkart.net/sellers/v3/shipments/filter'));
  assert.throws(() => assertFlipkartReadOnly('POST', 'https://api.flipkart.net/sellers/v3/shipments/labels'), /Blocked/);
  assert.throws(() => assertFlipkartReadOnly('POST', 'https://api.flipkart.net/sellers/listings/v3/update'), /Blocked/);
  assert.throws(() => assertFlipkartReadOnly('GET', 'https://evil.example/sellers/v3/shipments/filter'), /Blocked/);
});
