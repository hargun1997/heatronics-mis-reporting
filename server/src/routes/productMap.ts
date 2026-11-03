// ----------------------------------------------------------------------------
// Founder-confirmed product mappings (objectStore `mis/product-map`), signed in:
//   GET  /api/mis/product-map                      { sku: {"platform:KEY": "FG-…"}, bomProxy: {"FG-…": "FG-…"} }
//   POST /api/mis/product-map {sku?, bomProxy?}    merge confirmed entries (one click on the suggestion)
//   DELETE /api/mis/product-map {sku?: key, bomProxy?: fg}  remove one
// The suggestions themselves are computed in the browser (client/src/data/monthClose/productSuggest.ts); only a
// confirmation is stored. Nothing here touches a connector or Tally.
// ----------------------------------------------------------------------------

import { Router } from 'express';
import { readJson, writeJson } from '../ingest/objectStore.js';

export interface ProductMapDoc { sku: Record<string, string>; bomProxy: Record<string, string> }
const KEY = 'mis/product-map';
const FG = /^FG-\d{3,5}$/;
const SKU_KEY = /^[a-z]{2,12}:[A-Z0-9]{1,80}$/;

export function mergeProductMap(cur: ProductMapDoc, add: { sku?: unknown; bomProxy?: unknown }): { doc: ProductMapDoc; rejected: string[] } {
  const doc: ProductMapDoc = { sku: { ...cur.sku }, bomProxy: { ...cur.bomProxy } };
  const rejected: string[] = [];
  for (const [k, v] of Object.entries((add.sku ?? {}) as Record<string, unknown>).slice(0, 200)) {
    if (SKU_KEY.test(k) && typeof v === 'string' && FG.test(v)) doc.sku[k] = v; else rejected.push(`sku ${k}`);
  }
  for (const [k, v] of Object.entries((add.bomProxy ?? {}) as Record<string, unknown>).slice(0, 200)) {
    if (FG.test(k) && typeof v === 'string' && FG.test(v) && k !== v) doc.bomProxy[k] = v; else rejected.push(`bomProxy ${k}`);
  }
  return { doc, rejected };
}

const router = Router();
const read = () => readJson<ProductMapDoc>(KEY, { sku: {}, bomProxy: {} });

router.get('/product-map', async (_req, res) => {
  try { res.json(await read()); } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : 'Error.' }); }
});

router.post('/product-map', async (req, res) => {
  try {
    const { doc, rejected } = mergeProductMap(await read(), req.body ?? {});
    await writeJson(KEY, doc);
    res.json({ ...doc, rejected });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : 'Error.' }); }
});

router.delete('/product-map', async (req, res) => {
  try {
    const cur = await read();
    if (typeof req.body?.sku === 'string') delete cur.sku[req.body.sku];
    if (typeof req.body?.bomProxy === 'string') delete cur.bomProxy[req.body.bomProxy];
    await writeJson(KEY, cur);
    res.json(cur);
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : 'Error.' }); }
});

export default router;
