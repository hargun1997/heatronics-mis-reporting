// ============================================================================
// WORK STORE — the single list of recurring work (operations, compliance and
// MIS uploads), who owns each task, and what has been done. Persisted as JSON
// in the config store (GCS in production) so every device sees the same
// state, and so the reminder engine can email owners.
//
// People are the existing team (ownershipStore: config/team.json), so there
// is one people list across the app. Each task can point at the Accounts
// Handbook section that explains how to do it (`howTo` = handbook anchor id).
// Upload tasks (`upload`) are auto-done when the report lands in the store.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { readJson, writeJson, listReports } from '../ingest/objectStore.js';
import { listAssignments } from './ownershipStore.js';
import type { Cadence, ScheduleSpec } from './workSchedule.js';
import { occurrences, todayIST, addDays, parseYmd, ymd, lookbackDays } from './workSchedule.js';

export interface WorkTask extends ScheduleSpec {
  id: string;
  title: string;
  /** Area / group, e.g. "Accounting ops", "GST & TDS", "MCA / ROC". */
  area: string;
  description?: string;
  ownerIds: string[];
  /** Free-text role from the old compliance list (kept until a person is assigned). */
  roleLabel?: string;
  /** Handbook anchor id that explains how to do this task. */
  howTo?: string;
  form?: string;
  authority?: string;
  penalty?: string;
  notes?: string;
  /** Linked MIS upload slot → auto-done when the report for the period lands. */
  upload?: { connectorId: string; slotId: string };
  /** Start reminding this many days before the due date (default 2). */
  remindDaysBefore?: number;
  active: boolean;
  source?: string;
}

export interface DoneEntry {
  at: string;
  by?: string;
  note?: string;
}

export interface ReminderSettings {
  /** Send the daily emails automatically. */
  enabled: boolean;
  /** Hour of day (India time, 0–23) to send; tasks not done by then are emailed. */
  sendHour: number;
  /** Who gets the team summary (default Hargun). */
  summaryTo: string[];
  /** Also list tasks due in the next few days (each task's "remind from"). */
  includeDueSoon: boolean;
}

export const DEFAULT_SETTINGS: ReminderSettings = { enabled: true, sendHour: 14, summaryTo: ['hargun@heatronics.in'], includeDueSoon: true };

export interface WorkDoc {
  version: 1;
  seededAt?: string;
  settings?: ReminderSettings;
  /** India date (YYYY-MM-DD) of the last automatic daily send. */
  lastScheduledDay?: string;
  tasks: WorkTask[];
  /** taskId → period → done entry */
  done: Record<string, Record<string, DoneEntry>>;
  lastReminderRun?: { at: string; sent: number; dryRun: boolean; recipients: number };
}

const EMPTY: WorkDoc = { version: 1, tasks: [], done: {} };
const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time'];

export async function readWork(): Promise<WorkDoc> {
  const doc = await readJson<WorkDoc>('work', EMPTY);
  return { ...EMPTY, ...doc, tasks: doc.tasks ?? [], done: doc.done ?? {} };
}

async function writeWork(doc: WorkDoc): Promise<void> {
  await writeJson('work', doc);
}

const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : undefined;
};

/** Validate and normalise a task coming from the client. */
function clean(input: Partial<WorkTask>, prev?: WorkTask): WorkTask {
  const title = String(input.title ?? prev?.title ?? '').trim();
  if (!title) throw new Error('A task needs a title.');
  const cadence = (CADENCES.includes(input.cadence as Cadence) ? input.cadence : prev?.cadence ?? 'monthly') as Cadence;
  const months = Array.isArray(input.months) ? input.months.map((m) => num(m, 1, 12)).filter((m): m is number => !!m) : prev?.months;
  return {
    id: prev?.id ?? input.id ?? randomUUID(),
    title,
    area: String(input.area ?? prev?.area ?? 'General').trim() || 'General',
    description: input.description ?? prev?.description,
    ownerIds: Array.isArray(input.ownerIds) ? input.ownerIds.map(String) : prev?.ownerIds ?? [],
    roleLabel: input.roleLabel ?? prev?.roleLabel,
    howTo: input.howTo === '' ? undefined : input.howTo ?? prev?.howTo,
    form: input.form ?? prev?.form,
    authority: input.authority ?? prev?.authority,
    penalty: input.penalty ?? prev?.penalty,
    notes: input.notes ?? prev?.notes,
    upload: input.upload === null ? undefined : input.upload ?? prev?.upload,
    remindDaysBefore: num(input.remindDaysBefore, 0, 30) ?? prev?.remindDaysBefore ?? 2,
    active: input.active ?? prev?.active ?? true,
    source: input.source ?? prev?.source ?? 'custom',
    cadence,
    dueDay: num(input.dueDay, 1, 31) ?? prev?.dueDay,
    dueWeekday: num(input.dueWeekday, 1, 7) ?? prev?.dueWeekday,
    months,
    dueMonth: num(input.dueMonth, 1, 12) ?? prev?.dueMonth,
    dueDate: input.dueDate ?? prev?.dueDate,
    arrears: input.arrears ?? prev?.arrears,
  };
}

export async function saveTask(input: Partial<WorkTask>): Promise<WorkTask> {
  const doc = await readWork();
  const i = input.id ? doc.tasks.findIndex((t) => t.id === input.id) : -1;
  const task = clean(input, i >= 0 ? doc.tasks[i] : undefined);
  if (i >= 0) doc.tasks[i] = task;
  else doc.tasks.push(task);
  await writeWork(doc);
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  const doc = await readWork();
  doc.tasks = doc.tasks.filter((t) => t.id !== id);
  delete doc.done[id];
  await writeWork(doc);
}

