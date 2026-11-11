// The MIS menu (client/src/nav/config.ts) is the one source of truth for the sidebar, ⌘K and breadcrumbs.
// These keep it honest against the router (client/src/App.tsx): every menu page has a route, and every
// page route (not a redirect) belongs to a menu page, so nothing goes missing from the menu again.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV, HOME, whereIs, breadcrumbsFor, paletteIndex, searchPalette, sidebarSections } from '../../client/src/nav/config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '../../client/src/App.tsx'), 'utf8');
const routes = [...app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)].map((m) => ({ path: '/' + m[1].replace(/\/\*$/, ''), el: m[2] }));
const pageRoutes = routes.filter((r) => r.el !== 'Navigate' && r.el !== 'HandbookRedirect' && r.path !== '/' && r.path !== '//');

test('ids are unique and every menu page has a route in App.tsx', () => {
  const ids = NAV.flatMap((s) => s.pages.map((p) => p.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const s of NAV) for (const p of s.pages) {
    assert.ok(pageRoutes.some((r) => r.path === p.href), `${p.label} (${p.href}) has no page route`);
  }
});

test('every page route belongs to a menu page', () => {
  for (const r of pageRoutes) assert.ok(whereIs(r.path), `${r.path} (${r.el}) is not in the menu`);
});

test('home is Today; sub-routes and old addresses find their page', () => {
  assert.equal(whereIs(HOME)?.page.id, 'today');
  assert.match(app, /<Route index element=\{<Navigate to=\{HOME\}/);
  assert.equal(whereIs('/reporting/mis/chat')?.page.id, 'insights');
  assert.equal(whereIs('/tasks')?.page.id, 'tasks');
  assert.equal(whereIs('/tasks/settings')?.page.id, 'people');
  assert.equal(whereIs('/tools'), null, 'the All tools hub is gone (redirects to Today)');
  assert.match(app, /<Route path="tools" element=\{<Navigate/);
  assert.match(app, /<Route path="reporting\/mis\/close" element=\{<Navigate/);
  assert.equal(whereIs('/tools/round-planner')?.page.id, 'rounds');
  assert.equal(whereIs('/tools/invoice-booking')?.page.id, 'booking');
  assert.equal(whereIs('/tools/amazon-to-tranzact')?.page.id, 'tranzact');
  assert.equal(whereIs('/reporting/mis/send')?.page.id, 'send');
  assert.equal(whereIs('/handbook/c4')?.page.id, 'handbook');
  assert.equal(whereIs('/nowhere'), null);
});

test('breadcrumbs: Section › Page', () => {
  assert.deepEqual(breadcrumbsFor('/reporting/mis/insights'), [{ label: 'Reporting', href: '/today' }, { label: 'AI insights', href: undefined }]);
  assert.deepEqual(breadcrumbsFor('/booking-assistant'), [{ label: 'Accounts', href: '/tasks' }, { label: 'Book an invoice', href: undefined }]);
  assert.deepEqual(breadcrumbsFor('/planning'), [{ label: 'Planning', href: undefined }, { label: '5-year plan', href: undefined }]);
});

test('"More" pages (tasks, old pages …) stay out of the sidebar but are in the palette', () => {
  assert.ok(!sidebarSections().some((s) => s.id === 'more'));
  assert.ok(paletteIndex().some((i) => i.id === 'tasks'));
  const idx = paletteIndex();
  assert.ok(!idx.some((i) => i.id === 'close'), 'the old Month close page is gone (redirects to Setup)');
  for (const id of ['send', 'rounds', 'people', 'rulebook']) assert.ok(idx.some((i) => i.id === id), `${id} is in the palette`);
  assert.ok(!idx.some((i) => i.id === 'deck'), 'the old MIS deck is gone (redirects to Live MIS)');
  assert.equal(searchPalette(idx, 'connectors')[0]?.id, 'sources');
  assert.equal(searchPalette(idx, 'tally')[0]?.id, 'tally');
  assert.ok(searchPalette(idx, 'plan').slice(0, 2).some((i) => i.id === 'plan'), '5-year plan near the top (TDS planning also matches)');
  assert.equal(searchPalette(idx, 'tds')[0]?.id, 'tds');
});

test('sidebar stays small: 4 sections, 13 pages; each tool sits with its job (no Tools section)', () => {
  // Simplification, 11 Nov 2026: Send report opens from Live MIS, Round planner from the 5-year plan, People from Tasks.
  const s = sidebarSections();
  assert.equal(s.length, 4);
  assert.ok(s.reduce((a, x) => a + x.pages.length, 0) <= 13);
  assert.ok(!s.some((x) => x.id === 'tools'));
  assert.deepEqual(s.find((x) => x.id === 'reporting')?.pages.map((p) => p.id), ['today', 'live', 'insights']);
  assert.deepEqual(s.find((x) => x.id === 'accounts')?.pages.map((p) => p.id), ['tasks', 'booking', 'payments', 'tds', 'cash', 'tally', 'handbook'], 'Tasks = the one place for to-do + fix');
  assert.deepEqual(s.find((x) => x.id === 'planning')?.pages.map((p) => p.id), ['plan', 'floors']);
  assert.deepEqual(s.find((x) => x.id === 'admin')?.pages.map((p) => p.id), ['sources']);
});

test('every sidebar page names its owner, how often and what to do', async () => {
  const { PAGE_OWNER } = await import('../../client/src/nav/config.ts');
  for (const sec of sidebarSections()) for (const p of sec.pages) {
    const o = PAGE_OWNER[p.id];
    assert.ok(o, `${p.id} has no owner`);
    assert.ok(o.role && o.cadence && o.job.length > 10, `${p.id} owner incomplete`);
  }
  const ids = new Set(NAV.flatMap((s) => s.pages.map((p) => p.id)));
  for (const k of Object.keys(PAGE_OWNER)) assert.ok(ids.has(k), `PAGE_OWNER.${k} has no page`);
});

test('sourceAgo says how old a number is in plain words', async () => {
  const { ago } = await import('../../client/src/components/ui/sourceAgo.ts');
  const now = Date.parse('2026-11-09T12:00:00Z');
  assert.equal(ago(null, now), 'not read yet');
  assert.equal(ago('2026-11-09T11:40:00Z', now), 'just now');
  assert.equal(ago('2026-11-09T09:00:00Z', now), '3 h ago');
  assert.equal(ago('2026-11-05T12:00:00Z', now), '4 days ago');
  assert.equal(ago('junk', now), 'unknown');
});
