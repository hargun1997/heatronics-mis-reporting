// ============================================================================
// ANOMALY SCAN — read the committed ingest store and flag data-quality issues
// that don't surface at upload time: things that are each individually valid to
// store but don't make business sense once you look across months.
//
// This runs over the durable extracted payloads (facts + Tally ledger rows),
// so it needs no browser and can be called on demand (the Issues dashboard) or
// on a schedule (a daily Cloud Scheduler hit, which can then email the digest).
//
// Rules are deliberately conservative — a false "issue" erodes trust faster
// than a missed one — so each has a materiality floor and only fires when the
// surrounding months give it meaning.
// ============================================================================

import type { ExtractedReport } from '../ingest/objectStore.js';

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  category: string;
  /** The month the issue is about, YYYY-MM (or a range label). */
  period: string;
  title: string;
  detail: string;
}

export interface AnomalyScanResult {
  issues: Issue[];
  scannedAt: string;
  monthsCovered: string[];
}

// ---- helpers ---------------------------------------------------------------

const isPeriod = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const monthName = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MN[m] ?? m} ${y}`;
};
/** All months from `a` to `b` inclusive (YYYY-MM), chronological. */
function monthRange(a: string, b: string): string[] {
  const out: string[] = [];
  let [y, m] = a.split('-').map(Number);
  const [ey, em] = b.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

interface Fact { date?: string; source?: string; channel?: string; revenue?: number; spend?: number; fees?: number; }

/** The month a fact belongs to: its own date, else the report's period. */
const factMonth = (f: Fact, fallback: string): string => {
  const d = str(f.date);
  return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : fallback;
};

// Lines that are totals / subtotals, not real cost centres — never flag these
// as "a cost centre went to zero".
const TOTAL_LINE = /(total|gross profit|nett? profit|net profit|gross margin|ebitda|balance|difference)/i;

// ---- scan ------------------------------------------------------------------

export function scanIssues(reports: ExtractedReport[]): AnomalyScanResult {
  const issues: Issue[] = [];
  const push = (i: Issue) => issues.push(i);

  // Index the store by month.
  const revenueByMonth = new Map<string, number>();            // sum of fact revenue
  const channelRevByMonth = new Map<string, Map<string, number>>();
  const ledgerByMonth = new Map<string, Map<string, number>>(); // lineName(lower) -> amount
  const stockByMonth = new Map<string, { opening: number; closing: boolean; closingVal: number }>();
  const monthsWithData = new Set<string>();

  for (const r of reports) {
    const period = isPeriod(r.periodKey) ? r.periodKey : '';
    const facts = Array.isArray(r.payload.facts) ? (r.payload.facts as Fact[]) : [];
    for (const f of facts) {
      const mo = factMonth(f, period);
      if (!isPeriod(mo)) continue;
      monthsWithData.add(mo);
      const rev = num(f.revenue);
      if (rev) {
        revenueByMonth.set(mo, (revenueByMonth.get(mo) ?? 0) + rev);
        const ch = str(f.channel) || 'Unknown';
        const cm = channelRevByMonth.get(mo) ?? new Map<string, number>();
        cm.set(ch, (cm.get(ch) ?? 0) + rev);
        channelRevByMonth.set(mo, cm);
      }
    }

    const ledger = Array.isArray(r.payload.ledgerRows) ? (r.payload.ledgerRows as { name?: string; amount?: number }[]) : [];
    if (ledger.length && isPeriod(period)) {
      monthsWithData.add(period);
      const lines = ledgerByMonth.get(period) ?? new Map<string, number>();
      let opening = 0;
      let closing = 0;
      let hasClosing = false;
      for (const row of ledger) {
        const name = str(row.name).trim();
        if (!name) continue;
        const amt = num(row.amount);
        lines.set(name.toLowerCase(), (lines.get(name.toLowerCase()) ?? 0) + amt);
        if (/opening stock/i.test(name)) opening += Math.abs(amt);
        if (/closing stock/i.test(name)) { closing += Math.abs(amt); hasClosing = true; }
      }
      ledgerByMonth.set(period, lines);
      if (opening > 0 || hasClosing) stockByMonth.set(period, { opening, closing: hasClosing, closingVal: closing });
    }
  }

  const months = [...monthsWithData].sort();

  // Rule 1 — flat inventory (closing stock == opening stock). Mirrors the
  // month-close advisory: Tally prints closing = opening before stock is valued,
  // which overstates gross margin.
  for (const [mo, s] of stockByMonth) {
    if (s.closing && s.opening > 0 && Math.abs(s.closingVal - s.opening) < Math.max(1, s.opening * 0.001)) {
      push({
        id: `flat-stock:${mo}`,
        severity: 'high',
        category: 'inventory',
        period: mo,
        title: 'Closing stock equals opening stock',
        detail:
          `${monthName(mo)}: closing stock (${inr(s.closingVal)}) equals opening stock (${inr(s.opening)}). ` +
          'Tally prints this before stock is valued — gross margin is overstated until the real closing figure is entered.',
      });
    }
  }

  // Rule 2 — a cost centre dropped to absolute zero. A Tally ledger line that
  // was material last month and is absent/zero this month (both months closed).
  for (let i = 1; i < months.length; i += 1) {
    const prev = ledgerByMonth.get(months[i - 1]);
    const cur = ledgerByMonth.get(months[i]);
    if (!prev || !cur) continue; // need both months closed in Tally to judge "gone"
    for (const [name, amt] of prev) {
      if (TOTAL_LINE.test(name)) continue;
      const was = Math.abs(amt);
      if (was < 25000) continue; // materiality floor
      const now = Math.abs(cur.get(name) ?? 0);
      if (now === 0) {
        push({
          id: `cost-zero:${months[i]}:${name}`,
          severity: 'medium',
          category: 'cost-centre',
          period: months[i],
          title: `"${titleCase(name)}" dropped to zero`,
          detail:
            `${titleCase(name)} was ${inr(was)} in ${monthName(months[i - 1])} but is absent/zero in ` +
            `${monthName(months[i])}. A cost centre going to absolute zero usually means a missing posting.`,
        });
      }
    }
  }

  // Rule 3 — a sales channel that was earning stopped earning. Channel had
  // material revenue last month, zero this month (while the month has other data).
  for (let i = 1; i < months.length; i += 1) {
    const prevCh = channelRevByMonth.get(months[i - 1]);
    const curCh = channelRevByMonth.get(months[i]);
    if (!prevCh || !monthsWithData.has(months[i])) continue;
    for (const [ch, rev] of prevCh) {
      if (rev < 50000) continue;
      const now = curCh?.get(ch) ?? 0;
      if (now === 0) {
        push({
          id: `channel-zero:${months[i]}:${ch}`,
          severity: 'medium',
          category: 'revenue',
          period: months[i],
          title: `${ch} revenue went to zero`,
          detail:
            `${ch} booked ${inr(rev)} in ${monthName(months[i - 1])} but nothing in ${monthName(months[i])}. ` +
            'Either a sales file is missing for this month or the channel genuinely stopped.',
        });
      }
    }
  }

  // Rule 4 — a missing month inside the covered range (a gap with no data at
  // all between two months that do have data).
  if (months.length >= 2) {
    const full = monthRange(months[0], months[months.length - 1]);
    const missing = full.filter((m) => !monthsWithData.has(m));
    for (const m of missing) {
      push({
        id: `missing-month:${m}`,
        severity: 'medium',
        category: 'coverage',
        period: m,
        title: `No data for ${monthName(m)}`,
        detail:
          `${monthName(m)} sits inside the uploaded range (${monthName(months[0])}–${monthName(months[months.length - 1])}) ` +
          'but has no reports at all. The P&L has a hole here.',
      });
    }
  }

  // Rule 5 — a large month-on-month revenue swing (both months material).
  for (let i = 1; i < months.length; i += 1) {
    const prev = revenueByMonth.get(months[i - 1]) ?? 0;
    const cur = revenueByMonth.get(months[i]) ?? 0;
    if (prev < 100000 || cur < 1) continue;
    const drop = (prev - cur) / prev;
    const spike = cur / prev;
    if (drop >= 0.6) {
      push({
        id: `swing-drop:${months[i]}`,
        severity: 'low',
        category: 'revenue',
        period: months[i],
        title: `Revenue fell ${Math.round(drop * 100)}% vs prior month`,
        detail: `Net revenue dropped from ${inr(prev)} (${monthName(months[i - 1])}) to ${inr(cur)} (${monthName(months[i])}). Worth a look — a missing file can masquerade as a crash.`,
      });
    } else if (spike >= 2.5) {
      push({
        id: `swing-spike:${months[i]}`,
        severity: 'low',
        category: 'revenue',
        period: months[i],
        title: `Revenue jumped ${Math.round(spike * 10) / 10}× vs prior month`,
        detail: `Net revenue rose from ${inr(prev)} (${monthName(months[i - 1])}) to ${inr(cur)} (${monthName(months[i])}). A duplicated file can look like a spike.`,
      });
    }
  }

  const rank: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity] || a.period.localeCompare(b.period));

  return { issues, scannedAt: new Date().toISOString(), monthsCovered: months };
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}
