// ============================================================================
// OWNERSHIP STORE — who owns which monthly upload, and when it's due.
//
// Team members (name + email) and assignments (a report that someone must
// upload each month, by a due day, with one or more owners). Persisted as JSON
// in the config store. An assignment can be LINKED to an ingest slot
// (connectorId + slotId); when it is, "done for a month" is derived from the
// actual committed store — so a reminder stops the moment the file lands,
// without anyone ticking a box. A manual "mark done" override is also kept.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from '../ingest/objectStore.js';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export interface Assignment {
  id: string;
  /** What has to be uploaded, e.g. "Amazon settlement report". */
  label: string;
  /** Owners responsible (one or more). */
  ownerIds: string[];
  /** Optional link to an ingest slot — enables auto-complete from the store. */
  connectorId?: string;
  slotId?: string;
  /** Day of the month the PRIOR month's report is due (1–28). */
  dueDay: number;
  active: boolean;
  /** Manual completion overrides, keyed by service period (YYYY-MM) → ISO date. */
  manualDone: Record<string, string>;
}

interface TeamDoc { members: TeamMember[] }
interface AssignmentsDoc { assignments: Assignment[] }

const clampDay = (d: unknown): number => {
  const n = Math.round(Number(d));
  return Number.isFinite(n) ? Math.min(28, Math.max(1, n)) : 7;
};
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// ---- Team members ----------------------------------------------------------

export async function listMembers(): Promise<TeamMember[]> {
  const doc = await readJson<TeamDoc>('team', { members: [] });
  return Array.isArray(doc.members) ? doc.members : [];
}

export async function saveMember(input: Partial<TeamMember>): Promise<TeamMember> {
  const members = await listMembers();
  const name = str(input.name);
  const email = str(input.email).toLowerCase();
  if (!name) throw new Error('Name is required.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid email is required.');
  if (input.id) {
    const i = members.findIndex((m) => m.id === input.id);
    if (i < 0) throw new Error('Member not found.');
    members[i] = { ...members[i], name, email };
    await writeJson('team', { members });
    return members[i];
  }
  const member: TeamMember = { id: randomUUID(), name, email };
  members.push(member);
  await writeJson('team', { members });
  return member;
}

export async function deleteMember(id: string): Promise<void> {
  const members = (await listMembers()).filter((m) => m.id !== id);
  await writeJson('team', { members });
  // Drop the member from any assignment owners.
  const assignments = (await listAssignments()).map((a) => ({ ...a, ownerIds: a.ownerIds.filter((o) => o !== id) }));
  await writeJson('assignments', { assignments });
}

// ---- Assignments -----------------------------------------------------------

export async function listAssignments(): Promise<Assignment[]> {
  const doc = await readJson<AssignmentsDoc>('assignments', { assignments: [] });
  return (Array.isArray(doc.assignments) ? doc.assignments : []).map((a) => ({
    ...a,
    ownerIds: Array.isArray(a.ownerIds) ? a.ownerIds : [],
    manualDone: a.manualDone && typeof a.manualDone === 'object' ? a.manualDone : {},
  }));
}

export async function saveAssignment(input: Partial<Assignment>): Promise<Assignment> {
  const assignments = await listAssignments();
  const label = str(input.label);
  if (!label) throw new Error('A label is required.');
  const base: Omit<Assignment, 'id' | 'manualDone'> = {
    label,
    ownerIds: Array.isArray(input.ownerIds) ? input.ownerIds.filter((x) => typeof x === 'string') : [],
    connectorId: str(input.connectorId) || undefined,
    slotId: str(input.slotId) || undefined,
    dueDay: clampDay(input.dueDay),
    active: input.active !== false,
  };
  if (input.id) {
    const i = assignments.findIndex((a) => a.id === input.id);
    if (i < 0) throw new Error('Assignment not found.');
    assignments[i] = { ...assignments[i], ...base };
    await writeJson('assignments', { assignments });
    return assignments[i];
  }
  const assignment: Assignment = { ...base, id: randomUUID(), manualDone: {} };
  assignments.push(assignment);
  await writeJson('assignments', { assignments });
  return assignment;
}

export async function deleteAssignment(id: string): Promise<void> {
  const assignments = (await listAssignments()).filter((a) => a.id !== id);
  await writeJson('assignments', { assignments });
}

/** Manually mark (or unmark) an assignment done for a service period. */
export async function setManualDone(id: string, period: string, done: boolean): Promise<Assignment> {
  const assignments = await listAssignments();
  const a = assignments.find((x) => x.id === id);
  if (!a) throw new Error('Assignment not found.');
  if (done) a.manualDone[period] = new Date().toISOString();
  else delete a.manualDone[period];
  await writeJson('assignments', { assignments });
  return a;
}
