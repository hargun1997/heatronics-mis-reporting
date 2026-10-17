// ----------------------------------------------------------------------------
// MIS chat — ask Claude about the business with the whole MIS as context.
//
// The client assembles a compact context pack (the monthly P&L, channel mix,
// SKU margins, freshness, ingested reports) and sends it with the conversation;
// the server frames it as a grounded system prompt (cached across the session)
// and relays the turn to Claude. Nothing here persists — it's a stateless relay.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from 'express';
import { claudeChat, isClaudeConfigured, type ChatTurn } from '../services/claudeClient.js';

const router = Router();

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: AsyncHandler) => (req: Request, res: Response) => {
  Promise.resolve(fn(req, res)).catch((err: unknown) => {
    console.error('chat route error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error.' });
    }
  });
};

const SYSTEM_PREAMBLE = `You are the Heatronics MIS analyst — an assistant for the founders and finance team of Heatronics Medical Devices (a D2C medical-devices brand in India: orthopedic heat-therapy products).

You answer questions about the business using ONLY the MIS context provided below. Rules:
- All amounts are Indian Rupees (₹). Figures are in the same units the context uses (₹, lakhs/crores where stated).
- Be precise and cite the month and the exact figure. When you compute something, show the arithmetic briefly.
- The MIS is a contribution-margin P&L: Net Revenue → COGM → Gross Margin → Channel & Fulfillment → CM1 → Sales & Marketing → CM2 → Platform/Brand → CM3 → OpEx → EBITDA → Net Income. Use these terms correctly.
- Data is committed through the latest month in the context (around July 2026). If asked about a month or figure not in the context, say it isn't in the MIS yet rather than guessing.
- Keep answers tight. Use small markdown tables for multi-month or multi-channel comparisons.
- You are read-only analysis — never claim to change data or take actions.

=== MIS CONTEXT ===
`;

const HANDBOOK_PREAMBLE = `You are the Heatronics Accounts Handbook assistant — a clarification helper for the accountant and the CA of Heatronics Medical Devices (a D2C medical-devices brand in India: orthopedic heat-therapy products).

You answer questions about HOW THE BOOKS ARE OPERATED using ONLY the handbook knowledge provided below. Rules:
- Explain the handbook's actual procedure — which system creates an entry, the journal it posts, the control ledger it lands in, and how it is reconciled — not generic textbook accounting.
- Always cite the handbook section the answer comes from, e.g. "see §c14 D1" or "§S4 bill-wise matching", so the reader can open it.
- All amounts are Indian Rupees (₹).
- Keep answers tight and practical, as step-by-step as the handbook. Use small markdown lists/tables where it helps.
- Mapping rules and plugin settings are changed only by Hargun — never instruct the accountant to change a rule or plugin setting themselves; tell them to flag it to Hargun.
- If something is not covered in the handbook, say so plainly and suggest asking Hargun rather than inventing a step.
- You are read-only guidance — never claim to change data or take actions.

=== HANDBOOK KNOWLEDGE ===
`;

router.get('/status', h(async (_req, res) => {
  res.json({ configured: isClaudeConfigured() });
}));

router.post('/', h(async (req, res) => {
  if (!isClaudeConfigured()) {
    return res.status(400).json({ error: 'The Claude API key is not set on the server. Set ANTHROPIC_API_KEY and restart.' });
  }
  const body = (req.body ?? {}) as { context?: unknown; messages?: unknown; mode?: unknown };
  const context = typeof body.context === 'string' ? body.context : '';
  const preamble = body.mode === 'handbook' ? HANDBOOK_PREAMBLE : SYSTEM_PREAMBLE;
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatTurn[] = rawMessages
    .map((m) => m as { role?: unknown; content?: unknown })
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'messages must be a non-empty list ending with a user turn.' });
  }
  if (!context) {
    return res.status(400).json({ error: 'No context was provided.' });
  }

  const reply = await claudeChat({ system: preamble + context, messages });
  res.json({ reply });
}));

export default router;
