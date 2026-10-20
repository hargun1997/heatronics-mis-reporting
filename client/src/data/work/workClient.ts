// Client for /api/work — the unified Tasks page (tasks, owners, completions,
// reminders). People are the shared team list (/api/ownership/members).

import type { ScheduleSpec } from './schedule';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

export interface WorkTask extends ScheduleSpec {
  id: string;
  title: string;
  area: string;
  description?: string;
  ownerIds: string[];
  roleLabel?: string;
  howTo?: string;
  form?: string;
  authority?: string;
  penalty?: string;
  notes?: string;
  links?: { label: string; url: string }[];
  checklist?: { id: string; label: string; hint?: string; link?: string }[];
  dependsOn?: string[];
  upload?: { connectorId: string; slotId: string };
  remindDaysBefore?: number;
  remind?: boolean;
  active: boolean;
  source?: string;
}

export interface DoneEntry {
  at: string;
  by?: string;
  note?: string;
}

export interface MailerStatus {
  configured: boolean;
  provider: 'smtp' | 'resend' | 'mailgun' | 'none';
  from: string | null;
  source?: 'env' | 'app';
  host?: string;
  user?: string;
}

export interface ReminderSettings {
  enabled: boolean;
  sendHour: number;
  summaryTo: string[];
  includeDueSoon: boolean;
}

export interface Head {
  id: string;
  name: string;
  roles: string[];
  areas: string[];
}

export interface Routing {
  roles: Record<string, string[]>;
  fallback?: string;
}

export interface DraftEmail {
  kind: 'owner' | 'summary';
  to: string[];
  name: string;
  subject: string;
  html: string;
  items: number;
}

export interface WorkState {
  seededAt?: string;
  tasks: WorkTask[];
  done: Record<string, Record<string, DoneEntry>>;
  autoDone: Record<string, string[]>;
  members: TeamMember[];
  mailer: MailerStatus;
  settings: ReminderSettings;
  routing: Routing;
  roleNames: string[];
  heads: Head[];
  lastScheduledDay?: string;
  reminded?: Record<string, string>;
  checks?: Record<string, Record<string, string[]>>;
  lastReminderRun?: { at: string; sent: number; dryRun: boolean; recipients: number };
}

export interface ReminderRun {
  at: string;
  items: number;
  unowned: number;
  emails: { sent: boolean; dryRun: boolean; to: string[]; error?: string; kind: 'owner' | 'summary'; subject: string }[];
  mailer: MailerStatus;
}

async function json<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error || `Request failed (${r.status})`);
  return body as T;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const getWork = () => fetch('/api/work').then((r) => json<WorkState>(r));
export const saveTask = (t: Partial<WorkTask>) => post('/api/work/tasks', t).then((r) => json<WorkTask>(r));
export const deleteTask = (id: string) => fetch(`/api/work/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r));
export const setTaskDone = (id: string, period: string, done: boolean, by?: string, note?: string) =>
  post(`/api/work/tasks/${encodeURIComponent(id)}/done`, { period, done, by, note }).then((r) => json<{ ok: true }>(r));
export const importSeed = (tasks: Partial<WorkTask>[], done: WorkState['done']) =>
  post('/api/work/import', { tasks, done }).then((r) => json<{ imported: number; skipped: boolean }>(r));
export const runWorkReminders = () => post('/api/work/reminders/run', {}).then((r) => json<ReminderRun>(r));

export const setTaskCheck = (id: string, period: string, item: string, checked: boolean, by?: string) =>
  post(`/api/work/tasks/${encodeURIComponent(id)}/check`, { period, item, checked, by }).then((r) => json<{ checks: string[]; done: boolean }>(r));
export const deleteTasks = (ids: string[]) => post('/api/work/tasks/delete', { ids }).then((r) => json<{ deleted: number }>(r));
export const saveHeads = (heads: Partial<Head>[]) => post('/api/work/heads', { heads }).then((r) => json<Head[]>(r));
export const remindTask = (id: string) =>
  post(`/api/work/tasks/${encodeURIComponent(id)}/remind`, {}).then((r) =>
    json<{ emails: { sent: boolean; dryRun: boolean; to: string[]; error?: string }[]; mailer: MailerStatus }>(r),
  );
export const saveRouting = (r: Partial<Routing> & { apply?: boolean }) =>
  post('/api/work/routing', r).then((r2) => json<{ routing: Routing; assigned: number }>(r2));
export interface EmailTemplate {
  key: string;
  name: string;
  when: string;
  to: string;
  subject: string;
  html: string;
}
export const getEmailTemplates = () => fetch('/api/work/templates').then((r) => json<{ templates: EmailTemplate[] }>(r));
export const saveSettings = (s: Partial<ReminderSettings>) => post('/api/work/settings', s).then((r) => json<ReminderSettings>(r));
export const previewReminders = () =>
  fetch('/api/work/reminders/preview').then((r) => json<{ drafts: DraftEmail[]; items: number; unowned: number }>(r));
export const connectMail = (c: { pass?: string; user?: string; host?: string; port?: number; from?: string }) =>
  post('/api/work/mail', c).then((r) => json<{ mailer: MailerStatus; check: { ok: boolean; error?: string } }>(r));
export const sendTestMail = (to: string) => post('/api/work/mail/test', { to }).then((r) => json<{ sent: boolean }>(r));

export const saveMember = (m: Partial<TeamMember>) =>
  post('/api/ownership/members', m).then((r) => json<{ member: TeamMember }>(r)).then((x) => x.member);
export const deleteMember = (id: string) =>
  fetch(`/api/ownership/members/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<{ ok: true }>(r));
