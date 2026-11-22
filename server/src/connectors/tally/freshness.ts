// ONE answer to "when did we last reach Tally?" (UI pass, 22 Nov 2026). Before, Today read the P&L poll's lastOkAt
// ("20 days ago"), the Fix list counted days to noon IST and floored them ("19 days"), and Tally health read the
// masters' time ("45 h ago"). Now all three take the newest successful read of either store (P&L poll or books
// pull) and say the age with the same words as the client's `ago()` (components/ui/sourceAgo.ts).
import { readTallyState } from './snapshots.js';
import { readBooksState } from './bookStore.js';

/** Newest ISO time among the given ones (null when none parse). */
export function newest(...isos: (string | null | undefined)[]): string | null {
  let best: string | null = null, bt = -Infinity;
  for (const s of isos) {
    const t = s ? Date.parse(s) : NaN;
    if (Number.isFinite(t) && t > bt) { bt = t; best = s!; }
  }
  return best;
}

/** Same words as the client's ago(): "just now", "N h ago" under 48 h, else "N days ago". */
export function ageWords(iso: string | null, now: number): string {
  if (!iso) return 'not read yet';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'unknown';
  const h = Math.max(0, Math.round((now - t) / 3_600_000));
  if (h < 1) return 'just now';
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** The time Tally last answered: P&L poll, masters or a Day Book, whichever is newest. */
export async function tallyReachedAt(): Promise<string | null> {
  const [s, b] = await Promise.all([readTallyState().catch(() => null), readBooksState().catch(() => null)]);
  return newest(s?.lastOkAt, b?.mastersAt, ...Object.values(b?.months ?? {}));
}
