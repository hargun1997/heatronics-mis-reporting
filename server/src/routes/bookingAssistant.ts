// ----------------------------------------------------------------------------
// Booking assistant — "which ledger / which voucher / how do I cut this entry?"
//
//   GET    /status       Claude configured? + map size + history sources
//   GET    /map          the expense → ledger map (seeded on first read)
//   PUT    /map          replace the map ({ rows, updatedBy? })
//   POST   /history      keep a Tally Day Book / Ledger export as booking history
//   DELETE /history      forget it
//   POST   /chat         one turn: messages (+ attachments) → Claude's answer, the invoice read, the evidence
//                         used and the ledger check (23 Nov 2026: services/bookingEvidence.ts, bookingInvoice.ts)
//
// The chat is a stateless relay like /api/chat: the client sends the
// conversation and the handbook text; the server adds the ledger map, the
// booking history and the rules, and frames them as a cached system prompt.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { claudeChat, isClaudeConfigured, type ChatTurn, type ClaudePart } from '../services/claudeClient.js';
import { expenseMapForPrompt, readExpenseMap, writeExpenseMap } from '../services/expenseMap.js';
import { bookingHistoryContext, clearHistory, readSavedHistory, saveHistory } from '../services/bookingHistory.js';
import { buildEvidence, checkLedgers, evidenceSummary, evidenceText } from '../services/bookingEvidence.js';
import { readInvoice } from '../services/bookingInvoice.js';
import { latestMonths, readMasters, readVouchers } from '../connectors/tally/bookStore.js';
import { ledgerListText } from '../connectors/tally/books.js';

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
4. The TALLY MASTER ledger list (when present) — use ledger and voucher-type names EXACTLY as they appear there. If the name you need is not in the master, write it as "<name> (new)" and add a New ledger needed block.
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

## Each question also carries (in the user turn)
- **INVOICE READ FROM THE ATTACHMENT**: the facts a first pass read from the photo / PDF. Check them against the image. If a figure is wrong or unreadable, say so and use the image.
- **EVIDENCE FROM THE STORED TALLY BOOKS**: the party ledger found in Tally (by GSTIN or name), its last vouchers, its total this FY, the TDS ledgers used for it, and similar vouchers. When the party has past vouchers, mirror their voucher type, ledgers and TDS unless the map or the handbook says otherwise; say "Same as <date> <voucher no.>". When history and the map disagree, follow the map and point it out.

## Invoice photos
- Read every figure from the document. Do the GST check: taxable + taxes (+ round off) = total. If it does not add up, say so first.
- Intra-UP supply (vendor GSTIN starts 09 and place of supply UP) = CGST + SGST; else IGST. A vendor with no GSTIN = no input GST (the tax is part of the cost).
- Invoice date, number and the vendor GSTIN go into the narration and the reference field (Supplier Invoice No., date).

## A case in words (no invoice)
The accountant may describe a situation: an advance, a refund, a write-off, a reversal, a wrong entry to correct, a month-end provision, a stock transfer, a loan, a director payment. Then:
- Give the ENTRIES IN ORDER as **Voucher 1**, **Voucher 2** … (each with its own voucher type, date rule and Dr/Cr table). Include the payment / adjustment entry when the case needs it.
- For a correction: show how to alter or cancel the wrong voucher first (TallyPrime path), then the right entry. Never suggest deleting without "Ask Hargun first".
- Ask at most 2 questions back, and only when the answer changes the entries. Otherwise state your assumption in one line and give the entries.

## Ledgers: existing or new
- Use a ledger from the TALLY MASTER list wherever one fits. Write its name exactly.
- When none fits, add a **New ledger needed** block: Name · Under (the group from the TALLY GROUPS list, the most specific sub-group) · GST applicability / type of supply · TDS nature (if any) · why no existing ledger fits. In the voucher table write the ledger as "<name> (new)".
- A party (vendor / customer) not found in the evidence = **New party ledger**: Name as on the invoice · Under Sundry Creditors (or the right sub-group) · GSTIN · State · Registration type · PAN (GSTIN characters 3 to 12) · Maintain balances bill-by-bill: Yes.

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

