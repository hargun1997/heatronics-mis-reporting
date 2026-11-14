// Connector passwords (shared with Ops and Marketing) can be changed only by a portal admin (14 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.K_SERVICE = 'heatronics-mis-test';
const { requireAdmin } = await import('../src/htxGate.js');
const { default: router } = await import('../src/routes/connectors.js');

function run(req: Record<string, unknown>) {
  let status = 200; let nextCalled = false;
  const res = { status(s: number) { status = s; return this; }, json() { return this; } };
  requireAdmin(req, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

test('requireAdmin lets an admin through and refuses everyone else', () => {
  assert.deepEqual(run({ htxAdmin: true }), { status: 200, nextCalled: true });
  assert.deepEqual(run({ htxAdmin: false }), { status: 403, nextCalled: false });
  assert.deepEqual(run({}), { status: 403, nextCalled: false });
});

test('saving and deleting connector credentials need an admin', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers = (router as any).stack.filter((l: any) => l.route?.path === '/:id/credentials');
  assert.equal(layers.length, 2);
  for (const l of layers) assert.ok(l.route.stack.some((s: { handle: unknown }) => s.handle === requireAdmin), Object.keys(l.route.methods).join());
});
