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
//   POST /api/tds/sync                   "Sync with Tally": re-reads the whole FY (Day Books → memory; signed in); waits ≤ 25 s, then "running"
//   GET  /api/tds/claims?fy=2026          TDS to claim back from platforms (services/tdsClaims.ts) + TDS deducted from us
//   PUT  /api/tds/claims/:key            { status: claimed | received | clear, on, ref, amount } for "<platform>|<YYYY>-Q<n>"
//   GET / PUT /api/tds/claims-settings   TAN, ad account / customer ids, contact for the claim emails
//   POST /api/tds/sync/run               OPEN path with its own token (secret mis-auto-pull-token), hourly GitHub Actions
//                                        (.github/workflows/tds-sync.yml): once a day + month-end from the 5th; counts only
import { Router, type Request, type Response } from 'express';
import { addMonths, mergePartial, readBooks, readBooksState, readMasters, readPartial } from '../connectors/tally/bookStore.js';
import { DEFAULT_SETTINGS as GST_DEFAULTS } from '../services/gstRefund.js';
import { buildClaims, EMPTY_CLAIM_SETTINGS, sanitizeClaim, sanitizeClaimSettings, type ClaimRecords, type ClaimSettings } from '../services/tdsClaims.js';
import { tdsFeed, tdsMonths } from '../services/tdsFeed.js';
import { duplicateBills, fyMonths, memorySummary, monthState, syncDue, tallyOffline, waitingFor } from '../services/supplierInvoices.js';
import { memoryFor, passLeft, readSyncState, runTdsSync, scheduledSync, syncRunning } from '../services/tdsSync.js';
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
  const left = await passLeft(s);
  return { sync: s, running: syncRunning(), reachedAt, nextWhy: due.why, offline: tallyOffline(s), waiting: [...waitingFor(now, s), ...(left.length ? [`full-year re-read: ${left.length} month(s) left`] : [])], passLeft: left };
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
  // The button re-reads the whole financial year too (founder, 22 Nov 2026); a pass already running goes on.
  const p = runTdsSync('button');
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

// ---- TDS to claim back (founder, 23 Nov 2026)
const readClaims = () => readJson<ClaimRecords>('tds/claims', {});
const readClaimSettings = async () => ({ ...EMPTY_CLAIM_SETTINGS, ...(await readJson<Partial<ClaimSettings>>('tds/claims-settings', {})) });
// The platform part holds supplier names ("other:<name>") with "/", "," or "@": any printable text but "|".
// The key is a field of one JSON doc, never a store path.
export const CLAIM_KEY = { test: (k: string) => { const m = /^([^|]{1,140})\|\d{4}-Q[1-4]$/.exec(k); return !!m && ![...m[1]].some((c) => c.charCodeAt(0) < 32); } };
router.get('/claims', h(async (req, res) => {
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  const curFy = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fy = Number(req.query.fy) || curFy;
  if (fy < 2020 || fy > curFy) return void res.status(400).json({ error: 'fy=YYYY (April of the year)' });
  const last = fy === curFy ? now.toISOString().slice(0, 7) : `${fy + 1}-03`;
  const months: string[] = [];
  for (let m = `${fy}-04`; m <= last; m = addMonths(m, 1)) months.push(m);
  const [docs, parts, masters, records, settings, state, reachedAt] = await Promise.all([
    Promise.all(months.map(readBooks)), Promise.all(months.map(readPartial)), readMasters(), readClaims(), readClaimSettings(), readBooksState(), tallyReachedAt(),
  ]);
  const vouchers = months.flatMap((m, i) => mergePartial(docs[i]?.vouchers ?? [], parts[i]).vouchers);
  const report = buildClaims({ fy, vouchers, ledgers: masters?.ledgers ?? [], records, today: now.toISOString().slice(0, 10) });
  const gst = await readJson<{ gstin?: string }>('gst-refund/settings', {});
  const gstin = gst.gstin || GST_DEFAULTS.gstin;
  res.json({ ...report, settings, company: { name: 'HEATRONICS MEDICAL DEVICES (P) LTD', gstin, pan: gstin.slice(2, 12) }, stored: months.filter((_, i) => docs[i] || parts[i]), missing: months.filter((_, i) => !docs[i] && !parts[i]), booksAsOf: Object.fromEntries(months.map((m) => [m, state.months[m] ?? null])), reachedAt });
}));

router.put('/claims/:key', h(async (req, res) => {
  const key = String(req.params.key);
  if (!CLAIM_KEY.test(key)) return void res.status(400).json({ error: 'key = <platform>|<YYYY>-Q<n>' });
  const rec = sanitizeClaim(req.body, (req as unknown as { htxUser?: string }).htxUser ?? null, new Date().toISOString());
  if (rec && 'error' in rec) return void res.status(400).json(rec);
  const all = await readClaims();
  if (rec) all[key] = rec; else delete all[key];
  await writeJson('tds/claims', all);
  res.json({ ok: true, record: rec });
}));

router.get('/claims-settings', h(async (_req, res) => { res.json(await readClaimSettings()); }));
router.put('/claims-settings', h(async (req, res) => {
  const s = sanitizeClaimSettings(req.body);
  if (s.tan && !/^[A-Z]{4}\d{5}[A-Z]$/.test(s.tan)) return void res.status(400).json({ error: 'TAN has 10 characters: 4 letters, 5 digits, 1 letter.' });
  await writeJson('tds/claims-settings', s);
  res.json({ ok: true, settings: s });
}));

export default router;
