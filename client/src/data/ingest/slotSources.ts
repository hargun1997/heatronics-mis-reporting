// ----------------------------------------------------------------------------
// Slot sources — how each close report slot is fed, and "Pull now".
//
// The server (GET /api/connectors/slots, server/src/connectors/slots/catalog.ts)
// says per slot whether it is pulled by the MIS's own API connector, read from
// the Tranzact daily Google Sheet, filled by a Claude scheduled task, or a
// manual upload (with the reason). A pull returns the SAME output the slot's
// upload parser produces — facts, or sheet rows that go through that parser
// here — so it is staged, checked and committed exactly like a dropped file
// (commitReportMonths), and the close maths can't tell the difference.
// ----------------------------------------------------------------------------

import * as XLSX from 'xlsx';
import { UPLOAD_PARSERS } from '../liveMis/uploadParsers';
import type { DailyFact } from '../liveMis/facts';
import { commitReportMonths } from './ingestClient';
import type { BomCostRow, CheckItem, Extracted, IngestReportMeta, ReportSlot, StagedUpload } from './types';

export type SlotSourceKind = 'api' | 'sheet' | 'claude_task' | 'upload';

export interface SlotSourceInfo {
  connectorId: string;
  slotId: string;
  source: SlotSourceKind;
  /** "Amazon SP-API Finances", "Tranzact daily sheet", "Manual upload" … */
  via: string;
  /** One line: what it is pulled from, or why it can't be. */
  line: string;
  claudeTask: string | null;
  parserId: string | null;
  pullable: boolean;
  connected: boolean;
  connectHint: string | null;
  lastPull: { periodKey: string; at: string; ok: boolean; error?: string } | null;
}

export interface FeedTask {
  name: string;
  kind: 'claude_task' | 'tranzact_recurring';
  when: string;
  what: string;
  feeds: string;
}

