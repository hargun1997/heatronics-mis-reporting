// ----------------------------------------------------------------------------
// Booking assistant — "which ledger / which voucher / how do I cut this entry?"
//
//   GET    /status       Claude configured? + map size + history sources
//   GET    /map          the expense → ledger map (seeded on first read)
//   PUT    /map          replace the map ({ rows, updatedBy? })
//   POST   /history      keep a Tally Day Book / Ledger export as booking history
//   DELETE /history      forget it
//   POST   /chat         one turn: messages (+ attachments) → Claude's answer
//
// The chat is a stateless relay like /api/chat: the client sends the
// conversation and the handbook text; the server adds the ledger map, the
// booking history and the rules, and frames them as a cached system prompt.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { claudeChat, isClaudeConfigured, type ChatTurn, type ClaudePart } from '../services/claudeClient.js';
import { expenseMapForPrompt, readExpenseMap, writeExpenseMap } from '../services/expenseMap.js';
import { bookingHistoryContext, clearHistory, readSavedHistory, saveHistory } from '../services/bookingHistory.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('booking-assistant route error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
    }
  });
};

// ---- status / map / history -------------------------------------------------

router.get('/status', h(async (_req, res) => {
  const [map, history] = await Promise.all([readExpenseMap(), bookingHistoryContext()]);
  res.json({
    configured: isClaudeConfigured(),
    mapRows: map.rows.length,
    needsInfo: map.rows.filter((r) => r.status === 'needs-info').length,
    history: history.sources,
  });
}));

router.get('/map', h(async (_req, res) => {
  res.json(await readExpenseMap());
}));

router.put('/map', h(async (req, res) => {
  const body = (req.body ?? {}) as { rows?: unknown; updatedBy?: unknown };
  if (!Array.isArray(body.rows)) return res.status(400).json({ error: 'rows must be an array.' });
  const doc = await writeExpenseMap(body.rows, typeof body.updatedBy === 'string' ? body.updatedBy : undefined);
  res.json(doc);
}));

router.get('/history', h(async (_req, res) => {
  const saved = await readSavedHistory();
  res.json(saved ? { fileName: saved.fileName, savedAt: saved.savedAt, chars: saved.chars } : null);
}));

router.post('/history', h(async (req, res) => {
  const body = (req.body ?? {}) as { fileName?: unknown; text?: unknown };
  if (typeof body.text !== 'string' || !body.text.trim()) return res.status(400).json({ error: 'text is required.' });
  const saved = await saveHistory(typeof body.fileName === 'string' ? body.fileName : 'Tally export', body.text);
  res.json({ fileName: saved.fileName, savedAt: saved.savedAt, chars: saved.chars });
}));

router.delete('/history', h(async (_req, res) => {
  await clearHistory();
  res.json({ ok: true });
}));

// ---- chat -------------------------------------------------------------------

