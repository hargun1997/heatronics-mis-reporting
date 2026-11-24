// India dates. new Date().toISOString().slice(0, 10) is the UTC day: from 00:00 to 05:30 IST it is still yesterday,
// and on the 1st of a month the month is still last month. Use these instead.
const IST_MS = 5.5 * 3_600_000;

/** IST day 'YYYY-MM-DD', optionally `offsetDays` before (negative) or after today. */
export function istDay(offsetDays = 0, now = Date.now()): string {
  return new Date(now + IST_MS + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** IST month 'YYYY-MM', optionally `offsetMonths` before (negative) or after this month. */
export function istMonth(offsetMonths = 0, now = Date.now()): string {
  const d = new Date(now + IST_MS);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
  return m.toISOString().slice(0, 7);
}
