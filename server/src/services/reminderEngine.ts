// ============================================================================
// REMINDER ENGINE — work out which monthly uploads are outstanding and nudge
// their owners by email. Reports are collected in arrears: the report for a
// service month M is due by `dueDay` of the NEXT month. On any given run date
// the active service period is the previous calendar month.
//
// An assignment is DONE for a period when either the linked ingest slot has a
// committed report for that period, or it was manually marked done. Anything
// else that is active and past (or at) its due day is OVERDUE. Running this
// daily (a scheduler → POST /api/reminders/run) is what makes it "email every
// day until done": a done assignment simply drops out of the next run.
// ============================================================================

import { listReports } from '../ingest/objectStore.js';
import { listAssignments, listMembers, type Assignment, type TeamMember } from './ownershipStore.js';
import { sendEmail, mailerStatus, type MailResult } from './mailer.js';

export interface OutstandingItem {
  assignmentId: string;
  label: string;
  servicePeriod: string; // YYYY-MM the report is FOR
  dueDate: string;       // YYYY-MM-DD it was/is due
  status: 'overdue' | 'upcoming';
  daysLate: number;      // negative = days until due
  owners: { name: string; email: string }[];
}

export interface ReminderRun {
  runDate: string;
  servicePeriod: string;
  outstanding: OutstandingItem[];
  emails: MailResult[];
  mailer: ReturnType<typeof mailerStatus>;
}

const MN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const monthName = (p: string) => { const [y, m] = p.split('-').map(Number); return `${MN[m] ?? m} ${y}`; };

/** Previous calendar month relative to a run date. */
function prevMonth(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based; previous month = this index in 1-based
  return m === 0 ? `${y - 1}-12` : `${y}-${pad(m)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Compute what's outstanding for the service period active on `now`.
 * @param upcomingWindow also include items due within this many days (default 3).
 */
export async function computeOutstanding(now: Date, upcomingWindow = 3): Promise<{ servicePeriod: string; items: OutstandingItem[] }> {
  const [assignments, members, reports] = await Promise.all([listAssignments(), listMembers(), listReports()]);
  const byId = new Map<string, TeamMember>(members.map((m) => [m.id, m]));
  const servicePeriod = prevMonth(now);
  // The due date lives in the month AFTER the service period — i.e. the run's
  // current calendar month.
  const dueMonth = now.getUTCFullYear() * 12 + now.getUTCMonth(); // current month index

  const hasReport = (a: Assignment): boolean => {
    if (!a.connectorId || !a.slotId) return false;
    return reports.some((r) => r.connectorId === a.connectorId && r.slotId === a.slotId && r.periodKey === servicePeriod);
  };

  const items: OutstandingItem[] = [];
  for (const a of assignments) {
    if (!a.active) continue;
    if (a.manualDone[servicePeriod]) continue;
    if (hasReport(a)) continue;

    const y = Math.floor(dueMonth / 12);
    const m = (dueMonth % 12) + 1;
    const dueDate = new Date(Date.UTC(y, m - 1, a.dueDay));
    const daysLate = daysBetween(now, dueDate);
    const status: 'overdue' | 'upcoming' = daysLate >= 0 ? 'overdue' : 'upcoming';
    if (status === 'upcoming' && -daysLate > upcomingWindow) continue; // too far out to nag

    items.push({
      assignmentId: a.id,
      label: a.label,
      servicePeriod,
      dueDate: `${y}-${pad(m)}-${pad(a.dueDay)}`,
      status,
      daysLate,
      owners: a.ownerIds.map((id) => byId.get(id)).filter((x): x is TeamMember => !!x).map((x) => ({ name: x.name, email: x.email })),
    });
  }
  return { servicePeriod, items };
}

function emailHtml(ownerName: string, items: OutstandingItem[]): string {
  const rows = items
    .map((i) => {
      const tag = i.status === 'overdue'
        ? `<span style="color:#b91c1c;font-weight:600">${i.daysLate} day(s) overdue</span>`
        : `<span style="color:#b45309">due in ${-i.daysLate} day(s)</span>`;
      return `<li style="margin:6px 0"><b>${i.label}</b> — for ${monthName(i.servicePeriod)} · due ${i.dueDate} · ${tag}</li>`;
    })
    .join('');
  return `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:560px">
      <p>Hi ${ownerName || 'there'},</p>
      <p>These monthly uploads for the Heatronics MIS are still outstanding:</p>
      <ul style="padding-left:18px">${rows}</ul>
      <p style="color:#475569;font-size:13px">Please upload them in the MIS tool. You'll keep getting this reminder each day until the file is in.</p>
      <p style="color:#94a3b8;font-size:12px">Automated reminder from the Heatronics MIS.</p>
    </div>`;
}

/**
 * Compute outstanding items and email each owner their own list. Returns the
 * run report (including dry-run results when no mailer is configured).
 */
export async function runReminders(now: Date): Promise<ReminderRun> {
  const { servicePeriod, items } = await computeOutstanding(now);

  // Group outstanding items by owner email.
  const byOwner = new Map<string, { name: string; items: OutstandingItem[] }>();
  for (const it of items) {
    for (const o of it.owners) {
      const g = byOwner.get(o.email) ?? { name: o.name, items: [] };
      g.items.push(it);
      byOwner.set(o.email, g);
    }
  }

  const emails: MailResult[] = [];
  for (const [email, g] of byOwner) {
    const overdue = g.items.filter((i) => i.status === 'overdue').length;
    const subject = overdue > 0
      ? `[MIS] ${overdue} upload(s) overdue for ${monthName(servicePeriod)}`
      : `[MIS] Upload(s) due soon for ${monthName(servicePeriod)}`;
    emails.push(await sendEmail({ to: [email], subject, html: emailHtml(g.name, g.items) }));
  }

  return { runDate: now.toISOString(), servicePeriod, outstanding: items, emails, mailer: mailerStatus() };
}
