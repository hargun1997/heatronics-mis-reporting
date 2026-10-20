// ----------------------------------------------------------------------------
// Booking history for the Booking assistant — "how has this been booked before".
//
// Two sources, both optional:
//  1. Ingested Tally reports (MIS → Upload data). The Tally P&L / Trial Balance
//     slots are read by the vision model into ledger rows (name + amount), so
//     they tell us WHICH ledgers carry balances each month — ledger-level
//     history, not voucher-level.
//  2. A Tally Day Book / Ledger Vouchers export the accountant attached in the
//     chat and chose to keep ("Save as booking history"). Stored as text under
//     config/booking-history.json — this is the voucher-level history
//     (party → ledger, voucher type, GST/TDS ledgers used).
// ----------------------------------------------------------------------------

import { readAllExtracted, readJson, writeJson } from '../ingest/objectStore.js';
import { BUNDLED_HISTORY } from './expenseMap.js';

export interface SavedHistory {
  fileName: string;
  text: string;
  savedAt: string;
  chars: number;
}

export interface HistorySource {
  kind: 'bundled' | 'ingest' | 'upload';
  label: string;
  detail: string;
}

const DOC = 'booking-history';
/** ~40k tokens of Day Book text is plenty to see the patterns. */
export const MAX_HISTORY_CHARS = 160_000;

export async function readSavedHistory(): Promise<SavedHistory | null> {
  const doc = await readJson<SavedHistory | null>(DOC, null);
  return doc && typeof doc.text === 'string' && doc.text ? doc : null;
}

export async function saveHistory(fileName: string, text: string): Promise<SavedHistory> {
  const clipped = text.slice(0, MAX_HISTORY_CHARS);
  const doc: SavedHistory = {
    fileName: fileName.slice(0, 200) || 'Tally export',
    text: clipped,
    savedAt: new Date().toISOString(),
    chars: clipped.length,
  };
  await writeJson(DOC, doc);
  return doc;
}

export async function clearHistory(): Promise<void> {
  await writeJson(DOC, null);
}

interface LedgerRow { name?: unknown; amount?: unknown }

/** Latest Tally P&L / TB ledger rows from the ingest store (up to 3 periods). */
async function ingestedLedgerHistory(): Promise<{ text: string; sources: HistorySource[] }> {
  let reports;
  try {
    reports = await readAllExtracted();
  } catch {
    return { text: '', sources: [] };
  }
  const tally = reports
    .filter((r) => r.connectorId === 'tally' && Array.isArray(r.payload.ledgerRows) && r.payload.ledgerRows.length > 0)
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey) || a.slotId.localeCompare(b.slotId));
  const periods = [...new Set(tally.map((r) => r.periodKey))].slice(0, 3);
  const blocks: string[] = [];
  const sources: HistorySource[] = [];
  for (const period of periods) {
    // One slot per period is enough; prefer the P&L (expenses live there).
    const r = tally.find((x) => x.periodKey === period && x.slotId === 'pnl') ?? tally.find((x) => x.periodKey === period)!;
    const rows = (r.payload.ledgerRows as LedgerRow[])
      .map((x) => ({ name: typeof x.name === 'string' ? x.name.trim() : '', amount: Number(x.amount) || 0 }))
      .filter((x) => x.name)
      .slice(0, 300);
    if (!rows.length) continue;
    const label = r.slotId === 'pnl' ? 'Tally P&L' : 'Tally Trial Balance';
    blocks.push(
      `### ${label} — ${period}\n` + rows.map((x) => `- ${x.name}: ₹${Math.round(x.amount).toLocaleString('en-IN')}`).join('\n'),
    );
    sources.push({ kind: 'ingest', label: `${label} ${period}`, detail: `${rows.length} ledgers (from MIS uploads)` });
  }
  return { text: blocks.join('\n\n'), sources };
}

/** Everything the assistant knows about past bookings, for the system prompt. */
export async function bookingHistoryContext(): Promise<{ text: string; sources: HistorySource[] }> {
  const [ingest, saved] = await Promise.all([ingestedLedgerHistory(), readSavedHistory().catch(() => null)]);
  // The pattern + example vouchers from the books always come first.
  const parts: string[] = [BUNDLED_HISTORY];
  const sources: HistorySource[] = [
    { kind: 'bundled', label: 'Books pattern Apr–Oct 26', detail: 'Example vouchers from Hargun’s Tally data' },
    ...ingest.sources,
  ];
  if (saved) {
    parts.push(
      `## Saved Tally export (voucher-level history) — ${saved.fileName}, saved ${saved.savedAt.slice(0, 10)}\n` +
        'Use this to see how similar bills were booked before: party ledger, expense ledger, voucher type, GST and TDS ledgers.\n\n' +
        saved.text,
    );
    sources.push({ kind: 'upload', label: saved.fileName, detail: `Saved ${saved.savedAt.slice(0, 10)} · ${saved.chars.toLocaleString('en-IN')} chars` });
  }
  if (ingest.text) {
    parts.push(
      '## Ledger balances from ingested Tally reports (ledger-level only — shows which ledgers are actually in use and their monthly totals; it does NOT show individual vouchers)\n\n' +
        ingest.text,
    );
  }
  return { text: parts.join('\n\n'), sources };
}
