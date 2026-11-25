// Booking assistant client — the expense→ledger map, saved booking history and
// the chat relay at /api/booking-assistant.

import { loadXlsx, xlsx } from '../../utils/xlsxLazy';
import { readFileAsText } from '../tally/reduceTallyExport';
import type { TallyMaster } from '../tally/useTallyMaster';

export type MapRowStatus = 'confirmed' | 'needs-info' | 'out-of-scope';

export interface MapSubRule {
  when: string;
  then: string;
}

export interface ExpenseMapRow {
  id: string;
  vendor: string;
  keywords: string[];
  ledger: string;
  voucherType: string;
  gst: string;
  tds: string;
  notes: string;
  anchor: string;
  status: MapRowStatus;
  suggestion?: string;
  /** Cr ledger — platform collection ledger or vendor party ledger. */
  party?: string;
  /** A real example voucher from the books. */
  evidence?: string;
  /** Official invoice download link + what to download there. */
  link?: string;
  linkNote?: string;
  /** Structured sub-rules, e.g. Amazon invoice type → ledger. */
  subRules?: MapSubRule[];
}

export interface ExpenseMapDoc {
  rows: ExpenseMapRow[];
  updatedAt: string | null;
  updatedBy?: string;
}

export interface HistorySource {
  kind: 'bundled' | 'ingest' | 'upload';
  label: string;
  detail: string;
}

export interface AssistantStatus {
  configured: boolean;
  mapRows: number;
  needsInfo: number;
  history: HistorySource[];
}

/** A file attached to a chat turn. Binary files carry base64; spreadsheets carry extracted text. */
export interface ChatAttachment {
  id: string;
  name: string;
  kind: 'image' | 'pdf' | 'text';
  mime: string;
  data?: string;
  text?: string;
  /** Size label for the chip, e.g. "212 KB" or "1,204 rows". */
  meta: string;
  /** Looks like a Tally Day Book / Ledger export — offer "Save as booking history". */
  isTallyExport?: boolean;
}

/** What the server read from an attached invoice (server/src/services/bookingInvoice.ts). */
export interface InvoiceRead {
  docType?: string;
  vendor?: string;
  vendorGstin?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  nature?: string;
  taxable?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  tcs?: number | null;
  roundOff?: number | null;
  total?: number | null;
  reverseCharge?: boolean | null;
  notes?: string;
}

/** The stored Tally books the answer used (server/src/services/bookingEvidence.ts evidenceSummary). */
export interface EvidenceRead {
  party: { name: string; how: 'gstin' | 'name'; gstin: string } | null;
  partyVouchers: { date: string; type: string; number: string; line: string }[];
  similar: number;
  fy: { from: string; total: number; count: number } | null;
  periods: string[];
}

export interface LedgerCheck {
  missing: string[];
  checked: number;
}

export interface AnswerMeta {
  invoice?: InvoiceRead | null;
  evidence?: EvidenceRead | null;
  ledgerCheck?: LedgerCheck | null;
}

export interface BookingMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
  /** Assistant side: the invoice read, the books used and the ledger check. */
  meta?: AnswerMeta;
  /** Assistant-side error shown in place of an answer. */
  error?: { message: string; code?: string };
}

export const TO_CONFIRM = 'To confirm';

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

export async function getStatus(): Promise<AssistantStatus> {
  return json<AssistantStatus>(await fetch('/api/booking-assistant/status'));
}

export async function getMap(): Promise<ExpenseMapDoc> {
  return json<ExpenseMapDoc>(await fetch('/api/booking-assistant/map'));
}

export async function saveMap(rows: ExpenseMapRow[]): Promise<ExpenseMapDoc> {
  return json<ExpenseMapDoc>(
    await fetch('/api/booking-assistant/map', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    }),
  );
}

export async function saveHistory(fileName: string, text: string): Promise<{ fileName: string; savedAt: string; chars: number }> {
  return json(
    await fetch('/api/booking-assistant/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, text }),
    }),
  );
}

export async function clearHistory(): Promise<void> {
  await json(await fetch('/api/booking-assistant/history', { method: 'DELETE' }));
}

export class AssistantError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

export async function sendBookingChat(
  messages: BookingMessage[],
  handbook: string,
  tallyLedgers: string,
): Promise<{ reply: string; dropped: string[]; meta: AnswerMeta }> {
  const kept = messages.filter((m) => !m.error);
  // Only the newest user turn with a file keeps its photo / PDF bytes (a follow-up question still sees that invoice);
  // older files go as their names and text only. Before, every earlier photo went up again with each question.
  let newestWithFile = -1;
  kept.forEach((m, i) => { if (m.role === 'user' && m.attachments?.some((a) => a.data)) newestWithFile = i; });
  const payload = kept.map((m, i) => ({
    role: m.role,
    content: m.content,
    attachments: m.attachments?.map((a) => ({ kind: a.kind, name: a.name, mime: a.mime, data: i === newestWithFile ? a.data : undefined, text: a.text })),
  }));
  // The handbook (about 236 kB) goes up once per server copy: the request names it by hash; the server answers
  // needHandbook when it does not hold that copy yet, and the page sends it once.
  const handbookHash = textHash(handbook);
  const post = (withHandbook: boolean) => fetch('/api/booking-assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: payload, handbookHash, ...(withHandbook ? { handbook } : {}), tallyLedgers }),
  });
  let res: Response;
  try {
    res = await post(false);
    if (res.status === 409) {
      const j = (await res.clone().json().catch(() => ({}))) as { needHandbook?: boolean };
      if (j.needHandbook) res = await post(true);
    }
  } catch {
    throw new AssistantError('Could not reach the server. Check your connection and try again.', 'network');
  }
  const body = (await res.json().catch(() => ({}))) as {
    reply?: string; dropped?: string[]; error?: string; code?: string;
    invoice?: InvoiceRead | null; evidence?: EvidenceRead | null; ledgerCheck?: LedgerCheck | null;
  };
  if (!res.ok) throw new AssistantError(body.error || `The assistant failed (${res.status}).`, body.code);
  return {
    reply: body.reply || '',
    dropped: body.dropped ?? [],
    meta: { invoice: body.invoice ?? null, evidence: body.evidence ?? null, ledgerCheck: body.ledgerCheck ?? null },
  };
}

