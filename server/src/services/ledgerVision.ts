// ============================================
// LEDGER VISION — read a Tally screen into ledger rows
// ============================================
//
// Screenshots are the primary way Tally reaches this system, so this service
// exists to turn one into structured rows. It follows the same shape as
// geminiClassifier: same API base, same key, same model default.
//
// Everything it returns is UNVERIFIED by contract. OCR on financial figures is
// lossy in the one way that matters — a misread digit still foots — so the
// caller is expected to make a human confirm each figure before it can affect a
// close. The dashboard enforces that; this service just marks the data.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

export interface VisionLedgerRow {
  name: string;
  /** Indent level as it appears on screen. 0 = top-level group. */
  depth: number;
  /** Rupees. Credits negative. */
  amount: number;
  /** 0–1, the model's own confidence that it read the figure correctly. */
  confidence: number;
}

export interface VisionResult {
  rows: VisionLedgerRow[];
  /** Nett Profit / Loss if the screen shows one. Negative for a loss. */
  nettProfit: number | null;
  /** Period string as printed, e.g. "1-Jul-2026 to 31-Jul-2026". */
  period: string | null;
  /** Anything the model could not read, or thought was ambiguous. */
  warnings: string[];
}

const PROMPT = `You are reading a screenshot of a Tally Prime accounting screen for an Indian
manufacturing company (Heatronics Medical Devices Pvt Ltd).

Extract EVERY ledger and group row visible, preserving the on-screen hierarchy.

Rules:
- "depth" is the indent level: 0 for a top-level group (Sales Accounts, Purchase
  Accounts, Direct Expenses, Indirect Expenses, Indirect Incomes), 1 for its
  children, and so on.
- "amount" is in rupees as a plain number. Tally shows credits with "Cr" and
  debits with "Dr". Return credits as NEGATIVE and debits as POSITIVE.
- Strip thousands separators. Keep paise.
- Include subtotal and total rows exactly as shown; do not compute your own.
- If the screen shows "Nett Profit" or "Nett Loss", return it in nettProfit.
  A LOSS must be negative.
- "confidence" is YOUR certainty you read that row's digits correctly: 1.0 when
  the figure is crisp and unambiguous, lower when it is blurred, clipped,
  overlapped or you had to infer a digit.
- Never guess a figure you cannot actually see. Omit the row and say so in
  warnings instead. A missing row is recoverable; a wrong digit is not.

Return ONLY JSON matching this shape, with no prose and no markdown fence:
{
  "rows": [{"name": string, "depth": number, "amount": number, "confidence": number}],
  "nettProfit": number | null,
  "period": string | null,
  "warnings": [string]
}`;

export class LedgerVisionService {
  private apiKey = GEMINI_API_KEY;
  private model = DEFAULT_MODEL;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * @param imageBase64 raw base64, no data: prefix
   * @param mimeType    e.g. "image/png"
   */
  async extract(imageBase64: string, mimeType: string): Promise<VisionResult> {
    if (!this.apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set on the server, so screenshots cannot be read. ' +
          'Upload the Tally xlsx export instead, or set the key and restart.',
      );
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            topP: 0.8,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini vision error: ${response.status} - ${errorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no content for this image.');

    return normalise(parseJson(text));
  }
}

function parseJson(text: string): unknown {
  // The model is asked for bare JSON, but a fence occasionally survives.
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned something that is not JSON: ${cleaned.slice(0, 200)}`);
  }
}

/** Defensive: the model is not a contract, so validate every field. */
function normalise(raw: unknown): VisionResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const warnings: string[] = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string')
    : [];

  const rows: VisionLedgerRow[] = [];
  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];

  for (const r of rawRows) {
    const row = (r ?? {}) as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const amount = typeof row.amount === 'number' && Number.isFinite(row.amount) ? row.amount : null;

    if (!name || amount === null) {
      warnings.push(`Dropped an unreadable row: ${JSON.stringify(row).slice(0, 120)}`);
      continue;
    }

    const depth = typeof row.depth === 'number' && row.depth >= 0 ? Math.floor(row.depth) : 0;
    const confidence =
      typeof row.confidence === 'number' ? Math.max(0, Math.min(1, row.confidence)) : 0.5;

    rows.push({ name, depth, amount, confidence });
  }

  const nettProfit =
    typeof obj.nettProfit === 'number' && Number.isFinite(obj.nettProfit) ? obj.nettProfit : null;
  const period = typeof obj.period === 'string' && obj.period.trim() ? obj.period.trim() : null;

  if (rows.length === 0) warnings.push('No ledger rows could be read from this image.');

  return { rows, nettProfit, period, warnings };
}

export const ledgerVision = new LedgerVisionService();
