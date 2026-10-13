// Ownership client — team members, report-upload assignments, reminder status.

export interface TeamMember { id: string; name: string; email: string; }

export interface Assignment {
  id: string;
  label: string;
  ownerIds: string[];
  connectorId?: string;
  slotId?: string;
  dueDay: number;
  active: boolean;
  manualDone: Record<string, string>;
}

export interface OutstandingItem {
  assignmentId: string;
  label: string;
  servicePeriod: string;
  dueDate: string;
  status: 'overdue' | 'upcoming';
  daysLate: number;
  owners: { name: string; email: string }[];
}

export interface MailerStatus { configured: boolean; provider: 'resend' | 'mailgun' | 'none'; from: string | null; }

export interface Overview {
  members: TeamMember[];
  assignments: Assignment[];
  outstanding: OutstandingItem[];
  servicePeriod: string;
  mailer: MailerStatus;
}

export interface ReminderRun {
  runDate: string;
  servicePeriod: string;
  outstanding: OutstandingItem[];
  emails: { sent: boolean; dryRun: boolean; provider: string; to: string[]; error?: string }[];
  mailer: MailerStatus;
}

const json = async <T>(res: Response): Promise<T> => {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status}).`);
  return body as T;
};

export const getOverview = () => fetch('/api/ownership/overview').then((r) => json<Overview>(r));

export const saveMember = (m: Partial<TeamMember>) =>
  fetch('/api/ownership/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }).then((r) => json<{ member: TeamMember }>(r));

export const deleteMember = (id: string) =>
  fetch(`/api/ownership/members/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r));

export const saveAssignment = (a: Partial<Assignment>) =>
  fetch('/api/ownership/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }).then((r) => json<{ assignment: Assignment }>(r));

export const deleteAssignment = (id: string) =>
  fetch(`/api/ownership/assignments/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r));

export const setDone = (id: string, period: string, done: boolean) =>
  fetch(`/api/ownership/assignments/${id}/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period, done }) }).then((r) => json<{ assignment: Assignment }>(r));

export const runReminders = () =>
  fetch('/api/ownership/reminders/run', { method: 'POST' }).then((r) => json<ReminderRun>(r));