/** Handbook texts by the page's hash (newest 4): the page sends the 236 kB handbook once per server copy. */
const HANDBOOKS = new Map<string, string>();

router.post('/chat', h(async (req, res) => {
  if (!isClaudeConfigured()) {
    return res.status(503).json({
      code: 'no_api_key',
      error: 'The assistant is not connected. Tell the admin to add the Claude key. The ledger map still works.',
    });
  }
  const body = (req.body ?? {}) as { messages?: unknown; handbook?: unknown; handbookHash?: unknown; tallyLedgers?: unknown };
  // The page names its handbook by hash and sends the text only when this server copy does not hold it yet (409).
  const hash = typeof body.handbookHash === 'string' && /^[0-9a-f]{8,20}$/.test(body.handbookHash) ? body.handbookHash : null;
  let handbook = typeof body.handbook === 'string' ? body.handbook.slice(0, 400_000) : '';
  if (hash) {
    if (handbook) HANDBOOKS.set(hash, handbook);
    else {
      const got = HANDBOOKS.get(hash);
      if (!got) return res.status(409).json({ needHandbook: true });
      handbook = got;
    }
    while (HANDBOOKS.size > 4) HANDBOOKS.delete(HANDBOOKS.keys().next().value!);
  }
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

  const periods = await latestMonths(12).catch(() => [] as string[]);
  const last = turns[turns.length - 1];
  const docParts = (last.parts ?? []).filter((p) => p.image || p.pdf || /^Attached (invoice|image)/.test(p.text ?? ''));
  const [map, history, masters, books, invoice] = await Promise.all([
    readExpenseMap(), bookingHistoryContext(), readMasters().catch(() => null),
    readVouchers(periods).catch(() => ({ vouchers: [], periods: [] as string[] })),
    readInvoice(docParts),
  ]);

  // The live Tally masters (with groups, GSTIN, TDS) beat the bundled list the page sends.
  const liveLedgers = masters?.ledgers?.length ? ledgerListText(masters, 2500) : '';
  const tallyLedgers = liveLedgers
    ? `Live Tally masters, taken ${masters?.asOf?.slice(0, 16) ?? '?'} (name | group | GSTIN | registration | state | TDS | tax):\n${liveLedgers}`
    : typeof body.tallyLedgers === 'string' ? body.tallyLedgers.slice(0, 60_000) : '';
  const groups = (masters?.groups ?? []).map((g) => `${g.name} | under ${g.parent || 'Primary'}`).join('\n');

  // The question's own evidence goes into the user turn, so the big system prompt stays cached across questions.
  const question = turns.filter((t) => t.role === 'user').slice(-3).map((t) => t.content).join(' ');
  const ev = buildEvidence({ vouchers: books.vouchers, masters, periods: books.periods, question, invoice, today: new Date().toISOString().slice(0, 10) });
  last.parts = [{ text: evidenceText(ev, invoice) }, ...(last.parts ?? [])];

  const system =
    PREAMBLE +
    `\n=== EXPENSE → LEDGER MAP (${map.rows.length} rows; updated ${map.updatedAt?.slice(0, 10) ?? 'never'}) ===\n` +
    expenseMapForPrompt(map.rows) +
    `\n\n=== BOOKING HISTORY ===\n` +
    (history.text || 'No booking history is loaded yet (no ingested Tally reports and no saved Day Book). Say so if the answer would depend on how it was booked before.') +
    `\n\n=== TALLY MASTER — LEDGERS ===\n` +
    (tallyLedgers || 'Not provided.') +
    `\n\n=== TALLY GROUPS (name | under) ===\n` +
    (groups || 'Not pulled yet.') +
    `\n\n=== ACCOUNTS HANDBOOK ===\n` +
    (handbook || 'Not provided.');

  const reply = await claudeChat({ system, messages: turns, feature: 'booking-assistant', maxTokens: 10000 });
  res.json({ reply, dropped, invoice, evidence: evidenceSummary(ev), ledgerCheck: checkLedgers(reply, masters) });
}));

export default router;
