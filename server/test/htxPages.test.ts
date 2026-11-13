// People & teams (portal.heatronics.in): the MIS publishes its pages and refuses the ones a person may not open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV } from '../../client/src/nav/config.ts';
import { catalogFromNav } from '../../scripts/gen-htx-pages.mjs';
import { HTX_PAGES } from '../src/htxPages.ts';
import { allowsPage, htxGate, pageOfPath, parsePages } from '../src/htxGate.ts';

test('the page list = the menu (regenerate: node --experimental-strip-types scripts/gen-htx-pages.mjs)', () => {
  assert.deepEqual(HTX_PAGES, catalogFromNav(NAV));
  assert.equal(HTX_PAGES.pages[0].id, 'today', 'home first: a person without Today is sent to their first page');
});

test('URLs map to their menu page; exact pages own only their own path', () => {
  const P = HTX_PAGES.pages;
  assert.equal(pageOfPath('/today', P), 'today');
  assert.equal(pageOfPath('/tasks', P), 'tasks');
  assert.equal(pageOfPath('/tasks/settings', P), 'people');
  assert.equal(pageOfPath('/reporting/mis/chat', P), 'insights');
  assert.equal(pageOfPath('/assets/index.js', P), null);
  assert.equal(pageOfPath('/api/tds', P), null);
  assert.equal(allowsPage(['tasks'], 'tds'), false);
  assert.equal(allowsPage(null, 'tds'), true);
  assert.deepEqual(parsePages(['tds', 'bad id']), ['tds']);
  assert.equal(parsePages(undefined), null);
});

function run(gate: ReturnType<typeof htxGate>, url: string) {
  return new Promise<{ status: number; location?: string; body?: unknown; next: boolean }>((resolve) => {
    const out: { status: number; location?: string; body?: unknown; next: boolean } = { status: 200, next: false };
    const res: any = {
      status(n: number) { out.status = n; return res; }, type() { return res; }, set() { return res; },
      send(b: unknown) { out.body = b; resolve(out); }, json(b: unknown) { out.body = b; resolve(out); },
      redirect(n: number, l: string) { out.status = n; out.location = l; resolve(out); },
    };
    const req: any = { originalUrl: url, headers: { host: 'mis.heatronics.in', cookie: 'htx_session=tok-mis-pages' } };
    void gate(req, res, () => { out.next = true; resolve(out); });
  });
}

test('gate: refuses pages the hub does not grant, sends home to the first page, answers /api/htx/pages', async () => {
  const realFetch = globalThis.fetch;
  const prev = process.env.K_SERVICE;
  process.env.K_SERVICE = 'test';
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, email: 'a@heatronics.in', pages: ['tasks', 'tds'] }), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
  try {
    const gate = htxGate({ portal: 'mis', host: 'mis.heatronics.in', catalog: HTX_PAGES });
    const live = await run(gate, '/reporting/mis/live');
    assert.equal(live.status, 302);
    assert.match(live.location!, /portal\.heatronics\.in\/denied\?portal=mis&page=live/);
    assert.equal((await run(gate, '/today')).location, '/tasks');
    assert.equal((await run(gate, '/accounts/tds')).next, true);
    assert.equal((await run(gate, '/api/connectors/slots')).next, true, 'APIs keep working for anyone who can open the MIS');
    assert.deepEqual((await run(gate, '/api/htx/pages')).body, { pages: ['tasks', 'tds'] });
    const pub = await run(gate, '/.well-known/htx-pages.json');
    assert.equal(JSON.parse(pub.body as string).pages.length, HTX_PAGES.pages.length);
  } finally {
    globalThis.fetch = realFetch;
    if (prev === undefined) delete process.env.K_SERVICE; else process.env.K_SERVICE = prev;
  }
});
