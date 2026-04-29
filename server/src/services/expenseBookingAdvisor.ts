const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpenseScenarioAnswers {
  vendorOrigin?: 'Indian' | 'Foreign' | 'Unknown';
  paymentTiming?: 'Advance' | 'Prepaid' | 'OnCredit' | 'PaidNow' | 'Unknown';
  gstApplicable?: 'Yes' | 'No' | 'RCM' | 'Unknown';
  tdsApplicable?: 'Yes' | 'No' | 'Unknown';
  costCentre?: string;
  paidFrom?: string;
  notes?: string;
}

export interface InvoiceAttachment {
  data: string;
  mime: string;
}

interface NormalizedTallyMaster {
  groups?: { name: string; parent: string | null; isRevenue?: boolean }[];
  ledgers?: { name: string; group: string | null; gst?: boolean; tds?: boolean }[];
  voucherTypes?: { name: string; parent: string | null }[];
  costCentres?: { name: string; category: string | null; parent?: string | null }[];
  costCategories?: string[];
  currencies?: string[];
}

export interface ExpenseAdviceRequest {
  tallyMaster: NormalizedTallyMaster;
  answers: ExpenseScenarioAnswers;
  attachments?: InvoiceAttachment[];
}

export interface BookingLine {
  dr_or_cr: 'Dr' | 'Cr';
  ledger: string;
  amount: number | null;
  notes?: string;
}

export interface BookingStage {
  step: number;
  title: string;
  when: string;
  voucherType: string;
  lines: BookingLine[];
  costCentre?: string | null;
  notes?: string | null;
}

