// ----------------------------------------------------------------------------
// PLAN vs ACTUAL — the pinned "plan of record" (compact monthly targets the planner page posts) against the stored
// Tally months. PURE (route: routes/planning.ts). Revenue = plan revenue ex-GST vs Tally sales; profit = plan PAT vs
// Tally Nett Profit; cash = plan closing cash vs Tally net cash (bank − overdraft). Only months that have both.
// "On track" = within ±5 % of plan (cash: within ±₹5 L or 5 % of the plan, whichever is larger).
// ----------------------------------------------------------------------------

export interface RecordMonth { period: string; revenue: number; pat: number; closingCash: number; ebitda?: number }
export interface PlanRecord { name: string; scenarioId: string | null; pinnedAt: string; by: string | null; startMonth: string; months: RecordMonth[] }
export interface ActualMonth { period: string; sales: number | null; nettProfit: number | null; netCash: number | null }

export type Verdict = 'ahead' | 'on_track' | 'behind' | 'no_data';
export interface Cell { plan: number; actual: number | null; gap: number | null; gapPct: number | null; verdict: Verdict }
export interface Row { period: string; revenue: Cell; profit: Cell; cash: Cell }
export interface PlanVsActual {
  schema: 1; portal: 'mis'; record: { name: string; pinnedAt: string; by: string | null } | null;
  rows: Row[];
  ytd: { fy: string; months: number; revenue: Cell; profit: Cell } | null;
  latest: Row | null;
  line: string;
  notes: string[];
}

const TOL = 0.05;
const CASH_FLOOR = 500_000;
const r0 = (n: number) => Math.round(n);

/** Higher is better for all three lines. */
export function cell(plan: number, actual: number | null, kind: 'flow' | 'cash' = 'flow'): Cell {
  if (actual == null) return { plan: r0(plan), actual: null, gap: null, gapPct: null, verdict: 'no_data' };
  const gap = actual - plan;
  const pct = plan !== 0 ? (gap / Math.abs(plan)) * 100 : null;
  const tol = kind === 'cash' ? Math.max(CASH_FLOOR, Math.abs(plan) * TOL) : Math.abs(plan) * TOL;
  const verdict: Verdict = Math.abs(gap) <= tol ? 'on_track' : gap > 0 ? 'ahead' : 'behind';
  return { plan: r0(plan), actual: r0(actual), gap: r0(gap), gapPct: pct == null ? null : Math.round(pct * 10) / 10, verdict };
}

/** Indian FY of a YYYY-MM period, e.g. 2026-11 → "FY27". */
export function fyOf(period: string): string {
  const y = Number(period.slice(0, 4)), m = Number(period.slice(5, 7));
  return `FY${String((m >= 4 ? y + 1 : y) % 100).padStart(2, '0')}`;
}

const inrL = (n: number) => `₹${(Math.abs(n) / 1e5).toFixed(1)} L`;

export function planVsActual(record: PlanRecord | null, actual: ActualMonth[]): PlanVsActual {
  const notes: string[] = [];
  if (!record || !record.months.length) {
    return { schema: 1, portal: 'mis', record: null, rows: [], ytd: null, latest: null, line: 'No plan pinned yet', notes: ['Open 5-year plan, pick the scenario you are running on, and press "Pin as plan of record".'] };
  }
  const act = new Map(actual.map((a) => [a.period, a]));
  const rows: Row[] = [];
  for (const p of [...record.months].sort((a, b) => a.period.localeCompare(b.period))) {
    const a = act.get(p.period);
    if (!a || a.sales == null) continue;           // a month with no Tally P&L yet is not judged
    rows.push({ period: p.period, revenue: cell(p.revenue, a.sales), profit: cell(p.pat, a.nettProfit), cash: cell(p.closingCash, a.netCash, 'cash') });
  }
  if (!rows.length) notes.push(`No month of the plan (from ${record.months[0].period}) has Tally books yet.`);
  const latest = rows[rows.length - 1] ?? null;
  let ytd: PlanVsActual['ytd'] = null;
  if (latest) {
    const fy = fyOf(latest.period);
    const inFy = rows.filter((r) => fyOf(r.period) === fy);
    const sum = (f: (r: Row) => number | null) => inFy.reduce((s, r) => s + (f(r) ?? 0), 0);
    const allProfit = inFy.every((r) => r.profit.actual != null);
    ytd = {
      fy, months: inFy.length,
      revenue: cell(sum((r) => r.revenue.plan), sum((r) => r.revenue.actual)),
      profit: cell(sum((r) => r.profit.plan), allProfit ? sum((r) => r.profit.actual) : null),
    };
  }
  let line = 'No month to compare yet';
  if (ytd) {
    const v = ytd.revenue;
    line = v.verdict === 'on_track' ? `${ytd.fy} so far: sales on plan (${ytd.months} month${ytd.months === 1 ? '' : 's'})`
      : `${ytd.fy} so far: sales ${inrL(v.gap!)} ${v.verdict === 'ahead' ? 'ahead of' : 'behind'} plan (${v.gapPct! > 0 ? '+' : ''}${v.gapPct}%)`;
  }
  notes.push('Plan revenue is ex-GST; Tally sales are as booked (ex-GST). Plan profit is PAT; Tally is Nett Profit before any year-end tax entries.');
  return { schema: 1, portal: 'mis', record: { name: record.name, pinnedAt: record.pinnedAt, by: record.by }, rows, ytd, latest, line, notes };
}

/** Validate a posted record: periods YYYY-MM, finite numbers, ≤ 120 months. Throws a plain-English error. */
export function cleanRecord(x: unknown, by: string | null, now: string): PlanRecord {
  const o = x as Partial<PlanRecord> | null;
  if (!o || typeof o !== 'object') throw new Error('Send {name, startMonth, months}.');
  const name = String(o.name ?? '').trim().slice(0, 120);
  if (!name) throw new Error('The plan needs a name.');
  if (!Array.isArray(o.months) || !o.months.length || o.months.length > 120) throw new Error('months must hold 1–120 rows.');
  const months = o.months.map((m) => {
    const ok = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m?.period)) && [m.revenue, m.pat, m.closingCash].every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!ok) throw new Error('Each month needs period YYYY-MM and numbers for revenue, pat, closingCash.');
    return { period: m.period, revenue: r0(m.revenue), pat: r0(m.pat), closingCash: r0(m.closingCash), ...(typeof m.ebitda === 'number' && Number.isFinite(m.ebitda) ? { ebitda: r0(m.ebitda) } : {}) };
  });
  return { name, scenarioId: o.scenarioId ? String(o.scenarioId).slice(0, 40) : null, pinnedAt: now, by, startMonth: String(o.startMonth ?? months[0].period).slice(0, 7), months };
}
