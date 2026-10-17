// ============================================================================
// WORK EMAILS — templates for the daily task emails.
//
//   ownerDigest()  → to each owner: their tasks not done (overdue, due today)
//                    and a heads-up for what is coming up.
//   teamSummary()  → to Hargun (settings.summaryTo): every open task across
//                    the team, grouped by owner, including tasks with no owner.
//
// Email-client safe: table layout, inline styles, no external CSS/images.
// Every task links to itself in the MIS (/tasks?task=<id>) and to the
// Accounts Handbook section that explains how to do it.
// ============================================================================

import type { OpenItem } from './workStore.js';
import type { TeamMember } from './ownershipStore.js';

const BRAND = '#fe4705';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const parse = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export const dayLabel = (ymd: string) => {
  const d = parse(ymd);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MN[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
};
const shortDay = (ymd: string) => {
  const d = parse(ymd);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MN[d.getUTCMonth() + 1]}`;
};

export function periodLabel(p: string): string {
  if (p === 'once') return 'One-time';
  if (/^\d{4}$/.test(p)) return p;
  if (/^\d{4}-W\d{2}$/.test(p)) return `Week ${Number(p.slice(6))}, ${p.slice(0, 4)}`;
  if (/^\d{4}-\d{2}$/.test(p)) return `${MN[Number(p.slice(5))]} ${p.slice(0, 4)}`;
  return shortDay(p);
}

function status(i: OpenItem): { text: string; fg: string; bg: string; bar: string } {
  if (i.late > 0) return { text: `${i.late} day${i.late > 1 ? 's' : ''} overdue`, fg: '#b91c1c', bg: '#fef2f2', bar: '#ef4444' };
  if (i.late === 0) return { text: 'Due today', fg: '#c2410c', bg: '#fff7ed', bar: BRAND };
  return { text: `Due ${shortDay(i.due)}`, fg: '#92400e', bg: '#fffbeb', bar: '#f59e0b' };
}

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function taskCard(i: OpenItem, base: string, ownerNames: string): string {
  const st = status(i);
  const desc = (i.task.description || i.task.notes || '').trim();
  const meta = [i.task.area, periodLabel(i.period), ownerNames].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
  const links = [
    `<a href="${base}/tasks?task=${encodeURIComponent(i.task.id)}" style="color:${BRAND};text-decoration:none;font-weight:600">Open task →</a>`,
    i.task.howTo ? `<a href="${base}/handbook#${encodeURIComponent(i.task.howTo)}" style="color:${BRAND};text-decoration:none;font-weight:600">How to do it →</a>` : '',
    ...(i.task.links ?? [])
      .filter((l) => !(i.task.howTo && l.url === `/handbook#${i.task.howTo}`))
      .slice(0, 3)
      .map((l) => `<a href="${l.url.startsWith('/') ? base + l.url : esc(l.url)}" style="color:#475569;text-decoration:underline">${esc(l.label)}</a>`),
    i.task.upload ? `<span style="color:${MUTED}">Ticks itself when the file is uploaded</span>` : '',
  ]
    .filter(Boolean)
    .join('&nbsp;&nbsp;&nbsp;');
  return `
  <tr><td style="padding:0 0 10px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;border-left:4px solid ${st.bar};background:#ffffff">
      <tr><td style="padding:12px 14px;${FONT}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="${FONT};font-size:15px;font-weight:700;color:${INK};line-height:1.35">${esc(i.task.title)}</td>
          <td align="right" valign="top" style="white-space:nowrap;padding-left:8px">
            <span style="${FONT};display:inline-block;font-size:11px;font-weight:700;color:${st.fg};background:${st.bg};border-radius:999px;padding:3px 9px">${st.text}</span>
          </td>
        </tr></table>
        <div style="${FONT};font-size:12px;color:${MUTED};margin-top:3px">${meta} &nbsp;·&nbsp; due ${shortDay(i.due)}</div>
        ${desc ? `<div style="${FONT};font-size:13px;color:#334155;line-height:1.5;margin-top:8px">${esc(trim(desc, 280))}</div>` : ''}
        <div style="${FONT};font-size:13px;margin-top:10px">${links}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

function section(title: string, color: string, rows: string): string {
  if (!rows) return '';
  return `
  <tr><td style="${FONT};font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${color};padding:18px 0 8px 0">${title}</td></tr>
  ${rows}`;
}

function stat(label: string, n: number, color: string): string {
  return `<td width="33%" align="center" style="padding:10px 4px;background:#ffffff;border-radius:10px">
    <div style="${FONT};font-size:24px;font-weight:800;color:${n ? color : '#94a3b8'}">${n}</div>
    <div style="${FONT};font-size:11px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:.05em">${label}</div>
  </td>`;
}

function layout(opts: { preheader: string; heading: string; sub: string; stats: string; body: string; cta: { href: string; label: string }; footer: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
    <tr><td style="background:${BRAND};border-radius:14px 14px 0 0;padding:18px 22px">
      <div style="${FONT};font-size:12px;font-weight:800;letter-spacing:.14em;color:#ffe4d9">HEATRONICS · TASKS</div>
      <div style="${FONT};font-size:22px;font-weight:800;color:#ffffff;margin-top:4px">${esc(opts.heading)}</div>
      <div style="${FONT};font-size:13px;color:#ffe4d9;margin-top:2px">${esc(opts.sub)}</div>
    </td></tr>
    <tr><td style="background:#fff3ee;padding:12px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>${opts.stats}</tr></table>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:4px 18px 8px 18px;border-left:1px solid ${LINE};border-right:1px solid ${LINE}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.body}</table>
    </td></tr>
    <tr><td align="center" style="background:#f8fafc;padding:8px 18px 22px 18px;border-left:1px solid ${LINE};border-right:1px solid ${LINE};border-bottom:1px solid ${LINE};border-radius:0 0 14px 14px">
      <a href="${opts.cta.href}" style="${FONT};display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:10px;padding:11px 22px">${esc(opts.cta.label)}</a>
    </td></tr>
    <tr><td style="${FONT};font-size:12px;color:#94a3b8;line-height:1.5;padding:14px 8px;text-align:center">${opts.footer}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const footer = (hourLabel: string) =>
  `Sent by Hargun from the Heatronics MIS every day at ${hourLabel} for tasks not yet ticked.<br/>Tick a task in the MIS and it drops off the next email.`;

export const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}`;