export async function listSlotSources(): Promise<{ slots: SlotSourceInfo[]; tasks: FeedTask[] }> {
  const res = await fetch('/api/connectors/slots');
  const body = (await res.json().catch(() => ({}))) as { slots?: SlotSourceInfo[]; tasks?: FeedTask[]; error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return { slots: body.slots ?? [], tasks: body.tasks ?? [] };
}

/** The one line under a slot's badge. A manual slot starts "Manual upload:" so the reason reads on its own. */
export function slotSourceLine(info: SlotSourceInfo): string {
  if (info.source === 'upload') return `${info.via}: ${info.line}`;
  if (info.pullable && !info.connected) return `${info.line} ${info.connectHint ?? 'Not connected.'} Upload works meanwhile.`;
  return info.line;
}

export const slotKey = (connectorId: string, slotId: string) => `${connectorId}|${slotId}`;

/** What a finished pull hands back (server SlotPull). */
interface PullResult {
  facts?: DailyFact[];
  /** BOM pricing slot: finished-good unit costs (same rows the BOM upload reader keeps). */
  bomCosts?: BomCostRow[];
  rows?: unknown[][];
  rowCount: number;
  trace: string[];
  warnings: string[];
  emptyOk?: boolean;
  note?: string;
}

type PullAnswer =
  | { status: 'done'; pulledAt: string; result: PullResult; via: string; parserId: string | null }
  | { status: 'running'; startedAt: string; via: string }
  | { status: 'failed'; error: string; via: string }
  | { status: 'not_connected'; detail: string }
  | { status: 'none' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull one slot for one month. Long pulls (Amazon Finances paging, Amazon Ads
 * reports) keep running on the server; this polls until done (≤ ~6 min).
 * Throws with a plain-words reason on failure / not connected.
 */
export async function pullSlot(
  slot: ReportSlot,
  periodKey: string,
  opts: { force?: boolean; onWait?: (seconds: number) => void } = {},
): Promise<{ result: PullResult; pulledAt: string; via: string; parserId: string | null }> {
  const t0 = Date.now();
  const res = await fetch(`/api/connectors/slots/${slot.connectorId}/${slot.slotId}/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ periodKey, force: Boolean(opts.force) }),
  });
  let ans = (await res.json().catch(() => ({}))) as PullAnswer & { error?: string };
  if (!res.ok) throw new Error(ans.error || `Pull failed (${res.status}).`);
  while (ans.status === 'running' && Date.now() - t0 < 6 * 60_000) {
    opts.onWait?.(Math.round((Date.now() - t0) / 1000));
    await sleep(4000);
    const r = await fetch(`/api/connectors/slots/${slot.connectorId}/${slot.slotId}/pull/${periodKey}`);
    ans = (await r.json().catch(() => ({ status: 'none' }))) as PullAnswer;
  }
  if (ans.status === 'done') return { result: ans.result, pulledAt: ans.pulledAt, via: ans.via, parserId: ans.parserId };
  if (ans.status === 'not_connected') throw new Error(ans.detail);
  if (ans.status === 'failed') throw new Error(ans.error);
  if (ans.status === 'running') throw new Error('Still running on the server — Pull again in a minute.');
  throw new Error('The pull was lost (the server restarted) — Pull again.');
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const isISODate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Turn a finished pull into a StagedUpload — the same object a dropped file becomes. */
export function stagePull(
  slot: ReportSlot,
  periodKey: string,
  pull: { result: PullResult; pulledAt: string; via: string; parserId: string | null },
  kind: SlotSourceKind,
): StagedUpload {
  const { result } = pull;
  const items: CheckItem[] = [];
  let facts: DailyFact[] = result.facts ?? [];
  let trace = [...result.trace];
  let emptyOk = Boolean(result.emptyOk);

  if (result.rows) {
    // Sheet slots: run the slot's own upload parser over the rows.
    const parser = UPLOAD_PARSERS.find((p) => p.sourceId === (pull.parserId ?? slot.parserId));
    if (!parser) throw new Error('No reader for this sheet.');
    if (result.rows.length > 0) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(result.rows), 'Sheet1');
      const out = parser.parse(wb);
      facts = out.facts;
      trace = [...trace, ...(out.trace ?? [])];
      if (out.warning && facts.length > 0) items.push({ id: 'parser', label: 'Reader note', status: 'warn', detail: out.warning });
    } else {
      facts = [];
    }
  }

  if (result.bomCosts) {
    // BOM pricing: unit costs, not facts — staged exactly like runBomChecks' output.
    const bomCosts = result.bomCosts;
    items.push({ id: 'read', label: 'Pulled from the API', status: 'pass', detail: `${pull.via} · ${new Date(pull.pulledAt).toLocaleString('en-IN')}` });
    items.push({ id: 'costs', label: 'Finished-good costs extracted', status: bomCosts.length > 0 ? 'pass' : 'fail', detail: `${bomCosts.length} finished goods costed` });
    for (const w of result.warnings) items.push({ id: `w-${items.length}`, label: 'Source note', status: 'warn', detail: w });
    const extracted: Extracted = { facts: [], rowCount: bomCosts.length, through: null, bomCosts, trace: result.note ? [...trace, result.note] : trace };
    const overall = items.some((i) => i.status === 'fail') ? 'fail' : items.some((i) => i.status === 'warn') ? 'warn' : 'pass';
    const fileName = `api-pull-${slot.connectorId}-${slot.slotId}-${periodKey}.json`;
    const snapshot = JSON.stringify({ via: pull.via, periodKey, pulledAt: pull.pulledAt, trace: result.trace, warnings: result.warnings, bomCosts }, null, 1);
    return {
      checks: { items, overall }, extracted, fileName, mimeType: 'application/json',
      rawFiles: [{ base64: toBase64Utf8(snapshot), name: fileName, mimeType: 'application/json' }],
      periodKey,
    };
  }

  const sourceLabel = kind === 'sheet' ? 'Read from the sheet' : 'Pulled from the API';
  items.push({ id: 'read', label: sourceLabel, status: 'pass', detail: `${pull.via} · ${result.rowCount} source row(s) · ${new Date(pull.pulledAt).toLocaleString('en-IN')}` });
  const inMonth = facts.filter((f) => !isISODate(f.date) || f.date.slice(0, 7) === periodKey);
  if (inMonth.length !== facts.length) items.push({ id: 'month', label: 'Other months left out', status: 'warn', detail: `${facts.length - inMonth.length} fact(s) outside ${periodKey}` });
  facts = inMonth;
  const blocking = result.warnings.filter((w) => /no data in the sheet yet|does not look like|no "document date"/i.test(w));
  if (blocking.length) {
    emptyOk = false;
    items.push({ id: 'sheet', label: 'Sheet not ready', status: 'fail', detail: blocking.join(' ') });
  }
  items.push({
    id: 'rows',
    label: facts.length > 0 ? 'Rows extracted' : 'No activity',
    status: facts.length > 0 || emptyOk ? 'pass' : 'fail',
    detail: facts.length > 0 ? `${facts.length} facts for ${periodKey}` : emptyOk ? `empty month confirmed — ${periodKey} filed as covered` : 'nothing returned',
  });
  for (const w of result.warnings.filter((w) => !blocking.includes(w))) items.push({ id: `w-${items.length}`, label: 'Source note', status: 'warn', detail: w });

  const dates = facts.map((f) => f.date).filter(isISODate).sort();
  const extracted: Extracted = {
    facts,
    rowCount: facts.length,
    through: dates[dates.length - 1] ?? null,
    trace: result.note ? [...trace, result.note] : trace,
    emptyMonths: facts.length === 0 && emptyOk ? [periodKey] : undefined,
  };
  const overall = items.some((i) => i.status === 'fail') ? 'fail' : items.some((i) => i.status === 'warn') ? 'warn' : 'pass';
  const prefix = kind === 'sheet' ? 'sheet-pull' : 'api-pull';
  const fileName = `${prefix}-${slot.connectorId}-${slot.slotId}-${periodKey}.json`;
  const snapshot = JSON.stringify({ via: pull.via, periodKey, pulledAt: pull.pulledAt, trace: result.trace, warnings: result.warnings, facts: result.facts, rows: result.rows }, null, 1);
  return {
    checks: { items, overall },
    extracted,
    fileName,
    mimeType: 'application/json',
    rawFiles: [{ base64: toBase64Utf8(snapshot), name: fileName, mimeType: 'application/json' }],
    // Facts are already limited to the month asked (undated traffic rows are dated to it on commit).
    periodKey,
  };
}

/** True when a committed report came from an automatic pull (not a file). */
export function pulledFrom(meta: IngestReportMeta): 'api' | 'sheet' | null {
  if (meta.fileName.startsWith('api-pull-')) return 'api';
  if (meta.fileName.startsWith('sheet-pull-')) return 'sheet';
  return null;
}

/**
 * Pull + save in one go (the "Pull all automatic" button). Saves only a clean
 * pull (every check passes, no warnings); anything else is left for review.
 */
export async function pullAndCommit(slot: ReportSlot, info: SlotSourceInfo, periodKey: string): Promise<{ ok: boolean; detail: string; metas?: IngestReportMeta[] }> {
  try {
    const pull = await pullSlot(slot, periodKey);
    const staged = stagePull(slot, periodKey, pull, info.source);
    if (staged.checks.overall !== 'pass') {
      const why = staged.checks.items.filter((i) => i.status !== 'pass').map((i) => `${i.label}: ${i.detail ?? ''}`).join('; ');
      return { ok: false, detail: `Pulled, needs review — ${why}` };
    }
    // Same commit path as a dropped file.
    const metas = await commitReportMonths(slot, staged, periodKey);
    return { ok: true, detail: staged.extracted.bomCosts ? `${staged.extracted.bomCosts.length} finished-good costs saved` : `${staged.extracted.facts.length} facts saved`, metas };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'Pull failed.' };
  }
}
