// Why a Live MIS number below CM2 is "Not read" (PR 4, 22 Nov 2026): the tiles said "needs Tally" with no reason.
// Pure: names what is missing for the selected period, in ASD-STE100 words (short, active, digits).
import type { PeriodCompleteness } from './liveDeck';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mon = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${MON[Number(p.slice(5)) - 1]} ${p.slice(2, 4)}` : p);

/** One month: why its Tally P&L does not give EBITDA / net income yet. Null when the month is a full Tally month. */
export function monthTallyReason(c: Pick<PeriodCompleteness, 'periodKey' | 'hasTally' | 'level' | 'tallyIgnored' | 'tallyGaps'> | undefined, key: string): string | null {
  if (!c) return `No data for ${mon(key)}`;
  if (c.level === 'full') return null;
  if (c.tallyIgnored) return `Tally copy for ${mon(key)} has no sales yet`;
  if (!c.hasTally) return `No Tally P&L for ${mon(key)}`;
  const gaps = c.tallyGaps ?? [];
  if (gaps.length) return `Tally misses ${gaps.map((g) => g.channel).slice(0, 2).join(', ')}${gaps.length > 2 ? ` +${gaps.length - 2}` : ''} sales for ${mon(key)}`;
  return `Tally has no sales for ${mon(key)}`;
}

/** The tile line for a period: the one month's reason, or "N of M months not in Tally" for a quarter / year / range. */
export function tallyReason(members: string[], completeness: Record<string, PeriodCompleteness | undefined>): string {
  const reasons = members.map((k) => monthTallyReason(completeness[k], k)).filter((r): r is string => !!r);
  if (!reasons.length) return 'needs Tally';
  if (members.length === 1) return reasons[0];
  return `${reasons.length} of ${members.length} months not in Tally`;
}
