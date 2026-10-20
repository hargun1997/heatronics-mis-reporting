// Booking assistant client — the expense→ledger map, saved booking history and
// the chat relay at /api/booking-assistant.

import * as XLSX from 'xlsx';
import { readFileAsText } from '../tally/reduceTallyExport';
import type { TallyMaster } from '../tally/useTallyMaster';

export type MapRowStatus = 'confirmed' | 'needs-info';

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

export interface BookingMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
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
): Promise<{ reply: string; dropped: string[] }> {
  const payload = messages
    .filter((m) => !m.error)
    .map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments?.map((a) => ({ kind: a.kind, name: a.name, mime: a.mime, data: a.data, text: a.text })),
    }));
  let res: Response;
  try {
    res = await fetch('/api/booking-assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload, handbook, tallyLedgers }),
    });
  } catch {
    throw new AssistantError('Could not reach the server. Check your connection and try again.', 'network');
  }
  const body = (await res.json().catch(() => ({}))) as { reply?: string; dropped?: string[]; error?: string; code?: string };
  if (!res.ok) throw new AssistantError(body.error || `The assistant failed (${res.status}).`, body.code);
  return { reply: body.reply || '', dropped: body.dropped ?? [] };
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
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(lower)) {
    const url = await readDataUrl(file);
    const mime = file.type || (lower.endsWith('.png') ? 'image/png' : 'image/jpeg');
    return { id, name: file.name, kind: 'image', mime, data: url.split(',')[1] ?? '', meta: kb(file.size) };
  }
  if (/\.(xlsx|xls|xlsm)$/.test(lower)) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    let rows = 0;
    const text = wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, dateNF: 'yyyy-mm-dd' });
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
