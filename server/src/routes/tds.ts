// TDS (/accounts/tds), READ ONLY against Tally.
//   GET  /api/tds?month=YYYY-MM          what TDS planning needs, from the stored Tally Day Books + masters (services/tdsFeed.ts)
//   GET  /api/tds/invoices?month=YYYY-MM supplier invoice register of the month, with its memory (first seen, edits, removed)
//                                        (services/supplierInvoices.ts); a stored Day Book newer than the memory is merged first
//   GET  /api/tds/history?fy=2026        FY months (April →): data state (ok / stale / partial / missing / running), bills, TDS,
//                                        and the bills with TDS of each month (the client builds each month's TDS report)
//   GET  /api/tds/filed?month=           the team's filed report for a month (null when not uploaded)
//   PUT  /api/tds/filed/:month           store a filed report parsed in the browser (services/filedReports.ts); the month is "filed"
//   DELETE /api/tds/filed/:month         remove a wrong upload (the month goes back to Tally)
//   GET  /api/tds/sync                   last sync, next run, Tally freshness (signed in)
//   POST /api/tds/sync {month?}          "Sync with Tally": Day Books → memory now (signed in); waits ≤ 25 s, then "running"
//   POST /api/tds/sync/run               OPEN path with its own token (secret mis-auto-pull-token), hourly GitHub Actions
//                                        (.github/workflows/tds-sync.yml): once a day + month-end from the 5th; counts only
import { Router, type Request, type Response } from 'express';
import { readBooks, readBooksState, readMasters, readPartial } from '../connectors/tally/bookStore.js';
import { tdsFeed, tdsMonths } from '../services/tdsFeed.js';
import { duplicateBills, fyMonths, memorySummary, monthState, syncDue, tallyOffline, waitingFor } from '../services/supplierInvoices.js';
import { memoryFor, readSyncState, runTdsSync, scheduledSync, syncRunning } from '../services/tdsSync.js';
import { tallyReachedAt } from '../connectors/tally/freshness.js';
import { readJson, writeJson } from '../ingest/objectStore.js';
import { sanitizeFiled, type StoredFiledDoc } from '../services/filedReports.js';
import { autoPullCaller } from '../connectors/slots/autoPull.js';
import { sharedSecret } from '../connectors/sharedSecrets.js';

const router = Router();
const MONTH = /^\d{4}-\d{2}$/;
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => { if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Error.' }); });
};

router.get('/', h(async (req, res) => {
  const month = String(req.query.month || '');
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  const months = tdsMonths(month);
  const [docs, masters, state] = await Promise.all([Promise.all(months.map(readBooks)), readMasters(), readBooksState()]);
  const have = docs.filter((d): d is NonNullable<typeof d> => !!d);
  const feed = tdsFeed(have.flatMap((d) => d.vouchers), masters?.ledgers ?? []);
  res.json({
    month,
    months,
    storedMonths: have.map((d) => d.period),
    asOf: Object.fromEntries(have.map((d) => [d.period, state.months[d.period] ?? d.asOf])),
    mastersAt: masters?.asOf ?? null,
    ...feed,
  });
}));

const syncInfo = async () => {
  const [s, reachedAt] = await Promise.all([readSyncState(), tallyReachedAt()]);
  const now = Date.now();
  const due = syncDue(now, s);
  return { sync: s, running: syncRunning(), reachedAt, nextWhy: due.why, offline: tallyOffline(s), waiting: waitingFor(now, s) };
};

router.get('/invoices', h(async (req, res) => {
  const month = String(req.query.month || '');
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  const [mem, info] = await Promise.all([memoryFor(month), syncInfo()]);
  const rows = mem?.rows ?? [];
  res.json({
    month,
    stored: !!mem,
    booksAsOf: mem?.booksAsOf ?? null,
    syncedAt: mem?.syncedAt ?? null,
    summary: memorySummary(mem),
    duplicates: duplicateBills(rows.filter((r) => r.status === 'active')),
    rows,
    ...info,
  });
}));

router.get('/sync', h(async (_req, res) => { res.json(await syncInfo()); }));

