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
import { openItems, readWork, recordReminderRun, markReminded, taskOpenItems, DEFAULT_SETTINGS, type OpenItem, type WorkTask } from './workStore.js';
import { todayIST, addDays, parseYmd, ymd } from './workSchedule.js';
import { ownerDigest, teamSummary, taskReminder, testEmail } from './workEmails.js';

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
  const task = doc.tasks.find((t) => t.id === id)!;
  const owners = members.filter((m) => task.ownerIds.includes(m.id));
  if (!owners.length) throw new Error('This task has no owner to remind.');
  if (!items.length) throw new Error('Nothing open on this task.');
  const names = (i: OpenItem) => members.filter((m) => i.task.ownerIds.includes(m.id)).map((m) => m.name).join(', ');
  const today = todayIST(now);
  const emails: (MailResult & { subject: string })[] = [];
  for (const m of owners) {
    const { subject, html } = taskReminder({ member: m, items, base, today, names });
    emails.push({ ...(await sendEmail({ to: [m.email], subject, html })), subject });
  }
  if (emails.some((e) => e.sent)) await markReminded([id], now.toISOString());
  return { emails, mailer: mailerStatus() };
}

export interface TemplateSample {
  key: string;
  name: string;
  when: string;
  to: string;
  subject: string;
  html: string;
}

/** Every email format, filled with sample items built from real tasks (nothing is sent). */
export async function buildTemplateSamples(base: string, now = new Date()): Promise<TemplateSample[]> {
  const [doc, members] = await Promise.all([readWork(), listMembers()]);
  const st = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  const today = todayIST(now);
  const hour = `${st.sendHour % 12 || 12}:00 ${st.sendHour < 12 ? 'am' : 'pm'}`;
  const active = doc.tasks.filter((t) => t.active);
  const guided = active.filter((t) => t.howTo && t.cadence !== 'daily');
  const pool = [...guided, ...active.filter((t) => !guided.includes(t))];
  const fallback: WorkTask = {
    id: 'sample',
    title: 'File GSTR-3B',
    area: 'GST, TDS & tax',
    description: 'File the monthly GSTR-3B return and pay the tax due.',
    ownerIds: [],
    cadence: 'monthly',
    dueDay: 20,
    active: true,
  };
  const [a = fallback, b = a, c = b] = pool;
  const member: TeamMember = members.find((m) => a.ownerIds.includes(m.id)) ?? members[0] ?? { id: 'sample', name: 'Aashish', email: 'accounts@heatronics.in' };
  const mk = (t: WorkTask, late: number): OpenItem => {
    const due = ymd(addDays(parseYmd(today), -late));
    return { task: t, period: t.cadence === 'yearly' ? due.slice(0, 4) : due.slice(0, 7), due, late };
  };
  const names = (i: OpenItem) => members.filter((m) => i.task.ownerIds.includes(m.id)).map((m) => m.name).join(', ') || member.name;
  const ownerItems = [mk(a, 2), mk(b, 0), mk(c, -2)];
  const owner = ownerDigest({ member, items: ownerItems, base, today, sendHour: st.sendHour, names });
  const summary = teamSummary({ items: [mk(a, 2), mk(b, 0), mk(c, 0), mk(c, -3)], members: members.length ? members : [member], base, today, sendHour: st.sendHour, names });
  const single = taskReminder({ member, items: [mk(a, 1)], base, today, names });
  const test = testEmail({ base, today, from: mailerStatus().from ?? 'Hargun <hargun@heatronics.in>' });
  return [
    { key: 'owner', name: 'Daily email — each owner', when: `Every day at ${hour} to each person with a task overdue or due today (plus what’s coming up). Repeats until ticked.`, to: member.email, ...owner },
    { key: 'summary', name: 'Daily team summary', when: `Every day at ${hour} to ${st.summaryTo.join(', ') || 'the summary address'} — everything not done, grouped by owner, incl. tasks with no owner.`, to: st.summaryTo.join(', '), ...summary },
    { key: 'task', name: 'Reminder for one task', when: '“Send reminder now” on a task — goes straight to that task’s owners.', to: member.email, ...single },
    { key: 'test', name: 'Test email', when: '“Send test” in Daily reminder email — checks the connection.', to: 'the address you enter', ...test },
  ];
}