export async function setDone(id: string, period: string, done: boolean, by?: string, note?: string): Promise<void> {
  const doc = await readWork();
  if (!doc.tasks.some((t) => t.id === id)) throw new Error('Unknown task.');
  if (!/^(\d{4}(-\d{2}(-\d{2})?|-W\d{2})?|once)$/.test(period)) throw new Error('Bad period.');
  const map = (doc.done[id] ??= {});
  if (done) map[period] = { at: new Date().toISOString(), by, note };
  else delete map[period];
  await writeWork(doc);
}

export async function saveSettings(input: Partial<ReminderSettings>): Promise<ReminderSettings> {
  const doc = await readWork();
  const cur = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  const emails = Array.isArray(input.summaryTo)
    ? input.summaryTo.map((e) => String(e).trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    : cur.summaryTo;
  const next: ReminderSettings = {
    enabled: input.enabled ?? cur.enabled,
    sendHour: num(input.sendHour, 0, 23) ?? cur.sendHour,
    summaryTo: emails,
    includeDueSoon: input.includeDueSoon ?? cur.includeDueSoon,
  };
  doc.settings = next;
  await writeWork(doc);
  return next;
}

/**
 * Claim today's automatic send: true if it is past the send hour and nobody has
 * sent today yet (marks the day first, so overlapping triggers don't double-send).
 */
export async function claimScheduledRun(now = new Date()): Promise<{ ok: boolean; reason?: string; day: string }> {
  const doc = await readWork();
  const st = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  const day = todayIST(now);
  const hour = new Date(now.getTime() + 5.5 * 3_600_000).getUTCHours();
  if (!st.enabled) return { ok: false, reason: 'Daily emails are switched off.', day };
  if (hour < st.sendHour) return { ok: false, reason: `Not yet ${st.sendHour}:00 India time.`, day };
  if (doc.lastScheduledDay === day) return { ok: false, reason: 'Already sent today.', day };
  doc.lastScheduledDay = day;
  await writeWork(doc);
  return { ok: true, day };
}

export async function recordReminderRun(run: WorkDoc['lastReminderRun']): Promise<void> {
  const doc = await readWork();
  doc.lastReminderRun = run;
  await writeWork(doc);
}

/**
 * One-time seed: the client sends the old compliance list (and any progress
 * it had in the browser); the server adds the Ownership upload assignments.
 * Ignored once seeded unless `force` is set.
 */
export async function importSeed(
  tasks: Partial<WorkTask>[],
  done: WorkDoc['done'],
  force = false,
): Promise<{ imported: number; skipped: boolean }> {
  const doc = await readWork();
  if (doc.seededAt && !force) return { imported: 0, skipped: true };
  const byId = new Map(doc.tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    const task = clean(t, t.id ? byId.get(t.id) : undefined);
    byId.set(task.id, task);
  }
  // MIS upload assignments from the old Ownership page.
  for (const a of await listAssignments()) {
    const id = `upload-${a.id}`;
    byId.set(
      id,
      clean(
        {
          id,
          title: `Upload: ${a.label}`,
          area: 'MIS uploads',
          ownerIds: a.ownerIds,
          cadence: 'monthly',
          dueDay: a.dueDay,
          arrears: true,
          upload: a.connectorId && a.slotId ? { connectorId: a.connectorId, slotId: a.slotId } : undefined,
          howTo: undefined,
          active: a.active,
          source: 'ownership',
        },
        byId.get(id),
      ),
    );
    for (const [period, at] of Object.entries(a.manualDone ?? {})) ((doc.done[id] ??= {})[period] ??= { at });
  }
  doc.tasks = [...byId.values()];
  for (const [id, m] of Object.entries(done ?? {})) doc.done[id] = { ...m, ...(doc.done[id] ?? {}) };
  doc.seededAt = new Date().toISOString();
  await writeWork(doc);
  return { imported: doc.tasks.length, skipped: false };
}

/** Periods auto-completed by an uploaded report, per upload task. */
export async function autoDone(tasks: WorkTask[]): Promise<Record<string, string[]>> {
  const ups = tasks.filter((t) => t.upload);
  if (!ups.length) return {};
  const reports = await listReports();
  const out: Record<string, string[]> = {};
  for (const t of ups) {
    out[t.id] = reports.filter((r) => r.connectorId === t.upload!.connectorId && r.slotId === t.upload!.slotId).map((r) => r.periodKey);
  }
  return out;
}

export interface OpenItem {
  task: WorkTask;
  period: string;
  due: string;
  /** days past due (negative = days until due) */
  late: number;
}

/** Open (not done) occurrences that are overdue or inside each task's reminder window. */
export async function openItems(now = new Date()): Promise<OpenItem[]> {
  const doc = await readWork();
  const auto = await autoDone(doc.tasks);
  const today = todayIST(now);
  // Nothing before the tracker was set up counts as overdue (its status is unknown).
  const start = doc.seededAt ? todayIST(new Date(doc.seededAt)) : today;
  const out: OpenItem[] = [];
  for (const t of doc.tasks) {
    if (!t.active) continue;
    let from = ymd(addDays(parseYmd(today), -lookbackDays(t.cadence)));
    if (from < start) from = start;
    const to = ymd(addDays(parseYmd(today), t.remindDaysBefore ?? 2));
    for (const o of occurrences(t, from, to)) {
      if (doc.done[t.id]?.[o.period] || auto[t.id]?.includes(o.period)) continue;
      const late = Math.round((parseYmd(today).getTime() - parseYmd(o.due).getTime()) / 86_400_000);
      out.push({ task: t, period: o.period, due: o.due, late });
    }
  }
  return out.sort((a, b) => b.late - a.late);
}
