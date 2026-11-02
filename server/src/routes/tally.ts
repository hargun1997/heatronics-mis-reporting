// ----------------------------------------------------------------------------
// Tally (cloud) — stored copies of the P&L and the books, taken whenever Tally is open (READ ONLY).
//   POST /api/tally/poll          open path (GitHub Actions every 30 min, .github/workflows/tally-poll.yml);
//                                 at most every 20 min; answers a status only, never figures
//   GET  /api/tally/status        last check / last success / stored months (signed in)
//   POST /api/tally/pull          check now, skipping the 20-min gap (signed in)
//   Books (connectors/tally/books.ts + bookStore.ts), all signed in:
//   GET  /api/tally/books/status              what is stored (masters age, months)
//   POST /api/tally/books/pull {periods?}     pull masters + Day Books now (≤ ~2.5 min)
//   GET  /api/tally/books/health?months=3     Tally health checks over the newest stored months
//   GET  /api/tally/books/ledgers?q=          ledger master (+ voucher count in the stored months)
//   GET  /api/tally/books/vouchers?period=&q= vouchers of a month, filtered
//   POST /api/tally/books/ask {question, history?}  "Ask about Tally" (Claude, grounded in the stored books)
//   GET/PUT /api/tally/ledger-rules   name-pattern rules (Blinkit / Flipkart sales, brand investment, fundraising) + the stored
//                                     ledgers / P&L rows / narrations the client matches them against (health note)
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { getEffectiveCredentials } from '../connectors/credentialStore.js';
import { pollTally, readTallySnapshot, readTallyState, readTallyTb } from '../connectors/tally/snapshots.js';
import { latestMonths, pullBooks, readBooks, readBooksState, readMasters, readVouchers } from '../connectors/tally/bookStore.js';
import { findVouchers, ledgerListText, tallyHealth, voucherLine, type HealthReport } from '../connectors/tally/books.js';
import { claudeChat, isClaudeConfigured } from '../services/claudeClient.js';
import { readJson, writeJson } from '../ingest/objectStore.js';
import { BUNDLED_HISTORY } from '../services/expenseMap.js';

const router = Router();
const creds = () => getEffectiveCredentials('tally', ['host', 'port', 'company']);
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Error.' });
  });
};
const PERIOD = /^\d{4}-\d{2}$/;

router.post('/poll', h(async (_req, res) => {
  const r = await pollTally(await creds());
  res.json({ status: r.status, months: r.months ?? [] });
}));

router.get('/status', h(async (_req, res) => {
  const s = await readTallyState();
  res.json({ ...s, connected: Boolean(((await creds()).host || '').trim()) });
}));

router.post('/pull', h(async (_req, res) => {
  res.json(await pollTally(await creds(), { force: true, skipBooks: true }));
}));

// ---------------------------------------------------------------- statements (Live Balance Sheet / Cash Flow)
// The stored month-end Trial Balances + the month's P&L copy (closing stock, depreciation, Nett Profit); the client
// builds the statements (client/src/data/statements/statements.ts).
router.get('/statements', h(async (_req, res) => {
  const s = await readTallyState();
  const periods = [...new Set([...Object.keys(s.tbMonths ?? {}), ...Object.keys(s.months)])].sort().slice(-24);
  const months = await Promise.all(periods.map(async (period) => {
    const [tb, pnl] = await Promise.all([readTallyTb(period), readTallySnapshot(period)]);
    const rows = pnl?.ledgerRows ?? [];
    const stock = rows.find((r) => /^closing stock$/i.test(r.name));
    return {
      period,
      asOf: tb?.asOf ?? pnl?.asOf ?? null,
      tb: tb ? { rows: tb.rows, difference: tb.difference } : null,
      closingStock: stock ? Math.abs(stock.amount) : null,
      depreciation: rows.filter((r) => /depreciat/i.test(r.name)).reduce((a, r) => a + Math.abs(r.amount), 0),
      nettProfit: pnl?.nettProfit ?? null,
    };
  }));
  res.json({ months, lastOkAt: s.lastOkAt, connected: Boolean(((await creds()).host || '').trim()) });
}));

// ---------------------------------------------------------------- books

router.get('/books/status', h(async (_req, res) => {
  const [s, m, c] = await Promise.all([readBooksState(), readMasters(), creds()]);
  res.json({
    connected: Boolean((c.host || '').trim()),
    mastersAt: m?.asOf ?? null,
    ledgers: m?.ledgers.length ?? 0,
    groups: m?.groups.length ?? 0,
    stockItems: m?.stockItems.length ?? 0,
    warnings: m?.warnings ?? [],
    months: s.months,
    lastTryAt: s.lastTryAt,
    lastError: s.lastError,
  });
}));