const PREAMBLE = `You are the Heatronics booking assistant — you help the in-house accountant of Heatronics Medical Devices Pvt. Ltd. (Noida, Uttar Pradesh; GSTIN state code 09; a D2C medical-devices brand) decide how to BOOK an entry in Tally Prime: which ledger, which voucher type, and exactly how to cut the voucher. You know Indian GST (CGST/SGST/IGST input, ITC eligibility) and TDS (194C, 194J, 194H, 194-I, 194Q, 194R, 194O; TCS under GST sec 52) well.

## How to decide (in this order of authority)
1. The EXPENSE → LEDGER MAP below. It is Hargun's (the owner's) decision table. A row marked "Confirmed by Hargun" or "Confirmed (from books)" is binding (the "Evidence" column is a real voucher from the books — mirror its structure) — use that ledger verbatim. A row marked "NEEDS HARGUN" has no decided ledger yet: say so plainly, show the closest existing Tally ledger as a suggestion only, and mark the answer "To confirm with Hargun". A row marked "NOT IN SCOPE" (currently Shopify and Claude/Anthropic) is not booked at Heatronics for now: do not build a voucher — say it is not booked currently and ask the accountant to check with Hargun. Rows with sub-rules (e.g. Amazon invoice type → ledger, Shiprocket invoice series / credit notes) must be applied by matching the document type. When asked where to get an invoice, give the row's download link.
2. The ACCOUNTS HANDBOOK excerpts below — the documented procedure for how these books are run. Follow it over textbook practice.
3. BOOKING HISTORY (when present) — how similar bills were booked before. Prefer consistency with history unless the map or handbook says otherwise; point out if history contradicts the map.
4. The TALLY MASTER ledger list (when present) — use ledger and voucher-type names EXACTLY as they appear there. If the name you need is not in the master, say "(not in Tally master — create or confirm)".
5. Any invoice / report the accountant attached in this chat — read vendor, GSTIN, invoice no., date, taxable value, GST split, total, currency, place of supply.

## Answer format (always)
Start with a one-line **Recommendation** in bold (e.g. "**Book as Purchase-Services: Dr Google Ads (Direct), Cr Google India Pvt Ltd, 194J TDS.**").
Then the voucher as a markdown table:

| Dr/Cr | Ledger | Amount (₹) | Note |
|---|---|---|---|

- First line under the table, state **Voucher type:** <exact name> and **Date:** <invoice date or "invoice date">.
- GST lines: Input CGST + Input SGST for intra-UP vendors (GSTIN starting 09), Input IGST otherwise; use the rate-specific GST Input ledger names from the master. **Heatronics does not book RCM (reverse charge) currently** — never propose RCM lines, RCM ledgers or reverse-charge journals; if a bill looks like it would attract RCM, say "Heatronics does not book RCM currently — flag to Hargun".
- TDS line: Cr the "TDS Payable - <section>" ledger with the section, rate and computed amount on the taxable value (never on GST); reduce the party credit by the same amount. Say "No TDS" explicitly when none applies, with the reason (e.g. foreign vendor without PE — to confirm with CA; threshold not crossed; goods).
- TCS/TDS credited by a marketplace (e.g. Amazon) go to the receivable ledgers, not payable.
- Use real amounts when you have them (from the question or an attachment) and make the voucher balance (total Dr = total Cr). If an amount is unknown, write "—" and say what is needed.
Then:
- **Narration:** a ready-to-paste narration (vendor, invoice no., date, period, nature).
- **Why:** 1–3 short bullets — cite the map row and/or the handbook section as a link, e.g. [Handbook · Shopflo](/handbook#c27-shopflo). Use the handbook "(open: …)" paths or the map's /handbook#… anchors exactly; do not invent anchors.
- **To confirm with CA** / **To confirm with Hargun:** list anything uncertain (GST eligibility, TDS section, ledger not yet decided). Never guess silently — when unsure, say so here instead of presenting a guess as fact.

## Rules
- Be decisive when the map, handbook or history settles it. Be explicit when they don't.
- Keep it short and practical — an accountant will type this into Tally. No generic accounting lectures.
- Bank/payment-side entries are separate; only include them if asked.
- Mapping rules are changed only by Hargun — never tell the accountant to change the map or a plugin rule; tell them to flag it to Hargun.
- All amounts in Indian Rupees with Indian digit grouping (₹1,23,456.00) unless the invoice is foreign currency (then show both and say which rate to use: the RBI/customs reference rate on the invoice date, per the handbook if it says otherwise).
- You are read-only: never claim to have posted, changed or saved anything.
`;

interface IncomingAttachment {
  kind?: unknown;
  name?: unknown;
  mime?: unknown;
  data?: unknown;
  text?: unknown;
}

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_TEXT_ATTACHMENT = 80_000;
const MAX_TOTAL_BINARY = 30 * 1024 * 1024; // base64 chars, across the whole conversation

