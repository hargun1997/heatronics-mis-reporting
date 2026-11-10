// Plan vs Actual: our own 5-year plan is the budget, the Live MIS months are what happened.
// Pure — no imports, so the SAME file is kept byte-identical at server/src/planning/planVsActual.ts
// (the server's rootDir is src/, it cannot import the client; server/test/planVsActual.test.ts checks the copies match).
//
// Rules:
//  - a month with no actual is "no data yet", never 0; a metric the books cannot give yet (EBITDA before the Tally P&L
//    is in) is null for that metric only;
//  - the month in progress is shown but never counted in year-to-date, the exit ARR pace or the "Behind plan" list;
//  - so is a finished month whose books are not complete (`complete: false`, or below a full close when the browser
//    did not say): state "partial" (10 Nov 2026, audit round 10 #4 — half-booked Oct read as "+75 % ahead");
//  - status: within ±5% of plan = on track, below = behind, above = ahead (EBITDA % is on |plan|, so a smaller loss is ahead).

export const TOLERANCE = 0.05;
export type Status = 'on_track' | 'behind' | 'ahead';
export type MetricId = 'revenue' | 'gm' | 'cm3' | 'ebitda' | 'units';
export const METRICS: MetricId[] = ['revenue', 'gm', 'cm3', 'ebitda', 'units'];
export const METRIC_NAME: Record<MetricId, string> = { revenue: 'Net revenue', gm: 'Gross margin', cm3: 'CM3', ebitda: 'EBITDA', units: 'Units' };

/** What the plan says for one month (₹ except units). `arr` = runRateArr of the plan up to this month. */
export interface PlanMonthRow { key: string; label: string; fy: string; netRevenue: number; grossProfit: number; cm3: number; ebitda: number; units: number; arr: number }

/** What the books say for one month. null = the books cannot give it yet. */
export interface ActualMonth {
  key: string;
  netRevenue: number | null;
  grossMargin: number | null;
  cm3: number | null;
  ebitda: number | null;
  units: number | null;
  /** how deep the month's real numbers go (Live MIS completeness) */
  level: 'full' | 'contribution' | 'topline';
  /** normalised COGM basis, or as booked */
  basis: 'normalised' | 'booked';
  /** books done for the month (Live MIS: closed / published / full with no hard close blocker). Absent = level 'full'. */
  complete?: boolean;
}