router.post('/books/pull', h(async (req, res) => {
  const c = await creds();
  if (!(c.host || '').trim()) return res.json({ status: 'not_connected', detail: 'Add the Tally host + port on Data sources (Tally card).' });
  const periods = Array.isArray(req.body?.periods) ? (req.body.periods as unknown[]).filter((p): p is string => typeof p === 'string' && PERIOD.test(p)).slice(0, 6) : undefined;
  const r = await pullBooks(c, { force: true, budgetMs: 150_000, periods });
  res.json({ status: r.error && !r.masters && !r.months.length ? 'down' : 'ok', ...r });
}));

async function health(months: number): Promise<HealthReport & { asOf: Record<string, string>; mastersAt: string | null }> {
  const periods = await latestMonths(months);
  const [{ vouchers, periods: have }, masters, s] = await Promise.all([readVouchers(periods), readMasters(), readBooksState()]);
  const ist = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  return { ...tallyHealth(vouchers, masters, have, ist), asOf: Object.fromEntries(have.map((p) => [p, s.months[p]])), mastersAt: masters?.asOf ?? null };
}

router.get('/books/health', h(async (req, res) => {
  const n = Math.min(12, Math.max(1, Number(req.query.months) || 3));
  res.json(await health(n));
}));

router.get('/books/ledgers', h(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const [m, periods] = await Promise.all([readMasters(), latestMonths(3)]);
  const { vouchers } = await readVouchers(periods);
  const used = new Map<string, number>();
  for (const v of vouchers) for (const l of v.lines) used.set(l.ledger, (used.get(l.ledger) || 0) + 1);
  const rows = (m?.ledgers ?? [])
    .filter((l) => !q || `${l.name} ${l.group} ${l.gstin}`.toLowerCase().includes(q))
    .map((l) => ({ ...l, vouchers: used.get(l.name) || 0 }));
  res.json({ asOf: m?.asOf ?? null, periods, total: m?.ledgers.length ?? 0, rows: rows.slice(0, 500) });
}));

router.get('/books/vouchers', h(async (req, res) => {
  const period = String(req.query.period || '');
  if (!PERIOD.test(period)) return res.status(400).json({ error: 'period=YYYY-MM' });
  const q = String(req.query.q || '').toLowerCase().trim();
  const doc = await readBooks(period);
  const all = doc?.vouchers ?? [];
  const rows = q ? all.filter((v) => `${v.type} ${v.number} ${v.party} ${v.reference} ${v.narration} ${v.lines.map((l) => l.ledger).join(' ')}`.toLowerCase().includes(q)) : all;
  res.json({ period, asOf: doc?.asOf ?? null, total: all.length, rows: rows.slice(0, 400) });
}));

router.post('/books/ask', h(async (req, res) => {
  if (!isClaudeConfigured()) return res.status(503).json({ error: 'Claude is not connected on this server (ANTHROPIC_API_KEY).' });
  const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 4000) : '';
  if (!question) return res.status(400).json({ error: 'question is required' });
  const past = Array.isArray(req.body?.history) ? (req.body.history as { role?: string; content?: string }[]).slice(-8)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content!.slice(0, 6000) })) : [];
  const periods = await latestMonths(6);
  const [{ vouchers }, masters, rep] = await Promise.all([readVouchers(periods), readMasters(), health(3)]);
  const hits = findVouchers(vouchers, [question, ...past.filter((m) => m.role === 'user').map((m) => m.content)].join(' '), 80);
  const system = `You are the Tally expert for Heatronics Medical Devices Private Limited (TallyPrime). You help the accounts team understand and fix their books, in plain, short answers: what is wrong, why it matters, and exactly how to fix it in TallyPrime (menu path, keys, which ledger / voucher type). You only READ Tally — never suggest the MIS writes to it; the team makes the change in Tally themselves.
Ground every answer in the data below: name real ledgers and vouchers (date, type, number). If the data does not show it, say so and say what to pull or check. Amounts in ₹ with Indian grouping.
Standing rules from Hargun: Heatronics does not book RCM currently; Shopify and Claude/Anthropic bills are not booked for now; ask Hargun before deleting or merging anything.

=== STORED BOOKS ===
Months with Day Books: ${periods.join(', ') || 'none yet'}; masters taken ${masters?.asOf?.slice(0, 16) ?? 'never'}.

=== TALLY HEALTH (newest 3 months) ===
${rep.issues.map((i) => `- [${i.severity}] ${i.title}: ${i.count}. e.g. ${i.samples.slice(0, 5).map((s) => [s.date, s.type, s.number, s.party || s.ledger, s.detail].filter(Boolean).join(' ')).join(' / ')}`).join('\n') || 'No issues found (or no books stored yet).'}

=== VOUCHERS MATCHING THE QUESTION (${hits.length}) ===
${hits.map(voucherLine).join('\n') || 'None matched.'}

=== LEDGERS (name | group | GSTIN | registration | state | TDS | tax) ===
${ledgerListText(masters, 1500) || 'Not pulled yet.'}

=== HOW HEATRONICS BOOKS (Hargun's pattern) ===
${BUNDLED_HISTORY}`;
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of [...past, { role: 'user' as const, content: question }]) {
    if (!turns.length && m.role !== 'user') continue; // must start with the user
    if (turns.length && turns[turns.length - 1].role === m.role) turns[turns.length - 1].content += `\n\n${m.content}`;
    else turns.push({ ...m });
  }
  const reply = await claudeChat({ system, messages: turns, feature: 'tally-ask', maxTokens: 4000 });
  res.json({ reply, vouchersUsed: hits.length, periods });
}));

