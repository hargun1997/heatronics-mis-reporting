// ----------------------------------------------------------------------------
// CASH RUNWAY — 13 weeks ahead, three cases, from the STORED Tally numbers. PURE (route: routes/cash.ts).
// Honest about what it is: net cash today (bank − overdraft, from the newest Trial Balance) moved forward at the
// month-by-month change in NET cash (bank − overdraft) we actually saw, less new loans (base = average of the last ≤ 3
// months, hard = the worst one, easy = the best one), spread evenly over the weeks. GST, salaries, rent and vendor
// payments are already inside that pattern, so nothing is added on top. Not a forecast of sales; it answers "if the
// last months repeat, when does cash run out and when do we touch the overdraft limit?". (Review of #396: gross-cash
// change hid overdraft-funded burn, and a GST lump on every 20th counted GST twice.)
// ----------------------------------------------------------------------------

export interface FlowIn { period: string; netChange: number }
/** Month-end balances from the stored Trial Balances (ceoSummary months). */
export interface BalMonth { period: string; netCash: number | null; loans: number | null }

/** Monthly change in net cash (bank − overdraft) less new borrowing, from consecutive month-ends with both. */
export function netCashFlows(months: BalMonth[]): FlowIn[] {
  const ms = [...months].filter((m) => m.netCash != null).sort((a, b) => a.period.localeCompare(b.period));
  const out: FlowIn[] = [];
  for (let i = 1; i < ms.length; i++) {
    const a = ms[i - 1], b = ms[i];
    const loanIn = a.loans != null && b.loans != null ? b.loans - a.loans : 0;
    out.push({ period: b.period, netChange: Math.round((b.netCash! - a.netCash!) - loanIn) });
  }
  return out;
}
export interface RunwayInput {
  today: string;            // IST YYYY-MM-DD
  netCash: number | null;   // bank − overdraft, as of balancePeriod
  balancePeriod: string | null;
  flows: FlowIn[];          // newest last
  gstPayable: number | null; // > 0 = we owe (shown only; already inside the monthly pattern)
  odLimit: number | null;   // overdraft limit in ₹ (positive), null = not set
}
export type CaseId = 'base' | 'hard' | 'easy';
export interface Week { week: number; start: string; base: number; hard: number; easy: number }
export interface CaseSummary { id: CaseId; label: string; perMonth: number; zeroOn: string | null; limitOn: string | null; low: number; lowWeek: number; end: number }
export interface Runway {
  schema: 1; portal: 'mis'; today: string; basis: string | null; netCash: number | null; odLimit: number | null; gstPayable: number | null;
  flowMonths: string[]; weeks: Week[]; cases: CaseSummary[]; status: 'act' | 'watch' | 'ok' | 'unknown'; line: string; notes: string[];
}

const WEEKS = 13;
const r0 = (n: number) => Math.round(n);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayNum = (d: string) => Number(d.slice(8, 10));
const MONTH_WEEKS = 52 / 12;

/** The 20th falls inside the 7 days starting at `start`? */
export function hasTwentieth(start: string): boolean {
  for (let i = 0; i < 7; i++) if (dayNum(addDays(start, i)) === 20) return true;
  return false;
}

export function buildRunway(x: RunwayInput): Runway {
  const notes: string[] = [];
  const flows = x.flows.slice(-3);
  const base: Runway = { schema: 1, portal: 'mis', today: x.today, basis: x.balancePeriod, netCash: x.netCash, odLimit: x.odLimit, gstPayable: x.gstPayable,
    flowMonths: flows.map((f) => f.period), weeks: [], cases: [], status: 'unknown', line: 'Not enough books stored to project cash', notes };
  if (x.netCash == null || !flows.length) { notes.push('Needs a stored Trial Balance and at least one month of cash change (Setup → Tally → Pull now).'); return base; }
  const ch = flows.map((f) => f.netChange);
  const per: Record<CaseId, number> = { base: ch.reduce((a, b) => a + b, 0) / ch.length, hard: Math.min(...ch), easy: Math.max(...ch) };
  notes.push('GST, salaries, rent and supplier payments are inside the monthly pattern; nothing extra is added.');
  if (x.balancePeriod && x.balancePeriod < x.today.slice(0, 7)) {
    const lag = (Number(x.today.slice(0, 4)) - Number(x.balancePeriod.slice(0, 4))) * 12 + Number(x.today.slice(5, 7)) - Number(x.balancePeriod.slice(5, 7));
    notes.push(`Net cash is as of the end of ${x.balancePeriod} (latest stored books)${lag >= 2 ? ' — over a month old; pull Tally for a fresher start' : ''}.`);
  }
  notes.push('A month with a fundraise or one-off receipt makes "Best month repeats" look better than it is.');
  if (x.odLimit == null) notes.push('Overdraft limit not set — set it to see the day you would hit it.');
  notes.push(`Moves cash forward at the ${flows.length}-month pattern (${flows.map((f) => f.period).join(', ')}). Not a sales forecast.`);

  const bal: Record<CaseId, number> = { base: x.netCash, hard: x.netCash, easy: x.netCash };
  const weeks: Week[] = [];
  const hit: Record<CaseId, { zero: string | null; limit: string | null; low: number; lowWeek: number }> = {
    base: { zero: null, limit: null, low: x.netCash, lowWeek: 0 }, hard: { zero: null, limit: null, low: x.netCash, lowWeek: 0 }, easy: { zero: null, limit: null, low: x.netCash, lowWeek: 0 } };
  for (let w = 1; w <= WEEKS; w++) {
    const start = addDays(x.today, (w - 1) * 7);
    for (const c of ['base', 'hard', 'easy'] as CaseId[]) {
      bal[c] += per[c] / MONTH_WEEKS;
      const h = hit[c];
      if (bal[c] < 0 && !h.zero) h.zero = start;
      if (x.odLimit != null && bal[c] < -x.odLimit && !h.limit) h.limit = start;
      if (bal[c] < h.low) { h.low = bal[c]; h.lowWeek = w; }
    }
    weeks.push({ week: w, start, base: r0(bal.base), hard: r0(bal.hard), easy: r0(bal.easy) });
  }
  const LABEL: Record<CaseId, string> = { base: 'Usual', hard: 'Worst month repeats', easy: 'Best month repeats' };
  const cases: CaseSummary[] = (['base', 'hard', 'easy'] as CaseId[]).map((c) => ({
    id: c, label: LABEL[c], perMonth: r0(per[c]), zeroOn: hit[c].zero, limitOn: hit[c].limit, low: r0(hit[c].low), lowWeek: hit[c].lowWeek, end: r0(bal[c]),
  }));
  const b = cases[0], hd = cases[1];
  const status: Runway['status'] = b.limitOn || b.zeroOn ? 'act' : hd.limitOn || hd.zeroOn ? 'watch' : 'ok';
  const line = b.limitOn ? `At the usual pace you reach the overdraft limit the week of ${b.limitOn}`
    : b.zeroOn ? `At the usual pace net cash goes below zero the week of ${b.zeroOn}`
    : hd.limitOn ? `Fine at the usual pace; if the worst month repeats you reach the overdraft limit the week of ${hd.limitOn}`
    : hd.zeroOn ? `Fine at the usual pace; if the worst month repeats net cash goes below zero the week of ${hd.zeroOn}`
    : 'Cash stays above zero for the next 13 weeks in all three cases';
  return { ...base, weeks, cases, status, line };
}
