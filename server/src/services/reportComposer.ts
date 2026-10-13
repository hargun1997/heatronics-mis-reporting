// ============================================================================
// REPORT COMPOSER — a server-side monthly summary email, for the scheduled
// send. The rich animated presentation is built in the browser from the live
// deck; the server can't run that, so the automated monthly email is a compact
// summary composed straight from the committed store (revenue by month, the
// latest month's headline, open data issues, outstanding uploads) plus a link
// to open the full report in the tool.
// ============================================================================

import type { ExtractedReport } from '../ingest/objectStore.js';
import { scanIssues } from './anomalyScan.js';
import { computeOutstanding } from './reminderEngine.js';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (k: string) => { const [y, m] = k.split('-').map(Number); return `${MN[m] ?? m} ${y}`; };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

interface Fact { date?: string; channel?: string; revenue?: number; }

export interface ComposedReport {
  subject: string;
  html: string;
  servicePeriod: string;
}

export async function composeMonthlySummary(reports: ExtractedReport[], appUrl: string, now: Date): Promise<ComposedReport> {
  // Revenue per month from the committed facts.
  const revByMonth = new Map<string, number>();
  for (const r of reports) {
    const facts = Array.isArray(r.payload.facts) ? (r.payload.facts as Fact[]) : [];
    for (const f of facts) {
      const d = typeof f.date === 'string' && /^\d{4}-\d{2}/.test(f.date) ? f.date.slice(0, 7) : r.periodKey;
      if (!/^\d{4}-\d{2}$/.test(d)) continue;
      const rev = num(f.revenue);
      if (rev) revByMonth.set(d, (revByMonth.get(d) ?? 0) + rev);
    }
  }
  const months = [...revByMonth.keys()].sort();
  const last6 = months.slice(-6);
  const latest = months[months.length - 1];
  const servicePeriod = latest ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const issues = scanIssues(reports).issues;
  const { items: outstanding } = await computeOutstanding(now);

  const rows = last6
    .map((m) => {
      const v = revByMonth.get(m) ?? 0;
      const max = Math.max(1, ...last6.map((x) => revByMonth.get(x) ?? 0));
      const w = Math.max(2, (v / max) * 100);
      return `<tr><td style="padding:4px 10px;color:#475569;font-size:13px">${monthLabel(m)}</td>
        <td style="padding:4px 10px;width:60%"><div style="background:#eef2f7;border-radius:5px"><div style="width:${w}%;background:#2563eb;height:12px;border-radius:5px"></div></div></td>
        <td style="padding:4px 10px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums">${inr(v)}</td></tr>`;
    })
    .join('');

  const high = issues.filter((i) => i.severity === 'high').length;
  const issuesLine = issues.length
    ? `${issues.length} open data issue${issues.length === 1 ? '' : 's'}${high ? ` (${high} high)` : ''}`
    : 'No open data issues';
  const outstandingLine = outstanding.length
    ? `${outstanding.length} upload${outstanding.length === 1 ? '' : 's'} still outstanding`
    : 'All uploads are in';

  const subject = `[Heatronics MIS] Monthly summary — ${monthLabel(servicePeriod)}`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:600px">
      <div style="background:linear-gradient(135deg,#fe4705,#b5370b);color:#fff;border-radius:16px;padding:20px 22px">
        <h1 style="margin:0;font-size:20px">Heatronics MIS — monthly summary</h1>
        <p style="margin:6px 0 0;opacity:.9;font-size:13px">${monthLabel(servicePeriod)}${latest ? ` · latest net revenue ${inr(revByMonth.get(latest) ?? 0)}` : ''}</p>
      </div>
      <h2 style="font-size:14px;color:#334155;margin:20px 0 8px;text-transform:uppercase;letter-spacing:.06em">Net revenue — last 6 months</h2>
      <table style="width:100%;border-collapse:collapse">${rows || '<tr><td style="color:#94a3b8;font-size:13px">No revenue yet.</td></tr>'}</table>
      <div style="margin-top:18px;padding:12px 14px;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;font-size:13px;color:#334155">
        <div>📋 ${outstandingLine}</div>
        <div style="margin-top:4px">🔎 ${issuesLine}</div>
      </div>
      <p style="margin-top:18px"><a href="${appUrl}/reporting/mis/live" style="display:inline-block;background:#fe4705;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px">Open the full MIS →</a></p>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px">Automated monthly summary from the Heatronics MIS · figures are management, not statutory.</p>
    </div>`;
  return { subject, html, servicePeriod };
}