const readFiled = (m: string) => readJson<StoredFiledDoc | null>(`tds/filed-${m}`, null);
router.get('/filed', h(async (req, res) => {
  const month = String(req.query.month || '');
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'month=YYYY-MM' });
  res.json({ month, filed: await readFiled(month) });
}));
router.put('/filed/:month', h(async (req, res) => {
  const month = String(req.params.month);
  const doc = sanitizeFiled(req.body, month, (req as unknown as { htxUser?: string }).htxUser ?? null, new Date().toISOString());
  if ('error' in doc) return void res.status(400).json(doc);
  await writeJson(`tds/filed-${month}`, doc);
  res.json({ ok: true, month, bills: doc.rows.length, netPayable: doc.netPayable });
}));
router.delete('/filed/:month', h(async (req, res) => {
  const month = String(req.params.month);
  if (!MONTH.test(month)) return void res.status(400).json({ error: 'Month must be YYYY-MM.' });
  await writeJson(`tds/filed-${month}`, null); // an empty copy = not filed (readFiled answers null)
  res.json({ ok: true, month });
}));

router.get('/history', h(async (req, res) => {
  const fy = req.query.fy ? Number(req.query.fy) : undefined;
  if (fy != null && !(fy >= 2020 && fy <= 2100)) return void res.status(400).json({ error: 'fy=YYYY (April year)' });
  const now = Date.now();
  const months = fyMonths(now, fy);
  const [info, ...docs] = await Promise.all([syncInfo(), ...months.map(async (m) => {
    const [mem, part] = await Promise.all([memoryFor(m), readPartial(m)]);
    const st = monthState(m, now, mem?.booksAsOf ?? null, part?.days.length ?? 0);
    const filed = await readFiled(m);
    return {
      month: m, ...st, filed, booksAsOf: mem?.booksAsOf ?? null, syncedAt: mem?.syncedAt ?? null, summary: memorySummary(mem),
      // Bills with TDS only (what the TDS report lists); removed ones kept so the client can show them apart.
      rows: (mem?.rows ?? []).filter((r) => r.tds !== 0),
    };
  })]);
  res.json({ fy: months[0]?.slice(0, 4) ?? null, months: docs, ...info });
}));

const SYNC_WAIT_MS = 25_000;
router.post('/sync', h(async (req, res) => {
  const month = String(req.body?.month || '');
  const months = MONTH.test(month) ? [month] : undefined;
  const p = runTdsSync('button', { months });
  let t: NodeJS.Timeout | undefined;
  const out = await Promise.race([p, new Promise<'waiting'>((r) => { t = setTimeout(() => r('waiting'), SYNC_WAIT_MS); })]).finally(() => clearTimeout(t));
  // The sync goes on after the answer (Cloud Run --no-cpu-throttling); the page polls GET /api/tds/sync.
  res.json(out === 'waiting' ? { status: 'running', ...(await syncInfo()) } : { status: out.lastError ? 'failed' : 'done', ...(await syncInfo()) });
}));

router.post('/sync/run', h(async (req, res) => {
  const caller = autoPullCaller(req as unknown as Parameters<typeof autoPullCaller>[0], await sharedSecret('mis-auto-pull-token'));
  if (!caller) return void res.status(401).json({ error: 'Not allowed' });
  const r = await scheduledSync();
  if (r.status === 'not_due' || !r.promise) return void res.json({ status: r.status, why: r.why });
  let t: NodeJS.Timeout | undefined;
  const out = await Promise.race([r.promise, new Promise<'waiting'>((ok) => { t = setTimeout(() => ok('waiting'), 240_000); })]).finally(() => clearTimeout(t));
  if (out === 'waiting') return void res.json({ status: 'started', why: r.why });
  // Counts only: no figures, no names (the repo and this URL are public).
  res.json({ status: out.lastError ? 'failed' : 'done', why: r.why, months: out.lastRun?.months ?? [], bills: out.lastRun?.bills ?? 0, tallyDown: !!out.lastError });
}));

export default router;