function toParts(raw: unknown, budget: { binary: number }): { parts: ClaudePart[]; dropped: string[] } {
  const parts: ClaudePart[] = [];
  const dropped: string[] = [];
  if (!Array.isArray(raw)) return { parts, dropped };
  for (const item of raw.slice(0, 8)) {
    const a = (item ?? {}) as IncomingAttachment;
    const name = typeof a.name === 'string' ? a.name.slice(0, 160) : 'attachment';
    if (a.kind === 'text' && typeof a.text === 'string') {
      const text = a.text.slice(0, MAX_TEXT_ATTACHMENT);
      const cut = a.text.length > MAX_TEXT_ATTACHMENT ? `\n[… truncated, ${a.text.length.toLocaleString('en-IN')} chars total]` : '';
      parts.push({ text: `=== Attached file: ${name} (extracted text) ===\n${text}${cut}\n=== end of ${name} ===` });
      continue;
    }
    if (typeof a.data !== 'string' || !a.data) continue;
    if (budget.binary + a.data.length > MAX_TOTAL_BINARY) {
      dropped.push(name);
      continue;
    }
    const mime = typeof a.mime === 'string' ? a.mime : '';
    if (mime === 'application/pdf') {
      budget.binary += a.data.length;
      parts.push({ text: `Attached invoice/report: ${name}` }, { pdf: { data: a.data } });
    } else if (IMAGE_MIMES.has(mime)) {
      budget.binary += a.data.length;
      parts.push({ text: `Attached image: ${name}` }, { image: { mimeType: mime, data: a.data } });
    } else {
      dropped.push(name);
    }
  }
  return { parts, dropped };
}

router.post('/chat', h(async (req, res) => {
  if (!isClaudeConfigured()) {
    return res.status(503).json({
      code: 'no_api_key',
      error: 'Claude is not connected on this server — ANTHROPIC_API_KEY is not set. Ask Hargun to add it (Cloud Run → Secret Manager) and restart. The ledger map still works.',
    });
  }
  const body = (req.body ?? {}) as { messages?: unknown; handbook?: unknown; tallyLedgers?: unknown };
  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];

  // Newest attachments first get the binary budget, so walk backwards.
  const budget = { binary: 0 };
  const dropped: string[] = [];
  const turns: ChatTurn[] = [];
  for (let i = rawMessages.length - 1; i >= 0; i--) {
    const m = (rawMessages[i] ?? {}) as { role?: unknown; content?: unknown; attachments?: unknown };
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    const { parts, dropped: d } = m.role === 'user' ? toParts(m.attachments, budget) : { parts: [], dropped: [] };
    dropped.push(...d);
    if (!content && !parts.length) continue;
    turns.unshift({ role: m.role, content: content || 'Please read the attachment and tell me how to book it.', ...(parts.length ? { parts } : {}) });
  }
  // Claude needs strictly alternating turns starting with the user.
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'messages must be a non-empty list ending with a user turn.' });
  }

  const [map, history] = await Promise.all([readExpenseMap(), bookingHistoryContext()]);
  const handbook = typeof body.handbook === 'string' ? body.handbook.slice(0, 400_000) : '';
  const tallyLedgers = typeof body.tallyLedgers === 'string' ? body.tallyLedgers.slice(0, 60_000) : '';

  const system =
    PREAMBLE +
    `\n=== EXPENSE → LEDGER MAP (${map.rows.length} rows; updated ${map.updatedAt?.slice(0, 10) ?? 'never'}) ===\n` +
    expenseMapForPrompt(map.rows) +
    `\n\n=== BOOKING HISTORY ===\n` +
    (history.text || 'No booking history is loaded yet (no ingested Tally reports and no saved Day Book). Say so if the answer would depend on how it was booked before.') +
    `\n\n=== TALLY MASTER — LEDGERS (name | group) AND VOUCHER TYPES ===\n` +
    (tallyLedgers || 'Not provided.') +
    `\n\n=== ACCOUNTS HANDBOOK ===\n` +
    (handbook || 'Not provided.');

  const reply = await claudeChat({ system, messages: turns, feature: 'booking-assistant', maxTokens: 8000 });
  res.json({ reply, dropped });
}));

export default router;
