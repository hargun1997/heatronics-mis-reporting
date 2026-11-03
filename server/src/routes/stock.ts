// ----------------------------------------------------------------------------
// GET /api/stock/amazon?month=YYYY-MM — what the month-end Amazon stock valuation needs (READ ONLY):
//   rows  = Ops' Inventory Ledger balances (amz_ledger_daily_fc_latest) from the previous month's last week to the month end,
//           per date × MSKU × disposition (units = ending warehouse balance, inTransit = between FCs)
//   costs = Production's costs for the month (material ex-GST + conversion per unit, by FG code)
// The browser values it (client/src/data/stock/amazonStock.ts) with the Amazon SKU → FG map. Cached 30 min per month.
// ----------------------------------------------------------------------------
import { Router, type Request, type Response } from 'express';
import { opsQuery } from '../connectors/sources/opsBq.js';
import { productionCosts } from '../connectors/sources/production.js';
import { getEffectiveCredentials } from '../connectors/credentialStore.js';

const router = Router();
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => { if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Error.' }); });
};
const MONTH = /^\d{4}-\d{2}$/;
const end = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const prev = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

const SQL = `SELECT CAST(date AS STRING) AS date, msku, asin, UPPER(disposition) AS disposition,
    SUM(ending_balance) AS units, SUM(IFNULL(in_transit, 0)) AS in_transit
  FROM amz_ledger_daily_fc_latest
  WHERE (date BETWEEN DATE(@a) AND DATE(@b) OR date BETWEEN DATE(@c) AND DATE(@d)) AND msku IS NOT NULL
  GROUP BY 1, 2, 3, 4`;

const cache = new Map<string, { at: number; body: unknown }>();

router.get('/amazon', h(async (req, res) => {
  const month = String(req.query.month || '');
  if (!MONTH.test(month)) return res.status(400).json({ error: 'month=YYYY-MM' });
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < 30 * 60_000 && req.query.force !== '1') return res.json(hit.body);
  const pe = end(prev(month)), me = end(month);
  const [rows, costs] = await Promise.all([
    opsQuery(SQL, { a: `${pe.slice(0, 8)}01`, b: pe, c: `${me.slice(0, 8)}01`, d: me }).then((r) => ({ ok: true as const, r })).catch((e: Error) => ({ ok: false as const, e: e.message })),
    getEffectiveCredentials('tranzact', ['productionUrl', 'costsToken']).then((c) => productionCosts(c, month)).then((r) => ({ ok: true as const, r })).catch((e: Error) => ({ ok: false as const, e: e.message })),
  ]);
  const body = {
    month,
    rows: rows.ok ? rows.r.map((x) => ({ date: x.date, msku: x.msku, asin: x.asin, disposition: x.disposition, units: Number(x.units) || 0, inTransit: Number(x.in_transit) || 0 })) : [],
    costs: costs.ok ? costs.r.products.map((p) => ({ item: p.item, name: p.name, material: p.material, conversion: p.conversion ?? null })) : [],
    costMonth: costs.ok ? costs.r.month : null,
    errors: [!rows.ok ? `Amazon ledger (Ops): ${rows.e}` : '', !costs.ok ? `Production costs: ${costs.e}` : ''].filter(Boolean),
    at: new Date().toISOString(),
  };
  if (rows.ok && costs.ok) cache.set(month, { at: Date.now(), body });
  res.json(body);
}));

export default router;