// ---- attachments ------------------------------------------------------------

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const TALLY_HINT = /day\s*book|ledger\s*vouchers?|voucher\s*type|vch\s*(no|type)|particulars/i;

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    r.readAsDataURL(file);
  });
}

/** Longest side of a photo sent to Claude. Enough to read a full A4 invoice; a 12 MP phone photo shrinks from about 4 MB to about 400 KB. */
const PHOTO_MAX_SIDE = 2000;
const PHOTO_QUALITY = 0.85;

/**
 * Phone photos are large (often > 5 MB, Claude's image limit) and may be rotated by EXIF. Draw the photo on a canvas,
 * upright and at most PHOTO_MAX_SIDE px, and send a JPEG. A small image that is already a PNG / JPEG is sent as it is.
 */
async function shrinkImage(file: File): Promise<{ data: string; mime: string; bytes: number }> {
  const small = file.size < 1.5 * 1024 * 1024 && /^image\/(png|jpeg)$/.test(file.type);
  if (!small && typeof createImageBitmap === 'function') {
    let bmp: ImageBitmap;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
        throw new Error(`${file.name}: this browser cannot open HEIC photos. Use the Photo button, or set the camera to "Most compatible" (JPEG).`);
      }
      bmp = null as unknown as ImageBitmap;
    }
    if (bmp) {
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'white'; // a transparent PNG would turn black as a JPEG
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close?.();
        const url = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
        const data = url.split(',')[1] ?? '';
        return { data, mime: 'image/jpeg', bytes: Math.round((data.length * 3) / 4) };
      }
    }
  }
  const url = await readDataUrl(file);
  return { data: url.split(',')[1] ?? '', mime: file.type || 'image/jpeg', bytes: file.size };
}

/**
 * Turn a picked file into a chat attachment. Invoices (PDF / image) go as
 * base64 for Claude to read; spreadsheets and CSV/XML are converted to text
 * here, so the server never needs a spreadsheet parser.
 */
export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
    const url = await readDataUrl(file);
    return { id, name: file.name, kind: 'pdf', mime: 'application/pdf', data: url.split(',')[1] ?? '', meta: kb(file.size) };
  }
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|hei[cf])$/.test(lower)) {
    const img = await shrinkImage(file);
    const name = img.mime === 'image/jpeg' && !/\.jpe?g$/.test(lower) ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
    return { id, name, kind: 'image', mime: img.mime, data: img.data, meta: kb(img.bytes) };
  }
  if (/\.(xlsx|xls|xlsm)$/.test(lower)) {
    const wb = (await loadXlsx()).read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    let rows = 0;
    const text = wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      const csv = xlsx().utils.sheet_to_csv(sheet, { blankrows: false, dateNF: 'yyyy-mm-dd' });
      rows += csv.split('\n').length;
      return `--- sheet: ${name} ---\n${csv}`;
    }).join('\n\n');
    return { id, name: file.name, kind: 'text', mime: 'text/csv', text, meta: `${rows.toLocaleString('en-IN')} rows`, isTallyExport: TALLY_HINT.test(text.slice(0, 5000)) };
  }
  if (/\.(csv|txt|tsv|xml|json)$/.test(lower) || file.type.startsWith('text/')) {
    const text = await readFileAsText(file);
    const rows = text.split('\n').length;
    return { id, name: file.name, kind: 'text', mime: file.type || 'text/plain', text, meta: `${rows.toLocaleString('en-IN')} lines`, isTallyExport: TALLY_HINT.test(text.slice(0, 5000)) || /<TALLYMESSAGE|<VOUCHER/i.test(text.slice(0, 20000)) };
  }
  throw new Error(`${file.name}: unsupported file. Attach a PDF, an image, or a Tally export (xlsx / csv / xml).`);
}

/** The Tally master as a compact "name | group" list for the prompt. */
export function tallyLedgersForPrompt(master: TallyMaster | null): string {
  if (!master) return '';
  const ledgers = (master.ledgers ?? []).map((l) => `${l.name} | ${l.group ?? ''}`).join('\n');
  const vts = (master.voucherTypes ?? []).map((v) => v.name).join(', ');
  return `Company: ${master.company ?? 'Heatronics'} · master generated ${master.generatedAt?.slice(0, 10) ?? 'unknown'}\n\nLEDGERS (name | group):\n${ledgers}\n\nVOUCHER TYPES: ${vts}`;
}

/** FNV-1a 32-bit hash of a text, as 8 hex digits (names the handbook copy; not a security check). */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0') + text.length.toString(16);
}
