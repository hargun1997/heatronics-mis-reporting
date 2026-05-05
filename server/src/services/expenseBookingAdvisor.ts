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
  party?: string;
  expenseType?: 'Service' | 'Capital';
  costCentre?: string;
  paidFrom?: string;
  notes?: string;
}

export interface ManualExpenseEntry {
  description: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  totalAmount?: number;
  gstAmount?: number;
  currency?: string;
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
  manualEntry?: ManualExpenseEntry;
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
  manualEntry: ManualExpenseEntry | undefined,
  attachmentCount: number
): string {
  let inputClause: string;
  if (manualEntry) {
    const total = manualEntry.totalAmount;
    const gst = manualEntry.gstAmount;
    const base = total != null && gst != null ? +(total - gst).toFixed(2) : null;
    inputClause = `3. The operator entered the expense MANUALLY (no invoice scan). Use these inputs verbatim — do NOT invent vendor names, amounts or invoice numbers. If a value is missing, leave the corresponding line amount as null. The operator did not pre-select a ledger; you must pick the right expense ledger yourself based on the description, party and scenario.

Operator inputs:
- Description: ${manualEntry.description || '(none)'}
- Invoice number: ${manualEntry.invoiceNumber || '(missing)'}
- Invoice date: ${manualEntry.invoiceDate || '(missing — leave date for the operator to set in Tally)'}
- Total amount (incl. GST): ${total != null ? total : '(missing)'}
- GST amount: ${gst != null ? gst : '(missing)'}
- Implied taxable base (total - GST): ${base != null ? base : '(cannot compute)'}
- Currency: ${manualEntry.currency || 'INR'}`;
  } else if (attachmentCount === 1) {
    inputClause = `3. ONE invoice attachment (image or PDF). Extract verbatim: vendor name, vendor GSTIN, invoice number, invoice date, taxable base, GST amount, total, currency. Echo all of these into "invoiceExtract". Use the extracted base / GST / total to fill in the booking line amounts.`;
  } else {
    inputClause = `3. ${attachmentCount} invoice attachments — these are sequential pages of the SAME invoice. Read them as one document and extract: vendor name, vendor GSTIN, invoice number, invoice date, taxable base, GST amount, total, currency. Echo all of these into "invoiceExtract".`;
  }

  return `You are a senior accountant booking an expense in Tally Prime for Heatronics.

You will be given:
1. The Heatronics Tally master (JSON) — every group, ledger, voucher type and cost centre that exists in the books.
2. A scenario the operator answered.
${inputClause}

## Heatronics company facts (HARD CONSTRAINTS)
- Heatronics is registered for GST in Uttar Pradesh (state code 09). DEFAULT to intra-state CGST + SGST (split the GST amount equally between Input CGST and Input SGST). Switch to Input IGST ONLY when the vendor's GSTIN starts with anything other than "09", or the vendor's billing state on the invoice is clearly outside UP, or the vendor is foreign (origin = Foreign). When in doubt, assume intra-UP CGST+SGST and add a one-line warning asking the operator to confirm vendor state. Pick the exact GST ledger names from the master (group "Duties & Taxes" / "GST Input" — match case and punctuation).
- TDS: when the operator says TDS = Yes, you MUST add a Cr line for the appropriate TDS Payable ledger from the master. Choose the section based on the expense:
    · 194C  → Contractor / freight / job-work / courier / printing
    · 194J  → Professional fees / consultancy / technical services / legal / CA / CS
    · 194-I → Rent (building, plant, equipment)
    · 194H  → Brokerage / commission
    · 194-O → E-commerce operator (where applicable)
  Match the closest existing TDS ledger name in the master. If TDS = No, add NO TDS line. If TDS = Unknown, add a warning so the operator picks.
- Voucher types you may use for expense booking: ONLY "Purchase-Services" (default for any operating expense / service / subscription) and "Purchase-Capital" (for capital goods — computers, machinery, furniture, fixed assets). Do NOT use Payment, Journal, Receipt, Contra. Bank-side payment is booked separately during bank reconciliation and is OUT OF SCOPE for this tool.
- Cost centres: pick from the master's Channel-category cost centres only (HO, D2C, ECOM, OEM, OFFLINE, QCOM). If the expense doesn't fit a specific channel, default to HO.
- Voucher number: leave it to Tally's auto-numbering (your output should NOT include a voucher number).

## Booking approach (IMPORTANT — single-stage)
Because we don't settle against the bank in this tool, every booking is exactly ONE stage = ONE Purchase voucher that creates a creditor for the vendor. Lines:
- Dr the expense ledger you select from the master. Pick the closest match by reading the description, party and scenario; the operator does NOT pre-select a ledger.
- Dr Input CGST + Input SGST (intra-UP) OR Dr Input IGST (inter-state). Split GST equally between CGST and SGST.
- Cr the party ledger (Sundry Creditors / Loans & Advances party). If the operator selected a party, use that exact ledger; otherwise pick the closest existing party from the master.
- Cr TDS Payable ledger if TDS applies
The total of Dr lines must equal the total of Cr lines. Use the implied taxable base for the expense Dr line, the operator's GST amount for the GST Dr line(s), and the operator's total for the party Cr line.

## Multi-stage exceptions
Use a second stage ONLY for prepaid expenses spread over months (Service expenses paid for a future period). In that case:
- Stage 1 = Purchase voucher debiting "Prepaid Expenses" instead of the actual expense ledger.
- Stage 2 = monthly Journal (Dr actual expense, Cr Prepaid Expenses) repeated for the prepaid duration.
For everything else, return exactly one stage.

## Tally master
\`\`\`json
${JSON.stringify(master)}
\`\`\`

## Scenario answers
- Party (vendor): ${answers.party || '(let AI pick from master)'}
- Expense type: ${answers.expenseType || 'Service (default)'}
- Vendor origin: ${answers.vendorOrigin || 'Unknown'}
- Payment timing: ${answers.paymentTiming || 'Unknown'}
- GST applicable: ${answers.gstApplicable || 'Unknown'}
- TDS applicable: ${answers.tdsApplicable || 'Unknown'}
- Cost centre (operator hint): ${answers.costCentre || '(default to HO if no specific channel applies)'}
- Notes: ${answers.notes || '(none)'}

## Grounding rules (STRICT)
- Use ONLY ledger names, voucher type names and cost centre names that appear EXACTLY in the master. Match case and punctuation.
- If a perfect match doesn't exist, pick the closest entry and add a sentence to "warnings" describing the substitution.
- Voucher type MUST be "Purchase-Services" (Service expense type) or "Purchase-Capital" (Capital expense type). No other voucher types.
- DO NOT invent any bill series, prefix, or voucher number. Tally Prime auto-numbers.

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

For invoiceExtract:
- In MANUAL mode: echo back the operator's inputs verbatim — selected party for "vendor", operator's invoice number/date/total/gstAmount/currency. Use null for any value the operator left blank.
- In IMAGE mode: extract the fields by reading the invoice image(s) / PDF. Be thorough; populate every field you can read.
The Tally XML export uses these fields directly — do not invent values.
Use null for line amounts you cannot determine. Stages must be in chronological order. There must be at least one stage.`;
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
  const requestBody = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      // Booking advice carries the full master in context plus a multi-line
      // JSON output. 4 KB is too tight; truncated outputs surfaced as
      // "Unterminated string in JSON" errors. 16 KB gives plenty of room
      // and stays well under Gemini 2.5 Flash's 64 KB output cap.
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  });

  // Gemini intermittently returns 503 UNAVAILABLE / 429 RESOURCE_EXHAUSTED
  // when the model is hot. Retry a few times with exponential backoff
  // before giving up, and surface a friendlier message if all retries fail.
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 4;
  let lastErrorText = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
    } catch (e) {
      lastErrorText = e instanceof Error ? e.message : String(e);
      lastStatus = 0;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Gemini network error after ${MAX_ATTEMPTS} attempts: ${lastErrorText}`);
    }

    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          finishReason?: string;
        }[];
      };
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini');
      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        // MAX_TOKENS, SAFETY, RECITATION, OTHER — flag clearly instead of
        // letting the JSON parser stumble on a truncated payload.
        throw new Error(
          `Gemini response was incomplete (finishReason=${candidate.finishReason}). The booking is likely too detailed to fit. Try splitting the invoice into smaller items or remove very long notes.`
        );
      }
      return text;
    }

    lastStatus = response.status;
    lastErrorText = await response.text();

    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(attempt));
      continue;
    }
    break;
  }

  if (lastStatus === 503 || /UNAVAILABLE/i.test(lastErrorText)) {
    throw new Error(
      `Gemini is temporarily overloaded (503 UNAVAILABLE) and didn't recover after ${MAX_ATTEMPTS} retries. Please try again in a minute — usually clears within a few seconds.`
    );
  }
  if (lastStatus === 429 || /RESOURCE_EXHAUSTED/i.test(lastErrorText)) {
    throw new Error(
      `Gemini rate limit hit (429). Please wait a moment and retry, or check the project quota in Google Cloud Console.`
    );
  }
  throw new Error(`Gemini API error: ${lastStatus} - ${lastErrorText}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1.5s, 3s, 6s — caps total wait at ~10.5s before giving up.
function backoffMs(attempt: number): number {
  return Math.min(1500 * 2 ** (attempt - 1), 6000);
}

function parseJsonFromText(text: string): ExpenseAdvice {
  let jsonText = text.trim();
  if (jsonText.includes('```json')) {
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (jsonText.includes('```')) {
    jsonText = jsonText.replace(/```\n?/g, '');
  }
  jsonText = jsonText.trim();
  try {
    return JSON.parse(jsonText) as ExpenseAdvice;
  } catch (e) {
    // Log the raw response and a window around the failure point so we can
    // diagnose without the user having to repro.
    const message = e instanceof Error ? e.message : String(e);
    const posMatch = /position\s+(\d+)/.exec(message);
    const pos = posMatch ? parseInt(posMatch[1], 10) : -1;
    const snippet =
      pos >= 0
        ? jsonText.slice(Math.max(0, pos - 80), Math.min(jsonText.length, pos + 80))
        : jsonText.slice(0, 240);
    console.error('Gemini JSON parse failed:', message);
    console.error('Length:', jsonText.length, 'Snippet around failure:', JSON.stringify(snippet));
    throw new Error(
      `AI returned malformed JSON (${message}). Length ${jsonText.length}. The response was likely truncated or contains an unescaped character.`
    );
  }
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
  if (!req.manualEntry && attachments.length === 0) {
    throw new Error('Either manualEntry or attachments must be provided');
  }
  const prompt = buildPrompt(req.tallyMaster, req.answers, req.manualEntry, attachments.length);
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