export interface MetricCmp { plan: number; actual: number | null; gap: number | null; gapPct: number | null; status: Status | null }
export interface MonthCmp {
  key: string; label: string; fy: string;
  state: 'ok' | 'running' | 'partial' | 'nodata';
  metrics: Record<MetricId, MetricCmp>;
  /** the month's headline status = its net revenue status */
  status: Status | null;
  basis: 'normalised' | 'booked' | null;
  level: ActualMonth['level'] | null;
}
export interface TotalCmp extends MetricCmp { months: number }
export interface BehindItem { key: string; label: string; metric: MetricId; gap: number; gapPct: number | null }
export interface ArrPace {
  /** last complete months used (up to 3; running and partial months never), newest last */
  monthsUsed: string[];
  actualArr: number;
  planArrSameMonths: number;
  /** actual ÷ plan on those months */
  ratio: number | null;
  fy: string;
  fyEndLabel: string;
  planExitArr: number;
  /** plan exit ARR × ratio: where the year ends if the gap stays as it is */
  projectedExitArr: number | null;
  gap: number | null;
  status: Status | null;
}
export interface PlanVsActual {
  months: MonthCmp[];
  ytd: { fy: string; fromLabel: string; toLabel: string; months: number; totals: Record<MetricId, TotalCmp | null> } | null;
  arr: ArrPace | null;
  behind: BehindItem[];
  withData: number;
  noData: number;
  running: string | null;
  /** finished months shown but not counted because their books are not complete */
  partial: string[];
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function statusOf(plan: number, actual: number | null): { gap: number | null; gapPct: number | null; status: Status | null } {
  if (actual == null || !Number.isFinite(actual)) return { gap: null, gapPct: null, status: null };
  const gap = r2(actual - plan);
  const d = Math.abs(plan);
  if (d < 1e-9) return { gap, gapPct: null, status: Math.abs(actual) < 1e-9 ? 'on_track' : actual > 0 ? 'ahead' : 'behind' };
  const pct = (actual - plan) / d;
  return { gap, gapPct: pct, status: Math.abs(pct) <= TOLERANCE + 1e-12 ? 'on_track' : pct > 0 ? 'ahead' : 'behind' };
}

const cmp = (plan: number, actual: number | null): MetricCmp => ({ plan: r2(plan), actual: actual == null ? null : r2(actual), ...statusOf(plan, actual) });

/** Indian FY of a YYYY-MM key, e.g. "FY27" for 2026-04 … 2027-03. */
export function fyOfKey(key: string): string {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
  return 'FY' + String((m >= 4 ? y + 1 : y) % 100).padStart(2, '0');
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const labelOfKey = (key: string) => `${MON[Number(key.slice(5, 7)) - 1]}-${key.slice(2, 4)}`;
export function keyAfter(startMonth: string, m: number): string {
  const y = Number(startMonth.slice(0, 4)), mo = Number(startMonth.slice(5, 7));
  const abs = y * 12 + (mo - 1) + (m - 1);
  return `${Math.floor(abs / 12)}-${String((abs % 12) + 1).padStart(2, '0')}`;
}

interface PlanResultLike { months: { netRevenue: number; grossProfit: number; cm3: number; ebitda: number; units: number }[] }
/** The plan's months as rows. `arrAt(e)` = runRateArr(result, e) (client/src/data/planning/growth.ts). */
export function planMonthsOf(r: PlanResultLike, startMonth: string, arrAt: (e: number) => number): PlanMonthRow[] {
  return r.months.map((m, i) => {
    const key = keyAfter(startMonth, i + 1);
    return { key, label: labelOfKey(key), fy: fyOfKey(key), netRevenue: r2(m.netRevenue), grossProfit: r2(m.grossProfit), cm3: r2(m.cm3), ebitda: r2(m.ebitda), units: Math.round(m.units), arr: r2(arrAt(i + 1)) };
  });
}

const planValue = (p: PlanMonthRow, id: MetricId): number => (id === 'revenue' ? p.netRevenue : id === 'gm' ? p.grossProfit : id === 'cm3' ? p.cm3 : id === 'ebitda' ? p.ebitda : p.units);
const actualValue = (a: ActualMonth | undefined, id: MetricId): number | null => {
  if (!a) return null;
  return id === 'revenue' ? a.netRevenue : id === 'gm' ? a.grossMargin : id === 'cm3' ? a.cm3 : id === 'ebitda' ? a.ebitda : a.units;
};

/**
 * Compare. `asOfKey` = the current month (YYYY-MM, India time): the range runs from the plan's first month to it, and
 * that month is "running" (shown, never counted).
 */
export function buildPlanVsActual(plan: PlanMonthRow[], actuals: ActualMonth[], asOfKey: string): PlanVsActual {
  const notes: string[] = [];
  const empty: PlanVsActual = { months: [], ytd: null, arr: null, behind: [], withData: 0, noData: 0, running: null, partial: [], notes };
  if (!plan.length) return empty;
  const byKey = new Map(actuals.map((a) => [a.key, a]));
  const inRange = plan.filter((p) => p.key <= asOfKey);
  if (!inRange.length) { notes.push(`The plan starts in ${plan[0].label}.`); return empty; }

  const months: MonthCmp[] = inRange.map((p) => {
    const a = byKey.get(p.key);
    const metrics = {} as Record<MetricId, MetricCmp>;
    for (const id of METRICS) metrics[id] = cmp(planValue(p, id), actualValue(a, id));
    const has = METRICS.some((id) => metrics[id].actual != null);
    const running = p.key === asOfKey;
    const complete = a ? (a.complete ?? a.level === 'full') : false;
    return {
      key: p.key, label: p.label, fy: p.fy,
      state: !has ? 'nodata' : running ? 'running' : complete ? 'ok' : 'partial',
      metrics,
      status: metrics.revenue.status,
      basis: a && has ? a.basis : null,
      level: a && has ? a.level : null,
    };
  });
  const counted = months.filter((m) => m.state === 'ok');
  const runningMonth = months.find((m) => m.state === 'running') ?? null;
  const partial = months.filter((m) => m.state === 'partial');
  if (partial.length) notes.push(`${partial.map((m) => m.label).join(', ')} shown but not counted: the books are not complete yet.`);

  // Year to date: the newest FY with a counted month, like for like per metric
  let ytd: PlanVsActual['ytd'] = null;
  const fy = counted.length ? counted[counted.length - 1].fy : null;
  if (fy) {
    const ms = counted.filter((m) => m.fy === fy);
    const totals = {} as Record<MetricId, TotalCmp | null>;
    for (const id of METRICS) {
      const used = ms.filter((m) => m.metrics[id].actual != null);
      if (!used.length) { totals[id] = null; continue; }
      const p = used.reduce((s, m) => s + m.metrics[id].plan, 0);
      const a = used.reduce((s, m) => s + (m.metrics[id].actual as number), 0);
      totals[id] = { ...cmp(p, a), months: used.length };
    }
    ytd = { fy, fromLabel: ms[0].label, toLabel: ms[ms.length - 1].label, months: ms.length, totals };
    if (plan[0].fy === fy && !plan[0].key.endsWith('-04')) notes.push(`Year to date counts from ${plan[0].label}, when the plan starts.`);
  }

  // Exit ARR pace: the last (up to 3) counted months with revenue, ×4 ; same months of the plan; the gap carried to the FY end
  let arr: ArrPace | null = null;
  const withRev = counted.filter((m) => m.metrics.revenue.actual != null);
  if (fy && withRev.length) {
    const used = withRev.slice(-3);
    const actualArr = (used.reduce((s, m) => s + (m.metrics.revenue.actual as number), 0) * 12) / used.length;
    const planArr = (used.reduce((s, m) => s + m.metrics.revenue.plan, 0) * 12) / used.length;
    const fyRows = plan.filter((p) => p.fy === fy);
    const end = fyRows[fyRows.length - 1];
    const ratio = planArr > 1e-9 ? actualArr / planArr : null;
    const projected = ratio == null ? null : end.arr * ratio;
    const st = projected == null ? { gap: null, status: null as Status | null } : statusOf(end.arr, projected);
    arr = {
      monthsUsed: used.map((m) => m.key), actualArr: r2(actualArr), planArrSameMonths: r2(planArr), ratio,
      fy, fyEndLabel: end.label, planExitArr: end.arr, projectedExitArr: projected == null ? null : r2(projected), gap: st.gap, status: st.status,
    };
    if (used.length < 3) notes.push(`Exit ARR pace uses ${used.length} month${used.length === 1 ? '' : 's'} so far (the plan uses 3).`);
  }

  const behind: BehindItem[] = [];
  for (const m of counted) for (const id of ['revenue', 'ebitda'] as MetricId[]) {
    const c = m.metrics[id];
    if (c.status === 'behind' && c.gap != null && c.gap < 0) behind.push({ key: m.key, label: m.label, metric: id, gap: c.gap, gapPct: c.gapPct });
  }
  behind.sort((x, y) => x.gap - y.gap);

  if (counted.some((m) => m.basis === 'booked')) notes.push('Months marked "as booked" have no BOM costing, so their margins are Tally\'s own.');
  return { months, ytd, arr, behind, withData: counted.length + partial.length + (runningMonth ? 1 : 0), noData: months.filter((m) => m.state === 'nodata').length, running: runningMonth?.key ?? null, partial: partial.map((m) => m.key), notes };
}
