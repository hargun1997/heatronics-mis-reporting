// ============================================================================
// WORK REMINDERS — the daily task emails, sent from hargun@heatronics.in.
//
// Every day at the send hour (default 2 pm India time) anything not ticked is
// emailed:
//   • each owner gets their own list (overdue, due today, coming up), with a
//     description, a link to the task and its Accounts Handbook "how to";
//   • Hargun (settings.summaryTo) gets the team summary, grouped by owner,
//     including tasks with no owner.
// A task drops out of the next email as soon as it is ticked (uploads tick
// themselves when the file lands).
//
// The automatic send is triggered hourly by GitHub Actions
// (.github/workflows/task-reminders.yml → POST /api/work/reminders/run with
// {"scheduled":true}); the server sends once per day, after the send hour.
// "Send now" in the app sends immediately.
// ============================================================================

import { listMembers, type TeamMember } from './ownershipStore.js';
import { sendEmail, mailerStatus, ensureMailConfig, type MailResult, type MailerStatus } from './mailer.js';
import { openItems, readWork, recordReminderRun, markReminded, taskOpenItems, DEFAULT_SETTINGS, type OpenItem } from './workStore.js';
import { todayIST } from './workSchedule.js';
import { ownerDigest, teamSummary } from './workEmails.js';

export interface DraftEmail {
  kind: 'owner' | 'summary';
  /** Tasks in an owner email (to log "last reminded"). */
  taskIds?: string[];
  to: string[];
  name: string;
  subject: string;
  html: string;
  items: number;
}

export interface WorkReminderRun {
  at: string;
  items: number;
  emails: (MailResult & { kind: DraftEmail['kind']; subject: string })[];
  unowned: number;
  mailer: MailerStatus;
  skipped?: string;
}

/** Build (but don't send) today's emails. */
export async function buildReminderEmails(base: string, now = new Date()): Promise<{ drafts: DraftEmail[]; items: OpenItem[]; unowned: number }> {
  const [all, members, doc] = await Promise.all([openItems(now), listMembers(), readWork()]);
  const st = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  const items = st.includeDueSoon ? all : all.filter((i) => i.late >= 0);
  const today = todayIST(now);
  const byId = new Map<string, TeamMember>(members.map((m) => [m.id, m]));
  const names = (i: OpenItem) =>
    i.task.ownerIds
      .map((id) => byId.get(id)?.name)
      .filter(Boolean)
      .join(', ');

  const drafts: DraftEmail[] = [];
  let unowned = 0;
  const perOwner = new Map<string, OpenItem[]>();
  for (const it of items) {
    const owners = it.task.ownerIds.filter((id) => byId.has(id));
    if (!owners.length && it.late >= 0) unowned++;
    for (const id of owners) perOwner.set(id, [...(perOwner.get(id) ?? []), it]);
  }
  for (const [id, list] of perOwner) {
    const m = byId.get(id)!;
    // Only email an owner when something is actually pending (not just "coming up").
    if (!list.some((i) => i.late >= 0)) continue;
    const { subject, html } = ownerDigest({ member: m, items: list, base, today, sendHour: st.sendHour, names });
    drafts.push({ kind: 'owner', to: [m.email], name: m.name, subject, html, items: list.length, taskIds: [...new Set(list.map((i) => i.task.id))] });
  }
  if (st.summaryTo.length) {
    const { subject, html } = teamSummary({ items, members, base, today, sendHour: st.sendHour, names });
    drafts.push({ kind: 'summary', to: st.summaryTo, name: 'Team summary', subject, html, items: items.filter((i) => i.late >= 0).length });
  }
  return { drafts, items, unowned };
}

export async function runWorkReminders(base: string, now = new Date()): Promise<WorkReminderRun> {
  await ensureMailConfig();
  const { drafts, items, unowned } = await buildReminderEmails(base, now);
  const emails: WorkReminderRun['emails'] = [];
  const reminded = new Set<string>();
  for (const d of drafts) {
    const r = await sendEmail({ to: d.to, subject: d.subject, html: d.html });
    if (r.sent) (d.taskIds ?? []).forEach((id) => reminded.add(id));
    emails.push({ ...r, kind: d.kind, subject: d.subject });
  }
  await markReminded([...reminded], now.toISOString());
  const status = mailerStatus();
  await recordReminderRun({
    at: now.toISOString(),
    sent: emails.filter((e) => e.sent).length,
    dryRun: !status.configured,
    recipients: drafts.length,
  });
  return { at: now.toISOString(), items: items.length, emails, unowned, mailer: status };
}

/** "Send reminder now" for one task: emails its owners about it straight away. */
export async function remindTaskNow(id: string, base: string, now = new Date()) {
  await ensureMailConfig();
  const [items, members, doc] = await Promise.all([taskOpenItems(id, now), listMembers(), readWork()]);
  const st = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  const task = doc.tasks.find((t) => t.id === id)!;
  const owners = members.filter((m) => task.ownerIds.includes(m.id));
  if (!owners.length) throw new Error('This task has no owner to remind.');
  if (!items.length) throw new Error('Nothing open on this task.');
  const names = (i: OpenItem) => members.filter((m) => i.task.ownerIds.includes(m.id)).map((m) => m.name).join(', ');
  const today = todayIST(now);
  const emails: (MailResult & { subject: string })[] = [];
  for (const m of owners) {
    const { html } = ownerDigest({ member: m, items, base, today, sendHour: st.sendHour, names });
    const subject = `[Heatronics] Reminder: ${task.title}`;
    emails.push({ ...(await sendEmail({ to: [m.email], subject, html })), subject });
  }
  if (emails.some((e) => e.sent)) await markReminded([id], now.toISOString());
  return { emails, mailer: mailerStatus() };
}
