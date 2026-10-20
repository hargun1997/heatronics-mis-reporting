import { claudeCompleteText, type ClaudePart } from './claudeClient.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpenseScenarioAnswers {
  // Three-way classification — drives voucher type and TDS default.
  //   Capital   → Journal voucher       (Dr asset, Dr GST Input, Cr party)
  //   Goods     → Purchase-Expense      (accounting-invoice mode, no TDS)
  //   Services  → Purchase-Services     (accounting-invoice mode, TDS by default)
  category?: 'Capital' | 'Goods' | 'Services';
  vendorOrigin?: 'Indian' | 'Foreign' | 'Unknown';
  gstApplicable?: 'Yes' | 'No' | 'RCM' | 'Unknown';
  tdsApplicable?: 'Yes' | 'No' | 'Unknown';
  party?: string;
  costCentre?: string;
  notes?: string;
  // Legacy field kept so older clients keep working — ignored if `category`
  // is set.
  expenseType?: 'Service' | 'Capital';
  paymentTiming?: 'Advance' | 'Prepaid' | 'OnCredit' | 'PaidNow' | 'Unknown';
  paidFrom?: string;
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

  // Resolve the effective category — prefer the new "category" field; fall
  // back to the legacy "expenseType" so older clients still produce something
  // sensible.
  const category =
    answers.category ||
    (answers.expenseType === 'Capital' ? 'Capital' : 'Services');

  return `You are a senior accountant booking an expense in Tally Prime for Heatronics.

You will be given:
1. The Heatronics Tally master (JSON) — every group, ledger, voucher type and cost centre that exists in the books.
2. A scenario the operator answered.
${inputClause}

## Heatronics company facts (HARD CONSTRAINTS)
- Heatronics is registered for GST in Uttar Pradesh (state code 09). DEFAULT to intra-state CGST + SGST (split the GST amount equally between Input CGST and Input SGST). Switch to Input IGST ONLY when the vendor's GSTIN starts with anything other than "09", or the vendor's billing state on the invoice is clearly outside UP, or the vendor is foreign (origin = Foreign). When in doubt, assume intra-UP CGST+SGST and add a one-line warning asking the operator to confirm vendor state. Pick the exact GST ledger names from the master (group "GST Input" — match case and punctuation).
- TDS: when TDS applies, you MUST add a Cr line for the appropriate TDS Payable ledger from the master. Pick the section by reading the expense description / nature:
    · 194C  → Contractor / freight / job-work / courier / printing / packaging service
    · 194J  → Professional fees / consultancy / technical services / legal / CA / CS / IT services / SaaS-as-service
    · 194-I → Rent (building, plant, equipment)
    · 194H  → Brokerage / commission / channel-fee commissions
    · 194Q  → Large goods purchase (only when explicitly flagged)
    · 194R  → Benefits / perquisites
  Match the closest TDS Payable ledger name in the master.
- Cost centres: pick from the master's Channel-category cost centres only (HO, D2C, ECOM, OEM, OFFLINE, QCOM). If the expense doesn't fit a specific channel, default to HO.
- Voucher number: leave it to Tally's auto-numbering (your output should NOT include a voucher number).

## Routing — pick voucher type strictly from the operator's category
The operator has classified this expense as: **${category}**.

| Category  | Voucher type to use      | Mode in Tally           | TDS default   |
| --------- | ------------------------ | ----------------------- | ------------- |
| Capital   | Journal                  | Journal                 | No (rare)     |
| Goods     | Purchase-Expense         | Accounting Invoice      | No            |
| Services  | Purchase-Services        | Accounting Invoice      | Yes (section by nature) |

Apply the rule for the chosen category — do not switch voucher types based on TDS or GST. The voucher type name MUST match the master exactly.

## Booking approach (IMPORTANT — single-stage)
Every booking is exactly ONE stage that creates a creditor for the vendor. Bank-side settlement is booked separately during reconciliation and is OUT OF SCOPE for this tool.

### Capital (Journal voucher)
- Dr the fixed-asset ledger you pick from the master. Asset ledgers live under groups starting with "Asset -" inside parents like "Plant and Machinery", "Computer and IT Equipment", "Furniture and Furnishings", "Office Equipment", "Office Equipments", "Vehicles and Transport", "Fixed Assets". Pick the closest one by reading the description.
- Dr Input CGST + Input SGST (intra-UP) OR Dr Input IGST (inter-state). Split GST equally between CGST and SGST.
- Cr the party ledger (vendor under "Sundry Creditors" / "Service Creditors" / "Loans & Advances"). If the operator selected a party, use that exact ledger.
- Cr TDS Payable ledger ONLY if TDS = Yes (rare for capital — typically 194Q for ≥ ₹50L purchase from a single vendor in a financial year, or 194-I for plant rented vs purchased).
- Use voucher type "Journal".

### Goods (Purchase-Expense, accounting-invoice mode)
- Dr the expense ledger from the closest expense group (e.g. "Admin & General Expenses", "Factory Overheads", "After-Sales & Warranty", "Compliance & Certification", "Inward Freight", "Manufacturing Costs", "Direct Expenses"). Do NOT use a stock/inventory ledger — this voucher is the accounting-invoice flavour.
- Dr Input CGST + Input SGST (intra-UP) OR Dr Input IGST.
- Cr the party ledger (Sundry Creditors / Service Creditors).
- TDS = No by default; only add a TDS Cr line if the operator explicitly set TDS = Yes.
- Use voucher type "Purchase-Expense".

### Services (Purchase-Services, accounting-invoice mode)
- Dr the expense ledger from the closest service group (e.g. "Professional Fees - CA", "Professional Fees - CS", "Legal Fees", "Operations Platform Subscriptions", "D2C Logistics", "D2C Communication Fees", "Brand & Content Marketing", "Channel Fees & Commissions", "After-Sales & Warranty", "Compliance & Certification").
- Dr Input CGST + Input SGST (intra-UP) OR Dr Input IGST.
- Cr the party ledger (Service Creditors / Sundry Creditors).
- Cr TDS Payable - 194? ledger by default (services almost always attract TDS for Heatronics). The TDS amount is the section's rate × the taxable base; if you cannot infer the rate, leave the amount as null and add a warning telling the operator to fill it. Reduce the party Cr line by the same TDS amount so the voucher balances.
- Use voucher type "Purchase-Services".

The total of Dr lines must equal the total of Cr lines. Use the implied taxable base for the expense Dr line, the operator's GST amount for the GST Dr line(s), and (total − TDS) for the party Cr line.

## Tally master
\`\`\`json
${JSON.stringify(master)}
\`\`\`

## Scenario answers
- Category: ${category}
- Party (vendor): ${answers.party || '(let AI pick from master)'}
- Vendor origin: ${answers.vendorOrigin || 'Indian (default)'}
- GST applicable: ${answers.gstApplicable || 'Yes (default)'}
- TDS applicable: ${answers.tdsApplicable || (category === 'Services' ? 'Yes (default for Services)' : 'No (default)')}
- Cost centre (operator hint): ${answers.costCentre || '(default to HO if no specific channel applies)'}
- Notes: ${answers.notes || '(none)'}

## Grounding rules (STRICT)
- Use ONLY ledger names, voucher type names and cost centre names that appear EXACTLY in the master. Match case and punctuation.
- If a perfect match doesn't exist, pick the closest entry and add a sentence to "warnings" describing the substitution.
- Voucher type is determined SOLELY by category: Capital → "Journal", Goods → "Purchase-Expense", Services → "Purchase-Services". No other voucher types.
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
// Claude call
// ---------------------------------------------------------------------------

async function callClaude(parts: ClaudePart[]): Promise<string> {
  // Booking advice carries the full master in context plus a multi-line JSON
  // output, so give the response plenty of room — a truncated payload shows up
  // downstream as "Unterminated string in JSON". Retry/backoff lives in
  // claudeClient. 'medium' effort: this is reasoning over the master, not OCR.
  return claudeCompleteText({
    system:
      'You are an expert Indian accountant. Return ONLY the requested JSON object — ' +
      'no prose, no markdown fence.',
    parts,
    maxTokens: 16384,
    effort: 'medium',
  });
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
    console.error('Claude JSON parse failed:', message);
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
  const parts: ClaudePart[] = [{ text: prompt }];
  for (const a of attachments) {
    if (a.data && a.mime) {
      // PDFs must go as a document block — an image block with a PDF mime is rejected.
      parts.push(a.mime === 'application/pdf' ? { pdf: { data: a.data } } : { image: { mimeType: a.mime, data: a.data } });
    }
  }
  const raw = await callClaude(parts);
  const advice = parseJsonFromText(raw);
  return validateAgainstMaster(advice, req.tallyMaster);
}