/** Email to one owner: their open tasks. */
export function ownerDigest(o: { member: TeamMember; items: OpenItem[]; base: string; today: string; sendHour: number; names: (i: OpenItem) => string }) {
  const overdue = o.items.filter((i) => i.late > 0);
  const today = o.items.filter((i) => i.late === 0);
  const soon = o.items.filter((i) => i.late < 0);
  const first = o.member.name.split(/\s+/)[0] || 'there';
  const pending = overdue.length + today.length;
  const subject = pending
    ? `[Heatronics] ${pending} task${pending > 1 ? 's' : ''} not done${overdue.length ? ` · ${overdue.length} overdue` : ''} — ${shortDay(o.today)}`
    : `[Heatronics] Coming up: ${soon.length} task${soon.length > 1 ? 's' : ''} — ${shortDay(o.today)}`;
  const card = (i: OpenItem) => taskCard(i, o.base, o.names(i));
  const html = layout({
    preheader: pending ? `${overdue.length} overdue, ${today.length} due today, ${soon.length} coming up` : `${soon.length} tasks coming up`,
    heading: `Hi ${first}, here’s what’s pending`,
    sub: `Daily task summary · ${dayLabel(o.today)}`,
    stats: stat('Overdue', overdue.length, '#dc2626') + stat('Due today', today.length, BRAND) + stat('Coming up', soon.length, '#d97706'),
    body:
      section('Overdue', '#dc2626', overdue.map(card).join('')) +
      section('Due today', BRAND, today.map(card).join('')) +
      section('Coming up', '#b45309', soon.map(card).join('')),
    cta: { href: `${o.base}/tasks?who=${encodeURIComponent(o.member.id)}`, label: 'Open my tasks' },
    footer: footer(hourLabel(o.sendHour)),
  });
  return { subject, html };
}

/** Team summary to Hargun: everything open today, by owner. */
export function teamSummary(o: { items: OpenItem[]; members: TeamMember[]; base: string; today: string; sendHour: number; names: (i: OpenItem) => string }) {
  const pending = o.items.filter((i) => i.late >= 0);
  const soon = o.items.filter((i) => i.late < 0);
  const overdue = pending.filter((i) => i.late > 0).length;
  const card = (i: OpenItem) => taskCard(i, o.base, o.names(i));

  const groups: { title: string; items: OpenItem[] }[] = [];
  for (const m of o.members) {
    const list = pending.filter((i) => i.task.ownerIds.includes(m.id));
    if (list.length) groups.push({ title: `${m.name} · ${list.length}`, items: list });
  }
  const unowned = pending.filter((i) => !i.task.ownerIds.some((id) => o.members.some((m) => m.id === id)));
  if (unowned.length) groups.push({ title: `No owner · ${unowned.length}`, items: unowned });

  const subject = pending.length
    ? `[Heatronics] Team summary: ${pending.length} not done${overdue ? ` · ${overdue} overdue` : ''} — ${shortDay(o.today)}`
    : `[Heatronics] Team summary: all clear — ${shortDay(o.today)}`;
  const body = pending.length
    ? groups.map((g) => section(esc(g.title), g.title.startsWith('No owner') ? '#b45309' : INK, g.items.map(card).join(''))).join('') +
      (soon.length
        ? section(
            `Coming up · ${soon.length}`,
            '#b45309',
            `<tr><td style="${FONT};font-size:13px;color:#334155;line-height:1.7;padding-bottom:6px">${soon
              .map((i) => `${esc(i.task.title)} <span style="color:${MUTED}">— ${shortDay(i.due)} · ${esc(o.names(i) || 'No owner')}</span>`)
              .join('<br/>')}</td></tr>`,
          )
        : '')
    : `<tr><td style="${FONT};font-size:15px;color:#334155;padding:22px 0;text-align:center">Everything due today is done. 🎉</td></tr>`;

  const html = layout({
    preheader: `${pending.length} tasks not done across the team, ${overdue} overdue`,
    heading: 'Team task summary',
    sub: `What’s not done as of ${hourLabel(o.sendHour)} · ${dayLabel(o.today)}`,
    stats: stat('Overdue', overdue, '#dc2626') + stat('Due today', pending.length - overdue, BRAND) + stat('No owner', unowned.length, '#d97706'),
    body,
    cta: { href: `${o.base}/tasks`, label: 'Open Tasks & owners' },
    footer: footer(hourLabel(o.sendHour)),
  });
  return { subject, html };
}
