// ============================================================================
// WORK REMINDERS — email each owner their overdue and due-soon tasks, with a
// "How to" link to the Accounts Handbook section for each one. Run it daily
// (Cloud Scheduler → POST /api/work/reminders/run) for "remind every day until
// done"; a task drops out of the next email as soon as it is ticked (or, for
// uploads, as soon as the file lands).
// ============================================================================

import { listMembers, type TeamMember } from './ownershipStore.js';
import { sendEmail, mailerStatus, type MailResult } from './mailer.js';
import { openItems, recordReminderRun, type OpenItem } from './workStore.js';

export interface WorkReminderRun {
  at: string;
  items: number;
  emails: MailResult[];
  unowned: number;
  mailer: ReturnType<typeof mailerStatus>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function line(i: OpenItem, base: string): string {
  const when =
    i.late > 0
      ? `<span style="color:#b91c1c;font-weight:600">${i.late} day${i.late > 1 ? 's' : ''} overdue</span>`
      : i.late === 0
        ? `<span style="color:#c2410c;font-weight:600">due today</span>`
        : `<span style="color:#b45309">due in ${-i.late} day${i.late < -1 ? 's' : ''}</span>`;
  const how = i.task.howTo ? ` · <a href="${base}/handbook#${encodeURIComponent(i.task.howTo)}" style="color:#e13a00">How to do it</a>` : '';
  return `<li style="margin:8px 0"><b>${esc(i.task.title)}</b> <span style="color:#64748b">(${esc(i.task.area)} · ${esc(i.period)})</span><br/>Due ${i.due} · ${when}${how}</li>`;
}

function html(name: string, items: OpenItem[], base: string): string {
  const overdue = items.filter((i) => i.late > 0);
  const soon = items.filter((i) => i.late <= 0);
  const block = (title: string, list: OpenItem[]) =>
    list.length ? `<h3 style="margin:18px 0 4px;font-size:14px">${title}</h3><ul style="padding-left:18px;margin:0">${list.map((i) => line(i, base)).join('')}</ul>` : '';
  return `
  <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:600px">
    <p>Hi ${esc(name || 'there')},</p>
    <p>Here are your open Heatronics tasks.</p>
    ${block('Overdue', overdue)}
    ${block('Due today / soon', soon)}
    <p style="margin-top:20px"><a href="${base}/tasks" style="background:#fe4705;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:600">Open my tasks</a></p>
    <p style="color:#94a3b8;font-size:12px">You'll get this each day until the task is ticked off in the MIS (uploads tick themselves when the file lands).</p>
  </div>`;
}

export async function runWorkReminders(base: string, now = new Date()): Promise<WorkReminderRun> {
  const [items, members] = await Promise.all([openItems(now), listMembers()]);
  const byId = new Map<string, TeamMember>(members.map((m) => [m.id, m]));
  const byOwner = new Map<string, { name: string; items: OpenItem[] }>();
  let unowned = 0;
  for (const it of items) {
    const owners = it.task.ownerIds.map((id) => byId.get(id)).filter((m): m is TeamMember => !!m);
    if (!owners.length) unowned++;
    for (const o of owners) {
      const g = byOwner.get(o.email) ?? { name: o.name, items: [] };
      g.items.push(it);
      byOwner.set(o.email, g);
    }
  }
  const emails: MailResult[] = [];
  for (const [email, g] of byOwner) {
    const overdue = g.items.filter((i) => i.late > 0).length;
    const subject = overdue
      ? `[Heatronics] ${overdue} task${overdue > 1 ? 's' : ''} overdue · ${g.items.length - overdue} due soon`
      : `[Heatronics] ${g.items.length} task${g.items.length > 1 ? 's' : ''} due soon`;
    emails.push(await sendEmail({ to: [email], subject, html: html(g.name, g.items, base) }));
  }
  const status = mailerStatus();
  await recordReminderRun({
    at: now.toISOString(),
    sent: emails.filter((e) => e.sent).length,
    dryRun: !status.configured,
    recipients: byOwner.size,
  });
  return { at: now.toISOString(), items: items.length, emails, unowned, mailer: status };
}