export default router;

// ---------------------------------------------------------------- ledger-name rules (client/src/data/monthClose/ledgerRules.ts)
// The rule table is data (objectStore `tally/ledger-rules`); matching runs in the browser with the same module the close uses.
// GET also hands over what to match: ledger master names, the newest stored P&L ledger rows, and voucher narrations on
// expense ledgers (brand / fundraising words are looked for client-side; nothing is changed in Tally).
const RULE_LINES = new Set(['rev_blinkit', 'rev_flipkart', 'pf_platform', 'nl_fundraising']);
export function cleanRules(input: unknown): { rules: Record<string, unknown>[]; dropped: string[] } {
  const rules: Record<string, unknown>[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(input) ? input.slice(0, 200) : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = String(r.id ?? '').trim().slice(0, 60);
    const pattern = String(r.pattern ?? '').trim().slice(0, 600);
    if (!id || !pattern || !RULE_LINES.has(String(r.line)) || seen.has(id)) { dropped.push(id || '(no id)'); continue; }
    try { new RegExp(pattern, 'i'); if (r.group) new RegExp(String(r.group), 'i'); } catch { dropped.push(`${id} (invalid pattern)`); continue; }
    seen.add(id);
    rules.push({ id, line: r.line, pattern, ...(r.group ? { group: String(r.group).slice(0, 120) } : {}), ...(r.note ? { note: String(r.note).slice(0, 200) } : {}), ...(r.enabled === false ? { enabled: false } : {}) });
  }
  return { rules, dropped };
}

router.get('/ledger-rules', h(async (_req, res) => {
  const [stored, masters, s] = await Promise.all([readJson<{ rules: unknown[] } | null>('tally/ledger-rules', null), readMasters(), readTallyState()]);
  const periods = Object.keys(s.months).sort().slice(-3);
  const pnl = (await Promise.all(periods.map(async (period) => ({ period, snap: await readTallySnapshot(period) }))))
    .filter((x) => x.snap).map((x) => ({ period: x.period, rows: (x.snap!.ledgerRows ?? []).map((r) => ({ name: r.name, amount: r.amount })) }));
  const books = await readVouchers(await latestMonths(3));
  const expense = new Set((masters?.ledgers ?? []).filter((l) => /expense/i.test(`${l.primary} ${l.group}`)).map((l) => l.name));
  const narrations = books.vouchers.filter((v) => !v.cancelled && !v.optional && v.narration.trim())
    .flatMap((v) => v.lines.filter((l) => expense.has(l.ledger) && l.amount > 0)
      .map((l) => ({ date: v.date, type: v.type, number: v.number, ledger: l.ledger, amount: l.amount, narration: v.narration.slice(0, 160) })))
    .slice(0, 3000);
  res.json({
    rules: stored?.rules ?? null,
    ledgers: (masters?.ledgers ?? []).map((l) => ({ name: l.name, group: l.group, primary: l.primary })),
    pnl, narrations, mastersAt: masters?.asOf ?? null,
  });
}));

router.put('/ledger-rules', h(async (req, res) => {
  if (req.body?.reset === true) { await writeJson('tally/ledger-rules', { rules: null, at: new Date().toISOString() }); return res.json({ ok: true, rules: null }); }
  const { rules, dropped } = cleanRules(req.body?.rules);
  if (!rules.length) return res.status(400).json({ error: 'No valid rule in the request.', dropped });
  await writeJson('tally/ledger-rules', { rules, at: new Date().toISOString() });
  res.json({ ok: true, rules, dropped });
}));
