// Live MIS exports (Balance Sheet / Cash Flow / MIS Sheet), ledger-name rules (Blinkit / Flipkart / brand / fundraising),
// product suggester + BOM proxy. Made-up figures; no network.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LEDGER_RULES, exactNameRule, ledgerRulesReport, matchLedgerRule, sanitizeRules, setLedgerRules } from '../../client/src/data/monthClose/ledgerRules.ts';
import { exactLineOf, lookupLedger } from '../../client/src/data/monthClose/ledgerMap.ts';
import { MISSING_BOM_FGS, bomGaps, setProductMap, similarity, suggest, unmappedGaps } from '../../client/src/data/monthClose/productSuggest.ts';
import { PRODUCTS } from '../../client/src/data/monthClose/skuMap.ts';
import { computeSku } from '../../client/src/data/monthClose/skuRollup.ts';
import { emptySession, type LedgerNode, type UploadedSource } from '../../client/src/data/monthClose/schema.ts';
import { statements, type StatementMonthIn, type TbRowIn } from '../../client/src/data/statements/statements.ts';
import { buildLiveDeck } from '../../client/src/data/misDeck/liveDeck.ts';
import { buildLiveWorkbook, LIVE_EXPORT_EVERYTHING } from '../../client/src/utils/liveMisExport.ts';
import { buildLivePdf } from '../../client/src/utils/liveMisPdf.ts';
import { cleanRules } from '../src/routes/tally.ts';
import { mergeProductMap } from '../src/routes/productMap.ts';

beforeEach(() => { setLedgerRules(null); setProductMap(null); });
const node = (name: string): LedgerNode => ({ name, depth: 1, path: [], amount: 100, isLeaf: true, provenance: { sourceId: 't', sourceLabel: 't', method: 'xlsx', confidence: 'exact', verified: true } });

test('Blinkit / Flipkart sales ledgers under other names reach their revenue line; fees do not', () => {
  assert.equal(lookupLedger(node('Blinkit - Sales'), {}).lineKey, 'rev_blinkit');
  assert.equal(lookupLedger(node('Zepto Sales Account'), {}).lineKey, 'rev_blinkit');
  assert.equal(lookupLedger(node('Sales Returns - Blinkit'), {}).lineKey, 'rev_blinkit');
  assert.equal(lookupLedger(node('Flipkart Sales (GST 18%)'), {}).lineKey, 'rev_flipkart');
  assert.equal(lookupLedger(node('Blinkit Channel Fees'), {}).lineKey, 'ff_channel_fees'); // exact map wins
  assert.equal(lookupLedger(node('Blinkit Commission'), {}).lineKey, null);
  assert.equal(lookupLedger(node('Ecommerce Sales'), {}).lineKey, 'rev_amazon'); // combined ledger is never split
});

test('brand investment and fundraising split out by rule; the seed map still wins; editable', () => {
  assert.equal(lookupLedger(node('Influencer Marketing - Brand Film'), {}).lineKey, 'pf_platform');
  assert.equal(lookupLedger(node('Investment Banker Mandate Fee'), {}).lineKey, 'nl_fundraising');
  assert.equal(lookupLedger(node('Business Development Expenses'), {}).lineKey, 'nl_fundraising');
  assert.equal(lookupLedger(node('Google Ads Direct'), {}).lineKey, 'sm_total');
  setLedgerRules(DEFAULT_LEDGER_RULES.map((r) => (r.id === 'brand-agency' ? { ...r, enabled: false } : r)));
  assert.equal(lookupLedger(node('Influencer Marketing - Brand Film'), {}).lineKey, null);
  setLedgerRules([...DEFAULT_LEDGER_RULES, exactNameRule('Misc Marketing X', 'pf_platform')]);
  assert.equal(lookupLedger(node('Misc Marketing X'), {}).lineKey, 'pf_platform');
});

