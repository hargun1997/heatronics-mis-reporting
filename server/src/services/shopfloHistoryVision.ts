// ============================================
// SHOPFLO HISTORY VISION — read a billing-history screenshot into per-month rows
// ============================================
//
// Instead of one invoice PDF per month, the operator can screenshot Shopflo's
// "Billing History" table (every monthly invoice at once). This service hands
// the screenshot(s) to Claude and gets back one row per invoice: the invoice
// number, the billing DUE DATE, the amount (incl. GST) and the status. The
// client maps each due date to its service month (arrears) and books the amount
// as a D2C platform cost.
//
// UNVERIFIED by contract: the model reads figures, the caller (and a human)
// decide what counts. Service rules (arrears, incl-GST) live in code, not here.

import { claudeCompleteText, isClaudeConfigured } from './claudeClient.js';

export interface ShopfloHistoryRow {
  /** Invoice number as printed, e.g. "INV-2627-06902". */
  invoiceNumber: string | null;
  /** The "Billing due date", ISO yyyy-mm-dd. */
  dueDate: string | null;
  /** The "Amount" column, rupees (incl. GST). Plain number, paise kept. */
  amount: number | null;
  /** The status as printed, e.g. "Overdue" / "Paid". */
  status: string | null;
}

export interface ShopfloHistoryResult {
  rows: ShopfloHistoryRow[];
  warnings: string[];
}

const PROMPT = `You are reading a screenshot of a "Billing History" table from a
checkout / payment vendor (Shopflo) billed to an Indian company. Each row is one
monthly invoice. Read EVERY row you can see, top to bottom.

For each row report exactly what is printed (do NOT compute anything):
- "invoiceNumber": the Invoice id, e.g. "INV-2627-06902".
- "dueDate": the "Billing due date" as ISO yyyy-mm-dd (e.g. "Oct 12, 2026" ->
  "2026-10-12").
- "amount": the "Amount" column as a plain number in rupees, keeping paise and
  stripping the "₹" and thousands separators (e.g. "₹10,726.52" -> 10726.52).
  This amount already includes GST.
- "status": the Status as printed ("Overdue", "Paid", etc.), or null.
Set any field you cannot read to null and note it in "warnings".

Return ONLY JSON matching this shape, no prose and no markdown fence:
{
  "rows": [
    { "invoiceNumber": string | null, "dueDate": string | null, "amount": number | null, "status": string | null }
  ],
  "warnings": [string]
}`;

export class ShopfloHistoryVisionService {
  isConfigured(): boolean {
    return isClaudeConfigured();
  }

  /** @param images raw base64 (no data: prefix) + mime type, one per screenshot */
  async extract(images: { data: string; mimeType: string }[]): Promise<ShopfloHistoryResult> {
    if (!isClaudeConfigured()) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set on the server, so the Shopflo billing screenshot cannot be read. ' +
          'Set the key (Cloud Run: via Secret Manager) and restart.',
      );
    }
    if (images.length === 0) throw new Error('No images provided.');

    const text = await claudeCompleteText({
      system: PROMPT,
      parts: images.map((im) => ({ image: { mimeType: im.mimeType, data: im.data } })),
      maxTokens: 4096,
      effort: 'low',
      feature: 'shopflo-history-vision',
    });

    return normalise(parseJson(text));
  }
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Shopflo history reader returned something that is not JSON: ${cleaned.slice(0, 200)}`);
  }
}

/** Defensive: the model is not a contract, so validate every field. */
function normalise(raw: unknown): ShopfloHistoryResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const warnings: string[] = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const money = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const iso = (v: unknown): string | null => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };

  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  const rows: ShopfloHistoryRow[] = rawRows.map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      invoiceNumber: str(row.invoiceNumber),
      dueDate: iso(row.dueDate),
      amount: money(row.amount),
      status: str(row.status),
    };
  });

  if (rows.length === 0) warnings.push('No invoice rows could be read from the billing-history screenshot.');
  return { rows, warnings };
}

export const shopfloHistoryVision = new ShopfloHistoryVisionService();
