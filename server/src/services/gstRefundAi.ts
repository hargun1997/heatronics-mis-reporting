// GST refund: AI second opinion on the bills the rules could not sort (and any the team asks about). Claude reads the bill's
// party, ledgers, narration, stock items and voucher type and answers one class per bill with a short reason. The answer is a
// suggestion only: the page shows it, a person accepts it, and the acceptance is saved as a rule (services/gstRefund.ts).
// The prompt holds no PAN and no bank data: party names, ledger names, narration (≤ 200 chars) and amounts.
import { claudeCompleteText, isClaudeConfigured } from './claudeClient.js';
import type { InwardClass, InwardDoc } from './gstRefund.js';

export interface AiSuggestion { key: string; cls: InwardClass; why: string; confidence: 'high' | 'medium' | 'low' }

const ALLOWED: InwardClass[] = ['input', 'service', 'capital', 'blocked'];

const SYSTEM = `You classify purchase bills of an Indian manufacturer of electric heating pads (medical devices, sold at 5% GST) for a GST
inverted duty refund under Rule 89(5) of the CGST Rules as amended from 1 Nov 2026.
Classes:
- "input": goods used up in making or selling the product (raw material, components, fabric, thread, packing material, labels, consumables, stores, spares).
- "service": input services (advertising, logistics / courier / freight, software, rent, repairs, professional fees, job work, utilities billed as services).
- "capital": capital goods capitalised in the books (machines, tools, moulds, computers, furniture, fixtures).
- "blocked": ITC blocked by section 17(5) (food and beverages, outdoor catering, motor vehicles and their repair / insurance, club or fitness membership, health or life insurance, travel benefits to staff, gifts and free samples, works contract or goods / services for construction of immovable property, personal use).
Answer ONLY a JSON array, one object per bill, in the same order: {"key": string, "cls": "input"|"service"|"capital"|"blocked", "why": string (max 15 words), "confidence": "high"|"medium"|"low"}.`;

export function aiPrompt(docs: InwardDoc[]): string {
  return docs.map((d) => JSON.stringify({
    key: d.key, voucherType: d.vType, party: d.party, ledgers: d.ledgers, narration: d.narration, stockItems: d.items,
    taxable: Math.round(Math.abs(d.taxable)), gstRate: d.rate, rulesSaid: `${d.cls} (${d.why})`,
  })).join('\n');
}

/** Parse the model's answer; anything off-contract is dropped (the model is untrusted). */
export function parseAi(text: string, keys: Set<string>): AiSuggestion[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr: unknown;
  try { arr = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: AiSuggestion[] = [];
  for (const x of arr) {
    const o = x as Record<string, unknown>;
    if (typeof o.key !== 'string' || !keys.has(o.key) || !ALLOWED.includes(o.cls as InwardClass)) continue;
    const conf = o.confidence === 'high' || o.confidence === 'medium' ? o.confidence : 'low';
    out.push({ key: o.key, cls: o.cls as InwardClass, why: typeof o.why === 'string' ? o.why.slice(0, 120) : '', confidence: conf });
  }
  return out;
}

export async function aiClassify(docs: InwardDoc[]): Promise<{ suggestions: AiSuggestion[]; error: string | null }> {
  if (!docs.length) return { suggestions: [], error: null };
  if (!isClaudeConfigured()) return { suggestions: [], error: 'AI is not set up on the server (ANTHROPIC_API_KEY).' };
  const batch = docs.slice(0, 60);
  try {
    const text = await claudeCompleteText({ system: SYSTEM, parts: [{ text: aiPrompt(batch) }], effort: 'low', maxTokens: 8000, feature: 'gst-refund' });
    return { suggestions: parseAi(text, new Set(batch.map((d) => d.key))), error: null };
  } catch (err) {
    return { suggestions: [], error: err instanceof Error ? err.message : 'AI did not answer.' };
  }
}