test('group is respected when known; sanitizeRules drops bad regexes and lines', () => {
  assert.equal(matchLedgerRule('Blinkit Sales', 'Indirect Expenses')?.id, undefined);
  assert.equal(matchLedgerRule('Blinkit Sales', 'Sales Accounts')?.line, 'rev_blinkit');
  const { rules, dropped } = sanitizeRules([{ id: 'a', line: 'rev_blinkit', pattern: '(' }, { id: 'b', line: 'nope', pattern: 'x' }, { id: 'c', line: 'rev_flipkart', pattern: 'fk' }]);
  assert.deepEqual(rules.map((r) => r.id), ['c']);
  assert.equal(dropped.length, 2);
  assert.deepEqual(cleanRules([{ id: 'a', line: 'rev_blinkit', pattern: '(' }, { id: 'c', line: 'rev_flipkart', pattern: 'fk' }]).rules.length, 1);
});

test('health report lists matched, unmatched sales, candidates and narrations', () => {
  const rep = ledgerRulesReport([
    { name: 'Quick Commerce Sales', group: 'Sales Accounts', amount: 500 },
    { name: 'Blinkit - Sales', group: 'Sales Accounts', amount: 700 },
    { name: 'Distributor Sales XYZ', group: 'Sales Accounts', amount: 90 },
    { name: 'Brand Film Shoot', group: 'Indirect Expenses', amount: 300 },
    { name: 'Legal & Advisory', group: 'Indirect Expenses', amount: 40 },
  ], [
    { date: '2026-10-03', type: 'Journal', number: '9', ledger: 'Admin Expenses', amount: 1000, narration: 'Valuation report for investor round' },
    { date: '2026-10-04', type: 'Journal', number: '10', ledger: 'Admin Expenses', amount: 10, narration: 'Courier' },
  ], DEFAULT_LEDGER_RULES, (n) => exactLineOf(n));
  assert.equal(rep.byLine.rev_blinkit.count, 2);
  assert.equal(rep.byLine.rev_blinkit.total, 1200);
  assert.deepEqual(rep.unmatchedSales.map((x) => x.name), ['Distributor Sales XYZ']);
  assert.ok(rep.matched.some((m) => m.name === 'Brand Film Shoot' && m.line === 'pf_platform'));
  assert.ok(rep.candidates.some((c) => c.name === 'Legal & Advisory'));
  assert.equal(rep.narrations.length, 1);
  assert.equal(rep.narrations[0].line, 'nl_fundraising');
});

test('name similarity and suggestions', () => {
  assert.ok(similarity('hCore X-L Lite Heating Belt', 'hCore XL (Lite)') > similarity('hCore X-L Lite Heating Belt', 'hCore Knee'));
  const cands = Object.values(PRODUCTS);
  const s = suggest('Knee Heating Pad', cands, 3);
  assert.ok(s.length > 0 && /knee/i.test(s[0].deckName + s[0].tranzactName));
  const g = unmappedGaps([
    { platform: 'meta', key: '999', name: '999, Neck Heating Pad', revenue: 1000, units: 2, month: '2026-10' },
    { platform: 'meta', key: '999', name: '999, Neck Heating Pad', revenue: 500, units: 1, month: '2026-09' },
  ], cands);
  assert.equal(g.length, 1);
  assert.equal(g[0].revenue, 1500);
  assert.equal(g[0].kind, 'meta');
  assert.ok(/neck/i.test(g[0].suggestions[0].deckName));
  assert.equal(MISSING_BOM_FGS.length, 9);
});

function skuSession(bomFgs: string[]) {
  const s = emptySession('2026-10', 'Oct');
  const prov = { sourceId: 't', sourceLabel: 't', method: 'xlsx' as const, confidence: 'exact' as const, verified: true };
  const src: UploadedSource = {
    id: 'x', label: 'x', kind: 'skuPnl', method: 'xlsx', addedAt: '', nodes: [], crossChecks: [], warnings: [],
    skuRows: [{ platform: 'b2b', key: 'FG-0089', name: 'MCP-Regular-Analog-Dark grey', revenue: 6000, units: 10, fees: 0 } as never],
    bomCosts: bomFgs.map((fg) => ({ fgId: fg, bomNumber: `B-${fg}`, bomName: fg, costPerUnit: 200, provenance: prov })),
  };
  s.sources = [src];
  return s;
}

