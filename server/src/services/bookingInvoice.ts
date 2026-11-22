// Book an invoice, step 1: read the attached invoice (photo or PDF) into facts, so the server can find the party and its
// past vouchers BEFORE the booking answer is written (23 Nov 2026). Untrusted model output: `normaliseInvoice` keeps only
// known fields with the right types.
import { claudeCompleteText, stripJsonFence, type ClaudePart } from './claudeClient.js';
import type { InvoiceFacts } from './bookingEvidence.js';

const SYSTEM = `You read Indian purchase documents (tax invoices, bills of supply, credit / debit notes, receipts, foreign invoices) for the accountant of Heatronics Medical Devices Pvt Ltd (GSTIN state 09, Uttar Pradesh). The document may be a phone photo: tilted, folded or partly cut off.
Return ONLY one JSON object, no prose, with these keys (leave a key out when the document does not show it; never guess a number):
docType, vendor, vendorGstin, vendorState, buyerGstin, invoiceNo, invoiceDate (YYYY-MM-DD), period (service period if shown), placeOfSupply, currency (INR unless shown),
nature (one line: what was bought), lines (array of {description, hsn, qty, rate, amount, gstRate}), taxable, cgst, sgst, igst, cess, tcs, roundOff, total, reverseCharge (true/false if stated),
notes (anything you could not read or that looks wrong: blurred digits, a cut-off total, totals that do not add up).
Numbers as plain numbers (no ₹, no commas). Check: taxable + taxes (+ round off) = total; if not, say so in notes.`;

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x.replace(/[₹,\s]/g, ''))) ? Number(x.replace(/[₹,\s]/g, '')) : null);
const str = (x: unknown, max = 200) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined);

export function normaliseInvoice(raw: unknown): InvoiceFacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines.slice(0, 40).map((l) => {
    const x = (l ?? {}) as Record<string, unknown>;
    return { description: str(x.description, 160) ?? '', hsn: str(x.hsn, 20), qty: num(x.qty), rate: num(x.rate), amount: num(x.amount), gstRate: num(x.gstRate) };
  }).filter((l) => l.description || l.amount != null) : undefined;
  const gstin = str(r.vendorGstin, 20)?.toUpperCase().replace(/\s/g, '');
  const date = str(r.invoiceDate, 10);
  const f: InvoiceFacts = {
    docType: str(r.docType, 40), vendor: str(r.vendor), vendorGstin: gstin, vendorState: str(r.vendorState, 60), buyerGstin: str(r.buyerGstin, 20)?.toUpperCase(),
    invoiceNo: str(r.invoiceNo, 60), invoiceDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined, period: str(r.period, 60),
    placeOfSupply: str(r.placeOfSupply, 60), currency: str(r.currency, 8), nature: str(r.nature, 200), lines,
    taxable: num(r.taxable), cgst: num(r.cgst), sgst: num(r.sgst), igst: num(r.igst), cess: num(r.cess), tcs: num(r.tcs), roundOff: num(r.roundOff), total: num(r.total),
    reverseCharge: typeof r.reverseCharge === 'boolean' ? r.reverseCharge : null, notes: str(r.notes, 500),
  };
  const any = Object.values(f).some((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  return any ? f : null;
}

/** Read the documents in `parts` (images / PDFs with their labels). Null when nothing could be read or Claude failed. */
export async function readInvoice(parts: ClaudePart[]): Promise<InvoiceFacts | null> {
  if (!parts.some((p) => p.image || p.pdf)) return null;
  try {
    const text = await claudeCompleteText({
      system: SYSTEM,
      parts: [...parts, { text: 'Read this document. Return the JSON object only.' }],
      maxTokens: 4000,
      effort: 'low',
      feature: 'booking-read',
    });
    return normaliseInvoice(JSON.parse(stripJsonFence(text)));
  } catch (e) {
    console.warn('booking invoice read failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
