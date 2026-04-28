const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

export interface ExpenseScenarioAnswers {
  vendorOrigin?: 'Indian' | 'Foreign' | 'Unknown';
  paymentTiming?: 'Advance' | 'Prepaid' | 'OnCredit' | 'PaidNow' | 'Unknown';
  gstApplicable?: 'Yes' | 'No' | 'RCM' | 'Unknown';
  tdsApplicable?: 'Yes' | 'No' | 'Unknown';
  costCentre?: string;
  paidFrom?: string;
  notes?: string;
}

export interface ExpenseAdviceRequest {
  tallyMaster: unknown;
  answers: ExpenseScenarioAnswers;
  imageBase64?: string;
  imageMime?: string;
}

export interface BookingLine {
  dr_or_cr: 'Dr' | 'Cr';
  ledger: string;
  amount: number | null;
  notes?: string;
}

export interface ExpenseAdvice {
  summary: string;
  voucherType: string;
  billSeries?: string;
  lines: BookingLine[];
  costCentre?: string;
  gstTreatment?: string;
  tdsTreatment?: string;
  followUp?: {
    when: string;
    voucherType: string;
    lines: BookingLine[];
    notes?: string;
  } | null;
  warnings?: string[];
  invoiceExtract?: {
    vendor?: string;
    gstin?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    amount?: number;
    gstAmount?: number;
    currency?: string;
  };
}

function buildPrompt(master: unknown, answers: ExpenseScenarioAnswers): string {
  return `You are a senior accountant guiding the Heatronics finance team on how to book an expense in Tally.

You will be given:
1. The Heatronics Tally master (JSON) — voucher types, ledger groups, ledgers, cost centres, bill series and policies.
2. A scenario the operator has answered.
3. Optionally an invoice photo — extract vendor, GSTIN, invoice number, date, total, GST amount, currency.

Your job: produce ONE crisp, actionable booking instruction grounded ONLY in ledgers / voucher types / cost centres present in the master. If the right ledger does not exist in the master, say so in "warnings" and pick the closest match.

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

## Decision rules
- Foreign vendor → no Input CGST/SGST/IGST. If imported service, apply RCM via the master's RCM ledgers.
- Advance → Payment voucher; debit "Advance to Vendors". Follow-up Journal on invoice: Dr Expense / Cr Advance to Vendors.
- Prepaid → Payment/Journal to "Prepaid Expenses" asset. Follow-up monthly amortisation journal with PRE/ series.
- On credit → Purchase voucher; vendor as Sundry Creditor. Follow-up Payment voucher knocks off the bill.
- Paid now (cash/bank, no advance) → Payment voucher; debit expense, credit bank/cash directly.
- TDS applicable → split credit: vendor net + TDS Payable ledger from the master.

## Response format
Respond ONLY with a JSON object — no prose, no markdown fences. Schema:
{
  "summary": "one-line description of what to book",
  "voucherType": "exact voucherType.name from master",
  "billSeries": "billSeries.name from master if relevant, else null",
  "lines": [
    { "dr_or_cr": "Dr" | "Cr", "ledger": "exact ledger name from master", "amount": number | null, "notes": "optional" }
  ],
  "costCentre": "exact cost centre from master",
  "gstTreatment": "short description of GST handling",
  "tdsTreatment": "short description of TDS handling, or 'Not applicable'",
  "followUp": {
    "when": "trigger event, e.g. 'On receipt of invoice' or 'End of every month for X months'",
    "voucherType": "exact voucherType.name from master",
    "lines": [ { "dr_or_cr": "Dr|Cr", "ledger": "...", "amount": number|null } ],
    "notes": "optional"
  } OR null if nothing is hanging,
  "warnings": [ "anything the operator should double-check, e.g. missing GSTIN, foreign currency conversion, etc." ],
  "invoiceExtract": {
    "vendor": "...", "gstin": "...", "invoiceNumber": "...", "invoiceDate": "YYYY-MM-DD",
    "amount": number, "gstAmount": number, "currency": "INR|USD|..."
  }
}

If no image is provided, omit "invoiceExtract" or set it to null.
Use null for amounts you cannot determine. Never invent ledgers or cost centres that aren't in the master.`;
}

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

export async function getExpenseBookingAdvice(
  req: ExpenseAdviceRequest
): Promise<ExpenseAdvice> {
  const prompt = buildPrompt(req.tallyMaster, req.answers);
  const parts: GeminiPart[] = [{ text: prompt }];
  if (req.imageBase64 && req.imageMime) {
    parts.push({ inline_data: { mime_type: req.imageMime, data: req.imageBase64 } });
  }
  const raw = await callGemini(parts);
  return parseJsonFromText(raw);
}
