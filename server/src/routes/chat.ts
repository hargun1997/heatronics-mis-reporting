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

router.get('/status', h(async (_req, res) => {
  res.json({ configured: isClaudeConfigured() });
}));

router.post('/', h(async (req, res) => {
  if (!isClaudeConfigured()) {
    return res.status(400).json({ error: 'The Claude API key is not set on the server. Set ANTHROPIC_API_KEY and restart.' });
  }
  const body = (req.body ?? {}) as { context?: unknown; messages?: unknown };
  const context = typeof body.context === 'string' ? body.context : '';
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatTurn[] = rawMessages
    .map((m) => m as { role?: unknown; content?: unknown })
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'messages must be a non-empty list ending with a user turn.' });
  }
  if (!context) {
    return res.status(400).json({ error: 'No MIS context was provided.' });
  }

  const reply = await claudeChat({ system: SYSTEM_PREAMBLE + context, messages });
  res.json({ reply });
}));

export default router;