export interface ExpenseAdvice {
  summary: string;
  stages: BookingStage[];
  gstTreatment?: string;
  tdsTreatment?: string;
  warnings?: string[];
  invoiceExtract?: {
    vendor?: string;
    gstin?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    amount?: number;
    gstAmount?: number;
    currency?: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildPrompt(
  master: NormalizedTallyMaster,
  answers: ExpenseScenarioAnswers,
  attachmentCount: number
): string {
  const attachmentClause =
    attachmentCount === 0
      ? '3. No invoice attached — work from the scenario alone.'
      : attachmentCount === 1
        ? '3. One invoice attachment (image or PDF). Extract: vendor, GSTIN, invoice number, date, total, GST amount, currency.'
        : `3. ${attachmentCount} attachments — these are sequential pages of the SAME invoice. Read them as one document.`;

  return `You are a senior accountant guiding the Heatronics finance team on how to book an expense in Tally.

You will be given:
1. The Heatronics Tally master (JSON) — the FULL list of groups, ledgers, voucher types and cost centres that exist in the books today.
2. A scenario the operator answered.
${attachmentClause}

YOUR JOB: produce the COMPLETE lifecycle of vouchers needed to book this expense end-to-end. Not just the first entry. If money is paid as an advance and an invoice arrives later, give BOTH the payment voucher AND the journal that knocks it off. If payment will happen later, give BOTH the purchase voucher AND the future payment voucher. Walk the operator through every step until the books are clean.

GROUNDING RULES (strict):
- Use ONLY ledger names, voucher type names, and cost centre names that appear EXACTLY in the master. Match case/punctuation exactly.
- If you can't find an exact match, pick the closest existing entry and ADD a sentence to "warnings" explaining the substitution.
- DO NOT invent a "bill series", "EXP/", "PRE/" or any prefix. The voucher type itself IS the series in this Tally setup.
- Cost centres in this master belong to a category. Pick a cost centre that fits the expense channel (D2C, ECOM, OEM, OFFLINE, QCOM, HO).

## Tally master
\`\`\`json
${JSON.stringify(master)}
\`\`\`

## Scenario answers
- Vendor origin: ${answers.vendorOrigin || 'Unknown'}
- Payment timing: ${answers.paymentTiming || 'Unknown'}
- GST applicable: ${answers.gstApplicable || 'Unknown'}
- TDS applicable: ${answers.tdsApplicable || 'Unknown'}
- Cost centre (operator hint): ${answers.costCentre || '(not specified)'}
- Paid from (operator hint): ${answers.paidFrom || '(not specified)'}
- Notes: ${answers.notes || '(none)'}

## Lifecycle by scenario (use these as the spine for "stages")
- PaidNow: Stage 1 = Payment voucher (Dr Expense, Dr Input GST if any, Cr Bank/Cash). Done. No follow-up.
- Advance: Stage 1 = Payment (Dr Advance to Suppliers, Cr Bank). Stage 2 (on invoice receipt) = Journal (Dr Expense + GST, Cr Advance to Suppliers, Cr TDS if any).
- Prepaid: Stage 1 = Payment (Dr Prepaid Expenses, Cr Bank). Stage 2..N = monthly Journal (Dr Expense, Cr Prepaid Expenses) for the prepaid period.
- OnCredit: Stage 1 = Purchase voucher (Dr Expense + GST, Cr Vendor (Sundry Creditor), Cr TDS if any). Stage 2 (when actually paid) = Payment voucher knocking off the bill (Dr Vendor, Cr Bank).
- Foreign + service: add an RCM stage where the company self-charges output GST and claims it as input in the next return.

## Response format — JSON ONLY, no prose, no markdown fences

{
  "summary": "one-line description of what to book",
  "stages": [
    {
      "step": 1,
      "title": "short label, e.g. 'Pay vendor advance'",
      "when": "trigger event in plain English, e.g. 'Today, on payment' or 'Each month for 12 months'",
      "voucherType": "EXACT name from master.voucherTypes",
      "costCentre": "EXACT name from master.costCentres or null if not relevant",
      "lines": [
        { "dr_or_cr": "Dr"|"Cr", "ledger": "EXACT name from master.ledgers", "amount": number | null, "notes": "optional" }
      ],
      "notes": "extra guidance for this specific stage, or null"
    }
  ],
  "gstTreatment": "one short line on GST handling",
  "tdsTreatment": "one short line on TDS, or 'Not applicable'",
  "warnings": [ "things the operator must double-check (missing GSTIN, forex rate, ledger substitutions, etc.)" ],
  "invoiceExtract": {
    "vendor": "...", "gstin": "...", "invoiceNumber": "...", "invoiceDate": "YYYY-MM-DD",
    "amount": number, "gstAmount": number, "currency": "INR|USD|..."
  }
}

If no attachment was provided, set "invoiceExtract" to null.
Use null for amounts you cannot determine from the inputs. Stages must be in chronological order. There must be at least one stage.`;
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

async function callGemini(parts: GeminiPart[]): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set on the server');
  }
  const url = `${GEMINI_API_BASE}/${DEFAULT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 4096 },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

function parseJsonFromText(text: string): ExpenseAdvice {
  let jsonText = text.trim();
  if (jsonText.includes('```json')) {
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.replace(/```\n?/g, '');
  }
  return JSON.parse(jsonText.trim()) as ExpenseAdvice;
}

// ---------------------------------------------------------------------------
// Validation against master — flag any AI references that don't exist
// ---------------------------------------------------------------------------

function validateAgainstMaster(advice: ExpenseAdvice, master: NormalizedTallyMaster): ExpenseAdvice {
  const ledgerNames = new Set((master.ledgers || []).map((l) => l.name));
  const voucherNames = new Set((master.voucherTypes || []).map((v) => v.name));
  const costCentreNames = new Set((master.costCentres || []).map((c) => c.name));
  const warnings: string[] = [...(advice.warnings || [])];

  const NOT_IN_MASTER = ' (NOT IN MASTER)';

  for (const stage of advice.stages || []) {
    if (stage.voucherType && !voucherNames.has(stage.voucherType)) {
      warnings.push(`Stage ${stage.step}: voucher type "${stage.voucherType}" is not in the loaded master`);
      stage.voucherType = stage.voucherType + NOT_IN_MASTER;
    }
    if (stage.costCentre && !costCentreNames.has(stage.costCentre)) {
      warnings.push(`Stage ${stage.step}: cost centre "${stage.costCentre}" is not in the loaded master`);
      stage.costCentre = stage.costCentre + NOT_IN_MASTER;
    }
    for (const line of stage.lines || []) {
      if (line.ledger && !ledgerNames.has(line.ledger)) {
        warnings.push(`Stage ${stage.step}: ledger "${line.ledger}" is not in the loaded master`);
        line.ledger = line.ledger + NOT_IN_MASTER;
      }
    }
  }

  return { ...advice, warnings };
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export async function getExpenseBookingAdvice(
  req: ExpenseAdviceRequest
): Promise<ExpenseAdvice> {
  const attachments = req.attachments || [];
  const prompt = buildPrompt(req.tallyMaster, req.answers, attachments.length);
  const parts: GeminiPart[] = [{ text: prompt }];
  for (const a of attachments) {
    if (a.data && a.mime) {
      parts.push({ inline_data: { mime_type: a.mime, data: a.data } });
    }
  }
  const raw = await callGemini(parts);
  const advice = parseJsonFromText(raw);
  return validateAgainstMaster(advice, req.tallyMaster);
}
