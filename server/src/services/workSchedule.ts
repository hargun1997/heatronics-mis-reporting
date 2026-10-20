// ============================================================================
// WORK SCHEDULE — when a recurring task falls due, and how its occurrences are
// keyed. Pure functions, no I/O.
//
// Kept byte-identical with client/src/data/work/schedule.ts (the client and
// server are separate packages); change both together.
//
// Every occurrence has a `period` key (what "done" is recorded against) and a
// `due` date (YYYY-MM-DD, India time):
//   daily       period YYYY-MM-DD        due that day (Mon–Sat)
//   weekly      period YYYY-Www          due on `dueWeekday` (1 = Mon … 7 = Sun)
//   monthly     period YYYY-MM           due on `dueDay` of the month
//               (arrears: the period is the PREVIOUS month, e.g. uploads of
//                last month's report due by the 7th)
//   quarterly / half-yearly  period YYYY-MM of each due month in `months`
//   yearly      period YYYY              due `dueMonth`/`dueDay`
//   one-time    period "once"            due `dueDate` (or `dueMonth`/`dueDay` this year)
// ============================================================================

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly' | 'one-time';

export interface ScheduleSpec {
  cadence: Cadence;
  dueDay?: number;
  /** Optional first day of a window, e.g. 8 for "8th–9th" (due date stays dueDay). */
  startDay?: number;
  dueWeekday?: number;
  months?: number[];
  dueMonth?: number;
  dueDate?: string;
  arrears?: boolean;
}

export interface Occurrence {
  period: string;
  due: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const clampDay = (y: number, m: number, d: number) => Math.min(Math.max(1, d || 1), daysIn(y, m));
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return utc(y, m, d);
};
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const diffDays = (a: string, b: string) => Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 86_400_000);

/** Today's date in India (YYYY-MM-DD). */
export function todayIST(now: Date = new Date()): string {
  return ymd(new Date(now.getTime() + 330 * 60_000));
}

/** ISO week key, e.g. 2026-W42. */
export function isoWeek(d: Date): string {
  const t = utc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = utc(t.getUTCFullYear(), 1, 1);
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(wk)}`;
}

const DEFAULT_MONTHS: Record<string, number[]> = { quarterly: [1, 4, 7, 10], 'half-yearly': [4, 10] };

/** All occurrences whose due date falls within [from, to] (YYYY-MM-DD, inclusive). */
export function occurrences(spec: ScheduleSpec, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const a = parseYmd(from);
  const b = parseYmd(to);
  const inRange = (d: Date) => d >= a && d <= b;

  switch (spec.cadence) {
    case 'daily':
      for (let d = a; d <= b; d = addDays(d, 1)) if (d.getUTCDay() !== 0) out.push({ period: ymd(d), due: ymd(d) });
      break;
    case 'weekly': {
      const wd = spec.dueWeekday && spec.dueWeekday >= 1 && spec.dueWeekday <= 7 ? spec.dueWeekday : 1;
      for (let d = a; d <= b; d = addDays(d, 1)) if ((d.getUTCDay() || 7) === wd) out.push({ period: isoWeek(d), due: ymd(d) });
      break;
    }
    case 'monthly':
    case 'quarterly':
    case 'half-yearly': {
      const months = spec.cadence === 'monthly' ? null : spec.months?.length ? spec.months : DEFAULT_MONTHS[spec.cadence];
      const last = b.getUTCFullYear() * 12 + b.getUTCMonth();
      for (let idx = a.getUTCFullYear() * 12 + a.getUTCMonth(); idx <= last; idx++) {
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1;
        if (months && !months.includes(m)) continue;
        const due = utc(y, m, clampDay(y, m, spec.dueDay ?? 1));
        if (!inRange(due)) continue;
        const py = spec.arrears ? (m === 1 ? y - 1 : y) : y;
        const pm = spec.arrears ? (m === 1 ? 12 : m - 1) : m;
        out.push({ period: `${py}-${pad(pm)}`, due: ymd(due) });
      }
      break;
    }
    case 'yearly':
      for (let y = a.getUTCFullYear(); y <= b.getUTCFullYear(); y++) {
        const mo = spec.dueMonth ?? 3;
        const due = utc(y, mo, clampDay(y, mo, spec.dueDay ?? 31));
        if (inRange(due)) out.push({ period: String(y), due: ymd(due) });
      }
      break;
    case 'one-time': {
      let due: Date | null = null;
      if (spec.dueDate) due = parseYmd(spec.dueDate);
      else if (spec.dueMonth) {
        const y = a.getUTCFullYear();
        due = utc(y, spec.dueMonth, clampDay(y, spec.dueMonth, spec.dueDay ?? 1));
      }
      if (due && inRange(due)) out.push({ period: 'once', due: ymd(due) });
      break;
    }
  }
  return out;
}

/** How far back an un-done occurrence still counts as overdue (older ones drop off). */
export function lookbackDays(c: Cadence): number {
  return c === 'daily' ? 1 : c === 'weekly' ? 14 : c === 'monthly' ? 45 : 120;
}

/** Plain-words schedule, e.g. "Every month on the 1st" (for last month). */
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function describe(spec: ScheduleSpec): string {
  const MN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WDL = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const day = (d?: number, fallback = 1) => ((d ?? fallback) >= 31 ? 'last day' : ordinal(d ?? fallback));
  switch (spec.cadence) {
    case 'daily':
      return 'Every working day (Mon–Sat)';
    case 'weekly':
      return `Every ${WDL[spec.dueWeekday ?? 1]}`;
    case 'monthly':
      return `Every month${spec.startDay && spec.startDay < (spec.dueDay ?? 1) ? `, ${ordinal(spec.startDay)}–${day(spec.dueDay)}` : ` on the ${day(spec.dueDay)}`}${spec.arrears ? ' (for last month)' : ''}`;
    case 'quarterly':
    case 'half-yearly':
      return `${spec.cadence === 'quarterly' ? 'Quarterly' : 'Half-yearly'} on the ${day(spec.dueDay)} of ${(spec.months?.length ? spec.months : DEFAULT_MONTHS[spec.cadence]).map((m) => MN[m]).join(', ')}`;
    case 'yearly':
      return `Every year on ${spec.dueDay ?? 31} ${MN[spec.dueMonth ?? 3]}`;
    case 'one-time': {
      if (spec.dueDate) {
        const d = parseYmd(spec.dueDate);
        return `Once on ${d.getUTCDate()} ${MN[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
      }
      return spec.dueMonth ? `Once on ${spec.dueDay ?? 1} ${MN[spec.dueMonth]}` : 'Once — no date set';
    }
  }
}
