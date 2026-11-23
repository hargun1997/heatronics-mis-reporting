// GST refund (/accounts/gst-refund), READ ONLY against Tally: the month's inverted duty refund from the STORED Day Books, which
// the hourly TDS sync re-reads for the whole financial year (so the claim is live: every sync recalculates it).
//   GET  /api/gst-refund?month=YYYY-MM     the month: Statement 1A rows (inward / outward), scanner issues + fixes, Rule 89(5)
//                                          calculation, ties to the GST ledgers, 2B match, ready or not, the month record
//   GET / PUT /api/gst-refund/rules        saved classes (bill / party / ledger)
//   PUT  /api/gst-refund/settings          home state + GSTIN
//   PUT  /api/gst-refund/2b/:month         GSTR-2B rows read in the browser from the portal's Excel
//   DELETE /api/gst-refund/2b/:month       remove a wrong 2B upload
//   PUT  /api/gst-refund/month/:month      { ecl } electronic credit ledger balance and / or { filed: { arn, filedOn, amount } }
//   POST /api/gst-refund/ai/:month         AI second opinion on the bills the rules could not sort (suggestions only)
import { Router, type Request, type Response } from 'express';
import { readBooks, readBooksState, readMasters, readPartial, mergePartial } from '../connectors/tally/bookStore.js';
import { readJson, writeJson } from '../ingest/objectStore.js';
import { tallyReachedAt } from '../connectors/tally/freshness.js';
import {
  buildRefundMonth, DEFAULT_SETTINGS, EMPTY_RULES, sanitizeRules, sanitizeTwoB,
  drift, type MonthRecord, type RefundMonth, type RefundRules, type RefundSettings, type StoredTwoB,
} from '../services/gstRefund.js';
import { aiClassify } from '../services/gstRefundAi.js';

const router = Router();
const MONTH = /^\d{4}-\d{2}$/;
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => { if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Error.' }); });
};
const who = (req: Request) => (req as unknown as { htxUser?: string }).htxUser ?? null;

const EMPTY_MONTH: MonthRecord = { ecl: null, filed: null };

const readRules = () => readJson<RefundRules>('gst-refund/rules', EMPTY_RULES);
// A saved empty GSTIN never hides the default (founder, 23 Nov 2026: factory GSTIN 09AAGCH6109J1ZE).
const readSettings = async () => { const s = await readJson<Partial<RefundSettings>>('gst-refund/settings', {}); return { ...DEFAULT_SETTINGS, ...s, gstin: s.gstin || DEFAULT_SETTINGS.gstin }; };
const readTwoB = (m: string) => readJson<StoredTwoB | null>(`gst-refund/2b-${m}`, null);
const readMonth = (m: string) => readJson<MonthRecord>(`gst-refund/month-${m}`, EMPTY_MONTH);

async function compute(month: string): Promise<{ r: RefundMonth; rec: MonthRecord; booksAsOf: string | null; stored: boolean }> {
  const [books, part, masters, state, rules, settings, twoB, rec] = await Promise.all([
    readBooks(month), readPartial(month), readMasters(), readBooksState(), readRules(), readSettings(), readTwoB(month), readMonth(month),
  ]);
  const merged = mergePartial(books?.vouchers ?? [], part);
  const booksAsOf = state.months[month] ?? books?.asOf ?? null;
  const r = buildRefundMonth({ month, vouchers: merged.vouchers, ledgers: masters?.ledgers ?? [], rules, settings, twoB, ecl: rec.ecl, booksAsOf });
  return { r, rec, booksAsOf, stored: !!books || !!part };
}

router.get('/', h(async (req, res) => {
  const month = String(req.query.month || '');
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  const [{ r, rec, booksAsOf, stored }, settings, reachedAt, twoB] = await Promise.all([compute(month), readSettings(), tallyReachedAt(), readTwoB(month)]);
  res.json({ ...r, stored, booksAsOf, reachedAt, settings, record: rec, drift: drift(r, rec.filed), twoBFile: twoB ? { file: twoB.file, uploadedAt: twoB.uploadedAt, by: twoB.by } : null });
}));

router.get('/rules', h(async (_req, res) => { res.json({ rules: await readRules() }); }));

router.put('/rules', h(async (req, res) => {
  const rules = sanitizeRules(req.body);
  await writeJson('gst-refund/rules', rules);
  res.json({ ok: true, rules });
}));

router.put('/settings', h(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const gstin = typeof b.gstin === 'string' ? b.gstin.trim().toUpperCase().slice(0, 15) : '';
  const homeState = typeof b.homeState === 'string' && b.homeState.trim() ? b.homeState.trim().toUpperCase().slice(0, 60) : DEFAULT_SETTINGS.homeState;
  if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) return void res.status(400).json({ error: 'GSTIN must be 15 characters.' });
  await writeJson('gst-refund/settings', { gstin, homeState });
  res.json({ ok: true });
}));

router.put('/2b/:month', h(async (req, res) => {
  const month = String(req.params.month);
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  const doc = sanitizeTwoB(req.body, month, who(req), new Date().toISOString());
  if ('error' in doc) return void res.status(400).json(doc);
  await writeJson(`gst-refund/2b-${month}`, doc);
  res.json({ ok: true, rows: doc.rows.length });
}));

router.delete('/2b/:month', h(async (req, res) => {
  const month = String(req.params.month);
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  await writeJson(`gst-refund/2b-${month}`, null);
  res.json({ ok: true });
}));

router.put('/month/:month', h(async (req, res) => {
  const month = String(req.params.month);
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  const b = (req.body ?? {}) as { ecl?: unknown; filed?: unknown; unfile?: unknown };
  const rec = await readMonth(month);
  if ('ecl' in b) rec.ecl = typeof b.ecl === 'number' && Number.isFinite(b.ecl) && b.ecl >= 0 ? Math.round(b.ecl * 100) / 100 : null;
  if (b.unfile === true) rec.filed = null;
  if (b.filed && typeof b.filed === 'object') {
    const f = b.filed as Record<string, unknown>;
    const arn = typeof f.arn === 'string' ? f.arn.trim().toUpperCase().slice(0, 20) : '';
    if (!/^[A-Z0-9]{10,20}$/.test(arn)) return void res.status(400).json({ error: 'Enter the ARN from the portal.' });
    const { r } = await compute(month);
    rec.filed = {
      arn, filedOn: typeof f.filedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.filedOn) ? f.filedOn : new Date().toISOString().slice(0, 10),
      amount: typeof f.amount === 'number' && Number.isFinite(f.amount) ? Math.round(f.amount * 100) / 100 : r.calc.claim,
      by: who(req), at: new Date().toISOString(),
      snapshot: { netItc: r.calc.netItc, maxRefund: r.calc.maxRefund, inward: Object.fromEntries(r.inward.filter((d) => d.eligible).map((d) => [d.key, Math.round((d.igst + d.cgst + d.sgst) * 100) / 100])), outward: r.outward.length },
    };
  }
  await writeJson(`gst-refund/month-${month}`, rec);
  res.json({ ok: true, record: rec });
}));

router.post('/ai/:month', h(async (req, res) => {
  const month = String(req.params.month);
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  const keys = Array.isArray((req.body ?? {}).keys) ? new Set<string>((req.body.keys as unknown[]).filter((k): k is string => typeof k === 'string')) : null;
  const { r } = await compute(month);
  const docs = r.inward.filter((d) => (keys ? keys.has(d.key) : !d.sure && !d.ruled));
  res.json(await aiClassify(docs));
}));

export default router;
