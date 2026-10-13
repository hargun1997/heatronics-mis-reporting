// ============================================
// CLAUDE CLIENT — the single path to the Anthropic API
// ============================================
//
// Every AI call in this server goes through here: the MIS classifier, the
// Tally screenshot reader (ledgerVision) and the expense booking advisor. It
// replaces the three hand-rolled Gemini fetch loops those services used to
// carry, so retry/backoff, model choice and the "return only JSON" contract
// live in one place.
//
// Contract: callers hand in ordered parts (text and/or images) and get back
// the model's raw text. Parsing and validation stay with the caller, because
// each one already owns a `normalise` step that treats the model as untrusted.

import Anthropic from '@anthropic-ai/sdk';
import { recordApiUsage } from '../ingest/objectStore.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
// Default to the current Opus. Override per-deploy with CLAUDE_MODEL.
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** One piece of a prompt: text, an inline image, or an inline PDF. Order is preserved. */
export interface ClaudePart {
  text?: string;
  image?: { mimeType: string; data: string };
  /** Base64 PDF (no data: prefix) sent as a document block — e.g. an invoice. */
  pdf?: { data: string };
}

export interface ClaudeCompleteOptions {
  /** System prompt — the role and the output contract. */
  system?: string;
  /** Ordered user-turn content. */
  parts: ClaudePart[];
  /** Output ceiling. JSON outputs truncate silently, so keep this generous. */
  maxTokens?: number;
  /** Override the model for this call. */
  model?: string;
  /** Thinking depth / token spend. Classification and OCR do well at 'low'. */
  effort?: ClaudeEffort;
  /** Label for usage/cost tracking (e.g. 'vision', 'classifier'). */
  feature?: string;
}

export function isClaudeConfigured(): boolean {
  return Boolean(API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set on the server. Set it (Cloud Run: via Secret Manager) and restart.',
      );
    }
    client = new Anthropic({ apiKey: API_KEY });
  }
  return client;
}

function toContentBlocks(parts: ClaudePart[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const part of parts) {
    if (part.image) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.image.mimeType as Anthropic.Base64ImageSource['media_type'],
          data: part.image.data,
        },
      });
    }
    if (part.pdf) {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: part.pdf.data },
      });
    }
    if (typeof part.text === 'string' && part.text.length > 0) {
      blocks.push({ type: 'text', text: part.text });
    }
  }
  return blocks;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 1s, 2s, 4s, 8s — the SDK also retries, this covers the rest.
const backoffMs = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 8000);

/**
 * Run one request and return the model's text. Retries transient failures
 * (429 / 5xx / network) with exponential backoff; raises on the rest.
 */
export async function claudeCompleteText(opts: ClaudeCompleteOptions): Promise<string> {
  const anthropic = getClient();
  const MAX_ATTEMPTS = 4;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // `output_config` (effort) is newer than the installed SDK's typings, so
      // it is attached through a typed escape — it still serialises onto the
      // wire request. Drop this line to fall back to the model's default effort.
      const params = {
        model: opts.model || DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 16000,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: toContentBlocks(opts.parts) }],
      } as Anthropic.MessageCreateParamsNonStreaming;
      (params as unknown as Record<string, unknown>).output_config = { effort: opts.effort ?? 'low' };

      const response = await anthropic.messages.create(params);
      void recordApiUsage(params.model, opts.feature ?? 'other', response.usage ?? {});

      if (response.stop_reason === 'refusal') {
        const category =
          (response as { stop_details?: { category?: string } }).stop_details?.category ??
          'unspecified';
        throw new Error(`Claude declined this request (${category}).`);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error(
          'Claude response was cut off at max_tokens — the output is too long. ' +
            'Split the input into smaller pieces or raise maxTokens.',
        );
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      if (!text) throw new Error('Claude returned no text content.');
      return text;
    } catch (err) {
      // Retryable: rate limits, 5xx, connection drops. Everything else raises.
      const retryable =
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        err instanceof Anthropic.APIConnectionError ||
        (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500);

      lastError = err instanceof Error ? err.message : String(err);
      if (retryable && attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err instanceof Error ? err : new Error(lastError);
    }
  }

  throw new Error(`Claude request failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}

/** One turn in a chat conversation. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeChatOptions {
  /** The grounding system prompt (role + the MIS context). Cached across turns. */
  system: string;
  /** The conversation so far, oldest first; must start and end with 'user'. */
  messages: ChatTurn[];
  maxTokens?: number;
  model?: string;
  effort?: ClaudeEffort;
  feature?: string;
}

/**
 * Multi-turn chat. The system prompt (the big, stable MIS context) is marked
 * cacheable so follow-up questions in a session only pay for the new turn, and
 * adaptive thinking is on so the model can reason over the numbers. Retries
 * transient failures like claudeCompleteText.
 */
export async function claudeChat(opts: ClaudeChatOptions): Promise<string> {
  const anthropic = getClient();
  const MAX_ATTEMPTS = 4;
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const params = {
        model: opts.model || DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 8000,
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      } as unknown as Anthropic.MessageCreateParamsNonStreaming;
      const escape = params as unknown as Record<string, unknown>;
      escape.output_config = { effort: opts.effort ?? 'medium' };
      escape.thinking = { type: 'adaptive' };

      const response = await anthropic.messages.create(params);
      void recordApiUsage(params.model, opts.feature ?? 'chat', response.usage ?? {});

      if (response.stop_reason === 'refusal') {
        const category =
          (response as { stop_details?: { category?: string } }).stop_details?.category ?? 'unspecified';
        throw new Error(`Claude declined this request (${category}).`);
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      if (!text) throw new Error('Claude returned no text content.');
      return text;
    } catch (err) {
      const retryable =
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        err instanceof Anthropic.APIConnectionError ||
        (err instanceof Anthropic.APIError && typeof err.status === 'number' && err.status >= 500);
      lastError = err instanceof Error ? err.message : String(err);
      if (retryable && attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err instanceof Error ? err : new Error(lastError);
    }
  }
  throw new Error(`Claude chat failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}

/** Strip a stray ```json fence the model occasionally adds around bare JSON. */
export function stripJsonFence(text: string): string {
  const t = text.trim();
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  }
  return t;
}
