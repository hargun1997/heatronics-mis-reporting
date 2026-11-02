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

test('home is Live MIS; sub-routes and old addresses find their page', () => {
  assert.equal(whereIs(HOME)?.page.id, 'live');
  assert.match(app, /<Route index element=\{<Navigate to=\{HOME\}/);
  assert.equal(whereIs('/reporting/mis/chat')?.page.id, 'insights');
  assert.equal(whereIs('/tasks')?.page.id, 'tasks');
  assert.equal(whereIs('/tasks/settings')?.page.id, 'people');
  assert.equal(whereIs('/tools')?.page.id, 'toolshub');
  assert.equal(whereIs('/tools/round-planner')?.page.id, 'rounds');
  assert.equal(whereIs('/tools/invoice-booking')?.page.id, 'booking');
  assert.equal(whereIs('/tools/amazon-to-tranzact')?.page.id, 'tranzact');
  assert.equal(whereIs('/reporting/mis/send')?.page.id, 'send');
  assert.equal(whereIs('/handbook/c4')?.page.id, 'handbook');
  assert.equal(whereIs('/nowhere'), null);
});

test('breadcrumbs: Section › Page', () => {
  assert.deepEqual(breadcrumbsFor('/reporting/mis/insights'), [{ label: 'Reporting', href: '/reporting/mis/live' }, { label: 'AI insights', href: undefined }]);
  assert.deepEqual(breadcrumbsFor('/booking-assistant'), [{ label: 'Tools', href: '/tools' }, { label: 'Book an invoice', href: undefined }]);
  assert.deepEqual(breadcrumbsFor('/planning'), [{ label: 'Planning', href: undefined }, { label: '5-year plan', href: undefined }]);
});

test('"More" pages (tasks, old pages …) stay out of the sidebar but are in the palette', () => {
  assert.ok(!sidebarSections().some((s) => s.id === 'more'));
  assert.ok(paletteIndex().some((i) => i.id === 'tasks'));
  const idx = paletteIndex();
  assert.ok(idx.some((i) => i.id === 'deck'));
  assert.equal(searchPalette(idx, 'connectors')[0]?.id, 'sources');
  assert.equal(searchPalette(idx, 'tally')[0]?.id, 'tally');
  assert.equal(searchPalette(idx, 'plan')[0]?.id, 'plan');
});

test('sidebar stays small: ≤ 5 sections, ≤ 13 pages in all; every tool sits under Tools', () => {
  const s = sidebarSections();
  assert.ok(s.length <= 5);
  assert.ok(s.reduce((a, x) => a + x.pages.length, 0) <= 13);
  assert.deepEqual(s.find((x) => x.id === 'tools')?.pages.map((p) => p.id), ['send', 'booking', 'floors', 'tranzact']);
});