test('no BOM never reads as a silent 100% margin: estimate from the closest product, then a confirmed proxy', () => {
  // FG-0088 "Cervical Pillow" is costed; FG-0089 "MCP-Regular-Analog-Dark grey" is not.
  const est = computeSku(skuSession(['FG-0088']));
  const a = est.aggregates[0];
  assert.equal(a.fgId, 'FG-0089');
  assert.equal(a.costEstimated, true);
  assert.equal(a.cogs, 2000);
  assert.equal(est.uncosted.length, 1);
  assert.equal(est.totalCogs, null); // the month still counts as uncosted
  setProductMap({ sku: {}, bomProxy: { 'FG-0089': 'FG-0088' } });
  const ok = computeSku(skuSession(['FG-0088']));
  assert.equal(ok.aggregates[0].costEstimated, false);
  assert.equal(ok.uncosted.length, 0);
  assert.equal(ok.totalCogs, 2000);
  const gaps = bomGaps([{ fgId: 'FG-0089', deckName: 'MCP-Regular-Analog-Dark grey', revenue: 6000, units: 10, channel: 'B2B', month: '2026-10' }], Object.values(PRODUCTS), new Set(['FG-0088']), { sku: {}, bomProxy: {} });
  assert.equal(gaps[0].suggested?.fgId, 'FG-0088');
});

test('confirmed SKU mapping resolves an unmapped Meta id', () => {
  const s = skuSession([]);
  s.sources[0].skuRows = [{ platform: 'meta', key: '777', revenue: 100, units: 1, fees: 0 } as never];
  assert.equal(computeSku(s).unmapped.length, 1);
  setProductMap({ sku: { 'meta:777': 'FG-0006' }, bomProxy: {} });
  assert.equal(computeSku(s).unmapped.length, 0);
});

test('product-map store merges only valid confirmations', () => {
  const { doc, rejected } = mergeProductMap({ sku: {}, bomProxy: {} }, { sku: { 'meta:777': 'FG-0006', bad: 'x' }, bomProxy: { 'FG-0089': 'FG-0088', 'FG-0001': 'FG-0001' } });
  assert.deepEqual(doc.sku, { 'meta:777': 'FG-0006' });
  assert.deepEqual(doc.bomProxy, { 'FG-0089': 'FG-0088' });
  assert.equal(rejected.length, 2);
});

// ---- exports ----
const g = (name: string, bal: number): TbRowIn => ({ name, level: 'group', debit: bal > 0 ? bal : 0, credit: bal < 0 ? -bal : 0 });
const l = (name: string, bal: number): TbRowIn => ({ ...g(name, bal), level: 'ledger' });
const month = (period: string, bank: number): StatementMonthIn => ({
  period, asOf: null, closingStock: 100, depreciation: 0, nettProfit: null,
  tb: { difference: 0, rows: [g('Capital Account', -1000), l('Share Capital', -1000), g('Current Assets', bank), l('Bank Accounts', bank), g('Sales Accounts', -50), g('Indirect Expenses', 50 + 1000 - bank), g('Opening Stock', 0)] },
});

test('Excel export carries Balance Sheet, Cash Flow and MIS Sheet; PDF has the three sections', () => {
  const st = statements([month('2026-09', 600), month('2026-10', 700)]);
  const deck = buildLiveDeck([], []);
  const wb = buildLiveWorkbook(deck, LIVE_EXPORT_EVERYTHING, st);
  for (const n of ['Balance Sheet', 'Cash Flow', 'MIS Sheet']) assert.ok(wb.SheetNames.includes(n), n);
  const bs = JSON.stringify(wb.Sheets['Balance Sheet']);
  assert.match(bs, /Share Capital/);
  assert.match(JSON.stringify(wb.Sheets['Cash Flow']), /Closing cash/);
  // without stored statements the sheets say so instead of being blank
  const none = buildLiveWorkbook(deck, LIVE_EXPORT_EVERYTHING, null);
  assert.match(JSON.stringify(none.Sheets['Balance Sheet']), /No Trial Balance stored yet/);
  const doc = buildLivePdf(deck, { sections: ['balanceSheet', 'cashFlow', 'misSheet'], fyKeys: [], monthKeys: [], blendCogm: false, mergeChannels: true }, st);
  assert.ok(doc.getNumberOfPages() >= 3);
});
