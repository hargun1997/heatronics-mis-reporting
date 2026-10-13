// ============================================
// INVOICE VISION — read a platform/checkout invoice PDF into figures
// ============================================
//
// Some D2C costs arrive only as a PDF tax invoice (Shopflo checkout, and future
// platform billers). This service hands the PDF to Claude and gets back the
// invoice's money lines — taxable amount, tax, any tax withheld, and the grand
// total — plus the billing period it covers.
//
// Everything it returns is UNVERIFIED by contract: the model reads the figures,
// the caller decides which ones count as a cost (service rules live in code, not
// in the model) and surfaces them for a human to confirm before they hit a
// close.

import { claudeCompleteText, isClaudeConfigured } from './claudeClient.js';

export interface InvoiceResult {
  /** Who billed us, e.g. "Shopflo Technologies Private Limited". */
  provider: string | null;
  /** Invoice number as printed. */
  invoiceNumber: string | null;
  /** Billing period the charges cover, ISO (not the invoice date). */
  periodStart: string | null;
  periodEnd: string | null;
  /** Net of all charges before tax (the taxable value). Rupees. */
  taxableAmount: number | null;
  /** GST / IGST on the taxable value. Rupees. */
  taxAmount: number | null;
  /** Tax withheld at source (TDS/TCS) — recoverable, shown negative on the bill. Rupees, positive. */
  amountWithheld: number | null;
  /** Grand total / balance due as printed. Rupees. */
  total: number | null;
  warnings: string[];
}

const PROMPT = `You are reading a tax-invoice PDF billed to an Indian company
(Heatronics Medical Devices Pvt Ltd) by a checkout / payment / platform vendor
such as Shopflo.

Read the invoice's money summary and the billing period. Do NOT compute figures
yourself — report exactly what is printed.

Fields:
- "provider": the vendor who issued the invoice (the "From" / letterhead name).
- "invoiceNumber": the invoice number (e.g. "INV-2627-06902").
- "periodStart" / "periodEnd": the BILLING CYCLE the charges cover (often in a
  "Billing cycle: 01-Sep-2026 - 30-Sep-2026" note), as ISO yyyy-mm-dd. This is
  the service period, NOT the invoice date or due date. Null if not shown.
- "taxableAmount": the total taxable value (sum of line items before tax), e.g.
  a "Total Taxable Amount" line. Rupees, plain number, keep paise.
- "taxAmount": the GST / IGST / CGST+SGST charged on that taxable value.
- "amountWithheld": any tax withheld at source (TDS / TCS, often a "Amount
  Withheld" line shown as a deduction). Report it as a POSITIVE number. Null/0 if
  none.
- "total": the grand total / balance due as printed.
- Strip thousands separators. Never guess a figure you cannot see — set it null
  and say so in "warnings".

Return ONLY JSON matching this shape, no prose and no markdown fence:
{
  "provider": string | null,
  "invoiceNumber": string | null,
  "periodStart": string | null,
  "periodEnd": string | null,
  "taxableAmount": number | null,
  "taxAmount": number | null,
  "amountWithheld": number | null,
  "total": number | null,
  "warnings": [string]
}`;

export class InvoiceVisionService {
  isConfigured(): boolean {
    return isClaudeConfigured();
  }

  /** @param pdfBase64 raw base64, no data: prefix */
  async extract(pdfBase64: string): Promise<InvoiceResult> {
    if (!isClaudeConfigured()) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set on the server, so invoice PDFs cannot be read. ' +
          'Set the key (Cloud Run: via Secret Manager) and restart.',
      );
    }
    if (!pdfBase64) throw new Error('No PDF provided.');

    const text = await claudeCompleteText({
      system: PROMPT,
      parts: [{ pdf: { data: pdfBase64 } }],
      maxTokens: 2048,
      effort: 'low',
      feature: 'invoice-vision',
    });

    return normalise(parseJson(text));
  }
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Invoice reader returned something that is not JSON: ${cleaned.slice(0, 200)}`);
  }
}

/** Defensive: the model is not a contract, so validate every field. */
function normalise(raw: unknown): InvoiceResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const warnings: string[] = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === 'string')
    : [];

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const money = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const iso = (v: unknown): string | null => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };

  const withheldRaw = money(obj.amountWithheld);
  const result: InvoiceResult = {
    provider: str(obj.provider),
    invoiceNumber: str(obj.invoiceNumber),
    periodStart: iso(obj.periodStart),
    periodEnd: iso(obj.periodEnd),
    taxableAmount: money(obj.taxableAmount),
    taxAmount: money(obj.taxAmount),
    // Always positive — the bill shows it as a deduction.
    amountWithheld: withheldRaw === null ? null : Math.abs(withheldRaw),
    total: money(obj.total),
    warnings,
  };

  if (result.taxableAmount === null) warnings.push('No taxable amount could be read from the invoice.');
  if (result.periodEnd === null) warnings.push('No billing-cycle period found — set the period manually.');

  return result;
}

export const invoiceVision = new InvoiceVisionService();
