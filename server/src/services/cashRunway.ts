// ----------------------------------------------------------------------------
// CASH RUNWAY — 13 weeks ahead, three cases, from the STORED Tally numbers. PURE (route: routes/cash.ts).
// Honest about what it is: net cash today (bank − overdraft, from the newest Trial Balance) moved forward at the
// month-by-month net cash change we actually saw (base = average of the last ≤ 3 months, hard = the worst one,
// easy = the best one), spread evenly over the weeks, plus ONE known lump: GST payable on the 20th (assumed to be paid
// in full, so the 20th is a real step down). Not a forecast of sales; it answers "if the last months repeat, when
// does cash run out and when do we touch the overdraft limit?".
// ----------------------------------------------------------------------------

export interface FlowIn { period: string; netChange: number }
export interface RunwayInput {
  today: string;            // IST YYYY-MM-DD
  netCash: number | null;   // bank − overdraft, as of balancePeriod
  balancePeriod: string | null;
  flows: FlowIn[];          // newest last
  gstPayable: number | null; // > 0 = we owe
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
  const gst = x.gstPayable && x.gstPayable > 0 ? x.gstPayable : 0;
  if (gst) notes.push(`GST payable ${r0(gst).toLocaleString('en-IN')} is assumed paid in full on the 20th. Check the sign of "Duties & Taxes" in Tally if this looks wrong.`);
  if (x.odLimit == null) notes.push('Overdraft limit not set — set it to see the day you would hit it.');
  notes.push(`Moves cash forward at the ${flows.length}-month pattern (${flows.map((f) => f.period).join(', ')}). Not a sales forecast.`);

  const bal: Record<CaseId, number> = { base: x.netCash, hard: x.netCash, easy: x.netCash };
  const weeks: Week[] = [];
  const hit: Record<CaseId, { zero: string | null; limit: string | null; low: number; lowWeek: number }> = {
    base: { zero: null, limit: null, low: x.netCash, lowWeek: 0 }, hard: { zero: null, limit: null, low: x.netCash, lowWeek: 0 }, easy: { zero: null, limit: null, low: x.netCash, lowWeek: 0 } };
  for (let w = 1; w <= WEEKS; w++) {
    const start = addDays(x.today, (w - 1) * 7);
    const lump = hasTwentieth(start) ? gst : 0;
    for (const c of ['base', 'hard', 'easy'] as CaseId[]) {
      bal[c] += per[c] / MONTH_WEEKS - lump;
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
